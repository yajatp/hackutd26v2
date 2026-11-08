import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTelemetry, seriesOf } from "./load.ts";
import { FOLDERS, hasData, loadFolder } from "./testdata.ts";

test("parses rows, sorts timestamps and carries a missing sample forward", () => {
  const csv = [
    "timestamp,ts_unix,asset_id,metric,value",
    "x,600,T,level_pct,52",
    "x,300,T,level_pct,51",
    "x,300,P,status,1",
    "x,900,T,level_pct,53",
    "",
  ].join("\n");
  const { ts, series, lastSeen } = parseTelemetry(csv);
  assert.deepEqual(ts, [300, 600, 900]);
  assert.equal(lastSeen.get("P|status"), 300);
  assert.equal(lastSeen.get("T|level_pct"), 900);
  assert.deepEqual([...seriesOf({ series }, "T", "level_pct")], [51, 52, 53]);
  assert.deepEqual([...seriesOf({ series }, "P", "status")], [1, 1, 1]);
});

test("a missing series names the asset and metric", () => {
  assert.throws(() => seriesOf({ series: new Map() }, "S1_PUMP_A", "status"), /S1_PUMP_A/);
});

for (const folder of FOLDERS) {
  test(`loads ${folder}`, { skip: !hasData(folder) }, () => {
    const ds = loadFolder(folder);
    assert.equal(ds.now, ds.ts[ds.ts.length - 1]);
    for (const s of ds.network.systems) for (const f of s.facilities) {
      assert.equal(seriesOf(ds, f.tank.id, "level_pct").length, ds.ts.length);
    }
  });
}
