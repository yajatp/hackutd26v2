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
import { AdditiveBlending, Mesh, type Group, type MeshBasicMaterial } from "three";
import { hhmm } from "@/lib/eog/alerts";
import { useAvonConsole, type AvonConsole, type AvonStatus } from "@/lib/live";
import { C, TONE_COLOR } from "../theme";
import { boardModel, CHANGED_WORD, localClock, page, type BoardModel, type GoRow } from "./board";
import { glowTexture, usePainted, type Painter } from "./glass";
import { corners, dot, ellipsize, fitSize, glass, measure, rgba, scanlines, text, wrap, type Ctx, type TextStyle } from "./paint";
import { BOARD, BOARD_TILT, ease } from "./motion";
import { NO_HIT, useFollowHead, usePress, type PressState } from "./follow";
import { useStill, useView } from "./ViewContext";

const W = BOARD.texW, H = BOARD.texH;    // the panel's texture: 1400 x 868 px
const PPM = W / BOARD.wM;                // about 1176 px per meter: 30 px words are 0.0255 m
const M = 44;                            // outer margin, px
const LEFT = { x0: M, x1: 900 };
const RIGHT = { x0: 944, x1: W - M };
const HEADER_H = 100;
const FOOTER_Y = 772;                    // the footer strip: comfort setting and how to move
const ROW_H = 84, ROW_GAP = 8, ROWS_TOP = 214, PER_PAGE = 5;    // Go to rows 0.06 m tall
const BTN = { w: 470, h: 100 };          // Confirm this plan: 0.34 x 0.071 m
const RENEW = { w: 430, h: 84 };
const CLOSE = 84;                        // 0.06 m

interface Rect { x: number; y: number; w: number; h: number }
interface BoardSpec {
  m: BoardModel;
  status: AvonStatus;
  rows: GoRow[];
  pageIndex: number;
  pageCount: number;
  here: string | null;
  error: string | null;
  comfort: boolean;
}
interface BoardMeta { confirm: Rect | null; renew: Rect | null; rows: { id: string; r: Rect }[]; more: Rect | null; close: Rect; comfort: Rect; alarm: Rect | null }

const T = (size: number, extra: Partial<TextStyle> = {}): TextStyle => ({ size, face: "label", weight: 600, ...extra });
const B = (size: number, extra: Partial<TextStyle> = {}): TextStyle => ({ size, face: "body", weight: 400, ...extra });

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

function glowBar(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function header(ctx: Ctx, s: BoardSpec): Rect {
  const g = ctx.createLinearGradient(0, 0, 0, HEADER_H);
  g.addColorStop(0, rgba(C.holo, 0.22));
  g.addColorStop(1, rgba(C.holo, 0));
  ctx.fillStyle = g;
  ctx.fillRect(4, 4, W - 8, HEADER_H);
  const cy = HEADER_H / 2 + 4;
  ctx.save();
  ctx.translate(M + 12, cy);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = C.holo;
  ctx.shadowColor = C.holo;
  ctx.shadowBlur = 12;
  ctx.fillRect(-10, -10, 20, 20);
  ctx.restore();
  const w = text(ctx, "NIGHT SHIFT", M + 40, cy, T(40, { weight: 700, color: C.holo, spacing: 6, glow: 10 }));
  text(ctx, "DASHBOARD", M + 40 + w + 22, cy, T(40, { color: C.textDim, spacing: 6 }));
  const close: Rect = { x: W - M - CLOSE + 10, y: cy - CLOSE / 2, w: CLOSE, h: CLOSE };
  glass(ctx, close.x, close.y, close.w, close.h, { r: 18, edge: C.holo, edgeAlpha: 0.6, edgePx: 3, tintAlpha: 0.16 });
  ctx.save();
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  const c = { x: close.x + close.w / 2, y: close.y + close.h / 2 }, k = 15;
  ctx.beginPath();
  ctx.moveTo(c.x - k, c.y - k); ctx.lineTo(c.x + k, c.y + k);
  ctx.moveTo(c.x + k, c.y - k); ctx.lineTo(c.x - k, c.y + k);
  ctx.stroke();
  ctx.restore();
  const live = s.status === "connected";
  let x = close.x - 30;
  if (s.m.now !== null) x -= text(ctx, `DATA ${hhmm(s.m.now)} UTC`, x, cy, T(32, { color: C.textDim, align: "right", spacing: 2 })) + 34;
  const word = live ? "LIVE" : s.status === "connecting" ? "CONNECTING" : "OFFLINE";
  const ww = text(ctx, word, x, cy, T(34, { weight: 700, color: live ? C.ok : C.alert, align: "right", spacing: 3 }));
  dot(ctx, x - ww - 20, cy, 9, live ? C.ok : C.alert);
  const rule = ctx.createLinearGradient(0, 0, W, 0);
  rule.addColorStop(0, rgba(C.holo, 0));
  rule.addColorStop(0.3, rgba(C.holo, 0.75));
  rule.addColorStop(0.7, rgba(C.holo, 0.75));
  rule.addColorStop(1, rgba(C.holo, 0));
  ctx.fillStyle = rule;
  ctx.fillRect(M, HEADER_H + 8, W - 2 * M, 2);
  return close;
}

// The comfort setting and a line on how to move, under a hairline.
function footer(ctx: Ctx, s: BoardSpec): Rect {
  ctx.fillStyle = rgba(C.holo, 0.25);
  ctx.fillRect(M, FOOTER_Y - 6, W - 2 * M, 2);
  const label = s.comfort ? "COMFORT ON" : "COMFORT OFF";
  const cw = Math.max(270, measure(ctx, label, T(30, { weight: 700, spacing: 2 })) + 104);
  const r: Rect = { x: M, y: FOOTER_Y + 4, w: cw, h: CLOSE };
  glass(ctx, r.x, r.y, r.w, r.h, s.comfort
    ? { r: r.h / 2, fill: C.holo, fillAlpha: 0.92, edge: C.text, edgeAlpha: 0.8, edgePx: 3 }
    : { r: r.h / 2, edge: C.holoDim, edgeAlpha: 1, edgePx: 3, tintAlpha: 0.12 });
  // A switch knob: left when off, right when on.
  dot(ctx, s.comfort ? r.x + r.w - 34 : r.x + 34, r.y + r.h / 2, 13, s.comfort ? C.skyZenith : C.textDim);
  text(ctx, label, r.x + r.w / 2 + (s.comfort ? -20 : 20), r.y + r.h / 2, T(30, { weight: 700, color: s.comfort ? C.skyZenith : C.text, align: "center", spacing: 2 }));
  if (s.comfort) text(ctx, ellipsize(ctx, "Motion effects off. Every state still shows.", W - 2 * M - cw - 30, B(30)), r.x + cw + 28, r.y + r.h / 2, B(30, { color: C.textDim }));
  return r;
}

// The totals line as three tiles; read left to right they are the console's words.
function tiles(ctx: Ctx, s: BoardSpec, y: number): number {
  const st = s.m.stats!;
  const x0 = LEFT.x0, gap = 14, span = LEFT.x1 - x0 - 2 * gap, h = 112;
  const widths = [0.3, 0.38, 0.32].map((k) => k * span);     // the middle words are the longest
  const items = [
    { big: String(st.failures), small: st.failuresWord, color: C.alert, bigFirst: true },
    { big: st.doNothing, small: "doing nothing costs", color: C.text, bigFirst: false },
    { big: st.plans, small: "these plans cost", color: C.holo, bigFirst: false },
  ];
  items.forEach((it, i) => {
    const r: Rect = { x: x0 + widths.slice(0, i).reduce((a, b) => a + b + gap, 0), y, w: widths[i], h };
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, rgba(it.color, i === 0 ? 0.2 : 0.1));
    g.addColorStop(1, rgba(it.color, 0.02));
    box(ctx, r, 14, g, rgba(it.color, 0.45));
    glowBar(ctx, r.x + 14, r.y + r.h - 5, r.w - 28, 3, it.color);
    if (it.bigFirst) {
      const bw = text(ctx, it.big, r.x + 22, r.y + 56, T(72, { weight: 700, color: it.color, glow: 14 }));
      const words = wrap(ctx, it.small, r.w - bw - 50, B(30, { weight: 500 })).slice(0, 2);
      lines(ctx, words, r.x + 22 + bw + 16, r.y + 56 - 18 * words.length, 36, B(30, { weight: 500, color: C.text }));
    } else {
      const small = B(30, { weight: 500, color: C.textDim });
      text(ctx, it.small, r.x + 20, r.y + 27, { ...small, size: fitSize(ctx, it.small, r.w - 36, small, 26) });
      text(ctx, it.big, r.x + 20, r.y + 76, T(fitSize(ctx, it.big, r.w - 36, T(60, { weight: 700 }), 44), { weight: 700, color: it.color, glow: i === 2 ? 12 : 0 }));
    }
  });
  return y + h;
}

// The top fix card. `details` off drops the console's detail line (when the panel is full).
function card(ctx: Ctx, s: BoardSpec, y0: number, withDetails = true): { y: number; confirm: Rect | null; renew: Rect | null; alarm: Rect | null } {
  const c = s.m.top!;
  const x0 = LEFT.x0, x1 = LEFT.x1, x = x0 + 34, inner = x1 - 28 - x;
  const headStyle = T(56, { weight: 700, color: C.text });
  const costW = measure(ctx, c.cost, headStyle) + 30;
  const head = wrap(ctx, c.headline, inner - costW, headStyle).slice(0, 2);
  const changedRows = c.confirm.kind === "changed" ? wrap(ctx, c.confirm.text, inner - 36, B(30)).slice(0, 4) : [];
  const CH = { top: 16, title: 44, row: 38 };
  const showConfirm = c.confirm.kind === "open" && c.canConfirm;
  let h = 26 + 44 + (c.sensorFirst ? 60 : 6) + 34 + head.length * 62 + 16;
  if (showConfirm) h += BTN.h + 16;
  else if (c.confirm.kind === "confirmed") h += 64;
  else if (c.confirm.kind === "changed") h += CH.top + CH.title + changedRows.length * CH.row + (c.confirm.renew ? RENEW.h + 18 : 0) + 18;
  const detail = c.details && withDetails ? wrap(ctx, c.details, inner, B(30)).slice(0, 2) : [];
  h += detail.length * 38 + (detail.length ? 6 : 0);
  if (s.error) h += 42;
  h += 8;

  const bg = ctx.createLinearGradient(x0, 0, x1, 0);
  bg.addColorStop(0, rgba(C.alert, 0.26));
  bg.addColorStop(0.6, rgba(C.alert, 0.07));
  bg.addColorStop(1, rgba(C.alert, 0.03));
  box(ctx, { x: x0, y: y0, w: x1 - x0, h }, 16, bg, rgba(C.alert, 0.4));
  const alarm: Rect = { x: x0, y: y0, w: 9, h };
  glowBar(ctx, alarm.x, alarm.y + 6, alarm.w, alarm.h - 12, C.alert);

  let y = y0 + 26;
  text(ctx, `${c.facility} · pump failed`, x, y + 20, T(36, { color: C.text }));
  if (c.when) text(ctx, `▲ ${c.when}`, x1 - 28, y + 20, T(36, { weight: 700, color: C.alert, align: "right", glow: 10 }));
  y += 44;
  if (c.sensorFirst) {
    // The console's words in full: shrink to fit, never cut a state word.
    const band = T(31, { weight: 700, color: C.warn });
    box(ctx, { x, y: y + 6, w: inner, h: 46 }, 10, rgba(C.warn, 0.14), rgba(C.warn, 0.7));
    text(ctx, c.sensorFirst, x + 16, y + 29, { ...band, size: fitSize(ctx, c.sensorFirst, inner - 32, band, 22) });
    y += 60;
  } else y += 6;
  text(ctx, "Do this:", x, y + 16, B(31, { color: C.textDim }));
  y += 34;
  const yHead = y;
  y = lines(ctx, head, x, y, 62, { ...headStyle, glow: 4 });
  text(ctx, c.cost, x1 - 28, yHead + (head.length - 1) * 62 + 31, { ...headStyle, align: "right", glow: 4 });
  y += 16;

  let confirm: Rect | null = null, renew: Rect | null = null;
  if (showConfirm) {
    confirm = { x, y, w: BTN.w, h: BTN.h };
    box(ctx, { x: x - 4, y: y + 6, w: BTN.w + 8, h: BTN.h + 4 }, 22, rgba(C.skyZenith, 0.7));
    y += BTN.h + 16;
  } else if (c.confirm.kind === "confirmed") {
    const pw = measure(ctx, "✓ CONFIRMED", T(32, { weight: 700 })) + 36;
    box(ctx, { x, y: y + 4, w: pw, h: 52 }, 26, rgba(C.ok, 0.14), C.ok, 3);
    text(ctx, "✓ CONFIRMED", x + 18, y + 31, T(32, { weight: 700, color: C.ok }));
    text(ctx, c.confirm.text, x + pw + 18, y + 31, B(31, { color: C.textDim }));
    y += 64;
  } else if (c.confirm.kind === "changed") {
    const bh = CH.top + CH.title + changedRows.length * CH.row + (c.confirm.renew ? RENEW.h + 18 : 0);
    box(ctx, { x, y, w: inner, h: bh }, 12, rgba(C.warn, 0.13));
    glowBar(ctx, x, y + 4, 6, bh - 8, C.warn);
    text(ctx, `● ${CHANGED_WORD}`, x + 22, y + CH.top + CH.title / 2, T(34, { weight: 700, color: C.warn, glow: 8 }));
    const yy = lines(ctx, changedRows, x + 22, y + CH.top + CH.title, CH.row, B(30, { color: C.text }));
    if (c.confirm.renew) renew = { x: x + 22, y: yy + 10, w: RENEW.w, h: RENEW.h };
    y += bh + 18;
  }
  if (detail.length) y = lines(ctx, detail, x, y, 38, B(30, { color: C.textDim })) + 6;
  if (s.error) text(ctx, ellipsize(ctx, `▲ ${s.error}`, inner, B(30)), x, y + 18, B(30, { color: C.alert }));
  return { y: y0 + h, confirm, renew, alarm };
}

// Sensors to check, at the top of the right column (the attack moment's second signal): the
// console's badge word, SIMULATED, and the asset, two lines a row.
const SENSOR_ROW_H = 84, SENSORS_MAX = 2;
function sensorRowsShown(s: BoardSpec): number {
  return Math.min(SENSORS_MAX, s.m.sensors.length);
}
// Go to rows per page: fewer while sensors share the column.
function goToPerPage(sensorCount: number): number {
  const n = Math.min(SENSORS_MAX, sensorCount);
  return n ? Math.max(2, PER_PAGE - n - 1) : PER_PAGE;
}

function sensors(ctx: Ctx, s: BoardSpec, y0: number): number {
  const list = s.m.sensors, n = sensorRowsShown(s);
  if (n === 0) return y0;
  const x0 = RIGHT.x0, x1 = RIGHT.x1;
  let y = y0;
  text(ctx, "SENSORS TO CHECK", x0, y + 18, T(31, { weight: 700, color: C.warn, spacing: 3, glow: 6 }));
  if (list.length > n) text(ctx, `+${list.length - n}`, x1, y + 18, T(31, { weight: 700, color: C.textDim, align: "right" }));
  y += 40;
  for (const r of list.slice(0, n)) {
    box(ctx, { x: x0, y, w: x1 - x0, h: SENSOR_ROW_H }, 12, rgba(C.warn, 0.14), rgba(C.warn, 0.55));
    glowBar(ctx, x0, y + 6, 6, SENSOR_ROW_H - 12, C.warn);
    text(ctx, `${r.icon} ${r.word}`, x0 + 22, y + 24, T(32, { weight: 700, color: C.warn }));
    if (r.simulated) {
      const sw = measure(ctx, "SIMULATED", T(26, { weight: 700, spacing: 2 })) + 24;
      box(ctx, { x: x1 - 14 - sw, y: y + 8, w: sw, h: 32 }, 6, rgba(C.warn, 0.12), C.warn);
      text(ctx, "SIMULATED", x1 - 14 - sw + 12, y + 24, T(26, { weight: 700, color: C.warn, spacing: 2 }));
    }
    text(ctx, ellipsize(ctx, r.what, x1 - x0 - 36, T(30)), x0 + 22, y + 60, T(30, { color: C.text }));
    y += SENSOR_ROW_H + 8;
  }
  return y + 10;
}

// The console's other fix cards, one line each.
function others(ctx: Ctx, s: BoardSpec, y0: number, bottom: number): number {
  const list = s.m.others;
  if (list.length === 0 || y0 + 42 + 86 > bottom) return y0;
  const x0 = LEFT.x0, x1 = LEFT.x1;
  let y = y0;
  text(ctx, "ALSO FAILING", x0, y + 18, T(31, { weight: 700, color: C.holo, spacing: 4 }));
  y += 42;
  for (const o of list) {
    if (y + 86 > bottom) break;
    box(ctx, { x: x0, y, w: x1 - x0, h: 80 }, 10, rgba(C.alert, 0.1));
    glowBar(ctx, x0, y + 4, 5, 72, C.alert);
    text(ctx, `${o.facility} · pump failed${o.confirmed ? " · ✓ CONFIRMED" : ""}`, x0 + 22, y + 22, T(30, { color: C.text }));
    if (o.when) text(ctx, `▲ ${o.when}`, x1 - 18, y + 22, T(30, { weight: 700, color: C.alert, align: "right" }));
    const cw = text(ctx, o.cost, x1 - 18, y + 58, T(32, { weight: 700, color: C.text, align: "right" }));
    text(ctx, ellipsize(ctx, `Do this: ${o.headline}`, x1 - x0 - cw - 70, B(30, { weight: 500 })), x0 + 22, y + 58, B(30, { weight: 500, color: C.textDim }));
    y += 88;
  }
  return y;
}

function goTo(ctx: Ctx, s: BoardSpec): { rows: { id: string; r: Rect }[]; more: Rect | null } {
  const x0 = RIGHT.x0, x1 = RIGHT.x1;
  const g = ctx.createLinearGradient(0, HEADER_H + 20, 0, FOOTER_Y - 20);
  g.addColorStop(0, rgba(C.holo, 0.5));
  g.addColorStop(1, rgba(C.holo, 0));
  ctx.fillStyle = g;
  ctx.fillRect(922, HEADER_H + 26, 2, FOOTER_Y - HEADER_H - 50);
  const top = sensors(ctx, s, HEADER_H + 30);
  const shift = top - (HEADER_H + 30);
  text(ctx, "GO TO", x0, 150 + shift, T(31, { weight: 700, color: C.holo, spacing: 4 }));
  text(ctx, "Walk a pad, life size", x0, 188 + shift, B(30, { color: C.textDim }));
  const rowsTop = ROWS_TOP + shift;
  const out: { id: string; r: Rect }[] = [];
  s.rows.forEach((row, i) => {
    const r: Rect = { x: x0, y: rowsTop + i * (ROW_H + ROW_GAP), w: x1 - x0, h: ROW_H };
    const here = row.facility_id === s.here;
    const tone = TONE_COLOR[row.tone];
    glass(ctx, r.x, r.y, r.w, r.h, { r: 14, edge: here ? C.holo : row.tone === "ok" ? C.holoDim : tone, edgeAlpha: here ? 1 : 0.6, edgePx: here ? 4 : 2, tint: row.tone === "ok" ? C.holo : tone, tintAlpha: row.tone === "ok" ? 0.06 : 0.2 });
    dot(ctx, r.x + 30, r.y + r.h / 2, 10, tone);
    text(ctx, row.label, r.x + 56, r.y + r.h / 2, T(34, { weight: 700, color: C.text }));
    const right = here ? "YOU ARE HERE" : row.state;
    text(ctx, right, r.x + r.w - 20, r.y + r.h / 2, T(right.length > 11 ? 26 : 30, { weight: 700, color: here ? C.holo : row.tone === "ok" ? C.textDim : tone, align: "right", spacing: 1 }));
    out.push({ id: row.facility_id, r });
  });
  let more: Rect | null = null;
  if (s.pageCount > 1) {
    more = { x: x0, y: rowsTop + s.rows.length * (ROW_H + ROW_GAP), w: x1 - x0, h: ROW_H };
    glass(ctx, more.x, more.y, more.w, more.h, { r: 14, edge: C.holo, edgeAlpha: 0.45, edgePx: 2, tintAlpha: 0.1 });
    text(ctx, "More  ›", more.x + 24, more.y + more.h / 2, T(32, { weight: 700, color: C.holo }));
    text(ctx, `${s.pageIndex + 1} / ${s.pageCount}`, more.x + more.w - 20, more.y + more.h / 2, T(30, { color: C.textDim, align: "right" }));
  }
  return { rows: out, more };
}

const boardPainter: Painter<BoardSpec, BoardMeta> = {
  size: () => ({ w: W, h: H }),
  paint(ctx, s) {
    glass(ctx, 3, 3, W - 6, H - 6, { r: 34, edge: C.holo, edgeAlpha: 0.85, edgePx: 4, tintAlpha: 0.12 });
    // A dark veil behind the words (with the glass, about 95% opaque), so nothing behind the
    // dashboard (the world, another panel) ever shows through its text.
    box(ctx, { x: 8, y: 8, w: W - 16, h: H - 16 }, 30, rgba(C.skyZenith, 0.75));
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(6, 6, W - 12, H - 12, 30);
    ctx.clip();
    ctx.strokeStyle = rgba(C.holo, 0.045);
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 56) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 56) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();
    scanlines(ctx, 6, 6, W - 12, H - 12, 5, rgba(C.holo, 0.025));
    corners(ctx, 3, 3, W - 6, H - 6, 46, C.holo, 5, 14);
    const close = header(ctx, s);
    const comfort = footer(ctx, s);
    const bottom = FOOTER_Y - 12;
    let y = HEADER_H + 30;
    let confirm: Rect | null = null, renew: Rect | null = null, alarm: Rect | null = null;
    if (!s.m.now) {
      text(ctx, s.status === "connected" ? "No site loaded yet." : "Waiting for the live data…", LEFT.x0, y + 24, B(34, { color: C.textDim }));
      y += 60;
    } else if (s.m.stats) {
      y = tiles(ctx, s, y) + 18;
    } else if (s.m.calm) {
      y = lines(ctx, wrap(ctx, `✓ ${s.m.calm}`, LEFT.x1 - LEFT.x0, B(33, { weight: 500 })).slice(0, 2), LEFT.x0, y, 42, B(33, { weight: 500, color: C.ok })) + 18;
    }
    // The fix card always fits whole: when the panel is full its detail line goes first.
    if (s.m.top) {
      const scratch = document.createElement("canvas").getContext("2d")!;
      const withDetails = y + card(scratch, s, y, true).y - y <= bottom;
      const c = card(ctx, s, y, withDetails);
      ({ confirm, renew, alarm } = c);
      y = c.y + 22;
    }
    others(ctx, s, y, bottom);
    const g = goTo(ctx, s);
    return { confirm, renew, alarm, close, comfort, rows: g.rows, more: g.more };
  },
};

interface ButtonSpec { label: string; enabled: boolean; w: number; h: number }
const BPAD = 26;
const buttonPainter: Painter<ButtonSpec, null> = {
  size: (s) => ({ w: s.w + 2 * BPAD, h: s.h + 2 * BPAD }),
  paint(ctx, s, cw, ch) {
    const w = cw - 2 * BPAD, h = ch - 2 * BPAD;
    if (s.enabled) glass(ctx, BPAD, BPAD, w, h, { r: h * 0.24, fill: C.holo, fillAlpha: 0.96, edge: C.text, edgeAlpha: 0.9, edgePx: 4, glowPx: 22 });
    else glass(ctx, BPAD, BPAD, w, h, { r: h * 0.24, edge: C.holoDim, edgeAlpha: 0.9, edgePx: 3, tintAlpha: 0.1 });
    const style = T(h > 96 ? 44 : 38, { weight: 700, color: s.enabled ? C.skyZenith : C.textDim, align: "center", spacing: 1 });
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

// A pressable spot drawn into the panel texture: an invisible hit plane and a cyan highlight.
function HotSpot({ name, r, still, onPress }: { name: string; r: Rect; still: boolean; onPress(): void }) {
  const { state, handlers } = usePress(onPress);
  const { mat } = useHoverGlow(state, still, 0, 0.32);
  const m = toM(r);
  return (
    <group position={[m.x, m.y, 0.002]}>
      <mesh raycast={NO_HIT} renderOrder={4}>
        <planeGeometry args={[m.w, m.h]} />
        <meshBasicMaterial ref={mat} color={C.holo} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
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
  const glowTex = useMemo(() => glowTexture(256, 128, 34, 30), []);
  const { state, handlers } = usePress(onPress, enabled);
  const root = useRef<Group>(null);
  const glow = useRef<MeshBasicMaterial>(null);
  const k = useRef({ hover: 0, down: 0 });
  const m = toM(r);
  const fw = (r.w + 2 * BPAD) / PPM, fh = (r.h + 2 * BPAD) / PPM;
  useFrame((_, dt) => {
    const ms = Math.min(dt, 0.1) * 1000, s = state.current;
    k.current.hover = ease(k.current.hover, s.hover && enabled ? 1 : 0, ms, still ? 0 : 140);
    k.current.down = ease(k.current.down, s.down && enabled ? 1 : 0, ms, still ? 0 : 60);
    const { hover, down } = k.current;
    if (root.current) {
      root.current.position.set(m.x, m.y, 0.012 + 0.014 * hover - 0.01 * down);
      root.current.scale.setScalar(1 + 0.04 * hover - 0.05 * down);
    }
    const breathe = enabled && !still ? 0.5 + 0.5 * Math.sin(performance.now() / 600) : 0.5;
    const flash = s.flashAt < 0 ? 0 : Math.max(0, 1 - (performance.now() - s.flashAt) / 400);
    if (glow.current) glow.current.opacity = enabled ? Math.min(1, 0.22 + 0.2 * breathe + 0.6 * hover + 0.8 * flash) : 0;
  });
  if (!face) return null;
  return (
    <group ref={root} position={[m.x, m.y, 0.012]}>
      <mesh raycast={NO_HIT} position={[0, 0, -0.003]} scale={[1.25, 1.6, 1]}>
        <planeGeometry args={[fw, fh]} />
        <meshBasicMaterial ref={glow} map={glowTex} color={C.holo} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <mesh {...handlers} renderOrder={5} name={name}>
        <planeGeometry args={[fw, fh]} />
        <meshBasicMaterial map={face.texture} transparent depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}

// The fix card's red rule, breathing like an alarm light (still with reduced motion).
function AlarmBar({ r, still }: { r: Rect; still: boolean }) {
  const glowTex = useMemo(() => glowTexture(64, 256, 24, 6), []);
  const mat = useRef<MeshBasicMaterial>(null);
  const m = toM(r);
  useFrame(() => {
    if (mat.current) mat.current.opacity = still ? 0.6 : 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(performance.now() / 380));
  });
  return (
    <mesh raycast={NO_HIT} position={[m.x, m.y, 0.003]} renderOrder={4}>
      <planeGeometry args={[0.05, m.h * 1.08]} />
      <meshBasicMaterial ref={mat} map={glowTex} color={C.alert} transparent opacity={0.5} blending={AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
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
  const nav = useView();
  const autoStill = useStill();
  const still = stillProp ?? autoStill;
  const shown = open ?? nav.dashboard;
  const [pageIndex, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = useMemo(() => boardModel(view, confirmations, facilities, localClock), [view, confirmations, facilities]);
  const p = page(m.goTo, pageIndex, goToPerPage(m.sensors.length));
  const panel = usePainted(boardPainter, {
    m, status, rows: p.rows, pageIndex: p.index, pageCount: p.count, here: nav.mode === "ground" ? nav.focus : null, error,
    comfort: nav.comfort,
  });
  const root = useRef<Group>(null);
  const unfold = useRef<Group>(null);
  const sweep = useRef<Mesh>(null);
  const openK = useRef(0);
  const openedAt = useRef(-1);
  const panelGlow = useMemo(() => glowTexture(512, 330, 60, 40), []);
  useFollowHead(root, { aheadM: BOARD.aheadM, downM: BOARD.downM, tilt: BOARD_TILT, followDeg: BOARD.followDeg, still, active: shown });

  useFrame((_, dt) => {
    const ms = Math.min(dt, 0.1) * 1000, now = performance.now();
    if (shown && openK.current === 0) openedAt.current = now;
    openK.current = ease(openK.current, shown ? 1 : 0, ms, still ? 0 : 260);
    if (!shown && openK.current < 0.01) openK.current = 0;
    const k = openK.current;
    if (root.current) root.current.visible = k > 0;
    if (unfold.current) unfold.current.scale.set(0.94 + 0.06 * k, Math.max(0.02, k), 1);
    // One scan line sweeps down the panel as it opens.
    const t = (now - openedAt.current) / 520;
    if (sweep.current) {
      sweep.current.visible = shown && !still && t >= 0 && t < 1;
      sweep.current.position.y = BOARD.hM / 2 - t * BOARD.hM;
    }
  });

  const doConfirm = useCallback(async (alertId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await confirm(alertId); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }, [busy, confirm]);

  const meta = panel?.meta;
  const top = m.top;
  const canPress = status === "connected" && !busy;
  return (
    <group ref={root} visible={false}>
      <group ref={unfold}>
        <mesh raycast={NO_HIT} position={[0, 0, -0.01]} scale={[1.16, 1.24, 1]}>
          <planeGeometry args={[BOARD.wM, BOARD.hM]} />
          <meshBasicMaterial map={panelGlow} color={C.holo} transparent opacity={0.22} blending={AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
        </mesh>
        {panel && (
          // Catches the ray only while shown: hidden objects still raycast in r3f and in XR.
          <mesh renderOrder={3} onClick={(e) => e.stopPropagation()} raycast={shown ? PANEL_RAYCAST : NO_HIT}>
            <planeGeometry args={[BOARD.wM, BOARD.hM]} />
            <meshBasicMaterial map={panel.texture} transparent depthWrite={false} toneMapped={false} fog={false} />
          </mesh>
        )}
        <mesh ref={sweep} raycast={NO_HIT} visible={false} renderOrder={6}>
          <planeGeometry args={[BOARD.wM * 0.98, 0.008]} />
          <meshBasicMaterial color={C.holo} transparent opacity={0.8} blending={AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
        </mesh>
        {meta && shown && (
          <>
            {meta.alarm && <AlarmBar r={meta.alarm} still={still} />}
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
