// Run: npx tsx --test app/twin/usmap/entry.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { backToMap, entrySearch, initialEntry, MAP, pickSite, siteStatusText, siteTone } from "./entry";

test("no ?site= starts at the map; ?site=<key> goes straight to the site", () => {
  assert.deepEqual(initialEntry(""), MAP);
  assert.deepEqual(initialEntry("?site=permian"), { at: "site", site: "permian" });
  assert.deepEqual(initialEntry("?site=Delaware&x=1"), { at: "site", site: "delaware" });
  assert.deepEqual(initialEntry("?site=nowhere"), MAP);
});

test("picking a site, picking it again, unknown keys, back to the map", () => {
  const s = pickSite(MAP, "eagleford");
  assert.deepEqual(s, { at: "site", site: "eagleford" });
  assert.equal(pickSite(s, "eagleford"), s);
  assert.equal(pickSite(s, "atlantis"), s);
  assert.deepEqual(pickSite(s, "williston"), { at: "site", site: "williston" });
  assert.deepEqual(backToMap(), MAP);
});

test("the URL follows the entry state and keeps other parameters", () => {
  assert.equal(entrySearch("", { at: "site", site: "powder" }), "?site=powder");
  assert.equal(entrySearch("?site=powder", MAP), "");
  assert.equal(entrySearch("?still=1&site=powder", { at: "site", site: "dorado" }), "?still=1&site=dorado");
  assert.equal(entrySearch("?still=1&site=powder", MAP), "?still=1");
});

const base = { status: "connected" as const, pumpFailures: 0, inspections: 0, sensorIssues: 0, simulatedFaults: 0, lockdown: false, facilities: 12 };

test("site tone: red only for alerts, amber for checks, grey until it answers", () => {
  assert.equal(siteTone(base), "ok");
  assert.equal(siteTone({ ...base, status: "connecting" }), "idle");
  assert.equal(siteTone({ ...base, pumpFailures: 2 }), "alert");
  assert.equal(siteTone({ ...base, simulatedFaults: 1 }), "alert");
  assert.equal(siteTone({ ...base, lockdown: true }), "alert");
  assert.equal(siteTone({ ...base, inspections: 1 }), "warn");
  assert.equal(siteTone({ ...base, sensorIssues: 3 }), "warn");
});

test("status line in plain words", () => {
  assert.equal(siteStatusText(base), "12 facilities · Normal");
  assert.equal(siteStatusText({ ...base, status: "connecting" }), "Connecting");
  assert.equal(siteStatusText({ ...base, status: "disconnected" }), "Offline");
  assert.equal(siteStatusText({ ...base, pumpFailures: 2, inspections: 1 }), "2 pump failures · 1 inspection");
  assert.equal(siteStatusText({ ...base, pumpFailures: 1 }), "1 pump failure");
  assert.equal(siteStatusText({ ...base, lockdown: true, pumpFailures: 1 }), "Lockdown active");
  assert.equal(siteStatusText({ ...base, sensorIssues: 1 }), "1 sensor issue");
});

test("the Darkroom: in from a site or the map, back to where the judge came from", async () => {
  const { enterDarkroom, leaveDarkroom, entrySite } = await import("./entry");
  const site = pickSite(MAP, "permian");
  const room = enterDarkroom(site);
  assert.deepEqual(room, { at: "darkroom", site: "permian" });
  assert.equal(enterDarkroom(room), room);
  assert.deepEqual(leaveDarkroom(room), { at: "site", site: "permian" });
  assert.deepEqual(enterDarkroom(MAP), { at: "darkroom", site: null });
  assert.deepEqual(leaveDarkroom(enterDarkroom(MAP)), MAP);
  assert.equal(leaveDarkroom(site), site);
  assert.deepEqual(backToMap(), MAP);
  assert.equal(entrySite(room), "permian");
  assert.equal(entrySite(MAP), null);
  // The URL keeps ?site= in the Darkroom, so a reload comes back to the site.
  assert.equal(entrySearch("?x=1", room), "?x=1&site=permian");
  assert.equal(entrySearch("?site=permian", enterDarkroom(MAP)), "");
  assert.deepEqual(pickSite(room, "williston"), { at: "site", site: "williston" });
});
