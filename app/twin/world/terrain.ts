// The desert under the judge, as plain numbers (unit-tested in world.test.ts): the height of the
// dunes, the radial mesh they are drawn on, the mesa silhouettes on the horizon, the far rig
// lights and the lamp posts at each pad. The World's frame: x east, y up, -z north (model.ts lays
// the site out the same way), meters, the judge's start at the origin.

export type XZ = readonly [number, number];

export const GROUND_R = 1000;          // the desert disc is 2 km across
export const FLAT_R = 45;              // flat within this radius: the table, the pad and the walk
export const DUNE_R = 170;             // dunes reach full height by here

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Seeded random numbers (mulberry32): same seed, same desert, every load.
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash3(x: number, y: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1440662683)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

// Value noise in 0..1, smooth between integer lattice points.
export function noise2(x: number, z: number, seed = 0): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(z - zi);
  const a = hash3(xi, zi, seed), b = hash3(xi + 1, zi, seed);
  const c = hash3(xi, zi + 1, seed), d = hash3(xi + 1, zi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const lerp = (p: number, q: number, t: number) => p + (q - p) * t;
  const h = (i: number, j: number, k: number) => hash3(xi + i, yi + j, zi + k);
  return lerp(
    lerp(lerp(h(0, 0, 0), h(1, 0, 0), u), lerp(h(0, 1, 0), h(1, 1, 0), u), v),
    lerp(lerp(h(0, 0, 1), h(1, 0, 1), u), lerp(h(0, 1, 1), h(1, 1, 1), u), v),
    w,
  );
}

// A few octaves of value noise, still in 0..1.
export function fbm2(x: number, z: number, octaves = 4, seed = 0): number {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * f, z * f, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export function fbm3(x: number, y: number, z: number, octaves = 4): number {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * f + i * 3.1, y * f, z * f - i * 1.7);
    norm += amp;
    amp *= 0.5;
    f *= 2.07;
  }
  return sum / norm;
}

// Dune crests run roughly north-west to south-east, across a south-west wind, meandering where
// the noise warps them. Small dunes near the flat (sampled finely enough to show), long swells
// of the land farther out, so the horizon rolls.
export function duneCrest(x: number, z: number): number {
  const along = x * 0.78 + z * 0.62;
  const warp = (fbm2(x / 190, z / 190, 3, 5) - 0.5) * 90;
  const s = Math.sin((along + warp) / 19);
  return Math.pow(0.5 + 0.5 * s, 1.7);
}

export function groundHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const m = smoothstep(FLAT_R, DUNE_R, r);
  if (m === 0) return 0;
  const patch = 0.3 + 0.7 * fbm2(x / 430 + 7, z / 430 - 3, 3, 11);
  const dunes = duneCrest(x, z) * 4.5 * patch * (1 - 0.6 * smoothstep(420, 760, r));
  const swell = (fbm2(x / 640 - 11, z / 640 + 5, 3, 23) - 0.42) * 26 * smoothstep(DUNE_R, 560, r);
  return m * (dunes + swell);
}

// A disc of `rings` rings by `segs` segments out to `rMax`, with a center vertex. Ring radii grow
// as a power of the ring number, so the mesh is fine under the judge's feet and coarse at the
// horizon, where fog hides it. Vertices lie at y = 0; the caller displaces them.
export function radialGrid(rings: number, segs: number, rMax = GROUND_R, power = 2.2) {
  const n = 1 + rings * segs;
  const positions = new Float32Array(n * 3);
  const radii: number[] = [];
  for (let i = 1; i <= rings; i++) {
    const r = rMax * Math.pow(i / rings, power);
    radii.push(r);
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const k = (1 + (i - 1) * segs + j) * 3;
      positions[k] = Math.cos(a) * r;
      positions[k + 2] = Math.sin(a) * r;
    }
  }
  const tris = segs + (rings - 1) * segs * 2;
  const index = new Uint32Array(tris * 3);
  let t = 0;
  const v = (ring: number, j: number) => 1 + (ring - 1) * segs + ((j + segs) % segs);
  // Wound so the faces point up (+y) for a counter-clockwise front face seen from above.
  for (let j = 0; j < segs; j++) { index[t++] = 0; index[t++] = v(1, j + 1); index[t++] = v(1, j); }
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = v(i, j), b = v(i, j + 1), c = v(i + 1, j), d = v(i + 1, j + 1);
      index[t++] = a; index[t++] = b; index[t++] = c;
      index[t++] = b; index[t++] = d; index[t++] = c;
    }
  }
  return { positions, index, radii };
}

// The horizon: two rings of low-poly silhouettes, buttes and flat-topped mesas over a low ridge.
// Azimuth in radians clockwise from north. Toward the west, where the dusk glows, they stay low
// so the warm band shows above them.
export interface Mesa { at: number; half: number; h: number }
export const RIDGE_LAYERS = [
  { r: 930, base: 16, mesas: 9, hMin: 42, hMax: 105, seed: 101 }, // far, taller, hazier
  { r: 680, base: 6, mesas: 7, hMin: 15, hMax: 42, seed: 202 },    // near, lower, darker
] as const;

export function mesas(layer: 0 | 1): Mesa[] {
  const L = RIDGE_LAYERS[layer];
  const rand = rng(L.seed);
  const out: Mesa[] = [];
  for (let i = 0; i < L.mesas; i++) {
    const at = ((i + rand() * 0.8) / L.mesas) * Math.PI * 2;
    out.push({ at, half: 0.03 + rand() * 0.12, h: L.hMin + rand() * (L.hMax - L.hMin) });
  }
  return out;
}

function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

export function ridgeHeight(theta: number, layer: 0 | 1, list: Mesa[], duskAz: number): number {
  const L = RIDGE_LAYERS[layer];
  const ridge = L.base * (0.35 + 1.3 * fbm2(theta * 2.2 + layer * 9, 0.5, 4, 31 + layer));
  let h = ridge;
  for (const m of list) {
    const g = angleGap(theta, m.at);
    const cap = 1 - smoothstep(m.half * 0.86, m.half, g);                 // the flat top, steep sides
    const skirt = 0.42 * (1 - smoothstep(m.half, m.half * 2.1, g));        // talus below the cliff
    const top = m.h * (0.93 + 0.07 * noise2(theta * 60, layer, 7));         // a slightly broken rim
    h = Math.max(h, top * Math.max(cap, skirt * (1 - g / (m.half * 2.2))));
  }
  const toDusk = angleGap(theta, duskAz);
  return h * (0.45 + 0.55 * smoothstep(0.1, 0.75, toDusk));
}

// Far rigs and well sites: small warm lights scattered between the dunes and the mesas, a few
// blinking on tall masts, one or two flare stacks flickering. Decoration, dimmer than anything
// that carries data. kind 0 steady, 1 blinking mast, 2 flare.
export interface FarLight { x: number; y: number; z: number; size: number; kind: 0 | 1 | 2; phase: number }

export function farLights(sites = 28, seed = 404): FarLight[] {
  const rand = rng(seed);
  const out: FarLight[] = [];
  for (let s = 0; s < sites; s++) {
    const az = rand() * Math.PI * 2;
    const r = 260 + rand() * 380;
    const cx = Math.sin(az) * r, cz = -Math.cos(az) * r;
    const flare = s % 9 === 4;
    const n = flare ? 1 : 1 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      const x = cx + (rand() - 0.5) * 18, z = cz + (rand() - 0.5) * 18;
      const mast = !flare && i === 0 && rand() < 0.4;
      const kind: 0 | 1 | 2 = flare ? 2 : mast ? 1 : 0;
      const lift = kind === 2 ? 16 : kind === 1 ? 30 + rand() * 14 : 2.5 + rand() * 6;
      out.push({ x, y: groundHeight(x, z) + lift, z, size: kind === 2 ? 13 : kind === 1 ? 4.5 : 3 + rand() * 2.4, kind, phase: rand() * 6.283 });
    }
  }
  return out;
}

// Lamp posts at each pad, in real meters from the pad's center: one behind the tank on the left,
// one in front on the right, so the judge standing 8 m south sees the tank lit from two sides.
export const PAD_POSTS: readonly XZ[] = [[-12, -9], [12, 7]];
export const POST_HEIGHT = 7.5;

export function padPosts(pads: readonly XZ[], scale: number, offsets: readonly XZ[] = PAD_POSTS): [number, number][] {
  const out: [number, number][] = [];
  for (const [px, pz] of pads) for (const [ox, oz] of offsets) out.push([px + ox * scale, pz + oz * scale]);
  return out;
}

// The posts that carry the real point lights: the k nearest the viewer, nearest first.
export function nearestPosts(posts: readonly XZ[], from: XZ, k: number): number[] {
  return posts
    .map((p, i) => ({ i, d: (p[0] - from[0]) ** 2 + (p[1] - from[1]) ** 2 }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, Math.max(0, k))
    .map((x) => x.i);
}
