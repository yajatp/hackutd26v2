import { test } from "node:test";
import assert from "node:assert/strict";
import { flowSeries, FLOW_HOURS } from "./flows.ts";
import { seriesOf } from "./load.ts";
import { hasData, loadFolder } from "./testdata.ts";

const MOCK = "mock_test_2026-10-10T1530";

test(`${MOCK}: one series per facility, ${FLOW_HOURS} hourly points ending at now`, { skip: !hasData(MOCK) }, () => {
  const ds = loadFolder(MOCK);
  const all = flowSeries(ds);
  const n = ds.network.systems.reduce((s, x) => s + x.facilities.length, 0);
  assert.equal(all.length, n);
  for (const f of all) {
    assert.equal(f.points.length, FLOW_HOURS);
    assert.equal(f.points[FLOW_HOURS - 1].end_ts, ds.now);
    assert.equal(f.points[0].end_ts, ds.now - (FLOW_HOURS - 1) * 3600);
    for (const p of f.points) for (const v of Object.values(p)) assert.ok(Number.isFinite(v), `${f.facility_id}: finite values`);
  }
});

test(`${MOCK}: hourly means and level match the raw series`, { skip: !hasData(MOCK) }, () => {
  const ds = loadFolder(MOCK);
  const f = ds.network.systems[0].facilities[0];
  const s = flowSeries(ds).find((x) => x.facility_id === f.id)!;
  const last = s.points[FLOW_HOURS - 1];
  const inflow = seriesOf(ds, f.id, "inflow_bpd"), flow = seriesOf(ds, f.pump.id, "flow_bpd"), L = seriesOf(ds, f.tank.id, "level_pct");
  const idx = ds.ts.map((t, i) => (t > ds.now - 3600 && t <= ds.now ? i : -1)).filter((i) => i >= 0);
  assert.equal(idx.length, 12, "12 five-minute samples in the last hour");
  const m = (a: Float64Array) => idx.reduce((u, i) => u + a[i], 0) / idx.length;
  assert.ok(Math.abs(last.inflow_bpd - m(inflow)) < 1e-9);
  assert.ok(Math.abs(last.outflow_bpd - m(flow)) < 1e-9);
  assert.equal(last.level_pct, L[ds.ts.length - 1]);
  assert.ok(Math.abs(last.reported_pts - (L[ds.ts.length - 1] - L[idx[0] - 1])) < 1e-9);
});

test(`${MOCK}: a failed pump shows out = 0 and the level rising with physics`, { skip: !hasData(MOCK) }, () => {
  const ds = loadFolder(MOCK);
  const s = flowSeries(ds).find((x) => x.facility_id === "S5_FACILITY_C")!;
  const last = s.points[FLOW_HOURS - 1];
  assert.equal(last.outflow_bpd, 0);
  assert.ok(last.inflow_bpd > 0);
  assert.ok(last.physics_pts > 5, `physics ${last.physics_pts}`);
  // An honest sensor tracks physics within the folder's clean error (well under 1 pt over an hour).
  assert.ok(Math.abs(last.reported_pts - last.physics_pts) < 1, `reported ${last.reported_pts} vs physics ${last.physics_pts}`);
});
