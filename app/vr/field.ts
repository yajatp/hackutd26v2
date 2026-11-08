// The /vr field: the site's table exactly as /twin lays it out (layoutSite), seen from where the
// judge stands, drawn as a 1-bit ordered dither in two inks. The pointer is a flashlight on the
// table. A tank whose sensor Phone 1 is faking breaks up. Pure: no DOM, so it is testable.

import type { Tone } from "../twin/model";

export interface FieldTank {
  facility_id: string;
  x: number;              // table meters, east +x (layoutSite)
  z: number;              // table meters, north -z
  tone: Tone;
  faked: boolean;         // Phone 1 is faking this tank's level sensor
  fill: number | null;    // 0..1 when an alert reports the level
}

export interface Cam { W: number; H: number; f: number; horizon: number; camH: number; zc: number }
export interface Point { x: number; z: number }
export interface Inks { night: number; moon: number; alert: number; warn: number }

export const TABLE_R = 0.66;      // a bit wider than the 1 m site, like the twin's round table
const TANK_H = 0.11;
const TANK_R = 0.026;
const TORCH_SIGMA = 0.15;
const RING_R = 0.065;             // the white ring around the console's top problem
const GLITCH_EVERY_MS = 1400;
const GLITCH_FOR_MS = 220;

// The eye stands zc meters south of the table's center, looking down at it: the horizon is just
// above the frame, the table's far rim a third of the way down, its near rim off the bottom edge.
export function camera(W: number, H: number): Cam {
  const zc = 1.35;
  const f = 0.76 * W;
  const horizon = -0.1 * H;
  const camH = (0.86 * H) / f;
  return { W, H, f, horizon, camH, zc };
}

export function project(cam: Cam, x: number, y: number, z: number): { sx: number; sy: number; D: number } {
  const D = cam.zc - z;
  return { sx: cam.W / 2 + (cam.f * x) / D, sy: cam.horizon + (cam.f * (cam.camH - y)) / D, D };
}

// A screen point back onto the table plane (y = 0); null above the horizon.
export function unproject(cam: Cam, sx: number, sy: number): Point | null {
  if (sy <= cam.horizon) return null;
  const D = (cam.f * cam.camH) / (sy - cam.horizon);
  return { x: ((sx - cam.W / 2) * D) / cam.f, z: cam.zc - D };
}

// Where the pointer's light lands: on the table, clamped to its rim.
export function torchAt(cam: Cam, sx: number, sy: number): Point {
  const farEdge = project(cam, 0, 0, -TABLE_R).sy;
  const p = unproject(cam, sx, Math.max(sy, farEdge)) ?? { x: 0, z: 0 };
  const r = Math.hypot(p.x, p.z);
  return r > TABLE_R ? { x: (p.x / r) * TABLE_R, z: (p.z / r) * TABLE_R } : p;
}

// The top of a tank on screen, for its label.
export function tankTop(cam: Cam, t: FieldTank): { sx: number; sy: number } {
  const p = project(cam, t.x, TANK_H, t.z);
  return { sx: p.sx, sy: p.sy - (cam.f * TANK_R * 0.35) / p.D };
}

const BAYER = (() => {
  const m = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
  return Float32Array.from(m, (v) => (v + 0.5) / 64);
})();

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function light(torch: Point, x: number, z: number): number {
  const d2 = (x - torch.x) ** 2 + (z - torch.z) ** 2;
  return Math.exp(-d2 / (2 * TORCH_SIGMA * TORCH_SIGMA));
}

// The glitch is on for GLITCH_FOR_MS of every GLITCH_EVERY_MS; with reduced motion it is one
// frozen frame, so a faked tank still reads as broken without moving.
export function glitchFrame(tMs: number, still: boolean): number | null {
  if (still) return 0;
  const phase = tMs % GLITCH_EVERY_MS;
  return phase < GLITCH_FOR_MS ? Math.floor(tMs / 60) : null;
}

export interface Pad { x: number; z: number; r: number }  // one system's cluster (layoutSite)
export interface FieldScene { tanks: FieldTank[]; pads: Pad[]; top: string | null; torch: Point; tMs: number; still: boolean }

// Fills out (W*H, 0xAABBGGRR) with the dithered frame.
export function renderField(out: Uint32Array, cam: Cam, scene: FieldScene, inks: Inks): void {
  const { W, H } = cam;
  const lum = new Float32Array(W * H);
  const ink = new Uint32Array(W * H).fill(inks.moon);
  const top = scene.tanks.find((t) => t.facility_id === scene.top) ?? null;

  // The table and the dark ground around it.
  for (let y = 0; y < H; y++) {
    const p0 = unproject(cam, 0, y + 0.5);
    if (!p0) continue;
    const D = cam.zc - p0.z;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const wx = ((x + 0.5 - W / 2) * D) / cam.f;
      const wz = p0.z;
      const r = Math.hypot(wx, wz);
      if (r > TABLE_R) continue;
      let v = 0.05 + 0.75 * light(scene.torch, wx, wz);
      for (const p of scene.pads) {
        const d = Math.hypot(wx - p.x, wz - p.z);
        if (d < p.r) v += 0.07;
        if (Math.abs(d - p.r) < 0.004) v = Math.max(v, 0.32);
      }
      if (TABLE_R - r < 0.012) v = Math.max(v, 0.45);
      if (top && Math.abs(Math.hypot(wx - top.x, wz - top.z) - RING_R) < 0.005) v = 1;
      lum[i] = v;
    }
  }

  // Tanks, far to near so nearer ones cover farther ones.
  const frame = glitchFrame(scene.tMs, scene.still);
  const order = [...scene.tanks].sort((a, b) => a.z - b.z);
  for (const t of order) {
    const base = project(cam, t.x, 0, t.z);
    const lid = project(cam, t.x, TANK_H, t.z);
    const hw = Math.max(1.2, (cam.f * TANK_R) / base.D);
    const ry = hw * 0.35;
    const lit = 0.45 + 0.55 * light(scene.torch, t.x, t.z);
    const stateInk = t.tone === "alert" ? inks.alert : t.tone === "warn" ? inks.warn : inks.moon;
    const glow = t.tone === "ok" ? 0 : 0.5;
    const level = t.fill === null ? null : base.sy - (base.sy - lid.sy) * t.fill;
    const y0 = Math.max(0, Math.floor(lid.sy - ry)), y1 = Math.min(H - 1, Math.ceil(base.sy + ry));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      let shift = 0, torn = false;
      if (t.faked && frame !== null) {
        const g = hash(y * 7 + t.x * 1e3, frame);
        if (g < 0.45) shift = Math.round((g / 0.45 - 0.5) * hw * 2.4);
        torn = g > 0.9;
      }
      const x0 = Math.max(0, Math.floor(base.sx - hw) - 4), x1 = Math.min(W - 1, Math.ceil(base.sx + hw) + 4);
      for (let x = x0; x <= x1; x++) {
        const u = (x + 0.5 - shift - base.sx) / hw;
        if (Math.abs(u) > 1) continue;
        const half = Math.sqrt(1 - u * u) * ry;
        let v: number;
        if (yc < lid.sy - half) continue;                        // above the lid
        else if (yc <= lid.sy + half) v = 0.95 * lit;            // the lid
        else if (yc <= base.sy + half) v = (0.35 + 0.65 * Math.sqrt(1 - u * u)) * lit;
        else continue;                                           // below the base
        if (level !== null && Math.abs(yc - (level + half)) < 0.6) v = 1;  // sight glass
        v = Math.max(v, glow * (0.6 + 0.4 * Math.sqrt(1 - u * u)));
        if (torn) v = 1 - v;
        const i = y * W + x;
        lum[i] = v;
        ink[i] = stateInk;
      }
    }
  }

  for (let y = 0; y < H; y++) {
    const row = (y & 7) * 8;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      out[i] = lum[i] > BAYER[row + (x & 7)] ? ink[i] : inks.night;
    }
  }
}

// "#d7dee0" -> 0xAABBGGRR for a little-endian ImageData view.
export function inkOf(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
}
