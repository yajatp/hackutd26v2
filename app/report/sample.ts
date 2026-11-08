// A made-up Darkroom log for /report/preview (SAMPLE), built with the real chain and status rules
// so the print design can be checked without a running box: a clean record, one with entries
// removed from the end (rollback), and one with an entry edited in place (tampering).

import { appendEvent, witnessOf, type Json, type LogEvent } from "../../lib/chain";
import { actorString } from "../../lib/rules/darkroom/roles";
import { chainStatus } from "../../lib/rules/darkroom/status";
import type { ReportInput } from "./ReportView";

export type SampleCase = "clean" | "rollback" | "tampering";

const ID = {
  owner: "c2" + "0".repeat(62),
  dana: "c2" + "1".repeat(62),
  sam: "c2" + "2".repeat(62),
  lee: "c2" + "3".repeat(62),
};
const ACTOR = {
  owner: actorString("Box owner", "Commander", ID.owner),
  dana: actorString("Dana", "Commander", ID.dana),
  sam: actorString("Sam", "Responder", ID.sam),
  lee: actorString("Lee", "Viewer", ID.lee),
};

function build(rows: Array<[incident: string, actor: string, type: string, payload: Json]>): LogEvent[] {
  const log: LogEvent[] = [];
  rows.forEach(([incident_id, actor, type, payload], i) => {
    const ts = new Date(Date.UTC(2026, 10, 8, 7, 12, 0) + i * 47_000).toISOString();
    log.push(appendEvent(log, { incident_id, ts, actor, type, payload }));
  });
  return log;
}

export const SAMPLE_LOG: LogEvent[] = build([
  ["", ACTOR.owner, "member_added", { name: "Box owner", role: "Commander", identity: ID.owner }],
  ["", ACTOR.owner, "member_added", { name: "Dana", role: "Commander", identity: ID.dana }],
  ["", ACTOR.owner, "member_added", { name: "Sam", role: "Responder", identity: ID.sam }],
  ["", ACTOR.owner, "member_added", { name: "Lee", role: "Viewer", identity: ID.lee }],
  ["INC-0001", ACTOR.dana, "incident_opened", { title: "Spoofed tank level at the Permian site" }],
  ["INC-0001", ACTOR.sam, "scope_update", { system: "Tank level sensor T-104", state: "ACCESSED", certainty: "SUSPECTED", note: "Flat at 0 while physics says +9.4 pts/h" }],
  ["INC-0001", ACTOR.sam, "evidence_imported", { ref: "AV-7C1E-04B9", fingerprint: "7c1e04b9d2a35f6e8b0c4d1a9e7f3b2c5d8a6e1f0b9c7d4a2e5f8b1c3d6a9e0f", source: "Avon console", note: "T-104 LYING · SIMULATED" }],
  ["INC-0002", ACTOR.dana, "incident_opened", { title: "Badge reader offline at the gate" }],
  ["INC-0001", ACTOR.sam, "scope_update", { system: "Royalty owner records", state: "EXFILTRATED", certainty: "CONFIRMED", note: "Owner list copied out" }],
  ["INC-0001", ACTOR.sam, "evidence_imported", { ref: "AV-9F8E-7D6C", fingerprint: "", source: "Phone photo of the RTU panel", note: "" }],
  ["INC-0001", ACTOR.lee, "chat", { text: "Legal is on the way" }],
  ["INC-0001", ACTOR.dana, "chat", { text: "Holding T-104 out of the plan until it is replaced" }],
  ["INC-0001", ACTOR.dana, "incident_closed", { resolution: "Sensor replaced and owners notified" }],
]);

export function sampleInput(which: SampleCase): ReportInput {
  const base = { ready: true, connection: "live" as const, error: null };
  if (which === "rollback") {
    // This device saw all 13 entries; root then deleted the last four.
    const events = SAMPLE_LOG.slice(0, 9);
    return { ...base, events, status: chainStatus(events, witnessOf(SAMPLE_LOG)) };
  }
  if (which === "tampering") {
    // Root rewrote the evidence fingerprint in entry #6 without fixing the chain.
    const events = SAMPLE_LOG.map(e =>
      e.seq === 6 && e.payload && typeof e.payload === "object" && !Array.isArray(e.payload)
        ? { ...e, payload: { ...e.payload, fingerprint: "0".repeat(64) } }
        : e,
    );
    return { ...base, events, status: chainStatus(events, null) };
  }
  return { ...base, events: SAMPLE_LOG, status: chainStatus(SAMPLE_LOG, null) };
}
