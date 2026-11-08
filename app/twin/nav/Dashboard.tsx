"use client";
// The dashboard: a panel about 1.19 x 0.74 m,
// 1.0 m ahead, with the console's own live data from useAvonConsole(), in FOUR calm columns:
// PROBLEM (the pump failure, its hours to limit, Previous / n of N / Next), ACTION (the plan, its
// response cost and a big "Confirm this plan"; "CONFIRMED, THEN CHANGED" when it applies),
// FORECAST (a level-to-limit sparkline, the next truck) and SITE (cost if unaddressed, response
// cost, savings, spare trucks). Each column's one button pops its detail out of the dashboard's
// left edge (DetailPopout: one at a time); the header's Health opens the flow charts on the right
// and Go to lists the pads. A footer holds the comfort setting and how to move.
import { useCallback, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh, type Group, type MeshBasicMaterial } from "three";
import { hhmm } from "@/lib/eog/alerts";
import { useAvonConsole, type AvonConsole, type AvonStatus } from "@/lib/live";
import { C } from "../theme";
import { boardModel, CHANGED_WORD, fillPtsH, localClock, page, STAT_WORDS, type BoardModel, type FixCardModel } from "./board";
import { usePainted, type Painter } from "./glass";
import { dot, ellipsize, fitSize, measure, rgba, text, wrap, type Ctx, type TextStyle } from "./paint";
import { COLUMNS, columnRects, toggleDetail, type ColumnId, type DetailKind } from "./columns";
import type { DetailSpec } from "./detail";
import { DetailPopout } from "./DetailPopout";
import { impliedLimit, latestRun, levelFallback, levelFromProjection, rateChart, simChoices, simResult, type Chart } from "../sim/series";
import type { WhatIfKind } from "@/lib/eog/whatif";
import { BOARD, BOARD_TILT, ease } from "./motion";
import { insightRows, insightSummary } from "../insight/rows";
import { INSIGHT_PER_PAGE, type InsightSpec } from "../insight/paint";
import { healthItems } from "../health/geom";
import { HEALTH_PER_PAGE, type HealthSpec } from "../health/paint";
import { HealthPopout } from "../health/Popout";
import { NO_HIT, useFollowHead, usePress, type PressState } from "./follow";
import { useStill, useView } from "./ViewContext";

const W = BOARD.texW, H = BOARD.texH;    // the panel's texture: 1400 x 868 px
const PPM = W / BOARD.wM;                // about 1176 px per meter: 30 px words are 0.0255 m
const M = 44;                            // outer margin, px
const HEADER_H = 100;
const FOOTER_Y = 772;                    // the footer strip: comfort setting and how to move
const GOTO_PER_PAGE = 8;                 // Go to rows in the pop-out (two columns of four)
const BTN = { h: 88 };                   // Confirm this plan (as wide as its column)
const CLOSE = 76;

interface Rect { x: number; y: number; w: number; h: number }
interface BoardSpec {
  m: BoardModel;
  status: AvonStatus;
  error: string | null;
  comfort: boolean;
  card: FixCardModel | null;
  cardIndex: number;
  cardCount: number;
  level: Chart | null;
  detail: DetailKind | null;             // the open column detail (its button is lit)
  health: boolean;                       // the Health pop-out is open beside the dashboard (its button is lit)
  siteSpare: string;                     // spare trucks across every system, as /insight and Site insight show it
}
interface BoardMeta {
  confirm: Rect | null; renew: Rect | null; close: Rect; comfort: Rect;
  prev: Rect | null; next: Rect | null; cols: { id: ColumnId; r: Rect }[];
  goto: Rect; health: Rect;
}

const T = (size: number, extra: Partial<TextStyle> = {}): TextStyle => ({ size, face: "label", weight: 600, ...extra });
const B = (size: number, extra: Partial<TextStyle> = {}): TextStyle => ({ size, face: "body", weight: 400, ...extra });
const MONO = (size: number, extra: Partial<TextStyle> = {}): TextStyle => ({ size, face: "mono", weight: 500, color: C.grey3, spacing: 1, ...extra });

function lines(ctx: Ctx, rows: string[], x: number, y: number, lh: number, s: TextStyle): number {
  rows.forEach((r, i) => text(ctx, r, x, y + lh / 2 + i * lh, s));
  return y + rows.length * lh;
}

function box(ctx: Ctx, r: Rect, radius: number, fill: string | CanvasGradient, stroke?: string, lw = 2): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
  ctx.restore();
}

// A quiet bordered button drawn into the panel: raised fill, thin border, blue when active.
function button(ctx: Ctx, r: Rect, label: string, active = false, enabled = true, size = 26): void {
  box(ctx, r, 10, active ? C.accent : C.raised, active ? C.accent : C.line);
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2, T(size, { weight: 600, color: !enabled ? C.grey1 : active ? C.text : C.text, align: "center" }));
}

const INSIGHT_BTN = { w: 160, h: 60 };
function header(ctx: Ctx, s: BoardSpec): { close: Rect; goto: Rect; health: Rect } {
  const cy = HEADER_H / 2 + 4;
  const w = text(ctx, "Operations", M, cy, T(38, { weight: 700, color: C.text }));
  const close: Rect = { x: W - M - CLOSE, y: cy - CLOSE / 2, w: CLOSE, h: CLOSE };
  box(ctx, close, 12, C.raised, C.line);
  ctx.save();
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  const c = { x: close.x + close.w / 2, y: close.y + close.h / 2 }, k = 13;
  ctx.beginPath();
  ctx.moveTo(c.x - k, c.y - k); ctx.lineTo(c.x + k, c.y + k);
  ctx.moveTo(c.x + k, c.y - k); ctx.lineTo(c.x - k, c.y + k);
  ctx.stroke();
  ctx.restore();
  const live = s.status === "connected";
  let x = close.x - 28;
  if (s.m.now !== null) x -= text(ctx, `DATA ${hhmm(s.m.now)} UTC`, x, cy, MONO(24, { align: "right" })) + 30;
  const word = live ? "LIVE" : s.status === "connecting" ? "CONNECTING" : "OFFLINE";
  const ww = text(ctx, word, x, cy, MONO(24, { color: live ? C.text : C.alert, align: "right" }));
  dot(ctx, x - ww - 16, cy, 7, live ? C.accent : C.alert);
  // Go to lists the pads in the left pop-out; Health opens the rate in vs rate out charts in the
  // right pop-out. Each stays lit while its pop-out is open (pressed again, it closes it).
  const health: Rect = { x: x - ww - 16 - 7 - 28 - INSIGHT_BTN.w, y: cy - INSIGHT_BTN.h / 2, w: INSIGHT_BTN.w, h: INSIGHT_BTN.h };
  button(ctx, health, "Health", s.health, true, 26);
  const goto: Rect = { x: health.x - 12 - INSIGHT_BTN.w, y: health.y, w: INSIGHT_BTN.w, h: INSIGHT_BTN.h };
  button(ctx, goto, "Go to", s.detail === "goto", true, 26);
  const sub = "Night shift dashboard";
  const room = goto.x - 24 - (M + w + 18);
  if (room > 80) text(ctx, ellipsize(ctx, sub, room, B(28)), M + w + 18, cy + 2, B(28, { color: C.grey3 }));
  ctx.fillStyle = C.line;
  ctx.fillRect(M, HEADER_H + 8, W - 2 * M, 2);
  return { close, goto, health };
}

// The comfort setting and a line on how to move, under a hairline.
function footer(ctx: Ctx, s: BoardSpec): Rect {
  ctx.fillStyle = C.line;
  ctx.fillRect(M, FOOTER_Y - 6, W - 2 * M, 2);
  const label = s.comfort ? "Comfort on" : "Comfort off";
  const cw = Math.max(250, measure(ctx, label, T(28)) + 96);
  const r: Rect = { x: M, y: FOOTER_Y + 8, w: cw, h: CLOSE };
  box(ctx, r, r.h / 2, s.comfort ? C.accent : C.raised, s.comfort ? C.accent : C.line);
  dot(ctx, s.comfort ? r.x + r.w - 32 : r.x + 32, r.y + r.h / 2, 12, s.comfort ? C.text : C.grey2);
  text(ctx, label, r.x + r.w / 2 + (s.comfort ? -18 : 18), r.y + r.h / 2, T(28, { color: C.text, align: "center" }));
  const hint = s.comfort ? "Motion effects are off. Every state still shows." : "Point and pull the trigger to select. Use the thumbstick to turn.";
  text(ctx, ellipsize(ctx, hint, W - 2 * M - cw - 30, B(26)), r.x + cw + 26, r.y + r.h / 2, B(26, { color: C.grey2 }));
  return r;
}

// The four columns: PROBLEM, ACTION, FORECAST, SITE. Each is a calm summary in large type with
// ONE button at its foot that pops its detail out of the dashboard's left edge (DetailPopout).
// Rows are reserved from the top and the button from the foot; every string is measured.
const COL_PAD = 22, COL_BTN_H = 72, COL_GAP = 16;

function colLabel(ctx: Ctx, label: string, c: Rect, right?: string): number {
  text(ctx, label, c.x + COL_PAD, c.y + COL_PAD + 12, MONO(20, { color: C.grey3 }));
  if (right) text(ctx, right, c.x + c.w - COL_PAD, c.y + COL_PAD + 12, MONO(20, { color: C.text, align: "right" }));
  return c.y + COL_PAD + 42;
}

// Rows wrapped to at most `max`, the last ending in an ellipsis when cut.
function clampRows(ctx: Ctx, str: string, w: number, st: TextStyle, max: number): string[] {
  if (max <= 0) return [];
  const all = wrap(ctx, str, w, st);
  if (all.length <= max) return all;
  const keep = all.slice(0, max);
  keep[max - 1] = ellipsize(ctx, `${keep[max - 1]} ${all[max]}…`, w, st);
  return keep;
}

// A big figure with its small label above, fitted to the column.
function figure(ctx: Ctx, label: string, value: string, x: number, y: number, w: number, size: number, color: string): number {
  text(ctx, ellipsize(ctx, label, w, MONO(18)), x, y + 10, MONO(18));
  const st = T(fitSize(ctx, value, w, T(size, { weight: 700 }), Math.round(size * 0.55)), { weight: 700, color });
  text(ctx, ellipsize(ctx, value, w, st), x, y + 28 + st.size * 0.55, st);
  return y + 28 + st.size * 1.1 + 14;
}

function colProblem(ctx: Ctx, s: BoardSpec, c: Rect, foot: number): { prev: Rect | null; next: Rect | null } {
  const x = c.x + COL_PAD, w = c.w - 2 * COL_PAD;
  let y = colLabel(ctx, "PROBLEM", c, s.cardCount > 1 ? `${s.cardIndex + 1} of ${s.cardCount}` : undefined);
  const card = s.card;
  if (!card) {
    const msg = !s.m.now ? (s.status === "connected" ? "No site loaded yet." : "Waiting for the live data…") : `✓ ${s.m.calm ?? "No pump failures right now."}`;
    lines(ctx, clampRows(ctx, msg, w, B(28), 6), x, y, 38, B(28, { color: C.text }));
    return { prev: null, next: null };
  }
  ctx.fillStyle = C.alert;
  ctx.fillRect(c.x, c.y + COL_PAD, 4, 28);
  const name = T(34, { weight: 700, color: C.text });
  y = lines(ctx, clampRows(ctx, card.facility, w, name, 2), x, y, 42, name) + 2;
  text(ctx, "Pump failed", x, y + 16, T(26, { color: C.alert }));
  y += 50;
  y = figure(ctx, "HOURS TO LIMIT", card.pump.toLimit, x, y, w, 60, C.alert);
  const lvl = `Level ${card.pump.level} · ${card.pump.fill}`;
  text(ctx, ellipsize(ctx, lvl, w, B(24)), x, y + 12, B(24, { color: C.grey3 }));
  y += 40;
  const pagerY = foot - (s.cardCount > 1 ? 56 + 12 : 0);
  if (card.sensorFirst && pagerY - y > 60) {
    const band = MONO(17, { color: C.warn });
    const rows = clampRows(ctx, card.sensorFirst, w - 24, band, Math.min(3, Math.floor((pagerY - y - 24) / 24)));
    const h = rows.length * 24 + 18;
    box(ctx, { x, y, w, h }, 8, rgba(C.warn, 0.1), rgba(C.warn, 0.6));
    lines(ctx, rows, x + 12, y + 9, 24, band);
  }
  if (s.cardCount < 2) return { prev: null, next: null };
  const bw = (w - 12) / 2;
  const prev: Rect = { x, y: pagerY, w: bw, h: 56 }, next: Rect = { x: x + bw + 12, y: pagerY, w: bw, h: 56 };
  button(ctx, prev, "‹ Previous", false, true, fitSize(ctx, "‹ Previous", bw - 20, T(23), 16));
  button(ctx, next, "Next ›", false, true, 23);
  return { prev, next };
}

function colAction(ctx: Ctx, s: BoardSpec, c: Rect, foot: number): { confirm: Rect | null; renew: Rect | null } {
  const x = c.x + COL_PAD, w = c.w - 2 * COL_PAD;
  let y = colLabel(ctx, "ACTION", c);
  const card = s.card;
  if (!card) {
    lines(ctx, clampRows(ctx, "Nothing to confirm. Plans appear here when a pump fails.", w, B(26), 5), x, y, 36, B(26, { color: C.grey3 }));
    return { confirm: null, renew: null };
  }
  const head = T(32, { weight: 700, color: C.text });
  y = lines(ctx, clampRows(ctx, card.headline, w, head, 3), x, y, 40, head) + 14;
  y = figure(ctx, STAT_WORDS.plans.toUpperCase(), card.cost, x, y, w, 50, C.accent);
  let confirm: Rect | null = null, renew: Rect | null = null;
  const room = foot - 14 - y - (s.error ? 34 : 0);
  if (card.confirm.kind === "open" && card.canConfirm) {
    confirm = { x, y, w, h: Math.min(BTN.h, Math.max(60, room)) };
    y += confirm.h + 12;
  } else if (card.confirm.kind === "confirmed") {
    const pill = T(26, { weight: 700, color: C.accent });
    const pw = Math.min(w, measure(ctx, "✓ Confirmed", pill) + 32);
    box(ctx, { x, y, w: pw, h: 46 }, 23, rgba(C.accent, 0.14), C.accent, 2);
    text(ctx, "✓ Confirmed", x + 16, y + 23, pill);
    y += 58;
    y = lines(ctx, clampRows(ctx, card.confirm.text, w, B(22), Math.max(0, Math.floor((foot - 14 - y) / 28))), x, y, 28, B(22, { color: C.grey3 }));
  } else if (card.confirm.kind === "changed") {
    const renewH = card.confirm.renew ? 72 + 12 : 0;
    const max = Math.max(1, Math.floor((room - 16 - 30 - renewH - 10) / 26));
    const rows = clampRows(ctx, card.confirm.text, w - 24, B(20), max);
    const bh = 12 + 30 + rows.length * 26 + renewH + 10;
    box(ctx, { x, y, w, h: bh }, 10, rgba(C.warn, 0.08), rgba(C.warn, 0.5));
    const tag = MONO(18, { color: C.warn });
    text(ctx, CHANGED_WORD, x + 12, y + 12 + 13, { ...tag, size: fitSize(ctx, CHANGED_WORD, w - 24, tag, 13) });
    const yy = lines(ctx, rows, x + 12, y + 42, 26, B(20, { color: C.text }));
    if (card.confirm.renew) renew = { x: x + 12, y: yy + 8, w: w - 24, h: 72 };
    y += bh + 12;
  }
  if (s.error) text(ctx, ellipsize(ctx, `▲ ${s.error}`, w, B(22)), x, Math.min(y, foot - 30) + 14, B(22, { color: C.alert }));
  return { confirm, renew };
}

// A small level-to-limit sparkline from the level chart's lines (no axes; the pop-out has those).
function sparkline(ctx: Ctx, chart: Chart | null, r: Rect): void {
  box(ctx, r, 10, C.panel, C.line);
  if (!chart) {
    text(ctx, "No forecast yet.", r.x + 14, r.y + r.h / 2, B(22, { color: C.grey2 }));
    return;
  }
  const p = { x: r.x + 12, y: r.y + 14, w: r.w - 24, h: r.h - 28 };
  const [x0, x1] = chart.x, [y0, y1] = chart.y;
  const px = (v: number) => p.x + ((v - x0) / Math.max(1e-9, x1 - x0)) * p.w;
  const py = (v: number) => p.y + p.h - ((v - y0) / Math.max(1e-9, y1 - y0)) * p.h;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  ctx.clip();
  if (chart.rule !== null) {
    ctx.strokeStyle = C.alert;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(p.x, py(chart.rule)); ctx.lineTo(p.x + p.w, py(chart.rule)); ctx.stroke();
    ctx.setLineDash([]);
  }
  const COLOR: Record<string, string> = { past: C.grey3, plan: C.accent, noplan: C.alert, lie: C.warn, inflow: C.accent, outflow: C.grey3 };
  for (const l of chart.lines) {
    if (l.pts.length < 2) continue;
    ctx.strokeStyle = COLOR[l.key] ?? C.grey3;
    ctx.lineWidth = l.key === "plan" ? 4 : 3;
    ctx.setLineDash(l.dashed ? [8, 6] : []);
    ctx.beginPath();
    l.pts.forEach(([a, b], i) => (i ? ctx.lineTo(px(a), py(b)) : ctx.moveTo(px(a), py(b))));
    ctx.stroke();
  }
  ctx.restore();
}

function colForecast(ctx: Ctx, s: BoardSpec, c: Rect): void {
  const x = c.x + COL_PAD, w = c.w - 2 * COL_PAD;
  let y = colLabel(ctx, "FORECAST", c);
  const card = s.card;
  if (!card) {
    lines(ctx, clampRows(ctx, "No pump failure to forecast.", w, B(26), 4), x, y, 36, B(26, { color: C.grey3 }));
    return;
  }
  // One label, measured: "LEVEL TO LIMIT" and the limit's value never share a row.
  const rule = s.level?.rule;
  const lab = rule !== null && rule !== undefined ? `LEVEL TO ${Math.round(rule)}% LIMIT` : "LEVEL TO LIMIT";
  text(ctx, ellipsize(ctx, lab, w, MONO(18)), x, y + 10, MONO(18));
  y += 28;
  sparkline(ctx, s.level, { x, y, w, h: 170 });
  y += 170 + 22;
  y = figure(ctx, "NEXT TRUCK ETA", card.pump.truckEta, x, y, w, 50, C.accent);
  figure(ctx, "FILL RATE", card.pump.fill, x, y, w, 34, C.text);
}

function colSite(ctx: Ctx, s: BoardSpec, c: Rect): void {
  const x = c.x + COL_PAD, w = c.w - 2 * COL_PAD;
  let y = colLabel(ctx, "SITE", c);
  const st = s.m.stats;
  if (!st) {
    lines(ctx, clampRows(ctx, s.m.now ? "Every pump is running. Open Site insight for the night's figures." : "Waiting for the live data…", w, B(26), 5), x, y, 36, B(26, { color: C.grey3 }));
    return;
  }
  y = figure(ctx, STAT_WORDS.doNothing.toUpperCase(), st.doNothing, x, y, w, 40, C.text);
  y = figure(ctx, STAT_WORDS.plans.toUpperCase(), st.plans, x, y, w, 40, C.text);
  y = figure(ctx, STAT_WORDS.savings.toUpperCase(), st.savings, x, y, w, 40, C.accent);
  // Site-wide, the same figure as the Site insight pop-out beside it (not the failed pump's system).
  figure(ctx, STAT_WORDS.spare.toUpperCase(), s.siteSpare, x, y, w, 40, C.text);
}

interface BodyMeta { confirm: Rect | null; renew: Rect | null; prev: Rect | null; next: Rect | null; cols: { id: ColumnId; r: Rect }[] }
function body(ctx: Ctx, s: BoardSpec, y0: number, bottom: number): BodyMeta {
  const rects = columnRects(M, W - M, y0, bottom, COL_GAP);
  const cols: { id: ColumnId; r: Rect }[] = [];
  let confirm: Rect | null = null, renew: Rect | null = null, prev: Rect | null = null, next: Rect | null = null;
  COLUMNS.forEach((col, i) => {
    const c = rects[i];
    const lit = s.detail === col.id;
    box(ctx, c, 12, C.panel, lit ? C.accent : C.line, 2);
    const btn: Rect = { x: c.x + COL_PAD, y: c.y + c.h - COL_PAD - COL_BTN_H, w: c.w - 2 * COL_PAD, h: COL_BTN_H };
    const foot = btn.y - 16;
    if (col.id === "pump") ({ prev, next } = colProblem(ctx, s, c, foot));
    else if (col.id === "why") ({ confirm, renew } = colAction(ctx, s, c, foot));
    else if (col.id === "forecast") colForecast(ctx, s, c);
    else colSite(ctx, s, c);
    const label = `${col.button} ${lit ? "‹" : "›"}`;
    button(ctx, btn, label, lit, true, fitSize(ctx, label, btn.w - 24, T(26), 18));
    cols.push({ id: col.id, r: btn });
  });
  return { confirm, renew, prev, next, cols };
}

const boardPainter: Painter<BoardSpec, BoardMeta> = {
  size: () => ({ w: W, h: H }),
  paint(ctx, s) {
    // A flat, opaque panel with a thin border: nothing behind it shows through its words.
    box(ctx, { x: 2, y: 2, w: W - 4, h: H - 4 }, 20, C.panel, C.line, 2);
    const { close, goto, health } = header(ctx, s);
    const comfort = footer(ctx, s);
    const b = body(ctx, s, HEADER_H + 26, FOOTER_Y - 18);
    return { ...b, close, comfort, goto, health };
  },
};

interface ButtonSpec { label: string; enabled: boolean; w: number; h: number }
const BPAD = 26;
const buttonPainter: Painter<ButtonSpec, null> = {
  size: (s) => ({ w: s.w + 2 * BPAD, h: s.h + 2 * BPAD }),
  paint(ctx, s, cw, ch) {
    const w = cw - 2 * BPAD, h = ch - 2 * BPAD;
    box(ctx, { x: BPAD, y: BPAD, w, h }, 12, s.enabled ? C.accent : C.raised, s.enabled ? C.accent : C.line);
    // The label and its chevron are measured together and shrink to fit inside the button.
    const base = T(h > 96 ? 40 : 34, { weight: 600, color: s.enabled ? C.text : C.grey2, align: "center" });
    const chev = s.enabled ? 34 : 0;
    const size = fitSize(ctx, s.label, w - 36 - chev, base, 18);
    const style = { ...base, size };
    const label = ellipsize(ctx, s.label, w - 36 - chev, style);
    const lw = measure(ctx, label, style);
    text(ctx, label, cw / 2 - chev / 2, ch / 2, style);
    if (s.enabled) text(ctx, "›", cw / 2 - chev / 2 + lw / 2 + 10, ch / 2 - 3, { ...style, align: "left", size: size + 8 });
    return null;
  },
};

const PANEL_RAYCAST = Mesh.prototype.raycast;

// px rect on the panel texture -> center and size in panel meters (origin at the middle, y up).
function toM(r: Rect): { x: number; y: number; w: number; h: number } {
  return { x: (r.x + r.w / 2 - W / 2) / PPM, y: (H / 2 - (r.y + r.h / 2)) / PPM, w: r.w / PPM, h: r.h / PPM };
}

function useHoverGlow(state: { current: PressState }, still: boolean, base = 0, gain = 0.8) {
  const mat = useRef<MeshBasicMaterial>(null);
  const k = useRef(0);
  useFrame((_, dt) => {
    k.current = ease(k.current, state.current.hover ? 1 : 0, Math.min(dt, 0.1) * 1000, still ? 0 : 140);
    if (mat.current) mat.current.opacity = base + gain * k.current;
  });
  return { mat, k };
}

// A pressable spot drawn into the panel texture: an invisible hit plane and a faint white hover.
function HotSpot({ name, r, still, onPress }: { name: string; r: Rect; still: boolean; onPress(): void }) {
  const { state, handlers } = usePress(onPress);
  const { mat } = useHoverGlow(state, still, 0, 0.08);
  const m = toM(r);
  return (
    <group position={[m.x, m.y, 0.002]}>
      <mesh raycast={NO_HIT} renderOrder={4}>
        <planeGeometry args={[m.w, m.h]} />
        <meshBasicMaterial ref={mat} color={C.text} transparent opacity={0} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <mesh {...handlers} name={name}>
        <planeGeometry args={[m.w, m.h]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  );
}

// The big raised button (Confirm this plan, Confirm the new plan): lifts toward the judge and
// glows when pointed at, sinks when pressed, and breathes gently while it waits.
function RaisedButton({ name, r, label, enabled, still, onPress }: { name: string; r: Rect; label: string; enabled: boolean; still: boolean; onPress(): void }) {
  const face = usePainted(buttonPainter, { label, enabled, w: r.w, h: r.h });
  const { state, handlers } = usePress(onPress, enabled);
  const root = useRef<Group>(null);
  const k = useRef({ hover: 0, down: 0 });
  const m = toM(r);
  const fw = (r.w + 2 * BPAD) / PPM, fh = (r.h + 2 * BPAD) / PPM;
  useFrame((_, dt) => {
    const ms = Math.min(dt, 0.1) * 1000, s = state.current;
    k.current.hover = ease(k.current.hover, s.hover && enabled ? 1 : 0, ms, still ? 0 : 140);
    k.current.down = ease(k.current.down, s.down && enabled ? 1 : 0, ms, still ? 0 : 60);
    const { hover, down } = k.current;
    if (root.current) {
      root.current.position.set(m.x, m.y, 0.012 + 0.008 * hover - 0.008 * down);
      root.current.scale.setScalar(1 + 0.02 * hover - 0.03 * down);
    }
  });
  if (!face) return null;
  return (
    <group ref={root} position={[m.x, m.y, 0.012]}>
      <mesh {...handlers} renderOrder={5} name={name}>
        <planeGeometry args={[fw, fh]} />
        <meshBasicMaterial map={face.texture} transparent depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}

// What the dashboard reads: useAvonConsole() by default; a preview can pass its own.
export type DashboardSource = Pick<AvonConsole, "status" | "view" | "facilities" | "confirmations" | "confirm">;

// `open` overrides the view context's dashboard flag. `onClose` replaces the default close
// (setDashboard(false)). `still` defaults to useStill() (reduced motion or the comfort setting).
// `source` replaces the live data (previews only; /twin leaves it out).
export function Dashboard({ open, onClose, still: stillProp, source }: { open?: boolean; onClose?(): void; still?: boolean; source?: DashboardSource }) {
  const live = useAvonConsole();
  const { status, view, facilities, confirmations, confirm } = source ?? live;
  const insight = live.insight;
  const nav = useView();
  const autoStill = useStill();
  const still = stillProp ?? autoStill;
  const shown = open ?? nav.dashboard;
  const [pageIndex, setPage] = useState(0);
  const [cardIndex, setCard] = useState(0);
  const [detail, setDetail] = useState<DetailKind | null>(null);
  const [insightPage, setInsightPage] = useState(0);
  const [healthOpen, setHealthOpen] = useState(false);
  const [healthPage, setHealthPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sim, setSim] = useState<{ kind: WhatIfKind; label: string; facilityId: string; sinceMs: number; busy: boolean; error: string | null } | null>(null);
  const m = useMemo(() => boardModel(view, confirmations, facilities, localClock, { flows: insight.flows, budget: insight.budget }), [view, confirmations, facilities, insight.flows, insight.budget]);
  const p = page(m.goTo, pageIndex, GOTO_PER_PAGE);
  const cardCount = m.cards.length;
  const ci = cardCount ? ((cardIndex % cardCount) + cardCount) % cardCount : 0;
  const shownCard: FixCardModel | null = m.cards[ci] ?? null;
  // The charts for the shown card: a Simulate run on it first, else the engine's own pump_fail
  // run for it, else the recorded level with a straight line at the fill rate.
  const charts = useMemo(() => {
    if (!shownCard) return { level: null as Chart | null, rate: null as Chart | null, simSpec: null as { label: string; lines: string[]; busy: boolean; error: string | null } | null, base: null as Chart | null };
    const flow = insight.flows.find((f) => f.facility_id === shownCard.facilityId);
    const rate = rateChart(flow);
    const lvl = view?.alerts.find((x) => x.event.facility_id === shownCard.facilityId)?.event.level_pct;
    const hours = view?.alerts.find((x) => x.event.facility_id === shownCard.facilityId)?.hours_to_limit ?? null;
    const baseRun = latestRun(insight.scenarios, shownCard.facilityId, "pump_fail");
    // Limit from the card's own countdown (level + fill x hours), so the chart and HOURS TO LIMIT agree.
    const fill = fillPtsH(flow, lvl, hours);
    const base = baseRun?.ripple.projection ? levelFromProjection(baseRun.ripple.projection) : levelFallback(flow, lvl, fill, impliedLimit(lvl, fill, hours));
    const mine = sim && sim.facilityId === shownCard.facilityId ? sim : null;
    if (mine) {
      // This screen's own run (clocks may differ a little between the headset and the database).
      const own = insight.scenarios.filter((r) => r.mine);
      const run = latestRun(own.length ? own : insight.scenarios, shownCard.facilityId, mine.kind, mine.sinceMs - 60000);
      const r = run ? simResult(run.ripple) : null;
      return { level: r?.chart ?? null, rate, simSpec: { label: mine.label, lines: r?.lines ?? [], busy: !run && !mine.error, error: mine.error }, base };
    }
    return { level: base, rate, simSpec: null, base };
  }, [shownCard, insight.flows, insight.scenarios, sim, view]);
  const sims = shownCard ? simChoices(shownCard.assetId, shownCard.tankId) : [];
  // Site insight: the same figures and pump rows as /insight, built only while it is open.
  const insightSpec = useMemo((): InsightSpec | null => {
    if (detail !== "site") return null;
    const all = insightRows(view, insight.flows, insight.breaches, facilities);
    const ip = page(all, insightPage, INSIGHT_PER_PAGE);
    return { summary: insightSummary(view, insight.budget), rows: ip.rows, pageIndex: ip.index, pageCount: ip.count, total: all.length };
  }, [detail, insightPage, view, insight.flows, insight.breaches, insight.budget, facilities]);
  // The Health view: the same charts, shared scale, failure spans and trip limit as /insight.
  const healthSpec = useMemo((): HealthSpec | null => {
    if (!healthOpen) return null;
    const { items, max } = healthItems(insight.flows, view);
    const hp = page(items, healthPage, HEALTH_PER_PAGE);
    const shutdownPct = insight.scenarios.find((r) => r.ripple.projection)?.ripple.projection?.shutdown_pct ?? 92;
    return { items: hp.rows, max, shutdownPct, pageIndex: hp.index, pageCount: hp.count, total: items.length };
  }, [healthOpen, healthPage, view, insight.flows, insight.scenarios]);
  const here = nav.mode === "ground" ? nav.focus : null;
  const simKey = sims.map((c) => `${c.kind}:${c.label}`).join("|");
  const detailSpec = useMemo((): DetailSpec | null => {
    if (!detail) return null;
    return {
      kind: detail, card: shownCard, cardIndex: ci, cardCount, level: charts.level, rate: charts.rate, sim: charts.simSpec,
      sims: simKey ? simKey.split("|").map((x) => { const i = x.indexOf(":"); return { kind: x.slice(0, i), label: x.slice(i + 1) }; }) : [],
      insight: insightSpec, rows: p.rows, pageIndex: p.index, pageCount: p.count, here, sensors: m.sensors,
    };
  }, [detail, shownCard, ci, cardCount, charts, simKey, insightSpec, p.rows, p.index, p.count, here, m.sensors]);
  const siteSpare = useMemo(() => insightSummary(view, insight.budget).spare, [view, insight.budget]);
  const panel = usePainted(boardPainter, {
    m, status, error, comfort: nav.comfort, card: shownCard, cardIndex: ci, cardCount,
    level: charts.base, detail, health: healthOpen, siteSpare,
  });
  const root = useRef<Group>(null);
  const unfold = useRef<Group>(null);
  const openK = useRef(0);
  // With a pop-out open the judge turns to read it (its middle is about 50 degrees aside), so the
  // dashboard waits for a wider turn before it follows.
  useFollowHead(root, { aheadM: BOARD.aheadM, downM: BOARD.downM, tilt: BOARD_TILT, followDeg: healthOpen || detail ? 75 : BOARD.followDeg, still, active: shown });

  useFrame((_, dt) => {
    const ms = Math.min(dt, 0.1) * 1000;
    openK.current = ease(openK.current, shown ? 1 : 0, ms, still ? 0 : 200);
    if (!shown && openK.current < 0.01) openK.current = 0;
    const k = openK.current;
    if (root.current) root.current.visible = k > 0;
    if (unfold.current) unfold.current.scale.set(0.97 + 0.03 * k, 0.97 + 0.03 * k, 1);
  });

  const doConfirm = useCallback(async (alertId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await confirm(alertId); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }, [busy, confirm]);

  const runSim = useCallback(async (kind: string) => {
    if (!shownCard) return;
    const c = simChoices(shownCard.assetId, shownCard.tankId).find((x) => x.kind === kind);
    if (!c) return;
    const sinceMs = Date.now();
    setSim({ kind: c.kind, label: c.label, facilityId: shownCard.facilityId, sinceMs, busy: true, error: null });
    setDetail("forecast");
    try { await live.whatIf(c.kind, c.asset); } catch (e) {
      setSim({ kind: c.kind, label: c.label, facilityId: shownCard.facilityId, sinceMs, busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  }, [shownCard, live]);

  const onSpot = useCallback((name: string) => {
    if (name === "walk") { if (shownCard) nav.setMode("ground", shownCard.facilityId); }
    else if (name.startsWith("sim:")) void runSim(name.slice(4));
    else if (name.startsWith("goto:")) nav.setMode("ground", name.slice(5));
    else if (name === "more") setPage((i) => i + 1);
    else if (name === "prev") setInsightPage((i) => i - 1);
    else if (name === "next") setInsightPage((i) => i + 1);
  }, [shownCard, nav, runSim]);

  const openDetail = (id: DetailKind) => {
    const nextKind = toggleDetail(detail, id);
    if (nextKind === "site" && detail !== "site") setInsightPage(0);
    setDetail(nextKind);
  };

  const meta = panel?.meta;
  const top = shownCard;
  const canPress = status === "connected" && !busy;
  return (
    <group ref={root} visible={false}>
      <group ref={unfold}>
        {panel && (
          // Catches the ray only while shown: hidden objects still raycast in r3f and in XR.
          <mesh renderOrder={3} onClick={(e) => e.stopPropagation()} raycast={shown ? PANEL_RAYCAST : NO_HIT}>
            <planeGeometry args={[BOARD.wM, BOARD.hM]} />
            <meshBasicMaterial map={panel.texture} transparent depthWrite={false} toneMapped={false} fog={false} />
          </mesh>
        )}
        <HealthPopout
          open={shown && healthOpen} spec={healthSpec} still={still}
          onClose={() => setHealthOpen(false)} onPage={(d) => setHealthPage((i) => i + d)}
        />
        <DetailPopout open={shown && !!detail} spec={detailSpec} still={still} onClose={() => setDetail(null)} onSpot={onSpot} />
        {meta && shown && (
          <>
            {meta.confirm && top && (
              <RaisedButton
                name="nav-board-confirm" r={meta.confirm} still={still} enabled={canPress}
                label={busy ? "Confirming…" : status === "connected" ? "Confirm this plan" : "Offline: cannot confirm"}
                onPress={() => doConfirm(top.alertId)}
              />
            )}
            {meta.renew && top && (
              <RaisedButton name="nav-board-renew" r={meta.renew} still={still} enabled={canPress} label={busy ? "Confirming…" : "Confirm the new plan"} onPress={() => doConfirm(top.alertId)} />
            )}
            <HotSpot name="nav-board-close" r={meta.close} still={still} onPress={() => (onClose ? onClose() : nav.setDashboard(false))} />
            <HotSpot name="nav-board-comfort" r={meta.comfort} still={still} onPress={() => nav.setComfort(!nav.comfort)} />
            <HotSpot name="nav-board-goto" r={meta.goto} still={still} onPress={() => openDetail("goto")} />
            <HotSpot name="nav-board-health" r={meta.health} still={still} onPress={() => { if (!healthOpen) setHealthPage(0); setHealthOpen(!healthOpen); }} />
            {meta.cols.map((c) => (
              <HotSpot key={c.id} name={`nav-board-col-${c.id}`} r={c.r} still={still} onPress={() => openDetail(c.id)} />
            ))}
            {meta.prev && <HotSpot name="nav-board-prev" r={meta.prev} still={still} onPress={() => { setCard(ci - 1); setSim(null); }} />}
            {meta.next && <HotSpot name="nav-board-next" r={meta.next} still={still} onPress={() => { setCard(ci + 1); setSim(null); }} />}
          </>
        )}
      </group>
    </group>
  );
}
