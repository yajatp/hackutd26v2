"use client";
// "Lock down and move to the Darkroom" (docs/LOCKDOWN.md, t = 0). Hold for 600 ms to confirm, with
// a fill bar, so it is never pressed by accident. Shown in the CONFIRMED, THEN CHANGED block and on
// each sensor in Sensors to check; hidden while the site is already in lockdown.
import { useEffect, useRef, useState } from "react";
import { evidenceFor, evidenceForIssue, type Evidence } from "@/lib/evidence";
import type { Alert, SensorIssue } from "@/lib/eog/alerts";
import { useAvonConsole } from "@/lib/live";
import { HOLD_MS, lockdownReason } from "@/lib/rules/lockdown";
import { unlockSound } from "./sound";

// Tailwind only, no CSS module: Board.tsx imports this, and board.test.tsx renders Board in Node.
const HOLD = "relative inline-flex min-h-11 select-none touch-none items-center overflow-hidden rounded-[2px] border border-[#ef4444] bg-transparent px-4 py-2 font-semibold text-[#fca5a5] hover:enabled:border-[#fca5a5] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#d7dee0]";

export function LockdownButton({ alert, issue }: { alert?: Alert; issue?: SensorIssue }) {
  const { view, source, status, lockdown, enterLockdown } = useAvonConsole();
  const [fill, setFill] = useState(0);              // 0..1
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const raf = useRef(0);
  const t0 = useRef<number | null>(null);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const dataset = source?.datasetId ?? "";
  const now = view?.now ?? 0;
  const ev: Evidence | null = alert ? evidenceFor(alert, dataset, now) : issue ? evidenceForIssue(issue, dataset, now) : null;
  if (!ev || lockdown?.active) return null;
  const evidence = ev;

  async function fire() {
    setBusy(true);
    setError(null);
    const r = evidence.record;
    try {
      await enterLockdown(lockdownReason(r.asset_id, r.state, r.simulated), evidence.ref, r.asset_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setFill(0);
    }
  }

  function begin() {
    if (busy || status !== "connected" || t0.current !== null) return;
    unlockSound();
    setError(null);
    t0.current = performance.now();
    const step = () => {
      if (t0.current === null) return;
      const f = Math.min(1, (performance.now() - t0.current) / HOLD_MS);
      setFill(f);
      if (f < 1) raf.current = requestAnimationFrame(step);
      else { t0.current = null; fire(); }
    };
    raf.current = requestAnimationFrame(step);
  }

  function cancel() {
    if (t0.current === null) return;
    t0.current = null;
    cancelAnimationFrame(raf.current);
    setFill(0);
  }

  const disabled = busy || status !== "connected";
  return (
    <div className="mt-3">
      <button
        type="button"
        className={HOLD}
        style={{ WebkitTouchCallout: "none" }}
        disabled={disabled}
        aria-describedby={`hold-${ev.ref}`}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); begin(); }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onPointerLeave={cancel}
        onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); begin(); } }}
        onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") cancel(); }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="absolute inset-0 origin-left bg-[rgb(239_68_68/0.38)]" style={{ transform: `scaleX(${fill})` }} aria-hidden="true" />
        <span className="relative">{busy ? "Locking down…" : "Lock down and move to the Darkroom"}</span>
      </button>
      <p id={`hold-${ev.ref}`} className="mt-1 text-sm text-muted">Press and hold. Carries {ev.ref} to the Darkroom box.</p>
      {error && <p role="alert" className="mt-1 text-sm text-alert">{error}</p>}
    </div>
  );
}
