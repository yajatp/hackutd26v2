// The attack moment's timing, as plain numbers (tested in motion.test.ts): the toast's slide, the
// shockwave's ring, the beacon's sweep, the glitch's jumps and the chirp's two tones. `still`
// (prefers-reduced-motion or the menu's comfort setting) removes spin, waves and tearing; every
// state stays on screen.
import { glitchFrame } from "@/app/vr/field";
import type { FxKind } from "./events";

// Frame-rate independent easing: 95% of the way to `target` after `settleMs`; 0 jumps there.
export function approach(current: number, target: number, dtMs: number, settleMs: number): number {
  if (settleMs <= 0) return target;
  return target + (current - target) * Math.exp((-3 * dtMs) / settleMs);
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const easeInCubic = (t: number) => clamp01(t) ** 3;

// ---- Toast: slides up from below the judge's view, holds, slides away ----

export const TOAST_IN_MS = 420;
export const TOAST_HOLD_MS = 6000;
export const TOAST_OUT_MS = 480;
export const TOAST_FADE_MS = 160;     // still: a plain fade, no slide
export const TOAST_SCAN_MS = 650;     // a light bar crosses the glass once as it arrives

export interface ToastPose {
  slide: number;      // 0 in place .. 1 fully below the view
  opacity: number;    // 0..1
  glow: number;       // the halo behind the glass: flares on arrival, then rests
  scan: number;       // 0..1 across the glass while the arrival bar runs, else -1
  left: number;       // the hold bar: 1 full .. 0 about to leave
  done: boolean;
}

export function toastPose(elapsedMs: number, holdMs = TOAST_HOLD_MS, still = false): ToastPose {
  const t = Math.max(0, elapsedMs);
  if (still) {
    const out = t - TOAST_FADE_MS - holdMs;
    const opacity = t < TOAST_FADE_MS ? t / TOAST_FADE_MS : out > 0 ? 1 - out / TOAST_FADE_MS : 1;
    return { slide: 0, opacity: clamp01(opacity), glow: 0.35, scan: -1, left: clamp01(1 - (t - TOAST_FADE_MS) / holdMs), done: out >= TOAST_FADE_MS };
  }
  const scan = t < TOAST_SCAN_MS ? easeOutCubic(t / TOAST_SCAN_MS) : -1;
  if (t < TOAST_IN_MS) {
    const u = t / TOAST_IN_MS;
    return { slide: 1 - easeOutCubic(u), opacity: easeOutCubic(u), glow: u, scan, left: 1, done: false };
  }
  const held = t - TOAST_IN_MS;
  const glow = 0.35 + 0.65 * Math.exp(-held / 500);
  if (held < holdMs) return { slide: 0, opacity: 1, glow, scan, left: 1 - held / holdMs, done: false };
  const u = (held - holdMs) / TOAST_OUT_MS;
  return { slide: easeInCubic(u), opacity: clamp01(1 - easeOutCubic(u)), glow: glow * (1 - clamp01(u)), scan: -1, left: 0, done: u >= 1 };
}

// ---- Shockwave: a holo ring racing out across the ground or table, ~1.2 s ----

export const WAVE_S = 1.2;

export interface WavePose {
  front: number;      // the leading ring's radius, 0..1 of the wave's reach (ease-out)
  fade: number;       // everything's brightness, 1 at the start .. 0 at the end
  column: number;     // the light column at the origin: up fast, gone by mid-wave
  done: boolean;
}

export function waveAt(elapsedS: number, durationS = WAVE_S): WavePose {
  const t = durationS > 0 ? Math.max(0, elapsedS) / durationS : 1;
  if (t >= 1) return { front: 1, fade: 0, column: 0, done: true };
  return {
    front: easeOutCubic(t),
    fade: (1 - t) ** 1.4,
    column: t < 0.5 ? (1 - t / 0.5) ** 2 * clamp01(t / 0.06) : 0,
    done: false,
  };
}

// ---- Beacon: one sweep every BEACON_PERIOD_S, fades in and out calmly ----

export const BEACON_PERIOD_S = 1.4;
export const BEACON_FADE_MS = 600;

export function beaconAngle(tS: number, still: boolean): number {
  if (still) return 0;
  const turns = tS / BEACON_PERIOD_S;
  return (turns - Math.floor(turns)) * 2 * Math.PI;
}

// How hard the beacon flashes at a viewer: `c` is the cosine between a light cone's axis and the
// direction to the viewer (both flat). Sharp, so the flash reads as the cone sweeping past you.
export function beaconFlash(c: number): number {
  return Math.max(0, c) ** 10;
}

// ---- Glitch: the /vr cadence (glitchFrame in app/vr/field.ts), as offsets to tear things by ----

export interface GlitchSample {
  on: boolean;        // inside a glitch burst (220 ms of every 1.4 s)
  frame: number;      // the burst's frame (a new picture every 60 ms), -1 when off
  dx: number;         // sideways jump, -1..1 (0 on some frames: the tear is uneven)
  dy: number;         // a small vertical jitter, -1..1
  ghost: number;      // 0..1: where a lying gauge claims the level is this frame
}

export const GLITCH_OFF: GlitchSample = { on: false, frame: -1, dx: 0, dy: 0, ghost: 0 };

function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Same tMs, same seed, same sample. `seed` keeps two torn things from jumping in step.
// still: never on (no tearing); the caller keeps the faked state visible some other way.
export function glitchSample(tMs: number, still: boolean, seed = 0): GlitchSample {
  if (still) return GLITCH_OFF;
  const f = glitchFrame(tMs, false);
  if (f === null) return GLITCH_OFF;
  const s = Math.round(seed) * 31;
  const g = hash(f, s + 1);
  return {
    on: true,
    frame: f,
    dx: g < 0.7 ? (g / 0.7) * 2 - 1 : 0,
    dy: hash(f, s + 7) * 2 - 1,
    ghost: hash(f, s + 3),
  };
}

// ---- Chirp: two synthesized tones (no audio file) ----

export interface ChirpTone { f0: number; f1: number; at: number; dur: number; wave: OscillatorType; gain: number }

// A faked sensor: a bright rising fifth, twice-struck. A pump failure: a low falling pair.
// A clear: one soft falling third. Seconds from the chirp's start; gains before the master.
export function chirpPlan(kind: FxKind): ChirpTone[] {
  switch (kind) {
    case "faked":
      return [
        { f0: 784, f1: 800, at: 0, dur: 0.11, wave: "square", gain: 0.16 },
        { f0: 1175, f1: 1190, at: 0.13, dur: 0.16, wave: "square", gain: 0.16 },
      ];
    case "failed":
      return [
        { f0: 880, f1: 860, at: 0, dur: 0.16, wave: "sawtooth", gain: 0.14 },
        { f0: 587, f1: 560, at: 0.19, dur: 0.24, wave: "sawtooth", gain: 0.14 },
      ];
    case "cleared":
      return [
        { f0: 659, f1: 659, at: 0, dur: 0.18, wave: "sine", gain: 0.12 },
        { f0: 523, f1: 523, at: 0.16, dur: 0.3, wave: "sine", gain: 0.12 },
      ];
  }
}

export const CHIRP_GAP_MS = 400;      // two chirps closer than this play as one

// When the last shockwave started (performance.now() ms; Shockwave sets it), so the table can dim
// its grid under the wave.
export const WAVE_CLOCK = { at: -Infinity };
export const GRID_DIM_MS = 600;
// The table grid's strength `sinceMs` after a wave starts: down to 40% at once, back over the last
// third of GRID_DIM_MS. Still (reduced motion): no dip.
export function gridDim(sinceMs: number, still = false): number {
  if (still || !(sinceMs >= 0) || sinceMs >= GRID_DIM_MS) return 1;
  const back = Math.max(0, (sinceMs - GRID_DIM_MS * 0.66) / (GRID_DIM_MS * 0.34));
  return 0.4 + 0.6 * back;
}

// Whether the headset's toast is up this frame (Toast sets it), so an open info panel can step
// aside instead of being covered.
export const TOAST_CLOCK = { up: false };
export const TOAST_ASIDE_M = 0.22;
