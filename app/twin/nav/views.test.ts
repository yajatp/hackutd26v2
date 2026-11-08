// Run: npx tsx --test app/twin/nav/views.test.ts
// Where the site goes and where the judge stands in each of the three views.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SiteFacility } from "@/lib/live";
import { layoutSite, TABLE_M } from "../model";
import { MODEL_CENTER } from "../stage";
import { SIZE, VIEW } from "../theme";
import {
  bearingDeg, camera2D, clampToPad, compass, distanceText, groundPlaces, HORIZON_M, M_PER_DEG, OVERVIEW_GAP_M,
  pickFocus, siteSpanDeg, siteTransform, toWorld,
} from "./views";

function fac(facility_id: string, lat: number, lon: number): SiteFacility {
  const [system_id, , letter] = facility_id.split("_");
  return {
    facility_id, system_id, lat, lon,
    tank_id: `${system_id}_TANK_${letter}`, pump_id: `${system_id}_PUMP_${letter}`, capacity_bbl: 500, well_ids: [],
  };
}

// The real Permian site's coordinates (eog-data network.json), a subset.
const SITE: SiteFacility[] = [
  fac("S1_FACILITY_A", 31.912, -102.34),
  fac("S1_FACILITY_B", 31.835, -102.36),
  fac("S2_FACILITY_A", 32.29, -101.9),
  fac("S3_FACILITY_A", 31.44, -102.85),
  fac("S5_FACILITY_A", 32.25, -102.9),
  fac("S5_FACILITY_C", 32.13, -102.9),
];
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

test("table: the existing 1 m layout on the table, the judge at the origin facing north", () => {
  const t = siteTransform("table", null, SITE);
  assert.equal(t.scale, 1);
  assert.deepEqual(t.offset, [...MODEL_CENTER]);
  assert.deepEqual(t.stand, [0, 0, 0]);
  assert.equal(t.faceYaw, 0);
  // Same positions as TwinCanvas draws today: layout point + MODEL_CENTER.
  const { tanks } = layoutSite(SITE, TABLE_M);
  const w = toWorld(t, tanks[0]);
  assert.ok(near(w[0], MODEL_CENTER[0] + tanks[0].x) && near(w[2], MODEL_CENTER[2] + tanks[0].z));
  assert.ok(t.modelScale > 0 && t.modelScale < 0.05, "a 6 m tank becomes a few cm on the table");
});

test("overview: the site VIEW.overview.siteMeters wide on the ground, the judge just south of it", () => {
  const t = siteTransform("overview", null, SITE);
  const { tanks } = layoutSite(SITE, TABLE_M);
  const pts = tanks.map((k) => toWorld(t, k));
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[2]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  assert.ok(near(span, VIEW.overview.siteMeters), `site span ${span}`);
  assert.ok(pts.every((p) => p[1] === 0), "on the desert floor");
  assert.ok(near(t.stand[2], Math.max(...zs) + OVERVIEW_GAP_M), "south edge plus the gap");
  assert.ok(pts.every((p) => p[2] < t.stand[2]), "every tank is north of (in front of) the judge");
  assert.equal(t.faceYaw, 0);
  assert.ok(near(t.modelScale * SIZE.tankHeight, 0.5), "a tank about knee high");
});

test("ground: real meters, the focus tank at the origin, the judge standOff south of it", () => {
  const t = siteTransform("ground", "S5_FACILITY_C", SITE);
  assert.equal(t.focus, "S5_FACILITY_C");
  assert.equal(t.modelScale, 1);
  const { tanks } = layoutSite(SITE, TABLE_M);
  const at = (id: string) => toWorld(t, tanks.find((k) => k.facility_id === id)!);
  const c = at("S5_FACILITY_C");
  assert.ok(near(c[0], 0) && near(c[2], 0), "focus tank at the origin");
  assert.deepEqual(t.stand, [0, 0, SIZE.standOff]);
  assert.equal(t.faceYaw, 0, "facing north, at the tank");
  // S5 A is 0.12 deg of latitude due north of S5 C: about 13.4 km, straight ahead (-z).
  const a = at("S5_FACILITY_A");
  assert.ok(near(a[0], 0, 1e-6), "same longitude: straight north");
  assert.ok(near(-a[2], 0.12 * M_PER_DEG, 1), `north distance ${-a[2]}`);
  // East-west distances shrink by cos(latitude) (equirectangular).
  const k = Math.cos(((31.44 + 32.29) / 2) * Math.PI / 180);
  const s1a = at("S1_FACILITY_A");
  assert.ok(near(s1a[0], (-102.34 - -102.9) * k * M_PER_DEG, 1), `east distance ${s1a[0]}`);
});

test("ground: an unknown or missing focus falls back to the first facility", () => {
  assert.equal(siteTransform("ground", "NOPE", SITE).focus, "S1_FACILITY_A");
  assert.equal(siteTransform("ground", null, SITE).focus, "S1_FACILITY_A");
  const empty = siteTransform("ground", null, []);
  assert.equal(empty.focus, null);
  assert.deepEqual(empty.offset, [0, 0, 0]);
});

test("pickFocus: asked-for, then the console's top problem, then the first", () => {
  const view = {
    now: 0, sensors: [], events: [], totals: { do_nothing: 0, plans: 0 },
    alerts: [{ id: "x", event: { facility_id: "S2_FACILITY_A" }, fix: {} }],
  } as unknown as Parameters<typeof pickFocus>[2];
  assert.equal(pickFocus(SITE, "S3_FACILITY_A", view), "S3_FACILITY_A");
  assert.equal(pickFocus(SITE, null, view), "S2_FACILITY_A");
  assert.equal(pickFocus(SITE, null, null), "S1_FACILITY_A");
  assert.equal(pickFocus([], "S3_FACILITY_A", view), null);
});

test("one facility: no division by zero in any view", () => {
  for (const mode of ["table", "overview", "ground"] as const) {
    const t = siteTransform(mode, null, [SITE[0]]);
    for (const v of [t.scale, ...t.offset, ...t.stand]) assert.ok(Number.isFinite(v), `${mode} finite`);
  }
  assert.equal(siteSpanDeg([SITE[0]]), 0);
});

test("ground places: near facilities where they are, far ones on the horizon in their real direction", () => {
  const t = siteTransform("ground", "S5_FACILITY_C", SITE);
  const places = groundPlaces(t, layoutSite(SITE, TABLE_M).tanks);
  const self = places.find((p) => p.facility_id === "S5_FACILITY_C")!;
  assert.equal(self.far, false);
  assert.ok(self.distanceM < 1e-6);
  const s2 = places.find((p) => p.facility_id === "S2_FACILITY_A")!;
  assert.ok(s2.far, "S2 is ~95 km away");
  assert.ok(near(Math.hypot(s2.at[0], s2.at[2]), HORIZON_M, 1e-6), "pulled in to the horizon ring");
  // Same direction as the real position.
  assert.ok(near(Math.atan2(s2.at[0], s2.at[2]), Math.atan2(s2.real[0], s2.real[2]), 1e-9));
  // 1.0 deg of longitude east (x cos 31.9 deg) and 0.16 deg north: about 79 deg, east.
  assert.ok(near(s2.bearingDeg, (Math.atan2(1.0 * Math.cos((31.865 * Math.PI) / 180), 0.16) * 180) / Math.PI, 0.01), `bearing ${s2.bearingDeg}`);
  assert.equal(compass(s2.bearingDeg), "E");
});

test("bearings, compass points and distances read the way a person says them", () => {
  assert.ok(near(bearingDeg({ x: 0, z: -1 }), 0));
  assert.ok(near(bearingDeg({ x: 1, z: 0 }), 90));
  assert.ok(near(bearingDeg({ x: 0, z: 1 }), 180));
  assert.ok(near(bearingDeg({ x: -1, z: 0 }), 270));
  assert.equal(compass(359), "N");
  assert.equal(compass(44), "NE");
  assert.equal(compass(-90), "W");
  assert.equal(distanceText(8), "10 m");
  assert.equal(distanceText(340), "340 m");
  assert.equal(distanceText(8400), "8.4 km");
  assert.equal(distanceText(95_200), "95 km");
});

test("teleports land on the pad and never inside the tank", () => {
  const r = SIZE.padRadius;
  assert.deepEqual(clampToPad({ x: 3, z: 5 }), [3, 0, 5]);
  const out = clampToPad({ x: 0, z: 50 });
  assert.ok(near(out[2], r) && out[0] === 0, "pulled back to the pad's edge");
  const inside = clampToPad({ x: 0.5, z: 0 });
  assert.ok(Math.hypot(inside[0], inside[2]) > SIZE.tankDiameter / 2, "pushed out of the tank");
  const center = clampToPad({ x: 0, z: 0 });
  assert.ok(center[2] > SIZE.tankDiameter / 2, "dead center goes south of the tank");
});

test("2D cameras: overview looks over the site from behind the judge; ground over the judge's shoulder at the tank", () => {
  assert.equal(camera2D(siteTransform("table", null, SITE)), null);
  const o = camera2D(siteTransform("overview", null, SITE))!;
  assert.ok(o.position[1] > 3 && o.position[2] > o.target[2]);
  // Low enough that the horizon (and the sky) is in a 55 degree view: pitch under 27 degrees.
  const pitch = Math.atan2(o.position[1] - o.target[1], o.position[2] - o.target[2]);
  assert.ok(pitch < (27 * Math.PI) / 180, `overview pitch ${(pitch * 180) / Math.PI}`);
  const g = camera2D(siteTransform("ground", "S5_FACILITY_C", SITE))!;
  assert.ok(g.position[2] > SIZE.standOff, "behind the judge's spot");
  assert.ok(g.position[1] > 1.6 && g.position[1] < 4, "a little above the judge's eyes");
  assert.deepEqual([g.target[0], g.target[2]], [0, 0]);
});
