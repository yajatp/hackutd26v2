// Simulated sensor faults for the demo. injectFault never changes its input: it copies the
// series it touches and the lastSeen map, and returns a new Dataset that carries a marker, so
// every health result the fault causes is labeled simulated. Pure TypeScript, no Node or DOM APIs.
import type { Dataset } from "../eog/load.ts";
import { calibrate, faultSpansOf, indexAtOrBefore, type FaultSpan } from "./physics.ts";

export type FaultKind = "kill" | "fake_flat" | "drift";

export interface FaultSpec {
  kind: FaultKind;
  asset_id: string;
  from_ts: number;  // the fault changes readings after this data time
  rate?: number;    // drift only, units per hour (pts/h for level_pct)
  metric?: string;  // only this metric of the asset; default every metric it reports
}

export interface FaultMarker extends FaultSpan {
  simulated: true;
  kind: FaultKind;
  asset_id: string;
  keys: string[];
  from_ts: number;
  rate?: number;
}

export type FaultedDataset = Dataset & { faults: readonly FaultMarker[] };

export function faultsOf(ds: Dataset): readonly FaultMarker[] {
  return faultSpansOf(ds) as readonly FaultMarker[];
}

// kill:      no readings after from_ts. The value carries forward, as the loader does for a gap.
// fake_flat: keeps reporting the value it had at from_ts.
// drift:     adds rate x hours since from_ts. Without a rate, it drifts halfway between this
//            folder's DRIFTING and LYING lines.
export function injectFault(ds: Dataset, spec: FaultSpec): { ds: FaultedDataset; marker: FaultMarker } {
  if (!Number.isFinite(spec.from_ts)) throw new Error(`fault needs a from_ts, got ${spec.from_ts}`);
  const keys = [...ds.series.keys()].filter((k) => {
    const bar = k.indexOf("|");
    return k.slice(0, bar) === spec.asset_id && (spec.metric === undefined || k.slice(bar + 1) === spec.metric);
  });
  if (keys.length === 0) throw new Error(`telemetry.csv has no ${spec.metric ?? "readings"} for ${spec.asset_id}`);
  let rate: number | undefined;
  if (spec.kind === "drift") {
    const cal = calibrate(ds);
    rate = spec.rate ?? (cal.drift_line + cal.lie_line) / 2;
    if (!Number.isFinite(rate)) throw new Error(`drift needs a finite rate, got ${rate}`);
  }
  const f = indexAtOrBefore(ds.ts, spec.from_ts); // last tick the fault leaves alone
  const series = new Map(ds.series);
  const lastSeen = new Map(ds.lastSeen);
  for (const k of keys) {
    const a = Float64Array.from(ds.series.get(k)!);
    const hold = a[Math.max(f, 0)];
    for (let i = f + 1; i < a.length; i++) {
      if (spec.kind === "kill") a[i] = f >= 0 ? hold : NaN;
      else if (spec.kind === "fake_flat") a[i] = hold;
      else a[i] += rate! * (ds.ts[i] - spec.from_ts) / 3600;
    }
    if (spec.kind === "kill") lastSeen.set(k, Math.min(ds.lastSeen.get(k) ?? -Infinity, f >= 0 ? ds.ts[f] : -Infinity));
    series.set(k, a);
  }
  const marker: FaultMarker = { simulated: true, kind: spec.kind, asset_id: spec.asset_id, keys, from_ts: spec.from_ts };
  if (rate !== undefined) marker.rate = rate;
  return { ds: { ...ds, series, lastSeen, faults: [...faultsOf(ds), marker] }, marker };
}
