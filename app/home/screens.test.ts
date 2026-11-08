import { test } from "node:test";
import assert from "node:assert/strict";
import { hintFor, hrefFor, SCREENS, siteParam, subtitleFor, type LiveFacts } from "./screens.ts";

const facts = (over: Partial<LiveFacts> = {}): LiveFacts => ({
  status: "connected", failures: 2, doNothing: 9957, plans: 1810, faults: 0, facilities: 18, lockdown: false, rttMs: 1.43, ...over,
});

test("the index is the demo order, with the map at 5 and the console first", () => {
  assert.deepEqual(SCREENS.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(SCREENS.map((s) => s.href), ["/console", "/attack", "/twin", "/insight", "/map", "/box", "/spacetime", "/"]);
});

test("a known ?site= is carried to every screen; an unknown one is dropped", () => {
  assert.equal(siteParam("eagleford"), "eagleford");
  assert.equal(siteParam(["williston", "x"]), "williston");
  assert.equal(siteParam("EagleFord"), "eagleford");
  assert.equal(siteParam("nowhere"), null);
  assert.equal(siteParam("<script>"), null);
  assert.equal(siteParam(undefined), null);
  assert.equal(hrefFor("/console", "eagleford"), "/console?site=eagleford");
  assert.equal(hrefFor("/console", null), "/console");
  assert.equal(subtitleFor(null), "A night shift on a Permian oil site, live on SpacetimeDB.");
  assert.equal(subtitleFor("permian"), "A night shift on a Permian oil site, live on SpacetimeDB.");
  assert.equal(subtitleFor("eagleford"), "A night shift at San Antonio South in the Eagle Ford, live on SpacetimeDB.");
});

test("live hints read like the console", () => {
  assert.deepEqual(hintFor("console", facts()), { text: "▲ 2 pump failures", tone: "alert" });
  assert.deepEqual(hintFor("console", facts({ failures: 0 })), { text: "No pump failures", tone: "ok" });
  assert.equal(hintFor("console", facts({ failures: null })), null);
  assert.deepEqual(hintFor("attack", facts({ faults: 1 })), { text: "● 1 simulated fault live", tone: "warn" });
  assert.deepEqual(hintFor("insight", facts()), { text: "Savings $8,147", tone: "quiet" });
  assert.deepEqual(hintFor("spacetime", facts()), { text: "1.4 ms round trip", tone: "quiet" });
  assert.deepEqual(hintFor("box", facts({ lockdown: true })), { text: "▲ LOCKDOWN", tone: "alert" });
  assert.deepEqual(hintFor("map", facts()), { text: "6 sites", tone: "quiet" });
  assert.deepEqual(hintFor("console", facts({ status: "disconnected" })), { text: "Disconnected", tone: "quiet" });
  assert.equal(hintFor("vr", facts()), null);
});
