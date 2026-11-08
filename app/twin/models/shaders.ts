// The models' materials: one painted material for every solid part (vertex colors, so a whole
// unit is one draw call), an unlit one for lamps and windows, and small shaders for the light:
// the tank's level gauge and state band, the selection ring, flowing pipes, lamp glows, light
// cones, the flare's flame and the attack beacon. Every color comes from app/twin/theme.ts.
// Materials are made once and shared; only per-tank uniforms (fill, tone, glitch) are per tank.
import {
  AdditiveBlending, Color, CustomBlending, DoubleSide, MeshBasicMaterial, MeshLambertMaterial, OneFactor,
  OneMinusSrcAlphaFactor, ShaderMaterial, UniformsLib, UniformsUtils, type IUniform,
} from "three";
import { C, TONE_COLOR } from "../theme";
import type { Tone } from "../model";

export const color = (hex: string) => new Color(hex);
export const mix = (a: string, b: string, t: number) => new Color(a).lerp(new Color(b), t);

// One clock for every animated model material; any model's frame loop sets it.
export const TIME: IUniform<number> = { value: 0 };
// The sky clock (world/World.tsx sets these, Sun 06:05): NIGHT is 1 after dark and 0 in daylight
// (lamp cones show only at night); RIM is the sky's light on silhouettes (a cool skylight by day,
// a faint blue at night), shared by painted steel and the flowlines.
export const NIGHT: IUniform<number> = { value: 1 };
export const RIM: IUniform<Color> = { value: new Color("#1d2433") };
// Ground pools that are light after dark (a flare's warm spill, the healthy tanks' soft pool)
// fade in daylight; red and amber pools never do. setNight is called by the World.
const NIGHT_POOLS: { m: MeshBasicMaterial; base: number; day: number }[] = [];
export function setNight(night: number) {
  NIGHT.value = night;
  for (const p of NIGHT_POOLS) p.m.opacity = p.base * (p.day + (1 - p.day) * night);
}
function nightPool(m: MeshBasicMaterial, day: number): MeshBasicMaterial {
  NIGHT_POOLS.push({ m, base: m.opacity, day });
  m.opacity = m.opacity * (day + (1 - day) * NIGHT.value);
  return m;
}

const NOISE = /* glsl */ `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.1 + 1.7) + 0.15 * vnoise(p * 4.3 + 3.1); }`;

// Additive light fades out in fog instead of turning the fog's color.
const FOG_PARS_V = /* glsl */ `
#ifdef USE_FOG
varying float vFogDepth;
#endif
`;
const FOG_V = /* glsl */ `
#ifdef USE_FOG
vFogDepth = -mvPosition.z;
#endif
`;
const FOG_PARS_F = /* glsl */ `
#ifdef USE_FOG
uniform vec3 fogColor; varying float vFogDepth;
#ifdef FOG_EXP2
uniform float fogDensity;
#else
uniform float fogNear; uniform float fogFar;
#endif
#endif
`;
const FOG_FADE = /* glsl */ `
#ifdef USE_FOG
#ifdef FOG_EXP2
float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
#else
float fogF = smoothstep(fogNear, fogFar, vFogDepth);
#endif
gl_FragColor.a *= 1.0 - fogF;
#endif
`;
const FOG_MIX = /* glsl */ `
#ifdef USE_FOG
#ifdef FOG_EXP2
float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
#else
float fogF = smoothstep(fogNear, fogFar, vFogDepth);
#endif
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogF);
#endif
`;

function shader(uniforms: Record<string, IUniform>, vertexShader: string, fragmentShader: string, opts: Partial<ShaderMaterial> = {}) {
  // The fog uniforms are cloned; the model's own are kept by reference, so TIME stays shared.
  const m = new ShaderMaterial({
    uniforms: { ...UniformsUtils.clone(UniformsLib.fog), ...uniforms },
    vertexShader, fragmentShader, fog: true, transparent: true, depthWrite: false, toneMapped: false,
  });
  return Object.assign(m, opts);
}

// Premultiplied: a solid core covers what is behind it (so a red band stays red on bright steel)
// while the glow around it adds light. Shaders using it write rgb already multiplied by coverage.
const PREMULT = { blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor } as const;
const FOG_PREMULT = /* glsl */ `
#ifdef USE_FOG
#ifdef FOG_EXP2
float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
#else
float fogF = smoothstep(fogNear, fogFar, vFogDepth);
#endif
gl_FragColor *= 1.0 - fogF;
#endif
`;

const cache: Record<string, unknown> = {};
function once<T>(key: string, make: () => T): T {
  if (!(key in cache)) cache[key] = make();
  return cache[key] as T;
}

// Painted steel and paint: Lambert lighting from the scene, plus a little of the paint's own color
// (so a part never goes black under a night sky) and the sky's light on silhouettes (RIM).
export function painted(): MeshLambertMaterial {
  return once("painted", () => {
    const m = new MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = (s) => {
      s.uniforms.uRim = RIM;
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uRim;")
        .replace("#include <envmap_fragment>", `#include <envmap_fragment>
        float rimF = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.5);
        outgoingLight += diffuseColor.rgb * 0.07 + uRim * rimF * 0.55;`);
    };
    m.customProgramCacheKey = () => "avon-painted-v2";
    return m;
  });
}

// Lamps, windows, panel screens: their own color, unlit.
export function lit(): MeshBasicMaterial {
  return once("lit", () => new MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
}

// A soft dark disc under an object (no real-time shadows on the Quest).
export function shadowMaterial(alphaMap: import("three").Texture): MeshBasicMaterial {
  return once("shadow", () => new MeshBasicMaterial({
    color: color("#15120e"), alphaMap, transparent: true, opacity: 0.7, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
}

// A soft colored pool of light on the ground, one per tone.
export function groundGlow(tone: Tone, alphaMap: import("three").Texture): MeshBasicMaterial {
  return once(`glow-${tone}`, () => nightPool(new MeshBasicMaterial({
    color: color(TONE_COLOR[tone]), alphaMap, transparent: true, opacity: tone === "ok" ? 0.24 : tone === "warn" ? 0.38 : 0.55,
    blending: AdditiveBlending, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }), tone === "ok" ? 0.15 : 1));
}

// The flare's warm light on the desert around it.
export function warmPool(alphaMap: import("three").Texture): MeshBasicMaterial {
  return once("warm-pool", () => nightPool(new MeshBasicMaterial({
    color: color(C.duskGlow), alphaMap, transparent: true, opacity: 0.32,
    blending: AdditiveBlending, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }), 0.1));
}

// ---- the tank's level gauge ---------------------------------------------------------------------

export const GAUGE = { width: 0.64, bar: 0.26, height: 4.7, bottom: 1.15 };

// The glitch for a faked sensor: on during each glitchFrame window, torn the same way per frame.
export function gaugeTear(frame: number | null): { on: number; frame: number } {
  return frame === null ? { on: 0, frame: 0 } : { on: 1, frame: frame % 997 };
}

export function gaugeMaterial(): ShaderMaterial {
  return shader({
    uColor: { value: color(C.ok) }, uHot: { value: color(C.text) }, uBg: { value: mix(C.skyZenith, C.skyMid, 0.35) },
    uDim: { value: color(C.holoDim) }, uFill: { value: -1 }, uTear: { value: 0 }, uFrame: { value: 0 }, uPulse: { value: 1 },
  }, /* glsl */ `
    varying vec2 vUv;
    ${FOG_PARS_V}
    void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition; ${FOG_V} }`,
  /* glsl */ `
    uniform vec3 uColor; uniform vec3 uHot; uniform vec3 uBg; uniform vec3 uDim;
    uniform float uFill; uniform float uTear; uniform float uFrame; uniform float uPulse;
    varying vec2 vUv;
    ${FOG_PARS_F}
    ${NOISE}
    void main() {
      vec2 uv = vUv;
      float fill = uFill;
      float torn = 0.0;
      if (uTear > 0.5) {
        float band = floor(uv.y * 18.0);
        float h = h21(vec2(band, uFrame));
        if (h > 0.45) { uv.x += (h - 0.72) * 0.55; torn = 1.0; }
        if (fill >= 0.0) fill = clamp(fill + (h21(vec2(uFrame, 3.0)) - 0.5) * 0.7, 0.02, 1.0);
      }
      float x = (uv.x - 0.5) * 2.0 * (${GAUGE.width.toFixed(3)} / ${GAUGE.bar.toFixed(3)});
      float ax = abs(x);
      float inBar = 1.0 - smoothstep(0.97, 1.0, ax);
      float edge = smoothstep(0.82, 0.88, ax) * inBar;
      float y = uv.y;
      float tk = abs(fract(y * 10.0 + 0.5) - 0.5) / 10.0;
      float tick = (1.0 - smoothstep(0.0018, 0.0034, tk)) * step(x, -0.25) * inBar;
      vec3 col = uBg;
      float a = inBar * 0.94;
      if (fill >= 0.0) {
        float filled = step(y, fill);
        float grad = 0.5 + 0.5 * clamp(y / max(fill, 0.05), 0.0, 1.0);
        col = mix(col, uColor * (0.55 + 0.6 * grad), filled * inBar);
        float men = 1.0 - smoothstep(0.0, 0.007, abs(y - fill));
        col = mix(col, uHot, men * inBar);
        float g = exp(-max(ax - 1.0, 0.0) * 3.0) * (1.0 - inBar);
        col = mix(col, uColor, g);
        a = max(a, g * mix(0.18, 0.6, filled));
      } else {
        float hatch = step(0.55, fract((y * ${GAUGE.height.toFixed(2)} + x * 0.12) * 5.0));
        col = mix(col, uDim, hatch * 0.5 * inBar);
      }
      col = mix(col, uDim * 1.6, max(tick, edge * 0.7));
      col = mix(col, uHot, torn * 0.3);
      gl_FragColor = vec4(col * uPulse, a);
      ${FOG_MIX}
      #include <colorspace_fragment>
    }`);
}

// ---- glowing bands: the tank's state band, the hover rim -------------------------------------------

// On an open cylinder (uv.y 0 at the bottom, 1 at the top): a solid core between core0 and core1
// and a glow fading above and below it.
export function bandMaterial(hex: string, core0: number, core1: number): ShaderMaterial {
  return shader({
    uColor: { value: color(hex) }, uCore0: { value: core0 }, uCore1: { value: core1 }, uIntensity: { value: 1 },
  }, /* glsl */ `
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    ${FOG_PARS_V}
    void main() {
      vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal); vV = -mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition; ${FOG_V}
    }`, /* glsl */ `
    uniform vec3 uColor; uniform float uCore0; uniform float uCore1; uniform float uIntensity;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    ${FOG_PARS_F}
    void main() {
      float y = vUv.y;
      float core = smoothstep(uCore0 - 0.015, uCore0, y) * (1.0 - smoothstep(uCore1, uCore1 + 0.015, y));
      float d = y < uCore0 ? (uCore0 - y) / max(uCore0, 1e-3) : (y > uCore1 ? (y - uCore1) / max(1.0 - uCore1, 1e-3) : 0.0);
      float glow = pow(1.0 - clamp(d, 0.0, 1.0), 3.0);
      float facing = abs(dot(normalize(vN), normalize(vV)));
      float k = clamp(uIntensity, 0.0, 1.0);
      float cover = core * (0.8 + 0.2 * facing) * k;
      float add = glow * 0.55 * (0.35 + 0.65 * facing) * uIntensity;
      gl_FragColor = vec4(uColor * (cover + add * (1.0 - cover)) * (0.85 + 0.3 * max(uIntensity - 0.7, 0.0)), cover);
      ${FOG_PREMULT}
      #include <colorspace_fragment>
    }`, { ...PREMULT, side: DoubleSide });
}

// ---- the selection ring on the ground ---------------------------------------------------------------

// On a flat RingGeometry: a solid ring at uR, a dashed ring outside it turning slowly, and a glow.
export function ringMaterial(r: number): ShaderMaterial {
  return shader({ uColor: { value: color(C.holo) }, uR: { value: r }, uTime: TIME, uSpin: { value: 1 }, uIntensity: { value: 1 } },
    /* glsl */ `
    varying vec2 vP;
    ${FOG_PARS_V}
    void main() { vP = position.xy; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition; ${FOG_V} }`,
    /* glsl */ `
    uniform vec3 uColor; uniform float uR; uniform float uTime; uniform float uSpin; uniform float uIntensity;
    varying vec2 vP;
    ${FOG_PARS_F}
    void main() {
      float r = length(vP);
      float ang = atan(vP.y, vP.x) / 6.28318 + 0.5;
      float w = uR * 0.022;
      float ring1 = 1.0 - smoothstep(w * 0.5, w, abs(r - uR));
      float dash = step(0.45, fract(ang * 36.0 + uTime * 0.6 * uSpin));
      float ring2 = (1.0 - smoothstep(w * 0.35, w * 0.7, abs(r - uR * 1.18))) * dash;
      float tick = (1.0 - smoothstep(w * 0.3, w * 0.6, abs(r - uR * 1.32))) * step(0.92, fract(ang * 8.0 - uTime * 0.08 * uSpin));
      float glow = exp(-abs(r - uR) / (uR * 0.1)) * 0.28;
      float cover = clamp(ring1 + ring2 * 0.85 + tick, 0.0, 1.0) * uIntensity;
      float add = glow * uIntensity;
      gl_FragColor = vec4(uColor * (cover + add * (1.0 - cover)), cover);
      ${FOG_PREMULT}
      #include <colorspace_fragment>
    }`, { ...PREMULT, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
}

// ---- pipes ------------------------------------------------------------------------------------------

export type PipeMode = "flowing" | "idle" | "failed";

// A painted pipe with light dashes along it. The geometry's uv.x is meters along the pipe
// (PipeModel scales it), so dashes keep their size on any length. Flowing: holo dashes move along
// the pipe. Idle: they stand still, dim. Failed: they stop and the whole pipe pulses alert.
export function pipeMaterial(mode: PipeMode, spacing = 2.4, speed = 1.6): MeshLambertMaterial {
  return once(`pipe-${mode}-${spacing}-${speed}`, () => {
    const m = new MeshLambertMaterial({ color: mix(C.steel, C.skyMid, 0.45) });
    m.defines = { USE_UV: "" };
    const u = {
      uTime: TIME, uSpacing: { value: spacing }, uSpeed: { value: speed },
      uMode: { value: mode === "flowing" ? 1 : mode === "idle" ? 0 : 2 },
      uDash: { value: color(C.holo) }, uAlert: { value: color(C.alert) }, uRim: RIM,
    };
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, u);
      s.fragmentShader = s.fragmentShader
        .replace("#include <common>", `#include <common>
        uniform float uTime; uniform float uSpacing; uniform float uSpeed; uniform float uMode;
        uniform vec3 uDash; uniform vec3 uAlert; uniform vec3 uRim;`)
        .replace("#include <envmap_fragment>", `#include <envmap_fragment>
        float rimF = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.5);
        outgoingLight += diffuseColor.rgb * 0.07 + uRim * rimF * 0.5;
        float moving = uMode > 0.5 && uMode < 1.5 ? 1.0 : 0.0;
        float d = fract((vUv.x - uTime * uSpeed * moving) / uSpacing);
        float dash = smoothstep(0.0, 0.06, d) * (1.0 - smoothstep(0.26, 0.36, d));
        if (uMode < 0.5) outgoingLight += uDash * dash * 0.18;
        else if (uMode < 1.5) outgoingLight = mix(outgoingLight, uDash * 1.25, dash * 0.9);
        else {
          float pulse = 0.5 + 0.5 * sin(uTime * 5.2);
          outgoingLight = mix(outgoingLight, uAlert, 0.25 + 0.55 * pulse);
          outgoingLight += uAlert * dash * 0.25;
        }`);
    };
    m.customProgramCacheKey = () => "avon-pipe-v2";
    return m;
  });
}

// ---- lamp glows (instanced billboards) --------------------------------------------------------------

// A round glow that always faces the eye. Each instance's scale is its size in meters and its
// instanceColor its color. One draw call for every lamp on a pad.
export function glowMaterial(): ShaderMaterial {
  return once("glow", () => shader({ uTime: TIME }, /* glsl */ `
    varying vec2 vUv; varying vec3 vColor; varying float vSeed; varying float vSize;
    ${FOG_PARS_V}
    void main() {
      vUv = uv;
      vColor = vec3(1.0);
      #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
      #endif
      mat4 m = modelViewMatrix;
      #ifdef USE_INSTANCING
      m = modelViewMatrix * instanceMatrix;
      #endif
      float s = length(m[0].xyz);
      vSize = s;
      vec4 mvPosition = m * vec4(0.0, 0.0, 0.0, 1.0);
      vSeed = fract(float(gl_InstanceID) * 0.618);
      mvPosition.xy += position.xy * s;
      gl_Position = projectionMatrix * mvPosition;
      ${FOG_V}
    }`, /* glsl */ `
    uniform float uTime;
    varying vec2 vUv; varying vec3 vColor; varying float vSeed; varying float vSize;
    ${FOG_PARS_F}
    void main() {
      float d = length(vUv - 0.5) * 2.0;
      float core = 1.0 - smoothstep(0.0, 0.16, d);
      float halo = pow(clamp(1.0 - d, 0.0, 1.0), 2.4);
      float shimmer = 0.92 + 0.08 * sin(uTime * 7.0 + vSeed * 40.0);
      // Small lamps get a white-hot core; big halos (a flare's) stay their color.
      float small = 1.0 - smoothstep(1.5, 5.0, vSize);
      gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.55 * small), clamp((core * small + halo * 0.85) * shimmer, 0.0, 1.0));
      ${FOG_FADE}
      #include <colorspace_fragment>
    }`, { blending: AdditiveBlending }));
}

// ---- light cones under the mast lamps ---------------------------------------------------------------

// On an open cone (uv.y 1 at the lamp): bright near the lamp, fading to the ground, soft at the edges.
export function coneMaterial(): ShaderMaterial {
  return once("cone", () => shader({ uColor: { value: mix("#ffc890", "#fff4e4", 0.6) }, uNight: NIGHT }, /* glsl */ `
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    ${FOG_PARS_V}
    void main() {
      vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal); vV = -mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition; ${FOG_V}
    }`, /* glsl */ `
    uniform vec3 uColor;
    uniform float uNight;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    ${FOG_PARS_F}
    void main() {
      float facing = abs(dot(normalize(vN), normalize(vV)));
      float a = pow(vUv.y, 1.6) * pow(facing, 1.4) * 0.16 * uNight;
      gl_FragColor = vec4(uColor, a);
      ${FOG_FADE}
      #include <colorspace_fragment>
    }`, { blending: AdditiveBlending, side: DoubleSide }));
}

// ---- the flare ---------------------------------------------------------------------------------------

// A flame on a quad (x -0.5..0.5, y 0..1 times its size) that turns about the vertical to face the
// eye, so it never rolls when the judge tilts their head.
export function flameMaterial(seed = 0): ShaderMaterial {
  return shader({
    uTime: TIME, uSeed: { value: seed },
    uCore: { value: mix(C.duskGlow, C.stars, 0.45) }, uMid: { value: color(C.duskGlow) }, uEdge: { value: mix(C.duskGlow, C.alert, 0.6) },
  }, /* glsl */ `
    varying vec2 vUv;
    ${FOG_PARS_V}
    void main() {
      vUv = uv;
      vec3 camL = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
      vec2 d = camL.xz; d = length(d) < 1e-4 ? vec2(0.0, 1.0) : normalize(d);
      vec3 right = vec3(d.y, 0.0, -d.x);
      vec3 p = right * position.x + vec3(0.0, position.y, 0.0);
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      ${FOG_V}
    }`, /* glsl */ `
    uniform float uTime; uniform float uSeed; uniform vec3 uCore; uniform vec3 uMid; uniform vec3 uEdge;
    varying vec2 vUv;
    ${FOG_PARS_F}
    ${NOISE}
    void main() {
      float y = vUv.y;
      float x = (vUv.x - 0.5) * 2.0;
      float n = fbm(vec2(vUv.x * 3.0 + uSeed, y * 2.6 - uTime * 2.4));
      float sway = (vnoise(vec2(uTime * 0.9, uSeed * 3.1)) - 0.5) * 0.5 * y * y;
      float w = mix(0.85, 0.1, pow(y, 0.6)) * (0.65 + 0.7 * n);
      float d = abs(x - sway) / max(w, 1e-3);
      float body = (1.0 - smoothstep(0.25, 1.0, d)) * smoothstep(0.0, 0.07, y) * (1.0 - smoothstep(0.55 + 0.35 * n, 1.0, y));
      float heat = body * (1.0 - y * 0.8) * (0.7 + 0.4 * n);
      vec3 col = mix(uEdge, uMid, smoothstep(0.1, 0.45, heat));
      col = mix(col, uCore, smoothstep(0.62, 1.0, heat));
      // Premultiplied: the flame's body covers the violet sky (additive orange on violet reads pink),
      // its thin edges still add light.
      float a = clamp(body * 0.92, 0.0, 1.0);
      gl_FragColor = vec4(col * a * 1.15, a * 0.85);
      ${FOG_PREMULT}
      #include <colorspace_fragment>
    }`, { ...PREMULT, side: DoubleSide });
}

// ---- the attack beacon: a rotating warn light on the tank's roof ---------------------------------------

// On a vertical quad (x -1..1 along the beam, y -0.5..0.5): a beam of light fading outward.
export function beaconMaterial(): ShaderMaterial {
  return once("beacon", () => shader({ uColor: { value: color(C.warn) } }, /* glsl */ `
    varying vec2 vUv;
    ${FOG_PARS_V}
    void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition; ${FOG_V} }`,
  /* glsl */ `
    uniform vec3 uColor;
    varying vec2 vUv;
    ${FOG_PARS_F}
    void main() {
      float along = abs(vUv.x - 0.5) * 2.0;
      float spread = mix(0.12, 1.0, along);
      float across = abs(vUv.y - 0.5) * 2.0 / spread;
      float a = pow(1.0 - along, 1.4) * (1.0 - smoothstep(0.2, 1.0, across)) * 0.55;
      gl_FragColor = vec4(uColor, a);
      ${FOG_FADE}
      #include <colorspace_fragment>
    }`, { blending: AdditiveBlending, side: DoubleSide }));
}

// ---- a state you can read across the room (table and overview) -------------------------------

// The whole shell washed in the state's color: a sleeve just outside the steel, normal blending, so
// a failed tank reads red (a check-the-sensor tank amber) from the table's far side. One per tone,
// shared; its opacity breathes for alert (TankModel sets it each frame).
export function shellTint(tone: Exclude<Tone, "ok">): MeshBasicMaterial {
  return once(`tint-${tone}`, () => new MeshBasicMaterial({
    color: color(TONE_COLOR[tone]), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
}

// A column of light standing on the roof, fading upward (additive). uI is set per frame.
export function statePillar(tone: Exclude<Tone, "ok">): ShaderMaterial {
  return once(`pillar-${tone}`, () => shader({ uColor: { value: color(TONE_COLOR[tone]) }, uI: { value: 0.35 } }, /* glsl */ `
    varying vec2 vUv;
    ${FOG_PARS_V}
    void main() {
      vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition; ${FOG_V}
    }`, /* glsl */ `
    uniform vec3 uColor; uniform float uI;
    varying vec2 vUv;
    ${FOG_PARS_F}
    void main() {
      float a = pow(1.0 - vUv.y, 1.6) * uI;
      gl_FragColor = vec4(uColor * a * 1.3, a);
      ${FOG_PREMULT}
      #include <colorspace_fragment>
    }`, { blending: AdditiveBlending, side: DoubleSide }));
}
