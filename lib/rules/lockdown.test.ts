import { test } from "node:test";
import assert from "node:assert/strict";
import { refOf } from "../evidence.ts";
import {
  EVIDENCE_REF_RE, PHASE_START, REASON_MAX, lockdownInputError, lockdownReason, phaseAt, startOffset, typedChars,
} from "./lockdown.ts";

const ok = { reason: "S5_TANK_C sensor is LYING (simulated); the confirmed plan rests on it.", evidenceRef: "AV-1177-2830", tank: "S5_TANK_C" };

test("a reference the console makes passes the check", () => {
  const ref = refOf("11772830b82a843e68b72d9194c45000d06b2467bf494023022");
  assert.equal(ref, "AV-1177-2830");
  assert.match(ref, EVIDENCE_REF_RE);
  assert.equal(lockdownInputError({ ...ok, evidenceRef: ref }), null);
  assert.equal(lockdownInputError({ ...ok, evidenceRef: refOf("abcdef0123456789") }), null);
});

test("malformed references are refused", () => {
  for (const bad of ["", "AV-1177-283", "av-1177-2830", "AV-1177-2830 ", "AV-11772830", "AV-GGGG-2830", "XV-1177-2830", "AV-1177-2830-0000"]) {
    assert.match(lockdownInputError({ ...ok, evidenceRef: bad }) ?? "", /AV-XXXX-XXXX/, bad);
  }
});

test("reason must be present and at most 200 characters", () => {
  assert.equal(lockdownInputError({ ...ok, reason: "x".repeat(REASON_MAX) }), null);
  assert.match(lockdownInputError({ ...ok, reason: "x".repeat(REASON_MAX + 1) }) ?? "", /at most 200/);
  assert.match(lockdownInputError({ ...ok, reason: "   " }) ?? "", /why/);
});

test("tank id is bounded", () => {
  assert.equal(lockdownInputError({ ...ok, tank: "" }), null);
  assert.match(lockdownInputError({ ...ok, tank: "T".repeat(65) }) ?? "", /tank/);
});

test("the console's reason sentence always passes", () => {
  const r = lockdownReason("S5_TANK_C", "lying", true);
  assert.equal(r, "S5_TANK_C sensor is LYING (simulated); the confirmed plan rests on it.");
  assert.equal(lockdownInputError({ ...ok, reason: lockdownReason("X".repeat(300), "dead", false) }), null);
});

test("the sequence follows the storyboard: 0 shutter, 1.2 s freeze, 2.4 s evidence, 3.4 s settled", () => {
  assert.deepEqual(PHASE_START, { shutter: 0, freeze: 1200, evidence: 2400, settled: 3400 });
  assert.equal(phaseAt(0), "shutter");
  assert.equal(phaseAt(1199), "shutter");
  assert.equal(phaseAt(1200), "freeze");
  assert.equal(phaseAt(2399), "freeze");
  assert.equal(phaseAt(2400), "evidence");
  assert.equal(phaseAt(3399), "evidence");
  assert.equal(phaseAt(3400), "settled");
  assert.equal(phaseAt(60_000), "settled");
});

test("reduced motion goes straight to the final state", () => {
  assert.equal(phaseAt(0, true), "settled");
  assert.equal(typedChars("AV-1177-2830", 0, true), 12);
});

test("the reference types in one character at a time and is whole before the card settles", () => {
  const ref = "AV-1177-2830";
  assert.equal(typedChars(ref, 0), 0);
  assert.equal(typedChars(ref, 1), 1);
  let last = 0;
  for (let ms = 0; ms <= 1000; ms += 10) {
    const n = typedChars(ref, ms);
    assert.ok(n >= last && n - last <= 1, `ms ${ms}: ${last} -> ${n}`);
    last = n;
  }
  assert.equal(typedChars(ref, 700), ref.length);
});

test("a lockdown that started in the past is offset, never negative", () => {
  assert.equal(startOffset(1000, 4000), 3000);
  assert.equal(startOffset(5000, 4000), 0);
});
