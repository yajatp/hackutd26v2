// Prediction graphs and what-if for the headset's dashboard, as plain data (no canvas, no three):
// the tank level over time to the truck trip with and without the plan, rate in vs rate out, and
// the "Simulate" choices mapped to whatIf() (lib/eog/whatif.ts, run by the what_if reducer).
// Unit-tested in series.test.ts; painted by chart.ts into the dashboard's one texture.
import type { FlowSeries } from "@/lib/eog/flows";
import type { Projection, Ripple, WhatIfKind } from "@/lib/eog/whatif";
import { money } from "@/lib/eog/alerts";

export type Pt = [number, number];                     // [x, y]
export type LineKey = "past" | "plan" | "noplan" | "lie" | "inflow" | "outflow";
export interface ChartLine { key: LineKey; label: string; pts: Pt[]; dashed?: boolean }
export interface ChartMark { x: number; y: number; label: string }
export interface Chart {
  title: string;
  unit: string;
  x: [number, number];                                 // x range (minutes after now, or hours)
  y: [number, number];
  lines: ChartLine[];
  marks: ChartMark[];
  rule: number | null;                                 // a horizontal limit line (shutdown %)
  note: string | null;                                 // a line under the chart
}

const LABEL: Record<string, { key: LineKey; label: string; dashed?: boolean }> = {
  past: { key: "past", label: "Recorded" },
  plan: { key: "plan", label: "With plan" },
  ignored: { key: "noplan", label: "Without plan", dashed: true },
  flag: { key: "noplan", label: "Without plan", dashed: true },
  lie: { key: "lie", label: "Sensor reading", dashed: true },
};

function range(vals: number[], pad = 0): [number, number] {
  if (!vals.length) return [0, 1];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const k = (hi - lo) * pad;
  return [lo - k, hi + k];
}

// The tank level from a what-if projection: one line per future (the first of each key wins).
export function levelFromProjection(p: Projection, note: string | null = null): Chart {
  const seen = new Set<LineKey>();
  const lines: ChartLine[] = [];
  for (const l of p.lines) {
    const m = LABEL[l.key];
    if (!m || seen.has(m.key) || l.pts.length < 2) continue;
    seen.add(m.key);
    lines.push({ key: m.key, label: m.label, dashed: m.dashed, pts: l.pts.map(([t, v]) => [t, v] as Pt) });
  }
  const marks = p.marks.filter((m) => m.key === "truck" || m.key === "trip").map((m) => ({ x: m.t_min, y: m.level_pct, label: m.key === "truck" ? "Truck" : "Limit" }));
  return {
    title: "Tank level", unit: "%", x: [p.from_min, p.to_min], y: [0, Math.max(100, p.shutdown_pct)],
    lines, marks, rule: p.shutdown_pct, note,
  };
}

// Without a what-if run: the recorded level (flow_series, hourly) and a straight line at the
// current fill rate to the limit. Honest: no plan curve until Simulate runs the engine.
export function levelFallback(flow: FlowSeries | undefined, level: number | undefined, fillPtsH: number | null, shutdownPct = 90, hours = 6): Chart | null {
  const pts = flow?.points ?? [];
  const lastTs = pts.length ? pts[pts.length - 1].end_ts : 0;
  const past: Pt[] = pts.slice(-12).map((q) => [Math.round((q.end_ts - lastTs) / 60), q.level_pct]);
  const now = level ?? (past.length ? past[past.length - 1][1] : undefined);
  if (now === undefined) return null;
  const lines: ChartLine[] = [];
  if (past.length >= 2) lines.push({ key: "past", label: "Recorded", pts: past });
  const marks: ChartMark[] = [];
  if (fillPtsH !== null && fillPtsH > 0) {
    const toLimit = Math.max(0, (shutdownPct - now) / fillPtsH) * 60;
    const end = Math.min(hours * 60, toLimit);
    const noplan: Pt[] = [[0, now], [end, now + (fillPtsH * end) / 60]];
    if (toLimit < hours * 60) { noplan.push([hours * 60, shutdownPct]); marks.push({ x: toLimit, y: shutdownPct, label: "Limit" }); }
    lines.push({ key: "noplan", label: "Without plan", dashed: true, pts: noplan });
  }
  const from = past.length ? past[0][0] : 0;
  return {
    title: "Tank level", unit: "%", x: [from, hours * 60], y: [0, 100], lines, marks, rule: shutdownPct,
    note: "Press Simulate to see the level with the plan.",
  };
}

// The shutdown limit the card's own countdown implies (level + fill rate x hours to limit), so
// the chart's limit line and the card's HOURS TO LIMIT agree. Falls back to the given value.
export function impliedLimit(level: number | undefined, fillPtsH: number | null, hours: number | null, fallback = 90): number {
  if (level === undefined || fillPtsH === null || hours === null || !(fillPtsH > 0) || !(hours > 0)) return fallback;
  const v = level + fillPtsH * hours;
  return Number.isFinite(v) && v > level && v <= 100 ? v : fallback;
}

// Rate in vs rate out over the recorded hours (bpd).
export function rateChart(flow: FlowSeries | undefined, hours = 12): Chart | null {
  const pts = (flow?.points ?? []).slice(-hours);
  if (pts.length < 2) return null;
  const lastTs = pts[pts.length - 1].end_ts;
  const x = (ts: number) => (ts - lastTs) / 3600;
  const ok = (v: number) => (Number.isFinite(v) ? v : 0);
  const inflow: Pt[] = pts.map((q) => [x(q.end_ts), ok(q.inflow_bpd)]);
  const outflow: Pt[] = pts.map((q) => [x(q.end_ts), ok(q.outflow_bpd)]);
  const ys = [...inflow, ...outflow].map((p) => p[1]);
  const last = pts[pts.length - 1];
  return {
    title: "Rate in vs rate out", unit: "bpd", x: [inflow[0][0], 0], y: [0, range(ys, 0.1)[1]],
    lines: [{ key: "inflow", label: "In", pts: inflow }, { key: "outflow", label: "Out", pts: outflow }],
    marks: [], rule: null,
    note: `Now: in ${Math.round(ok(last.inflow_bpd)).toLocaleString("en-US")} bpd, out ${Math.round(ok(last.outflow_bpd)).toLocaleString("en-US")} bpd`,
  };
}

// The two choices on the Simulate popup, and the asset each one runs on.
export interface SimChoice { kind: WhatIfKind; label: string; asset: string }
export function simChoices(pumpId: string, tankId: string): SimChoice[] {
  return [
    { kind: "pump_fail", label: "Pump fails", asset: pumpId },
    { kind: "sensor_spoof", label: "Sensor spoofed", asset: tankId },
  ];
}

export interface RunLite { atMs: number; kind: WhatIfKind; assetId: string; facilityId: string; ripple: Ripple }

// The newest run for this facility (and kind, when given) at or after `sinceMs`.
export function latestRun<T extends RunLite>(runs: readonly T[], facilityId: string, kind?: WhatIfKind, sinceMs = 0): T | null {
  let best: T | null = null;
  for (const r of runs) {
    if (r.facilityId !== facilityId || (kind && r.kind !== kind) || r.atMs < sinceMs) continue;
    if (!best || r.atMs > best.atMs) best = r;
  }
  return best;
}

// "+$905", "-$120", "$0".
export function signedMoney(v: number): string {
  const r = Math.round(v);
  return r > 0 ? `+${money(r)}` : r < 0 ? `-${money(-r)}` : money(0);
}

export interface SimResult { title: string; lines: string[]; chart: Chart | null }

// What the popup shows for one run: the resulting level curve and the cost change.
export function simResult(r: Ripple): SimResult {
  const lines: string[] = [];
  // The engine's "already failed" answer carries zero costs and zero trucks: show its own
  // words, not "$0" lines that contradict the card's tiles.
  const alreadyDown = r.kind === "pump_fail" && (/the pump has already failed$/.test(r.title) || (r.trucks_before === 0 && r.trucks_after === 0 && !!r.plan));
  if (alreadyDown) {
    // Two short lines (the popup ellipsizes): the engine's title and summary.
    const head = r.title.includes(": ") ? r.title.slice(r.title.indexOf(": ") + 2) : r.title;
    lines.push(head ? head[0].toUpperCase() + head.slice(1) : "The pump has already failed");
    if (r.summary) lines.push(r.summary.replace(/^This pump is already down on the console: /, "Console plan: "));
  } else if (r.kind === "pump_fail" || r.kind === "pipeline_leak") {
    lines.push(`Change in response cost ${signedMoney(r.cost_delta)}`);
    lines.push(`Cost if unaddressed ${money(r.do_nothing_cost)} · Spare trucks ${Math.max(0, r.fleet - r.trucks_after)} of ${r.fleet}`);
  } else {
    lines.push(`Exposure ${money(r.exposure ?? r.cost_delta)}`);
    if (r.believed_cost !== null && r.honest_cost !== null) lines.push(`Trusting the sensor ${money(r.believed_cost)} · Checking it first ${money(r.honest_cost)}`);
  }
  return { title: r.title, lines, chart: r.projection ? levelFromProjection(r.projection) : null };
}

// Data point -> pixel inside a box, y up.
export function toPx(p: Pt, box: { x: number; y: number; w: number; h: number }, xr: [number, number], yr: [number, number]): Pt {
  const fx = (p[0] - xr[0]) / (xr[1] - xr[0] || 1), fy = (p[1] - yr[0]) / (yr[1] - yr[0] || 1);
  const c = (v: number) => Math.max(0, Math.min(1, v));
  return [box.x + c(fx) * box.w, box.y + box.h - c(fy) * box.h];
}
