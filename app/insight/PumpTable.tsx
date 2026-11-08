"use client";
// Pump details for every facility on the site (lib/eog/pumpfacts.ts): what differs between pumps
// when EOG's flat trip price gives two failures the same plan cost. Failed pumps first, with their
// cost curve; running pumps show what a stop now would put at risk.
import { useMemo } from "react";
import type { ConsoleView } from "@/lib/eog/alerts";
import type { BreachRisk } from "@/lib/eog/breach";
import type { FlowSeries } from "@/lib/eog/flows";
import { allPumpFacts, hoursText, rateText, type CostPoint } from "@/lib/eog/pumpfacts";
import type { SiteFacility } from "@/lib/live";
import { money, pretty } from "./format";
import s from "./pumps.module.css";

function Spark({ curve }: { curve: CostPoint[] }) {
  if (curve.length < 2) return <span className={s.dim}>—</span>;
  const W = 96, H = 22, P = 2;
  const max = Math.max(...curve.map((c) => c.cost));
  const min = Math.min(...curve.map((c) => c.cost));
  const span = Math.max(1, max - min);
  const last = curve[curve.length - 1];
  const pts = curve.map((c) => `${(P + (c.delay_h / last.delay_h) * (W - 2 * P)).toFixed(1)},${(H - P - ((c.cost - min) / span) * (H - 2 * P)).toFixed(1)}`).join(" ");
  return (
    <span className={s.spark}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true"><polyline points={pts} className={s.sparkLine} /></svg>
      <span className={s.sparkEnd}>{money(last.cost)} at {last.delay_h} h</span>
    </span>
  );
}

export default function PumpTable({ view, flows, breaches, facilities }: {
  view: ConsoleView | null; flows: FlowSeries[]; breaches: BreachRisk[]; facilities: SiteFacility[];
}) {
  const rows = useMemo(() => {
    if (!view) return [];
    const wells: Record<string, number> = {};
    for (const f of facilities) wells[f.facility_id] = f.well_ids.length;
    return allPumpFacts({ view, flows, breaches, wells });
  }, [view, flows, breaches, facilities]);
  if (!rows.length) return null;
  return (
    <section className="in-section" aria-labelledby="in-pumps-h">
      <h2 id="in-pumps-h">Pump details</h2>
      <p className={s.lede}>
        EOG prices every truck trip the same, so two failures can share a response cost. What differs is below:
        each tank&apos;s level and fill rate, the time to its limit, the revenue it would lose, and what a late response costs.
      </p>
      <div className={s.scroll}>
        <table className={s.table} data-pump-table="">
          <caption className="sr-only">Pump details by facility</caption>
          <thead>
            <tr>
              <th scope="col">Pump</th><th scope="col">Status</th><th scope="col" className={s.r}>Level</th>
              <th scope="col" className={s.r}>Fill rate</th><th scope="col" className={s.r}>Time to limit</th>
              <th scope="col" className={s.r}>Lost revenue</th><th scope="col" className={s.r}>First truck</th>
              <th scope="col" className={s.r}>Wells</th><th scope="col" className={s.r}>Response cost</th>
              <th scope="col">Cost if delayed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.facility_id} data-failed={p.failed || undefined}>
                <th scope="row">{pretty(p.facility_id)}</th>
                <td>{p.failed ? <span className={s.alert}>Pump failed</span> : <span className={s.dim}>Running</span>}</td>
                <td className={s.r}>{p.level_pct === null ? "—" : `${p.level_pct.toFixed(1)}%`}</td>
                <td className={s.r}>{rateText(p.fill_pts_h)}</td>
                <td className={s.r} title={p.failed ? "Until the tank reaches its limit" : "If the pump stopped now"}>
                  {hoursText(p.hours_to_limit)}{!p.failed && p.hours_to_limit !== null ? <span className={s.dim}> if stopped</span> : null}
                </td>
                <td className={s.r}>{money(p.lost_per_hour)}/h</td>
                <td className={s.r}>{p.truck_eta_min === null ? "—" : hoursText(p.truck_eta_min / 60)}</td>
                <td className={s.r}>{p.wells}</td>
                <td className={`${s.r} ${s.key}`}>{p.response_cost === null ? "—" : money(p.response_cost)}</td>
                <td><Spark curve={p.curve} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
