import { test } from "node:test";
import assert from "node:assert/strict";
import { H, W } from "./projection.ts";
import { clampView, easeInOut, focusOn, MAX_K, onScreen, panBy, same, toBox, toFrame, tween, US, wheelFactor, zoomAt, type View } from "./zoom.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const apply = (v: View, px: number, py: number) => [v.k * px + v.x, v.k * py + v.y];

test("zooming about a point keeps that point under the pointer", () => {
  const p = [612, 404];
  const before = apply(US, p[0], p[1]);
  const v = zoomAt(US, before[0], before[1], 2.5);
  const after = apply(v, p[0], p[1]);
  near(v.k, 2.5);
  near(after[0], before[0]);
  near(after[1], before[1]);
  // and back out to the whole country
  const out = zoomAt(v, 300, 300, 1 / 10);
  assert.deepEqual(out, US);
});

test("scale stays between the US view and the maximum", () => {
  assert.equal(zoomAt(US, 500, 300, 0.5).k, 1);
  assert.equal(zoomAt({ k: 10, x: -5000, y: -3000 }, 500, 300, 10).k, MAX_K);
});

test("the map cannot be dragged off the frame", () => {
  assert.deepEqual(panBy(US, 200, -90), US);
  const v = { k: 3, x: -1000, y: -600 };
  assert.deepEqual(panBy(v, 5000, 5000), { k: 3, x: 0, y: 0 });
  assert.deepEqual(panBy(v, -9000, -9000), { k: 3, x: W - 3 * W, y: H - 3 * H });
  // slack lets an edge come in a little, for the side panel
  assert.deepEqual(clampView({ k: 3, x: 500, y: 0 }, 120), { k: 3, x: 120, y: 0 });
});

test("focusOn puts a site at the requested screen point", () => {
  const v = focusOn(400, 420, 4, 380, 300);
  const [x, y] = apply(v, 400, 420);
  near(x, 380);
  near(y, 300);
});

test("tween runs from one view to the other with a geometric scale", () => {
  const a = US, b = focusOn(400, 420, 4);
  assert.deepEqual(tween(a, b, 0), a);
  assert.deepEqual(tween(a, b, 1), b);
  near(tween(a, b, 0.5).k, 2);
  // the centre of the frame moves on a straight line from the US centre to the site
  const mid = tween(a, b, 0.5);
  near((W / 2 - mid.x) / mid.k, (W / 2 + 400) / 2);
  near((H / 2 - mid.y) / mid.k, (H / 2 + 420) / 2);
  near(easeInOut(0), 0);
  near(easeInOut(1), 1);
  near(easeInOut(0.5), 0.5);
  assert.ok(easeInOut(0.25) < 0.25 && easeInOut(0.75) > 0.75);
});

test("a wheel notch zooms in going up and out going down, about 1.25x, with line and page modes", () => {
  assert.ok(wheelFactor(-100) > 1.2 && wheelFactor(-100) < 1.3);
  near(wheelFactor(100) * wheelFactor(-100), 1);
  near(wheelFactor(-3, 1), wheelFactor(-48));
  assert.ok(wheelFactor(-10000) < 2);
});

test("box pixels and frame units round-trip for a wide and a tall box", () => {
  for (const box of [{ width: 1440, height: 640 }, { width: 390, height: 360 }]) {
    const [fx, fy] = toFrame(box, 123, 77);
    const [bx, by] = toBox(box, fx, fy);
    near(bx, 123, 1e-9);
    near(by, 77, 1e-9);
  }
  // a tall box: the frame is centred vertically, its full width used
  const [x0, y0] = toBox({ width: 390, height: 360 }, 0, 0);
  near(x0, 0);
  near(y0, (360 - H * (390 / W)) / 2);
  const [mx, my] = onScreen({ width: W, height: H }, { k: 2, x: -100, y: -50 }, 300, 200);
  near(mx, 500);
  near(my, 350);
  assert.ok(same(US, { k: 1.00001, x: 0.01, y: 0 }));
});
