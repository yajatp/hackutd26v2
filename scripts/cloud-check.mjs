#!/usr/bin/env node
// Read-only checks against the hosted screens, as seen by a judge in Chrome.
//   npm run cloud:check                      /console, /attack and /vr for the default site (Midland)
//   npm run cloud:check -- --site eagleford  /console?site=eagleford: LIVE, and the top card that
//                                            site's own database ranks first
//   npm run cloud:check -- --all             the three default checks, then every site's console
// --url http://127.0.0.1:3000 checks the laptop's copy against the laptop's SpacetimeDB instead.
import { parseArgs } from "node:util";
import { tsImport } from "tsx/esm/api";
import { launchBrowser, loadPlaywright } from "./e2e/playwright.mjs";
import { readConsole } from "./e2e/screens.mjs";
import { CLOUD_DB, CLOUD_URI, readSite } from "./reset-cloud.mjs";

const EXPECT = {
  facility: "S5 · FACILITY C",
  doThis: "Do this: Call 1 truck now, 1 trip",
  cost: "$905",
  countdown: "trips in 2h 03m",
};

// The console's facility label (app/console/Board.tsx pretty()): "S5_FACILITY_C" -> "S5 · FACILITY C".
const pretty = (id) => id.replace(/^(S\d+)_/, "$1 · ").replace(/_/g, " ");

async function check(browser, url, route, verify, viewport) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(12000);
  const badge = page.locator("header [role=status]").first();
  try {
    const response = await page.goto(new URL(route, url).href, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "unavailable"}`);
    const pattern = route.startsWith("/console") ? /\bLIVE\b.*\bms\b/ : /\bLIVE\b/;
    await badge.filter({ hasText: pattern }).waitFor();
    const detail = await verify(page);
    console.log(`PASS ${route} · ${(await badge.innerText()).replace(/\s+/g, " ").trim()}${detail ? ` · ${detail}` : ""}`);
    return true;
  } catch (error) {
    const status = await badge.innerText({ timeout: 500 }).catch(() => "no status badge");
    console.log(`FAIL ${route} · ${status.replace(/\s+/g, " ").trim()} · ${error.message.split("\n")[0]}`);
    return false;
  } finally {
    await page.close();
  }
}

// The default site's console: the fixed top card the judges' script reads.
function defaultConsole(page) {
  return (async () => {
    await page.waitForFunction(() => [...document.querySelectorAll("main section > header")].some((h) => /pump failed/i.test(h.textContent)), null, { timeout: 12000 });
    const { live, top } = await page.evaluate(readConsole);
    if (live !== "LIVE") throw new Error(`console status is ${live}`);
    for (const [field, want] of Object.entries(EXPECT)) {
      if (top?.[field] !== want) throw new Error(`${field} reads "${top?.[field] ?? "missing"}", expected "${want}"`);
    }
    return Object.values(top).slice(0, 4).join(" · ");
  })();
}

// Another site's console: LIVE, its own dataset, and the top card its database ranks first
// (or the "No pump failures" line when it has no alerts).
async function siteConsole(page, board) {
  const { meta, top } = board;
  if (!meta) throw new Error("the site database has no console_meta row: run npm run sites -- --cloud");
  if (!top) {
    await page.getByText("No pump failures right now", { exact: false }).first().waitFor();
    const { live, dataset } = await page.evaluate(readConsole);
    if (live !== "LIVE") throw new Error(`console status is ${live}`);
    if (dataset !== meta.datasetId) throw new Error(`dataset reads "${dataset}", expected "${meta.datasetId}"`);
    return `${dataset} · no pump failures`;
  }
  const want = pretty(top.facilityId);
  if (top.kind === "pump_failure") {
    await page.waitForFunction((label) => [...document.querySelectorAll("main section > header")].some((h) => h.textContent.includes(label)), want, { timeout: 12000 });
  } else {
    await page.waitForFunction((id) => document.querySelector("main")?.textContent.includes(id), meta.datasetId, { timeout: 12000 });
  }
  const { live, dataset, top: card } = await page.evaluate(readConsole);
  if (live !== "LIVE") throw new Error(`console status is ${live}`);
  if (dataset !== meta.datasetId) throw new Error(`dataset reads "${dataset}", expected "${meta.datasetId}"`);
  if (top.kind === "pump_failure" && card?.facility !== want) throw new Error(`top card reads "${card?.facility ?? "missing"}", expected "${want}"`);
  if (card?.facility === EXPECT.facility) throw new Error("the top card is the default site's: ?site= did not switch databases");
  return [dataset, card?.facility, card?.doThis, card?.cost, card?.countdown].filter(Boolean).join(" · ");
}

async function main() {
  const { values: { url, site, all } } = parseArgs({ options: {
    url: { type: "string", default: "https://avon-hackutd26.vercel.app" },
    site: { type: "string" },
    all: { type: "boolean" },
  } });
  if (all && site !== undefined) throw new Error("use either --site or --all");
  const { SITES, DEFAULT_SITE_KEY } = await tsImport("../lib/sites.ts", import.meta.url);
  if (site !== undefined && !SITES.some((s) => s.key === site)) {
    throw new Error(`unknown site "${site}"; choose ${SITES.map((s) => s.key).join(", ")}`);
  }
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(url).hostname);
  const db = { uri: local ? "ws://127.0.0.1:3001" : CLOUD_URI, base: local ? "avon" : CLOUD_DB };

  const { chromium } = loadPlaywright();
  const browser = await launchBrowser(chromium, false);
  const results = [];
  try {
    if (site === undefined || all) {
      results.push(...await Promise.all([
        check(browser, url, "/console", defaultConsole),
        check(browser, url, "/attack", async () => "", { width: 360, height: 740 }),
        check(browser, url, "/vr", async (page) => {
          const first = page.locator("section[aria-labelledby=ready] li").first();
          await first.getByText("Live data", { exact: true }).waitFor();
          return "Live data";
        }),
      ]));
    }
    const sites = all ? SITES.filter((s) => s.key !== DEFAULT_SITE_KEY) : SITES.filter((s) => s.key === site);
    if (sites.length) {
      const { openAvon, siteDatabase } = await tsImport("../lib/live.ts", import.meta.url);
      const { tables } = await tsImport("../lib/module_bindings/index.ts", import.meta.url);
      for (const entry of sites) {
        const route = `/console?site=${entry.key}`;
        if (entry.key === DEFAULT_SITE_KEY) {
          results.push(await check(browser, url, route, defaultConsole));
          continue;
        }
        let board;
        try {
          const conn = await openAvon(db.uri, siteDatabase(entry.key, db.base));
          try { board = await readSite(conn, tables); } finally { conn.disconnect(); }
        } catch (error) {
          console.log(`FAIL ${route} · cannot read ${siteDatabase(entry.key, db.base)}: ${String(error?.message ?? error).split("\n")[0]}`);
          results.push(false);
          continue;
        }
        results.push(await check(browser, url, route, (page) => siteConsole(page, board)));
      }
    }
    if (results.includes(false)) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().then(() => process.exit()).catch((error) => {
  console.error(`[cloud check] ${String(error?.message ?? error).split("\n")[0]}`);
  process.exit(1);
});
