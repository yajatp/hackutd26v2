#!/usr/bin/env node
// One command between Darkroom rehearsals, after a tamper drill:
//   node scripts/darkroom-reset.mjs
// 1. Remembers every enrolled member (box screens, phones, the demo team).
// 2. Wipes and republishes ONLY the 'darkroom' database on the LOCAL server (never 'avon').
// 3. Enrolls the same members again, so screens can write without new tokens.
// Then press "Demo reset" once on every open /box and /witness, so each forgets the old log.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SERVER = "avonlocal"; // spacetime server nickname for http://127.0.0.1:3001
const HTTP = "http://127.0.0.1:3001";
const DB = "darkroom";
const MODULE = join(dirname(fileURLToPath(import.meta.url)), "..", "spacetimedb-darkroom");

async function members() {
  const res = await fetch(`${HTTP}/v1/database/${DB}/sql`, { method: "POST", body: "SELECT identity, name, role, active FROM member" });
  if (!res.ok) throw new Error(`cannot read members: HTTP ${res.status} ${await res.text()}`);
  const [result] = await res.json();
  return result.rows
    .map(([id, name, role, active]) => ({ identity: String(Array.isArray(id) ? id[0] : id).replace(/^0x/, "").toLowerCase(), name, role, active }))
    .filter((m) => m.active);
}

function spacetime(args) {
  return execFileSync("spacetime", args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
}

async function main() {
  const keep = await members();
  console.log(`Darkroom (${SERVER}/${DB}): ${keep.length} members to keep`);
  spacetime(["publish", "-s", SERVER, "--module-path", MODULE, "--delete-data", "-y", DB]);
  console.log("  database wiped and republished");
  for (const m of keep) {
    spacetime(["call", "-s", SERVER, DB, "seed_member", JSON.stringify(`0x${m.identity}`), JSON.stringify(m.name), JSON.stringify(m.role)]);
    console.log(`  ${m.name.padEnd(12)} ${m.role.padEnd(10)} ${m.identity.slice(0, 8)}…  enrolled again`);
  }
  const after = await members();
  if (after.length !== keep.length) throw new Error(`expected ${keep.length} members after reset, found ${after.length}`);
  console.log('Done. Now press "Demo reset" on every open /box and /witness.');
}

main().catch((e) => {
  const msg = e && e.stderr ? String(e.stderr).trim().split("\n").filter((l) => !l.startsWith("WARNING")).join(" ") : String(e && e.message ? e.message : e);
  console.error(`darkroom-reset: ${msg}`);
  process.exit(1);
});
