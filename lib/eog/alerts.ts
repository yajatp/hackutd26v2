// Turns a dataset into the alerts view (EOG SPEC.md "Alerts view"): every problem still in
// progress at "now", pump failures first by countdown, each with its fix card.
// Pure TypeScript like the rest of lib/eog.
import { detect } from "./detect.ts";
import { seriesOf, type Dataset } from "./load.ts";
import {
  optionsFor, planJoint, planLabel, planNetwork,
  type Failure, type Plan, type PlanNetwork, type PlanWell,
} from "./planner.ts";
import type { DetectedEvent, FacilityJson } from "./types.ts";
import { healthAt, healthOf, type SensorState } from "../rules/health.ts";

export interface Alternative { label: string; cost: number; why: string }

export interface FixCard {
  plan: Plan;
  label: string;
  headline: string;                      // "Call 1 truck now, 1 trip"
  details: string[];                     // "Truck arrives 01:35"
  trip_at_unix: number | null;           // when the tank trips if nobody acts
  repair_done_unix: number;
  alternatives: Alternative[];           // why each other option loses
  shares_fleet_with: string[];           // other failing facilities in the same system
  fleet: number;
}

export interface Alert {
  id: string;
  event: DetectedEvent;
  facility: FacilityJson;
  hours_to_limit: number | null;
  lost_revenue_per_hour: number;
  action: string;                        // one line: the next thing to do
  fix?: FixCard;                         // pump failures only
  // Health of the tank level sensor the countdown and plan are built on (pump failures only).
  tank_sensor?: { state: SensorState; evidence: string; simulated: boolean };
  // Leaks and worn pumps show only while the pump runs. If it has not run for an hour, the data
  // cannot confirm the problem ended: this is the last running sample's time.
  pump_off_since?: number;
}

// A sensor that is dead, drifting or lying at "now", with the evidence the console shows.
export interface SensorIssue {
  key: string;
  asset_id: string;
  metric: string;
  facility_id: string | null;
  state: SensorState;
  evidence: string;
  simulated: boolean;
}

export interface ConsoleView {
  now: number;
  alerts: Alert[];
  sensors: SensorIssue[];                // sensors to check, worst first
  events: DetectedEvent[];               // everything detected, resolved too
  totals: { do_nothing: number; plans: number };
}

const AVG_N = 12;                        // live water rate = mean of the last hour of readings
const UNCONFIRMED_S = 3600;              // pump off this long: a slow problem's end cannot be seen

export function hhmm(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(11, 16);
}

// "<SYS>_FACILITY_C" -> "<SYS> Facility C", for sentences on the fix card.
export function prettyId(id: string): string {
  return id.replace(/^(S\d+)_/, "$1 ").replace(/_/g, " ").replace(/\b([A-Z])([A-Z]+)\b/g, (_, a: string, b: string) => a + b.toLowerCase());
}

export function money(x: number): string {
  return "$" + Math.round(x).toLocaleString("en-US");
}

function liveWells(ds: Dataset, f: FacilityJson, net: PlanNetwork): PlanWell[] {
  const n = ds.ts.length;
  return net.facilities[f.id].wells.map((w) => {
    const s = seriesOf(ds, w.id, "water_bpd");
    let sum = 0, k = 0;
    for (let i = Math.max(0, n - AVG_N); i < n; i++) { sum += s[i]; k++; }
    return { ...w, water_bpd: k ? sum / k : w.water_bpd };
  });
}

function facilityIndex(ds: Dataset): Map<string, FacilityJson> {
  const m = new Map<string, FacilityJson>();
  for (const s of ds.network.systems) for (const f of s.facilities) m.set(f.id, f);
  return m;
}

// "Call 1 truck now, 1 trip" + detail lines with clock times, as on the fix card mockup.
function describe(p: Plan, now: number, responseMin: number, cycleMin: number): { headline: string; details: string[] } {
  const at = (min: number) => hhmm(now + min * 60);
  const parts: string[] = [];
  const details: string[] = [];
  if (p.trucks) {
    const n = p.trucks, m = p.trips_per_truck;
    parts.push(`call ${n} truck${n > 1 ? "s" : ""} now, ${m} trip${m > 1 ? "s" : ""}${n > 1 ? " each" : ""}`);
    const arrivals = Array.from({ length: m }, (_, k) => at(responseMin + k * cycleMin));
    details.push(`${n > 1 ? "Trucks arrive" : "Truck arrives"} ${arrivals.join(", then ")}`);
  }
  for (const s of p.shut_ins) parts.push(`shut in ${s.well_id} at ${at(s.start_min)}`);
  if (p.kind === "do_nothing") parts.push("let the tank trip; every fix costs more");
  if (p.kind === "none_needed") parts.push(`nothing: the tank peaks near ${p.peak_pct?.toFixed(0)}% before the repair`);
  const h = parts.join(", and ");
  return { headline: h.charAt(0).toUpperCase() + h.slice(1), details };
}

function why(alt: Plan, chosen: Plan, fleetFree: number, others: string[], tripUnix: number | null, doneUnix: number): string {
  if (alt.kind === "do_nothing") {
    return tripUnix === null ? "" : `wells shut in ${hhmm(tripUnix)} to ${hhmm(doneUnix)}`;
  }
  if (alt.cost < chosen.cost && alt.trucks > fleetFree) {
    return `needs ${alt.trucks} truck${alt.trucks > 1 ? "s" : ""}; the others go to ${others.map(prettyId).join(" and ")}`;
  }
  const more = alt.cost - chosen.cost;
  return more > 0.5 ? `${money(more)} more` : "same cost, ties broken toward fewer trucks";
}

// Cheapest option of each kind, other than the chosen one.
function alternatives(opts: Plan[], chosen: Plan): Plan[] {
  const best = new Map<string, Plan>();
  for (const o of opts) {
    if (o.kind === chosen.kind && o.trucks === chosen.trucks && o.trips_per_truck === chosen.trips_per_truck) continue;
    const cur = best.get(o.kind);
    if (!cur || o.cost < cur.cost) best.set(o.kind, o);
  }
  return [...best.values()].sort((a, b) => a.cost - b.cost);
}

export function buildConsole(ds: Dataset): ConsoleView {
  const events = detect(ds);
  const net = planNetwork(ds.network, ds.ops);
  const facs = facilityIndex(ds);
  const now = ds.now;
  const ongoing = events.filter((e) => e.status === "ongoing");
  const revPerHour = (fid: string) => net.facilities[fid].wells.reduce((s, w) => s + w.rev_per_day, 0) / 24;

  // Plan every ongoing pump failure of a system together: they share its trucks.
  const bySystem = new Map<string, { ev: DetectedEvent; fail: Failure }[]>();
  for (const ev of ongoing) {
    if (ev.category !== "pump_failure") continue;
    const f = facs.get(ev.facility_id)!;
    const horizon = (ev.onset_unix - now) / 60 + net.repair_min;
    const fail: Failure = {
      event_id: ev.asset_id,
      facility: net.facilities[f.id],
      level_pct: ev.level_pct ?? seriesOf(ds, f.tank.id, "level_pct")[ds.ts.length - 1],
      horizon_min: horizon,
      wells_override: liveWells(ds, f, net),
    };
    const list = bySystem.get(ev.system_id) ?? [];
    list.push({ ev, fail });
    bySystem.set(ev.system_id, list);
  }

  const alerts: Alert[] = [];
  let doNothing = 0, plans = 0;
  for (const [sys, list] of bySystem) {
    const fleet = net.fleet[sys];
    const { plans: chosen } = planJoint(list.map((x) => x.fail), net, fleet);
    list.forEach(({ ev, fail }, i) => {
      const p = chosen[i];
      const fac = facs.get(ev.facility_id)!;
      const ops = ds.ops.systems[sys].facilities[fac.id];
      const doneUnix = ev.onset_unix + net.repair_min * 60;
      const tripUnix = p.trip_at_min === null ? null : now + Math.round(p.trip_at_min * 60);
      const others = list.filter((_, j) => j !== i).map((x) => x.ev.facility_id);
      const otherTrucks = chosen.reduce((s, q, j) => s + (j === i ? 0 : q.trucks), 0);
      const opts = optionsFor(fail, net, fleet);
      const dn = opts.find((o) => o.kind === "do_nothing");
      if (dn) doNothing += dn.cost;
      plans += p.cost;
      const fix: FixCard = {
        plan: p,
        label: planLabel(p),
        ...describe(p, now, ops.response_min, ops.cycle_min),
        trip_at_unix: tripUnix,
        repair_done_unix: doneUnix,
        alternatives: alternatives(opts, p).map((a) => ({
          label: a.kind === "do_nothing" ? "Do nothing" : describe(a, now, ops.response_min, ops.cycle_min).headline,
          cost: a.cost,
          why: why(a, p, fleet - otherTrucks, others, tripUnix, doneUnix),
        })),
        shares_fleet_with: others,
        fleet,
      };
      const sensor = healthOf(ds, fac.tank.id, "level_pct");
      alerts.push({
        id: ev.asset_id + "@" + ev.onset_unix,
        event: ev,
        facility: fac,
        hours_to_limit: ev.hours_to_limit ?? null,
        lost_revenue_per_hour: revPerHour(fac.id),
        action: fix.headline,
        fix,
        tank_sensor: { state: sensor.state, evidence: sensor.evidence, simulated: sensor.simulated === true },
      });
    });
  }
  alerts.sort((a, b) => (a.hours_to_limit ?? Infinity) - (b.hours_to_limit ?? Infinity)
    || b.lost_revenue_per_hour - a.lost_revenue_per_hour);

  for (const ev of ongoing) {
    if (ev.category === "pump_failure") continue;
    const fac = facs.get(ev.facility_id)!;
    const status = seriesOf(ds, fac.pump.id, "status");
    const flow = seriesOf(ds, fac.pump.id, "flow_bpd");
    let lastRun = -1;
    for (let i = ds.ts.length - 1; i >= 0; i--) if (status[i] === 1 && flow[i] > 0) { lastRun = i; break; }
    const offSince = lastRun >= 0 ? ds.ts[lastRun] : ds.ts[0];
    const alert: Alert = {
      id: ev.asset_id + "@" + ev.onset_unix,
      event: ev,
      facility: fac,
      hours_to_limit: null,
      lost_revenue_per_hour: revPerHour(fac.id),
      action: `Send a field inspection to ${ev.asset_id}.`,
    };
    if (now - offSince >= UNCONFIRMED_S) alert.pump_off_since = offSince;
    alerts.push(alert);
  }
  const owner = new Map<string, string>();
  for (const f of facs.values()) {
    for (const a of [f.id, f.tank.id, f.pump.id, f.pipeline.id, ...f.wells.map((w) => w.id)]) owner.set(a, f.id);
  }
  const RANK: Record<string, number> = { lying: 0, dead: 1, drifting: 2 };
  const sensors: SensorIssue[] = healthAt(ds)
    .filter((h) => h.state in RANK)
    .sort((a, b) => RANK[a.state] - RANK[b.state] || a.key.localeCompare(b.key))
    .map((h) => ({
      key: h.key, asset_id: h.asset_id, metric: h.metric, facility_id: owner.get(h.asset_id) ?? null,
      state: h.state, evidence: h.evidence, simulated: h.simulated === true,
    }));
  return { now, alerts, sensors, events, totals: { do_nothing: doNothing, plans } };
}
