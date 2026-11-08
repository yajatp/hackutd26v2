// Run: npx tsx --test app/twin/stage.test.ts
// Where things stand in the headset, for a first-time VR user: a table-height model a short step
// in front, nothing behind or under the floor, cards facing the judge, the thumbstick turning the
// model in 30 degree steps.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SiteFacility } from "@/lib/live";
import { layoutSite } from "./model";
import {
  facing, HOW_TO, LEGEND, MODEL_CENTER, NEAR_EDGE_M, PANEL, RESET, SNAP_RAD, snapTurn, stickX,
  TABLE_TOP_Y, TANK_H, TANK_R, toWorld, TURNTABLE_R, type P3,
} from "./stage";

const flat = (p: P3) => Math.hypot(p[0], p[2]);   // horizontal distance from the judge's feet

test("table-height model: top at about 0.8 m, near edge a short step in front, centered", () => {
  assert.ok(TABLE_TOP_Y >= 0.7 && TABLE_TOP_Y <= 0.9, `table top ${TABLE_TOP_Y}`);
  assert.equal(MODEL_CENTER[0], 0);
  assert.equal(MODEL_CENTER[1], TABLE_TOP_Y);
  const near = -MODEL_CENTER[2] - TURNTABLE_R;
  assert.ok(Math.abs(near - NEAR_EDGE_M) < 1e-9);
  assert.ok(near >= 0.4 && near <= 0.9, `near edge ${near} m in front`);
});

test("any site at any snap rotation stays on the turntable and in front of the judge", () => {
  // The widest possible layout: a square site, tanks in its four corners.
  const corner = (id: string, lat: number, lon: number): SiteFacility => ({
    facility_id: id, system_id: id.slice(0, 2), lat, lon, tank_id: id + "_T", pump_id: id + "_P", capacity_bbl: 1, well_ids: [],
  });
  const k = Math.cos((32 * Math.PI) / 180);
  const square = [corner("S1_A", 32.5, -102), corner("S2_A", 31.5, -102), corner("S3_A", 32.5, -102 + 1 / k), corner("S4_A", 31.5, -102 + 1 / k)];
  const { tanks } = layoutSite(square);
  for (let step = 0; step < 12; step++) {
    for (const t of tanks) {
      assert.ok(Math.hypot(t.x, t.z) + TANK_R <= TURNTABLE_R + 1e-9, `${t.facility_id} on the turntable`);
      for (const y of [0, TANK_H]) {
        const w = toWorld(t.x, y, t.z, step * SNAP_RAD);
        assert.ok(w[2] + TANK_R < 0, `${t.facility_id} at step ${step} is in front (z ${w[2]})`);
        assert.ok(w[1] > 0, "above the floor");
      }
    }
  }
  assert.ok(MODEL_CENTER[2] + TURNTABLE_R < 0, "the turntable's near edge is in front of the judge");
});

test("toWorld turns about the model center like three.js rotation.y", () => {
  const c = toWorld(0, 0, 0, 1.234);
  assert.deepEqual(c.map((v) => +v.toFixed(9)), MODEL_CENTER.map((v) => +v.toFixed(9)));
  const near = toWorld(0, 0, 0.5, Math.PI / 2);          // the near edge, turned a quarter
  assert.ok(Math.abs(near[0] - 0.5) < 1e-9 && Math.abs(near[2] - MODEL_CENTER[2]) < 1e-9, "near edge moves to +x");
});

test("thumbstick: one push is one 30 degree step; it re-arms only back in the dead zone", () => {
  assert.equal(SNAP_RAD, Math.PI / 6);
  assert.deepEqual(snapTurn(0.9, true), { step: 1, armed: false });
  assert.deepEqual(snapTurn(0.95, false), { step: 0, armed: false });    // held: no smooth turning
  assert.deepEqual(snapTurn(0.45, false), { step: 0, armed: false });    // easing off is not enough
  assert.deepEqual(snapTurn(0.1, false), { step: 0, armed: true });      // back to center re-arms
  assert.deepEqual(snapTurn(-0.8, true), { step: -1, armed: false });
  assert.deepEqual(snapTurn(0.4, true), { step: 0, armed: true });       // a small nudge does nothing
  assert.equal(stickX([0, 0, 0.7, -0.2]), 0.7);                          // xr-standard: thumbstick is axes 2-3
  assert.equal(stickX([0.5, 0]), 0.5);                                   // a pad-only controller
  assert.equal(stickX([]), 0);
});

test("cards face the judge", () => {
  for (const at of [PANEL.at, LEGEND.at, HOW_TO.at, RESET.at]) {
    const yaw = facing(at);
    // A plane's front is +z; turned by yaw it must point back at the judge.
    const nx = Math.sin(yaw), nz = Math.cos(yaw);
    const d = flat(at);
    assert.ok(Math.abs(nx + at[0] / d) < 1e-9 && Math.abs(nz + at[2] / d) < 1e-9, `card at ${at} faces the judge`);
  }
});

test("info panel: beside the model, about 1 m away, body text at least 1.5 cm tall", () => {
  const offModel = Math.hypot(PANEL.at[0] - MODEL_CENTER[0], PANEL.at[2] - MODEL_CENTER[2]);
  assert.ok(offModel > TURNTABLE_R, "its center is beside the turntable, not over it");
  assert.ok(flat(PANEL.at) >= 0.8 && flat(PANEL.at) <= 1.3, `panel ${flat(PANEL.at)} m away`);
  assert.ok(PANEL.bodyPx / PANEL.pxPerM >= 0.015, `body text ${PANEL.bodyPx / PANEL.pxPerM} m`);
  assert.ok(PANEL.at[1] > TABLE_TOP_Y, "it floats above table height");
});

test("Reset view: big, in front of the judge, above the table; How to use is straight ahead", () => {
  assert.ok(RESET.w >= 0.2, `reset button ${RESET.w} m wide`);
  assert.ok(RESET.h >= 0.08);
  assert.ok(RESET.at[2] < 0 && Math.abs(RESET.at[0]) < 0.2, "in front");
  assert.ok(RESET.at[1] > TABLE_TOP_Y + 0.3, "above the table, not in the way of the tanks");
  assert.equal(HOW_TO.at[0], 0);
  assert.ok(HOW_TO.at[2] < 0 && HOW_TO.at[1] > RESET.at[1], "How to use sits straight ahead, above the button");
});

test("nothing is behind the judge or under the floor", () => {
  for (const at of [PANEL.at, LEGEND.at, HOW_TO.at, RESET.at, MODEL_CENTER]) {
    assert.ok(at[2] < 0, `${at} is in front`);
    assert.ok(at[1] > 0, `${at} is above the floor`);
  }
});
