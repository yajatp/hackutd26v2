"use client";
// Per-pump details under a pump failure's plan (lib/eog/pumpfacts.ts). EOG prices every truck
// trip the same, so two failures can share a plan cost; what differs between them is shown here:
// level, fill rate, time to the limit, revenue at stake, first truck, wells, and the cost of a
// late response. Flows and breach rows come from the insight tables when the site has them.
import { useMemo } from "react";
import { money, type Alert } from "@/lib/eog/alerts";
import { useAvonConsoleOrNull } from "@/lib/live";
import { hoursText, pumpFacts, rateText, type CostPoint } from "@/lib/eog/pumpfacts";
import type { CSSProperties } from "react";

// Inline styles on the Sui tokens (app/globals.css): Board renders in a Node test that cannot
// load CSS files, so this part imports none. A quiet panel, a hairline border, Plex Mono labels,
// white figures and the one blue for the curve. No glow.
const LABEL: CSSProperties = {
  fontFamily: "var(--font-label, 'IBM Plex Mono', ui-monospace, monospace)", fontSize: "0.6875rem",
  letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--sui-grey-1, #6c7584)",
};
const s = {
  root: { marginTop: 20, padding: "16px 18px", border: "1px solid var(--sui-hair, rgb(255 255 255 / 0.08))", borderRadius: 10, background: "var(--sui-panel, #131518)" },
  title: { ...LABEL, color: "var(--sui-grey-3, #a1a7b2)", letterSpacing: "0.08em" },
  grid: { margin: "12px 0 0", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(124px, 1fr))", gap: "12px 20px" },
  cell: { minWidth: 0 },
  k: LABEL,
  v: { margin: "2px 0 0", fontFamily: "var(--font-text, 'Hanken Grotesk', system-ui, sans-serif)", fontSize: "0.9375rem", fontVariantNumeric: "tabular-nums", color: "var(--sui-white, #fff)" },
  curve: { margin: "16px 0 0", maxWidth: 360 },
  svg: { display: "block", width: "100%", height: 56, marginTop: 6 },
  ends: { marginTop: 4, display: "flex", justifyContent: "space-between", gap: 12, fontSize: "0.75rem", color: "var(--sui-grey-2, #89919f)", fontVariantNumeric: "tabular-nums" },
  b: { fontWeight: 600, color: "var(--sui-white, #fff)" },
} satisfies Record<string, CSSProperties>;
const BLUE = "var(--sui-blue, #298dff)";

function Curve({ curve, label }: { curve: CostPoint[]; label: string }) {
  if (curve.length < 2) return null;
  const W = 220, H = 56, P = 4;
  const max = Math.max(...curve.map((c) => c.cost));
  const min = Math.min(...curve.map((c) => c.cost));
  const span = Math.max(1, max - min);
  const last = curve[curve.length - 1];
  const x = (d: number) => P + (d / last.delay_h) * (W - 2 * P);
  const y = (c: number) => H - P - ((c - min) / span) * (H - 2 * P);
  const pts = curve.map((c) => `${x(c.delay_h).toFixed(1)},${y(c.cost).toFixed(1)}`).join(" ");
  return (
    <figure style={s.curve} aria-label={label}>
      <figcaption style={s.k}>Cost if the response is delayed</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} style={s.svg} role="img" aria-hidden="true">
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="var(--sui-raised, #222529)" strokeWidth={1} />
        <polyline points={pts} fill="none" stroke={BLUE} strokeWidth={1.5} strokeLinejoin="round" />
        {curve.map((c) => <circle key={c.delay_h} cx={x(c.delay_h)} cy={y(c.cost)} r={1.8} fill={BLUE} />)}
      </svg>
      <div style={s.ends}>
        <span>On time <b style={s.b}>{money(curve[0].cost)}</b></span>
        <span>{last.delay_h} h late <b style={s.b}>{money(last.cost)}</b></span>
      </div>
    </figure>
  );
}

export function PumpFacts({ a, now }: { a: Alert; now: number }) {
  const avon = useAvonConsoleOrNull();
  const flows = avon?.insight.flows;
  const breaches = avon?.insight.breaches;
  const facilities = avon?.facilities;
  const f = useMemo(() => {
    const wells: Record<string, number> = {};
    for (const x of facilities ?? []) wells[x.facility_id] = x.well_ids.length;
    const view = { now, alerts: [a], sensors: [], events: [], totals: { do_nothing: 0, plans: 0 } };
    return pumpFacts({ view, flows: flows ?? [], breaches: breaches ?? [], wells }, a.facility.id);
  }, [a, now, flows, breaches, facilities]);
  if (!f) return null;
  const items: { k: string; v: string }[] = [
    { k: "Level", v: f.level_pct === null ? "—" : `${f.level_pct.toFixed(1)}%` },
    { k: "Fill rate", v: rateText(f.fill_pts_h) },
    { k: "Time to limit", v: hoursText(f.hours_to_limit) },
    { k: "Lost revenue", v: `${money(f.lost_per_hour)}/h` },
    { k: "First truck", v: f.truck_eta_min === null ? "—" : `in ${hoursText(f.truck_eta_min / 60)}` },
    { k: "Wells affected", v: String(f.wells) },
  ];
  if (f.unaddressed_cost !== null) items.push({ k: "Cost if unaddressed", v: money(f.unaddressed_cost) });
  return (
    <div style={s.root} data-pump-facts={a.facility.id}>
      <div style={s.title}>Pump details</div>
      <dl style={s.grid}>
        {items.map((i) => (
          <div key={i.k} style={s.cell}>
            <dt style={s.k}>{i.k}</dt>
            <dd style={s.v}>{i.v}</dd>
          </div>
        ))}
      </dl>
      <Curve curve={f.curve} label={`Cost if the response starts late: ${f.curve.map((c) => `${c.delay_h} h ${money(c.cost)}`).join(", ")}`} />
    </div>
  );
}
