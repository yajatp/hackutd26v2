// "What if ___ happens?" The ripple of one event through the night's plan, built from the same
// planner and engine the console uses (lib/eog/planner.ts, alerts.ts, lib/rules). Pure TypeScript
// with no clock: it runs inside the what_if and finish_ingest reducers.
//
//   pump_fail      the facility's pump fails at "now" at its current level. It is planned with the
//                  system's other failures, so trucks may move from another facility's plan.
//   sensor_spoof   the tank's level sensor is held flat. On a failed pump, from the failure's onset
//                  (the engine reruns on that copy); on a running pump, as the pump stops without a
//                  fault code, so the console sees no failure until its physics check flags the sensor.
//   sensor_dead    the same, with the sensor going silent instead (the console marks it DEAD).
//   pipeline_leak  a leak on the facility's line: water lost at the rate this data's leaks show,
//                  flagged after the detector's delay, then the line is isolated (the pump stops).
import { buildConsole, describe, hhmm, liveWells, money, prettyId, type Alert, type ConsoleView } from "./alerts.ts";
import { seriesOf, type Dataset } from "./load.ts";
import { noActionTripMin, optionsFor, planJoint, planLabel, planNetwork, type Failure, type Plan, type PlanNetwork } from "./planner.ts";
import type { FacilityJson } from "./types.ts";
import { injectFault } from "../rules/faults.ts";
import { calibrate, stepSeconds } from "../rules/physics.ts";
import { DEAD_SAMPLES } from "../rules/health.ts";

export type WhatIfKind = "pump_fail" | "sensor_spoof" | "sensor_dead" | "pipeline_leak";
export const WHAT_IF_KINDS: readonly WhatIfKind[] = ["pump_fail", "sensor_spoof", "sensor_dead", "pipeline_leak"];

export type Tone = "red" | "amber" | "quiet";
// Which future a step belongs to. event and check are facts in every future; plan is acting on the
// truth (fleet: another facility's plan that changes with it); ignored is nobody acting; lie is
// trusting the faked sensor; flag is acting only once the sensor check flags it.
export type Branch = "event" | "check" | "plan" | "fleet" | "ignored" | "lie" | "flag";

export interface RippleStep {
  t_min: number;              // minutes after "now" (negative: before it)
  at_unix: number;
  facility_id: string;
  tone: Tone;                 // red: production lost or a failure; amber: a sensor to check; quiet: the response
  branch: Branch;             // ignored: what happens if nobody acts
  text: string;
}

export interface PlanBrief { headline: string; label: string; cost: number; trucks: number; trips: number }
export interface PlanChange { facility_id: string; before: PlanBrief; after: PlanBrief }
export interface Flag { state: "lying" | "drifting" | "dead"; after_min: number }

// The tank level over the night, one line per future, for a small chart. Points are
// [minutes after now, level %]; a truck pickup is two points at the same minute.
export type ProjKey = "past" | "plan" | "ignored" | "lie" | "flag" | "shown";
export interface ProjLine { key: ProjKey; pts: [number, number][] }
export interface ProjMark { key: "truck" | "trip" | "flag"; line: ProjKey; t_min: number; level_pct: number; label: string }
export interface Projection { from_min: number; to_min: number; shutdown_pct: number; warning_pct: number; lines: ProjLine[]; marks: ProjMark[] }

export interface Ripple {
  kind: WhatIfKind;
  asset_id: string;
  facility_id: string;
  system_id: string;
  now: number;
  title: string;
  summary: string;
  level_pct: number;
  inflow_bpd: number;
  fill_pts_h: number;
  trip_unix: number | null;           // the real trip if nobody acts (null: peaks before the repair)
  repair_done_unix: number;
  wells: { id: string; rev_per_hour: number }[];
  lost_per_hour: number;              // production lost per hour once the tank trips
  do_nothing_cost: number;
  plan: PlanBrief | null;             // the engine's plan for it (acting on the truth)
  changes: PlanChange[];              // other facilities whose plans change
  fleet: number;
  trucks_before: number;
  trucks_after: number;
  night_before: number;               // the console's plans total now
  night_after: number;                // with this event handled honestly
  cost_delta: number;                 // pump_fail, pipeline_leak: night_after - night_before; sensor kinds: the exposure
  flags: Flag[];                      // when the console's sensor check would flag it
  lie: { trip_unix: number | null; plan: PlanBrief | null; real_cost: number; real_trip_unix: number | null; sensor: string } | null;
  believed_cost: number | null;       // spoof/dead: what believing the reading costs (this facility and the knock-on)
  honest_cost: number | null;         // spoof/dead: what the truthful response costs
  exposure: number | null;            // believed_cost - honest_cost: what the lie is worth
  spill_bpd: number | null;
  notes: string[];
  steps: RippleStep[];
  projection: Projection | null;      // the tank level in each future (older scenario rows lack it)
}

const sum = (xs: number[]) => xs.reduce((u, x) => u + x, 0);
const lower = (h: string) => h.charAt(0).toLowerCase() + h.slice(1);

export function fmtMin(m: number): string {
  const r = Math.round(m);
  if (Math.abs(r) < 60) return `${r} min`;
  const h = Math.floor(Math.abs(r) / 60), mm = Math.abs(r) % 60;
  return `${r < 0 ? "-" : ""}${h} h ${String(mm).padStart(2, "0")} min`;
}

interface Site {
  ds: Dataset;
  view: ConsoleView;
  net: PlanNetwork;
  facs: Map<string, { f: FacilityJson; system: string }>;
  now: number;
}

function siteOf(ds: Dataset, view: ConsoleView): Site {
  const facs = new Map<string, { f: FacilityJson; system: string }>();
  for (const s of ds.network.systems) for (const f of s.facilities) facs.set(f.id, { f, system: s.id });
  return { ds, view, net: planNetwork(ds.network, ds.ops), facs, now: ds.now };
}

// Accepts a facility, tank, pump or pipeline id.
export function facilityOfAsset(ds: Dataset, asset: string): FacilityJson | null {
  for (const s of ds.network.systems) for (const f of s.facilities) {
    if ([f.id, f.tank.id, f.pump.id, f.pipeline.id].includes(asset)) return f;
  }
  return null;
}

interface Existing { facility_id: string; fail: Failure; alert: Alert | undefined; tripped: boolean }

// The system's ongoing pump failures as buildConsole plans them (same order, same inputs).
function existingFailures(site: Site, system: string): Existing[] {
  const { ds, view, net, now } = site;
  const out: Existing[] = [];
  for (const ev of view.events) {
    if (ev.status !== "ongoing" || ev.category !== "pump_failure" || ev.system_id !== system) continue;
    const { f } = site.facs.get(ev.facility_id)!;
    const alert = view.alerts.find((a) => a.facility.id === f.id && a.fix);
    out.push({
      facility_id: f.id,
      alert,
      tripped: alert?.hours_to_limit === 0 && alert.fix?.plan.kind === "do_nothing",
      fail: {
        event_id: ev.asset_id,
        facility: net.facilities[f.id],
        level_pct: ev.level_pct ?? seriesOf(ds, f.tank.id, "level_pct")[ds.ts.length - 1],
        horizon_min: (ev.onset_unix - now) / 60 + net.repair_min,
        wells_override: liveWells(ds, f, net),
      },
    });
  }
  return out;
}

// A pump that stops `delay` minutes after now, at the current level plus what it fills meanwhile.
// The repair runs from the stop (EOG's expected repair hours from onset) unless horizonMin says
// otherwise (a leak: the repair starts when the line is isolated).
function stopFailure(site: Site, f: FacilityJson, delayMin = 0, risePerHour = 0, horizonMin?: number): Failure {
  const { ds, net } = site;
  const L = seriesOf(ds, f.tank.id, "level_pct")[ds.ts.length - 1];
  return {
    event_id: f.pump.id,
    facility: net.facilities[f.id],
    level_pct: Math.min(net.shutdown_pct, L + risePerHour * delayMin / 60),
    horizon_min: horizonMin ?? net.repair_min - delayMin,
    wells_override: liveWells(ds, f, net),
  };
}

function brief(site: Site, p: Plan, fid: string, startUnix: number): PlanBrief {
  const ops = site.ds.ops.systems[site.facs.get(fid)!.system].facilities[fid];
  return { headline: describe(p, startUnix, ops.response_min, ops.cycle_min).headline, label: planLabel(p), cost: p.cost, trucks: p.trucks, trips: p.trucks * p.trips_per_truck };
}

function alertBrief(a: Alert): PlanBrief {
  const p = a.fix!.plan;
  return { headline: a.fix!.headline, label: a.fix!.label, cost: p.cost, trucks: p.trucks, trips: p.trucks * p.trips_per_truck };
}

const fillOf = (fail: Failure) => sum((fail.wells_override ?? fail.facility.wells).map((w) => w.water_bpd));

// What really happens when a plan made from bad data meets the real tank: the trip time (minutes
// after plan start, null if it holds) and the cost (trips made, shut-ins, then production lost
// from the trip until the repair).
export function outcomeOf(fail: Failure, net: PlanNetwork, p: Plan): { trip_min: number | null; cost: number } {
  const fac = fail.facility, H = fail.horizon_min;
  const vmax = net.shutdown_pct / 100 * fac.capacity_bbl;
  let v = fail.level_pct / 100 * fac.capacity_bbl;
  const wells = fail.wells_override ?? fac.wells;
  const shut = new Map(p.shut_ins.map((s) => [s.well_id, s.start_min]));
  const arrivals = p.trucks ? Array.from({ length: p.trips_per_truck }, (_, k) => fac.response_min + k * fac.cycle_min).filter((a) => a < H) : [];
  const pts = [...new Set([0, H, ...[...shut.values()].filter((s) => s > 0 && s < H), ...arrivals])].sort((a, b) => a - b);
  const rate = (at: number) => sum(wells.filter((w) => !(shut.has(w.id) && shut.get(w.id)! <= at + 1e-9)).map((w) => w.water_bpd / 1440));
  let t = 0, trips = 0;
  let trip: number | null = v >= vmax - 1e-7 ? 0 : null;
  for (const q of pts) {
    if (trip !== null || q > H) break;
    const r = rate(t), dt = q - t;
    if (r > 0 && v + r * dt >= vmax - 1e-7) { trip = t + (vmax - v) / r; break; }
    v += r * dt;
    t = q;
    if (arrivals.includes(q)) { v -= Math.min(p.trucks * net.truck_cap, v); trips++; }
  }
  if (trip === null) return { trip_min: null, cost: p.cost };
  const revPm = (id: string) => (fac.wells.find((w) => w.id === id)?.rev_per_day ?? 0) / 1440;
  const shutCost = sum([...shut.entries()].filter(([, s]) => s < trip!).map(([id, s]) => revPm(id) * (trip! - s)));
  const facRevPm = sum(fac.wells.map((w) => w.rev_per_day / 1440));
  return { trip_min: trip, cost: p.trucks * trips * net.trip_cost + shutCost + facRevPm * Math.max(0, H - trip) };
}

// The level path behind outcomeOf, for the ripple's chart: [minutes, level %] from delayMin, through
// each truck pickup (two points: before and after), to the trip (then flat: the wells are shut in)
// or the end of the repair. p null: nobody acts.
export function levelPath(fail: Failure, net: PlanNetwork, p: Plan | null, delayMin = 0): { pts: [number, number][]; trip_min: number | null; pickups: [number, number][] } {
  const fac = fail.facility, H = fail.horizon_min, cap = fac.capacity_bbl;
  const vmax = net.shutdown_pct / 100 * cap;
  const pct = (v: number) => v / cap * 100;
  let v = fail.level_pct / 100 * cap;
  const wells = fail.wells_override ?? fac.wells;
  const shut = new Map((p?.shut_ins ?? []).map((s) => [s.well_id, s.start_min]));
  const arrivals = p && p.trucks ? Array.from({ length: p.trips_per_truck }, (_, k) => fac.response_min + k * fac.cycle_min).filter((a) => a < H) : [];
  const times = [...new Set([0, H, ...[...shut.values()].filter((s) => s > 0 && s < H), ...arrivals])].sort((a, b) => a - b);
  const rate = (at: number) => sum(wells.filter((w) => !(shut.has(w.id) && shut.get(w.id)! <= at + 1e-9)).map((w) => w.water_bpd / 1440));
  const pts: [number, number][] = [[delayMin, pct(v)]];
  const pickups: [number, number][] = [];
  let t = 0;
  let trip: number | null = v >= vmax - 1e-7 ? 0 : null;
  for (const q of times) {
    if (trip !== null || q > H) break;
    const r = rate(t), dt = q - t;
    if (r > 0 && v + r * dt >= vmax - 1e-7) { trip = t + (vmax - v) / r; v = vmax; pts.push([delayMin + trip, net.shutdown_pct]); break; }
    v += r * dt;
    t = q;
    if (q > 0) pts.push([delayMin + q, pct(v)]);
    if (arrivals.includes(q)) {
      v -= Math.min(p!.trucks * net.truck_cap, v);
      pts.push([delayMin + q, pct(v)]);
      pickups.push([delayMin + q, pct(v)]);
    }
  }
  if (trip !== null && trip < H) pts.push([delayMin + H, net.shutdown_pct]);
  return { pts, trip_min: trip === null ? null : delayMin + trip, pickups };
}

// "<SYS>_WELL_A1, <SYS>_WELL_A2, <SYS>_WELL_A3" -> "wells A1-A3"; one well -> "well A2".
export function wellsText(ids: readonly string[]): string {
  const short = ids.map((id) => id.replace(/^S\d+_WELL_/, ""));
  if (short.length === 0) return "no wells";
  if (short.length === 1) return `well ${short[0]}`;
  const m = short.map((x) => /^([A-Z]+)(\d+)$/.exec(x));
  const run = m.every((x, i) => x && x[1] === m[0]![1] && Number(x[2]) === Number(m[0]![2]) + i);
  return run ? `wells ${short[0]}-${short[short.length - 1]}` : `wells ${short.join(", ")}`;
}

// Engine text (plan headlines name wells by id) in the operator's words: well lists first, then
// single wells, then the detector's fault code.
export function plainIds(text: string): string {
  return text
    .replace(/S\d+_WELL_[A-Z]+\d+(?:(?:, (?:and )?| and )S\d+_WELL_[A-Z]+\d+)+/g, (m) => wellsText(m.match(/S\d+_WELL_[A-Z]+\d+/g)!))
    .replace(/S\d+_WELL_[A-Z]+\d+/g, (m) => wellsText([m]))
    .replace(/pump status = 2 \(fault\)/g, "pump fault code");
}

// The detector's evidence in the operator's words.
export function plainEvidence(e: string | undefined): string {
  if (!e) return "pump failure";
  return e.replace(/pump status = 2 \(fault\)/g, "pump fault code");
}

// When the console's sensor check (lib/rules/health.ts) would flag a level held flat while the
// tank fills at fill pts/h. Its 1-hour physics error grows by fill x (minutes since)/60 up to fill:
// DRIFTING above the drift line, LYING once two readings in a row are above the lie line.
export function flagsForFlat(fill: number, lines: { drift_line: number; lie_line: number }, stepS: number): Flag[] {
  const err = (k: number) => fill * Math.min(k * stepS, 3600) / 3600;
  const out: Flag[] = [];
  const maxK = Math.ceil(3600 / stepS) + 1;
  for (let k = 1; k <= maxK; k++) {
    if (err(k) > lines.lie_line && err(k - 1) > lines.lie_line) { out.push({ state: "lying", after_min: k * stepS / 60 }); break; }
    if (!out.length && err(k) > lines.drift_line) out.push({ state: "drifting", after_min: k * stepS / 60 });
  }
  return out;
}

interface Joint {
  plan: Plan;                         // the new failure's plan
  changes: PlanChange[];
  before: number;                     // the system's plans before (non-tripped)
  after: number;
  trucks_before: number;
  trucks_after: number;
  fleet: number;
}

// Plans the new failure with the system's existing ones, as buildConsole would on its next run.
function joint(site: Site, system: string, extra: Failure, existing = existingFailures(site, system)): Joint {
  const fleet = site.net.fleet[system];
  const live = existing.filter((e) => !e.tripped);
  const old = planJoint(live.map((e) => e.fail), site.net, fleet).plans;
  const neu = planJoint([...live.map((e) => e.fail), extra], site.net, fleet).plans;
  const changes: PlanChange[] = [];
  live.forEach((e, i) => {
    const a = old[i], b = neu[i];
    if (!a || !b) return;
    if (a.trucks === b.trucks && a.trips_per_truck === b.trips_per_truck && Math.abs(a.cost - b.cost) < 0.5
        && JSON.stringify(a.shut_ins) === JSON.stringify(b.shut_ins)) return;
    changes.push({
      facility_id: e.facility_id,
      before: e.alert ? alertBrief(e.alert) : brief(site, a, e.facility_id, site.now),
      after: brief(site, b, e.facility_id, site.now),
    });
  });
  const plan = neu[neu.length - 1] ?? optionsFor(extra, site.net, 0)[0];
  return {
    plan, changes,
    before: sum(old.map((p) => p.cost)), after: sum(neu.map((p) => p.cost)),
    trucks_before: sum(old.map((p) => p.trucks)), trucks_after: sum(neu.map((p) => p.trucks)),
    fleet,
  };
}

function base(site: Site, kind: WhatIfKind, asset: string, f: FacilityJson): Ripple {
  const { ds, net, now } = site;
  const system = site.facs.get(f.id)!.system;
  const L = seriesOf(ds, f.tank.id, "level_pct")[ds.ts.length - 1];
  const fail = stopFailure(site, f);
  const inflow = fillOf(fail);
  const wells = net.facilities[f.id].wells.map((w) => ({ id: w.id, rev_per_hour: w.rev_per_day / 24 }));
  return {
    kind, asset_id: asset, facility_id: f.id, system_id: system, now,
    title: "", summary: "",
    level_pct: L, inflow_bpd: inflow, fill_pts_h: inflow / 24 / f.tank.capacity_bbl * 100,
    trip_unix: null, repair_done_unix: now + net.repair_min * 60,
    wells, lost_per_hour: sum(wells.map((w) => w.rev_per_hour)),
    do_nothing_cost: 0, plan: null, changes: [], fleet: net.fleet[system],
    trucks_before: 0, trucks_after: 0,
    night_before: site.view.totals.plans, night_after: site.view.totals.plans, cost_delta: 0,
    flags: [], lie: null, believed_cost: null, honest_cost: null, exposure: null, spill_bpd: null, notes: [], steps: [],
    projection: null,
  };
}

const step = (r: Ripple, t_min: number, facility_id: string, tone: Tone, branch: Branch, text: string) =>
  r.steps.push({ t_min, at_unix: r.now + Math.round(t_min * 60), facility_id, tone, branch, text: plainIds(text) });

// Time order; steps at the same minute keep the order they were written in (a stable sort).
function finish(r: Ripple): Ripple {
  r.steps.sort((a, b) => a.t_min - b.t_min);
  r.title = plainIds(r.title);
  r.summary = plainIds(r.summary);
  r.notes = r.notes.map(plainIds);
  return r;
}

const wellList = (r: Ripple) => wellsText(r.wells.map((w) => w.id));
const cap1 = (h: string) => h.charAt(0).toUpperCase() + h.slice(1);

function projOf(site: Site, lines: ProjLine[], marks: ProjMark[]): Projection {
  const ts = lines.flatMap((l) => l.pts.map((p) => p[0]));
  return {
    from_min: Math.min(0, ...ts), to_min: Math.max(0, ...ts),
    shutdown_pct: site.net.shutdown_pct, warning_pct: site.ds.network.defaults.tank_limits_pct.warning,
    lines, marks,
  };
}

// The chart for a pump that is off from `delayMin`: the plan's level (when it does anything) and
// the level if nobody acts, with the truck pickups and the trip marked. `nothing` names the
// do-nothing future: "lie" when doing nothing is what trusting a faked sensor amounts to.
function stopProjection(site: Site, r: Ripple, fail: Failure, plan: Plan, delayMin: number, nothing: "ignored" | "lie", pre: [number, number][] = []): Projection {
  const net = site.net;
  const lines: ProjLine[] = [];
  const marks: ProjMark[] = [];
  if (plan.trucks || plan.shut_ins.length) {
    const lp = levelPath(fail, net, plan, delayMin);
    lines.push({ key: "plan", pts: [...pre, ...lp.pts] });
    lp.pickups.forEach(([t, l], k) => marks.push({ key: "truck", line: "plan", t_min: t, level_pct: l, label: k === 0 ? "truck" : "" }));
    if (lp.trip_min !== null) marks.push({ key: "trip", line: "plan", t_min: lp.trip_min, level_pct: net.shutdown_pct, label: `trips ${hhmm(r.now + Math.round(lp.trip_min * 60))}` });
  }
  const dn = levelPath(fail, net, null, delayMin);
  lines.push({ key: nothing, pts: [...pre, ...dn.pts] });
  if (dn.trip_min !== null) marks.push({ key: "trip", line: nothing, t_min: dn.trip_min, level_pct: net.shutdown_pct, label: `trips ${hhmm(r.now + Math.round(dn.trip_min * 60))}` });
  return projOf(site, lines, marks);
}

// Trip, the response and the fleet knock-on for a pump that is off from `delay` minutes after now.
// `nothing` is the branch of the do-nothing steps ("lie" for a faked sensor on a running pump, where
// believing it means nobody acts). `pre` leads the chart's lines in before the stop (a leak).
function stopSteps(site: Site, r: Ripple, f: FacilityJson, j: Joint, fail: Failure, delayMin: number, nothing: "ignored" | "lie", pre: [number, number][] = []) {
  const net = site.net;
  const T = noActionTripMin(fail, net);
  const H = fail.horizon_min;
  const warn = site.ds.network.defaults.tank_limits_pct.warning;
  const q = fillOf(fail) / 1440;                      // bbl per minute
  const dn = optionsFor(fail, net, 0).find((o) => o.kind === "do_nothing");
  r.do_nothing_cost = dn?.cost ?? 0;
  r.trip_unix = T <= H ? r.now + Math.round((delayMin + T) * 60) : null;
  r.plan = brief(site, j.plan, f.id, r.now + delayMin * 60);
  r.changes = j.changes;
  r.trucks_before = j.trucks_before;
  r.trucks_after = j.trucks_after;
  r.cost_delta = j.after - j.before;
  r.night_after = r.night_before + r.cost_delta;
  r.repair_done_unix = r.now + Math.round((delayMin + H) * 60);
  for (const c of j.changes) {
    const more = c.after.cost - c.before.cost;
    step(r, delayMin, c.facility_id, "amber", "fleet",
      `${prettyId(c.facility_id)} shares the ${r.system_id} trucks: "${c.before.headline}" becomes "${c.after.headline}" (${more >= 0 ? "+" : "-"}${money(Math.abs(more))}).`);
  }
  const p = j.plan;
  if (p.kind === "none_needed") {
    step(r, delayMin, f.id, "quiet", "plan", `Nothing to do: the tank peaks near ${(p.peak_pct ?? 0).toFixed(0)}% before the repair.`);
  } else {
    step(r, delayMin, f.id, "quiet", "plan", `${cap1(r.plan.headline)} (${money(p.cost)}).`);
    const ops = site.ds.ops.systems[r.system_id].facilities[f.id];
    for (let k = 0; p.trucks && k < p.trips_per_truck; k++) {
      step(r, delayMin + ops.response_min + k * ops.cycle_min, f.id, "quiet", "plan",
        `${p.trucks > 1 ? `${p.trucks} trucks arrive and take` : "Truck arrives and takes"} up to ${p.trucks * net.truck_cap} bbl.`);
    }
    for (const s of p.shut_ins) {
      const w = r.wells.find((x) => x.id === s.well_id);
      step(r, delayMin + s.start_min, f.id, "red", "plan", `Shut in ${wellsText([s.well_id])} until the repair (${money(w?.rev_per_hour ?? 0)}/h of production).`);
    }
  }
  const L0 = fail.level_pct;
  if (L0 < warn && q > 0) {
    const tw = (warn - L0) / 100 * fail.facility.capacity_bbl / q;
    if (tw < Math.min(T, H)) step(r, delayMin + tw, f.id, "amber", nothing, `The tank passes the ${warn}% warning.`);
  }
  if (T <= H) {
    step(r, delayMin + T, f.id, "red", nothing,
      `The tank trips at ${net.shutdown_pct}%. ${cap1(wellList(r))} shut in, ${money(r.lost_per_hour)}/h of production lost until the repair (${money(r.do_nothing_cost)} in all).`);
  }
  step(r, delayMin + H, f.id, "quiet", "event", `Pump back after the ${(net.repair_min / 60).toFixed(0)} h expected repair.`);
  r.projection = stopProjection(site, r, fail, p, delayMin, nothing, pre);
}

function pumpFail(site: Site, asset: string, f: FacilityJson): Ripple {
  const r = base(site, "pump_fail", asset, f);
  r.title = `${prettyId(f.id)}: the pump fails now`;
  const existing = existingFailures(site, r.system_id);
  const mine = existing.find((e) => e.facility_id === f.id);
  if (mine) {
    r.title = `${prettyId(f.id)}: the pump has already failed`;
    r.summary = `This pump is already down on the console${mine.alert?.fix ? `: ${mine.alert.fix.headline} (${money(mine.alert.fix.plan.cost)})` : ""}.`;
    if (mine.alert?.fix) {
      r.plan = alertBrief(mine.alert);
      r.projection = stopProjection(site, r, mine.fail, mine.alert.fix.plan, 0, "ignored");
    }
    r.trip_unix = mine.alert?.fix?.trip_at_unix ?? null;
    step(r, 0, f.id, "red", "event", r.summary);
    return finish(r);
  }
  const fail = stopFailure(site, f);
  const j = joint(site, r.system_id, fail, existing);
  step(r, 0, f.id, "red", "event",
    `${prettyId(f.id)} pump fails. Tank at ${r.level_pct.toFixed(0)}%, filling at ${r.fill_pts_h.toFixed(1)} pts/h (${Math.round(r.inflow_bpd).toLocaleString("en-US")} bpd in, nothing out).`);
  stopSteps(site, r, f, j, fail, 0, "ignored");
  const free = r.fleet - j.trucks_before;
  r.summary = r.trip_unix === null
    ? `The tank peaks before the repair: nothing to do (${money(r.cost_delta)}).`
    : `Trips at ${hhmm(r.trip_unix)} if nobody acts (${money(r.do_nothing_cost)}). The plan: ${lower(r.plan!.headline)}, ${money(j.plan.cost)}.`
      + (j.changes.length ? ` ${j.changes.length} other plan${j.changes.length > 1 ? "s" : ""} change for the trucks.` : ` ${free} of ${r.fleet} ${r.system_id} trucks were free; no other plan changes.`)
      + ` Night: ${money(r.night_before)} to ${money(r.night_after)}.`;
  return finish(r);
}

const STATE_WORD: Record<Flag["state"], string> = { lying: "LYING", drifting: "DRIFTING", dead: "DEAD" };

// sensor_spoof and sensor_dead.
function sensorCase(site: Site, kind: "sensor_spoof" | "sensor_dead", asset: string, f: FacilityJson): Ripple {
  const r = base(site, kind, asset, f);
  const { ds, net, now } = site;
  const flat = kind === "sensor_spoof";
  const verb = flat ? "is held flat (spoofed)" : "goes silent";
  const existing = existingFailures(site, r.system_id);
  const mine = existing.find((e) => e.facility_id === f.id);
  const lines = calibrate(ds);
  const stepS = stepSeconds(ds.ts);
  const flagsFor = (fill: number): Flag[] => flat ? flagsForFlat(fill, lines, stepS) : [{ state: "dead", after_min: DEAD_SAMPLES * stepS / 60 }];

  if (mine && mine.alert?.fix) {
    // The pump has failed: the engine reruns with the level faked since the onset.
    const onset = mine.alert.event.onset_unix;
    const lieDs = injectFault(ds, { kind: flat ? "fake_flat" : "kill", asset_id: f.tank.id, from_ts: onset }).ds;
    const lieView = buildConsole(lieDs);
    const lieAlert = lieView.alerts.find((a) => a.facility.id === f.id && a.fix);
    r.title = `${prettyId(f.id)}: the tank's level sensor ${verb} since the pump failed`;
    r.flags = flagsFor(fillOf(mine.fail) / 24 / f.tank.capacity_bbl * 100).map((x) => ({ ...x, after_min: x.after_min + (onset - now) / 60 }));
    const honest = alertBrief(mine.alert);
    r.plan = honest;
    r.trip_unix = mine.alert.fix.trip_at_unix;
    const dn = optionsFor(mine.fail, net, 0).find((o) => o.kind === "do_nothing");
    r.do_nothing_cost = dn?.cost ?? 0;
    r.repair_done_unix = mine.alert.fix.repair_done_unix;
    const real = lieAlert ? outcomeOf(mine.fail, net, lieAlert.fix!.plan) : { trip_min: noActionTripMin(mine.fail, net), cost: r.do_nothing_cost };
    // The other plans in the system as the lie sets them (it may free or take trucks), met with
    // their real tanks; their sensors are honest, so each costs what its plan says.
    let knock = 0;
    for (const e of existing) {
      if (e.facility_id === f.id || !e.alert?.fix) continue;
      const la = lieView.alerts.find((a) => a.facility.id === e.facility_id && a.fix);
      if (!la || la.fix!.headline === e.alert.fix.headline) continue;
      knock += (e.tripped ? la.fix!.plan.cost : outcomeOf(e.fail, net, la.fix!.plan).cost) - e.alert.fix.plan.cost;
      r.changes.push({ facility_id: e.facility_id, before: alertBrief(e.alert), after: alertBrief(la) });
    }
    const believed = real.cost + knock;
    const honestSum = honest.cost;
    const shownLevel = seriesOf(lieDs, f.tank.id, "level_pct")[ds.ts.length - 1];
    r.lie = {
      trip_unix: lieAlert?.fix?.trip_at_unix ?? null,
      plan: lieAlert ? alertBrief(lieAlert) : null,
      real_cost: real.cost,
      real_trip_unix: real.trip_min === null ? null : now + Math.round(real.trip_min * 60),
      sensor: lieAlert?.tank_sensor ? `${STATE_WORD[lieAlert.tank_sensor.state as Flag["state"]] ?? lieAlert.tank_sensor.state.toUpperCase()}: ${lieAlert.tank_sensor.evidence}` : "",
    };
    r.believed_cost = believed;
    r.honest_cost = honestSum;
    r.exposure = believed - honestSum;
    r.trucks_before = sum(existing.map((e) => e.alert?.fix?.plan.trucks ?? 0));
    r.trucks_after = sum(existing.map((e) => lieView.alerts.find((a) => a.facility.id === e.facility_id && a.fix)?.fix!.plan.trucks ?? 0));
    r.cost_delta = r.exposure;
    r.night_after = r.night_before + r.exposure;
    const t0 = (onset - now) / 60;
    step(r, t0, f.id, "red", "event", `${prettyId(f.id)} pump fails (${plainEvidence(mine.alert.event.evidence[0])}).`);
    step(r, t0, f.id, "red", "event", flat
      ? `From the same minute the level sensor ${verb}: it keeps reporting ${shownLevel.toFixed(0)}%.`
      : `From the same minute the level sensor ${verb}; the console carries its last value forward.`);
    for (const x of r.flags) step(r, x.after_min, f.id, "amber", "check", `The console's sensor check marks the tank sensor ${STATE_WORD[x.state]}.`);
    if (r.lie.plan) {
      const late = r.lie.trip_unix !== null && r.trip_unix !== null ? (r.lie.trip_unix - r.trip_unix) / 60 : null;
      step(r, 0, f.id, "amber", "lie", `The console counts down to ${r.lie.trip_unix ? hhmm(r.lie.trip_unix) : "no trip"}${late !== null ? ` (${fmtMin(late)} late)` : ""} and plans: ${lower(r.lie.plan.headline)} (${money(r.lie.plan.cost)}).`);
    }
    for (const c of r.changes) step(r, 0, c.facility_id, "amber", "lie", `${prettyId(c.facility_id)} gets "${c.after.headline}" instead of "${c.before.headline}" from the same lie.`);
    step(r, 0, f.id, "quiet", "plan", `${cap1(honest.headline)} (${money(honest.cost)}).`);
    if (r.lie.real_trip_unix !== null) {
      step(r, (r.lie.real_trip_unix - now) / 60, f.id, "red", "lie",
        `The real tank trips at ${hhmm(r.lie.real_trip_unix)}. ${cap1(wellList(r))} shut in, ${money(r.lost_per_hour)}/h lost until the repair.`);
    }
    step(r, (r.repair_done_unix - now) / 60, f.id, "quiet", "event", "Pump back after the expected repair.");
    // The chart: the real level since the failure, then the honest plan and the lie's plan met with
    // the real tank; the flat line is what the faked sensor reports.
    const L = seriesOf(ds, f.tank.id, "level_pct");
    const hist: [number, number][] = [];
    for (let i = 0; i < ds.ts.length; i++) if (ds.ts[i] >= onset && Number.isFinite(L[i])) hist.push([(ds.ts[i] - now) / 60, L[i]]);
    const every = Math.max(1, Math.ceil(hist.length / 40));
    const past = hist.filter((_, i) => i % every === 0 || i === hist.length - 1);
    const hp = levelPath(mine.fail, net, mine.alert.fix.plan, 0);
    const lp = levelPath(mine.fail, net, lieAlert ? lieAlert.fix!.plan : null, 0);
    const pl: ProjLine[] = [{ key: "past", pts: past }, { key: "plan", pts: hp.pts }, { key: "lie", pts: lp.pts }];
    const end = Math.max(...hp.pts.map((x) => x[0]), ...lp.pts.map((x) => x[0]));
    pl.push({ key: "shown", pts: [[t0, shownLevel], [end, shownLevel]] });
    const pm: ProjMark[] = [];
    hp.pickups.forEach(([t, l], k) => pm.push({ key: "truck", line: "plan", t_min: t, level_pct: l, label: k === 0 ? "truck" : "" }));
    if (lp.trip_min !== null) pm.push({ key: "trip", line: "lie", t_min: lp.trip_min, level_pct: net.shutdown_pct, label: `trips ${hhmm(now + Math.round(lp.trip_min * 60))}` });
    for (const x of r.flags) pm.push({ key: "flag", line: "shown", t_min: x.after_min, level_pct: shownLevel, label: STATE_WORD[x.state] });
    r.projection = projOf(site, pl, pm);
    r.summary = r.exposure > 0.5
      ? `Believing the sensor costs ${money(believed)} against ${money(honestSum)} for the truth: ${money(r.exposure)} more. ${r.lie.sensor ? `The console flags it ${r.lie.sensor.split(":")[0]}.` : ""}`
      : `The lie moves the countdown${r.lie.trip_unix && r.trip_unix ? ` by ${fmtMin((r.lie.trip_unix - r.trip_unix) / 60)}` : ""}, but the plan still holds (${money(0)} at stake). ${r.lie.sensor ? `The console flags it ${r.lie.sensor.split(":")[0]}.` : ""}`;
    r.summary = r.summary.trim();
    return finish(r);
  }

  // A running pump: it stops without a fault code while the sensor lies, so the detector sees no
  // failure (pump status reads idle, the level does not rise). Trusting the sensor means nobody acts.
  r.title = `${prettyId(f.id)}: the pump stops and the level sensor ${verb}`;
  const fail = stopFailure(site, f);
  const honest = joint(site, r.system_id, fail, existing);
  step(r, 0, f.id, "red", "event",
    `${prettyId(f.id)} pump stops with no fault code, and the level sensor ${verb}${flat ? ` at ${r.level_pct.toFixed(0)}%` : ""}. The console sees no pump failure.`);
  stopSteps(site, r, f, honest, fail, 0, "lie");
  r.flags = flagsFor(r.fill_pts_h);
  for (const x of r.flags) {
    step(r, x.after_min, f.id, "amber", "check", x.state === "dead"
      ? `The console marks the sensor DEAD (no reading for ${x.after_min} min). Someone must read the gauge.`
      : `The console's physics check marks the sensor ${STATE_WORD[x.state]}: the tank should be rising ${r.fill_pts_h.toFixed(1)} pts/h.`);
  }
  if (r.projection) {
    r.projection.lines.push({ key: "shown", pts: [[0, r.level_pct], [r.projection.to_min, r.level_pct]] });
    for (const x of r.flags) r.projection.marks.push({ key: "flag", line: "shown", t_min: x.after_min, level_pct: r.level_pct, label: STATE_WORD[x.state] });
  }
  r.believed_cost = r.do_nothing_cost;
  r.honest_cost = honest.after - honest.before;
  r.exposure = Math.max(0, r.do_nothing_cost - r.honest_cost);
  r.night_after = r.night_before + r.believed_cost;
  r.cost_delta = r.exposure;
  // Acting at the first firm flag (LYING or DEAD) instead of at once.
  const firm = r.flags.find((x) => x.state !== "drifting");
  if (firm) {
    const late = stopFailure(site, f, firm.after_min, r.fill_pts_h);
    const lj = joint(site, r.system_id, late, existing);
    const cost = lj.after - lj.before;
    const more = cost - (honest.after - honest.before);
    step(r, firm.after_min, f.id, "quiet", "flag",
      `${cap1(brief(site, lj.plan, f.id, now + firm.after_min * 60).headline)} (${money(cost)}${more > 0.5 ? `, ${money(more)} more than acting at once` : ""}).`);
  }
  r.summary = r.trip_unix === null
    ? `The tank would peak before the repair, so the lie costs nothing tonight.`
    : `Believed, the reading hides the stop until the tank trips at ${hhmm(r.trip_unix)} (${money(r.do_nothing_cost)}); the truth costs ${money(honest.after - honest.before)}. `
      + (r.flags.length ? `The console flags the sensor ${STATE_WORD[r.flags[r.flags.length - 1].state]} after ${r.flags[r.flags.length - 1].after_min} min.` : "The console's physics check would not flag it.");
  r.notes.push(flat
    ? "The flag times follow the console's own sensor check on this site's readings; the stop itself is not in the data."
    : "A dead sensor is flagged after two missed samples; the stop itself is not in the data.");
  return finish(r);
}

// Water lost by this data's own pipeline leaks, as a share of pump flow, and how long the
// detector took to flag them.
export function leakProfile(ds: Dataset, view: ConsoleView): { share: number | null; detect_min: number | null; leaks: number } {
  const shares: number[] = [], delays: number[] = [];
  for (const ev of view.events) {
    if (ev.category !== "pipeline_leak") continue;
    const f = facilityOfAsset(ds, ev.asset_id) ?? facilityOfAsset(ds, ev.facility_id);
    if (!f) continue;
    const S = seriesOf(ds, f.pump.id, "status"), flow = seriesOf(ds, f.pump.id, "flow_bpd"), recv = seriesOf(ds, f.pipeline.id, "receive_flow_bpd");
    const end = ev.end_unix ?? ds.now;
    const xs: number[] = [];
    for (let i = 0; i < ds.ts.length; i++) {
      if (ds.ts[i] < ev.onset_unix || ds.ts[i] > end || S[i] !== 1 || !(flow[i] > 0)) continue;
      xs.push((flow[i] - recv[i]) / flow[i]);
    }
    if (xs.length) shares.push(sum(xs) / xs.length);
    if (ev.detected_unix) delays.push((ev.detected_unix - ev.onset_unix) / 60);
  }
  const med = (v: number[]) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
  return { share: med(shares), detect_min: med(delays), leaks: shares.length };
}

function pipelineLeak(site: Site, asset: string, f: FacilityJson): Ripple {
  const r = base(site, "pipeline_leak", asset, f);
  const { ds, view } = site;
  r.title = `${prettyId(f.id)}: its line leaks`;
  const prof = leakProfile(ds, view);
  const S = seriesOf(ds, f.pump.id, "status"), flow = seriesOf(ds, f.pump.id, "flow_bpd");
  const run: number[] = [];
  for (let i = Math.max(0, ds.ts.length - 12); i < ds.ts.length; i++) if (S[i] === 1 && flow[i] > 0) run.push(flow[i]);
  const pumpBpd = run.length ? sum(run) / run.length : f.pump.max_flow_bpd;
  r.spill_bpd = prof.share !== null ? prof.share * pumpBpd : null;
  const d = prof.detect_min ?? 60;
  const sys = ds.network.systems.find((s) => s.id === r.system_id)!;
  const line = `The line to the ${r.system_id} disposal site`;
  step(r, 0, f.id, "red", "event", r.spill_bpd !== null
    ? `${line} starts leaking: about ${Math.round(r.spill_bpd)} bpd lost on the way (${(prof.share! * 100).toFixed(0)}% of the pump's ${Math.round(pumpBpd)} bpd, the median of this data's ${prof.leaks} leaks).`
    : `${line} starts leaking. This data has no past leak to size it.`);
  step(r, d, f.id, "amber", "check", `The detector flags it after about ${fmtMin(d)} of pumping${prof.detect_min !== null ? " (the median delay on this data's leaks)" : ""}: pressure low and receive flow below pump flow.`);
  if (r.spill_bpd !== null) step(r, d, f.id, "red", "event", `By then about ${Math.round(r.spill_bpd * d / 1440)} bbl are on the ground.`);
  const fail = stopFailure(site, f, d, 0, site.net.repair_min);
  const j = joint(site, r.system_id, fail);
  step(r, d, f.id, "red", "event", `Isolate the line: stop the pump. The tank now fills like a failed pump, ${r.fill_pts_h.toFixed(1)} pts/h from ${r.level_pct.toFixed(0)}%.`);
  const others = sys.facilities.filter((x) => x.id !== f.id);
  step(r, d, f.id, "quiet", "event", `${others.length} other ${r.system_id} facilit${others.length === 1 ? "y sends" : "ies send"} water to the disposal site on ${others.length === 1 ? "its own line" : "their own lines"}, so ${others.length === 1 ? "it keeps" : "they keep"} flowing; ${others.length === 1 ? "it shares" : "they share"} the trucks.`);
  stopSteps(site, r, f, j, fail, d, "ignored", [[0, r.level_pct]]);
  r.notes.push(`EOG's ops data gives no repair time for a line, so this uses the pump repair time (${(site.net.repair_min / 60).toFixed(0)} h).`);
  r.summary = `About ${r.spill_bpd !== null ? Math.round(r.spill_bpd * d / 1440) : "?"} bbl spilled before the detector flags it at ${fmtMin(d)}; isolating the line `
    + (r.trip_unix === null ? "needs nothing else." : `trips the tank at ${hhmm(r.trip_unix)} unless ${lower(r.plan!.headline)} (${money(r.plan!.cost)}).`)
    + (j.changes.length ? ` ${j.changes.length} other plan${j.changes.length > 1 ? "s" : ""} change for the trucks.` : "");
  return finish(r);
}

// The ripple of one event. `view` is buildConsole(ds) (passed in so a caller that has it does not
// rerun the engine). Throws on an unknown kind or asset.
export function whatIf(ds: Dataset, view: ConsoleView, kind: WhatIfKind, asset: string): Ripple {
  if (!WHAT_IF_KINDS.includes(kind)) throw new Error(`kind must be one of ${WHAT_IF_KINDS.join(", ")}`);
  const f = facilityOfAsset(ds, asset);
  if (!f) throw new Error(`${asset} is not a facility, tank, pump or pipeline in this site`);
  const site = siteOf(ds, view);
  if (kind === "pump_fail") return pumpFail(site, asset, f);
  if (kind === "pipeline_leak") return pipelineLeak(site, asset, f);
  return sensorCase(site, kind, asset, f);
}
