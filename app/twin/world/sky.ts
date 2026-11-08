// The night over the desert, as plain numbers (unit-tested in world.test.ts): where the moon and
// the dusk are, the star field, the faint milky band, the rare meteor, and how each view mode
// sets the fog and the light. Directions are unit vectors in the World's frame (x east, y up,
// -z north). Colors are not here: they come from ../theme.ts.
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
// desert into the violet horizon within a couple of hundred meters, so the floor fades into the
// sky instead of ending in a hard dark line (the sky, mesas and far rigs ignore the fog).
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
