// Run: npx tsx --test app/console/board.test.tsx
// The console board without a browser: the real <Board> inside the real <AvonProvider> (no effects
// run in renderToStaticMarkup, so nothing connects), read the way scripts/e2e/screens.mjs
// readConsole() reads the live page: the fix card's header, "Do this:" and its cost, the tank
// sensor warning, "Sensors to check", and no all-caps classes left on the board.
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Alert, ConsoleView, SensorIssue } from "../../lib/eog/alerts.ts";
import type { DetectedEvent } from "../../lib/eog/types.ts";
import { AvonProvider } from "../../lib/live.ts";
import { Board, ConnBanner } from "./Board";

// Under this repo's "jsx": "preserve", tsx compiles JSX to React.createElement (Next uses the
// automatic runtime), so the components need React as a global when rendered here.
(globalThis as { React?: typeof React }).React = React;

// ---- a tiny tree from React's static markup ---------------------------------

interface El { tag: string; attrs: Record<string, string>; kids: Node[]; parent: El | null }
type Node = El | string;

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function decode(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

function parse(html: string): El {
  const root: El = { tag: "#root", attrs: {}, kids: [], parent: null };
  let cur = root;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z0-9]+)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g)) {
    if (m[5] !== undefined) { cur.kids.push(decode(m[5])); continue; }
    const [, close, tag] = m;
    if (close) {
      assert.equal(cur.tag, tag, `markup closes </${tag}> inside <${cur.tag}>`);
      cur = cur.parent!;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[3].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) attrs[a[1]] = decode(a[2] ?? "");
    const el: El = { tag, attrs, kids: [], parent: cur };
    cur.kids.push(el);
    if (!VOID.has(tag) && !m[4]) cur = el;
  }
  assert.equal(cur, root, "markup left an element open");
  return root;
}

const children = (e: El): El[] => e.kids.filter((k): k is El => typeof k !== "string");
const all = (e: El): El[] => children(e).flatMap((c) => [c, ...all(c)]);
const find = (e: El, tag: string): El[] => all(e).filter((x) => x.tag === tag);
const next = (e: El): El | undefined => { const sib = children(e.parent!); return sib[sib.indexOf(e) + 1]; };

// The visible words joined by single spaces, as readConsole's words() does.
function words(e: El | undefined): string {
  if (!e) return "";
  const out: string[] = [];
  const walk = (n: Node) => {
    if (typeof n === "string") { const t = n.replace(/\s+/g, " ").trim(); if (t) out.push(t); }
    else n.kids.forEach(walk);
  };
  walk(e);
  return out.join(" ");
}

// ---- fixture: the mock_test top card, a second card on a lying tank sensor, one inspection ----

const NOW = Date.UTC(2026, 9, 10, 15, 30) / 1000;

function facility(id: string): Alert["facility"] {
  return {
    id, lat: 31.9, lon: -102.1, wells: [],
    tank: { id: `${id}_TANK`, capacity_bbl: 500 },
    pump: { id: `${id}_PUMP`, max_flow_bpd: 2000, start_level_pct: 60, stop_level_pct: 20 },
    pipeline: { id: `${id}_LINE`, max_bpd: 4000, max_pressure_psi: 900 },
  };
}

function event(category: DetectedEvent["category"], facility_id: string, asset_id: string, extra: Partial<DetectedEvent> = {}): DetectedEvent {
  return {
    category, system_id: "S5", facility_id, asset_id, onset_unix: NOW - 1800, end_unix: null, status: "ongoing",
    evidence: ["level rising 9%/h with the pump off"], ...extra,
  };
}

function failure(id: string, fid: string, hours: number, cost: number, shares: string[], extra: Partial<Alert> = {}): Alert {
  return {
    id, facility: facility(fid), hours_to_limit: hours, lost_revenue_per_hour: 1200,
    action: "Call a truck", event: event("pump_failure", fid, `${fid}_PUMP`, { level_pct: 73.5 }),
    fix: {
      plan: {
        event_id: id, kind: "trucks", trucks: 1, trips_per_truck: 1, shut_ins: [], cost,
        truck_cost: cost, shut_in_cost: 0, trip_at_min: 123, peak_pct: null, busy_until_min: 60,
      },
      label: "truck", headline: "Call 1 truck now, 1 trip", details: ["Truck arrives 17:10"],
      trip_at_unix: NOW + 7380, repair_done_unix: NOW + 16200,
      alternatives: [
        { label: "Call 2 trucks now, 1 trip each", cost: 1810, why: "$905 more" },
        { label: "Do nothing", cost: 5642, why: "wells shut in 17:33 to 20:00" },
      ],
      shares_fleet_with: shares, fleet: 2,
    },
    ...extra,
  };
}

const LYING = "Level reads flat at 41% while 3 wells keep filling it.";

const TOP = failure("a1", "S5_FACILITY_C", 2.05, 905, ["S5_FACILITY_B"]);
const SECOND = failure("a2", "S5_FACILITY_B", 3.433, 905, ["S5_FACILITY_C"], {
  tank_sensor: { state: "lying", evidence: LYING, simulated: true },
});
const INSPECT: Alert = {
  id: "a3", facility: facility("S2_FACILITY_A"), hours_to_limit: null, lost_revenue_per_hour: 0,
  action: "Send someone to look at the pump", event: event("pump_degradation", "S2_FACILITY_A", "S2_FACILITY_A_PUMP"),
};

const SENSORS: SensorIssue[] = [
  { key: "S5_FACILITY_B_TANK|level_pct", asset_id: "S5_FACILITY_B_TANK", metric: "level_pct", facility_id: "S5_FACILITY_B", state: "lying", evidence: LYING, simulated: true },
  { key: "S1_PIPE|pressure_psi", asset_id: "S1_PIPE", metric: "pressure_psi", facility_id: null, state: "dead", evidence: "No reading since 14:10.", simulated: false },
];

const VIEW: ConsoleView = {
  now: NOW,
  alerts: [TOP, SECOND, INSPECT],
  sensors: SENSORS,
  events: [TOP.event, SECOND.event, INSPECT.event],
  totals: { do_nothing: 9957, plans: 1810 },
};

function render(view: ConsoleView = VIEW): El {
  return parse(renderToStaticMarkup(<AvonProvider><main><Board view={view} dataset="mock_test_2026-10-10T1530" /></main></AvonProvider>));
}

// The fix cards, found the way readConsole() finds them.
function cards(root: El): El[] {
  return find(root, "section").filter((s) => /pump failed/i.test(words(children(s).find((c) => c.tag === "header"))));
}

// ---- tests ------------------------------------------------------------------

test("a pump-failure card keeps the header, Do this and cost structure the e2e reads", () => {
  const root = render();
  const [top] = cards(root);
  assert.ok(top, "no <section> with a direct <header> saying pump failed");
  const header = children(top).find((c) => c.tag === "header")!;
  assert.equal(words(children(header)[0]), "S5 · FACILITY C · pump failed");
  assert.equal(words(children(header)[1]), "▲ trips in 2h 03m");
  const doP = find(top, "p").find((p) => words(p).startsWith("Do this:"));
  assert.ok(doP, "no <p> starting Do this:");
  assert.equal(words(doP), "Do this: Call 1 truck now, 1 trip");
  assert.equal(next(doP)?.tag, "p", "the cost is not the next sibling <p>");
  assert.equal(words(next(doP)), "$905");
  assert.ok(find(top, "button").some((b) => words(b) === "Confirm this plan"), "no Confirm this plan button");
  assert.equal(cards(root).length, 2);
});

test("a card on a lying, simulated tank sensor says CHECK THE TANK SENSOR FIRST and SIMULATED", () => {
  const second = cards(render())[1];
  assert.equal(words(children(children(second).find((c) => c.tag === "header")!)[0]), "S5 · FACILITY B · pump failed");
  const check = find(second, "p").find((p) => words(p).startsWith("CHECK THE TANK SENSOR FIRST"));
  assert.ok(check, "no CHECK THE TANK SENSOR FIRST line");
  assert.match(words(check), /^CHECK THE TANK SENSOR FIRST: ▲ LYING SIMULATED$/);
  assert.ok(words(second).includes(`${LYING} This plan uses its reading.`));
  assert.ok(find(second, "button").some((b) => words(b) === "Open an incident in the Darkroom"));
  assert.ok(!words(cards(render())[0]).includes("CHECK THE TANK SENSOR FIRST"), "the healthy card warns too");
});

test("Sensors to check: an <h2> whose parent's <li> each hold the head line, then the evidence", () => {
  const root = render();
  const h2 = find(root, "h2").find((h) => words(h) === "Sensors to check");
  assert.ok(h2, "no <h2> Sensors to check");
  const items = find(h2.parent!, "li");
  assert.equal(items.length, 2);
  assert.equal(words(children(items[0])[0]), "▲ LYING S5 · FACILITY B TANK level SIMULATED");
  assert.equal(words(children(items[0])[1]), LYING);
  assert.equal(words(children(items[1])[0]), "▲ DEAD S1 · PIPE pressure");
  assert.equal(words(children(items[1])[1]), "No reading since 14:10.");
});

test("no element on the board carries the Tailwind class uppercase", () => {
  for (const view of [VIEW, { ...VIEW, alerts: [], sensors: [] }]) {
    const offenders = all(render(view)).filter((e) => (e.attrs.class ?? "").split(/\s+/).includes("uppercase"));
    assert.deepEqual(offenders.map((e) => `<${e.tag} class="${e.attrs.class}">`), []);
  }
});

test("the board still says what it said", () => {
  const t = words(render());
  for (const want of [
    "2 pump failures · doing nothing costs $9,957 · these plans cost $1,810",
    "Why not the others", "Call 2 trucks now, 1 trip each", "$1,810", "$905 more",
    "Truck arrives 17:10 · tank would trip 17:33 · repair done 20:00 · level now 73.5%",
    "Shares S5's 2 trucks with S5 · FACILITY B.",
    "Times come from noisy readings: same decision, start times within about 3 min.",
    "Needs a field inspection", "● Pump wearing out · S2 · FACILITY A PUMP", "Send someone to look at the pump",
    "Check the sensor on site first.", "Send someone with a replacement sensor",
    "All 3 problems found in this data",
  ]) {
    assert.ok(t.includes(want), `missing: ${want}`);
  }
  const none = words(render({ ...VIEW, alerts: [], sensors: [] }));
  assert.ok(none.includes("✓ No pump failures right now. Every tank is draining normally."));
});

test("ConnBanner speaks only when the live data is lost", () => {
  assert.equal(renderToStaticMarkup(<ConnBanner conn="connected" />), "");
  const lost = parse(renderToStaticMarkup(<ConnBanner conn="disconnected" />));
  const p = children(lost)[0];
  assert.equal(p.attrs.role, "alert");
  assert.equal(words(p), "▲ DISCONNECTED from the live data. Showing the last data received.");
});
