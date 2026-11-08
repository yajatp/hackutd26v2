// Run: npx tsx --test app/twin/sim/series.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { FlowSeries } from "@/lib/eog/flows";
import type { Projection, Ripple } from "@/lib/eog/whatif";
import { impliedLimit, latestRun, levelFallback, levelFromProjection, rateChart, signedMoney, simChoices, simResult, toPx } from "./series";

const flow: FlowSeries = {
  facility_id: "S5_FACILITY_C", system_id: "S5", tank_id: "S5_TANK_C", capacity_bbl: 500, step_s: 3600,
  points: [0, 1, 2, 3].map((i) => ({ end_ts: 1000 + i * 3600, inflow_bpd: 900 + i, outflow_bpd: i < 2 ? 900 : 0, level_pct: 50 + i * 2, physics_pts: 2, reported_pts: 2 })),
};

const proj: Projection = {
  from_min: -60, to_min: 360, shutdown_pct: 90, warning_pct: 80,
  lines: [
    { key: "past", pts: [[-60, 55], [0, 60]] },
    { key: "plan", pts: [[0, 60], [90, 75], [90, 20], [360, 50]] },
    { key: "ignored", pts: [[0, 60], [180, 90], [360, 90]] },
    { key: "plan", pts: [[0, 1], [1, 2]] },
  ],
  marks: [{ key: "truck", line: "plan", t_min: 90, level_pct: 20, label: "truck" }, { key: "trip", line: "ignored", t_min: 180, level_pct: 90, label: "trip" }, { key: "flag", line: "flag", t_min: 10, level_pct: 60, label: "" }],
};

test("level from a what-if projection: with and without the plan, truck and limit marks", () => {
  const c = levelFromProjection(proj);
  assert.deepEqual(c.lines.map((l) => [l.key, l.label]), [["past", "Recorded"], ["plan", "With plan"], ["noplan", "Without plan"]]);
  assert.equal(c.lines[1].pts.length, 4);                  // the first plan line wins
  assert.deepEqual(c.marks.map((m) => m.label), ["Truck", "Limit"]);
  assert.deepEqual(c.x, [-60, 360]);
  assert.equal(c.rule, 90);
});

test("level fallback: recorded hours and a straight line at the fill rate to the limit", () => {
  const c = levelFallback(flow, 60, 10, 90, 6)!;
  assert.deepEqual(c.lines.map((l) => l.key), ["past", "noplan"]);
  assert.deepEqual(c.lines[0].pts[0], [-180, 50]);
  // 30 pts at 10 pts/h: the limit in 3 h, then flat.
  assert.deepEqual(c.lines[1].pts, [[0, 60], [180, 90], [360, 90]]);
  assert.equal(c.marks[0].x, 180);
  assert.equal(levelFallback(undefined, undefined, null), null);
  assert.equal(levelFallback(undefined, 40, null)!.lines.length, 0);
});

test("rate in vs rate out over the recorded hours", () => {
  const c = rateChart(flow)!;
  assert.deepEqual(c.lines.map((l) => l.label), ["In", "Out"]);
  assert.deepEqual(c.lines[0].pts.map((p) => p[0]), [-3, -2, -1, 0]);
  assert.equal(c.note, "Now: in 903 bpd, out 0 bpd");
  assert.equal(rateChart(undefined), null);
});

test("simulate: two choices, newest run per facility, signed cost change", () => {
  assert.deepEqual(simChoices("S5_PUMP_C", "S5_TANK_C").map((c) => [c.kind, c.label, c.asset]), [["pump_fail", "Pump fails", "S5_PUMP_C"], ["sensor_spoof", "Sensor spoofed", "S5_TANK_C"]]);
  const r = (atMs: number, kind: "pump_fail" | "sensor_spoof", facilityId = "S5_FACILITY_C") => ({ atMs, kind, assetId: "x", facilityId, ripple: {} as Ripple });
  const runs = [r(1, "pump_fail"), r(3, "sensor_spoof"), r(2, "pump_fail"), r(9, "pump_fail", "S1_FACILITY_A")];
  assert.equal(latestRun(runs, "S5_FACILITY_C")!.atMs, 3);
  assert.equal(latestRun(runs, "S5_FACILITY_C", "pump_fail")!.atMs, 2);
  assert.equal(latestRun(runs, "S5_FACILITY_C", "pump_fail", 5), null);
  assert.equal(signedMoney(905), "+$905");
  assert.equal(signedMoney(-120.4), "-$120");
  assert.equal(signedMoney(0), "$0");
});

test("sim result: pump failure reads cost change and spare trucks; spoof reads exposure", () => {
  const base = { title: "T", cost_delta: 905, do_nothing_cost: 4000, fleet: 2, trucks_after: 1, exposure: null, believed_cost: null, honest_cost: null, projection: proj } as unknown as Ripple;
  const a = simResult({ ...base, kind: "pump_fail" });
  assert.deepEqual(a.lines, ["Response cost change +$905", "Cost if unaddressed $4,000 · Spare trucks 1 of 2"]);
  assert.equal(a.chart!.lines.length, 3);
  const b = simResult({ ...base, kind: "sensor_spoof", exposure: 3000, believed_cost: 4000, honest_cost: 1000, projection: null });
  assert.deepEqual(b.lines, ["Exposure $3,000", "Sensor believed $4,000 · Checked first $1,000"]);
  assert.equal(b.chart, null);
});

test("sim result: 'Pump fails' on a pump that is already down shows the engine's words, not $0 lines", () => {
  const down = {
    kind: "pump_fail", title: "S5 Facility C: the pump has already failed",
    summary: "This pump is already down on the console: Send 2 trucks ($9,957).",
    cost_delta: 0, do_nothing_cost: 0, fleet: 2, trucks_before: 0, trucks_after: 0, plan: { cost: 9957 },
    exposure: null, believed_cost: null, honest_cost: null, projection: proj,
  } as unknown as Ripple;
  const a = simResult(down);
  assert.equal(a.title, "S5 Facility C: the pump has already failed");
  assert.deepEqual(a.lines, ["The pump has already failed", "Console plan: Send 2 trucks ($9,957)."]);
  assert.ok(!a.lines.some((l) => /\$0\b|Spare trucks/.test(l)));
  // Same answer when only the zero-truck shape gives it away.
  const b = simResult({ ...down, title: "S5 Facility C: the pump fails now" });
  assert.deepEqual(b.lines, ["The pump fails now", "Console plan: Send 2 trucks ($9,957)."]);
  // A healthy pump with real trucks still reads the cost lines.
  const c = simResult({ ...down, title: "T", trucks_before: 1, trucks_after: 2, cost_delta: 905, do_nothing_cost: 4000 });
  assert.equal(c.lines[0], "Response cost change +$905");
});

test("implied limit: level + fill x hours to limit, so the chart agrees with the card", () => {
  // Midland: 73.5% at +9.0 pts/h with 2h03m to limit -> about 92%.
  const lim = impliedLimit(73.5, 9, 2.05);
  assert.ok(Math.abs(lim - 91.95) < 0.01);
  const c = levelFallback(flow, 73.5, 9, lim)!;
  assert.equal(c.rule, lim);
  const noplan = c.lines.find((l) => l.key === "noplan")!;
  assert.ok(Math.abs(noplan.pts[1][0] - 2.05 * 60) < 0.5);   // reaches the limit at HOURS TO LIMIT
  assert.equal(impliedLimit(undefined, 9, 2), 90);
  assert.equal(impliedLimit(70, null, 2), 90);
  assert.equal(impliedLimit(70, 9, null, 92), 92);
  assert.equal(impliedLimit(70, 50, 2), 90);                // past 100% is not a limit
});

test("toPx: y up, clamped to the box", () => {
  const box = { x: 10, y: 20, w: 100, h: 50 };
  assert.deepEqual(toPx([0, 0], box, [0, 10], [0, 100]), [10, 70]);
  assert.deepEqual(toPx([10, 100], box, [0, 10], [0, 100]), [110, 20]);
  assert.deepEqual(toPx([20, -5], box, [0, 10], [0, 100]), [110, 70]);
});
