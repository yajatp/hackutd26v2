#!/usr/bin/env node
// Verifier for Laptop 3 that needs only Node 18 or newer: one file, no repo
// checkout, no npm install. Copy this file to the laptop and run it there.
// It prints exactly what scripts/verify.mjs prints:
//   LOG VERIFIED | ROLLBACK DETECTED AT #k | TAMPERING AT #k
//
//   node verify-standalone.mjs --host 192.168.8.20 --witness witness.json
//       Reads the log over the box's anonymous HTTP SQL (public tables only):
//       POST http://<host>:3001/v1/database/darkroom/sql
//       First run with a new witness file: checks the chain and saves the witness.
//       Later runs: checks against it, and moves it forward only if the log verifies.
//   node verify-standalone.mjs --file log.json --witness witness.json
//       Same check on an exported log (no network).
//   --export out.json   also save the log it read (for --file later)
//   --watch             re-check every second and print each change (Ctrl-C to stop)
//   --port 3001 --db darkroom   defaults (--host defaults to 127.0.0.1)
//
// Exit code: 0 verified (or empty), 1 rollback or tampering, 2 could not check.
//
// The rules below are copies of lib/chain.ts (canonical JSON, sha256 hash,
// verifyChain, checkWitness, witnessOf), lib/rules/darkroom/status.ts
// (chainStatus, advanceWitness, parseWitness, memberMismatch), rowToEvent in
// lib/rules/darkroom/replay.ts, and the reporting in scripts/verify.mjs. If one of those files changes, change this one
// too, then compare the output of both verifiers on the same log.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// ---- lib/chain.ts ----------------------------------------------------------

const GENESIS_PREV = "0".repeat(64);

// Deterministic encoding: sorted object keys, no whitespace.
function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical: non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => {
    const v = value[k];
    if (v === undefined) throw new Error(`canonical: undefined at key ${k}`);
    return `${JSON.stringify(k)}:${canonical(v)}`;
  }).join(",")}}`;
}

// sha256 over the UTF-8 bytes (TextEncoder, as @noble/hashes utf8ToBytes does), lowercase hex.
function hashEvent(e) {
  const body = {
    seq: e.seq,
    prev_hash: e.prev_hash,
    incident_id: e.incident_id,
    ts: e.ts,
    actor: e.actor,
    type: e.type,
    payload: e.payload,
  };
  return createHash("sha256").update(new TextEncoder().encode(canonical(body))).digest("hex");
}

function verifyChain(log) {
  let prev = GENESIS_PREV;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.seq !== i) return { ok: false, breakAt: i, reason: "seq" };
    if (e.prev_hash !== prev) return { ok: false, breakAt: i, reason: "link" };
    const { hash, ...rest } = e;
    if (hashEvent(rest) !== hash) return { ok: false, breakAt: i, reason: "hash" };
    prev = hash;
  }
  return { ok: true, count: log.length, head: prev };
}

function checkWitness(log, w) {
  if (log.length === 0 || log[0].hash !== w.genesis) return { ok: false, kind: "genesis", at: 0 };
  if (log.length - 1 < w.seq) return { ok: false, kind: "rollback", at: log.length };
  if (log[w.seq].hash !== w.head) return { ok: false, kind: "rewritten", at: w.seq };
  return { ok: true };
}

function witnessOf(log) {
  if (log.length === 0) throw new Error("witnessOf: empty log");
  const last = log[log.length - 1];
  return { genesis: log[0].hash, seq: last.seq, head: last.hash };
}

// ---- lib/rules/darkroom/status.ts -------------------------------------------

function sortedBySeq(log) {
  return [...log].sort((a, b) => a.seq - b.seq);
}

function rollback(at) {
  return { kind: "rollback", text: `ROLLBACK DETECTED AT #${at}`, at };
}

function tampering(at) {
  return { kind: "tampering", text: `TAMPERING AT #${at}`, at };
}

function chainStatus(log, witness) {
  const s = sortedBySeq(log);
  if (s.length === 0) return witness ? rollback(0) : { kind: "empty", text: "NO ENTRIES YET" };
  // An entry that cannot even be hashed (e.g. a payload number like 1e309 that JSON turns into
  // Infinity) was not written by the module: it is tampering at that entry, not an error.
  for (const e of s) {
    try { hashEvent(e); } catch { return tampering(e.seq); }
  }
  const v = verifyChain(s);
  if (!v.ok) return tampering(v.breakAt);
  if (witness) {
    const w = checkWitness(s, witness);
    if (!w.ok) return w.kind === "rollback" ? rollback(w.at) : tampering(w.at);
  }
  return { kind: "verified", text: "LOG VERIFIED", count: v.count, head: v.head };
}

// The witness only moves forward, and only while the log verifies against the one held.
function advanceWitness(log, witness) {
  const st = chainStatus(log, witness);
  if (st.kind !== "verified") return witness;
  const next = witnessOf(sortedBySeq(log));
  if (!witness || next.seq > witness.seq) return next;
  return witness;
}

function parseWitness(x) {
  if (typeof x !== "object" || x === null) return null;
  const o = x;
  if (typeof o.genesis !== "string" || typeof o.head !== "string") return null;
  if (typeof o.seq !== "number" || !Number.isInteger(o.seq) || o.seq < 0) return null;
  return { genesis: o.genesis, seq: o.seq, head: o.head };
}

// The member table must match the member_added entries in the log (the newest entry for an
// identity wins). A row changed, added or removed outside the log means someone with access to
// the box edited the table directly. Returns the first identity that does not match, or null.
function memberMismatch(members, log) {
  const norm = (x) => x.toLowerCase().replace(/^0x/, "");
  const fromLog = new Map();
  for (const e of sortedBySeq(log)) {
    if (e.type !== "member_added" || !e.payload || typeof e.payload !== "object" || Array.isArray(e.payload)) continue;
    const p = e.payload;
    if (typeof p.identity === "string") fromLog.set(norm(p.identity), { name: String(p.name ?? ""), role: String(p.role ?? "") });
  }
  const active = members.filter((m) => m.active);
  for (const m of active) {
    const l = fromLog.get(norm(m.identity));
    if (!l || l.name !== m.name || l.role !== m.role) return norm(m.identity);
  }
  for (const id of fromLog.keys()) if (!active.some((m) => norm(m.identity) === id)) return id;
  return null;
}

// ---- lib/rules/darkroom/replay.ts (rowToEvent) ------------------------------

function rowToEvent(r) {
  let payload;
  try {
    payload = JSON.parse(r.payloadJson);
    // The module stores exactly canonical(payload); different bytes with the same parse mean the
    // row was edited outside the module, so keep the raw text and let the hash check flag it.
    if (canonical(payload) !== r.payloadJson) payload = r.payloadJson;
  } catch {
    // Unparseable payload (or one canonical() refuses, like 1e309): keep the raw text.
    payload = r.payloadJson;
  }
  return {
    seq: Number(r.seq),
    prev_hash: r.prevHash,
    incident_id: r.incidentId,
    ts: r.ts,
    actor: r.actor,
    type: r.type,
    payload,
    hash: r.hash,
  };
}

// ---- scripts/verify.mjs -------------------------------------------------------

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const host = arg("--host", "127.0.0.1");
const port = arg("--port", "3001");
const db = arg("--db", "darkroom");
const file = arg("--file");
const witnessPath = arg("--witness");
const exportPath = arg("--export");
const watch = process.argv.includes("--watch");

function short(h) {
  return h ? `${h.slice(0, 12)}…` : "-";
}

// Accepts LogEvent objects ({..., payload}) or database rows ({..., payload_json}).
function toEvent(o) {
  if ("payload_json" in o || "payloadJson" in o) {
    return rowToEvent({
      seq: o.seq, prevHash: o.prev_hash ?? o.prevHash, incidentId: o.incident_id ?? o.incidentId,
      ts: o.ts, actor: o.actor, type: o.type, payloadJson: o.payload_json ?? o.payloadJson, hash: o.hash,
    });
  }
  return { seq: Number(o.seq), prev_hash: o.prev_hash, incident_id: o.incident_id, ts: o.ts, actor: o.actor, type: o.type, payload: o.payload, hash: o.hash };
}

async function readLog() {
  if (file) {
    const data = JSON.parse(readFileSync(file, "utf8"));
    const rows = Array.isArray(data) ? data : data.entries;
    if (!Array.isArray(rows)) throw new Error(`${file}: expected a JSON array of log entries`);
    return rows.map(toEvent);
  }
  const url = `http://${host}:${port}/v1/database/${db}/sql`;
  const res = await fetch(url, { method: "POST", body: "SELECT * FROM event_log" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status} ${await res.text()}`);
  const [result] = await res.json();
  const names = result.schema.elements.map(e => e.name.some);
  return result.rows.map(r => toEvent(Object.fromEntries(names.map((n, i) => [n, r[i]]))));
}

// Server mode only: the member table, to compare with the member_added entries in the log.
async function readMembers() {
  if (file) return null;
  const url = `http://${host}:${port}/v1/database/${db}/sql`;
  const res = await fetch(url, { method: "POST", body: "SELECT identity, name, role, active FROM member" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status} ${await res.text()}`);
  const [result] = await res.json();
  return result.rows.map(([id, name, role, active]) => ({ identity: String(Array.isArray(id) ? id[0] : id), name, role, active }));
}

function readWitness() {
  if (!witnessPath || !existsSync(witnessPath)) return null;
  const w = parseWitness(JSON.parse(readFileSync(witnessPath, "utf8")));
  if (!w) throw new Error(`${witnessPath}: not a witness file ({genesis, seq, head})`);
  return w;
}

function report(log, witness, status) {
  const sorted = [...log].sort((a, b) => a.seq - b.seq);
  const last = sorted[sorted.length - 1];
  console.log(status.text);
  console.log(`  source:  ${file ? file : `http://${host}:${port} database ${db}`}`);
  console.log(`  entries: ${sorted.length}${last ? ` (#${sorted[0].seq}..#${last.seq}), head ${short(last.hash)}` : ""}`);
  if (witness) console.log(`  witness: saw up to #${witness.seq}, head ${short(witness.head)}${witnessPath ? ` (${witnessPath})` : ""}`);
  else console.log(`  witness: none${witnessPath ? ` yet (will save to ${witnessPath})` : " (pass --witness to catch deleted entries)"}`);
  if (status.kind === "tampering" && status.headChanged) {
    console.log("  why:     chain_head was changed without a matching log entry; the next honest entry would be blamed");
  } else if (status.kind === "tampering" && status.members) {
    console.log(`  why:     member ${status.members} in the member table does not match the member entries in the log`);
  } else if (status.kind === "tampering") {
    let why;
    try {
      const v = verifyChain(sorted);
      why = !v.ok
        ? { seq: "an entry is missing or out of order", link: "it does not link to the entry before it", hash: "its contents do not match its hash" }[v.reason]
        : "the chain was rebuilt: it no longer matches the head this witness saw";
    } catch {
      why = "its contents cannot be hashed, so the module did not write it";
    }
    console.log(`  why:     entry #${status.at}: ${why}`);
  }
  if (status.kind === "rollback") console.log(`  why:     entries from #${status.at} on were removed after this witness saw them`);
}

// Server mode only: chain_head must point at the last entry. An edit to the head alone would
// otherwise pass and get the next honest writer's entry blamed (red team item 6).
async function readHead() {
  if (file) return null;
  const url = `http://${host}:${port}/v1/database/${db}/sql`;
  const res = await fetch(url, { method: "POST", body: "SELECT seq, hash FROM chain_head" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status} ${await res.text()}`);
  const [result] = await res.json();
  const row = result.rows[0];
  return row ? { seq: Number(row[0]), hash: String(row[1]) } : null;
}

async function checkOnce(witness, quiet) {
  const log = await readLog();
  let status = chainStatus(log, witness);
  const members = status.kind === "verified" ? await readMembers() : null;
  const stray = members ? memberMismatch(members, log) : null;
  if (stray) status = { kind: "tampering", text: `MEMBER LIST CHANGED OUTSIDE THE LOG (${stray.slice(0, 8)})`, at: log.length, members: stray };
  if (status.kind === "verified") {
    const head = await readHead();
    const last = [...log].sort((a, b) => a.seq - b.seq).at(-1);
    if (head && last && (head.seq !== last.seq || head.hash !== last.hash)) {
      status = { kind: "tampering", text: `CHAIN HEAD CHANGED OUTSIDE THE LOG (head #${head.seq}, last entry #${last.seq})`, at: last.seq, headChanged: true };
    }
  }
  if (!quiet) report(log, witness, status);
  if (exportPath) writeFileSync(exportPath, JSON.stringify([...log].sort((a, b) => a.seq - b.seq), null, 2));
  const next = stray || status.headChanged ? witness : advanceWitness(log, witness);
  if (witnessPath && next && JSON.stringify(next) !== JSON.stringify(witness)) {
    writeFileSync(witnessPath, JSON.stringify(next, null, 2));
    if (!quiet) console.log(`  saved:   witness now #${next.seq}, head ${short(next.head)}`);
  }
  return { status, witness: next, count: log.length };
}

async function main() {
  let witness = readWitness();
  if (!watch) {
    const { status } = await checkOnce(witness, false);
    process.exit(status.kind === "rollback" || status.kind === "tampering" ? 1 : 0);
  }
  let lastLine = "";
  for (;;) {
    try {
      const r = await checkOnce(witness, true);
      witness = r.witness;
      const line = `${r.status.text} · ${r.count} entries${witness ? ` · witness #${witness.seq}` : ""}`;
      if (line !== lastLine) {
        console.log(`${new Date().toISOString()}  ${line}`);
        lastLine = line;
      }
    } catch (e) {
      const line = `CANNOT REACH THE BOX: ${e.message}`;
      if (line !== lastLine) { console.log(`${new Date().toISOString()}  ${line}`); lastLine = line; }
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

main().catch(e => {
  console.error(`verify: ${e.message}`);
  process.exit(2);
});
