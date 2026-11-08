// Live end-to-end check against the published 'darkroom' database (local server only).
//
//   node scripts/darkroom-seed.mjs --token-dir <dir>
//   npx tsx spacetimedb-darkroom/test/e2e.ts <dir>
//
// Opens an incident, adds 2 scope updates and 3 chat lines through the generated
// bindings, then checks: the chain verifies with lib/chain.ts, a client-supplied
// actor is ignored, a Viewer cannot update scope, and a non-member is refused.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DbConnection, tables } from '../../lib/darkroom_bindings/index.ts';
import { GENESIS_PREV, verifyChain, type Json } from '../../lib/chain.ts';
import { replayChat, replayIncidents, replayScope, rowToEvent } from '../../lib/rules/darkroom/replay.ts';

const URI = 'ws://127.0.0.1:3001';
const DB = 'darkroom';
const dir = process.argv[2] ?? join(homedir(), '.darkroom', 'tokens');

let failures = 0;
function check(ok: boolean, label: string, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

function token(name: string): string {
  return (JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')) as { token: string }).token;
}

function connect(tok?: string): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    let b = DbConnection.builder().withUri(URI).withDatabaseName(DB);
    if (tok) b = b.withToken(tok);
    b.onConnect(c => resolve(c as DbConnection)).onConnectError((_c, e) => reject(e)).build();
  });
}

function subscribe(c: DbConnection): Promise<void> {
  return new Promise(r => { c.subscriptionBuilder().onApplied(() => r()).subscribe([tables.eventLog, tables.chainHead, tables.member]); });
}

function head(c: DbConnection) {
  const h = [...c.db.chainHead.iter()][0];
  return h ? { seq: h.seq + ONE, prev: h.hash } : { seq: ZERO, prev: GENESIS_PREV };
}

const ZERO = BigInt(0);
const ONE = BigInt(1);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Another connection may have written since this cache last heard, so retry a stale head.
async function append(c: DbConnection, incidentId: string, type: string, payload: Json, extra: Record<string, unknown> = {}) {
  for (let attempt = 0; ; attempt++) {
    const { seq, prev } = head(c);
    try {
      const args = { expectedSeq: seq, expectedPrev: prev, incidentId, type, payloadJson: JSON.stringify(payload), ...extra };
      await c.reducers.appendEvent(args as Parameters<typeof c.reducers.appendEvent>[0]);
      return;
    } catch (e) {
      if (attempt < 10 && message(e).includes('stale head')) { await sleep(50); continue; }
      throw e;
    }
  }
}

function rows(c: DbConnection) {
  return [...c.db.eventLog.iter()].map(rowToEvent).sort((a, b) => a.seq - b.seq);
}

const dana = await connect(token('Dana'));
const sam = await connect(token('Sam'));
const lee = await connect(token('Lee'));
await Promise.all([subscribe(dana), subscribe(sam), subscribe(lee)]);

const before = rows(dana);
const title = `Tank TK-3 sensor disagrees with physics (${new Date().toISOString().slice(11, 19)})`;
await dana.reducers.openIncident({ title });
const incident = replayIncidents(rows(dana)).filter(i => i.title === title).pop();
check(!!incident, 'Commander opened an incident', incident?.id);
const id = incident!.id;

await append(dana, id, 'scope_update', { system: 'Tank level sensor TK-3', state: 'ACCESSED', certainty: 'SUSPECTED', note: 'reported level flat, physics rising' });
await append(sam, id, 'scope_update', { system: 'Royalty owner records', state: 'EXFILTRATED', certainty: 'SUSPECTED', note: 'large export from the file share at 02:10' });
await append(dana, id, 'chat', { text: 'Commander here. Treat TK-3 readings as untrusted.' });
await append(sam, id, 'chat', { text: 'Pulling VPN logs now.' });
await append(lee, id, 'chat', { text: 'Legal is on the way.' });

// A client tries to claim another name. The reducer has no actor argument, so the field is dropped.
await append(sam, id, 'chat', { text: 'actor test: this line claims to be Mallory' }, { actor: 'Mallory' });

await sleep(200);
const after = rows(dana);
const mine = after.filter(e => e.incident_id === id);
check(mine.length >= 6, 'at least 6 new log rows for the incident', `${mine.length} rows, seq ${mine[0]?.seq}..${mine[mine.length - 1]?.seq}`);
check(after.length - before.length === mine.length, 'every new row belongs to this incident', `${after.length - before.length} new`);

const v = verifyChain(after);
console.log(`verifyChain(${after.length} rows) = ${JSON.stringify(v)}`);
check(v.ok, 'whole log verifies with lib/chain.ts');

const actorTest = mine.find(e => e.type === 'chat' && JSON.stringify(e.payload).includes('actor test'));
check(!!actorTest && actorTest.actor.startsWith('Sam|Responder|'), 'client-supplied actor ignored; server used the member row', actorTest?.actor);
check(!after.some(e => e.actor.includes('Mallory')), "no row has actor 'Mallory'");

const countBeforeRejects = rows(dana).length;
try {
  await append(lee, id, 'scope_update', { system: 'VPN', state: 'ACCESSED', certainty: 'CONFIRMED', note: '' });
  check(false, 'Viewer scope_update rejected', 'it was accepted');
} catch (e) {
  check(message(e).includes('Viewer cannot'), 'Viewer scope_update rejected', message(e));
}

const stranger = await connect();
await subscribe(stranger);
try {
  await append(stranger, id, 'chat', { text: 'let me in' });
  check(false, 'non-member append_event rejected', 'it was accepted');
} catch (e) {
  check(message(e).includes('not a member'), 'non-member append_event rejected', `SenderError: ${message(e)}; stranger ${stranger.identity?.toHexString().slice(0, 8)}…`);
}
await sleep(200);
check(rows(dana).length === countBeforeRejects, 'row count unchanged after the two rejected writes', `${countBeforeRejects} -> ${rows(dana).length}`);

console.log(`\nIncident ${id}: rebuilt from the log`);
for (const r of replayScope(after, id)) console.log(`  scope  ${r.system.padEnd(24)} ${r.state.padEnd(12)} ${r.certainty.padEnd(10)} by ${r.by} (#${r.seq})`);
for (const c of replayChat(after, id)) console.log(`  chat   #${c.seq} ${c.name} (${c.role}): ${c.text}`);
console.log(`head: #${v.ok ? v.count - 1 : '?'} ${v.ok ? v.head : ''}`);

for (const c of [dana, sam, lee, stranger]) c.disconnect();
console.log(failures === 0 ? '\nE2E PASS' : `\nE2E FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
