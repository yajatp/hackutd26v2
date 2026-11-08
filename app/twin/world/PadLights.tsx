"use client";
// Sodium lamp posts at each pad: four draw calls for any number of pads (instanced poles, lamp
// heads, soft glow billboards and faint light cones), plus a fixed number of real point lights
// (maxReal, at most 6) that sit on the posts nearest the viewer and move to the new nearest ones
// after a teleport. The count of real lights never changes while mounted, so no material
// recompiles when the judge changes view; with no posts the lights stay at zero intensity.
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, BoxGeometry, Color, CylinderGeometry, DoubleSide, Matrix4, MeshBasicMaterial, MeshLambertMaterial,
  PlaneGeometry, Quaternion, ShaderMaterial, Vector3, type Group, type InstancedMesh, type PointLight,
} from "three";
import { C } from "../theme";
import { nearestPosts, padPosts, POST_HEIGHT, PAD_POSTS, type XZ } from "./terrain";

export const MAX_REAL_LIGHTS = 6;
const REASSIGN_S = 0.35;
const LAMP_RANGE_M = 46;              // a real light's reach at life size
const LAMP_CANDELA = 260;             // at life size; scales with scale^2 (decay 2)

export interface PadLightsProps {
  positions: readonly XZ[];           // pad centers, meters, in the World's frame
  scale?: number;                     // object scale: 1 = life size (the walk view)
  posts?: readonly XZ[];              // lamp posts around each pad, real meters from its center
  maxReal?: number;                   // real point lights, on the posts nearest the viewer (<= 6)
  dim?: number;                       // 0..1, the table view's dimmer world
}

const GLOW_VERT = /* glsl */ `
uniform float uSize;
varying vec2 vUv;
varying float vFade;
void main() {
  vUv = uv - 0.5;
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float s = length(instanceMatrix[0].xyz);
  c.xy += position.xy * uSize * s;
  vFade = 1.0 - 0.6 * smoothstep(200.0, 900.0, -c.z);
  gl_Position = projectionMatrix * c;
}`;

const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uI;
varying vec2 vUv;
varying float vFade;
void main() {
  float r = length(vUv) * 2.0;
  float g = 0.55 * exp(-r * r * 7.0) + 0.25 * exp(-r * 4.0);
  g *= 1.0 - smoothstep(0.8, 1.0, r);
  gl_FragColor = vec4(uColor * g * uI * vFade, 1.0);
  #include <colorspace_fragment>
}`;

const CONE_VERT = /* glsl */ `
varying float vY;
varying float vRim;
varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * (mat3(instanceMatrix) * normal));
  vRim = abs(dot(n, normalize(-mv.xyz)));
  vY = uv.y;
  // Gone up close (no wedge of light across the judge's face) and far away (no haze over the horizon).
  float dist = length(mv.xyz);
  vFade = smoothstep(6.0, 18.0, dist) * (1.0 - smoothstep(60.0, 260.0, dist));
  gl_Position = projectionMatrix * mv;
}`;

const CONE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uI;
varying float vY;
varying float vRim;
varying float vFade;
void main() {
  float a = vRim * vRim * mix(0.18, 1.0, vY * vY) * uI * vFade;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
}`;

const lampColor = () => new Color(C.duskGlow).lerp(new Color(C.stars), 0.16);

// Shared geometry and materials, built once per mounted PadLights.
function useParts() {
  return useMemo(() => {
    const pole = new CylinderGeometry(0.09, 0.14, 1, 6, 1, true);
    pole.translate(0, 0.5, 0);
    const head = new BoxGeometry(0.95, 0.22, 0.5);
    const glow = new PlaneGeometry(1, 1);
    const cone = new CylinderGeometry(0.35, 4.6, 1, 16, 1, true);
    cone.translate(0, 0.5, 0);
    const poleMat = new MeshLambertMaterial({ color: new Color(C.steel).lerp(new Color(C.ground), 0.6) });
    const headMat = new MeshBasicMaterial({ color: new Color(C.duskGlow).lerp(new Color(C.stars), 0.55) });
    const glowMat = new ShaderMaterial({
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false,
      uniforms: { uSize: { value: 2.1 }, uColor: { value: lampColor() }, uI: { value: 1 } },
    });
    const coneMat = new ShaderMaterial({
      vertexShader: CONE_VERT, fragmentShader: CONE_FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false, side: DoubleSide,
      uniforms: { uColor: { value: lampColor() }, uI: { value: 0.045 } },
    });
    return { pole, head, glow, cone, poleMat, headMat, glowMat, coneMat };
  }, []);
}

function useDispose(parts: ReturnType<typeof useParts>) {
  useLayoutEffect(() => () => { for (const p of Object.values(parts)) p.dispose(); }, [parts]);
}

const m4 = new Matrix4(), q = new Quaternion(), qTilt = new Quaternion(), s3 = new Vector3(), p3 = new Vector3();
const UP = new Vector3(0, 1, 0), X = new Vector3(1, 0, 0);

function Posts({ posts, scale, centers, parts }: { posts: [number, number][]; scale: number; centers: [number, number][]; parts: ReturnType<typeof useParts> }) {
  const pole = useRef<InstancedMesh>(null), head = useRef<InstancedMesh>(null);
  const glow = useRef<InstancedMesh>(null), cone = useRef<InstancedMesh>(null);
  const top = POST_HEIGHT * scale;
  useLayoutEffect(() => {
    posts.forEach(([x, z], i) => {
      // Each lamp head faces its pad's center, tilted down toward it.
      const [cx, cz] = centers[i];
      q.setFromAxisAngle(UP, Math.atan2(cx - x, cz - z));
      qTilt.setFromAxisAngle(X, 0.35);
      m4.compose(p3.set(x, 0, z), q, s3.set(scale, top, scale));
      pole.current?.setMatrixAt(i, m4);
      m4.compose(p3.set(x, top, z), q.clone().multiply(qTilt), s3.setScalar(scale));
      head.current?.setMatrixAt(i, m4);
      m4.compose(p3.set(x, top + 0.1 * scale, z), q.identity(), s3.setScalar(scale));
      glow.current?.setMatrixAt(i, m4);
      m4.compose(p3.set(x, 0.05 * scale, z), q, s3.set(scale, top - 0.1 * scale, scale));
      cone.current?.setMatrixAt(i, m4);
    });
    for (const r of [pole, head, glow, cone]) {
      if (!r.current) continue;
      r.current.instanceMatrix.needsUpdate = true;
      r.current.computeBoundingSphere();
    }
  }, [posts, centers, scale, top]);
  const n = posts.length;
  return (
    <>
      <instancedMesh ref={pole} args={[parts.pole, parts.poleMat, n]} />
      <instancedMesh ref={head} args={[parts.head, parts.headMat, n]} />
      <instancedMesh ref={cone} args={[parts.cone, parts.coneMat, n]} frustumCulled={false} />
      <instancedMesh ref={glow} args={[parts.glow, parts.glowMat, n]} frustumCulled={false} />
    </>
  );
}

export function PadLights({ positions, scale = 1, posts = PAD_POSTS, maxReal = 4, dim = 1 }: PadLightsProps) {
  const parts = useParts();
  useDispose(parts);
  const group = useRef<Group>(null);
  const lights = useRef<(PointLight | null)[]>([]);
  const k = Math.max(0, Math.min(MAX_REAL_LIGHTS, Math.floor(maxReal)));
  const list = useMemo(() => {
    const at = padPosts(positions, scale, posts);
    const centers = positions.flatMap((c) => posts.map(() => [c[0], c[1]] as [number, number]));
    return { at, centers };
  }, [positions, scale, posts]);
  const since = useRef(Infinity);
  const eye = useMemo(() => new Vector3(), []);
  useLayoutEffect(() => { since.current = Infinity; }, [list]);
  useLayoutEffect(() => {
    parts.glowMat.uniforms.uI.value = dim;
    parts.coneMat.uniforms.uI.value = 0.045 * dim;
  }, [parts, dim]);
  useFrame(({ camera }, delta) => {
    since.current += delta;
    if (since.current < REASSIGN_S || !group.current) return;
    since.current = 0;
    camera.getWorldPosition(eye);
    group.current.worldToLocal(eye);
    const pick = nearestPosts(list.at, [eye.x, eye.z], k);
    for (let i = 0; i < k; i++) {
      const L = lights.current[i];
      if (!L) continue;
      const j = pick[i];
      if (j === undefined) { L.intensity = 0; continue; }
      L.position.set(list.at[j][0], POST_HEIGHT * scale - 0.3 * scale, list.at[j][1]);
      L.intensity = LAMP_CANDELA * scale * scale * dim;
      L.distance = LAMP_RANGE_M * scale;
    }
  });
  const color = useMemo(lampColor, []);
  return (
    <group ref={group} name="world-pad-lights">
      {list.at.length > 0 && <Posts key={list.at.length} posts={list.at} centers={list.centers} scale={scale} parts={parts} />}
      {Array.from({ length: k }, (_, i) => (
        <pointLight key={i} ref={(l) => { lights.current[i] = l; }} color={color} intensity={0} decay={2} distance={LAMP_RANGE_M * scale} />
      ))}
    </group>
  );
}
