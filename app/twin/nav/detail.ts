// Paints one column's detail into the left pop-out's canvas texture (DetailPopout.tsx): Pump
// details, Why this plan, Forecast and simulate, Site insight, or Go to a pad. Every string is
// measured and wrapped or ellipsized to its box; rows are reserved, so nothing overlaps. Sui style:
// panel #131518, thin lines, white and grey type, Plex Mono labels, ONE blue for actions and key
// numbers, red and amber only for alerts. No glow.
import { C, TONE_COLOR } from "../theme";
import { dot, ellipsize, fitSize, measure, rgba, text, wrap, type Ctx, type TextStyle } from "./paint";
import type { FixCardModel, GoRow, SensorLine } from "./board";
import { DETAIL_TITLE, type DetailKind, type Rect } from "./columns";
import { paintChart } from "../sim/chart";
import type { Chart } from "../sim/series";
import { paintInsight, type InsightSpec } from "../insight/paint";

// As big as the dashboard (1.19 x 0.7378 m at 1400 x 868 px), so Site insight's pump table has the
// room it had on the dashboard and nothing in it is cut short.
export const DETAIL_TEX = { w: 1400, h: 868 } as const;
export const DETAIL_M = { w: 1.19, h: 0.7378 } as const;

export interface DetailSim { label: string; lines: string[]; busy: boolean; error: string | null }
export interface DetailSpec {
  kind: DetailKind;
  card: FixCardModel | null;
  cardIndex: number;
  cardCount: number;
  level: Chart | null;
  rate: Chart | null;
  sim: DetailSim | null;
  sims: { kind: string; label: string }[];
  insight: InsightSpec | null;
  rows: GoRow[];
  pageIndex: number;
  pageCount: number;
  here: string | null;
  sensors: SensorLine[];
}
export interface DetailMeta { close: Rect; spots: { name: string; r: Rect }[] }

const PM = 40, HEAD_H = 96, CLOSE = 72;
const T = (size: number, extra: Partial<TextStyle> = {}): TextStyle => ({ size, face: "label", weight: 600, ...extra });
const B = (size: number, extra: Partial<TextStyle> = {}): TextStyle => ({ size, face: "body", weight: 400, ...extra });
const MONO = (size: number, extra: Partial<TextStyle> = {}): TextStyle => ({ size, face: "mono", weight: 500, color: C.grey3, spacing: 1, ...extra });

function box(ctx: Ctx, r: Rect, radius: number, fill: string, stroke?: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
}

function button(ctx: Ctx, r: Rect, label: string, active = false, size = 26): void {
  box(ctx, r, 10, active ? C.accent : C.raised, active ? C.accent : C.line);
  const st = T(size, { color: C.text, align: "center" });
  const fs = fitSize(ctx, label, r.w - 24, st, 16);
  text(ctx, ellipsize(ctx, label, r.w - 24, { ...st, size: fs }), r.x + r.w / 2, r.y + r.h / 2, { ...st, size: fs });
}

// Rows of text from y (top), `lh` px apart; returns the y under the last row.
function lines(ctx: Ctx, rows: string[], x: number, y: number, lh: number, s: TextStyle): number {
  rows.forEach((r, i) => text(ctx, r, x, y + lh / 2 + i * lh, s));
  return y + rows.length * lh;
}

// Wraps to at most `max` rows; the last kept row ends in an ellipsis when text was cut.
function clamp(ctx: Ctx, str: string, w: number, s: TextStyle, max: number): string[] {
  const all = wrap(ctx, str, w, s);
  if (all.length <= max) return all;
  const keep = all.slice(0, max);
  keep[max - 1] = ellipsize(ctx, `${keep[max - 1]} ${all[max]}…`, w, s);
  return keep;
}

function header(ctx: Ctx, s: DetailSpec, W: number): Rect {
  const cy = HEAD_H / 2 + 4;
  const close: Rect = { x: W - PM - CLOSE, y: cy - CLOSE / 2, w: CLOSE, h: CLOSE };
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
  const title = DETAIL_TITLE[s.kind];
  const tw = text(ctx, title, PM, cy, T(34, { weight: 700, color: C.text }));
  const sub = s.kind === "site" ? "Night shift figures and every pump" : s.kind === "goto" ? "Walk a pad at life size" : s.card ? s.card.facility : "";
  const room = close.x - 24 - (PM + tw + 18);
  if (sub && room > 60) text(ctx, ellipsize(ctx, `·  ${sub}`, room, T(26, { weight: 500 })), PM + tw + 14, cy + 2, T(26, { weight: 500, color: C.grey3 }));
  ctx.fillStyle = C.line;
  ctx.fillRect(PM, HEAD_H + 6, W - 2 * PM, 2);
  return close;
}

function noCard(ctx: Ctx, x: number, y: number, w: number): void {
  lines(ctx, wrap(ctx, "No pump failure right now. Every tank is draining normally.", w, B(28)), x, y, 38, B(28, { color: C.grey3 }));
}

// Pump details: the six facts as big tiles, the console's detail line, and Go to this pad.
function pump(ctx: Ctx, s: DetailSpec, x0: number, x1: number, y0: number, bottom: number, spots: DetailMeta["spots"]): void {
  const c = s.card;
  if (!c) return noCard(ctx, x0, y0, x1 - x0);
  const f = c.pump, w = x1 - x0;
  let y = y0;
  const st = T(30, { weight: 700, color: C.alert });
  text(ctx, ellipsize(ctx, `Pump failed${c.when ? ` · ${c.when}` : ""}`, w, st), x0, y + 18, st);
  y += 48;
  if (c.sensorFirst) {
    const band = MONO(20, { color: C.warn });
    box(ctx, { x: x0, y, w, h: 44 }, 8, rgba(C.warn, 0.1), rgba(C.warn, 0.6));
    text(ctx, ellipsize(ctx, c.sensorFirst, w - 28, band), x0 + 14, y + 22, band);
    y += 58;
  }
  const facts: [string, string, string][] = [
    ["LEVEL", f.level, C.text], ["FILL RATE", f.fill, C.text], ["HOURS TO LIMIT", f.toLimit, C.alert],
    ["LOST REVENUE", f.lostPerHour, C.text], ["TRUCK ETA", f.truckEta, C.accent], ["WELLS AFFECTED", f.wells, C.text],
  ];
  const gap = 14, tw = (w - 2 * gap) / 3, th = 118;
  facts.forEach(([k, v, col], i) => {
    const r: Rect = { x: x0 + (i % 3) * (tw + gap), y: y + Math.floor(i / 3) * (th + gap), w: tw, h: th };
    box(ctx, r, 10, C.raised, C.line);
    text(ctx, ellipsize(ctx, k, r.w - 32, MONO(19)), r.x + 18, r.y + 28, MONO(19));
    const big = T(fitSize(ctx, v, r.w - 36, T(46, { weight: 700 }), 26), { weight: 700, color: col });
    text(ctx, ellipsize(ctx, v, r.w - 36, big), r.x + 18, r.y + 78, big);
  });
  y += 2 * th + gap + 26;
  const walk: Rect = { x: x0, y: bottom - 76, w: 360, h: 76 };
  const det = B(25, { color: C.grey3 });
  const max = Math.max(0, Math.floor((walk.y - 18 - y) / 34));
  lines(ctx, clamp(ctx, c.details, w, det, max), x0, y, 34, det);
  button(ctx, walk, "Go to this pad ›", false, 28);
  spots.push({ name: "walk", r: walk });
}

// Why this plan: the recommended action and its cost, then Why not the others (No action last).
function why(ctx: Ctx, s: DetailSpec, x0: number, x1: number, y0: number, bottom: number): void {
  const c = s.card;
  if (!c) return noCard(ctx, x0, y0, x1 - x0);
  const w = x1 - x0;
  let y = y0;
  text(ctx, "RECOMMENDED ACTION", x0, y + 12, MONO(20));
  text(ctx, "RESPONSE COST", x1, y + 12, MONO(20, { align: "right" }));
  y += 30;
  const head = T(36, { weight: 700, color: C.text });
  const cw = measure(ctx, c.cost, head) + 30;
  const hl = clamp(ctx, c.headline, w - cw, head, 2);
  text(ctx, c.cost, x1, y + 22, { ...head, color: C.accent, align: "right" });
  y = lines(ctx, hl, x0, y, 46, head) + 6;
  const det = B(24, { color: C.grey3 });
  y = lines(ctx, clamp(ctx, c.details, w, det, 2), x0, y, 32, det) + 18;
  ctx.fillStyle = C.line;
  ctx.fillRect(x0, y, w, 2);
  y += 22;
  text(ctx, "WHY NOT THE OTHERS", x0, y + 12, MONO(20));
  y += 34;
  if (!c.alternatives.length) {
    lines(ctx, wrap(ctx, "This was the only plan the engine found for this pump.", w, B(26)), x0, y, 36, B(26, { color: C.grey3 }));
    return;
  }
  const labW = Math.round(w * 0.36), costW = 130, whyW = w - labW - costW - 40;
  const lab = T(25, { weight: 600, color: C.text }), cost = T(25, { weight: 600, color: C.text, align: "right" }), wy = B(23, { color: C.grey3 });
  for (const a of c.alternatives) {
    const ll = clamp(ctx, a.label, labW, lab, 2), wl = clamp(ctx, a.why, whyW, wy, 3);
    const rh = Math.max(ll.length * 32, wl.length * 30) + 22;
    if (y + rh > bottom) {
      text(ctx, "More options on the console.", x0, y + 16, B(22, { color: C.grey2 }));
      break;
    }
    ctx.fillStyle = C.line;
    ctx.fillRect(x0, y, w, 1);
    lines(ctx, ll, x0, y + 11, 32, lab);
    text(ctx, ellipsize(ctx, a.cost, costW, cost), x0 + labW + 20 + costW, y + 11 + 16, cost);
    lines(ctx, wl, x0 + labW + costW + 40, y + 11, 30, wy);
    y += rh;
  }
}

// Forecast and simulate: the tank level to the limit, rate in vs rate out, and the two Simulate
// buttons with their result (wrapped, never cut short).
function forecast(ctx: Ctx, s: DetailSpec, x0: number, x1: number, y0: number, bottom: number, spots: DetailMeta["spots"]): void {
  const c = s.card;
  if (!c) return noCard(ctx, x0, y0, x1 - x0);
  const w = x1 - x0;
  const simW = 340;                                  // Simulate on the right, the charts on the left
  const cw = w - simW - 28;
  const chartsH = bottom - y0;
  const levelH = Math.round(chartsH * 0.56), rateH = chartsH - levelH - 14;
  if (s.level) paintChart(ctx, s.level, { x: x0, y: y0, w: cw, h: levelH });
  else box(ctx, { x: x0, y: y0, w: cw, h: levelH }, 10, C.panel, C.line);
  if (s.rate) paintChart(ctx, s.rate, { x: x0, y: y0 + levelH + 14, w: cw, h: rateH });
  else {
    box(ctx, { x: x0, y: y0 + levelH + 14, w: cw, h: rateH }, 10, C.panel, C.line);
    text(ctx, "No rate data for this pad yet.", x0 + 16, y0 + levelH + 14 + rateH / 2, B(24, { color: C.grey2 }));
  }
  const sx = x1 - simW;
  let y = y0;
  text(ctx, "SIMULATE", sx, y + 12, MONO(20));
  y += 30;
  for (const k of s.sims) {
    const r: Rect = { x: sx, y, w: simW, h: 72 };
    button(ctx, r, k.label, s.sim?.label === k.label, 27);
    spots.push({ name: `sim:${k.kind}`, r });
    y += 84;
  }
  y += 8;
  if (!s.sim) {
    lines(ctx, wrap(ctx, "Run a what-if on this pump. The result replaces the level chart.", simW, B(23)), sx, y, 32, B(23, { color: C.grey3 }));
    return;
  }
  const headTxt = s.sim.busy ? `Simulating: ${s.sim.label}…` : s.sim.error ? `▲ ${s.sim.error}` : `Simulated: ${s.sim.label}`;
  const hs = T(25, { color: s.sim.error ? C.alert : C.accent });
  y = lines(ctx, clamp(ctx, headTxt, simW, hs, 2), sx, y, 32, hs) + 8;
  const ls = B(23, { color: C.text });
  const room = Math.max(0, Math.floor((bottom - y) / 30));
  lines(ctx, s.sim.lines.flatMap((l) => wrap(ctx, l, simW, ls)).slice(0, room), sx, y, 30, ls);
}

// Go to a pad: sensors to check, then the pads (two columns), then More.
function goTo(ctx: Ctx, s: DetailSpec, x0: number, x1: number, y0: number, bottom: number, spots: DetailMeta["spots"]): void {
  const w = x1 - x0;
  let y = y0;
  const sens = s.sensors.slice(0, 2);
  if (sens.length) {
    text(ctx, "SENSORS TO CHECK", x0, y + 12, MONO(20, { color: C.warn }));
    if (s.sensors.length > sens.length) text(ctx, `+${s.sensors.length - sens.length}`, x1, y + 12, MONO(20, { align: "right" }));
    y += 30;
    const sw = (w - 14) / 2;
    sens.forEach((r, i) => {
      const b: Rect = { x: x0 + i * (sw + 14), y, w: sw, h: 72 };
      box(ctx, b, 10, rgba(C.warn, 0.08), rgba(C.warn, 0.5));
      const tag = `${r.icon} ${r.word}`;
      text(ctx, tag, b.x + 16, b.y + 22, MONO(20, { color: C.warn }));
      if (r.simulated) text(ctx, "SIMULATED", b.x + b.w - 14, b.y + 22, MONO(17, { color: C.warn, align: "right" }));
      text(ctx, ellipsize(ctx, r.what, b.w - 32, T(25)), b.x + 16, b.y + 52, T(25, { color: C.text }));
    });
    y += 72 + 22;
  }
  text(ctx, "WALK A PAD, LIFE SIZE", x0, y + 12, MONO(20));
  y += 32;
  const rowH = 70, gap = 12, colW = (w - 14) / 2;
  s.rows.forEach((row, i) => {
    const r: Rect = { x: x0 + (i % 2) * (colW + 14), y: y + Math.floor(i / 2) * (rowH + gap), w: colW, h: rowH };
    if (r.y + r.h > bottom - 70) return;
    const here = row.facility_id === s.here;
    const tone = TONE_COLOR[row.tone];
    box(ctx, r, 10, C.raised, here ? C.accent : C.line);
    dot(ctx, r.x + 24, r.y + r.h / 2, 8, row.tone === "ok" ? C.grey1 : tone);
    const right = here ? "YOU ARE HERE" : row.state;
    const rs = MONO(18, { color: here ? C.accent : row.tone === "ok" ? C.grey2 : tone, align: "right" });
    const rw = measure(ctx, right, rs);
    text(ctx, right, r.x + r.w - 16, r.y + r.h / 2, rs);
    text(ctx, ellipsize(ctx, row.label, r.w - 44 - rw - 30, T(28)), r.x + 44, r.y + r.h / 2, T(28, { color: C.text }));
    spots.push({ name: `goto:${row.facility_id}`, r });
  });
  if (s.pageCount > 1) {
    const more: Rect = { x: x0, y: bottom - 60, w: 300, h: 60 };
    button(ctx, more, "More pads ›", false, 26);
    text(ctx, `${s.pageIndex + 1} of ${s.pageCount}`, x1, more.y + 30, MONO(20, { align: "right" }));
    spots.push({ name: "more", r: more });
  }
}

export function paintDetail(ctx: Ctx, s: DetailSpec, W: number, H: number): DetailMeta {
  box(ctx, { x: 2, y: 2, w: W - 4, h: H - 4 }, 20, C.panel, C.line);
  const close = header(ctx, s, W);
  const spots: DetailMeta["spots"] = [];
  const x0 = PM, x1 = W - PM, y0 = HEAD_H + 30, bottom = H - 30;
  if (s.kind === "pump") pump(ctx, s, x0, x1, y0, bottom, spots);
  else if (s.kind === "why") why(ctx, s, x0, x1, y0, bottom);
  else if (s.kind === "forecast") forecast(ctx, s, x0, x1, y0, bottom, spots);
  else if (s.kind === "goto") goTo(ctx, s, x0, x1, y0, bottom, spots);
  else if (s.insight) {
    const im = paintInsight(ctx, s.insight, { x0, x1, y0, bottom });
    if (im.prev) spots.push({ name: "prev", r: im.prev });
    if (im.next) spots.push({ name: "next", r: im.next });
  }
  return { close, spots };
}
