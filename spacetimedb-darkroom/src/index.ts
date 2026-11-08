// Darkroom module (SpacetimeDB 2.14.1). Published as database 'darkroom' on the
// box's own local server. The 'avon' (company side) module lives in spacetimedb/;
// the two never share a database, so the room stays isolated.
//
// Every write is one entry in a hash-chained, append-only log (lib/chain.ts).
// Screens rebuild the incident, scope board and chat by replaying that log.
// Who wrote an entry comes from the member row for ctx.sender, never from the client.

import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { Timestamp, type Identity } from 'spacetimedb';
import { canonical, GENESIS_PREV, hashEvent, type Json } from '../../lib/chain.ts';
import { actorString, checkWrite, isRole } from '../../lib/rules/darkroom/roles.ts';
import { nextIncidentId, validName, validatePayload } from '../../lib/rules/darkroom/entries.ts';
import { checkCreateJoinCode, checkJoin, hashJoinCode, joinCodeExpiry, normalizeJoinCode } from '../../lib/rules/darkroom/joincode.ts';
import { rttRowsToDelete } from '../../lib/rules/darkroom/rtt.ts';

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

// One-use join codes a Commander made (Add a member on /box). Private: no client can read it.
// Only the SHA-256 of the code is stored; the code itself never reaches this table.
const joinCode = table({ name: 'join_code' }, {
  codeHash: t.string().primaryKey(),
  role: t.string(),
  createdBy: t.identity(),
  createdAt: t.timestamp(),
  expiresAt: t.timestamp(),
  used: t.bool(),
  usedBy: t.option(t.identity()),
});

// Live latency probe: rtt_ping writes (sender, nonce, server time); each screen times how long
// its own row takes to come back through its subscription. Not part of the log. Newest 50 rows.
const rttProbe = table({ name: 'rtt_probe', public: true }, {
  id: t.u64().primaryKey().autoInc(),
  sender: t.identity(),
  nonce: t.u32(),
  at: t.timestamp(),
});

const spacetimedb = schema({ config, member, eventLog, chainHead, joinCode, rttProbe });
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

function incidentClosed(ctx: Ctx, incidentId: string): boolean {
  for (const e of ctx.db.eventLog.incidentId.filter(incidentId)) {
    if (e.type === 'incident_closed') return true;
  }
  return false;
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

function upsertMember(ctx: Ctx, identity: Identity, name: string, role: string, addedBy: Identity = ctx.sender) {
  const row = { identity, name, role, addedBy, addedAt: ctx.timestamp, active: true };
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
    if (incidentClosed(ctx, incidentId)) throw new SenderError(`${incidentId} is closed`);
    let raw: unknown;
    try { raw = JSON.parse(payloadJson); } catch { throw new SenderError('payload is not JSON'); }
    const p = validatePayload(type, raw);
    if (!p.ok) throw new SenderError(p.reason);
    appendEntry(ctx, incidentId, actorOf(ctx), type, p.payload);
  }
);

// Commander only. The browser makes the code and sends only its SHA-256 hash. The code works
// once, for 60 s from now, and gives the role chosen here (Responder or Viewer).
export const createJoinCode = spacetimedb.reducer(
  { codeHash: t.string(), role: t.string() },
  (ctx, { codeHash, role }) => {
    const allowed = checkCreateJoinCode(memberOf(ctx, ctx.sender), role, codeHash);
    if (!allowed.ok) throw new SenderError(allowed.reason);
    // Housekeeping: codes past their time are useless, so the table only holds live ones.
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const old = [...ctx.db.joinCode.iter()].filter(c => c.expiresAt.microsSinceUnixEpoch <= now).map(c => c.codeHash);
    for (const h of old) ctx.db.joinCode.codeHash.delete(h);
    if (ctx.db.joinCode.codeHash.find(codeHash)) throw new SenderError('that code already exists; make a new one');
    ctx.db.joinCode.insert({
      codeHash, role, createdBy: ctx.sender, createdAt: ctx.timestamp,
      expiresAt: new Timestamp(joinCodeExpiry(now)), used: false, usedBy: undefined,
    });
  }
);

// Anyone may call it: the caller becomes a member if the code is right, unused and under 60 s
// old. Logged as member_added with the code's creator as the actor (they let this person in).
export const joinWithCode = spacetimedb.reducer(
  { code: t.string(), name: t.string() },
  (ctx, { code, name }) => {
    const typed = normalizeJoinCode(code);
    if (!typed) throw new SenderError('a join code is 10 letters and digits, like ABCDE-FGHJK');
    const row = ctx.db.joinCode.codeHash.find(hashJoinCode(typed));
    const ok = checkJoin(
      row && { role: row.role, expiresAtMicros: row.expiresAt.microsSinceUnixEpoch, used: row.used },
      ctx.timestamp.microsSinceUnixEpoch, memberOf(ctx, ctx.sender), name,
    );
    if (!ok.ok || !row) throw new SenderError(ok.ok ? 'This code is not valid.' : ok.reason);
    // The Commander who made the code must still be one when it is used.
    const creator = memberOf(ctx, row.createdBy);
    if (!creator || !creator.active || creator.role !== 'Commander') throw new SenderError('the Commander who made this code is no longer one');
    ctx.db.joinCode.codeHash.update({ ...row, used: true, usedBy: ctx.sender });
    upsertMember(ctx, ctx.sender, ok.name, ok.role, row.createdBy);
    appendEntry(ctx, BOX, actorString(creator.name, creator.role, row.createdBy.toHexString()), 'member_added', {
      name: ok.name, role: ok.role, identity: ctx.sender.toHexString(), how: 'joined by code',
    });
  }
);

// Anyone may call it (witness phones are not members). Keeps the newest 50 rows.
export const rttPing = spacetimedb.reducer(
  { nonce: t.u32() },
  (ctx, { nonce }) => {
    ctx.db.rttProbe.insert({ id: ZERO, sender: ctx.sender, nonce, at: ctx.timestamp });
    for (const id of rttRowsToDelete([...ctx.db.rttProbe.iter()].map(r => r.id))) ctx.db.rttProbe.id.delete(id);
  }
);
