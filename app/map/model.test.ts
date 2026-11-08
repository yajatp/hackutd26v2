import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, type SiteSummary } from "../../lib/fleet.ts";
import { SITES } from "../../lib/sites.ts";
import { labelRank, labelWidth, nextSort, placeLabels, pretty, shortIds, sortSites, tagsOf, toneOf, totalsOf } from "./model.ts";

const blank = summarize(SITES[0], "avon", "connected", null);
const site = (over: Partial<SiteSummary>): SiteSummary => ({ ...blank, datasetId: "x", ...over });

test("a site's tone is its worst state", () => {
  assert.equal(toneOf(site({ pumpFailures: 2, sensorIssues: 1 })), "alert");
  assert.equal(toneOf(site({ lockdown: true })), "alert");
  assert.equal(toneOf(site({ sensorIssues: 1 })), "warn");
  assert.equal(toneOf(site({ inspections: 1 })), "warn");
  assert.equal(toneOf(site({})), "ok");
  assert.equal(toneOf({ ...blank, status: "disconnected" }), "off");
  // a site that drops after answering keeps its last state
  assert.equal(toneOf(site({ status: "disconnected", pumpFailures: 1 })), "alert");
});

test("finding tags read like the console, worst first", () => {
  assert.deepEqual(tagsOf(site({ pumpFailures: 2, sensorIssues: 1 })).map((t) => `${t.icon} ${t.text}`), ["■ 2 PUMP FAILURES", "● 1 SENSOR TO CHECK"]);
  assert.deepEqual(tagsOf(site({ pumpFailures: 1 }))[0].text, "1 PUMP FAILURE");
  assert.deepEqual(tagsOf(site({})).map((t) => t.text), ["ALL CLEAR"]);
  assert.deepEqual(tagsOf({ ...blank, status: "disconnected" }).map((t) => t.text), ["NO DATA"]);
  assert.deepEqual(tagsOf({ ...blank, status: "connecting" }).map((t) => t.text), ["CONNECTING"]);
});

test("the comparison sorts by any column and flips on a second click", () => {
  const sites = [
    site({ key: "a", name: "Alpha", pumpFailures: 1, plans: 100, doNothing: 900 }),
    site({ key: "b", name: "Bravo", pumpFailures: 3, plans: 400, doNothing: 500 }),
    site({ key: "c", name: "Charlie", pumpFailures: 0, plans: 0, doNothing: 0 }),
  ];
  assert.deepEqual(sortSites(sites, { key: "pumpFailures", dir: "desc" }).map((s) => s.key), ["b", "a", "c"]);
  assert.deepEqual(sortSites(sites, { key: "saving", dir: "desc" }).map((s) => s.key), ["a", "b", "c"]);
  assert.deepEqual(sortSites(sites, { key: "name", dir: "asc" }).map((s) => s.key), ["a", "b", "c"]);
  assert.deepEqual(nextSort({ key: "plans", dir: "desc" }, "plans"), { key: "plans", dir: "asc" });
  assert.deepEqual(nextSort({ key: "plans", dir: "desc" }, "name"), { key: "name", dir: "asc" });
  assert.deepEqual(nextSort({ key: "name", dir: "asc" }, "saving"), { key: "saving", dir: "desc" });
});

test("fleet totals count live sites, failures and money", () => {
  const t = totalsOf([site({ pumpFailures: 2, plans: 10, doNothing: 50 }), site({ status: "disconnected", plans: 5, doNothing: 5 }), site({})]);
  assert.deepEqual(t, { live: 2, sites: 3, failures: 2, failingSites: 1, plans: 15, doNothing: 55 });
});

const side = (m: Map<string, { side: string; dy: number }>) => [...m].map(([k, p]) => [k, p.side]);

test("labels that would collide move or hide, worst state first, never over another marker", () => {
  const box = (key: string, x: number, y: number, rank: number, s: "left" | "right" = "right") => ({ key, x, y, side: s, w: 120, h: 36, rank });
  // two markers 20 px apart: the worse one keeps its side, the calm one flips
  assert.deepEqual(side(placeLabels([box("calm", 100, 100, 2), box("bad", 100, 120, 0)])), [["bad", "right"], ["calm", "left"]]);
  // far apart: both show on their own side, level with their dots
  const far = placeLabels([box("a", 100, 100, 0), box("b", 100, 300, 1)]);
  assert.deepEqual(side(far).sort(), [["a", "right"], ["b", "right"]]);
  assert.deepEqual([far.get("a")!.dy, far.get("b")!.dy], [0, 0]);
  // a label may not cover another site's dot: facing each other, both flip outward
  assert.deepEqual(side(placeLabels([box("a", 100, 100, 0), box("b", 160, 100, 1, "left")])), [["a", "left"], ["b", "right"]]);
  // boxed in on both sides at the same height: hidden
  assert.deepEqual(side(placeLabels([box("mid", 200, 100, 1), box("l", 150, 100, 0, "left"), box("r", 250, 100, 0)])).map(([k]) => k).sort(), ["l", "r"]);
  assert.ok(labelWidth("San Antonio South", ["3 PUMP FAILURES"]) > labelWidth("Laredo", ["1 PUMP FAILURE"]));
});

test("a label blocked level with its dot is raised or lowered before it hides", () => {
  const box = (key: string, x: number, y: number, rank: number, s: "left" | "right" = "right") => ({ key, x, y, side: s, w: 120, h: 42, rank });
  // Midland at a phone's US view: Carlsbad's dot just left, San Antonio's dot just below-right
  const m = placeLabels([box("midland", 156, 536, 0), box("carlsbad", 140, 531, 1, "left"), box("sa", 183, 563, 1)]);
  assert.deepEqual(m.get("midland"), { side: "right", dy: -13 });
});

test("labels stay inside the map and off the buttons, hint and panel", () => {
  const box = (key: string, x: number, y: number) => ({ key, x, y, side: "right" as const, w: 120, h: 42, rank: 0 });
  const bounds: [number, number, number, number] = [0, 0, 390, 320];
  // near the bottom edge: lifted so it stays inside
  assert.deepEqual(placeLabels([box("casper", 200, 300)], { bounds }).get("casper"), { side: "right", dy: -13 });
  // past the right edge: flipped left
  assert.equal(placeLabels([box("east", 330, 150)], { bounds }).get("east")?.side, "left");
  // the dot itself off the map: no label
  assert.equal(placeLabels([box("gone", 200, 400)], { bounds }).has("gone"), false);
  // a blocked box (the hint at the bottom left): a label level with it hides, one just above lifts clear
  assert.equal(placeLabels([box("west", 150, 290)], { bounds, blocked: [[0, 280, 240, 312]] }).has("west"), false);
  assert.equal(placeLabels([box("west", 150, 270)], { bounds, blocked: [[0, 280, 240, 312]] }).get("west")?.dy, -13);
});

test("the selected site ranks first, then the demo's default site, then the worst state", () => {
  assert.equal(labelRank("eagleford", "alert", "eagleford", "permian"), -2);
  assert.equal(labelRank("permian", "ok", "eagleford", "permian"), -1);
  assert.equal(labelRank("permian", "alert", null, "permian"), -1);
  assert.equal(labelRank("dorado", "alert", null, "permian"), 0);
  assert.equal(labelRank("delaware", "ok", null, "permian"), 2);
});

test("a generated site's hashed ids read short; the mock set's ids keep the console's form", () => {
  assert.equal(pretty("Facility-4dcda90a2ab0"), "Facility 4DCD");
  assert.equal(pretty("S5_FACILITY_C"), "S5 · FACILITY C");
  assert.equal(shortIds("Call 1 truck now, and shut in Well-61ae6a3d1cda at 13:18"), "Call 1 truck now, and shut in Well 61AE at 13:18");
  assert.equal(shortIds("Do this: Call 1 truck now"), "Do this: Call 1 truck now");
});
