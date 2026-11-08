// Pure helpers for /insight: words, clock times and the order of the small multiples.
// No React, no DOM, so app/insight/format.test.ts runs them in Node.
import type { ConsoleView } from "@/lib/eog/alerts";
import type { FlowPoint, FlowSeries } from "@/lib/eog/flows";
import { plainIds, type Branch, type WhatIfKind } from "@/lib/eog/whatif";
import { SITES } from "@/lib/sites";

// "<SYS>_FACILITY_C" -> "<SYS> Facility C" (same words as the console's prettyId).
export function pretty(id: string): string {
  return id.replace(/^(S\d+)_/, "$1 ").replace(/_/g, " ").replace(/\b([A-Z])([A-Z]+)\b/g, (_, a: string, b: string) => a + b.toLowerCase());
}

export function money(x: number): string {
  return (x < 0 ? "-$" : "$") + Math.round(Math.abs(x)).toLocaleString("en-US");
}

export function signedMoney(x: number): string {
  return (x >= 0.5 ? "+" : "") + money(x);
}

// Data time, as the console prints it.
export function clock(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(11, 16);
}

// Minutes after "now" as the ripple's time column: T+0, T+45m, T+2h03, T-1h30.
export function tplus(min: number): string {
  const r = Math.round(min);
  if (r === 0) return "T+0";
  const sign = r < 0 ? "-" : "+";
  const a = Math.abs(r);
  return a < 60 ? `T${sign}${a}m` : `T${sign}${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`;
}

export function duration(min: number): string {
  const a = Math.round(Math.abs(min));
  return a < 60 ? `${a} min` : `${Math.floor(a / 60)} h ${String(a % 60).padStart(2, "0")} min`;
}

export const KIND_LABEL: Record<WhatIfKind, string> = {
  pump_fail: "Pump fails",
  sensor_spoof: "Level sensor spoofed",
  sensor_dead: "Level sensor goes dead",
  pipeline_leak: "Line leaks",
};

// The asset id what_if is called with for a facility.
export function assetFor(kind: WhatIfKind, f: { facility_id: string; tank_id: string }): string {
  return kind === "sensor_spoof" || kind === "sensor_dead" ? f.tank_id : f.facility_id;
}

// Problem facilities first, in console order; then the rest by system and name.
export function orderFlows(flows: readonly FlowSeries[], view: ConsoleView | null): FlowSeries[] {
  const rank = new Map<string, number>();
  view?.alerts.forEach((a, i) => { if (!rank.has(a.facility.id)) rank.set(a.facility.id, i); });
  const r = (f: FlowSeries) => rank.get(f.facility_id) ?? Number.MAX_SAFE_INTEGER;
  return [...flows].sort((a, b) => r(a) - r(b) || a.facility_id.localeCompare(b.facility_id));
}

// Spans of data time when this facility's pump had failed (detected events), for the red shading.
export function failureSpans(view: ConsoleView | null, facilityId: string): [number, number][] {
  if (!view) return [];
  return view.events
    .filter((e) => e.category === "pump_failure" && e.facility_id === facilityId)
    .map((e) => [e.onset_unix, e.end_unix ?? view.now] as [number, number]);
}

// Worst gap between what the level sensor reported and what physics expected, per hour.
export function marginOfError(points: readonly FlowPoint[]): number {
  let m = 0;
  for (const p of points) {
    const d = Math.abs(p.reported_pts - p.physics_pts);
    if (Number.isFinite(d)) m = Math.max(m, d);
  }
  return m;
}

// One y-scale for every small multiple, so tanks compare by eye: the largest rate, rounded up.
export function sharedMax(flows: readonly FlowSeries[]): number {
  let m = 0;
  for (const f of flows) for (const p of f.points) {
    if (Number.isFinite(p.inflow_bpd)) m = Math.max(m, p.inflow_bpd);
    if (Number.isFinite(p.outflow_bpd)) m = Math.max(m, p.outflow_bpd);
  }
  const step = 500;
  return Math.max(step, Math.ceil(m / step) * step);
}

// Engine text and older what_if rows in the operator's words: wells as "wells C1-C3", the fault code
// in words, no file names.
export function plain(t: string): string {
  return plainIds(t)
    .replace(/ \((?:ops|network)\.json\)/g, "")
    .replace(/ \(lib\/rules\/health\.ts\) with this folder's lines/g, " on this site's readings")
    .replace(/\bops\.json gives/g, "EOG's ops data gives");
}

// ["S1","S2","S3","S4"] -> "S1-S4"; ["S1","S3"] -> "S1, S3".
export function systemsText(ids: readonly string[]): string {
  const n = ids.map((x) => Number(/^S(\d+)$/.exec(x)?.[1] ?? NaN));
  if (ids.length > 2 && n.every((x, i) => Number.isFinite(x) && x === n[0] + i)) return `${ids[0]}-${ids[ids.length - 1]}`;
  return ids.join(", ");
}

// Minutes from now in words: "in 1 h 01", "in 45 min", "now", "20 min ago".
export function inMin(min: number): string {
  const r = Math.round(min);
  if (r === 0) return "now";
  const a = Math.abs(r);
  const d = a < 60 ? `${a} min` : `${Math.floor(a / 60)} h ${String(a % 60).padStart(2, "0")}`;
  return r > 0 ? `in ${d}` : `${d} ago`;
}

// The site this database holds: the ?site= key, else the site whose folder is the loaded dataset.
export function siteFor(key: string | null, datasetId: string | undefined): (typeof SITES)[number] | null {
  return SITES.find((s) => s.key === key) ?? (datasetId ? SITES.find((s) => s.source.endsWith(`/${datasetId}`)) : undefined) ?? null;
}

// The future each step of a ripple belongs to, as a short tag beside it.
export const BRANCH_TAG: Record<Branch, string> = {
  event: "Event",
  check: "Sensor check",
  plan: "Plan",
  fleet: "Plan",
  ignored: "No action",
  lie: "Trusting the sensor",
  flag: "On the flag",
};
