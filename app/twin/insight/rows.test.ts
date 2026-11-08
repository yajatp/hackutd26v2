// Run: npx tsx --test app/twin/insight/rows.test.ts
// The headset's Insight view: the same four figures and pump rows as /insight.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ConsoleView } from "@/lib/eog/alerts";
import type { SystemBudget } from "@/lib/eog/budget";
import type { FlowSeries } from "@/lib/eog/flows";
import type { BreachRisk } from "@/lib/eog/breach";
import type { SiteFacility } from "@/lib/live";
import { INSIGHT_COLUMNS, insightRows, insightSummary } from "./rows";

const NOW = Date.UTC(2026, 10, 8, 1, 0) / 1000;

function alert(facility_id: string, cost: number, level: number, hours: number) {
  return {
    id: `${facility_id}@1`,
    facility: { id: facility_id, wells: ["W1", "W2", "W3"] },
    event: { category: "pump_failure", system_id: facility_id.split("_")[0], facility_id, level_pct: level },
    lost_revenue_per_hour: 500,
    hours_to_limit: hours,
    fix: { plan: { cost, trucks: 1 }, details: ["Truck arrives 01:45"], trip_at_unix: NOW + 3600, repair_done_unix: NOW + 3 * 3600 },
  };
}

function view(alerts: unknown[], plans: number, nothing: number): ConsoleView {
  return { now: NOW, alerts, totals: { plans, do_nothing: nothing }, events: [] } as unknown as ConsoleView;
}

function flow(facility_id: string, level: number, pts: number): FlowSeries {
  return { facility_id, system_id: facility_id.split("_")[0], step_s: 3600, points: [{ level_pct: level, physics_pts: pts, reported_pts: pts, inflow_bpd: 900, outflow_bpd: 800 }] } as unknown as FlowSeries;
}

const budget = (system_id: string, fleet: number, used: number, failures: number): SystemBudget => ({
  system_id, facilities: 3, fleet, trucks_used: used, trips: used, failures, plans: 0, do_nothing: 0, truck_cost: 0, shut_in_cost: 0, at_risk_per_hour: 0, revenue_per_hour: 0,
});

test("the four figures read like /insight: console totals, savings, spare trucks across systems", () => {
  const s = insightSummary(view([], 905, 4000), [budget("S5", 4, 2, 2), budget("S1", 3, 0, 0)]);
  assert.equal(s.unaddressed, "$4,000");
  assert.equal(s.response, "$905");
  assert.equal(s.savings, "$3,095");
  assert.equal(s.spare, "5 of 7");
  assert.equal(s.inUse, "2 in use");
  assert.equal(s.spareShort, false);
  assert.ok(Math.abs(s.planPct - 22.625) < 1e-9);
  assert.equal(s.hasCost, true);
});

test("no view falls back to the budget rows; a failing system with no spare truck is flagged", () => {
  const b = { ...budget("S5", 2, 2, 1), plans: 300, do_nothing: 200 };
  const s = insightSummary(null, [b]);
  assert.equal(s.response, "$300");
  assert.equal(s.savings, "$0");
  assert.equal(s.spare, "0 of 2");
  assert.equal(s.spareShort, true);
  assert.equal(s.planPct, 100);
  assert.equal(insightSummary(null, []).spare, "—");
  assert.equal(insightSummary(null, []).hasCost, false);
});

test("rows: failed pumps first with their plan and curve, then running pumps by name", () => {
  const v = view([alert("S5_FACILITY_C", 905, 84, 2.05)], 905, 4000);
  const flows = [flow("S1_FACILITY_B", 40, -1.5), flow("S1_FACILITY_A", 50, 0), flow("S5_FACILITY_C", 84, 9)];
  const breaches = [{ facility_id: "S1_FACILITY_B", system_id: "S1", mode: "running", real_trip_unix: NOW + 5400, lost_per_hour: 250 }] as unknown as BreachRisk[];
  const facilities = [{ facility_id: "S1_FACILITY_A", well_ids: ["a", "b"] }] as unknown as SiteFacility[];
  const rows = insightRows(v, flows, breaches, facilities);
  assert.deepEqual(rows.map((r) => r.id), ["S5_FACILITY_C", "S1_FACILITY_A", "S1_FACILITY_B"]);
  const [c, a, b] = rows;
  assert.equal(c.pump, "S5 Facility C");
  assert.equal(c.status, "Pump failed");
  assert.equal(c.level, "84.0%");
  assert.equal(c.fill, "+9.0 pts/h");
  assert.equal(c.toLimit, "2h 03m");
  assert.equal(c.lost, "$500/h");
  assert.equal(c.eta, "45m");
  assert.equal(c.wells, "3");
  assert.equal(c.response, "$905");
  assert.ok(c.curve.length >= 2 && c.curve.every((k) => k >= 0 && k <= 1));
  assert.match(c.curveEnd, /^\$[\d,]+ at 4 h$/);
  assert.equal(c.curveEnd, `${c.curveLast} at 4 h`);
  assert.equal(a.status, "Running");
  assert.equal(a.wells, "2");
  assert.equal(a.response, "—");
  assert.deepEqual(a.curve, []);
  assert.equal(b.toLimit, "1h 30m");
  assert.equal(b.ifStopped, true);
  assert.equal(b.fill, "−1.5 pts/h");
  assert.equal(b.lost, "$250/h");
});

test("no view, no rows; the columns fill the width", () => {
  assert.deepEqual(insightRows(null, [], [], []), []);
  const total = INSIGHT_COLUMNS.reduce((u, c) => u + c.w, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});
