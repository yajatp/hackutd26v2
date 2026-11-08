// LOCKDOWN (docs/LOCKDOWN.md): the input rules the avon module enforces in enter_lockdown, and the
// timing of the console's sequence. Pure TypeScript, shared by the module and the screens.

// The reference a person carries to the Darkroom box (lib/evidence.ts refOf): AV-XXXX-XXXX, hex.
export const EVIDENCE_REF_RE = /^AV-[0-9A-F]{4}-[0-9A-F]{4}$/;
export const REASON_MAX = 200;
export const TANK_MAX = 64;

export interface LockdownInput { reason: string; evidenceRef: string; tank: string }

// The reason enter_lockdown refuses this input, or null when it is fine.
export function lockdownInputError({ reason, evidenceRef, tank }: LockdownInput): string | null {
  if (!EVIDENCE_REF_RE.test(evidenceRef)) return "evidence_ref must look like AV-XXXX-XXXX (the reference on the console)";
  if (reason.trim().length === 0) return "say why the site is locking down";
  if (reason.length > REASON_MAX) return `reason is at most ${REASON_MAX} characters`;
  if (tank.length > TANK_MAX) return `tank is at most ${TANK_MAX} characters`;
  return null;
}

// The sentence the console sends as the reason, from what the console shows.
export function lockdownReason(asset: string, state: string, simulated: boolean): string {
  const r = `${asset} sensor is ${state.toUpperCase()}${simulated ? " (simulated)" : ""}; the confirmed plan rests on it.`;
  return r.length > REASON_MAX ? r.slice(0, REASON_MAX) : r;
}

// ---- The console sequence, in ms from the moment the lockdown row arrives ----

export const HOLD_MS = 600;                 // the hold-to-confirm fill on the button
export const SHUTTER_MS = 1200;             // 0-1.2 s: shutter, scan line, dim, badge, sound
export const FREEZE_MS = 1200;              // 1.2-2.4 s: plan desaturates, hold stripe slides
export const EVIDENCE_MS = 1000;            // 2.4-3.4 s: the evidence card rises, the reference types in
export const END_MS = 800;                  // End lockdown: the shutter reverses

export type Phase = "shutter" | "freeze" | "evidence" | "settled";

export const PHASE_START: Record<Phase, number> = {
  shutter: 0,
  freeze: SHUTTER_MS,
  evidence: SHUTTER_MS + FREEZE_MS,
  settled: SHUTTER_MS + FREEZE_MS + EVIDENCE_MS,
};

// Where the sequence is `ms` after it started. Reduced motion: the final state, at once.
export function phaseAt(ms: number, reducedMotion = false): Phase {
  if (reducedMotion || ms >= PHASE_START.settled) return "settled";
  if (ms >= PHASE_START.evidence) return "evidence";
  if (ms >= PHASE_START.freeze) return "freeze";
  return "shutter";
}

// How many characters of the reference are typed in `ms` after the evidence card starts rising:
// the whole reference within the first 70% of the card's time.
export function typedChars(ref: string, ms: number, reducedMotion = false): number {
  if (reducedMotion) return ref.length;
  if (ms <= 0) return 0;
  const per = (EVIDENCE_MS * 0.7) / ref.length;
  return Math.min(ref.length, Math.floor(ms / per) + 1);
}

// A lockdown row that started long ago (a reload, a screen that joined late) is shown settled, not
// replayed: only a lockdown that began within the sequence's length animates.
export function startOffset(startedAtMs: number, nowMs: number): number {
  const ms = nowMs - startedAtMs;
  return ms < 0 ? 0 : ms;
}
