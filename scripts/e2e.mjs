#!/usr/bin/env node
// Browser rehearsal of the judge path on the real screens: the judge works
// the night shift on the console, a teammate plays the bad night on Phone 1. One headless Chrome,
// two pages: the console (1366x900, /console) and the phone remote (360x740, /attack).
//
//   npm run e2e                     one run of steps 0-7
//   npm run e2e -- --runs 3         three runs in a row, timing and console latency for each
//   npm run e2e -- --headed         a visible browser, with a short pause after each step
//   npm run e2e -- --lockdown       enter, verify and end LOCKDOWN after step 5
//
// 0 npm run demo:reset (clean start)  1 console LIVE, read the top fix card (mock_test: S5 · FACILITY C,
// "Do this: Call 1 truck now, 1 trip", $905, "trips in 2h 03m")  2 Confirm this plan -> CONFIRMED
// 3 phone: pick that tank, tap Fake -> "console: LYING"  4 console: Sensors to check LYING + SIMULATED,
// top card CHECK THE TANK SENSOR FIRST + CONFIRMED, THEN CHANGED; latency from the tap  5 Open an
// incident in the Darkroom -> AV-XXXX-XXXX + 64-hex fingerprint  6 phone: Clear all -> console back
// to plain CONFIRMED  7 npm run demo:reset again -> clean start.
// One PASS/FAIL line per step, a line per run with its time and the latency, then E2E PASSED or
// E2E FAILED (n). Exit 0 passed, 1 failed, 2 Playwright or a browser missing.
// Screenshots (console left, phone right): ../.playwright-mcp/e2e-<run>-<step>.png
// Failed steps also save browser console errors in e2e-<run>-<step>.console.log.
//
// Uses the running dev server (:3000) and SpacetimeDB (:3001): never builds, never starts or stops
// either, reaches the Spacetime CLI only through npm run demo:reset, opens only /console and /attack.
// A step that fails while a live connection dropped (another lane republishing the module) is
// retried once, and the retry is printed.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { argv, exit, platform } from "node:process";
import { fileURLToPath } from "node:url";
import { launchBrowser, loadPlaywright } from "./e2e/playwright.mjs";
import { armWatch, readConsole, readPhone, saveShot, tapHook } from "./e2e/screens.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = resolve(ROOT, "..", ".playwright-mcp");
const BASE = "http://127.0.0.1:3000";
const MOCK = "mock_test_2026-10-10T1530";
// What the top card must read on mock_test after a clean load (scripts/smoke.mjs KNOWN, reset-avon.mjs).
const EXPECT = { facility: "S5 · FACILITY C", doThis: "Do this: Call 1 truck now, 1 trip", cost: "$905", countdown: "trips in 2h 03m" };
const WITHIN = 5000;    // each reaction on the judge path must show within 5 s
const SETTLE = 20000;   // after a reset the screens get every row again
const RECONNECT = /DISCONNECTED|Connecting|disconnect|reconnect|ECONNREFUSED|ECONNRESET|socket hang up|fetch failed|not answering|ingest failed|websocket/i;
const USAGE = "usage: npm run e2e -- [--runs N] [--headed] [--lockdown]";

const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const message = (e) => (e instanceof Error ? e.message : String(e?.message ?? e)).split("\n")[0];

function parseArgs(args) {
  const o = { runs: 1, headed: false, lockdown: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--headed") o.headed = true;
    else if (a === "--lockdown") o.lockdown = true;
    else if (a === "--runs") o.runs = Number(args[++i]);
    else if (a.startsWith("--runs=")) o.runs = Number(a.slice(7));
    else if (a === "--help" || a === "-h") { console.log(USAGE); exit(0); }
    else { console.log(`unknown argument ${a}. ${USAGE}`); exit(1); }
  }
  if (!Number.isInteger(o.runs) || o.runs < 1) { console.log(`--runs needs a whole number of 1 or more. ${USAGE}`); exit(1); }
  return o;
}

// Polls read() until problems(state) is empty; otherwise fails with the last problems seen.
async function until(read, problems, ms, what) {
  const end = Date.now() + ms;
  for (;;) {
    const state = await read();
    const p = problems(state);
    if (!p.length) return state;
    if (Date.now() >= end) throw new Error(`${what} not seen within ${secs(ms)}: ${p.join("; ")}`);
    await sleep(50);
  }
}

const both = (s) => async () => ({ c: await s.con.evaluate(readConsole), p: await s.att.evaluate(readPhone) });

function liveProblems({ c, p }) {
  const out = [];
  if (c.live !== "LIVE") out.push(`console header shows ${c.live}, not LIVE`);
  if (p.live !== "LIVE") out.push(`phone header shows ${p.live}, not LIVE`);
  return out;
}

// The state a judge should walk up to: nothing confirmed, no faults, no sensor warnings.
function cleanProblems(st, facility) {
  const { c, p } = st;
  const out = liveProblems(st);
  if (!c.top) return [...out, "the console has no fix card"];
  if (facility && c.top.facility !== facility) out.push(`top card is ${c.top.facility}, expected ${facility}`);
  if (!c.top.confirmBtn) out.push("top card has no 'Confirm this plan' button");
  if (c.top.confirmed) out.push("top card already says CONFIRMED");
  if (c.sensors) out.push(`'Sensors to check' is showing (${c.sensors.map((x) => x.head).join(", ")})`);
  if (c.evidence.length) out.push("a Darkroom reference panel is open");
  if (p.active !== 0) out.push(`phone shows Active faults (${p.active})`);
  return out;
}

// npm run demo:reset, the same command the team runs between judges.
function demoReset() {
  return new Promise((done) => {
    const child = spawn(platform === "win32" ? "npm.cmd" : "npm", ["run", "demo:reset"], { cwd: ROOT, shell: platform === "win32" });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    const timer = setTimeout(() => child.kill(), 180000);
    child.on("error", (e) => { clearTimeout(timer); done({ code: -1, out: String(e) }); });
    child.on("close", (code) => { clearTimeout(timer); done({ code, out }); });
  });
}

async function reset() {
  const { code, out } = await demoReset();
  const ready = out.match(/READY in ([\d.]+ s)/);
  if (code !== 0 || !ready) {
    const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
    const why = lines.filter((l) => /NOT READY|not answering|does not exist|failed|error/i.test(l)).slice(-2).join(" / ") || lines.slice(-1)[0];
    throw new Error(`npm run demo:reset exit ${code}: ${why ?? "no output"}`);
  }
  const top = (out.match(/^\s*top card\s+(\S+)/m) ?? [])[1];
  const faults = ((out.match(/^\s*faults\s+(.+)$/m) ?? [])[1] ?? "").trim();
  return `npm run demo:reset READY in ${ready[1]}; top card ${top}; ${faults}`;
}

// ---- the eight steps -------------------------------------------------------------------------

async function stepReset() {
  return reset();
}

async function stepTopCard(s, r) {
  const st = await until(both(s), (x) => {
    const out = cleanProblems(x);
    if (x.c.top && x.c.dataset === MOCK) {
      for (const [k, want] of Object.entries(EXPECT)) if (x.c.top[k] !== want) out.push(`${k} reads '${x.c.top[k]}', expected '${want}'`);
    }
    return out;
  }, SETTLE, "the clean top card");
  const t = st.c.top;
  r.facility = t.facility;
  r.tank = t.facility.replace(/FACILITY/i, "TANK");
  const known = st.c.dataset === MOCK ? "the mock_test values" : `no expected values on file for ${st.c.dataset}`;
  return `${st.c.live} · ${st.c.dataset} · top card ${t.facility} · '${t.doThis}' · ${t.cost} · '${t.countdown}' (${known})`;
}

const topCard = (s) => s.con.locator("main section", { has: s.con.locator("header", { hasText: /pump failed/i }) }).first();

async function stepConfirm(s, r) {
  const now = await s.con.evaluate(readConsole);
  if (!now.top?.confirmed) await topCard(s).getByRole("button", { name: "Confirm this plan" }).click({ timeout: WITHIN });
  const st = await until(both(s), (x) => {
    const out = liveProblems(x);
    if (!x.c.top?.plain) out.push(`top card does not say CONFIRMED by the night shift (${x.c.top?.facility ?? "no card"})`);
    if (x.c.top && x.c.top.facility !== r.facility) out.push(`top card is now ${x.c.top.facility}, expected ${r.facility}`);
    return out;
  }, WITHIN, "CONFIRMED on the top card");
  return `clicked 'Confirm this plan' on ${r.facility}: CONFIRMED by the night shift at ${st.c.top.at}`;
}

async function stepFake(s, r, attempt) {
  let st = await until(both(s), liveProblems, WITHIN * 2, "both screens LIVE");
  if (attempt > 1 && st.p.active > 0) {
    // The first try may have left its fault on: clear it so the latency is measured again from a clean console.
    await s.att.getByRole("button", { name: "Clear all" }).tap({ timeout: WITHIN });
    st = await until(both(s), (x) => [...(x.c.top?.check ? ["console still shows the sensor warning"] : []), ...(x.p.active ? [`phone Active faults (${x.p.active})`] : [])], WITHIN * 2, "the first try's fault cleared");
  }
  if (st.c.top?.check) throw new Error(`the console already says CHECK THE TANK SENSOR FIRST before the tap (${st.c.top.check})`);
  const label = `${r.facility} tank`;
  const radio = s.att.getByRole("radio", { name: new RegExp(esc(label), "i") });
  await radio.tap({ timeout: WITHIN });
  const picked = await until(both(s), (x) => (x.p.radios.some((o) => o.on && o.text.toUpperCase().includes(label.toUpperCase())) ? [] : [`'${label}' is not picked on the phone`]), WITHIN, "the tank picked");
  const shown = picked.p.radios.find((o) => o.on).text.replace(/^[◉○]\s*/, "");
  if (!(await s.con.evaluate(armWatch))) throw new Error("the console changed before the tap; cannot time it");
  await s.att.evaluate(() => { window.__e2eTaps = []; });
  const before = Date.now();
  await s.att.getByRole("button", { name: /^Fake\b/ }).tap({ timeout: WITHIN });
  const taps = await s.att.evaluate(() => window.__e2eTaps ?? []);
  r.tapAt = taps.filter((t) => /^Fake/.test(t.text)).map((t) => t.at).pop() ?? before;
  r.latency = null;
  r.retried = attempt > 1;
  const want = new RegExp(`console: ▲? ?LYING`);
  const end = r.tapAt + WITHIN - Date.now();
  const ph = await until(async () => s.att.evaluate(readPhone), (p) => {
    const li = p.faults.find((f) => f.toUpperCase().startsWith(label.toUpperCase()));
    if (!li) return [`no active fault for ${label} on the phone (Active faults (${p.active}))${p.alert ? `; phone says ${p.alert}` : ""}`];
    return want.test(li) ? [] : [`phone line reads '${li}', not 'console: LYING'`];
  }, Math.max(end, 0), "'console: LYING' on the phone");
  const li = ph.faults.find((f) => f.toUpperCase().startsWith(label.toUpperCase()));
  return `picked '${shown}', tapped Fake: phone shows Active faults (${ph.active}), '${li.replace(/ Clear$/, "")}'`;
}

async function stepConsoleReacts(s, r, attempt) {
  // A retry times a fresh tap: the first tap's latency would include the reconnect.
  if (attempt > 1) await stepFake(s, r, attempt);
  const st = await until(both(s), (x) => {
    const { c } = x;
    const out = liveProblems(x);
    const line = c.sensors?.find((y) => y.head.toUpperCase().includes(r.tank.toUpperCase()));
    if (!c.sensors) out.push("'Sensors to check' is not showing");
    else if (!line) out.push(`no ${r.tank} line under 'Sensors to check' (${c.sensors.map((y) => y.head).join(", ")})`);
    else {
      if (!/\bLYING\b/.test(line.head)) out.push(`${r.tank} line reads '${line.head}', not LYING`);
      if (!/\bSIMULATED\b/.test(line.head)) out.push(`${r.tank} line has no SIMULATED badge`);
    }
    if (!c.top) return [...out, "no fix card"];
    if (c.top.facility !== r.facility) out.push(`top card is now ${c.top.facility}, expected ${r.facility}`);
    if (!c.top.check) out.push("top card has no 'CHECK THE TANK SENSOR FIRST'");
    else if (!/LYING/.test(c.top.check) || !/SIMULATED/.test(c.top.check)) out.push(`top card warning reads '${c.top.check}'`);
    if (!c.top.changed) out.push("top card does not say 'CONFIRMED, THEN CHANGED'");
    if (c.changedAt === null) out.push("the latency watcher saw no change (page reloaded?)");
    return out;
  }, WITHIN, "the console's reaction to the Fake tap");
  r.latency = st.c.changedAt - r.tapAt;
  if (r.latency > WITHIN) throw new Error(`the console changed ${r.latency} ms after the tap, over ${secs(WITHIN)}`);
  const line = st.c.sensors.find((y) => y.head.toUpperCase().includes(r.tank.toUpperCase()));
  return `Sensors to check: '${line.head}' ('${line.evidence}'); top card: '${st.c.top.check}', CONFIRMED, THEN CHANGED; it now reads '${st.c.top.doThis}' ${st.c.top.cost}`;
}

async function stepIncident(s, r) {
  const now = await s.con.evaluate(readConsole);
  if (!now.evidence.some((e) => e.ref)) await s.con.getByRole("button", { name: "Open an incident in the Darkroom" }).first().click({ timeout: WITHIN });
  const st = await until(both(s), (x) => {
    const e = x.c.evidence[0];
    if (!e) return ["no 'Carry this to the Darkroom box' panel"];
    const out = [];
    if (!e.ref) out.push("no AV-XXXX-XXXX reference in the panel");
    if (!e.hash) out.push("no 64-hex fingerprint in the panel");
    if (e.ref && e.hash && e.ref !== `AV-${e.hash.slice(0, 4).toUpperCase()}-${e.hash.slice(4, 8).toUpperCase()}`) out.push(`${e.ref} does not match fingerprint ${e.hash}`);
    return out;
  }, WITHIN, "the Darkroom reference");
  const { ref, hash } = st.c.evidence[0];
  const same = r.firstRef && r.i > 1 ? (ref === r.firstRef ? "; same as run 1" : `; run 1 gave ${r.firstRef}`) : "";
  r.ref = ref;
  return `clicked 'Open an incident in the Darkroom': ${ref}, fingerprint ${hash.slice(0, 16)}… (64 hex, the reference matches it)${same}`;
}

const lockdownDialog = (s) => s.con.getByRole("alertdialog", { name: "LOCKDOWN", exact: true });
const faultVerbs = ["Kill", "Fake", "Drift"];

async function stepEnterLockdown(s) {
  const dialog = lockdownDialog(s);
  if (!(await dialog.isVisible())) {
    // The UI confirms after a 600 ms hold, measured on animation frames.
    await topCard(s).getByRole("button", { name: "Lock down and move to the Darkroom", exact: true })
      .click({ delay: 750, timeout: WITHIN });
  }
  await dialog.waitFor({ timeout: WITHIN });
  return "held 'Lock down and move to the Darkroom' on the top card; console shows LOCKDOWN";
}

async function stepVerifyLockdown(s, r) {
  await until(both(s), (x) => {
    const { c, p } = x;
    const out = liveProblems(x);
    if (c.lockdown !== "settled") out.push(`console lockdown is ${c.lockdown ?? "absent"}`);
    if (c.lockdownRef !== r.ref) out.push(`lockdown evidence shows ${c.lockdownRef ?? "no reference"}, expected ${r.ref} from step 5`);
    if (!p.lockdownBanner?.includes(r.ref)) out.push(`phone lockdown banner does not show ${r.ref}`);
    if (!faultVerbs.every((verb) => p.faultButtons[verb] === true)) out.push("phone Kill, Fake and Drift are not all disabled");
    return out;
  }, WITHIN, "lockdown evidence and phone lockout");
  return `console evidence and phone banner both show ${r.ref}; Kill, Fake and Drift are disabled`;
}

async function stepEndLockdown(s, r) {
  const active = s.con.locator('[data-lockdown]:not([data-lockdown="ending"])');
  if (await active.isVisible()) {
    await active.getByRole("button", { name: "End lockdown", exact: true }).click({ timeout: WITHIN });
  }
  await until(both(s), (x) => {
    const { c, p } = x;
    const out = liveProblems(x);
    if (c.lockdown) out.push("console lockdown is still showing");
    if (c.top?.facility !== r.facility || !c.top.confirmBtn || c.top.confirmed) out.push("the top card is not ready to confirm again");
    if (p.lockdownBanner) out.push("phone lockdown banner is still showing");
    if (!faultVerbs.every((verb) => p.faultButtons[verb] === false)) out.push("phone Kill, Fake and Drift are not all enabled");
    return out;
  }, WITHIN, "lockdown ended on both screens");
  for (const verb of faultVerbs) {
    await s.att.getByRole("button", { name: new RegExp(`^${verb}\\b`) }).tap({ trial: true, timeout: WITHIN });
  }
  return "ended lockdown; top card asks to confirm again; Kill, Fake and Drift can be tapped";
}

async function stepClear(s, r) {
  const now = await s.att.evaluate(readPhone);
  if (now.active !== 0) await s.att.getByRole("button", { name: "Clear all" }).tap({ timeout: WITHIN });
  const st = await until(both(s), (x) => {
    const { c, p } = x;
    const out = liveProblems(x);
    if (p.active !== 0) out.push(`phone shows Active faults (${p.active})`);
    if (c.sensors) out.push(`'Sensors to check' still shows ${c.sensors.map((y) => y.head).join(", ")}`);
    if (c.top?.check) out.push("top card still says CHECK THE TANK SENSOR FIRST");
    if (c.top?.changed) out.push("top card still says CONFIRMED, THEN CHANGED");
    if (s.lockdown) {
      if (!c.top?.confirmBtn || c.top.confirmed) out.push("top card is not ready to confirm again");
    } else if (!c.top?.plain) out.push("top card does not say CONFIRMED by the night shift");
    if (c.top && c.top.facility !== r.facility) out.push(`top card is now ${c.top.facility}, expected ${r.facility}`);
    return out;
  }, WITHIN, s.lockdown ? "the unconfirmed console with no sensor warnings" : "the console back to plain CONFIRMED");
  const plan = s.lockdown ? "ready to confirm again" : `CONFIRMED by the night shift at ${st.c.top.at}`;
  return `tapped Clear all: phone Active faults (0); console: Sensors to check gone, top card '${st.c.top.doThis}' ${st.c.top.cost}, ${plan}`;
}

async function stepResetAgain(s, r) {
  const said = await reset();
  const facility = r.facility ?? EXPECT.facility;
  const st = await until(both(s), (x) => cleanProblems(x, facility), SETTLE, "the clean start after the reset");
  return `${said}; console back to the clean start (${st.c.top.facility}, 'Confirm this plan', no sensors to check); phone Active faults (0)`;
}

const STEPS = [
  { n: 0, label: "reset", needs: [], fn: stepReset },
  { n: 1, label: "top card", needs: [0], fn: stepTopCard },
  { n: 2, label: "confirm", needs: [1], fn: stepConfirm },
  { n: 3, label: "phone Fake", needs: [1], fn: stepFake },
  { n: 4, label: "console reacts", needs: [2, 3], fn: stepConsoleReacts },
  { n: 5, label: "Darkroom reference", needs: [4], fn: stepIncident },
  { n: 6, label: "phone Clear all", needs: [2, 3], fn: stepClear },
  { n: 7, label: "reset again", needs: [], fn: stepResetAgain },
];

const LOCKDOWN_STEPS = [
  { n: "L1", label: "enter LOCKDOWN", needs: [5], fn: stepEnterLockdown },
  { n: "L2", label: "verify LOCKDOWN", needs: ["L1"], fn: stepVerifyLockdown },
  // End the lockdown even if the evidence or phone assertion failed.
  { n: "L3", label: "end LOCKDOWN", needs: ["L1"], fn: stepEndLockdown },
];

// Runs one step. At most one retry, and only when a live connection dropped during the step or the
// error names a lost connection (another lane republishing the module). The retry is printed.
async function runStep(s, r, step) {
  const t = performance.now();
  let retried = false;
  for (let attempt = 1; ; attempt++) {
    const drops = s.drops.length;
    try {
      const detail = await step.fn(s, r, attempt);
      return { ok: true, line: `PASS  ${step.n} ${step.label}: ${detail}  [${secs(performance.now() - t)}]${retried ? "  (passed on the retry)" : ""}` };
    } catch (e) {
      const dropped = s.drops.slice(drops);
      const reconnect = dropped.length > 0 || RECONNECT.test(message(e));
      if (attempt === 1 && reconnect) {
        const why = dropped.length ? `the ${[...new Set(dropped)].join(" and ")} lost its live connection during the step` : "the error names a lost connection";
        console.log(`RETRY ${step.n} ${step.label}: ${why} (${message(e)}). Waiting for LIVE, then one more try.`);
        retried = true;
        await until(both(s), liveProblems, 30000, "both screens LIVE").catch(() => {});
        continue;
      }
      return { ok: false, line: `FAIL  ${step.n} ${step.label}: ${message(e)}  [${secs(performance.now() - t)}]${retried ? "  (after one retry)" : ""}` };
    }
  }
}

async function runOnce(s, i, runs, firstRef) {
  const t0 = performance.now();
  const r = { i, facility: null, tank: null, tapAt: null, latency: null, retried: false, firstRef, ref: null };
  const passed = new Set();
  let failed = 0;
  console.log(`run ${i}/${runs}  (console 1366x900 ${BASE}/console + phone 360x740 ${BASE}/attack)`);
  const steps = s.lockdown
    ? [...STEPS.slice(0, 6), ...LOCKDOWN_STEPS, { ...STEPS[6], needs: [...STEPS[6].needs, "L3"] }, STEPS[7]]
    : STEPS;
  for (const step of steps) {
    const missing = step.needs.filter((n) => !passed.has(n));
    const res = missing.length
      ? { ok: false, line: `FAIL  ${step.n} ${step.label}: not run (needs step ${missing.join(" and ")})${typeof step.n === "string" ? "  [0.0 s]" : ""}` }
      : await runStep(s, r, step);
    if (res.ok) passed.add(step.n); else failed++;
    console.log(res.line);
    const file = join(SHOTS, `e2e-${i}-${step.n}.png`);
    try {
      await saveShot(s.comp, s.con, s.att, file, `run ${i}/${runs} · step ${step.n} ${step.label} · ${res.ok ? "PASS" : "FAIL"}`);
    } catch (e) {
      console.log(`note: no screenshot for step ${step.n}: ${message(e)}`);
    }
    const log = join(SHOTS, `e2e-${i}-${step.n}.console.log`);
    try {
      if (res.ok) rmSync(log, { force: true });
      else writeFileSync(log, `${s.consoleErrors.join("\n") || "No browser console errors recorded."}\n`);
    } catch (e) {
      console.log(`note: could not update console log for step ${step.n}: ${message(e)}`);
    }
    if (s.headed) await sleep(800);
  }
  const errs = s.errors.splice(0);
  s.consoleErrors.length = 0;
  if (errs.length) console.log(`note: ${errs.length} page error(s) in this run: ${errs.slice(0, 3).join(" || ")}`);
  const latency = r.latency !== null
    ? `console changed ${r.latency} ms after the Fake tap${r.retried ? " (timed on the retry)" : ""}`
    : "console change not timed";
  console.log(`run ${i}/${runs} ${failed ? `failed (${failed})` : "passed"} in ${secs(performance.now() - t0)} · ${latency}`);
  return { failed, ref: r.ref };
}

async function main() {
  const o = parseArgs(argv.slice(2));
  const pw = loadPlaywright();
  mkdirSync(SHOTS, { recursive: true });
  const browser = await launchBrowser(pw.chromium, o.headed);
  const s = { headed: o.headed, lockdown: o.lockdown, drops: [], errors: [], consoleErrors: [] };
  process.once("SIGINT", () => { browser.close().finally(() => exit(130)); });
  try {
    const desk = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const phone = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const comp = await browser.newContext({ viewport: { width: 1766, height: 960 } });
    s.con = await desk.newPage();
    s.att = await phone.newPage();
    s.comp = await comp.newPage();
    await s.att.addInitScript(tapHook);
    for (const [page, who] of [[s.con, "console"], [s.att, "phone"]]) {
      page.on("pageerror", (e) => {
        s.errors.push(`${who}: ${message(e)}`);
        s.consoleErrors.push(`${who} page error: ${e.stack ?? e.message}`);
      });
      page.on("console", (entry) => {
        if (entry.type() === "error") s.consoleErrors.push(`${who} console.error: ${entry.text()}`);
      });
      page.on("websocket", (ws) => {
        if (new URL(ws.url()).port === "3001") ws.on("close", () => s.drops.push(who));
      });
    }
    console.log(`e2e: Playwright ${pw.version} (${pw.dir}), ${o.headed ? "headed" : "headless"} Chrome; screenshots in ${SHOTS}`);
    for (const [page, path] of [[s.con, "/console"], [s.att, "/attack"]]) {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch((e) => e);
      if (res instanceof Error || !res?.ok()) {
        const why = res instanceof Error ? message(res) : `HTTP ${res?.status()}`;
        console.log(`FAIL  setup: ${BASE}${path} answered ${why}. Is the dev server on :3000 healthy? (this script never restarts it)`);
        return 1;
      }
    }
    let failed = 0;
    let firstRef = null;
    for (let i = 1; i <= o.runs; i++) {
      const res = await runOnce(s, i, o.runs, firstRef);
      failed += res.failed;
      firstRef ??= res.ref;
    }
    return failed;
  } finally {
    await browser.close().catch(() => {});
  }
}

main().then((failed) => {
  console.log(failed ? `E2E FAILED (${failed})` : "E2E PASSED");
  exit(failed ? 1 : 0);
}, (e) => {
  console.log(`FAIL  e2e: ${message(e)}`);
  console.log("E2E FAILED (1)");
  exit(1);
});
