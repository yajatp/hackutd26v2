// The sky clock: each site's real local time and where the sun stands there (unit-tested in
// clock.test.ts). No slider: the world shows the site's own hour. Pure functions, no DOM.
// Directions are in the World's frame (x east, y up, -z north), as in sky.ts.
import { DEFAULT_SITE_KEY, SITES } from "@/lib/sites";
import type { V3 } from "./sky";

// The site's time zone (the zone map lives here: lib is read-only for the world).
export const SITE_ZONES: Record<string, string> = {
  permian: "America/Chicago",      // Midland
  eagleford: "America/Chicago",    // San Antonio
  dorado: "America/Chicago",       // Laredo
  williston: "America/Chicago",    // Williston
  delaware: "America/Denver",      // Carlsbad
  powder: "America/Denver",        // Casper
};

export interface SitePlace { key: string; zone: string; lat: number; lon: number }

export function sitePlace(key: string | null | undefined): SitePlace {
  const site = SITES.find((s) => s.key === key) ?? SITES.find((s) => s.key === DEFAULT_SITE_KEY) ?? SITES[0];
  return { key: site.key, zone: SITE_ZONES[site.key] ?? "America/Chicago", lat: site.lat, lon: site.lon };
}

// The wall-clock hour (0..24, with minutes as a fraction) in a zone.
export function localHours(date: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "numeric", hourCycle: "h23" })
    .formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}

// "14:05" in the zone.
export function localLabel(date: Date, zone: string): string {
  const t = localHours(date, zone);
  const h = Math.floor(t), m = Math.round((t - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// The UTC offset of a zone at a date, in hours (CST = -6, CDT = -5, MST = -7).
export function zoneOffsetHours(date: Date, zone: string): number {
  const utc = date.getUTCHours() + date.getUTCMinutes() / 60;
  let d = localHours(date, zone) - utc;
  if (d > 12) d -= 24;
  if (d < -12) d += 24;
  return Math.round(d * 4) / 4;
}

const RAD = Math.PI / 180;

export interface SunPos { elDeg: number; azDeg: number; dir: V3 }

// A simple solar model: the declination from the day of the year and the hour angle from the
// apparent solar time (UTC plus longitude / 15 plus the equation of time). Good to a degree.
export function sunAt(date: Date, lat: number, lon: number): SunPos {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = (date.getTime() - start) / 86_400_000;                 // 0 on Jan 1, fractional
  const decl = -23.44 * RAD * Math.cos((2 * Math.PI / 365) * (day + 10));
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const B = (2 * Math.PI / 365) * (day - 80);
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);   // equation of time, minutes
  const solar = utcH + lon / 15 + eot / 60;                         // apparent local solar time
  const H = (solar - 12) * 15 * RAD;                                // hour angle, + after noon
  const phi = lat * RAD;
  const east = -Math.cos(decl) * Math.sin(H);
  const north = Math.sin(decl) * Math.cos(phi) - Math.cos(decl) * Math.cos(H) * Math.sin(phi);
  const up = Math.sin(decl) * Math.sin(phi) + Math.cos(decl) * Math.cos(H) * Math.cos(phi);
  const elDeg = Math.asin(Math.max(-1, Math.min(1, up))) / RAD;
  let azDeg = Math.atan2(east, north) / RAD;
  if (azDeg < 0) azDeg += 360;
  return { elDeg, azDeg, dir: [east, up, -north] };
}

// The date whose wall clock in `zone` reads hh:mm on the same local day as `date` (for the
// `?skyAt=HH:MM` check override and the tests).
export function atLocal(date: Date, zone: string, hh: number, mm = 0): Date {
  const off = zoneOffsetHours(date, zone);
  const now = localHours(date, zone);
  const shift = (hh + mm / 60 - now) * 3_600_000;
  const d = new Date(date.getTime() + shift);
  // A DST change between the two moments moves the wall clock by the offset change.
  const off2 = zoneOffsetHours(d, zone);
  return off2 === off ? d : new Date(d.getTime() - (off2 - off) * 3_600_000);
}

// The moon: opposite the sun's azimuth, high enough to light the site from the side at night.
export function moonFor(sun: SunPos): V3 {
  const az = (sun.azDeg + 180) * RAD;
  const el = Math.min(62, Math.max(24, -sun.elDeg)) * RAD;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)];
}
