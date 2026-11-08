// The Health view's geometry, as plain numbers (no React, no DOM, so geom.test.ts runs it in Node):
// one "Rate in vs rate out" small multiple per facility, the same chart /insight draws
// (app/insight/FlowChart.tsx): hourly-mean step lines for in and out on one bpd scale shared by every
// chart, a band where in > out (marked "down" for hours the pump had failed), direct labels at the
// right, a 0-100% level strip with the shutdown limit, a time axis and the margin of error.
import type { ConsoleView } from "@/lib/eog/alerts";
import type { FlowSeries } from "@/lib/eog/flows";
import { clock, failureSpans, marginOfError, orderFlows, pretty, sharedMax } from "@/app/insight/format";

export interface Box { x: number; y: number; w: number; h: number }
export type Pt = [number, number];
export interface HealthState { word: string; tone: "red" | "amber" }

// The words /insight puts on each facility's title (InsightScreen.tsx stateOf).
export function healthState(view: ConsoleView | null, fid: string): HealthState | null {
  const a = view?.alerts.find((x) => x.facility.id === fid);
  if (a?.event.category === "pump_failure") return { word: a.hours_to_limit === 0 ? "Tripped" : "Pump failed", tone: "red" };
  if (a) return { word: a.event.category === "pipeline_leak" ? "Leak" : "Pump worn", tone: "amber" };
  const s = view?.sensors.find((x) => x.facility_id === fid);
  if (s) return { word: `Sensor ${s.state}`, tone: "amber" };
  return null;
}

export interface HealthItem {
  series: FlowSeries;
  title: string;
  state: HealthState | null;
  spans: [number, number][];
}

// Every facility's chart, problem facilities first (console order), with one shared scale.
export function healthItems(flows: readonly FlowSeries[], view: ConsoleView | null): { items: HealthItem[]; max: number } {
  const items = orderFlows(flows, view).filter((f) => f.points.length > 0).map((f) => ({
    series: f, title: pretty(f.facility_id), state: healthState(view, f.facility_id), spans: failureSpans(view, f.facility_id),
  }));
  return { items, max: sharedMax(flows) };
}

export interface HealthGeom {
  plot: Box;                                   // the rate panel
  strip: Box;                                  // the level strip
  ticks: { y: number; label: string }[];       // rate axis: full scale, half, zero
  inRuns: Pt[][];                              // step lines, broken where an hour has no data
  outRuns: Pt[][];
  bands: (Box & { down: boolean })[];          // in > out: the tank fills
  inLabel: { y: number; text: string };
  outLabel: { y: number; text: string };
  levelRuns: Pt[][];
  limitY: number;
  limitText: string;
  levelLabel: { y: number; text: string } | null;
  times: { x: number; text: string; align: "left" | "center" | "right" }[];
  moe: string;
}

const fmt = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString("en-US") : "no data");

// Splits points into runs at non-finite values, so a gap in the data is a gap in the line.
function runs(n: number, get: (i: number) => number, pts: (i: number, v: number) => Pt[]): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const v = get(i);
    if (!Number.isFinite(v)) { if (cur.length) out.push(cur); cur = []; continue; }
    cur.push(...pts(i, v));
  }
  if (cur.length) out.push(cur);
  return out;
}

// Pushes two label centres apart to at least `gap` px, keeping their order and their midpoint.
export function apart(a: number, b: number, gap: number): [number, number] {
  if (Math.abs(a - b) >= gap) return [a, b];
  const mid = (a + b) / 2, up = a <= b;
  return [mid + (up ? -gap / 2 : gap / 2), mid + (up ? gap / 2 : -gap / 2)];
}

// One chart's geometry inside `plot` (rate panel) and `strip` (level strip, under it).
export function healthGeom(it: HealthItem, max: number, shutdownPct: number, plot: Box, strip: Box, labelGap = 20): HealthGeom {
  const pts = it.series.points, n = pts.length, step = it.series.step_s;
  const bw = plot.w / Math.max(1, n);
  const x = (i: number) => plot.x + i * bw;
  const yR = (v: number) => plot.y + plot.h - (Math.max(0, Math.min(max, v)) / max) * plot.h;
  const yL = (v: number) => strip.y + strip.h - (Math.max(0, Math.min(100, v)) / 100) * strip.h;
  const down = (i: number) => {
    const end = pts[i].end_ts, start = end - step;
    return it.spans.some(([a, b]) => a < end && b > start);
  };
  const stepRun = (get: (i: number) => number) => runs(n, get, (i, v) => [[x(i), yR(v)], [x(i + 1), yR(v)]]);
  const bands: (Box & { down: boolean })[] = [];
  pts.forEach((p, i) => {
    if (Number.isFinite(p.inflow_bpd) && Number.isFinite(p.outflow_bpd) && p.inflow_bpd > p.outflow_bpd) {
      const top = yR(p.inflow_bpd), bot = yR(p.outflow_bpd);
      if (bot - top > 0) bands.push({ x: x(i), y: top, w: bw, h: bot - top, down: down(i) });
    }
  });
  const last = pts[n - 1];
  const yi = Number.isFinite(last.inflow_bpd) ? yR(last.inflow_bpd) : plot.y + plot.h / 2;
  const yo = Number.isFinite(last.outflow_bpd) ? yR(last.outflow_bpd) : plot.y + plot.h / 2;
  let [li, lo] = apart(yi, yo, labelGap);
  // Keep both labels inside the panel's height.
  const lo0 = plot.y + labelGap / 2 - 4, hi0 = plot.y + plot.h + 4;
  const shift = Math.max(0, lo0 - Math.min(li, lo)) - Math.max(0, Math.max(li, lo) - hi0);
  li += shift; lo += shift;
  const lvl = last.level_pct;
  return {
    plot, strip,
    ticks: [
      { y: plot.y, label: max.toLocaleString("en-US") },
      { y: yR(max / 2), label: (max / 2).toLocaleString("en-US") },
      { y: plot.y + plot.h, label: "0" },
    ],
    inRuns: stepRun((i) => pts[i].inflow_bpd),
    outRuns: stepRun((i) => pts[i].outflow_bpd),
    bands,
    inLabel: { y: li, text: `in ${fmt(last.inflow_bpd)}` },
    outLabel: { y: lo, text: `out ${fmt(last.outflow_bpd)}` },
    // The level is a sample at each hour's end: drawn through those points, not as steps.
    levelRuns: runs(n, (i) => pts[i].level_pct, (i, v) => [[x(i + 1), yL(v)]]),
    limitY: yL(shutdownPct),
    limitText: `trip ${shutdownPct}%`,
    levelLabel: Number.isFinite(lvl) ? { y: Math.min(yL(lvl), strip.y + strip.h - 6), text: `${lvl.toFixed(0)}%` } : null,
    times: [
      { x: plot.x, text: clock(pts[0].end_ts - step), align: "left" },
      { x: plot.x + plot.w / 2, text: clock(pts[Math.floor(n / 2)].end_ts - step), align: "center" },
      { x: plot.x + plot.w, text: `now ${clock(last.end_ts)}`, align: "right" },
    ],
    moe: `Margin of error ${marginOfError(pts).toFixed(1)} pts/h`,
  };
}

// The grid of cells on one page: `cols` x `rows` boxes filling `area` with `gap` px between.
export function healthCells(area: Box, cols: number, rows: number, gap: number): Box[] {
  const w = (area.w - (cols - 1) * gap) / cols, h = (area.h - (rows - 1) * gap) / rows;
  const out: Box[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: area.x + c * (w + gap), y: area.y + r * (h + gap), w, h });
  return out;
}

// The pop-out panel beside the dashboard (Popout.tsx), in meters and radians: as tall as the
// dashboard (1.19 x 0.7378 m) and 1.0 m wide, so its 1176 x 868 px texture has the dashboard's
// 1176 px per meter; hinged 4 cm right of the dashboard's edge and turned 32 degrees toward the
// judge, like a second monitor. It opens over about 300 ms.
export const POPOUT = { wM: 1.0, hM: 0.7378, gapM: 0.04, angle: 0.56, ms: 300, lineM: 0.003, armInsetM: 0.08 } as const;

// The pop-out's pose at open fraction k (0 folded into the dashboard's edge, 1 open): it grows out
// of its hinge (scale x from 0, scale y from 0.82), slides the last 4 cm out of the dashboard's
// edge, fades in a little ahead of its growth, and the bracket in the gap grows with it.
export function popoutPose(k: number): { sx: number; sy: number; slideM: number; alpha: number; bracket: number } {
  const t = Math.max(0, Math.min(1, k));
  return { sx: Math.max(0.001, t), sy: 0.82 + 0.18 * t, slideM: POPOUT.gapM * (t - 1), alpha: Math.min(1, t * 1.6), bracket: Math.max(0.001, t) };
}

// Where a point on the pop-out's face lands in the dashboard's frame (x right, z toward the judge),
// u from 0 (hinge) to 1 (far edge), fully open.
export function popoutPoint(u: number, boardHalfW: number): { x: number; z: number } {
  const d = u * POPOUT.wM;
  return { x: boardHalfW + POPOUT.gapM + d * Math.cos(POPOUT.angle), z: d * Math.sin(POPOUT.angle) };
}
