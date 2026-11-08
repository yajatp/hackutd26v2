// Scratch round-trip test: connection B appends, connection A (subscriber) sees the row.
// Also checks the stale-head rejection and the root-delete (rollback) visibility.
import { DbConnection, tables } from './src/module_bindings/index';

const [uri, db] = process.argv.slice(2);
const GENESIS = '0'.repeat(64);

function connect(): Promise<DbConnection> {
  return new Promise((res, rej) => {
    DbConnection.builder().withUri(uri).withDatabaseName(db)
      .onConnect(c => res(c as DbConnection)).onConnectError((_c, e) => rej(e)).build();
  });
}

const A = await connect();
const B = await connect();
await new Promise<void>(r => A.subscriptionBuilder().onApplied(() => r()).subscribe([tables.eventLog, tables.chainHead, tables.tankLive]));
await new Promise<void>(r => B.subscriptionBuilder().onApplied(() => r()).subscribe([tables.chainHead]));

const waiters = new Map<string, (t: number) => void>();
A.db.eventLog.onInsert((_ctx, row) => { const w = waiters.get(row.type); if (w) { waiters.delete(row.type); w(performance.now()); } });
let deletes = 0;
A.db.eventLog.onDelete(() => { deletes++; });

function head() {
  const h = [...B.db.chainHead.iter()][0];
  return h && h.count > 0n ? { seq: h.seq + 1n, prev: h.hash } : { seq: 0n, prev: GENESIS };
}

const times: number[] = [];
for (let i = 0; i < 20; i++) {
  const type = `rtt_${i}_${Date.now()}`;
  const seen = new Promise<number>(r => waiters.set(type, r));
  const { seq, prev } = head();
  const t0 = performance.now();
  await B.reducers.appendEvent({ expectedSeq: seq, expectedPrev: prev, incidentId: 'INC-1', actor: 'tester', type, payloadJson: JSON.stringify({ i }) });
  const t1 = await seen;
  times.push(t1 - t0);
}
times.sort((a, b) => a - b);
console.log(`append->other client sees row: median ${times[10].toFixed(1)} ms, max ${times[19].toFixed(1)} ms (n=20)`);

// Stale head must be rejected.
try {
  await B.reducers.appendEvent({ expectedSeq: 0n, expectedPrev: GENESIS, incidentId: 'INC-1', actor: 'rogue', type: 'forged', payloadJson: '{}' });
  console.log('STALE APPEND ACCEPTED (bad)');
} catch (e) { console.log('stale append rejected:', String((e as Error).message ?? e).slice(0, 120)); }

const before = [...A.db.eventLog.iter()].length;
console.log(`A sees ${before} log rows; now waiting 8 s for an outside root DELETE...`);
await new Promise(r => setTimeout(r, 8000));
console.log(`after: A sees ${[...A.db.eventLog.iter()].length} rows, onDelete fired ${deletes} times`);
process.exit(0);
