// The night's insight for the headset's dashboard, as plain words: the same figures /insight
// shows (app/insight/InsightScreen.tsx Budget, PumpTable.tsx), built from the same inputs
// (useAvonConsole().view and .insight, allPumpFacts), so the two screens never disagree.
// Pure TypeScript, no React or canvas: app/twin/insight/rows.test.ts runs it in Node.
import type { ConsoleView } from "@/lib/eog/alerts";
import type { BreachRisk } from "@/lib/eog/breach";
import type { SystemBudget } from "@/lib/eog/budget";
import type { FlowSeries } from "@/lib/eog/flows";
import { allPumpFacts, hoursText, rateText } from "@/lib/eog/pumpfacts";
import type { SiteFacility } from "@/lib/live";
import { money, pretty } from "@/app/insight/format";

export interface InsightSummary {
  unaddressed: string;      // Cost if unaddressed
  response: string;         // Response cost
  savings: string;          // Savings
  spare: string;            // "3 of 8": spare trucks across every system
  inUse: string;            // "5 in use"
  spareShort: boolean;      // a system with failures has no spare truck left
  planPct: number;          // response cost as a share of the cost if unaddressed, 0-100
  hasCost: boolean;         // there is something to plan (cost if unaddressed above zero)
}

const sum = (xs: number[]) => xs.reduce((u, x) => u + x, 0);

// The four figures, as /insight's budget computes them: the console's totals first, else the budget rows.
export function insightSummary(view: ConsoleView | null, budget: readonly SystemBudget[]): InsightSummary {
  const plans = view?.totals.plans ?? sum(budget.map((b) => b.plans));
  const nothing = view?.totals.do_nothing ?? sum(budget.map((b) => b.do_nothing));
  const saved = Math.max(0, nothing - plans);
  const fleet = sum(budget.map((b) => b.fleet));
  const used = sum(budget.map((b) => b.trucks_used));
  return {
    unaddressed: money(nothing), response: money(plans), savings: money(saved),
    spare: budget.length ? `${Math.max(0, fleet - used)} of ${fleet}` : "—",
    inUse: `${used} in use`,
    spareShort: budget.some((b) => b.failures > 0 && b.fleet - b.trucks_used <= 0),
    planPct: nothing > 0 ? Math.min(100, (plans / nothing) * 100) : 0,
    hasCost: nothing > 0,
  };
}

export interface InsightRow {
  id: string;
  pump: string;             // "S5 Facility C"
  failed: boolean;
  status: string;           // "Pump failed" / "Running"
  level: string;            // "84.0%"
  fill: string;             // "+9.0 pts/h"
  toLimit: string;          // "2h 03m"
  ifStopped: boolean;       // running pump: the time to limit is "if the pump stopped now"
  lost: string;             // "$1,250/h"
  eta: string;              // first truck, "45m"
  wells: string;
  response: string;         // the plan's cost, failed pumps only
  curve: number[];          // cost if the response starts late, scaled 0-1 (empty: none)
  curveEnd: string;         // "$2,400 at 4 h"
  curveLast: string;        // "$2,400": the curve's last point, for a narrow column
}

// Every pump the site knows of, failed first (console order), then running by name: PumpTable's rows.
export function insightRows(view: ConsoleView | null, flows: readonly FlowSeries[], breaches: readonly BreachRisk[], facilities: readonly SiteFacility[]): InsightRow[] {
  if (!view) return [];
  const wells: Record<string, number> = {};
  for (const f of facilities) wells[f.facility_id] = f.well_ids.length;
  const facts = allPumpFacts({ view, flows, breaches, wells });
  // allPumpFacts already lists failed pumps first; keep that order stable even if it changes.
  const ordered = [...facts.filter((p) => p.failed), ...facts.filter((p) => !p.failed)];
  return ordered.map((p) => {
    const costs = p.curve.map((c) => c.cost);
    const lo = costs.length ? Math.min(...costs) : 0, hi = costs.length ? Math.max(...costs) : 0;
    const span = Math.max(1, hi - lo);
    const last = p.curve[p.curve.length - 1];
    return {
      id: p.facility_id,
      pump: pretty(p.facility_id),
      failed: p.failed,
      status: p.failed ? "Pump failed" : "Running",
      level: p.level_pct === null ? "—" : `${p.level_pct.toFixed(1)}%`,
      fill: rateText(p.fill_pts_h),
      toLimit: hoursText(p.hours_to_limit),
      ifStopped: !p.failed && p.hours_to_limit !== null,
      lost: `${money(p.lost_per_hour)}/h`,
      eta: p.truck_eta_min === null ? "—" : hoursText(p.truck_eta_min / 60),
      wells: String(p.wells),
      response: p.response_cost === null ? "—" : money(p.response_cost),
      curve: p.curve.length >= 2 ? costs.map((c) => (c - lo) / span) : [],
      curveEnd: p.curve.length >= 2 && last ? `${money(last.cost)} at ${last.delay_h} h` : "—",
      curveLast: p.curve.length >= 2 && last ? money(last.cost) : "—",
    };
  });
}

// The table's columns on the dashboard texture, as shares of the panel's inner width.
export const INSIGHT_COLUMNS = [
  { key: "pump", label: "PUMP", w: 0.14, right: false },
  { key: "status", label: "STATUS", w: 0.1, right: false },
  { key: "level", label: "LEVEL", w: 0.07, right: true },
  { key: "fill", label: "FILL RATE", w: 0.1, right: true },
  { key: "toLimit", label: "TO LIMIT", w: 0.1, right: true },
  { key: "lost", label: "REVENUE/H", w: 0.1, right: true },
  { key: "eta", label: "TRUCK", w: 0.08, right: true },
  { key: "wells", label: "WELLS", w: 0.06, right: true },
  { key: "response", label: "RESPONSE", w: 0.1, right: true },
  { key: "curve", label: "COST IF DELAYED", w: 0.15, right: false },
] as const;
