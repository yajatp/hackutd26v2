"use client";
// The ripple as a picture: the tank's level over the night in each future, on one time axis.
// Solid: the plan (acting on the truth). Dashed: nobody acts, or trusting a faked sensor. Dotted
// amber: what the faked sensor reports. Dots: truck pickups, the trip, the sensor flag.
// Drawn at the container's real pixel width (ResizeObserver), so text stays the same size at
// 390 px and at 1440 px. One y-axis (level %), honest: it is a line chart, so it need not start at 0.
import { useEffect, useRef, useState } from "react";
import type { ProjKey, Projection } from "@/lib/eog/whatif";
import { clock } from "./format";

const LABEL: Record<ProjKey, string> = {
  past: "Level so far",
  plan: "With the plan",
  ignored: "If nobody acts",
  lie: "Trusting the sensor",
  flag: "Acting on the flag",
  shown: "What the sensor reports",
};
const ORDER: ProjKey[] = ["past", "plan", "ignored", "lie", "shown"];

export default function RippleChart({ p, now }: { p: Projection; now: number }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setW(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver((es) => { for (const e of es) setW(Math.round(e.contentRect.width)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lines = ORDER.map((k) => p.lines.find((l) => l.key === k)).filter((l): l is NonNullable<typeof l> => !!l && l.pts.length > 1);
  const H = 200, L = 40, R = 14, T = 16, B = 26;
  const width = Math.max(260, w || 640);
  const pw = width - L - R, ph = H - T - B;
  const levels = lines.flatMap((l) => l.pts.map((q) => q[1])).filter(Number.isFinite);
  const lo = Math.max(0, Math.floor((Math.min(p.warning_pct - 20, ...levels) - 5) / 20) * 20);
  const hi = 100;
  const span = Math.max(1, p.to_min - p.from_min);
  const x = (t: number) => L + ((t - p.from_min) / span) * pw;
  const y = (v: number) => T + ((hi - Math.max(lo, Math.min(hi, v))) / (hi - lo)) * ph;
  const path = (pts: [number, number][]) => pts.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join("");

  // Hourly time ticks (every 2 h when narrow), "now" at zero.
  const every = pw < 420 ? 120 : 60;
  const ticks: number[] = [];
  for (let t = Math.ceil(p.from_min / every) * every; t <= p.to_min + 0.01; t += every) ticks.push(t);
  if (!ticks.includes(0)) ticks.push(0);
  const yTicks: number[] = [];
  for (let v = lo; v <= hi; v += 20) yTicks.push(v);

  // One flag dot: the firm one (LYING or DEAD), the last the check raises.
  const flags = p.marks.filter((m) => m.key === "flag");
  const flag = flags[flags.length - 1];
  const marks = [...p.marks.filter((m) => m.key !== "flag"), ...(flag ? [flag] : [])];
  const anchor = (px: number) => (px > L + pw - 60 ? "end" : px < L + 40 ? "start" : "middle");
  const trip = marks.find((m) => m.key === "trip");
  const desc = `Tank level, ${clock(now + p.from_min * 60)} to ${clock(now + p.to_min * 60)}. `
    + lines.map((l) => `${LABEL[l.key]}: ends at ${l.pts[l.pts.length - 1][1].toFixed(0)}%`).join("; ")
    + (trip ? `. ${trip.label} if nobody acts.` : ".");

  return (
    <figure className="in-proj">
      <figcaption className="in-proj-head">
        <span className="in-proj-title">Tank level, each future</span>
        <span className="in-legend in-proj-legend" aria-hidden="true">
          {lines.map((l) => <span key={l.key}><span className={`in-key in-pk-${l.key}`} />{LABEL[l.key]}</span>)}
        </span>
      </figcaption>
      <div ref={box} className="in-proj-box">
        {w > 0 ? (
          <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={desc} className="in-proj-svg">
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={L} x2={L + pw} y1={y(v)} y2={y(v)} className={v === lo ? "in-axis" : "in-gridline"} />
                <text x={L - 6} y={y(v) + 3.5} textAnchor="end" className="in-tick">{v}%</text>
              </g>
            ))}
            <line x1={L} x2={L + pw} y1={y(p.shutdown_pct)} y2={y(p.shutdown_pct)} className="in-limit" />
            <text x={L + 4} y={y(p.shutdown_pct) - 4} className="in-tick">trip {p.shutdown_pct}%</text>
            {p.from_min < 0 ? <line x1={x(0)} x2={x(0)} y1={T} y2={T + ph} className="in-nowline" /> : null}
            {ticks.map((t) => (
              <text key={t} x={x(t)} y={H - 8} textAnchor={anchor(x(t))} className={t === 0 ? "in-tick in-tick-now" : "in-tick"}>
                {t === 0 ? `now ${clock(now)}` : clock(now + t * 60)}
              </text>
            ))}
            {lines.map((l) => <path key={l.key} d={path(l.pts)} className={`in-pl in-pl-${l.key}`} />)}
            {marks.map((m, i) => {
              const cx = x(m.t_min), cy = y(m.level_pct);
              if (m.key === "truck") return (
                <g key={i}>
                  <circle cx={cx} cy={cy} r={3.5} className="in-pm-truck" />
                  {m.label ? <text x={cx + 7} y={cy + 4} className="in-pm-label">{m.label}</text> : null}
                </g>
              );
              if (m.key === "trip") return (
                <g key={i}>
                  <circle cx={cx} cy={cy} r={4.5} className="in-pm-trip" />
                  <text x={cx} y={cy - 9} textAnchor={anchor(cx)} className="in-pm-label in-pm-label-red">{m.label}</text>
                </g>
              );
              return (
                <g key={i}>
                  <circle cx={cx} cy={cy} r={4} className="in-pm-flag" />
                  <text x={cx} y={cy + 16} textAnchor={anchor(cx)} className="in-pm-label in-pm-label-amber">{m.label} {clock(now + m.t_min * 60)}</text>
                </g>
              );
            })}
          </svg>
        ) : <div style={{ height: H }} />}
      </div>
    </figure>
  );
}
