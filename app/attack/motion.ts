// What the phone remote's motion is driven by: pure helpers, tested in app/attack/motion.test.ts.
import type { ConsoleView } from "@/lib/eog/alerts";

// A tank's status dot. "flag": the console flags its level sensor (amber, as "Sensors to check"
// is amber on the console). "fail": its pump failed (red, as the fix cards are). Otherwise "ok".
// The flag wins: it is the change the person holding the phone caused.
export type DotTone = "ok" | "flag" | "fail";

export function tankTone(assetId: string, facilityId: string, flagged: Record<string, unknown>, failed: ReadonlySet<string>): DotTone {
  if (flagged[assetId]) return "flag";
  if (failed.has(facilityId)) return "fail";
  return "ok";
}

// Facilities with a pump failure on the console right now (the cards that carry a fix).
export function failedFacilities(view: Pick<ConsoleView, "alerts"> | null | undefined): Set<string> {
  return new Set((view?.alerts ?? []).filter((a) => a.fix).map((a) => a.facility.id));
}

// The flash when the console's verdict arrives: red for DEAD and LYING, amber for DRIFTING,
// the same tones as their badges (app/ui/Badge.tsx SENSOR_STATE).
export function verdictTone(state: string): "alert" | "warn" {
  return state === "drifting" ? "warn" : "alert";
}

// A Kill / Fake / Drift button fills over CHARGE_MS. The reducer call starts at the tap and is
// never held back for the animation; the "sent" pulse waits only for whatever is left of the fill.
export const CHARGE_MS = 350;

export function sentDelay(elapsedMs: number, chargeMs = CHARGE_MS): number {
  return Math.max(0, Math.round(chargeMs - elapsedMs));
}

// Clear all: a calm green ripple up the tank list, starting at the bottom row (the end nearest
// the Clear all button, which is where the thumb and the eye are) and reaching the top row by
// spreadMs at most, a step of no more than 30 ms between rows.
export function waveDelay(i: number, n: number, spreadMs = 300): number {
  if (n <= 1) return 0;
  const step = Math.min(30, spreadMs / (n - 1));
  return Math.round((n - 1 - Math.min(Math.max(i, 0), n - 1)) * step);
}

// First data: the tank rows come in one after another, STAGGER_MS apart, once per page load. The
// rows past the fold do not hold the ones above back: no row waits more than maxMs.
export const STAGGER_MS = 35;

export function introDelay(i: number, stepMs = STAGGER_MS, maxMs = 420): number {
  return Math.min(Math.max(0, Math.round(i)) * stepMs, maxMs);
}
