"use client";
// One facility's whole pad at life size, around its local origin (the tank's base; +x east, -z
// north): a 40 m caliche pad lit warm by two light masts, the tank at the middle, the pump house
// and its skid east of it, one pumpjack per well_id 10-17 m out, flowlines from each wellhead to
// the tank, and the transfer lines tank -> pump skid -> house -> off the pad. The judge's
// life-size start (SIZE.standOff south of the tank) is kept clear (pad.ts, unit-tested).
// When the pump failed (tone "alert"), the pumpjacks ease to a stop, the flowlines go still and the
// transfer lines pulse alert. About 20 draw calls (pad 1, tank 5, house/masts 3, lamp glows 1,
// pumpjacks 7, pipes 2; hover and selection add 2).
//
// Selection: pass onSelect/onHover. Every part except the pad disc and the light (glows, cones,
// decals) answers the pointer as this one facility, with stopPropagation. The pad disc never
// answers, so a teleport target or the world's floor under it still gets the ray; pad={false}
// leaves the pad out so the integrator can draw its own (under a TeleportTarget, say).
import { useMemo, type ReactNode } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { CircleGeometry, Color, MeshBasicMaterial } from "three";
import type { SiteFacility } from "@/lib/live";
import { C, SIZE, TONE_COLOR } from "../theme";
import type { TankState } from "../model";
import { furnitureGeometry, HOUSE_LAMP, JACK_LED, mastLamps, SKID_LED, TANK } from "./geometry";
import { padTexture, type V3 } from "./kit";
import { HOUSE, SKID, TRANSFER, flowline, jackSlots, type JackSlot } from "./pad";
import { coneMaterial, lit, painted } from "./shaders";
import { Glows, noRay, type GlowItem } from "./common";
import { Pumpjacks, type JackItem } from "./PumpjackModel";
import { PipeBundle } from "./PipeModel";
import { TankModel } from "./TankModel";

export interface FacilityModelProps {
  facility: SiteFacility;
  state: TankState | undefined;   // from tankStates(); undefined = no data yet (drawn OK)
  fill: number | null;            // the gauge's level 0..1, null = not reported
  faked?: boolean;
  selected?: boolean;
  hovered?: boolean;
  still?: boolean;                // reduced motion / comfort setting
  beacon?: boolean;               // the attack moment's warn beacon on the tank roof
  pad?: boolean;                  // draw the pad disc (default true)
  padLight?: boolean;             // one warm point light over the pad (for the life-size view only:
                                  // each one costs every lit material on screen a light)
  onSelect?(facilityId: string): void;
  onHover?(facilityId: string, on: boolean): void;
  children?: ReactNode;           // anything to ride along in pad space (labels, effects)
}

const LAMP = new Color(C.duskGlow).lerp(new Color(C.stars), 0.6);

let padGeo: CircleGeometry | null = null;
let padMat: MeshBasicMaterial | null = null;
function padParts() {
  padGeo ??= new CircleGeometry(SIZE.padRadius, 64).rotateX(-Math.PI / 2);
  padMat ??= new MeshBasicMaterial({
    map: padTexture(), transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  return { padGeo, padMat };
}

// Where a unit's status lamp sits, in pad meters.
function ledAt(s: JackSlot): V3 {
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  return [s.x + JACK_LED[0] * c + JACK_LED[2] * sn, JACK_LED[1], s.z - JACK_LED[0] * sn + JACK_LED[2] * c];
}

export function FacilityModel({
  facility, state, fill, faked = false, selected = false, hovered = false, still = false, beacon = false, pad = true,
  padLight = false, onSelect, onHover, children,
}: FacilityModelProps) {
  const tone = state?.tone ?? "ok";
  const failed = tone === "alert";          // tankStates: "alert" is only ever PUMP FAILED
  const n = facility.well_ids.length;
  const slots = useMemo(() => jackSlots(n), [n]);
  const jacks = useMemo<JackItem[]>(() => slots.map((s) => ({ x: s.x, z: s.z, yaw: s.yaw, phase: s.phase, running: !failed })), [slots, failed]);
  const flows = useMemo(() => slots.map(flowline), [slots]);
  const furniture = furnitureGeometry();
  const glows = useMemo<GlowItem[]>(() => {
    const out: GlowItem[] = mastLamps().map((m) => ({ p: [m.lamp[0], m.lamp[1] - 0.12, m.lamp[2]] as V3, size: 2.2, color: LAMP }));
    out.push({ p: [HOUSE.x + HOUSE_LAMP[0], HOUSE_LAMP[1], HOUSE.z + HOUSE_LAMP[2]], size: 1.2, color: LAMP });
    out.push({ p: [HOUSE.x + SKID_LED[0], SKID_LED[1], HOUSE.z + SKID_LED[2]], size: 0.4, color: new Color(TONE_COLOR[tone]) });
    const unit = new Color(failed ? C.alert : C.ok);
    for (const s of slots) out.push({ p: ledAt(s), size: 0.45, color: unit });
    return out;
  }, [slots, tone, failed]);

  const id = facility.facility_id;
  const handlers = onSelect || onHover ? {
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect?.(id); },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover?.(id, true); },
    onPointerOut: () => onHover?.(id, false),
  } : {};

  const { padGeo: pg, padMat: pm } = padParts();
  return (
    <group name={`facility:${id}`}>
      {pad && <mesh name={`pad:${id}`} geometry={pg} material={pm} position={[0, 0.02, 0]} raycast={noRay} renderOrder={-2} />}
      <group name={`equipment:${id}`} {...handlers}>
        <TankModel fill={fill} tone={tone} faked={faked} selected={selected} hovered={hovered} still={still} beacon={beacon} shadow={false} />
        <mesh geometry={furniture.solid} material={painted()} />
        <mesh geometry={furniture.lit} material={lit()} />
        <Pumpjacks items={jacks} />
        <PipeBundle paths={flows} flowing={!failed} radius={0.09} dashSpacing={1.8} speed={1.2} />
        <PipeBundle paths={TRANSFER} flowing={!failed} failed={failed} radius={0.14} />
        {/* A generous unseen target round the tank, so a ray from across the pad finds it. */}
        <mesh position={[0, 3.6, 0]} visible={false}>
          <cylinderGeometry args={[TANK.R + 0.8, TANK.R + 0.8, 7.4, 12]} />
          <meshBasicMaterial />
        </mesh>
      </group>
      <mesh geometry={furniture.cones} material={coneMaterial()} raycast={noRay} renderOrder={3} />
      {padLight && <pointLight color={LAMP} intensity={24} distance={48} decay={1.3} position={[-1.5, 11, 6]} />}
      <Glows items={glows} />
      {children}
    </group>
  );
}

// The pump skid's place on the pad, for anything that wants to point at the pump (the attack
// moment, a label).
export const PAD_POINTS = { tank: [0, 0, 0] as V3, pumpSkid: [SKID.x, 0, SKID.z] as V3, house: [HOUSE.x, 0, HOUSE.z] as V3 };
