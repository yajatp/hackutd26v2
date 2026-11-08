import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { albers, ellipsePath, H, pathOf, project, W, type Geometry } from "./projection.ts";
import { SITES } from "../../lib/sites.ts";

const at = (key: string) => {
  const s = SITES.find((x) => x.key === key)!;
  return project(s.lon, s.lat);
};
const inFrame = ([x, y]: [number, number], pad = 0) => x >= pad && x <= W - pad && y >= pad && y <= H - pad;

test("Midland, Williston and Laredo land in the right order and in the frame", () => {
  const midland = at("permian"), williston = at("williston"), laredo = at("dorado");
  for (const p of [midland, williston, laredo]) assert.ok(inFrame(p, 20), `${p} outside the frame`);
  // North is up: Williston above Midland above Laredo.
  assert.ok(williston[1] < midland[1] && midland[1] < laredo[1], `y: ${williston[1]} ${midland[1]} ${laredo[1]}`);
  // Laredo (99.5 W) is east of Midland (102.1 W); Williston (103.6 W) is west of Midland.
  assert.ok(williston[0] < midland[0] && midland[0] < laredo[0], `x: ${williston[0]} ${midland[0]} ${laredo[0]}`);
});

test("every site is inside the frame, and the corners of the country land where a map reader expects", () => {
  for (const s of SITES) assert.ok(inFrame(project(s.lon, s.lat), 20), s.key);
  const seattle = project(-122.33, 47.61), miami = project(-80.19, 25.76), maine = project(-68.0, 46.0), sandiego = project(-117.16, 32.72);
  assert.ok(seattle[0] < 120 && seattle[1] < 200, `Seattle ${seattle}`);
  assert.ok(miami[0] > 750 && miami[1] > 500, `Miami ${miami}`);
  assert.ok(maine[0] > 900 && maine[1] < 200, `Maine ${maine}`);
  assert.ok(sandiego[0] < 220 && sandiego[1] > 380, `San Diego ${sandiego}`);
});

test("the central meridian is straight and parallels curve toward the pole (a conic, not a plate carree)", () => {
  const [x0] = albers(-98, 30), [x1] = albers(-98, 48);
  assert.ok(Math.abs(x0) < 1e-12 && Math.abs(x1) < 1e-12);
  // On the 45th parallel, points far from 98 W sit higher (further north on screen) than on it.
  const mid = project(-98, 45), east = project(-70, 45), west = project(-124, 45);
  assert.ok(east[1] < mid[1] && west[1] < mid[1]);
  // Equal-area: a 1 x 1 degree cell has about the same area at 30 N and 45 N once scaled by cos(lat).
  const area = (lon: number, lat: number) => {
    const [a, b, c] = [albers(lon, lat), albers(lon + 1, lat), albers(lon, lat + 1)];
    return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / Math.cos((lat + 0.5) * Math.PI / 180);
  };
  assert.ok(Math.abs(area(-98, 30) / area(-98, 45) - 1) < 0.01);
});

test("the saved state outlines are the lower 48 and DC, and every point projects inside the frame", () => {
  const geo = JSON.parse(readFileSync(new URL("../../public/geo/us-states.json", import.meta.url), "utf8")) as {
    features: { id: string; geometry: Geometry }[];
  };
  assert.equal(geo.features.length, 49);
  const ids = new Set(geo.features.map((f) => f.id));
  for (const id of ["TX", "NM", "WY", "ND", "DC", "ME", "FL", "WA"]) assert.ok(ids.has(id), id);
  for (const id of ["AK", "HI", "PR"]) assert.ok(!ids.has(id), id);
  let n = 0;
  for (const f of geo.features) {
    const d = pathOf(f.geometry);
    assert.match(d, /^M[\d.]+ [\d.]+L/);
    for (const m of d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)) {
      n++;
      assert.ok(inFrame([Number(m[1]), Number(m[2])]), `${f.id}: ${m[0]}`);
    }
  }
  assert.ok(n > 5000, `only ${n} points`);
});

test("a basin ellipse is a closed path around its centre", () => {
  const d = ellipsePath(-102.3, 31.6, 2, 1.5, 10, 24);
  assert.equal((d.match(/[ML]/g) ?? []).length, 24);
  assert.ok(d.endsWith("Z"));
  const c = project(-102.3, 31.6);
  const xs = [...d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(Math.min(...xs) < c[0] && Math.max(...xs) > c[0]);
});
