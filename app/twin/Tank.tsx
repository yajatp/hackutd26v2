"use client";
// One tank on the table: a smooth frosted shell, the level fill inside it, and a thin line at the
// lid. OK tanks are matte dust; a red or amber tank also has a thin glowing ring at its base. The
// console's top problem has a thin moonlight ring that breathes once every 2.4 s. Pointing at a
// tank lifts it 6 mm and rings its base in moonlight; its label appears (in VR, drawn in the scene;
// on a screen, the page's DOM label). A tank whose sensor Phone 1 is faking flickers on the /vr
// glitch cadence, and its VR label breaks up.
import { useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { DoubleSide, type Group, type MeshBasicMaterial, type MeshStandardMaterial } from "three";
import { glitchFrame } from "@/app/vr/field";
import { LABEL_PAD_M, labelRows, labelSize, NEUTRAL_FILL, type PlacedTank, type TankState } from "./model";
import { LINE_HEX, TANK_H, TANK_R, TONE_HEX } from "./stage";
import { approach, DUST, HOVER_LIFT_M, HOVER_MS, MOON, TABLE_INK, topRingPulse } from "./look";
import { CanvasCard, type TextRow } from "./CanvasText";

const SEGMENTS = 32;
const LABEL_PX_PER_M = 2000;
const LABEL_FONT_PX = 36;                // 1.8 cm letters
const LABEL_GAP_M = 0.022;               // label bottom above the lid, with a stem
const HIT_R = 0.032;
const HIT_ABOVE_M = 0.012;
const MOAT_M = 0.0022;                   // a band of table night either side of a moonlight ring,
                                         // so the ring still reads inside the bright light pool

// A thin moonlight ring lying on the table, on a slightly wider band of the table's night.
function Ring({ r, w, y, moonRef }: { r: number; w: number; y: number; moonRef?: React.Ref<MeshBasicMaterial> }) {
  return (
    <>
      <mesh position={[0, y, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[r - MOAT_M, r + w + MOAT_M, 64]} />
        <meshBasicMaterial color={TABLE_INK} />
      </mesh>
      <mesh position={[0, y + 0.0002, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[r, r + w, 64]} />
        <meshBasicMaterial ref={moonRef} color={MOON} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
}

function flicker(frame: number): number {
  const h = Math.sin(frame * 91.7) * 43758.5453;
  return h - Math.floor(h);
}

export function Tank({ t, s, lift, on, top, hovered, faked, labelled, inXR, still, onSelect, onHover }: {
  t: PlacedTank; s: TankState; lift: number; on: boolean; top: boolean; hovered: boolean; faked: boolean;
  labelled: boolean; inXR: boolean; still: boolean; onSelect(id: string): void; onHover(id: string, on: boolean): void;
}) {
  const body = useRef<Group>(null);
  const fillMat = useRef<MeshStandardMaterial>(null);
  const shellMat = useRef<MeshStandardMaterial>(null);
  const ring = useRef<Group>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const raised = useRef(0);
  const color = TONE_HEX[s.tone];
  const problem = s.tone !== "ok";
  const level = s.fill ?? NEUTRAL_FILL;
  const h = Math.max(0.002, level * TANK_H * 0.97);
  const fillColor = s.fill === null ? DUST : color;
  const glow = !problem ? 0.06 : s.fill === null ? 0.12 : 0.5;
  const shellOpacity = problem ? 0.3 : 0.22;

  useFrame((state, dt) => {
    raised.current = approach(raised.current, hovered || on ? HOVER_LIFT_M : 0, Math.min(dt, 0.1) * 1000, still ? 0 : HOVER_MS);
    if (body.current) body.current.position.y = raised.current;
    const f = faked && !still ? glitchFrame(state.clock.elapsedTime * 1000, false) : null;
    if (fillMat.current) fillMat.current.emissiveIntensity = f === null ? glow : 0.05 + 1.6 * flicker(f);
    if (shellMat.current) shellMat.current.opacity = f === null ? shellOpacity : 0.12 + 0.4 * flicker(f + 7);
    if (ring.current) {
      const p = topRingPulse(state.clock.elapsedTime, still);
      ring.current.scale.setScalar(1 + 0.08 * p);
      if (ringMat.current) ringMat.current.opacity = 1 - 0.55 * p;
    }
  });

  const pick = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(s.facility_id); };
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(s.facility_id, true);
    if (!inXR) document.body.style.cursor = "pointer";
  };
  const out = () => { onHover(s.facility_id, false); document.body.style.cursor = ""; };

  const rows: TextRow[] = labelRows(s).map((r) => r.tone === "name"
    ? { text: r.text, color: MOON, size: LABEL_FONT_PX, face: "head", weight: 600 }
    : { text: r.text, color: LINE_HEX[r.tone], size: LABEL_FONT_PX, face: "head", weight: 600 });
  const labelY = TANK_H + LABEL_GAP_M + lift;

  return (
    <group name={`tank:${s.facility_id}`} position={[t.x, 0, t.z]} onClick={pick} onPointerOver={over} onPointerOut={out}>
      <group ref={body}>
        <mesh position={[0, TANK_H / 2, 0]}>
          <cylinderGeometry args={[TANK_R, TANK_R, TANK_H, SEGMENTS, 1, true]} />
          <meshStandardMaterial ref={shellMat} color={problem ? color : DUST} roughness={0.6} metalness={0}
            transparent opacity={shellOpacity} depthWrite={false} side={DoubleSide} forceSinglePass />
        </mesh>
        <mesh position={[0, TANK_H, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[TANK_R, 0.0011, 6, SEGMENTS]} />
          <meshBasicMaterial color={problem ? color : hovered || on ? MOON : DUST} toneMapped={false} />
        </mesh>
        <mesh position={[0, h / 2, 0]}>
          <cylinderGeometry args={[TANK_R * 0.84, TANK_R * 0.84, h, SEGMENTS]} />
          <meshStandardMaterial ref={fillMat} color={fillColor} emissive={fillColor} emissiveIntensity={glow} roughness={0.6} metalness={0} />
        </mesh>
        {inXR && labelled && (
          <>
            <mesh position={[0, (TANK_H + labelY) / 2, 0]}>
              <boxGeometry args={[0.0012, labelY - TANK_H, 0.0012]} />
              <meshBasicMaterial color={MOON} toneMapped={false} />
            </mesh>
            <group position={[0, labelY, 0]}>
              <Billboard>
                <CanvasCard
                  rows={rows} worldWidth={labelSize(s).w} pxPerM={LABEL_PX_PER_M} padM={LABEL_PAD_M} fit
                  anchor="bottom" align="left" border={on ? MOON : null} glitch={faked} still={still}
                />
              </Billboard>
            </group>
          </>
        )}
      </group>
      {/* A larger, unseen target, so a first-time user's ray finds the tank easily. Its radius is
          under half the closest gap between two tanks on the seeded site (6.9 cm), so it never
          takes the pointer from the neighbour the judge is actually pointing at. */}
      <mesh position={[0, (TANK_H + HIT_ABOVE_M) / 2, 0]} visible={false}>
        <cylinderGeometry args={[HIT_R, HIT_R, TANK_H + HIT_ABOVE_M, 16]} />
        <meshBasicMaterial />
      </mesh>
      {problem && (
        <mesh position={[0, 0.0012, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[TANK_R * 1.28, TANK_R * 1.28 + 0.0022, 48]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      )}
      {(hovered || on) && <Ring r={TANK_R * 1.6} w={on ? 0.0028 : 0.0018} y={0.0014} />}
      {top && (
        <group ref={ring}>
          <Ring r={TANK_R * 2.35} w={0.0018} y={0.0018} moonRef={ringMat} />
        </group>
      )}
    </group>
  );
}
