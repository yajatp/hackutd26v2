import { test } from "node:test";
import assert from "node:assert/strict";
import { camera, project, unproject, torchAt, renderField, glitchFrame, inkOf, TABLE_R, type FieldTank, type Inks } from "./field";

const cam = camera(240, 135);
const inks: Inks = { night: inkOf("#102231"), moon: inkOf("#d7dee0"), alert: inkOf("#ef4444"), warn: inkOf("#f59e0b") };
const tank = (over: Partial<FieldTank>): FieldTank => ({ facility_id: "A", x: 0, z: 0, tone: "ok", faked: false, fill: null, ...over });

function frame(tanks: FieldTank[], torch = { x: 0, z: 0 }, tMs = 5000, still = false): Uint32Array {
  const out = new Uint32Array(cam.W * cam.H);
  renderField(out, cam, { tanks, pads: [], top: null, torch, tMs, still }, inks);
  return out;
}
const count = (px: Uint32Array, ink: number) => px.reduce((n, v) => n + (v === ink ? 1 : 0), 0);

test("a table point projects and unprojects to itself", () => {
  for (const [x, z] of [[0, 0], [0.4, -0.3], [-0.5, 0.5]]) {
    const p = project(cam, x, 0, z);
    const back = unproject(cam, p.sx, p.sy)!;
    assert.ok(Math.abs(back.x - x) < 1e-9 && Math.abs(back.z - z) < 1e-9);
  }
  assert.equal(unproject(cam, 10, cam.horizon - 1), null);
});

test("the whole 1 m site fits in the frame", () => {
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    const p = project(cam, x, 0, z);
    assert.ok(p.sx > 0 && p.sx < cam.W && p.sy > cam.horizon && p.sy < cam.H, `${x},${z} -> ${p.sx},${p.sy}`);
  }
});

test("the flashlight stays on the table", () => {
  const sky = torchAt(cam, cam.W / 2, 1);
  assert.ok(Math.hypot(sky.x, sky.z) <= TABLE_R + 1e-9);
  const corner = torchAt(cam, 0, cam.H - 1);
  assert.ok(Math.hypot(corner.x, corner.z) <= TABLE_R + 1e-9);
});

test("only tanks with a state use the red or amber ink", () => {
  const ok = frame([tank({}), tank({ facility_id: "B", x: 0.3 })]);
  assert.equal(count(ok, inks.alert) + count(ok, inks.warn), 0);
  const failed = frame([tank({ tone: "alert" }), tank({ facility_id: "B", x: 0.3, tone: "warn" })], { x: -0.6, z: 0.4 });
  assert.ok(count(failed, inks.alert) > 10, "a failed tank shows red even outside the light");
  assert.ok(count(failed, inks.warn) > 10);
});

test("a faked tank breaks up during a glitch and is whole between them", () => {
  const t = [tank({ tone: "warn", faked: true })];
  const calm = frame(t, { x: 0, z: 0 }, 700);       // between glitches
  const calm2 = frame(t, { x: 0, z: 0 }, 1000);
  assert.deepEqual(calm, calm2);
  const broken = frame(t, { x: 0, z: 0 }, 1400 + 10);
  assert.notDeepEqual(broken, calm);
  const honest = [tank({ tone: "warn" })];
  assert.deepEqual(frame(honest, { x: 0, z: 0 }, 1410), frame(honest, { x: 0, z: 0 }, 700));
});

test("with reduced motion the glitch is one frozen frame", () => {
  assert.equal(glitchFrame(123, true), 0);
  assert.equal(glitchFrame(9999, true), 0);
  const t = [tank({ faked: true, tone: "warn" })];
  assert.deepEqual(frame(t, { x: 0, z: 0 }, 100, true), frame(t, { x: 0, z: 0 }, 900, true));
});

test("inks pack as little-endian RGBA", () => {
  assert.equal(inkOf("#102231"), 0xff312210);
});
