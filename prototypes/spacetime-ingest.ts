// Scratch ingest benchmark: folder -> wide rows -> ingest_batch reducer calls.
// Usage: npx tsx ingest.ts <folder> <ws-uri> <db> <token> [batch] [inflight]
import { readFileSync } from 'node:fs';
import { DbConnection } from './src/module_bindings/index';

const [folder, uri, db, token, batchArg, inflightArg] = process.argv.slice(2);
const BATCH = Number(batchArg ?? 1000);
const INFLIGHT = Number(inflightArg ?? 4);
const t0 = Date.now();

const net = JSON.parse(readFileSync(`${folder}/network.json`, 'utf8'));
const facilities: any[] = [];
const assetToFac = new Map<string, { fac: string; role: string }>();
for (const s of net.systems) for (const f of s.facilities) {
  facilities.push({ facilityId: f.id, systemId: s.id, tankId: f.tank.id, capacityBbl: f.tank.capacity_bbl,
    startPct: f.pump.start_level_pct, stopPct: f.pump.stop_level_pct, lat: f.lat, lon: f.lon });
  assetToFac.set(f.id, { fac: f.id, role: 'facility' });
  assetToFac.set(f.tank.id, { fac: f.id, role: 'tank' });
  assetToFac.set(f.pump.id, { fac: f.id, role: 'pump' });
  assetToFac.set(f.pipeline.id, { fac: f.id, role: 'pipeline' });
  for (const w of f.wells) assetToFac.set(w.id, { fac: f.id, role: 'well' });
}

const wide = new Map<string, any>();
const csv = readFileSync(`${folder}/telemetry.csv`, 'utf8');
let n = 0;
for (const line of csv.split('\n')) {
  if (!line || line.startsWith('timestamp')) continue;
  const [, tsS, asset, metric, valS] = line.split(',');
  const a = assetToFac.get(asset); if (!a) continue;
  const ts = Number(tsS), v = Number(valS);
  const key = `${a.fac}|${ts}`;
  let r = wide.get(key);
  if (!r) { r = { facilityId: a.fac, ts, inflowBpd: 0, levelPct: 0, pumpStatus: 0, pumpFlowBpd: 0, dischargePsi: 0, receiveFlowBpd: 0, pipePsi: 0, wellsProducing: 0 }; wide.set(key, r); }
  if (a.role === 'facility') r.inflowBpd = v;
  else if (a.role === 'tank') r.levelPct = v;
  else if (a.role === 'pump') { if (metric === 'status') r.pumpStatus = v; else if (metric === 'flow_bpd') r.pumpFlowBpd = v; else r.dischargePsi = v; }
  else if (a.role === 'pipeline') { if (metric === 'receive_flow_bpd') r.receiveFlowBpd = v; else r.pipePsi = v; }
  else if (a.role === 'well' && metric === 'status' && v === 1) r.wellsProducing += 1;
  n++;
}
const rows = [...wide.values()];
const tParsed = Date.now();
console.log(`parsed ${n} csv rows -> ${rows.length} wide rows in ${tParsed - t0} ms`);

const conn = DbConnection.builder().withUri(uri).withDatabaseName(db).withToken(token)
  .onConnect(async (c) => {
    const tConn = Date.now();
    await c.reducers.loadFacilities({ datasetId: folder.split('/').pop()!, rows: facilities });
    const batches: any[][] = [];
    for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH));
    let next = 0;
    async function worker() { while (next < batches.length) { const b = batches[next++]; await c.reducers.ingestBatch({ rows: b }); } }
    await Promise.all(Array.from({ length: INFLIGHT }, worker));
    const tDone = Date.now();
    console.log(`ingested ${rows.length} rows in ${batches.length} calls (batch ${BATCH}, inflight ${INFLIGHT}) in ${tDone - tConn} ms; total ${tDone - t0} ms`);
    c.disconnect();
    process.exit(0);
  })
  .onConnectError((_c, e) => { console.error('connect error', e); process.exit(1); })
  .build();
