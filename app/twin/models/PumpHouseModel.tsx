"use client";
// The pump house at its own origin (door to +z): a ribbed steel shed with a gable roof, a blue
// door under a warm lamp, a lit window, and its pump skid on the west side (pump, coupling,
// motor, the discharge into the house and a control panel with a holo screen). 3 draw calls.
// FacilityModel draws the same shapes as part of the pad's shared furniture instead.
import { useMemo } from "react";
import { Color } from "three";
import { C, TONE_COLOR } from "../theme";
import type { Tone } from "../model";
import { HOUSE_LAMP, SKID_LED, houseGeometry } from "./geometry";
import { lit, painted } from "./shaders";
import { Glows, type GlowItem } from "./common";

export function PumpHouseModel({ tone = "ok" }: { tone?: Tone }) {
  const { solid, lit: litGeo } = houseGeometry();
  const glows = useMemo<GlowItem[]>(() => [
    { p: HOUSE_LAMP, size: 1.1, color: new Color(C.duskGlow).lerp(new Color(C.stars), 0.6) },
    { p: SKID_LED, size: 0.32, color: new Color(TONE_COLOR[tone]) },
  ], [tone]);
  return (
    <group name="pump-house">
      <mesh geometry={solid} material={painted()} />
      <mesh geometry={litGeo} material={lit()} />
      <Glows items={glows} />
    </group>
  );
}
