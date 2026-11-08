"use client";
// A rotating warn beacon for a tank roof: a steel
// base, a glowing dome, and two additive light cones sweeping round. When a cone passes the
// viewer the halo flashes, the way a real beacon does. No real light unless `light` is set (then
// one cheap point light). It fades in and out calmly. `still`: no spin, no cones; the dome and halo
// stay lit so the state is still plain to see.
// Sizes are in the parent's units: `size` is the housing's height (0.5 = a life-size beacon in
// meters); the parent puts it on the roof and scales it with the view.
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, Color, ConeGeometry, DoubleSide, ShaderMaterial, Vector3,
  type Group, type Mesh, type MeshBasicMaterial, type PointLight, type Sprite, type SpriteMaterial,
} from "three";
import { C } from "../theme";
import { glowTexture } from "./glow";
import { approach, beaconAngle, beaconFlash, BEACON_FADE_MS } from "./motion";

const BEAM_VERT = /* glsl */ `
uniform float uLen;
varying float vAlong;
varying vec3 vN;
varying vec3 vV;
void main() {
  vAlong = clamp(position.z / uLen, 0.0, 1.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uI;
varying float vAlong;
varying vec3 vN;
varying vec3 vV;
void main() {
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float a = pow(1.0 - vAlong, 1.7) * (0.2 + 0.8 * facing) * uI;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

const tmpA = new Vector3(), tmpB = new Vector3(), tmpCam = new Vector3();
const NO_RAY = () => {};

export interface AlarmBeaconProps {
  active: boolean;
  color?: string;        // default the theme's warn (a sensor to check)
  size?: number;         // housing height in the parent's units; default 0.5
  reach?: number;        // light cone length, in housing heights; default 7
  light?: boolean;       // add one point light that pulses with the sweep (costs a light)
  lightIntensity?: number;
  still?: boolean;
}

export function AlarmBeacon({ active, color = C.warn, size = 0.5, reach = 7, light = false, lightIntensity = 4, still = false }: AlarmBeaconProps) {
  const root = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const dome = useRef<MeshBasicMaterial>(null);
  const halo = useRef<Sprite>(null);
  const haloMat = useRef<SpriteMaterial>(null);
  const streak = useRef<Sprite>(null);
  const streakMat = useRef<SpriteMaterial>(null);
  const spill = useRef<MeshBasicMaterial>(null);
  const lamp = useRef<PointLight>(null);
  const coneA = useRef<Mesh>(null);
  const k = useRef(0);
  const s = size;
  const len = reach * s;

  const cone = useMemo(() => {
    // Apex at the lamp, opening along +z: that way getWorldDirection is the beam's axis.
    const g = new ConeGeometry(len * 0.24, len, 28, 1, true);
    g.translate(0, -len / 2, 0);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [len]);
  const beam = useMemo(() => new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uI: { value: 0 }, uLen: { value: len } },
    vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  }), [color, len]);
  useEffect(() => () => cone.dispose(), [cone]);
  useEffect(() => () => beam.dispose(), [beam]);
  const core = useMemo(() => new Color(color).lerp(new Color(C.text), 0.55), [color]);
  const tex = useMemo(() => (typeof document === "undefined" ? null : glowTexture()), []);

  useFrame((state, dt) => {
    k.current = approach(k.current, active ? 1 : 0, Math.min(dt, 0.1) * 1000, BEACON_FADE_MS);
    const on = k.current > 0.004;
    if (root.current) root.current.visible = on || active;
    if (!on && !active) return;
    const t = state.clock.elapsedTime;
    if (spin.current) {
      spin.current.rotation.y = beaconAngle(t, still);
      spin.current.visible = !still;
    }
    // The flash: how squarely a cone points at the viewer (flat directions, either cone).
    let flash = 0;
    if (!still && coneA.current && root.current) {
      coneA.current.getWorldDirection(tmpA);
      root.current.getWorldPosition(tmpB);
      state.camera.getWorldPosition(tmpCam);
      tmpCam.sub(tmpB);
      tmpA.y = 0; tmpCam.y = 0;
      if (tmpA.lengthSq() > 1e-8 && tmpCam.lengthSq() > 1e-8) {
        const c = tmpA.normalize().dot(tmpCam.normalize());
        flash = Math.max(beaconFlash(c), beaconFlash(-c));
      }
    }
    const pulse = still ? 0.75 : 0.55 + 0.45 * flash;
    beam.uniforms.uI.value = 0.55 * k.current;
    if (dome.current) dome.current.opacity = (0.55 + 0.45 * pulse) * k.current;
    if (haloMat.current) haloMat.current.opacity = Math.min(1, (0.6 + 0.4 * flash) * k.current * (still ? 1.3 : 1));
    if (halo.current) halo.current.scale.setScalar(s * (2.4 + 3.6 * flash));
    // A flat flare across the lamp as a cone passes the viewer.
    if (streak.current) streak.current.scale.set(s * (0.5 + 11 * flash), s * (0.12 + 0.3 * flash), 1);
    if (streakMat.current) streakMat.current.opacity = flash * k.current;
    if (spill.current) spill.current.opacity = (0.18 + 0.32 * flash) * k.current;
    if (lamp.current) lamp.current.intensity = lightIntensity * (0.3 + 0.7 * pulse) * k.current;
  });

  // Light, not a thing: no part takes a pointer ray. (In the headset the pointers test every object,
  // hidden ones too, and a Sprite throws without a camera on the raycaster, which stops the
  // pointer's whole hit test: no tank could be selected.)
  useLayoutEffect(() => { root.current?.traverse((o) => { o.raycast = NO_RAY; }); });

  return (
    <group ref={root} visible={active}>
      {/* steel base and cap */}
      <mesh position={[0, 0.06 * s, 0]}>
        <cylinderGeometry args={[0.2 * s, 0.25 * s, 0.12 * s, 20]} />
        <meshStandardMaterial color={C.steel} metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.5 * s, 0]}>
        <cylinderGeometry args={[0.07 * s, 0.1 * s, 0.05 * s, 16]} />
        <meshStandardMaterial color={C.steel} metalness={0.7} roughness={0.35} />
      </mesh>
      {/* the dome: glass that glows the warn color, with a hot core */}
      <mesh position={[0, 0.12 * s, 0]}>
        <cylinderGeometry args={[0.17 * s, 0.18 * s, 0.34 * s, 20, 1, true]} />
        <meshBasicMaterial ref={dome} color={color} transparent depthWrite={false} toneMapped={false} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 0.29 * s, 0]}>
        <sphereGeometry args={[0.075 * s, 12, 8]} />
        <meshBasicMaterial color={core} toneMapped={false} />
      </mesh>
      {/* the sweep */}
      <group ref={spin} position={[0, 0.29 * s, 0]}>
        <mesh ref={coneA} geometry={cone} material={beam} renderOrder={3} />
        <mesh geometry={cone} material={beam} rotation-y={Math.PI} renderOrder={3} />
      </group>
      {tex && (
        <>
          <sprite ref={halo} position={[0, 0.29 * s, 0]} renderOrder={4}>
            <spriteMaterial ref={haloMat} map={tex} color={color} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
          </sprite>
          <sprite ref={streak} position={[0, 0.29 * s, 0]} renderOrder={5}>
            <spriteMaterial ref={streakMat} map={tex} color={core} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
          </sprite>
          {/* light spilling onto the roof around it */}
          <mesh position={[0, 0.004 * s, 0]} rotation-x={-Math.PI / 2} renderOrder={1}>
            <planeGeometry args={[5 * s, 5 * s]} />
            <meshBasicMaterial ref={spill} map={tex} color={color} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
          </mesh>
        </>
      )}
      {light && <pointLight ref={lamp} position={[0, 0.3 * s, 0]} color={color} distance={len * 1.6} decay={2} intensity={0} />}
    </group>
  );
}
