"use client";
// Small shared pieces for the models: the one clock every animated material reads, lamp glows as
// one instanced draw call, and a raycast that ignores light (glows, cones, decals), so pointing at
// a light cone in the air does not select a facility.
import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Matrix4, type InstancedMesh } from "three";
import { billboardQuad } from "./geometry";
import { glowMaterial, TIME } from "./shaders";
import type { V3 } from "./kit";

export const noRay = () => null;

// Any model that animates a shader calls this; they all set the same shared clock.
export function useModelClock() {
  useFrame(({ clock }) => { TIME.value = clock.elapsedTime; });
}

export interface GlowItem { p: V3; size: number; color: Color }

const m = new Matrix4();

// Round glows that face the eye: size in meters, color per glow. One draw call for all of them.
export function Glows({ items }: { items: GlowItem[] }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((g, i) => {
      m.makeScale(g.size, g.size, g.size).setPosition(g.p[0], g.p[1], g.p[2]);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, g.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items]);
  useModelClock();
  if (items.length === 0) return null;
  return (
    <instancedMesh key={items.length} ref={ref} args={[billboardQuad(), glowMaterial(), items.length]}
      raycast={noRay} frustumCulled={false} renderOrder={3} />
  );
}
