import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConsole } from "./alerts.ts";
import { breachRisks } from "./breach.ts";
import { hasData, loadFolder } from "./testdata.ts";

const MOCK = "mock_test_2026-10-10T1530";

test(`${MOCK}: one row per tank, ranked by dollars at stake`, { skip: !hasData(MOCK) }, () => {
  const ds = loadFolder(MOCK);
  const rows = breachRisks(ds, buildConsole(ds));
  const tanks = ds.network.systems.flatMap((s) => s.facilities.map((f) => f.tank.id)).sort();
  assert.deepEqual(rows.map((r) => r.tank_id).sort(), tanks);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].exposure >= rows[i].exposure, "ranked");
  for (const r of rows) {
    assert.ok(r.exposure >= 0, `${r.tank_id}: never negative`);
    assert.ok(Math.abs(r.exposure - Math.max(0, r.believed_cost - r.honest_cost)) < 1e-6, `${r.tank_id}: exposure = believed - honest`);
    assert.ok(r.summary.length > 0);
  }
});

test(`${MOCK}: the two failed pumps reran the engine; S5 Facility C's lie costs about $4,700`, { skip: !hasData(MOCK) }, () => {
  const ds = loadFolder(MOCK);
  const rows = breachRisks(ds, buildConsole(ds));
  const failed = rows.filter((r) => r.mode === "failed").map((r) => r.facility_id).sort();
  assert.deepEqual(failed, ["S5_FACILITY_B", "S5_FACILITY_C"]);
  const c = rows.find((r) => r.tank_id === "S5_TANK_C")!;
  assert.ok(c.shown_trip_unix! > c.real_trip_unix!, "the console would count down past the real trip");
  assert.ok(c.hidden_min! > 60);
  assert.equal(Math.round(c.exposure / 100), 47);
  assert.equal(c.wells.length, 3);
});

test(`${MOCK}: a running tank's breach is a hidden stop, flagged LYING by the physics check`, { skip: !hasData(MOCK) }, () => {
  const ds = loadFolder(MOCK);
  const rows = breachRisks(ds, buildConsole(ds));
  const run = rows.filter((r) => r.mode === "running");
  assert.equal(run.length, 13);
  for (const r of run) {
    assert.equal(r.shown_trip_unix, null);
    assert.equal(r.lie_plan, null);
    if (r.real_trip_unix !== null) assert.ok(r.flags.some((x) => x.state === "lying"), `${r.tank_id} flagged`);
  }
});
