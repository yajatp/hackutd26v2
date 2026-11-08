#!/usr/bin/env node
// Between-judges reset for the hosted Avon database. Uses the same reducers as /console.
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { tsImport } from "tsx/esm/api";
import { readDatasetFiles } from "./ingest.mjs";

export const CLOUD_URI = "wss://maincloud.spacetimedb.com";
export const CLOUD_DB = "avon-hackutd26";
const DATA = fileURLToPath(new URL("../../eog-data/", import.meta.url));

export function resetOptions(args) {
  const { values } = parseArgs({ args, options: {
    uri: { type: "string", default: CLOUD_URI },
    db: { type: "string", default: CLOUD_DB },
    site: { type: "string" },
    all: { type: "boolean" },
  } });
  const uri = URL.canParse(values.uri) ? new URL(values.uri) : null;
  if (!uri || uri.protocol !== "wss:" || uri.username || uri.password) {
    throw new Error("--uri must be a wss:// URL without credentials");
  }
  if (!values.db.trim()) throw new Error("--db needs a database name");
  if (values.all && values.site !== undefined) throw new Error("use either --site or --all");
  return values;
}

export function verifyReset({ meta, top, faults, issues, confirmed }, datasetId, expectedTop) {
  if (meta?.datasetId !== datasetId) throw new Error(`console dataset is ${meta?.datasetId ?? "missing"}, expected ${datasetId}`);
  if ((!top && meta.alertCount !== 0) || (expectedTop && top?.facilityId !== expectedTop)) {
    throw new Error(`top card is ${top?.facilityId ?? "missing"}${expectedTop ? `, expected ${expectedTop}` : ""}`);
  }
  if (faults || issues || confirmed) throw new Error(formatCounts({ faults, issues, confirmed }));
}

function formatCounts({ faults, issues, confirmed }) {
  return `${faults} active, ${issues} sensor issues, ${confirmed} confirmed plans`;
}

export async function readSite(conn, tables) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out reading the Avon board")), 15000);
    const settle = (callback, value) => { clearTimeout(timer); callback(value); };
    conn.subscriptionBuilder()
      .onError(() => settle(reject, new Error("could not subscribe to the Avon board")))
      .onApplied(() => {
        settle(resolve, {
          meta: conn.db.consoleMeta.id.find(0),
          top: [...conn.db.alert.iter()].find((row) => row.rank === 1),
          facilities: Number(conn.db.facility.count()),
          faults: conn.db.fault.count(),
          issues: conn.db.sensorIssue.count(),
          confirmed: conn.db.confirmation.count(),
        });
      })
      .subscribe([tables.consoleMeta, tables.alert, tables.facility, tables.fault, tables.sensorIssue, tables.confirmation]);
  });
}

// --db is the base name. --site defaults to permian. --all resets all registered sites.
async function main() {
  const { uri, db, site, all } = resetOptions(process.argv.slice(2));
  const { SITES, DEFAULT_SITE_KEY } = await tsImport("../lib/sites.ts", import.meta.url);
  const selected = all ? SITES : SITES.filter((entry) => entry.key === (site ?? DEFAULT_SITE_KEY));
  if (!selected.length) throw new Error(`unknown site "${site}"; choose ${SITES.map((entry) => entry.key).join(", ")}`);
  const { openAvon, sendDataset, siteDatabase } = await tsImport("../lib/live.ts", import.meta.url);
  const { tables } = await tsImport("../lib/module_bindings/index.ts", import.meta.url);

  for (const entry of selected) {
    const start = performance.now();
    const isDefault = entry.key === DEFAULT_SITE_KEY;
    const folder = join(DATA, isDefault ? entry.source : `fake/${entry.key}`);
    const database = siteDatabase(entry.key, db);
    try {
      const files = await readDatasetFiles(folder);
      const conn = await openAvon(uri, database);
      try {
        const datasetId = basename(folder);
        await sendDataset(conn, files, datasetId);
        await conn.reducers.clearFault({ assetId: "" });
        const board = await readSite(conn, tables);
        verifyReset(board, datasetId, isDefault ? "S5_FACILITY_C" : undefined);
        console.log(`================ READY in ${((performance.now() - start) / 1000).toFixed(1)} s ================`);
        console.log(`  database       ${database}`);
        console.log(`  top card       ${board.top?.facilityId ?? "none"}`);
        console.log(`  faults         ${formatCounts(board)}`);
      } finally {
        conn.disconnect();
      }
    } catch (error) {
      console.error(`[cloud reset] NOT READY for ${database}: ${error?.message ?? error}`);
      process.exitCode = 1;
    }
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
