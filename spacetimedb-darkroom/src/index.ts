// Darkroom module (SpacetimeDB 2.14.1). Published as database 'darkroom' on the
// box's own local server. The 'avon' (company side) module lives in spacetimedb/;
// the two never share a database, so the room stays isolated.
//
// Every write is one entry in a hash-chained, append-only log (lib/chain.ts).
// Screens rebuild the incident, scope board and chat by replaying that log.
// Who wrote an entry comes from the member row for ctx.sender, never from the client.

import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import type { Identity } from 'spacetimedb';
import { canonical, GENESIS_PREV, hashEvent, type Json } from '../../lib/chain.ts';
import { actorString, checkWrite, isRole } from '../../lib/rules/darkroom/roles.ts';
import { nextIncidentId, validName, validatePayload } from '../../lib/rules/darkroom/entries.ts';

const config = table({ name: 'config', public: true }, {
  id: t.u8().primaryKey(),
  owner: t.identity(),
  incidentCounter: t.u32(),
});

const member = table({ name: 'member', public: true }, {
  identity: t.identity().primaryKey(),
  name: t.string(),
  role: t.string(),
  addedBy: t.identity(),
  addedAt: t.timestamp(),
  active: t.bool(),
});

const eventLog = table({ name: 'event_log', public: true }, {
  seq: t.u64().primaryKey(),
  prevHash: t.string(),
  incidentId: t.string().index('btree'),
  ts: t.string(),
  actor: t.string(),
  type: t.string(),
  payloadJson: t.string(),
  hash: t.string(),
});

// The newest entry the server wrote. Clients send it back as expected_seq/expected_prev.
const chainHead = table({ name: 'chain_head', public: true }, {
  id: t.u8().primaryKey(),
  seq: t.u64(),
  hash: t.string(),
  count: t.u64(),
});

const spacetimedb = schema({ config, member, eventLog, chainHead });
export default spacetimedb;
type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

// Entries not tied to one incident (membership) use this incident id.
const BOX = '';
// BigInt() instead of 0n/1n literals: the repo-wide tsconfig targets ES2017.
const ZERO = BigInt(0);
const ONE = BigInt(1);

function isOwner(ctx: Ctx): boolean {
  const cfg = ctx.db.config.id.find(0);
  return !!cfg && cfg.owner.isEqual(ctx.sender);
}

function memberOf(ctx: Ctx, who: Identity) {
  return ctx.db.member.identity.find(who);
}

function actorOf(ctx: Ctx): string {
  const m = memberOf(ctx, ctx.sender);
  if (!m || !m.active) throw new SenderError('not a member');
  return actorString(m.name, m.role, ctx.sender.toHexString());
}

function incidentExists(ctx: Ctx, incidentId: string): boolean {
  for (const e of ctx.db.eventLog.incidentId.filter(incidentId)) {
    if (e.type === 'incident_opened') return true;
  }
  return false;
}

// The only place that writes to event_log.
function appendEntry(ctx: Ctx, incidentId: string, actor: string, type: string, payload: Json) {
  const head = ctx.db.chainHead.id.find(0);
  if (head && !ctx.db.eventLog.seq.find(head.seq)) {
    // Someone removed rows behind the server's back. Do not write on top of a cut log.
    throw new SenderError(`log is cut: entry #${head.seq} is missing; writing is stopped`);
  }
  const seq = head ? head.seq + ONE : ZERO;
  const prevHash = head ? head.hash : GENESIS_PREV;
  const ts = ctx.timestamp.toISOString();
  const hash = hashEvent({ seq: Number(seq), prev_hash: prevHash, incident_id: incidentId, ts, actor, type, payload });
  ctx.db.eventLog.insert({ seq, prevHash, incidentId, ts, actor, type, payloadJson: canonical(payload), hash });
  if (head) ctx.db.chainHead.id.update({ id: 0, seq, hash, count: head.count + ONE });
  else ctx.db.chainHead.insert({ id: 0, seq, hash, count: ONE });
}

function upsertMember(ctx: Ctx, identity: Identity, name: string, role: string) {
  const row = { identity, name, role, addedBy: ctx.sender, addedAt: ctx.timestamp, active: true };
  if (memberOf(ctx, identity)) ctx.db.member.identity.update(row);
  else ctx.db.member.insert(row);
}

// The publisher owns the box and is its first Commander.
export const init = spacetimedb.init(ctx => {
  ctx.db.config.insert({ id: 0, owner: ctx.sender, incidentCounter: 0 });
  upsertMember(ctx, ctx.sender, 'Box owner', 'Commander');
  appendEntry(ctx, BOX, actorOf(ctx), 'member_added', { name: 'Box owner', role: 'Commander', identity: ctx.sender.toHexString() });
});

// Owner only (called by scripts/darkroom-seed.mjs through the spacetime CLI).
export const seedMember = spacetimedb.reducer(
  { identity: t.identity(), name: t.string(), role: t.string() },
  (ctx, { identity, name, role }) => {
    if (!isOwner(ctx)) throw new SenderError('owner only');
    const clean = validName(name);
    if (!clean) throw new SenderError('name must be 1-40 characters with no |');
    if (!isRole(role)) throw new SenderError('role must be Commander, Responder or Viewer');
    upsertMember(ctx, identity, clean, role);
    appendEntry(ctx, BOX, actorOf(ctx), 'member_added', { name: clean, role, identity: identity.toHexString() });
  }
);

// Commander only. The server picks the incident id.
export const openIncident = spacetimedb.reducer(
  { title: t.string() },
  (ctx, { title }) => {
    const m = memberOf(ctx, ctx.sender);
    const allowed = checkWrite(m, 'incident_opened');
    if (!allowed.ok) throw new SenderError(allowed.reason);
    const p = validatePayload('incident_opened', { title });
    if (!p.ok) throw new SenderError(p.reason);
    const cfg = ctx.db.config.id.find(0);
    if (!cfg) throw new SenderError('box not initialised');
    const n = cfg.incidentCounter + 1;
    ctx.db.config.id.update({ ...cfg, incidentCounter: n });
    appendEntry(ctx, nextIncidentId(n), actorOf(ctx), 'incident_opened', p.payload);
  }
);

// Scope updates and chat. No actor argument: the actor is the sender's member row.
export const appendEvent = spacetimedb.reducer(
  { expectedSeq: t.u64(), expectedPrev: t.string(), incidentId: t.string(), type: t.string(), payloadJson: t.string() },
  (ctx, { expectedSeq, expectedPrev, incidentId, type, payloadJson }) => {
    const m = memberOf(ctx, ctx.sender);
    const allowed = checkWrite(m, type);
    if (!allowed.ok) throw new SenderError(allowed.reason);
    if (type === 'incident_opened') throw new SenderError('use open_incident');
    const head = ctx.db.chainHead.id.find(0);
    const nextSeq = head ? head.seq + ONE : ZERO;
    const prev = head ? head.hash : GENESIS_PREV;
    if (expectedSeq !== nextSeq) throw new SenderError(`stale head: next seq is ${nextSeq}, got ${expectedSeq}`);
    if (expectedPrev !== prev) throw new SenderError('stale head: prev_hash does not match');
    if (!incidentExists(ctx, incidentId)) throw new SenderError(`no incident ${incidentId}`);
    let raw: unknown;
    try { raw = JSON.parse(payloadJson); } catch { throw new SenderError('payload is not JSON'); }
    const p = validatePayload(type, raw);
    if (!p.ok) throw new SenderError(p.reason);
    appendEntry(ctx, incidentId, actorOf(ctx), type, p.payload);
  }
);
