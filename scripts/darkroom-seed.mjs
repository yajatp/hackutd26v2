#!/usr/bin/env node
// Adds members to the Darkroom box (database 'darkroom' on the LOCAL server only).
//
//   node scripts/darkroom-seed.mjs
//       Demo team: Dana (Commander), Sam (Responder), Lee (Viewer). Each gets a
//       fresh identity from the local server; its token is saved (mode 600) in
//       ~/.darkroom/tokens/<name>.json, or in --token-dir. Tokens are never printed.
//   node scripts/darkroom-seed.mjs --add <identity hex> --name "Box screen" --role Commander
//       Lets one screen write (copy the identity from the /box page).
//
// The owner-only seed_member reducer is called with the spacetime CLI, as the
// identity that published the module (the box owner). Always -s avonlocal.

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SERVER = "avonlocal"; // spacetime server nickname for http://127.0.0.1:3001
const HTTP = "http://127.0.0.1:3001";
const DB = "darkroom";
const ROLES = ["Commander", "Responder", "Viewer"];
const DEMO_TEAM = [
  { name: "Dana", role: "Commander" },
  { name: "Sam", role: "Responder" },
  { name: "Lee", role: "Viewer" },
];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function short(hex) {
  return `${hex.slice(0, 8)}…`;
}

async function members() {
  const res = await fetch(`${HTTP}/v1/database/${DB}/sql`, { method: "POST", body: "SELECT identity, name, role, active FROM member" });
  if (!res.ok) throw new Error(`cannot read members: HTTP ${res.status} ${await res.text()}`);
  const [result] = await res.json();
  // An identity comes back as a one-element array holding "0x<hex>".
  return result.rows.map(([id, name, role, active]) => ({
    identity: String(Array.isArray(id) ? id[0] : id).replace(/^0x/, "").toLowerCase(),
    name, role, active,
  }));
}

function seed(identityHex, name, role) {
  execFileSync("spacetime", ["call", "-s", SERVER, DB, "seed_member", JSON.stringify(`0x${identityHex}`), JSON.stringify(name), JSON.stringify(role)], {
    stdio: ["ignore", "ignore", "pipe"],
  });
}

async function newIdentity() {
  const res = await fetch(`${HTTP}/v1/identity`, { method: "POST" });
  if (!res.ok) throw new Error(`cannot create an identity: HTTP ${res.status}`);
  const { identity, token } = await res.json();
  return { identity: identity.toLowerCase(), token };
}

async function ensure(identityHex, name, role) {
  const existing = (await members()).find(m => m.identity === identityHex);
  if (existing && existing.active && existing.name === name && existing.role === role) {
    console.log(`  ${name.padEnd(10)} ${role.padEnd(10)} ${short(identityHex)}  already a member`);
    return;
  }
  seed(identityHex, name, role);
  console.log(`  ${name.padEnd(10)} ${role.padEnd(10)} ${short(identityHex)}  added`);
}

async function main() {
  const add = arg("--add");
  if (add) {
    const hex = add.replace(/^0x/, "").toLowerCase();
    const name = arg("--name") ?? "Box screen";
    const role = arg("--role") ?? "Commander";
    if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("--add needs a 64-character identity hex (shown on the /box page)");
    if (!ROLES.includes(role)) throw new Error(`--role must be one of ${ROLES.join(", ")}`);
    console.log(`Darkroom (${SERVER}/${DB}): adding one member`);
    await ensure(hex, name, role);
    return;
  }

  const dir = arg("--token-dir") ?? join(homedir(), ".darkroom", "tokens");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  console.log(`Darkroom (${SERVER}/${DB}): demo team, tokens in ${dir} (never printed)`);
  for (const { name, role } of DEMO_TEAM) {
    const file = join(dir, `${name}.json`);
    let saved = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
    if (!saved || typeof saved.token !== "string" || typeof saved.identity !== "string") {
      const fresh = await newIdentity();
      saved = { name, role, identity: fresh.identity, token: fresh.token, server: HTTP, db: DB };
      writeFileSync(file, JSON.stringify(saved, null, 2), { mode: 0o600 });
      chmodSync(file, 0o600);
    }
    await ensure(saved.identity, name, role);
  }
}

main().catch(e => {
  const msg = e && e.stderr ? String(e.stderr).trim().split("\n").filter(l => !l.startsWith("WARNING")).join(" ") : String(e && e.message ? e.message : e);
  console.error(`darkroom-seed: ${msg}`);
  process.exit(1);
});
