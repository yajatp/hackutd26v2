import { test } from "node:test";
import assert from "node:assert/strict";
import { linkSite, settled, summarize, type FleetRows, type SiteInfo } from "./fleet.ts";
import type { Alert as AlertRow, ConsoleMeta, Fault, Lockdown, SensorIssue } from "./module_bindings/types.ts";
import { SITES } from "./sites.ts";

const SITE: SiteInfo = { key: "eagleford", name: "San Antonio South", basin: "Eagle Ford", city: "San Antonio", state: "TX", lat: 28.952, lon: -98.4786 };

function alert(rank: number, kind: string, facilityId: string, json: object): AlertRow {
  return { rank, alertId: `${kind}-${rank}`, kind, systemId: "S1", facilityId, assetId: `T-${rank}`, hoursToLimit: undefined, alertJson: JSON.stringify(json) };
}

const failure = (rank: number, facilityId: string, headline: string, cost: number, hours: number | null) =>
  alert(rank, "pump_failure", facilityId, { id: `a${rank}`, hours_to_limit: hours, action: "Fix the pump", fix: { headline, plan: { cost } } });
const inspection = (rank: number, facilityId: string, action: string) =>
  alert(rank, "pump_degraded", facilityId, { id: `i${rank}`, hours_to_limit: null, action });

function meta(over: Partial<ConsoleMeta> = {}): ConsoleMeta {
  return { id: 0, datasetId: "eagleford", now: 0, doNothing: 9957.4, plans: 1810.2, alertCount: 3, eventsJson: "[]", ...over } as unknown as ConsoleMeta;
}

function rows(over: Partial<FleetRows> = {}): FleetRows {
  return {
    meta: meta(),
    alerts: [
      inspection(3, "S2_FACILITY_A", "Send someone to look at the pump"),
      failure(2, "S1_FACILITY_B", "Call 1 truck now, 1 trip", 905, 2.05),
      failure(1, "S5_FACILITY_C", "Call 1 truck now, 1 trip", 905.4, 2.05),
    ],
    issues: [{ rank: 1 } as unknown as SensorIssue, { rank: 2 } as unknown as SensorIssue],
    faults: [{ assetId: "T-1", kind: "lying" } as unknown as Fault],
    facilities: 12,
    lockdown: undefined,
    ...over,
  };
}

test("summarize counts failures, inspections, sensors and faults, and carries the night's money", () => {
  const s = summarize(SITE, "avon-eagleford", "connected", rows());
  assert.equal(s.key, "eagleford");
  assert.equal(s.db, "avon-eagleford");
  assert.equal(s.status, "connected");
  assert.equal(s.datasetId, "eagleford");
  assert.equal(s.facilities, 12);
  assert.equal(s.pumpFailures, 2);
  assert.equal(s.inspections, 1);
  assert.equal(s.sensorIssues, 2);
  assert.equal(s.simulatedFaults, 1);
  assert.equal(s.plans, 1810.2);
  assert.equal(s.doNothing, 9957.4);
  assert.equal(s.lockdown, false);
});

test("the top line is the console's first pump-failure card by rank, in its own words", () => {
  const s = summarize(SITE, "avon-eagleford", "connected", rows());
  assert.deepEqual(s.top, { facilityId: "S5_FACILITY_C", text: "Do this: Call 1 truck now, 1 trip · $905 · trips in 2h 03m" });
});

test("with no pump failures the top line is the first inspection; with no alerts it is null", () => {
  const onlyInspect = summarize(SITE, "db", "connected", rows({ alerts: [inspection(1, "S2_FACILITY_A", "Send someone to look at the pump")], meta: meta({ alertCount: 1 }) }));
  assert.equal(onlyInspect.pumpFailures, 0);
  assert.deepEqual(onlyInspect.top, { facilityId: "S2_FACILITY_A", text: "Send someone to look at the pump" });
  const calm = summarize(SITE, "db", "connected", rows({ alerts: [], issues: [], faults: [], meta: meta({ alertCount: 0, plans: 0, doNothing: 0 }) }));
  assert.equal(calm.top, null);
  assert.equal(calm.pumpFailures + calm.inspections + calm.sensorIssues, 0);
});

test("an active lockdown row shows; an ended one does not", () => {
  const on = summarize(SITE, "db", "connected", rows({ lockdown: { active: true } as unknown as Lockdown }));
  const off = summarize(SITE, "db", "connected", rows({ lockdown: { active: false } as unknown as Lockdown }));
  assert.equal(on.lockdown, true);
  assert.equal(off.lockdown, false);
});

test("a site with no database is a disconnected summary with zeros, not an error", () => {
  const s = summarize(SITE, "avon-nowhere", "disconnected", null);
  assert.equal(s.status, "disconnected");
  assert.equal(s.datasetId, null);
  assert.equal(s.top, null);
  assert.deepEqual([s.facilities, s.pumpFailures, s.inspections, s.sensorIssues, s.simulatedFaults, s.plans, s.doNothing], [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(s.lat, SITE.lat);
});

test("a bad alert row does not throw; settled() waits until the alerts match console_meta", () => {
  const broken = rows({ alerts: [{ ...failure(1, "F", "x", 1, 1), alertJson: "{not json" }], meta: meta({ alertCount: 1 }) });
  assert.doesNotThrow(() => summarize(SITE, "db", "connected", broken));
  assert.equal(settled(rows()), true);
  assert.equal(settled(rows({ meta: meta({ alertCount: 5 }) })), false);
  assert.equal(settled(rows({ meta: undefined })), true);
});

// ---- the live link, against the laptop's SpacetimeDB (skipped when it is not running) ----

const LOCAL = "ws://127.0.0.1:3001";
const localUp = () => fetch("http://127.0.0.1:3001/v1/ping").then((r) => r.ok, () => false);

test("linkSite on a database that does not exist reports disconnected and keeps quiet", async (t) => {
  if (!(await localUp())) return t.skip("local SpacetimeDB is not running");
  const seen: string[] = [];
  let gotRows = false;
  const link = linkSite({ uri: LOCAL, database: "avon-no-such-site-fleet-test", retryMs: 60000, onStatus: (s) => seen.push(s), onRows: () => { gotRows = true; } });
  try {
    const t0 = Date.now();
    while (!seen.includes("disconnected") && Date.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 50));
    assert.ok(seen.includes("disconnected"), `statuses: ${seen.join(", ")}`);
    assert.equal(gotRows, false);
  } finally {
    link.close();
  }
});

test("linkSite reads a provisioned site's board without calling a reducer", async (t) => {
  if (!(await localUp())) return t.skip("local SpacetimeDB is not running");
  const site = SITES.find((s) => s.key === "eagleford")!;
  const got = await new Promise<FleetRows | null>((resolve) => {
    const done = (r: FleetRows | null) => { clearTimeout(timer); link.close(); resolve(r); };
    const link = linkSite({ uri: LOCAL, database: "avon-eagleford", onStatus: () => {}, onRows: done });
    const timer = setTimeout(() => done(null), 10000);
  });
  if (!got?.meta) return assert.fail("avon-eagleford did not answer: run npm run sites");
  const s = summarize(site, "avon-eagleford", "connected", got);
  assert.equal(s.datasetId, "eagleford");
  assert.ok(s.facilities > 0);
  assert.ok(s.pumpFailures > 0);
  assert.ok(s.top && s.top.text.startsWith("Do this: "), JSON.stringify(s.top));
});
