// Prototype of the Darkroom: Avon module (scratch test, SpacetimeDB 2.14.1).
import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

const GENESIS_PREV = '0'.repeat(64);

const config = table({ name: 'config', public: true }, {
  id: t.u8().primaryKey(),
  owner: t.identity(),
  datasetId: t.string(),
  tStart: t.u32(),
  tEnd: t.u32(),
  simTs: t.u32(),
  stepSec: t.u32(),      // sim seconds advanced per tick
  playing: t.bool(),
});

const facility = table({ name: 'facility', public: true }, {
  facilityId: t.string().primaryKey(),
  systemId: t.string(),
  tankId: t.string(),
  capacityBbl: t.f64(),
  startPct: t.f64(),
  stopPct: t.f64(),
  lat: t.f64(),
  lon: t.f64(),
});

const Reading = t.object('ReadingIn', {
  facilityId: t.string(),
  ts: t.u32(),
  inflowBpd: t.f64(),
  levelPct: t.f64(),
  pumpStatus: t.u8(),
  pumpFlowBpd: t.f64(),
  dischargePsi: t.f64(),
  receiveFlowBpd: t.f64(),
  pipePsi: t.f64(),
  wellsProducing: t.u8(),
});

// Private: 30k rows, never subscribed by phones or the Quest.
const reading = table({
  name: 'reading',
  indexes: [{ accessor: 'byFacTs', algorithm: 'btree', columns: ['facilityId', 'ts'] }],
}, {
  id: t.u64().primaryKey().autoInc(),
  facilityId: t.string(),
  ts: t.u32(),
  inflowBpd: t.f64(),
  levelPct: t.f64(),
  pumpStatus: t.u8(),
  pumpFlowBpd: t.f64(),
  dischargePsi: t.f64(),
  receiveFlowBpd: t.f64(),
  pipePsi: t.f64(),
  wellsProducing: t.u8(),
});

const tankLive = table({ name: 'tank_live', public: true }, {
  facilityId: t.string().primaryKey(),
  ts: t.u32(),
  reportedPct: t.f64(),
  physicsPct: t.f64(),
  residualPct: t.f64(),
  pumpStatus: t.u8(),
  spoofed: t.bool(),
  disagree: t.bool(),
});

const spoof = table({ name: 'spoof' }, {
  facilityId: t.string().primaryKey(),
  levelPct: t.f64(),
});

const tickTimer = table({ name: 'tick_timer' }, {
  scheduledId: t.u64().primaryKey().autoInc(),
  scheduledAt: t.scheduleAt(),
});

const eventLog = table({ name: 'event_log', public: true }, {
  seq: t.u64().primaryKey(),
  prevHash: t.string(),
  incidentId: t.string(),
  ts: t.string(),
  actor: t.string(),
  type: t.string(),
  payloadJson: t.string(),
  hash: t.string(),
});

const chainHead = table({ name: 'chain_head', public: true }, {
  id: t.u8().primaryKey(),
  seq: t.u64(),
  hash: t.string(),
  count: t.u64(),
});

const spacetimedb = schema({ config, facility, reading, tankLive, spoof, tickTimer, eventLog, chainHead });
export default spacetimedb;
type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

function canonical(v: unknown): string {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new SenderError('non-finite'); return JSON.stringify(v); }
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  throw new SenderError('bad payload');
}

function appendInternal(ctx: Ctx, incidentId: string, actor: string, type: string, payload: unknown) {
  const head = ctx.db.chainHead.id.find(0);
  const seq = head && head.count > 0n ? head.seq + 1n : 0n;
  const prevHash = head && head.count > 0n ? head.hash : GENESIS_PREV;
  const ts = String(ctx.timestamp.microsSinceUnixEpoch);
  const body = { seq: Number(seq), prev_hash: prevHash, incident_id: incidentId, ts, actor, type, payload };
  const hash = bytesToHex(sha256(utf8ToBytes(canonical(body))));
  ctx.db.eventLog.insert({ seq, prevHash, incidentId, ts, actor, type, payloadJson: canonical(payload), hash });
  if (head) ctx.db.chainHead.id.update({ id: 0, seq, hash, count: head.count + 1n });
  else ctx.db.chainHead.insert({ id: 0, seq, hash, count: 1n });
  return { seq, hash };
}

export const init = spacetimedb.init(ctx => {
  ctx.db.config.insert({ id: 0, owner: ctx.sender, datasetId: '', tStart: 0, tEnd: 0, simTs: 0, stepSec: 3600, playing: false });
});

export const loadFacilities = spacetimedb.reducer(
  { datasetId: t.string(), rows: t.array(facility.rowType) },
  (ctx, { datasetId, rows }) => {
    const cfg = ctx.db.config.id.find(0)!;
    if (!cfg.owner.isEqual(ctx.sender)) throw new SenderError('owner only');
    for (const f of [...ctx.db.facility.iter()]) ctx.db.facility.facilityId.delete(f.facilityId);
    for (const r of [...ctx.db.reading.iter()]) ctx.db.reading.id.delete(r.id);
    for (const r of rows) ctx.db.facility.insert(r);
    ctx.db.config.id.update({ ...cfg, datasetId, tStart: 0, tEnd: 0, simTs: 0, playing: false });
  }
);

export const ingestBatch = spacetimedb.reducer(
  { rows: t.array(Reading) },
  (ctx, { rows }) => {
    const cfg = ctx.db.config.id.find(0)!;
    if (!cfg.owner.isEqual(ctx.sender)) throw new SenderError('owner only');
    let lo = cfg.tStart || 0xffffffff, hi = cfg.tEnd;
    for (const r of rows) {
      ctx.db.reading.insert({ id: 0n, ...r });
      if (r.ts < lo) lo = r.ts;
      if (r.ts > hi) hi = r.ts;
    }
    ctx.db.config.id.update({ ...cfg, tStart: lo, tEnd: hi, simTs: cfg.simTs || lo });
  }
);

export const startReplay = spacetimedb.reducer(
  { stepSec: t.u32(), intervalMs: t.u32() },
  (ctx, { stepSec, intervalMs }) => {
    const cfg = ctx.db.config.id.find(0)!;
    for (const r of [...ctx.db.tickTimer.iter()]) ctx.db.tickTimer.scheduledId.delete(r.scheduledId);
    ctx.db.tickTimer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(BigInt(intervalMs) * 1000n) });
    ctx.db.config.id.update({ ...cfg, stepSec, playing: true, simTs: cfg.tStart });
  }
);

export const reportTankLevel = spacetimedb.reducer(
  { facilityId: t.string(), levelPct: t.f64() },
  (ctx, { facilityId, levelPct }) => {
    if (ctx.db.spoof.facilityId.find(facilityId)) ctx.db.spoof.facilityId.update({ facilityId, levelPct });
    else ctx.db.spoof.insert({ facilityId, levelPct });
    // Show the fake reading on every screen right away (not at the next tick),
    // so phone -> Quest latency is one round trip.
    const live = ctx.db.tankLive.facilityId.find(facilityId);
    if (live) ctx.db.tankLive.facilityId.update({ ...live, reportedPct: levelPct, spoofed: true, residualPct: levelPct - live.physicsPct });
  }
);

export const tick = spacetimedb.reducer(
  { onSchedule: tickTimer },
  { arg: tickTimer.rowType },
  ctx => {
    const cfg = ctx.db.config.id.find(0)!;
    if (!cfg.playing) return;
    const prevTs = cfg.simTs;
    const next = Math.min(cfg.tEnd, cfg.simTs + cfg.stepSec);
    for (const f of ctx.db.facility.iter()) {
      const rows = [...ctx.db.reading.byFacTs.filter([f.facilityId, next])];
      const r = rows[0];
      if (!r) continue;
      const live = ctx.db.tankLive.facilityId.find(f.facilityId);
      const sp = ctx.db.spoof.facilityId.find(f.facilityId);
      const reported = sp ? sp.levelPct : r.levelPct;
      const dtH = (next - prevTs) / 3600;
      const base = live ? live.physicsPct : r.levelPct;
      let physics = base + ((r.inflowBpd - r.pumpFlowBpd) / 24 / f.capacityBbl) * 100 * dtH;
      physics = Math.max(0, Math.min(100, physics));
      const residual = reported - physics;
      // Latch: once sensor and physics disagree under a spoof, stop re-anchoring
      // until the spoof is cleared, so a flat fake line cannot "catch up".
      const disagree = Math.abs(residual) > 3 || (!!live && live.disagree && !!sp);
      if (!disagree) physics = reported; // re-anchor only while sensor and physics agree
      const row = { facilityId: f.facilityId, ts: next, reportedPct: reported, physicsPct: physics, residualPct: residual, pumpStatus: r.pumpStatus, spoofed: !!sp, disagree };
      if (live) {
        if (disagree && !live.disagree) appendInternal(ctx, 'INC-1', 'physics-check', 'sensor_disagrees', { facility: f.facilityId, reported, physics });
        ctx.db.tankLive.facilityId.update(row);
      } else ctx.db.tankLive.insert(row);
    }
    ctx.db.config.id.update({ ...cfg, simTs: next, playing: next < cfg.tEnd });
  }
);

export const appendEvent = spacetimedb.reducer(
  { expectedSeq: t.u64(), expectedPrev: t.string(), incidentId: t.string(), actor: t.string(), type: t.string(), payloadJson: t.string() },
  (ctx, { expectedSeq, expectedPrev, incidentId, actor, type, payloadJson }) => {
    const head = ctx.db.chainHead.id.find(0);
    const nextSeq = head && head.count > 0n ? head.seq + 1n : 0n;
    const prev = head && head.count > 0n ? head.hash : GENESIS_PREV;
    if (expectedSeq !== nextSeq) throw new SenderError(`seq must be head+1 (${nextSeq}), got ${expectedSeq}`);
    if (expectedPrev !== prev) throw new SenderError('prev_hash does not match head');
    let payload: unknown;
    try { payload = JSON.parse(payloadJson); } catch { throw new SenderError('payload is not JSON'); }
    appendInternal(ctx, incidentId, actor, type, payload);
  }
);
