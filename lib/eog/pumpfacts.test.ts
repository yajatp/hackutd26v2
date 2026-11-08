import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConsole } from "./alerts.ts";
import { breachRisks } from "./breach.ts";
import { flowSeries } from "./flows.ts";
import { allPumpFacts, costCurve, etaMin, pumpFacts } from "./pumpfacts.ts";
import { hasData, loadFolder } from "./testdata.ts";

const MOCK = "mock_test_2026-10-10T1530";

test("etaMin reads the first arrival, across midnight too", () => {
  const now = Date.UTC(2026, 9, 10, 23, 30) / 1000;
  assert.equal(etaMin(["Truck arrives 00:45"], now), 75);
  assert.equal(etaMin(["Trucks arrive 23:55, then 03:40"], now), 25);
  assert.equal(etaMin(["No time here"], now), null);
});

test("costCurve: flat while the truck still beats the trip, then adds lost revenue, capped", () => {
  const c = costCurve(900, 5000, 1000, 3, 1);
  assert.equal(c[0].cost, 900);                 // truck at 1 h, trip at 3 h
  assert.equal(c[4].cost, 900);                 // 2 h late: arrives exactly at the trip
  assert.equal(c[6].cost, 1900);                // 3 h late: one hour shut in
  assert.equal(c[8].cost, 2900);
  assert.ok(costCurve(900, 1500, 1000, 1, 1).every((p) => p.cost <= 1500));
  assert.ok(costCurve(900, 0, 1000, null, null).every((p) => p.cost === 900));
});

test(`${MOCK}: the two S5 failures keep EOG's equal $905 plans but differ in everything else`, { skip: !hasData(MOCK) }, () => {
  const ds = loadFolder(MOCK);
  const view = buildConsole(ds);
  const inputs = { view, flows: flowSeries(ds), breaches: breachRisks(ds, view) };
  const failed = allPumpFacts(inputs).filter((p) => p.failed);
  assert.deepEqual(failed.map((p) => p.facility_id).sort(), ["S5_FACILITY_B", "S5_FACILITY_C"]);
  const costs = new Set(failed.map((p) => p.response_cost));
  assert.equal(costs.size, 1, "EOG prices every trip the same");
  assert.equal([...costs][0], ds.ops.emergency_trucking.cost_per_trip);
  const [b, c] = ["S5_FACILITY_B", "S5_FACILITY_C"].map((id) => pumpFacts(inputs, id)!);
  for (const p of [b, c]) {
    assert.ok(p.level_pct! > 0 && p.level_pct! < 100);
    assert.ok(p.fill_pts_h! > 0, `${p.facility_id}: a failed pump's tank fills`);
    assert.ok(p.hours_to_limit! > 0);
    assert.ok(p.truck_eta_min! > 0);
    assert.ok(p.lost_per_hour > 0);
    assert.ok(p.wells > 0);
    assert.ok(p.unaddressed_cost! > p.response_cost!);
    assert.equal(p.curve[0].cost, p.response_cost);
    for (let i = 1; i < p.curve.length; i++) assert.ok(p.curve[i].cost >= p.curve[i - 1].cost, "cost never falls with delay");
  }
  assert.notEqual(b.lost_per_hour, c.lost_per_hour);
  assert.notEqual(b.hours_to_limit, c.hours_to_limit);
  assert.notDeepEqual(b.curve, c.curve);
});

test(`${MOCK}: every running pump gets its own level, rate and revenue at risk`, { skip: !hasData(MOCK) }, () => {
  const ds = loadFolder(MOCK);
  const view = buildConsole(ds);
  const all = allPumpFacts({ view, flows: flowSeries(ds), breaches: breachRisks(ds, view) });
  const facilities = ds.network.systems.flatMap((s) => s.facilities.map((f) => f.id));
  assert.equal(all.length, facilities.length);
  const running = all.filter((p) => !p.failed);
  for (const p of running) {
    assert.equal(p.response_cost, null);
    assert.ok(p.level_pct !== null && Number.isFinite(p.fill_pts_h!));
    assert.ok(p.lost_per_hour > 0, `${p.facility_id}: revenue at risk`);
  }
  assert.ok(new Set(running.map((p) => Math.round(p.lost_per_hour))).size > running.length / 2, "revenue at risk differs by pump");
});

test("hoursText and rateText read the way the console does", async () => {
  const { hoursText, rateText } = await import("./pumpfacts.ts");
  assert.equal(hoursText(2.05), "2h 03m");
  assert.equal(hoursText(0.5), "30m");
  assert.equal(hoursText(0), "now");
  assert.equal(hoursText(null), "—");
  assert.equal(rateText(9.03), "+9.0 pts/h");
  assert.equal(rateText(-4.15), "−4.2 pts/h");
  assert.equal(rateText(0.01), "0.0 pts/h");
  assert.equal(rateText(null), "—");
});
