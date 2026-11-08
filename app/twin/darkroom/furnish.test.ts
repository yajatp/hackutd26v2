// Run: npx tsx --test app/twin/darkroom/furnish.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUTTONS_ZONE, CABINET_ZONE, CHAIR_R, CHAIRS, DESK, inRect, ledShade, MONITOR_ZONE, RACK_ZONE, rackLeds, ROOM, scatterPapers, SIGN_ZONE,
  TRAY, trayHangers, WALKWAY,
} from "./furnish";

test("cable tray: hangers on the tray and clear of the wall sign", () => {
  const xs = trayHangers();
  assert.ok(xs.length >= 2, "at least two hangers");
  for (const x of xs) {
    assert.ok(x > TRAY.x0 && x < TRAY.x1, `hanger off the tray ${x}`);
    assert.ok(x < SIGN_ZONE.x0 || x > SIGN_ZONE.x1, `hanger in front of the sign ${x}`);
  }
});

test("papers: the same scatter on every load, 30 to 60 sheets", () => {
  const a = scatterPapers(), b = scatterPapers();
  assert.deepEqual(a, b);
  assert.ok(a.length >= 30 && a.length <= 60, `count ${a.length}`);
  assert.ok(a.filter((p) => p.onDesk).length >= 10, "some on the desk");
  assert.ok(a.filter((p) => !p.onDesk).length >= 15, "some on the floor");
});

test("papers: inside the room, off the walkway, off the buttons and the monitor", () => {
  for (const p of scatterPapers()) {
    assert.ok(p.x > ROOM.x0 + 0.1 && p.x < ROOM.x1 - 0.1 && p.z > ROOM.z0 + 0.1 && p.z < ROOM.z1 - 0.1, `outside ${p.x},${p.z}`);
    if (p.onDesk) {
      assert.ok(inRect(DESK, p.x, p.z), `desk sheet off the desk ${p.x},${p.z}`);
      assert.ok(Math.abs(p.y - DESK.top) < 0.02, "desk sheet at desk height");
      assert.ok(!inRect(BUTTONS_ZONE, p.x, p.z, 0.05), `sheet on the buttons ${p.x},${p.z}`);
      assert.ok(!inRect(MONITOR_ZONE, p.x, p.z), `sheet under the monitor ${p.x},${p.z}`);
    } else {
      assert.ok(!inRect(WALKWAY, p.x, p.z, 0.05), `floor sheet on the walkway ${p.x},${p.z}`);
      assert.ok(!inRect(DESK, p.x, p.z) && !inRect(RACK_ZONE, p.x, p.z) && !inRect(CABINET_ZONE, p.x, p.z), `sheet inside furniture ${p.x},${p.z}`);
      assert.ok(p.y > 0.003 && p.y < 0.03, "floor sheet just above the floor");
      assert.ok(Math.abs(p.tiltX) < 0.1 && Math.abs(p.tiltZ) < 0.1, "small tilts only");
    }
  }
});

test("chairs: inside the room, off the walkway and the desk", () => {
  for (const c of CHAIRS) {
    assert.ok(c.x - CHAIR_R > ROOM.x0 && c.x + CHAIR_R < ROOM.x1 && c.z - CHAIR_R > ROOM.z0 && c.z + CHAIR_R < ROOM.z1);
    assert.ok(!inRect(WALKWAY, c.x, c.z, CHAIR_R), `chair on the walkway ${c.x},${c.z}`);
    assert.ok(!inRect(DESK, c.x, c.z, CHAIR_R * 0.5), `chair inside the desk ${c.x},${c.z}`);
    assert.ok(!inRect(RACK_ZONE, c.x, c.z, CHAIR_R), "chair inside the racks");
    assert.ok(Math.abs(c.yaw) > 0.1, "turned, not placed by a grid");
  }
});

test("LEDs: mostly steady, at least two amber blinkers that blink", () => {
  const leds = rackLeds();
  assert.deepEqual(leds, rackLeds());
  const steady = leds.filter((l) => l.kind === "blue" || l.kind === "green").length;
  assert.ok(steady / leds.length >= 0.75, `steady share ${steady / leds.length}`);
  const amber = leds.filter((l) => l.kind === "amber");
  assert.ok(amber.length >= 2 && amber.length <= 8, `amber ${amber.length}`);
  const seen = new Set(Array.from({ length: 40 }, (_, i) => ledShade(amber[0], i * 0.1)));
  assert.deepEqual([...seen].sort(), [2, 3], "amber goes on and off");
  for (const l of leds.filter((x) => x.kind === "blue")) assert.equal(ledShade(l, 3.3), 0);
});
