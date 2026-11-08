// Run: npx tsx --test app/twin/nav/motion.test.ts
// The dock's lazy follow, its layout, and the view-change fade.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FADE_MS } from "../theme";
import {
  ahead, BOARD, DOCK, DOCK_BUTTON, DOCK_BUTTONS, DOCK_TILT, dockLayout, ease, fadeAlpha, followAnchor, followPos, followYaw,
  stagger, wrapPi, yawOf, type Anchor, type Follow,
} from "./motion";

const DEG = Math.PI / 180;
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

function run(f: Follow, head: number, ms: number, step = 14): Follow {
  for (let t = 0; t < ms; t += step) f = followYaw(f, head, step);
  return f;
}

test("angles wrap the short way round", () => {
  assert.ok(near(wrapPi(3 * Math.PI), Math.PI));
  assert.ok(near(wrapPi(-Math.PI / 2), -Math.PI / 2));
  assert.ok(near(wrapPi(350 * DEG), -10 * DEG));
  assert.ok(near(yawOf(0, -1), 0), "looking north");
  assert.ok(near(yawOf(-1, 0), Math.PI / 2), "looking west is +90 deg (three.js rotation.y)");
});

test("the dock waits while the judge looks around inside 40 degrees", () => {
  const f = run({ yaw: 0, catching: false }, 35 * DEG, 2000);
  assert.equal(f.yaw, 0);
  assert.equal(f.catching, false);
});

test("past 40 degrees it catches up, eased, and rests on the judge's yaw", () => {
  let f = followYaw({ yaw: 0, catching: false }, 60 * DEG, 14);
  assert.equal(f.catching, true);
  assert.ok(f.yaw > 0 && f.yaw < 60 * DEG, "moves a little each frame, not a jump");
  f = run(f, 60 * DEG, DOCK.followMs * 2);
  assert.equal(f.catching, false);
  assert.ok(near(f.yaw, 60 * DEG));
  // Once caught, it keeps catching even inside 40 degrees until it settles.
  const mid = followYaw({ yaw: 0, catching: true }, 10 * DEG, 14);
  assert.ok(mid.yaw > 0);
});

test("the follow takes the short way across +-180 degrees", () => {
  const f = followYaw({ yaw: 170 * DEG, catching: false }, -130 * DEG, 14);
  assert.equal(f.catching, true);
  assert.ok(wrapPi(f.yaw - 170 * DEG) > 0, "turns on through 180, not back through 0");
});

test("reduced motion: the dock jumps to the judge instead of sweeping", () => {
  const f = followYaw({ yaw: 0, catching: false }, 90 * DEG, 14, { still: true });
  assert.ok(near(f.yaw, 90 * DEG));
  assert.equal(f.catching, false);
});

test("dock placement: 0.45 m under the eyes, 0.9 m ahead along the yaw, tilted up to face them", () => {
  const p = ahead([0, 1.6, 0], 0, DOCK.aheadM, DOCK.downM);
  assert.ok(near(p[0], 0) && near(p[1], 1.15) && near(p[2], -0.9));
  const w = ahead([1, 1.6, 2], Math.PI / 2, DOCK.aheadM, DOCK.downM);
  assert.ok(near(w[0], 1 - 0.9) && near(w[2], 2), "turned left: the dock is to the west");
  assert.ok(DOCK_TILT < 0 && DOCK_TILT > -Math.PI / 4);
  // The dashboard: 1.0 m ahead, the theme's 1.0 x 0.62 shape, and its 30 px body text at least
  // the theme's 0.022 m-at-1 m (Meta's ~18 px) at that distance.
  assert.ok(BOARD.aheadM === 1.0 && Math.abs(BOARD.hM / BOARD.wM - 0.62) < 0.001);
  assert.ok(Math.abs(BOARD.texW / BOARD.texH - BOARD.wM / BOARD.hM) < 0.005, "the texture is not stretched");
  assert.ok((30 * BOARD.wM) / BOARD.texW >= 0.022 * BOARD.aheadM, "30 px body text reads at the dashboard's distance");
});

test("the open dashboard's bottom edge clears the dock's top edge by at least 4 degrees", () => {
  // The dock's rail (Dock.tsx): buttons, a 0.036 m title strip and 0.011 m pads, tilted to face the eyes.
  const railH = DOCK_BUTTON.hM + 0.036 + 2 * 0.011;
  const dockTop = Math.atan2(DOCK.downM - (railH / 2) * Math.cos(DOCK_TILT), DOCK.aheadM - (railH / 2) * Math.sin(DOCK_TILT));
  const boardTilt = -Math.atan2(BOARD.downM, BOARD.aheadM);
  const boardBottom = Math.atan2(BOARD.downM + (BOARD.hM / 2) * Math.cos(boardTilt), BOARD.aheadM + (BOARD.hM / 2) * Math.sin(boardTilt));
  assert.ok(dockTop - boardBottom >= 4 * DEG, `gap ${((dockTop - boardBottom) / DEG).toFixed(1)} deg`);
  assert.ok(Math.atan2(BOARD.hM / 2 - BOARD.downM, BOARD.aheadM) < 25 * DEG, "its top edge stays within a comfortable look up");
});

test("positions ease, and jump after a teleport", () => {
  const a = followPos([0, 0, 0], [0.1, 0, 0], 14, 260);
  assert.ok(a[0] > 0 && a[0] < 0.1);
  assert.deepEqual(followPos([0, 0, 0], [8, 0, 0], 14, 260), [8, 0, 0]);
  assert.deepEqual(followPos(null, [1, 2, 3], 14, 260), [1, 2, 3]);
  assert.equal(ease(0, 1, 100, 0), 1);
});

test("the menu's anchor ignores a lean, follows a step, and jumps with a teleport", () => {
  let a: Anchor = followAnchor({ at: null, moving: false }, [0, 1.6, 0], 14);
  assert.deepEqual(a.at, [0, 1.6, 0]);
  const lean = followAnchor(a, [0, 1.5, -0.15], 14);
  assert.deepEqual(lean.at, [0, 1.6, 0], "a lean or a look down: the menu stays put");
  a = followAnchor(a, [0.5, 1.6, 0], 14);
  assert.ok(a.moving && a.at![0] > 0 && a.at![0] < 0.5, "a step: it eases after the judge");
  for (let i = 0; i < 100; i++) a = followAnchor(a, [0.5, 1.6, 0], 14);
  assert.deepEqual(a.at, [0.5, 1.6, 0]);
  assert.equal(a.moving, false, "and rests once there");
  const jump = followAnchor(a, [0.5, 1.6, 8], 14);
  assert.deepEqual(jump.at, [0.5, 1.6, 8], "teleport: at once");
  const turn = followAnchor({ at: [0, 1.6, 0], moving: false }, [0.1, 1.6, 0], 14, { catching: true });
  assert.ok(turn.moving, "a yaw catch-up also re-centers it");
});

test("five dock buttons, Table Overview Walk Dashboard Reset, each at least 6 cm, none overlapping", () => {
  assert.deepEqual(DOCK_BUTTONS.map((b) => b.label), ["Table", "Overview", "Walk", "Dashboard", "Reset"]);
  assert.ok(DOCK_BUTTON.wM >= 0.06 && DOCK_BUTTON.hM >= 0.06);
  const xs = dockLayout();
  assert.equal(xs.length, 5);
  assert.ok(near(xs[2], 0), "centered");
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= DOCK_BUTTON.wM, "no overlap");
});

test("fade: out to opaque over FADE_MS, hold, back in", () => {
  assert.equal(fadeAlpha({ phase: "idle", t0: 0, ms: FADE_MS }, 99), 0);
  assert.equal(fadeAlpha({ phase: "out", t0: 1000, ms: FADE_MS }, 1000), 0);
  const mid = fadeAlpha({ phase: "out", t0: 1000, ms: FADE_MS }, 1000 + FADE_MS / 2);
  assert.ok(near(mid, 0.5));
  assert.equal(fadeAlpha({ phase: "out", t0: 1000, ms: FADE_MS }, 1000 + FADE_MS + 50), 1);
  assert.equal(fadeAlpha({ phase: "hold", t0: 0, ms: FADE_MS }, 5), 1);
  assert.equal(fadeAlpha({ phase: "in", t0: 0, ms: FADE_MS }, FADE_MS), 0);
  assert.equal(fadeAlpha({ phase: "in", t0: 0, ms: FADE_MS }, 0), 1);
});

test("buttons pop in one after another", () => {
  assert.equal(stagger(0, 0), 0);
  assert.ok(stagger(100, 0) > stagger(100, 1));
  assert.equal(stagger(10_000, 4), 1);
});
