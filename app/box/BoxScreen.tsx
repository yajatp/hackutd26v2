"use client";

import { useMemo, useState, type FormEvent } from "react";
import { darkroom, useDarkroom } from "@/lib/darkroom-live";
import { replayChat, replayClosure, replayEvidence, replayIncidents, replayScope } from "@/lib/rules/darkroom/replay";
import { CERTAINTIES, LIMITS, SCOPE_STATES, type Certainty, type ScopeState } from "@/lib/rules/darkroom/entries";
import { can } from "@/lib/rules/darkroom/roles";
import { AppHeader } from "@/app/ui/AppHeader";
import { Badge, type Tone } from "@/app/ui/Badge";
import { LogEntries } from "@/app/ui/LogEntries";
import { ConnectionChip, StatusBanner } from "./StatusBanner";
import { ThreatModelCard } from "./ThreatModelCard";

const SUGGESTED_SYSTEMS = ["Tank level sensor", "SCADA historian", "Field VPN credentials", "Royalty owner records", "Billing database"];

// What happened to a system, as a word plus an icon: ▲ for data lost or locked, ● otherwise.
const SCOPE_TONE: Record<string, { tone: Tone; icon: string }> = {
  ENCRYPTED: { tone: "alert", icon: "▲" },
  EXFILTRATED: { tone: "alert", icon: "▲" },
  ACCESSED: { tone: "warn", icon: "●" },
  SUSPECTED: { tone: "warn", icon: "●" },
};

function time(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function Choice<T extends string>({ label, options, value, onChange, disabled }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void; disabled: boolean }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2" disabled={disabled}>
      <legend className="mb-1 w-full text-sm font-medium">{label}</legend>
      {options.map(o => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={`btn ${value === o ? "btn-primary" : ""}`}
        >
          {value === o && <span aria-hidden="true">✓</span>}
          {o}
        </button>
      ))}
    </fieldset>
  );
}

export default function BoxScreen() {
  const s = useDarkroom();
  const incidents = useMemo(() => replayIncidents(s.events), [s.events]);
  const [chosen, setChosen] = useState<string | null>(null);
  const current = incidents.find(i => i.id === chosen) ?? incidents[incidents.length - 1] ?? null;
  const scope = useMemo(() => (current ? replayScope(s.events, current.id) : []), [s.events, current]);
  const chat = useMemo(() => (current ? replayChat(s.events, current.id) : []), [s.events, current]);
  const evidence = useMemo(() => (current ? replayEvidence(s.events, current.id) : []), [s.events, current]);
  const closure = useMemo(() => (current ? replayClosure(s.events, current.id) : null), [s.events, current]);

  const broken = s.status.kind === "rollback" || s.status.kind === "tampering";
  const writable = s.connection === "live" && s.ready && !broken && !!s.me && !closure;
  const role = s.me?.role ?? null;

  const [title, setTitle] = useState("");
  const [system, setSystem] = useState("");
  const [state, setState] = useState<ScopeState>("SUSPECTED");
  const [certainty, setCertainty] = useState<Certainty>("SUSPECTED");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [ref, setRef] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [source, setSource] = useState("Avon console");
  const [evNote, setEvNote] = useState("");
  const [resolution, setResolution] = useState("");
  const evidenceAction = useAction();
  const closeAction = useAction();
  const openAction = useAction();
  const scopeAction = useAction();
  const chatAction = useAction();

  async function openIncident(e: FormEvent) {
    e.preventDefault();
    if (await openAction.run(() => darkroom.openIncident(title))) {
      setTitle("");
      setChosen(null);
    }
  }

  async function updateScope(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    if (await scopeAction.run(() => darkroom.append(current.id, "scope_update", { system, state, certainty, note }))) {
      setSystem("");
      setNote("");
    }
  }

  async function sendChat(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    if (await chatAction.run(() => darkroom.append(current.id, "chat", { text: message }))) setMessage("");
  }

  async function logEvidence(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    if (await evidenceAction.run(() => darkroom.append(current.id, "evidence_imported", { ref, fingerprint, source, note: evNote }))) {
      setRef("");
      setFingerprint("");
      setEvNote("");
    }
  }

  async function closeIncident(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    if (await closeAction.run(() => darkroom.append(current.id, "incident_closed", { resolution }))) setResolution("");
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-5 p-4 sm:p-6">
      <AppHeader product="Darkroom" title="incident room" sub="Every change below is an entry in a tamper-evident log on this box.">
        <span>{s.me ? `You: ${s.me.name} (${s.me.role})` : s.identity ? "You: not on the team (read only)" : ""}</span>
        <ConnectionChip s={s} />
      </AppHeader>

      <StatusBanner s={s} />

      {s.identity && s.ready && !s.me && (
        <div className="rounded-lg border-2 border-warn-line bg-warn-bg p-4 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <Badge tone="warn" icon="●">READ ONLY</Badge> This screen can read the record but cannot write to it.
          </p>
          <p className="mt-1">The box owner adds it from a terminal on the box:</p>
          <pre className="mt-2 overflow-x-auto rounded bg-surface p-2 text-xs">{`node scripts/darkroom-seed.mjs --add ${s.identity} --name "Box screen" --role Commander`}</pre>
        </div>
      )}

      <section aria-labelledby="incident" className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="incident" className="section-title">Incident</h2>
            {current ? (
              <>
                <p className="text-2xl font-semibold">
                  {current.id} · {current.title}
                </p>
                <p className="text-sm text-muted">
                  Opened by {current.openedBy} at {time(current.openedAt)} (entry #{current.seq})
                </p>
                {closure ? (
                  <p className="mt-1 text-sm">
                    <Badge icon="✓">CLOSED</Badge>{" "}
                    by {closure.by} at {time(closure.ts)} (entry #{closure.seq}): {closure.resolution}
                  </p>
                ) : (
                  <p className="mt-1 text-sm"><Badge tone="alert" icon="●">OPEN</Badge></p>
                )}
                <a className="btn mt-2 inline-block" href={`/report?incident=${encodeURIComponent(current.id)}`}>
                  Incident report (print or save as PDF)
                </a>
              </>
            ) : (
              <p className="text-xl">{s.ready ? "No incident open yet." : "…"}</p>
            )}
            {incidents.length > 1 && (
              <label className="mt-2 block text-sm">
                Show incident{" "}
                <select className="field p-1" value={current?.id ?? ""} onChange={e => setChosen(e.target.value)}>
                  {incidents.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.id} · {i.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {can(role, "incident_opened") && (
            <form onSubmit={openIncident} className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className="block font-medium">Open a new incident</span>
                <input
                  className="field mt-1 w-72 max-w-full"
                  placeholder="What happened, in a few words"
                  value={title}
                  maxLength={LIMITS.title}
                  onChange={e => setTitle(e.target.value)}
                  disabled={!writable || openAction.busy}
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={!writable || openAction.busy || !title.trim()}>
                Open incident
              </button>
              {openAction.error && <p role="alert" className="w-full text-sm font-semibold text-alert">▲ {openAction.error}</p>}
            </form>
          )}
        </div>
      </section>

      {current && (
        <section aria-labelledby="evidence" className="card">
          <h2 id="evidence" className="section-title">Evidence</h2>
          <p className="mt-1 text-sm text-muted">
            Nothing reaches this box over the network. A person carries the reference from the Avon console and types it here;
            the log records who brought it and when. This proves the record was not changed later (integrity), not that the reading was true.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {evidence.length === 0 && <li className="text-muted">No evidence logged yet.</li>}
            {evidence.map(ev => (
              <li key={ev.seq} className="rounded-md border border-line-soft p-2">
                <span className="font-mono text-base font-bold">{ev.ref}</span> · from {ev.source}
                <span className="text-muted"> · logged by {ev.collector}{ev.role ? ` (${ev.role})` : ""} at {time(ev.ts)}, entry #{ev.seq}</span>
                {ev.fingerprint
                  ? <p className="break-all font-mono text-xs text-muted">Fingerprint {ev.fingerprint}</p>
                  : <p className="text-sm text-muted">Reference only; full fingerprint not typed.</p>}
                {ev.note && <p>{ev.note}</p>}
              </li>
            ))}
          </ul>
          {can(role, "evidence_imported") && !closure && (
            <form onSubmit={logEvidence} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line-soft pt-3">
              <label className="text-sm">
                <span className="block font-semibold">Reference from the console</span>
                <input className="field mt-1 w-60 max-w-full font-mono text-xl uppercase" placeholder="AV-1A2B-3C4D" value={ref}
                  maxLength={20} onChange={e => setRef(e.target.value)} disabled={!writable || evidenceAction.busy} />
              </label>
              <label className="text-sm">
                <span className="block font-medium">Source</span>
                <input className="field mt-1 w-40" value={source} maxLength={LIMITS.system}
                  onChange={e => setSource(e.target.value)} disabled={!writable || evidenceAction.busy} />
              </label>
              <label className="min-w-0 flex-1 text-sm">
                <span className="block font-medium">Full fingerprint (optional)</span>
                <input className="field mt-1 w-full font-mono text-xs" placeholder="64 characters, if you have it" value={fingerprint}
                  maxLength={64} onChange={e => setFingerprint(e.target.value)} disabled={!writable || evidenceAction.busy} />
              </label>
              <label className="w-full text-sm">
                <span className="block font-medium">Note (optional)</span>
                <input className="field mt-1 w-full" value={evNote} maxLength={LIMITS.note}
                  onChange={e => setEvNote(e.target.value)} disabled={!writable || evidenceAction.busy} />
              </label>
              <button type="submit" className="btn btn-primary text-base" disabled={!writable || evidenceAction.busy || !ref.trim()}>
                Log evidence
              </button>
              {evidenceAction.error && <p role="alert" className="w-full text-sm font-semibold text-alert">▲ {evidenceAction.error}</p>}
            </form>
          )}
          {can(role, "incident_closed") && !closure && (
            <form onSubmit={closeIncident} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line-soft pt-3">
              <label className="min-w-0 flex-1 text-sm">
                <span className="block font-medium">Close this incident: what was decided</span>
                <input className="field mt-1 w-full" placeholder="e.g. Sensor replaced; no data left the site" value={resolution}
                  maxLength={LIMITS.note} onChange={e => setResolution(e.target.value)} disabled={!writable || closeAction.busy} />
              </label>
              <button type="submit" className="btn" disabled={!writable || closeAction.busy || !resolution.trim()}>
                Close incident
              </button>
              {closeAction.error && <p role="alert" className="w-full text-sm font-semibold text-alert">▲ {closeAction.error}</p>}
            </form>
          )}
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <section aria-labelledby="scope" className="card lg:col-span-2">
          <h2 id="scope" className="section-title">Scope board</h2>
          <p className="mt-1 text-sm text-muted">Which systems and data are affected. Rebuilt from the log on every change; the newest entry for a row wins.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">System or data</th>
                  <th className="py-2 pr-3 font-medium">What happened</th>
                  <th className="py-2 pr-3 font-medium">How sure</th>
                  <th className="py-2 pr-3 font-medium">Note</th>
                  <th className="py-2 font-medium">Last change</th>
                </tr>
              </thead>
              <tbody>
                {scope.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 text-muted">
                      {current ? "Nothing in scope yet." : "Open an incident first."}
                    </td>
                  </tr>
                )}
                {scope.map(r => (
                  <tr key={r.key} className="border-b border-line-soft align-top">
                    <td className="py-2 pr-3 font-medium">{r.system}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={SCOPE_TONE[r.state]?.tone ?? "ok"} icon={SCOPE_TONE[r.state]?.icon}>{r.state}</Badge>
                    </td>
                    <td className={`py-2 pr-3 ${r.certainty === "CONFIRMED" ? "font-semibold" : ""}`}>
                      {r.certainty === "CONFIRMED" && <span aria-hidden="true">✓ </span>}
                      {r.certainty}
                    </td>
                    <td className="py-2 pr-3">{r.note}</td>
                    <td className="py-2 text-muted">
                      #{r.seq} by {r.by}, {time(r.ts)}
                      {r.updates > 1 ? ` (${r.updates} changes)` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {current && can(role, "scope_update") && (
            <form onSubmit={updateScope} className="mt-4 space-y-3 border-t border-line-soft pt-4">
              <label className="block text-sm">
                <span className="font-medium">System or data</span>
                <input
                  className="field mt-1 w-full"
                  list="darkroom-systems"
                  placeholder="e.g. Royalty owner records"
                  value={system}
                  maxLength={LIMITS.system}
                  onChange={e => setSystem(e.target.value)}
                  disabled={!writable || scopeAction.busy}
                />
                <datalist id="darkroom-systems">
                  {[...new Set([...scope.map(r => r.system), ...SUGGESTED_SYSTEMS])].map(x => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </label>
              <Choice label="What happened" options={SCOPE_STATES} value={state} onChange={setState} disabled={!writable || scopeAction.busy} />
              <Choice label="How sure" options={CERTAINTIES} value={certainty} onChange={setCertainty} disabled={!writable || scopeAction.busy} />
              <label className="block text-sm">
                <span className="font-medium">Note (optional)</span>
                <input
                  className="field mt-1 w-full"
                  value={note}
                  maxLength={LIMITS.note}
                  onChange={e => setNote(e.target.value)}
                  disabled={!writable || scopeAction.busy}
                />
              </label>
              <button type="submit" className="btn btn-primary" disabled={!writable || scopeAction.busy || !system.trim()}>
                Add to the record
              </button>
              {scopeAction.error && <p role="alert" className="text-sm font-semibold text-alert">▲ {scopeAction.error}</p>}
            </form>
          )}
          {current && s.me && !can(role, "scope_update") && <p className="mt-3 text-sm text-muted">Your role ({role}) can read the scope board and chat, but not change scope.</p>}
        </section>

        <section aria-labelledby="chat" className="card flex flex-col">
          <h2 id="chat" className="section-title">Team chat</h2>
          <p className="mt-1 text-sm text-muted">Every message is a log entry.</p>
          <ol className="mt-3 max-h-96 flex-1 space-y-2 overflow-y-auto text-sm">
            {chat.length === 0 && <li className="text-muted">{current ? "No messages yet." : "Open an incident first."}</li>}
            {chat.map(c => (
              <li key={c.seq}>
                <span className="text-muted">
                  #{c.seq} {time(c.ts)} · {c.name}
                  {c.role ? ` (${c.role})` : ""}
                </span>
                <p className="whitespace-pre-wrap break-words">{c.text}</p>
              </li>
            ))}
          </ol>
          {current && s.me && (
            <form onSubmit={sendChat} className="mt-3 flex gap-2">
              <input
                className="field min-w-0 flex-1 text-sm"
                placeholder="Message the team"
                value={message}
                maxLength={LIMITS.text}
                onChange={e => setMessage(e.target.value)}
                disabled={!writable || chatAction.busy}
                aria-label="Message"
              />
              <button type="submit" className="btn btn-primary" disabled={!writable || chatAction.busy || !message.trim()}>
                Send
              </button>
            </form>
          )}
          {chatAction.error && <p role="alert" className="mt-1 text-sm font-semibold text-alert">▲ {chatAction.error}</p>}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ThreatModelCard />
        </div>
        <div className="space-y-5">
          <LogEntries events={s.events} max={10} />
          <section aria-labelledby="team" className="card text-sm">
            <h2 id="team" className="section-title">Team</h2>
            <ul className="mt-2 space-y-1">
              {s.members.filter(m => m.active).map(m => (
                <li key={m.identity}>
                  {m.name} · {m.role} <span className="font-mono text-xs text-muted">{m.identity.slice(0, 8)}…</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
