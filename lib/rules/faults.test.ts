import { test } from "node:test";
import assert from "node:assert/strict";
import { seriesKey, seriesOf, type Dataset } from "../eog/load.ts";
import { hasData, loadFolder } from "../eog/testdata.ts";
import { faultsOf, injectFault, type FaultKind } from "./faults.ts";
import { calibrate } from "./physics.ts";

const FW = "full_week";
const firstTank = (ds: Dataset) => ds.network.systems[0].facilities[0].tank.id;
const snapshot = (ds: Dataset) => ({
  series: new Map([...ds.series].map(([k, a]) => [k, Array.from(a)])),
  lastSeen: new Map(ds.lastSeen),
});

test("injectFault returns a new Dataset and leaves the input series and lastSeen unchanged (kill, fake_flat, drift)", { skip: !hasData(FW) }, () => {
  const ds = loadFolder(FW);
  const before = snapshot(ds);
  const tank = firstTank(ds);
  const key = seriesKey(tank, "level_pct");
  const from_ts = ds.ts[Math.floor(ds.ts.length / 2)];
  for (const kind of ["kill", "fake_flat", "drift"] as FaultKind[]) {
    const out = injectFault(ds, { kind, asset_id: tank, from_ts, rate: 1 });
    assert.notEqual(out.ds, ds);
    assert.notEqual(out.ds.series.get(key), ds.series.get(key));
    assert.notDeepEqual(Array.from(out.ds.series.get(key)!), before.series.get(key), `${kind} changed the copy`);
  }
  assert.deepEqual(snapshot(ds), before);
  assert.deepEqual(faultsOf(ds), []);
});

test("kill: no readings after from_ts, so lastSeen moves back and the last value carries forward", { skip: !hasData(FW) }, () => {
  const ds = loadFolder(FW);
  const tank = firstTank(ds);
  const f = Math.floor(ds.ts.length / 2);
  const { ds: killed, marker } = injectFault(ds, { kind: "kill", asset_id: tank, from_ts: ds.ts[f] });
  const key = seriesKey(tank, "level_pct");
  assert.equal(killed.lastSeen.get(key), ds.ts[f]);
  const a = seriesOf(killed, tank, "level_pct");
  const orig = seriesOf(ds, tank, "level_pct");
  for (let i = 0; i <= f; i++) assert.equal(a[i], orig[i]);
  for (let i = f + 1; i < a.length; i++) assert.equal(a[i], orig[f]);
  assert.deepEqual(marker, { simulated: true, kind: "kill", asset_id: tank, keys: [key], from_ts: ds.ts[f] });
  assert.deepEqual(faultsOf(killed), [marker]);
});

test("fake_flat holds the from_ts value and keeps reporting; drift adds rate x hours after from_ts", { skip: !hasData(FW) }, () => {
  const ds = loadFolder(FW);
  const tank = firstTank(ds);
  const key = seriesKey(tank, "level_pct");
  const f = Math.floor(ds.ts.length / 2);
  const orig = seriesOf(ds, tank, "level_pct");
  const flat = injectFault(ds, { kind: "fake_flat", asset_id: tank, from_ts: ds.ts[f] }).ds;
  assert.equal(flat.lastSeen.get(key), ds.lastSeen.get(key));
  for (let i = f; i < ds.ts.length; i++) assert.equal(seriesOf(flat, tank, "level_pct")[i], orig[f]);
  const drift = injectFault(ds, { kind: "drift", asset_id: tank, from_ts: ds.ts[f], rate: 1.5 }).ds;
  for (let i = 0; i < ds.ts.length; i++) {
    const want = i <= f ? orig[i] : orig[i] + 1.5 * (ds.ts[i] - ds.ts[f]) / 3600;
    assert.ok(Math.abs(seriesOf(drift, tank, "level_pct")[i] - want) < 1e-9);
  }
});

test("drift without a rate uses a data-derived rate between the DRIFTING and LYING lines", { skip: !hasData(FW) }, () => {
  const ds = loadFolder(FW);
  const cal = calibrate(ds);
  const { marker } = injectFault(ds, { kind: "drift", asset_id: firstTank(ds), from_ts: ds.ts[100] });
  assert.ok(marker.rate! > cal.drift_line && marker.rate! < cal.lie_line, `rate ${marker.rate}`);
});

test("faults stack: a second injection keeps the first marker; an unknown asset throws", { skip: !hasData(FW) }, () => {
  const ds = loadFolder(FW);
  const tank = firstTank(ds);
  const one = injectFault(ds, { kind: "fake_flat", asset_id: tank, from_ts: ds.ts[100] });
  const two = injectFault(one.ds, { kind: "kill", asset_id: tank, from_ts: ds.ts[200] });
  assert.deepEqual(faultsOf(two.ds), [one.marker, two.marker]);
  assert.deepEqual(faultsOf(one.ds), [one.marker]);
  assert.throws(() => injectFault(ds, { kind: "kill", asset_id: "NO_SUCH_ASSET", from_ts: ds.ts[0] }), /NO_SUCH_ASSET/);
});
