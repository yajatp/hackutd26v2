import { test } from "node:test";
import assert from "node:assert/strict";
import { appendEvent, type Json, type LogEvent, type NewEvent } from "../../chain.ts";
import { replayChat, replayClosure, replayEvidence, replayIncidents, replayScope, rowToEvent, SCOPE_STATES } from "./replay.ts";
import { checkWrite } from "./roles.ts";
import { nextIncidentId, validatePayload } from "./entries.ts";

const DANA = "Dana|Commander|aa11";
const SAM = "Sam|Responder|bb22";
const LEE = "Lee|Viewer|cc33";

function fixture(): LogEvent[] {
  const entries: NewEvent[] = [
    { incident_id: "", ts: "2026-11-07T22:00:00.000Z", actor: "Box owner|Commander|ff00", type: "member_added", payload: { name: "Dana", role: "Commander", identity: "aa11" } },
    { incident_id: "INC-0001", ts: "2026-11-07T22:01:00.000Z", actor: DANA, type: "incident_opened", payload: { title: "Tank TK-3 sensor disagrees with physics" } },
    { incident_id: "INC-0001", ts: "2026-11-07T22:02:00.000Z", actor: DANA, type: "scope_update", payload: { system: "Tank level sensor TK-3", state: "SUSPECTED", certainty: "SUSPECTED", note: "reading flat, physics rising" } },
    { incident_id: "INC-0001", ts: "2026-11-07T22:03:00.000Z", actor: SAM, type: "scope_update", payload: { system: "Royalty owner records", state: "EXFILTRATED", certainty: "SUSPECTED", note: "" } },
    { incident_id: "INC-0001", ts: "2026-11-07T22:04:00.000Z", actor: SAM, type: "chat", payload: { text: "Pulling VPN logs now" } },
    { incident_id: "INC-0001", ts: "2026-11-07T22:05:00.000Z", actor: DANA, type: "scope_update", payload: { system: "tank level sensor tk-3 ", state: "ACCESSED", certainty: "CONFIRMED", note: "spoofed values confirmed" } },
    { incident_id: "INC-0002", ts: "2026-11-07T22:06:00.000Z", actor: DANA, type: "incident_opened", payload: { title: "Second drill" } },
    { incident_id: "INC-0001", ts: "2026-11-07T22:07:00.000Z", actor: LEE, type: "chat", payload: { text: "Legal is on the way" } },
  ];
  const log: LogEvent[] = [];
  for (const e of entries) log.push(appendEvent(log, e));
  return log;
}

test("replaying a fixture log gives scope rows with a state and SUSPECTED/CONFIRMED", () => {
  const rows = replayScope(fixture(), "INC-0001");
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.ok((SCOPE_STATES as readonly string[]).includes(r.state), r.state);
    assert.ok(r.certainty === "SUSPECTED" || r.certainty === "CONFIRMED", r.certainty);
  }
  assert.equal(rows[1].system, "Royalty owner records");
  assert.equal(rows[1].state, "EXFILTRATED");
  assert.equal(rows[1].certainty, "SUSPECTED");
  assert.equal(rows[1].by, "Sam");
});

test("a later scope_update overrides an earlier one for the same row", () => {
  const rows = replayScope(fixture(), "INC-0001");
  const tank = rows[0];
  assert.equal(tank.system, "Tank level sensor TK-3", "keeps the first spelling as the row name");
  assert.equal(tank.state, "ACCESSED");
  assert.equal(tank.certainty, "CONFIRMED");
  assert.equal(tank.note, "spoofed values confirmed");
  assert.equal(tank.seq, 5);
  assert.equal(tank.updates, 2);
});

test("the scope board is only what the log says: a cut log gives the older state", () => {
  const rows = replayScope(fixture().slice(0, 5), "INC-0001");
  assert.equal(rows[0].state, "SUSPECTED");
  assert.equal(rows[0].certainty, "SUSPECTED");
  assert.deepEqual(replayScope(fixture(), "INC-0002"), []);
});

test("incidents and chat are rebuilt from the log", () => {
  const log = fixture();
  const incidents = replayIncidents(log);
  assert.deepEqual(incidents.map(i => [i.id, i.title, i.openedBy, i.seq]), [
    ["INC-0001", "Tank TK-3 sensor disagrees with physics", "Dana", 1],
    ["INC-0002", "Second drill", "Dana", 6],
  ]);
  const chat = replayChat(log, "INC-0001");
  assert.deepEqual(chat.map(c => [c.seq, c.name, c.role, c.text]), [
    [4, "Sam", "Responder", "Pulling VPN logs now"],
    [7, "Lee", "Viewer", "Legal is on the way"],
  ]);
});

test("rowToEvent turns a database row (bigint seq, payload JSON) into a chain entry", () => {
  const log = fixture();
  const e = log[3];
  const row = { seq: BigInt(e.seq), prevHash: e.prev_hash, incidentId: e.incident_id, ts: e.ts, actor: e.actor, type: e.type, payloadJson: JSON.stringify(e.payload), hash: e.hash };
  assert.deepEqual(rowToEvent(row), e);
});

test("payloads are validated and normalized per entry type", () => {
  assert.deepEqual(validatePayload("chat", { text: "  hi  " }), { ok: true, payload: { text: "hi" } });
  assert.equal(validatePayload("chat", { text: "   " }).ok, false);
  assert.deepEqual(
    validatePayload("scope_update", { system: " VPN ", state: "ACCESSED", certainty: "CONFIRMED" }),
    { ok: true, payload: { system: "VPN", state: "ACCESSED", certainty: "CONFIRMED", note: "" } },
  );
  assert.equal(validatePayload("scope_update", { system: "VPN", state: "DELETED", certainty: "CONFIRMED" }).ok, false);
  assert.equal(validatePayload("scope_update", { system: "VPN", state: "ACCESSED", certainty: "MAYBE" }).ok, false);
  assert.deepEqual(validatePayload("incident_opened", { title: "Tank" }), { ok: true, payload: { title: "Tank" } });
  assert.equal(validatePayload("chat", "not an object").ok, false);
  assert.equal(nextIncidentId(1), "INC-0001");
  assert.equal(nextIncidentId(12), "INC-0012");
});

test("evidence and closing: who may log them, what a valid reference is, and replay", () => {
  // roles
  assert.equal(checkWrite({ role: "Responder", active: true }, "evidence_imported").ok, true);
  assert.equal(checkWrite({ role: "Viewer", active: true }, "evidence_imported").ok, false);
  assert.equal(checkWrite({ role: "Responder", active: true }, "incident_closed").ok, false);
  assert.equal(checkWrite({ role: "Commander", active: true }, "incident_closed").ok, true);
  // payloads
  const fp = "1a2b3c4d" + "e".repeat(56);
  const ok = validatePayload("evidence_imported", { ref: " av-1a2b-3c4d ", fingerprint: fp.toUpperCase(), source: "Avon console" });
  assert.deepEqual(ok, { ok: true, payload: { ref: "AV-1A2B-3C4D", fingerprint: fp, source: "Avon console", note: "" } });
  assert.equal(validatePayload("evidence_imported", { ref: "AV-1A2B-3C4D", source: "Avon console" }).ok, true);
  assert.match((validatePayload("evidence_imported", { ref: "1A2B3C4D", source: "x" }) as { reason: string }).reason, /AV-1A2B-3C4D/);
  assert.match((validatePayload("evidence_imported", { ref: "AV-FFFF-3C4D", fingerprint: fp, source: "x" }) as { reason: string }).reason, /does not match/);
  assert.equal(validatePayload("incident_closed", { resolution: "" }).ok, false);
  // replay
  let log: LogEvent[] = [];
  const add = (type: string, payload: Json, actor = "Dana|Commander|aa") =>
    (log = [...log, appendEvent(log, { incident_id: "INC-0001", ts: String(log.length), actor, type, payload })]);
  add("incident_opened", { title: "Tank sensor disagrees" });
  add("evidence_imported", { ref: "AV-1A2B-3C4D", fingerprint: fp, source: "Avon console", note: "" }, "Sam|Responder|bb");
  assert.equal(replayClosure(log, "INC-0001"), null);
  add("incident_closed", { resolution: "sensor replaced" });
  const ev = replayEvidence(log, "INC-0001");
  assert.deepEqual([ev.length, ev[0].ref, ev[0].collector, ev[0].role], [1, "AV-1A2B-3C4D", "Sam", "Responder"]);
  assert.deepEqual(replayClosure(log, "INC-0001"), { seq: 2, ts: "2", by: "Dana", resolution: "sensor replaced" });
});
