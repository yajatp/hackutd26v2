// "Bring evidence from the console" on /box: one press logs an AV- reference. If no incident is
// open, a Commander's press opens one first, titled with the reference (review finding 1).
// Pure: decides what to write; the screen calls open_incident and append_event.

import type { LogEvent } from "../../chain.ts";
import { validatePayload } from "./entries.ts";
import { replayClosure, replayIncidents, type Incident } from "./replay.ts";
import { checkWrite } from "./roles.ts";

export const EVIDENCE_SOURCE = "Avon console";

export function evidenceTitle(ref: string): string {
  return `Sensor disagrees with physics (${ref})`;
}

export function openIncidentsOf(log: readonly LogEvent[]): Incident[] {
  return replayIncidents(log).filter(i => !replayClosure(log, i.id));
}

export type EvidencePayload = { ref: string; fingerprint: string; source: string; note: string };

export type EvidencePlan =
  | { kind: "log"; incidentId: string; payload: EvidencePayload }
  | { kind: "open_then_log"; title: string; payload: EvidencePayload }
  | { kind: "refuse"; reason: string };

// shownId: the incident on screen. It gets the evidence if it is open; else the newest open one.
export function planEvidence(
  role: string | null | undefined,
  open: readonly Incident[],
  shownId: string | null,
  input: { ref: string; fingerprint: string },
): EvidencePlan {
  const allowed = checkWrite(role ? { role, active: true } : null, "evidence_imported");
  if (!allowed.ok) return { kind: "refuse", reason: allowed.reason };
  const p = validatePayload("evidence_imported", { ref: input.ref, fingerprint: input.fingerprint, source: EVIDENCE_SOURCE, note: "" });
  if (!p.ok) return { kind: "refuse", reason: p.reason };
  const payload = p.payload as EvidencePayload;
  const target = open.find(i => i.id === shownId) ?? open[open.length - 1];
  if (target) return { kind: "log", incidentId: target.id, payload };
  if (!checkWrite({ role: role as string, active: true }, "incident_opened").ok) {
    return { kind: "refuse", reason: "No incident is open. Ask a Commander to open one (or to press this button), then log the reference." };
  }
  return { kind: "open_then_log", title: evidenceTitle(payload.ref), payload };
}
