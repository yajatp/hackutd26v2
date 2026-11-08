// Paints one Chart (series.ts) into a 2D canvas box: thin grid, a dashed limit line, the lines in
// the Sui palette (blue = with plan / rate in, grey = recorded / rate out, red dashed = without
// plan), small mono labels. Drawn into the dashboard's own texture: no meshes per point.
import { C, FONT } from "../theme";
import { toPx, type Chart, type LineKey } from "./series";

type Ctx = CanvasRenderingContext2D;
export interface Box { x: number; y: number; w: number; h: number }

export const LINE_COLOR: Record<LineKey, string> = {
  past: C.grey3, plan: C.accent, noplan: C.alert, lie: C.warn, inflow: C.accent, outflow: C.grey2,
};

function mono(ctx: Ctx, size: number, color: string, align: CanvasTextAlign = "left"): void {
  ctx.font = `500 ${size}px ${FONT.mono}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
}

export function paintChart(ctx: Ctx, chart: Chart, b: Box): void {
  ctx.save();
  // Frame and title.
  ctx.fillStyle = C.panel;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, 10);
  ctx.fill();
  ctx.stroke();
  mono(ctx, 20, C.grey3);
  ctx.fillText(chart.title.toUpperCase(), b.x + 14, b.y + 20);
  const titleW = ctx.measureText(chart.title.toUpperCase()).width;
  // Legend: right aligned on the title row when it fits after the title, else its own row
  // under the title (left aligned, labels that still do not fit are dropped).
  mono(ctx, 18, C.grey3);
  const items = chart.lines.map((l) => ({ l, w: ctx.measureText(l.label).width }));
  // Each item: an 18 px swatch, 8 px, the label, then 30 px before the next swatch.
  const total = items.reduce((a, it) => a + it.w + 56, 0) - 30;
  const oneRow = b.x + 14 + titleW + 36 + total <= b.x + b.w - 14;
  let drop = 0;
  if (oneRow) {
    let lx = b.x + b.w - 14;
    for (const { l, w } of [...items].reverse()) {
      mono(ctx, 18, C.grey3, "right");
      ctx.fillText(l.label, lx, b.y + 20);
      ctx.fillStyle = LINE_COLOR[l.key];
      ctx.fillRect(lx - w - 26, b.y + 19, 18, 3);
      lx -= w + 56;
    }
  } else {
    drop = 26;
    let lx = b.x + 14;
    for (const { l, w } of items) {
      if (lx + 26 + w > b.x + b.w - 14) break;
      ctx.fillStyle = LINE_COLOR[l.key];
      ctx.fillRect(lx, b.y + 45, 18, 3);
      mono(ctx, 18, C.grey3);
      ctx.fillText(l.label, lx + 26, b.y + 46);
      lx += 26 + w + 30;
    }
  }
  // The title row (and the legend row, when it drops) is reserved: the top axis label sits under it.
  const plot: Box = { x: b.x + 54, y: b.y + 54 + drop, w: b.w - 68, h: b.h - (chart.note ? 96 : 74) - drop };
  // Grid: three horizontal rules with their values.
  for (let i = 0; i <= 2; i++) {
    const v = chart.y[0] + ((chart.y[1] - chart.y[0]) * i) / 2;
    const [, py] = toPx([chart.x[0], v], plot, chart.x, chart.y);
    ctx.strokeStyle = C.raised;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(plot.x, py); ctx.lineTo(plot.x + plot.w, py); ctx.stroke();
    mono(ctx, 16, C.grey1, "right");
    ctx.fillText(v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)), plot.x - 8, py);
  }
  // "Now" at x = 0 when it is inside the range.
  if (chart.x[0] < 0 && chart.x[1] > 0) {
    const [nx] = toPx([0, 0], plot, chart.x, chart.y);
    ctx.strokeStyle = C.grey1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(nx, plot.y); ctx.lineTo(nx, plot.y + plot.h); ctx.stroke();
    ctx.setLineDash([]);
    mono(ctx, 16, C.grey2, "left");
    ctx.fillText("NOW", nx + 6, plot.y + 10);
  }
  if (chart.rule !== null) {
    const [, ry] = toPx([0, chart.rule], plot, chart.x, chart.y);
    ctx.strokeStyle = C.alert;
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(plot.x, ry); ctx.lineTo(plot.x + plot.w, ry); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // At the right end, clear of the y-axis labels, just above the line (the reserved strip under
    // the title row takes it when the limit is near the top); under the line only when even that
    // strip has no room.
    mono(ctx, 16, C.alert, "right");
    ctx.fillText(`LIMIT ${Math.round(chart.rule)}${chart.unit}`, plot.x + plot.w - 6, ry - 12 < plot.y - 14 ? ry + 12 : ry - 12);
  }
  for (const l of chart.lines) {
    ctx.strokeStyle = LINE_COLOR[l.key];
    ctx.lineWidth = l.key === "plan" || l.key === "inflow" ? 4 : 3;
    ctx.setLineDash(l.dashed ? [10, 8] : []);
    ctx.lineJoin = "round";
    ctx.beginPath();
    l.pts.forEach((p, i) => {
      const [x, y] = toPx(p, plot, chart.x, chart.y);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const m of chart.marks) {
    const [x, y] = toPx([m.x, m.y], plot, chart.x, chart.y);
    ctx.fillStyle = m.label === "Truck" ? C.accent : C.alert;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    if (m.label === "Truck") {
      mono(ctx, 16, C.text, "center");
      ctx.fillText("TRUCK", Math.min(plot.x + plot.w - 30, Math.max(plot.x + 30, x)), Math.min(plot.y + plot.h - 8, y + 18));
    }
  }
  if (chart.note) {
    mono(ctx, 18, C.grey2);
    ctx.fillText(chart.note, b.x + 14, b.y + b.h - 20);
  }
  ctx.restore();
}
