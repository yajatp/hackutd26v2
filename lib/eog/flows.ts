// Rate in vs rate out: per facility, one point per hour over the last hours of data before "now".
// inflow is the water into the tank (facility inflow_bpd), outflow is the pump (flow_bpd). The
// physics change is what EOG SPEC.md "Normal behavior" says the level should have done over the
// hour, (in - out) / 24 / capacity x 100 per hour; reported is what the level sensor did.
// Pure TypeScript like the rest of lib/eog: it runs in the finish_ingest reducer.
import { seriesKey, type Dataset } from "./load.ts";
import { physicsRate } from "../rules/physics.ts";

export const FLOW_HOURS = 24;

export interface FlowPoint {
  end_ts: number;            // the hour ends here (data time)
  inflow_bpd: number;        // mean over the hour's samples; NaN when none
  outflow_bpd: number;       // mean pump flow over the hour
  level_pct: number;         // level at the end of the hour
  physics_pts: number;       // level change physics expects over the hour
  reported_pts: number;      // level change the sensor reported
}

export interface FlowSeries {
  facility_id: string;
  system_id: string;
  tank_id: string;
  capacity_bbl: number;
  step_s: number;            // 3600
  points: FlowPoint[];       // oldest first, the last one ends at "now"
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

export function flowSeries(ds: Dataset, hours: number = FLOW_HOURS): FlowSeries[] {
  const { ts, now } = ds;
  const out: FlowSeries[] = [];
  for (const sys of ds.network.systems) for (const f of sys.facilities) {
    const inflow = ds.series.get(seriesKey(f.id, "inflow_bpd"));
    const flow = ds.series.get(seriesKey(f.pump.id, "flow_bpd"));
    const level = ds.series.get(seriesKey(f.tank.id, "level_pct"));
    const cap = f.tank.capacity_bbl;
    const at = (a: Float64Array | undefined, i: number) => (a ? a[i] : NaN);
    const points: FlowPoint[] = [];
    // i walks ts once; bucket h covers (end - 3600, end].
    let i = 0;
    for (let h = hours - 1; h >= 0; h--) {
      const end = now - h * 3600, start = end - 3600;
      while (i < ts.length && ts[i] <= start) i++;
      const first = i;
      const ins: number[] = [], outs: number[] = [];
      let physics = 0;
      for (; i < ts.length && ts[i] <= end; i++) {
        const q = at(inflow, i), p = at(flow, i);
        if (Number.isFinite(q)) ins.push(q);
        if (Number.isFinite(p)) outs.push(p);
        // The rate at a tick holds until the next one (lib/rules/physics.ts freeRun).
        if (i > 0) {
          const r = physicsRate(at(inflow, i - 1), at(flow, i - 1), cap);
          if (Number.isFinite(r)) physics += r * (ts[i] - Math.max(ts[i - 1], start)) / 3600;
        }
      }
      const last = i - 1;
      const before = first - 1;
      points.push({
        end_ts: end,
        inflow_bpd: mean(ins),
        outflow_bpd: mean(outs),
        level_pct: last >= first ? at(level, last) : NaN,
        physics_pts: last >= first ? physics : NaN,
        reported_pts: last >= first && before >= 0 ? at(level, last) - at(level, before) : NaN,
      });
    }
    out.push({ facility_id: f.id, system_id: sys.id, tank_id: f.tank.id, capacity_bbl: cap, step_s: 3600, points });
  }
  return out;
}
