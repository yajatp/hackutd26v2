#!/usr/bin/env node
// One command that boots the Avon side on Laptop 1 for the demo, from a cold start:
//   1. SpacetimeDB on 0.0.0.0:3001 (only if nothing listens there yet), so phones can reach it
//   2. publish the module in spacetimedb/ as database "avon" (keeps its data: no --delete-data)
//   3. ingest one EOG folder (default: mock_test) through the same reducers the console uses
//   4. npm run dev on port 3000, then warm up /console and /attack
//   5. print this laptop's LAN address and the two phone URLs
//
//   npm run demo:avon                       (mock_test folder)
//   npm run demo:avon -- <folder>           (any folder with network.json, ops.json, telemetry.csv)
//
// Ctrl+C stops what this script started. A SpacetimeDB that was already running is left alone.
// Safety: every spacetime call names the local server (-s http://127.0.0.1:3001). The CLI's
// default server is maincloud (public cloud); this script never talks to it.
// Node standard library only; works on macOS, Linux and Windows.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { connect } from "node:net";
import { homedir, networkInterfaces, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL = "http://127.0.0.1:3001";
const ST_PORT = 3001;
const WEB_PORT = 3000;
const PIN = "2.14.1";
const DEFAULT_FOLDER = join(ROOT, "..", "eog-data", "history", "mock_test_2026-10-10T1530");
const WIN = process.platform === "win32";

const started = [];   // child processes this script owns
const t0 = Date.now();
const secs = (from) => `${((Date.now() - from) / 1000).toFixed(1)} s`;
const say = (msg) => console.log(`[avon] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg) {
  console.error(`\n[avon] STOPPED: ${msg}`);
  stopAll();
  process.exit(1);
}

// Is something accepting TCP connections on host:port?
function listening(port, host = "127.0.0.1", timeoutMs = 800) {
  return new Promise((res) => {
    const s = connect({ port, host });
    const done = (ok) => { s.destroy(); res(ok); };
    s.setTimeout(timeoutMs, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

async function waitFor(what, check, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await sleep(250);
  }
  fail(`${what} did not come up within ${timeoutMs / 1000} s`);
}

async function httpOk(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    return r.ok;
  } catch {
    return false;
  }
}

// Wi-Fi / Ethernet IPv4 addresses, most likely first.
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

function findSpacetime() {
  const candidates = [
    "spacetime",
    join(homedir(), ".local", "bin", WIN ? "spacetime.exe" : "spacetime"),
    WIN && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "SpacetimeDB", "spacetime.exe") : "",
  ].filter(Boolean);
  for (const bin of candidates) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return { bin, version: /tool version (\S+?);/.exec(r.stdout)?.[1] ?? "unknown" };
  }
  return null;
}

// Runs a command to completion with its output shown, and returns how long it took.
function run(label, cmd, args) {
  const from = Date.now();
  say(`${label}: ${[cmd, ...args].join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: false });
  if (r.error) fail(`${label} could not start: ${r.error.message}`);
  if (r.status !== 0) return { ok: false, took: secs(from) };
  return { ok: true, took: secs(from) };
}

function stopAll() {
  for (const c of started.reverse()) {
    if (c.exitCode !== null || c.killed) continue;
    try {
      if (WIN) spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
      else process.kill(-c.pid, "SIGTERM");   // the whole process group (npm -> next)
    } catch { /* already gone */ }
  }
}

async function main() {
  const folder = resolve(process.argv[2] ?? DEFAULT_FOLDER);
  const timings = [];

  // 0. Checks before touching anything.
  if (!existsSync(join(folder, "telemetry.csv"))) {
    fail(
      `no EOG data at ${folder}\n` +
      `  Get it once (next to this repo):  git clone https://github.com/nihaal419/HackUTD-ZeroDay ../eog-data\n` +
      `  Or pass a folder:                 npm run demo:avon -- <folder with network.json, ops.json, telemetry.csv>`,
    );
  }
  if (!existsSync(join(ROOT, "node_modules"))) fail("node_modules is missing. Run npm ci first.");
  const st = findSpacetime();
  if (!st) fail("the spacetime CLI is not installed. See docs/RUNNING.md.");
  if (st.version !== PIN) {
    fail(`spacetime is ${st.version}, Avon needs ${PIN}.\n  Fix: spacetime version install ${PIN} && spacetime version use ${PIN}`);
  }
  say(`spacetime ${st.version} (${st.bin}), data folder ${folder}`);
  // Before changing anything: a busy port 3000 usually means Avon is already up (a second run
  // would re-ingest under a live demo), or another dev server would push Next to a wrong port.
  if (await listening(WEB_PORT)) {
    fail(`port ${WEB_PORT} is already in use. Avon may already be running; if not, stop that server and run this again.`);
  }

  // 1. SpacetimeDB on 0.0.0.0:3001, unless one is already there.
  let from = Date.now();
  if (await listening(ST_PORT)) {
    say(`SpacetimeDB already listening on port ${ST_PORT}; using it`);
  } else {
    const log = join(tmpdir(), "avon-spacetime.log");
    const fd = openSync(log, "a");
    say(`starting SpacetimeDB on 0.0.0.0:${ST_PORT} (log: ${log})`);
    const c = spawn(st.bin, ["start", "--listen-addr", `0.0.0.0:${ST_PORT}`], {
      cwd: ROOT, stdio: ["ignore", fd, fd], detached: !WIN,
    });
    c.on("exit", (code) => { if (!shuttingDown) fail(`SpacetimeDB exited (code ${code}). See ${log}`); });
    started.push(c);
    await waitFor("SpacetimeDB", () => httpOk(`${LOCAL}/v1/ping`), 30_000);
  }
  timings.push(["SpacetimeDB up", secs(from)]);

  // 2. Publish. Never --delete-data: the database keeps its rows across boots.
  const pub = run("publish", st.bin, ["publish", "-s", LOCAL, "--module-path", "spacetimedb", "-y", "avon"]);
  if (!pub.ok) {
    fail(
      "publish failed (see above). If it says the schema change needs a data wipe, that is a decision for\n" +
      "  the team, not this script: spacetime publish -s http://127.0.0.1:3001 --module-path spacetimedb --delete-data -y avon",
    );
  }
  timings.push(["publish avon", pub.took]);

  // 3. Ingest the folder.
  const ing = run("ingest", process.execPath, [join(ROOT, "scripts", "ingest.mjs"), folder]);
  if (!ing.ok) fail("ingest failed (see above)");
  timings.push(["ingest", ing.took]);

  // 4. The web pages on port 3000. -p 3000 makes Next stop instead of quietly moving to another port.
  from = Date.now();
  say(`starting npm run dev on port ${WEB_PORT}`);
  const dev = spawn(WIN ? "npm.cmd" : "npm", ["run", "dev", "--", "-p", String(WEB_PORT)], {
    cwd: ROOT, stdio: "inherit", detached: !WIN, shell: WIN,
  });
  dev.on("exit", (code) => { if (!shuttingDown) fail(`npm run dev exited (code ${code})`); });
  started.push(dev);
  await waitFor("the dev server", () => listening(WEB_PORT), 60_000);
  // First request to each page compiles it; do that now so the phone is not the one waiting.
  for (const page of ["/console", "/attack"]) {
    if (!(await httpOk(`http://127.0.0.1:${WEB_PORT}${page}`))) fail(`${page} did not load`);
  }
  timings.push(["dev server + pages warm", secs(from)]);

  // 5. Where the phones go. Check each address really reaches both ports.
  const addrs = lanAddresses();
  const lines = [];
  for (const a of addrs) {
    const web = await listening(WEB_PORT, a.address);
    const db = await listening(ST_PORT, a.address);
    lines.push({ ...a, web, db });
  }
  const best = lines.find((l) => l.web && l.db);

  console.log("\n================ AVON IS UP ================");
  for (const [k, v] of timings) console.log(`  ${k.padEnd(24)} ${v}`);
  console.log(`  ${"total".padEnd(24)} ${secs(t0)}`);
  console.log("\n  This laptop:   http://localhost:3000/console");
  if (best) {
    console.log(`  Phone 1:       http://${best.address}:3000/attack`);
    console.log(`  Phone console: http://${best.address}:3000/console`);
  } else {
    console.log("  Phone URLs:    none. This laptop has no LAN address both phones' ports answer on.");
    console.log("                 Join the hotspot / Wi-Fi, then run this again. See docs/RUNNING.md.");
  }
  for (const l of lines) {
    const note = l.web && l.db ? "ok" : `${l.web ? "" : " port 3000 not reachable"}${l.db ? "" : " port 3001 not reachable (SpacetimeDB on 127.0.0.1 only? stop it and rerun)"}`;
    console.log(`    ${l.name.padEnd(10)} ${l.address.padEnd(16)} ${note}`);
  }
  console.log("\n  Faults on /attack are SIMULATED. Ctrl+C stops what this script started.");
  console.log("============================================\n");
}

let shuttingDown = false;
for (const sig of WIN ? ["SIGINT", "SIGTERM"] : ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    shuttingDown = true;
    say("stopping");
    stopAll();
    process.exit(0);
  });
}
process.on("exit", () => { shuttingDown = true; stopAll(); });

main().catch((e) => fail(e?.stack ?? String(e)));
