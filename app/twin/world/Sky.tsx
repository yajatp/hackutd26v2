"use client";
// The night sky: one dome and one cloud of stars, two draw calls. Both are drawn first, with no
// depth test, at the far plane and centered on the eye (direction only), so the desert, the mesas
// and the site draw over them, the horizon never moves when the judge walks, and the camera's far
// plane does not matter to them. Their directions are in the World group's frame, so a snap turn
// of the world turns the sky with it.
// The dome carries the gradient (zenith, mid sky at 30 degrees, horizon), the warm dusk band in
// the west-north-west, the faint milky band (baked per vertex), a big gibbous moon lit from below
// the western horizon, and a rare meteor.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, ShaderMaterial, SphereGeometry, Vector3,
} from "three";
import { C } from "../theme";
import {
  DUSK_DIR, meteorAt, milkyGlow, MOON_DIR, normalize, starField, SUN_DIR, type V3,
} from "./sky";

const HASH = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`;

const DOME_VERT = /* glsl */ `
attribute float aMilky;
varying vec3 vDir;
varying float vMilky;
void main() {
  vDir = position;
  vMilky = aMilky;
  // Rotation only: the dome stays centered on the eye. At the far plane, never clipped by it.
  gl_Position = projectionMatrix * vec4(mat3(modelViewMatrix) * position, 1.0);
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const DOME_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uDusk;
uniform vec3 uStar;
uniform vec3 uMilkyA;
uniform vec3 uMilkyB;
uniform vec3 uDuskDir;
uniform vec3 uMoonDir;
uniform vec3 uMoonE1;
uniform vec3 uMoonE2;
uniform vec3 uSunL;
uniform float uDim;
uniform vec3 uMetA;
uniform vec3 uMetB;
uniform float uMetI;
varying vec3 vDir;
varying float vMilky;
${HASH}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float el = asin(clamp(h, -1.0, 1.0)) * 0.63662;          // 0 at the horizon, 1 straight up
  float lo = pow(smoothstep(0.0, 0.34, el), 0.75);
  float hi = smoothstep(0.30, 1.0, el);
  vec3 col = mix(mix(uHorizon, uMid, lo), uZenith, hi);

  // Dusk: a thin hot band on the horizon under where the sun went down, a broad warm wash above it.
  vec2 hz = d.xz / max(length(d.xz), 1e-4);
  float az = max(dot(hz, normalize(uDuskDir.xz)), 0.0);
  float hp = max(h, 0.0);
  float band = pow(az, 7.0) * exp(-hp * 17.0);
  float wash = pow(az, 2.2) * exp(-hp * 4.5);
  col = mix(col, uDusk * 0.55 + uHorizon * 0.45, clamp(wash * 0.55, 0.0, 1.0));
  col = mix(col, uDusk, clamp(band * 0.95, 0.0, 1.0));
  // Opposite the dusk, a faint rose belt over the earth's shadow.
  float anti = pow(max(-dot(hz, normalize(uDuskDir.xz)), 0.0), 2.0);
  col += uDusk * anti * 0.05 * smoothstep(0.02, 0.10, hp) * (1.0 - smoothstep(0.12, 0.3, hp));

  // The milky band, warmer where it is densest.
  col += mix(uMilkyA, uMilkyB, smoothstep(0.35, 0.9, vMilky)) * vMilky * 0.16;

  // The moon: a cool halo, then a gibbous disc lit from the sun below the western horizon.
  float ang = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
  col += uStar * (0.24 * exp(-ang * 15.0) + 0.05 * exp(-ang * 3.2));
  const float MR = 0.034;
  if (ang < MR * 1.25) {
    vec2 uv = vec2(dot(d, uMoonE1), dot(d, uMoonE2)) / MR;
    float r = length(uv);
    float disc = 1.0 - smoothstep(0.93, 1.0, r);
    vec3 n = vec3(uv, sqrt(max(0.0, 1.0 - r * r)));
    float lit = smoothstep(-0.06, 0.14, dot(n, uSunL));
    float m = sin(uv.x * 4.1 + 1.7) * sin(uv.y * 3.3 + 0.4) + 0.5 * sin((uv.x + uv.y) * 6.7 + 2.0);
    float maria = 0.80 + 0.20 * smoothstep(-0.2, 0.7, m);
    vec3 moon = uStar * (0.06 + 1.02 * lit * maria * (0.72 + 0.28 * n.z));
    col = mix(col, moon, disc);
  }

  // A meteor: a short bright streak, brightest at its head.
  if (uMetI > 0.0) {
    vec3 ba = uMetB - uMetA;
    vec3 pa = d - uMetA;
    float t = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    float dist = length(pa - ba * t);
    col += uStar * exp(-dist * dist / 3.0e-6) * t * t * uMetI * 1.3;
  }

  gl_FragColor = vec4(col * uDim, 1.0);
  #include <colorspace_fragment>
  // A little noise, so the dark gradient does not band on the headset's panel.
  gl_FragColor.rgb += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
}`;

const STAR_VERT = /* glsl */ `
uniform float uTime;
uniform float uDim;
uniform float uPx;
attribute float aSize;
attribute float aBright;
attribute float aTwinkle;
attribute float aPhase;
attribute float aTint;
varying float vB;
varying float vTint;
void main() {
  gl_Position = projectionMatrix * vec4(mat3(modelViewMatrix) * position, 1.0);
  gl_Position.z = gl_Position.w * 0.99999;
  float ext = smoothstep(-0.03, 0.26, position.y);          // stars dim into the haze
  float tw = aTwinkle > 0.0 ? 0.62 + 0.38 * sin(uTime * aTwinkle + aPhase) * sin(uTime * aTwinkle * 0.37 + aPhase * 2.0) : 1.0;
  vB = aBright * ext * tw * uDim;
  vTint = aTint;
  gl_PointSize = aSize * uPx * (0.7 + 0.3 * ext);
}`;

const STAR_FRAG = /* glsl */ `
uniform vec3 uStar;
uniform vec3 uWarm;
uniform vec3 uCool;
varying float vB;
varying float vTint;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float a = exp(-dot(p, p) * 14.0);
  vec3 col = vTint < 0.16 ? uWarm : (vTint > 0.86 ? uCool : uStar);
  gl_FragColor = vec4(col * vB * a, 1.0);
  #include <colorspace_fragment>
}`;

const v3 = (v: readonly number[]) => new Vector3(v[0], v[1], v[2]);
const mixHex = (a: string, b: string, t: number) => new Color(a).lerp(new Color(b), t);

export function SkyDome({ dim, still }: { dim: number; still: boolean }) {
  const geometry = useMemo(() => {
    const g = new SphereGeometry(1, 96, 48);
    const p = g.getAttribute("position");
    const milky = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) milky[i] = milkyGlow([p.getX(i), p.getY(i), p.getZ(i)]);
    g.setAttribute("aMilky", new BufferAttribute(milky, 1));
    return g;
  }, []);
  const material = useMemo(() => {
    const e1 = normalize([-MOON_DIR[2], 0, MOON_DIR[0]]);          // the moon's right on the sky
    const e2 = normalize([                                          // and its up: right x moon
      e1[1] * MOON_DIR[2] - e1[2] * MOON_DIR[1],
      e1[2] * MOON_DIR[0] - e1[0] * MOON_DIR[2],
      e1[0] * MOON_DIR[1] - e1[1] * MOON_DIR[0],
    ]);
    const sunL = normalize([
      SUN_DIR[0] * e1[0] + SUN_DIR[1] * e1[1] + SUN_DIR[2] * e1[2],
      SUN_DIR[0] * e2[0] + SUN_DIR[1] * e2[1] + SUN_DIR[2] * e2[2],
      -(SUN_DIR[0] * MOON_DIR[0] + SUN_DIR[1] * MOON_DIR[1] + SUN_DIR[2] * MOON_DIR[2]),
    ]);
    return new ShaderMaterial({
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new Color(C.skyZenith) },
        uMid: { value: new Color(C.skyMid) },
        uHorizon: { value: new Color(C.skyHorizon) },
        uDusk: { value: new Color(C.duskGlow) },
        uStar: { value: new Color(C.stars) },
        uMilkyA: { value: mixHex(C.stars, C.skyHorizon, 0.35) },
        uMilkyB: { value: mixHex(C.stars, C.duskGlow, 0.3) },
        uDuskDir: { value: v3(DUSK_DIR) },
        uMoonDir: { value: v3(MOON_DIR) },
        uMoonE1: { value: v3(e1) },
        uMoonE2: { value: v3(e2) },
        uSunL: { value: v3(sunL) },
        uDim: { value: 1 },
        uMetA: { value: new Vector3() },
        uMetB: { value: new Vector3() },
        uMetI: { value: 0 },
      },
    });
  }, []);
  useEffect(() => { material.uniforms.uDim.value = dim; }, [material, dim]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(({ clock }) => {
    const u = material.uniforms;
    const m = still ? null : meteorAt(clock.elapsedTime);
    u.uMetI.value = m ? m.i : 0;
    if (m) { (u.uMetA.value as Vector3).set(...(m.a as V3)); (u.uMetB.value as Vector3).set(...(m.b as V3)); }
  });
  return <mesh name="world-sky" geometry={geometry} material={material} renderOrder={-1000} frustumCulled={false} />;
}

export function Stars({ dim, still }: { dim: number; still: boolean }) {
  const geometry = useMemo(() => {
    const f = starField();
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(f.dirs, 3));
    g.setAttribute("aSize", new BufferAttribute(f.size, 1));
    g.setAttribute("aBright", new BufferAttribute(f.bright, 1));
    g.setAttribute("aTwinkle", new BufferAttribute(f.twinkle, 1));
    g.setAttribute("aPhase", new BufferAttribute(f.phase, 1));
    g.setAttribute("aTint", new BufferAttribute(f.tint, 1));
    return g;
  }, []);
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uDim: { value: 1 },
      uPx: { value: 1 },
      uStar: { value: new Color(C.stars) },
      uWarm: { value: mixHex(C.stars, C.duskGlow, 0.4) },
      uCool: { value: mixHex(C.stars, C.holo, 0.25) },
    },
  }), []);
  const t = useRef(0);
  useEffect(() => { material.uniforms.uDim.value = dim; }, [material, dim]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useFrame(({ gl }, delta) => {
    if (!still) t.current += delta;
    material.uniforms.uTime.value = t.current;
    material.uniforms.uPx.value = gl.xr.isPresenting ? 1.4 : gl.getPixelRatio();
  });
  // Opaque pass, right after the dome (additive blending still applies), so the desert draws over.
  return <points name="world-stars" geometry={geometry} material={material} renderOrder={-999} frustumCulled={false} />;
}
