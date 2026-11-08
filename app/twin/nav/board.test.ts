// Run: npx tsx --test app/twin/nav/board.test.ts
// The dashboard's words: the console's totals, fix card, confirm states and sensors, unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Alert, ConsoleView, SensorIssue } from "@/lib/eog/alerts";
import type { Confirmed, SiteFacility } from "@/lib/live";
import { boardModel, CALM, confirmModel, fillPtsH, fixCards, fixDetails, goToRows, otherFixes, page, pretty, pumpFacts, sensorLines, STAT_WORDS, stats, topCard, totalsLine } from "./board";

const clock = (ms: number) => `T${ms}`;

function fac(facility_id: string): SiteFacility {
  const [system_id, , letter] = facility_id.split("_");
  return {
    facility_id, system_id, lat: 32, lon: -102,
    tank_id: `${system_id}_TANK_${letter}`, pump_id: `${system_id}_PUMP_${letter}`, capacity_bbl: 500, well_ids: [],
  };
}

function failure(facility_id: string, opts: { hours?: number | null; cost?: number; headline?: string; alts?: number; sensor?: Alert["tank_sensor"] } = {}): Alert {
  const sys = facility_id.split("_")[0];
  const pump = facility_id.replace("FACILITY", "PUMP");
  return {
    id: `${pump}@1`,
    event: { category: "pump_failure", system_id: sys, facility_id, asset_id: pump, onset_unix: 1, end_unix: null, status: "ongoing", evidence: ["pump status = 2 (fault)"] },
    facility: {} as Alert["facility"],
    hours_to_limit: opts.hours === undefined ? 2.052500979878605 : opts.hours,
    lost_revenue_per_hour: 100,
    action: "",
    fix: {
      plan: { cost: opts.cost ?? 905 } as NonNullable<Alert["fix"]>["plan"],
      label: "truck", headline: opts.headline ?? "Call 1 truck now, 1 trip", details: [],
      trip_at_unix: null, repair_done_unix: 0,
      alternatives: Array.from({ length: opts.alts ?? 2 }, (_, i) => ({ label: `alt ${i}`, cost: 1000 + i, why: "slower" })) as NonNullable<Alert["fix"]>["alternatives"],
      shares_fleet_with: [], fleet: 2,
    },
    tank_sensor: opts.sensor ?? { state: "ok", evidence: "fine", simulated: false },
  };
}

function inspect(facility_id: string): Alert {
  const sys = facility_id.split("_")[0];
  return {
    id: `${facility_id}@leak`,
    event: { category: "pipeline_leak", system_id: sys, facility_id, asset_id: facility_id.replace("FACILITY", "PIPE"), onset_unix: 2, end_unix: null, status: "ongoing", evidence: [] },
    facility: {} as Alert["facility"], hours_to_limit: null, lost_revenue_per_hour: 0, action: "Inspect",
  };
}

function view(alerts: Alert[], sensors: SensorIssue[] = [], totals = { do_nothing: 9957, plans: 1810 }): ConsoleView {
  return { now: 1760000000, alerts, sensors, events: [], totals };
}

const LYING: Alert["tank_sensor"] = { state: "lying", evidence: "Level rises 4 pts/h with the pump off.", simulated: true };

test("totals line: the console's words", () => {
  const v = view([failure("S5_FACILITY_C"), failure("S1_FACILITY_A")]);
  assert.equal(totalsLine(v), "2 pump failures · Cost if unaddressed $9,957 · Response cost $1,810 · Savings $8,147");
  assert.equal(totalsLine(view([failure("S5_FACILITY_C")])), "1 pump failure · Cost if unaddressed $9,957 · Response cost $1,810 · Savings $8,147");
  assert.equal(totalsLine(view([inspect("S2_FACILITY_A")])), null);
});

test("stat tiles: the totals line's own words, in three parts", () => {
  const v = view([failure("S5_FACILITY_C"), failure("S1_FACILITY_A")]);
  const s = stats(v)!;
  assert.equal(`${s.failures} ${s.failuresWord} · Cost if unaddressed ${s.doNothing} · Response cost ${s.plans} · Savings ${s.savings}`, totalsLine(v));
  assert.equal(stats(view([failure("S5_FACILITY_C")]))!.failuresWord, "pump failure");
  assert.equal(stats(view([])), null);
});

test("fix details: the console's line under the plan", () => {
  const a = failure("S5_FACILITY_C");
  a.fix!.details = ["Truck arrives 01:35"];
  a.fix!.trip_at_unix = 1760000000;
  a.fix!.repair_done_unix = 1760003600;
  a.event.level_pct = 87.25;
  assert.equal(fixDetails(a), "Truck arrives 01:35 · tank would trip 08:53 · repair done 09:53 · level now 87.3%");
});

test("the other pump failures, one line each, after the top card", () => {
  const v = view([failure("S5_FACILITY_C"), inspect("S2_FACILITY_A"), failure("S5_FACILITY_B", { hours: 3.4369790761676815, cost: 905 })]);
  const o = otherFixes(v, { "S5_PUMP_B@1": { headline: "x", cost: 1, atMs: 1 } });
  assert.deepEqual(o, [{ alertId: "S5_PUMP_B@1", facility: "S5 Facility B", headline: "Call 1 truck now, 1 trip", cost: "$905", when: "trips in 3h 26m", confirmed: true }]);
});

test("top fix card: facility, Do this, cost, countdown, and Confirm only when the console offers it", () => {
  const c = topCard(view([inspect("S2_FACILITY_A"), failure("S5_FACILITY_C"), failure("S1_FACILITY_A")]), {}, clock)!;
  assert.equal(c.facility, "S5 Facility C");
  assert.equal(c.alertId, "S5_PUMP_C@1");
  assert.equal(c.headline, "Call 1 truck now, 1 trip");
  assert.equal(c.cost, "$905");
  assert.equal(c.when, "trips in 2h 03m");
  assert.equal(c.canConfirm, true);
  assert.deepEqual(c.confirm, { kind: "open" });
  assert.equal(c.sensorFirst, null);
  assert.equal(topCard(view([failure("S5_FACILITY_C", { alts: 0 })]), {}, clock)!.canConfirm, false);
  assert.equal(topCard(view([inspect("S2_FACILITY_A")]), {}, clock), null);
});

test("a lying tank sensor on the plan: CHECK THE TANK SENSOR FIRST, as on the console", () => {
  const c = topCard(view([failure("S5_FACILITY_C", { sensor: LYING })]), {}, clock)!;
  assert.equal(c.sensorFirst, "CHECK THE TANK SENSOR FIRST: LYING · SIMULATED");
});

test("confirmed and unchanged: CONFIRMED by the night shift", () => {
  const a = failure("S5_FACILITY_C");
  const done: Confirmed = { headline: a.fix!.headline, cost: 905.2, atMs: 42 };
  assert.deepEqual(confirmModel(a, done, clock), { kind: "confirmed", text: "by the night shift at T42" });
});

test("CONFIRMED, THEN CHANGED when the confirmed plan's tank sensor is now lying", () => {
  const a = failure("S5_FACILITY_C", { sensor: LYING });
  const m = confirmModel(a, { headline: a.fix!.headline, cost: 905, atMs: 7 }, clock);
  assert.equal(m.kind, "changed");
  if (m.kind !== "changed") return;
  assert.equal(m.renew, false, "same plan: nothing new to confirm");
  assert.equal(m.text, 'You confirmed "Call 1 truck now, 1 trip" ($905) at T7. It relies on a tank sensor that is now LYING (simulated). Check the sensor before the truck rolls.');
});

test("CONFIRMED, THEN CHANGED when the plan changed, with Confirm the new plan", () => {
  const a = failure("S5_FACILITY_C", { headline: "Call 2 trucks now, 2 trips", cost: 1810 });
  const m = confirmModel(a, { headline: "Call 1 truck now, 1 trip", cost: 905, atMs: 7 }, clock);
  assert.equal(m.kind, "changed");
  if (m.kind !== "changed") return;
  assert.equal(m.renew, true);
  assert.ok(m.text.endsWith('The plan now reads "Call 2 trucks now, 2 trips" ($1,810).'));
});

test("sensors to check: badge word, asset and metric, simulated, evidence", () => {
  const s: SensorIssue = { key: "k", asset_id: "S5_TANK_C", metric: "level_pct", facility_id: "S5_FACILITY_C", state: "lying", evidence: "Disagrees with physics.", simulated: true };
  const d: SensorIssue = { ...s, key: "d", asset_id: "S1_PUMP_A", metric: "discharge_psi", state: "dead", simulated: false };
  const r: SensorIssue = { ...s, key: "r", metric: "odd_metric", state: "drifting", simulated: false };
  assert.deepEqual(sensorLines(view([], [s, d, r])).map((x) => [x.icon, x.word, x.what, x.simulated]), [
    ["▲", "LYING", "S5 · TANK C level", true],
    ["▲", "DEAD", "S1 · PUMP A discharge pressure", false],
    ["●", "DRIFTING", "S5 · TANK C odd metric", false],
  ]);
  assert.equal(pretty("S12_FACILITY_AB"), "S12 · FACILITY AB");
});

test("Go to: the top problem first, then failures, then checks, then the quiet ones by name", () => {
  const site = ["S1_FACILITY_A", "S1_FACILITY_B", "S2_FACILITY_A", "S3_FACILITY_A", "S5_FACILITY_C"].map(fac);
  const v = view([failure("S5_FACILITY_C"), failure("S1_FACILITY_B"), inspect("S3_FACILITY_A")]);
  const rows = goToRows(site, v);
  assert.deepEqual(rows.map((r) => r.facility_id), ["S5_FACILITY_C", "S1_FACILITY_B", "S3_FACILITY_A", "S1_FACILITY_A", "S2_FACILITY_A"]);
  assert.deepEqual(rows.map((r) => [r.label, r.state, r.tone]), [
    ["S5 · Facility C tank", "PUMP FAILED", "alert"],
    ["S1 · Facility B tank", "PUMP FAILED", "alert"],
    ["S3 · Facility A tank", "INSPECT", "warn"],
    ["S1 · Facility A tank", "OK", "ok"],
    ["S2 · Facility A tank", "OK", "ok"],
  ]);
  assert.equal(rows[0].top, true);
});

test("board model: no data, a calm site, and a busy one", () => {
  const site = ["S1_FACILITY_A"].map(fac);
  const none = boardModel(null, {}, site, clock);
  assert.equal(none.top, null);
  assert.equal(none.goTo.length, 1);
  const calm = boardModel(view([]), {}, site, clock);
  assert.equal(calm.calm, CALM);
  assert.equal(calm.totals, null);
  const busy = boardModel(view([failure("S1_FACILITY_A")]), {}, site, clock);
  assert.equal(busy.calm, null);
  assert.ok(busy.totals?.startsWith("1 pump failure"));
});

test("Go to pages wrap round", () => {
  const rows = Array.from({ length: 15 }, (_, i) => i);
  assert.deepEqual(page(rows, 0, 6), { rows: [0, 1, 2, 3, 4, 5], index: 0, count: 3 });
  assert.deepEqual(page(rows, 2, 6).rows, [12, 13, 14]);
  assert.equal(page(rows, 3, 6).index, 0);
  assert.equal(page([], 0, 6).count, 1);
});

test("pump facts: each pump's own numbers, from the alert and the last hour of flow", () => {
  const a = failure("S5_FACILITY_C", { hours: 2.5 });
  a.event.level_pct = 62.44;
  a.lost_revenue_per_hour = 410;
  a.fix!.details = ["Truck arrives 01:35"];
  a.fix!.plan.trucks = 1;
  (a as { facility: unknown }).facility = { wells: [{}, {}, {}], tank: { id: "S5_TANK_C" } };
  const flow = { facility_id: "S5_FACILITY_C", system_id: "S5", tank_id: "S5_TANK_C", capacity_bbl: 500, step_s: 3600, points: [{ end_ts: 1, inflow_bpd: 900, outflow_bpd: 0, level_pct: 62, physics_pts: 3.14, reported_pts: 3 }] };
  const f = pumpFacts(a, flow, { system_id: "S5", fleet: 2, trucks_used: 1 } as never);
  assert.deepEqual(f, { level: "62.4%", fill: "+3.1 pts/h", toLimit: "2h 30m", lostPerHour: "$410/h", truckEta: "01:35", wells: "3 wells", spare: "1 of 2" });
  // No flow row: the countdown and the shutdown line give the rate.
  assert.equal(fillPtsH(undefined, 60, 3), 10);
  assert.equal(fillPtsH(undefined, undefined, null), null);
  // A bare alert still reads.
  const bare = pumpFacts(failure("S1_FACILITY_A", { hours: null }));
  assert.equal(bare.level, "—");
  assert.equal(bare.wells, "—");
});

test("fix cards: every pump failure, top first, each with its own facts", () => {
  const v = view([failure("S5_FACILITY_C", { hours: 1 }), inspect("S2_FACILITY_A"), failure("S1_FACILITY_A", { hours: 4 })]);
  const cs = fixCards(v, {}, clock);
  assert.deepEqual(cs.map((c) => c.facilityId), ["S5_FACILITY_C", "S1_FACILITY_A"]);
  assert.deepEqual(cs.map((c) => c.pump.toLimit), ["1h 00m", "4h 00m"]);
  assert.equal(cs[0].assetId, "S5_PUMP_C");
  const m = boardModel(v, {}, [], clock);
  assert.equal(m.cards.length, 2);
  assert.equal(m.top?.facilityId, "S5_FACILITY_C");
  assert.equal(STAT_WORDS.doNothing, "Cost if unaddressed");
});
