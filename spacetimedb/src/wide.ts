// Dataset <-> reading rows. One WideRow per facility per timestamp holds every value the EOG
// engine reads for that facility, exactly as lib/eog/load.ts gives it (carried forward, NaN
// before the first sample), plus a stale mask that rebuilds Dataset.lastSeen.
// Pure TypeScript with no imports from 'spacetimedb': the browser (lib/live.ts), the ingest
// script and the module (finish_ingest) all share it.
import type { Dataset } from "../../lib/eog/load.ts";
import type { FacilityJson, NetworkJson, OpsJson } from "../../lib/eog/types.ts";

// Field names match the generated bindings (camelCase of the module's WideRow).
export interface WideRow {
  facilityId: string;
  ts: number;
  inflowBpd: number;
  levelPct: number;
  pumpStatus: number;
  pumpFlowBpd: number;
  dischargePsi: number;
  pipePressurePsi: number;
  receiveFlowBpd: number;
  wellWaterBpd: number[];    // facility's wells in network.json order
  wellStatus: number[];
  staleMask: number;         // bit set: no real reading at or after this ts (or no series at all)
}

type FacilityField = "inflowBpd" | "levelPct" | "pumpStatus" | "pumpFlowBpd" | "dischargePsi" | "pipePressurePsi" | "receiveFlowBpd";

// Bit i of staleMask is FACILITY_METRICS[i]; wells use bits 7 + 2w (water_bpd) and 8 + 2w (status).
export const FACILITY_METRICS: readonly { field: FacilityField; asset: (f: FacilityJson) => string; metric: string }[] = [
  { field: "inflowBpd", asset: (f) => f.id, metric: "inflow_bpd" },
  { field: "levelPct", asset: (f) => f.tank.id, metric: "level_pct" },
  { field: "pumpStatus", asset: (f) => f.pump.id, metric: "status" },
  { field: "pumpFlowBpd", asset: (f) => f.pump.id, metric: "flow_bpd" },
  { field: "dischargePsi", asset: (f) => f.pump.id, metric: "discharge_psi" },
  { field: "pipePressurePsi", asset: (f) => f.pipeline.id, metric: "pressure_psi" },
  { field: "receiveFlowBpd", asset: (f) => f.pipeline.id, metric: "receive_flow_bpd" },
];
const WELL_BASE = FACILITY_METRICS.length;
export const MAX_WELLS = Math.floor((31 - WELL_BASE) / 2);   // 12: keeps the mask inside 31 bits

const key = (asset: string, metric: string) => `${asset}|${metric}`;

export function facilitiesOf(network: NetworkJson): FacilityJson[] {
  const out: FacilityJson[] = [];
  for (const s of network.systems) for (const f of s.facilities) {
    if (f.wells.length > MAX_WELLS) throw new Error(`${f.id} has ${f.wells.length} wells; the reading row holds at most ${MAX_WELLS}`);
    out.push(f);
  }
  return out;
}

// Every facility gets a row at every ts of the dataset, so the rows also carry Dataset.ts.
export function datasetToRows(ds: Dataset): WideRow[] {
  const rows: WideRow[] = [];
  for (const f of facilitiesOf(ds.network)) {
    const fac = FACILITY_METRICS.map((m) => ds.series.get(key(m.asset(f), m.metric)));
    const facSeen = FACILITY_METRICS.map((m) => ds.lastSeen.get(key(m.asset(f), m.metric)) ?? -Infinity);
    const water = f.wells.map((w) => ds.series.get(key(w.id, "water_bpd")));
    const status = f.wells.map((w) => ds.series.get(key(w.id, "status")));
    const waterSeen = f.wells.map((w) => ds.lastSeen.get(key(w.id, "water_bpd")) ?? -Infinity);
    const statusSeen = f.wells.map((w) => ds.lastSeen.get(key(w.id, "status")) ?? -Infinity);
    for (let i = 0; i < ds.ts.length; i++) {
      const t = ds.ts[i];
      let mask = 0;
      const v = (s: Float64Array | undefined) => (s ? s[i] : NaN);
      facSeen.forEach((seen, b) => { if (t > seen) mask |= 1 << b; });
      waterSeen.forEach((seen, w) => { if (t > seen) mask |= 1 << (WELL_BASE + 2 * w); });
      statusSeen.forEach((seen, w) => { if (t > seen) mask |= 1 << (WELL_BASE + 2 * w + 1); });
      rows.push({
        facilityId: f.id,
        ts: t,
        inflowBpd: v(fac[0]),
        levelPct: v(fac[1]),
        pumpStatus: v(fac[2]),
        pumpFlowBpd: v(fac[3]),
        dischargePsi: v(fac[4]),
        pipePressurePsi: v(fac[5]),
        receiveFlowBpd: v(fac[6]),
        wellWaterBpd: water.map(v),
        wellStatus: status.map(v),
        staleMask: mask,
      });
    }
  }
  return rows;
}

// Inverse of datasetToRows. A series exists if some row has its stale bit clear; its
// lastSeen is the latest such ts.
export function datasetFromRows(network: NetworkJson, ops: OpsJson, rows: Iterable<WideRow>): Dataset {
  const facs = facilitiesOf(network);
  const byFac = new Map<string, WideRow[]>();
  for (const f of facs) byFac.set(f.id, []);
  const tsSet = new Set<number>();
  for (const r of rows) {
    const list = byFac.get(r.facilityId);
    if (!list) throw new Error(`reading row for unknown facility ${r.facilityId}`);
    list.push(r);
    tsSet.add(r.ts);
  }
  const ts = [...tsSet].sort((a, b) => a - b);
  if (ts.length === 0) throw new Error("no readings");
  const idx = new Map<number, number>();
  ts.forEach((t, i) => idx.set(t, i));

  const series = new Map<string, Float64Array>();
  const lastSeen = new Map<string, number>();
  for (const f of facs) {
    const list = byFac.get(f.id)!;
    const add = (k: string, bit: number, get: (r: WideRow) => number) => {
      const a = new Float64Array(ts.length).fill(NaN);
      let seen = -Infinity;
      for (const r of list) {
        a[idx.get(r.ts)!] = get(r);
        if (!(r.staleMask & (1 << bit)) && r.ts > seen) seen = r.ts;
      }
      if (seen === -Infinity) return;               // never reported: no series, as in loadDataset
      series.set(k, a);
      lastSeen.set(k, seen);
    };
    FACILITY_METRICS.forEach((m, b) => add(key(m.asset(f), m.metric), b, (r) => r[m.field]));
    f.wells.forEach((w, i) => {
      add(key(w.id, "water_bpd"), WELL_BASE + 2 * i, (r) => r.wellWaterBpd[i]);
      add(key(w.id, "status"), WELL_BASE + 2 * i + 1, (r) => r.wellStatus[i]);
    });
  }
  return { network, ops, ts, series, lastSeen, now: ts[ts.length - 1] };
}
