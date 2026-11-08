"use client";
// What really happens on the pad when something goes wrong (the drama is in the world, not
// in the interface). Walk view only, in pad space.
// - Pump failed: an amber strobe on the battery's alarm pole, a sharp flash about once a second;
//   its real light (StrobeLight, always mounted so the light count never changes) lights the
//   nearby steel. The pumpjacks coast to a stop on their own (PumpjackModel crankSpeed).
// - Sensor faked: the level transmitter's status LED blinks wrong (fast, irregular, red and
//   amber where a healthy one gives one slow green blink), its dial's needle twitches between
//   readings it cannot hold, while the float gauge keeps rising; one quiet red tag hangs on it.
// - LOCKDOWN: the pad's light (PadLamp) and the masts' beams fade to red emergency light over
//   about 1 s (useLockdownLight); clearing eases back to warm.
// `still` (reduced motion or the comfort setting): no strobe flicker, the lens glows steady.
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, SpriteMaterial, type Group, type Mesh, type MeshBasicMaterial, type PointLight, type Sprite } from "three";
import { C } from "../theme";
import { noRay, TANK } from "../models";
import { softDisc } from "../models/kit";
import { coneMaterial } from "../models/shaders";
import { mastLamps } from "../models/geometry";

// The transmitter dial's needle, radians from straight up. Healthy: steady at the reading. Faked:
// jumps to a new wrong reading about 7 times a second with a fast flutter. Pure, for tests.
export const NEEDLE_OK = 0.35;
export function needleAngle(tS: number, faked: boolean): number {
  if (!faked) return NEEDLE_OK;
  const slot = Math.floor(tS * 7);
  const h = Math.abs(Math.sin(slot * 57.3 + 4.1) * 43758.5) % 1;
  return NEEDLE_OK + (h - 0.5) * 1.6 + 0.07 * Math.sin(tS * 47);
}

// The alarm pole stands just outside the dike's south-west corner, in the judge's view from the start.
export const ALARM_POLE = { x: -3.85, z: 3.75, h: 4.2 } as const;
export const STROBE_AT: [number, number, number] = [ALARM_POLE.x, ALARM_POLE.h + 0.18, ALARM_POLE.z];
const AMBER = new Color("#ffa21f");
const RED = new Color(C.alert);
const GREEN = new Color(C.ok);

// 0..1: a strobe's flash, sharp on, quick decay, once a second. Pure, for tests.
export function strobe(tS: number): number {
  const ph = tS % 1;
  return ph < 0.02 ? ph / 0.02 : Math.exp(-(ph - 0.02) / 0.08);
}

// The healthy transmitter: one short green blink every 2 s. Faked: fast, irregular, red or amber.
export function transmitterBlink(tS: number, faked: boolean): { on: number; red: boolean } {
  if (!faked) return { on: tS % 2 < 0.12 ? 1 : 0, red: false };
  const slot = Math.floor(tS * 7);
  const h = Math.abs(Math.sin(slot * 91.7) * 43758.5) % 1;
  return { on: h > 0.35 ? 1 : 0, red: h > 0.6 };
}

// The strobe's real light: mounted in every view (intensity 0 unless the pad's pump failed in
// Walk), so changing view never changes the scene's light count.
export function StrobeLight({ on, still }: { on: boolean; still: boolean }) {
  const ref = useRef<PointLight>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.intensity = !on ? 0 : still ? 6 : 70 * strobe(clock.elapsedTime);
  });
  return <pointLight ref={ref} color={AMBER} intensity={0} distance={18} decay={2} position={STROBE_AT} />;
}

export function SiteEvents({ failed, faked, locked = false, still }: { failed: boolean; faked: boolean; locked?: boolean; still: boolean }) {
  const lamps = useMemo(() => mastLamps().map((m) => m.lamp), []);
  const redMat = useMemo(() => new SpriteMaterial({ map: softDisc(), color: RED, blending: AdditiveBlending, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => redMat.dispose(), [redMat]);
  const redGroup = useRef<Group>(null);
  const red = useRef(0);
  const lens = useRef<MeshBasicMaterial>(null);
  const flare = useRef<Sprite>(null);
  const flareMat = useRef<SpriteMaterial>(null);
  const led = useRef<SpriteMaterial>(null);
  const tag = useRef<Mesh>(null);
  const needle = useRef<Group>(null);
  const k = useRef({ tag: 0 });
  const off = useMemo(() => AMBER.clone().multiplyScalar(0.25), []);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const f = !failed ? 0 : still ? 0.6 : strobe(t);
    lens.current?.color.copy(off).lerp(AMBER, f);
    if (flareMat.current) flareMat.current.opacity = f;
    flare.current?.scale.setScalar(0.6 + 2.6 * f);
    if (flare.current) flare.current.visible = f > 0.01;
    const b = transmitterBlink(t, faked && !still);
    if (led.current) {
      led.current.color.copy(faked ? (b.red || still ? RED : AMBER) : GREEN);
      led.current.opacity = faked && still ? 0.9 : b.on * 0.95;
    }
    red.current = still ? (locked ? 1 : 0) : red.current + ((locked ? 1 : 0) - red.current) * Math.min(1, dt * 3.2);
    redMat.opacity = red.current;
    if (redGroup.current) redGroup.current.visible = red.current > 0.01;
    if (needle.current) needle.current.rotation.z = -(still ? (faked ? NEEDLE_OK + 0.7 : NEEDLE_OK) : needleAngle(t, faked));
    const s = k.current;
    s.tag += ((faked ? 1 : 0) - s.tag) * Math.min(1, dt * 4);
    if (tag.current) {
      tag.current.visible = s.tag > 0.02;
      tag.current.scale.setScalar(Math.max(0.001, s.tag));
      tag.current.rotation.x = still ? 0 : 0.12 * Math.sin(t * 1.3);
    }
  });
  const R = TANK.R;
  return (
    <group name="site-events">
      {/* The alarm pole: a galvanized pipe, a junction box, the amber lens and its cap. */}
      <mesh position={[ALARM_POLE.x, ALARM_POLE.h / 2, ALARM_POLE.z]}>
        <cylinderGeometry args={[0.05, 0.06, ALARM_POLE.h, 8]} />
        <meshLambertMaterial color="#8d939c" />
      </mesh>
      <mesh position={[ALARM_POLE.x, 1.3, ALARM_POLE.z + 0.08]}>
        <boxGeometry args={[0.24, 0.3, 0.12]} />
        <meshLambertMaterial color="#6f757e" />
      </mesh>
      <mesh position={STROBE_AT} raycast={noRay}>
        <cylinderGeometry args={[0.1, 0.1, 0.22, 10]} />
        <meshBasicMaterial ref={lens} color={off} toneMapped={false} />
      </mesh>
      <mesh position={[STROBE_AT[0], STROBE_AT[1] + 0.14, STROBE_AT[2]]}>
        <cylinderGeometry args={[0.12, 0.12, 0.05, 10]} />
        <meshLambertMaterial color="#3a3f47" />
      </mesh>
      <sprite ref={flare} position={STROBE_AT} raycast={noRay} renderOrder={4} visible={false}>
        <spriteMaterial ref={flareMat} map={softDisc()} color={AMBER} blending={AdditiveBlending} transparent depthWrite={false} toneMapped={false} />
      </sprite>
      {/* LOCKDOWN: the mast lamps' heads glow emergency red (one shared material, fades with the light). */}
      <group ref={redGroup} visible={false}>
        {lamps.map((p, i) => <sprite key={i} position={p} scale={2.4} material={redMat} raycast={noRay} renderOrder={4} />)}
      </group>
      {/* The level transmitter's status LED (on the sensor box at the gauge's top) and the red tag. */}
      <sprite position={[0.1, TANK.top + 0.08, R + 0.31]} scale={0.14} raycast={noRay} renderOrder={4}>
        <spriteMaterial ref={led} map={softDisc()} color={GREEN} blending={AdditiveBlending} transparent depthWrite={false} toneMapped={false} />
      </sprite>
      {/* The transmitter's dial on the sensor box's face: a white face and a dark needle. */}
      <group position={[-0.06, TANK.top - 0.01, R + 0.296]}>
        <mesh raycast={noRay}>
          <circleGeometry args={[0.065, 16]} />
          <meshBasicMaterial color="#d9d6cc" toneMapped={false} />
        </mesh>
        <group ref={needle} position={[0, 0, 0.003]}>
          <mesh position={[0, 0.026, 0]} raycast={noRay}>
            <planeGeometry args={[0.008, 0.055]} />
            <meshBasicMaterial color="#1b1b1b" toneMapped={false} />
          </mesh>
        </group>
      </group>
      <group position={[-0.26, TANK.top - 0.1, R + 0.3]}>
        <mesh ref={tag} position={[0, -0.12, 0]} raycast={noRay} visible={false}>
          <planeGeometry args={[0.12, 0.22]} />
          <meshBasicMaterial color={C.alert} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// LOCKDOWN light: the pad's lamp and the masts' beams ease to red over about 1 s, and back.
// Returns nothing; drives PadLamp's light through `lamp` and the shared beam material.
const WARM_BEAM = new Color();
let warmSaved = false;
export function useLockdownLight(lamp: RefObject<PointLight | null>, locked: boolean, warm: Color, still: boolean) {
  const k = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const target = locked ? 1 : 0;
    k.current = still ? target : k.current + (target - k.current) * Math.min(1, dt * 3.2);
    const cone = coneMaterial().uniforms.uColor.value as Color;
    if (!warmSaved) { WARM_BEAM.copy(cone); warmSaved = true; }
    cone.copy(WARM_BEAM).lerp(RED, k.current);
    if (lamp.current) lamp.current.color.copy(warm).lerp(RED, k.current);
  });
}
