"use client";
// The night sky: one dome and one cloud of stars, two draw calls. Both are drawn first, with no
// depth test, at the far plane and centered on the eye (direction only), so the desert, the mesas
// and the site draw over them, the horizon never moves when the judge walks, and the camera's far
// plane does not matter to them. Their directions are in the World group's frame, so a snap turn
// of the world turns the sky with it.
// The sky clock (Sun 06:05): the dome's colors, the sun and the moon follow the site's real local
// time (clock.ts, sky.ts skyLook): a clear blue day with the sun's disc at noon, a pitch-black sky
// with stars and a moon at midnight, warm dawn and dusk bands in between. The faint milky band
// (baked per vertex) and a rare meteor show only at night.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, BackSide, BufferAttribute, BufferGeometry, Color, ShaderMaterial, SphereGeometry, Vector3,
} from "three";
import {
  DUSK_DIR, meteorAt, milkyGlow, MOON_DIR, normalize, starField, SUN_DIR, type SkyLook, type V3,
} from "./sky";

const STAR = "#e6ecf7";

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
uniform float uGlowAmt;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uSunDisc;
uniform float uMoonDisc;
uniform float uNight;
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

  // Dawn and dusk: a thin warm band on the horizon under the sun, a broad wash above it.
  vec2 hz = d.xz / max(length(d.xz), 1e-4);
  vec2 sunHz = uDuskDir.xz / max(length(uDuskDir.xz), 1e-4);
  float az = max(dot(hz, sunHz), 0.0);
  float hp = max(h, 0.0);
  float band = pow(az, 5.0) * exp(-hp * 14.0);
  float wash = pow(az, 2.0) * exp(-hp * 4.0);
  col = mix(col, uDusk * 0.55 + uHorizon * 0.45, clamp(wash * 0.6 * uGlowAmt, 0.0, 1.0));
  col = mix(col, uDusk, clamp(band * 0.9 * uGlowAmt, 0.0, 1.0));
  // Below the horizon (hidden by the desert, seen past its edge): the horizon's haze.
  col = mix(col, uHorizon, smoothstep(0.0, -0.08, h));

  // The milky band, at night only.
  col += mix(uMilkyA, uMilkyB, smoothstep(0.35, 0.9, vMilky)) * vMilky * 0.10 * uNight;

  // The sun: a soft aureole (the sky brightens round it) and a crisp disc.
  float sa = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
  col += uSunCol * (0.22 * exp(-sa * 9.0) + 0.06 * exp(-sa * 2.5)) * uSunDisc;
  const float SR = 0.022;
  col = mix(col, uSunCol * 0.35 + vec3(0.9), (1.0 - smoothstep(SR * 0.82, SR, sa)) * uSunDisc);

  // The moon: a cool halo, then a gibbous disc lit from the sun below the western horizon.
  float ang = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
  col += uStar * (0.10 * exp(-ang * 15.0) + 0.02 * exp(-ang * 3.2)) * uMoonDisc * uNight;
  const float MR = 0.026;
  if (uMoonDisc > 0.0 && ang < MR * 1.25) {
    vec2 uv = vec2(dot(d, uMoonE1), dot(d, uMoonE2)) / MR;
    float r = length(uv);
    float disc = 1.0 - smoothstep(0.93, 1.0, r);
    vec3 n = vec3(uv, sqrt(max(0.0, 1.0 - r * r)));
    float lit = smoothstep(-0.06, 0.14, dot(n, uSunL));
    float m = sin(uv.x * 4.1 + 1.7) * sin(uv.y * 3.3 + 0.4) + 0.5 * sin((uv.x + uv.y) * 6.7 + 2.0);
    float maria = 0.80 + 0.20 * smoothstep(-0.2, 0.7, m);
    vec3 moon = uStar * (0.06 + 1.02 * lit * maria * (0.72 + 0.28 * n.z));
    col = mix(col, moon, disc * uMoonDisc);
  }

  // A meteor: a short bright streak, brightest at its head.
  if (uMetI > 0.0 && uNight > 0.5) {
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

// The moon's right and up on the sky, and the sun's direction in that frame (for its phase).
function moonFrame(moonDir: V3, sunDir: V3) {
  const e1 = normalize([-moonDir[2], 0, moonDir[0]]);
  const e2 = normalize([
    e1[1] * moonDir[2] - e1[2] * moonDir[1],
    e1[2] * moonDir[0] - e1[0] * moonDir[2],
    e1[0] * moonDir[1] - e1[1] * moonDir[0],
  ]);
  const sunL = normalize([
    sunDir[0] * e1[0] + sunDir[1] * e1[1] + sunDir[2] * e1[2],
    sunDir[0] * e2[0] + sunDir[1] * e2[1] + sunDir[2] * e2[2],
    -(sunDir[0] * moonDir[0] + sunDir[1] * moonDir[1] + sunDir[2] * moonDir[2]),
  ]);
  return { e1, e2, sunL };
}

export interface SkyState { look: SkyLook; sunDir: V3; moonDir: V3 }

export function SkyDome({ dim, still, sky }: { dim: number; still: boolean; sky: SkyState }) {
  const geometry = useMemo(() => {
    const g = new SphereGeometry(1, 96, 48);
    const p = g.getAttribute("position");
    const milky = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) milky[i] = milkyGlow([p.getX(i), p.getY(i), p.getZ(i)]);
    g.setAttribute("aMilky", new BufferAttribute(milky, 1));
    return g;
  }, []);
  const material = useMemo(() => {
    const f = moonFrame(MOON_DIR, SUN_DIR);
    return new ShaderMaterial({
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new Color() },
        uMid: { value: new Color() },
        uHorizon: { value: new Color() },
        uDusk: { value: new Color() },
        uGlowAmt: { value: 0 },
        uSunDir: { value: v3(SUN_DIR) },
        uSunCol: { value: new Color() },
        uSunDisc: { value: 0 },
        uMoonDisc: { value: 1 },
        uNight: { value: 1 },
        uStar: { value: new Color(STAR) },
        uMilkyA: { value: new Color(STAR).lerp(new Color("#7f8ba8"), 0.35) },
        uMilkyB: { value: new Color(STAR).lerp(new Color("#c9b49a"), 0.3) },
        uDuskDir: { value: v3(DUSK_DIR) },
        uMoonDir: { value: v3(MOON_DIR) },
        uMoonE1: { value: v3(f.e1) },
        uMoonE2: { value: v3(f.e2) },
        uSunL: { value: v3(f.sunL) },
        uDim: { value: 1 },
        uMetA: { value: new Vector3() },
        uMetB: { value: new Vector3() },
        uMetI: { value: 0 },
      },
    });
  }, []);
  useEffect(() => {
    const u = material.uniforms, L = sky.look;
    u.uDim.value = dim;
    (u.uZenith.value as Color).set(L.zenith);
    (u.uMid.value as Color).set(L.mid);
    (u.uHorizon.value as Color).set(L.horizon);
    (u.uDusk.value as Color).set(L.glow);
    u.uGlowAmt.value = L.glowAmt;
    (u.uSunCol.value as Color).set(L.sun === "#000000" ? "#ffb070" : L.sun);
    u.uSunDisc.value = L.sunDisc;
    u.uMoonDisc.value = L.moonDisc;
    u.uNight.value = L.stars;
    (u.uSunDir.value as Vector3).set(...sky.sunDir);
    // The warm band sits on the horizon under the sun.
    (u.uDuskDir.value as Vector3).set(sky.sunDir[0], 0, sky.sunDir[2]);
    (u.uMoonDir.value as Vector3).set(...sky.moonDir);
    const f = moonFrame(sky.moonDir, sky.sunDir);
    (u.uMoonE1.value as Vector3).set(...f.e1);
    (u.uMoonE2.value as Vector3).set(...f.e2);
    (u.uSunL.value as Vector3).set(...f.sunL);
  }, [material, dim, sky]);
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
  // dim: the view's dimmer times the night (sky.ts skyLook stars); 0 hides the stars (no draw).
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
      uStar: { value: new Color(STAR) },
      uWarm: { value: mixHex(STAR, "#ffc9a0", 0.4) },
      uCool: { value: mixHex(STAR, "#b8d0ff", 0.4) },
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
  return <points name="world-stars" geometry={geometry} material={material} renderOrder={-999} frustumCulled={false} visible={dim > 0.01} />;
}
