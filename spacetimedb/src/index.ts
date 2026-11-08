// Avon side of the Darkroom module (SpacetimeDB 2.14.1), published as database 'avon'.
// Load path: load_dataset (network + ops) -> ingest_batch (reading rows) -> finish_ingest
// (EOG engine inside the reducer, writes alert + console_meta).
import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { consoleOf, datasetFromReadings } from './eog.ts';
import { injectFault, type FaultKind } from '../../lib/rules/faults.ts';
import { facilitiesOf } from './wide.ts';
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

// Simulated sensor faults from the Phone 1 remote. The data files and reading rows never change:
// every rebuild applies these on a copy (lib/rules/faults.ts) and marks the results SIMULATED.
const fault = table({ name: 'fault', public: true }, {
  assetId: t.string().primaryKey(), // a tank: its level sensor is faulted
  kind: t.string(),                 // kill | fake_flat | drift
  fromTs: t.u32(),                  // data time the fault starts
  createdAt: t.timestamp(),
});

// Every sensor that reads dead, drifting or lying at "now" (ConsoleView.sensors), worst first.
const sensorIssue = table({ name: 'sensor_issue', public: true }, {
  rank: t.u32().primaryKey(),
  issueJson: t.string(),            // JSON.stringify(SensorIssue)
});

// snake_case keys so source and canonical names agree (SQL, describe and logs all say console_meta).
const spacetimedb = schema({ config, dataset_source: datasetSource, facility, reading, alert, console_meta: consoleMeta, fault, sensor_issue: sensorIssue });
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
    ctx.db.reading.clear();
    ctx.db.alert.clear();
    ctx.db.console_meta.clear();
    ctx.db.fault.clear();
    ctx.db.sensor_issue.clear();
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
    ctx.db.config.insert({ id: 0, datasetId, nowTs: 0, loadedAt: ctx.timestamp });
  }
);

export const ingest_batch = spacetimedb.reducer(
  { rows: t.array(WideRow) },
  (ctx, { rows }) => {
    const cfg = ctx.db.config.id.find(0);
    if (!cfg) throw new SenderError('call load_dataset first');
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
      ctx.db.reading.insert({ id: 0n, ...r });
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

// The EOG engine (lib/eog/alerts.ts buildConsole) runs here, inside the reducer, on the
// readings plus any simulated faults. Rewrites alert, console_meta and sensor_issue.
function rebuild(ctx: Ctx) {
  const { ds: clean, cfg } = datasetOf(ctx);
  let ds = clean;
  for (const f of ctx.db.fault.iter()) ds = injectFault(ds, { kind: f.kind as FaultKind, asset_id: f.assetId, from_ts: f.fromTs }).ds;
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
}

export const finish_ingest = spacetimedb.reducer((ctx) => {
  rebuild(ctx);
});

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
