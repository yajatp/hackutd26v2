// Live check of evidence and closing against the published 'darkroom' database (local server only).
//
//   node scripts/darkroom-seed.mjs
//   npx tsx spacetimedb-darkroom/test/evidence.ts [token dir]
//
// Opens an incident as Dana (Commander), logs evidence as Sam (Responder), checks a Viewer and a
// wrong fingerprint are refused, closes the incident, and checks nothing more can be written to it.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DbConnection, tables } from '../../lib/darkroom_bindings/index.ts';
import { GENESIS_PREV, verifyChain } from '../../lib/chain.ts';
import { replayClosure, replayEvidence, replayIncidents, rowToEvent } from '../../lib/rules/darkroom/replay.ts';

const URI = 'ws://127.0.0.1:3001';
const DB = 'darkroom';
const dir = process.argv[2] ?? join(homedir(), '.darkroom', 'tokens');
const ONE = BigInt(1), ZERO = BigInt(0);

let failures = 0;
function check(ok: boolean, label: string, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

const token = (name: string) => (JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')) as { token: string }).token;

function connect(tok: string): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder().withUri(URI).withDatabaseName(DB).withToken(tok)
      .onConnect(c => resolve(c as DbConnection)).onConnectError((_c, e) => reject(e)).build();
  });
}

function subscribe(c: DbConnection): Promise<void> {
  return new Promise(r => { c.subscriptionBuilder().onApplied(() => r()).subscribe([tables.eventLog, tables.chainHead, tables.member]); });
}

async function append(c: DbConnection, incidentId: string, type: string, payload: object) {
  const h = [...c.db.chainHead.iter()][0];
  await c.reducers.appendEvent({
    expectedSeq: h ? h.seq + ONE : ZERO, expectedPrev: h ? h.hash : GENESIS_PREV,
    incidentId, type, payloadJson: JSON.stringify(payload),
  });
}

async function refused(fn: () => Promise<void>, pattern: RegExp): Promise<string> {
  try { await fn(); return 'accepted'; } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return pattern.test(msg) ? 'refused' : `refused for another reason: ${msg}`;
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const events = (c: DbConnection) => [...c.db.eventLog.iter()].map(rowToEvent).sort((a, b) => a.seq - b.seq);

async function main() {
  const [dana, sam, lee] = await Promise.all(['Dana', 'Sam', 'Lee'].map(n => connect(token(n))));
  await Promise.all([dana, sam, lee].map(subscribe));

  await dana.reducers.openIncident({ title: 'Evidence check' });
  await sleep(300);
  const inc = replayIncidents(events(dana)).at(-1)!;
  check(inc.title === 'Evidence check', 'Commander opens an incident', inc.id);

  const fp = '1a2b3c4d' + 'e'.repeat(56);
  await append(sam, inc.id, 'evidence_imported', { ref: 'av-1a2b-3c4d', fingerprint: fp, source: 'Avon console', note: 'tank sensor LYING' });
  await sleep(300);
  const ev = replayEvidence(events(dana), inc.id);
  check(ev.length === 1 && ev[0].ref === 'AV-1A2B-3C4D' && ev[0].collector === 'Sam' && ev[0].fingerprint === fp,
    'Responder logs evidence; the server names the collector', `${ev[0]?.ref} by ${ev[0]?.collector}`);

  check(await refused(() => append(lee, inc.id, 'evidence_imported', { ref: 'AV-1A2B-3C4D', source: 'x' }), /Viewer cannot log evidence/) === 'refused',
    'a Viewer cannot log evidence');
  check(await refused(() => append(sam, inc.id, 'evidence_imported', { ref: 'AV-FFFF-3C4D', fingerprint: fp, source: 'x' }), /does not match/) === 'refused',
    'a fingerprint that does not match its reference is refused');
  check(await refused(() => append(sam, inc.id, 'incident_closed', { resolution: 'x' }), /Responder cannot close/) === 'refused',
    'a Responder cannot close the incident');

  await append(dana, inc.id, 'incident_closed', { resolution: 'Sensor replaced; no data left the site' });
  await sleep(300);
  const closed = replayClosure(events(dana), inc.id);
  check(closed?.by === 'Dana', 'Commander closes the incident', closed?.resolution ?? 'not closed');
  check(await refused(() => append(sam, inc.id, 'chat', { text: 'one more thing' }), /is closed/) === 'refused',
    'nothing more can be written to a closed incident');

  const v = verifyChain(events(dana));
  check(v.ok, 'the whole log still verifies with lib/chain.ts', v.ok ? `${v.count} entries` : JSON.stringify(v));

  for (const c of [dana, sam, lee]) c.disconnect();
  console.log(failures ? `EVIDENCE CHECK FAILED (${failures})` : 'EVIDENCE CHECK PASSED');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
