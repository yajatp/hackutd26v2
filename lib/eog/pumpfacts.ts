// Per-pump details: what genuinely differs between two pumps whose plans cost the same. Built
// only from what a screen already has: the console view (alerts, fix cards), the insight tables
// (flow_series: rate in vs rate out; breach_risk: what a stop would cost) and the engine's own
// plan. The plan costs are EOG's numbers, unchanged: a flat price per trip makes two failures'
// plans equal, so the level, the fill rate, the time left and the revenue at stake are shown
// beside them. Pure TypeScript, no clock: runs in Node tests and in the browser.
import type { Alert, ConsoleView } from "./alerts.ts";
import type { BreachRisk } from "./breach.ts";
import type { FlowSeries } from "./flows.ts";

export interface CostPoint { delay_h: number; cost: number }

export interface PumpFacts {
  facility_id: string;
  system_id: string;
  failed: boolean;                    // a pump failure on the console (it has a fix card)
  level_pct: number | null;           // tank level now
  inflow_bpd: number | null;          // water in over the last hour
  outflow_bpd: number | null;         // pump flow over the last hour
  fill_pts_h: number | null;          // level change per hour from the flows (positive: filling)
  hours_to_limit: number | null;      // failed: the console countdown; running: if the pump stopped now
  lost_per_hour: number;              // revenue lost per hour while the tank is shut in
  truck_eta_min: number | null;       // first truck on site, minutes after now (failed, trucks in the plan)
  wells: number;                      // wells shut in when the tank trips
  response_cost: number | null;       // the engine's plan (failed only)
  unaddressed_cost: number | null;    // revenue lost from the trip to the repair if nobody acts (failed only)
  curve: CostPoint[];                 // estimated cost if the response starts this many hours late
}

export interface PumpInputs {
  view: ConsoleView;
  flows: readonly FlowSeries[];
  breaches: readonly BreachRisk[];
  wells?: Readonly<Record<string, number>>;   // wells per facility id, when the caller knows them
}

const HOUR_S = 3600;

// "Truck arrives 01:35" / "Trucks arrive 01:35, then 05:15" -> minutes after now to the first one.
export function etaMin(details: readonly string[], now: number): number | null {
  for (const d of details) {
    const m = d.match(/\barrives?\b\D*?(\d{1,2}):(\d{2})/i);
    if (!m) continue;
    const at = Number(m[1]) * 60 + Number(m[2]);
    const t = new Date(now * 1000);
    const cur = t.getUTCHours() * 60 + t.getUTCMinutes();
    return (at - cur + 1440) % 1440;
  }
  return null;
}

// Cost if the response starts `delay_h` late: the plan's cost, plus the revenue lost while the
// tank sits shut in waiting for the first truck, never more than letting it trip. An estimate
// from the fix card's own numbers, at half-hour steps until it reaches the unaddressed cost.
export function costCurve(response: number, unaddressed: number, lostPerHour: number, hoursToLimit: number | null, etaH: number | null, steps = 9): CostPoint[] {
  const out: CostPoint[] = [];
  for (let i = 0; i < steps; i++) {
    const d = i / 2;
    let cost = response;
    if (hoursToLimit !== null && etaH !== null) cost = response + lostPerHour * Math.max(0, d + etaH - hoursToLimit);
    out.push({ delay_h: d, cost: Math.min(Math.max(response, unaddressed), cost) });
  }
  return out;
}

function lastPoint(f: FlowSeries | undefined) {
  if (!f) return null;
  for (let i = f.points.length - 1; i >= 0; i--) {
    const p = f.points[i];
    if (Number.isFinite(p.level_pct)) return p;
  }
  return null;
}

export function pumpFacts(inputs: PumpInputs, facilityId: string): PumpFacts | null {
  const { view, flows, breaches, wells } = inputs;
  const alert: Alert | undefined = view.alerts.find((a) => a.fix && a.facility.id === facilityId);
  const flow = flows.find((f) => f.facility_id === facilityId);
  const breach = breaches.find((b) => b.facility_id === facilityId);
  if (!alert && !flow && !breach) return null;
  const p = lastPoint(flow);
  const perHour = flow ? HOUR_S / (flow.step_s || HOUR_S) : 1;
  const fill = p && Number.isFinite(p.physics_pts) ? p.physics_pts * perHour : null;
  const level = alert?.event.level_pct ?? p?.level_pct ?? null;
  const wellCount = alert?.facility.wells.length ?? wells?.[facilityId] ?? breach?.wells?.length ?? 0;
  const system = alert?.event.system_id ?? flow?.system_id ?? breach?.system_id ?? "";

  if (alert?.fix) {
    const fix = alert.fix;
    const lost = alert.lost_revenue_per_hour;
    const unaddressed = fix.trip_at_unix === null ? 0 : lost * Math.max(0, (fix.repair_done_unix - fix.trip_at_unix) / HOUR_S);
    const eta = fix.plan.trucks > 0 ? etaMin(fix.details, view.now) : null;
    return {
      facility_id: facilityId, system_id: system, failed: true,
      level_pct: level, inflow_bpd: p?.inflow_bpd ?? null, outflow_bpd: p?.outflow_bpd ?? null,
      fill_pts_h: fill, hours_to_limit: alert.hours_to_limit, lost_per_hour: lost,
      truck_eta_min: eta, wells: wellCount, response_cost: fix.plan.cost, unaddressed_cost: unaddressed,
      curve: costCurve(fix.plan.cost, unaddressed, lost, alert.hours_to_limit, eta === null ? null : eta / 60),
    };
  }
  const tripsIn = breach?.mode === "running" && breach.real_trip_unix != null ? (breach.real_trip_unix - view.now) / HOUR_S : null;
  return {
    facility_id: facilityId, system_id: system, failed: false,
    level_pct: level, inflow_bpd: p?.inflow_bpd ?? null, outflow_bpd: p?.outflow_bpd ?? null,
    fill_pts_h: fill, hours_to_limit: tripsIn, lost_per_hour: breach?.lost_per_hour ?? 0,
    truck_eta_min: null, wells: wellCount, response_cost: null, unaddressed_cost: null, curve: [],
  };
}

// Every facility the screen knows of: failed pumps first (console order), then the rest by name.
export function allPumpFacts(inputs: PumpInputs): PumpFacts[] {
  const ids = new Set<string>();
  for (const a of inputs.view.alerts) if (a.fix) ids.add(a.facility.id);
  const rest = new Set<string>([...inputs.flows.map((f) => f.facility_id), ...inputs.breaches.map((b) => b.facility_id)]);
  for (const id of [...rest].sort()) ids.add(id);
  return [...ids].map((id) => pumpFacts(inputs, id)).filter((x): x is PumpFacts => x !== null);
}

// Words for the screens. "2h 03m", "45m"; null reads as a dash.
export function hoursText(h: number | null): string {
  if (h === null || !Number.isFinite(h)) return "—";
  if (h <= 0) return "now";
  const m = Math.round(h * 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

// "+9.0 pts/h", "−4.2 pts/h"; null reads as a dash.
export function rateText(pts: number | null): string {
  if (pts === null || !Number.isFinite(pts)) return "—";
  const r = Math.abs(pts) < 0.05 ? 0 : pts;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)} pts/h`;
}
