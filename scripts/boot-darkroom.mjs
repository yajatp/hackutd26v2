#!/usr/bin/env node
// One command that boots the Darkroom on Laptop 2 (the box) for the demo:
//   1. checks the spacetime CLI is 2.14.1 (stops before anything else if not)
//   2. SpacetimeDB on 0.0.0.0:3001, only if nothing answers there yet, so phones on the
//      isolated hotspot can reach it. It keeps running in the background after this script ends.
//   3. publish spacetimedb-darkroom as database "darkroom" (keeps its data; only --fresh wipes it)
//   4. enroll the demo team (Dana Commander, Sam Responder, Lee Viewer) with darkroom-seed.mjs
//   5. npm run dev on port 3000 (skip with --no-web), then warm up /box and /witness
//   6. print this laptop's LAN addresses, the /box and /witness URLs, and how to enroll the box screen
//
//   npm run demo:darkroom                    boot everything
//   npm run demo:darkroom -- --no-web        database only (the web server is already running)
//   npm run demo:darkroom -- --fresh         WIPE the database first (new genesis; every screen then needs "Demo reset")
//   npm run demo:darkroom -- --db <name>     a test database instead of "darkroom" (the screens always use "darkroom")
//
// Between rehearsals use node scripts/darkroom-reset.mjs, not --fresh: reset keeps the enrolled screens.
// Ctrl+C stops the web server. SpacetimeDB keeps running; see docs/RUNBOOK-L2.md to stop it.
// Safety: every spacetime call names the local server (-s http://127.0.0.1:3001). The CLI's
// default server is maincloud (public cloud); this script never talks to it.
// Node standard library only; works on Linux, WSL, macOS and Windows.
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir, networkInterfaces, release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { env, platform } from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODULE = join(ROOT, "spacetimedb-darkroom");
const LOCAL = "http://127.0.0.1:3001";
const ST_PORT = 3001;
const WEB_PORT = 3000;
const PIN = "2.14.1";
const WIN = platform === "win32";
const WSL = !WIN && (/microsoft/i.test(release()) || !!env.WSL_DISTRO_NAME);
const DEMO_TEAM = [
  { name: "Dana", role: "Commander" },
  { name: "Sam", role: "Responder" },
  { name: "Lee", role: "Viewer" },
];

const started = [];   // child processes this script stops on Ctrl+C (only the web server)
const t0 = Date.now();
const secs = (from) => `${((Date.now() - from) / 1000).toFixed(1)} s`;
const say = (msg) => console.log(`[darkroom] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const USAGE = "usage: node scripts/boot-darkroom.mjs [--db <name>] [--fresh] [--no-web]";

function fail(msg) {
  console.error(`\n[darkroom] STOPPED: ${msg}`);
  stopAll();
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { db: "darkroom", fresh: false, web: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fresh") opts.fresh = true;
    else if (a === "--no-web") opts.web = false;
    else if (a === "--db") {
      opts.db = argv[++i];
      if (!opts.db || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(opts.db)) fail(`--db needs a database name like darkroom or darkroom-test (lowercase letters, digits, dashes)\n  ${USAGE}`);
    } else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else fail(`unknown option ${a}\n  ${USAGE}`);
  }
  return opts;
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

async function httpOk(url, timeoutMs = 60_000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}

const spacetimeAnswers = () => httpOk(`${LOCAL}/v1/ping`, 2_000);

async function waitFor(what, check, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await sleep(250);
  }
  fail(`${what} did not come up within ${timeoutMs / 1000} s`);
}

// IPv4 addresses other devices could use: not internal, not 127.x. Wi-Fi / Ethernet first.
function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      const v4 = a.family === "IPv4" || a.family === 4;
      if (!v4 || a.internal || a.address.startsWith("127.")) continue;
      const likely = /^(en0|en1|wlan|wlp|eth|Wi-?Fi|WLAN|Ethernet)/i.test(name) ? 0 : 1;
      out.push({ name, address: a.address, likely });
    }
  }
  return out.sort((a, b) => a.likely - b.likely);
}

// Only --version is run here, so a wrong CLI stops the boot before it touches anything.
function findSpacetime() {
  const candidates = [
    "spacetime",
    join(homedir(), ".local", "bin", WIN ? "spacetime.exe" : "spacetime"),
    WIN && env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "SpacetimeDB", "spacetime.exe") : "",
  ].filter(Boolean);
  for (const bin of candidates) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return { bin, version: /tool version (\S+?);/.exec(r.stdout ?? "")?.[1] ?? "unknown" };
  }
  return null;
}

// Every spacetime call after the version check and `start` goes through here, always with -s LOCAL.
function spacetimeLocal(bin, label, [command, ...rest], { quiet = false } = {}) {
  const args = [command, "-s", LOCAL, ...rest];
  const from = Date.now();
  if (!quiet) say(`${label}: spacetime ${args.join(" ")}`);
  const r = spawnSync(bin, args, { cwd: ROOT, stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"], encoding: "utf8" });
  if (r.error) fail(`${label} could not start: ${r.error.message}`);
  const err = (r.stderr ?? "").split("\n").filter((l) => l.trim() && !l.startsWith("WARNING")).join(" ");
  return { ok: r.status === 0, took: secs(from), err };
}

// Runs a node script to completion with its output shown.
function runNode(label, script, args = []) {
  const from = Date.now();
  say(`${label}: node ${[script, ...args].join(" ")}`);
  const r = spawnSync(process.execPath, [join(ROOT, script), ...args], { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
  if (r.error) fail(`${label} could not start: ${r.error.message}`);
  return { ok: r.status === 0, took: secs(from) };
}

async function sql(db, query) {
  const res = await fetch(`${LOCAL}/v1/database/${db}/sql`, { method: "POST", body: query });
  if (!res.ok) throw new Error(`SQL on ${db}: HTTP ${res.status} ${await res.text()}`);
  const [result] = await res.json();
  return result.rows;
}

async function members(db) {
  // An identity comes back as a one-element array holding "0x<hex>".
  return (await sql(db, "SELECT identity, name, role, active FROM member")).map(([id, name, role, active]) => ({
    identity: String(Array.isArray(id) ? id[0] : id).replace(/^0x/, "").toLowerCase(),
    name, role, active,
  }));
}

// darkroom-seed.mjs only writes to "darkroom". For a test database this does the same job:
// one identity per demo member from the local server, token saved (mode 600, never printed)
// in ~/.darkroom/tokens-<db>/, then the owner-only seed_member reducer as the CLI identity.
async function seedTeam(bin, db) {
  const dir = join(homedir(), ".darkroom", `tokens-${db}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  say(`enroll demo team in ${db} (tokens in ${dir}, never printed)`);
  for (const { name, role } of DEMO_TEAM) {
    const file = join(dir, `${name}.json`);
    let saved = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    if (!saved || typeof saved.token !== "string" || typeof saved.identity !== "string") {
      const res = await fetch(`${LOCAL}/v1/identity`, { method: "POST" });
      if (!res.ok) fail(`cannot create an identity: HTTP ${res.status}`);
      const fresh = await res.json();
      saved = { name, role, identity: fresh.identity.toLowerCase(), token: fresh.token, server: LOCAL, db };
      writeFileSync(file, JSON.stringify(saved, null, 2), { mode: 0o600 });
      chmodSync(file, 0o600);
    }
    const hex = saved.identity.replace(/^0x/, "").toLowerCase();
    const have = (await members(db)).find((m) => m.identity === hex);
    if (have && have.active && have.name === name && have.role === role) {
      console.log(`  ${name.padEnd(10)} ${role.padEnd(10)} ${hex.slice(0, 8)}…  already a member`);
      continue;
    }
    const r = spacetimeLocal(bin, "seed", ["call", db, "seed_member", JSON.stringify(`0x${hex}`), JSON.stringify(name), JSON.stringify(role)], { quiet: true });
    if (!r.ok) fail(`seed_member ${name} failed: ${r.err}`);
    console.log(`  ${name.padEnd(10)} ${role.padEnd(10)} ${hex.slice(0, 8)}…  added`);
  }
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
  const opts = parseArgs(process.argv.slice(2));
  const { db } = opts;
  const timings = [];

  // 0. Checks before touching anything. The CLI version comes first.
  const st = findSpacetime();
  if (!st) fail(`the spacetime CLI is not installed. Install SpacetimeDB ${PIN}: see docs/RUNBOOK-L2.md, section 1.`);
  if (st.version !== PIN) {
    fail(`spacetime is ${st.version}, the Darkroom needs ${PIN}.\n  Fix: spacetime version install ${PIN} && spacetime version use ${PIN}`);
  }
  say(`spacetime ${st.version} (${st.bin}), database "${db}"${opts.fresh ? " (--fresh: it will be WIPED)" : ""}`);
  if (!existsSync(join(ROOT, "node_modules"))) fail("node_modules is missing. Run npm ci first (it needs the internet: do it before joining the Darkroom hotspot).");
  let webRunning = false;
  if (opts.web && (await listening(WEB_PORT))) {
    // A rerun while the box is up: reuse the web server if it serves /box, otherwise stop.
    if (!(await httpOk(`http://127.0.0.1:${WEB_PORT}/box`, 30_000))) {
      fail(`port ${WEB_PORT} is in use by something that does not serve /box (the Avon dev server?). Stop it and run this again.`);
    }
    webRunning = true;
  }

  // 1. SpacetimeDB on 0.0.0.0:3001, unless one already answers.
  let from = Date.now();
  if (await spacetimeAnswers()) {
    say(`SpacetimeDB already running on port ${ST_PORT}; not starting another`);
  } else if (await listening(ST_PORT)) {
    fail(`port ${ST_PORT} is in use by something that is not SpacetimeDB. Stop it and run this again.`);
  } else {
    mkdirSync(join(homedir(), ".darkroom"), { recursive: true });
    const log = join(homedir(), ".darkroom", "spacetime.log");
    const fd = openSync(log, "a");
    say(`starting SpacetimeDB on 0.0.0.0:${ST_PORT} in the background (log: ${log})`);
    // Detached so it outlives this script and Ctrl+C: the log and the phones' connections stay up.
    const c = spawn(st.bin, ["start", "--listen-addr", "0.0.0.0:3001"], {
      cwd: ROOT, stdio: ["ignore", fd, fd], detached: true, windowsHide: true,
    });
    closeSync(fd);
    let exited = null;
    c.on("exit", (code) => { exited = code; });
    c.unref();
    await waitFor("SpacetimeDB", async () => {
      if (exited !== null) fail(`SpacetimeDB exited (code ${exited}). See ${log}`);
      return spacetimeAnswers();
    }, 60_000);
    say(`SpacetimeDB answers on ${LOCAL} (pid ${c.pid})`);
  }
  timings.push(["SpacetimeDB up", secs(from)]);

  // 2. Publish. Only --fresh wipes the data; otherwise the log survives every boot.
  const publishArgs = ["publish", "--module-path", MODULE, "-y", db];
  if (opts.fresh) {
    if (db === "darkroom") say('--fresh on "darkroom": the incident log and every enrolled screen are wiped');
    publishArgs.splice(3, 0, "--delete-data");
  }
  const pub = spacetimeLocal(st.bin, "publish", publishArgs);
  if (!pub.ok) {
    fail(
      "publish failed (see above).\n" +
      "  If it says you are not logged in, see docs/RUNBOOK-L2.md section 1 (a local identity, no internet needed).\n" +
      "  If it says the schema change needs a data wipe, that is a decision for the team: rerun with --fresh.",
    );
  }
  timings.push([`publish ${db}`, pub.took]);

  // 3. The demo team.
  from = Date.now();
  if (db === "darkroom") {
    const seed = runNode("seed", join("scripts", "darkroom-seed.mjs"));
    if (!seed.ok) {
      fail(
        "darkroom-seed.mjs failed (see above).\n" +
        "  It talks to the server nickname avonlocal. If that is missing on this laptop, add it once:\n" +
        "    spacetime server add --url http://127.0.0.1:3001 avonlocal\n" +
        '  "owner only" means this CLI identity did not publish "darkroom": see docs/RUNBOOK-L2.md.',
      );
    }
  } else {
    await seedTeam(st.bin, db);
  }
  timings.push(["enroll demo team", secs(from)]);
  const log = (await sql(db, "SELECT seq FROM event_log")).map((r) => Number(r[0])).sort((a, b) => a - b);
  const team = (await members(db)).filter((m) => m.active);
  say(`${db}: ${log.length} log entr${log.length === 1 ? "y" : "ies"}${log.length ? ` (#${log[0]}..#${log[log.length - 1]})` : ""}, ${team.length} active members (${team.map((m) => `${m.name} ${m.role}`).join(", ")})`);

  // 4. The web pages on port 3000. -p 3000 makes Next stop instead of quietly moving to another port.
  if (!opts.web) {
    say("--no-web: not starting the web server");
  } else if (webRunning) {
    say(`web server already running on port ${WEB_PORT}; not starting another`);
  } else {
    from = Date.now();
    say(`starting npm run dev on port ${WEB_PORT}`);
    const dev = spawn(WIN ? "npm.cmd" : "npm", ["run", "dev", "--", "-p", String(WEB_PORT)], {
      cwd: ROOT, stdio: "inherit", detached: !WIN, shell: WIN,
    });
    dev.on("exit", (code) => { if (!shuttingDown) fail(`npm run dev exited (code ${code})`); });
    started.push(dev);
    await waitFor("the dev server", () => listening(WEB_PORT), 60_000);
    // First request to each page compiles it; do that now so a judge's phone is not the one waiting.
    for (const page of ["/box", "/witness"]) {
      if (!(await httpOk(`http://127.0.0.1:${WEB_PORT}${page}`))) fail(`${page} did not load`);
    }
    timings.push(["dev server + pages warm", secs(from)]);
  }

  // 5. Where the screens go. Check each address really reaches both ports.
  const lines = [];
  for (const a of lanAddresses()) {
    lines.push({ ...a, web: await listening(WEB_PORT, a.address), st: await listening(ST_PORT, a.address) });
  }

  console.log("\n============== DARKROOM IS UP ==============");
  for (const [k, v] of timings) console.log(`  ${k.padEnd(24)} ${v}`);
  console.log(`  ${"total".padEnd(24)} ${secs(t0)}`);
  console.log(`\n  This laptop:  http://localhost:${WEB_PORT}/box`);
  if (lines.length === 0) {
    console.log("  No LAN address. Join the Darkroom hotspot, then run this again. See docs/RUNBOOK-L2.md.");
  }
  for (const l of lines) {
    const st3001 = l.st ? "3001 ok" : "3001 NOT reachable (SpacetimeDB on 127.0.0.1 only? stop it and run this again)";
    const web3000 = l.web ? "3000 ok" : opts.web ? "3000 NOT reachable (firewall?)" : "3000 not answering (--no-web)";
    console.log(`\n  ${l.name} ${l.address}   [${web3000}; ${st3001}]`);
    console.log(`    Box screen:     http://${l.address}:${WEB_PORT}/box`);
    console.log(`    Witness phones: http://${l.address}:${WEB_PORT}/witness`);
  }
  if (WSL) {
    const wslIp = lines[0]?.address ?? "<WSL IP from hostname -I>";
    console.log("\n  WSL2: phones cannot reach the addresses above directly. On Windows (admin PowerShell), forward");
    console.log(`  ports 3000 and 3001 to ${wslIp} (netsh portproxy, docs/RUNBOOK-L2.md section 3) and give the`);
    console.log("  phones the Windows Wi-Fi IPv4 from ipconfig instead.");
  }
  console.log("\n  Enroll the box screen once per browser, so it can write:");
  console.log(`    1. Open http://localhost:${WEB_PORT}/box. It says it cannot write and shows its identity.`);
  console.log('    2. node scripts/darkroom-seed.mjs --add <identity from /box> --name "Box screen" --role Commander');
  if (db !== "darkroom") console.log(`    (The screens and darkroom-seed.mjs always use "darkroom". "${db}" is a test database.)`);
  if (opts.fresh) console.log('\n  --fresh: press "Demo reset" on every open /box and /witness, or they show TAMPERING AT #0.');
  console.log(`\n  SpacetimeDB keeps running after this script.${started.length ? " Ctrl+C stops the web server." : ""}`);
  console.log("============================================\n");

  if (started.length === 0) process.exit(0);
}

let shuttingDown = false;
for (const sig of WIN ? ["SIGINT", "SIGTERM"] : ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    shuttingDown = true;
    say("stopping the web server (SpacetimeDB keeps running)");
    stopAll();
    process.exit(0);
  });
}
process.on("exit", () => { shuttingDown = true; stopAll(); });

main().catch((e) => fail(e?.stack ?? String(e)));
