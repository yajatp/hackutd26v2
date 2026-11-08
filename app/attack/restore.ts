// Words for the phone remote's Restore ("unkill") button and its status line: pure helpers,
// tested in app/attack/restore.test.ts.
import type { FaultKind } from "@/lib/attack";

// The Kill / Fake / Drift buttons. The Restore button names the one it undoes with the same verb.
export const VERB: Record<FaultKind, string> = { kill: "Kill", fake_flat: "Fake", drift: "Drift" };

export interface RestoreLabel {
  verb: string;   // "Undo Kill": the button's big word, and the start of its accessible name
  line: string;   // "Restore the S5 · Facility C tank sensor": the small line under it
}

// The button's accessible name is verb + line, so it always starts with "Undo" and never with
// "Fake" or "Clear all" (scripts/e2e.mjs finds those two buttons by name).
export function restoreLabel(kind: string, tank: string): RestoreLabel {
  const verb = VERB[kind as FaultKind];
  const name = tank.replace(/\s+/g, " ").trim();
  return {
    verb: verb ? `Undo ${verb}` : "Undo fault",
    line: name ? `Restore the ${name} sensor` : "Restore the sensor",
  };
}

// The line under Kill / Fake / Drift. An attack: "Sending…" then "Sent to the site". A restore
// (the Restore button or a row's Clear): "Restoring…" then "Sensor restored".
export function sendWords(phase: "sending" | "sent", restoring: boolean): string {
  if (restoring) return phase === "sending" ? "Restoring…" : "Sensor restored";
  return phase === "sending" ? "Sending…" : "Sent to the site";
}

// How long the Restore button stays after its fault is gone: the drain (CHARGE_MS, the reducer
// call never waits for it), then RINGS_MS for the rings, then it folds away in FOLD_MS.
export const RINGS_MS = 420;
export const FOLD_MS = 240;
