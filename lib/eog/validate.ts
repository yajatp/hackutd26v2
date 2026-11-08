// Checks a dataset folder before anything plans from it. Errors stop the load with a readable
// reason; warnings are shown next to the data. Pure TypeScript like the rest of lib/eog.
import { loadDataset, seriesKey, type Dataset, type DatasetFiles } from "./load.ts";
import type { NetworkJson, OpsJson } from "./types.ts";

export interface Validation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    readings: number; systems: number; facilities: number; wells: number;
    start: number; end: number; step_s: number; missing: number;
  } | null;
}

const HEADER = "timestamp,ts_unix,asset_id,metric,value";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// Every series the engine reads, per facility.
export function requiredSeries(net: NetworkJson): [string, string][] {
  const out: [string, string][] = [];
  for (const s of net.systems) for (const f of s.facilities) {
    out.push([f.id, "inflow_bpd"], [f.tank.id, "level_pct"],
      [f.pump.id, "status"], [f.pump.id, "flow_bpd"], [f.pump.id, "discharge_psi"],
      [f.pipeline.id, "receive_flow_bpd"], [f.pipeline.id, "pressure_psi"]);
    for (const w of f.wells) out.push([w.id, "water_bpd"], [w.id, "status"]);
  }
  return out;
}

function checkNetwork(net: NetworkJson, errors: string[]) {
  const lim = net?.defaults?.tank_limits_pct;
  if (!lim || !isNum(lim.shutdown) || lim.shutdown <= 0 || lim.shutdown > 100) {
    errors.push("network.json: defaults.tank_limits_pct.shutdown must be a number between 0 and 100");
  }
  if (!Array.isArray(net?.systems) || net.systems.length === 0) {
    errors.push("network.json: no systems");
    return;
  }
  const ids = new Set<string>();
  const unique = (id: unknown, where: string) => {
    if (typeof id !== "string" || id === "") errors.push(`network.json: ${where} has no id`);
    else if (ids.has(id)) errors.push(`network.json: id ${id} is used twice`);
    else ids.add(id);
  };
  for (const s of net.systems) {
    unique(s.id, "a system");
    if (!isNum(s.disposal_site?.pressure_psi)) errors.push(`network.json: system ${s.id} needs disposal_site.pressure_psi`);
    if (!Array.isArray(s.facilities) || s.facilities.length === 0) { errors.push(`network.json: system ${s.id} has no facilities`); continue; }
    for (const f of s.facilities) {
      unique(f.id, `a facility in ${s.id}`);
      unique(f.tank?.id, `the tank of ${f.id}`);
      unique(f.pump?.id, `the pump of ${f.id}`);
      unique(f.pipeline?.id, `the pipeline of ${f.id}`);
      if (!isNum(f.tank?.capacity_bbl) || f.tank.capacity_bbl <= 0) errors.push(`network.json: ${f.id} tank capacity_bbl must be above 0`);
      if (!isNum(f.pump?.max_flow_bpd) || f.pump.max_flow_bpd <= 0) errors.push(`network.json: ${f.id} pump max_flow_bpd must be above 0`);
      if (!isNum(f.pump?.start_level_pct) || !isNum(f.pump?.stop_level_pct) || f.pump.stop_level_pct >= f.pump.start_level_pct) {
        errors.push(`network.json: ${f.id} pump needs stop_level_pct below start_level_pct`);
      }
      if (!Array.isArray(f.wells) || f.wells.length === 0) { errors.push(`network.json: ${f.id} has no wells`); continue; }
      for (const w of f.wells) {
        unique(w.id, `a well of ${f.id}`);
        if (![w.baseline_water_bpd, w.oil_bpd, w.gas_mcfd].every((v) => isNum(v) && v >= 0)) {
          errors.push(`network.json: well ${w.id} needs baseline_water_bpd, oil_bpd and gas_mcfd of 0 or more`);
        }
      }
    }
  }
}

function checkOps(ops: OpsJson, net: NetworkJson, errors: string[]) {
  if (!isNum(ops?.prices?.oil_per_bbl) || !isNum(ops?.prices?.gas_per_mcf)) errors.push("ops.json: prices.oil_per_bbl and prices.gas_per_mcf must be numbers");
  if (!isNum(ops?.expected_repair_hours?.pump_failure) || ops.expected_repair_hours.pump_failure <= 0) errors.push("ops.json: expected_repair_hours.pump_failure must be above 0");
  const tr = ops?.emergency_trucking;
  if (!isNum(tr?.truck_capacity_bbl) || tr.truck_capacity_bbl <= 0 || !isNum(tr?.cost_per_trip) || tr.cost_per_trip < 0) {
    errors.push("ops.json: emergency_trucking needs truck_capacity_bbl above 0 and cost_per_trip of 0 or more");
  }
  for (const s of net.systems ?? []) {
    const so = ops?.systems?.[s.id];
    if (!so) { errors.push(`ops.json: no entry for system ${s.id}`); continue; }
    if (!Number.isInteger(so.emergency_fleet_size) || so.emergency_fleet_size < 0) errors.push(`ops.json: ${s.id} emergency_fleet_size must be a whole number of 0 or more`);
    for (const f of s.facilities ?? []) {
      const fo = so.facilities?.[f.id];
      if (!fo || !isNum(fo.response_min) || !isNum(fo.cycle_min) || fo.response_min < 0 || fo.cycle_min <= 0) {
        errors.push(`ops.json: ${s.id}.facilities.${f.id} needs response_min and cycle_min`);
      }
    }
  }
}

function checkTelemetry(ds: Dataset, errors: string[], warnings: string[]): number {
  const st = ds.stats;
  if (st && st.header.replace(/\s/g, "") !== HEADER) errors.push(`telemetry.csv: header is "${st.header}", expected "${HEADER}"`);
  if (st && (st.blank || st.malformed)) {
    const bad = st.blank + st.malformed;
    const msg = `telemetry.csv: skipped ${bad.toLocaleString("en-US")} rows (${st.blank} blank values, ${st.malformed} malformed), first at line ${st.firstBadLine}. Blank values are treated as missing, not zero.`;
    if (bad > 0.01 * (st.rows + bad)) errors.push(msg); else warnings.push(msg);
  }
  const missingSeries = requiredSeries(ds.network).filter(([a, m]) => !ds.series.has(seriesKey(a, m)));
  if (missingSeries.length) {
    errors.push(`telemetry.csv: no readings for ${missingSeries.slice(0, 5).map(([a, m]) => `${a} ${m}`).join(", ")}` +
      (missingSeries.length > 5 ? ` and ${missingSeries.length - 5} more` : ""));
  }
  // Missing samples are carried forward by the loader; count them so nobody mistakes them for data.
  let missing = 0;
  if (st) for (const k of ds.series.keys()) missing += ds.ts.length - (st.samples.get(k) ?? 0);
  if (missing) warnings.push(`telemetry.csv: ${missing.toLocaleString("en-US")} readings missing across all sensors; each gap shows the last real value and sensor health flags gaps of 10 min or more.`);
  // Readings outside what the equipment can report.
  const known = new Set<string>();
  for (const s of ds.network.systems) for (const f of s.facilities) {
    known.add(f.id); known.add(f.tank.id); known.add(f.pump.id); known.add(f.pipeline.id);
    for (const w of f.wells) known.add(w.id);
  }
  let unknown = 0, outOfRange = 0, negative = 0, badStatus = 0;
  for (const [k, a] of ds.series) {
    const bar = k.indexOf("|");
    const asset = k.slice(0, bar), metric = k.slice(bar + 1);
    if (!known.has(asset)) { unknown++; continue; }
    for (const v of a) {
      if (Number.isNaN(v)) continue;
      if (metric === "level_pct" && (v < 0 || v > 100)) outOfRange++;
      else if (metric.endsWith("_bpd") && v < 0) negative++;
      else if (metric === "status" && ![0, 1, 2].includes(v)) badStatus++;
    }
  }
  if (unknown) warnings.push(`telemetry.csv: ${unknown} series name assets that are not in network.json; they are ignored.`);
  if (outOfRange) warnings.push(`telemetry.csv: ${outOfRange} tank levels outside 0-100%.`);
  if (negative) warnings.push(`telemetry.csv: ${negative} negative flow readings.`);
  if (badStatus) warnings.push(`telemetry.csv: ${badStatus} status readings that are not 0, 1 or 2.`);
  return missing;
}

function step(ts: number[]): number {
  const d: number[] = [];
  for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
  d.sort((a, b) => a - b);
  return d.length ? d[Math.floor(d.length / 2)] : 0;
}

// Parse and check one folder. Returns the Dataset only when there are no errors.
export function validateFiles(files: DatasetFiles): { validation: Validation; ds: Dataset | null } {
  const errors: string[] = [], warnings: string[] = [];
  const fail = () => ({ validation: { ok: false, errors, warnings, summary: null }, ds: null });
  for (const [name, text] of [["network.json", files.network], ["ops.json", files.ops]] as const) {
    try { JSON.parse(text); } catch (e) { errors.push(`${name} is not valid JSON: ${e instanceof Error ? e.message : e}`); }
  }
  if (errors.length) return fail();
  const net = JSON.parse(files.network) as NetworkJson;
  checkNetwork(net, errors);
  checkOps(JSON.parse(files.ops) as OpsJson, net, errors);
  if (errors.length) return fail();
  let ds: Dataset;
  try { ds = loadDataset(files); } catch (e) { errors.push(`telemetry.csv: ${e instanceof Error ? e.message : e}`); return fail(); }
  const missing = checkTelemetry(ds, errors, warnings);
  if (errors.length) return fail();
  const facilities = ds.network.systems.flatMap((s) => s.facilities);
  return {
    validation: {
      ok: true, errors, warnings,
      summary: {
        readings: ds.stats?.rows ?? 0, systems: ds.network.systems.length, facilities: facilities.length,
        wells: facilities.reduce((n, f) => n + f.wells.length, 0),
        start: ds.ts[0], end: ds.now, step_s: step(ds.ts), missing,
      },
    },
    ds,
  };
}
