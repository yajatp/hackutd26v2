"use client";
// The console's LOCKDOWN sequence (docs/LOCKDOWN.md). Mounted once on /console; it reads the lockdown
// row from the subscription, so every console reacts, not only the one that pressed the button.
//   0-1.2 s    shutter sweeps down with a red scan line, the page dims to 35%, LOCKDOWN badge, tone
//   1.2-2.4 s  the plan freezes: desaturated, a hold stripe slides across, "Plan on hold"
//   2.4-3.4 s  the evidence card rises: the AV- reference types in, the fingerprint scrolls, 3 steps
//   End        the shutter goes back up; the plan asks to be confirmed again
// The look (docs/LOCKDOWN.md, from ethiack.com): a pixel title card in crop marks with one light
// streak, a solid-red finding tag over the frozen plan, the AV- reference in pixel type, and a live
// SpacetimeDB.log column.
// Reduced motion: the final state at once. The data stays readable: "See the data" folds the
// overlay into a bar over the board, which is marked untrusted until the on-site check.
import { useEffect, useRef, useState } from "react";
import { money, type Alert } from "@/lib/eog/alerts";
import { useAvonConsole, type LockdownState } from "@/lib/live";
import { PHASE_START, typedChars } from "@/lib/rules/lockdown";
import { findEvidence, heldPlan } from "./evidence";
import { useLockdownSequence } from "./useSequence";
import { EventLog } from "./EventLog";
import { readableIds } from "../Board";
import s from "./lockdown.module.css";

const STEPS = [
  "Walk to the Darkroom box.",
  "Type the reference into Bring evidence from the console.",
  "The Commander opens the incident.",
];

function pretty(id: string): string {
  return id.replace(/^(S\d+)_/, "$1 · ").replace(/_/g, " ");
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function LockdownOverlay() {
  const { lockdown, view, source, endLockdown, status } = useAvonConsole();
  // Keep the last active row while the shutter goes back up after End lockdown.
  const [held, setHeld] = useState<LockdownState | null>(null);
  useEffect(() => { if (lockdown?.active) setHeld(lockdown); }, [lockdown]);
  const seq = useLockdownSequence(lockdown);
  const [folded, setFolded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (!seq.shown) setFolded(false); }, [seq.shown]);
  // Focus End lockdown once the card has settled, so a keyboard operator lands on the next action.
  useEffect(() => { if (seq.phase === "settled" && !folded && !seq.ending) endRef.current?.focus({ preventScroll: true }); }, [seq.phase, folded, seq.ending]);

  const row = lockdown?.active ? lockdown : held;
  if (!seq.shown || !row) return null;

  const dataset = source?.datasetId ?? "";
  const ev = findEvidence(view, dataset, row.evidenceRef);
  const plan = heldPlan(view, row.tank);
  const after = (p: keyof typeof PHASE_START) => seq.ms >= PHASE_START[p];
  const typed = typedChars(row.evidenceRef, seq.ms - PHASE_START.evidence, !seq.animate);

  async function end() {
    setBusy(true);
    setError(null);
    try { await endLockdown(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const rootClass = [s.root, seq.animate ? s.animate : "", seq.ending ? s.ending : "", folded ? s.folded : ""].join(" ");

  if (folded && !seq.ending) {
    return (
      <div className={rootClass} data-lockdown="folded">
        <div className={s.bar} role="status">
          <span className={s.badge}><span aria-hidden="true">▲</span> LOCKDOWN</span>
          <span className={s.barText}>
            The data below is untrusted until the tank is checked on site. Decision in the Darkroom: <b className={s.mono}>{row.evidenceRef}</b>
          </span>
          <span className={s.barButtons}>
            <button type="button" className="btn" onClick={() => setFolded(false)}>Back to the lockdown</button>
            <button type="button" className="btn" onClick={end} disabled={busy || status !== "connected"}>End lockdown</button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={rootClass} data-lockdown={seq.ending ? "ending" : seq.phase} role="alertdialog" aria-modal="false" aria-labelledby="lockdown-title" aria-describedby="lockdown-hold">
      <div className={s.shutter} aria-hidden="true"><span className={s.scan} /></div>
      <p className={`${s.badge} ${s.badgeCorner}`}><span aria-hidden="true">▲</span> LOCKDOWN</p>

      <div className={s.panel}>
        <div className={s.card}>
          <span className={s.crops} aria-hidden="true"><i /><i /><i /><i /></span>
          <span className={s.streak} aria-hidden="true" />
          <h2 id="lockdown-title" className={s.cardTitle}>LOCKDOWN</h2>
          <p className={s.cardSub}>MOVE TO THE DARKROOM</p>
        </div>
        <p className={s.meta}>
          Since {clock(row.startedAtMs)} · {pretty(row.tank)} · the decision moves to the isolated Darkroom box.
        </p>

        {(after("freeze") || !seq.animate) && plan && <HeldPlan a={plan} tag={ev ? `${ev.record.state.toUpperCase()}${ev.record.simulated ? " · SIMULATED" : ""}` : null} />}
        {(after("freeze") || !seq.animate) && (
          <p id="lockdown-hold" className={s.hold_sentence}>
            Plan on hold. It rests on a sensor that may be compromised. No truck rolls until someone checks the tank on site.
          </p>
        )}

        {(after("evidence") || !seq.animate) && (
          <section className={s.evidence} aria-label="Evidence to carry">
            <p className={s.evTitle}>Carry this to the Darkroom box. Nothing is sent from here.</p>
            <p className={s.ref} aria-label={row.evidenceRef}>
              <span aria-hidden="true">{row.evidenceRef.slice(0, typed)}<span className={s.caret}>{typed < row.evidenceRef.length ? "▌" : ""}</span></span>
            </p>
            {ev && (
              <p className={s.fingerprint}>
                <span className={s.fpLabel}>Fingerprint (SHA-256)</span>
                <span className={s.fpTrack}><span className={s.fpText}>{ev.hash}</span></span>
              </p>
            )}
            <ol className={s.steps}>
              {STEPS.map((t) => <li key={t}>{t}</li>)}
            </ol>
          </section>
        )}

        {(after("evidence") || !seq.animate) && (
          <div className={s.actions}>
            <button ref={endRef} type="button" className="btn" onClick={end} disabled={busy || status !== "connected" || seq.ending}>
              {busy ? "Ending…" : "End lockdown"}
            </button>
            <button type="button" className="btn" onClick={() => setFolded(true)} disabled={seq.ending}>See the data</button>
            <p className={s.note}>End lockdown after the on-site check. The plan will ask to be confirmed again.</p>
            {error && <p role="alert" className="text-sm text-alert">{error}</p>}
          </div>
        )}
      </div>
      {(after("freeze") || !seq.animate) && <EventLog />}
    </div>
  );
}

function HeldPlan({ a, tag }: { a: Alert; tag: string | null }) {
  const fix = a.fix!;
  return (
    <div className={s.planWrap}>
      {tag && <span className={s.finding}><span aria-hidden="true">■</span> {tag}</span>}
      <div className={s.plan}>
        <p className={s.planHead}>{pretty(a.facility.id)} · pump failed</p>
        <div className={s.planRow}>
          <p className={s.planDecide}><span className={s.planLabel}>Was:</span> <s className={s.struck}>{readableIds(fix.headline)}</s></p>
          <p className={s.planDecide}><s className={s.struck}>{money(fix.plan.cost)}</s></p>
        </div>
        <span className={s.stripe} aria-hidden="true" />
        <span className={s.holdTag}>ON HOLD</span>
      </div>
    </div>
  );
}
