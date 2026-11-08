"use client";
// The dashboard (docs/TWIN-THEME.md "The menu and the dashboard"): a holo-glass panel about
// 1.0 x 0.62 m, 1.2 m ahead, with the console's own live data from useAvonConsole(): the totals
// (as three stat tiles that read as the console's line), the top fix card with a big "Confirm this
// plan" (the judge works the shift from inside VR), "CONFIRMED, THEN CHANGED" when it applies, the
// sensors to check, the other pump failures, and a Go to list that jumps to a facility pad at life
// size. A footer holds the comfort setting and how to move. It unfolds like a hologram when
// opened and follows the judge lazily.
import { useCallback, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh, type Group, type MeshBasicMaterial } from "three";
import { hhmm } from "@/lib/eog/alerts";
import { useAvonConsole, type AvonConsole, type AvonStatus } from "@/lib/live";
import { C, TONE_COLOR } from "../theme";
import { boardModel, CHANGED_WORD, fillPtsH, localClock, page, STAT_WORDS, type BoardModel, type FixCardModel, type GoRow } from "./board";
import { usePainted, type Painter } from "./glass";
import { dot, ellipsize, fitSize, measure, rgba, text, wrap, type Ctx, type TextStyle } from "./paint";
import { impliedLimit, latestRun, levelFallback, levelFromProjection, rateChart, simChoices, simResult, type Chart } from "../sim/series";
import { paintChart } from "../sim/chart";
import type { WhatIfKind } from "@/lib/eog/whatif";
import { BOARD, BOARD_TILT, ease } from "./motion";
import { insightRows, insightSummary } from "../insight/rows";
import { INSIGHT_PER_PAGE, paintInsight, type InsightSpec } from "../insight/paint";
import { healthItems } from "../health/geom";
import { HEALTH_PER_PAGE, type HealthSpec } from "../health/paint";
import { HealthPopout } from "../health/Popout";
import { NO_HIT, useFollowHead, usePress, type PressState } from "./follow";
import { useStill, useView } from "./ViewContext";

const W = BOARD.texW, H = BOARD.texH;    // the panel's texture: 1400 x 868 px
const PPM = W / BOARD.wM;                // about 1176 px per meter: 30 px words are 0.0255 m
const M = 44;                            // outer margin, px
const LEFT = { x0: M, x1: 880 };
const RIGHT = { x0: 912, x1: W - M };
const HEADER_H = 100;
const FOOTER_Y = 772;                    // the footer strip: comfort setting and how to move
const ROW_H = 76, ROW_GAP = 8, PER_PAGE = 5;    // Go to rows
const BTN = { w: 400, h: 88 };           // Confirm this plan
const RENEW = { w: 400, h: 80 };
const CLOSE = 76;
const PAGER = { w: 124, h: 52 };
const TAB = { h: 56 };
const SIM = { h: 60 };

interface Rect { x: number; y: number; w: number; h: number }
export type BoardTab = "forecast" | "goto";
interface SimSpec { label: string; lines: string[]; busy: boolean; error: string | null }
interface BoardSpec {
  m: BoardModel;
  status: AvonStatus;
  rows: GoRow[];
  pageIndex: number;
  pageCount: number;
  here: string | null;
  error: string | null;
  comfort: boolean;
  card: FixCardModel | null;
  cardIndex: number;
  cardCount: number;
  tab: BoardTab;
  level: Chart | null;
  rate: Chart | null;
  sim: SimSpec | null;
  sims: { kind: string; label: string }[];
  insight: InsightSpec | null;           // the Insight view, open in place of the body
  health: boolean;                       // the Health pop-out is open beside the dashboard (its button is lit)
}
interface BoardMeta {
  confirm: Rect | null; renew: Rect | null; rows: { id: string; r: Rect }[]; more: Rect | null; close: Rect; comfort: Rect; alarm: Rect | null;
  prev: Rect | null; next: Rect | null; tabs: { id: BoardTab; r: Rect }[]; sims: { kind: string; r: Rect }[];
  insight: Rect; insightPrev: Rect | null; insightNext: Rect | null;
  health: Rect;
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
function header(ctx: Ctx, s: BoardSpec): { close: Rect; insight: Rect; health: Rect } {
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
  // Insight opens the night's figures and pump table in place of the body and then reads "‹ Back";
  // Health opens the rate in vs rate out charts in a pop-out beside the dashboard and stays lit
  // while it is open (pressed again, it closes it).
  const insight: Rect = { x: x - ww - 16 - 7 - 28 - INSIGHT_BTN.w, y: cy - INSIGHT_BTN.h / 2, w: INSIGHT_BTN.w, h: INSIGHT_BTN.h };
  button(ctx, insight, s.insight ? "‹ Back" : "Insight", !!s.insight, true, 26);
  const health: Rect = { x: insight.x - 12 - INSIGHT_BTN.w, y: insight.y, w: INSIGHT_BTN.w, h: INSIGHT_BTN.h };
  button(ctx, health, "Health", s.health, true, 26);
  const sub = s.insight ? "Night shift insight" : "Night shift dashboard";
  const room = health.x - 24 - (M + w + 18);
  if (room > 80) text(ctx, ellipsize(ctx, sub, room, B(28)), M + w + 18, cy + 2, B(28, { color: C.grey3 }));
  ctx.fillStyle = C.line;
  ctx.fillRect(M, HEADER_H + 8, W - 2 * M, 2);
  return { close, insight, health };
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

// The totals as four tiles: pump failures, Cost if unaddressed, Response cost, Savings.
function tiles(ctx: Ctx, s: BoardSpec, y: number): number {
  const st = s.m.stats!;
  const x0 = LEFT.x0, gap = 12, h = 96, span = LEFT.x1 - x0 - 3 * gap;
  const items = [
    { label: st.failuresWord.toUpperCase(), big: String(st.failures), color: C.alert },
    { label: STAT_WORDS.doNothing.toUpperCase(), big: st.doNothing, color: C.text },
    { label: STAT_WORDS.plans.toUpperCase(), big: st.plans, color: C.text },
    { label: STAT_WORDS.savings.toUpperCase(), big: st.savings, color: C.accent },
  ];
  const widths = [0.2, 0.28, 0.26, 0.26].map((k) => k * span);
  let x = x0;
  items.forEach((it, i) => {
    const r: Rect = { x, y, w: widths[i], h };
    box(ctx, r, 10, C.raised, C.line);
    const lab = MONO(18);
    text(ctx, it.label, r.x + 16, r.y + 24, { ...lab, size: fitSize(ctx, it.label, r.w - 28, lab, 13) });
    text(ctx, it.big, r.x + 16, r.y + 64, T(fitSize(ctx, it.big, r.w - 28, T(44, { weight: 700 }), 28), { weight: 700, color: it.color }));
    x += widths[i] + gap;
  });
  return y + h;
}

// One pump failure's card: name, pager, the plan, confirm, and this pump's own numbers.
function card(ctx: Ctx, s: BoardSpec, y0: number, bottom: number): { y: number; confirm: Rect | null; renew: Rect | null; prev: Rect | null; next: Rect | null } {
  const c = s.card!;
  const x0 = LEFT.x0, x1 = LEFT.x1, x = x0 + 28, inner = x1 - 24 - x;
  box(ctx, { x: x0, y: y0, w: x1 - x0, h: bottom - y0 }, 12, C.panel, C.line);
  ctx.fillStyle = C.alert;
  ctx.fillRect(x0, y0 + 14, 4, 40);
  let y = y0 + 16;
  // Top row: the facility, and Previous / 1 of 3 / Next.
  let prev: Rect | null = null, next: Rect | null = null;
  const pagerW = s.cardCount > 1 ? 2 * PAGER.w + 96 : 0;
  const title = T(fitSize(ctx, `${c.facility} · Pump failed`, inner - pagerW - 10, T(32, { weight: 700 }), 24), { weight: 700, color: C.text });
  text(ctx, ellipsize(ctx, `${c.facility} · Pump failed`, inner - pagerW - 10, title), x, y + 22, title);
  if (s.cardCount > 1) {
    next = { x: x1 - 18 - PAGER.w, y: y - 6, w: PAGER.w, h: PAGER.h };
    prev = { x: next.x - 96 - PAGER.w, y: y - 4, w: PAGER.w, h: PAGER.h };
    next.y = y - 4;
    button(ctx, prev, "‹ Previous", false, true, 21);
    button(ctx, next, "Next ›", false, true, 21);
    text(ctx, `${s.cardIndex + 1} of ${s.cardCount}`, prev.x + PAGER.w + 48, y + 22, MONO(21, { color: C.text, align: "center" }));
  }
  y += 60;
  if (c.sensorFirst) {
    const band = MONO(22, { color: C.warn });
    box(ctx, { x, y, w: inner, h: 42 }, 8, rgba(C.warn, 0.1), rgba(C.warn, 0.6));
    text(ctx, c.sensorFirst, x + 14, y + 21, { ...band, size: fitSize(ctx, c.sensorFirst, inner - 28, band, 15) });
    y += 54;
  }
  text(ctx, "RECOMMENDED ACTION", x, y + 12, MONO(19));
  y += 30;
  const headStyle = T(40, { weight: 700, color: C.text });
  const costW = measure(ctx, c.cost, headStyle) + 26;
  const head = wrap(ctx, c.headline, inner - costW, headStyle).slice(0, 2);
  const yHead = y;
  y = lines(ctx, head, x, y, 48, headStyle);
  text(ctx, c.cost, x1 - 24, yHead + (head.length - 1) * 48 + 24, { ...headStyle, color: C.accent, align: "right" });
  text(ctx, STAT_WORDS.plans.toUpperCase(), x1 - 24, yHead - 18, MONO(16, { align: "right" }));
  y += 12;

  let confirm: Rect | null = null, renew: Rect | null = null;
  const showConfirm = c.confirm.kind === "open" && c.canConfirm;
  if (showConfirm) {
    confirm = { x, y, w: BTN.w, h: BTN.h };
    y += BTN.h + 14;
  } else if (c.confirm.kind === "confirmed") {
    const pw = measure(ctx, "✓ Confirmed", T(26, { weight: 700 })) + 32;
    box(ctx, { x, y: y + 2, w: pw, h: 46 }, 23, rgba(C.accent, 0.14), C.accent, 2);
    text(ctx, "✓ Confirmed", x + 16, y + 25, T(26, { weight: 700, color: C.accent }));
    text(ctx, ellipsize(ctx, c.confirm.text, inner - pw - 20, B(24)), x + pw + 16, y + 25, B(24, { color: C.grey3 }));
    y += 58;
  } else if (c.confirm.kind === "changed") {
    const rows = wrap(ctx, c.confirm.text, inner - 30, B(24)).slice(0, 3);
    const bh = 14 + 34 + rows.length * 30 + (c.confirm.renew ? RENEW.h + 14 : 0) + 8;
    box(ctx, { x, y, w: inner, h: bh }, 10, rgba(C.warn, 0.08), rgba(C.warn, 0.5));
    text(ctx, CHANGED_WORD, x + 16, y + 14 + 17, MONO(22, { color: C.warn }));
    const yy = lines(ctx, rows, x + 16, y + 14 + 34, 30, B(24, { color: C.text }));
    if (c.confirm.renew) renew = { x: x + 16, y: yy + 8, w: RENEW.w, h: RENEW.h };
    y += bh + 12;
  }
  if (s.error) {
    text(ctx, ellipsize(ctx, `▲ ${s.error}`, inner, B(24)), x, y + 14, B(24, { color: C.alert }));
    y += 32;
  }
  // This pump's own numbers, three across.
  const f = c.pump;
  const facts = [
    ["LEVEL", f.level], ["FILL RATE", f.fill], ["HOURS TO LIMIT", f.toLimit],
    ["LOST REVENUE", f.lostPerHour], ["TRUCK ETA", f.truckEta], ["WELLS AFFECTED", f.wells],
  ];
  const colW = inner / 3, rowH = Math.max(62, Math.min(92, Math.floor((bottom - 22 - y) / 2)));
  const rowsFit = Math.max(0, Math.min(2, Math.floor((bottom - 12 - y) / rowH)));
  ctx.fillStyle = C.line;
  if (rowsFit) ctx.fillRect(x, y, inner, 2);
  y += 10;
  facts.slice(0, rowsFit * 3).forEach(([k, v], i) => {
    const cx = x + (i % 3) * colW, cy = y + Math.floor(i / 3) * rowH;
    const big = rowH >= 80 ? 36 : 30;
    text(ctx, k, cx, cy + 16, MONO(18));
    text(ctx, ellipsize(ctx, v, colW - 16, T(big)), cx, cy + 16 + big * 0.55 + 22, T(big, { weight: 600, color: k === "HOURS TO LIMIT" ? C.alert : C.text }));
  });
  return { y: bottom, confirm, renew, prev, next };
}

// Sensors to check, at the top of the Go to column.
const SENSOR_ROW_H = 76, SENSORS_MAX = 2;
function goToPerPage(sensorCount: number): number {
  const n = Math.min(SENSORS_MAX, sensorCount);
  return n ? Math.max(2, PER_PAGE - n - 1) : PER_PAGE;
}

function sensors(ctx: Ctx, s: BoardSpec, y0: number): number {
  const list = s.m.sensors, n = Math.min(SENSORS_MAX, list.length);
  if (n === 0) return y0;
  const x0 = RIGHT.x0, x1 = RIGHT.x1;
  let y = y0;
  text(ctx, "SENSORS TO CHECK", x0, y + 14, MONO(20, { color: C.warn }));
  if (list.length > n) text(ctx, `+${list.length - n}`, x1, y + 14, MONO(20, { align: "right" }));
  y += 32;
  for (const r of list.slice(0, n)) {
    box(ctx, { x: x0, y, w: x1 - x0, h: SENSOR_ROW_H }, 10, rgba(C.warn, 0.08), rgba(C.warn, 0.5));
    text(ctx, `${r.icon} ${r.word}`, x0 + 16, y + 22, MONO(22, { color: C.warn }));
    if (r.simulated) text(ctx, "SIMULATED", x1 - 14, y + 22, MONO(18, { color: C.warn, align: "right" }));
    text(ctx, ellipsize(ctx, r.what, x1 - x0 - 30, T(26)), x0 + 16, y + 54, T(26, { color: C.text }));
    y += SENSOR_ROW_H + 8;
  }
  return y + 6;
}

function tabs(ctx: Ctx, s: BoardSpec, y: number): { id: BoardTab; r: Rect }[] {
  const x0 = RIGHT.x0, w = (RIGHT.x1 - x0 - 8) / 2;
  const out: { id: BoardTab; r: Rect }[] = [
    { id: "forecast", r: { x: x0, y, w, h: TAB.h } },
    { id: "goto", r: { x: x0 + w + 8, y, w, h: TAB.h } },
  ];
  for (const t of out) button(ctx, t.r, t.id === "forecast" ? "Forecast" : "Go to", s.tab === t.id, true, 24);
  return out;
}

function goTo(ctx: Ctx, s: BoardSpec, y0: number): { rows: { id: string; r: Rect }[]; more: Rect | null } {
  const x0 = RIGHT.x0, x1 = RIGHT.x1;
  const top = sensors(ctx, s, y0);
  text(ctx, "WALK A PAD, LIFE SIZE", x0, top + 14, MONO(20));
  const rowsTop = top + 34;
  const out: { id: string; r: Rect }[] = [];
  s.rows.forEach((row, i) => {
    const r: Rect = { x: x0, y: rowsTop + i * (ROW_H + ROW_GAP), w: x1 - x0, h: ROW_H };
    const here = row.facility_id === s.here;
    const tone = TONE_COLOR[row.tone];
    box(ctx, r, 10, C.raised, here ? C.accent : C.line, 2);
    dot(ctx, r.x + 26, r.y + r.h / 2, 8, row.tone === "ok" ? C.grey1 : tone);
    text(ctx, row.label, r.x + 48, r.y + r.h / 2, T(30, { weight: 600, color: C.text }));
    const right = here ? "YOU ARE HERE" : row.state;
    text(ctx, right, r.x + r.w - 16, r.y + r.h / 2, MONO(right.length > 11 ? 17 : 20, { color: here ? C.accent : row.tone === "ok" ? C.grey2 : tone, align: "right" }));
    out.push({ id: row.facility_id, r });
  });
  let more: Rect | null = null;
  if (s.pageCount > 1) {
    more = { x: x0, y: rowsTop + s.rows.length * (ROW_H + ROW_GAP), w: x1 - x0, h: ROW_H - 12 };
    box(ctx, more, 10, C.raised, C.line);
    text(ctx, "More ›", more.x + 20, more.y + more.h / 2, T(26, { color: C.accent }));
    text(ctx, `${s.pageIndex + 1} of ${s.pageCount}`, more.x + more.w - 16, more.y + more.h / 2, MONO(20, { align: "right" }));
  }
  return { rows: out, more };
}

// Forecast: the tank level with and without the plan, rate in vs rate out, and Simulate.
function forecast(ctx: Ctx, s: BoardSpec, y0: number, bottom: number): { kind: string; r: Rect }[] {
  const x0 = RIGHT.x0, x1 = RIGHT.x1, w = x1 - x0;
  let y = y0;
  if (!s.card) {
    lines(ctx, wrap(ctx, "No pump failure to forecast. Open the Go to tab to walk a pad.", w, B(26)), x0, y, 34, B(26, { color: C.grey3 }));
    return [];
  }
  const simH = SIM.h + 40 + (s.sim ? 30 + s.sim.lines.length * 28 : 0);
  const room = bottom - y - simH;
  const levelH = Math.max(150, Math.round(room * 0.6)), rateH = Math.max(110, room - levelH - 12);
  if (s.level) paintChart(ctx, s.level, { x: x0, y, w, h: levelH });
  else box(ctx, { x: x0, y, w, h: levelH }, 10, C.panel, C.line);
  y += levelH + 12;
  if (s.rate) paintChart(ctx, s.rate, { x: x0, y, w, h: rateH });
  else {
    box(ctx, { x: x0, y, w, h: rateH }, 10, C.panel, C.line);
    text(ctx, "No rate data for this pad yet.", x0 + 14, y + rateH / 2, B(22, { color: C.grey2 }));
  }
  y += rateH + 14;
  text(ctx, "SIMULATE", x0, y + 12, MONO(20));
  y += 28;
  const bw = (w - 10) / 2;
  const out = s.sims.map((c, i) => {
    const r: Rect = { x: x0 + i * (bw + 10), y, w: bw, h: SIM.h };
    button(ctx, r, c.label, s.sim?.label === c.label, true, 24);
    return { kind: c.kind, r };
  });
  y += SIM.h + 10;
  if (s.sim) {
    const head = s.sim.busy ? `Simulating: ${s.sim.label}…` : s.sim.error ? `▲ ${s.sim.error}` : `Simulated: ${s.sim.label}`;
    text(ctx, ellipsize(ctx, head, w, T(24)), x0, y + 12, T(24, { color: s.sim.error ? C.alert : C.accent }));
    y += 30;
    s.sim.lines.forEach((l, i) => text(ctx, ellipsize(ctx, l, w, B(22)), x0, y + 12 + i * 28, B(22, { color: C.text })));
  }
  return out;
}

const boardPainter: Painter<BoardSpec, BoardMeta> = {
  size: () => ({ w: W, h: H }),
  paint(ctx, s) {
    // A flat, opaque panel with a thin border: nothing behind it shows through its words.
    box(ctx, { x: 2, y: 2, w: W - 4, h: H - 4 }, 20, C.panel, C.line, 2);
    const { close, insight, health } = header(ctx, s);
    const comfort = footer(ctx, s);
    const bottom = FOOTER_Y - 18;
    const none = { confirm: null, renew: null, alarm: null, close, comfort, rows: [], more: null, prev: null, next: null, tabs: [], sims: [], insight, health };
    if (s.insight) {
      const im = paintInsight(ctx, s.insight, { x0: M, x1: W - M, y0: HEADER_H + 30, bottom });
      return { ...none, insightPrev: im.prev, insightNext: im.next };
    }
    let y = HEADER_H + 30;
    let confirm: Rect | null = null, renew: Rect | null = null, prev: Rect | null = null, next: Rect | null = null;
    if (!s.m.now) {
      text(ctx, s.status === "connected" ? "No site loaded yet." : "Waiting for the live data…", LEFT.x0, y + 24, B(32, { color: C.grey3 }));
      y += 60;
    } else if (s.m.stats) {
      y = tiles(ctx, s, y) + 16;
    } else if (s.m.calm) {
      y = lines(ctx, wrap(ctx, `✓ ${s.m.calm}`, LEFT.x1 - LEFT.x0, B(30, { weight: 500 })).slice(0, 2), LEFT.x0, y, 40, B(30, { weight: 500, color: C.text })) + 16;
    }
    if (s.card) ({ confirm, renew, prev, next } = card(ctx, s, y, bottom));
    ctx.fillStyle = C.line;
    ctx.fillRect(LEFT.x1 + 15, HEADER_H + 30, 2, bottom - HEADER_H - 30);
    const tabRects = tabs(ctx, s, HEADER_H + 30);
    const y2 = HEADER_H + 30 + TAB.h + 16;
    let rows: { id: string; r: Rect }[] = [], more: Rect | null = null, sims: { kind: string; r: Rect }[] = [];
    if (s.tab === "goto") ({ rows, more } = goTo(ctx, s, y2));
    else sims = forecast(ctx, s, y2, bottom);
    return { confirm, renew, alarm: null, close, comfort, rows, more, prev, next, tabs: tabRects, sims, insight, insightPrev: null, insightNext: null, health };
  },
};

interface ButtonSpec { label: string; enabled: boolean; w: number; h: number }
const BPAD = 26;
const buttonPainter: Painter<ButtonSpec, null> = {
  size: (s) => ({ w: s.w + 2 * BPAD, h: s.h + 2 * BPAD }),
  paint(ctx, s, cw, ch) {
    const w = cw - 2 * BPAD, h = ch - 2 * BPAD;
    box(ctx, { x: BPAD, y: BPAD, w, h }, 12, s.enabled ? C.accent : C.raised, s.enabled ? C.accent : C.line);
    const style = T(h > 96 ? 40 : 34, { weight: 600, color: s.enabled ? C.text : C.grey2, align: "center" });
    text(ctx, s.label, cw / 2 - (s.enabled ? 14 : 0), ch / 2, style);
    if (s.enabled) {
      const lw = measure(ctx, s.label, style);
      text(ctx, "›", cw / 2 + lw / 2 + 10, ch / 2 - 3, { ...style, size: style.size + 10 });
    }
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
  const [tab, setTab] = useState<BoardTab>("forecast");
  const [insightOpen, setInsightOpen] = useState(false);
  const [insightPage, setInsightPage] = useState(0);
  const [healthOpen, setHealthOpen] = useState(false);
  const [healthPage, setHealthPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sim, setSim] = useState<{ kind: WhatIfKind; label: string; facilityId: string; sinceMs: number; busy: boolean; error: string | null } | null>(null);
  const m = useMemo(() => boardModel(view, confirmations, facilities, localClock, { flows: insight.flows, budget: insight.budget }), [view, confirmations, facilities, insight.flows, insight.budget]);
  const p = page(m.goTo, pageIndex, goToPerPage(m.sensors.length));
  const cardCount = m.cards.length;
  const ci = cardCount ? ((cardIndex % cardCount) + cardCount) % cardCount : 0;
  const shownCard: FixCardModel | null = m.cards[ci] ?? null;
  // The charts for the shown card: a Simulate run on it first, else the engine's own pump_fail
  // run for it, else the recorded level with a straight line at the fill rate.
  const charts = useMemo(() => {
    if (!shownCard) return { level: null as Chart | null, rate: null as Chart | null, simSpec: null as { label: string; lines: string[]; busy: boolean; error: string | null } | null };
    const flow = insight.flows.find((f) => f.facility_id === shownCard.facilityId);
    const rate = rateChart(flow);
    const mine = sim && sim.facilityId === shownCard.facilityId ? sim : null;
    // This screen's own run (clocks may differ a little between the headset and the database).
    const own = insight.scenarios.filter((r) => r.mine);
    const run = mine ? latestRun(own.length ? own : insight.scenarios, shownCard.facilityId, mine.kind, mine.sinceMs - 60000) : null;
    if (mine) {
      const r = run ? simResult(run.ripple) : null;
      return {
        level: r?.chart ?? null, rate,
        simSpec: { label: mine.label, lines: r?.lines ?? [], busy: !run && !mine.error, error: mine.error },
      };
    }
    const base = latestRun(insight.scenarios, shownCard.facilityId, "pump_fail");
    const lvl = view?.alerts.find((x) => x.event.facility_id === shownCard.facilityId)?.event.level_pct;
    const hours = view?.alerts.find((x) => x.event.facility_id === shownCard.facilityId)?.hours_to_limit ?? null;
    // Limit from the card's own countdown (level + fill x hours), so the chart and HOURS TO LIMIT agree.
    const fill = fillPtsH(flow, lvl, hours);
    const level = base?.ripple.projection ? levelFromProjection(base.ripple.projection) : levelFallback(flow, lvl, fill, impliedLimit(lvl, fill, hours));
    return { level, rate, simSpec: null };
  }, [shownCard, insight.flows, insight.scenarios, sim, view]);
  const sims = shownCard ? simChoices(shownCard.assetId, shownCard.tankId) : [];
  // The Insight view: the same figures and pump rows as /insight, built only while it is open.
  const insightSpec = useMemo((): InsightSpec | null => {
    if (!insightOpen) return null;
    const all = insightRows(view, insight.flows, insight.breaches, facilities);
    const ip = page(all, insightPage, INSIGHT_PER_PAGE);
    return { summary: insightSummary(view, insight.budget), rows: ip.rows, pageIndex: ip.index, pageCount: ip.count, total: all.length };
  }, [insightOpen, insightPage, view, insight.flows, insight.breaches, insight.budget, facilities]);
  // The Health view: the same charts, shared scale, failure spans and trip limit as /insight.
  const healthSpec = useMemo((): HealthSpec | null => {
    if (!healthOpen) return null;
    const { items, max } = healthItems(insight.flows, view);
    const hp = page(items, healthPage, HEALTH_PER_PAGE);
    const shutdownPct = insight.scenarios.find((r) => r.ripple.projection)?.ripple.projection?.shutdown_pct ?? 92;
    return { items: hp.rows, max, shutdownPct, pageIndex: hp.index, pageCount: hp.count, total: items.length };
  }, [healthOpen, healthPage, view, insight.flows, insight.scenarios]);
  const panel = usePainted(boardPainter, {
    m, status, rows: p.rows, pageIndex: p.index, pageCount: p.count, here: nav.mode === "ground" ? nav.focus : null, error,
    comfort: nav.comfort, card: shownCard, cardIndex: ci, cardCount, tab, level: charts.level, rate: charts.rate, sim: charts.simSpec,
    sims: sims.map((c) => ({ kind: c.kind, label: c.label })), insight: insightSpec, health: healthOpen,
  });
  const root = useRef<Group>(null);
  const unfold = useRef<Group>(null);
  const openK = useRef(0);
  // With the Health pop-out open the judge turns to read it (its middle is about 50 degrees right),
  // so the dashboard waits for a wider turn before it follows.
  useFollowHead(root, { aheadM: BOARD.aheadM, downM: BOARD.downM, tilt: BOARD_TILT, followDeg: healthOpen ? 75 : BOARD.followDeg, still, active: shown });

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
    setTab("forecast");
    try { await live.whatIf(c.kind, c.asset); } catch (e) {
      setSim({ kind: c.kind, label: c.label, facilityId: shownCard.facilityId, sinceMs, busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  }, [shownCard, live]);

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
            {insightOpen
              ? <HotSpot key="insight-close" name="nav-board-insight-close" r={meta.insight} still={still} onPress={() => setInsightOpen(false)} />
              : <HotSpot key="insight-open" name="nav-board-insight" r={meta.insight} still={still} onPress={() => { setInsightOpen(true); setInsightPage(0); }} />}
            <HotSpot name="nav-board-health" r={meta.health} still={still} onPress={() => { if (!healthOpen) setHealthPage(0); setHealthOpen(!healthOpen); }} />
            {meta.insightPrev && <HotSpot name="nav-board-insight-prev" r={meta.insightPrev} still={still} onPress={() => setInsightPage((i) => i - 1)} />}
            {meta.insightNext && <HotSpot name="nav-board-insight-next" r={meta.insightNext} still={still} onPress={() => setInsightPage((i) => i + 1)} />}
            {meta.prev && <HotSpot name="nav-board-prev" r={meta.prev} still={still} onPress={() => { setCard(ci - 1); setSim(null); }} />}
            {meta.next && <HotSpot name="nav-board-next" r={meta.next} still={still} onPress={() => { setCard(ci + 1); setSim(null); }} />}
            {meta.tabs.map((t) => (
              <HotSpot key={t.id} name={`nav-board-tab-${t.id}`} r={t.r} still={still} onPress={() => setTab(t.id)} />
            ))}
            {meta.sims.map((x) => (
              <HotSpot key={x.kind} name={`nav-board-sim-${x.kind}`} r={x.r} still={still} onPress={() => { void runSim(x.kind); }} />
            ))}
            {meta.rows.map((row) => (
              <HotSpot key={row.id} name={`nav-board-goto-${row.id}`} r={row.r} still={still} onPress={() => nav.setMode("ground", row.id)} />
            ))}
            {meta.more && <HotSpot name="nav-board-more" r={meta.more} still={still} onPress={() => setPage((i) => i + 1)} />}
          </>
        )}
      </group>
    </group>
  );
}
