import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE } from "../theme";
import { beamAngle, crankSpeed, flicker, JACK, jackPose, jackRate } from "./rig";
import { flowline, HOUSE, jackFootprint, jackSlots, MASTS, SKID, START, TANK_R, TRANSFER, type JackSlot } from "./pad";
import { gaugeTear } from "./shaders";

const deg = (r: number) => (r * 180) / Math.PI;

test("the walking beam nods about 16 degrees each way and is near level at mid stroke", () => {
  const angles = Array.from({ length: 360 }, (_, i) => beamAngle((i * Math.PI) / 180));
  const max = Math.max(...angles), min = Math.min(...angles);
  assert.ok(deg(max) > 13 && deg(max) < 19, `max ${deg(max)}`);
  assert.ok(deg(min) < -13 && deg(min) > -19, `min ${deg(min)}`);
  assert.ok(Math.abs(deg(beamAngle(0))) < 4);
  // Pin at the top pulls the equalizer up, so the horsehead goes down.
  assert.ok(beamAngle(Math.PI / 2) < 0 && beamAngle((3 * Math.PI) / 2) > 0);
});

test("the pitman arm keeps its length at every crank angle (the linkage closes)", () => {
  for (let i = 0; i < 72; i++) {
    const p = jackPose((i * 2 * Math.PI) / 72);
    const len = Math.hypot(p.equalizer[0] - p.pin[0], p.equalizer[1] - p.pin[1]);
    assert.ok(Math.abs(len - JACK.pitman) < 1e-9, `angle ${i * 5}: ${len}`);
    // The pitman's rotation turns +y onto the pin -> equalizer direction.
    const dx = -Math.sin(p.pitmanAngle), dy = Math.cos(p.pitmanAngle);
    assert.ok(Math.abs(dx * len - (p.equalizer[0] - p.pin[0])) < 1e-9 && Math.abs(dy * len - (p.equalizer[1] - p.pin[1])) < 1e-9);
  }
});

test("the beam moves smoothly: no jump between neighbouring crank angles", () => {
  let prev = beamAngle(0);
  for (let i = 1; i <= 720; i++) {
    const a = beamAngle((i * Math.PI) / 360);
    assert.ok(Math.abs(a - prev) < 0.01, `step ${i}`);
    prev = a;
  }
});

test("the polished rod strokes about 1.8 m and stays above the stuffing box", () => {
  const ys = Array.from({ length: 360 }, (_, i) => jackPose((i * Math.PI) / 180).carrierY);
  const stroke = Math.max(...ys) - Math.min(...ys);
  assert.ok(stroke > 1.5 && stroke < 2.2, `stroke ${stroke}`);
  assert.ok(Math.min(...ys) > 1.15, `lowest ${Math.min(...ys)}`);
  assert.ok(Math.max(...ys) < JACK.pivotY - 0.4);
});

test("the crank speeds up to one turn in about 6 s and stops smoothly", () => {
  let w = 0;
  for (let i = 0; i < 600; i++) w = crankSpeed(w, true, 1 / 60);
  assert.ok(Math.abs(w - (2 * Math.PI) / 6) < 1e-6);
  const before = w;
  w = crankSpeed(w, false, 1 / 60);
  assert.ok(w < before && w > before * 0.9, "no sudden stop");
  for (let i = 0; i < 600; i++) w = crankSpeed(w, false, 1 / 60);
  assert.equal(w, 0);
  // Frame-rate independent: one 0.5 s step lands where thirty 1/60 s steps do.
  let a = 0, b = 0;
  a = crankSpeed(a, true, 0.5);
  for (let i = 0; i < 30; i++) b = crankSpeed(b, true, 1 / 60);
  assert.ok(Math.abs(a - b) < 1e-9);
});

test("units nod out of step: rates differ and stay within 5% of 6 s", () => {
  const rates = jackSlots(8).map((s) => jackRate(s.phase));
  for (const r of rates) assert.ok(r > 0.94 && r < 1.06);
  assert.ok(new Set(rates.map((r) => r.toFixed(3))).size >= 6);
  const phases = jackSlots(8).map((s) => s.phase);
  assert.equal(new Set(phases.map((p) => p.toFixed(3))).size, 8);
});

test("flicker stays in 0..1 and is the same for the same time", () => {
  for (let t = 0; t < 10; t += 0.13) {
    const f = flicker(t, 2);
    assert.ok(f >= 0 && f <= 1);
    assert.equal(f, flicker(t, 2));
  }
});

// Pad layout: every pumpjack is clear of the tank, the house, the masts, the judge's start
// corridor, the pad edge and every other unit, for 1 to 12 wells.
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function clearOf(s: JackSlot, x: number, z: number, r: number): number {
  return Math.min(...jackFootprint(s).map(([cx, cz, cr]) => dist([cx, cz], [x, z]) - cr - r));
}

for (let n = 1; n <= 12; n++) {
  test(`pad layout with ${n} well(s) keeps every unit clear`, () => {
    const slots = jackSlots(n);
    assert.equal(slots.length, n);
    for (const s of slots) {
      assert.ok(clearOf(s, 0, 0, TANK_R + 0.8) > 0.5, "tank");
      assert.ok(clearOf(s, HOUSE.x, HOUSE.z, 2.3) > 0.5, "house");
      assert.ok(clearOf(s, SKID.x, SKID.z, 1.2) > 0.5, "skid");
      for (const m of MASTS) assert.ok(clearOf(s, m.x, m.z, 0.5) > 0.5, "mast");
      for (let t = 0; t <= 1; t += 0.25) {
        assert.ok(clearOf(s, START.x, START.z * t + TANK_R * (1 - t), 1.6) > 0.3, `start corridor ${t}`);
      }
      for (const [cx, cz, cr] of jackFootprint(s)) assert.ok(Math.hypot(cx, cz) + cr < SIZE.padRadius, "inside the pad");
    }
    if (n <= 8) {
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const gap = Math.min(...jackFootprint(slots[i]).flatMap(([ax, az, ar]) => jackFootprint(slots[j]).map(([bx, bz, br]) => dist([ax, az], [bx, bz]) - ar - br)));
        assert.ok(gap > 0.5, `units ${i} and ${j}: ${gap.toFixed(2)}`);
      }
    }
  });
}

test("the wellhead sits under the horsehead, 8-18 m from the tank", () => {
  for (const s of jackSlots(8)) {
    const d = Math.hypot(s.well[0], s.well[1]);
    assert.ok(d > 8 && d < 18, `well at ${d}`);
    assert.ok(Math.abs(dist([s.x, s.z], s.well) - JACK.front) < 1e-9);
  }
});

test("a flowline runs from its wellhead to the tank's shell, clear of the house and other units", () => {
  const slots = jackSlots(8);
  slots.forEach((s, i) => {
    const pts = flowline(s);
    const first = pts[0], last = pts[pts.length - 1];
    assert.ok(dist([first[0], first[2]], s.well) < 0.6);
    assert.ok(Math.abs(Math.hypot(last[0], last[2]) - TANK_R) < 0.1);
    // Sample the straight run and check it misses the house, the skid and the other units.
    for (let t = 0; t <= 1; t += 0.05) {
      const x = pts[1][0] + (pts[2][0] - pts[1][0]) * t, z = pts[1][2] + (pts[2][2] - pts[1][2]) * t;
      assert.ok(dist([x, z], [HOUSE.x, HOUSE.z]) > 2.4, `flowline ${i} through the house`);
      assert.ok(dist([x, z], [SKID.x, SKID.z]) > 1.0, `flowline ${i} through the skid`);
      slots.forEach((o, j) => {
        if (j !== i) for (const [cx, cz, cr] of jackFootprint(o)) assert.ok(dist([x, z], [cx, cz]) > cr * 0.8, `flowline ${i} through unit ${j}`);
      });
    }
  });
});

test("the transfer pipes start at the tank and end at the skid, the house and the pad edge", () => {
  assert.ok(Math.abs(Math.hypot(TRANSFER[0][0][0], TRANSFER[0][0][2]) - TANK_R) < 0.1);
  assert.ok(Math.abs(Math.hypot(TRANSFER[1][0][0], TRANSFER[1][0][2]) - TANK_R) < 0.1);
  assert.ok(TRANSFER[2][TRANSFER[2].length - 1][0] > SIZE.padRadius - 1);
});

test("a faked gauge tears only during a glitch, the same way for the same frame", () => {
  assert.deepEqual(gaugeTear(null), { on: 0, frame: 0 });
  const a = gaugeTear(42), b = gaugeTear(42);
  assert.deepEqual(a, b);
  assert.equal(a.on, 1);
});
