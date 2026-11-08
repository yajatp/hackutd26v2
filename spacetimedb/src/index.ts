// Avon side of the Darkroom module (SpacetimeDB 2.14.1), published as database 'avon'.
// Load path: load_dataset (network + ops) -> ingest_batch (reading rows) -> finish_ingest
// (EOG engine inside the reducer, writes alert + console_meta).
import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { consoleOf, datasetFromReadings } from './eog.ts';
import type { ConsoleView } from '../../lib/eog/alerts.ts';
import type { Dataset } from '../../lib/eog/load.ts';
import { budgetOf } from '../../lib/eog/budget.ts';
import { flowSeries as flowSeriesOf } from '../../lib/eog/flows.ts';
import { breachRisks } from '../../lib/eog/breach.ts';
import { whatIf, WHAT_IF_KINDS, type WhatIfKind } from '../../lib/eog/whatif.ts';
import { injectFault, type FaultKind } from '../../lib/rules/faults.ts';
import { facilitiesOf } from './wide.ts';
import { rttRowsToDelete } from '../../lib/rules/darkroom/rtt.ts';
import { lockdownInputError } from '../../lib/rules/lockdown.ts';
import type { NetworkJson } from '../../lib/eog/types.ts';

const config = table({ name: 'config', public: true }, {
  id: t.u8().primaryKey(),          // always 0
  datasetId: t.string(),
  nowTs: t.u32(),                   // latest ts_unix ingested: the dataset's "now"
  loadedAt: t.timestamp(),
});

// network.json and ops.json as loaded, for rebuilding the Dataset in finish_ingest.
const datasetSource = table({ name: 'dataset_source' }, {
  id: t.u8().primaryKey(),          // always 0
  networkJson: t.string(),
  opsJson: t.string(),
});

const facility = table({ name: 'facility', public: true }, {
  facilityId: t.string().primaryKey(),
  systemId: t.string(),
  lat: t.f64(),
  lon: t.f64(),
  tankId: t.string(),
  capacityBbl: t.f64(),
  pumpId: t.string(),
  maxFlowBpd: t.f64(),
  startLevelPct: t.f64(),
  stopLevelPct: t.f64(),
  pipelineId: t.string(),
  pipelineMaxBpd: t.f64(),
  maxPressurePsi: t.f64(),
  wellIds: t.array(t.string()),
});

// One row per facility per 5-min sample: every value the engine reads, as lib/eog/load.ts
// gives it (carried forward; NaN before a series' first sample). Bit layout of staleMask is
// in wide.ts; it rebuilds Dataset.lastSeen. Values are f64 so NaN survives.
const wideColumns = () => ({
  facilityId: t.string(),
  ts: t.u32(),
  inflowBpd: t.f64(),
  levelPct: t.f64(),
  pumpStatus: t.f64(),
  pumpFlowBpd: t.f64(),
  dischargePsi: t.f64(),
  pipePressurePsi: t.f64(),
  receiveFlowBpd: t.f64(),
  wellWaterBpd: t.array(t.f64()),   // facility's wells in network.json order
  wellStatus: t.array(t.f64()),
  staleMask: t.u32(),
});
const WideRow = t.object('WideRow', wideColumns());

// Private: about 25k rows, never subscribed by phones or the Quest.
const reading = table({
  name: 'reading',
  indexes: [{ accessor: 'byFacilityTs', algorithm: 'btree', columns: ['facilityId', 'ts'] }],
}, {
  id: t.u64().primaryKey().autoInc(),
  ...wideColumns(),
});

// One row per Alert of buildConsole(), in console order.
const alert = table({ name: 'alert', public: true }, {
  rank: t.u32().primaryKey(),       // 1 = top of the console
  alertId: t.string(),
  kind: t.string(),                 // event.category
  systemId: t.string(),
  facilityId: t.string(),
  assetId: t.string(),
  hoursToLimit: t.option(t.f64()),
  alertJson: t.string(),            // JSON.stringify(Alert)
});

const consoleMeta = table({ name: 'console_meta', public: true }, {
  id: t.u8().primaryKey(),          // always 0
  datasetId: t.string(),
  now: t.u32(),
  doNothing: t.f64(),               // totals.do_nothing
  plans: t.f64(),                   // totals.plans
  alertCount: t.u32(),
  eventsJson: t.string(),           // JSON.stringify(ConsoleView.events)
  builtAt: t.timestamp(),
});

const LOAD_LOCK_MICROS = 60_000_000n;  // a load older than this no longer blocks others

// Which screen is loading a site right now. Batches and finish_ingest from any other screen are
// refused, so two screens loading at once cannot mix their readings (review finding 2).
const loadLock = table({ name: 'load_lock' }, {
  id: t.u8().primaryKey(),          // always 0
  loader: t.identity(),
  startedAt: t.timestamp(),
});

// Simulated sensor faults from the Phone 1 remote. The data files and reading rows never change:
// every rebuild applies these on a copy (lib/rules/faults.ts) and marks the results SIMULATED.
const fault = table({ name: 'fault', public: true }, {
  assetId: t.string().primaryKey(), // a tank: its level sensor is faulted
  kind: t.string(),                 // kill | fake_flat | drift
  fromTs: t.u32(),                  // data time the fault starts
  createdAt: t.timestamp(),
});

// The operator's confirmations: the plan as it read when they pressed Confirm. If a later fault
// changes the plan, the console can say so (the judge's own action shows the twist).
const confirmation = table({ name: 'confirmation', public: true }, {
  alertId: t.string().primaryKey(),
  headline: t.string(),
  cost: t.f64(),
  confirmedBy: t.identity(),
  confirmedAt: t.timestamp(),
});

// Every sensor that reads dead, drifting or lying at "now" (ConsoleView.sensors), worst first.
const sensorIssue = table({ name: 'sensor_issue', public: true }, {
  rank: t.u32().primaryKey(),
  issueJson: t.string(),            // JSON.stringify(SensorIssue)
});

// Live latency probe (lib/rules/darkroom/rtt.ts, shared with the darkroom module): rtt_ping writes
// (sender, nonce, server time); each screen times how long its own row takes to come back through
// its subscription. The header badge shows the median. Newest 50 rows only.
const rttProbe = table({ name: 'rtt_probe', public: true }, {
  id: t.u64().primaryKey().autoInc(),
  sender: t.identity(),
  nonce: t.u32(),
  at: t.timestamp(),
});

// The night's money and trucks, one row per system (lib/eog/budget.ts), rewritten with the board.
const budget = table({ name: 'budget', public: true }, {
  systemId: t.string().primaryKey(),
  facilities: t.u32(),
  fleet: t.u32(),                   // ops.json emergency_fleet_size
  trucksUsed: t.u32(),              // trucks the chosen plans call
  trips: t.u32(),
  failures: t.u32(),                // pump failures on the console
  plans: t.f64(),                   // what the chosen plans cost
  doNothing: t.f64(),               // what letting those tanks trip costs
  truckCost: t.f64(),
  shutInCost: t.f64(),
  atRiskPerHour: t.f64(),           // production lost per hour if every failing tank trips
  revenuePerHour: t.f64(),          // the system's production per hour
});

// Rate in vs rate out (lib/eog/flows.ts): per facility, hourly points over the last 24 h before
// "now", oldest first. Rewritten with the board, so a simulated fault shows here too.
const flowSeries = table({ name: 'flow_series', public: true }, {
  facilityId: t.string().primaryKey(),
  systemId: t.string(),
  tankId: t.string(),
  capacityBbl: t.f64(),
  stepS: t.u32(),
  endTs: t.array(t.u32()),          // each hour ends here
  inflowBpd: t.array(t.f64()),      // into the tank (facility inflow), hourly mean
  outflowBpd: t.array(t.f64()),     // the pump, hourly mean
  levelPct: t.array(t.f64()),       // at the end of the hour
  physicsPts: t.array(t.f64()),     // level change physics expects over the hour
  reportedPts: t.array(t.f64()),    // level change the sensor reported
});

// Potential breaches (lib/eog/breach.ts): for every tank, what a spoofed level sensor would hide and
// what believing it costs against the truth, most dollars first. Written by finish_ingest and
// compute_breaches from the readings as loaded (never from a simulated fault).
const breachRisk = table({ name: 'breach_risk', public: true }, {
  rank: t.u32().primaryKey(),
  tankId: t.string(),
  facilityId: t.string(),
  systemId: t.string(),
  mode: t.string(),                 // failed: the pump is down and the lie skews its plan; running: the lie hides a stop
  exposure: t.f64(),                // believedCost - honestCost
  believedCost: t.f64(),
  honestCost: t.f64(),
  hiddenMin: t.option(t.f64()),     // warning the lie takes away
  summary: t.string(),
  detailJson: t.string(),           // JSON.stringify(BreachRisk)
});

// What-if runs (lib/eog/whatif.ts): one row per what_if call, the ripple as JSON. Newest 20 kept.
const scenario = table({ name: 'scenario', public: true }, {
  id: t.u64().primaryKey().autoInc(),
  requestedBy: t.identity(),
  at: t.timestamp(),
  datasetId: t.string(),
  kind: t.string(),                 // pump_fail | sensor_spoof | sensor_dead | pipeline_leak
  assetId: t.string(),
  facilityId: t.string(),
  title: t.string(),
  summary: t.string(),
  costDelta: t.f64(),
  resultJson: t.string(),           // JSON.stringify(Ripple)
});

// LOCKDOWN (docs/LOCKDOWN.md): one row, id 0. The operator suspects the network and moves the decision
// to the isolated Darkroom; every Avon screen subscribes and reacts. The darkroom module is never
// touched: a person carries evidence_ref to the box.
const lockdown = table({ name: 'lockdown', public: true }, {
  id: t.u8().primaryKey(),          // always 0
  active: t.bool(),
  startedAt: t.timestamp(),
  startedBy: t.identity(),
  reason: t.string(),
  evidenceRef: t.string(),          // AV-XXXX-XXXX (lib/evidence.ts)
  tank: t.string(),                 // asset id of the suspect sensor
  endedAt: t.option(t.timestamp()),
});

// snake_case keys so source and canonical names agree (SQL, describe and logs all say console_meta).
const spacetimedb = schema({ config, dataset_source: datasetSource, facility, reading, alert, console_meta: consoleMeta, fault, sensor_issue: sensorIssue, load_lock: loadLock, confirmation, rtt_probe: rttProbe, budget, flow_series: flowSeries, breach_risk: breachRisk, scenario, lockdown });
export default spacetimedb;

export const load_dataset = spacetimedb.reducer(
  { networkJson: t.string(), opsJson: t.string(), datasetId: t.string() },
  (ctx, { networkJson, opsJson, datasetId }) => {
    let network: NetworkJson;
    try {
      network = JSON.parse(networkJson) as NetworkJson;
      JSON.parse(opsJson);
    } catch {
      throw new SenderError('network.json or ops.json is not JSON');
    }
    try {
      facilitiesOf(network);                      // refuses a facility with more wells than a reading row holds
    } catch (e) {
      throw new SenderError(String((e as Error).message ?? e));
    }
    // Another screen's load still in progress: refuse rather than interrupt it (review 2, finding 2).
    const busy = ctx.db.load_lock.id.find(0);
    if (busy && !busy.loader.isEqual(ctx.sender)
        && ctx.timestamp.microsSinceUnixEpoch - busy.startedAt.microsSinceUnixEpoch < LOAD_LOCK_MICROS) {
      throw new SenderError('another screen is loading a site right now; try again in a minute');
    }
    // The board (alert, console_meta, sensor_issue) keeps showing the last site until
    // finish_ingest replaces it, so a load that never finishes cannot leave it empty.
    ctx.db.reading.clear();
    ctx.db.fault.clear();
    ctx.db.confirmation.clear();
    ctx.db.facility.clear();
    ctx.db.dataset_source.clear();
    ctx.db.config.clear();
    for (const s of network.systems) for (const f of s.facilities) {
      ctx.db.facility.insert({
        facilityId: f.id, systemId: s.id, lat: f.lat, lon: f.lon,
        tankId: f.tank.id, capacityBbl: f.tank.capacity_bbl,
        pumpId: f.pump.id, maxFlowBpd: f.pump.max_flow_bpd, startLevelPct: f.pump.start_level_pct, stopLevelPct: f.pump.stop_level_pct,
        pipelineId: f.pipeline.id, pipelineMaxBpd: f.pipeline.max_bpd, maxPressurePsi: f.pipeline.max_pressure_psi,
        wellIds: f.wells.map((w) => w.id),
      });
    }
    ctx.db.dataset_source.insert({ id: 0, networkJson, opsJson });
    ctx.db.load_lock.clear();
    ctx.db.load_lock.insert({ id: 0, loader: ctx.sender, startedAt: ctx.timestamp });
    ctx.db.config.insert({ id: 0, datasetId, nowTs: 0, loadedAt: ctx.timestamp });
  }
);

export const ingest_batch = spacetimedb.reducer(
  { rows: t.array(WideRow) },
  (ctx, { rows }) => {
    const cfg = ctx.db.config.id.find(0);
    if (!cfg) throw new SenderError('call load_dataset first');
    requireLoader(ctx);
    const wells = new Map<string, number>();
    let now = cfg.nowTs;
    for (const r of rows) {
      let n = wells.get(r.facilityId);
      if (n === undefined) {
        const f = ctx.db.facility.facilityId.find(r.facilityId);
        if (!f) throw new SenderError(`unknown facility ${r.facilityId}`);
        wells.set(r.facilityId, (n = f.wellIds.length));
      }
      if (r.wellWaterBpd.length !== n || r.wellStatus.length !== n) throw new SenderError(`${r.facilityId}: expected ${n} wells`);
      // A repeated batch (double click, retry) must not add the same sample twice.
      const seen = !ctx.db.reading.byFacilityTs.filter([r.facilityId, r.ts])[Symbol.iterator]().next().done;
      if (!seen) ctx.db.reading.insert({ id: 0n, ...r });
      if (r.ts > now) now = r.ts;
    }
    if (now !== cfg.nowTs) ctx.db.config.id.update({ ...cfg, nowTs: now });
  }
);

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

// Rebuilds the readings into a Dataset and checks nothing was lost in transit.
function datasetOf(ctx: Ctx) {
  const cfg = ctx.db.config.id.find(0);
  const src = ctx.db.dataset_source.id.find(0);
  if (!cfg || !src) throw new SenderError('call load_dataset first');
  if (ctx.db.reading.count() === 0n) throw new SenderError('no readings: call ingest_batch first');
  const ds = datasetFromReadings(src.networkJson, src.opsJson, ctx.db.reading.iter());
  // A lost ingest_batch would leave holes that the engine reads as NaN: refuse instead.
  const want = ds.ts.length * Number(ctx.db.facility.count());
  if (Number(ctx.db.reading.count()) !== want) throw new SenderError(`reading has ${ctx.db.reading.count()} rows, expected ${want}`);
  if (ds.now !== cfg.nowTs) throw new SenderError(`readings end at ${ds.now}, config says ${cfg.nowTs}`);
  return { ds, cfg };
}

// The readings with every simulated fault applied on a copy: what the console sees.
function faulted(ctx: Ctx, clean: Dataset): Dataset {
  let ds = clean;
  for (const f of ctx.db.fault.iter()) ds = injectFault(ds, { kind: f.kind as FaultKind, asset_id: f.assetId, from_ts: f.fromTs }).ds;
  return ds;
}

// The EOG engine (lib/eog/alerts.ts buildConsole) runs here, inside the reducer, on the
// readings plus any simulated faults. Rewrites alert, console_meta, sensor_issue, budget and
// flow_series. Returns the clean dataset and its view when no fault is active (for breaches).
function rebuild(ctx: Ctx): { clean: Dataset; view: ConsoleView | null } {
  const { ds: clean, cfg } = datasetOf(ctx);
  const ds = faulted(ctx, clean);
  const view = consoleOf(ds);
  ctx.db.alert.clear();
  ctx.db.console_meta.clear();
  ctx.db.sensor_issue.clear();
  view.alerts.forEach((a, i) => {
    ctx.db.alert.insert({
      rank: i + 1,
      alertId: a.id,
      kind: a.event.category,
      systemId: a.event.system_id,
      facilityId: a.facility.id,
      assetId: a.event.asset_id,
      hoursToLimit: a.hours_to_limit ?? undefined,
      alertJson: JSON.stringify(a),
    });
  });
  view.sensors.forEach((x, i) => ctx.db.sensor_issue.insert({ rank: i + 1, issueJson: JSON.stringify(x) }));
  ctx.db.console_meta.insert({
    id: 0,
    datasetId: cfg.datasetId,
    now: view.now,
    doNothing: view.totals.do_nothing,
    plans: view.totals.plans,
    alertCount: view.alerts.length,
    eventsJson: JSON.stringify(view.events),
    builtAt: ctx.timestamp,
  });
  writeBudget(ctx, ds, view);
  writeFlows(ctx, ds);
  return { clean, view: ds === clean ? view : null };
}

function writeBudget(ctx: Ctx, ds: Dataset, view: ConsoleView) {
  ctx.db.budget.clear();
  for (const b of budgetOf(ds, view)) {
    ctx.db.budget.insert({
      systemId: b.system_id, facilities: b.facilities, fleet: b.fleet, trucksUsed: b.trucks_used, trips: b.trips,
      failures: b.failures, plans: b.plans, doNothing: b.do_nothing, truckCost: b.truck_cost, shutInCost: b.shut_in_cost,
      atRiskPerHour: b.at_risk_per_hour, revenuePerHour: b.revenue_per_hour,
    });
  }
}

function writeFlows(ctx: Ctx, ds: Dataset) {
  ctx.db.flow_series.clear();
  for (const f of flowSeriesOf(ds)) {
    ctx.db.flow_series.insert({
      facilityId: f.facility_id, systemId: f.system_id, tankId: f.tank_id, capacityBbl: f.capacity_bbl, stepS: f.step_s,
      endTs: f.points.map((p) => p.end_ts),
      inflowBpd: f.points.map((p) => p.inflow_bpd),
      outflowBpd: f.points.map((p) => p.outflow_bpd),
      levelPct: f.points.map((p) => p.level_pct),
      physicsPts: f.points.map((p) => p.physics_pts),
      reportedPts: f.points.map((p) => p.reported_pts),
    });
  }
}

// Every tank's potential breach, from the readings as loaded.
function writeBreaches(ctx: Ctx, clean: Dataset, view: ConsoleView) {
  const rows = breachRisks(clean, view);
  ctx.db.breach_risk.clear();
  rows.forEach((b, i) => ctx.db.breach_risk.insert({
    rank: i + 1, tankId: b.tank_id, facilityId: b.facility_id, systemId: b.system_id, mode: b.mode,
    exposure: b.exposure, believedCost: b.believed_cost, honestCost: b.honest_cost,
    hiddenMin: b.hidden_min ?? undefined, summary: b.summary, detailJson: JSON.stringify(b),
  }));
}

function requireLoader(ctx: Ctx) {
  const lock = ctx.db.load_lock.id.find(0);
  if (lock && !lock.loader.isEqual(ctx.sender)) {
    throw new SenderError('another screen started loading a site; this load stopped (its site will show when it finishes)');
  }
}

export const finish_ingest = spacetimedb.reducer((ctx) => {
  requireLoader(ctx);
  const { clean, view } = rebuild(ctx);
  writeBreaches(ctx, clean, view ?? consoleOf(clean));
  ctx.db.load_lock.clear();         // load complete: anyone may load the next site
});

// Recomputes breach_risk from the readings as loaded (finish_ingest already does this once).
export const compute_breaches = spacetimedb.reducer((ctx) => {
  const { ds } = datasetOf(ctx);
  writeBreaches(ctx, ds, consoleOf(ds));
});

const SCENARIOS_KEPT = 20;

// What if ___ happens? Runs the ripple (lib/eog/whatif.ts) on what the console sees now (readings
// plus any simulated faults) and writes one scenario row. Never changes the board.
export const what_if = spacetimedb.reducer(
  { kind: t.string(), assetId: t.string() },
  (ctx, { kind, assetId }) => {
    if (!WHAT_IF_KINDS.includes(kind as WhatIfKind)) throw new SenderError(`kind must be one of ${WHAT_IF_KINDS.join(', ')}`);
    const { ds: clean, cfg } = datasetOf(ctx);
    const ds = faulted(ctx, clean);
    let r;
    try {
      r = whatIf(ds, consoleOf(ds), kind as WhatIfKind, assetId);
    } catch (e) {
      throw new SenderError(String((e as Error).message ?? e));
    }
    ctx.db.scenario.insert({
      id: 0n, requestedBy: ctx.sender, at: ctx.timestamp, datasetId: cfg.datasetId, kind, assetId,
      facilityId: r.facility_id, title: r.title, summary: r.summary, costDelta: r.cost_delta, resultJson: JSON.stringify(r),
    });
    const ids = [...ctx.db.scenario.iter()].map((x) => x.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const id of ids.slice(0, Math.max(0, ids.length - SCENARIOS_KEPT))) ctx.db.scenario.id.delete(id);
  }
);

// Faults start this far back in the recording, so the console shows them at once:
// "No reading for 10 min", "Off for 30 min", a 1-hour drift.
const BACKDATE_S: Record<FaultKind, number> = { kill: 600, fake_flat: 1800, drift: 3600 };

export const inject_fault = spacetimedb.reducer(
  { assetId: t.string(), kind: t.string() },
  (ctx, { assetId, kind }) => {
    if (!(kind in BACKDATE_S)) throw new SenderError('kind must be kill, fake_flat or drift');
    const cfg = ctx.db.config.id.find(0);
    if (!cfg || cfg.nowTs === 0) throw new SenderError('load a site on the console first');
    if (![...ctx.db.facility.iter()].some((f) => f.tankId === assetId)) throw new SenderError(`${assetId} is not a tank in this site`);
    ctx.db.fault.assetId.delete(assetId);
    ctx.db.fault.insert({ assetId, kind, fromTs: cfg.nowTs - BACKDATE_S[kind as FaultKind], createdAt: ctx.timestamp });
    rebuild(ctx);
  }
);

// assetId '' clears every fault.
export const clear_fault = spacetimedb.reducer(
  { assetId: t.string() },
  (ctx, { assetId }) => {
    if (assetId === '') ctx.db.fault.clear();
    else ctx.db.fault.assetId.delete(assetId);
    rebuild(ctx);
  }
);

// The operator confirms the plan on a fix card. Stores the headline and cost from the server's own
// alert row, never from the client.
export const confirm_plan = spacetimedb.reducer(
  { alertId: t.string() },
  (ctx, { alertId }) => {
    let row: { alertJson: string } | undefined;
    for (const a of ctx.db.alert.iter()) if (a.alertId === alertId) { row = a; break; }
    if (!row) throw new SenderError(`no alert ${alertId} on the console now`);
    const a = JSON.parse(row.alertJson) as { fix?: { headline: string; plan: { cost: number } } };
    if (!a.fix) throw new SenderError('this alert has no plan to confirm');
    ctx.db.confirmation.alertId.delete(alertId);
    ctx.db.confirmation.insert({ alertId, headline: a.fix.headline, cost: a.fix.plan.cost, confirmedBy: ctx.sender, confirmedAt: ctx.timestamp });
  }
);

// Any screen may call it. Keeps the newest 50 rows.
export const rtt_ping = spacetimedb.reducer(
  { nonce: t.u32() },
  (ctx, { nonce }) => {
    ctx.db.rtt_probe.insert({ id: 0n, sender: ctx.sender, nonce, at: ctx.timestamp });
    for (const id of rttRowsToDelete([...ctx.db.rtt_probe.iter()].map((r) => r.id))) ctx.db.rtt_probe.id.delete(id);
  }
);

// LOCKDOWN. Additive: no existing table or reducer changes. Starting one while another is active is
// refused, so a second screen cannot overwrite the reference the operator is carrying.
export const enter_lockdown = spacetimedb.reducer(
  { reason: t.string(), evidenceRef: t.string(), tank: t.string() },
  (ctx, { reason, evidenceRef, tank }) => {
    const bad = lockdownInputError({ reason, evidenceRef, tank });
    if (bad) throw new SenderError(bad);
    const cur = ctx.db.lockdown.id.find(0);
    if (cur?.active) throw new SenderError(`the site is already in LOCKDOWN (${cur.evidenceRef})`);
    const row = { id: 0, active: true, startedAt: ctx.timestamp, startedBy: ctx.sender, reason: reason.trim(), evidenceRef, tank, endedAt: undefined };
    if (cur) ctx.db.lockdown.id.update(row);
    else ctx.db.lockdown.insert(row);
  }
);

// After the on-site check. Keeps the row (who, why, when) with active false and ended_at set, and
// clears the confirmations: they were made on data that may have been tampered with, so every
// plan asks to be confirmed again.
export const end_lockdown = spacetimedb.reducer((ctx) => {
  const cur = ctx.db.lockdown.id.find(0);
  if (!cur?.active) throw new SenderError('the site is not in lockdown');
  ctx.db.lockdown.id.update({ ...cur, active: false, endedAt: ctx.timestamp });
  ctx.db.confirmation.clear();
});
