import { test } from "node:test";
import assert from "node:assert/strict";
import { LOG_MAX, appendLog, logLines, logTime, type LogSnapshot } from "./lockdown-log.ts";

const empty: LogSnapshot = { faults: [], confirmations: {}, lockdown: null };
const conf = { S5_PUMP_C: { headline: "Call 1 truck now, 1 trip", cost: 905, atMs: 1000 } };
const on = { active: true, startedAtMs: 5000, endedAtMs: null, evidenceRef: "AV-1177-2830", tank: "S5_TANK_C" };

test("rows already there when the log opens are listed, faults without a time", () => {
  const lines = logLines(null, { faults: [{ asset_id: "S5_TANK_C", kind: "fake_flat" }], confirmations: conf, lockdown: on }, 9000);
  assert.deepEqual(lines.map((l) => [l.atMs, l.reducer]), [[null, "inject_fault"], [1000, "confirm_plan"], [5000, "enter_lockdown"]]);
  assert.equal(lines[1].detail, "S5_PUMP_C Call 1 truck now, 1 trip $905");
  assert.equal(lines[2].detail, "AV-1177-2830 S5_TANK_C");
});

test("a new fault, a cleared fault and a changed fault kind each make one line", () => {
  const a: LogSnapshot = { ...empty, faults: [{ asset_id: "T1", kind: "kill" }, { asset_id: "T2", kind: "drift" }] };
  const b: LogSnapshot = { ...empty, faults: [{ asset_id: "T1", kind: "fake_flat" }, { asset_id: "T3", kind: "kill" }] };
  const lines = logLines(a, b, 7000);
  assert.deepEqual(lines.map((l) => `${l.reducer} ${l.detail}`).sort(), ["clear_fault T2", "inject_fault fake_flat T1", "inject_fault kill T3"]);
  assert.ok(lines.every((l) => l.atMs === 7000));
});

test("nothing changed: no lines", () => {
  const s: LogSnapshot = { faults: [{ asset_id: "T1", kind: "kill" }], confirmations: conf, lockdown: on };
  assert.deepEqual(logLines(s, structuredClone(s), 1), []);
});

test("end_lockdown is logged once, at ended_at", () => {
  const ended = { ...on, active: false, endedAtMs: 8000 };
  const lines = logLines({ ...empty, lockdown: on }, { ...empty, lockdown: ended }, 9000);
  assert.deepEqual(lines, [{ atMs: 8000, reducer: "end_lockdown", detail: "AV-1177-2830" }]);
  assert.deepEqual(logLines({ ...empty, lockdown: ended }, { ...empty, lockdown: ended }, 9500), []);
});

test("a new lockdown after an old one is logged", () => {
  const ended = { ...on, active: false, endedAtMs: 8000 };
  const again = { ...on, startedAtMs: 12000 };
  assert.equal(logLines({ ...empty, lockdown: ended }, { ...empty, lockdown: again }, 13000)[0].reducer, "enter_lockdown");
});

test("the log keeps the newest lines only", () => {
  let log = appendLog([], []);
  for (let i = 0; i < LOG_MAX + 5; i++) log = appendLog(log, [{ atMs: i, reducer: "inject_fault", detail: String(i) }]);
  assert.equal(log.length, LOG_MAX);
  assert.equal(log[0].detail, "5");
  assert.equal(log.at(-1)!.detail, String(LOG_MAX + 4));
});

test("times print to the millisecond, or dashes when unknown", () => {
  assert.equal(logTime(null), "--:--:--.---");
  assert.match(logTime(Date.UTC(2026, 10, 8, 9, 4, 12, 31)), /^\d\d:\d\d:\d\d\.031$/);
});
