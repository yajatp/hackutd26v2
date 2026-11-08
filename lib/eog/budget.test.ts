import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConsole } from "./alerts.ts";
import { budgetOf } from "./budget.ts";
import { FOLDERS, hasData, loadFolder } from "./testdata.ts";

for (const folder of FOLDERS.filter((f) => f !== "full_week")) {
  test(`${folder}: the budget adds up to the console totals`, { skip: !hasData(folder) }, () => {
    const ds = loadFolder(folder);
    const view = buildConsole(ds);
    const b = budgetOf(ds, view);
    assert.equal(b.length, ds.network.systems.length);
    const sum = (k: "plans" | "do_nothing") => b.reduce((u, x) => u + x[k], 0);
    assert.ok(Math.abs(sum("plans") - view.totals.plans) < 1e-6, `plans ${sum("plans")} vs ${view.totals.plans}`);
    assert.ok(Math.abs(sum("do_nothing") - view.totals.do_nothing) < 1e-6, `do nothing ${sum("do_nothing")} vs ${view.totals.do_nothing}`);
    for (const s of b) {
      assert.ok(s.trucks_used <= s.fleet, `${s.system_id}: ${s.trucks_used} trucks of ${s.fleet}`);
      assert.ok(Math.abs(s.truck_cost + s.shut_in_cost - s.plans) < 1e-6, `${s.system_id}: cost split`);
      assert.equal(s.fleet, ds.ops.systems[s.system_id].emergency_fleet_size);
    }
  });
}

test("mock_test: S5 plans two trucks of its two, $1,810 against $9,957 for doing nothing", { skip: !hasData("mock_test_2026-10-10T1530") }, () => {
  const ds = loadFolder("mock_test_2026-10-10T1530");
  const s5 = budgetOf(ds, buildConsole(ds)).find((s) => s.system_id === "S5")!;
  assert.equal(s5.failures, 2);
  assert.equal(s5.trucks_used, 2);
  assert.equal(s5.fleet, 2);
  assert.equal(Math.round(s5.plans), 1810);
  assert.equal(Math.round(s5.do_nothing), 9957);
  assert.ok(s5.at_risk_per_hour > 4000);
});
