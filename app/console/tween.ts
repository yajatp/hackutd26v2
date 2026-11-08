// Motion math for the console and the phone remote: pure, no React, no DOM (except the one
// media query read, which is safe on the server). Tested in app/console/tween.test.ts.

const clamp01 = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k);

// Fast start, soft landing: the way a number settles on its new value.
export function easeOut(k: number): number {
  return 1 - Math.pow(1 - clamp01(k), 3);
}

// The value shown at progress k (0..1) of a tick from `from` to `to`.
export function tween(from: number, to: number, k: number): number {
  return from + (to - from) * easeOut(k);
}

// True when the person asked their system for less motion. Every animation on /console and
// /attack is off then: states change instantly.
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// After the console's one moving block opens: scroll it into view only when its bottom sits below
// the fold and the person has not scrolled the page themselves (then they are reading elsewhere).
export function bringIntoView(bottom: number, viewHeight: number, scrolledByHand: boolean): boolean {
  return !scrolledByHand && viewHeight > 0 && bottom > viewHeight;
}

// A confirmation is news (its check mark draws) only when it was just made: confirmed here in the
// last few seconds, or stamped by the server that recently. A confirmation that comes back on
// screen later (a sensor warning cleared) is an old one: no fade, no drawing.
export function freshConfirm(nowMs: number, atMs: number, pressedAtMs: number | null, withinMs = 5000): boolean {
  if (pressedAtMs !== null && nowMs - pressedAtMs >= 0 && nowMs - pressedAtMs < withinMs) return true;
  return Math.abs(nowMs - atMs) < withinMs;
}
