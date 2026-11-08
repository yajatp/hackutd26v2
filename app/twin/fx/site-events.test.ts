import test from "node:test";
import assert from "node:assert/strict";
import { strobe, transmitterBlink, needleAngle, NEEDLE_OK, ALARM_POLE } from "./SiteEvents";
import { DIKE } from "../models/Lease";

test("the strobe flashes sharply once a second and is dark most of the time", () => {
  assert.ok(strobe(0.02) > 0.99);
  assert.ok(strobe(1.02) > 0.99);
  assert.ok(strobe(0.5) < 0.01);
  let lit = 0;
  for (let i = 0; i < 1000; i++) if (strobe(i / 1000) > 0.3) lit++;
  assert.ok(lit > 40 && lit < 160, `lit ${lit} ms of 1000`);
});

test("a healthy transmitter blinks green briefly every 2 s; a faked one blinks fast and red", () => {
  assert.deepEqual(transmitterBlink(0.05, false), { on: 1, red: false });
  assert.deepEqual(transmitterBlink(1.0, false), { on: 0, red: false });
  let reds = 0, changes = 0, prev = -1;
  for (let i = 0; i < 70; i++) { const b = transmitterBlink(i / 7 + 0.01, true); if (b.red) reds++; if (b.on !== prev) changes++; prev = b.on; }
  assert.ok(reds > 5, `reds ${reds}`);
  assert.ok(changes > 10, `changes ${changes}`);
});

test("the alarm pole stands outside the containment dike", () => {
  const outsideX = ALARM_POLE.x < DIKE.xMin - DIKE.t || ALARM_POLE.x > DIKE.xMax + DIKE.t;
  const outsideZ = Math.abs(ALARM_POLE.z) > DIKE.half + DIKE.t;
  assert.ok(outsideX || outsideZ, "the pole stands outside the battery's dike");
});

test("the transmitter's needle holds steady when healthy and twitches between wrong readings when faked", () => {
  assert.equal(needleAngle(0.3, false), NEEDLE_OK);
  assert.equal(needleAngle(7.9, false), NEEDLE_OK);
  const seen = new Set<number>();
  let far = 0;
  for (let i = 0; i < 70; i++) { const a = needleAngle(i / 7 + 0.01, true); seen.add(Math.round(a * 20)); if (Math.abs(a - NEEDLE_OK) > 0.2) far++; }
  assert.ok(seen.size > 10, `distinct readings ${seen.size}`);
  assert.ok(far > 20, `readings far from the true one ${far}`);
  for (let i = 0; i < 70; i++) assert.ok(Math.abs(needleAngle(i / 7, true) - NEEDLE_OK) < 0.9, "the needle stays on the dial");
});
