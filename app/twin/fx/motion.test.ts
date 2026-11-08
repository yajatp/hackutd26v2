// Run: npx tsx --test app/twin/fx/motion.test.ts
// The attack moment's timing without a browser: the toast's slide and hold, the shockwave's
// ring, the beacon's sweep, the glitch on the /vr cadence, the chirp, and reduced motion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { glitchFrame } from "@/app/vr/field";
import {
  approach, beaconAngle, beaconFlash, chirpPlan, glitchSample, toastPose, waveAt,
  BEACON_PERIOD_S, GRID_DIM_MS, gridDim, TOAST_FADE_MS, TOAST_HOLD_MS, TOAST_IN_MS, TOAST_OUT_MS, WAVE_S,
} from "./motion";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("approach: 95% of the way after the settle time, whatever the frame rate; 0 ms jumps", () => {
  near(approach(0, 1, 200, 200), 1 - Math.exp(-3), 1e-12);
  let x = 0;
  for (let i = 0; i < 20; i++) x = approach(x, 1, 10, 200);
  near(x, approach(0, 1, 200, 200), 1e-9);
  assert.equal(approach(0.3, 1, 16, 0), 1);
});

test("toast: slides up from below in ~0.4 s, holds 4 s with the bar draining, slides away", () => {
  const start = toastPose(0);
  assert.equal(start.slide, 1);
  assert.equal(start.opacity, 0);
  const inPlace = toastPose(TOAST_IN_MS);
  assert.equal(inPlace.slide, 0);
  assert.equal(inPlace.opacity, 1);
  near(toastPose(TOAST_IN_MS + TOAST_HOLD_MS / 2).left, 0.5);
  const leaving = toastPose(TOAST_IN_MS + TOAST_HOLD_MS + TOAST_OUT_MS / 2);
  assert.ok(leaving.slide > 0 && leaving.slide < 1 && leaving.opacity < 1);
  assert.equal(toastPose(TOAST_IN_MS + TOAST_HOLD_MS + TOAST_OUT_MS).done, true);
  assert.equal(toastPose(TOAST_IN_MS + TOAST_HOLD_MS + TOAST_OUT_MS - 1).done, false);
  assert.ok(toastPose(TOAST_IN_MS + 10).glow > toastPose(TOAST_IN_MS + 2000).glow, "the halo flares on arrival, then rests");
  assert.ok(toastPose(100).scan > 0 && toastPose(2000).scan === -1, "the light bar crosses once");
});

test("toast, still: no slide and no light bar, a short fade, the same hold", () => {
  for (const t of [0, 50, TOAST_FADE_MS, 2000, TOAST_FADE_MS + TOAST_HOLD_MS + 80]) {
    const p = toastPose(t, TOAST_HOLD_MS, true);
    assert.equal(p.slide, 0);
    assert.equal(p.scan, -1);
  }
  assert.equal(toastPose(TOAST_FADE_MS, TOAST_HOLD_MS, true).opacity, 1);
  assert.equal(toastPose(2 * TOAST_FADE_MS + TOAST_HOLD_MS, TOAST_HOLD_MS, true).done, true);
});

test("shockwave: the ring races out and fades over ~1.2 s, with a column at the start", () => {
  const a = waveAt(0.1), b = waveAt(0.6), c = waveAt(1.1);
  assert.ok(a.front < b.front && b.front < c.front && c.front < 1);
  assert.ok(a.fade > b.fade && b.fade > c.fade && c.fade > 0);
  assert.ok(waveAt(0.12).column > 0.3);
  assert.equal(waveAt(0.7).column, 0);
  assert.equal(waveAt(WAVE_S).done, true);
  assert.equal(waveAt(WAVE_S - 0.01).done, false);
  assert.ok(waveAt(0.3).front > 0.5, "ease-out: most of the reach in the first quarter");
});

test("beacon: one turn per period; still does not spin; the flash is sharp", () => {
  near(beaconAngle(BEACON_PERIOD_S / 4, false), Math.PI / 2, 1e-9);
  near(beaconAngle(BEACON_PERIOD_S * 3.5, false), Math.PI, 1e-9);
  assert.equal(beaconAngle(12.3, true), 0);
  assert.equal(beaconFlash(1), 1);
  assert.equal(beaconFlash(-0.5), 0);
  assert.ok(beaconFlash(Math.cos(0.5)) < 0.3, "30 degrees off the cone is already dim");
});

test("glitch: on exactly when glitchFrame says so, same time same picture, seeds differ, still never", () => {
  let on = 0, off = 0, moved = 0;
  for (let t = 0; t < 14000; t += 7) {
    const g = glitchSample(t, false, 1);
    assert.equal(g.on, glitchFrame(t, false) !== null);
    if (g.on) {
      on++;
      assert.equal(g.frame, glitchFrame(t, false));
      assert.ok(g.dx >= -1 && g.dx <= 1 && g.dy >= -1 && g.dy <= 1 && g.ghost >= 0 && g.ghost < 1);
      if (g.dx !== 0) moved++;
    } else {
      off++;
      assert.equal(g.dx, 0);
    }
  }
  assert.ok(on > 0 && off > on, "bursts are short");
  assert.ok(moved > 0 && moved < on, "some frames tear, some do not");
  assert.deepEqual(glitchSample(1450, false, 2), glitchSample(1450, false, 2));
  assert.notDeepEqual(glitchSample(1450, false, 2), glitchSample(1450, false, 5));
  for (const t of [0, 1450, 2850]) assert.equal(glitchSample(t, true).on, false);
});

test("chirp: two tones for each kind, short, rising for a fake and falling otherwise", () => {
  for (const kind of ["faked", "failed", "cleared"] as const) {
    const p = chirpPlan(kind);
    assert.equal(p.length, 2);
    const end = Math.max(...p.map((x) => x.at + x.dur));
    assert.ok(end < 0.6, `${kind} is short (${end} s)`);
    for (const x of p) assert.ok(x.gain > 0 && x.gain <= 0.2 && x.f0 > 200 && x.f0 < 2000);
  }
  assert.ok(chirpPlan("faked")[1].f0 > chirpPlan("faked")[0].f0);
  assert.ok(chirpPlan("failed")[1].f0 < chirpPlan("failed")[0].f0);
  assert.ok(chirpPlan("cleared")[1].f0 < chirpPlan("cleared")[0].f0);
});

test("the toast holds 6 s; the table grid dips to 40% under a wave for GRID_DIM_MS, never when still", () => {
  assert.equal(TOAST_HOLD_MS, 6000);
  assert.equal(gridDim(-Infinity), 1);
  assert.equal(gridDim(Infinity), 1);
  assert.equal(gridDim(0), 0.4);
  assert.equal(gridDim(GRID_DIM_MS * 0.5), 0.4);
  const late = gridDim(GRID_DIM_MS * 0.9);
  assert.ok(late > 0.4 && late < 1);
  assert.equal(gridDim(GRID_DIM_MS), 1);
  assert.equal(gridDim(100, true), 1);
});
