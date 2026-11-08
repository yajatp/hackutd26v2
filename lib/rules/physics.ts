// Tank physics for sensor health. Pure TypeScript: no Node or DOM APIs, no wall clock.
// EOG SPEC.md "Normal behavior": level change per hour = (inflow - pump flow) / 24 / capacity x 100.
// Every ID, capacity and limit comes from ds.network; every value from the telemetry series.
import { seriesKey, type Dataset } from "../eog/load.ts";

export const WINDOW_S = 3600;  // reported level vs physics is compared over 1 hour of data time
export const DRIFT_FACTOR = 1.5; // DRIFTING line = 1.5 x worst clean error on this folder
export const LIE_FACTOR = 2;     // LYING line = max(LIE_FLOOR, 2 x worst clean error)
export const LIE_FLOOR = 2.0;    // pts/h

export function physicsRate(inflow_bpd: number, flow_bpd: number, capacity_bbl: number): number {
  return (inflow_bpd - flow_bpd) / 24 / capacity_bbl * 100;
}

// Data spacing: the median gap between distinct timestamps (300 s in EOG's folders).
export function stepSeconds(ts: readonly number[]): number {
  if (ts.length < 2) return NaN;
  const d: number[] = [];
  for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}

// Last index with ts[i] <= t, or -1.
export function indexAtOrBefore(ts: readonly number[], t: number): number {
  let lo = 0, hi = ts.length - 1, r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (ts[m] <= t) { r = m; lo = m + 1; } else hi = m - 1;
  }
  return r;
}

export interface TankPhysics {
  facility_id: string;
  tank_id: string;
  pump_id: string;
  capacity_bbl: number;
  shutdown_pct: number;
  keys: { level: string; flow: string; inflow: string };
  level: Float64Array;   // reported level_pct
  rate: Float64Array;    // physics pts/h at each tick, from inflow_bpd and flow_bpd
  winStart: Int32Array;  // first tick of the 1-hour window ending at each tick; -1 before the first full hour
  err: Float64Array;     // (reported - physics) level change over that window, pts/h; NaN without a full hour
}

// Physics run forward from the reported level at tick `from` to tick `to`. The rate at a tick
// holds until the next one, and the level stays within 0 and the shutdown limit (at shutdown the
// wells shut in and the level holds, EOG SPEC.md).
export function freeRun(tp: TankPhysics, ts: readonly number[], from: number, to: number): number {
  let p = tp.level[from];
  for (let k = from; k < to; k++) {
    p += tp.rate[k] * (ts[k + 1] - ts[k]) / 3600;
    p = Math.min(tp.shutdown_pct, Math.max(0, p));
  }
  return p;
}

const tankCache = new WeakMap<Dataset, TankPhysics[]>();

// One entry per facility whose tank level, pump flow and facility inflow are all in the telemetry.
export function tankPhysics(ds: Dataset): TankPhysics[] {
  const hit = tankCache.get(ds);
  if (hit) return hit;
  const { ts } = ds;
  const shutdown_pct = ds.network.defaults.tank_limits_pct.shutdown;
  const out: TankPhysics[] = [];
  for (const sys of ds.network.systems) for (const fac of sys.facilities) {
    const keys = { level: seriesKey(fac.tank.id, "level_pct"), flow: seriesKey(fac.pump.id, "flow_bpd"), inflow: seriesKey(fac.id, "inflow_bpd") };
    const level = ds.series.get(keys.level), flow = ds.series.get(keys.flow), inflow = ds.series.get(keys.inflow);
    if (!level || !flow || !inflow) continue;
    const cap = fac.tank.capacity_bbl;
    const rate = new Float64Array(ts.length);
    for (let i = 0; i < ts.length; i++) rate[i] = physicsRate(inflow[i], flow[i], cap);
    const tp: TankPhysics = {
      facility_id: fac.id, tank_id: fac.tank.id, pump_id: fac.pump.id, capacity_bbl: cap, shutdown_pct, keys,
      level, rate, winStart: new Int32Array(ts.length).fill(-1), err: new Float64Array(ts.length).fill(NaN),
    };
    let s = 0;
    for (let i = 0; i < ts.length; i++) {
      if (ts[i] - ts[0] < WINDOW_S) continue;
      while (ts[s] < ts[i] - WINDOW_S) s++;
      tp.winStart[i] = s;
      tp.err[i] = (level[i] - freeRun(tp, ts, s, i)) / ((ts[i] - ts[s]) / 3600);
    }
    out.push(tp);
  }
  tankCache.set(ds, out);
  return out;
}

// Whether tick m can be judged against physics: a full window, a real level reading at m, and
// real flow and inflow readings through tick m - 1 (the last step of the 1-hour span). The loader
// fills gaps by carrying values forward, so lastSeen is the only gap it shows.
export function judgeable(ds: Dataset, tp: TankPhysics, m: number): boolean {
  if (m < 1 || Number.isNaN(tp.err[m])) return false;
  const seen = (k: string) => ds.lastSeen.get(k) ?? -Infinity;
  return seen(tp.keys.level) >= ds.ts[m] && Math.min(seen(tp.keys.flow), seen(tp.keys.inflow)) >= ds.ts[m - 1];
}

// A span of data changed by an injected fault: these series after from_ts.
export interface FaultSpan { keys: readonly string[]; from_ts: number }

// Faults travel on the Dataset that injectFault returns (see faults.ts).
export function faultSpansOf(ds: Dataset): readonly FaultSpan[] {
  return (ds as { faults?: readonly FaultSpan[] }).faults ?? [];
}

// Earliest from_ts of any span that touches one of these series; Infinity if none.
export function faultFrom(spans: readonly FaultSpan[], keys: readonly string[]): number {
  let t = Infinity;
  for (const s of spans) if (s.keys.some((k) => keys.includes(k))) t = Math.min(t, s.from_ts);
  return t;
}

export interface Calibration {
  worst_clean_err: number; // worst |1-hour physics error| on clean ticks, pts/h
  drift_line: number;      // DRIFTING above this
  lie_line: number;        // LYING above this for 2 ticks
  clean_ticks: number;     // tank ticks the worst was taken over
}

const calCache = new WeakMap<Dataset, Calibration>();

// Lines for this folder, from its own clean data. Ticks whose window holds data changed by a
// fault are skipped, so an injected fault never moves the lines.
export function calibrate(ds: Dataset, exclude: readonly FaultSpan[] = faultSpansOf(ds)): Calibration {
  const useCache = exclude === faultSpansOf(ds);
  const hit = useCache ? calCache.get(ds) : undefined;
  if (hit) return hit;
  let worst = 0, n = 0;
  for (const tp of tankPhysics(ds)) {
    const tainted = faultFrom(exclude, [tp.keys.level, tp.keys.flow, tp.keys.inflow]);
    for (let m = 0; m < ds.ts.length; m++) {
      if (ds.ts[m] > tainted || !judgeable(ds, tp, m)) continue;
      worst = Math.max(worst, Math.abs(tp.err[m]));
      n++;
    }
  }
  const cal = { worst_clean_err: worst, drift_line: DRIFT_FACTOR * worst, lie_line: Math.max(LIE_FLOOR, LIE_FACTOR * worst), clean_ticks: n };
  if (useCache) calCache.set(ds, cal);
  return cal;
}
