"use client";
// The table view's ops table (docs/TWIN-THEME.md "The three views"): a round slab of night glass
// at waist height with the site standing on it as a glowing miniature. The top is one shader: a
// fine holo grid and polar rings, each system's ring and a faint tint inside it (drawn from
// uniforms, so the five systems cost no draw calls), a soft pool of holo light that follows the
// pointer (and rests on the console's top problem), a slow radar sweep, and a bright rim. A thin
// glowing halo hangs just outside the rim, the column glows where it meets the floor, and "N" marks
// the site's north on the far rim. The top turns with the site (the thumbstick), so it sits in the
// site root's frame (plan.ts), its surface at y = 0.
// About 6 draw calls; system ids lie flat on the table in VR only (the page's DOM labels do it on
// a screen).
import { useMemo } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { AdditiveBlending, Color, DoubleSide, ShaderMaterial, Vector2, Vector3, type Group } from "three";
import type { Cluster, PlacedTank } from "./model";
import { C } from "./theme";
import { TABLE_TOP_Y, TURNTABLE_R } from "./stage";
import { approach, LIGHT_MS, lightRest, lightTarget, type Pt } from "./look";
import { usePainted, type Painter } from "./nav/glass";
import { text } from "./nav/paint";
import { noRay } from "./models";
import { gridDim, WAVE_CLOCK } from "./fx/motion";

const MAX_SYS = 8;
const SLAB = 0.035;                       // the top's thickness
const COLUMN_R = 0.07;

// Where the light pool is: the pointer's spot on the table (it hears the pointer), eased by the frame loop.
export interface PoolState { pointer: Pt | null; at: Pt; started: boolean }
export const newPool = (): PoolState => ({ pointer: null, at: { x: 0, z: 0 }, started: false });

const VERT = /* glsl */ `
varying vec2 vP;
void main() {
  // The disc lies in the mesh's xy plane, turned flat: table x east, z south.
  vP = vec2(position.x, -position.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
#define PI 3.14159265
uniform vec3 uDeep; uniform vec3 uGlass; uniform vec3 uGrid; uniform vec3 uHolo;
uniform vec2 uLight; uniform float uTime; uniform float uSweep; uniform float uRadius; uniform float uGridK;
uniform vec3 uSys[${MAX_SYS}]; uniform int uSysN;
varying vec2 vP;

float lineAA(float v, float w) { return 1.0 - smoothstep(0.0, w, v); }

void main() {
  vec2 p = vP;
  float r = length(p);
  // Night glass, a shade lighter toward the middle.
  vec3 col = mix(uGlass, uDeep, smoothstep(0.0, uRadius, r));
  // A fine 5 cm grid and polar rings every 10 cm, antialiased, fading out where they would shimmer.
  vec2 gq = p / 0.05;
  vec2 gd = abs(fract(gq - 0.5) - 0.5) / max(fwidth(gq), vec2(1e-4));
  float fine = (1.0 - min(min(gd.x, gd.y), 1.0)) * (1.0 - smoothstep(0.35, 0.8, max(fwidth(gq).x, fwidth(gq).y)));
  col += uGrid * fine * 0.09 * uGridK;
  float rq = r / 0.1;
  float rd = abs(fract(rq - 0.5) - 0.5) / max(fwidth(rq), 1e-4);
  col += uGrid * (1.0 - min(rd, 1.0)) * 0.22 * uGridK;
  // Spokes every 30 degrees.
  float a = atan(p.y, p.x);
  float sq = a / (PI / 6.0);
  float sd = abs(fract(sq - 0.5) - 0.5) * (PI / 6.0) * r / max(fwidth(r), 1e-4) ;
  col += uGrid * (1.0 - min(sd * 0.6, 1.0)) * 0.13 * smoothstep(0.08, 0.2, r) * uGridK;
  // Each system: a faint tint inside its ring and the ring itself in holo.
  for (int i = 0; i < ${MAX_SYS}; i++) {
    if (i >= uSysN) break;
    vec3 s = uSys[i];
    float d = length(p - s.xy);
    col += uHolo * 0.05 * (1.0 - smoothstep(s.z * 0.2, s.z, d));
    float w = fwidth(d) * 1.2;
    col += uHolo * 0.55 * lineAA(abs(d - s.z) - 0.0008, w);
  }
  // The pool of light under the pointer (or on the top problem).
  vec2 l = p - uLight;
  col += uHolo * 0.2 * exp(-dot(l, l) / (2.0 * 0.11 * 0.11));
  // The radar sweep: a bright edge and a fading wedge behind it.
  float ang = mod(uTime * 0.45 - a, 2.0 * PI);
  float sweep = exp(-ang * 3.2) * uSweep * smoothstep(uRadius, uRadius * 0.15, r * 0.9);
  col += uHolo * sweep * 0.16;
  // The rim.
  float aa = fwidth(r);
  col = mix(col, uHolo, smoothstep(uRadius - 0.006 - aa, uRadius - 0.006, r) * 0.95);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// A soft glow band: alpha falls off from the inner radius outward (or inward, flip).
const HALO_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uInner; uniform float uOuter; uniform float uI;
varying vec2 vP;
void main() {
  float r = length(vP);
  float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
  float a = pow(1.0 - t, 2.2) * uI;
  gl_FragColor = vec4(uColor * a, a);
  #include <colorspace_fragment>
}`;

function haloMaterial(color: string, inner: number, outer: number, intensity: number) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uInner: { value: inner }, uOuter: { value: outer }, uI: { value: intensity } },
    vertexShader: VERT, fragmentShader: HALO_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending,
    side: DoubleSide, toneMapped: false, fog: false,
  });
}

const northPainter: Painter<{ t: string }, null> = {
  size: () => ({ w: 96, h: 96 }),
  paint(ctx, s, W, H) {
    text(ctx, s.t, W / 2, H / 2 + 2, { size: 72, weight: 700, color: C.holo, align: "center", glow: 14 });
    return null;
  },
};

const sysPainter: Painter<{ t: string }, null> = {
  size: () => ({ w: 200, h: 72 }),
  paint(ctx, s, W, H) {
    text(ctx, s.t, W / 2, H / 2 + 2, { size: 52, weight: 700, color: C.holo, align: "center", spacing: 4, glow: 10 });
    return null;
  },
};

function FlatText({ painter, t, at, w }: { painter: Painter<{ t: string }, null>; t: string; at: [number, number, number]; w: number }) {
  const tex = usePainted(painter, { t });
  if (!tex) return null;
  return (
    <mesh position={at} rotation-x={-Math.PI / 2} raycast={noRay} renderOrder={3}>
      <planeGeometry args={[w, (w * tex.h) / tex.w]} />
      <meshBasicMaterial map={tex.texture} transparent depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
  );
}

export function HoloTable({ root, pool, tanks, clusters, top, hovered, still, inXR, onEmptyClick }: {
  root: React.RefObject<Group | null>;     // the site root (turning group), for the pointer's spot
  pool: PoolState;
  tanks: PlacedTank[];                     // layout positions = table positions in the table view
  clusters: Cluster[];
  top: string | null;
  hovered: string | null;
  still: boolean;
  inXR: boolean;
  onEmptyClick(): void;
}) {
  const top3 = useMemo(() => new ShaderMaterial({
    uniforms: {
      uDeep: { value: new Color(C.skyZenith) },
      uGlass: { value: new Color(C.skyMid) },
      uGrid: { value: new Color(C.holoDim) },
      uHolo: { value: new Color(C.holo) },
      uLight: { value: new Vector2() },
      uTime: { value: 0 },
      uSweep: { value: 1 }, uGridK: { value: 1 },
      uRadius: { value: TURNTABLE_R },
      uSys: { value: Array.from({ length: MAX_SYS }, () => new Vector3()) },
      uSysN: { value: 0 },
    },
    vertexShader: VERT, fragmentShader: FRAG, fog: false,
  }), []);
  const rimHalo = useMemo(() => haloMaterial(C.holo, TURNTABLE_R, TURNTABLE_R + 0.07, 0.55), []);
  const floorHalo = useMemo(() => haloMaterial(C.holo, COLUMN_R, 0.62, 0.35), []);
  const p = useMemo(() => new Vector3(), []);

  useFrame(({ clock }, dt) => {
    const u = top3.uniforms;
    u.uTime.value = clock.elapsedTime;
    u.uSweep.value = still ? 0 : 1;
    // The attack moment's wave crosses the table: the grid dims to 40% for a moment under it.
    u.uGridK.value = gridDim(performance.now() - WAVE_CLOCK.at, still);
    const n = Math.min(MAX_SYS, clusters.length);
    u.uSysN.value = n;
    for (let i = 0; i < n; i++) (u.uSys.value as Vector3[])[i].set(clusters[i].x, clusters[i].z, clusters[i].r);
    // The pool eases toward the hovered tank, else the pointer's spot, else the top problem.
    const rest = lightRest(tanks, top);
    if (!pool.started && tanks.length > 0) { pool.at = rest; pool.started = true; }
    const h = hovered ? tanks.find((t) => t.facility_id === hovered) : undefined;
    const to = lightTarget(h ? { x: h.x, z: h.z } : pool.pointer, rest, TURNTABLE_R - 0.02);
    const ms = Math.min(dt, 0.1) * 1000;
    pool.at = { x: approach(pool.at.x, to.x, ms, still ? 0 : LIGHT_MS), z: approach(pool.at.z, to.z, ms, still ? 0 : LIGHT_MS) };
    (u.uLight.value as Vector2).set(pool.at.x, pool.at.z);
  });

  const move = (e: ThreeEvent<PointerEvent>) => {
    const g = root.current;
    if (!g) return;
    g.worldToLocal(p.copy(e.point));
    pool.pointer = { x: p.x, z: p.z };
  };
  return (
    <group name="holo-table">
      <mesh
        rotation-x={-Math.PI / 2} material={top3}
        onPointerMove={move} onPointerOut={() => { pool.pointer = null; }}
        onClick={(e) => { if (!inXR && e.delta <= 4) onEmptyClick(); }}
      >
        <circleGeometry args={[TURNTABLE_R, 128]} />
      </mesh>
      {/* The slab's edge: night glass going down into the dark. */}
      <mesh position={[0, -SLAB / 2, 0]} raycast={noRay}>
        <cylinderGeometry args={[TURNTABLE_R, TURNTABLE_R * 0.97, SLAB, 128, 1, true]} />
        <meshBasicMaterial color={C.holoDim} fog={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.002, 0]} material={rimHalo} raycast={noRay} renderOrder={1}>
        <ringGeometry args={[TURNTABLE_R, TURNTABLE_R + 0.07, 128, 1]} />
      </mesh>
      {/* The column and its glow on the floor (the floor is the world's ground at y = 0). */}
      <mesh position={[0, -(TABLE_TOP_Y + SLAB) / 2, 0]} raycast={noRay}>
        <cylinderGeometry args={[COLUMN_R * 0.8, COLUMN_R, TABLE_TOP_Y - SLAB, 24, 1, true]} />
        <meshLambertMaterial color={C.skyMid} emissive={C.holoDim} emissiveIntensity={0.35} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -TABLE_TOP_Y + 0.004, 0]} material={floorHalo} raycast={noRay} renderOrder={1}>
        <ringGeometry args={[COLUMN_R, 0.62, 64, 1]} />
      </mesh>
      <FlatText painter={northPainter} t="N" at={[0, 0.0012, -TURNTABLE_R + 0.04]} w={0.045} />
      {inXR && clusters.map((c) => (
        <FlatText key={c.system_id} painter={sysPainter} t={c.system_id} at={[c.x, 0.0012, c.z + c.r + 0.02]} w={0.06} />
      ))}
    </group>
  );
}
