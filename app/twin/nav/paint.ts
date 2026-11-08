// Canvas painting for the menu and the dashboard: holo-glass panels, glowing edges, corner ticks,
// icons and text, all in the theme's colors and fonts (app/twin/theme.ts). The canvases become
// textures (glass.tsx), as app/twin/CanvasText.tsx does: no drei <Text>, no font from a CDN.
import { C, FONT } from "../theme";
import type { DockId } from "./motion";

export type Ctx = CanvasRenderingContext2D;

// "#4de2ff" + alpha -> "rgba(77,226,255,0.4)". Only theme hexes come in here.
export function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

let fontsLoading: Promise<void> | null = null;

// The headset's faces (Chakra Petch 600/700, Barlow 400/500), from /fonts. Resolves once, also on
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

// Glass: the theme's glass fill, a tint fading down from the top, a bright hairline along the
// top, and a glowing edge.
export function glass(ctx: Ctx, x: number, y: number, w: number, h: number, s: GlassStyle): void {
  const { r, edge = C.holo, edgeAlpha = 0.75, edgePx = 2, glowPx = 0, tint = C.holo, tintAlpha = 0.12 } = s;
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  if (s.fill) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, rgba(s.fill, s.fillAlpha ?? 1));
    g.addColorStop(1, rgba(s.fill, (s.fillAlpha ?? 1) * 0.72));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = C.glass;
  }
  ctx.fill();
  if (!s.fill && tintAlpha > 0) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, rgba(tint, tintAlpha));
    g.addColorStop(0.55, rgba(tint, tintAlpha * 0.25));
    g.addColorStop(1, rgba(tint, 0));
    ctx.fillStyle = g;
    ctx.fill();
  }
  // The edge, with its glow.
  if (glowPx > 0) {
    ctx.shadowColor = rgba(edge, 0.9);
    ctx.shadowBlur = glowPx;
  }
  ctx.strokeStyle = rgba(edge, edgeAlpha);
  ctx.lineWidth = edgePx;
  roundRect(ctx, x + edgePx / 2, y + edgePx / 2, w - edgePx, h - edgePx, Math.max(0, r - edgePx / 2));
  ctx.stroke();
  ctx.restore();
  // A bright hairline along the top: light catching the glass.
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const hl = ctx.createLinearGradient(x, 0, x + w, 0);
  hl.addColorStop(0, rgba(C.text, 0));
  hl.addColorStop(0.5, rgba(C.text, s.fill ? 0.55 : 0.35));
  hl.addColorStop(1, rgba(C.text, 0));
  ctx.fillStyle = hl;
  ctx.fillRect(x + r, y + edgePx + 1, w - 2 * r, Math.max(1, edgePx * 0.6));
  ctx.restore();
}

// HUD corner ticks just inside a rectangle.
export function corners(ctx: Ctx, x: number, y: number, w: number, h: number, len: number, color: string, lw: number, inset = 0): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "square";
  const L = x + inset, R = x + w - inset, T = y + inset, B = y + h - inset;
  ctx.beginPath();
  ctx.moveTo(L, T + len); ctx.lineTo(L, T); ctx.lineTo(L + len, T);
  ctx.moveTo(R - len, T); ctx.lineTo(R, T); ctx.lineTo(R, T + len);
  ctx.moveTo(R, B - len); ctx.lineTo(R, B); ctx.lineTo(R - len, B);
  ctx.moveTo(L + len, B); ctx.lineTo(L, B); ctx.lineTo(L, B - len);
  ctx.stroke();
  ctx.restore();
}

// Faint horizontal scanlines: the hologram's grain.
export function scanlines(ctx: Ctx, x: number, y: number, w: number, h: number, every: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  for (let yy = y; yy < y + h; yy += every) ctx.fillRect(x, yy, w, 1);
  ctx.restore();
}

export interface TextStyle {
  size: number;                  // px
  weight?: 400 | 500 | 600 | 700;
  face?: "label" | "body";       // label: Chakra Petch; body: Barlow
  color?: string;
  align?: CanvasTextAlign;
  spacing?: number;              // letter spacing, px
  glow?: number;                 // shadow blur in the text color
}

export function setFont(ctx: Ctx, s: TextStyle): void {
  ctx.font = `${s.weight ?? (s.face === "body" ? 400 : 600)} ${s.size}px ${s.face === "body" ? FONT.body : FONT.label}`;
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
  if (s.glow) {
    ctx.shadowColor = s.color ?? C.text;
    ctx.shadowBlur = s.glow;
  }
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

// A glowing dot (a state light).
export function dot(ctx: Ctx, cx: number, cy: number, r: number, color: string): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 2.5;
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

// A soft halo around a rounded rect, white (tinted by the material's color). Only the outside
// glows: the middle is cut away, so glass in front of it never shows a lighter box.
export function paintGlow(ctx: Ctx, W: number, H: number, padPx: number, r: number): void {
  ctx.save();
  ctx.shadowColor = rgba(C.text, 1);
  ctx.shadowBlur = padPx * 0.9;
  ctx.fillStyle = rgba(C.text, 0.9);
  roundRect(ctx, padPx, padPx, W - 2 * padPx, H - 2 * padPx, r);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = rgba(C.text, 1);
  const k = Math.max(2, padPx * 0.12);
  roundRect(ctx, padPx + k, padPx + k, W - 2 * (padPx + k), H - 2 * (padPx + k), Math.max(0, r - k));
  ctx.fill();
  ctx.restore();
}
