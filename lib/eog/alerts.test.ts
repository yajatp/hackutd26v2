import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConsole } from "./alerts.ts";
import { answerKey, hasData, loadFolder } from "./testdata.ts";

const SNAPS = ["snapshot_2026-10-08T1200", "snapshot_2026-10-09T0330", "snapshot_2026-10-10T0900"];

interface KeyEvent {
  asset: string; category: string; status: string; order?: number;
  reference_action: string; hours_to_limit_final?: number;
}

// "1 truck, 1 trip + shut in S4_WELL_A2 at +291 min (~$975) (shares ...)"
// Same pattern as prototypes/validate.py parse_ref ("(shares S2's 2 trucks ...)" is not a plan).
function parseRef(s: string) {
  const tt = /(\d+) trucks?, (\d+) trips?/.exec(s);
  const wells = [...s.matchAll(/shut in (\S+) at \+(\d+) min/g)].map((m) => ({ well: m[1], at: Number(m[2]) }));
  return { none: /^none/.test(s), doNothing: /^do nothing/i.test(s), trucks: tt ? +tt[1] : 0, trips: tt ? +tt[2] : 0, wells };
}

for (const snap of SNAPS) {
  test(`${snap}: alert order and plans match the answer key`, { skip: !hasData(snap) }, () => {
    const view = buildConsole(loadFolder(snap));
    const key = (answerKey(snap) as unknown as KeyEvent[]).filter((e) => e.status === "ongoing");
    const keyFailures = key.filter((e) => e.category === "pump_failure").sort((a, b) => a.order! - b.order!);
    const ours = view.alerts.filter((a) => a.fix);
    assert.deepEqual(ours.map((a) => a.event.asset_id), keyFailures.map((e) => e.asset), "pump failure order");
    ours.forEach((a, i) => {
      const k = keyFailures[i];
      const ref = parseRef(k.reference_action);
      const p = a.fix!.plan;
      const msg = `${k.asset}: ours "${a.fix!.label}" vs key "${k.reference_action}"`;
      assert.ok(Math.abs(a.hours_to_limit! - k.hours_to_limit_final!) <= 0.05, `${msg}: hours_to_limit ${a.hours_to_limit}`);
      if (ref.none) { assert.equal(p.kind, "none_needed", msg); return; }
      if (ref.doNothing) { assert.equal(p.kind, "do_nothing", msg); return; }
      assert.equal(p.trucks, ref.trucks, msg);
      assert.equal(p.trucks ? p.trips_per_truck : 0, ref.trips, msg);
      assert.deepEqual(p.shut_ins.map((s) => s.well_id), ref.wells.map((w) => w.well), msg);
      p.shut_ins.forEach((s, j) => assert.ok(Math.abs(s.start_min - ref.wells[j].at) <= 3, `${msg}: start ${s.start_min}`));
    });
    // leaks and worn pumps come after every pump failure, each with an inspection. One whose pump
    // has been off for an hour cannot be confirmed either way, so it is labeled and not counted.
    const rest = view.alerts.slice(ours.length);
    assert.ok(rest.every((a) => !a.fix && /inspection/.test(a.action)));
    const confirmed = rest.filter((a) => a.pump_off_since === undefined);
    assert.equal(confirmed.length, key.length - keyFailures.length, "leaks + worn pumps ongoing");
    for (const a of rest.filter((x) => x.pump_off_since !== undefined)) {
      assert.ok(view.now - a.pump_off_since! >= 3600, `${a.event.asset_id} pump off long enough`);
    }
  });
}

test("mock_test: S5_PUMP_C first at about 2.05 h, then S5_PUMP_B", { skip: !hasData("mock_test_2026-10-10T1530") }, () => {
  const view = buildConsole(loadFolder("mock_test_2026-10-10T1530"));
  const f = view.alerts.filter((a) => a.fix);
  assert.deepEqual(f.slice(0, 2).map((a) => a.event.asset_id), ["S5_PUMP_C", "S5_PUMP_B"]);
  assert.ok(Math.abs(f[0].hours_to_limit! - 2.05) < 0.1, `got ${f[0].hours_to_limit}`);
  for (const a of f) assert.ok(a.fix!.headline.length > 0 && Number.isFinite(a.fix!.plan.cost));
});

test("full_week: nothing is ongoing at the end of the week", { skip: !hasData("full_week") }, () => {
  const view = buildConsole(loadFolder("full_week"));
  assert.equal(view.events.length, 23);
  assert.equal(view.alerts.length, 0);
});
