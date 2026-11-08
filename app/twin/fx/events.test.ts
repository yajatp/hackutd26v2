// Run: npx tsx --test app/twin/fx/events.test.ts
// The attack moment's events from two snapshots of the tanks, through the real tankStates, so the
// words are exactly the console's.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Alert, ConsoleView, SensorIssue } from "@/lib/eog/alerts";
import type { SiteFacility } from "@/lib/live";
import { tankStates } from "../model";
import { confirmedFacilities, diffFaults, fakedIds, loudest, RESTS_ON_IT, simulatedLine } from "./events";

function fac(facility_id: string): SiteFacility {
  const [system_id, , letter] = facility_id.split("_");
  return { facility_id, system_id, lat: 31 + letter.charCodeAt(0) / 100, lon: -102, tank_id: `${system_id}_TANK_${letter}`, pump_id: `${system_id}_PUMP_${letter}`, capacity_bbl: 500, well_ids: [] };
}
const SITE = [fac("S5_FACILITY_C"), fac("S1_FACILITY_A"), fac("S2_FACILITY_B")];

function issue(facility_id: string, state: SensorIssue["state"], simulated: boolean): SensorIssue {
  const tank = facility_id.replace("FACILITY", "TANK");
  return { key: `${tank}:level_pct`, asset_id: tank, metric: "level_pct", facility_id, state, evidence: "off physics", simulated };
}

function pumpFailure(facility_id: string, hours: number): Alert {
  const pump = facility_id.replace("FACILITY", "PUMP");
  return {
    id: `${pump}@1`,
    event: { category: "pump_failure", system_id: facility_id.split("_")[0], facility_id, asset_id: pump, onset_unix: 1, end_unix: null, status: "ongoing", evidence: ["pump status = 2 (fault)"] },
    facility: {} as Alert["facility"],
    hours_to_limit: hours,
    lost_revenue_per_hour: 100,
    action: "Call 1 truck now, 1 trip",
    fix: {
      plan: { cost: 905 } as NonNullable<Alert["fix"]>["plan"],
      label: "truck", headline: "Call 1 truck now, 1 trip", details: [],
      trip_at_unix: null, repair_done_unix: 0, alternatives: [], shares_fleet_with: [], fleet: 1,
    },
  };
}

const view = (alerts: Alert[] = [], sensors: SensorIssue[] = []): ConsoleView =>
  ({ now: 0, alerts, sensors, events: [], totals: { do_nothing: 0, plans: 0 } });
const states = (v: ConsoleView | null) => tankStates(SITE, v);

test("a tank that newly reads LYING · SIMULATED is one 'faked' event, in the console's words", () => {
  const ev = diffFaults(states(view()), states(view([], [issue("S5_FACILITY_C", "lying", true)])));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].kind, "faked");
  assert.equal(ev[0].facility_id, "S5_FACILITY_C");
  assert.equal(ev[0].text, "▲ S5 Facility C · tank level sensor LYING · SIMULATED");
  assert.equal(ev[0].state, "LYING · SIMULATED");
  assert.equal(ev[0].tone, "warn");
  assert.equal(ev[0].sub, null);
});

test("DEAD and DRIFTING count when simulated; a real (not simulated) bad sensor is no attack", () => {
  for (const state of ["dead", "drifting"] as const) {
    const ev = diffFaults(states(view()), states(view([], [issue("S1_FACILITY_A", state, true)])));
    assert.deepEqual(ev.map((e) => [e.kind, e.state]), [["faked", `${state.toUpperCase()} · SIMULATED`]]);
  }
  assert.deepEqual(diffFaults(states(view()), states(view([], [issue("S1_FACILITY_A", "lying", false)]))), []);
});

test("the toast's second line says the confirmed plan rests on the faked sensor", () => {
  const ev = diffFaults(states(view()), states(view([], [issue("S5_FACILITY_C", "lying", true)])), new Set(["S5_FACILITY_C"]));
  assert.equal(ev[0].sub, RESTS_ON_IT);
});

test("confirmedFacilities maps confirmed alert ids to their facilities", () => {
  const v = view([pumpFailure("S5_FACILITY_C", 2), pumpFailure("S1_FACILITY_A", 3)]);
  const got = confirmedFacilities(v, { "S5_PUMP_C@1": { headline: "x", cost: 1, atMs: 0 } });
  assert.deepEqual([...got], ["S5_FACILITY_C"]);
  assert.deepEqual([...confirmedFacilities(null, {})], []);
});

test("a fake that goes away is one calm 'cleared' event; a word change is a new fake", () => {
  const faked = states(view([], [issue("S5_FACILITY_C", "lying", true)]));
  const cleared = diffFaults(faked, states(view()));
  assert.deepEqual(cleared.map((e) => [e.kind, e.tone, e.text]), [["cleared", "ok", "✓ S5 Facility C · simulated fault cleared"]]);
  assert.equal(cleared[0].sub, "Tank level sensor reads true again");
  const drift = diffFaults(faked, states(view([], [issue("S5_FACILITY_C", "drifting", true)])));
  assert.deepEqual(drift.map((e) => [e.kind, e.state]), [["faked", "DRIFTING · SIMULATED"]]);
  const real = diffFaults(faked, states(view([], [issue("S5_FACILITY_C", "dead", false)])));
  assert.equal(real[0].sub, "Tank level sensor now DEAD");
});

test("a new pump failure is 'failed'; the countdown ticking down is not a new event", () => {
  const ev = diffFaults(states(view()), states(view([pumpFailure("S2_FACILITY_B", 2.0525)])));
  assert.deepEqual(ev.map((e) => [e.kind, e.tone, e.text, e.sub]), [
    ["failed", "alert", "▲ S2 Facility B · PUMP FAILED · trips in 2h 03m", "Do this: Call 1 truck now, 1 trip"],
  ]);
  assert.deepEqual(diffFaults(states(view([pumpFailure("S2_FACILITY_B", 2.05)])), states(view([pumpFailure("S2_FACILITY_B", 1.9)]))), []);
});

test("no baseline, no events: the first snapshot, a NO DATA snapshot, a facility new to the site", () => {
  const attacked = states(view([pumpFailure("S2_FACILITY_B", 2)], [issue("S5_FACILITY_C", "lying", true)]));
  assert.deepEqual(diffFaults(null, attacked), []);
  assert.deepEqual(diffFaults(states(null), attacked), []);
  assert.deepEqual(diffFaults([], attacked), []);
  assert.deepEqual(diffFaults(attacked, attacked), []);
});

test("several at once: fakes first, then failures, then clears; loudest is the fake", () => {
  const before = states(view([], [issue("S1_FACILITY_A", "lying", true)]));
  const after = states(view([pumpFailure("S2_FACILITY_B", 2)], [issue("S5_FACILITY_C", "lying", true)]));
  const ev = diffFaults(before, after);
  assert.deepEqual(ev.map((e) => [e.kind, e.facility_id]), [
    ["faked", "S5_FACILITY_C"], ["failed", "S2_FACILITY_B"], ["cleared", "S1_FACILITY_A"],
  ]);
  assert.equal(loudest(ev)?.kind, "faked");
  assert.equal(loudest([ev[2], ev[1]])?.kind, "failed");
  assert.equal(loudest([]), null);
});

test("fakedIds: tanks with a SIMULATED sensor line, or a fault row on their tank", () => {
  const s = states(view([], [issue("S5_FACILITY_C", "lying", true), issue("S1_FACILITY_A", "dead", false)]));
  assert.deepEqual([...fakedIds(s)], ["S5_FACILITY_C"]);
  assert.deepEqual([...fakedIds(s, new Set(["S2_TANK_B"]))].sort(), ["S2_FACILITY_B", "S5_FACILITY_C"]);
  assert.equal(simulatedLine(s[0]), "LYING · SIMULATED");
  assert.equal(simulatedLine(s[1]), null);
});
