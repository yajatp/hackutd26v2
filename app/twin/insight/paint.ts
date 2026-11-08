// Paints the Insight view into the dashboard's own canvas texture (no meshes per row): the four
// figures, the budget bar (Response cost inside Cost if unaddressed) and one page of the pump
// table, failed pumps first. Sui style: panel #131518, thin borders, white type, Plex Mono labels,
// ONE blue accent, red and amber only for alert states. The words come from rows.ts.
import { C } from "../theme";
import { ellipsize, fitSize, measure, text, type Ctx, type TextStyle } from "../nav/paint";
import { INSIGHT_COLUMNS, type InsightRow, type InsightSummary } from "./rows";

export interface Rect { x: number; y: number; w: number; h: number }
export interface InsightSpec { summary: InsightSummary; rows: InsightRow[]; pageIndex: number; pageCount: number; total: number }
export interface InsightMeta { prev: Rect | null; next: Rect | null }

export const INSIGHT_ROW_H = 50;
export const INSIGHT_PER_PAGE = 6;
const PAGER = { w: 150, h: 52 };

const T = (size: number, extra: Partial<TextStyle> = {}): TextStyle => ({ size, face: "label", weight: 600, ...extra });
const MONO = (size: number, extra: Partial<TextStyle> = {}): TextStyle => ({ size, face: "mono", weight: 500, color: C.grey3, spacing: 1, ...extra });

function box(ctx: Ctx, r: Rect, radius: number, fill: string, stroke?: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function pagerButton(ctx: Ctx, r: Rect, label: string): void {
  box(ctx, r, 10, C.raised, C.line);
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2, T(21, { color: C.text, align: "center" }));
}

function figures(ctx: Ctx, s: InsightSummary, x0: number, x1: number, y: number): number {
  const gap = 12, h = 96, w = (x1 - x0 - 3 * gap) / 4;
  const items = [
    { label: "COST IF UNADDRESSED", big: s.unaddressed, color: C.text, side: "" },
    { label: "RESPONSE COST", big: s.response, color: C.text, side: "" },
    { label: "SAVINGS", big: s.savings, color: C.accent, side: "" },
    { label: "SPARE TRUCKS", big: s.spare, color: s.spareShort ? C.warn : C.text, side: s.inUse.toUpperCase() },
  ];
  items.forEach((it, i) => {
    const r: Rect = { x: x0 + i * (w + gap), y, w, h };
    box(ctx, r, 10, C.raised, C.line);
    const lab = MONO(18);
    const sideW = it.side ? measure(ctx, it.side, MONO(16)) + 12 : 0;
    text(ctx, it.label, r.x + 16, r.y + 24, { ...lab, size: fitSize(ctx, it.label, r.w - 28 - sideW, lab, 13) });
    if (it.side) text(ctx, it.side, r.x + r.w - 14, r.y + 24, MONO(16, { color: C.grey2, align: "right" }));
    const big = T(44, { weight: 700, color: it.color });
    text(ctx, it.big, r.x + 16, r.y + 64, { ...big, size: fitSize(ctx, it.big, r.w - 28, big, 26) });
  });
  return y + h;
}

// The budget bar: the response cost as a blue share of the cost if unaddressed; the rest is saved.
function budgetBar(ctx: Ctx, s: InsightSummary, x0: number, x1: number, y: number): number {
  const w = x1 - x0;
  text(ctx, "THE NIGHT'S BUDGET", x0, y + 12, MONO(18));
  if (!s.hasCost) {
    text(ctx, "No pump failures tonight, so nothing to plan.", x0 + 260, y + 12, T(22, { weight: 500, color: C.grey3 }));
    return y + 30;
  }
  text(ctx, `Cost if unaddressed ${s.unaddressed}`, x1, y + 12, MONO(18, { color: C.grey3, align: "right" }));
  const ty = y + 30, th = 18;
  box(ctx, { x: x0, y: ty, w, h: th }, th / 2, C.raised, C.line);
  const pw = Math.max(th, (w * s.planPct) / 100);
  box(ctx, { x: x0, y: ty, w: Math.min(w, pw), h: th }, th / 2, C.accent);
  const ly = ty + th + 18;
  const planLabel = `Response cost ${s.response}`;
  const saveLabel = `Savings ${s.savings}`;
  const pl = T(20, { weight: 600, color: C.accent });
  const lw = measure(ctx, planLabel, pl);
  // The plan's words sit under its share; the savings' under the rest, right-aligned.
  const px = Math.min(Math.max(x0, x0 + pw - lw), x1 - lw - measure(ctx, saveLabel, pl) - 30);
  text(ctx, planLabel, px, ly, pl);
  text(ctx, saveLabel, x1, ly, T(20, { weight: 600, color: C.text, align: "right" }));
  return ly + 14;
}

function spark(ctx: Ctx, curve: number[], x: number, cy: number, w: number, h: number): void {
  if (curve.length < 2) return;
  ctx.save();
  ctx.strokeStyle = C.grey3;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  curve.forEach((k, i) => {
    const px = x + (i / (curve.length - 1)) * w, py = cy + h / 2 - k * h;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();
}

function table(ctx: Ctx, s: InsightSpec, x0: number, x1: number, y0: number): number {
  const w = x1 - x0;
  const cols: { key: string; label: string; x: number; w: number; right: boolean }[] = [];
  let cx = x0;
  for (const c of INSIGHT_COLUMNS) {
    cols.push({ key: c.key, label: c.label, x: cx, w: c.w * w, right: c.right });
    cx += c.w * w;
  }
  const pad = 12;
  const head = MONO(16);
  for (const c of cols) {
    const lab = ellipsize(ctx, c.label, c.w - 2 * pad, head);
    text(ctx, lab, c.right ? c.x + c.w - pad : c.x + pad, y0 + 12, { ...head, align: c.right ? "right" : "left" });
  }
  let y = y0 + 28;
  ctx.fillStyle = C.line;
  ctx.fillRect(x0, y, w, 2);
  y += 4;
  if (!s.rows.length) {
    text(ctx, "No pump data for this site yet.", x0 + pad, y + 30, T(22, { weight: 500, color: C.grey3 }));
    return y + INSIGHT_ROW_H;
  }
  s.rows.forEach((r, i) => {
    const ry = y + i * INSIGHT_ROW_H, cy = ry + INSIGHT_ROW_H / 2;
    if (r.failed) {
      box(ctx, { x: x0, y: ry + 3, w, h: INSIGHT_ROW_H - 6 }, 8, C.raised);
      ctx.fillStyle = C.alert;
      ctx.fillRect(x0, ry + 9, 4, INSIGHT_ROW_H - 18);
    }
    for (const c of cols) {
      const tx = c.right ? c.x + c.w - pad : c.x + pad, maxW = c.w - 2 * pad;
      const st = (color: string, size = 22, weight: TextStyle["weight"] = 500): TextStyle => T(size, { weight, color, align: c.right ? "right" : "left" });
      let v = "", style = st(C.text);
      switch (c.key) {
        case "pump": v = r.pump; style = st(C.text, 22, 600); break;
        case "status": v = r.status; style = r.failed ? st(C.alert, 19, 600) : st(C.grey2, 19); break;
        case "level": v = r.level; break;
        case "fill": v = r.fill; break;
        case "toLimit": v = r.toLimit; style = r.failed ? st(C.alert, 22, 600) : st(r.ifStopped ? C.grey3 : C.grey2); break;
        case "lost": v = r.lost; break;
        case "eta": v = r.eta; style = st(r.eta === "—" ? C.grey1 : C.text); break;
        case "wells": v = r.wells; break;
        case "response": v = r.response; style = r.response === "—" ? st(C.grey1) : st(C.accent, 22, 700); break;
        case "curve": {
          if (!r.curve.length) { v = "—"; style = st(C.grey1); break; }
          const sw = 48;
          spark(ctx, r.curve, c.x + pad, cy, sw, 22);
          // The cost at the curve's last point (the latest start); the header says "if delayed".
          const end = MONO(16, { color: C.grey3 });
          const full = measure(ctx, r.curveEnd, end) <= maxW - sw - 10 ? r.curveEnd : r.curveLast;
          text(ctx, ellipsize(ctx, full, maxW - sw - 10, end), c.x + pad + sw + 10, cy, end);
          continue;
        }
      }
      text(ctx, ellipsize(ctx, v, maxW, style), tx, cy, style);
    }
  });
  return y + s.rows.length * INSIGHT_ROW_H;
}

// The whole view between the header and the footer.
export function paintInsight(ctx: Ctx, s: InsightSpec, area: { x0: number; x1: number; y0: number; bottom: number }): InsightMeta {
  const { x0, x1, y0, bottom } = area;
  let y = figures(ctx, s.summary, x0, x1, y0) + 18;
  y = budgetBar(ctx, s.summary, x0, x1, y) + 18;
  table(ctx, s, x0, x1, y);
  // Footnote and pager on the bottom line.
  const py = bottom - PAGER.h;
  const shown = s.total ? `${s.pageIndex * INSIGHT_PER_PAGE + 1}-${s.pageIndex * INSIGHT_PER_PAGE + s.rows.length} of ${s.total} pumps` : "";
  const note = `${shown}${shown ? " · " : ""}failed first · running pumps: time to limit if stopped now`;
  let prev: Rect | null = null, next: Rect | null = null;
  const pagerW = s.pageCount > 1 ? 2 * PAGER.w + 110 : 0;
  text(ctx, ellipsize(ctx, note, x1 - x0 - pagerW - 20, MONO(17)), x0, py + PAGER.h / 2, MONO(17, { color: C.grey2 }));
  if (s.pageCount > 1) {
    next = { x: x1 - PAGER.w, y: py, w: PAGER.w, h: PAGER.h };
    prev = { x: next.x - 110 - PAGER.w, y: py, w: PAGER.w, h: PAGER.h };
    pagerButton(ctx, prev, "‹ Previous");
    pagerButton(ctx, next, "Next ›");
    text(ctx, `${s.pageIndex + 1} of ${s.pageCount}`, prev.x + PAGER.w + 55, py + PAGER.h / 2, MONO(21, { color: C.text, align: "center" }));
  }
  return { prev, next };
}
