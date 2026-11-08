#!/usr/bin/env node
// Loads one EOG dataset folder into the local Avon database through the same reducers the
// /console page uses: load_dataset -> ingest_batch x N -> finish_ingest. Prints timings.
//
//   node scripts/ingest.mjs <folder> [--id <dataset_id>] [--uri ws://127.0.0.1:3001] [--db avon]
//                           [--batch 1000] [--inflight 4]
//   npm run st:ingest -- <folder>
//
// Local servers only: the URI must be plain ws:// (the public cloud is wss:// only).
import { tsImport } from "tsx/esm/api";
import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

function args(argv) {
  const out = { folder: "", id: "", uri: "ws://127.0.0.1:3001", db: "avon", batch: 1000, inflight: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--id") out.id = val();
    else if (a === "--uri") out.uri = val();
    else if (a === "--db") out.db = val();
    else if (a === "--batch") out.batch = Number(val());
    else if (a === "--inflight") out.inflight = Number(val());
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else out.folder = a;
  }
  if (!out.folder) throw new Error("usage: node scripts/ingest.mjs <folder> [--id <dataset_id>] [--uri ws://127.0.0.1:3001]");
  if (!/^ws:\/\//.test(out.uri)) throw new Error(`refusing ${out.uri}: local ws:// servers only`);
  out.folder = resolve(out.folder);
  out.id ||= basename(out.folder);
  return out;
}

const ms = (x) => `${x.toFixed(0).padStart(6)} ms`;

async function main() {
  const o = args(process.argv.slice(2));
  const read = (f) => readFile(join(o.folder, f), "utf8");
  const [network, ops, telemetry] = await Promise.all([read("network.json"), read("ops.json"), read("telemetry.csv")]);
  // tsImport lets this plain-node script load the TypeScript in lib/ (same code as the browser).
  const { openAvon, sendDataset } = await tsImport("../lib/live.ts", import.meta.url);
  const conn = await openAvon(o.uri, o.db);
  try {
    const t = await sendDataset(conn, { network, ops, telemetry }, o.id, { batch: o.batch, inflight: o.inflight });
    console.log(`dataset       ${o.id} -> database ${o.db} at ${o.uri}`);
    console.log(`parse         ${ms(t.parseMs)}  (${t.rows} reading rows = ${t.facilities} facilities x ${t.timestamps} timestamps)`);
    console.log(`load_dataset  ${ms(t.loadMs)}`);
    console.log(`ingest_batch  ${ms(t.ingestMs)}  (${t.batches} calls, batch ${o.batch}, ${o.inflight} in flight)`);
    console.log(`finish_ingest ${ms(t.finishMs)}`);
    console.log(`total         ${ms(t.totalMs)}`);
  } finally {
    conn.disconnect();
  }
}

main().then(() => process.exit(0), (e) => {
  console.error(`ingest failed: ${e?.message ?? e}`);
  process.exit(1);
});
