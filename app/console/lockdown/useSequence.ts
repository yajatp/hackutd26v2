"use client";
// Drives the console's lockdown sequence from the lockdown row (lib/rules/lockdown.ts has the timing).
// A lockdown that starts while this page is open plays from 0; one that was already on when the
// page opened shows settled at once. Ending plays the shutter back up, then the overlay goes.
import { useEffect, useRef, useState } from "react";
import { END_MS, PHASE_START, phaseAt, type Phase } from "@/lib/rules/lockdown";
import type { LockdownState } from "@/lib/live";
import { playLockdownTone } from "./sound";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

// A row this much older than the page is treated as "already on" and shown settled.
const LATE_MS = PHASE_START.settled + 4000;

export interface Sequence {
  shown: boolean;              // the overlay is on screen (lockdown on, or still ending)
  phase: Phase;
  ms: number;                  // ms since the sequence started (large when settled)
  animate: boolean;            // false: everything at its final state, no motion
  ending: boolean;             // End lockdown: the shutter is going back up
  reduced: boolean;
}

export function useLockdownSequence(lockdown: LockdownState | null): Sequence {
  const reduced = useReducedMotion();
  const active = !!lockdown?.active;
  const key = active ? lockdown!.startedAtMs : null;
  const [start, setStart] = useState<number | null>(null);    // performance.now() at t = 0
  const [animate, setAnimate] = useState(false);
  const [ending, setEnding] = useState(false);
  const [ms, setMs] = useState(0);
  const opened = useRef(Date.now());

  // A new lockdown: play it, or show it settled when it began before this page opened.
  useEffect(() => {
    if (key === null) return;
    const late = key < opened.current - LATE_MS || Date.now() - key > LATE_MS;
    setEnding(false);
    setAnimate(!late && !reduced);
    setStart(performance.now() - (late ? PHASE_START.settled : 0));
    if (!late && !reduced) playLockdownTone();
    // `reduced` is read once per lockdown on purpose: switching it mid-sequence must not replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The lockdown ended: reverse, then hide.
  useEffect(() => {
    if (active || start === null) return;
    setEnding(true);
    if (!reduced) playLockdownTone(true);
    const t = setTimeout(() => { setStart(null); setEnding(false); }, reduced ? 0 : END_MS);
    return () => clearTimeout(t);
  }, [active, start, reduced]);

  // Frame clock while the sequence runs.
  useEffect(() => {
    if (start === null) return;
    let raf = 0;
    const tick = () => {
      const now = performance.now() - start;
      setMs(now);
      if (now < PHASE_START.settled) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [start]);

  const shown = start !== null;
  return { shown, phase: phaseAt(ms, reduced || !animate), ms: animate && !reduced ? ms : PHASE_START.settled, animate: animate && !reduced, ending, reduced };
}
