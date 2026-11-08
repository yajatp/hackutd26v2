#!/usr/bin/env node
// Automated red team of the Darkroom log.
// For each attack: a fresh throwaway database on a throwaway server, a normal log built through
// the reducers, a witness saved by scripts/verify.mjs, one edit as the box owner, then
// verify.mjs again. One line per attack: CAUGHT, MISSED or N/A (the database refused the edit).
//
//   spacetime start --listen-addr 127.0.0.1:3102 --data-dir "$TMPDIR/st-3102"   (own data folder:
//       a second server on the default folder locks the team's 3001 out)
//   node scripts/redteam.mjs [--server http://127.0.0.1:3102] [--only <name>] [--keep]
//
// Safety: refuses port 3001 and 3101 (the team's and the other red team's), only touches
// databases named rt-c*, never runs spacetime login, never prints a token.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const SERVER = arg("--server", "http://127.0.0.1:3102");
const ONLY = arg("--only");
const KEEP = process.argv.includes("--keep");
const PORT = new URL(SERVER).port;
if (["3001", "3101"].includes(PORT) || !/^http:\/\/(127\.0\.0\.1|localhost):/.test(SERVER)) {
  console.error(`refusing ${SERVER}: use your own throwaway local server (not 3001 or 3101)`);
  process.exit(2);
}
const { hashEvent, canonical } = await tsImport(pathToFileURL(join(ROOT, "lib/chain.ts")).href, import.meta.url);

const work = mkdtempSync(join(tmpdir(), "redteam-"));
const st = (args) => execFileSync("spacetime", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const call = (db, reducer, ...a) => st(["call", "-s", SERVER, db, reducer, ...a.map((x) => JSON.stringify(x))]);
const sqlExec = (db, q) => st(["sql", "-s", SERVER, db, q]);
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;

async function sql(db, query) {
  const r = await fetch(`${SERVER}/v1/database/${db}/sql`, { method: "POST", body: query });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${await r.text()}`);
  const [res] = await r.json();
  const cols = res.schema.elements.map((e) => e.name.some);
  return res.rows.map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}
const log = async (db) => (await sql(db, "SELECT * FROM event_log")).sort((a, b) => a.seq - b.seq);
const head = async (db) => (await sql(db, "SELECT * FROM chain_head"))[0];

// The entry as the module would hash it (payload parsed from payload_json, like rowToEvent).
function rehash(row) {
  return hashEvent({ seq: Number(row.seq), prev_hash: row.prev_hash, incident_id: row.incident_id, ts: row.ts, actor: row.actor, type: row.type, payload: JSON.parse(row.payload_json) });
}
function insertRow(db, r) {
  sqlExec(db, `INSERT INTO event_log (seq, prev_hash, incident_id, ts, actor, type, payload_json, hash) VALUES (${r.seq}, ${q(r.prev_hash)}, ${q(r.incident_id)}, ${q(r.ts)}, ${q(r.actor)}, ${q(r.type)}, ${q(r.payload_json)}, ${q(r.hash)})`);
}
const setPayload = (db, seq, json) => sqlExec(db, `UPDATE event_log SET payload_json = ${q(json)} WHERE seq = ${seq}`);
const setHead = (db, seq, hash, count) => sqlExec(db, `UPDATE chain_head SET seq = ${seq}, hash = ${q(hash)}, count = ${count} WHERE id = 0`);

// Rewrites entries from index `from` on so every hash and link is valid again, then chain_head.
async function relinkFrom(db, rows, from) {
  for (let i = from; i < rows.length; i++) {
    const r = rows[i];
    r.prev_hash = i === 0 ? "0".repeat(64) : rows[i - 1].hash;
    r.hash = rehash(r);
    sqlExec(db, `DELETE FROM event_log WHERE seq = ${r.seq}`);
    insertRow(db, r);
  }
  const last = rows[rows.length - 1];
  setHead(db, last.seq, last.hash, rows.length);
}

// SQL cannot insert a member row (2.14 has no Timestamp literal), but the box owner can republish
// the module. This copy adds one reducer that writes a member row directly, and is published
// over the live database WITHOUT --delete-data, so the log stays as it was.
let evilDir = null;
function evilModule() {
  if (evilDir) return evilDir;
  evilDir = join(ROOT, ".redteam-module");   // same depth as spacetimedb-darkroom: ../../lib resolves
  rmSync(evilDir, { recursive: true, force: true });
  cpSync(join(ROOT, "spacetimedb-darkroom"), evilDir, { recursive: true, filter: (p) => !p.includes("/dist") });
  const src = join(evilDir, "src", "index.ts");
  writeFileSync(src, readFileSync(src, "utf8") + `
export const rtRawMember = spacetimedb.reducer(
  { identity: t.identity(), name: t.string(), role: t.string(), active: t.bool() },
  (ctx, a) => { ctx.db.member.insert({ identity: a.identity, name: a.name, role: a.role, addedBy: ctx.sender, addedAt: ctx.timestamp, active: a.active }); }
);
`);
  return evilDir;
}
function rawMember(db, idHex, name, role, active) {
  st(["publish", "-s", SERVER, "--module-path", evilModule(), "-y", db]);
  call(db, "rt_raw_member", `0x${idHex}`, name, role, active);
}

// The normal log: box owner (genesis), a second member, an incident, 2 scope updates, 2 chats,
// 1 evidence entry. 8 entries, #0..#7. All writes go through the reducers.
const SREESH = "c2" + "5e".repeat(31);
async function build(db) {
  st(["publish", "-s", SERVER, "--module-path", "spacetimedb-darkroom", "--delete-data", "-y", db]);
  call(db, "seed_member", `0x${SREESH}`, "Sreesh", "Responder");
  call(db, "open_incident", "Pump station S5 breach");
  const inc = (await log(db)).find((e) => e.type === "incident_opened").incident_id;
  const append = async (type, payload) => {
    const h = await head(db);
    call(db, "append_event", h.seq + 1, h.hash, inc, type, JSON.stringify(payload));
  };
  await append("scope_update", { system: "SCADA historian", state: "ACCESSED", certainty: "SUSPECTED", note: "odd logins at 02:10" });
  await append("scope_update", { system: "Tank telemetry", state: "SUSPECTED", certainty: "SUSPECTED", note: "S5 tank C reads flat" });
  await append("chat", { text: "Pulling the historian offline now." });
  await append("chat", { text: "Backups are intact, checked at 02:40." });
  await append("evidence_imported", { ref: "AV-1A2B-3C4D", fingerprint: "", source: "Avon console", note: "flat tank reading" });
  return inc;
}

// Each attack is checked by both verifiers, each with its own witness file: scripts/verify.mjs
// (the repo one) and scripts/verify-standalone.mjs (the one-file copy for laptop 3).
const VERIFIERS = { repo: "scripts/verify.mjs", standalone: "scripts/verify-standalone.mjs" };
function verify(db, witness, which = "repo") {
  const args = [join(ROOT, VERIFIERS[which]), "--port", PORT, "--db", db];
  if (witness) args.push("--witness", witness);
  try {
    return { code: 0, out: execFileSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

const CAUGHT_RE = /TAMPERING|ROLLBACK DETECTED|MEMBER LIST CHANGED|CHAIN HEAD CHANGED/;

// Each attack edits the database as the owner. `after` (optional) runs honest reducer calls
// afterwards, for attacks that only bite on the next write.
const ATTACKS = [
  { name: "control: no change", run: async () => {} },
  { name: "delete the last 3 entries", run: async (db) => sqlExec(db, "DELETE FROM event_log WHERE seq > 4") },
  { name: "delete a middle entry (#3)", run: async (db) => sqlExec(db, "DELETE FROM event_log WHERE seq = 3") },
  { name: "edit a chat payload, hash unchanged", run: async (db) => setPayload(db, 6, JSON.stringify({ text: "Backups are gone." })) },
  { name: "edit a chat payload and recompute its hash", run: async (db) => {
    const rows = await log(db); const r = rows[6];
    r.payload_json = JSON.stringify({ text: "Backups are gone." }); r.hash = rehash(r);
    sqlExec(db, `UPDATE event_log SET payload_json = ${q(r.payload_json)}, hash = ${q(r.hash)} WHERE seq = 6`);
  } },
  { name: "edit a chat payload, recompute every later hash and chain_head", run: async (db) => {
    const rows = await log(db); rows[6].payload_json = JSON.stringify({ text: "Backups are gone." });
    await relinkFrom(db, rows, 6);
  } },
  { name: "same full rewrite, verifier has no witness", noWitness: true, run: async (db) => {
    const rows = await log(db); rows[6].payload_json = JSON.stringify({ text: "Backups are gone." });
    await relinkFrom(db, rows, 6);
  } },
  { name: "payload number 1e309", run: async (db) => setPayload(db, 6, '{"text":1e309}') },
  { name: "payload NaN (not JSON)", run: async (db) => setPayload(db, 6, '{"text":NaN}') },
  { name: "payload -0 added", run: async (db) => setPayload(db, 6, '{"n":-0,"text":"Backups are intact, checked at 02:40."}') },
  { name: "duplicate keys, forged text FIRST (JSON.parse keeps the last)", run: async (db) =>
    setPayload(db, 6, '{"text":"Backups are gone.","text":"Backups are intact, checked at 02:40."}') },
  { name: "duplicate keys, forged text LAST", run: async (db) =>
    setPayload(db, 6, '{"text":"Backups are intact, checked at 02:40.","text":"Backups are gone."}') },
  { name: "same meaning, different bytes (spaces, \\u escapes, key order)", run: async (db) =>
    setPayload(db, 3, '{ "system" : "SCADA historian", "note":"odd logins at 02:10", "state":"\\u0041CCESSED", "certainty":"SUSPECTED" }') },
  // setup runs before the witness is saved: it gives the log a valid entry the module itself
  // never writes (a number, a composed é), so only the in-place edit in run is the attack.
  { name: "huge integer that rounds to the same double",
    setup: async (db) => {
      const rows = await log(db); const p = JSON.parse(rows[7].payload_json); p.bbl = 9007199254740992;
      rows[7].payload_json = canonical(p); await relinkFrom(db, rows, 7);
    },
    run: async (db) => {
      const r = (await log(db))[7]; setPayload(db, 7, r.payload_json.replace("9007199254740992", "9007199254740993"));
    } },
  { name: "unicode lookalike in a chat (Cyrillic o)", run: async (db) => setPayload(db, 5, JSON.stringify({ text: "Pulling the histоrian offline now." })) },
  { name: "different normalization (NFC -> NFD) in a scope note",
    setup: async (db) => {
      const rows = await log(db); const p = JSON.parse(rows[3].payload_json); p.note = "odd logins at 02:10 café";
      rows[3].payload_json = canonical(p); await relinkFrom(db, rows, 3);
    },
    run: async (db) => {
      const r = (await log(db))[3]; setPayload(db, 3, r.payload_json.replace("café", "café"));
    } },
  { name: "\"__proto__\" key in a payload", run: async (db) => setPayload(db, 6, '{"text":"Backups are intact, checked at 02:40.","__proto__":{"text":"Backups are gone."}}') },
  { name: "change the actor field", run: async (db) => sqlExec(db, `UPDATE event_log SET actor = ${q(`Sreesh|Responder|${SREESH}`)} WHERE seq = 6`) },
  { name: "change ts", run: async (db) => sqlExec(db, "UPDATE event_log SET ts = '2026-11-08T01:00:00.000000Z' WHERE seq = 6") },
  { name: "change type (chat -> incident_closed)", run: async (db) => sqlExec(db, "UPDATE event_log SET type = 'incident_closed' WHERE seq = 6") },
  { name: "swap two entries' seq (#5 <-> #6)", run: async (db) => {
    const rows = await log(db); const a = { ...rows[5], seq: 6 }; const b = { ...rows[6], seq: 5 };
    sqlExec(db, "DELETE FROM event_log WHERE seq = 5"); sqlExec(db, "DELETE FROM event_log WHERE seq = 6");
    insertRow(db, a); insertRow(db, b);
  } },
  { name: "insert a forged entry with a duplicate seq", run: async (db) => {
    const rows = await log(db); insertRow(db, { ...rows[6], payload_json: JSON.stringify({ text: "Backups are gone." }) });
  } },
  { name: "delete everything and re-add the same rows", run: async (db) => {
    const rows = await log(db); sqlExec(db, "DELETE FROM event_log WHERE seq >= 0"); for (const r of rows) insertRow(db, r);
  } },
  { name: "delete the last 2 entries, append 2 valid new ones", run: async (db) => {
    const rows = (await log(db)).slice(0, 6);
    sqlExec(db, "DELETE FROM event_log WHERE seq > 5");
    for (const text of ["All clear on the historian.", "Closing out, nothing taken."]) {
      const prev = rows[rows.length - 1];
      const r = { ...prev, seq: prev.seq + 1, prev_hash: prev.hash, type: "chat", payload_json: canonical({ text }) };
      r.hash = rehash(r); insertRow(db, r); rows.push(r);
    }
    setHead(db, rows[rows.length - 1].seq, rows[rows.length - 1].hash, rows.length);
  } },
  { name: "append a forged entry in another member's name (valid hash, chain_head moved)", run: async (db) => {
    const rows = await log(db); const prev = rows[rows.length - 1];
    const r = { ...prev, seq: prev.seq + 1, prev_hash: prev.hash, ts: new Date().toISOString().replace("Z", "000Z"),
      actor: `Sreesh|Responder|${SREESH}`, type: "chat", payload_json: canonical({ text: "I wiped the historian backups myself." }) };
    r.hash = rehash(r); insertRow(db, r); setHead(db, r.seq, r.hash, rows.length + 1);
  } },
  { name: "replay an old entry at the end (valid hash)", run: async (db) => {
    const rows = await log(db); const prev = rows[rows.length - 1];
    const r = { ...rows[4], seq: prev.seq + 1, prev_hash: prev.hash }; r.hash = rehash(r);
    insertRow(db, r); setHead(db, r.seq, r.hash, rows.length + 1);
  } },
  { name: "edit chain_head only", run: async (db) => setHead(db, 7, "f".repeat(64), 8) },
  { name: "edit chain_head only, then an honest member writes", run: async (db, inc) => {
    setHead(db, 7, "f".repeat(64), 8);
    const h = await head(db); call(db, "append_event", h.seq + 1, h.hash, inc, "chat", JSON.stringify({ text: "Honest line after the head edit." }));
  } },
  { name: "cut the log and move chain_head back, then honest writes continue", run: async (db, inc) => {
    const rows = await log(db); sqlExec(db, "DELETE FROM event_log WHERE seq > 4"); setHead(db, 4, rows[4].hash, 5);
    for (const text of ["Line one after the cut.", "Line two after the cut.", "Line three after the cut."]) {
      const h = await head(db); call(db, "append_event", h.seq + 1, h.hash, inc, "chat", JSON.stringify({ text }));
    }
  } },
  { name: "change a member's role in the member table", run: async (db) => sqlExec(db, `UPDATE member SET role = 'Commander' WHERE name = 'Sreesh'`) },
  { name: "change a member's name in the member table", run: async (db) => sqlExec(db, `UPDATE member SET name = 'Mohan' WHERE name = 'Sreesh'`) },
  { name: "delete a member row", run: async (db) => sqlExec(db, "DELETE FROM member WHERE name = 'Sreesh'") },
  { name: "deactivate a member (active = false)", run: async (db) => sqlExec(db, "UPDATE member SET active = false WHERE name = 'Sreesh'") },
  { name: "add a member row by SQL INSERT", run: async (db) => {
    sqlExec(db, `INSERT INTO member (identity, name, role, added_by, added_at, active) VALUES (0x${"c2" + "77".repeat(31)}, 'Ghost', 'Commander', 0x${"c2" + "77".repeat(31)}, '2026-11-08T06:36:17Z', true)`);
  } },
  { name: "add an active member row (owner republishes a modified module)", run: async (db) => rawMember(db, "c2" + "77".repeat(31), "Ghost", "Commander", true) },
  { name: "add an inactive member row (modified module)", run: async (db) => rawMember(db, "c2" + "77".repeat(31), "Ghost", "Commander", false) },
  { name: "forged member_added entry plus a matching member row (modified module)", run: async (db) => {
    const ghost = "c2" + "77".repeat(31);
    rawMember(db, ghost, "Ghost", "Commander", true);
    const rows = await log(db); const prev = rows[rows.length - 1];
    const r = { ...rows[0], seq: prev.seq + 1, prev_hash: prev.hash, ts: new Date().toISOString().replace("Z", "000Z"),
      payload_json: canonical({ identity: ghost, name: "Ghost", role: "Commander" }) };
    r.hash = rehash(r); insertRow(db, r); setHead(db, r.seq, r.hash, rows.length + 1);
  } },
];

const results = [];
let n = 0;
for (const a of ATTACKS) {
  n++;
  if (ONLY && !a.name.includes(ONLY)) continue;
  const db = `rt-c${n}`;
  const witness = { repo: join(work, `${db}.witness.json`), standalone: join(work, `${db}.sa.witness.json`) };
  const w = (which) => (a.noWitness ? null : witness[which]);
  let line;
  try {
    const inc = await build(db);
    if (a.setup) await a.setup(db, inc);
    for (const which of Object.keys(VERIFIERS)) {
      const first = verify(db, w(which), which);
      if (!/LOG VERIFIED/.test(first.out)) throw new Error(`log did not verify before the attack (${which}): ${first.out.split("\n")[0]}`);
    }
    await a.run(db, inc);
    const v = verify(db, w("repo"), "repo");
    const s = verify(db, w("standalone"), "standalone");
    const verdict = v.out.split("\n")[0].trim();
    const saVerdict = s.out.split("\n")[0].trim();
    const caught = a.name.startsWith("control") ? !CAUGHT_RE.test(verdict) && v.code === 0 : CAUGHT_RE.test(verdict) && v.code === 1;
    const tag = a.name.startsWith("control") ? (caught ? "OK" : "FAIL") : caught ? "CAUGHT" : "MISSED";
    const agree = verdict === saVerdict && v.code === s.code;
    line = { tag, name: a.name, verdict: `${verdict} (exit ${v.code})`, detail: v.out, agree,
      sa: agree ? "" : `standalone DISAGREES: ${saVerdict} (exit ${s.code})` };
  } catch (e) {
    const msg = String(e.stderr || e.message || e).split("\n").filter((l) => l && !/^WARNING/.test(l)).slice(-1)[0];
    line = { tag: "N/A", name: a.name, verdict: `edit refused: ${msg}`, agree: true };
  }
  results.push(line);
  console.log(`${line.tag.padEnd(6)} ${line.name}\n       ${line.verdict}${line.sa ? `\n       ${line.sa}` : ""}`);
  if (!KEEP) { try { st(["delete", "-s", SERVER, db, "--yes"]); } catch { /* best effort */ } }
}

const count = (t) => results.filter((r) => r.tag === t).length;
const disagree = results.filter((r) => !r.agree).length;
console.log(`\n${count("CAUGHT")} caught, ${count("MISSED")} missed, ${count("N/A")} refused by the database, control ${count("OK") ? "OK" : count("FAIL") ? "FAIL" : "not run"}`);
console.log(disagree ? `verify-standalone.mjs DISAGREES with verify.mjs on ${disagree}` : "verify-standalone.mjs agrees with verify.mjs on every attack");
if (process.argv.includes("--details")) for (const r of results) if (r.detail) console.log(`\n## ${r.name}\n${r.detail}`);
rmSync(work, { recursive: true, force: true });
if (evilDir) rmSync(evilDir, { recursive: true, force: true });
process.exit(count("MISSED") || count("FAIL") || disagree ? 1 : 0);
