import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConsole } from "./alerts.ts";
import { answerKey, hasData, loadFolder } from "./testdata.ts";
import { injectFault } from "../rules/faults.ts";

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

test("mock_test: every fix card's tank sensor is trusted on clean data; a flat fake makes it LYING and SIMULATED", { skip: !hasData("mock_test_2026-10-10T1530") }, () => {
  const ds = loadFolder("mock_test_2026-10-10T1530");
  const clean = buildConsole(ds).alerts.filter((a) => a.fix);
  for (const a of clean) {
    assert.ok(a.tank_sensor && ["ok", "shut_in"].includes(a.tank_sensor.state), `${a.facility.id}: ${a.tank_sensor?.state}`);
    assert.equal(a.tank_sensor!.simulated, false);
  }
  const top = clean[0].facility;
  const { ds: faked } = injectFault(ds, { kind: "fake_flat", asset_id: top.tank.id, from_ts: ds.now - 3600 });
  const hit = buildConsole(faked).alerts.find((a) => a.facility.id === top.id && a.fix)!;
  assert.equal(hit.tank_sensor!.state, "lying", hit.tank_sensor!.evidence);
  assert.equal(hit.tank_sensor!.simulated, true);
});

test("sensors to check: none on clean data; a killed tank sensor is listed DEAD and SIMULATED", { skip: !hasData("mock_test_2026-10-10T1530") }, () => {
  const ds = loadFolder("mock_test_2026-10-10T1530");
  assert.deepEqual(buildConsole(ds).sensors, []);
  const tank = ds.network.systems[0].facilities[0].tank.id;
  const { ds: killed } = injectFault(ds, { kind: "kill", asset_id: tank, from_ts: ds.now - 600 });
  const s = buildConsole(killed).sensors;
  assert.equal(s.length, 1);
  assert.deepEqual([s[0].asset_id, s[0].state, s[0].simulated, s[0].facility_id], [tank, "dead", true, ds.network.systems[0].facilities[0].id]);
  assert.match(s[0].evidence, /^No reading for 10 min\. Last value [\d.]+%\.$/);
});

test("a tank already at its shutdown limit says so, with the loss until the repair (review finding 9)", { skip: !hasData("full_week") }, () => {
  const full = loadFolder("full_week");
  const cut = Date.UTC(2026, 9, 8, 6, 0) / 1000;
  const n = full.ts.findIndex((t) => t > cut);
  const series = new Map([...full.series].map(([k, a]) => [k, a.subarray(0, n)]));
  const lastSeen = new Map([...full.lastSeen].map(([k, t]) => [k, Math.min(t, cut)]));
  const ds = { ...full, ts: full.ts.slice(0, n), series, lastSeen, now: cut };
  const a = buildConsole(ds).alerts.find((x) => x.fix && x.hours_to_limit === 0);
  assert.ok(a, "an alert at shutdown");
  assert.match(a!.fix!.headline, /^Tank is at its shutdown limit: wells shut in until the repair at \d\d:\d\d$/);
  assert.ok(a!.fix!.plan.cost > 0, `cost ${a!.fix!.plan.cost}`);
  assert.equal(a!.fix!.alternatives.length, 0);
});
