// Run: npx tsx --test app/ui/ui.test.ts
// The pure parts of the borrowed motion: the wordmark scramble's frames, the line grouping of
// the headline reveal, and the clock line. (ScreenNav imports a CSS module, so it is checked in
// the browser, not here.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { scrambleFrame } from "./Scramble";
import { lineIndexes } from "./LineReveal";
import { clockText } from "./LiveClock";

test("the scramble settles letters from the left and ends on the word", () => {
  const n = () => 3;        // always the fourth glyph, "N"
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => scrambleFrame("Avon", i, n)), ["NNNN", "NNNN", "ANNN", "AvNN", "AvoN", "Avon"]);
  for (let i = 0; i <= 5; i++) assert.equal(scrambleFrame("Avon", i, () => 7).length, 4);
});

test("words are grouped into lines by their top edge", () => {
  assert.deepEqual(lineIndexes([10, 10, 10.5, 60, 60, 110]), [0, 0, 0, 1, 1, 2]);
  assert.deepEqual(lineIndexes([0]), [0]);
  assert.deepEqual(lineIndexes([]), []);
});

test("the clock reads Midland's time and the data's time in UTC", () => {
  const at = Date.UTC(2026, 10, 8, 9, 57);     // 03:57 in Midland (CST, UTC-6)
  const data = Date.UTC(2026, 9, 10, 15, 30) / 1000;
  assert.equal(clockText(at, data), "Midland 03:57 · data 15:30 UTC");
  assert.equal(clockText(at, null), "Midland 03:57");
  // Never matches the console header's " · now 2026-" pattern that scripts/e2e reads the dataset from.
  assert.ok(!/ · now \d{4}-/.test(clockText(at, data)));
});
