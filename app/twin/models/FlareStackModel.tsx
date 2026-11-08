"use client";
// A flare stack at life size (about 14 m to the tip; the flame reaches about 20 m), origin at its
// base: skid, knockout drum, a banded stack with a platform, a ladder and three guy wires. The
// flame is two noise-driven additive quads that turn about the vertical to face the eye (so they
// never roll with the judge's head), inside a warm halo that flickers. `light` adds one warm point
// light that flickers with it (it costs every lit material a light; one per system at most).
// 5 draw calls without the light (stack, two flame quads, halo glows, the warm pool on the ground).
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, type Group, type PointLight } from "three";
import { C } from "../theme";
import { FLARE, flameGeometry, flareGeometry, flatQuad } from "./geometry";
import { softDisc } from "./kit";
import { flameMaterial, painted, TIME, warmPool } from "./shaders";
import { Glows, noRay, type GlowItem } from "./common";
import { flicker } from "./rig";

export interface FlareStackProps {
  light?: boolean;          // one warm point light at the flame
  lightIntensity?: number;  // its mean intensity (three.js units, decay 1.5)
  lightRange?: number;      // meters
  seed?: number;            // flame shape, so two stacks do not flicker alike
  still?: boolean;          // reduced motion: the halo stops flickering (the flame still moves)
}

export function FlareStackModel({ light = false, lightIntensity = 180, lightRange = 90, seed = 0, still = false }: FlareStackProps) {
  const big = useMemo(() => flameMaterial(seed), [seed]);
  const small = useMemo(() => flameMaterial(seed + 3.7), [seed]);
  const halo = useRef<Group>(null);
  const lamp = useRef<PointLight>(null);
  const glows = useMemo<GlowItem[]>(() => [
    { p: [0, FLARE.tip + 1.6, 0], size: FLARE.halo, color: new Color(C.duskGlow) },
    { p: [0, FLARE.tip + 0.15, 0], size: 1.4, color: new Color(C.duskGlow).lerp(new Color(C.stars), 0.6) },
  ], []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    TIME.value = t;
    const f = still ? 0.8 : flicker(t, seed);
    if (halo.current) halo.current.scale.setScalar(0.85 + 0.3 * f);
    if (lamp.current) lamp.current.intensity = lightIntensity * (0.7 + 0.5 * f);
    warmPool(softDisc()).opacity = 0.22 + 0.16 * f;
  });
  return (
    <group name="flare-stack">
      <mesh geometry={flareGeometry()} material={painted()} />
      <mesh geometry={flatQuad()} material={warmPool(softDisc())} position={[0, 0.05, 0]} scale={[46, 1, 46]} raycast={noRay} renderOrder={1} />
      <mesh geometry={flameGeometry()} material={big} position={[0, FLARE.tip - 0.1, 0]} scale={[FLARE.flameW, FLARE.flameH, 1]} raycast={noRay} renderOrder={4} />
      <mesh geometry={flameGeometry()} material={small} position={[0.1, FLARE.tip, 0]} scale={[FLARE.flameW * 0.6, FLARE.flameH * 0.7, 1]} raycast={noRay} renderOrder={5} />
      <group ref={halo} position={[0, FLARE.tip + 1.6, 0]}>
        <group position={[0, -(FLARE.tip + 1.6), 0]}>
          <Glows items={glows} />
        </group>
      </group>
      {light && <pointLight ref={lamp} color={C.duskGlow} intensity={lightIntensity} distance={lightRange} decay={1.5} position={[0, FLARE.tip + 2, 0]} />}
    </group>
  );
}
