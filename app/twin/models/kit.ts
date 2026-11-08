// Building blocks for the procedural models: painted parts merged into one geometry (one draw call
// per unit, colors in a vertex attribute), helpers that place a box or a cylinder between two
// points, and the two canvas textures the pads use. Built once, shared by every model.
import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4,
  Quaternion, SRGBColorSpace, Vector3, type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { C, SIZE } from "../theme";
import { HOUSE, MASTS, SKID, mastAim } from "./pad";

export type V3 = [number, number, number];

const UP = new Vector3(0, 1, 0);

export function at(p: V3, rot: V3 = [0, 0, 0], s: V3 = [1, 1, 1]): Matrix4 {
  return new Matrix4().compose(new Vector3(...p), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(...s));
}

// A transform that turns +y onto the segment a -> b, centered on it (for boxes and cylinders of
// height 1 scaled to the segment's length).
export function between(a: V3, b: V3): Matrix4 {
  const va = new Vector3(...a), vb = new Vector3(...b);
  const d = vb.clone().sub(va);
  const len = d.length();
  const q = new Quaternion().setFromUnitVectors(UP, d.normalize());
  return new Matrix4().compose(va.add(vb).multiplyScalar(0.5), q, new Vector3(1, len, 1));
}

// Painted parts, merged. Every part becomes non-indexed with position, normal, uv and color.
export class Parts {
  private list: BufferGeometry[] = [];

  add(geo: BufferGeometry, c: Color, m?: Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute("uv", new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (m) g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute("color", new Float32BufferAttribute(col, 3));
    g.clearGroups();
    this.list.push(g);
    return this;
  }

  box(w: number, h: number, d: number, c: Color, m: Matrix4): this {
    return this.add(new BoxGeometry(w, h, d), c, m);
  }

  // A box of cross-section w x d from a to b.
  bar(a: V3, b: V3, w: number, d: number, c: Color): this {
    return this.add(new BoxGeometry(w, 1, d), c, between(a, b));
  }

  // A cylinder of radius r from a to b.
  rod(a: V3, b: V3, r: number, c: Color, seg = 8, r2 = r): this {
    return this.add(new CylinderGeometry(r2, r, 1, seg, 1, false), c, between(a, b));
  }

  merge(): BufferGeometry {
    const out = mergeGeometries(this.list, false);
    for (const g of this.list) g.dispose();
    this.list = [];
    if (!out) throw new Error("models: parts did not merge");
    out.computeBoundingSphere();
    return out;
  }
}

// ---- textures ------------------------------------------------------------------------------------

let soft: Texture | null = null;
let padTex: Texture | null = null;

// White in the middle fading to black at the edge: an alpha map for soft shadows and pools.
export function softDisc(): Texture {
  if (soft) return soft;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  // An alpha mask, not a theme color: white is opaque, black is clear.
  grad.addColorStop(0, "white");
  grad.addColorStop(0.35, "rgba(255,255,255,0.78)");
  grad.addColorStop(0.7, "rgba(255,255,255,0.25)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = "black";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  soft = new CanvasTexture(c);
  return soft;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const css = (c: Color, a = 1) => {
  const s = c.clone().convertLinearToSRGB();
  return `rgba(${Math.round(s.r * 255)},${Math.round(s.g * 255)},${Math.round(s.b * 255)},${a})`;
};

// The pad: caliche gravel lit warm under the mast lamps, darker toward the desert, its edge fading
// out; baked soft shadows under the tank and the house; a faint holo survey ring at the edge.
// One shared texture: the pad's furniture stands in the same place on every facility.
export function padTexture(): Texture {
  if (padTex) return padTex;
  const N = 1024, R = SIZE.padRadius;
  const px = (m: number) => (m / R) * (N / 2);
  const X = (x: number) => N / 2 + px(x), Z = (z: number) => N / 2 + px(z);
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  const lit = new Color(C.groundLit), ground = new Color(C.ground), warm = new Color(C.duskGlow), dark = new Color(C.skyZenith);

  const base = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  base.addColorStop(0, css(lit));
  base.addColorStop(0.45, css(lit.clone().lerp(ground, 0.35)));
  base.addColorStop(0.8, css(ground, 0.96));
  base.addColorStop(0.93, css(ground, 0.6));
  base.addColorStop(1, css(ground, 0));
  g.fillStyle = base;
  g.fillRect(0, 0, N, N);

  // Gravel: light and dark specks, denser in the middle.
  const r = rng(7);
  for (let i = 0; i < 26000; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * N * 0.47;
    const x = N / 2 + Math.cos(a) * d, y = N / 2 + Math.sin(a) * d;
    const light = r() < 0.5;
    g.fillStyle = light ? css(lit.clone().lerp(new Color(C.steel), 0.3), 0.18 + r() * 0.2) : css(dark, 0.12 + r() * 0.18);
    const s = 0.6 + r() * 1.6;
    g.fillRect(x, y, s, s);
  }

  // Truck ruts: two soft arcs from the south-east edge round to the pump house's load-out.
  g.lineCap = "round";
  for (const off of [-0.9, 0.9]) {
    g.strokeStyle = css(dark, 0.07);
    g.lineWidth = px(0.6);
    g.beginPath();
    g.arc(X(0), Z(0), px(10.5 + off), Math.PI * 0.05, Math.PI * 0.42);
    g.stroke();
  }

  // Warm pools under the lamps, added on top.
  g.globalCompositeOperation = "lighter";
  const pool = (x: number, z: number, rad: number, a: number) => {
    const p = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), px(rad));
    p.addColorStop(0, css(warm.clone().lerp(lit, 0.5), a));
    p.addColorStop(1, css(warm, 0));
    g.fillStyle = p;
    g.fillRect(0, 0, N, N);
  };
  for (const m of MASTS) {
    const [ax, az] = mastAim(m);
    pool(ax, az, 7.5, 0.22);
  }
  pool(HOUSE.x + 0.6, HOUSE.z + HOUSE.d / 2 + 1.6, 3.2, 0.3);
  g.globalCompositeOperation = "source-over";

  // Baked contact shadows.
  const shade = (x: number, z: number, rx: number, rz: number, a: number) => {
    g.save();
    g.translate(X(x), Z(z));
    g.scale(1, rz / rx);
    const s = g.createRadialGradient(0, 0, 0, 0, 0, px(rx));
    s.addColorStop(0, css(dark, a));
    s.addColorStop(0.55, css(dark, a * 0.6));
    s.addColorStop(1, css(dark, 0));
    g.fillStyle = s;
    g.beginPath();
    g.arc(0, 0, px(rx), 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  shade(0.25, 0.2, SIZE.tankDiameter * 0.85, SIZE.tankDiameter * 0.85, 0.75);
  shade(HOUSE.x + 0.3, HOUSE.z + 0.2, HOUSE.w * 0.85, HOUSE.d * 0.85, 0.6);
  shade(SKID.x, SKID.z, 1.6, 1.0, 0.45);
  for (const m of MASTS) shade(m.x, m.z, 0.8, 0.8, 0.5);

  // The holo survey ring at the pad's edge, with a tick every 10 degrees and the four quarters long.
  g.strokeStyle = css(new Color(C.holoDim), 0.55);
  g.lineWidth = 2;
  g.beginPath();
  g.arc(N / 2, N / 2, px(R * 0.9), 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2, long = i % 9 === 0;
    const r0 = px(R * 0.9), r1 = px(R * (long ? 0.86 : 0.88));
    g.lineWidth = long ? 3 : 1.5;
    g.beginPath();
    g.moveTo(N / 2 + Math.cos(a) * r0, N / 2 + Math.sin(a) * r0);
    g.lineTo(N / 2 + Math.cos(a) * r1, N / 2 + Math.sin(a) * r1);
    g.stroke();
  }

  padTex = new CanvasTexture(c);
  padTex.colorSpace = SRGBColorSpace;
  padTex.anisotropy = 4;
  return padTex;
}
