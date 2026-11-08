// The three views of /twin as plain numbers: where the site
// goes and where the judge stands in each. Unit-tested in views.test.ts; no three.js, no React.
//
// World frame (WebXR local-floor, as app/twin/stage.ts): meters, y up, north is -z, east is +x.
// Every view starts the judge facing north. A site position is `offset + scale * layout`, where
// layout is layoutSite(facilities, TABLE_M) from model.ts (x east, z south, longest side TABLE_M).
// Only positions scale: models keep their own size (`modelScale`), so a tank is never 100 km tall.
import type { SiteFacility } from "@/lib/live";
import type { ConsoleView } from "@/lib/eog/alerts";
import { layoutSite, TABLE_M, topFacility, type PlacedTank } from "../model";
import { MODEL_CENTER, TANK_H } from "../stage";
import { SIZE, VIEW, type ViewMode } from "../theme";

export type V3 = [number, number, number];
export interface XZ { x: number; z: number }

export const M_PER_DEG = 111_320;        // meters per degree of latitude (equirectangular)
export const OVERVIEW_GAP_M = 1.5;       // overview: the judge stands this far south of the southernmost tank
export const OVERVIEW_TANK_M = 0.5;      // overview: a tank is about knee high
export const HORIZON_M = 600;            // ground: a farther facility is a light this far away, in its real direction
export const EYE_M = 1.6;                // a standing judge's eyes, for the 2D cameras

export interface SiteTransform {
  mode: ViewMode;
  focus: string | null;                  // ground: the facility whose tank is at the world origin
  scale: number;                         // world meters per layout meter
  offset: V3;                            // world position of the layout's origin (the site's middle)
  stand: V3;                             // the judge's feet at the start: the XROrigin position
  faceYaw: number;                       // XROrigin rotation.y at the start; 0 faces north (-z)
  modelScale: number;                    // world size of a life-size model (a SIZE.tankHeight tank) here
}

// The site's longest side in degrees, measured as layoutSite does (longitude times cos of the
// middle latitude). 0 for one facility or none.
export function siteSpanDeg(facilities: readonly SiteFacility[]): number {
  if (facilities.length === 0) return 0;
  const lats = facilities.map((f) => f.lat), lons = facilities.map((f) => f.lon);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  return Math.max((Math.max(...lons) - Math.min(...lons)) * k, Math.max(...lats) - Math.min(...lats));
}

// The facility a view centers on: the one asked for if it exists, else the console's top problem,
// else the first facility (the list arrives sorted by id).
export function pickFocus(facilities: readonly SiteFacility[], wanted: string | null | undefined, view: ConsoleView | null = null): string | null {
  const has = (id: string | null | undefined) => !!id && facilities.some((f) => f.facility_id === id);
  if (has(wanted)) return wanted!;
  const top = topFacility(view);
  if (has(top)) return top;
  return facilities[0]?.facility_id ?? null;
}

// Where the site goes and where the judge stands for one view.
// - table: the existing miniature (1 m, on the table at stage.ts MODEL_CENTER); the judge at the origin.
// - overview: the same layout VIEW.overview.siteMeters wide on the desert floor around the origin;
//   the judge at its south edge, facing north over it.
// - ground: real meters from lat/lon, the focus facility's tank at the origin; the judge
//   SIZE.standOff south of it, facing it.
export function siteTransform(mode: ViewMode, focusFacilityId: string | null, facilities: readonly SiteFacility[]): SiteTransform {
  const { tanks } = layoutSite(facilities, TABLE_M);
  if (mode === "table") {
    return {
      mode, focus: focusFacilityId, scale: 1, offset: [...MODEL_CENTER] as V3, stand: [0, 0, 0], faceYaw: 0,
      modelScale: TANK_H / SIZE.tankHeight,
    };
  }
  if (mode === "overview") {
    const scale = VIEW.overview.siteMeters / TABLE_M;
    const south = tanks.length ? Math.max(...tanks.map((t) => t.z)) * scale : 0;
    return {
      mode, focus: focusFacilityId, scale, offset: [0, 0, 0], stand: [0, 0, south + OVERVIEW_GAP_M], faceYaw: 0,
      modelScale: OVERVIEW_TANK_M / SIZE.tankHeight,
    };
  }
  const focus = pickFocus(facilities, focusFacilityId);
  const scale = (siteSpanDeg(facilities) * M_PER_DEG) / TABLE_M;
  const f = tanks.find((t) => t.facility_id === focus);
  return {
    mode, focus, scale,
    offset: f ? [-f.x * scale, 0, -f.z * scale] : [0, 0, 0],
    stand: [0, 0, SIZE.standOff],
    faceYaw: 0,
    modelScale: 1,
  };
}

// A layout point in this view's world.
export function toWorld(t: SiteTransform, p: XZ): V3 {
  return [t.offset[0] + p.x * t.scale, t.offset[1], t.offset[2] + p.z * t.scale];
}

// Compass bearing from the origin, degrees clockwise from north (0..360).
export function bearingDeg(p: XZ): number {
  const b = (Math.atan2(p.x, -p.z) * 180) / Math.PI;
  return (b + 360) % 360;
}

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export function compass(deg: number): (typeof POINTS)[number] {
  return POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export function distanceText(m: number): string {
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 9950 ? 1 : 0)} km`;
}

export interface GroundPlace {
  facility_id: string;
  real: V3;                              // true position in meters from the focus tank
  at: V3;                                // where to draw it: real, or pulled in to the horizon ring
  distanceM: number;
  bearingDeg: number;
  far: boolean;                          // drawn as a light on the horizon (beyond HORIZON_M)
}

// Ground view: every facility in its real direction. Those farther than `horizonM` are drawn on a
// ring at that distance, so they stay inside the camera's far plane and read as lights on the horizon.
export function groundPlaces(t: SiteTransform, tanks: readonly PlacedTank[], horizonM = HORIZON_M): GroundPlace[] {
  return tanks.map((tank) => {
    const real = toWorld(t, tank);
    const d = Math.hypot(real[0], real[2]);
    const far = d > horizonM;
    const at: V3 = far ? [(real[0] / d) * horizonM, 0, (real[2] / d) * horizonM] : real;
    return { facility_id: tank.facility_id, real, at, distanceM: d, bearingDeg: bearingDeg({ x: real[0], z: real[2] }), far };
  });
}

// A teleport lands inside the pad (a circle of `radius` around the focus tank at the origin), and
// never inside the tank itself.
export function clampToPad(p: XZ, radius: number = SIZE.padRadius, keepOut: number = SIZE.tankDiameter / 2 + 0.8): V3 {
  const d = Math.hypot(p.x, p.z);
  if (d > radius) return [(p.x / d) * radius, 0, (p.z / d) * radius];
  if (d < keepOut) {
    if (d < 1e-6) return [0, 0, keepOut];
    return [(p.x / d) * keepOut, 0, (p.z / d) * keepOut];
  }
  return [p.x, 0, p.z];
}

// The 2D page's camera for a view (no headset): null for the table (TwinCanvas keeps its own start).
// Overview: up and behind the judge's spot, looking over the site with the sky above it. Ground:
// over the judge's shoulder, looking at the tank.
export function camera2D(t: SiteTransform): { position: V3; target: V3 } | null {
  if (t.mode === "table") return null;
  if (t.mode === "overview") {
    // Up and well behind the judge's spot, low enough that the sky and the dusk show over the site.
    const z = t.stand[2];
    return { position: [0, 7.2, z + 10.5], target: [0, 0, z - 9.5] };
  }
  // Over the judge's shoulder: the tank, the pad round it and the horizon behind.
  return { position: [t.stand[0] + 4.5, 3.1, t.stand[2] + 9], target: [0, SIZE.tankHeight * 0.42, 0] };
}
