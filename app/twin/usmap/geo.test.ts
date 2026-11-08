// Run: npx tsx --test app/twin/usmap/geo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SITES } from "@/lib/sites";
import { fitsTable, labelSpots, MAP_D, MAP_W, outlineGeometry, toTable } from "./geo";
import { TURNTABLE_R } from "../stage";

test("the map fits on the round tabletop", () => {
  assert.ok(fitsTable());
  assert.ok(MAP_D > 0.6 && MAP_D < MAP_W);
});

test("north is away from the judge, east is to the right, every site is on the map", () => {
  const [, zN] = toTable(-103.6, 48.1);   // Williston
  const [, zS] = toTable(-99.5, 27.5);    // Laredo
  assert.ok(zN < zS, "north has the smaller z (farther from the judge)");
  const [xW] = toTable(-120, 40), [xE] = toTable(-75, 40);
  assert.ok(xW < xE);
  for (const s of SITES) {
    const [x, z] = toTable(s.lon, s.lat);
    assert.ok(Math.abs(x) < MAP_W / 2 && Math.abs(z) < MAP_D / 2, s.key);
  }
});

test("the state outlines become one line geometry and one land geometry", () => {
  const geo = JSON.parse(readFileSync("public/geo/us-states.json", "utf8")) as { features: { geometry: Parameters<typeof outlineGeometry>[0][number] }[] };
  const { lines, tris } = outlineGeometry(geo.features.map((f) => f.geometry));
  assert.ok(lines.length > 6 * 500, `lines ${lines.length}`);
  assert.equal(lines.length % 6, 0);
  assert.ok(tris.length > 9 * 500, `tris ${tris.length}`);
  assert.equal(tris.length % 9, 0);
  assert.ok(lines.length / 3 < 60000, "few enough vertices for the Quest");
  for (let i = 0; i < tris.length; i += 3) assert.equal(tris[i + 1], 0);
});

test("labels sit in two rows off the map's edges and never overlap", () => {
  const pts = SITES.map((s) => { const [x, z] = toTable(s.lon, s.lat); return { key: s.key as string, x, z }; });
  const w = 0.2;
  const spots = labelSpots(pts, w);
  assert.equal(spots.length, SITES.length);
  for (const a of spots) {
    assert.ok(Math.abs(a.x) + w / 2 <= MAP_W / 2 + 1e-9, a.key);
    assert.ok(Math.hypot(Math.abs(a.x) + w / 2, a.z) < TURNTABLE_R, `${a.key} on the table`);
    for (const b of spots) if (a !== b && a.row === b.row) assert.ok(Math.abs(a.x - b.x) >= w, `${a.key} ${b.key}`);
  }
  const by = new Map(spots.map((s) => [s.key, s]));
  assert.equal(by.get("permian")?.row, "near");
  assert.equal(by.get("williston")?.row, "far");
  // West-to-east order kept: Carlsbad (west) left of Midland.
  assert.ok(by.get("delaware")!.x < by.get("permian")!.x);
  // A wider far row still keeps its labels apart.
  const wide = labelSpots(pts, w, 0.015, 0.27).filter((s) => s.row === "far");
  assert.ok(Math.abs(wide[0].x - wide[1].x) >= 0.27);
});
