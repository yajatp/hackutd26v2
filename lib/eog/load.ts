// Parses one EOG dataset folder from its three file texts. Pure TypeScript, no Node or DOM
// APIs, so the same code runs in the browser, in tests and in a SpacetimeDB reducer.
import type { NetworkJson, OpsJson } from "./types.ts";

export interface DatasetFiles { network: string; ops: string; telemetry: string }

export interface Dataset {
  network: NetworkJson;
  ops: OpsJson;
  ts: number[];                        // every distinct ts_unix, ascending
  series: Map<string, Float64Array>;   // seriesKey(asset, metric) -> value per ts, carried forward
  lastSeen: Map<string, number>;       // seriesKey -> last ts_unix with a real reading (gaps are filled above)
  now: number;                         // last ts_unix: the folder's "now"
}

export const seriesKey = (asset: string, metric: string) => `${asset}|${metric}`;

// Rows are timestamp,ts_unix,asset_id,metric,value. A missing sample repeats the previous
// value; before a series' first sample the value is NaN.
export function parseTelemetry(csv: string): { ts: number[]; series: Map<string, Float64Array>; lastSeen: Map<string, number> } {
  const raw = new Map<string, Map<number, number>>();
  const tsSet = new Set<number>();
  let start = csv.indexOf("\n") + 1;
  while (start > 0 && start < csv.length) {
    let end = csv.indexOf("\n", start);
    if (end === -1) end = csv.length;
    const line = csv.slice(start, end).replace(/\r$/, "");
    start = end + 1;
    const p = line.split(",");
    if (p.length < 5) continue;
    const t = Number(p[1]);
    const k = seriesKey(p[2], p[3]);
    let m = raw.get(k);
    if (!m) raw.set(k, (m = new Map()));
    m.set(t, Number(p[4]));
    tsSet.add(t);
  }
  const ts = [...tsSet].sort((a, b) => a - b);
  const series = new Map<string, Float64Array>();
  const lastSeen = new Map<string, number>();
  for (const [k, m] of raw) {
    let seen = -Infinity;
    for (const t of m.keys()) if (t > seen) seen = t;
    lastSeen.set(k, seen);
    const a = new Float64Array(ts.length);
    let last = NaN;
    for (let i = 0; i < ts.length; i++) {
      const v = m.get(ts[i]);
      if (v !== undefined) last = v;
      a[i] = last;
    }
    series.set(k, a);
  }
  return { ts, series, lastSeen };
}

export function loadDataset(files: DatasetFiles): Dataset {
  const network = JSON.parse(files.network) as NetworkJson;
  const ops = JSON.parse(files.ops) as OpsJson;
  const { ts, series, lastSeen } = parseTelemetry(files.telemetry);
  if (ts.length === 0) throw new Error("telemetry.csv has no readings");
  return { network, ops, ts, series, lastSeen, now: ts[ts.length - 1] };
}

export function seriesOf(ds: Pick<Dataset, "series">, asset: string, metric: string): Float64Array {
  const a = ds.series.get(seriesKey(asset, metric));
  if (!a) throw new Error(`telemetry.csv has no ${metric} for ${asset}`);
  return a;
}
