"use client";
// The light the models were tuned under ("Permian Night"): a violet sky over warm caliche, a cool
// moon high in the north-west and the last dusk low in the west. Two lights in all, so it stays
// cheap on the Quest. The world may use its own; this is the reference.
import { useMemo } from "react";
import { Color } from "three";
import { C } from "../theme";

export function NightLights({ scale = 1 }: { scale?: number }) {
  const sky = useMemo(() => new Color(C.skyMid).lerp(new Color(C.holo), 0.18).lerp(new Color(C.stars), 0.25), []);
  const ground = useMemo(() => new Color(C.groundLit), []);
  const moon = useMemo(() => new Color(C.stars).lerp(new Color(C.holo), 0.12), []);
  return (
    <>
      <hemisphereLight args={[sky, ground, 1.25 * scale]} />
      <directionalLight color={moon} intensity={1.25 * scale} position={[-40, 70, -30]} />
      <directionalLight color={C.duskGlow} intensity={1.5 * scale} position={[-90, 8, 10]} />
    </>
  );
}
