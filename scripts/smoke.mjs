#!/usr/bin/env node
// Golden-path smoke test against the real reducers, on two throwaway
// databases on the LOCAL server. One PASS/FAIL line per step, then SMOKE PASSED or SMOKE FAILED (n).
//
//   npm run smoke                          one run on avon-smoke + darkroom-smoke
//   npm run smoke -- --runs 3              three runs in a row, each from a clean publish
//   npm run smoke -- --folder <dir>        another EOG data folder
//   --avon-db <name> --darkroom-db <name>  other databases. The real 'avon' and 'darkroom' are
//                                          only touched when named here, and never wiped.
//
// 1 publish both modules (--delete-data on the smoke databases)  2 ingest the folder, check the
// top alert  3 inject_fault fake_flat on its tank  4 evidence ref (lib/evidence.ts)  5 Darkroom:
// Commander opens an incident, Responder logs the evidence  6 root delete: a subscribed client and
// scripts/verify.mjs both say ROLLBACK DETECTED  7 clear_fault ''.
// The two members' tokens live in a temp dir that is deleted at the end. They are never printed.
// Exit code: 0 passed, 1 failed.

import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { tsImport } from "tsx/esm/api";
import { HTTP, SERVER, WS, isProtected, parseArgs, publishArgs, spacetimeArgs } from "./smoke/safety.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const exec = promisify(execFile);
let lib; // scripts/smoke/lib.ts, loaded in main() so a broken import still ends in SMOKE FAILED

// What the golden path must show on folders we know (lib/eog/alerts.test.ts, planner.test.ts).
const KNOWN = { "mock_test_2026-10-10T1530": { asset: "S5_PUMP_C", hours: 2.05, cost: 905 } };
const NAMES = { Commander: "Smoke Commander", Responder: "Smoke Responder" };
const DELETE_COUNT = 3; // as scripts/tamper.mjs
const EVIDENCE = /Physics says .+ Sensor says 0\. Off for \d+ min\./;

const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function expect(ok, text) {
  if (!ok) throw new Error(text);
}

function message(e) {
  return e instanceof Error ? e.message : String(e?.message ?? e);
}

function within(ms, label, promise) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${secs(ms)}: ${label}`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function waitFor(fn, label, ms = 10000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out after ${secs(ms)} waiting for ${label}`);
    await sleep(25);
  }
}

// spacetime CLI, always -s http://127.0.0.1:3001 (safety.mjs builds every argument list; checked again here).
async function spacetime(args) {
  if (args[1] !== "-s" || args[2] !== SERVER) throw new Error(`refusing spacetime ${args.join(" ")}: not -s ${SERVER}`);
  try {
    const { stdout } = await exec("spacetime", args, { cwd: root, maxBuffer: 64 * 1024 * 1024, timeout: 300000 });
    return stdout;
  } catch (e) {
    const err = String(e.stderr ?? "").split("\n").filter((l) => l.trim() && !l.startsWith("WARNING")).slice(-3).join(" ");
    throw new Error(`spacetime ${args[0]} failed: ${err || message(e)}`);
  }
}

// Anonymous HTTP SQL on the local server; rows as objects keyed by column name.
async function sql(db, query) {
  const res = await within(10000, `SQL on ${db}`, fetch(`${HTTP}/v1/database/${db}/sql`, { method: "POST", body: query }));
  if (!res.ok) throw new Error(`SQL on ${db}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const [result] = await res.json();
  const names = result.schema.elements.map((e) => e.name.some);
  return result.rows.map((r) => Object.fromEntries(names.map((n, i) => [n, r[i]])));
}

function connectDarkroom(db, token) {
  return within(10000, `connect to ${db}`, new Promise((ok, fail) => {
    let b = lib.DarkroomConnection.builder().withUri(WS).withDatabaseName(db);
    if (token) b = b.withToken(token);
    b.onConnect((c) => ok(c)).onConnectError((_c, e) => fail(new Error(`cannot connect to ${db}: ${message(e)}`))).build();
  }));
}

function subscribe(c) {
  const t = lib.darkroomTables;
  return within(10000, "subscription", new Promise((ok) => {
    c.subscriptionBuilder().onApplied(() => ok()).subscribe([t.eventLog, t.chainHead, t.member]);
  }));
}

const events = (c) => [...c.db.eventLog.iter()].map(lib.rowToEvent).sort((a, b) => a.seq - b.seq);

// As a screen does it: send the head this client knows; retry if another client wrote first.
async function append(c, incidentId, type, payload) {
  for (let attempt = 0; ; attempt++) {
    const h = [...c.db.chainHead.iter()][0];
    try {
      await within(10000, `append_event ${type}`, c.reducers.appendEvent({
        expectedSeq: h ? h.seq + 1n : 0n, expectedPrev: h ? h.hash : lib.GENESIS_PREV,
        incidentId, type, payloadJson: JSON.stringify(payload),
      }));
      return;
    } catch (e) {
      if (attempt < 10 && message(e).includes("stale head")) { await sleep(50); continue; }
      throw e;
    }
  }
}

// scripts/verify.mjs as the third laptop runs it. Exit 1 means rollback or tampering.
async function verify(db, witnessFile) {
  const args = [join(root, "scripts/verify.mjs"), "--db", db, "--witness", witnessFile];
  try {
    const { stdout } = await exec(process.execPath, args, { cwd: root, timeout: 60000 });
    return { code: 0, line: stdout.split("\n")[0] };
  } catch (e) {
    if (typeof e.code === "number") return { code: e.code, line: String(e.stdout ?? "").split("\n")[0] || String(e.stderr ?? "").trim() };
    throw e;
  }
}

// ---- the seven steps ---------------------------------------------------------------------

async function publish(ctx) {
  const { avonDb, darkroomDb } = ctx.o;
  await Promise.all([
    spacetime(publishArgs(join(root, "spacetimedb"), avonDb)),
    spacetime(publishArgs(join(root, "spacetimedb-darkroom"), darkroomDb)),
  ]);
  const log = await sql(darkroomDb, "SELECT seq, type FROM event_log");
  const cfg = await sql(avonDb, "SELECT * FROM config");
  const fresh = (db) => (isProtected(db) ? `${db} updated in place (real database, not wiped)` : `${db} published fresh (--delete-data)`);
  if (!isProtected(darkroomDb)) expect(log.length === 1 && log[0].type === "member_added", `${darkroomDb} should start with 1 log entry, has ${log.length}`);
  if (!isProtected(avonDb)) expect(cfg.length === 0, `${avonDb} should start empty, config has ${cfg.length} rows`);
  return `${fresh(avonDb)}, ${fresh(darkroomDb)} on ${SERVER}`;
}

async function ingest(ctx) {
  const { avonDb, folder } = ctx.o;
  const read = (f) => readFile(join(folder, f), "utf8");
  const [network, ops, telemetry] = await Promise.all([read("network.json"), read("ops.json"), read("telemetry.csv")]);
  ctx.datasetId = basename(folder);
  ctx.avon = await within(10000, `connect to ${avonDb}`, lib.openAvon(WS, avonDb));
  const t = await within(120000, "load_dataset + ingest_batch + finish_ingest", lib.sendDataset(ctx.avon, { network, ops, telemetry }, ctx.datasetId));
  const [meta] = await sql(avonDb, "SELECT * FROM console_meta");
  expect(meta && meta.dataset_id === ctx.datasetId, `console_meta dataset_id is ${meta?.dataset_id}, expected ${ctx.datasetId}`);
  const alerts = (await sql(avonDb, "SELECT rank, alert_json FROM alert")).sort((a, b) => a.rank - b.rank);
  expect(alerts.length > 0, `${ctx.datasetId}: no ongoing alerts, so no first pump failure (${t.rows} rows ingested)`);
  const top = JSON.parse(alerts[0].alert_json);
  const asset = top.event.asset_id;
  expect(top.event.category === "pump_failure" && top.fix, `top alert is ${top.event.category} ${asset}, not a pump failure with a plan`);
  const hours = top.hours_to_limit;
  const cost = top.fix.plan.cost;
  const known = KNOWN[ctx.datasetId];
  if (known) {
    expect(asset === known.asset, `top alert is ${asset}, expected ${known.asset}`);
    expect(Math.abs(hours - known.hours) < 0.1, `${asset}: ${hours} h to limit, expected about ${known.hours}`);
    expect(cost === known.cost, `${asset}: plan cost ${cost}, expected ${known.cost}`);
  } else {
    expect(Number.isFinite(hours) && Number.isFinite(cost), `${asset}: hours ${hours}, cost ${cost}`);
  }
  const issues = await sql(avonDb, "SELECT * FROM sensor_issue");
  expect(issues.length === 0, `sensor_issue has ${issues.length} rows on clean data, expected 0`);
  ctx.top = top;
  return `${ctx.datasetId} -> ${avonDb} (${t.rows} rows, ${t.batches} batches); top alert ${asset} pump_failure, `
    + `${hours.toFixed(2)} h to limit, plan "${top.fix.label}" cost ${cost}${known ? " as expected" : ""}; sensor_issue empty`;
}

async function fakeFlat(ctx) {
  const db = ctx.o.avonDb;
  const tank = ctx.top.facility.tank.id;
  await within(30000, "inject_fault", ctx.avon.reducers.injectFault({ assetId: tank, kind: "fake_flat" }));
  const faults = await sql(db, "SELECT * FROM fault");
  expect(faults.length === 1 && faults[0].asset_id === tank && faults[0].kind === "fake_flat", `fault table: ${JSON.stringify(faults.map((f) => [f.asset_id, f.kind]))}`);
  const issues = (await sql(db, "SELECT rank, issue_json FROM sensor_issue")).sort((a, b) => a.rank - b.rank);
  const row = issues.find((r) => JSON.parse(r.issue_json).asset_id === tank);
  expect(row, `sensor_issue has no row for ${tank} (${issues.length} rows)`);
  const issue = JSON.parse(row.issue_json);
  expect(issue.state === "lying", `${tank} is ${issue.state}, expected lying`);
  expect(issue.simulated === true, `${tank} simulated is ${issue.simulated}, expected true`);
  expect(EVIDENCE.test(issue.evidence), `evidence "${issue.evidence}" does not match ${EVIDENCE}`);
  const [meta] = await sql(db, "SELECT now FROM console_meta");
  ctx.issue = issue;
  ctx.now = meta.now;
  return `inject_fault fake_flat on ${tank}: sensor_issue #${row.rank} ${tank} ${issue.metric} lying, simulated true: "${issue.evidence}"`;
}

async function evidence(ctx) {
  const ev = lib.evidenceForIssue(ctx.issue, ctx.datasetId, ctx.now);
  expect(ev, "evidenceForIssue returned null");
  expect(/^AV-[0-9A-F]{4}-[0-9A-F]{4}$/.test(ev.ref), `ref ${ev.ref} is not AV-XXXX-XXXX`);
  expect(lib.refMatches(ev.ref, ev.hash), `ref ${ev.ref} does not match fingerprint ${ev.hash}`);
  expect(ev.record.kind === "sensor_disagrees_with_physics" && ev.record.simulated === true, `record ${JSON.stringify(ev.record)}`);
  expect(lib.evidenceForIssue(ctx.issue, ctx.datasetId, ctx.now).hash === ev.hash, "the same issue gave a different fingerprint");
  ctx.evidence = ev;
  return `${ev.ref} (sha256 ${ev.hash.slice(0, 16)}…) from lib/evidence.ts evidenceForIssue: ${ev.record.asset_id} ${ev.record.state}, ${ev.record.dataset} at data time ${ev.record.data_ts}`;
}

async function darkroom(ctx) {
  const db = ctx.o.darkroomDb;
  const team = [];
  for (const role of ["Commander", "Responder"]) {
    const res = await within(10000, "new identity", fetch(`${HTTP}/v1/identity`, { method: "POST" }));
    expect(res.ok, `cannot create an identity: HTTP ${res.status}`);
    const { identity, token } = await res.json();
    const hex = String(identity).replace(/^0x/, "").toLowerCase();
    const file = join(ctx.dir, `${role}.json`);
    writeFileSync(file, JSON.stringify({ role, identity: hex, token }), { mode: 0o600 });
    team.push({ role, name: NAMES[role], identity: hex, file });
  }
  for (const m of team) {
    await spacetime(spacetimeArgs("call", db, "seed_member", JSON.stringify(`0x${m.identity}`), JSON.stringify(m.name), JSON.stringify(m.role)));
  }
  const tokenOf = (m) => JSON.parse(readFileSync(m.file, "utf8")).token;
  const [cmd, resp, witness] = await Promise.all([connectDarkroom(db, tokenOf(team[0])), connectDarkroom(db, tokenOf(team[1])), connectDarkroom(db)]);
  ctx.conns.push(cmd, resp, witness);
  await Promise.all([cmd, resp, witness].map(subscribe));
  expect(cmd.identity.toHexString().replace(/^0x/, "") === team[0].identity, "Commander connected as another identity");
  expect(resp.identity.toHexString().replace(/^0x/, "") === team[1].identity, "Responder connected as another identity");

  const tank = ctx.issue.asset_id;
  await within(10000, "open_incident", cmd.reducers.openIncident({ title: `Smoke: ${tank} level sensor disagrees with physics` }));
  const opened = await waitFor(() => events(resp).find((e) => e.type === "incident_opened"), "the incident on the Responder's screen");
  const ev = ctx.evidence;
  await append(resp, opened.incident_id, "evidence_imported", { ref: ev.ref, fingerprint: ev.hash, source: "Avon console", note: `${tank} ${ctx.issue.state} (simulated)` });
  const entry = await waitFor(() => events(witness).find((e) => e.type === "evidence_imported"), "the evidence entry on the witness");
  const want = `${NAMES.Responder}|Responder|${team[1].identity}`;
  expect(entry.actor === want, `actor is ${entry.actor}, expected ${want}`);
  expect(entry.incident_id === opened.incident_id, `entry is on ${entry.incident_id}, expected ${opened.incident_id}`);
  expect(entry.payload.ref === ev.ref && entry.payload.fingerprint === ev.hash, `payload ${JSON.stringify(entry.payload)}`);
  const st = lib.chainStatus(events(witness), null);
  expect(st.kind === "verified", `the log does not verify: ${st.text}`);
  ctx.witness = witness;
  return `${opened.incident_id} opened by ${NAMES.Commander}; evidence_imported #${entry.seq} ref ${entry.payload.ref}, actor ${entry.actor}; ${st.text} (${st.count} entries)`;
}

async function tamper(ctx) {
  const db = ctx.o.darkroomDb;
  const seen = events(ctx.witness);
  const held = lib.advanceWitness(seen, null); // what a witness screen keeps
  expect(held && held.seq === seen[seen.length - 1].seq, "the witness did not advance to the newest entry");
  const witnessFile = join(ctx.dir, "verify-witness.json");
  const first = await verify(db, witnessFile);
  expect(first.code === 0 && first.line === "LOG VERIFIED", `scripts/verify.mjs before the delete: ${first.line} (exit ${first.code})`);

  // The root-delete drill, exactly as scripts/tamper.mjs does it, on this database.
  const before = (await sql(db, "SELECT seq FROM event_log")).map((r) => Number(r.seq)).sort((a, b) => a - b);
  expect(before.length >= DELETE_COUNT + 1, `the log has ${before.length} entries; the drill needs ${DELETE_COUNT + 1}`);
  const keepUpTo = before[before.length - DELETE_COUNT - 1];
  const doomed = before.slice(-DELETE_COUNT);
  await spacetime(spacetimeArgs("sql", db, `DELETE FROM event_log WHERE seq > ${keepUpTo}`));
  const after = await sql(db, "SELECT seq FROM event_log");
  expect(after.length === before.length - DELETE_COUNT, `${after.length} entries left, expected ${before.length - DELETE_COUNT}`);

  await waitFor(() => events(ctx.witness).length === after.length, "the subscribed client to see the delete");
  const want = `ROLLBACK DETECTED AT #${doomed[0]}`;
  const status = lib.chainStatus(events(ctx.witness), held);
  expect(status.text === want, `subscribed client says ${status.text}, expected ${want}`);
  const second = await verify(db, witnessFile);
  expect(second.code === 1 && second.line === want, `scripts/verify.mjs says ${second.line} (exit ${second.code}), expected ${want} (exit 1)`);
  return `owner deleted #${doomed.join(", #")}; subscribed client (lib/rules/darkroom/status.ts): ${status.text}; `
    + `scripts/verify.mjs --db ${db}: ${second.line} (exit 1)`;
}

async function clearFaults(ctx) {
  const db = ctx.o.avonDb;
  expect(ctx.avon, `no connection to ${db} (step 2 did not connect)`);
  await within(30000, "clear_fault", ctx.avon.reducers.clearFault({ assetId: "" }));
  const faults = await sql(db, "SELECT * FROM fault");
  expect(faults.length === 0, `fault table still has ${faults.length} rows`);
  const issues = await sql(db, "SELECT * FROM sensor_issue");
  return `clear_fault '' on ${db}: fault table empty, sensor_issue ${issues.length} rows; smoke databases left in place`;
}

const STEPS = [
  { n: 1, label: "publish", needs: [], fn: publish },
  { n: 2, label: "ingest", needs: [1], fn: ingest },
  { n: 3, label: "fake_flat", needs: [2], fn: fakeFlat },
  { n: 4, label: "evidence ref", needs: [3], fn: evidence },
  { n: 5, label: "darkroom incident", needs: [1, 4], fn: darkroom },
  { n: 6, label: "tamper", needs: [5], fn: tamper },
  { n: 7, label: "cleanup", needs: [1], fn: clearFaults },
];

async function runOnce(o, i, dir) {
  const t0 = performance.now();
  const ctx = { o, dir, conns: [] };
  const passed = new Set();
  let failed = 0;
  console.log(`run ${i}/${o.runs}  (${o.avonDb} + ${o.darkroomDb} on ${SERVER}, folder ${basename(o.folder)})`);
  try {
    for (const s of STEPS) {
      const t = performance.now();
      const missing = s.needs.filter((n) => !passed.has(n));
      if (missing.length) {
        console.log(`FAIL  ${s.n} ${s.label}: not run (needs step ${missing.join(" and ")})`);
        failed++;
        continue;
      }
      try {
        const detail = await s.fn(ctx);
        passed.add(s.n);
        console.log(`PASS  ${s.n} ${s.label}: ${detail}  [${secs(performance.now() - t)}]`);
      } catch (e) {
        failed++;
        console.log(`FAIL  ${s.n} ${s.label}: ${message(e)}  [${secs(performance.now() - t)}]`);
      }
    }
  } finally {
    for (const c of [...ctx.conns, ctx.avon]) {
      try { c?.disconnect(); } catch { /* already closed */ }
    }
  }
  console.log(`run ${i}/${o.runs} ${failed ? `failed (${failed})` : "passed"} in ${secs(performance.now() - t0)}`);
  return failed;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  o.folder = resolve(o.folder);
  lib = await tsImport(pathToFileURL(join(root, "scripts/smoke/lib.ts")).href, import.meta.url);
  lib.setGlobalLogLevel("warn");
  for (const db of [o.avonDb, o.darkroomDb]) {
    if (isProtected(db)) console.log(`note: ${db} is a real demo database (named by flag): updated in place, never wiped`);
  }
  const tmp = mkdtempSync(join(tmpdir(), "avon-smoke-"));
  const cleanup = () => rmSync(tmp, { recursive: true, force: true });
  process.once("SIGINT", () => { cleanup(); process.exit(130); });
  let failed = 0;
  try {
    for (let i = 1; i <= o.runs; i++) {
      const dir = join(tmp, `run-${i}`);
      mkdirSync(dir, { mode: 0o700 });
      failed += await runOnce(o, i, dir);
    }
  } finally {
    cleanup();
  }
  return failed;
}

main().then((failed) => {
  console.log(failed ? `SMOKE FAILED (${failed})` : "SMOKE PASSED");
  process.exit(failed ? 1 : 0);
}, (e) => {
  console.log(`FAIL  smoke: ${message(e)}`);
  console.log("SMOKE FAILED (1)");
  process.exit(1);
});
