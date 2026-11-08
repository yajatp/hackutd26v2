import { test } from "node:test";
import assert from "node:assert/strict";
import { RTT_INTERVAL_MS, RTT_KEEP_ROWS, RTT_SAMPLES, RttMeter, median, rttRowsToDelete } from "./rtt.ts";

test("probe settings: every 5 s, median of the last 5, the table keeps 50 rows", () => {
  assert.equal(RTT_INTERVAL_MS, 5000);
  assert.equal(RTT_SAMPLES, 5);
  assert.equal(RTT_KEEP_ROWS, 50);
});

test("median of an odd and an even count, and of nothing", () => {
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test("the meter times each nonce from ping to its own row and keeps the median of the last 5", () => {
  const seen: (number | null)[] = [];
  const m = new RttMeter(100, ms => seen.push(ms));
  const times = [10, 2, 30, 4, 50, 6];
  let t = 0;
  for (const ms of times) {
    const n = m.sent(t);
    m.arrived(n, t + ms);
    t += 5000;
  }
  // last 5 samples: 2, 30, 4, 50, 6 -> median 6
  assert.equal(m.value(), 6);
  assert.deepEqual(seen, [10, 6, 10, 7, 10, 6]);
});

test("a row this client did not wait for (old row, other nonce) is ignored", () => {
  const m = new RttMeter(7, () => {});
  const n = m.sent(0);
  assert.equal(n, 7);
  m.arrived(999, 3);
  assert.equal(m.value(), null);
  m.arrived(n, 3);
  m.arrived(n, 9); // the same row twice counts once
  assert.equal(m.value(), 3);
});

test("a ping with no answer for 30 s is dropped; reset forgets every sample", () => {
  const m = new RttMeter(1, () => {});
  const lost = m.sent(0);
  m.sent(31_000); // sending again drops pings older than 30 s
  m.arrived(lost, 31_001);
  assert.equal(m.value(), null);
  const ok = m.sent(40_000);
  m.arrived(ok, 40_002);
  assert.equal(m.value(), 2);
  m.reset();
  assert.equal(m.value(), null);
});

test("nonces stay in u32 range", () => {
  const m = new RttMeter(0xffffffff, () => {});
  assert.equal(m.sent(0), 0xffffffff);
  assert.equal(m.sent(1), 0);
});

test("rows older than the newest 50 are deleted", () => {
  const ids = Array.from({ length: 53 }, (_, i) => BigInt(i + 1));
  assert.deepEqual(rttRowsToDelete(ids), [BigInt(1), BigInt(2), BigInt(3)]);
  assert.deepEqual(rttRowsToDelete(ids.slice(0, 50)), []);
  assert.deepEqual(rttRowsToDelete([BigInt(9), BigInt(2), BigInt(5)], 2), [BigInt(2)], "order of the input does not matter");
});
