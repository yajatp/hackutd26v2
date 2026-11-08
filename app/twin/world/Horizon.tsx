"use client";
// The horizon, two draw calls. Ridges: two rings of low-poly mesas and buttes, 680 m and 930 m
// out, as one unlit mesh in the sky clock's haze and rock colors (they ignore the scene fog so their
// silhouette stays crisp against the sky).
// FarLights: far rigs and well sites between the dunes and the mesas, steady lamps, a few masts
// blinking slowly, a flare or two flickering. Decoration only: dimmer than anything with data.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, ShaderMaterial,
} from "three";
import { DUSK_AZ_DEG } from "./sky";
import { farLights, groundHeight, mesas, noise2, ridgeHeight, RIDGE_LAYERS } from "./terrain";

const COLS = 720;                                       // half a degree per column

// Vertex colors carry weights, not colors (the sky clock sets the colors live): r = rock (0 at the
// hazy base, 1 at the body), g = 1 on the far ring (paler with distance).
function buildRidges(): BufferGeometry {
  const duskAz = (DUSK_AZ_DEG * Math.PI) / 180;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (const layer of [0, 1] as const) {
    const L = RIDGE_LAYERS[layer];
    const list = mesas(layer);
    const first = pos.length / 3;
    const far = layer === 0 ? 1 : 0;
    for (let j = 0; j < COLS; j++) {
      const th = (j / COLS) * Math.PI * 2;
      const r = L.r + (noise2(th * 9, layer * 5, 13) - 0.5) * 70;
      const x = Math.sin(th) * r, z = -Math.cos(th) * r;
      const g = groundHeight(x, z);
      const h = ridgeHeight(th, layer, list, duskAz);
      const shade = 0.88 + 0.24 * noise2(th * 31, layer * 3, 5);
      // Three rows: the base in the haze, the body, the top.
      pos.push(x, g - 10, z, x, g + h * 0.5, z, x, g + h, z);
      col.push(0, far, 0);
      col.push(0.8 * shade, far, 0);
      col.push(1 * shade, far, 0);
    }
    for (let j = 0; j < COLS; j++) {
      const a = first + j * 3, b = first + ((j + 1) % COLS) * 3;
      for (let k = 0; k < 2; k++) idx.push(a + k, b + k, a + k + 1, b + k, b + k + 1, a + k + 1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

const RIDGE_VERT = /* glsl */ `
attribute vec3 color;
varying vec3 vW;
void main() {
  vW = color;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RIDGE_FRAG = /* glsl */ `
uniform vec3 uHaze;
uniform vec3 uRock;
uniform float uDim;
varying vec3 vW;
void main() {
  vec3 rock = mix(uRock, uHaze, 0.35 + 0.25 * vW.g);     // distance haze: the far ring is paler
  vec3 col = mix(uHaze, rock, clamp(vW.r, 0.0, 1.2));
  gl_FragColor = vec4(col * uDim, 1.0);
  #include <colorspace_fragment>
}`;

// The mesas' sunlit rock (a muted desert tan), tinted by the sky (sky.ts skyLook ridge).
const ROCK = "#a08c76";

export function Ridges({ dim, haze, tint }: { dim: number; haze: string; tint: string }) {
  const geometry = useMemo(buildRidges, []);
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: RIDGE_VERT,
    fragmentShader: RIDGE_FRAG,
    side: DoubleSide,
    fog: false,
    uniforms: { uHaze: { value: new Color() }, uRock: { value: new Color() }, uDim: { value: 1 } },
  }), []);
  useEffect(() => {
    material.uniforms.uDim.value = dim;
    (material.uniforms.uHaze.value as Color).set(haze);
    (material.uniforms.uRock.value as Color).set(ROCK).multiply(new Color(tint));
  }, [material, dim, haze, tint]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <mesh name="world-ridges" geometry={geometry} material={material} />;
}

const LIGHT_VERT = /* glsl */ `
uniform float uTime;
uniform float uPx;
uniform float uDim;
uniform float uStill;
attribute float aSize;
attribute float aKind;
attribute float aPhase;
varying float vB;
varying float vKind;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  float b = 0.7;
  if (uStill < 0.5) {
    if (aKind > 1.5) b = 0.82 + 0.18 * sin(uTime * 11.0 + aPhase) * sin(uTime * 4.3 + aPhase * 1.7);
    else if (aKind > 0.5) { float f = fract(uTime * 0.5 + aPhase); b = 0.15 + 0.85 * smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.22, 0.3, f)); }
  }
  vB = b * uDim;
  vKind = aKind;
  gl_PointSize = aSize * uPx;
}`;

const LIGHT_FRAG = /* glsl */ `
uniform vec3 uLamp;
uniform vec3 uMast;
uniform vec3 uFlare;
varying float vB;
varying float vKind;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float r = length(p) * 2.0;
  float core = exp(-r * r * 9.0) + 0.25 * exp(-r * 3.0) * (1.0 - r);
  vec3 col = vKind > 1.5 ? uFlare : (vKind > 0.5 ? uMast : uLamp);
  gl_FragColor = vec4(col * vB * max(core, 0.0), 1.0);
  #include <colorspace_fragment>
}`;

export function FarLights({ dim, still }: { dim: number; still: boolean }) {
  const geometry = useMemo(() => {
    const list = farLights();
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(list.flatMap((l) => [l.x, l.y, l.z])), 3));
    g.setAttribute("aSize", new BufferAttribute(new Float32Array(list.map((l) => l.size)), 1));
    g.setAttribute("aKind", new BufferAttribute(new Float32Array(list.map((l) => l.kind)), 1));
    g.setAttribute("aPhase", new BufferAttribute(new Float32Array(list.map((l) => l.phase)), 1));
    g.computeBoundingSphere();
    return g;
  }, []);
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: LIGHT_VERT,
    fragmentShader: LIGHT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uPx: { value: 1 },
      uDim: { value: 1 },
      uStill: { value: 0 },
      uLamp: { value: new Color("#ffc98f") },
      uMast: { value: new Color("#ff4a3a") },
      uFlare: { value: new Color("#ff9a4a") },
    },
  }), []);
  const t = useRef(0);
  useEffect(() => { material.uniforms.uDim.value = dim; material.uniforms.uStill.value = still ? 1 : 0; }, [material, dim, still]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(({ gl }, delta) => {
    if (!still) t.current += delta;
    material.uniforms.uTime.value = t.current;
    material.uniforms.uPx.value = gl.xr.isPresenting ? 1.4 : gl.getPixelRatio();
  });
  return <points name="world-far-lights" geometry={geometry} material={material} />;
}
