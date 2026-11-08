import assert from "node:assert/strict";
import { test } from "node:test";
import { CLOUD_DB, CLOUD_URI, resetOptions, verifyReset } from "./reset-cloud.mjs";

test("reset targets the hosted demo by default and rejects non-wss URIs", () => {
  assert.deepEqual({ ...resetOptions([]) }, { uri: CLOUD_URI, db: CLOUD_DB });
  assert.throws(() => resetOptions(["--uri", "ws://127.0.0.1:3001"]), /wss:\/\//);
  assert.throws(() => resetOptions(["--uri", "wss://user:password@example.com"]), /without credentials/);
  assert.equal(resetOptions(["--uri", "wss://example.com", "--db", "demo"]).db, "demo");
});

test("reset verifies the expected site, top card and all three counts", () => {
  const board = { meta: { datasetId: "mock" }, top: { facilityId: "S5_FACILITY_C" }, faults: 0, issues: 0, confirmed: 0 };
  assert.doesNotThrow(() => verifyReset(board, "mock", "S5_FACILITY_C"));
  assert.throws(() => verifyReset(board, "other", "S5_FACILITY_C"), /console dataset/);
  assert.throws(() => verifyReset(board, "mock", "other"), /top card/);
  for (const field of ["faults", "issues", "confirmed"]) {
    assert.throws(() => verifyReset({ ...board, [field]: 1 }, "mock"), /active, .* sensor issues, .* confirmed plans/);
  }
});

test("site reset rejects conflicting flags and permits a healthy site without alerts", () => {
  assert.throws(() => resetOptions(["--all", "--site", "eagleford"]), /either --site or --all/);
  assert.equal(resetOptions(["--site", "eagleford"]).site, "eagleford");
  const board = { meta: { datasetId: "delaware", alertCount: 0 }, faults: 0, issues: 0, confirmed: 0 };
  assert.doesNotThrow(() => verifyReset(board, "delaware"));
  assert.throws(() => verifyReset({ ...board, meta: { ...board.meta, alertCount: 1 } }, "delaware"), /top card is missing/);
});
