"use client";
// One storage tank at life size (3.7 m across, about 6 m to the roof edge), origin at the middle
// of its base. A steel shell in four courses with staggered seams, a cone roof with a thief hatch
// and a gooseneck vent, a caged ladder and a top rail. Its state is light:
// - a glowing level gauge strip on the south side, filled to `fill` in the tank's tone (null: not
//   reported, a dim hatch);
// - a band glowing near the base in TONE_COLOR (alert breathes, warn pulses slowly), with a pool
//   of the same color on the ground;
// - hovered: a holo rim glows round the roof; selected: a holo ring turns on the ground;
// - faked: the gauge tears and its level jumps on the /vr glitch cadence (glitchFrame), and the
//   band flickers with it; `beacon` adds the attack moment's rotating warn beacon on the roof.
// `still` (reduced motion or the comfort setting) stops the tearing, the beacon spin and the ring's
// turn; the colors stay. About 5 draw calls (7 hovered and selected), under 6k triangles.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, PlaneGeometry, type Group, type Mesh } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { glitchFrame } from "@/app/vr/field";
import { C, TONE_COLOR } from "../theme";
import type { Tone } from "../model";
import { bandGeometry, flatQuad, gaugeGeometry, rimGeometry, tankGeometry, TANK } from "./geometry";
import { softDisc } from "./kit";
import {
  bandMaterial, beaconMaterial, gaugeMaterial, gaugeTear, groundGlow, painted, ringMaterial, shadowMaterial, shellTint, statePillar, TIME,
} from "./shaders";
import { Glows, noRay, type GlowItem } from "./common";
import { hash1 } from "./rig";
import { stateGlow } from "../look";

export interface TankModelProps {
  fill: number | null;          // 0..1 from the alert's level; null = not reported
  tone: Tone;                   // "ok" | "warn" | "alert", as the console
  faked?: boolean;              // Phone 1 is faking this tank's sensor
  selected?: boolean;
  hovered?: boolean;
  still?: boolean;              // reduced motion: no tearing, spin or turning ring
  beacon?: boolean;             // the attack moment's rotating warn beacon on the roof
  shadow?: boolean;             // a soft contact shadow (FacilityModel bakes its own into the pad)
  tint?: boolean;               // miniatures: wash the whole shell in the state's color (not OK only)
  pillarM?: number;             // miniatures: a column of the state's light this tall over the roof (0: none)
}

const SELECT_R = TANK.R + 0.75;
const BEACON_AT: [number, number, number] = [0, TANK.top + 0.42, TANK.R + 0.16];

function approach(cur: number, target: number, dtS: number, settleS: number) {
  return settleS <= 0 ? target : target + (cur - target) * Math.exp((-3 * dtS) / settleS);
}

let fan: BufferGeometry | null = null;
function fanGeometry(): BufferGeometry {
  if (fan) return fan;
  const a = new PlaneGeometry(14, 2.2), b = new PlaneGeometry(14, 2.2).rotateX(Math.PI / 2);
  for (const g of [a, b]) g.deleteAttribute("normal");
  fan = mergeGeometries([a, b], false)!;
  fan.setAttribute("normal", new Float32BufferAttribute(new Float32Array(fan.attributes.position.count * 3), 3));
  return fan;
}

let sleeve: BufferGeometry | null = null;
function sleeveGeometry(): BufferGeometry {
  sleeve ??= new CylinderGeometry(TANK.R + 0.04, TANK.R + 0.04, TANK.top - TANK.base + 0.1, 28, 1, true).translate(0, (TANK.top + TANK.base) / 2, 0);
  return sleeve;
}
let column: BufferGeometry | null = null;
function columnGeometry(): BufferGeometry {
  column ??= new CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0);
  return column;
}

export function TankModel({ fill, tone, faked = false, selected = false, hovered = false, still = false, beacon = false, shadow = true, tint = false, pillarM = 0 }: TankModelProps) {
  const gauge = useMemo(() => gaugeMaterial(), []);
  const band = useMemo(() => bandMaterial(TONE_COLOR[tone], 0.36, 0.62), [tone]);
  const rim = useMemo(() => bandMaterial(C.holo, 0.32, 0.36), []);
  const ring = useMemo(() => ringMaterial(SELECT_R), []);
  useEffect(() => () => band.dispose(), [band]);
  useEffect(() => () => { gauge.dispose(); rim.dispose(); ring.dispose(); }, [gauge, rim, ring]);

  const rimMesh = useRef<Mesh>(null);
  const ringMesh = useRef<Mesh>(null);
  const spin = useRef<Group>(null);
  const ease = useRef({ hover: 0, select: 0 });
  const toneColor = useMemo(() => new Color(TONE_COLOR[tone]), [tone]);
  const beaconGlow = useMemo<GlowItem[]>(() => [{ p: BEACON_AT, size: 1.6, color: new Color(C.warn) }], []);

  useFrame(({ clock }, dtRaw) => {
    const t = clock.elapsedTime, dt = Math.min(dtRaw, 0.1);
    TIME.value = t;
    const u = gauge.uniforms;
    u.uFill.value = fill ?? -1;
    (u.uColor.value as Color).copy(toneColor);
    const f = faked && !still ? glitchFrame(t * 1000, false) : null;
    const tear = gaugeTear(f);
    u.uTear.value = tear.on;
    u.uFrame.value = tear.frame;
    u.uPulse.value = tone === "alert" && !still ? 0.88 + 0.12 * Math.sin(t * 4.2) : 1;

    let k = tone === "alert" ? 0.78 + 0.22 * Math.sin(t * 4.2) : tone === "warn" ? 0.86 + 0.14 * Math.sin(t * 1.9) : 0.62;
    if (still) k = tone === "ok" ? 0.62 : 0.95;
    if (f !== null) k *= 0.25 + 1.0 * hash1(f);
    band.uniforms.uIntensity.value = k;

    const e = ease.current;
    e.hover = approach(e.hover, hovered ? 1 : 0, dt, still ? 0 : 0.15);
    e.select = approach(e.select, selected ? 1 : 0, dt, still ? 0 : 0.22);
    rim.uniforms.uIntensity.value = e.hover;
    if (rimMesh.current) rimMesh.current.visible = e.hover > 0.01;
    ring.uniforms.uIntensity.value = e.select;
    ring.uniforms.uSpin.value = still ? 0 : 1;
    if (ringMesh.current) {
      ringMesh.current.visible = e.select > 0.01;
      ringMesh.current.scale.setScalar(0.92 + 0.08 * e.select);
    }
    if (spin.current) spin.current.rotation.y = still ? 0.6 : t * 2 * Math.PI * 0.75;
    if (tone !== "ok" && (tint || pillarM > 0)) {
      const gl = stateGlow(tone, t, still);
      shellTint(tone).opacity = gl.tint;
      statePillar(tone).uniforms.uI.value = gl.pillar;
    }
  });

  return (
    <group name="tank-model">
      <mesh geometry={tankGeometry()} material={painted()} />
      <mesh geometry={gaugeGeometry()} material={gauge} renderOrder={2} />
      <mesh geometry={bandGeometry()} material={band} raycast={noRay} renderOrder={2} />
      <mesh geometry={flatQuad()} material={groundGlow(tone, softDisc())} position={[0, 0.04, 0]} scale={[10, 1, 10]} raycast={noRay} renderOrder={1} />
      {shadow && <mesh geometry={flatQuad()} material={shadowMaterial(softDisc())} position={[0.25, 0.03, 0.2]} scale={[6.6, 1, 6.6]} raycast={noRay} renderOrder={0} />}
      <mesh ref={rimMesh} geometry={rimGeometry()} material={rim} raycast={noRay} visible={false} renderOrder={2} />
      <mesh ref={ringMesh} material={ring} rotation-x={-Math.PI / 2} position={[0, 0.05, 0]} raycast={noRay} visible={false} renderOrder={2}>
        <ringGeometry args={[SELECT_R * 0.85, SELECT_R * 1.42, 96, 1]} />
      </mesh>
      {tint && tone !== "ok" && <mesh geometry={sleeveGeometry()} material={shellTint(tone)} raycast={noRay} renderOrder={1} />}
      {pillarM > 0 && tone !== "ok" && (
        <mesh geometry={columnGeometry()} material={statePillar(tone)} position={[0, TANK.railY, 0]} scale={[TANK.R * 0.42, pillarM, TANK.R * 0.42]}
          raycast={noRay} renderOrder={3} />
      )}
      {beacon && (
        <>
          <mesh position={BEACON_AT} raycast={noRay}>
            <cylinderGeometry args={[0.12, 0.14, 0.2, 10]} />
            <meshBasicMaterial color={C.warn} toneMapped={false} />
          </mesh>
          <group ref={spin} position={BEACON_AT}>
            <mesh geometry={fanGeometry()} material={beaconMaterial()} position={[0, 0, 0]} raycast={noRay} renderOrder={3} />
          </group>
          <Glows items={beaconGlow} />
        </>
      )}
    </group>
  );
}
