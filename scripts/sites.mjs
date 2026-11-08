#!/usr/bin/env node
// Provision the extra map sites locally. --cloud also provisions them on maincloud.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { tsImport } from "tsx/esm/api";
import { readDatasetFiles } from "./ingest.mjs";
import { CLOUD_DB, CLOUD_URI, readSite } from "./reset-cloud.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DATA = join(ROOT, "../eog-data");
const LOCAL_URI = "ws://127.0.0.1:3001";

async function main() {
  const { values: { cloud } } = parseArgs({ options: { cloud: { type: "boolean" } } });
  const { SITES, DEFAULT_SITE_KEY } = await tsImport("../lib/sites.ts", import.meta.url);
  const { openAvon, sendDataset, siteDatabase } = await tsImport("../lib/live.ts", import.meta.url);
  const { tables } = await tsImport("../lib/module_bindings/index.ts", import.meta.url);

  const targets = [{ server: "http://127.0.0.1:3001", uri: LOCAL_URI, base: "avon" }];
  if (cloud) targets.push({ server: "maincloud", uri: CLOUD_URI, base: CLOUD_DB });

  const summary = [];
  try {
    for (const { server, uri, base } of targets) {
      if (server === "maincloud") {
        // Check the existing login without printing its output or starting a login flow.
        const login = execFileSync("spacetime", ["login", "show"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        if (!login.includes("You are logged in as ")) throw new Error("--cloud needs an existing SpacetimeDB login");
      }
      for (const site of SITES) {
        if (site.key === DEFAULT_SITE_KEY) continue;
        const folder = join(DATA, "fake", site.key);
        // Completed datasets can be reused across local and hosted runs.
        if (!existsSync(folder)) {
          execFileSync(process.execPath, [
            "scripts/make-fake-site.mjs", join(DATA, site.source), folder,
            "--seed", String(site.seed), "--center", `${site.lat},${site.lon}`, "--name", site.name,
          ], { cwd: ROOT, stdio: "inherit" });
        }
        const files = await readDatasetFiles(folder);
        if (JSON.parse(files.network).name !== site.name) throw new Error(`${folder} belongs to a different site`);
        const db = siteDatabase(site.key, base);
        console.log(`Publishing ${db} to ${server}`);
        execFileSync("spacetime", ["publish", "-s", server, "--module-path", "spacetimedb", "-y", db],
          { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"], timeout: 120000 });
        const conn = await openAvon(uri, db);
        try {
          await sendDataset(conn, files, site.key);
          const { meta, top, facilities } = await readSite(conn, tables);
          if (meta?.datasetId !== site.key || !facilities) throw new Error(`${db}: site did not load`);
          summary.push({ site: site.key, database: db, facilities, "top problem": top ? `${top.kind} · ${top.facilityId}` : "none", "plans total": meta.plans.toFixed(2) });
        } finally {
          conn.disconnect();
        }
      }
    }
  } finally {
    if (summary.length) console.table(summary);
  }
}

main().catch((error) => {
  console.error(`[sites] ${error?.message ?? error}`);
  process.exitCode = 1;
});
