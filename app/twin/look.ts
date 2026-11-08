// How the model looks and moves, as plain numbers and rules (unit-tested in look.test.ts).
// The palette is docs/DESIGN.md's night page: two inks, night and moonlight, with red and amber
// only for a tank's state. The motion is small and quick, and only answers the judge or the data.
import type { PlacedTank, TankState } from "./model";
import { SNAP_RAD } from "./stage";

export const NIGHT = "#102231";        // background and fog
export const TABLE_INK = "#0c1b27";    // the table top, a shade under the night
export const MOON = "#d7dee0";         // lines and text
export const DUST = "#8fa1aa";         // secondary text; OK tanks
export const RED = "#ef4444";          // pump failed
export const AMBER = "#f59e0b";        // a sensor to check, a place to inspect

// The table's dither: a 4 mm cell, lit by a soft pool around the light point (as on /vr).
export const DITHER_CELL_M = 0.004;
export const LIGHT_SIGMA_M = 0.15;
const MIN_CELL_PX = 3.5;

// The dither cell for this view. In the headset (null) the table is a step away and 4 mm cells
// are about 4 px. On a screen the whole table is in view from about 2 m, where 4 mm would be under
// 2 px and the dither would blur into grey; there a cell is at least MIN_CELL_PX at the starting
// view, in whole millimetres so a resize does not make the pattern crawl.
export function ditherCell(view: { heightPx: number; distanceM: number; fovDeg: number } | null): number {
  if (!view) return DITHER_CELL_M;
  const pxPerM = view.heightPx / (2 * view.distanceM * Math.tan((view.fovDeg * Math.PI) / 360));
  const mm = Math.ceil((MIN_CELL_PX / pxPerM) * 1000);
  return Math.min(16, Math.max(DITHER_CELL_M * 1000, mm)) / 1000;
}

export const HOVER_LIFT_M = 0.006;     // a hovered tank rises 6 mm
export const HOVER_MS = 150;
export const LIGHT_MS = 220;           // the light point settles on its target
export const PANEL_MS = 220;           // the info panel eases in
export const PANEL_SLIDE_M = 0.04;     // ... from 4 cm off its place
export const TURN_MS = 250;            // one 30 degree step of the model
export const TOP_RING_PERIOD_S = 2.4;  // the top problem's ring breathes this slowly

export interface Pt { x: number; z: number }
export interface Focus { top: string | null; hovered: string | null; selected: string | null }

// A label only where there is something to say: a tank with a state (red or amber), the console's
// top problem, and the tank the judge points at or opened. No "OK" labels on a quiet site.
export function labelVisible(s: Pick<TankState, "facility_id" | "tone" | "sensor">, f: Focus): boolean {
  return s.tone !== "ok" || s.sensor !== null
    || s.facility_id === f.top || s.facility_id === f.hovered || s.facility_id === f.selected;
}

export function visibleLabels(states: Iterable<TankState>, f: Focus): Set<string> {
  const out = new Set<string>();
  for (const s of states) if (labelVisible(s, f)) out.add(s.facility_id);
  return out;
}

// Phone 1 is faking this tank's sensor: the console says SIMULATED, or a fault sits on the tank
// (the fault row can land a moment before the console flags it).
export function isFaked(s: TankState, faultAssets: ReadonlySet<string> = new Set()): boolean {
  return faultAssets.has(s.tank_id) || s.lines.some((l) => l.text.includes("SIMULATED"));
}

// Where the light rests when nobody points: on the console's top problem, else the table's middle.
export function lightRest(tanks: readonly PlacedTank[], top: string | null): Pt {
  const t = top ? tanks.find((x) => x.facility_id === top) : undefined;
  return t ? { x: t.x, z: t.z } : { x: 0, z: 0 };
}

// Where the light heads: the pointer's spot on the table (kept on the table), else its rest.
export function lightTarget(pointer: Pt | null, rest: Pt, radius: number): Pt {
  if (!pointer) return rest;
  const r = Math.hypot(pointer.x, pointer.z);
  return r > radius ? { x: (pointer.x / r) * radius, z: (pointer.z / r) * radius } : pointer;
}

// Frame-rate independent easing: 95% of the way to `target` after `settleMs`.
// settleMs 0 jumps straight there (reduced motion).
export function approach(current: number, target: number, dtMs: number, settleMs: number): number {
  if (settleMs <= 0) return target;
  return target + (current - target) * Math.exp((-3 * dtMs) / settleMs);
}

// The model's angle for `turn` steps, taken the nearest way round from where it is now, so the
// step from 330 degrees to 0 turns 30 degrees, not back through 300.
export function turnGoal(currentRad: number, turn: number): number {
  const base = turn * SNAP_RAD;
  const k = Math.round((currentRad - base) / (2 * Math.PI));
  return base + k * 2 * Math.PI;
}

// One eased snap turn: ease-out cubic from `fromRad` to `toRad`, arriving at `durationMs`.
export function easeTurn(fromRad: number, toRad: number, elapsedMs: number, durationMs = TURN_MS): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return toRad;
  const t = Math.max(0, elapsedMs / durationMs);
  return fromRad + (toRad - fromRad) * (1 - (1 - t) ** 3);
}

// The top problem's ring: 0..1, one slow breath per period; frozen at full with reduced motion.
export function topRingPulse(tS: number, still: boolean): number {
  if (still) return 1;
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * tS) / TOP_RING_PERIOD_S);
}

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// A glitched label for one glitch frame (glitchFrame in app/vr/field.ts): horizontal bands in
// percent of its height, some pushed sideways by up to maxPx. Same frame, same picture.
export function glitchSlices(frame: number, n = 6, maxPx = 6): { top: number; bottom: number; dx: number }[] {
  const cuts = [0];
  for (let i = 1; i < n; i++) cuts.push(Math.round(((i + (hash(frame, i) - 0.5) * 0.8) / n) * 100));
  cuts.push(100);
  const out: { top: number; bottom: number; dx: number }[] = [];
  for (let i = 0; i < n; i++) {
    const g = hash(frame + 31, i * 7 + 3);
    const dx = g < 0.5 ? Math.round((g / 0.5 - 0.5) * 2 * maxPx) : 0;
    out.push({ top: cuts[i], bottom: cuts[i + 1], dx });
  }
  if (out.every((b) => b.dx === 0)) out[Math.floor(hash(frame, 99) * n)].dx = maxPx;
  return out;
}

// How strongly a miniature tank shows its state (TankModel's shell tint and light pillar, table and
// overview): OK shows neither; warn holds steady; alert breathes at 1 Hz (pillar 0.25..0.45).
// `still` (reduced motion, comfort) holds alert steady too: the color stays, the pulse goes.
export function stateGlow(tone: "ok" | "warn" | "alert", t: number, still: boolean): { tint: number; pillar: number } {
  if (tone === "ok") return { tint: 0, pillar: 0 };
  if (tone === "warn" || still) return { tint: 0.5, pillar: 0.35 };
  const p = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI);
  return { tint: 0.46 + 0.16 * p, pillar: 0.25 + 0.2 * p };
}
