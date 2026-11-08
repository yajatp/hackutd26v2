import { test } from "node:test";
import assert from "node:assert/strict";
import { assetFor, clock, failureSpans, inMin, marginOfError, money, orderFlows, plain, pretty, sharedMax, signedMoney, siteFor, systemsText, tplus } from "./format.ts";
import type { ConsoleView } from "../../lib/eog/alerts.ts";
import type { FlowSeries } from "../../lib/eog/flows.ts";

const series = (id: string, inflow: number, out: number): FlowSeries => ({
  facility_id: id, system_id: id.slice(0, 2), tank_id: id + "_T", capacity_bbl: 600, step_s: 3600,
  points: [{ end_ts: 3600, inflow_bpd: inflow, outflow_bpd: out, level_pct: 50, physics_pts: 1, reported_pts: 1.25 }],
});

test("words and times", () => {
  assert.equal(pretty("S5_FACILITY_C"), "S5 Facility C");
  assert.equal(money(1809.6), "$1,810");
  assert.equal(money(-905), "-$905");
  assert.equal(signedMoney(5285.4), "+$5,285");
  assert.equal(signedMoney(0), "$0");
  assert.equal(clock(1791646200), "15:30");
  assert.equal(tplus(0), "T+0");
  assert.equal(tplus(45), "T+45m");
  assert.equal(tplus(123.2), "T+2h03");
  assert.equal(tplus(-90), "T-1h30");
  assert.equal(assetFor("sensor_spoof", { facility_id: "F", tank_id: "T" }), "T");
  assert.equal(assetFor("pump_fail", { facility_id: "F", tank_id: "T" }), "F");
});

test("problem facilities first, in console order; the rest by name", () => {
  const flows = [series("S1_A", 1, 1), series("S5_C", 1, 0), series("S2_B", 1, 1), series("S5_B", 1, 0)];
  const view = { alerts: [{ facility: { id: "S5_C" } }, { facility: { id: "S5_B" } }], events: [], now: 0 } as unknown as ConsoleView;
  assert.deepEqual(orderFlows(flows, view).map((f) => f.facility_id), ["S5_C", "S5_B", "S1_A", "S2_B"]);
  assert.deepEqual(orderFlows(flows, null).map((f) => f.facility_id), ["S1_A", "S2_B", "S5_B", "S5_C"]);
});

test("failure spans, margin of error and the shared scale", () => {
  const view = { now: 900, alerts: [], events: [
    { category: "pump_failure", facility_id: "S5_C", onset_unix: 100, end_unix: null },
    { category: "pump_failure", facility_id: "S5_C", onset_unix: 10, end_unix: 50 },
    { category: "pipeline_leak", facility_id: "S5_C", onset_unix: 0, end_unix: 5 },
  ] } as unknown as ConsoleView;
  assert.deepEqual(failureSpans(view, "S5_C"), [[100, 900], [10, 50]]);
  assert.equal(marginOfError(series("X", 1, 1).points), 0.25);
  assert.equal(sharedMax([series("A", 2396, 3609), series("B", 1300, 0)]), 4000);
});

test("operator words: wells, systems, minutes, the site", () => {
  assert.equal(plain("S2_WELL_A1, S2_WELL_A2, S2_WELL_A3 shut in, $3,931/h"), "wells A1-A3 shut in, $3,931/h");
  assert.equal(plain("S5 Facility C pump fails (pump status = 2 (fault))."), "S5 Facility C pump fails (pump fault code).");
  assert.equal(plain("Pump back after the 6 h expected repair (ops.json)."), "Pump back after the 6 h expected repair.");
  assert.equal(systemsText(["S1", "S2", "S3", "S4"]), "S1-S4");
  assert.equal(systemsText(["S1", "S3"]), "S1, S3");
  assert.equal(systemsText(["S2"]), "S2");
  assert.equal(inMin(61), "in 1 h 01");
  assert.equal(inMin(45), "in 45 min");
  assert.equal(inMin(-70), "1 h 10 ago");
  assert.equal(siteFor(null, "mock_test_2026-10-10T1530")?.name, "Midland");
  assert.equal(siteFor("delaware", "anything")?.name, "Carlsbad");
  assert.equal(siteFor(null, "nope"), null);
});
