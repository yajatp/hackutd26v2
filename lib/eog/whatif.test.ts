import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConsole } from "./alerts.ts";
import { hasData, loadFolder } from "./testdata.ts";
import { optionsFor, planNetwork, type Failure } from "./planner.ts";
import { flagsForFlat, levelPath, outcomeOf, plainEvidence, plainIds, wellsText, whatIf, WHAT_IF_KINDS } from "./whatif.ts";

const MOCK = "mock_test_2026-10-10T1530";
const skip = !hasData(MOCK);
const site = () => { const ds = loadFolder(MOCK); return { ds, view: buildConsole(ds) }; };

test(`${MOCK}: pump_fail on S2 Facility B trips without a plan, and S2's trucks are all free`, { skip }, () => {
  const { ds, view } = site();
  const r = whatIf(ds, view, "pump_fail", "S2_FACILITY_B");
  assert.equal(r.system_id, "S2");
  assert.ok(r.trip_unix !== null && r.trip_unix > ds.now, "the tank trips after now");
  assert.ok(r.trip_unix! < r.repair_done_unix, "before the repair");
  assert.ok(r.plan && r.plan.cost < r.do_nothing_cost, "the plan beats doing nothing");
  assert.deepEqual(r.changes, [], "no other S2 failure to take trucks from");
  assert.equal(Math.round(r.night_after - r.night_before), Math.round(r.cost_delta));
  assert.ok(r.steps.some((s) => s.branch === "ignored" && /trips at 92%/.test(s.text)), "the trip is on the timeline");
  for (let i = 1; i < r.steps.length; i++) assert.ok(r.steps[i].t_min >= r.steps[i - 1].t_min, "time order");
});

test(`${MOCK}: pump_fail on S5 Facility A takes a truck from S5 Facility B`, { skip }, () => {
  const { ds, view } = site();
  const r = whatIf(ds, view, "pump_fail", "S5_PUMP_A");
  assert.equal(r.facility_id, "S5_FACILITY_A");
  assert.equal(r.fleet, 2);
  assert.ok(r.changes.length >= 1, "an S5 plan changes");
  const b = r.changes.find((c) => c.facility_id === "S5_FACILITY_B")!;
  assert.ok(b, "S5 Facility B's plan changes");
  assert.equal(b.before.headline, view.alerts.find((a) => a.facility.id === "S5_FACILITY_B")!.fix!.headline, "before = the console's plan");
  assert.ok(r.trucks_after <= r.fleet);
  assert.ok(r.cost_delta > r.plan!.cost - 0.5, "the night grows by more than this plan: the knock-on costs too");
});

test(`${MOCK}: pump_fail on a pump that has already failed says so and changes nothing`, { skip }, () => {
  const { ds, view } = site();
  const r = whatIf(ds, view, "pump_fail", "S5_FACILITY_C");
  assert.match(r.title, /already failed/);
  assert.equal(r.cost_delta, 0);
});

test(`${MOCK}: a spoof since S5 Facility C's pump failed makes the planner pick a shut-in after the real trip`, { skip }, () => {
  const { ds, view } = site();
  const r = whatIf(ds, view, "sensor_spoof", "S5_TANK_C");
  assert.ok(r.lie, "the engine reran on the faked copy");
  assert.ok(r.lie!.trip_unix! > r.trip_unix!, "the console's countdown runs late");
  assert.ok(r.lie!.real_trip_unix !== null, "the real tank trips under the lie's plan");
  assert.ok(r.exposure! > 1000, `exposure ${r.exposure}`);
  assert.equal(Math.round(r.honest_cost!), 905);
  assert.match(r.lie!.sensor, /^LYING/, "the console flags the sensor");
});

test(`${MOCK}: a spoof on a running pump hides a stop until the physics check flags it`, { skip }, () => {
  const { ds, view } = site();
  const r = whatIf(ds, view, "sensor_spoof", "S4_TANK_A");
  assert.equal(r.lie, null);
  assert.ok(r.trip_unix !== null);
  assert.equal(r.flags[r.flags.length - 1].state, "lying");
  assert.ok(r.exposure! > 0 && Math.abs(r.exposure! - (r.believed_cost! - r.honest_cost!)) < 1e-6);
  const dead = whatIf(ds, view, "sensor_dead", "S4_TANK_A");
  assert.deepEqual(dead.flags.map((x) => x.state), ["dead"]);
  assert.equal(dead.flags[0].after_min, 10, "two missed 5-minute samples");
});

test(`${MOCK}: pipeline_leak sizes the spill from this data's leaks and isolates the line`, { skip }, () => {
  const { ds, view } = site();
  const r = whatIf(ds, view, "pipeline_leak", "S2_PIPELINE_B");
  assert.ok(r.spill_bpd !== null && r.spill_bpd > 0);
  assert.ok(r.steps.some((s) => /Isolate the line/.test(s.text)));
  assert.ok(r.notes.some((n) => /repair time/.test(n)));
});

test("every kind runs on every facility of mock_test without throwing", { skip }, () => {
  const { ds, view } = site();
  for (const kind of WHAT_IF_KINDS) for (const s of ds.network.systems) for (const f of s.facilities) {
    const r = whatIf(ds, view, kind, kind === "pump_fail" ? f.id : kind === "pipeline_leak" ? f.pipeline.id : f.tank.id);
    assert.ok(r.steps.length > 0 && r.summary.length > 0, `${kind} ${f.id}`);
    assert.doesNotThrow(() => JSON.stringify(r));
  }
  assert.throws(() => whatIf(ds, view, "pump_fail", "NOPE"), /not a facility/);
  assert.throws(() => whatIf(ds, view, "meteor" as never, "S2_FACILITY_B"), /kind must be/);
});

test("flagsForFlat: DRIFTING first, LYING after two readings over the lie line, nothing below the drift line", () => {
  const lines = { drift_line: 0.7, lie_line: 2 };
  const f = flagsForFlat(9.3, lines, 300);
  assert.deepEqual(f.map((x) => x.state), ["drifting", "lying"]);
  assert.equal(f[0].after_min, 5);
  assert.equal(f[1].after_min, 20);   // 9.3 x 15/60 = 2.3 > 2 at 15 min, again at 20
  assert.deepEqual(flagsForFlat(0.5, lines, 300), []);
  assert.deepEqual(flagsForFlat(1.5, lines, 300).map((x) => x.state), ["drifting"]);
});

test("outcomeOf: a plan that holds costs what it says; doing nothing costs the trip to the repair", { skip }, () => {
  const ds = loadFolder(MOCK);
  const net = planNetwork(ds.network, ds.ops);
  const fac = net.facilities["S2_FACILITY_B"];
  const fail: Failure = { event_id: "x", facility: fac, level_pct: 50, horizon_min: 360 };
  const opts = optionsFor(fail, net, 2);
  for (const p of opts) {
    if (p.kind === "none_needed") continue;
    const o = outcomeOf(fail, net, p);
    if (p.kind === "do_nothing") { assert.ok(o.trip_min !== null); assert.ok(Math.abs(o.cost - p.cost) < 1, `${o.cost} vs ${p.cost}`); }
    else { assert.equal(o.trip_min, null, p.kind); assert.ok(Math.abs(o.cost - p.cost) < 1e-6); }
  }
});

test("levelPath: the plan holds under the trip line and ends at the repair; doing nothing trips and holds at the limit", { skip }, () => {
  const ds = loadFolder(MOCK);
  const net = planNetwork(ds.network, ds.ops);
  const fail: Failure = { event_id: "x", facility: net.facilities["S2_FACILITY_B"], level_pct: 50, horizon_min: 360 };
  const opts = optionsFor(fail, net, 2);
  const nothing = levelPath(fail, net, null);
  const o = outcomeOf(fail, net, opts.find((p) => p.kind === "do_nothing")!);
  assert.ok(nothing.trip_min !== null && Math.abs(nothing.trip_min - o.trip_min!) < 1e-6, "same trip as outcomeOf");
  assert.deepEqual(nothing.pts[nothing.pts.length - 1], [360, net.shutdown_pct], "flat at the limit until the repair");
  const plan = opts.find((p) => p.trucks > 0 && p.kind !== "do_nothing")!;
  const lp = levelPath(fail, net, plan);
  assert.equal(lp.trip_min, null, plan.kind);
  assert.equal(lp.pickups.length, plan.trips_per_truck, "one pickup per trip");
  assert.ok(lp.pts.every(([, l]) => l <= net.shutdown_pct + 1e-6));
  for (let i = 1; i < lp.pts.length; i++) assert.ok(lp.pts[i][0] >= lp.pts[i - 1][0], "time order");
  assert.equal(lp.pts[lp.pts.length - 1][0], 360);
  const late = levelPath(fail, net, plan, 20);
  assert.equal(late.pts[0][0], 20, "a later stop starts at its delay");
});

test("wells and evidence in the operator's words", () => {
  assert.equal(wellsText(["S2_WELL_A1", "S2_WELL_A2", "S2_WELL_A3"]), "wells A1-A3");
  assert.equal(wellsText(["S4_WELL_D2"]), "well D2");
  assert.equal(wellsText(["S4_WELL_D1", "S4_WELL_D3"]), "wells D1, D3");
  assert.equal(plainEvidence("pump status = 2 (fault)"), "pump fault code");
  assert.equal(plainEvidence(undefined), "pump failure");
  assert.equal(plainIds("Shut in S4_WELL_D2 at 15:51, and shut in S4_WELL_D3 at 16:41"), "Shut in well D2 at 15:51, and shut in well D3 at 16:41");
  assert.equal(plainIds("S2_WELL_A1, S2_WELL_A2, S2_WELL_A3 shut in"), "wells A1-A3 shut in");
  assert.equal(plainIds("shut in S5_WELL_C1 and S5_WELL_C2"), "shut in wells C1-C2");
});

test(`${MOCK}: every ripple tags its futures and draws them; trusting a spoofed sensor is its own branch`, { skip }, () => {
  const { ds, view } = site();
  const pf = whatIf(ds, view, "pump_fail", "S2_FACILITY_A");
  assert.ok(pf.projection, "pump_fail has a chart");
  assert.deepEqual(pf.projection!.lines.map((l) => l.key).sort(), ["ignored", "plan"]);
  assert.ok(pf.projection!.marks.some((m) => m.key === "trip" && m.line === "ignored"));
  assert.ok(pf.projection!.marks.some((m) => m.key === "truck" && m.line === "plan"));
  const run = whatIf(ds, view, "sensor_spoof", "S4_TANK_D");
  assert.ok(run.steps.some((s) => s.branch === "lie" && /trips at 92%/.test(s.text)), "the trip is the lie's future");
  assert.ok(run.steps.some((s) => s.branch === "flag"), "acting on the flag");
  assert.deepEqual(run.projection!.lines.map((l) => l.key).sort(), ["lie", "plan", "shown"]);
  assert.ok(run.projection!.marks.some((m) => m.key === "flag" && m.label === "LYING"));
  const failed = whatIf(ds, view, "sensor_spoof", "S5_TANK_C");
  assert.ok(failed.projection!.from_min < 0, "the chart starts at the failure");
  assert.ok(failed.projection!.lines.some((l) => l.key === "past" && l.pts.length > 2));
  assert.ok(failed.steps.every((s) => !/S\d+_WELL_|status = 2|ops\.json|\.ts\b/.test(s.text)), "no raw ids or file names in the steps");
  for (const r of [pf, run, failed, whatIf(ds, view, "pipeline_leak", "S2_PIPELINE_B")]) {
    for (const s of r.steps) assert.ok(!/S\d+_WELL_|ops\.json|network\.json|\.ts\b/.test(s.text), s.text);
    assert.ok(!/S\d+_WELL_|S\d+_PUMP_|S\d+_PIPELINE_/.test(r.title + r.summary), r.summary);
    for (const n of r.notes) assert.ok(!/ops\.json|\.ts\b/.test(n), n);
  }
});
