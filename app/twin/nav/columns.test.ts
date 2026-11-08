import { test } from "node:test";
import assert from "node:assert/strict";
import { COLUMNS, columnRects, disjoint, inside, toggleDetail } from "./columns";
import { altRows, readable } from "./board";

test("four columns, each with one button, in the order problem, action, forecast, site", () => {
  assert.deepEqual(COLUMNS.map((c) => c.label), ["PROBLEM", "ACTION", "FORECAST", "SITE"]);
  assert.deepEqual(COLUMNS.map((c) => c.button), ["Pump details", "Why this plan", "Forecast and simulate", "Site insight"]);
});

test("the four column rects fill the body without overlapping", () => {
  const rs = columnRects(44, 1356, 130, 754, 16);
  assert.equal(rs.length, 4);
  assert.ok(disjoint(rs));
  assert.ok(inside(rs, { x: 44, y: 130, w: 1312, h: 624 }));
  assert.ok(Math.abs(rs[3].x + rs[3].w - 1356) < 1e-9);
  assert.ok(rs.every((r) => r.w > 300));
});

test("one detail open at a time: another replaces it, the same one closes it", () => {
  assert.equal(toggleDetail(null, "pump"), "pump");
  assert.equal(toggleDetail("pump", "why"), "why");
  assert.equal(toggleDetail("why", "why"), null);
  assert.equal(toggleDetail("site", "goto"), "goto");
});

test("Why not the others reads as the console: No action, readable ids, money", () => {
  const rows = altRows([{ label: "Shut in S5_WELL_C2 at 15:30", cost: 1200, why: "costs more" }, { label: "Do nothing", cost: 18000.4, why: "tank trips" }]);
  assert.equal(rows[0].label, "Shut in S5 well C2 at 15:30");
  assert.equal(rows[1].label, "No action");
  assert.match(rows[1].cost, /^\$18,000$/);
  assert.equal(readable("Call 2 trucks now, 1 trip each"), "Call 2 trucks now, 1 trip each");
});

test("disjoint catches an overlap", () => {
  assert.equal(disjoint([{ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 }]), false);
  assert.equal(disjoint([{ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 }]), true);
});
