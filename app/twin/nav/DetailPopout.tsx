"use client";
// The column detail pop-out: the Health pop-out's pattern (health/Popout.tsx) on the dashboard's
// LEFT edge, so Health (right) and one column's detail (left) never overlap. Its own plane and one
// canvas texture; it grows out of its hinge over about 300 ms (eased out), turned toward the judge
// like a second monitor, with a hairline bracket in the gap and a close X. One detail at a time.
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh, type Group, type MeshBasicMaterial } from "three";
import { C } from "../theme";
import { usePainted, type Painter } from "./glass";
import { NO_HIT, usePress } from "./follow";
import { BOARD, ease } from "./motion";
import { POPOUT, popoutPose } from "../health/geom";
import { DETAIL_M, DETAIL_TEX, paintDetail, type DetailMeta, type DetailSpec } from "./detail";
import type { Rect } from "./columns";

const PPM = DETAIL_TEX.w / DETAIL_M.w;
const PANEL_RAYCAST = Mesh.prototype.raycast;

const painter: Painter<DetailSpec, DetailMeta> = {
  size: () => DETAIL_TEX,
  paint: (ctx, s, w, h) => paintDetail(ctx, s, w, h),
};

function toM(r: Rect) {
  return { x: (r.x + r.w / 2 - DETAIL_TEX.w / 2) / PPM, y: (DETAIL_TEX.h / 2 - (r.y + r.h / 2)) / PPM, w: r.w / PPM, h: r.h / PPM };
}

function Spot({ name, r, still, onPress }: { name: string; r: Rect; still: boolean; onPress(): void }) {
  const { state, handlers } = usePress(onPress);
  const mat = useRef<MeshBasicMaterial>(null);
  const k = useRef(0);
  useFrame((_, dt) => {
    k.current = ease(k.current, state.current.hover ? 1 : 0, Math.min(dt, 0.1) * 1000, still ? 0 : 140);
    if (mat.current) mat.current.opacity = 0.08 * k.current;
  });
  const m = toM(r);
  return (
    <group position={[m.x, m.y, 0.002]}>
      <mesh raycast={NO_HIT} renderOrder={7}>
        <planeGeometry args={[m.w, m.h]} />
        <meshBasicMaterial ref={mat} color={C.text} transparent opacity={0} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <mesh {...handlers} name={name}>
        <planeGeometry args={[m.w, m.h]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  );
}

// `spec` is null while closed; the last open detail stays painted while the panel folds away.
// `onSpot` gets the spot's name: "walk", "sim:<kind>", "goto:<facility>", "more", "prev", "next".
export function DetailPopout({ open, spec, still, onClose, onSpot }: { open: boolean; spec: DetailSpec | null; still: boolean; onClose(): void; onSpot(name: string): void }) {
  const [kept, setKept] = useState<DetailSpec | null>(spec);
  if (spec && spec !== kept) setKept(spec);
  const panel = usePainted(painter, kept ?? EMPTY);
  const grow = useRef<Group>(null);
  const root = useRef<Group>(null);
  const bracket = useRef<Group>(null);
  const mat = useRef<MeshBasicMaterial>(null);
  const k = useRef(0);
  useFrame((_, dt) => {
    k.current = ease(k.current, open ? 1 : 0, Math.min(dt, 0.1) * 1000, still ? 0 : POPOUT.ms);
    if (!open && k.current < 0.01) k.current = 0;
    if (open && k.current > 0.995) k.current = 1;
    const pose = popoutPose(k.current);
    if (root.current) root.current.visible = k.current > 0;
    if (grow.current) {
      grow.current.position.x = -pose.slideM;
      grow.current.scale.set(pose.sx, pose.sy, 1);
    }
    if (bracket.current) bracket.current.scale.set(1, pose.bracket, 1);
    if (mat.current) mat.current.opacity = pose.alpha;
  });
  const meta = panel?.meta;
  const hinge = -(BOARD.wM / 2 + POPOUT.gapM);
  const armY = BOARD.hM / 2 - POPOUT.armInsetM;
  return (
    <group ref={root} visible={false}>
      <group ref={bracket} position={[-(BOARD.wM / 2 + POPOUT.gapM / 2), 0, 0]}>
        {[armY, -armY].map((y) => (
          <mesh key={y} position={[0, y, 0]} raycast={NO_HIT} renderOrder={3}>
            <planeGeometry args={[POPOUT.gapM + 0.012, POPOUT.lineM]} />
            <meshBasicMaterial color={C.grey1} toneMapped={false} fog={false} />
          </mesh>
        ))}
        <mesh raycast={NO_HIT} renderOrder={3}>
          <planeGeometry args={[POPOUT.lineM, 2 * armY]} />
          <meshBasicMaterial color={C.grey1} toneMapped={false} fog={false} />
        </mesh>
      </group>
      {/* The hinge on the dashboard's left edge: the panel turns toward the judge from it. */}
      <group position={[hinge, 0, 0]} rotation={[0, POPOUT.angle, 0]}>
        <group ref={grow}>
          <group position={[-DETAIL_M.w / 2, 0, 0]}>
            {panel && (
              <mesh renderOrder={6} onClick={(e) => e.stopPropagation()} raycast={open ? PANEL_RAYCAST : NO_HIT} name="nav-detail-panel">
                <planeGeometry args={[DETAIL_M.w, DETAIL_M.h]} />
                <meshBasicMaterial ref={mat} map={panel.texture} transparent opacity={0} depthWrite={false} toneMapped={false} fog={false} />
              </mesh>
            )}
            {meta && open && (
              <>
                <Spot name="nav-detail-close" r={meta.close} still={still} onPress={onClose} />
                {meta.spots.map((x) => (
                  <Spot key={x.name} name={`nav-detail-${x.name}`} r={x.r} still={still} onPress={() => onSpot(x.name)} />
                ))}
              </>
            )}
          </group>
        </group>
      </group>
    </group>
  );
}

const EMPTY: DetailSpec = {
  kind: "pump", card: null, cardIndex: 0, cardCount: 0, level: null, rate: null, sim: null, sims: [], insight: null,
  rows: [], pageIndex: 0, pageCount: 1, here: null, sensors: [],
};
