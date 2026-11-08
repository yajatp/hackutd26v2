#!/usr/bin/env node
// Read-only checks against the hosted screens, as seen by a judge in Chrome.
import { parseArgs } from "node:util";
import { launchBrowser, loadPlaywright } from "./e2e/playwright.mjs";
import { readConsole } from "./e2e/screens.mjs";

const EXPECT = {
  facility: "S5 · FACILITY C",
  doThis: "Do this: Call 1 truck now, 1 trip",
  cost: "$905",
  countdown: "trips in 2h 03m",
};

async function check(browser, url, route, verify, viewport) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(12000);
  const badge = page.locator("header [role=status]").first();
  try {
    const response = await page.goto(new URL(route, url).href, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "unavailable"}`);
    const pattern = route === "/console" ? /\bLIVE\b.*\bms\b/ : /\bLIVE\b/;
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

async function main() {
  const { values: { url } } = parseArgs({ options: {
    url: { type: "string", default: "https://avon-hackutd26.vercel.app" },
  } });
  const { chromium } = loadPlaywright();
  const browser = await launchBrowser(chromium, false);
  try {
    const results = await Promise.all([
      check(browser, url, "/console", async (page) => {
        await page.waitForFunction(() => [...document.querySelectorAll("main section > header")].some((h) => /pump failed/i.test(h.textContent)), null, { timeout: 12000 });
        const { live, top } = await page.evaluate(readConsole);
        if (live !== "LIVE") throw new Error(`console status is ${live}`);
        for (const [field, want] of Object.entries(EXPECT)) {
          if (top?.[field] !== want) throw new Error(`${field} reads "${top?.[field] ?? "missing"}", expected "${want}"`);
        }
        return Object.values(top).slice(0, 4).join(" · ");
      }),
      check(browser, url, "/attack", async () => "", { width: 360, height: 740 }),
      check(browser, url, "/vr", async (page) => {
        const first = page.locator("section[aria-labelledby=ready] li").first();
        await first.getByText("Live data", { exact: true }).waitFor();
        return "Live data";
      }),
    ]);
    if (results.includes(false)) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[cloud check] ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
});
