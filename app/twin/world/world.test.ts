// Run: npx tsx --test app/twin/world/world.test.ts
// The desert and the night without a browser: dune heights, the ground mesh, the horizon
// silhouettes, the far lights, the lamp posts, the star field, the milky band and the meteors.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  farLights, fbm2, FLAT_R, GROUND_R, groundHeight, mesas, nearestPosts, noise2, padPosts, PAD_POSTS, radialGrid, ridgeHeight,
  rng, smoothstep,
} from "./terrain";
import { DUSK_AZ_DEG, dirFrom, LOOK, meteorAt, METEOR_WINDOW_S, MILKY_POLE, milkyGlow, MOON_DIR, starField, STAR_COUNT } from "./sky";

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

test("smoothstep clamps and eases", () => {
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 2), 1);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
});

test("seeded random numbers repeat for the same seed and stay in 0..1", () => {
  const a = rng(42), b = rng(42);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test("noise stays in 0..1 and is smooth", () => {
  for (let i = 0; i < 500; i++) {
    const x = i * 0.37 - 40, z = i * 0.91 - 70;
    const n = noise2(x, z), f = fbm2(x, z);
    assert.ok(n >= 0 && n <= 1 && f >= 0 && f <= 1);
    assert.ok(Math.abs(noise2(x + 0.001, z) - n) < 0.01);
  }
});

test("the ground is flat where the judge, the table and the pad stand", () => {
  for (let a = 0; a < 360; a += 15) {
    for (const r of [0, 5, 20, 30, FLAT_R - 0.5]) {
      const x = Math.cos((a * Math.PI) / 180) * r, z = Math.sin((a * Math.PI) / 180) * r;
      assert.equal(groundHeight(x, z), 0, `flat at r=${r}`);
    }
  }
});

test("dunes rise beyond the flat, gently and without spikes", () => {
  let maxH = -Infinity, minH = Infinity, maxStep = 0;
  for (let a = 0; a < 360; a += 3) {
    let prev = 0;
    for (let r = FLAT_R; r <= GROUND_R; r += 2) {
      const x = Math.cos((a * Math.PI) / 180) * r, z = Math.sin((a * Math.PI) / 180) * r;
      const h = groundHeight(x, z);
      maxH = Math.max(maxH, h); minH = Math.min(minH, h);
      maxStep = Math.max(maxStep, Math.abs(h - prev));
      prev = h;
    }
  }
  assert.ok(maxH > 3, `some relief (max ${maxH.toFixed(1)} m)`);
  assert.ok(maxH < 30 && minH > -15, `gentle (${minH.toFixed(1)}..${maxH.toFixed(1)} m)`);
  assert.ok(maxStep < 1.2, `no cliffs: at most ${maxStep.toFixed(2)} m per 2 m`);
});

test("the radial ground mesh reaches the edge, indexes only its own vertices, and faces up", () => {
  const g = radialGrid(10, 16, 100);
  assert.equal(g.positions.length / 3, 1 + 10 * 16);
  assert.ok(near(g.radii[g.radii.length - 1], 100));
  assert.ok(g.radii.every((r, i) => i === 0 || r > g.radii[i - 1]), "rings grow outward");
  const n = g.positions.length / 3;
  for (let t = 0; t < g.index.length; t += 3) {
    const [i, j, k] = [g.index[t], g.index[t + 1], g.index[t + 2]];
    assert.ok(i < n && j < n && k < n);
    const p = (q: number) => [g.positions[q * 3], g.positions[q * 3 + 2]];
    const [ax, az] = p(i), [bx, bz] = p(j), [cx, cz] = p(k);
    // y of (b - a) x (c - a): positive means the face points up.
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    assert.ok(ny > 0, `triangle ${t / 3} faces up`);
  }
});

test("mesas repeat, stay on the horizon, and stay lower toward the dusk", () => {
  assert.deepEqual(mesas(0), mesas(0));
  const duskAz = (DUSK_AZ_DEG * Math.PI) / 180;
  for (const layer of [0, 1] as const) {
    const list = mesas(layer);
    let dusk = 0, rest = 0, nd = 0, nr = 0;
    for (let i = 0; i < 720; i++) {
      const th = (i / 720) * Math.PI * 2;
      const h = ridgeHeight(th, layer, list, duskAz);
      assert.ok(h > 0 && h < 120, `layer ${layer} height ${h}`);
      const gap = Math.abs(((th - duskAz + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      if (gap < 0.12) { dusk += h; nd++; } else if (gap > 1) { rest += h; nr++; }
    }
    assert.ok(dusk / nd < rest / nr, `layer ${layer}: lower toward the dusk`);
  }
});

test("far lights sit between the flat and the mesas, with at least one flare", () => {
  const lights = farLights();
  assert.ok(lights.length >= 20 && lights.length < 90, `${lights.length} lights`);
  for (const l of lights) {
    const r = Math.hypot(l.x, l.z);
    assert.ok(r > 230 && r < 680, `radius ${r}`);
    assert.ok(l.y > groundHeight(l.x, l.z), "above the ground");
  }
  assert.ok(lights.some((l) => l.kind === 2), "a flare");
  assert.ok(lights.some((l) => l.kind === 1), "a blinking mast");
});

test("lamp posts ring each pad at the pad's scale, and the nearest carry the real lights", () => {
  const posts = padPosts([[0, 0], [100, -50]], 0.5);
  assert.equal(posts.length, 2 * PAD_POSTS.length);
  assert.deepEqual(posts[0], [PAD_POSTS[0][0] * 0.5, PAD_POSTS[0][1] * 0.5]);
  assert.deepEqual(posts[PAD_POSTS.length], [100 + PAD_POSTS[0][0] * 0.5, -50 + PAD_POSTS[0][1] * 0.5]);
  assert.deepEqual(nearestPosts(posts, [100, -50], 2).sort(), [2, 3]);
  assert.deepEqual(nearestPosts(posts, [0, 0], 10).length, 4);
  assert.deepEqual(nearestPosts(posts, [0, 0], 0), []);
});

test("directions: north is -z, east is +x, the moon is up in the north-east", () => {
  const n = dirFrom(0, 0), e = dirFrom(90, 0), up = dirFrom(0, 90);
  assert.ok(near(n[2], -1) && near(e[0], 1) && near(up[1], 1));
  assert.ok(MOON_DIR[0] > 0 && MOON_DIR[1] > 0.4 && MOON_DIR[2] < 0);
});

test("the star field: unit directions above the horizon, mostly faint, a few twinkling", () => {
  const f = starField();
  assert.equal(f.size.length, STAR_COUNT);
  let faint = 0, twinkle = 0, onBand = 0;
  for (let i = 0; i < STAR_COUNT; i++) {
    const d = [f.dirs[i * 3], f.dirs[i * 3 + 1], f.dirs[i * 3 + 2]];
    assert.ok(near(Math.hypot(d[0], d[1], d[2]), 1, 1e-5));
    assert.ok(d[1] > -0.041);
    if (f.bright[i] < 0.45) faint++;
    if (f.twinkle[i] > 0) twinkle++;
    if (Math.abs(d[0] * MILKY_POLE[0] + d[1] * MILKY_POLE[1] + d[2] * MILKY_POLE[2]) < 0.15) onBand++;
  }
  assert.ok(faint > STAR_COUNT * 0.6, `mostly faint (${faint})`);
  assert.ok(twinkle > 20 && twinkle < STAR_COUNT * 0.08, `a few twinkle (${twinkle})`);
  // A 0.3-wide band around a great circle is about 15% of the sphere; it holds far more stars.
  assert.ok(onBand > STAR_COUNT * 0.3, `crowded along the band (${onBand})`);
});

test("the milky band glows on its circle, not at its pole or under the horizon", () => {
  let best = 0;
  for (let a = 0; a < 360; a += 2) {
    for (let e = 20; e < 90; e += 4) {
      const d = dirFrom(a, e);
      const off = Math.abs(d[0] * MILKY_POLE[0] + d[1] * MILKY_POLE[1] + d[2] * MILKY_POLE[2]);
      if (off < 0.03) best = Math.max(best, milkyGlow(d));
    }
  }
  assert.ok(best > 0.2, `visible on the band (${best.toFixed(2)})`);
  assert.equal(milkyGlow(MILKY_POLE), 0);
  assert.equal(milkyGlow(dirFrom(30, -10)), 0);
});

test("meteors: rare, short, high, and the same at the same moment", () => {
  let frames = 0;
  const windows = new Set<number>();
  for (let t = 0; t < METEOR_WINDOW_S * 40; t += 0.05) {
    const m = meteorAt(t);
    if (!m) continue;
    frames++;
    windows.add(Math.floor(t / METEOR_WINDOW_S));
    assert.ok(m.a[1] > 0.15 && m.b[1] > 0.15, "above the haze");
    assert.ok(m.i >= 0 && m.i <= 1);
    assert.deepEqual(meteorAt(t), m);
  }
  assert.ok(windows.size >= 20 && windows.size <= 40, `${windows.size} of 40 windows`);
  assert.ok(frames * 0.05 < windows.size * 1.0, "each lasts under a second");
});

test("the table view is the same desert, a little dimmer", () => {
  assert.ok(LOOK.table.dim < LOOK.ground.dim);
  assert.ok(LOOK.table.moon <= LOOK.ground.moon);
  for (const m of ["table", "overview", "ground"] as const) assert.ok(LOOK[m].fogNear < LOOK[m].fogFar && LOOK[m].fogFar < GROUND_R);
});
