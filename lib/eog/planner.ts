// EOG "Beat the Shutdown" cost planner, ported line for line from prototypes/planner.py.
// Pure TypeScript: no Node or DOM APIs, no clock (it also runs in a SpacetimeDB reducer).
//
// Units inside the planner: minutes, barrels, dollars. t = 0 is the plan start.
// Rules (EOG SPEC.md "Plans"):
// - Pump failed => the tank fills at the facility inflow (sum of producing wells' water).
// - The tank trips at shutdown % of capacity; then all wells shut in until the repair ends.
// - Trucks: all trucks of a plan are called at t = 0, arrive together at response_min, then every
//   cycle_min. Each trip removes truck_capacity_bbl (capped by the volume in the tank) and costs
//   cost_per_trip. Every trip must arrive before the repair ends and before the tank trips.
// - Shut-in: instant, may start late, lasts until the repair ends; cost = lost revenue x time.
//   Wells are ranked by cost per bbl avoided = revenue per day / baseline water.
// - Do nothing: cost = the facility's lost revenue from the trip until the repair ends.
// - Concurrent failures in a system share its fleet; a truck serves one facility.
import type { NetworkJson, OpsJson } from "./types.ts";

const EPS = 1e-9;

export interface PlanWell { id: string; water_bpd: number; rev_per_day: number }

export interface PlanFacility {
  id: string;
  system: string;
  capacity_bbl: number;
  wells: PlanWell[];
  response_min: number;
  cycle_min: number;
}

export interface PlanNetwork {
  facilities: Record<string, PlanFacility>;
  fleet: Record<string, number>;
  shutdown_pct: number;
  truck_cap: number;
  trip_cost: number;
  repair_min: number;
}

// A pump failure as seen at plan start. wells_override carries live water rates.
export interface Failure {
  event_id: string;
  facility: PlanFacility;
  level_pct: number;
  horizon_min: number;          // repair time remaining at plan start
  wells_override?: PlanWell[];
}

export type PlanKind = "none_needed" | "trucks" | "shut_in" | "mix" | "do_nothing" | "infeasible";

export interface Plan {
  event_id: string;
  kind: PlanKind;
  trucks: number;
  trips_per_truck: number;
  shut_ins: { well_id: string; start_min: number }[];   // sorted by start minute
  cost: number;
  truck_cost: number;
  shut_in_cost: number;
  trip_at_min: number | null;     // no-action trip time
  peak_pct: number | null;        // peak level, none_needed only
  busy_until_min: number | null;  // trucks free again (plan-relative)
}

type ShutIns = Map<string, number>;   // well id -> start minute, in insertion order like a Python dict

const waterPm = (w: PlanWell) => w.water_bpd / 1440;
const revPm = (w: PlanWell) => w.rev_per_day / 1440;
const costPerBbl = (w: PlanWell) => (w.water_bpd > 0 ? w.rev_per_day / w.water_bpd : Infinity);
const sum = (xs: number[]) => xs.reduce((u, x) => u + x, 0);
const wellsOf = (f: Failure) => f.wells_override ?? f.facility.wells;

// Python's round(x, d) for the values seen here; exact .5 ties go to even, as Python does.
function pyRound(x: number, d = 0): number {
  const m = 10 ** d;
  const y = x * m;
  const fl = Math.floor(y);
  const diff = y - fl;
  const r = diff > 0.5 ? fl + 1 : diff < 0.5 ? fl : fl % 2 === 0 ? fl : fl + 1;
  return r / m;
}

function plan(event_id: string, kind: PlanKind, p: Partial<Plan> = {}): Plan {
  return {
    event_id, kind, trucks: 0, trips_per_truck: 0, shut_ins: [], cost: 0, truck_cost: 0, shut_in_cost: 0,
    trip_at_min: null, peak_pct: null, busy_until_min: null, ...p,
  };
}

export function planNetwork(network: NetworkJson, ops: OpsJson): PlanNetwork {
  const oil = ops.prices.oil_per_bbl, gas = ops.prices.gas_per_mcf;
  const facilities: Record<string, PlanFacility> = {};
  for (const s of network.systems) {
    const sops = ops.systems[s.id];
    for (const fa of s.facilities) {
      const fo = sops.facilities[fa.id];
      facilities[fa.id] = {
        id: fa.id, system: s.id, capacity_bbl: fa.tank.capacity_bbl,
        wells: fa.wells.map((w) => ({ id: w.id, water_bpd: w.baseline_water_bpd, rev_per_day: w.oil_bpd * oil + w.gas_mcfd * gas })),
        response_min: fo.response_min, cycle_min: fo.cycle_min,
      };
    }
  }
  const fleet: Record<string, number> = {};
  for (const [k, v] of Object.entries(ops.systems)) fleet[k] = v.emergency_fleet_size;
  return {
    facilities, fleet,
    shutdown_pct: network.defaults.tank_limits_pct.shutdown,
    truck_cap: ops.emergency_trucking.truck_capacity_bbl,
    trip_cost: ops.emergency_trucking.cost_per_trip,
    repair_min: ops.expected_repair_hours.pump_failure * 60,
  };
}

// Same text as Plan.label() in planner.py.
export function planLabel(p: Plan): string {
  const money = (x: number) => "$" + pyRound(x).toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (p.kind === "none_needed") return `none (peaks ~${(p.peak_pct ?? 0).toFixed(1)}%, never trips)`;
  if (p.kind === "do_nothing") return `do nothing / accept trip (~${money(p.cost)})`;
  const parts: string[] = [];
  if (p.trucks) {
    parts.push(`${p.trucks} truck${p.trucks > 1 ? "s" : ""}, ${p.trips_per_truck} trip${p.trips_per_truck > 1 ? "s" : ""}${p.trucks > 1 ? " each" : ""}`);
  }
  for (const s of p.shut_ins) parts.push(`shut in ${s.well_id} at +${s.start_min} min`);
  return parts.join(" + ") + ` (~${money(p.cost)})`;
}

export interface SimResult { ok: boolean; peak: number; removed: number[]; reason: string }

// Exact event simulation. ok: never reaches shutdown before the repair ends, and every trip
// arrives before the trip and before the repair ends.
export function simulate(fail: Failure, net: PlanNetwork, trucks: number, trips: number, shutIns: ShutIns,
  checkTrip = true): SimResult {
  const fac = fail.facility;
  const H = fail.horizon_min;
  const vmax = net.shutdown_pct / 100 * fac.capacity_bbl;
  let v = fail.level_pct / 100 * fac.capacity_bbl;
  const wells = wellsOf(fail);
  const arrivals = trucks ? Array.from({ length: trips }, (_, k) => fac.response_min + k * fac.cycle_min) : [];
  const pts = [...new Set([0, H, ...[...shutIns.values()].filter((s) => s >= 0 && s <= H), ...arrivals])].sort((a, b) => a - b);
  let t = 0;
  let peak = v;
  const removed: number[] = [];
  const rate = (at: number) => sum(wells.filter((w) => !(shutIns.has(w.id) && shutIns.get(w.id)! <= at + EPS)).map(waterPm));
  for (const p of pts) {
    if (p > H + EPS) break;
    const dt = p - t;
    const r = rate(t);
    if (dt > 0) {
      v += r * dt;
      peak = Math.max(peak, v);
      if (checkTrip && v >= vmax - 1e-7) return { ok: false, peak, removed, reason: `trips before t=${p.toFixed(0)}` };
    }
    t = p;
    if (arrivals.includes(p)) {
      if (p >= H - EPS) return { ok: false, peak, removed, reason: "trip arrives after repair end" };
      const take = Math.min(trucks * net.truck_cap, v);
      v -= take;
      removed.push(take);
    }
  }
  return { ok: v < vmax - 1e-7, peak, removed, reason: "" };
}

export function noActionTripMin(fail: Failure, net: PlanNetwork): number {
  const fac = fail.facility;
  const head = net.shutdown_pct / 100 * fac.capacity_bbl - fail.level_pct / 100 * fac.capacity_bbl;
  const q = sum(wellsOf(fail).map(waterPm));
  return q > 0 ? head / q : Infinity;
}

// Largest whole minute strictly before the exact latest start: touching shutdown exactly counts
// as a trip (answer key EVENT_21: exact 52.000 -> +51).
function roundStart(t: number): number {
  return Math.max(0, Math.ceil(pyRound(t, 6)) - 1);
}

// Python itertools.product(range(lo, hi), repeat=n): the last position changes fastest.
function* product(lo: number, hi: number, n: number): Generator<number[]> {
  if (hi <= lo) return;
  const a = new Array<number>(n).fill(lo);
  while (true) {
    yield a.slice();
    let i = n - 1;
    while (i >= 0 && ++a[i] === hi) { a[i] = lo; i--; }
    if (i < 0) return;
  }
}

// Given a truck schedule, add the cheapest shut-ins so the tank never trips.
// Step 1 (fast path, exact when feasible): fractional knapsack on cost per bbl avoided against
// the end-of-repair constraint, each well as late as possible.
// Step 2 (the tank would trip before a truck arrives): per well, choose which interval between
// truck arrivals its shut-in starts in (or none); for a fixed choice the constraints are nested
// covering constraints, and the inner-first cheapest greedy is optimal.
export function completeWithShutIns(fail: Failure, net: PlanNetwork, trucks: number, trips: number): { shut: ShutIns; ok: boolean } {
  const fac = fail.facility;
  const H = fail.horizon_min;
  const vmax = net.shutdown_pct / 100 * fac.capacity_bbl;
  const v0 = fail.level_pct / 100 * fac.capacity_bbl;
  const wells = wellsOf(fail).map((w, i) => ({ w, i }))
    .sort((a, b) => costPerBbl(a.w) - costPerBbl(b.w) || a.i - b.i).map((x) => x.w);
  const q = sum(wells.map(waterPm));
  const { removed } = simulate(fail, net, trucks, trips, new Map(), false);
  // ---- step 1
  let deficit = v0 + q * H - sum(removed) - vmax;
  const shut: ShutIns = new Map();
  for (const w of wells) {
    if (deficit <= 1e-7) break;
    if (waterPm(w) <= 0) continue;
    const start = roundStart(H - deficit / waterPm(w));
    shut.set(w.id, start);
    deficit -= waterPm(w) * (H - start);
  }
  if (simulate(fail, net, trucks, trips, shut).ok) return { shut, ok: true };
  // ---- step 2
  const arrivals = trucks ? Array.from({ length: trips }, (_, k) => fac.response_min + k * fac.cycle_min) : [];
  const C = [...arrivals, H];
  const K = C.length;
  const need: number[] = [];
  for (let k = 0; k < K; k++) {
    const before = k < K - 1 ? sum(removed.slice(0, k)) : sum(removed);
    need.push(v0 + q * C[k] - before - vmax + 1e-6);
  }
  const Wl = wells.filter((w) => waterPm(w) > 0);
  const cands: { cost: number; st: ShutIns }[] = [];
  for (const assign of product(-1, K, Wl.length)) {
    const lo: number[] = [], hi: number[] = [];
    Wl.forEach((w, i) => {
      const sl = assign[i];
      if (sl < 0) { lo.push(0); hi.push(0); }
      else { lo.push(waterPm(w) * (H - C[sl])); hi.push(waterPm(w) * (H - (sl > 0 ? C[sl - 1] : 0))); }
    });
    const z = lo.slice();
    let ok = true;
    for (let k = 0; k < K; k++) {
      const mem: number[] = [];
      assign.forEach((sl, i) => { if (sl >= 0 && sl <= k) mem.push(i); });
      const N = need[k] + sum(mem.map((i) => waterPm(Wl[i]) * (H - C[k])));
      let cur = sum(mem.map((i) => z[i]));
      for (const i of mem) {        // Wl is already sorted cheapest first
        if (cur >= N) break;
        const add = Math.min(hi[i] - z[i], N - cur);
        z[i] += add;
        cur += add;
      }
      if (cur < N - 1e-9) { ok = false; break; }
    }
    if (!ok) continue;
    const st: ShutIns = new Map();
    Wl.forEach((w, i) => { if (z[i] > 1e-9) st.set(w.id, roundStart(H - z[i] / waterPm(w))); });
    const cost = sum(Wl.filter((w) => st.has(w.id)).map((w) => revPm(w) * (H - st.get(w.id)!)));
    cands.push({ cost, st });
  }
  const sorted = cands.map((c, i) => ({ c, i })).sort((a, b) => a.c.cost - b.c.cost || a.i - b.i);
  for (const { c } of sorted) if (simulate(fail, net, trucks, trips, c.st).ok) return { shut: c.st, ok: true };
  return { shut, ok: false };
}

export function maxTrips(fac: PlanFacility, H: number): number {
  if (fac.response_min >= H) return 0;
  return Math.floor((H - fac.response_min - EPS) / fac.cycle_min) + 1;
}

// Every candidate plan for one failure: do nothing, then each truck count and trip count with
// the cheapest shut-ins that complete it.
export function optionsFor(fail: Failure, net: PlanNetwork, trucksAvail: number): Plan[] {
  const fac = fail.facility;
  const H = fail.horizon_min;
  const T = noActionTripMin(fail, net);
  if (T > H + EPS) {   // reaching shutdown exactly at repair end counts as a trip
    const q = sum(wellsOf(fail).map(waterPm));
    const peak = (fail.level_pct / 100 * fac.capacity_bbl + q * H) / fac.capacity_bbl * 100;
    return [plan(fail.event_id, "none_needed", { peak_pct: peak })];
  }
  const facRevPm = sum(fac.wells.map(revPm));
  const opts: Plan[] = [plan(fail.event_id, "do_nothing", { cost: facRevPm * (H - T), trip_at_min: T })];
  const M = maxTrips(fac, H);
  for (let n = 0; n <= trucksAvail; n++) {
    const ms = n === 0 ? [0] : Array.from({ length: M }, (_, i) => i + 1);
    for (const m of ms) {
      const { shut, ok } = completeWithShutIns(fail, net, n, m);
      if (!ok) continue;
      const sc = sum(wellsOf(fail).filter((w) => shut.has(w.id)).map((w) => revPm(w) * (H - shut.get(w.id)!)));
      const tc = n * m * net.trip_cost;
      const kind: PlanKind = n && shut.size ? "mix" : n ? "trucks" : "shut_in";
      const shutIns = [...shut.entries()].map(([well_id, start_min], i) => ({ well_id, start_min, i }))
        .sort((a, b) => a.start_min - b.start_min || a.i - b.i).map(({ well_id, start_min }) => ({ well_id, start_min }));
      opts.push(plan(fail.event_id, kind, {
        trucks: n, trips_per_truck: m, shut_ins: shutIns, cost: tc + sc, truck_cost: tc, shut_in_cost: sc,
        trip_at_min: T, busy_until_min: n ? fac.response_min + (m - 1) * fac.cycle_min + fac.cycle_min : null,
      }));
    }
  }
  return opts;
}

// Tie-breaks: cheapest (to the cent), then fewest trucks tied up, then fewest trips.
function key(combo: Plan[]): [number, number, number] {
  return [
    pyRound(sum(combo.map((p) => p.cost)), 2),
    sum(combo.map((p) => p.trucks)),
    sum(combo.map((p) => p.trucks * p.trips_per_truck)),
  ];
}

function less(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

// Plan concurrent failures in one system together (brute force over truck splits).
export function planJoint(fails: Failure[], net: PlanNetwork, trucksAvail: number): { plans: Plan[]; combos: number } {
  const per = fails.map((f) => optionsFor(f, net, trucksAvail));
  let best: Plan[] | null = null;
  let combos = 0;
  const idx = new Array<number>(per.length).fill(0);
  if (per.some((o) => o.length === 0)) return { plans: [], combos: 0 };
  while (true) {
    const combo = idx.map((j, i) => per[i][j]);
    if (sum(combo.map((p) => p.trucks)) <= trucksAvail) {
      combos++;
      if (best === null || less(key(combo), key(best))) best = combo;
    }
    let i = per.length - 1;
    while (i >= 0 && ++idx[i] === per[i].length) { idx[i] = 0; i--; }
    if (i < 0) break;
  }
  return { plans: best ?? [], combos };
}

// full_week mode: plan each failure at its onset, in onset order, assuming earlier plans were
// followed (trucks busy until back from their last trip).
export function planSequential(items: { onset_min: number; failure: Failure }[], net: PlanNetwork): (Plan & { free_trucks: number })[] {
  const busy = new Map<string, number[]>();
  const out: (Plan & { free_trucks: number })[] = [];
  const ordered = items.map((x, i) => ({ x, i })).sort((a, b) => a.x.onset_min - b.x.onset_min || a.i - b.i).map((y) => y.x);
  for (const { onset_min, failure } of ordered) {
    const sys = failure.facility.system;
    const fleet = net.fleet[sys];
    const busyList = (busy.get(sys) ?? []).filter((b) => b > onset_min + EPS);
    const free = fleet - busyList.length;
    const p = planJoint([failure], net, free).plans[0];
    if (p.trucks) for (let k = 0; k < p.trucks; k++) busyList.push(onset_min + p.busy_until_min!);
    busy.set(sys, busyList);
    out.push({ ...p, free_trucks: free });
  }
  return out;
}
