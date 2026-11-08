#!/usr/bin/env node
// Between-judges reset for Laptop 1. Puts the running demo back to the same clean start in a few
// seconds, without restarting anything:
//   1. checks SpacetimeDB answers on 127.0.0.1:3001 and the avon database exists
//   2. clears every simulated fault (clear_fault "")
//   3. reloads the demo folder through scripts/ingest.mjs, exactly like boot step 3
//   4. checks the result over HTTP SQL: dataset, no faults, no sensor issues, no confirmed plans,
//      the expected top card
//   5. prints READY with the time taken and the two phone URLs
//
//   npm run demo:reset                      (mock_test folder)
//   npm run demo:reset -- <folder>          (the folder you booted with)
//
// Screens stay open: the console and the phones see the new rows over their subscriptions.
// Never stops or starts SpacetimeDB or the dev server, never publishes, never uses --delete-data.
// Safety: every spacetime call names the local server (-s http://127.0.0.1:3001), never maincloud.
// Node standard library only; works on macOS, Linux and Windows.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { homedir, networkInterfaces } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL = "http://127.0.0.1:3001";
const DB = "avon";
const ST_PORT = 3001;
const WEB_PORT = 3000;
const DEFAULT_FOLDER = join(ROOT, "..", "eog-data", "history", "mock_test_2026-10-10T1530");
// The top card each known demo folder must show after a clean load.
const EXPECTED_TOP = { "mock_test_2026-10-10T1530": "S5_FACILITY_C" };
const WIN = process.platform === "win32";

const t0 = Date.now();
const secs = (from) => `${((Date.now() - from) / 1000).toFixed(1)} s`;
const say = (msg) => console.log(`[reset] ${msg}`);

function notReady(reason) {
  console.error(`\n[reset] NOT READY after ${secs(t0)}: ${reason}`);
  process.exit(1);
}

function listening(port, host = "127.0.0.1", timeoutMs = 800) {
  return new Promise((res) => {
    const s = connect({ port, host });
    const done = (ok) => { s.destroy(); res(ok); };
    s.setTimeout(timeoutMs, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

// One SQL query over HTTP. Returns rows as objects keyed by column name, or throws.
async function sql(query) {
  const r = await fetch(`${LOCAL}/v1/database/${DB}/sql`, {
    method: "POST",
    body: query,
    signal: AbortSignal.timeout(5000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
  const [res] = JSON.parse(text);
  const cols = res.schema.elements.map((e) => e.name?.some ?? e.name);
  return res.rows.map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}

function findSpacetime() {
  const candidates = [
    "spacetime",
    join(homedir(), ".local", "bin", WIN ? "spacetime.exe" : "spacetime"),
    WIN && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "SpacetimeDB", "spacetime.exe") : "",
  ].filter(Boolean);
  for (const bin of candidates) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return bin;
  }
  return null;
}

// Same address logic as boot-avon.mjs: Wi-Fi / Ethernet IPv4 first, and each one must answer
// on both ports.
function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.")) continue;
      const likely = /^(en0|en1|wlan|wlp|eth|Wi-?Fi|Ethernet)/i.test(name) ? 0 : 1;
      out.push({ name, address: a.address, likely });
    }
  }
  return out.sort((a, b) => a.likely - b.likely);
}

async function main() {
  const folder = resolve(process.argv[2] ?? DEFAULT_FOLDER);
  const datasetId = basename(folder);
  if (!existsSync(join(folder, "telemetry.csv"))) notReady(`no EOG data at ${folder}`);

  // 1. SpacetimeDB and the avon database must already be up.
  let from = Date.now();
  const up = await fetch(`${LOCAL}/v1/ping`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false);
  if (!up) {
    console.error("[reset] SpacetimeDB is not answering on 127.0.0.1:3001. run npm run demo first");
    process.exit(1);
  }
  try {
    await sql("SELECT * FROM config");
  } catch {
    console.error("[reset] the avon database does not exist on 127.0.0.1:3001. run npm run demo first");
    process.exit(1);
  }
  const st = findSpacetime();
  if (!st) notReady("the spacetime CLI is not installed. See docs/RUNBOOK-L1.md, section 1.");
  const steps = [["checks", secs(from)]];

  // 2. Clear every simulated fault. Loading the site below clears them too; this makes the phone
  // show 0 faults at once even if the reload then fails.
  from = Date.now();
  say(`clear_fault: spacetime call -s ${LOCAL} ${DB} clear_fault '""'`);
  const clr = spawnSync(st, ["call", "-s", LOCAL, DB, "clear_fault", '""'], { cwd: ROOT, encoding: "utf8" });
  if (clr.status !== 0) {
    say(`clear_fault failed (the reload below clears faults anyway): ${(clr.stderr || clr.stdout || "").trim().split("\n").pop()}`);
  }
  steps.push(["clear faults", secs(from)]);

  // 3. Reload the folder, exactly like boot step 3.
  from = Date.now();
  say(`ingest: node scripts/ingest.mjs ${folder}`);
  const ing = spawnSync(process.execPath, [join(ROOT, "scripts", "ingest.mjs"), folder], { cwd: ROOT, stdio: "inherit" });
  if (ing.status !== 0) notReady("ingest failed (see above). Is a screen loading a site right now? Wait for it, then run this again.");
  steps.push(["reload site", secs(from)]);

  // 4. Check what the screens will now show.
  from = Date.now();
  const problems = [];
  const meta = await sql("SELECT * FROM console_meta");
  if (meta.length !== 1) problems.push(`console_meta has ${meta.length} rows, expected 1`);
  else if (meta[0].dataset_id !== datasetId) problems.push(`the console shows ${meta[0].dataset_id}, expected ${datasetId}`);
  const faults = await sql("SELECT * FROM fault");
  if (faults.length) problems.push(`${faults.length} simulated fault(s) still active: ${faults.map((f) => f.asset_id).join(", ")}`);
  const issues = await sql("SELECT * FROM sensor_issue");
  if (issues.length) problems.push(`${issues.length} sensor issue(s) still listed`);
  const confirmed = await sql("SELECT * FROM confirmation");
  if (confirmed.length) problems.push(`${confirmed.length} plan(s) still marked confirmed by the last judge`);
  const top = await sql("SELECT * FROM alert WHERE rank = 1");
  const want = EXPECTED_TOP[datasetId];
  if (!top.length) problems.push("no alerts: the console has no top card");
  else if (want && top[0].facility_id !== want) problems.push(`the top card is ${top[0].facility_id}, expected ${want}`);
  if (!(await listening(WEB_PORT))) problems.push(`nothing on port ${WEB_PORT}: the dev server is not running (run npm run demo)`);
  steps.push(["verify", secs(from)]);
  if (problems.length) notReady(problems.join("\n  "));

  // 5. Phone URLs.
  const lines = [];
  for (const a of lanAddresses()) {
    lines.push({ ...a, web: await listening(WEB_PORT, a.address), db: await listening(ST_PORT, a.address) });
  }
  const best = lines.find((l) => l.web && l.db);

  console.log(`\n================ READY in ${secs(t0)} ================`);
  for (const [k, v] of steps) console.log(`  ${k.padEnd(14)} ${v}`);
  console.log(`  site           ${datasetId}`);
  console.log(`  top card       ${top[0].facility_id}${want ? "" : " (no expected card on file for this folder)"}`);
  console.log(`  faults         0 active, 0 sensor issues, 0 confirmed plans`);
  console.log("\n  This laptop:   http://localhost:3000/console");
  if (best) {
    console.log(`  Phone 1:       http://${best.address}:3000/attack`);
    console.log(`  Phone console: http://${best.address}:3000/console`);
  } else {
    console.log("  Phone URLs:    none. No LAN address answers on both ports 3000 and 3001.");
    console.log("                 See docs/RUNBOOK-L1.md, section 5.");
  }
  console.log("================================================\n");
}

main().catch((e) => notReady(e?.message ?? String(e)));
