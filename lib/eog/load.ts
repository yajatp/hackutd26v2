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
  stats?: ParseStats;                  // set when parsed from telemetry.csv text
}

// What parsing saw, so validation can report it. A blank value is missing data, never a zero.
export interface ParseStats {
  header: string;
  rows: number;                        // data rows kept
  blank: number;                       // rows whose value cell is empty (missing reading)
  malformed: number;                   // rows with too few columns or a non-numeric ts/value
  firstBadLine: number | null;         // 1-based line number of the first blank or malformed row
  samples: Map<string, number>;        // seriesKey -> number of real readings
}

export const seriesKey = (asset: string, metric: string) => `${asset}|${metric}`;

// Rows are timestamp,ts_unix,asset_id,metric,value. A missing sample repeats the previous
// value; before a series' first sample the value is NaN.
export function parseTelemetry(csv: string): {
  ts: number[]; series: Map<string, Float64Array>; lastSeen: Map<string, number>; stats: ParseStats;
} {
  const raw = new Map<string, Map<number, number>>();
  const tsSet = new Set<number>();
  const nl = csv.indexOf("\n");
  const stats: ParseStats = {
    header: (nl === -1 ? csv : csv.slice(0, nl)).replace(/\r$/, "").trim(),
    rows: 0, blank: 0, malformed: 0, firstBadLine: null, samples: new Map(),
  };
  let start = nl + 1;
  let lineNo = 1;
  while (start > 0 && start < csv.length) {
    let end = csv.indexOf("\n", start);
    if (end === -1) end = csv.length;
    const line = csv.slice(start, end).replace(/\r$/, "");
    start = end + 1;
    lineNo++;
    if (line.trim() === "") continue;
    const p = line.split(",");
    const bad = (kind: "blank" | "malformed") => { stats[kind]++; stats.firstBadLine ??= lineNo; };
    if (p.length < 5 || p[2] === "" || p[3] === "") { bad("malformed"); continue; }
    if (p[4].trim() === "") { bad("blank"); continue; }
    const t = Number(p[1]), v = Number(p[4]);
    if (!Number.isFinite(t) || !Number.isFinite(v)) { bad("malformed"); continue; }
    const k = seriesKey(p[2], p[3]);
    let m = raw.get(k);
    if (!m) raw.set(k, (m = new Map()));
    m.set(t, v);
    tsSet.add(t);
    stats.rows++;
  }
  for (const [k, m] of raw) stats.samples.set(k, m.size);
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
  return { ts, series, lastSeen, stats };
}

export function loadDataset(files: DatasetFiles): Dataset {
  const network = JSON.parse(files.network) as NetworkJson;
  const ops = JSON.parse(files.ops) as OpsJson;
  const { ts, series, lastSeen, stats } = parseTelemetry(files.telemetry);
  if (ts.length === 0) throw new Error("telemetry.csv has no readings");
  return { network, ops, ts, series, lastSeen, now: ts[ts.length - 1], stats };
}

export function seriesOf(ds: Pick<Dataset, "series">, asset: string, metric: string): Float64Array {
  const a = ds.series.get(seriesKey(asset, metric));
  if (!a) throw new Error(`telemetry.csv has no ${metric} for ${asset}`);
  return a;
}
