#!/usr/bin/env node
// The root-delete drill: deletes the newest 3 log entries as the box owner, the
// way an attacker with root on the box could. Screens that already saw those
// entries flip to ROLLBACK DETECTED AT #k. Nothing in the log prevents this; the
// witnesses on other devices are what notice it.
//
//   node scripts/tamper.mjs            delete the last 3 entries (needs 4 or more)
//   node scripts/tamper.mjs --dry-run  print what it would delete
//
// Target is fixed: database 'darkroom' on the local server (spacetime -s avonlocal,
// http://127.0.0.1:3001). It never touches 'avon' or any other server.

import { execFileSync } from "node:child_process";

const SERVER = "avonlocal";
const HTTP = "http://127.0.0.1:3001";
const DB = "darkroom";
const DELETE_COUNT = 3;
const dryRun = process.argv.includes("--dry-run");

async function seqs() {
  const res = await fetch(`${HTTP}/v1/database/${DB}/sql`, { method: "POST", body: "SELECT seq FROM event_log" });
  if (!res.ok) throw new Error(`cannot read the log: HTTP ${res.status} ${await res.text()}`);
  const [result] = await res.json();
  return result.rows.map(r => Number(r[0])).sort((a, b) => a - b);
}

async function main() {
  const before = await seqs();
  if (before.length < DELETE_COUNT + 1) {
    console.log(`REFUSED: the darkroom log has ${before.length} entr${before.length === 1 ? "y" : "ies"}. The drill needs at least ${DELETE_COUNT + 1} (${DELETE_COUNT} to delete, 1 to keep). Nothing was deleted.`);
    process.exit(1);
  }
  const keepUpTo = before[before.length - DELETE_COUNT - 1];
  const doomed = before.slice(-DELETE_COUNT);
  const sql = `DELETE FROM event_log WHERE seq > ${keepUpTo}`;
  console.log(`Log has ${before.length} entries (#${before[0]}..#${before[before.length - 1]}).`);
  console.log(`As root: spacetime sql -s ${SERVER} ${DB} "${sql}"`);
  if (dryRun) {
    console.log(`Dry run: would delete ${doomed.map(s => `#${s}`).join(", ")}. Nothing was deleted.`);
    return;
  }
  execFileSync("spacetime", ["sql", "-s", SERVER, DB, sql], { stdio: ["ignore", "ignore", "pipe"] });
  const after = await seqs();
  const gone = before.filter(s => !after.includes(s));
  console.log(`Deleted ${gone.map(s => `#${s}`).join(", ")}. The log now ends at #${after[after.length - 1]} (${after.length} entries).`);
  console.log(`Every screen that saw #${doomed[doomed.length - 1]} should now show: ROLLBACK DETECTED AT #${doomed[0]}`);
}

main().catch(e => {
  const msg = e && e.stderr ? String(e.stderr).trim().split("\n").filter(l => !l.startsWith("WARNING")).join(" ") : String(e && e.message ? e.message : e);
  console.error(`tamper: ${msg}`);
  process.exit(2);
});
