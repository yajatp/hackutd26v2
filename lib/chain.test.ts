import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendEvent, canonical, checkWitness, hashEvent, verifyChain, witnessOf,
  type LogEvent, type NewEvent,
} from "./chain.ts";

function ev(i: number): NewEvent {
  return { incident_id: "INC-1", ts: `2026-11-07T21:0${i}:00Z`, actor: "alice", type: "NOTE", payload: { text: `entry ${i}` } };
}

function build(n: number): LogEvent[] {
  const log: LogEvent[] = [];
  for (let i = 0; i < n; i++) log.push(appendEvent(log, ev(i)));
  return log;
}

// Simulates an attacker with root who edits an entry and recomputes every hash after it.
function recompute(log: LogEvent[], from: number): LogEvent[] {
  const out = log.slice(0, from);
  for (const e of log.slice(from)) {
    const { incident_id, ts, actor, type, payload } = e;
    out.push(appendEvent(out, { incident_id, ts, actor, type, payload }));
  }
  return out;
}

test("an untouched log verifies and reports its head", () => {
  const log = build(5);
  const r = verifyChain(log);
  assert.deepEqual(r, { ok: true, count: 5, head: log[4].hash });
});

test("field order does not change the hash", () => {
  const a = { seq: 0, prev_hash: "x", incident_id: "I", ts: "t", actor: "a", type: "T", payload: { b: 1, a: [2, { d: 3, c: 4 }] } };
  const b = { payload: { a: [2, { c: 4, d: 3 }], b: 1 }, type: "T", actor: "a", ts: "t", incident_id: "I", prev_hash: "x", seq: 0 };
  assert.equal(canonical(a), canonical(b));
  assert.equal(hashEvent(a), hashEvent(b));
});

test("editing one entry breaks the chain at that entry", () => {
  const log = build(5);
  log[2] = { ...log[2], payload: { text: "entry 2 (edited)" } };
  assert.deepEqual(verifyChain(log), { ok: false, breakAt: 2, reason: "hash" });
});

test("a gap in seq is caught", () => {
  const log = build(5);
  log.splice(2, 1);
  const r = verifyChain(log);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.breakAt, 2);
});

test("an attacker who recomputes the chain passes verifyChain but not a witness", () => {
  const log = build(5);
  const w = witnessOf(log);
  log[2] = { ...log[2], payload: { text: "nothing happened here" } };
  const forged = recompute(log, 2);
  assert.equal(verifyChain(forged).ok, true);
  assert.deepEqual(checkWitness(forged, w), { ok: false, kind: "rewritten", at: 4 });
});

test("deleting the newest entries passes verifyChain but is caught as a rollback", () => {
  const log = build(6);
  const w = witnessOf(log);
  const truncated = log.slice(0, 3);
  assert.equal(verifyChain(truncated).ok, true);
  assert.deepEqual(checkWitness(truncated, w), { ok: false, kind: "rollback", at: 3 });
});

test("a whole new log with a different genesis is caught", () => {
  const w = witnessOf(build(3));
  const other = build(0);
  other.push(appendEvent(other, { ...ev(0), actor: "mallory" }));
  assert.deepEqual(checkWitness(other, w), { ok: false, kind: "genesis", at: 0 });
});

test("a witness from earlier in the log still checks out as the log grows", () => {
  const log = build(3);
  const w = witnessOf(log);
  log.push(appendEvent(log, ev(3)));
  assert.deepEqual(checkWitness(log, w), { ok: true });
});
