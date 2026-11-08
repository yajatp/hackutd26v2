"use client";
// The lying gauge (docs/TWIN-THEME.md "The attack moment", step 3). Two ways to use it:
// - useGlitch(active): a ref to a GlitchSample on the /vr cadence (glitchFrame in app/vr/field.ts),
//   for the parent to tear its own gauge or label; with `target` it also jolts that object sideways.
// - <GlitchGauge>: a glowing level strip for a tank's side whose bands tear sideways, split into
//   color fringes and flash a false level during each burst. Procedural, one draw call.
// `still` (reduced motion, comfort): no tearing; a faked gauge keeps a static warn hatch instead.
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, ShaderMaterial, type Object3D } from "three";
import { C } from "../theme";
import { GLITCH_OFF, glitchSample, type GlitchSample } from "./motion";

export function useGlitch(active: boolean, { still = false, seed = 0, target, amp = 0.01 }: {
  still?: boolean; seed?: number; target?: RefObject<Object3D | null>; amp?: number;   // amp: jolt in parent units
} = {}): RefObject<GlitchSample> {
  const out = useRef<GlitchSample>(GLITCH_OFF);
  const base = useRef<number | null>(null);
  useFrame((state) => {
    const g = active ? glitchSample(state.clock.elapsedTime * 1000, still, seed) : GLITCH_OFF;
    out.current = g;
    const o = target?.current;
    if (!o) return;
    if (g.on) {
      base.current ??= o.position.x;
      o.position.x = base.current + g.dx * amp;
    } else if (base.current !== null) {
      o.position.x = base.current;
      base.current = null;
    }
  });
  return out;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// The strip fills the middle of the plane (x in [PAD, 1 - PAD]) so torn bands can leave it.
const FRAG = /* glsl */ `
uniform float uLevel;
uniform float uShown;
uniform float uOn;
uniform float uFrame;
uniform float uActive;
uniform float uTime;
uniform float uOpacity;
uniform vec3 uFill;
uniform vec3 uFrameColor;
uniform vec3 uTick;
uniform vec3 uGlass;
uniform vec3 uHatch;
uniform vec3 uHot;
varying vec2 vUv;
const float PAD = 0.2;
float hash(float a, float b) { return fract(sin(a * 12.9898 + b * 78.233) * 43758.5453); }

// One channel of the gauge at uv: x across the strip 0..1, y up 0..1.
vec4 gauge(vec2 uv, float level) {
  if (uv.x < 0.0 || uv.x > 1.0) return vec4(0.0);
  float edge = min(min(uv.x, 1.0 - uv.x) * 6.0, min(uv.y, 1.0 - uv.y) * 60.0);
  vec4 c = vec4(uGlass, 0.62);
  float inner = step(0.16, uv.x) * step(uv.x, 0.84) * step(0.012, uv.y) * step(uv.y, 0.988);
  float filled = inner * step(uv.y, level);
  // Fill: darker at the bottom, hot at the surface, with a slow upward flow.
  float flow = 0.85 + 0.15 * sin((uv.y - uTime * 0.25) * 60.0);
  float depth = mix(0.45, 1.0, smoothstep(level - 0.5, level, uv.y));
  c.rgb = mix(c.rgb, uFill * depth * flow, filled);
  c.a = mix(c.a, 0.96, filled);
  float surface = inner * exp(-pow((uv.y - level) / 0.008, 2.0));
  c.rgb = mix(c.rgb, uHot, surface);
  c.a = max(c.a, surface);
  // Ticks every 10% on the left, longer at 50%.
  float t10 = abs(fract(uv.y * 10.0 + 0.5) - 0.5) / 10.0;
  float tick = (1.0 - step(0.0025, t10)) * step(uv.x, mix(0.12, 0.3, step(abs(uv.y - 0.5), 0.003)));
  c.rgb = mix(c.rgb, uTick, tick);
  // Frame.
  float frame = 1.0 - step(0.06, edge);
  c.rgb = mix(c.rgb, uFrameColor, frame);
  c.a = max(c.a, frame);
  // A faked sensor: a warn hatch over the fill, steady (it is the state, not an animation).
  float hatch = step(0.5, fract((uv.x * 0.25 + uv.y) * 40.0)) * inner * uActive;
  c.rgb = mix(c.rgb, uHatch, hatch * 0.35);
  return c;
}

void main() {
  vec2 uv = vec2((vUv.x - PAD) / (1.0 - 2.0 * PAD), vUv.y);
  float shift = 0.0;
  float split = 0.0;
  if (uOn > 0.5) {
    float band = floor(uv.y * 14.0 + hash(uFrame, 1.0) * 0.9);
    float g = hash(band + 3.0, uFrame);
    shift = g < 0.55 ? (g / 0.55 - 0.5) * 0.9 : 0.0;
    split = 0.07;
  }
  float level = uOn > 0.5 ? uShown : uLevel;
  vec4 r = gauge(uv + vec2(shift + split, 0.0), level);
  vec4 g = gauge(uv + vec2(shift, 0.0), level);
  vec4 b = gauge(uv + vec2(shift - split, 0.0), level);
  vec4 c = vec4(r.r, g.g, b.b, max(max(r.a, g.a), b.a));
  if (uOn > 0.5) {
    float scan = step(0.92, hash(floor(uv.y * 90.0), uFrame));
    c.rgb = mix(c.rgb, uHot, scan * 0.6);
    c.a = max(c.a, scan * 0.5 * step(0.0, uv.x) * step(uv.x, 1.0));
  }
  gl_FragColor = vec4(c.rgb, c.a * uOpacity);
  #include <colorspace_fragment>
}`;

export interface GlitchGaugeProps {
  level: number | null;  // 0..1 (TankState.fill); null draws it half full and quiet
  active: boolean;       // the sensor is faked: tear, flash a false level, hatch
  color?: string;        // the fill; default warn when active, ok otherwise
  width?: number;        // the strip's width, parent units; default 0.35 (life size on a 6 m tank)
  height?: number;       // default 4.6
  opacity?: number;
  seed?: number;         // tears out of step with other gauges
  still?: boolean;
}

export function GlitchGauge({ level, active, color, width = 0.35, height = 4.6, opacity = 1, seed = 0, still = false }: GlitchGaugeProps) {
  const fill = color ?? (active ? C.warn : C.ok);
  const mat = useMemo(() => new ShaderMaterial({
    uniforms: {
      uLevel: { value: 0.5 }, uShown: { value: 0.5 }, uOn: { value: 0 }, uFrame: { value: 0 }, uActive: { value: 0 },
      uTime: { value: 0 }, uOpacity: { value: 1 },
      uFill: { value: new Color(fill) }, uFrameColor: { value: new Color(C.holo) }, uTick: { value: new Color(C.holoDim) },
      uGlass: { value: new Color(C.skyZenith) }, uHatch: { value: new Color(C.warn) }, uHot: { value: new Color(C.text) },
    },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
  }), [fill]);
  useEffect(() => () => mat.dispose(), [mat]);
  const lv = level ?? 0.5;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const g = active ? glitchSample(t * 1000, still, seed) : GLITCH_OFF;
    const u = mat.uniforms;
    u.uLevel.value = lv;
    u.uOn.value = g.on ? 1 : 0;
    u.uFrame.value = g.frame % 997;
    // The lie: during a burst the strip claims another level, some frames far off.
    u.uShown.value = g.on ? Math.min(0.98, Math.max(0.04, lv + (g.ghost - 0.5) * 0.7)) : lv;
    u.uActive.value = active ? 1 : 0;
    u.uTime.value = still ? 0 : t;
    u.uOpacity.value = opacity;
  });

  // The plane is wider than the strip (PAD each side), so torn bands spill past its edges.
  return (
    <mesh material={mat} renderOrder={2}>
      <planeGeometry args={[width / 0.6, height]} />
    </mesh>
  );
}
