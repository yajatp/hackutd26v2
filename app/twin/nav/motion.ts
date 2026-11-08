// How the menu dock and the dashboard move with the judge, and the view-change fade, as plain
// numbers and rules (unit-tested in motion.test.ts). Comfort first (docs/TWIN-THEME.md): nothing
// moves the judge without their input; the menu waits until they have turned well away (40 deg),
// then eases round to meet them.
import { FADE_MS } from "../theme";
import type { V3 } from "./views";

const DEG = Math.PI / 180;

// The dock: 0.45 m under the eyes, 0.9 m ahead, tilted to face the eyes.
export const DOCK = { downM: 0.45, aheadM: 0.9, followDeg: 40, settleDeg: 2, followMs: 420, moveMs: 260, jumpM: 1.5 } as const;
export const DOCK_TILT = -Math.atan2(DOCK.downM, DOCK.aheadM);
// The dashboard: about 1.19 x 0.74 m (the theme's 1.0 x 0.62 m shape, drawn larger after the
// Quest review found its 30 px words under the theme's 0.022 m-at-1 m floor), 1.0 m ahead, its
// middle just under eye level so its bottom edge clears the dock (0.45 m under the eyes, 0.9 m
// ahead). Its texture stays 1400 x 868 px, so its body text is 0.0255 m tall.
export const BOARD = { wM: 1.19, hM: 0.7378, aheadM: 1.0, downM: 0.02, followDeg: 40, texW: 1400, texH: 868 } as const;
export const BOARD_TILT = -Math.atan2(BOARD.downM, BOARD.aheadM);

// (-pi, pi]
export function wrapPi(a: number): number {
  const t = (a + Math.PI) % (2 * Math.PI);
  return (t <= 0 ? t + 2 * Math.PI : t) - Math.PI;
}

// The yaw (three.js rotation.y) that turns -z onto this forward direction.
export function yawOf(fx: number, fz: number): number {
  return Math.atan2(-fx, -fz);
}

// Frame-rate independent easing, 95% of the way to `target` after `settleMs`; 0 jumps there.
export function ease(current: number, target: number, dtMs: number, settleMs: number): number {
  if (settleMs <= 0) return target;
  return target + (current - target) * Math.exp((-3 * dtMs) / settleMs);
}

export interface Follow { yaw: number; catching: boolean }

// Lazy yaw follow. Inside `followDeg` of the head nothing moves; past it the menu starts catching
// up and eases until it is within `settleDeg`, then rests again. `still` (reduced motion) jumps.
export function followYaw(f: Follow, headYaw: number, dtMs: number, o: { followDeg?: number; settleDeg?: number; followMs?: number; still?: boolean } = {}): Follow {
  const { followDeg = DOCK.followDeg, settleDeg = DOCK.settleDeg, followMs = DOCK.followMs, still = false } = o;
  const off = wrapPi(headYaw - f.yaw);
  const catching = f.catching || Math.abs(off) > followDeg * DEG;
  if (!catching) return f;
  if (still) return { yaw: headYaw, catching: false };
  const left = ease(off, 0, dtMs, followMs);           // the part of the turn still to go
  const yaw = wrapPi(f.yaw + off - left);
  const rest = Math.abs(wrapPi(headYaw - yaw)) < settleDeg * DEG;
  return { yaw: rest ? headYaw : yaw, catching: !rest };
}

// A point `aheadM` in front of the head along `yaw`, `downM` under it.
export function ahead(head: V3, yaw: number, aheadM: number, downM: number): V3 {
  return [head[0] - Math.sin(yaw) * aheadM, head[1] - downM, head[2] - Math.cos(yaw) * aheadM];
}

// Eases a position toward its target; jumps when it is far (a teleport or a view change).
export function followPos(cur: V3 | null, target: V3, dtMs: number, settleMs: number, jumpM: number = DOCK.jumpM): V3 {
  if (!cur || Math.hypot(target[0] - cur[0], target[1] - cur[1], target[2] - cur[2]) > jumpM) return [...target] as V3;
  return [ease(cur[0], target[0], dtMs, settleMs), ease(cur[1], target[1], dtMs, settleMs), ease(cur[2], target[2], dtMs, settleMs)];
}

// Where the menu measures "ahead" from: the head, lazily. Leaning in or looking down moves the
// head a few cm and the menu stays put; a real step (past `deadM`) or a yaw catch-up re-centers
// it, eased; a jump (teleport, view change) moves it at once.
export interface Anchor { at: V3 | null; moving: boolean }
export const ANCHOR_DEAD_M = 0.3;

export function followAnchor(a: Anchor, head: V3, dtMs: number, o: { catching?: boolean; still?: boolean; deadM?: number; settleMs?: number; jumpM?: number } = {}): Anchor {
  const { catching = false, still = false, deadM = ANCHOR_DEAD_M, settleMs = DOCK.moveMs, jumpM = DOCK.jumpM } = o;
  if (!a.at) return { at: [...head] as V3, moving: false };
  const d = Math.hypot(head[0] - a.at[0], head[1] - a.at[1], head[2] - a.at[2]);
  if (d > jumpM || (still && (d > deadM || catching))) return { at: [...head] as V3, moving: false };
  const moving = a.moving || d > deadM || catching;
  if (!moving) return a;
  const at = followPos(a.at, head, dtMs, settleMs, jumpM);
  const rest = Math.hypot(head[0] - at[0], head[1] - at[1], head[2] - at[2]) < 0.01;
  return { at: rest ? [...head] as V3 : at, moving: !rest };
}

// The dock's five buttons, left to right.
export type DockId = "table" | "overview" | "ground" | "dashboard" | "reset";
export const DOCK_BUTTONS: readonly { id: DockId; label: string }[] = [
  { id: "table", label: "Table" },
  { id: "overview", label: "Overview" },
  { id: "ground", label: "Walk" },
  { id: "dashboard", label: "Dashboard" },
  { id: "reset", label: "Reset" },
];
export const DOCK_BUTTON = { wM: 0.1, hM: 0.074, gapM: 0.01 } as const;     // Meta: targets at least 0.06 m at 1 m (smaller, quieter: Sun 05:25)

// Button centers along the dock, centered on 0.
export function dockLayout(n = DOCK_BUTTONS.length, w: number = DOCK_BUTTON.wM, gap: number = DOCK_BUTTON.gapM): number[] {
  const total = n * w + (n - 1) * gap;
  return Array.from({ length: n }, (_, i) => -total / 2 + w / 2 + i * (w + gap));
}

// The view-change fade: out (to skyZenith), hold while the scene changes, back in.
export type FadePhase = "idle" | "out" | "hold" | "in";
export interface FadeClock { phase: FadePhase; t0: number; ms: number }
export const IDLE_FADE: FadeClock = { phase: "idle", t0: 0, ms: FADE_MS };
export const HOLD_MS = 90;               // dark long enough for the new view's first frames

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

// Opacity of the fade sphere at `nowMs`, 0 clear .. 1 opaque.
export function fadeAlpha(c: FadeClock, nowMs: number): number {
  if (c.phase === "idle") return 0;
  if (c.phase === "hold") return 1;
  const t = c.ms > 0 ? (nowMs - c.t0) / c.ms : 1;
  return c.phase === "out" ? smooth(t) : 1 - smooth(t);
}

// Pop-in for a group of buttons: each one starts `staggerMs` after the one before.
export function stagger(elapsedMs: number, i: number, staggerMs = 45, durMs = 260): number {
  const t = (elapsedMs - i * staggerMs) / durMs;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const u = 1 - t;
  return 1 - u * u * u;
}
