"use client";
// A red LOCKDOWN banner with the AV- reference (docs/LOCKDOWN.md), for any Avon screen inside
// <AvonProvider>: /vr, /insight. It slides down once per lockdown; reduced motion shows it at once.
// /twin builds its own reaction from useLockdown() in lib/live.ts.
import { useLockdown } from "@/lib/live";
import s from "./lockdown-banner.module.css";

export function LockdownBanner({ className = "" }: { className?: string }) {
  const { lockdown, active } = useLockdown();
  if (!active) return null;
  return (
    <div key={lockdown!.startedAtMs} role="alert" className={`${s.banner} ${className}`}>
      <span className={s.word}><span aria-hidden="true">▲</span> LOCKDOWN</span>
      <span className={s.text}>
        The operator moved the decision to the Darkroom. Evidence <span className={s.ref}>{lockdown!.evidenceRef}</span>
      </span>
    </div>
  );
}
