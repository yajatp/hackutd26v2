import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { stats } from './quest-perf.mjs';

test('median, nearest-rank p95 and strict budget share', () => {
  deepStrictEqual(stats([20, 10, 14, 11], 11), { median: 12.5, p95: 20, over: 0.5 });
  deepStrictEqual(stats([3, 1, 2], 2), { median: 2, p95: 3, over: 1 / 3 });
  deepStrictEqual(stats(Array.from({ length: 20 }, (_, i) => i + 1), 19), { median: 10.5, p95: 19, over: 0.05 });
  deepStrictEqual(stats([]), { median: null, p95: null, over: null });
});
