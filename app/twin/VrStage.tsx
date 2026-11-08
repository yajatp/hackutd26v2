"use client";
// What only the headset shows (the page is not visible in immersive VR):
// - the How to use card, straight ahead over the table in the table view (hidden while the
//   dashboard is open; it fades after 8 s or at the first trigger pull);
// - the selected tank's panel (Panel3D: beside the tank, or in front of the judge in Walk);
// - the menu dock (Table, Overview, Walk, Dashboard, Reset) on the table's near rim (under the
//   hands elsewhere), and the dashboard;
// - the attack moment's toast, sliding in front of the judge;
// - the thumbstick: one push, one 30 degree snap turn (the table turns in the table view; the
//   judge turns in the overview and Walk views).
// All in Permian Night's holo glass (docs/TWIN-THEME.md), from theme.ts.
import { useEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import type { Group, MeshBasicMaterial } from "three";
import type { PlacedTank, TankState } from "./model";
import { C, TONE_COLOR } from "./theme";
import { facing, HOW_TO, snapTurn, TABLE_TOP_Y, turnAxis } from "./stage";
import { usePainted, type Painter } from "./nav/glass";
import { corners, dot, glass, rgba, text } from "./nav/paint";
import { Dashboard, Dock, useView, type SiteTransform } from "./nav";
import { Toast, type FxNotice } from "./fx";
import { noRay } from "./models";
import { Panel3D } from "./Panel3D";
import { BackButton3D, MapStage, useEntry } from "./usmap";
import { SecurityAlert3D } from "./darkroom/Alert3D";

// Each controller's thumbstick: one sideways push past the threshold is one step (stage.ts snapTurn,
// turnAxis: a mostly forward push is the Walk view's teleport aim, not a turn); it fires again only
// after the stick comes back. Raw gamepad axes, so any controller layout works.
function SnapTurn({ onTurn }: { onTurn(dir: 1 | -1): void }) {
  const armed = useRef(new WeakMap<XRInputSource, boolean>());
  useFrame((state, _dt, frame?: XRFrame) => {
    const session = frame?.session ?? state.gl.xr.getSession();
    if (!session) return;
    for (const src of session.inputSources) {
      if (!src.gamepad || src.hand) continue;
      const r = snapTurn(turnAxis(src.gamepad.axes), armed.current.get(src) ?? true);
      armed.current.set(src, r.armed);
      if (r.step !== 0) onTurn(r.step);
    }
  });
  return null;
}

const HOW_W = 0.78, HOW_PPM = 1300;
const howPainter: Painter<{ v: 1 }, null> = {
  size: () => ({ w: HOW_W * HOW_PPM, h: 0.4 * HOW_PPM }),
  paint(ctx, _s, W, H) {
    glass(ctx, 3, 3, W - 6, H - 6, { r: 26, edge: C.holo, edgeAlpha: 0.9, edgePx: 3, glowPx: 16, tintAlpha: 0.2 });
    corners(ctx, 3, 3, W - 6, H - 6, 30, rgba(C.holo, 0.95), 4, 12);
    const x = 44;
    text(ctx, "NIGHT SHIFT · HOW TO USE", x, 58, { size: 30, weight: 700, color: C.holo, spacing: 5, glow: 8 });
    text(ctx, "Point at a tank and pull the trigger.", x, 128, { size: 50, weight: 700, color: C.text });
    text(ctx, "Its story opens beside it, in the console's words.", x, 184, { size: 34, face: "body", weight: 500, color: C.textDim });
    text(ctx, "Thumbstick turns the site. The menu on the table's edge:", x, 244, { size: 34, face: "body", weight: 500, color: C.textDim });
    text(ctx, "Table · Overview · Walk · Dashboard", x, 294, { size: 38, weight: 700, color: C.text, spacing: 1 });
    let lx = x + 6;
    const items: [string, string][] = [[TONE_COLOR.alert, "Pump failed"], [TONE_COLOR.warn, "Check the sensor"], [TONE_COLOR.ok, "OK"], [C.holo, "Top problem"]];
    for (const [c, label] of items) {
      dot(ctx, lx, 368, 9, c);
      lx += 24 + text(ctx, label, lx + 20, 368, { size: 30, weight: 600, color: C.text }) + 40;
    }
    return null;
  },
};

// The welcome card stays HOW_TO_MS after entering VR, or until the judge's first trigger pull or
// pinch, then fades out (HOW_TO_FADE_MS) and stays gone for the session.
const HOW_TO_MS = 8000;
const HOW_TO_FADE_MS = 700;

function HowTo({ still }: { still: boolean }) {
  const tex = usePainted(howPainter, { v: 1 });
  const session = useXR((x) => x.session);
  const mat = useRef<MeshBasicMaterial>(null);
  const group = useRef<Group>(null);
  const k = useRef({ born: -1, goneAt: -1 });
  useEffect(() => {
    if (!session) return;
    k.current = { born: performance.now(), goneAt: -1 };
    const dismiss = () => { if (k.current.goneAt < 0) k.current.goneAt = performance.now(); };
    session.addEventListener("selectstart", dismiss);
    return () => session.removeEventListener("selectstart", dismiss);
  }, [session]);
  useFrame(() => {
    const st = k.current, now = performance.now();
    if (st.born < 0) return;
    if (st.goneAt < 0 && now - st.born > HOW_TO_MS) st.goneAt = now;
    const a = st.goneAt < 0 ? 1 : still ? 0 : Math.max(0, 1 - (now - st.goneAt) / HOW_TO_FADE_MS);
    if (mat.current) mat.current.opacity = a;
    if (group.current) group.current.visible = a > 0.001;
  });
  if (!tex) return null;
  return (
    <group ref={group} position={HOW_TO.at} rotation-y={facing(HOW_TO.at)} name="twin-vr-howto">
      <mesh raycast={noRay} renderOrder={6}>
        <planeGeometry args={[HOW_W, (HOW_W * tex.h) / tex.w]} />
        <meshBasicMaterial ref={mat} map={tex.texture} transparent depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}

// The dock at the table: on the near rim (stage.ts NEAR_EDGE_M is 0.45 m), 0.12 m over the table
// top for a judge whose eyes are about 1.6 m up, its face pitched 35 degrees back from upright.
const DOCK_TABLE = { aheadM: 0.35, downM: 1.6 - (TABLE_TOP_Y + 0.12), tilt: -(35 * Math.PI) / 180 } as const;

export function VrStage({ s, t, tanks, root, notices, still, onSelect, onTurn, onReset }: {
  s: TankState | null;
  t: SiteTransform;
  tanks: PlacedTank[];
  root: RefObject<Group | null>;
  notices: FxNotice[];
  still: boolean;
  onSelect(id: string | null): void;
  onTurn(dir: 1 | -1): void;
  onReset(): void;
}) {
  const session = useXR((x) => x.session);
  const { mode, dashboard, setMode } = useView();
  const entry = useEntry();
  // The entry map (usmap/): on the page and in the headset, in place of the site's cards and dock.
  if (entry?.atMap) return <MapStage sites={entry.sites} session={session} onPick={entry.pick} />;
  const table = mode === "table";
  const back = entry && table ? <BackButton3D onBack={entry.back} site={entry.site ?? ""} onDarkroom={entry.room?.enter} /> : null;
  if (!session) return back;
  // The security alert (darkroom/): in front of the judge once per new attack signal.
  const alert = entry?.room?.alert?.visible ? entry.room : null;
  return (
    <>
      {back}
      {alert && <SecurityAlert3D key={alert.alert!.line} line={alert.alert!.line} onEnter={alert.enter} onDismiss={alert.dismiss} />}
      {table && !dashboard && <HowTo still={still} />}
      {/* The dashboard takes the space in front: the panel steps out while it is open. */}
      <Panel3D s={dashboard ? null : s} t={t} tanks={tanks} root={root} still={still} onClose={() => onSelect(null)} onWalk={(id) => setMode("ground", id)} />
      {/* At the table the dock is a console on the table's near rim: 0.35 m ahead, about 0.12 m
          over the table top, pitched up toward the judge, so it never covers the miniature;
          elsewhere where the theme puts it (0.9 m ahead, 0.45 m under the eyes). */}
      <Dock onReset={onReset} still={still} aheadM={table ? DOCK_TABLE.aheadM : 0.9} downM={table ? DOCK_TABLE.downM : 0.45}
        tilt={table ? DOCK_TABLE.tilt : undefined} />
      <Dashboard still={still} />
      <Toast events={notices} still={still} />
      <SnapTurn onTurn={onTurn} />
    </>
  );
}
