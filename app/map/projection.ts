// Albers equal-area conic for the contiguous US, written out (no d3): standard parallels 29.5 N
// and 45.5 N, origin 38 N 98 W, on a unit sphere, then fitted into a fixed W x H frame. The frame
// is SVG space: x to the east, y down. Pure, so app/map/projection.test.ts runs it in Node.

export const W = 1000;
export const H = 620;

const RAD = Math.PI / 180;
const PHI1 = 29.5 * RAD;
const PHI2 = 45.5 * RAD;
const PHI0 = 38 * RAD;
const LAM0 = -98 * RAD;
const N = (Math.sin(PHI1) + Math.sin(PHI2)) / 2;
const C = Math.cos(PHI1) ** 2 + 2 * N * Math.sin(PHI1);
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(PHI0)) / N;

// Unit sphere, y grows to the north.
export function albers(lon: number, lat: number): [number, number] {
  const rho = Math.sqrt(C - 2 * N * Math.sin(lat * RAD)) / N;
  const theta = N * (lon * RAD - LAM0);
  return [rho * Math.sin(theta), RHO0 - rho * Math.cos(theta)];
}

// The lower 48's extreme points (Cape Flattery, Cape Mendocino, Point Loma, the Northwest Angle,
// Maine's north tip and West Quoddy Head, Key West, the Rio Grande mouth). The frame fits them
// with a margin, so markers and outlines agree before the outline file has loaded.
const EXTREMES: [number, number][] = [
  [-124.73, 48.38], [-124.41, 40.44], [-117.24, 32.67], [-95.15, 49.38],
  [-69.23, 47.46], [-66.95, 44.81], [-81.8, 24.55], [-97.15, 25.96],
];
const PAD = 22;

const FIT = (() => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [lon, lat] of EXTREMES) {
    const [x, y] = albers(lon, lat);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const s = Math.min((W - 2 * PAD) / (x1 - x0), (H - 2 * PAD) / (y1 - y0));
  return { s, ox: (W - s * (x1 - x0)) / 2 - s * x0, oy: (H - s * (y1 - y0)) / 2 + s * y1 };
})();

// lon/lat (degrees) -> frame (x east, y down).
export function project(lon: number, lat: number): [number, number] {
  const [x, y] = albers(lon, lat);
  return [FIT.ox + FIT.s * x, FIT.oy - FIT.s * y];
}

type Ring = readonly (readonly number[])[];
export interface Geometry { type: "Polygon" | "MultiPolygon"; coordinates: Ring[] | Ring[][] }

// One SVG path for a GeoJSON polygon or multipolygon. Points closer than `minStep` frame units to
// the last kept one are dropped (the 20m file is finer than the screen at the US view).
export function pathOf(g: Geometry, minStep = 0.12): string {
  const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as Ring[][];
  let d = "";
  for (const rings of polys) {
    for (const ring of rings) {
      let px = NaN, py = NaN, n = 0;
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = project(ring[i][0], ring[i][1]);
        const last = i === ring.length - 1;
        if (n > 0 && !last && Math.abs(x - px) < minStep && Math.abs(y - py) < minStep) continue;
        d += `${n === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
        px = x; py = y; n++;
      }
      if (n) d += "Z";
    }
  }
  return d;
}

// An ellipse on the ground (centre, semi-axes in degrees, rotation in degrees counter-clockwise
// from east), projected: the soft basin shapes. Approximate extents, for orientation only.
export function ellipsePath(lon: number, lat: number, a: number, b: number, rotDeg = 0, steps = 48): string {
  const r = rotDeg * RAD;
  let d = "";
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const ex = a * Math.cos(t), ey = b * Math.sin(t);
    const [x, y] = project(lon + ex * Math.cos(r) - ey * Math.sin(r), lat + ex * Math.sin(r) + ey * Math.cos(r));
    d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d + "Z";
}
