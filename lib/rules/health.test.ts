import { test } from "node:test";
import assert from "node:assert/strict";
import { seriesOf, type Dataset } from "../eog/load.ts";
import type { FacilityJson } from "../eog/types.ts";
import { FOLDERS, hasData, loadFolder } from "../eog/testdata.ts";
import { injectFault } from "./faults.ts";
import { calibrate, physicsRate } from "./physics.ts";
import { healthAt, healthOf } from "./health.ts";

const FW = "full_week";
const facilities = (ds: Dataset) => ds.network.systems.flatMap((s) => s.facilities);
const firstFullHour = (ds: Dataset) => ds.ts.findIndex((t) => t - ds.ts[0] >= 3600);
const round1 = (v: number) => String(Math.round(v * 10) / 10);
const tankHealth = (ds: Dataset, tank: string, i: number) => healthOf(ds, tank, "level_pct", ds.ts[i]);

// A tick where a tank is filling in the data: pump stopped (status 0) for the next n samples,
// level rising and still under the pump's start level. Searched from the last system back.
function findFilling(ds: Dataset, n: number): { fac: FacilityJson; i: number } {
  for (const s of [...ds.network.systems].reverse()) for (const fac of s.facilities) {
    const L = seriesOf(ds, fac.tank.id, "level_pct");
    const st = seriesOf(ds, fac.pump.id, "status");
    for (let i = firstFullHour(ds) + 1; i + n < ds.ts.length; i++) {
      let off = true;
      for (let k = 0; k <= n && off; k++) off = st[i + k] === 0;
      if (off && L[i + n] > L[i] && L[i + n] < fac.pump.start_level_pct) return { fac, i };
    }
  }
  throw new Error("no filling tank in the data");
}

// A mid-data tick where the first tank is not near its shutdown limit.
function midTick(ds: Dataset, tank: string): number {
  const L = seriesOf(ds, tank, "level_pct");
  const limit = ds.network.defaults.tank_limits_pct.shutdown;
  let f = Math.floor(ds.ts.length / 2);
  while (L[f] >= limit - 1) f++;
  return f;
}

for (const folder of FOLDERS) {
  test(`clean ${folder}: no sensor is dead, drifting or lying at any tick from the first full hour to now, none simulated`, { skip: !hasData(folder) }, () => {
    const ds = loadFolder(folder);
    const bad = new Map<string, number>();
    let results = 0;
    const from = firstFullHour(ds);
    assert.ok(from > 0);
    for (let i = from; i < ds.ts.length; i++) {
      const all = healthAt(ds, ds.ts[i]);
      assert.equal(all.length, ds.series.size);
      for (const h of all) {
        results++;
        assert.equal(h.ts, ds.ts[i]);
        assert.notEqual(h.simulated, true, `${h.key} simulated on clean data`);
        if (h.state === "dead" || h.state === "drifting" || h.state === "lying") {
          const k = `${h.key} ${h.state}`;
          bad.set(k, (bad.get(k) ?? 0) + 1);
        }
      }
    }
    assert.deepEqual([...bad], []);
    assert.equal(results, ds.series.size * (ds.ts.length - from));
  });
}

test("shut_in: a tank flat at its network.json shutdown limit reads shut_in, not dead or lying", { skip: !hasData(FW) }, () => {
  const ds = loadFolder(FW);
  const limit = ds.network.defaults.tank_limits_pct.shutdown;
  const tanks = new Set<string>();
  let checked = 0;
  for (const fac of facilities(ds)) {
    const L = seriesOf(ds, fac.tank.id, "level_pct");
    for (let i = firstFullHour(ds); i < ds.ts.length; i++) {
      if (L[i] !== limit || L[i - 1] !== limit) continue;
      const h = tankHealth(ds, fac.tank.id, i);
      assert.equal(h.state, "shut_in", `${fac.tank.id} at ${ds.ts[i]}: ${h.state} ${h.evidence}`);
      assert.ok(h.evidence.includes(`${limit}%`), h.evidence);
      tanks.add(fac.tank.id);
      checked++;
    }
  }
  assert.ok(checked > 0 && tanks.size > 0);
});

test("kill -> dead: an S-system tank's level reads dead after 2 silent samples with 'No reading for N min. Last value V%.'", { skip: !hasData(FW) }, () => {
  const ds = loadFolder(FW);
  const sys = ds.network.systems[0];
  assert.match(sys.id, /^S/);
  const tank = sys.facilities[0].tank.id;
  const f = midTick(ds, tank);
  const { ds: killed } = injectFault(ds, { kind: "kill", asset_id: tank, from_ts: ds.ts[f] });
  const last = killed.lastSeen.get(`${tank}|level_pct`)!;
  const V = seriesOf(killed, tank, "level_pct")[ds.ts.indexOf(last)];
  assert.notEqual(tankHealth(killed, tank, f + 1).state, "dead", "1 sample after from_ts is not dead yet");
  for (const k of [2, 6]) {
    const h = tankHealth(killed, tank, f + k);
    const N = (ds.ts[f + k] - last) / 60;
    assert.equal(h.state, "dead");
    assert.equal(h.evidence, `No reading for ${N} min. Last value ${round1(V)}%.`);
    assert.equal(h.last_heartbeat_ts, last);
  }
  assert.equal(tankHealth(killed, tank, f + 2).evidence.startsWith(`No reading for ${(ds.ts[f + 2] - ds.ts[f]) / 60} min.`), true);
});

test("fake_flat -> lying: a flat fake on a filling tank reads lying within 6 samples, never dead, and lying wins over drifting", { skip: !hasData(FW) }, () => {
  const ds = loadFolder(FW);
  const { fac, i } = findFilling(ds, 6);
  const { ds: faked } = injectFault(ds, { kind: "fake_flat", asset_id: fac.tank.id, from_ts: ds.ts[i] });
  const cal = calibrate(faked);
  let lyingAt = -1;
  for (let k = 1; k <= 6; k++) {
    const h = tankHealth(faked, fac.tank.id, i + k);
    assert.notEqual(h.state, "dead", `tick +${k}`);
    if (h.state !== "lying" || lyingAt > 0) continue;
    lyingAt = k;
    assert.ok(Math.abs(h.error_pts_h!) > cal.drift_line, "also over the DRIFTING line, but reads lying");
    const m = h.evidence.match(/^Physics says \+(\d+(?:\.\d+)?) pts\/h\. Sensor says 0\. Off for (\d+) min\.$/);
    assert.ok(m, h.evidence);
    const inflow = seriesOf(ds, fac.id, "inflow_bpd")[i], flow = seriesOf(ds, fac.pump.id, "flow_bpd")[i];
    assert.ok(Math.abs(Number(m[1]) - physicsRate(inflow, flow, fac.tank.capacity_bbl)) < 1, h.evidence);
    assert.ok(Number(m[2]) > 0 && Number(m[2]) <= (ds.ts[i + k] - ds.ts[i]) / 60, h.evidence);
  }
  assert.ok(lyingAt > 0 && lyingAt <= 6, `lying at sample ${lyingAt}`);
});

test("drift -> drifting: a drift between the lines reads drifting with 'Margin of error vs physics: X pts/h, growing.'; calibration ignores the injected ticks", { skip: !hasData(FW) }, () => {
  const ds = loadFolder(FW);
  const cal = calibrate(ds);
  const rate = (cal.drift_line + cal.lie_line) / 2;
  const tank = facilities(ds)[0].tank.id;
  const f = midTick(ds, tank);
  const { ds: drifted } = injectFault(ds, { kind: "drift", asset_id: tank, from_ts: ds.ts[f], rate });
  const dcal = calibrate(drifted);
  assert.deepEqual([dcal.worst_clean_err, dcal.drift_line, dcal.lie_line], [cal.worst_clean_err, cal.drift_line, cal.lie_line]);
  assert.equal(dcal.clean_ticks, cal.clean_ticks - (ds.ts.length - 1 - f), "every drifted tick after from_ts is skipped");
  let drifting = 0;
  for (let k = 1; k <= 24; k++) {
    const h = tankHealth(drifted, tank, f + k);
    assert.ok(h.state !== "dead" && h.state !== "lying", `tick +${k}: ${h.state}`);
    if (h.state !== "drifting") continue;
    drifting++;
    const m = h.evidence.match(/^Margin of error vs physics: (\d+(?:\.\d+)?) pts\/h, growing\.$/);
    assert.ok(m, h.evidence);
    assert.equal(m[1], round1(Math.abs(h.error_pts_h!)));
  }
  assert.ok(drifting > 0);
  assert.equal(tankHealth(drifted, tank, f + 24).state, "drifting");
});

test("simulated: results caused by an injected fault carry simulated: true; clean results and untouched sensors do not", { skip: !hasData(FW) }, () => {
  const ds = loadFolder(FW);
  const tank = facilities(ds)[0].tank.id;
  const f = midTick(ds, tank);
  const t = ds.ts[f + 2];
  for (const h of healthAt(ds, t)) assert.notEqual(h.simulated, true, h.key);
  for (const kind of ["kill", "fake_flat", "drift"] as const) {
    const { ds: inj } = injectFault(ds, { kind, asset_id: tank, from_ts: ds.ts[f], rate: 1 });
    for (const h of healthAt(inj, t)) {
      if (h.asset_id === tank) assert.equal(h.simulated, true, `${kind} ${h.key}`);
      else assert.notEqual(h.simulated, true, `${kind} ${h.key}`);
    }
    assert.notEqual(tankHealth(inj, tank, f).simulated, true, `${kind} before from_ts`);
  }
  const { ds: killed } = injectFault(ds, { kind: "kill", asset_id: tank, from_ts: ds.ts[f] });
  assert.equal(tankHealth(killed, tank, f + 2).state, "dead");
});

test("lying wins over dead: a sensor caught lying that then goes silent stays lying", { skip: !hasData(FW) }, () => {
  const ds = loadFolder(FW);
  const { fac, i } = findFilling(ds, 6);
  const { ds: faked } = injectFault(ds, { kind: "fake_flat", asset_id: fac.tank.id, from_ts: ds.ts[i] });
  let k = 1;
  while (k <= 6 && tankHealth(faked, fac.tank.id, i + k).state !== "lying") k++;
  assert.ok(k <= 6);
  const { ds: both } = injectFault(faked, { kind: "kill", asset_id: fac.tank.id, from_ts: ds.ts[i + k] });
  for (const extra of [2, 6]) {
    const h = tankHealth(both, fac.tank.id, i + k + extra);
    assert.equal(h.state, "lying", `${extra} samples after the kill: ${h.state} ${h.evidence}`);
    assert.equal(h.simulated, true);
  }
});

test("drift on a tank pinned at its shutdown limit: drifting first, then lying with 'above the limit' evidence (skeptic repro: S2_TANK_B mid full_week)", { skip: !hasData(FW) }, () => {
  const ds = loadFolder(FW);
  const tank = "S2_TANK_B";
  const f = Math.floor(ds.ts.length / 2);
  const limit = ds.network.defaults.tank_limits_pct.shutdown;
  const L = seriesOf(ds, tank, "level_pct");
  let reaches = false;
  for (let k = 0; k <= 40; k++) reaches ||= L[f + k] >= limit - 0.05;
  assert.ok(reaches, "the clean tank reaches its limit in this window, or the repro does not apply");
  const { ds: drifted } = injectFault(ds, { kind: "drift", asset_id: tank, from_ts: ds.ts[f] });
  let drifting = 0, lying = 0;
  for (let k = 1; k <= 40; k++) {
    const h = tankHealth(drifted, tank, f + k);
    assert.notEqual(h.state, "dead", `tick +${k}`);
    if (h.state === "drifting") { assert.equal(lying, 0, `tick +${k}: drifting after lying`); drifting++; }
    if (h.state === "lying" && L[f + k] >= limit - 0.05) {
      // while the real tank is pinned at its limit, the evidence names the impossible reading
      lying++;
      assert.match(h.evidence, new RegExp(`^Sensor says \\d+(\\.\\d)?%, above the ${limit}% shutdown limit the tank holds at\\. Off for \\d+ min\\.$`), `tick +${k}`);
      assert.ok(h.value > limit, `tick +${k}: reading ${h.value}`);
    }
  }
  assert.ok(drifting > 0 && lying > 0, `drifting ${drifting}, lying ${lying}`);
});

test("a fault on a pump labels the pump SIMULATED, not its healthy tank", { skip: !hasData(FW) }, () => {
  const ds = loadFolder(FW);
  const fac = facilities(ds)[0];
  const f = midTick(ds, fac.tank.id);
  const { ds: killed } = injectFault(ds, { kind: "kill", asset_id: fac.pump.id, from_ts: ds.ts[f] });
  let healthy = 0;
  for (let k = 1; k <= 6; k++) {
    const t = ds.ts[f + k];
    for (const h of healthAt(killed, t)) {
      if (h.asset_id === fac.pump.id) assert.equal(h.simulated, true, `${h.key} +${k}`);
      if (h.asset_id === fac.tank.id && (h.state === "ok" || h.state === "shut_in")) {
        healthy++;
        assert.notEqual(h.simulated, true, `${h.key} +${k} is ${h.state} but labeled simulated`);
      }
    }
  }
  assert.ok(healthy > 0, "the tank stays healthy in this window");
});
