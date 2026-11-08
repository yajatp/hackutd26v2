// Run: npx tsx --test app/twin/model.test.ts
// The twin's rules, without a browser: where each tank goes on the table, and what its label,
// color, fill and panel say for each state. Wording must match the console.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Alert, ConsoleView, SensorIssue } from "@/lib/eog/alerts";
import type { SiteFacility } from "@/lib/live";
import {
  countdown, labelLifts, labelRows, labelSize, layoutSite, NEUTRAL_FILL, shortName, tankStates, TABLE_M, topFacility,
} from "./model";

function fac(facility_id: string, lat: number, lon: number): SiteFacility {
  const [system_id, , letter] = facility_id.split("_");
  return {
    facility_id, system_id, lat, lon,
    tank_id: `${system_id}_TANK_${letter}`, pump_id: `${system_id}_PUMP_${letter}`,
    capacity_bbl: 500, well_ids: [],
  };
}

const SITE: SiteFacility[] = [
  fac("S1_FACILITY_A", 31.912, -102.34),
  fac("S1_FACILITY_B", 31.835, -102.36),
  fac("S2_FACILITY_A", 32.29, -101.9),
  fac("S3_FACILITY_A", 31.44, -102.85),
  fac("S5_FACILITY_C", 32.13, -102.9),
];

function pumpFailure(facility_id: string, hours: number | null, level?: number): Alert {
  const sys = facility_id.split("_")[0];
  const pump = facility_id.replace("FACILITY", "PUMP");
  return {
    id: `${pump}@1`,
    event: {
      category: "pump_failure", system_id: sys, facility_id, asset_id: pump,
      onset_unix: 1, end_unix: null, status: "ongoing", evidence: ["pump status = 2 (fault)"],
      ...(level === undefined ? {} : { level_pct: level }),
    },
    facility: {} as Alert["facility"],
    hours_to_limit: hours,
    lost_revenue_per_hour: 100,
    action: "Call 1 truck now, 1 trip",
    fix: {
      plan: { cost: 905 } as NonNullable<Alert["fix"]>["plan"],
      label: "truck", headline: "Call 1 truck now, 1 trip", details: [],
      trip_at_unix: null, repair_done_unix: 0, alternatives: [], shares_fleet_with: [], fleet: 2,
    },
    tank_sensor: { state: "ok", evidence: "Within 0.7 pts/h of physics (off 0).", simulated: false },
  };
}

function slowProblem(facility_id: string, category: "pipeline_leak" | "pump_degradation"): Alert {
  const sys = facility_id.split("_")[0];
  const asset = facility_id.replace("FACILITY", category === "pipeline_leak" ? "PIPE" : "PUMP");
  return {
    id: `${asset}@2`,
    event: {
      category, system_id: sys, facility_id, asset_id: asset,
      onset_unix: 2, end_unix: null, status: "ongoing", evidence: ["receive flow below send flow"],
    },
    facility: {} as Alert["facility"],
    hours_to_limit: null,
    lost_revenue_per_hour: 100,
    action: `Send a field inspection to ${asset}.`,
  };
}

function issue(facility_id: string, state: SensorIssue["state"], simulated: boolean, evidence: string): SensorIssue {
  const tank = facility_id.replace("FACILITY", "TANK");
  return { key: `${tank}:level_pct`, asset_id: tank, metric: "level_pct", facility_id, state, evidence, simulated };
}

function view(alerts: Alert[], sensors: SensorIssue[] = []): ConsoleView {
  return { now: 0, alerts, sensors, events: [], totals: { do_nothing: 0, plans: 0 } };
}

const byId = (v: ConsoleView | null, site = SITE) => new Map(tankStates(site, v).map((t) => [t.facility_id, t]));

test("short tank names for labels: system and letter from the ids; other naming kept", () => {
  assert.equal(shortName("S5_FACILITY_C", "S5"), "S5 · C");
  assert.equal(shortName("S12_FACILITY_AB", "S12"), "S12 · AB");
  assert.equal(shortName("NORTH_PAD_7", "EAST"), "EAST · NORTH PAD 7");
});

test("countdown reads like the console", () => {
  assert.equal(countdown(2.052500979878605), "trips in 2h 03m");
  assert.equal(countdown(3.4369790761676815), "trips in 3h 26m");
  assert.equal(countdown(0), "at shutdown now");
  assert.equal(countdown(null), "");
});

test("layout: lat/lon min/max normalized to about a 1 m table, north away from the viewer", () => {
  const { tanks } = layoutSite(SITE);
  assert.equal(tanks.length, SITE.length);
  const xs = tanks.map((t) => t.x), zs = tanks.map((t) => t.z);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  assert.ok(Math.abs(span - TABLE_M) < 1e-9, `largest span ${span} should be ${TABLE_M}`);
  // Centered on the table.
  assert.ok(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2) < 1e-9);
  assert.ok(Math.abs((Math.max(...zs) + Math.min(...zs)) / 2) < 1e-9);
  const at = (id: string) => tanks.find((t) => t.facility_id === id)!;
  assert.ok(at("S2_FACILITY_A").x > at("S5_FACILITY_C").x, "east is +x");
  assert.ok(at("S2_FACILITY_A").z < at("S3_FACILITY_A").z, "north is -z");
});

test("layout: one cluster per system that holds all of its tanks", () => {
  const { tanks, clusters } = layoutSite(SITE);
  assert.deepEqual(clusters.map((c) => c.system_id).sort(), ["S1", "S2", "S3", "S5"]);
  for (const t of tanks) {
    const c = clusters.find((k) => k.system_id === t.system_id)!;
    assert.ok(Math.hypot(t.x - c.x, t.z - c.z) < c.r, `${t.facility_id} inside its cluster`);
  }
});

test("layout: one facility or none does not divide by zero", () => {
  assert.deepEqual(layoutSite([]).tanks, []);
  const one = layoutSite([SITE[0]]).tanks[0];
  assert.equal(one.x, 0);
  assert.equal(one.z, 0);
});

test("pump failure: red PUMP FAILED with countdown, level fill, plan as the fix and what to bring", () => {
  const t = byId(view([pumpFailure("S5_FACILITY_C", 2.052500979878605, 73.47)])).get("S5_FACILITY_C")!;
  assert.equal(t.tone, "alert");
  assert.deepEqual(t.lines, [{ text: "PUMP FAILED · trips in 2h 03m", tone: "alert" }]);
  assert.ok(Math.abs(t.fill! - 0.7347) < 1e-9);
  assert.deepEqual(t.fix, { headline: "Call 1 truck now, 1 trip", cost: 905 });
  assert.ok(t.evidence.some((e) => e.includes("pump status = 2 (fault)")));
  assert.ok(t.bring.some((b) => b.includes("plan") && b.includes("Call 1 truck now, 1 trip")));
  assert.equal(t.name, "S5 Facility C");
});

test("pump failure at the limit says so", () => {
  const t = byId(view([pumpFailure("S5_FACILITY_C", 0, 100)])).get("S5_FACILITY_C")!;
  assert.equal(t.lines[0].text, "PUMP FAILED · at shutdown now");
});

test("lying sensor: amber LYING · SIMULATED first, keeps the PUMP FAILED line, says check the sensor", () => {
  const ev = "Physics says +9.4 pts/h. Sensor says 0. Off for 30 min.";
  const t = byId(view([pumpFailure("S5_FACILITY_C", 2.05, 73.47)], [issue("S5_FACILITY_C", "lying", true, ev)])).get("S5_FACILITY_C")!;
  assert.deepEqual(t.lines[0], { text: "LYING · SIMULATED", tone: "warn" });
  assert.ok(t.lines.some((l) => l.text.startsWith("PUMP FAILED") && l.tone === "alert"));
  assert.equal(t.tone, "alert");
  assert.equal(t.sensor, "warn");
  assert.ok(t.evidence.includes(ev));
  assert.ok(t.bring.some((b) => b.startsWith("Check the sensor on site")));
});

test("dead and drifting sensors on an otherwise fine tank are amber, with neutral fill", () => {
  const v = view([], [
    issue("S1_FACILITY_A", "dead", false, "No reading for 10 min. Last value 61%."),
    issue("S2_FACILITY_A", "drifting", true, "Off from physics by 0.9 pts/h, growing."),
  ]);
  const m = byId(v);
  const dead = m.get("S1_FACILITY_A")!;
  assert.deepEqual(dead.lines, [{ text: "DEAD", tone: "warn" }]);
  assert.equal(dead.tone, "warn");
  assert.equal(dead.fill, null);
  assert.ok(dead.bring.some((b) => b.includes("replacement sensor")));
  const drift = m.get("S2_FACILITY_A")!;
  assert.deepEqual(drift.lines, [{ text: "DRIFTING · SIMULATED", tone: "warn" }]);
});

test("a non-ok tank_sensor on the alert counts when the sensors list has no issue for it", () => {
  const a = pumpFailure("S5_FACILITY_C", 2.05, 73.47);
  a.tank_sensor = { state: "dead", evidence: "No reading for 10 min.", simulated: true };
  const t = byId(view([a])).get("S5_FACILITY_C")!;
  assert.deepEqual(t.lines[0], { text: "DEAD · SIMULATED", tone: "warn" });
});

test("leak and worn pump: amber INSPECT with the inspection as what to bring", () => {
  const m = byId(view([slowProblem("S1_FACILITY_A", "pipeline_leak"), slowProblem("S3_FACILITY_A", "pump_degradation")]));
  for (const id of ["S1_FACILITY_A", "S3_FACILITY_A"]) {
    const t = m.get(id)!;
    assert.equal(t.tone, "warn");
    assert.ok(t.lines[0].text.startsWith("INSPECT"), t.lines[0].text);
    assert.equal(t.lines[0].tone, "warn");
    assert.equal(t.fix, null);
    assert.ok(t.bring.some((b) => b.includes("field inspection")));
  }
});

test("nothing wrong: neutral OK with the neutral fill, one state per facility", () => {
  const states = tankStates(SITE, view([pumpFailure("S5_FACILITY_C", 2.05, 73.47)]));
  assert.equal(states.length, SITE.length);
  const ok = states.filter((t) => t.facility_id !== "S5_FACILITY_C");
  for (const t of ok) {
    assert.deepEqual(t.lines, [{ text: "OK", tone: "ok" }]);
    assert.equal(t.tone, "ok");
    assert.equal(t.fill, null);
  }
  assert.ok(NEUTRAL_FILL > 0 && NEUTRAL_FILL < 1);
});

test("no view yet: no state is claimed", () => {
  const t = byId(null).get("S1_FACILITY_A")!;
  assert.deepEqual(t.lines, [{ text: "NO DATA", tone: "ok" }]);
});

test("short name for labels: system and letter, from the ids alone", () => {
  const t = byId(view([])).get("S5_FACILITY_C")!;
  assert.equal(t.short, "S5 · C");
});

test("the most urgent tank is the console's top fix card, else its top alert, else its top sensor", () => {
  const leak = slowProblem("S1_FACILITY_A", "pipeline_leak");
  assert.equal(topFacility(view([pumpFailure("S5_FACILITY_C", 2.05, 73), leak])), "S5_FACILITY_C");
  assert.equal(topFacility(view([leak])), "S1_FACILITY_A");
  assert.equal(topFacility(view([], [issue("S2_FACILITY_A", "dead", false, "x")])), "S2_FACILITY_A");
  assert.equal(topFacility(view([])), null);
  assert.equal(topFacility(null), null);
});

test("label lifts: close labels stack instead of overlapping; lone labels sit on their tank", () => {
  const site = [fac("S5_FACILITY_B", 32.17, -102.8), fac("S5_FACILITY_C", 32.13, -102.9), fac("S2_FACILITY_A", 32.29, -101.9), fac("S3_FACILITY_A", 31.44, -102.85)];
  const v = view([pumpFailure("S5_FACILITY_C", 2.05, 73), pumpFailure("S5_FACILITY_B", 3.43, 59)]);
  const lifts = labelLifts(layoutSite(site).tanks, tankStates(site, v));
  assert.equal(lifts.size, 4);
  assert.equal(lifts.get("S2_FACILITY_A"), 0);
  assert.equal(lifts.get("S3_FACILITY_A"), 0);
  const b = lifts.get("S5_FACILITY_B")!, c = lifts.get("S5_FACILITY_C")!;
  assert.ok(Math.min(b, c) === 0 && Math.max(b, c) > 0.05, `one of the two close red labels is raised (${b}, ${c})`);
});

test("VR label rows: short name first, a long line breaks after its first ' · ', words unchanged", () => {
  const red = byId(view([pumpFailure("S5_FACILITY_C", 2.052500979878605, 73.47)])).get("S5_FACILITY_C")!;
  assert.deepEqual(labelRows(red), [
    { text: "S5 · C", tone: "name" },
    { text: "PUMP FAILED ·", tone: "alert" },
    { text: "trips in 2h 03m", tone: "alert" },
  ]);
  const ok = byId(view([])).get("S1_FACILITY_A")!;
  assert.deepEqual(labelRows(ok).map((r) => r.text), ["S1 · A", "OK"]);
  const lying = byId(view([], [issue("S1_FACILITY_A", "lying", true, "x")])).get("S1_FACILITY_A")!;
  assert.deepEqual(labelRows(lying).map((r) => r.text), ["S1 · A", "LYING · SIMULATED"]);
  // The box a label takes grows with its rows, and problem labels are wider than OK ones.
  assert.ok(labelSize(red).h > labelSize(ok).h);
  assert.ok(labelSize(red).w > labelSize(ok).w);
});

test("fill: any alert's level_pct on the facility, clamped to 0..1; none reported stays neutral (null)", () => {
  const over = byId(view([pumpFailure("S5_FACILITY_C", 0, 104)])).get("S5_FACILITY_C")!;
  assert.equal(over.fill, 1);
  const none = byId(view([pumpFailure("S5_FACILITY_C", 2.05)])).get("S5_FACILITY_C")!;
  assert.equal(none.fill, null);
});
