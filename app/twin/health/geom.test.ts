// The Health pop-out's pure geometry: step lines, bands, the shared scale, labels, the grid and
// the pop-out's pose beside the dashboard.
import test from "node:test";
import assert from "node:assert/strict";
import type { FlowPoint, FlowSeries } from "@/lib/eog/flows";
import { sharedMax } from "@/app/insight/format";
import { apart, healthCells, healthGeom, healthItems, popoutPoint, popoutPose, POPOUT, type HealthItem } from "./geom";

const H = 3600, NOW = 1_700_000_000 - (1_700_000_000 % H);
const pt = (i: number, n: number, inflow: number, outflow: number, level: number): FlowPoint => ({
  end_ts: NOW - (n - 1 - i) * H, inflow_bpd: inflow, outflow_bpd: outflow, level_pct: level, physics_pts: 1, reported_pts: 1.3,
});
function series(id: string, rows: [number, number, number][]): FlowSeries {
  return { facility_id: id, system_id: "S5", tank_id: id.replace("FACILITY", "TANK"), capacity_bbl: 1000, step_s: H, points: rows.map((r, i) => pt(i, rows.length, ...r)) };
}
const plot = { x: 100, y: 50, w: 240, h: 160 };
const strip = { x: 100, y: 240, w: 240, h: 34 };

test("in and out are hourly step lines, broken where an hour has no data", () => {
  const s = series("S5_FACILITY_C", [[1000, 500, 60], [2000, 2500, 62], [NaN, 0, 64], [1500, 0, 73]]);
  const it: HealthItem = { series: s, title: "S5 Facility C", state: null, spans: [] };
  const g = healthGeom(it, 4000, 92, plot, strip);
  assert.equal(g.inRuns.length, 2, "the NaN hour splits the in line");
  assert.equal(g.inRuns[0].length, 4, "two points per hour: a flat step");
  assert.deepEqual(g.inRuns[0][0], [100, 50 + 160 - (1000 / 4000) * 160]);
  assert.deepEqual(g.inRuns[0][1], [160, 50 + 160 - (1000 / 4000) * 160]);
  assert.equal(g.outRuns.length, 1);
  assert.deepEqual(g.ticks.map((t) => t.label), ["4,000", "2,000", "0"]);
  assert.equal(g.ticks[2].y, 210);
});

test("a band only where in > out, marked down for hours inside a failure span", () => {
  const s = series("S5_FACILITY_C", [[1000, 500, 60], [2000, 2500, 62], [1500, 0, 73]]);
  const it: HealthItem = { series: s, title: "S5 Facility C", state: { word: "Pump failed", tone: "red" }, spans: [[NOW - H + 1, NOW]] };
  const g = healthGeom(it, 4000, 92, plot, strip);
  assert.equal(g.bands.length, 2, "hours 0 and 2 fill, hour 1 drains");
  assert.equal(g.bands[0].down, false);
  assert.equal(g.bands[1].down, true, "the last hour is inside the failure span");
  assert.ok(g.bands.every((b) => b.h > 0));
});

test("direct labels, level, trip limit, time axis and margin of error read like /insight", () => {
  const s = series("S5_FACILITY_C", [[1200, 1300, 60], [1299, 0, 73.4]]);
  const g = healthGeom({ series: s, title: "S5 Facility C", state: null, spans: [] }, 4000, 92, plot, strip, 22);
  assert.equal(g.inLabel.text, "in 1,299");
  assert.equal(g.outLabel.text, "out 0");
  assert.ok(Math.abs(g.inLabel.y - g.outLabel.y) >= 22, "the two labels never overlap");
  assert.equal(g.levelLabel?.text, "73%");
  assert.equal(g.limitText, "trip 92%");
  assert.ok(g.limitY > strip.y && g.limitY < strip.y + strip.h * 0.1);
  assert.equal(g.times.length, 3);
  assert.ok(g.times[2].text.startsWith("now "));
  assert.equal(g.moe, "Margin of error 0.3 pts/h");
});

test("labels that would touch are pushed apart around their midpoint", () => {
  assert.deepEqual(apart(100, 140, 20), [100, 140]);
  const [a, b] = apart(100, 104, 20);
  assert.equal(b - a, 20);
  assert.equal((a + b) / 2, 102);
});

test("every chart shares one bpd scale; problem facilities come first", () => {
  const flows = [series("S1_FACILITY_A", [[900, 800, 40]]), series("S5_FACILITY_C", [[3900, 0, 70]]), series("S2_FACILITY_B", [])];
  const { items, max } = healthItems(flows, null);
  assert.equal(max, sharedMax(flows));
  assert.deepEqual(items.map((i) => i.title), ["S1 Facility A", "S5 Facility C"], "empty series are left out");
});

test("a page is a 3 x 2 grid of equal cells with gaps, inside its area", () => {
  const area = { x: 36, y: 114, w: 1104, h: 660 };
  const cells = healthCells(area, 3, 2, 14);
  assert.equal(cells.length, 6);
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const a = cells[i], b = cells[j];
    const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.ok(!overlap, `cells ${i} and ${j} overlap`);
  }
  const last = cells[5];
  assert.ok(Math.abs(last.x + last.w - (area.x + area.w)) < 1e-6 && Math.abs(last.y + last.h - (area.y + area.h)) < 1e-6);
});

test("the pop-out grows out of the dashboard's edge and opens turned toward the judge", () => {
  const shut = popoutPose(0), open = popoutPose(1), mid = popoutPose(0.5);
  assert.ok(shut.sx < 0.01 && shut.slideM === -POPOUT.gapM, "folded into the dashboard's edge");
  assert.deepEqual(open, { sx: 1, sy: 1, slideM: 0, alpha: 1, bracket: 1 });
  assert.ok(mid.sx > shut.sx && mid.sx < open.sx && mid.alpha > mid.sx, "it fades in ahead of its growth");
  const far = popoutPoint(1, 0.595), near = popoutPoint(0, 0.595);
  assert.ok(near.x > 0.595 && Math.abs(near.z) < 1e-9, "the hinge sits just past the dashboard's right edge");
  assert.ok(far.z > 0.3, "its far edge comes toward the judge, like a second monitor");
});
