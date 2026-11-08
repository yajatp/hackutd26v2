import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDataset, seriesKey, type Dataset } from "../eog/load.ts";
import { hasData, loadFolder } from "../eog/testdata.ts";
import { calibrate, physicsRate, stepSeconds, tankPhysics } from "./physics.ts";

// One tank in EOG's file shapes, run through the real loader. level(h) gives the sensor
// reading h hours after the first sample.
function synth(o: { step: number; hours: number; inflow: number; flow: number; cap: number; level: (h: number) => number }): Dataset {
  const network = {
    defaults: { tank_limits_pct: { warning: 85, shutdown: 92 } },
    systems: [{
      id: "X", center: [0, 0], truck_yard: [0, 0],
      disposal_site: { id: "X_DISPOSAL", lat: 0, lon: 0, pressure_psi: 0 },
      facilities: [{
        id: "X_FAC", lat: 0, lon: 0, wells: [],
        tank: { id: "X_TANK", capacity_bbl: o.cap },
        pump: { id: "X_PUMP", max_flow_bpd: o.flow, start_level_pct: 70, stop_level_pct: 30 },
        pipeline: { id: "X_PIPE", max_bpd: 0, max_pressure_psi: 0 },
      }],
    }],
  };
  const rows = ["timestamp,ts_unix,asset_id,metric,value"];
  for (let t = 0; t <= o.hours * 3600; t += o.step) {
    const ts = 1000 + t;
    rows.push(`x,${ts},X_FAC,inflow_bpd,${o.inflow}`, `x,${ts},X_PUMP,flow_bpd,${o.flow}`, `x,${ts},X_TANK,level_pct,${o.level(t / 3600)}`);
  }
  return loadDataset({ network: JSON.stringify(network), ops: "{}", telemetry: rows.join("\n") });
}

test("physicsRate is (inflow_bpd - flow_bpd) / 24 / capacity_bbl * 100 in pts/h", () => {
  assert.equal(physicsRate(2400, 0, 1000), 10);
  assert.equal(physicsRate(1800, 2700, 800), (1800 - 2700) / 24 / 800 * 100);
});

for (const step of [300, 600]) {
  test(`the physics window is 1 hour of data time (${step} s samples); a sensor that follows physics has 0 error`, () => {
    const rate = physicsRate(2400, 0, 1000);
    const ds = synth({ step, hours: 3, inflow: 2400, flow: 0, cap: 1000, level: (h) => 30 + rate * h });
    assert.equal(stepSeconds(ds.ts), step);
    const [tp] = tankPhysics(ds);
    for (let i = 0; i < ds.ts.length; i++) {
      if (ds.ts[i] - ds.ts[0] < 3600) assert.ok(Number.isNaN(tp.err[i]), `tick ${i} has no full hour yet`);
      else {
        assert.equal(ds.ts[i] - ds.ts[tp.winStart[i]], 3600);
        assert.ok(Math.abs(tp.err[i]) < 1e-9, `tick ${i} error ${tp.err[i]}`);
      }
    }
  });
}

test("a sensor stuck flat while physics says filling shows the gap as error in pts/h", () => {
  const rate = physicsRate(2400, 0, 1000);
  const ds = synth({ step: 300, hours: 3, inflow: 2400, flow: 0, cap: 1000, level: (h) => 30 + rate * Math.min(h, 1.5) });
  const [tp] = tankPhysics(ds);
  const i = ds.ts.indexOf(ds.ts[0] + 2.5 * 3600); // one full hour after the sensor stopped moving
  assert.ok(Math.abs(tp.err[i] + rate) < 1e-9, `error ${tp.err[i]} should be -${rate}`);
});

test("the physics clamps at the network.json shutdown limit, so a tank holding there has 0 error", () => {
  const rate = physicsRate(2400, 0, 1000);
  const ds = synth({ step: 300, hours: 4, inflow: 2400, flow: 0, cap: 1000, level: (h) => Math.min(92, 70 + rate * h) });
  const [tp] = tankPhysics(ds);
  for (let i = 0; i < ds.ts.length; i++) if (!Number.isNaN(tp.err[i])) assert.ok(Math.abs(tp.err[i]) < 1e-9, `tick ${i} error ${tp.err[i]}`);
});

test("calibration skips ticks changed by a fault: lines come from clean data only", () => {
  const rate = physicsRate(2400, 0, 1000);
  const from_ts = 1000 + 2 * 3600;
  const ds = synth({ step: 300, hours: 4, inflow: 2400, flow: 0, cap: 1000, level: (h) => 30 + rate * Math.min(h, 2) });
  const all = calibrate(ds, []);
  assert.ok(all.worst_clean_err > 5, `stuck sensor counted: ${all.worst_clean_err}`);
  const clean = calibrate(ds, [{ keys: [seriesKey("X_TANK", "level_pct")], from_ts }]);
  assert.ok(clean.worst_clean_err < 1e-9, `stuck ticks skipped: ${clean.worst_clean_err}`);
});

test("calibration on full_week: DRIFTING line = 1.5 x worst clean 1-hour error, LYING line = max(2.0, 2 x worst)", { skip: !hasData("full_week") }, () => {
  const ds = loadFolder("full_week");
  let worst = 0;
  for (const tp of tankPhysics(ds)) for (const e of tp.err) if (!Number.isNaN(e)) worst = Math.max(worst, Math.abs(e));
  const cal = calibrate(ds);
  assert.equal(cal.worst_clean_err, worst);
  assert.equal(cal.drift_line, 1.5 * worst);
  assert.equal(cal.lie_line, Math.max(2.0, 2 * worst));
  // PLAN.md: clean full_week worst is 0.47 pts at the end of each 1-hour window, line about 0.7.
  assert.ok(Math.abs(worst - 0.47) < 0.01, `worst ${worst}`);
  assert.equal(tankPhysics(ds).length, ds.network.systems.reduce((n, s) => n + s.facilities.length, 0));
});
