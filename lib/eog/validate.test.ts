import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTelemetry, seriesOf } from "./load.ts";
import { FOLDERS, hasData, HISTORY } from "./testdata.ts";
import { validateFiles } from "./validate.ts";

const read = (folder: string) => {
  const r = (f: string) => readFileSync(join(HISTORY, folder, f), "utf8");
  return { network: r("network.json"), ops: r("ops.json"), telemetry: r("telemetry.csv") };
};

test("a blank value is missing data, not a zero, and is counted", () => {
  const csv = ["timestamp,ts_unix,asset_id,metric,value", "x,300,T,level_pct,51", "x,600,P,status,1", "x,600,T,level_pct,", "x,900,T,level_pct,53", "x,abc,T,level_pct,9", "x,900"].join("\n");
  const { series, stats } = parseTelemetry(csv);
  assert.deepEqual([...seriesOf({ series }, "T", "level_pct")], [51, 51, 53]);
  assert.deepEqual([stats.rows, stats.blank, stats.malformed, stats.firstBadLine], [3, 1, 2, 4]);
});

for (const folder of FOLDERS) {
  test(`${folder} validates with no errors`, { skip: !hasData(folder) }, () => {
    const { validation, ds } = validateFiles(read(folder));
    assert.deepEqual(validation.errors, []);
    assert.ok(validation.ok && ds);
    assert.equal(validation.summary!.systems, ds!.network.systems.length);
    assert.equal(validation.summary!.step_s, 300);
    assert.ok(validation.summary!.readings > 0);
  });
}

test("readable errors: bad JSON, a missing ops entry, a wrong header, a missing series", { skip: !hasData("mock_test_2026-10-10T1530") }, () => {
  const good = read("mock_test_2026-10-10T1530");
  assert.match(validateFiles({ ...good, network: "{" }).validation.errors[0], /network\.json is not valid JSON/);
  const ops = JSON.parse(good.ops);
  const sys = Object.keys(ops.systems)[0];
  delete ops.systems[sys];
  assert.match(validateFiles({ ...good, ops: JSON.stringify(ops) }).validation.errors.join("\n"), new RegExp(`ops\\.json: no entry for system ${sys}`));
  const headerless = good.telemetry.replace(/^[^\n]*/, "time,unix,asset,metric,value");
  assert.match(validateFiles({ ...good, telemetry: headerless }).validation.errors.join("\n"), /header is/);
  const tank = JSON.parse(good.network).systems[0].facilities[0].tank.id;
  const noTank = good.telemetry.split("\n").filter((l) => !l.includes(`,${tank},level_pct,`)).join("\n");
  const r = validateFiles({ ...good, telemetry: noTank });
  assert.equal(r.ds, null);
  assert.match(r.validation.errors.join("\n"), new RegExp(`no readings for ${tank} level_pct`));
});
