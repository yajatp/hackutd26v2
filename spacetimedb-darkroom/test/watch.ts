// A headless screen: subscribes to the log the way /box and /witness do, keeps a
// witness in memory, logs every insert and delete, and prints the status on each change.
//
//   npx tsx spacetimedb-darkroom/test/watch.ts [seconds=60]
//
// Exits 2 s after the status stops being LOG VERIFIED, or after the time limit.

import { DbConnection, tables } from '../../lib/darkroom_bindings/index.ts';
import type { LogEvent, Witness } from '../../lib/chain.ts';
import { rowToEvent } from '../../lib/rules/darkroom/replay.ts';
import { advanceWitness, chainStatus } from '../../lib/rules/darkroom/status.ts';

const seconds = Number(process.argv[2] ?? 60);
const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(2).padStart(6)}s`;

const conn = await new Promise<DbConnection>((resolve, reject) => {
  DbConnection.builder().withUri('ws://127.0.0.1:3001').withDatabaseName('darkroom')
    .onConnect(c => resolve(c as DbConnection)).onConnectError((_c, e) => reject(e)).build();
});

let ready = false;
let witness: Witness | null = null;
let lastText = '';
let pending = false;

function log(): LogEvent[] {
  return [...conn.db.eventLog.iter()].map(rowToEvent);
}

function recompute() {
  pending = false;
  const l = log();
  const st = chainStatus(l, witness);
  witness = advanceWitness(l, witness);
  if (st.text !== lastText) {
    console.log(`${stamp()}  STATUS ${st.text}  (${l.length} rows, witness #${witness?.seq ?? '-'})`);
    lastText = st.text;
    if (st.kind === 'rollback' || st.kind === 'tampering') setTimeout(() => process.exit(0), 2000);
  }
}

function later() {
  if (ready && !pending) { pending = true; queueMicrotask(recompute); }
}

conn.db.eventLog.onInsert((_ctx, r) => { if (ready) console.log(`${stamp()}  insert #${r.seq} ${r.type}`); later(); });
conn.db.eventLog.onDelete((_ctx, r) => { console.log(`${stamp()}  delete #${r.seq} ${r.type}`); later(); });
conn.db.eventLog.onUpdate?.((_ctx, _old, r) => { console.log(`${stamp()}  update #${r.seq} ${r.type}`); later(); });

conn.subscriptionBuilder().onApplied(() => {
  ready = true;
  console.log(`${stamp()}  subscribed as ${conn.identity?.toHexString().slice(0, 8)}…, ${log().length} rows`);
  recompute();
}).subscribe([tables.eventLog]);

setTimeout(() => { console.log(`${stamp()}  time limit`); process.exit(0); }, seconds * 1000);
