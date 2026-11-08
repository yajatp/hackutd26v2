// Sensor health: ok | shut_in | dead | drifting | lying, with evidence built from the data.
// Pure TypeScript: no Node or DOM APIs, no wall clock. Health can be read at any tick.
//   LYING    (tank level) the last 2 real readings miss physics by more than the LYING line.
//            Wins over DEAD and DRIFTING: a sensor caught lying stays lying if it goes silent.
//   DEAD     no new reading for 2 samples of data time.
//   DRIFTING (tank level) the 1-hour physics error is above the DRIFTING line.
//   SHUT IN  (tank level) flat at its network.json shutdown limit. Not a fault.
import type { Dataset } from "../eog/load.ts";
import { faultsOf } from "./faults.ts";
import {
  calibrate, faultFrom, freeRun, indexAtOrBefore, judgeable, stepSeconds, tankPhysics,
  type Calibration, type TankPhysics,
} from "./physics.ts";

export type SensorState = "ok" | "shut_in" | "dead" | "drifting" | "lying";

export interface SensorHealth {
  key: string;               // seriesKey(asset_id, metric)
  asset_id: string;
  metric: string;
  state: SensorState;
  evidence: string;
  ts: number;                // data time this result is for
  last_heartbeat_ts: number; // last real reading at or before ts
  value: number;             // reading at ts (carried forward over a gap)
  error_pts_h?: number;      // tank level: reported minus physics over the last real 1-hour window
  simulated?: true;          // caused by an injected fault (faults.ts)
}

export const DEAD_SAMPLES = 2;    // no reading for this many samples of data time
export const AT_LIMIT_PTS = 0.05; // level within this of shutdown and moving less than this = flat at the limit

interface Sensor {
  key: string;
  asset_id: string;
  metric: string;
  series: Float64Array;
  lastSeen: number;
  simFrom: number;            // data time after which an injected fault touches this result's inputs
  simSelf: number;            // data time after which an injected fault changed this sensor itself
  tank?: TankPhysics;
  runStart?: Int32Array;      // first tick of the current run over the DRIFTING line, -1 if none
}

interface Model { ds: Dataset; step: number; cal: Calibration; sensors: Sensor[]; byKey: Map<string, Sensor> }

const models = new WeakMap<Dataset, Model>();

function model(ds: Dataset): Model {
  const hit = models.get(ds);
  if (hit) return hit;
  const faults = faultsOf(ds);
  const cal = calibrate(ds, faults);
  const tanks = new Map(tankPhysics(ds).map((tp) => [tp.keys.level, tp]));
  const sensors: Sensor[] = [];
  const byKey = new Map<string, Sensor>();
  for (const [key, series] of ds.series) {
    const bar = key.indexOf("|");
    const tank = tanks.get(key);
    const s: Sensor = {
      key, asset_id: key.slice(0, bar), metric: key.slice(bar + 1), series,
      lastSeen: ds.lastSeen.get(key) ?? -Infinity,
      simFrom: faultFrom(faults, tank ? [tank.keys.level, tank.keys.flow, tank.keys.inflow] : [key]),
      simSelf: faultFrom(faults, [key]),
    };
    if (tank) {
      s.tank = tank;
      s.runStart = new Int32Array(ds.ts.length).fill(-1);
      for (let m = 0; m < ds.ts.length; m++) {
        if (!judgeable(ds, tank, m) || Math.abs(tank.err[m]) <= cal.drift_line) continue;
        s.runStart[m] = m > 0 && s.runStart[m - 1] >= 0 ? s.runStart[m - 1] : m;
      }
    }
    sensors.push(s);
    byKey.set(key, s);
  }
  const m: Model = { ds, step: stepSeconds(ds.ts), cal, sensors, byKey };
  models.set(ds, m);
  return m;
}

const round1 = (v: number) => String(Math.round(v * 10) / 10);
const signed = (v: number) => (Math.round(v * 10) / 10 > 0 ? "+" : "") + round1(v);
const minutes = (s: number) => String(Math.round(s / 60));
function unit(metric: string): string {
  if (metric.endsWith("_pct")) return "%";
  if (metric.endsWith("_bpd")) return " bpd";
  if (metric.endsWith("_psi")) return " psi";
  return "";
}

function evaluate(md: Model, s: Sensor, i: number): SensorHealth {
  const { ds, cal } = md;
  const ts = ds.ts;
  const t = ts[i];
  const lastReal = Math.min(t, s.lastSeen);
  const j = lastReal >= t ? i : indexAtOrBefore(ts, lastReal); // last tick with a real reading
  const h: SensorHealth = {
    key: s.key, asset_id: s.asset_id, metric: s.metric, state: "ok", evidence: "",
    ts: t, last_heartbeat_ts: lastReal, value: s.series[i],
  };
  const tp = s.tank;
  const judge = (m: number) => tp !== undefined && m >= 1 && judgeable(ds, tp, m);
  if (tp && judge(j)) h.error_pts_h = tp.err[j];

  if (tp && judge(j) && judge(j - 1) && Math.abs(tp.err[j]) > cal.lie_line && Math.abs(tp.err[j - 1]) > cal.lie_line) {
    // Compare from the last tick that agreed with physics, just before this run over the line.
    const a = Math.max(s.runStart![j] - 1, 0);
    const hours = (ts[j] - ts[a]) / 3600;
    const end = freeRun(tp, ts, a, j);
    h.state = "lying";
    if (end >= tp.shutdown_pct - AT_LIMIT_PTS && tp.level[j] > tp.shutdown_pct + AT_LIMIT_PTS) {
      // Physics is pinned at the shutdown limit (wells shut in), so a rate comparison would
      // mislead: say what is impossible about the reading instead.
      h.evidence = `Sensor says ${round1(tp.level[j])}%, above the ${round1(tp.shutdown_pct)}% shutdown limit the tank holds at. Off for ${minutes(ts[j] - ts[a])} min.`;
    } else {
      const physics = (end - tp.level[a]) / hours;
      const sensor = (tp.level[j] - tp.level[a]) / hours;
      const says = round1(sensor) === "0" ? "0" : `${signed(sensor)} pts/h`;
      h.evidence = `Physics says ${signed(physics)} pts/h. Sensor says ${says}. Off for ${minutes(ts[j] - ts[a])} min.`;
    }
  } else if (t - lastReal >= DEAD_SAMPLES * md.step) {
    h.state = "dead";
    h.evidence = j < 0
      ? "No reading in this data."
      : `No reading for ${minutes(t - lastReal)} min. Last value ${round1(s.series[j])}${unit(s.metric)}.`;
  } else if (tp && judge(j) && Math.abs(tp.err[j]) > cal.drift_line) {
    h.state = "drifting";
    h.evidence = `Off from physics by ${round1(Math.abs(tp.err[j]))} pts/h, growing.`;
  } else if (tp && j >= 1 && tp.level[j] >= tp.shutdown_pct - AT_LIMIT_PTS && Math.abs(tp.level[j] - tp.level[j - 1]) <= AT_LIMIT_PTS) {
    h.state = "shut_in";
    h.evidence = `Level ${round1(tp.level[j])}% at the ${round1(tp.shutdown_pct)}% shutdown limit and flat: wells shut in, not a sensor fault.`;
  } else if (t > lastReal) {
    h.evidence = `No reading for ${minutes(t - lastReal)} min.`;
  } else if (tp && judge(j)) {
    h.evidence = `Within ${round1(cal.drift_line)} pts/h of physics (off ${round1(Math.abs(tp.err[j]))}).`;
  }
  // SIMULATED when the fault changed this sensor, or when a fault on one of its inputs (the pump
  // flow or facility inflow behind a tank's physics) made it read as a problem. A healthy tank
  // next to a faked pump is not labeled.
  const fault = h.state === "dead" || h.state === "drifting" || h.state === "lying";
  if (t > s.simSelf || (t > s.simFrom && fault)) h.simulated = true;
  return h;
}

function tickIndex(ds: Dataset, at_ts: number): number {
  const i = indexAtOrBefore(ds.ts, at_ts);
  if (i < 0) throw new RangeError(`no data at or before ${at_ts}`);
  return i;
}

// Health of every sensor at the last tick at or before at_ts (default: the folder's "now").
export function healthAt(ds: Dataset, at_ts: number = ds.now): SensorHealth[] {
  const md = model(ds);
  const i = tickIndex(ds, at_ts);
  return md.sensors.map((s) => evaluate(md, s, i));
}

export function healthOf(ds: Dataset, asset_id: string, metric: string, at_ts: number = ds.now): SensorHealth {
  const md = model(ds);
  const s = md.byKey.get(`${asset_id}|${metric}`);
  if (!s) throw new Error(`telemetry.csv has no ${metric} for ${asset_id}`);
  return evaluate(md, s, tickIndex(ds, at_ts));
}
