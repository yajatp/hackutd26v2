#!/usr/bin/env node
// Between-judges reset for the hosted Avon database. Uses the same reducers as /console.
import { basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { tsImport } from "tsx/esm/api";
import { readDatasetFiles } from "./ingest.mjs";

export const CLOUD_URI = "wss://maincloud.spacetimedb.com";
export const CLOUD_DB = "avon-hackutd26";
const DEFAULT_FOLDER = fileURLToPath(new URL("../../eog-data/history/mock_test_2026-10-10T1530", import.meta.url));

export function resetOptions(args) {
  const { values } = parseArgs({ args, options: {
    uri: { type: "string", default: CLOUD_URI },
    db: { type: "string", default: CLOUD_DB },
  } });
  const uri = URL.canParse(values.uri) ? new URL(values.uri) : null;
  if (!uri || uri.protocol !== "wss:" || uri.username || uri.password) {
    throw new Error("--uri must be a wss:// URL without credentials");
  }
  if (!values.db.trim()) throw new Error("--db needs a database name");
  return values;
}

export function verifyReset({ meta, top, faults, issues, confirmed }, datasetId, expectedTop) {
  if (meta?.datasetId !== datasetId) throw new Error(`console dataset is ${meta?.datasetId ?? "missing"}, expected ${datasetId}`);
  if (!top || (expectedTop && top.facilityId !== expectedTop)) {
    throw new Error(`top card is ${top?.facilityId ?? "missing"}${expectedTop ? `, expected ${expectedTop}` : ""}`);
  }
  if (faults || issues || confirmed) throw new Error(formatCounts({ faults, issues, confirmed }));
}

function formatCounts({ faults, issues, confirmed }) {
  return `${faults} active, ${issues} sensor issues, ${confirmed} confirmed plans`;
}

export async function readSite(conn, tables) {
  const snapshot = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out reading the Avon board")), 15000);
    const settle = (callback, value) => { clearTimeout(timer); callback(value); };
    conn.subscriptionBuilder()
      .onError(() => settle(reject, new Error("could not subscribe to the Avon board")))
      .onApplied(() => {
        settle(resolve, {
          meta: conn.db.consoleMeta.id.find(0),
          top: [...conn.db.alert.iter()].find((row) => row.rank === 1),
          facilities: conn.db.facility.count(),
          faults: conn.db.fault.count(),
          issues: conn.db.sensorIssue.count(),
          confirmed: conn.db.confirmation.count(),
        });
      })
      .subscribe([tables.consoleMeta, tables.alert, tables.facility, tables.fault, tables.sensorIssue, tables.confirmation]);
  });
  return snapshot;
}

async function main() {
  const start = performance.now();
  const { uri, db } = resetOptions(process.argv.slice(2));
  const files = await readDatasetFiles(DEFAULT_FOLDER);
  const { openAvon, sendDataset } = await tsImport("../lib/live.ts", import.meta.url);
  const { tables } = await tsImport("../lib/module_bindings/index.ts", import.meta.url);
  const conn = await openAvon(uri, db);
  try {
    const datasetId = basename(DEFAULT_FOLDER);
    await sendDataset(conn, files, datasetId);
    await conn.reducers.clearFault({ assetId: "" });
    const board = await readSite(conn, tables);
    verifyReset(board, datasetId, "S5_FACILITY_C");
    console.log(`================ READY in ${((performance.now() - start) / 1000).toFixed(1)} s ================`);
    console.log(`  database       ${db}`);
    console.log(`  top card       ${board.top.facilityId}`);
    console.log(`  faults         ${formatCounts(board)}`);
  } finally {
    conn.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const timeout = setTimeout(() => {
    console.error("[cloud reset] NOT READY: timed out waiting for SpacetimeDB");
    process.exit(1);
  }, 120000);
  main().catch((error) => {
    console.error(`[cloud reset] NOT READY: ${error?.message ?? error}`);
    process.exitCode = 1;
  }).finally(() => clearTimeout(timeout));
}
