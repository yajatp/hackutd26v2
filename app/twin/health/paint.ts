// Paints the Health view into the dashboard's own canvas texture (no meshes per point): a page of
// "Rate in vs rate out" small multiples, the same charts as /insight, from geom.ts. Sui style: panels
// #131518, thin #222529 lines, white and grey type, Plex Mono labels, ONE blue accent (rate in), red
// only for hours the pump had failed and the "Pump failed" tag. No glow.
import { C } from "../theme";
import { ellipsize, measure, rgba, text, type Ctx, type TextStyle } from "../nav/paint";
import { healthCells, healthGeom, type Box, type HealthItem, type Pt } from "./geom";

export interface HealthSpec { items: HealthItem[]; max: number; shutdownPct: number; pageIndex: number; pageCount: number; total: number }
export interface HealthMeta { prev: Box | null; next: Box | null }

export const HEALTH_COLS = 3, HEALTH_ROWS = 2, HEALTH_PER_PAGE = HEALTH_COLS * HEALTH_ROWS;
const PAGER = { w: 150, h: 52 };
const GUTTER = 78;          // left of each plot: the bpd labels (20 px mono)
const RIGHT = 124;          // right of each plot: the direct labels (20 px mono)

const T = (size: number, extra: Partial<TextStyle> = {}): TextStyle => ({ size, face: "label", weight: 600, ...extra });
const MONO = (size: number, extra: Partial<TextStyle> = {}): TextStyle => ({ size, face: "mono", weight: 500, color: C.grey3, spacing: 0.5, ...extra });

function box(ctx: Ctx, r: Box, radius: number, fill: string, stroke?: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
}

function hline(ctx: Ctx, x0: number, x1: number, y: number, color: string, w = 1, dash: number[] = []): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  ctx.restore();
}

function path(ctx: Ctx, runs: Pt[][], color: string, w: number): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineJoin = "round";
  for (const r of runs) {
    ctx.beginPath();
    r.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  ctx.restore();
}

// One small multiple in its cell.
function cell(ctx: Ctx, it: HealthItem, max: number, shutdownPct: number, c: Box): void {
  const failed = it.state?.tone === "red";
  box(ctx, c, 10, C.panel, C.line);
  // Title row: the facility, then its state tag.
  const tx = c.x + 16, ty = c.y + 24;
  const tag = it.state ? it.state.word.toUpperCase() : "";
  const tagW = tag ? measure(ctx, tag, MONO(18)) + 18 : 0;
  const tw = text(ctx, ellipsize(ctx, it.title, c.w - 32 - (tagW ? tagW + 12 : 0), T(25, { weight: 700 })), tx, ty, T(25, { weight: 700, color: C.text }));
  if (tag) {
    const col = failed ? C.alert : C.warn;
    const r: Box = { x: tx + tw + 12, y: ty - 13, w: tagW, h: 26 };
    box(ctx, r, 6, rgba(col, 0.12), rgba(col, 0.6));
    text(ctx, tag, r.x + r.w / 2, r.y + r.h / 2 + 1, MONO(18, { color: col, align: "center" }));
  }
  // Rate panel, level strip, time axis, margin of error, top to bottom.
  const x0 = c.x + GUTTER, w = c.w - GUTTER - RIGHT;
  const moeY = c.y + c.h - 18, axisY = moeY - 28;
  // 26 px between the rate panel's zero line and the strip hold the trip label, clear of both.
  const strip: Box = { x: x0, y: axisY - 20 - 34, w, h: 34 };
  const plot: Box = { x: x0, y: c.y + 58, w, h: strip.y - 26 - (c.y + 58) };
  const g = healthGeom(it, max, shutdownPct, plot, strip, 24);
  // Grid and the bpd scale in the gutter; "bpd" under the top value.
  g.ticks.forEach((t, i) => {
    hline(ctx, plot.x, plot.x + plot.w, t.y, i === 2 ? C.grey1 : C.raised, i === 2 ? 2 : 1);
    text(ctx, t.label, plot.x - 8, t.y, MONO(20, { align: "right", color: C.grey2 }));
  });
  text(ctx, "bpd", plot.x - 8, plot.y + 22, MONO(20, { align: "right", color: C.grey1 }));
  for (const b of g.bands) {
    ctx.fillStyle = b.down ? rgba(C.alert, 0.32) : rgba(C.text, 0.14);
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  path(ctx, g.outRuns, C.text, 2);
  path(ctx, g.inRuns, C.accent, 3);
  text(ctx, g.inLabel.text, plot.x + plot.w + 8, g.inLabel.y, MONO(20, { color: C.accent }));
  text(ctx, g.outLabel.text, plot.x + plot.w + 8, g.outLabel.y, MONO(20, { color: C.text }));
  // Level strip on its own 0-100% scale, the trip limit dashed, the level now at the right.
  hline(ctx, strip.x, strip.x + strip.w, strip.y + strip.h, C.grey1, 2);
  hline(ctx, strip.x, strip.x + strip.w, g.limitY, rgba(C.alert, 0.7), 2, [6, 5]);
  text(ctx, "level", plot.x - 8, strip.y + strip.h / 2, MONO(20, { align: "right", color: C.grey2 }));
  // The trip label sits over the strip's right end, in the 26 px row under the rate panel.
  text(ctx, g.limitText, strip.x + strip.w - 4, strip.y - 13, MONO(20, { color: rgba(C.alert, 0.85), align: "right" }));
  path(ctx, g.levelRuns, C.grey3, 2);
  if (g.levelLabel) text(ctx, g.levelLabel.text, strip.x + strip.w + 8, g.levelLabel.y, MONO(20, { color: C.grey3 }));
  // Time axis. The first time starts at the cell's inner left edge and "now" ends at its inner right edge, so
  // the three stay clear of each other on a narrow plot. Chart labels are 20 px: at about 1.27 m,
  // the angular size of the dashboard's 16 px labels at 1.0 m.
  for (const t of g.times) text(ctx, t.text, t.align === "right" ? c.x + c.w - 14 : t.align === "left" ? c.x + 16 : t.x, axisY, MONO(20, { align: t.align, color: C.grey2 }));
  text(ctx, g.moe, c.x + 16, moeY, MONO(20, { color: C.grey3 }));
}

// The whole view between the header and the footer.
export function paintHealth(ctx: Ctx, s: HealthSpec, area: { x0: number; x1: number; y0: number; bottom: number }): HealthMeta {
  const { x0, x1, y0, bottom } = area;
  const py = bottom - PAGER.h;
  if (!s.items.length) {
    text(ctx, "No flow data for this site yet.", x0, y0 + 30, T(26, { weight: 500, color: C.grey3 }));
    return { prev: null, next: null };
  }
  const cells = healthCells({ x: x0, y: y0, w: x1 - x0, h: py - 14 - y0 }, HEALTH_COLS, HEALTH_ROWS, 14);
  s.items.forEach((it, i) => { if (cells[i]) cell(ctx, it, s.max, s.shutdownPct, cells[i]); });
  // Pager at the right of the bottom line, the key at its left (what does not fit is left out).
  let prev: Box | null = null, next: Box | null = null;
  if (s.pageCount > 1) {
    next = { x: x1 - PAGER.w, y: py, w: PAGER.w, h: PAGER.h };
    prev = { x: next.x - 110 - PAGER.w, y: py, w: PAGER.w, h: PAGER.h };
    for (const [r, label] of [[prev, "‹ Previous"], [next, "Next ›"]] as const) {
      box(ctx, r, 10, C.raised, C.line);
      text(ctx, label, r.x + r.w / 2, r.y + r.h / 2, T(21, { color: C.text, align: "center" }));
    }
    text(ctx, `${s.pageIndex + 1} of ${s.pageCount}`, prev.x + PAGER.w + 55, py + PAGER.h / 2, MONO(20, { color: C.text, align: "center" }));
  }
  const limit = (prev ? prev.x : x1) - 24;
  let kx = x0;
  const key: [string, string, boolean][] = [["in", C.accent, false], ["out", C.text, false], ["filling", rgba(C.text, 0.14), true], ["filling, pump failed", rgba(C.alert, 0.32), true]];
  for (const [label, col, band] of key) {
    const lw = measure(ctx, label, MONO(18));
    if (kx + 28 + lw > limit) break;
    ctx.fillStyle = col;
    ctx.fillRect(kx, py + PAGER.h / 2 - (band ? 6 : 2), 20, band ? 12 : 4);
    text(ctx, label, kx + 28, py + PAGER.h / 2 + 1, MONO(18, { color: C.grey2 }));
    kx += 28 + lw + 24;
  }
  const note = "one bpd scale for every tank";
  if (kx + measure(ctx, note, MONO(18)) <= limit) text(ctx, note, kx, py + PAGER.h / 2 + 1, MONO(18, { color: C.grey1 }));
  return { prev, next };
}

// The pop-out's own texture: 1176 x 868 px at the dashboard's 1176 px per meter, so its words are
// the same size in the headset as the dashboard's.
export const HEALTH_TEX = { w: 1176, h: 868 } as const;
const HM = 36, HEADER_H = 92, CLOSE = 72;
export interface HealthPanelMeta extends HealthMeta { close: Box }

// The whole pop-out: a flat panel, its header ("Health · Rate in vs rate out", the page count and
// a close X), the page of charts, the key and the pager.
export function paintHealthPanel(ctx: Ctx, s: HealthSpec, W: number, H: number): HealthPanelMeta {
  box(ctx, { x: 2, y: 2, w: W - 4, h: H - 4 }, 20, C.panel, C.line);
  const cy = HEADER_H / 2 + 4;
  const tw = text(ctx, "Health", HM, cy, T(34, { weight: 700, color: C.text }));
  text(ctx, "·  Rate in vs rate out, last 24 h", HM + tw + 14, cy + 2, T(26, { weight: 500, color: C.grey3 }));
  const close: Box = { x: W - HM - CLOSE, y: cy - CLOSE / 2, w: CLOSE, h: CLOSE };
  box(ctx, close, 12, C.raised, C.line);
  ctx.save();
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  const c = { x: close.x + close.w / 2, y: close.y + close.h / 2 }, k = 12;
  ctx.beginPath();
  ctx.moveTo(c.x - k, c.y - k); ctx.lineTo(c.x + k, c.y + k);
  ctx.moveTo(c.x + k, c.y - k); ctx.lineTo(c.x - k, c.y + k);
  ctx.stroke();
  ctx.restore();
  if (s.total) text(ctx, `${s.total} facilities`, close.x - 24, cy, MONO(20, { align: "right", color: C.grey2 }));
  ctx.fillStyle = C.line;
  ctx.fillRect(HM, HEADER_H + 6, W - 2 * HM, 2);
  const m = paintHealth(ctx, s, { x0: HM, x1: W - HM, y0: HEADER_H + 22, bottom: H - 22 });
  return { ...m, close };
}
