// Where everything stands in the headset, in meters from the judge's feet at the moment VR starts
// (WebXR local-floor: y is up, the judge faces -z). Plain numbers, unit-tested in stage.test.ts.
// Built for a first-time VR user: they stand still in front of a table, nothing is behind them or
// under the floor, and the thumbstick turns the model (never the judge).
import { TABLE_M, type Tone } from "./model";

export type P3 = [number, number, number];

export const TABLE_TOP_Y = 0.8;          // table height
export const TANK_R = 0.022;
export const TANK_H = 0.08;

// A round tabletop that turns. layoutSite fits any site into a TABLE_M square centered on the
// table, so no tank is farther than half that square's diagonal from the center, whatever the
// site and whatever the rotation.
export const TURNTABLE_R = TABLE_M * Math.SQRT1_2 + TANK_R + 0.06;
export const NEAR_EDGE_M = 0.45;         // gap between the judge and the table's near edge
export const MODEL_CENTER: P3 = [0, TABLE_TOP_Y, -(NEAR_EDGE_M + TURNTABLE_R)];

// Table coordinates (x east, z south, y up from the tabletop) turned by `turn` radians about the
// model center, as three.js rotation.y does, to world coordinates.
export function toWorld(x: number, y: number, z: number, turn: number): P3 {
  const c = Math.cos(turn), s = Math.sin(turn);
  return [MODEL_CENTER[0] + x * c + z * s, MODEL_CENTER[1] + y, MODEL_CENTER[2] - x * s + z * c];
}

// Thumbstick: one push past PUSH is one 30 degree step of the model; it fires again only after
// the stick comes back inside REARM. No smooth turning and no player movement.
export const SNAP_RAD = Math.PI / 6;
const PUSH = 0.6;
const REARM = 0.3;

export function snapTurn(x: number, armed: boolean): { step: -1 | 0 | 1; armed: boolean } {
  if (armed && Math.abs(x) > PUSH) return { step: x > 0 ? 1 : -1, armed: false };
  if (!armed && Math.abs(x) < REARM) return { step: 0, armed: true };
  return { step: 0, armed };
}

// The thumbstick's left-right axis. xr-standard gamepads (Quest Touch) put the thumbstick on
// axes 2-3 and a touchpad on 0-1; a controller with only one pair uses 0-1.
export function stickX(axes: readonly number[]): number {
  return (axes.length >= 4 ? axes[2] : axes[0]) ?? 0;
}

// The y rotation that turns a card at `at` (its front is +z) to face the judge's start position.
export function facing(at: P3): number {
  return Math.atan2(-at[0], -at[2]);
}

// Cards and buttons around the model. They stay put while the model turns.
// How to use: straight ahead at about eye height, behind the table, visible on entry.
export const HOW_TO = { at: [0, 1.72, -1.55] as P3, widthM: 0.74, pxPerM: 1200 };
// Reset view: a big button just under it, above the far side of the table (clear of the tanks).
export const RESET = { at: [0, 1.4, -1.5] as P3, w: 0.36, h: 0.12 };
// Info panel: beside the model on the right, about 1 m from the judge. `at` is its bottom edge
// center; it grows upward. Text sizes in px on a texture of pxPerM px per meter:
// body 34 px / 1600 px per m = 2.1 cm letters, readable at 1 m.
export const PANEL = { at: [0.9, 1.02, -0.72] as P3, widthM: 0.62, pxPerM: 1600, titlePx: 54, linePx: 42, headPx: 28, bodyPx: 34 };
// Legend: the same on the left.
export const LEGEND = { at: [-0.9, 1.02, -0.72] as P3, widthM: 0.5, pxPerM: 1600 };

// Scene colors: a tank's shell and fill (TONE_HEX) and its label words (LINE_HEX), the console's
// red and amber on the dark scene; gray is OK.
export const TONE_HEX: Record<Tone, string> = { alert: "#ef4444", warn: "#f59e0b", ok: "#a1a1aa" };
export const LINE_HEX: Record<Tone, string> = { alert: "#fca5a5", warn: "#fcd34d", ok: "#d4d4d8" };
