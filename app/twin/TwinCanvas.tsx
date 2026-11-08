"use client";
// The scene of /twin in Permian Night (docs/TWIN-THEME.md): the World (sky, moon, stars, desert,
// mesas, far rigs) behind everything, and the site in the view the judge picked (nav ViewContext):
// - table: the holographic ops table (HoloTable) at waist height with the site as a glowing
//   miniature on it; the thumbstick turns the table (eased 250 ms);
// - overview: the same miniature 14 m wide on the desert floor, knee-high tanks around the judge;
// - Walk: one facility's pad at life size, the rest as lights on the horizon.
// The site root (plan.ts) is the group that turns in the table view; in the overview and Walk the
// thumbstick turns the judge (the XR origin) instead, a plain snap turn.
// On a screen the labels are page DOM (Labels.tsx) moved to their 3D anchors every frame, and the
// camera orbits with the mouse; in the headset the words are drawn in the scene (Labels3D,
// VrStage) and the menu and dashboard float by the hands.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { XR, useXR, type XRStore } from "@react-three/xr";
import { Vector3, type Camera, type Group, type PerspectiveCamera, type Scene, type WebGLRenderer } from "three";
import type { SiteFacility } from "@/lib/live";
import type { Cluster, PlacedTank, TankState, Tone } from "./model";
import { MODEL_CENTER, SNAP_RAD } from "./stage";
import { easeTurn, TURN_MS, turnGoal } from "./look";
import { systemKey, tankKey, type Anchors } from "./Labels";
import { camera2D, groundPlaces, useView, ViewFade, ViewOrigin, type SiteTransform } from "./nav";
import { groundHeight, World, type XZ as WorldXZ } from "./world";
import { FacilityModel, jackSlots, TANK } from "./models";
import type { FxNotice } from "./fx";
import { HoloTable, newPool } from "./HoloTable";
import { GroundSite, MiniSite, PadLamp } from "./Site";
import { Labels3D } from "./Labels3D";
import { VrStage } from "./VrStage";
import { StrobeLight } from "./fx/SiteEvents";
import { Ambience } from "./fx/Ambience";
import { BACKDROP, groundMarkers, groundSystem, siteRoot, sitePos, type V3 } from "./plan";

const RANK: Record<Tone, number> = { alert: 3, warn: 2, ok: 1 };
const LEAD_PX = 14;                      // a screen label sits this far above its anchor, on a stem
const AIM_Z = 0.12;                      // the 2D table camera aims this far in front of the table's middle
const FOV = { table: 45, overview: 55, ground: 60 } as const;
// The overview's lamp posts sit close to each pad (its neighbours are only about a metre away).
const OVERVIEW_POSTS: readonly WorldXZ[] = [[-5.5, -4.5], [5.5, 3.5]];

const NO_POSTS: readonly WorldXZ[] = [];
const noHit = () => {};

// A real facility at life size, out on the desert in the table view: scenery only (it never takes
// the pointer ray), lit by its own masts.
function Backdrop({ facility, s, still }: { facility: SiteFacility; s: TankState | undefined; still: boolean }) {
  const g = useRef<Group>(null);
  useLayoutEffect(() => { g.current?.traverse((o) => { o.raycast = noHit; }); });
  return (
    <group ref={g} name="twin-backdrop" position={BACKDROP.at} rotation-y={BACKDROP.yaw}>
      <FacilityModel facility={facility} state={s} fill={s?.fill ?? null} still={still} />
    </group>
  );
}

// The 2D table camera's start: up and back from the table, farther on narrow screens. The table is
// the hero here (the headset shows the sky all round).
function cameraStart(width: number, height: number) {
  const k = Math.min(2.4, Math.max(1, 1.3 / (width / Math.max(1, height))));
  return { up: 1.15 * k, back: 1.45 * k };
}

export interface TwinCanvasProps {
  store: XRStore;
  facilities: SiteFacility[];
  tanks: PlacedTank[];
  clusters: Cluster[];
  states: Map<string, TankState>;
  lifts: Map<string, number>;         // how far each VR label floats above its tank (labelLifts)
  labelled: Set<string>;              // tanks that carry a label now (look.ts visibleLabels)
  faked: ReadonlySet<string>;         // tanks whose sensor reads SIMULATED (fx fakedIds)
  waves: Readonly<Record<string, number>>;   // the attack moment's shockwave counter per facility
  notices: FxNotice[];                // the attack moment's toasts (headset)
  selected: string | null;
  hovered: string | null;
  top: string | null;                 // the console's top tank
  turn: number;                       // snap turn, in 30 degree steps
  viewKey: number;                    // changes when the 2D camera should go back to its start
  still: boolean;                     // prefers-reduced-motion or the menu's comfort setting
  locked?: boolean;                   // LOCKDOWN is active (the pad's lights fade to red in Walk)
  onSelect(id: string | null): void;
  onHover(id: string, on: boolean): void;
  onTurn(dir: 1 | -1): void;
  onReset(): void;
  anchors: Anchors;
}

// The page's DOM labels follow their 3D anchors (points in the site root's frame), read through
// the root's transform so they ride along with the table's eased turn. Placed most important first
// (selected, top, red, amber, OK; nearer first); one that would cover a placed label moves up, its
// stem growing to match. Anchors with no point this view are hidden.
interface LabelPoint { key: string; at: V3; rank: number; free?: boolean }

function Projector({ root, points, anchors }: { root: RefObject<Group | null>; points: LabelPoint[]; anchors: Anchors }) {
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const g = root.current;
    if (!g) return;
    g.updateWorldMatrix(true, false);
    const keys = new Set(points.map((p) => p.key));
    for (const [k, el] of anchors) if (!keys.has(k)) el.style.visibility = "hidden";
    const items: { p: LabelPoint; el: HTMLElement; chip: HTMLElement | null; stem: HTMLElement | null; x: number; y: number; hidden: boolean }[] = [];
    for (const p of points) {
      const el = anchors.get(p.key);
      if (!el) continue;
      v.set(p.at[0], p.at[1], p.at[2]).applyMatrix4(g.matrixWorld).project(camera);
      items.push({
        p, el,
        chip: el.firstElementChild as HTMLElement | null,
        stem: el.querySelector<HTMLElement>("[data-stem]"),
        x: ((v.x + 1) / 2) * size.width,
        y: ((1 - v.y) / 2) * size.height,
        hidden: v.z < -1 || v.z > 1,
      });
    }
    items.sort((a, b) => b.p.rank - a.p.rank || b.y - a.y);
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    for (const it of items) {
      let bottom = it.p.free ? it.y : it.y - LEAD_PX;
      if (!it.p.free && !it.hidden && it.chip) {
        const w = it.chip.offsetWidth, h = it.chip.offsetHeight;
        const l = it.x - w / 2, r = it.x + w / 2;
        for (let moved = true, n = 0; moved && n < 40; n++) {
          moved = false;
          for (const q of placed) {
            if (l < q.r && r > q.l && bottom - h < q.b && bottom > q.t) {
              bottom = q.t - 3;
              moved = true;
            }
          }
        }
        placed.push({ l, r, t: bottom - h, b: bottom });
      }
      it.el.style.visibility = it.hidden ? "hidden" : "visible";
      it.el.style.transform = `translate3d(${it.x}px, ${bottom}px, 0)`;
      if (it.stem) it.stem.style.height = `${Math.max(0, it.y - bottom)}px`;
    }
  });
  return null;
}

function Labels2D({ root, t, tanks, clusters, states, selected, top, anchors }: {
  root: RefObject<Group | null>; t: SiteTransform; tanks: PlacedTank[]; clusters: Cluster[]; states: Map<string, TankState>;
  selected: string | null; top: string | null; anchors: Anchors;
}) {
  const inXR = useXR((x) => x.session != null);
  const points = useMemo<LabelPoint[]>(() => {
    const rank = (id: string) => (id === selected ? 5 : id === top ? 4 : RANK[states.get(id)?.tone ?? "ok"]);
    if (t.mode === "ground") {
      const out: LabelPoint[] = [];
      if (t.focus) out.push({ key: tankKey(t.focus), at: [0, TANK.railY + 0.6, 0], rank: rank(t.focus) });
      for (const m of groundMarkers(t, tanks)) out.push({ key: tankKey(m.facility_id), at: m.at, rank: rank(m.facility_id) });
      return out;
    }
    const roof = (TANK.railY + 0.4) * t.modelScale;
    return [
      ...tanks.map((x) => {
        const p = sitePos(t, x);
        return { key: tankKey(x.facility_id), at: [p[0], roof, p[2]] as V3, rank: rank(x.facility_id) };
      }),
      ...clusters.map((c) => {
        const p = sitePos(t, c);
        return { key: systemKey(c.system_id), at: [p[0], 0.002, p[2] + c.r * t.scale] as V3, rank: 0, free: true };
      }),
    ];
  }, [t, tanks, clusters, states, selected, top]);
  if (inXR) return null;
  return <Projector root={root} points={points} anchors={anchors} />;
}

// 2D only: drag turns the view, scroll zooms. Each view has its own start (and Reset view brings
// it back): the table from the judge's side, the overview from up behind the judge's spot, Walk
// from the judge's eyes on the pad. The switch happens while the view is faded out.
function Controls2D({ t, viewKey }: { t: SiteTransform; viewKey: number }) {
  const inXR = useXR((x) => x.session != null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const { width, height } = useThree((s) => s.size);
  const ref = useRef<ComponentRef<typeof OrbitControls>>(null);
  const mode = t.mode;
  const start = useMemo(() => {
    const c = camera2D(t);
    if (c) return c;
    const { up, back } = cameraStart(width, height);
    return {
      position: [MODEL_CENTER[0], MODEL_CENTER[1] + up, MODEL_CENTER[2] + back] as V3,
      target: [MODEL_CENTER[0], MODEL_CENTER[1], MODEL_CENTER[2] + AIM_Z] as V3,
    };
  }, [t, width, height]);
  useEffect(() => {
    if (inXR) return;
    camera.fov = FOV[mode];
    camera.updateProjectionMatrix();
    camera.position.set(...start.position);
    camera.lookAt(...start.target);
    ref.current?.target.set(...start.target);
    ref.current?.update();
  }, [viewKey, inXR, camera, start, mode]);
  if (inXR) return null;
  const limits = mode === "table"
    ? { minDistance: 0.4, maxDistance: 4.5 }
    : mode === "overview" ? { minDistance: 2, maxDistance: 34 } : { minDistance: 2.5, maxDistance: 60 };
  return (
    <OrbitControls ref={ref} makeDefault target={start.target} enableDamping dampingFactor={0.08} enablePan={false}
      rotateSpeed={0.6} maxPolarAngle={Math.PI / 2.08} {...limits} />
  );
}

// The site root's turn in the table view: each 30 degree step eases over 250 ms (snaps when
// still), taking the nearest way round. The other views keep the root still.
function useTableTurn(root: RefObject<Group | null>, turn: number, table: boolean, still: boolean) {
  const anim = useRef({ from: 0, to: 0, t0: 0, angle: 0 });
  const goal = table ? turn : 0;
  useEffect(() => {
    const a = anim.current;
    a.from = a.angle;
    a.to = turnGoal(a.angle, goal);
    a.t0 = performance.now();
  }, [goal]);
  useFrame(() => {
    const a = anim.current;
    a.angle = easeTurn(a.from, a.to, performance.now() - a.t0, still || !table ? 0 : TURN_MS);
    if (root.current) root.current.rotation.y = a.angle;
  });
}

function TwinScene(props: Omit<TwinCanvasProps, "store">) {
  const { facilities, tanks, clusters, states, lifts, labelled, faked, waves, notices, selected, hovered, top, turn, viewKey, still,
    onSelect, onHover, onTurn, onReset, anchors, locked = false } = props;
  const { mode, transform: t } = useView();
  const inXR = useXR((x) => x.session != null);
  const root = useRef<Group>(null);
  const [pool] = useState(newPool);
  useTableTurn(root, turn, mode === "table", still);
  // The overview and Walk: the thumbstick turns the judge (right turns right).
  const originYaw = mode === "table" ? 0 : -turn * SNAP_RAD;

  // Lamp posts and ground pools: at each pad in the overview, and on the horizon in Walk (the pad
  // the judge stands on has its own masts and lamp).
  const pads = useMemo<WorldXZ[]>(() => {
    if (mode === "overview") return tanks.map((x) => { const p = sitePos(t, x); return [p[0], p[2]] as WorldXZ; });
    if (mode === "ground") return groundPlaces(t, tanks).filter((g) => g.facility_id !== t.focus).map((g) => [g.at[0], g.at[2]] as WorldXZ);
    return [];
  }, [mode, t, tanks]);
  // The table view's backdrop: one real facility at life size out on the desert (plan.ts
  // BACKDROP), so the miniature stands inside the field it models. A healthy one with the most
  // wells, so its pumpjacks nod.
  const backdrop = useMemo(() => {
    const ok = facilities.filter((f) => states.get(f.facility_id)?.tone === "ok");
    const pool = ok.length > 0 ? ok : facilities;
    return [...pool].sort((a, b) => b.well_ids.length - a.well_ids.length)[0] ?? null;
  }, [facilities, states]);
  const tablePads = useMemo<WorldXZ[]>(() => [[BACKDROP.at[0], BACKDROP.at[2]]], []);
  const picked = selected ? states.get(selected) ?? null : null;
  // The site's sound (fx/Ambience): the focus pad's units and its system's flare in Walk.
  const sound = useMemo(() => {
    const f = mode === "ground" ? facilities.find((x) => x.facility_id === t.focus) : undefined;
    const jacks = f ? jackSlots(f.well_ids.length).map((j) => ({ x: j.x, z: j.z, phase: j.phase })) : [];
    const sys = mode === "ground" ? groundSystem(t, clusters, tanks, groundHeight) : null;
    return { jacks, flare: sys ? sys.flare : null };
  }, [mode, facilities, t, clusters, tanks]);
  const focusFailed = mode === "ground" && !!t.focus && states.get(t.focus)?.tone === "alert";
  const siteProps = { t, facilities, tanks, clusters, states, selected, hovered, top, faked, waves, still, inXR, originYaw, locked, onSelect, onHover };

  return (
    <>
      <ViewOrigin yaw={originYaw} />
      <World mode={mode} pads={mode === "table" ? tablePads : pads} padScale={mode === "overview" ? t.modelScale : 1} still={still} maxRealLights={1}
        posts={mode === "overview" ? OVERVIEW_POSTS : mode === "table" ? NO_POSTS : undefined} />
      {mode === "table" && backdrop && (
        <Backdrop facility={backdrop} s={states.get(backdrop.facility_id)} still={still} />
      )}
      <PadLamp on={mode === "ground"} locked={locked} still={still} />
      <group ref={root} name="site-root" position={siteRoot(t)}>
        {mode === "table" && (
          <HoloTable root={root} pool={pool} tanks={tanks} clusters={clusters} top={top} hovered={hovered} still={still} inXR={inXR}
            onEmptyClick={() => onSelect(null)} />
        )}
        {mode === "ground" ? <GroundSite {...siteProps} /> : <MiniSite {...siteProps} />}
        {/* Always mounted (the light count never changes): lit only in Walk when the pad's pump failed. */}
        <StrobeLight on={focusFailed} still={still} />
        {inXR && (
          <Labels3D t={t} tanks={tanks} states={states} labelled={labelled} lifts={lifts} faked={faked} selected={selected} top={top}
            still={still} onSelect={onSelect} onHover={onHover} />
        )}
      </group>
      <VrStage s={picked} t={t} tanks={tanks} root={root} notices={notices} still={still} onSelect={onSelect} onTurn={onTurn} onReset={onReset} />
      <Ambience walk={mode === "ground"} jacks={sound.jacks} running={!focusFailed} flare={sound.flare} />
      <ViewFade />
      <Controls2D t={t} viewKey={viewKey} />
      <Labels2D root={root} t={t} tanks={tanks} clusters={clusters} states={states} selected={selected} top={top} anchors={anchors} />
    </>
  );
}

declare global {
  interface Window { __twin?: { gl: WebGLRenderer; scene: Scene; camera: Camera } }
}

export default function TwinCanvas({ store, ...rest }: TwinCanvasProps) {
  return (
    <Canvas
      flat dpr={[1, 1.5]} camera={{ position: [0, 1.9, 0.06], fov: FOV.table, near: 0.01, far: 40 }}
      onPointerMissed={() => rest.onSelect(null)}
      // Development only: lets a check script read renderer.info (draw calls) and find tanks on screen.
      onCreated={({ gl, scene, camera }) => { if (process.env.NODE_ENV !== "production") window.__twin = { gl, scene, camera }; }}
    >
      <XR store={store}>
        <TwinScene {...rest} />
      </XR>
    </Canvas>
  );
}
