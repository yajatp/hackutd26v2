// Run: npx tsx --test app/attack/motion.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Alert } from "../../lib/eog/alerts.ts";
import { CHARGE_MS, failedFacilities, sentDelay, tankTone, verdictTone, waveDelay } from "./motion.ts";

test("tankTone: flagged sensor beats a failed pump, which beats ok", () => {
  const failed = new Set(["S5_FACILITY_C"]);
  const flagged = { S5_FACILITY_C_TANK: { state: "lying" } };
  assert.equal(tankTone("S5_FACILITY_C_TANK", "S5_FACILITY_C", flagged, failed), "flag");
  assert.equal(tankTone("S5_FACILITY_C_TANK", "S5_FACILITY_C", {}, failed), "fail");
  assert.equal(tankTone("S1_FACILITY_A_TANK", "S1_FACILITY_A", flagged, failed), "ok");
  assert.equal(tankTone("S1_FACILITY_A_TANK", "S1_FACILITY_A", { S1_FACILITY_A_TANK: { state: "drifting" } }, new Set()), "flag");
});

test("failedFacilities: only alerts that carry a fix (pump failures), none without a view", () => {
  const alerts = [
    { facility: { id: "S5_FACILITY_C" }, fix: {} },
    { facility: { id: "S5_FACILITY_B" }, fix: {} },
    { facility: { id: "S2_FACILITY_A" } },   // an inspection: no fix
  ] as unknown as Alert[];
  assert.deepEqual([...failedFacilities({ alerts })].sort(), ["S5_FACILITY_B", "S5_FACILITY_C"]);
  assert.equal(failedFacilities(null).size, 0);
  assert.equal(failedFacilities(undefined).size, 0);
});

test("verdictTone matches the badge tones: DRIFTING amber, DEAD and LYING red", () => {
  assert.equal(verdictTone("drifting"), "warn");
  assert.equal(verdictTone("lying"), "alert");
  assert.equal(verdictTone("dead"), "alert");
});

test("sentDelay never holds the call back, only the pulse, and never goes negative", () => {
  assert.equal(CHARGE_MS, 350);
  assert.equal(sentDelay(0), 350);
  assert.equal(sentDelay(120), 230);
  assert.equal(sentDelay(350), 0);
  assert.equal(sentDelay(900), 0);
  assert.equal(sentDelay(100, 200), 100);
});

test("waveDelay starts at the bottom row (next to Clear all) and reaches the top by the spread", () => {
  assert.equal(waveDelay(15, 16), 0);              // the bottom row goes first
  assert.equal(waveDelay(14, 16), 20);             // 300 ms over 15 gaps: 20 ms a row
  assert.equal(waveDelay(0, 16), 300);             // the top row last, at the spread
  assert.equal(waveDelay(0, 4), 90);               // a short list: never more than 30 ms a row
  assert.equal(waveDelay(3, 4), 0);
  assert.equal(waveDelay(0, 1), 0);
  assert.equal(waveDelay(0, 0), 0);
  assert.equal(waveDelay(-2, 4), 90);              // out of range clamps to the list
  assert.equal(waveDelay(9, 4), 0);
  for (let i = 1; i < 16; i++) assert.ok(waveDelay(i, 16) < waveDelay(i - 1, 16), "not strictly upward");
});
