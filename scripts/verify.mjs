#!/usr/bin/env node
// Standalone verifier for a third laptop. Reads the Darkroom log and a saved
// witness, then prints exactly one of:
//   LOG VERIFIED | ROLLBACK DETECTED AT #k | TAMPERING AT #k
//
//   node scripts/verify.mjs --host 192.168.8.20 --witness witness.json
//       Reads the log over the box's anonymous HTTP SQL (public tables only).
//       First run with a new witness file: checks the chain and saves the witness.
//       Later runs: checks against it, and moves it forward only if the log verifies.
//   node scripts/verify.mjs --file log.json --witness witness.json
//       Same check on an exported log (no network).
//   --export out.json   also save the log it read (for --file later)
//   --watch             re-check every second and print each change (Ctrl-C to stop)
//   --port 3001 --db darkroom   defaults
//
// Exit code: 0 verified (or empty), 1 rollback or tampering, 2 could not check.
// Hashing comes from lib/chain.ts, the same file the module and the screens use.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lib = p => tsImport(pathToFileURL(join(root, p)).href, import.meta.url);
const { verifyChain } = await lib("lib/chain.ts");
const { chainStatus, advanceWitness, parseWitness } = await lib("lib/rules/darkroom/status.ts");
const { rowToEvent } = await lib("lib/rules/darkroom/replay.ts");

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
  if (status.kind === "tampering") {
    const v = verifyChain(sorted);
    const why = !v.ok
      ? { seq: "an entry is missing or out of order", link: "it does not link to the entry before it", hash: "its contents do not match its hash" }[v.reason]
      : "the chain was rebuilt: it no longer matches the head this witness saw";
    console.log(`  why:     entry #${status.at}: ${why}`);
  }
  if (status.kind === "rollback") console.log(`  why:     entries from #${status.at} on were removed after this witness saw them`);
}

async function checkOnce(witness, quiet) {
  const log = await readLog();
  const status = chainStatus(log, witness);
  if (!quiet) report(log, witness, status);
  if (exportPath) writeFileSync(exportPath, JSON.stringify([...log].sort((a, b) => a.seq - b.seq), null, 2));
  const next = advanceWitness(log, witness);
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
