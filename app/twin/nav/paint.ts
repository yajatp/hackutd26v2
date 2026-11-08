// Canvas painting for the menu and the dashboard, in the Sui style: flat dark panels with thin
// borders, one blue accent, no glow. Corner ticks, scanlines and glows are kept as no-ops so old
// callers still compile. Icons and text are all in the theme's colors and fonts (app/twin/theme.ts). The canvases become
// textures (glass.tsx), as app/twin/CanvasText.tsx does: no drei <Text>, no font from a CDN.
import { C, FONT } from "../theme";
import type { DockId } from "./motion";

export type Ctx = CanvasRenderingContext2D;

// "#298DFF" + alpha -> "rgba(41,141,255,0.4)". Only theme hexes come in here.
export function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

let fontsLoading: Promise<void> | null = null;

// The headset's faces (Hanken Grotesk 400-700, IBM Plex Mono 400/500), from /fonts. Resolves once, also on
// failure, so a missing file still lets the menu draw.
export function navFontsReady(): Promise<void> {
  fontsLoading ??= Promise.all(FONT.load.map((f) => document.fonts.load(f))).then(() => undefined, () => undefined);
  return fontsLoading;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

export interface GlassStyle {
  r: number;                     // corner radius, px
  edge?: string;                 // edge color (theme hex)
  edgeAlpha?: number;
  edgePx?: number;
  glowPx?: number;               // the edge's own glow, inside the canvas padding
  tint?: string;                 // a color washed over the top of the glass
  tintAlpha?: number;
  fill?: string;                 // a solid fill instead of glass (active buttons)
  fillAlpha?: number;
}

// A flat panel: the theme's panel fill (or a solid fill for active buttons) and a thin border.
// glowPx, tint and tintAlpha are accepted and ignored (no glow, no wash in the Sui style).
export function glass(ctx: Ctx, x: number, y: number, w: number, h: number, s: GlassStyle): void {
  const { r, edge = C.holoDim, edgeAlpha = 1 } = s;
  const edgePx = Math.min(2, s.edgePx ?? 2);
  ctx.save();
  roundRect(ctx, x, y, w, h, Math.min(r, 24));
  ctx.fillStyle = s.fill ? rgba(s.fill, s.fillAlpha ?? 1) : C.glass;
  ctx.fill();
  ctx.strokeStyle = rgba(edge, Math.min(1, edgeAlpha));
  ctx.lineWidth = edgePx;
  roundRect(ctx, x + edgePx / 2, y + edgePx / 2, w - edgePx, h - edgePx, Math.max(0, Math.min(r, 24) - edgePx / 2));
  ctx.stroke();
  ctx.restore();
}

// Corner ticks and scanlines are gone in the Sui style; kept as no-ops for old callers.
export function corners(...args: [ctx: Ctx, x: number, y: number, w: number, h: number, len: number, color: string, lw: number, inset?: number]): void { void args; }

export function scanlines(...args: [ctx: Ctx, x: number, y: number, w: number, h: number, every: number, color: string]): void { void args; }

export interface TextStyle {
  size: number;                  // px
  weight?: 400 | 500 | 600 | 700;
  face?: "label" | "body" | "mono";   // label, body: Hanken Grotesk; mono: IBM Plex Mono (figures, small labels)
  color?: string;
  align?: CanvasTextAlign;
  spacing?: number;              // letter spacing, px
  glow?: number;                 // ignored: no text glow in the Sui style
}

export function setFont(ctx: Ctx, s: TextStyle): void {
  const face = s.face === "mono" ? FONT.mono : s.face === "body" ? FONT.body : FONT.label;
  const weight = s.face === "mono" ? Math.min(500, s.weight ?? 500) : s.weight ?? (s.face === "body" ? 400 : 600);
  ctx.font = `${weight} ${s.size}px ${face}`;
  const c = ctx as Ctx & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${s.spacing ?? 0}px`;
}

export function measure(ctx: Ctx, str: string, s: TextStyle): number {
  setFont(ctx, s);
  return ctx.measureText(str).width;
}

// Draws one line with its baseline at the middle of `y`; returns its width.
export function text(ctx: Ctx, str: string, x: number, y: number, s: TextStyle): number {
  ctx.save();
  setFont(ctx, s);
  ctx.fillStyle = s.color ?? C.text;
  ctx.textAlign = s.align ?? "left";
  ctx.textBaseline = "middle";
  ctx.fillText(str, x, y);
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

// The largest size (down to `min`) at which `str` fits `maxW`.
export function fitSize(ctx: Ctx, str: string, maxW: number, s: TextStyle, min = 10): number {
  let size = s.size;
  while (size > min && measure(ctx, str, { ...s, size }) > maxW) size -= 1;
  return size;
}

export function wrap(ctx: Ctx, str: string, maxW: number, s: TextStyle): string[] {
  setFont(ctx, s);
  const out: string[] = [];
  let line = "";
  for (const word of str.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out;
}

export function ellipsize(ctx: Ctx, str: string, maxW: number, s: TextStyle): string {
  setFont(ctx, s);
  if (ctx.measureText(str).width <= maxW) return str;
  let lo = 0, hi = str.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(str.slice(0, mid) + "…").width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return str.slice(0, lo).trimEnd() + "…";
}

// A flat dot (a state light).
export function dot(ctx: Ctx, cx: number, cy: number, r: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// The dock's pictograms, line-drawn in a box of side `s` centered on (cx, cy).
export function icon(ctx: Ctx, id: DockId, cx: number, cy: number, s: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.075);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const u = s / 2;
  ctx.translate(cx, cy);
  ctx.beginPath();
  if (id === "table") {
    // A round tabletop on a stem, three tanks glowing on it.
    ctx.ellipse(0, u * 0.25, u * 0.9, u * 0.32, 0, 0, Math.PI * 2);
    ctx.moveTo(0, u * 0.57); ctx.lineTo(0, u * 0.95);
    ctx.moveTo(-u * 0.4, u * 0.95); ctx.lineTo(u * 0.4, u * 0.95);
    ctx.stroke();
    for (const [x, h] of [[-0.42, 0.5], [0.02, 0.8], [0.44, 0.38]] as const) ctx.fillRect(u * x - u * 0.09, u * 0.2 - u * h, u * 0.18, u * h);
  } else if (id === "overview") {
    // The site seen from a hill: a ground grid in perspective with a pin on it.
    ctx.moveTo(-u * 0.95, u * 0.9); ctx.lineTo(-u * 0.5, -u * 0.05); ctx.lineTo(u * 0.5, -u * 0.05); ctx.lineTo(u * 0.95, u * 0.9); ctx.closePath();
    ctx.moveTo(-u * 0.72, u * 0.42); ctx.lineTo(u * 0.72, u * 0.42);
    ctx.moveTo(0, -u * 0.05); ctx.lineTo(0, u * 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(u * 0.32, -u * 0.55, u * 0.22, Math.PI, 0);
    ctx.lineTo(u * 0.32, -u * 0.12);
    ctx.closePath();
    ctx.fill();
  } else if (id === "ground") {
    // A person walking.
    ctx.arc(u * 0.08, -u * 0.72, u * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -u * 0.42); ctx.lineTo(-u * 0.08, u * 0.22);
    ctx.lineTo(-u * 0.48, u * 0.92);
    ctx.moveTo(-u * 0.08, u * 0.22); ctx.lineTo(u * 0.3, u * 0.55); ctx.lineTo(u * 0.32, u * 0.95);
    ctx.moveTo(-u * 0.5, -u * 0.05); ctx.lineTo(-u * 0.02, -u * 0.32); ctx.lineTo(u * 0.5, -u * 0.02);
    ctx.stroke();
  } else if (id === "dashboard") {
    // A panel with a rising chart.
    roundRect(ctx, -u * 0.9, -u * 0.75, u * 1.8, u * 1.5, u * 0.18);
    ctx.stroke();
    for (const [x, h] of [[-0.5, 0.45], [-0.08, 0.75], [0.34, 1.0]] as const) ctx.fillRect(u * x, u * 0.5 - u * h, u * 0.26, u * h);
  } else {
    // Reset: a circular arrow.
    ctx.arc(0, 0, u * 0.7, -Math.PI * 0.35, Math.PI * 1.45);
    ctx.stroke();
    const a = -Math.PI * 0.35, x = Math.cos(a) * u * 0.7, y = Math.sin(a) * u * 0.7;
    ctx.beginPath();
    ctx.moveTo(x + u * 0.36, y - u * 0.02);
    ctx.lineTo(x - u * 0.06, y - u * 0.34);
    ctx.lineTo(x - u * 0.08, y + u * 0.18);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Panels no longer glow: the halo texture is left empty (kept so old callers compile).
export function paintGlow(...args: [ctx: Ctx, W: number, H: number, padPx: number, r: number]): void { void args; }
