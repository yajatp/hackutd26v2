import { test } from "node:test";
import assert from "node:assert/strict";
import { appendEvent, witnessOf, type LogEvent } from "../../chain.ts";
import { advanceWitness, chainStatus, memberMismatch, parseWitness } from "./status.ts";
import { rowToEvent } from "./replay.ts";

function build(n: number): LogEvent[] {
  const log: LogEvent[] = [];
  for (let i = 0; i < n; i++) {
    log.push(appendEvent(log, { incident_id: "INC-0001", ts: `2026-11-07T22:0${i}:00.000Z`, actor: "Dana|Commander|aa11", type: "chat", payload: { text: `line ${i}` } }));
  }
  return log;
}

test("an intact 7-entry log with its own witness gives LOG VERIFIED", () => {
  const log = build(7);
  const s = chainStatus(log, witnessOf(log));
  assert.equal(s.text, "LOG VERIFIED");
  assert.equal(s.kind, "verified");
});

test("the same log cut to 4 entries with the old witness (seq 6) gives ROLLBACK DETECTED AT #4", () => {
  const log = build(7);
  const w = witnessOf(log);
  assert.equal(w.seq, 6);
  const s = chainStatus(log.slice(0, 4), w);
  assert.equal(s.text, "ROLLBACK DETECTED AT #4");
});

test("entry 2's payload edited (hash not recomputed) gives TAMPERING AT #2", () => {
  const log = build(7);
  const w = witnessOf(log);
  log[2] = { ...log[2], payload: { text: "nothing happened here" } };
  assert.equal(chainStatus(log, w).text, "TAMPERING AT #2");
  assert.equal(chainStatus(log, null).text, "TAMPERING AT #2", "the chain alone catches an edit");
});

test("a rewritten chain (every hash recomputed) is caught by the witness", () => {
  const log = build(5);
  const w = witnessOf(log);
  const forged: LogEvent[] = [];
  for (const e of log) {
    const { incident_id, ts, actor, type } = e;
    forged.push(appendEvent(forged, { incident_id, ts, actor, type, payload: e.seq === 2 ? { text: "rewritten" } : e.payload }));
  }
  assert.equal(chainStatus(forged, null).text, "LOG VERIFIED");
  assert.equal(chainStatus(forged, w).text, "TAMPERING AT #4");
});

test("rows can arrive in any order; a fully deleted log is a rollback to #0", () => {
  const log = build(6);
  const w = witnessOf(log);
  assert.equal(chainStatus([...log].reverse(), w).text, "LOG VERIFIED");
  assert.equal(chainStatus([], w).text, "ROLLBACK DETECTED AT #0");
  assert.equal(chainStatus([], null).kind, "empty");
});

test("the witness moves forward only while the log verifies", () => {
  const log = build(4);
  const w1 = advanceWitness(log, null);
  assert.deepEqual(w1, witnessOf(log));
  const longer = [...log, ...build(6).slice(4)];
  // build(6) shares the first 4 entries with build(4), so this is the same chain grown by 2.
  const w2 = advanceWitness(longer, w1);
  assert.equal(w2?.seq, 5);
  // After a rollback the stored witness must not move back.
  assert.deepEqual(advanceWitness(longer.slice(0, 3), w2), w2);
  // After an edit it must not move either.
  const edited = [...longer];
  edited[1] = { ...edited[1], payload: { text: "edited" } };
  assert.deepEqual(advanceWitness(edited, w2), w2);
  assert.equal(advanceWitness([], null), null);
});

test("parseWitness accepts {genesis, seq, head} and rejects anything else", () => {
  const w = witnessOf(build(3));
  assert.deepEqual(parseWitness(JSON.parse(JSON.stringify(w))), w);
  assert.equal(parseWitness({ genesis: "x", seq: "2", head: "y" }), null);
  assert.equal(parseWitness(null), null);
  assert.equal(parseWitness("nope"), null);
});

test("an entry that cannot be hashed (a payload number like 1e309) is TAMPERING at that entry, never an error", () => {
  let log: LogEvent[] = [];
  for (let i = 0; i < 4; i++) log = [...log, appendEvent(log, { incident_id: "INC-0001", ts: String(i), actor: "Dana|Commander|aa", type: "chat", payload: { text: `m${i}` } })];
  const w = witnessOf(log);
  const bad = log.map((e) => (e.seq === 2 ? { ...e, payload: { x: Infinity } } : e));
  assert.deepEqual(chainStatus(bad, w), { kind: "tampering", text: "TAMPERING AT #2", at: 2 });
  assert.deepEqual(chainStatus(bad, null), { kind: "tampering", text: "TAMPERING AT #2", at: 2 });
});

test("member table vs the log: matches, a role edited outside the log, a row added outside the log", () => {
  let log: LogEvent[] = [];
  const add = (identity: string, name: string, role: string) =>
    (log = [...log, appendEvent(log, { incident_id: "BOX", ts: "t", actor: "Box owner|Commander|00", type: "member_added", payload: { identity, name, role } })]);
  add("aa11", "Dana", "Commander");
  add("bb22", "Lee", "Viewer");
  const members = [
    { identity: "0xAA11", name: "Dana", role: "Commander", active: true },
    { identity: "bb22", name: "Lee", role: "Viewer", active: true },
  ];
  assert.equal(memberMismatch(members, log), null);
  assert.equal(memberMismatch([members[0], { ...members[1], role: "Commander" }], log), "bb22");
  assert.equal(memberMismatch([...members, { identity: "cc33", name: "X", role: "Commander", active: true }], log), "cc33");
  add("bb22", "Lee", "Responder");   // a logged role change is fine
  assert.equal(memberMismatch([members[0], { ...members[1], role: "Responder" }], log), null);
});

test("a stored payload whose bytes differ from what the module wrote is TAMPERING (red team: duplicate keys, spacing, rounding)", () => {
  let log: LogEvent[] = [];
  for (let i = 0; i < 3; i++) log = [...log, appendEvent(log, { incident_id: "INC-0001", ts: String(i), actor: "Dana|Commander|aa", type: "chat", payload: { text: `m${i}` } })];
  const row = (e: LogEvent, payloadJson: string) => ({ seq: e.seq, prevHash: e.prev_hash, incidentId: e.incident_id, ts: e.ts, actor: e.actor, type: e.type, payloadJson, hash: e.hash });
  const honest = log.map((e) => rowToEvent(row(e, JSON.stringify(e.payload))));
  assert.equal(chainStatus(honest, null).kind, "verified");
  for (const forged of ['{"text":"gone","text":"m1"}', '{ "text": "m1" }', '{"text":"\\u006d1"}']) {
    const rows = log.map((e) => rowToEvent(row(e, e.seq === 1 ? forged : JSON.stringify(e.payload))));
    assert.deepEqual(chainStatus(rows, null), { kind: "tampering", text: "TAMPERING AT #1", at: 1 }, forged);
  }
});
