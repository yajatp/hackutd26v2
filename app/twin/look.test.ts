// Run: npx tsx --test app/twin/look.test.ts
// How the model looks and moves, without a browser: which tanks carry a label, where the
// flashlight rests and how it eases, the eased 30 degree turn, and the faked tank's glitch.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Alert, ConsoleView, SensorIssue } from "@/lib/eog/alerts";
import type { SiteFacility } from "@/lib/live";
import { layoutSite, tankStates, topFacility } from "./model";
import { SNAP_RAD } from "./stage";
import {
  approach, ditherCell, easeTurn, glitchSlices, isFaked, labelVisible, lightRest, lightTarget, topRingPulse, turnGoal, visibleLabels,
  DITHER_CELL_M, HOVER_MS, TOP_RING_PERIOD_S, TURN_MS,
  stateGlow,
} from "./look";

function fac(facility_id: string, lat: number, lon: number): SiteFacility {
  const [system_id, , letter] = facility_id.split("_");
  return { facility_id, system_id, lat, lon, tank_id: `${system_id}_TANK_${letter}`, pump_id: `${system_id}_PUMP_${letter}`, capacity_bbl: 500, well_ids: [] };
}

const SITE: SiteFacility[] = [
  fac("S1_FACILITY_A", 31.912, -102.34),
  fac("S1_FACILITY_B", 31.835, -102.36),
  fac("S2_FACILITY_A", 32.29, -101.9),
  fac("S5_FACILITY_B", 32.17, -102.8),
  fac("S5_FACILITY_C", 32.13, -102.9),
];

function pumpFailure(facility_id: string, hours: number): Alert {
  const sys = facility_id.split("_")[0];
  const pump = facility_id.replace("FACILITY", "PUMP");
  return {
    id: `${pump}@1`,
    event: { category: "pump_failure", system_id: sys, facility_id, asset_id: pump, onset_unix: 1, end_unix: null, status: "ongoing", evidence: ["pump status = 2 (fault)"], level_pct: 70 },
    facility: {} as Alert["facility"],
    hours_to_limit: hours,
    lost_revenue_per_hour: 100,
    action: "Call 1 truck now, 1 trip",
    fix: {
      plan: { cost: 905 } as NonNullable<Alert["fix"]>["plan"],
      label: "truck", headline: "Call 1 truck now, 1 trip", details: [],
      trip_at_unix: null, repair_done_unix: 0, alternatives: [], shares_fleet_with: [], fleet: 2,
    },
  };
}

function lying(facility_id: string): SensorIssue {
  const tank = facility_id.replace("FACILITY", "TANK");
  return { key: `${tank}:level_pct`, asset_id: tank, metric: "level_pct", facility_id, state: "lying", evidence: "Physics says +9.4 pts/h.", simulated: true };
}

const view = (alerts: Alert[], sensors: SensorIssue[] = []): ConsoleView => ({ now: 0, alerts, sensors, events: [], totals: { do_nothing: 0, plans: 0 } });

// The seeded demo: two red pumps in S5, the console's top fix card on S5 Facility C.
const DEMO = view([pumpFailure("S5_FACILITY_C", 2.05), pumpFailure("S5_FACILITY_B", 3.43)]);

test("labels: with nothing hovered or selected, only tanks with a state and the top problem carry one", () => {
  const states = tankStates(SITE, DEMO);
  const top = topFacility(DEMO);
  assert.equal(top, "S5_FACILITY_C");
  const shown = visibleLabels(states, { top, hovered: null, selected: null });
  assert.deepEqual([...shown].sort(), ["S5_FACILITY_B", "S5_FACILITY_C"]);
  // No "OK" label anywhere by default.
  for (const s of states) if (shown.has(s.facility_id)) assert.ok(s.lines.every((l) => l.text !== "OK"), s.facility_id);
});

test("labels: an OK tank carries one only while hovered, selected or the top problem", () => {
  const ok = tankStates(SITE, DEMO).find((s) => s.facility_id === "S1_FACILITY_A")!;
  assert.equal(ok.tone, "ok");
  assert.equal(labelVisible(ok, { top: null, hovered: null, selected: null }), false);
  assert.equal(labelVisible(ok, { top: null, hovered: "S1_FACILITY_A", selected: null }), true);
  assert.equal(labelVisible(ok, { top: null, hovered: null, selected: "S1_FACILITY_A" }), true);
  assert.equal(labelVisible(ok, { top: "S1_FACILITY_A", hovered: null, selected: null }), true);
  assert.equal(labelVisible(ok, { top: "S5_FACILITY_C", hovered: "S1_FACILITY_B", selected: "S2_FACILITY_A" }), false);
  // A sensor issue on an otherwise fine tank is a state: amber, labelled.
  const dead = tankStates(SITE, view([], [{ ...lying("S2_FACILITY_A"), state: "dead", simulated: false }])).find((s) => s.facility_id === "S2_FACILITY_A")!;
  assert.equal(labelVisible(dead, { top: null, hovered: null, selected: null }), true);
  // Before any data arrives nothing claims a state, so nothing is labelled.
  assert.equal(visibleLabels(tankStates(SITE, null), { top: null, hovered: null, selected: null }).size, 0);
});

test("light: with no pointer it rests on the top problem's place on the table", () => {
  const { tanks } = layoutSite(SITE);
  const c = tanks.find((t) => t.facility_id === "S5_FACILITY_C")!;
  const rest = lightRest(tanks, "S5_FACILITY_C");
  assert.deepEqual(rest, { x: c.x, z: c.z });
  assert.deepEqual(lightTarget(null, rest, 0.8), rest);
  assert.deepEqual(lightRest(tanks, null), { x: 0, z: 0 }, "no problem: the middle of the table");
  assert.deepEqual(lightRest(tanks, "NOT_ON_THIS_SITE"), { x: 0, z: 0 });
});

test("light: a pointer on the table moves it there, clamped to the table's edge", () => {
  const rest = { x: 0.3, z: -0.1 };
  assert.deepEqual(lightTarget({ x: 0.1, z: 0.2 }, rest, 0.8), { x: 0.1, z: 0.2 });
  const far = lightTarget({ x: 3, z: 4 }, rest, 0.8);
  assert.ok(Math.abs(Math.hypot(far.x, far.z) - 0.8) < 1e-9, "on the rim");
  assert.ok(Math.abs(far.x / far.z - 3 / 4) < 1e-9, "same direction");
});

test("easing: approach settles 95% of the way in its settle time, whatever the frame rate", () => {
  const one = approach(0, 1, HOVER_MS, HOVER_MS);
  assert.ok(one >= 0.95 && one < 1, `after ${HOVER_MS} ms: ${one}`);
  const halves = approach(approach(0, 1, HOVER_MS / 2, HOVER_MS), 1, HOVER_MS / 2, HOVER_MS);
  assert.ok(Math.abs(halves - one) < 1e-9, "two half frames land where one full frame does");
  assert.equal(approach(0.4, 0.4, 16, HOVER_MS), 0.4);
  assert.equal(approach(0, 1, 16, 0), 1, "no settle time: jump (reduced motion)");
  assert.ok(approach(1, 0, 16, HOVER_MS) < 1 && approach(1, 0, 16, HOVER_MS) > 0, "eases down too");
});

test("snap turn: each 30 degree step eases over about 250 ms and arrives exactly", () => {
  assert.ok(TURN_MS >= 200 && TURN_MS <= 300, `${TURN_MS} ms`);
  const to = turnGoal(0, 1);
  assert.equal(to, SNAP_RAD);
  assert.equal(easeTurn(0, to, 0), 0, "starts where it was");
  const mid = easeTurn(0, to, TURN_MS / 2);
  assert.ok(mid > to / 2 && mid < to, `eases out: past halfway at half time (${mid})`);
  assert.equal(easeTurn(0, to, TURN_MS), to, "arrives at 250 ms");
  assert.equal(easeTurn(0, to, TURN_MS * 3), to, "and stays");
  assert.equal(easeTurn(0, to, 16, 0), to, "no duration: a plain snap (reduced motion)");
  for (let ms = 0; ms < TURN_MS; ms += 10) {
    assert.ok(easeTurn(0, to, ms + 10) >= easeTurn(0, to, ms), "never swings back");
  }
});

test("snap turn: the eased goal is the nearest way round, so 330 to 0 degrees is one step, not eleven", () => {
  assert.ok(Math.abs(turnGoal(11 * SNAP_RAD, 0) - 12 * SNAP_RAD) < 1e-9, "330 -> 360");
  assert.ok(Math.abs(turnGoal(0, 11) - -SNAP_RAD) < 1e-9, "0 -> -30");
  assert.ok(Math.abs(turnGoal(24 * SNAP_RAD, 3) - 27 * SNAP_RAD) < 1e-9, "keeps counting after full turns");
  // Mid-ease, a second push aims at the next step from where the model is now.
  assert.ok(Math.abs(turnGoal(0.7 * SNAP_RAD, 2) - 2 * SNAP_RAD) < 1e-9);
});

test("faked sensor: LYING · SIMULATED (or a fault on the tank) marks the tank as faked", () => {
  const states = tankStates(SITE, view([pumpFailure("S5_FACILITY_C", 2.05)], [lying("S5_FACILITY_C")]));
  const c = states.find((s) => s.facility_id === "S5_FACILITY_C")!;
  assert.equal(c.lines[0].text, "LYING · SIMULATED");
  assert.equal(isFaked(c), true);
  const a = states.find((s) => s.facility_id === "S1_FACILITY_A")!;
  assert.equal(isFaked(a), false);
  assert.equal(isFaked(a, new Set(["S1_TANK_A"])), true, "a fault Phone 1 holds on the tank counts before the console flags it");
});

test("dither cell: 4 mm in the headset; on a screen never under about 3.5 px at the starting view", () => {
  assert.equal(DITHER_CELL_M, 0.004);
  assert.equal(ditherCell(null), DITHER_CELL_M, "VR: the table is a step away, 4 mm cells read");
  // 1440x900, 1280x720, a tall desktop window, and a phone held upright (the camera backs off to 4.6 m).
  for (const [h, d] of [[900, 1.92], [720, 1.92], [1600, 1.92], [844, 4.6]] as const) {
    const cell = ditherCell({ heightPx: h, distanceM: d, fovDeg: 45 });
    const pxPerM = h / (2 * d * Math.tan((45 * Math.PI) / 360));
    assert.ok(cell >= DITHER_CELL_M, `${h} px: ${cell}`);
    assert.ok(cell * pxPerM >= 3.4, `${h} px: a cell is ${cell * pxPerM} px`);
    assert.ok(cell <= 0.016, "never coarse");
    assert.ok(Math.abs(cell * 1000 - Math.round(cell * 1000)) < 1e-9, "whole millimetres, so resizing does not crawl");
  }
});

test("glitch slices: horizontal bands that cover the label, a few shifted, the same for the same frame", () => {
  const s = glitchSlices(7);
  assert.deepEqual(glitchSlices(7), s, "deterministic");
  assert.equal(s[0].top, 0);
  assert.equal(s[s.length - 1].bottom, 100);
  for (let i = 1; i < s.length; i++) assert.equal(s[i].top, s[i - 1].bottom, "no gaps");
  assert.ok(s.every((b) => Math.abs(b.dx) <= 6), "small offsets");
  assert.ok(s.some((b) => b.dx !== 0), "something moves");
  assert.ok(glitchSlices(0).some((b) => b.dx !== 0), "the frozen frame (reduced motion) still reads as broken");
  assert.notDeepEqual(glitchSlices(8), s, "frames differ");
});

test("top problem ring: one slow breath every 2.4 s; still when motion is reduced", () => {
  assert.ok(Math.abs(TOP_RING_PERIOD_S - 2.4) < 0.3);
  const a = topRingPulse(0.3, false), b = topRingPulse(0.3 + TOP_RING_PERIOD_S, false);
  assert.ok(Math.abs(a - b) < 1e-9, "periodic");
  const samples = Array.from({ length: 24 }, (_, i) => topRingPulse((i / 24) * TOP_RING_PERIOD_S, false));
  assert.ok(Math.min(...samples) >= 0 && Math.max(...samples) <= 1);
  assert.ok(Math.max(...samples) - Math.min(...samples) > 0.8, "it breathes");
  assert.equal(topRingPulse(0.3, true), topRingPulse(1.7, true), "frozen");
});

test("state glow: OK shows nothing, warn holds, alert breathes at 1 Hz and holds when still", () => {
  assert.deepEqual(stateGlow("ok", 0.3, false), { tint: 0, pillar: 0 });
  assert.deepEqual(stateGlow("warn", 0.3, false), stateGlow("warn", 0.8, false));
  const a = [0, 0.25, 0.5, 0.75].map((t) => stateGlow("alert", t, false).pillar);
  assert.ok(Math.max(...a) <= 0.45 + 1e-9 && Math.min(...a) >= 0.25 - 1e-9 && Math.max(...a) - Math.min(...a) > 0.15);
  assert.ok(Math.abs(stateGlow("alert", 0.1, false).pillar - stateGlow("alert", 1.1, false).pillar) < 1e-9, "1 Hz");
  assert.deepEqual(stateGlow("alert", 0.1, true), stateGlow("alert", 0.6, true));
  assert.ok(stateGlow("alert", 0.25, false).tint >= 0.46);
});
