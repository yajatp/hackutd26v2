// The map's zoom and pan as pure helpers (no DOM), tested in app/map/zoom.test.ts.
// A view is a scale k and a translation (x, y) in frame units: screen = k * point + (x, y).
import { H, W } from "./projection.ts";

export interface View { k: number; x: number; y: number }

export const US: View = { k: 1, x: 0, y: 0 };
export const MIN_K = 1;
export const MAX_K = 16;
export const SITE_K = 3.4;                  // how far a click on a site zooms in
export const EASE_MS = 300;

export const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

// Keep the map over the frame: at k = 1 it sits still; zoomed in, its edges may not come inside
// the frame by more than `slack` units (room to bring an edge site out from under the panel).
export function clampView(v: View, slack = 0): View {
  const k = clampK(v.k);
  if (k === 1 && slack === 0) return { k, x: 0, y: 0 };
  const s = k === 1 ? 0 : slack;
  return {
    k,
    x: Math.min(s, Math.max(W - k * W - s, v.x)),
    y: Math.min(s, Math.max(H - k * H - s, v.y)),
  };
}

// Zoom by `factor` about a frame point (the cursor, or the pinch midpoint): it stays under the pointer.
export function zoomAt(v: View, px: number, py: number, factor: number, slack = 0): View {
  const k = clampK(v.k * factor);
  const r = k / v.k;
  return clampView({ k, x: px - (px - v.x) * r, y: py - (py - v.y) * r }, slack);
}

export function panBy(v: View, dx: number, dy: number, slack = 0): View {
  return clampView({ k: v.k, x: v.x + dx, y: v.y + dy }, slack);
}

// The view that puts frame point (px, py) at (cx, cy) on screen at scale k.
export function focusOn(px: number, py: number, k: number, cx = W / 2, cy = H / 2, slack = 0): View {
  const kk = clampK(k);
  return clampView({ k: kk, x: cx - kk * px, y: cy - kk * py }, slack);
}

// A mouse wheel step as a zoom factor: about 1.25x per notch, smooth on a trackpad.
export function wheelFactor(deltaY: number, deltaMode = 0): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-Math.max(-300, Math.min(300, px)) * 0.0022);
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// Between two views at t in [0, 1]: the scale moves geometrically and the frame centre in a
// straight line, so a fly-in neither swoops nor overshoots.
export function tween(a: View, b: View, t: number): View {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const k = a.k * (b.k / a.k) ** t;
  const ca = [(W / 2 - a.x) / a.k, (H / 2 - a.y) / a.k];
  const cb = [(W / 2 - b.x) / b.k, (H / 2 - b.y) / b.k];
  const cx = ca[0] + (cb[0] - ca[0]) * t;
  const cy = ca[1] + (cb[1] - ca[1]) * t;
  return { k, x: W / 2 - k * cx, y: H / 2 - k * cy };
}

// The SVG draws the W x H frame centred and scaled to fit its box (preserveAspectRatio meet).
// Box pixels <-> frame units, for the pointer and for the HTML markers over the map.
export interface Box { width: number; height: number }
export function fitOf(box: Box): { s: number; ox: number; oy: number } {
  const s = Math.max(1e-6, Math.min(box.width / W, box.height / H));
  return { s, ox: (box.width - W * s) / 2, oy: (box.height - H * s) / 2 };
}
export function toFrame(box: Box, bx: number, by: number): [number, number] {
  const { s, ox, oy } = fitOf(box);
  return [(bx - ox) / s, (by - oy) / s];
}
export function toBox(box: Box, fx: number, fy: number): [number, number] {
  const { s, ox, oy } = fitOf(box);
  return [ox + fx * s, oy + fy * s];
}

// A frame point after the view, in box pixels: where a marker sits.
export function onScreen(box: Box, v: View, px: number, py: number): [number, number] {
  return toBox(box, v.k * px + v.x, v.k * py + v.y);
}

export const same = (a: View, b: View) => Math.abs(a.k - b.k) < 1e-4 && Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05;
