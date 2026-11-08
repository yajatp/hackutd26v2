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

// The thumbstick's forward-back axis (forward is negative), on the same axes as stickX.
export function stickY(axes: readonly number[]): number {
  return (axes.length >= 4 ? axes[3] : axes[1]) ?? 0;
}

// The snap turn only reads a mostly sideways push, so pushing the stick forward to aim a teleport
// never turns the judge as well.
export function turnAxis(axes: readonly number[]): number {
  const x = stickX(axes), y = stickY(axes);
  return Math.abs(x) > Math.abs(y) ? x : 0;
}

// The Walk view's teleport, on the common Quest pattern: push the thumbstick forward to aim the
// arc, let it go to jump. The trigger stays free for the ray (tanks, signs, the menu). `aiming`
// starts on a mostly-forward push past AIM_PUSH; letting the stick come back inside AIM_REARM fires.
const AIM_PUSH = 0.6;
const AIM_REARM = 0.3;
export function teleportAim(x: number, y: number, aiming: boolean): { aiming: boolean; fire: boolean } {
  if (!aiming) return { aiming: y < -AIM_PUSH && Math.abs(y) > Math.abs(x), fire: false };
  if (y > -AIM_REARM) return { aiming: false, fire: true };
  return { aiming: true, fire: false };
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

// Scene colors (docs/DESIGN.md): a tank's shell and fill (TONE_HEX) and its label words
// (LINE_HEX). Red and amber are the console's state colors and nothing else; OK is matte dust.
// Red words are a step lighter than the red tank so they read on the night background.
export const TONE_HEX: Record<Tone, string> = { alert: "#ef4444", warn: "#f59e0b", ok: "#8fa1aa" };
export const LINE_HEX: Record<Tone, string> = { alert: "#f87171", warn: "#f59e0b", ok: "#d7dee0" };
