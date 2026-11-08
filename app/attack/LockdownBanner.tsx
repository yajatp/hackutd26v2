"use client";
// Phone 1 (the attacker) in LOCKDOWN (docs/LOCKDOWN.md): a red flash, then "The site is in LOCKDOWN.
// The operator moved to the Darkroom." Kill, Fake and Drift grey out and fold down, and the panel
// that holds them is made inert, so a tap or a key cannot send another fault. Clear all still works.
// Mounted with one line in app/attack/page.tsx; it reaches the controls through their section's
// aria-labelledby="break", so the page itself does not change.
import { useEffect, useRef, useState } from "react";
import { useLockdown } from "@/lib/live";
import s from "./lockdown.module.css";

const CONTROLS = 'section[aria-labelledby="break"]';

// Rendered only during a lockdown: the fault buttons grey out and fold down (none of it with
// reduced motion). Plain CSS, because these selectors reach into page.tsx's markup.
const FOLD = `
html[data-lockdown="on"] ${CONTROLS} { perspective: 600px; }
html[data-lockdown="on"] ${CONTROLS} > div {
  transform-origin: 50% 0; transform: rotateX(48deg); opacity: 0.35; filter: grayscale(1);
  pointer-events: none; animation: avon-lockdown-fold 450ms 250ms cubic-bezier(0.65, 0, 0.35, 1) both;
}
@keyframes avon-lockdown-fold {
  from { transform: none; opacity: 1; filter: grayscale(0); }
  to { transform: rotateX(48deg); opacity: 0.35; filter: grayscale(1); }
}
@media (prefers-reduced-motion: reduce) {
  html[data-lockdown="on"] ${CONTROLS} > div { animation: none; transform: none; }
}`;

export function LockdownBanner() {
  const { lockdown, active } = useLockdown();
  const [flash, setFlash] = useState(0);          // bumps on each new lockdown, replays the flash
  const seen = useRef<number | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const panel = document.querySelector(CONTROLS);
    if (active) {
      root.dataset.lockdown = "on";
      panel?.setAttribute("inert", "");
      if (seen.current !== lockdown!.startedAtMs) {
        seen.current = lockdown!.startedAtMs;
        setFlash((n) => n + 1);
        navigator.vibrate?.([80, 60, 80]);
      }
    } else {
      delete root.dataset.lockdown;
      panel?.removeAttribute("inert");
    }
  }, [active, lockdown]);

  useEffect(() => () => {
    delete document.documentElement.dataset.lockdown;
    document.querySelector(CONTROLS)?.removeAttribute("inert");
  }, []);

  if (!active) return null;
  return (
    <>
      <style>{FOLD}</style>
      {flash > 0 && <div key={flash} className={s.flash} aria-hidden="true" />}
      <div role="alert" className={s.banner}>
        <p className={s.word}><span aria-hidden="true">▲</span> LOCKDOWN</p>
        <p className={s.text}>The site is in LOCKDOWN. The operator moved to the Darkroom.</p>
        <p className={s.sub}>Kill, Fake and Drift are off. Evidence <span className={s.ref}>{lockdown!.evidenceRef}</span> is on its way to the Darkroom box.</p>
      </div>
    </>
  );
}
