"use client";
// The menu dock: five big holo-glass buttons,
// Table, Overview, Walk, Dashboard, Reset, floating 0.45 m under the judge's eyes and 0.9 m ahead,
// tilted to face them. It follows the judge's yaw lazily (catches up past 40 degrees, eased).
// Pointing lifts a button toward the judge and lights its glow; pulling the trigger sinks it and
// flashes. The buttons pop in one after another when the dock appears.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { useAvonConsole } from "@/lib/live";
import { shortName } from "../model";
import { C } from "../theme";
import { glowTexture, usePainted, type Painter } from "./glass";
import { corners, dot, ellipsize, fitSize, glass, icon, rgba, scanlines, text } from "./paint";
import { DOCK, DOCK_BUTTON, DOCK_BUTTONS, dockLayout, ease, stagger, type DockId } from "./motion";
import { NO_HIT, useFollowHead, usePress } from "./follow";
import { useStill, useView } from "./ViewContext";

const PPM = 2400;                        // texture px per meter on the dock
const PAD_M = 0.012;                     // room around a button for its edge glow
const RAIL_PAD_M = 0.02;
const TITLE_M = 0.036;                   // the rail's title strip
const RAIL = {
  w: DOCK_BUTTONS.length * DOCK_BUTTON.wM + (DOCK_BUTTONS.length - 1) * DOCK_BUTTON.gapM + 2 * RAIL_PAD_M,
  h: DOCK_BUTTON.hM + TITLE_M + 2 * 0.011,
};
const BUTTON_Y = -RAIL.h / 2 + 0.011 + DOCK_BUTTON.hM / 2;

interface ButtonSpec { id: DockId; label: string; active: boolean }

const buttonPainter: Painter<ButtonSpec, null> = {
  size: () => ({ w: (DOCK_BUTTON.wM + 2 * PAD_M) * PPM, h: (DOCK_BUTTON.hM + 2 * PAD_M) * PPM }),
  paint(ctx, s, W, H) {
    const p = PAD_M * PPM, w = W - 2 * p, h = H - 2 * p, r = h * 0.2;
    if (s.active) {
      glass(ctx, p, p, w, h, { r, fill: C.holo, fillAlpha: 0.95, edge: C.text, edgeAlpha: 0.85, edgePx: 4, glowPx: p * 0.9 });
    } else {
      glass(ctx, p, p, w, h, { r, edge: C.line, edgeAlpha: 1, edgePx: 2 });
      corners(ctx, p, p, w, h, h * 0.13, rgba(C.holo, 0.9), 3, 7);
    }
    const ink = s.active ? C.skyZenith : C.holo;
    icon(ctx, s.id, W / 2, p + h * 0.36, h * 0.34, ink);
    const style = { size: 50, weight: 700 as const, face: "label" as const, color: s.active ? C.skyZenith : C.text, align: "center" as const };
    const size = fitSize(ctx, s.label, w * 0.86, style, 30);
    text(ctx, ellipsize(ctx, s.label, w * 0.86, { ...style, size }), W / 2, p + h * 0.76, { ...style, size });
    return null;
  },
};

interface RailSpec { view: string; status: string; live: boolean }

const railPainter: Painter<RailSpec, null> = {
  size: () => ({ w: RAIL.w * PPM, h: RAIL.h * PPM }),
  paint(ctx, s, W, H) {
    glass(ctx, 2, 2, W - 4, H - 4, { r: H * 0.16, edge: C.holoDim, edgeAlpha: 0.9, edgePx: 3, tintAlpha: 0.1 });
    scanlines(ctx, 8, 8, W - 16, H - 16, 6, rgba(C.holo, 0.035));
    const ty = (TITLE_M / 2 + 0.006) * PPM, x0 = RAIL_PAD_M * PPM;
    // AVON mark: a small diamond, then the name.
    ctx.save();
    ctx.translate(x0 + 14, ty);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = C.holo;
    ctx.shadowColor = C.holo;
    ctx.shadowBlur = 0;
    ctx.fillRect(-9, -9, 18, 18);
    ctx.restore();
    const w = text(ctx, "BRINE", x0 + 38, ty, { size: 44, weight: 700, color: C.holo, spacing: 6, glow: 8 });
    const nw = text(ctx, "NIGHT SHIFT", x0 + 38 + w + 22, ty, { size: 44, weight: 600, color: C.textDim, spacing: 5 });
    const right = W - x0;
    const sw = text(ctx, s.status, right, ty, { size: 44, weight: 600, color: s.live ? C.ok : C.alert, align: "right", spacing: 3 });
    dot(ctx, right - sw - 22, ty, 8, s.live ? C.ok : C.alert);
    // The view's name fills the room between NIGHT SHIFT and the status, never over either: it
    // shrinks, then ends in an ellipsis (Walk on a long pad name).
    const room = right - sw - 52 - (x0 + 38 + w + 22 + nw + 36);
    const vs = { size: 44, weight: 700 as const, color: C.text, align: "right" as const, spacing: 4 };
    const size = fitSize(ctx, s.view, room, vs, 30);
    text(ctx, ellipsize(ctx, s.view, room, { ...vs, size }), right - sw - 52, ty, { ...vs, size });
    return null;
  },
};

function DockButton({ id, label, x, active, index, born, still, onPress }: {
  id: DockId; label: string; x: number; active: boolean; index: number; born: { current: number }; still: boolean; onPress(): void;
}) {
  const face = usePainted(buttonPainter, { id, label, active });
  const glowTex = useMemo(() => glowTexture(256, 200, 40, 34), []);
  const root = useRef<Group>(null);
  const glowMat = useRef<MeshBasicMaterial>(null);
  const glowMesh = useRef<Mesh>(null);
  const flash = useRef<Mesh>(null);
  const flashMat = useRef<MeshBasicMaterial>(null);
  const { state, handlers } = usePress(onPress);
  const k = useRef({ hover: 0, down: 0 });
  const W = DOCK_BUTTON.wM + 2 * PAD_M, H = DOCK_BUTTON.hM + 2 * PAD_M;

  useFrame((_, dt) => {
    const ms = Math.min(dt, 0.1) * 1000, s = state.current, now = performance.now();
    k.current.hover = ease(k.current.hover, s.hover ? 1 : 0, ms, still ? 0 : 140);
    k.current.down = ease(k.current.down, s.down ? 1 : 0, ms, still ? 0 : 60);
    const { hover, down } = k.current;
    const pop = still || born.current < 0 ? 1 : stagger(now - born.current, index);
    const g = root.current;
    if (g) {
      g.visible = pop > 0.001;
      g.position.set(x, BUTTON_Y + 0.004 * hover, 0.006 + 0.016 * hover - 0.01 * down);
      g.scale.setScalar((0.55 + 0.45 * pop) * (1 + 0.05 * hover - 0.07 * down));
    }
    const breathe = active && !still ? 0.5 + 0.5 * Math.sin(now / 700) : 0.5;
    if (glowMat.current) glowMat.current.opacity = Math.min(1, (active ? 0.3 + 0.15 * breathe : 0.06) + 1.0 * hover + 0.3 * down) * pop;
    // An idle button's faint glow is not worth a draw call per eye on the Quest: drawn when it shows.
    if (glowMesh.current && glowMat.current) glowMesh.current.visible = glowMat.current.opacity > 0.08;
    const t = s.flashAt < 0 ? 1 : (now - s.flashAt) / 380;
    if (flash.current && flashMat.current) {
      flash.current.visible = t < 1 && !still;
      flash.current.scale.setScalar(1 + 0.45 * t);
      flashMat.current.opacity = 0.9 * (1 - t) * (1 - t);
    }
  });

  if (!face) return null;
  return (
    <group ref={root} visible={false}>
      <mesh ref={glowMesh} position={[0, 0, -0.004]} raycast={NO_HIT} scale={[1.42, 1.55, 1]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial ref={glowMat} map={glowTex} color={C.holo} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <mesh ref={flash} position={[0, 0, -0.002]} raycast={NO_HIT} visible={false}>
        <planeGeometry args={[W * 1.3, H * 1.3]} />
        <meshBasicMaterial ref={flashMat} map={glowTex} color={C.text} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <mesh {...handlers} renderOrder={3} name={`nav-dock-${id}`}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial map={face.texture} transparent depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}

const VIEW_WORD = { table: "TABLE VIEW", overview: "OVERVIEW", ground: "WALK" } as const;

// `onReset` also runs on Reset (e.g. put the model's snap turn back to north). `still` defaults to
// useStill() (prefers-reduced-motion or the menu's comfort setting): the dock then jumps, no easing.
export function Dock({ onReset, still: stillProp, aheadM = DOCK.aheadM, downM = DOCK.downM, tilt }: {
  onReset?(): void; still?: boolean; aheadM?: number; downM?: number;
  tilt?: number;                         // rotation.x; default faces the eyes
}) {
  const autoStill = useStill();
  const still = stillProp ?? autoStill;
  const { mode, focus, setMode, dashboard, setDashboard, toggleDashboard } = useView();
  const { status, facilities } = useAvonConsole();
  const root = useRef<Group>(null);
  const born = useRef(-1);
  useFollowHead(root, { aheadM, downM, tilt: tilt ?? -Math.atan2(downM, aheadM), followDeg: DOCK.followDeg, still });
  useFrame(() => { if (born.current < 0) born.current = performance.now(); });
  const rail = usePainted(railPainter, {
    view: mode === "ground" && focus ? `${VIEW_WORD.ground} · ${shortOf(focus, facilities)}` : VIEW_WORD[mode],
    status: status === "connected" ? "LIVE" : status === "connecting" ? "CONNECTING" : "OFFLINE",
    live: status === "connected",
  });
  const xs = dockLayout();
  const press = (id: DockId) => {
    if (id === "dashboard") toggleDashboard();
    else if (id === "reset") { setDashboard(false); setMode("table"); onReset?.(); }
    else setMode(id);
  };
  return (
    <group ref={root}>
      {rail && (
        <mesh position={[0, 0, -0.008]} raycast={NO_HIT} renderOrder={2}>
          <planeGeometry args={[RAIL.w, RAIL.h]} />
          <meshBasicMaterial map={rail.texture} transparent depthWrite={false} toneMapped={false} fog={false} />
        </mesh>
      )}
      {DOCK_BUTTONS.map((b, i) => (
        <DockButton
          key={b.id} id={b.id} label={b.label} x={xs[i]} index={i} born={born} still={still}
          active={b.id === "dashboard" ? dashboard : b.id === mode}
          onPress={() => press(b.id)}
        />
      ))}
    </group>
  );
}

function shortOf(id: string, facilities: { facility_id: string; system_id: string }[]): string {
  const f = facilities.find((x) => x.facility_id === id);
  return f ? shortName(f.facility_id, f.system_id) : id;
}
