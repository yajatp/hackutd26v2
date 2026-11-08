// Loads Playwright for scripts/e2e.mjs without adding a dependency: it reuses a copy that npx
// already put in the local npm cache (~/.npm/_npx/<hash>/node_modules/playwright), the same way
// the UI lane's check did. Prefers 1.65.0 and the cache entry that lane used.
//   E2E_PLAYWRIGHT_DIR=<dir with playwright's package.json>   use that copy instead of searching
// If no copy loads, prints one instruction line and exits with code 2.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { env, exit } from "node:process";

export const WANT = "1.65.0";
const KNOWN = "e41f203b7505f1fb"; // the npx cache entry the UI lane loaded

// Candidate playwright package folders, best first.
function candidates() {
  if (env.E2E_PLAYWRIGHT_DIR) return [env.E2E_PLAYWRIGHT_DIR];
  const npx = join(env.npm_config_cache || join(homedir(), ".npm"), "_npx");
  const found = [];
  let entries = [];
  try { entries = readdirSync(npx); } catch { return []; }
  for (const hash of entries) {
    const dir = join(npx, hash, "node_modules", "playwright");
    try {
      const { version } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      const score = (version === WANT ? 0 : version.startsWith("1.65") ? 2 : 4) - (hash === KNOWN ? 1 : 0);
      found.push({ dir, score });
    } catch { /* no playwright in this cache entry */ }
  }
  return found.sort((a, b) => a.score - b.score).map((f) => f.dir);
}

export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const dir of candidates()) {
    try {
      const pw = require(dir);
      const { version } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      if (pw?.chromium) return { chromium: pw.chromium, dir, version };
    } catch { /* broken copy: try the next one */ }
  }
  console.log(`Playwright ${WANT} is not in the npx cache. Run this once, then run npm run e2e again: npx -y playwright@${WANT} --version`);
  exit(2);
}

// System Chrome first (the cache has no bundled Chromium), then Playwright's own Chromium.
export async function launchBrowser(chromium, headed) {
  const opts = headed ? { headless: false } : { headless: true };
  try {
    return await chromium.launch({ ...opts, channel: "chrome" });
  } catch (first) {
    try {
      return await chromium.launch(opts);
    } catch {
      const why = String(first?.message ?? first).split("\n")[0];
      console.log(`No browser for Playwright (${why}). Install Google Chrome, or run once: npx -y playwright@${WANT} install chromium`);
      exit(2);
    }
  }
}
