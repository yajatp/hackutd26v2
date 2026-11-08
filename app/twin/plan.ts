// Where the Permian Night site stands in each view, as plain numbers (unit-tested in plan.test.ts).
// No three.js, no React. The views themselves (scale, offset, where the judge stands) are
// nav/views.ts siteTransform; this file places the models, pipes, flares, labels, the VR info
// panel and the attack effects inside them.
//
// Frames: "world" is WebXR local-floor (x east, y up, -z north, meters, the judge's start at the
// origin). The "site root" is the group that turns with the thumbstick in the table view: it sits
// at the table's middle (stage.ts MODEL_CENTER) in the table view and at the world origin in the
// others. "Model space" is the site root divided by the view's modelScale, so a life-size model
// (a 6 m tank) drawn there comes out at the view's size.
import type { Cluster, PlacedTank } from "./model";
import type { SiteTransform, V3, XZ } from "./nav/views";
import { HORIZON_M, bearingDeg, compass, distanceText, toWorld } from "./nav/views";
import { SIZE, type ViewMode } from "./theme";

export type { V3, XZ };

// Per view: how the miniature is dressed. Sizes in model meters unless marked world meters.
//   jackR: a facility's pumpjacks stand this far from its tank, on the side away from its system's
//          centre (so neighbours in a system never share ground); jackScale: their size against
//          the tank (a miniature's pumpjack is smaller than life so it fits beside the tank);
//   beaconM / waveM / labelK: the attack beacon's height and the shockwave's reach in world
//          meters, and how much bigger than on the table a label is drawn.
//   pillarM: the state pillar's height over a non-OK tank's roof, world meters (0: none);
//   wallK: the shockwave's wall of light, as a share of its reach.
export const MINI = {
  table: { jackR: 3.4, jackScale: 0.42, pipeR: 0.16, beaconM: 0.1, waveM: 0.65, labelK: 1, pillarM: 0.25, wallK: 0.18 },
  overview: { jackR: 5.6, jackScale: 0.5, pipeR: 0.2, beaconM: 0.24, waveM: 4.5, labelK: 6.5, pillarM: 3, wallK: 0.12 },
  ground: { jackR: 0, jackScale: 1, pipeR: 0.15, beaconM: 0.6, waveM: 18, labelK: 10, pillarM: 0, wallK: 0.07 },
} as const satisfies Record<ViewMode, { jackR: number; jackScale: number; pipeR: number; beaconM: number; waveM: number; labelK: number; pillarM: number; wallK: number }>;

export const TANK_TOP_M = 6.0;             // TankModel's roof edge (models/geometry.ts TANK.top)
export const TANK_R_M = SIZE.tankDiameter / 2;
export const MARKER_R = 27;                // ground: other facilities' markers ring the pad this far out
export const MARKER_Y = 4.2;               // ... their sign's bottom edge this high (over the pad's kit)
export const MARKER_K = 26;                // ... drawn this much bigger than a table label (read from 20-35 m)
export const FAR_FLARE_M = HORIZON_M - 40; // ground: the system's flare on the horizon, inside the far plane

// The table view's backdrop: one facility at life size, BACKDROP_M out on the desert and
// BACKDROP_DEG to the left of the judge's start (north), turned so its pump house and pumpjacks
// face the table.
export const BACKDROP_M = 34;
export const BACKDROP_DEG = 32;
export const BACKDROP = {
  at: [-Math.sin((BACKDROP_DEG * Math.PI) / 180) * BACKDROP_M, 0, -Math.cos((BACKDROP_DEG * Math.PI) / 180) * BACKDROP_M] as V3,
  yaw: (-60 * Math.PI) / 180,
};

// The site root's place in the world: the table's middle in the table view, else the origin.
export function siteRoot(t: SiteTransform): V3 {
  return t.mode === "table" ? [t.offset[0], t.offset[1], t.offset[2]] : [0, 0, 0];
}

// A layout point (model.ts layoutSite) in the site root's frame.
export function sitePos(t: SiteTransform, p: XZ): V3 {
  const w = toWorld(t, p), r = siteRoot(t);
  return [w[0] - r[0], 0, w[2] - r[2]];
}

// The same point in model space (site root / modelScale).
export function modelPos(t: SiteTransform, p: XZ): XZ {
  const s = sitePos(t, p);
  return { x: s[0] / t.modelScale, z: s[2] / t.modelScale };
}

export interface MiniJack { facility_id: string; x: number; z: number; yaw: number; phase: number }

// A facility's pumpjacks in a miniature: n units on an arc `r` from the tank, centred on the side
// away from its system's middle, each side-on to the tank (its beam along the arc), so the nod reads
// from the table's edge. Positions in model space; yaw is rotation.y (the unit's +x is its wellhead).
export function miniJacks(facility_id: string, at: XZ, centre: XZ, n: number, r: number): MiniJack[] {
  if (n <= 0) return [];
  const dx = at.x - centre.x, dz = at.z - centre.z;
  const away = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dz, dx) : -Math.PI / 2;   // alone: to the north
  const step = Math.min(0.8, 2.6 / Math.max(1, n));
  const out: MiniJack[] = [];
  for (let i = 0; i < n; i++) {
    const th = away + (i - (n - 1) / 2) * step;
    const flip = i % 2 === 1 ? Math.PI : 0;
    out.push({
      facility_id,
      x: at.x + r * Math.cos(th),
      z: at.z + r * Math.sin(th),
      yaw: Math.PI / 2 - th + flip,
      phase: (hashId(facility_id) + i * 0.381966) % 1,
    });
  }
  return out;
}

// A stable 0..1 from an id, so a facility's units always nod in the same order.
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

// A miniature's pipeline: from the tank's side toward its system's middle, at pipe height, stopping
// short of the flare skid there. Model space. null when the tank is (nearly) at the middle.
export function miniPipe(at: XZ, centre: XZ, y = 0.4): V3[] | null {
  const dx = centre.x - at.x, dz = centre.z - at.z;
  const d = Math.hypot(dx, dz);
  const start = TANK_R_M + 0.35, stop = 2.2;
  if (d < start + stop + 0.5) return null;
  const ux = dx / d, uz = dz / d;
  return [
    [at.x + ux * start, y, at.z + uz * start],
    [centre.x - ux * stop, y, centre.z - uz * stop],
  ];
}

// The pointer target round each miniature tank: as generous as the nearest neighbour allows (under
// half the closest gap, so it never takes the ray from the tank next door), in model meters.
export function hitRadius(tanks: readonly XZ[], cap: number): number {
  let gap = Infinity;
  for (let i = 0; i < tanks.length; i++) {
    for (let j = i + 1; j < tanks.length; j++) gap = Math.min(gap, Math.hypot(tanks[i].x - tanks[j].x, tanks[i].z - tanks[j].z));
  }
  return Math.max(TANK_R_M, Math.min(cap, gap * 0.45));
}

export interface Marker {
  facility_id: string;
  at: V3;                // world: where the marker floats, on a ring round the pad, in the real direction
  light: V3;             // world: where its light sits on the horizon (or its real place when near)
  bearing: string;       // "NE"
  distance: string;      // "8.2 km"
}

// Ground view: every other facility as a light on the horizon in its real direction, and a marker
// on a ring just outside the pad that the judge can point at (the words would be unreadable 600 m
// away). The focus facility's tank is at the world origin (views.ts).
export function groundMarkers(t: SiteTransform, tanks: readonly PlacedTank[]): Marker[] {
  const out: Marker[] = [];
  for (const tank of tanks) {
    if (tank.facility_id === t.focus) continue;
    const w = toWorld(t, tank);
    const d = Math.hypot(w[0], w[2]);
    if (d < 1e-6) continue;
    const ux = w[0] / d, uz = w[2] / d;
    const far = Math.min(d, HORIZON_M);
    out.push({
      facility_id: tank.facility_id,
      at: [ux * MARKER_R, MARKER_Y, uz * MARKER_R],
      light: [ux * far, 0, uz * far],
      bearing: compass(bearingDeg({ x: w[0], z: w[2] })),
      distance: distanceText(d),
    });
  }
  return out;
}

// Ground view: the focus facility's system — its flare on the horizon (or in place when near) and
// the pipeline from the pad's east edge out toward it. Heights follow the dunes through `ground`.
export function groundSystem(t: SiteTransform, clusters: readonly Cluster[], tanks: readonly PlacedTank[], ground: (x: number, z: number) => number = () => 0):
  { flare: V3; pipe: V3[] } | null {
  const me = tanks.find((x) => x.facility_id === t.focus);
  const c = me ? clusters.find((x) => x.system_id === me.system_id) : undefined;
  if (!me || !c) return null;
  const w = toWorld(t, c);
  const d = Math.hypot(w[0], w[2]);
  const ux = d > 1e-6 ? w[0] / d : 1, uz = d > 1e-6 ? w[2] / d : 0;
  const reach = Math.min(d, FAR_FLARE_M);
  const flare: V3 = [ux * reach, ground(ux * reach, uz * reach), uz * reach];
  // Off the pad east (the transfer line's end, models/pad.ts TRANSFER), then out toward the flare.
  const exit: V3 = [SIZE.padRadius - 0.6, 0.5, -2.2];
  const turn: V3 = [SIZE.padRadius + 4, 0.5, -2.2];
  const pipe: V3[] = [exit, turn];
  const end = Math.max(0, reach - 12);
  const from = Math.hypot(turn[0], turn[2]);
  for (let s = from + 14; s < end; s += 24) {
    const x = ux * s, z = uz * s;
    pipe.push([x, ground(x, z) + 0.5, z]);
  }
  if (end > from + 4) pipe.push([ux * end, ground(ux * end, uz * end) + 0.5, uz * end]);
  return { flare, pipe };
}

// The VR info panel, beside the selected tank and facing the judge (table and overview): along the
// line from the judge's head toward the tank, `ahead` meters out, turned aside by enough to clear
// the tank, at a height between the eyes and the tank's top. It goes on the side away from the
// site's middle (`centre`), so it covers the open table or desert, not the rest of the site; with
// no centre, to the right. Its scale grows with that distance so its words keep their size.
export const PANEL_W = 0.5;                // world meters at scale 1
export const PANEL_BASE_M = 0.9;           // the distance its texture was sized for
export function besidePose(head: V3, tankTop: V3, centre?: V3): { at: V3; scale: number; side: 1 | -1 } {
  let dx = tankTop[0] - head[0], dz = tankTop[2] - head[2];
  let d = Math.hypot(dx, dz);
  if (d < 0.05) { dx = 0; dz = -1; d = 1; }
  const fx = dx / d, fz = dz / d;
  let rx = -fz, rz = fx;                   // the judge's right, looking at the tank
  let dir: 1 | -1 = 1;
  if (centre && (centre[0] - head[0]) * rx + (centre[2] - head[2]) * rz > 0.02 * d) {
    rx = -rx; rz = -rz; dir = -1;          // the middle is to the right: go left
  }
  const ahead = Math.min(1.3, Math.max(0.7, d * 0.72));
  const scale = ahead / PANEL_BASE_M;
  const side = (PANEL_W * scale) / 2 + 0.07 * scale;
  const k = Math.min(1, ahead / d);
  const y = head[1] + (tankTop[1] - head[1]) * k + 0.1 * scale;
  return { at: [head[0] + fx * ahead + rx * side, y, head[2] + fz * ahead + rz * side], scale, side: dir };
}

// Ground view: in front of the judge, a little to the right and below the eyes.
export function frontPose(head: V3, yaw: number, ahead = 1.0, right = 0.24, down = 0.1): V3 {
  // yaw is the judge's heading as rotation.y: 0 looks north (-z).
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return [head[0] + fx * ahead + rx * right, head[1] - down, head[2] + fz * ahead + rz * right];
}

// Teleport: where the XR origin must go so the judge's head lands on `hit`. The library's own
// answer (hit minus the head's offset from the origin) ignores the origin's turn; with the origin
// turned by `yaw` (rotation.y: the snap turn in the overview and Walk views) the offset turns too.
export function landing(hit: XZ, head: XZ, yaw: number): XZ {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: hit.x - (head.x * c + head.z * s), z: hit.z - (-head.x * s + head.z * c) };
}

// The teleport arc (Walk view): a thrown point from the controller along `dir` at `speed` m/s,
// falling under `g`, until it meets the ground at `groundY`. Returns `n` points along it (world
// meters) and where it lands; no landing (aimed from under the ground) gives hit null.
export function teleportArc(from: V3, dir: V3, speed = 10, g = 9.8, groundY = 0, n = 24): { points: V3[]; hit: V3 | null } {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const vx = (dir[0] / len) * speed, vy = (dir[1] / len) * speed, vz = (dir[2] / len) * speed;
  const h = from[1] - groundY;
  if (h < 0) return { points: [], hit: null };
  const T = (vy + Math.sqrt(vy * vy + 2 * g * h)) / g;
  const points: V3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (T * i) / (n - 1);
    points.push([from[0] + vx * t, from[1] + vy * t - 0.5 * g * t * t, from[2] + vz * t]);
  }
  const hit: V3 = [from[0] + vx * T, groundY, from[2] + vz * T];
  points[n - 1] = hit;
  return { points, hit };
}

// The VR info panel in the table view: beside the table, never over its top. The judge looks down
// at the table, so the panel stands a little under eye level (RIM_DROP_M), above the line of sight
// to the far rim, RIM_AHEAD_M from the eyes, turned off the line from the eyes to the table's middle
// to about the table's own edge as the eyes see it (at least RIM_AZ_DEG), on the selected tank's side.
export const RIM_AZ_DEG = 30;
export const RIM_AHEAD_M = 0.95;
export const RIM_DROP_M = 0.06;
export function rimPose(head: V3, centre: V3, tankTop: V3, tableR: number): { at: V3; scale: number; side: 1 | -1 } {
  let fx = centre[0] - head[0], fz = centre[2] - head[2];
  const d = Math.hypot(fx, fz) || 1;
  fx /= d; fz /= d;
  const rx = -fz, rz = fx;                                   // the judge's right, facing the table
  const side: 1 | -1 = (tankTop[0] - head[0]) * rx + (tankTop[2] - head[2]) * rz >= 0 ? 1 : -1;
  const edge = Math.asin(Math.min(1, tableR / d)) - (3.5 * Math.PI) / 180;
  const az = Math.min((48 * Math.PI) / 180, Math.max((RIM_AZ_DEG * Math.PI) / 180, edge));
  const c = Math.cos(az), s = Math.sin(az) * side;
  const dx = fx * c + rx * s, dz = fz * c + rz * s;
  return { at: [head[0] + dx * RIM_AHEAD_M, head[1] - RIM_DROP_M, head[2] + dz * RIM_AHEAD_M], scale: RIM_AHEAD_M / PANEL_BASE_M, side };
}

// The VR info panel in the overview: the tanks stand all round the judge on the desert, so a panel
// "beside the tank" can land far off to the side, half out of a Quest's view. Instead it stands
// OVERVIEW_AHEAD_M out, a little under the eyes, just beside the tank's bearing on the side toward
// the judge's (lazily followed) heading `yaw`, and never more than OVERVIEW_MAX_DEG off that heading.
// `side` 1: the panel is to the tank's right (its leader leaves from the panel's left edge).
export const OVERVIEW_AHEAD_M = 1.0;
export const OVERVIEW_MAX_DEG = 24;
export function overviewPose(head: V3, yaw: number, tankTop: V3): { at: V3; scale: number; side: 1 | -1 } {
  const scale = OVERVIEW_AHEAD_M / PANEL_BASE_M;
  const tankYaw = Math.atan2(-(tankTop[0] - head[0]), -(tankTop[2] - head[2]));
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const off = wrap(tankYaw - yaw);                           // > 0: the tank is to the left
  const side: 1 | -1 = off >= 0 ? 1 : -1;                    // the panel goes toward the heading
  const half = Math.atan((PANEL_W * scale) / 2 / OVERVIEW_AHEAD_M) + 0.06;
  const max = (OVERVIEW_MAX_DEG * Math.PI) / 180;
  const want = wrap(tankYaw - side * half - yaw);
  const py = yaw + Math.max(-max, Math.min(max, want));
  return {
    at: [head[0] - Math.sin(py) * OVERVIEW_AHEAD_M, head[1] - 0.12, head[2] - Math.cos(py) * OVERVIEW_AHEAD_M],
    scale, side,
  };
}
