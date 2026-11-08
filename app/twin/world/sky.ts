// The sky over the desert, as plain numbers (unit-tested in world.test.ts and sky.test.ts): the
// star field, the faint milky band, the rare meteor, how each view mode sets the fog and dims the
// world, and (at the end) skyLook, the sky clock's colors and lights by sun elevation. Directions
// are unit vectors in the World's frame (x east, y up, -z north). The sun and moon positions come
// from clock.ts; MOON_DIR, SUN_DIR and DUSK_DIR are only the defaults before the clock runs.
import type { ViewMode } from "../theme";
import { fbm3, hash3, rng, smoothstep } from "./terrain";

export type V3 = [number, number, number];

const RAD = Math.PI / 180;

// Azimuth clockwise from north, elevation up from the horizon, in degrees.
export function dirFrom(azDeg: number, elDeg: number): V3 {
  const az = azDeg * RAD, el = elDeg * RAD;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)];
}

export function normalize(v: readonly number[]): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]): V3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// The sun went down west-north-west: the dusk glows there, to the judge's front left. The moon
// stands to the front right, high enough to light the tanks from the side.
export const DUSK_AZ_DEG = -62;
export const MOON_AZ_DEG = 48;
export const MOON_EL_DEG = 34;
export const DUSK_DIR = dirFrom(DUSK_AZ_DEG, 0);
export const SUN_DIR = dirFrom(DUSK_AZ_DEG, -9);    // just below the horizon: it lights the moon's west limb
export const MOON_DIR = dirFrom(MOON_AZ_DEG, MOON_EL_DEG);
// The milky band is the great circle around this pole: it rises in the south-west, arches high
// over the north-east and sets in the north-east, crossing the judge's view when they look up.
export const MILKY_POLE = normalize([0.62, 0.42, 0.66]);

// The camera's far plane World needs: the desert's edge is 1 km away.
export const WORLD_FAR = 1600;

// How each view lights the world. The table view is the same desert, a little dimmer, so the
// hologram on the table is the brightest thing in sight. Intensities are three.js physical units
// for a `flat` (no tone mapping) canvas, as /twin uses. padGlow is the faked warm pool at each pad
// (strong where pads are small, weak at life size where the real point lights make the pools).
// fogDim: the fog's color is the sky's horizon times this. The table and the overview fog the
// desert into the horizon within a couple of hundred meters (farther on a clear day), so the floor
// fades into the sky instead of ending in a hard line (the sky, mesas and far rigs ignore the fog).
// moon and hemi now scale the sky clock's lights (moon / 1.7 and hemi / 1.1).
// home: a warm lit pool on the desert round the judge's start (meters; 0 = none), so the first
// thing seen on entering VR is ground, not a black floor; homeGlow its light.
// warmHemi: the hemisphere light's ground color leans to the dusk (a warm under-light).
export interface WorldLook {
  dim: number; fogDim: number; fogNear: number; fogFar: number; moon: number; hemi: number; padGlow: number;
  home: number; homeGlow: number; warmHemi: number;
}
export const LOOK: Record<ViewMode, WorldLook> = {
  table: { dim: 0.8, fogDim: 1, fogNear: 30, fogFar: 230, moon: 1.4, hemi: 1.0, padGlow: 0.5, home: 18, homeGlow: 1, warmHemi: 0.55 },
  overview: { dim: 1, fogDim: 1, fogNear: 34, fogFar: 260, moon: 1.7, hemi: 1.1, padGlow: 0.85, home: 16, homeGlow: 0.8, warmHemi: 0.55 },
  ground: { dim: 1, fogDim: 1, fogNear: 60, fogFar: 760, moon: 1.7, hemi: 1.1, padGlow: 0.2, home: 0, homeGlow: 0, warmHemi: 0 },  // life size: the real lamps light the pad
};

// The faint milky band at a direction: 0..1, clumpy (noise), with a dark rift along its middle,
// fading into the haze near the horizon.
export function milkyGlow(d: readonly number[]): number {
  const off = dot(d, MILKY_POLE);
  const band = Math.exp(-(off * off) / (2 * 0.13 * 0.13));
  if (band < 0.003) return 0;
  const clump = fbm3(d[0] * 3.4 + 9, d[1] * 3.4, d[2] * 3.4 - 4, 4);
  const rift = 1 - 0.55 * Math.exp(-((off - 0.02) ** 2) / (2 * 0.025 * 0.025)) * smoothstep(0.35, 0.65, fbm3(d[0] * 6, d[1] * 6 + 2, d[2] * 6, 3));
  const horizon = smoothstep(0.02, 0.32, d[1]);
  return Math.min(1, band * (0.25 + 1.1 * Math.max(0, clump - 0.3)) * rift * horizon);
}

// About 2500 stars: most scattered over the whole sky, a third crowded into the milky band.
// Brightness is skewed so most stars are faint and a few are bright; a few bright ones twinkle.
export const STAR_COUNT = 2500;
export interface StarField {
  dirs: Float32Array;                   // unit vectors, 3 per star
  size: Float32Array;                   // point size in CSS pixels
  bright: Float32Array;                 // 0..1
  twinkle: Float32Array;                // twinkle rate in rad/s; 0 = steady
  phase: Float32Array;
  tint: Float32Array;                   // 0..1: low = warm, high = blue-white, middle = plain
}

export function starField(n = STAR_COUNT, seed = 7): StarField {
  const rand = rng(seed);
  const f: StarField = {
    dirs: new Float32Array(n * 3), size: new Float32Array(n), bright: new Float32Array(n),
    twinkle: new Float32Array(n), phase: new Float32Array(n), tint: new Float32Array(n),
  };
  const u = normalize(cross(MILKY_POLE, [0, 1, 0]));
  const w = cross(MILKY_POLE, u);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  for (let i = 0; i < n; i++) {
    let d: V3;
    for (;;) {
      if (i % 3 === 0) {
        const a = rand() * Math.PI * 2;
        const off = gauss() * 0.09;
        d = normalize([
          u[0] * Math.cos(a) + w[0] * Math.sin(a) + MILKY_POLE[0] * off,
          u[1] * Math.cos(a) + w[1] * Math.sin(a) + MILKY_POLE[1] * off,
          u[2] * Math.cos(a) + w[2] * Math.sin(a) + MILKY_POLE[2] * off,
        ]);
      } else {
        const y = rand() * 1.04 - 0.04;
        const a = rand() * Math.PI * 2, r = Math.sqrt(1 - y * y);
        d = [r * Math.cos(a), y, r * Math.sin(a)];
      }
      if (d[1] > -0.04) break;
    }
    f.dirs.set(d, i * 3);
    const b = Math.pow(rand(), 3.4);
    f.bright[i] = 0.25 + 0.75 * b;
    f.size[i] = 1.1 + 3.1 * b;
    f.twinkle[i] = b > 0.4 && rand() < 0.25 ? 0.7 + rand() * 1.6 : 0;
    f.phase[i] = rand() * Math.PI * 2;
    f.tint[i] = rand();
  }
  return f;
}

// Meteors: at most one per 17 s window, at a random moment in it, 0.9 s long, high in the sky.
// a is the tail, b the head, i the brightness (0..1). None with reduced motion (the caller
// skips the call).
export const METEOR_WINDOW_S = 17;
export const METEOR_S = 0.9;
export interface Meteor { a: V3; b: V3; i: number }

export function meteorAt(tS: number): Meteor | null {
  const k = Math.floor(tS / METEOR_WINDOW_S);
  if (hash3(k, 3, 9) < 0.25) return null;              // some windows have none
  const start = 2 + hash3(k, 1, 9) * (METEOR_WINDOW_S - 4);
  const p = (tS - k * METEOR_WINDOW_S - start) / METEOR_S;
  if (p < 0 || p > 1) return null;
  const s = dirFrom(hash3(k, 2, 9) * 360, 32 + hash3(k, 4, 9) * 34);
  const east = normalize(cross([0, 1, 0], s));
  const down = cross(s, east);                         // points up along the sky; we go against it
  const tilt = (hash3(k, 5, 9) - 0.5) * 1.2 + (hash3(k, 6, 9) < 0.5 ? 0 : Math.PI);
  const t = normalize([
    east[0] * Math.cos(tilt) - down[0] * 0.45,
    east[1] * Math.cos(tilt) - down[1] * 0.45,
    east[2] * Math.cos(tilt) - down[2] * 0.45,
  ]);
  const L = 0.32;
  const at = (q: number): V3 => normalize([
    s[0] * Math.cos(q) + t[0] * Math.sin(q),
    s[1] * Math.cos(q) + t[1] * Math.sin(q),
    s[2] * Math.cos(q) + t[2] * Math.sin(q),
  ]);
  return { a: at(L * Math.max(0, p - 0.35)), b: at(L * p), i: Math.sin(Math.PI * p) };
}

// ---- The sky clock's look (Sun 06:05): every color and light of the sky as a pure function of the
// sun's elevation in degrees (unit-tested in sky.test.ts). Noon is a clear blue day with a bright
// sun; midnight is a pitch-black sky with stars and a moon; dawn and dusk blend in between. Colors
// are sRGB hex. Light intensities are three.js physical units for the `flat` canvas /twin uses.
export interface SkyLook {
  zenith: string; mid: string; horizon: string;
  glow: string;                       // the warm band on the horizon under the sun (dawn, dusk)
  glowAmt: number;                    // 0..1
  sun: string; sunI: number;          // the sun's directional light (0 below the horizon)
  sunDisc: number;                    // 0..1: how much of the sun's disc shows
  moonI: number;                      // the moon's directional light
  moonDisc: number;                   // 0..1
  hemiSky: string; hemiGround: string; hemiI: number;
  stars: number;                      // 0..1 star and lamp visibility (1 = full night)
  fog: string;                        // the fog: the horizon's color, so the desert fades into it
  ridge: string;                      // the far mesas' tint (multiplies their baked rock color)
}

interface Key extends Omit<SkyLook, "fog"> { el: number }

// Keyframes by sun elevation (degrees), interpolated linearly between neighbours.
const KEYS: Key[] = [
  { el: -18, zenith: "#010207", mid: "#020409", horizon: "#05070d", glow: "#05070d", glowAmt: 0, sun: "#000000", sunI: 0, sunDisc: 0,
    moonI: 0.85, moonDisc: 1, hemiSky: "#2b3550", hemiGround: "#0c0b0a", hemiI: 0.55, stars: 1, ridge: "#0c0e13" },
  { el: -10, zenith: "#03081a", mid: "#081228", horizon: "#141d33", glow: "#2a2230", glowAmt: 0.3, sun: "#000000", sunI: 0, sunDisc: 0,
    moonI: 0.6, moonDisc: 1, hemiSky: "#34405e", hemiGround: "#14110e", hemiI: 0.6, stars: 0.85, ridge: "#1a1e28" },
  { el: -4, zenith: "#0f2149", mid: "#2b4272", horizon: "#6d7088", glow: "#c97a55", glowAmt: 0.75, sun: "#000000", sunI: 0, sunDisc: 0,
    moonI: 0, moonDisc: 0.4, hemiSky: "#56648a", hemiGround: "#2c241c", hemiI: 0.7, stars: 0.25, ridge: "#4b4652" },
  { el: 0, zenith: "#2a508c", mid: "#5a80b8", horizon: "#e1b38c", glow: "#ff9a5a", glowAmt: 0.85, sun: "#ffa25c", sunI: 0.9, sunDisc: 1,
    moonI: 0, moonDisc: 0, hemiSky: "#8ea3c8", hemiGround: "#5e4f3e", hemiI: 0.75, stars: 0.03, ridge: "#9a8278" },
  { el: 6, zenith: "#2f66b0", mid: "#6c9ad0", horizon: "#d9d5cd", glow: "#ffc890", glowAmt: 0.45, sun: "#ffd6a6", sunI: 1.9, sunDisc: 1,
    moonI: 0, moonDisc: 0, hemiSky: "#a9c4e6", hemiGround: "#7a6650", hemiI: 0.85, stars: 0, ridge: "#b3b0b0" },
  { el: 20, zenith: "#2b6cc8", mid: "#5d97de", horizon: "#bcd5ee", glow: "#e8eef5", glowAmt: 0.1, sun: "#fff1dd", sunI: 2.7, sunDisc: 1,
    moonI: 0, moonDisc: 0, hemiSky: "#b5cfee", hemiGround: "#8a7358", hemiI: 0.9, stars: 0, ridge: "#bcc4cf" },
  { el: 45, zenith: "#2366c9", mid: "#4f8fdc", horizon: "#b6d1ee", glow: "#e2ebf6", glowAmt: 0, sun: "#fff8ee", sunI: 3.0, sunDisc: 1,
    moonI: 0, moonDisc: 0, hemiSky: "#bcd4f0", hemiGround: "#927a5d", hemiI: 0.95, stars: 0, ridge: "#c2cad6" },
];

function hexRgb(h: string): V3 {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbHex(c: readonly number[]): string {
  return "#" + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
}
export function mixColor(a: string, b: string, t: number): string {
  const x = hexRgb(a), y = hexRgb(b);
  return rgbHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

// The sky at a sun elevation (degrees, -90..90).
export function skyLook(elDeg: number): SkyLook {
  const el = Math.max(KEYS[0].el, Math.min(KEYS[KEYS.length - 1].el, Number.isFinite(elDeg) ? elDeg : 0));
  let i = 0;
  while (i < KEYS.length - 2 && el > KEYS[i + 1].el) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = Math.max(0, Math.min(1, (el - a.el) / (b.el - a.el)));
  const n = (k: "glowAmt" | "sunI" | "sunDisc" | "moonI" | "moonDisc" | "hemiI" | "stars") => a[k] + (b[k] - a[k]) * t;
  const c = (k: "zenith" | "mid" | "horizon" | "glow" | "sun" | "hemiSky" | "hemiGround" | "ridge") => mixColor(a[k], b[k], t);
  const horizon = c("horizon");
  return {
    zenith: c("zenith"), mid: c("mid"), horizon, glow: c("glow"), glowAmt: n("glowAmt"),
    sun: c("sun"), sunI: n("sunI"), sunDisc: n("sunDisc"), moonI: n("moonI"), moonDisc: n("moonDisc"),
    hemiSky: c("hemiSky"), hemiGround: c("hemiGround"), hemiI: n("hemiI"), stars: n("stars"),
    fog: horizon, ridge: c("ridge"),
  };
}

// Relative luminance (0..1) of an sRGB hex color, for the tests and for picking the key light.
export function luma(h: string): number {
  const [r, g, b] = hexRgb(h).map((x) => {
    const s = x / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
