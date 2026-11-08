"use client";
// One small multiple of "Rate in vs rate out": hourly means over the last 24 h of data.
// Top: water into the tank (in) and the pump (out) on one bpd scale shared by every chart, as step
// lines (each value is an hour's mean). Where in > out the tank fills: a quiet band, red only for
// hours when the pump had failed. Below: the level on its own 0-100% scale, with the shutdown limit.
// No second y-axis on one plot (docs/DESIGN.md, dataviz: one axis per plot). The rate axis has its
// own gutter with 0, half and full scale; the margin of error sits under the chart, not on the axis.
import { useState, type KeyboardEvent, type PointerEvent } from "react";
import type { FlowSeries } from "@/lib/eog/flows";
import { clock, marginOfError } from "./format";

const W = 320;
const GL = 34;                   // left gutter: the y-axis labels
const PW = 236;                  // plot width
const PR = GL + PW;              // plot's right edge; the rest holds the direct labels
const TOP = 6, H1 = 92;          // rate panel
const GAP = 12, H2 = 30;         // level strip
const AX = 16;                   // time axis
const H = TOP + H1 + GAP + H2 + AX;

export interface FlowChartProps {
  series: FlowSeries;
  max: number;                   // shared bpd scale
  spans: [number, number][];     // pump-failure spans (data time)
  shutdownPct: number;
  title: string;
  state?: { word: string; tone: "red" | "amber" } | null;
}

const fmt = (x: number) => (Number.isFinite(x) ? Math.round(x).toLocaleString("en-US") : "no data");

export default function FlowChart({ series, max, spans, shutdownPct, title, state }: FlowChartProps) {
  const pts = series.points;
  const n = pts.length;
  const [hover, setHover] = useState<number | null>(null);
  const bw = PW / n;
  const x0 = (i: number) => GL + i * bw;
  const yR = (v: number) => TOP + H1 - (Math.max(0, Math.min(max, v)) / max) * H1;
  const yL = (v: number) => TOP + H1 + GAP + H2 - (Math.max(0, Math.min(100, v)) / 100) * H2;
  const down = (i: number) => {
    const end = pts[i].end_ts, start = end - series.step_s;
    return spans.some(([a, b]) => a < end && b > start);
  };
  const step = (get: (i: number) => number, y: (v: number) => number) => {
    let d = "";
    for (let i = 0; i < n; i++) {
      const v = get(i);
      if (!Number.isFinite(v)) continue;
      d += `${d ? "L" : "M"}${x0(i).toFixed(1)},${y(v).toFixed(1)}H${x0(i + 1).toFixed(1)}`;
    }
    return d;
  };
  // The level is a sample at each hour's end, so it is drawn through those points, not as steps.
  const line = (get: (i: number) => number, y: (v: number) => number) => {
    let d = "";
    for (let i = 0; i < n; i++) {
      const v = get(i);
      if (!Number.isFinite(v)) continue;
      d += `${d ? "L" : "M"}${x0(i + 1).toFixed(1)},${y(v).toFixed(1)}`;
    }
    return d;
  };
  const last = pts[n - 1];
  const yi = yR(last.inflow_bpd), yo = yR(last.outflow_bpd);
  // Direct labels at the right end; pushed apart when the lines end close together.
  let li = yi, lo = yo;
  if (Math.abs(li - lo) < 12) { const mid = (li + lo) / 2; li = mid + (yi <= yo ? -6 : 6); lo = mid + (yi <= yo ? 6 : -6); }
  const moe = marginOfError(pts);
  const h = hover !== null ? pts[hover] : null;

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    setHover(x > PR ? n - 1 : Math.max(0, Math.min(n - 1, Math.floor((x - GL) / bw))));
  };
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft") { setHover((v) => Math.max(0, (v ?? n) - 1)); e.preventDefault(); }
    else if (e.key === "ArrowRight") { setHover((v) => Math.min(n - 1, (v ?? -1) + 1)); e.preventDefault(); }
    else if (e.key === "Escape") setHover(null);
  };

  return (
    <figure className="in-flow">
      <figcaption className="in-flow-head">
        <span className="in-flow-name">{title}</span>
        {state ? <span className={`in-state in-${state.tone}`}>{state.word}</span> : null}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`} className="in-flow-svg" role="img" tabIndex={0}
        aria-label={`${title}: last hour in ${fmt(last.inflow_bpd)} bpd, out ${fmt(last.outflow_bpd)} bpd, level ${last.level_pct.toFixed(0)}%. Arrow keys read each hour.`}
        onPointerMove={pick} onPointerLeave={() => setHover(null)} onKeyDown={key} onBlur={() => setHover(null)}
      >
        {/* rate panel: zero baseline, half and full scale, labeled in the gutter */}
        <line x1={GL} x2={PR} y1={TOP + H1} y2={TOP + H1} className="in-axis" />
        <line x1={GL} x2={PR} y1={yR(max / 2)} y2={yR(max / 2)} className="in-gridline" />
        <line x1={GL} x2={PR} y1={TOP} y2={TOP} className="in-gridline" />
        <text x={GL - 5} y={TOP + 3.5} textAnchor="end" className="in-tick">{max.toLocaleString("en-US")}</text>
        <text x={GL - 5} y={TOP + 14} textAnchor="end" className="in-tick">bpd</text>
        <text x={GL - 5} y={yR(max / 2) + 3.5} textAnchor="end" className="in-tick">{(max / 2).toLocaleString("en-US")}</text>
        <text x={GL - 5} y={TOP + H1 + 3.5} textAnchor="end" className="in-tick">0</text>
        {pts.map((p, i) => (Number.isFinite(p.inflow_bpd) && Number.isFinite(p.outflow_bpd) && p.inflow_bpd > p.outflow_bpd ? (
          <rect key={i} x={x0(i)} width={bw} y={yR(p.inflow_bpd)} height={Math.max(0, yR(p.outflow_bpd) - yR(p.inflow_bpd))}
            className={down(i) ? "in-gap-down" : "in-gap"} />
        ) : null))}
        <path d={step((i) => pts[i].outflow_bpd, yR)} className="in-line-out" />
        <path d={step((i) => pts[i].inflow_bpd, yR)} className="in-line-in" />
        <text x={PR + 5} y={li + 4} className="in-label in-label-in">in {fmt(last.inflow_bpd)}</text>
        <text x={PR + 5} y={lo + 4} className="in-label in-label-out">out {fmt(last.outflow_bpd)}</text>
        {/* level strip, 0-100% */}
        <line x1={GL} x2={PR} y1={TOP + H1 + GAP + H2} y2={TOP + H1 + GAP + H2} className="in-axis" />
        <line x1={GL} x2={PR} y1={yL(shutdownPct)} y2={yL(shutdownPct)} className="in-limit" />
        <text x={GL - 5} y={TOP + H1 + GAP + H2 / 2 + 3.5} textAnchor="end" className="in-tick">level</text>
        <text x={GL + 2} y={yL(shutdownPct) - 3} className="in-tick">trip {shutdownPct}%</text>
        <path d={line((i) => pts[i].level_pct, yL)} className="in-line-level" />
        <text x={PR + 5} y={Math.min(yL(last.level_pct) + 4, TOP + H1 + GAP + H2 + 2)} className="in-label in-label-level">{Number.isFinite(last.level_pct) ? `${last.level_pct.toFixed(0)}%` : ""}</text>
        {/* time axis */}
        <text x={GL} y={H - 3} className="in-tick">{clock(pts[0].end_ts - series.step_s)}</text>
        <text x={GL + PW / 2} y={H - 3} className="in-tick" textAnchor="middle">{clock(pts[Math.floor(n / 2)].end_ts - series.step_s)}</text>
        <text x={PR} y={H - 3} className="in-tick" textAnchor="end">now {clock(last.end_ts)}</text>
        {hover !== null ? (
          <g className="in-cross">
            <line x1={x0(hover) + bw / 2} x2={x0(hover) + bw / 2} y1={TOP} y2={TOP + H1 + GAP + H2} />
            {Number.isFinite(pts[hover].inflow_bpd) ? <circle cx={x0(hover) + bw / 2} cy={yR(pts[hover].inflow_bpd)} r={3.5} className="in-dot-in" /> : null}
            {Number.isFinite(pts[hover].outflow_bpd) ? <circle cx={x0(hover) + bw / 2} cy={yR(pts[hover].outflow_bpd)} r={3.5} className="in-dot-out" /> : null}
            {Number.isFinite(pts[hover].level_pct) ? <circle cx={x0(hover + 1)} cy={yL(pts[hover].level_pct)} r={3} className="in-dot-level" /> : null}
          </g>
        ) : null}
      </svg>
      <p className="in-flow-read" aria-live="polite">
        {h
          ? <>{clock(h.end_ts - series.step_s)} to {clock(h.end_ts)}: in {fmt(h.inflow_bpd)}, out {fmt(h.outflow_bpd)} bpd, level {Number.isFinite(h.level_pct) ? h.level_pct.toFixed(0) : "?"}%</>
          : <>Margin of error <strong>{moe.toFixed(1)} pts/h</strong></>}
      </p>
    </figure>
  );
}
