"use client";

import { useMemo, useState, type FormEvent } from "react";
import { darkroom, type DarkroomSnapshot } from "@/lib/darkroom-live";
import { evidenceTitle, openIncidentsOf, planEvidence } from "@/lib/rules/darkroom/bring";
import { replayEvidence } from "@/lib/rules/darkroom/replay";

type Done = { ref: string; incidentId: string; opened: boolean };

// One press from the AV- reference to the log (review finding 1). If no incident is open, a
// Commander's press opens one titled with the reference, then logs the evidence in it.
export function BringEvidence({ s, shownId, writable }: { s: DarkroomSnapshot; shownId: string | null; writable: boolean }) {
  const role = s.me?.role ?? null;
  const open = useMemo(() => openIncidentsOf(s.events), [s.events]);
  const target = open.find(i => i.id === shownId) ?? open[open.length - 1] ?? null;
  const [ref, setRef] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    const plan = planEvidence(role, open, shownId, { ref, fingerprint });
    if (plan.kind === "refuse") {
      setError(plan.reason);
      return;
    }
    setBusy(true);
    let incidentId = plan.kind === "log" ? plan.incidentId : null;
    try {
      if (plan.kind === "open_then_log") incidentId = await darkroom.openIncident(plan.title);
      await darkroom.append(incidentId as string, "evidence_imported", plan.payload);
      setDone({ ref: plan.payload.ref, incidentId: incidentId as string, opened: plan.kind === "open_then_log" });
      setRef("");
      setFingerprint("");
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      setError(plan.kind === "open_then_log" && incidentId ? `${incidentId} was opened, but the evidence was not logged: ${why}. Press again to log it.` : why);
    } finally {
      setBusy(false);
    }
  }

  // Entry numbers for the confirmation, read back from the log itself.
  const logged = done ? replayEvidence(s.events, done.incidentId).filter(x => x.ref === done.ref).pop() : undefined;
  const openedAt = done?.opened ? s.events.find(x => x.type === "incident_opened" && x.incident_id === done.incidentId) : undefined;
  const typedRef = ref.trim().toUpperCase();

  return (
    <section aria-labelledby="bring-evidence" className="card">
      <h2 id="bring-evidence" className="section-title">Bring evidence from the console</h2>
      <p className="mt-1 text-sm text-muted">
        Type the AV- reference the Avon console shows. One press logs it with your name and the time. Nothing reaches this box over the network.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block font-semibold">Reference</span>
          <input className="field mt-1 w-64 max-w-full font-mono text-2xl uppercase" placeholder="AV-1A2B-3C4D" value={ref} maxLength={20}
            onChange={e => setRef(e.target.value)} disabled={!writable || busy} autoComplete="off" spellCheck={false} />
        </label>
        <label className="min-w-0 flex-1 text-sm">
          <span className="block font-medium">Full fingerprint (optional)</span>
          <input className="field mt-1 w-full font-mono text-xs" placeholder="64 characters, if you have it" value={fingerprint} maxLength={64}
            onChange={e => setFingerprint(e.target.value)} disabled={!writable || busy} autoComplete="off" spellCheck={false} />
        </label>
        <button type="submit" className="btn btn-primary text-base" disabled={!writable || busy || !ref.trim()}>
          {target ? "Log evidence" : role === "Commander" ? "Open an incident and log evidence" : "Log evidence"}
        </button>
      </form>
      <p className="mt-2 text-sm">
        {target
          ? <>It goes into <span className="font-semibold">{target.id} · {target.title}</span>.</>
          : role === "Commander"
            ? <>No incident is open, so this also opens one: <span className="font-semibold">{evidenceTitle(typedRef || "AV-…")}</span>.</>
            : <>No incident is open yet. Only a Commander can open one; ask them first.</>}
      </p>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-alert">▲ {error}</p>}
      {done && (
        <p role="status" className="mt-2 text-base font-semibold" data-evidence-done>
          <span aria-hidden="true">✓ </span>
          {done.opened && <>Opened {done.incidentId}{openedAt ? ` (entry #${openedAt.seq})` : ""} and logged </>}
          {!done.opened && <>Logged </>}
          {done.ref}{logged ? ` (entry #${logged.seq})` : ""}{done.opened ? "." : ` in ${done.incidentId}.`}
        </p>
      )}
    </section>
  );
}
