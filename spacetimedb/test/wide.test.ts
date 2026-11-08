// The reading table must hold everything the EOG engine reads from a Dataset, so that
// finish_ingest can rebuild the exact Dataset that loadDataset() makes in Node or the browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDataset, type Dataset } from "../../lib/eog/load.ts";
import { FOLDERS, hasData, loadFolder } from "../../lib/eog/testdata.ts";
import { datasetFromRows, datasetToRows, MAX_WELLS, type WideRow } from "../src/wide.ts";

// Every series the engine can ask for (seriesOf) is a network asset metric.
function networkKeys(ds: Dataset): string[] {
  const keys: string[] = [];
  for (const s of ds.network.systems) for (const f of s.facilities) {
    keys.push(`${f.id}|inflow_bpd`, `${f.tank.id}|level_pct`, `${f.pump.id}|status`, `${f.pump.id}|flow_bpd`,
      `${f.pump.id}|discharge_psi`, `${f.pipeline.id}|pressure_psi`, `${f.pipeline.id}|receive_flow_bpd`);
    for (const w of f.wells) keys.push(`${w.id}|water_bpd`, `${w.id}|status`);
  }
  return keys;
}

function assertSameDataset(got: Dataset, want: Dataset) {
  assert.equal(got.now, want.now);
  assert.deepEqual(got.ts, want.ts);
  assert.deepEqual(got.network, want.network);
  assert.deepEqual(got.ops, want.ops);
  for (const k of networkKeys(want)) {
    assert.equal(got.series.has(k), want.series.has(k), `series ${k} presence`);
    assert.equal(got.lastSeen.get(k), want.lastSeen.get(k), `lastSeen ${k}`);
    const a = got.series.get(k), b = want.series.get(k);
    if (!a || !b) continue;
    assert.equal(a.length, b.length, `series ${k} length`);
    for (let i = 0; i < b.length; i++) {
      if (!Object.is(a[i], b[i])) assert.fail(`series ${k}[${i}]: got ${a[i]}, want ${b[i]}`);
    }
  }
  // No extra series beyond what the network names.
  for (const k of got.series.keys()) assert.ok(want.series.has(k), `unexpected series ${k}`);
}

const NETWORK = {
  defaults: { tank_limits_pct: { warning: 80, shutdown: 95 } },
  systems: [{
    id: "S1", center: [0, 0], truck_yard: [0, 0], disposal_site: { id: "D1", lat: 0, lon: 0, pressure_psi: 1000 },
    facilities: [{
      id: "F1", lat: 1, lon: 2,
      wells: [{ id: "W1", baseline_water_bpd: 100, oil_bpd: 10, gas_mcfd: 5 }, { id: "W2", baseline_water_bpd: 50, oil_bpd: 5, gas_mcfd: 2 }],
      tank: { id: "T1", capacity_bbl: 1000 },
      pump: { id: "P1", max_flow_bpd: 2000, start_level_pct: 70, stop_level_pct: 30 },
      pipeline: { id: "L1", max_bpd: 3000, max_pressure_psi: 1500 },
    }],
  }],
};
const OPS = {
  prices: { oil_per_bbl: 70, gas_per_mcf: 2 }, expected_repair_hours: { pump_failure: 8 },
  emergency_trucking: { truck_capacity_bbl: 130, cost_per_trip: 900 },
  systems: { S1: { emergency_fleet_size: 2, facilities: { F1: { response_min: 45, cycle_min: 90 } } } },
};

test("gaps, a late first sample, a sensor that goes silent and a missing series all survive the round trip", () => {
  const csv = [
    "timestamp,ts_unix,asset_id,metric,value",
    "x,300,T1,level_pct,51",
    "x,300,P1,status,1",
    "x,300,W1,water_bpd,100",
    "x,600,T1,level_pct,52",          // P1 status goes silent after 300
    "x,600,W2,water_bpd,40",          // W2 water starts late: NaN at 300
    "x,600,OTHER,thing,7",            // asset not in network.json: dropped, but its ts still counts
    "x,900,T1,level_pct,53",
    "x,1200,OTHER,thing,8",           // a ts where no network asset reports
    "",
  ].join("\n");
  const ds = loadDataset({ network: JSON.stringify(NETWORK), ops: JSON.stringify(OPS), telemetry: csv });
  const rows = datasetToRows(ds);
  assert.equal(rows.length, 4, "one row per facility per ts");
  const back = datasetFromRows(ds.network, ds.ops, rows);
  assertSameDataset(back, ds);
  assert.equal(back.lastSeen.get("P1|status"), 300);
  assert.equal(back.series.has("F1|inflow_bpd"), false);
});

test("row order does not matter", () => {
  const ds = loadDataset({
    network: JSON.stringify(NETWORK), ops: JSON.stringify(OPS),
    telemetry: "timestamp,ts_unix,asset_id,metric,value\nx,300,T1,level_pct,1\nx,600,T1,level_pct,2\nx,900,T1,level_pct,3\n",
  });
  const rows = datasetToRows(ds).reverse();
  assertSameDataset(datasetFromRows(ds.network, ds.ops, rows), ds);
});

test("a facility with more wells than the stale mask holds is refused", () => {
  const big = structuredClone(NETWORK);
  big.systems[0].facilities[0].wells = Array.from({ length: MAX_WELLS + 1 }, (_, i) => ({ id: `W${i}`, baseline_water_bpd: 1, oil_bpd: 1, gas_mcfd: 1 }));
  const ds = loadDataset({ network: JSON.stringify(big), ops: JSON.stringify(OPS), telemetry: "h\nx,300,T1,level_pct,1\n" });
  assert.throws(() => datasetToRows(ds), /wells/);
});

for (const folder of FOLDERS) {
  test(`${folder}: Dataset -> reading rows -> Dataset is exact`, { skip: !hasData(folder) }, () => {
    const ds = loadFolder(folder);
    const rows: WideRow[] = datasetToRows(ds);
    let fac = 0;
    for (const s of ds.network.systems) fac += s.facilities.length;
    assert.equal(rows.length, fac * ds.ts.length);
    assertSameDataset(datasetFromRows(ds.network, ds.ops, rows), ds);
  });
}
