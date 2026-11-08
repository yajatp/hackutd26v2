// The US map on the table, as plain numbers: app/map's Albers frame (read-only import) scaled onto
// the tabletop, the state outlines as one line geometry and one land geometry (one draw call
// each), and where each site's label stands so neighbours never cover each other.
// Unit-tested in geo.test.ts.
import { ShapeUtils, Vector2 } from "three";
import { H, project, W, type Geometry } from "@/app/map/projection";
import { TURNTABLE_R } from "../stage";

// The map's width on the table in meters. Its corners stay inside the round tabletop.
export const MAP_W = 1.3;
export const MAP_D = (MAP_W * H) / W;
const K = MAP_W / W;

// lon/lat -> table meters around the table center: x east, z south (north points away from the
// judge, who faces -z).
export function toTable(lon: number, lat: number): [number, number] {
  const [fx, fy] = project(lon, lat);
  return [(fx - W / 2) * K, (fy - H / 2) * K];
}

export function fitsTable(): boolean {
  return Math.hypot(MAP_W / 2, MAP_D / 2) < TURNTABLE_R;
}

type Ring = readonly (readonly number[])[];

// Points closer than `step` meters to the last kept one are dropped.
function ringPoints(ring: Ring, step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = toTable(ring[i][0], ring[i][1]);
    const last = out[out.length - 1];
    if (last && i < ring.length - 1 && Math.abs(p[0] - last[0]) < step && Math.abs(p[1] - last[1]) < step) continue;
    out.push(p);
  }
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) out.pop();
  }
  return out;
}

// Every state border as line segments (x, y=0, z), and the land as triangles, for one
// LineSegments and one Mesh. `step` thins the 20m outline file to what the table can show.
export function outlineGeometry(geoms: readonly Geometry[], step = 0.0025): { lines: Float32Array; tris: Float32Array } {
  const lines: number[] = [];
  const tris: number[] = [];
  for (const g of geoms) {
    const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as Ring[][];
    for (const rings of polys) {
      const pts = rings.map((r) => ringPoints(r, step)).filter((r) => r.length >= 3);
      if (pts.length === 0) continue;
      for (const r of pts) {
        for (let i = 0; i < r.length; i++) {
          const a = r[i], b = r[(i + 1) % r.length];
          lines.push(a[0], 0, a[1], b[0], 0, b[1]);
        }
      }
      const contour = pts[0].map(([x, z]) => new Vector2(x, z));
      const holes = pts.slice(1).map((r) => r.map(([x, z]) => new Vector2(x, z)));
      const all = [contour, ...holes].flat();
      for (const [i, j, k] of ShapeUtils.triangulateShape(contour, holes)) {
        for (const v of [all[i], all[j], all[k]]) tris.push(v.x, 0, v.y);
      }
    }
  }
  return { lines: new Float32Array(lines), tris: new Float32Array(tris) };
}

// Where each site's label sits: in two rows off the map's edges, so close sites (Midland and
// Carlsbad, San Antonio and Laredo) never cover each other and the labels never cover the land.
// Sites in the south half get a row just past the map's near (south) edge, lying back toward the
// judge; the north half a row along the far (north) edge, standing up. In each row the labels keep
// the markers' west-to-east order, `gap` apart, centred on the markers and kept on the map's width.
// A leader line runs from each marker to its label.
export interface LabelSpot { key: string; row: "near" | "far"; x: number; z: number }

// `wFar`: the far row's label width (it is farther from the judge, so drawn larger).
export function labelSpots(points: readonly { key: string; x: number; z: number }[], w: number, gap = 0.015, wFar = w): LabelSpot[] {
  const out: LabelSpot[] = [];
  for (const row of ["near", "far"] as const) {
    const pts = points.filter((p) => (row === "near" ? p.z >= 0 : p.z < 0)).sort((a, b) => a.x - b.x);
    if (pts.length === 0) continue;
    const lw = row === "near" ? w : wFar;
    const step = lw + gap;
    const span = step * (pts.length - 1);
    const mean = pts.reduce((t, p) => t + p.x, 0) / pts.length;
    const lim = Math.max(0, MAP_W / 2 - lw / 2 - span / 2);
    const x0 = Math.max(-lim, Math.min(lim, mean)) - span / 2;
    const z = row === "near" ? MAP_D / 2 + 0.07 : -MAP_D / 2 - 0.01;
    pts.forEach((p, i) => out.push({ key: p.key, row, x: x0 + i * step, z }));
  }
  return out;
}
