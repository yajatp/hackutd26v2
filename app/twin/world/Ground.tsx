"use client";
// The desert floor: one mesh, 2 km across, one draw call. A radial grid (fine under the judge's
// feet, coarse at the horizon) displaced into gentle dunes beyond the flat where the site stands,
// colored per vertex from desert sand (DESERT.base) toward pale caliche (DESERT.lit), with patches and
// lighter crests. A small patch to the Lambert shader adds what vertex colors cannot follow:
// each pad's graded caliche and the warm spill of its lamps (uniforms, up to MAX_PADS, so pads can
// move without rebuilding the mesh), and a ground grain that fades out with distance.
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, MeshLambertMaterial, Vector3 } from "three";
import { SIZE } from "../theme";
import { duneCrest, fbm2, groundHeight, radialGrid, smoothstep, FLAT_R, DUNE_R, type XZ } from "./terrain";

export const MAX_PADS = 12;
// A muted West Texas desert in daylight albedo (the sky clock's sun and moon light it): sandy tan
// with paler caliche crests, graded caliche pads, warm sodium lamps at night.
export const DESERT = { base: "#9c8164", lit: "#c2a984", pad: "#cbbba0", sodium: "#ffb26a" } as const;
// 72 x 112 (about 16k triangles): the Quest 3S budget (docs/TWIN-THEME.md "Scope"); was 96 x 160.
const RINGS = 72;
const SEGS = 112;

function buildGround(): BufferGeometry {
  const { positions, index } = radialGrid(RINGS, SEGS);
  const n = positions.length / 3;
  const colors = new Float32Array(n * 3);
  const base = new Color(DESERT.base), lit = new Color(DESERT.lit), c = new Color();
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], z = positions[i * 3 + 2];
    const r = Math.hypot(x, z);
    positions[i * 3 + 1] = groundHeight(x, z);
    // Only broad variation per vertex: near the center the triangles are long radial slivers, and
    // anything finer would interpolate into radial streaks. The shader adds the meter-scale mottling.
    const patch = fbm2(x / 110, z / 110, 3, 9);               // broad lighter and darker ground
    const grain = fbm2(x / 40, z / 40, 2, 3);
    const crest = duneCrest(x, z) * smoothstep(FLAT_R, DUNE_R, r);
    const t = Math.min(1, Math.max(0, 0.06 + 0.30 * patch + 0.16 * (grain - 0.5) + 0.22 * crest));
    c.copy(base).lerp(lit, t).multiplyScalar(0.92 + 0.16 * grain);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(positions, 3));
  g.setAttribute("color", new BufferAttribute(colors, 3));
  g.setIndex(new BufferAttribute(index, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export interface GroundUniforms {
  uPads: { value: Vector3[] };
  uPadCount: { value: number };
  uPadLit: { value: Color };
  uSodium: { value: Color };
  uPadGlow: { value: number };
  uHome: { value: Vector3 };             // the judge's lit pool: x, z, radius (0 = off)
  uHomeLit: { value: Color };
  uHomeGlow: { value: number };
}

function newUniforms(): GroundUniforms {
  return {
    uPads: { value: Array.from({ length: MAX_PADS }, () => new Vector3()) },
    uPadCount: { value: 0 },
    uPadLit: { value: new Color(DESERT.pad) },
    uSodium: { value: new Color(DESERT.sodium) },
    uPadGlow: { value: 0.6 },
    uHome: { value: new Vector3(0, 0, 0) },
    uHomeLit: { value: new Color(DESERT.lit) },
    uHomeGlow: { value: 0 },
  };
}

function groundMaterial(u: GroundUniforms): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true, dithering: true });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLp;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLp = transformed;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vLp;
uniform vec3 uPads[${MAX_PADS}];
uniform int uPadCount;
uniform vec3 uPadLit;
uniform vec3 uSodium;
uniform float uPadGlow;
uniform vec3 uHome;
uniform vec3 uHomeLit;
uniform float uHomeGlow;
float padPool = 0.0;
float homePool = 0.0;
float gHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  float pad = 0.0;
  for (int i = 0; i < ${MAX_PADS}; i++) {
    if (i >= uPadCount) break;
    vec3 p = uPads[i];
    float d = distance(vLp.xz, p.xy);
    pad = max(pad, 1.0 - smoothstep(p.z * 0.62, p.z, d));
    padPool = max(padPool, exp(-d * d / (p.z * p.z * 0.45)));
  }
  // Ground grain in two octaves of smooth value noise, 0.7 m and 5 m. Each fades out before a pixel
  // covers half its cell (the larger screen axis, so grazing views do not alias). No finer octave:
  // sub-pixel snapping on the radial mesh's thin triangles turns centimeter noise into radial streaks.
  float fw = max(length(dFdx(vLp.xz)), length(dFdy(vLp.xz)));
  vec2 pp = vLp.xz / 0.7 + 17.0;
  vec2 pc = floor(pp), pf = fract(pp);
  pf = pf * pf * (3.0 - 2.0 * pf);
  float pebble = mix(mix(gHash(pc), gHash(pc + vec2(1.0, 0.0)), pf.x), mix(gHash(pc + vec2(0.0, 1.0)), gHash(pc + vec2(1.0, 1.0)), pf.x), pf.y);
  diffuseColor.rgb *= mix(0.86 + 0.28 * pebble, 1.0, smoothstep(0.17, 0.35, fw));
  vec2 mp = vLp.xz / 5.0 - 31.0;
  vec2 mc = floor(mp), mf = fract(mp);
  mf = mf * mf * (3.0 - 2.0 * mf);
  float mottle = mix(mix(gHash(mc), gHash(mc + vec2(1.0, 0.0)), mf.x), mix(gHash(mc + vec2(0.0, 1.0)), gHash(mc + vec2(1.0, 1.0)), mf.x), mf.y);
  diffuseColor.rgb *= mix(0.86 + 0.28 * mottle, 1.0, smoothstep(1.25, 2.5, fw));
  diffuseColor.rgb = mix(diffuseColor.rgb, uPadLit * (0.92 + 0.16 * pebble), pad * 0.25);
  // The judge's own pool: lit caliche within a third of its radius, back to the night desert at it.
  if (uHome.z > 0.0) {
    float hd = distance(vLp.xz, uHome.xy);
    homePool = 1.0 - smoothstep(uHome.z * 0.33, uHome.z, hd);
    diffuseColor.rgb = mix(diffuseColor.rgb, uHomeLit * (0.88 + 0.24 * pebble) * (0.9 + 0.2 * mottle), homePool * 0.85);
  }
}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
totalEmissiveRadiance += uSodium * padPool * uPadGlow * 0.16;
totalEmissiveRadiance += diffuseColor.rgb * homePool * homePool * uHomeGlow * 0.55;`);
  };
  m.customProgramCacheKey = () => "avon-world-ground-v2";
  return m;
}

// pads: pad centers in the World's frame; padRadius: their radius in the same meters.
// home / homeGlow: the lit pool round the judge's start (radius in meters, 0 = none), and its light.
export function Ground({ pads, padRadius = SIZE.padRadius, padGlow, home = 0, homeGlow = 0 }: {
  pads: readonly XZ[]; padRadius?: number; padGlow: number; home?: number; homeGlow?: number;
}) {
  const geometry = useMemo(buildGround, []);
  const uniforms = useMemo(newUniforms, []);
  const material = useMemo(() => groundMaterial(uniforms), [uniforms]);
  useEffect(() => {
    // The pads nearest the judge first, if there are more than the shader holds.
    const sorted = [...pads].sort((a, b) => a[0] * a[0] + a[1] * a[1] - b[0] * b[0] - b[1] * b[1]).slice(0, MAX_PADS);
    sorted.forEach(([x, z], i) => uniforms.uPads.value[i].set(x, z, padRadius));
    uniforms.uPadCount.value = sorted.length;
  }, [pads, padRadius, uniforms]);
  useEffect(() => { uniforms.uPadGlow.value = padGlow; }, [padGlow, uniforms]);
  useEffect(() => { uniforms.uHome.value.set(0, 0, home); uniforms.uHomeGlow.value = homeGlow; }, [home, homeGlow, uniforms]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <mesh name="world-ground" geometry={geometry} material={material} />;
}
