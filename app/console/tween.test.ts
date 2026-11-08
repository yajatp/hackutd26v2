// Run: npx tsx --test app/console/tween.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bringIntoView, easeOut, freshConfirm, prefersReducedMotion, tween } from "./tween.ts";

test("easeOut starts at 0, ends at 1, clamps outside 0..1 and never overshoots", () => {
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.equal(easeOut(-2), 0);
  assert.equal(easeOut(3), 1);
  let last = 0;
  for (let k = 0.05; k <= 1; k += 0.05) {
    const v = easeOut(k);
    assert.ok(v >= last && v <= 1, `not monotonic at ${k}`);
    last = v;
  }
  assert.ok(easeOut(0.5) > 0.5, "an ease-out is past halfway at half time");
});

test("tween lands exactly on the new value, both up and down", () => {
  assert.equal(tween(905, 1810, 0), 905);
  assert.equal(tween(905, 1810, 1), 1810);
  assert.equal(tween(1810, 905, 1), 905);
  const mid = tween(1810, 905, 0.5);
  assert.ok(mid < 1810 && mid > 905);
  assert.equal(tween(42, 42, 0.3), 42);
});

test("prefersReducedMotion is false where there is no window (server render, tests)", () => {
  assert.equal(prefersReducedMotion(), false);
});

test("bringIntoView: only a block that ends below the fold, and never after the person scrolled", () => {
  assert.equal(bringIntoView(907, 900, false), true);
  assert.equal(bringIntoView(899, 900, false), false);
  assert.equal(bringIntoView(900, 900, false), false);
  assert.equal(bringIntoView(907, 900, true), false);
  assert.equal(bringIntoView(907, 0, false), false);   // no viewport measured (a hidden tab)
});

test("freshConfirm: the check draws for a confirm just made, not for an old one shown again", () => {
  const now = 1_762_570_000_000;
  assert.equal(freshConfirm(now, now - 800, null), true);              // the server stamped it just now
  assert.equal(freshConfirm(now, now - 60_000, null), false);          // 02:58 confirm, back after Clear
  assert.equal(freshConfirm(now, now - 60_000, now - 600), true);      // pressed here (server clock behind)
  assert.equal(freshConfirm(now, now - 60_000, now - 9_000), false);   // pressed long ago
  assert.equal(freshConfirm(now, now + 2_000, null), true);            // server clock a little ahead
  assert.equal(freshConfirm(now, now - 4_999, null), true);
  assert.equal(freshConfirm(now, now - 5_000, null), false);
});
