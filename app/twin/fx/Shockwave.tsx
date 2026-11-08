"use client";
// The holo shockwave: when `trigger` changes to a
// new number above 0, a ring races out across the ground (or table) from `origin`, trailing fine
// scan lines, a low wall of light and a warn echo, with a light column at the origin, fading out
// over ~1.2 s. Three draw calls while it runs, none at rest. `still`: no wave at all.
// Units are the parent's: `radius` is how far the ring reaches (ground: ~14 m; table: ~0.35 m).
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, CylinderGeometry, DoubleSide, ShaderMaterial, type Group } from "three";
import { C } from "../theme";
import { WAVE_CLOCK, waveAt, WAVE_S } from "./motion";
import type { Vec3 } from "./ease";

const VERT = /* glsl */ `
varying vec2 vUv;
varying float vY;
void main() {
  vUv = uv;
  vY = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const RING_FRAG = /* glsl */ `
uniform float uFront;
uniform float uFade;
uniform vec3 uColor;
uniform vec3 uAccent;
varying vec2 vUv;
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float r = length(q);
  if (r > 1.0) discard;
  float f = uFront;
  float w = 0.010 + 0.028 * f;
  float edge = exp(-pow((r - f) / w, 2.0));
  float ang = atan(q.y, q.x);
  float ticks = step(0.3, fract(ang * 48.0 / 6.2831853));
  edge *= 0.6 + 0.4 * ticks;
  float behind = step(r, f) * smoothstep(f - 0.34, f, r);
  float lines = pow(0.5 + 0.5 * cos((f - r) * 110.0), 10.0);
  float wash = behind * (0.10 + 0.55 * lines);
  float e = f * 0.68;
  float echo = exp(-pow((r - e) / (w * 0.55), 2.0)) * step(0.04, f);
  float rim = 1.0 - smoothstep(0.9, 1.0, r);
  vec3 col = uColor * (1.7 * edge + wash) + uAccent * 1.2 * echo;
  float a = clamp(edge + wash + echo, 0.0, 1.0) * uFade * rim;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

const COLUMN_FRAG = /* glsl */ `
uniform float uI;
uniform vec3 uColor;
varying float vY;
void main() {
  float a = pow(1.0 - vY, 1.5) * uI;
  gl_FragColor = vec4(uColor * 1.4, a);
  #include <colorspace_fragment>
}`;

// A low wall of light standing on the ring as it travels, so the wave has height in VR.
const CURTAIN_FRAG = /* glsl */ `
uniform float uI;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float ticks = step(0.45, fract(vUv.x * 96.0));
  float a = pow(1.0 - vUv.y, 2.2) * uI * (0.55 + 0.45 * ticks);
  gl_FragColor = vec4(uColor * 1.3, a);
  #include <colorspace_fragment>
}`;

export interface ShockwaveProps {
  origin: Vec3;
  trigger: number;       // bump it to send a wave; 0 sends none
  color?: string;        // the ring; default holo (the data layer's color)
  accent?: string;       // the inner echo; default warn
  radius?: number;       // reach, in the parent's units; default 1
  duration?: number;     // seconds; default 1.2
  column?: boolean;      // the light column at the origin; default true
  wall?: number;         // the wall of light standing on the ring, as a share of `radius`; default 0.07
  still?: boolean;
}

export function Shockwave({ origin, trigger, color = C.holo, accent = C.warn, radius = 1, duration = WAVE_S, column = true, wall: wallK = 0.07, still = false }: ShockwaveProps) {
  const root = useRef<Group>(null);
  const col = useRef<Group>(null);
  const played = useRef(0);
  const startedAt = useRef<number | null>(null);
  const pending = useRef(false);

  const ring = useMemo(() => new ShaderMaterial({
    uniforms: { uFront: { value: 0 }, uFade: { value: 0 }, uColor: { value: new Color(color) }, uAccent: { value: new Color(accent) } },
    vertexShader: VERT, fragmentShader: RING_FRAG,
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }), [color, accent]);
  const beam = useMemo(() => new ShaderMaterial({
    uniforms: { uI: { value: 0 }, uColor: { value: new Color(color) } },
    vertexShader: VERT, fragmentShader: COLUMN_FRAG,
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  }), [color]);
  const wall = useMemo(() => new ShaderMaterial({
    uniforms: { uI: { value: 0 }, uColor: { value: new Color(color) } },
    vertexShader: VERT, fragmentShader: CURTAIN_FRAG,
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  }), [color]);
  useEffect(() => () => { wall.dispose(); }, [wall]);
  const curtain = useRef<Group>(null);
  // Base at y = 0, uv.y 0 at the base: the column and the wall fade upward.
  const tube = useMemo(() => new CylinderGeometry(1, 1, 1, 64, 1, true).translate(0, 0.5, 0), []);
  useEffect(() => () => { ring.dispose(); }, [ring]);
  useEffect(() => () => { beam.dispose(); }, [beam]);
  useEffect(() => () => { tube.dispose(); }, [tube]);

  useEffect(() => {
    if (trigger > 0 && trigger !== played.current) {
      played.current = trigger;
      pending.current = !still;
    }
  }, [trigger, still]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (pending.current) {
      pending.current = false;
      startedAt.current = t;
      WAVE_CLOCK.at = performance.now();
    }
    const g = root.current;
    if (!g) return;
    if (startedAt.current === null || still) { g.visible = false; return; }
    const w = waveAt(t - startedAt.current, duration);
    if (w.done) { startedAt.current = null; g.visible = false; return; }
    g.visible = true;
    ring.uniforms.uFront.value = w.front;
    ring.uniforms.uFade.value = w.fade;
    beam.uniforms.uI.value = w.column;
    wall.uniforms.uI.value = 0.7 * w.fade * Math.min(1, w.front * 4);
    if (curtain.current) {
      const rr = Math.max(1e-4, w.front * radius * 0.985);
      curtain.current.scale.set(rr, radius * wallK * (1 - 0.5 * w.front), rr);
    }
    if (col.current) {
      col.current.visible = false && column && w.column > 0.002;   // Sui style: no light column
      const h = radius * 0.55 * (0.4 + 0.6 * Math.min(1, w.front * 3));
      const r = radius * (0.025 + 0.05 * w.front);
      col.current.scale.set(r, h, r);
    }
  });

  return (
    <group ref={root} position={[origin[0], origin[1], origin[2]]} visible={false}>
      <mesh rotation-x={-Math.PI / 2} position={[0, radius * 0.002, 0]} material={ring} renderOrder={3}>
        <planeGeometry args={[2 * radius, 2 * radius]} />
      </mesh>
      {/* Sui style: no light column or curtain, only the quiet ring on the ground. */}
      <group ref={col} visible={false}>
        <mesh geometry={tube} material={beam} renderOrder={3} />
      </group>
      <group ref={curtain} visible={false}>
        <mesh geometry={tube} material={wall} renderOrder={3} />
      </group>
    </group>
  );
}
