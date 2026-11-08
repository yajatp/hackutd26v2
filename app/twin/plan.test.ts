// Run: npx tsx --test app/twin/plan.test.ts
// Where the site's models, pipes, flares, markers and the VR info panel stand in each view.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SiteFacility } from "@/lib/live";
import { layoutSite } from "./model";
import { MODEL_CENTER, TURNTABLE_R } from "./stage";
import { siteTransform } from "./nav/views";
import {
  BACKDROP, BACKDROP_M, besidePose, frontPose, landing, groundMarkers, groundSystem, hashId, hitRadius, MARKER_R, miniJacks, miniPipe, MINI,
  modelPos, OVERVIEW_AHEAD_M, OVERVIEW_MAX_DEG, overviewPose, PANEL_W, RIM_AZ_DEG, RIM_DROP_M, rimPose, siteRoot, sitePos, TANK_R_M, teleportArc,
} from "./plan";
import { SIZE } from "./theme";

const f = (id: string, sys: string, lat: number, lon: number, wells = 3): SiteFacility => ({
  facility_id: id, system_id: sys, lat, lon, tank_id: id + "_T", pump_id: id + "_P", capacity_bbl: 1000,
  well_ids: Array.from({ length: wells }, (_, i) => `${id}_W${i}`),
});
// Two systems about 100 km apart, facilities about 8 km from their system's middle (as the seeded site).
const SITE = [
  f("S1_FACILITY_A", "S1", 31.91, -102.34), f("S1_FACILITY_B", "S1", 31.80, -102.27), f("S1_FACILITY_C", "S1", 31.86, -102.22),
  f("S2_FACILITY_A", "S2", 32.30, -101.80), f("S2_FACILITY_B", "S2", 32.20, -101.88, 1),
];
const { tanks, clusters } = layoutSite(SITE);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

test("table: the site root is the table's middle and the layout sits on it unscaled", () => {
  const t = siteTransform("table", null, SITE);
  assert.deepEqual(siteRoot(t), MODEL_CENTER);
  const p = sitePos(t, tanks[0]);
  assert.ok(Math.abs(p[0] - tanks[0].x) < 1e-9 && Math.abs(p[2] - tanks[0].z) < 1e-9);
  const m = modelPos(t, tanks[0]);
  assert.ok(Math.abs(m.x * t.modelScale - tanks[0].x) < 1e-9, "model space is the site root / modelScale");
});

test("overview and ground: the site root is the world origin; ground puts the focus tank there", () => {
  const o = siteTransform("overview", null, SITE);
  assert.deepEqual(siteRoot(o), [0, 0, 0]);
  const g = siteTransform("ground", "S1_FACILITY_B", SITE);
  const p = sitePos(g, tanks.find((x) => x.facility_id === "S1_FACILITY_B")!);
  assert.ok(Math.hypot(p[0], p[2]) < 1e-6, `focus tank at ${p}`);
});

test("miniature pumpjacks: one per well, clear of the tank, on the side away from the system's middle", () => {
  for (const mode of ["table", "overview"] as const) {
    const t = siteTransform(mode, null, SITE);
    for (const tank of tanks) {
      const c = clusters.find((x) => x.system_id === tank.system_id)!;
      const at = modelPos(t, tank), centre = modelPos(t, c);
      const n = SITE.find((x) => x.facility_id === tank.facility_id)!.well_ids.length;
      const jacks = miniJacks(tank.facility_id, at, centre, n, MINI[mode].jackR);
      assert.equal(jacks.length, n);
      for (const j of jacks) {
        const r = dist(j, at);
        // A unit's footprint reaches about 1.15 m (x jackScale) inward from its samson post.
        assert.ok(r - 1.3 * MINI[mode].jackScale > TANK_R_M, `${mode} ${tank.facility_id}: jack ${r.toFixed(2)} m from the tank`);
        if (dist(at, centre) > 1) assert.ok(dist(j, centre) > dist(at, centre) - 0.5, "on the far side from the system's middle");
      }
    }
  }
});

test("miniature pumpjacks: neighbours' units never stand on each other (seeded spacing)", () => {
  for (const mode of ["table", "overview"] as const) {
    const t = siteTransform(mode, null, SITE);
    const all = tanks.flatMap((tank) => {
      const c = clusters.find((x) => x.system_id === tank.system_id)!;
      return miniJacks(tank.facility_id, modelPos(t, tank), modelPos(t, c), 3, MINI[mode].jackR);
    });
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (all[i].facility_id === all[j].facility_id) continue;
        assert.ok(dist(all[i], all[j]) > 4 * MINI[mode].jackScale, `${mode}: ${all[i].facility_id} and ${all[j].facility_id} units overlap`);
      }
    }
  }
});

test("a pipe runs from the tank's side toward its system's middle, and none for a tank at the middle", () => {
  const p = miniPipe({ x: 0, z: 0 }, { x: 10, z: 0 })!;
  assert.ok(p[0][0] > TANK_R_M && p[1][0] < 10 && p[1][0] > p[0][0]);
  assert.equal(miniPipe({ x: 0, z: 0 }, { x: 0.5, z: 0 }), null);
});

test("the pointer target is generous but under half the closest gap", () => {
  const r = hitRadius([{ x: 0, z: 0 }, { x: 5, z: 0 }], 3);
  assert.ok(r <= 2.25 + 1e-9 && r >= TANK_R_M);
  assert.equal(hitRadius([{ x: 0, z: 0 }], 3), 3);
});

test("ground: other facilities are markers just outside the pad and lights in their real direction", () => {
  const g = siteTransform("ground", "S1_FACILITY_A", SITE);
  const ms = groundMarkers(g, tanks);
  assert.equal(ms.length, SITE.length - 1);
  for (const m of ms) {
    assert.ok(Math.abs(Math.hypot(m.at[0], m.at[2]) - MARKER_R) < 1e-6);
    assert.ok(Math.hypot(m.light[0], m.light[2]) <= 600 + 1e-6);
    // Same direction for the marker and its light.
    const a = Math.atan2(m.at[2], m.at[0]), b = Math.atan2(m.light[2], m.light[0]);
    assert.ok(Math.abs(a - b) < 1e-9);
    assert.match(m.distance, /km|m/);
  }
  const s1b = ms.find((m) => m.facility_id === "S1_FACILITY_B")!;
  assert.ok(["SE", "S", "E"].includes(s1b.bearing), `S1 B is south-east of S1 A, got ${s1b.bearing}`);
});

test("ground: the system's flare sits toward its middle, inside the far plane, and the pipeline heads there", () => {
  const g = siteTransform("ground", "S1_FACILITY_A", SITE);
  const sys = groundSystem(g, clusters, tanks)!;
  const d = Math.hypot(sys.flare[0], sys.flare[2]);
  assert.ok(d > 100 && d < 600, `flare ${d} m away`);
  const last = sys.pipe[sys.pipe.length - 1];
  const cosAngle = (last[0] * sys.flare[0] + last[2] * sys.flare[2]) / (Math.hypot(last[0], last[2]) * d);
  assert.ok(cosAngle > 0.99, "the pipeline ends toward the flare");
  assert.ok(sys.pipe.length >= 3);
  const withDunes = groundSystem(g, clusters, tanks, () => 2)!;
  assert.ok(withDunes.pipe.slice(2).every((p) => Math.abs(p[1] - 2.5) < 1e-9), "pipe rides the dunes");
});

test("the info panel sits beside the tank, nearer than it, to the judge's right, sized for its distance", () => {
  const head: [number, number, number] = [0, 1.6, 0];
  const near = besidePose(head, [0, 0.9, -1.2]);
  assert.ok(near.at[0] > 0, "to the right of a tank straight ahead");
  assert.ok(near.at[2] < 0 && near.at[2] > -1.2, "between the judge and the tank");
  assert.ok(near.at[1] < 1.6 && near.at[1] > 0.9);
  // Its inner edge clears the line of sight to the tank.
  const ahead = -near.at[2];
  const inner = near.at[0] - (PANEL_W * near.scale) / 2;
  assert.ok(inner > 0.03 * ahead, `inner edge ${inner}`);
  const far = besidePose(head, [6, 0.5, -10]);
  assert.ok(Math.hypot(far.at[0], far.at[2]) <= 1.3 + PANEL_W, "far tanks: the panel comes to a readable distance");
  assert.ok(far.scale > near.scale);
  // A tank to the east: the panel's "right" is south of the line of sight.
  const east = besidePose(head, [1, 0.9, 0]);
  assert.ok(east.at[2] > 0 && east.at[0] > 0);
  // The site's middle straight ahead: a tank on its left gets the panel on its left (over open
  // ground, not over the site); a tank on its right, on its right.
  const middle: [number, number, number] = [0, 0.8, -1.2];
  const left = besidePose(head, [-0.35, 0.88, -1.5], middle);
  assert.equal(left.side, -1);
  assert.ok(left.at[0] < -0.35 * (Math.hypot(left.at[0], left.at[2]) / Math.hypot(0.35, 1.5)), "left of the line to the tank");
  const right = besidePose(head, [0.35, 0.88, -1.5], middle);
  assert.equal(right.side, 1);
  assert.ok(right.at[0] > 0.2);
});

test("ground: the panel is in front of the judge whichever way they face", () => {
  const p = frontPose([0, 1.6, 8], 0);
  assert.ok(p[2] < 8 && Math.abs(p[2] - 7) < 1e-9 && p[0] > 0, `north: ${p}`);
  const e = frontPose([0, 1.6, 0], -Math.PI / 2);   // turned right: facing east
  assert.ok(e[0] > 0.9 && e[2] > 0, `east: ${e}`);
});

test("hashId is stable and in 0..1", () => {
  assert.equal(hashId("S5_FACILITY_C"), hashId("S5_FACILITY_C"));
  for (const id of ["a", "S1_FACILITY_A", ""]) assert.ok(hashId(id) >= 0 && hashId(id) < 1);
});

test("teleport lands the head on the spot, also after a snap turn", () => {
  const head = { x: 0.3, z: -0.2 };                 // the head's offset from the origin, origin frame
  for (const yaw of [0, Math.PI / 6, -Math.PI / 2, 2]) {
    const o = landing({ x: 4, z: -3 }, head, yaw);
    // Where the head ends up: origin + the offset turned by yaw (three.js rotation.y).
    const hx = o.x + head.x * Math.cos(yaw) + head.z * Math.sin(yaw);
    const hz = o.z - head.x * Math.sin(yaw) + head.z * Math.cos(yaw);
    assert.ok(Math.abs(hx - 4) < 1e-9 && Math.abs(hz + 3) < 1e-9, `yaw ${yaw}: head at ${hx},${hz}`);
  }
});

test("teleport arc: from the controller down to the ground, farther for a higher aim, none from under the floor", () => {
  const level = teleportArc([0, 1.2, 0], [0, 0, -1]);
  assert.ok(level.hit && Math.abs(level.hit[1]) < 1e-9);
  assert.equal(level.points.length, 24);
  assert.deepEqual(level.points[0], [0, 1.2, 0]);
  assert.deepEqual(level.points[23], level.hit);
  const d0 = -level.hit![2];
  assert.ok(d0 > 3 && d0 < 6, `a level aim lands ${d0.toFixed(2)} m ahead`);
  const up = teleportArc([0, 1.2, 0], [0, 1, -1]).hit!;
  assert.ok(-up[2] > d0 * 2 && -up[2] < SIZE.padRadius, `45 degrees up lands ${(-up[2]).toFixed(1)} m out, inside the pad`);
  const down = teleportArc([0, 1.2, 0], [0, -1, -1]).hit!;
  assert.ok(-down[2] > 0 && -down[2] < d0, "aimed down: near the feet");
  for (const p of level.points) assert.ok(p[1] >= -1e-9, "the arc never dips under the ground");
  assert.equal(teleportArc([0, -0.1, 0], [0, 0, -1]).hit, null);
});

test("the table view's panel stands beside the table at about eye level, on the tank's side, never over the top", () => {
  const head: [number, number, number] = [0, 1.6, 0];
  const centre: [number, number, number] = [...MODEL_CENTER];
  for (const tankX of [-0.3, 0.3]) {
    const tank: [number, number, number] = [tankX, 0.9, MODEL_CENTER[2]];
    const p = rimPose(head, centre, tank, TURNTABLE_R);
    assert.equal(p.side, tankX > 0 ? 1 : -1, "on the tank's side");
    assert.ok(Math.sign(p.at[0]) === Math.sign(tankX));
    assert.ok(Math.abs(p.at[1] - (1.6 - RIM_DROP_M)) < 1e-9, "a little under eye level");
    const az = (Math.atan2(Math.abs(p.at[0]), -p.at[2]) * 180) / Math.PI;
    assert.ok(az >= RIM_AZ_DEG - 1e-6 && az <= 48 + 1e-6, `${az.toFixed(1)} degrees off the table's middle`);
    // The panel's bottom edge stays above the line of sight to the table's far rim.
    const dist = Math.hypot(p.at[0], p.at[2]);
    const bottom = p.at[1] - 0.3 * p.scale;                   // the tallest panel is about 0.6 m
    const farRim = -MODEL_CENTER[2] + TURNTABLE_R;
    const sightAtPanel = 1.6 - ((1.6 - MODEL_CENTER[1]) * dist) / farRim;
    assert.ok(bottom > sightAtPanel - 0.12, `bottom ${bottom.toFixed(2)} vs sight line ${sightAtPanel.toFixed(2)}`);
  }
});

test("table: the miniature reads across the room; the attack wave crosses the whole table", () => {
  assert.ok(MINI.table.waveM >= TURNTABLE_R * 0.8, "the wave reaches across the table");
  assert.ok(MINI.table.beaconM >= 0.1 && MINI.table.pillarM >= 0.2 && MINI.table.wallK > 0.07);
  assert.ok(MINI.overview.pillarM > MINI.table.pillarM && MINI.ground.pillarM === 0);
});

test("the table view's backdrop facility stands well out on the desert to the front left", () => {
  const [x, , z] = BACKDROP.at;
  assert.ok(Math.abs(Math.hypot(x, z) - BACKDROP_M) < 1e-9);
  assert.ok(x < 0 && z < 0, "front left");
  assert.ok(BACKDROP_M - SIZE.padRadius > 10, "its pad ends well clear of the table");
});

test("the overview's panel stays in view beside the tank's bearing, toward the judge's heading", () => {
  const head: [number, number, number] = [0, 1.6, 0];
  const deg = (p: { at: number[] }) => (Math.atan2(-p.at[0], -p.at[2]) * 180) / Math.PI;   // yaw, + is left
  for (const [tx, tz] of [[-6, -4], [5, -6], [0, -8], [-9, 2]]) {
    const tank: [number, number, number] = [tx, 0.5, tz];
    const p = overviewPose(head, 0, tank);
    assert.ok(Math.abs(Math.hypot(p.at[0], p.at[2]) - OVERVIEW_AHEAD_M) < 1e-9);
    assert.ok(Math.abs(deg(p)) <= OVERVIEW_MAX_DEG + 1e-6, `${tx},${tz}: ${deg(p).toFixed(1)} degrees off the heading`);
    const tankDeg = (Math.atan2(-tx, -tz) * 180) / Math.PI;
    if (Math.abs(tankDeg) < OVERVIEW_MAX_DEG) assert.ok(Math.abs(deg(p) - tankDeg) > 10, "never over the tank itself");
    assert.equal(p.side, tankDeg >= 0 ? 1 : -1);
  }
  // Turned to face a tank on the left: the panel follows the heading.
  const left = overviewPose(head, Math.PI / 2, [-8, 0.5, 0]);
  assert.ok(left.at[0] < -0.8, "the panel is out to the left, in front of the turned judge");
  assert.ok(PANEL_W * left.scale < 0.6);
});
