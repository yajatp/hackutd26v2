// Canvas painting for the map's 3D labels and buttons, in the Sui style: dark panels, thin
// borders, white type, one blue accent; red and amber only for alerts. Browser only.
import { CanvasTexture, SRGBColorSpace } from "three";
import type { SiteTone } from "./entry";

export const SUI = {
  page: "#000000", panel: "#131518", raised: "#222529", line: "#222529",
  grey1: "#6C7584", grey2: "#89919F", grey3: "#A1A7B2", white: "#FFFFFF",
  blue: "#298DFF", red: "#EF4444", amber: "#F5A524",
} as const;

export const TONE_DOT: Record<SiteTone, string> = { alert: SUI.red, warn: SUI.amber, ok: SUI.blue, idle: SUI.grey1 };
export const TONE_TEXT: Record<SiteTone, string> = { alert: "#F87171", warn: SUI.amber, ok: SUI.grey3, idle: SUI.grey1 };

export const SANS = '"Hanken Grotesk", system-ui, sans-serif';
export const MONO = '"IBM Plex Mono", ui-monospace, monospace';

let fontsReady: Promise<unknown> | null = null;
export function loadFonts(): Promise<unknown> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  fontsReady ??= Promise.all([
    document.fonts.load(`600 40px ${SANS}`), document.fonts.load(`500 40px ${SANS}`), document.fonts.load(`700 40px ${SANS}`),
    document.fonts.load(`500 40px ${MONO}`),
  ]).catch(() => undefined);
  return fontsReady;
}

export function panel(ctx: CanvasRenderingContext2D, W: number, H: number, edge: string, edgePx = 3, r = 22) {
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  ctx.roundRect(edgePx / 2, edgePx / 2, W - edgePx, H - edgePx, r);
  ctx.fillStyle = SUI.panel;
  ctx.fill();
  ctx.lineWidth = edgePx;
  ctx.strokeStyle = edge;
  ctx.stroke();
}

export function write(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o: { size: number; weight?: number; color: string; mono?: boolean; spacing?: number; maxW?: number }) {
  ctx.font = `${o.weight ?? 500} ${o.size}px ${o.mono ? MONO : SANS}`;
  ctx.fillStyle = o.color;
  ctx.textBaseline = "middle";
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${o.spacing ?? 0}px`;
  let t = s;
  if (o.maxW) while (t.length > 1 && ctx.measureText(t).width > o.maxW) t = t.slice(0, -2) + "…";
  ctx.fillText(t, x, y);
  const w = ctx.measureText(t).width;
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
  return w;
}

export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function canvasTexture(W: number, H: number, paint: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (ctx) paint(ctx);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
