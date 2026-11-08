"use client";
// What makes the Walk pad read as a real Permian lease beyond the equipment (docs/TWIN-THEME.md
// "Realism pass"), cheap enough for the Quest 3S:
// - the tank battery: the monitored tank, a stock tank and a smaller produced-water tank in a row
//   to its west (one instanced draw of the tank's own geometry);
// - the battery's secondary containment dike: a low 0.6 m steel wall round all three with a
//   dark liner floor (2 draw calls; low enough that the state band stays in view from the start);
// - mesquite and creosote scrub scattered off the pad, one instanced draw (about 5k triangles);
// - a lease sign by the start, with the facility's name, an H2S warning and the emergency line.
import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, CanvasTexture, Color, IcosahedronGeometry, Matrix4, PlaneGeometry, SRGBColorSpace, type InstancedMesh } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { groundHeight } from "../world/terrain";
import { hash1 } from "./rig";
import { noRay } from "./common";
import { tankGeometry } from "./geometry";
import { painted } from "./shaders";

// The battery west of the monitored tank (x, z, radius scale, height scale, paint tint). The
// spacing keeps clear of the western units' flowlines to the monitored tank.
export const BATTERY = [
  { x: -4.2, z: 0, r: 1, h: 1, tint: "#ffffff" },          // stock tank, desert tan like the first
  { x: -7.75, z: 0, r: 0.74, h: 0.8, tint: "#8f9a86" },    // produced water: fiberglass, grey-green
] as const;

// The dike: x from xMin to xMax, z within +-half.
export const DIKE = { xMin: -9.65, xMax: 3.3, half: 3.3, h: 0.6, t: 0.22 } as const;

let dikeGeo: ReturnType<typeof mergeGeometries> | null = null;
function dikeGeometry() {
  if (dikeGeo) return dikeGeo;
  const { xMin, xMax, half, h, t } = DIKE;
  const L = xMax - xMin, cx = (xMin + xMax) / 2;
  const walls = [
    new BoxGeometry(L + t, h, t).translate(cx, h / 2, -half),
    new BoxGeometry(L + t, h, t).translate(cx, h / 2, half),
    new BoxGeometry(t, h, 2 * half - t).translate(xMin, h / 2, 0),
    new BoxGeometry(t, h, 2 * half - t).translate(xMax, h / 2, 0),
  ];
  dikeGeo = mergeGeometries(walls, false);
  return dikeGeo;
}

// The other tanks of the battery: one instanced draw of the monitored tank's geometry.
export function Battery() {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4(), c = new Color();
    BATTERY.forEach((b, i) => {
      mesh.setMatrixAt(i, m.makeScale(b.r, b.h, b.r).setPosition(b.x, 0, b.z));
      mesh.setColorAt(i, c.set(b.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);
  return <instancedMesh ref={ref} args={[tankGeometry(), painted(), BATTERY.length]} name="battery" />;
}

export function Dike() {
  const L = DIKE.xMax - DIKE.xMin, cx = (DIKE.xMin + DIKE.xMax) / 2;
  return (
    <group name="dike">
      <mesh geometry={dikeGeometry()}>
        <meshLambertMaterial color="#8a8172" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0.035, 0]} raycast={noRay} renderOrder={-1}>
        <planeGeometry args={[L - DIKE.t, 2 * DIKE.half - DIKE.t]} />
        <meshLambertMaterial color="#2b2622" polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
    </group>
  );
}

// Scrub: n bushes between rMin and rMax m from the pad's middle, clear of the lease road (a strip
// running south from the pad past the start).
export function Scrub({ n = 240, rMin = 24, rMax = 150, seed = 3 }: { n?: number; rMin?: number; rMax?: number; seed?: number }) {
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new IcosahedronGeometry(1, 0).scale(1, 0.55, 1).translate(0, 0.35, 0), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4(), s = new Matrix4(), c = new Color(), dark = new Color("#3b3a26"), sage = new Color("#6b6a48");
    let k = 0;
    for (let i = 0; k < n && i < n * 3; i++) {
      const a = hash1(i * 3.1 + seed) * Math.PI * 2;
      const r = rMin + (rMax - rMin) * Math.pow(hash1(i * 7.7 + seed), 0.7);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (Math.abs(x) < 4 && z > 0) continue;                      // the lease road
      const size = 0.35 + 0.9 * hash1(i * 1.9 + seed);
      m.makeRotationY(hash1(i * 5.3) * 6.28).premultiply(s.makeScale(size * (0.8 + 0.5 * hash1(i)), size, size)).setPosition(x, groundHeight(x, z) - 0.05, z);
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, c.copy(dark).lerp(sage, hash1(i * 2.3)));
      k++;
    }
    mesh.count = k;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [n, rMin, rMax, seed]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, n]} raycast={noRay} name="scrub">
      <meshLambertMaterial flatShading />
    </instancedMesh>
  );
}

function signTexture(name: string): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 256;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#e9e4d6"; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = "#2a2a2a"; g.lineWidth = 8; g.strokeRect(6, 6, 500, 244);
  g.fillStyle = "#1d1d1d"; g.textAlign = "center";
  g.font = "700 40px sans-serif"; g.fillText(name.toUpperCase(), 256, 62);
  g.font = "600 24px sans-serif"; g.fillText("PERMIAN BASIN · LEASE", 256, 100);
  g.fillStyle = "#c8102e"; g.fillRect(24, 124, 464, 62);
  g.fillStyle = "#ffffff"; g.font = "800 36px sans-serif"; g.fillText("DANGER  H2S  GAS", 256, 168);
  g.fillStyle = "#1d1d1d"; g.font = "600 22px sans-serif"; g.fillText("NO SMOKING · EMERGENCY 911", 256, 226);
  // A little weathering: speckle and a rust streak.
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(90,70,40,${0.05 + 0.1 * hash1(i)})`; g.fillRect(hash1(i * 3.3) * 512, hash1(i * 7.1) * 256, 2, 2); }
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function LeaseSign({ name, at = [3.4, 0, 11.5], yaw = -0.35 }: { name: string; at?: [number, number, number]; yaw?: number }) {
  const tex = useMemo(() => signTexture(name), [name]);
  const posts = useMemo(() => mergeGeometries([
    new BoxGeometry(0.08, 1.9, 0.08).translate(-0.62, 0.95, 0),
    new BoxGeometry(0.08, 1.9, 0.08).translate(0.62, 0.95, 0),
  ], false), []);
  const board = useMemo(() => new PlaneGeometry(1.5, 0.75), []);
  if (!tex) return null;
  return (
    <group position={at} rotation-y={yaw} name="lease-sign">
      <mesh geometry={posts}><meshLambertMaterial color="#6d6458" /></mesh>
      <mesh geometry={board} position={[0, 1.45, 0.05]} raycast={noRay}>
        <meshLambertMaterial map={tex} />
      </mesh>
    </group>
  );
}
