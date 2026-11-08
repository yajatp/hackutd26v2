"use client";
// The Health pop-out: a second panel that opens out of the dashboard's right edge, like a second
// monitor turned a little toward the judge, with the /insight "Rate in vs rate out" charts. It has
// its own plane and one canvas texture (no meshes per point). Opening, it grows and slides out of
// the dashboard's edge over about 300 ms (eased out); closing, it folds back into that edge. A
// hairline bracket joins the two panels. The dashboard itself does not change.
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh, type Group, type MeshBasicMaterial } from "three";
import { C } from "../theme";
import { usePainted, type Painter } from "../nav/glass";
import { NO_HIT, usePress } from "../nav/follow";
import { BOARD, ease } from "../nav/motion";
import { HEALTH_TEX, paintHealthPanel, type HealthPanelMeta, type HealthSpec } from "./paint";
import { POPOUT, popoutPose, type Box } from "./geom";

const PPM = HEALTH_TEX.w / POPOUT.wM;
const PANEL_RAYCAST = Mesh.prototype.raycast;

const painter: Painter<HealthSpec, HealthPanelMeta> = {
  size: () => HEALTH_TEX,
  paint: (ctx, s, w, h) => paintHealthPanel(ctx, s, w, h),
};

// px rect on the pop-out texture -> center and size in meters, origin at the panel's middle.
function toM(r: Box) {
  return { x: (r.x + r.w / 2 - HEALTH_TEX.w / 2) / PPM, y: (HEALTH_TEX.h / 2 - (r.y + r.h / 2)) / PPM, w: r.w / PPM, h: r.h / PPM };
}

function Spot({ name, r, still, onPress }: { name: string; r: Box; still: boolean; onPress(): void }) {
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

// `spec` is null while closed; the last open page stays painted while the panel folds away.
export function HealthPopout({ open, spec, still, onClose, onPage }: { open: boolean; spec: HealthSpec | null; still: boolean; onClose(): void; onPage(d: number): void }) {
  const [kept, setKept] = useState<HealthSpec | null>(spec);
  if (spec && spec !== kept) setKept(spec);
  const panel = usePainted(painter, kept ?? EMPTY);
  const root = useRef<Group>(null);
  const grow = useRef<Group>(null);
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
      grow.current.position.x = pose.slideM;
      grow.current.scale.set(pose.sx, pose.sy, 1);
    }
    if (bracket.current) bracket.current.scale.set(1, pose.bracket, 1);
    if (mat.current) mat.current.opacity = pose.alpha;
  });
  const meta = panel?.meta;
  const hinge = BOARD.wM / 2 + POPOUT.gapM;
  const armY = BOARD.hM / 2 - POPOUT.armInsetM;
  return (
    <group ref={root} visible={false}>
      {/* The bracket in the gap: a hairline up the gap and an arm to each panel at top and bottom. */}
      <group ref={bracket} position={[BOARD.wM / 2 + POPOUT.gapM / 2, 0, 0]}>
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
      {/* The hinge on the dashboard's right edge: the panel turns toward the judge from it. */}
      <group position={[hinge, 0, 0]} rotation={[0, -POPOUT.angle, 0]}>
        <group ref={grow}>
          <group position={[POPOUT.wM / 2, 0, 0]}>
            {panel && (
              <mesh renderOrder={6} onClick={(e) => e.stopPropagation()} raycast={open ? PANEL_RAYCAST : NO_HIT} name="nav-health-panel">
                <planeGeometry args={[POPOUT.wM, POPOUT.hM]} />
                <meshBasicMaterial ref={mat} map={panel.texture} transparent opacity={0} depthWrite={false} toneMapped={false} fog={false} />
              </mesh>
            )}
            {meta && open && (
              <>
                <Spot name="nav-health-close" r={meta.close} still={still} onPress={onClose} />
                {meta.prev && <Spot name="nav-health-prev" r={meta.prev} still={still} onPress={() => onPage(-1)} />}
                {meta.next && <Spot name="nav-health-next" r={meta.next} still={still} onPress={() => onPage(1)} />}
              </>
            )}
          </group>
        </group>
      </group>
    </group>
  );
}

const EMPTY: HealthSpec = { items: [], max: 1, shutdownPct: 92, pageIndex: 0, pageCount: 1, total: 0 };
