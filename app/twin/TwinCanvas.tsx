"use client";
// The tabletop model: a round table about 1.6 m across holding the site (1 m on its longest
// side), one disk per system, one tank per facility at its lat/lon. A tank's color is its state
// and its inner fill is the level when an alert reports it. The tabletop and everything on it
// is one group that turns (thumbstick in VR); the stand, the floor and the VR cards do not.
// On a screen the labels are page DOM (Labels.tsx), moved to their 3D anchors every frame.
// In immersive VR the page is not visible, so the same words are drawn into the scene instead.
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Billboard, OrbitControls } from "@react-three/drei";
import { XR, useXR, type XRStore } from "@react-three/xr";
import { DoubleSide, Vector3, type Group, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from "three";
import {
  LABEL_PAD_M, LABEL_ROW_M, labelRows, labelSize, NEUTRAL_FILL,
  type Cluster, type PlacedTank, type TankState, type Tone,
} from "./model";
import {
  LINE_HEX, MODEL_CENTER, SNAP_RAD, TABLE_TOP_Y, TANK_H, TANK_R, TONE_HEX, toWorld, TURNTABLE_R, type P3,
} from "./stage";
import { CanvasCard, type TextRow } from "./CanvasText";
import { systemKey, tankKey, type Anchors } from "./Labels";
import { VrStage } from "./VrStage";

const NEUTRAL_HEX = "#71717a";          // fill drawn when no alert reports the level
const LABEL_PX_PER_M = 2000;
const LABEL_FONT_PX = Math.floor((LABEL_ROW_M * LABEL_PX_PER_M) / 1.3);   // CanvasCard row pitch is 1.3 font sizes
const RANK: Record<Tone, number> = { alert: 3, warn: 2, ok: 1 };

export interface TwinCanvasProps {
  store: XRStore;
  tanks: PlacedTank[];
  clusters: Cluster[];
  states: Map<string, TankState>;
  lifts: Map<string, number>;         // how far each VR label floats above its tank (labelLifts)
  selected: string | null;
  top: string | null;                 // the console's top tank: highlighted so the first look lands on it
  turn: number;                       // model rotation, in 30 degree steps
  viewKey: number;                    // changes when the 2D camera should go back to its start
  onSelect(id: string): void;
  onTurn(dir: 1 | -1): void;
  onReset(): void;
  anchors: Anchors;
}

// The page's DOM labels follow their 3D anchors. Each frame, labels are placed most important
// first (selected, then red, amber, OK; nearer before farther) and a label that would cover one
// already placed moves up, with a thin stem down to its tank.
interface LabelPoint { key: string; at: P3; rank: number; free?: boolean }

function Projector({ points, anchors }: { points: LabelPoint[]; anchors: Anchors }) {
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const items: { p: LabelPoint; el: HTMLElement; chip: HTMLElement | null; stem: HTMLElement | null; x: number; y: number; hidden: boolean }[] = [];
    for (const p of points) {
      const el = anchors.get(p.key);
      if (!el) continue;
      v.set(p.at[0], p.at[1], p.at[2]).project(camera);
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
      let bottom = it.y;
      if (!it.p.free && !it.hidden && it.chip) {
        const w = it.chip.offsetWidth, h = it.chip.offsetHeight;
        const l = it.x - w / 2, r = it.x + w / 2;
        for (let moved = true, n = 0; moved && n < 40; n++) {
          moved = false;
          for (const q of placed) {
            if (l < q.r && r > q.l && bottom - h < q.b && bottom > q.t) {
              bottom = q.t - 2;
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

function Tank({ t, s, lift, on, top, inXR, onSelect }: {
  t: PlacedTank; s: TankState; lift: number; on: boolean; top: boolean; inXR: boolean; onSelect(id: string): void;
}) {
  const [hover, setHover] = useState(false);
  const body = useRef<Group>(null);
  const shellMat = useRef<MeshStandardMaterial>(null);
  const rimMat = useRef<MeshStandardMaterial>(null);
  const beacon = useRef<Mesh>(null);
  const color = TONE_HEX[s.tone];
  const shell = s.sensor ? TONE_HEX[s.sensor] : color;
  const pulse = s.sensor !== null;      // a dead, drifting or lying sensor on this facility
  const level = s.fill ?? NEUTRAL_FILL;
  const h = Math.max(0.002, level * TANK_H * 0.98);

  useFrame(({ clock }) => {
    const k = (Math.sin(clock.elapsedTime * 6) + 1) / 2;          // 0..1, about once a second
    if (body.current) {
      const g = pulse ? 1 + 0.16 * k : 1;
      body.current.scale.set(g, 1, g);
    }
    if (shellMat.current) shellMat.current.opacity = pulse ? 0.25 + 0.45 * k : 0.3;
    if (rimMat.current) rimMat.current.emissiveIntensity = pulse ? 0.3 + 1.5 * k : s.tone === "ok" ? 0 : 0.6;
    if (beacon.current) {
      const b = (clock.elapsedTime % 1.6) / 1.6;                     // an expanding ring, every 1.6 s
      beacon.current.scale.setScalar(1 + 1.4 * b);
      (beacon.current.material as MeshBasicMaterial).opacity = 0.9 * (1 - b);
    }
  });

  const pick = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(s.facility_id); };
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHover(true);
    if (!inXR) document.body.style.cursor = "pointer";
  };
  const out = () => { setHover(false); document.body.style.cursor = ""; };

  const size = labelSize(s);
  const rows: TextRow[] = labelRows(s).map((r) => r.tone === "name"
    ? { text: r.text, color: "#e4e4e7", size: LABEL_FONT_PX }
    : { text: r.text, color: LINE_HEX[r.tone], size: LABEL_FONT_PX, bold: true });
  const labelY = TANK_H + 0.012 + lift;

  return (
    <group position={[t.x, 0, t.z]} onClick={pick} onPointerOver={over} onPointerOut={out}>
      <group ref={body}>
        <mesh position={[0, TANK_H / 2, 0]}>
          <cylinderGeometry args={[TANK_R, TANK_R, TANK_H, 32, 1, true]} />
          <meshStandardMaterial ref={shellMat} color={shell} transparent opacity={0.3} depthWrite={false} side={DoubleSide} />
        </mesh>
        <mesh position={[0, TANK_H, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[TANK_R, 0.0024, 8, 32]} />
          <meshStandardMaterial ref={rimMat} color={shell} emissive={shell} />
        </mesh>
        <mesh position={[0, h / 2, 0]}>
          <cylinderGeometry args={[TANK_R * 0.86, TANK_R * 0.86, h, 32]} />
          <meshStandardMaterial color={s.fill === null ? NEUTRAL_HEX : color} emissive={color} emissiveIntensity={s.fill === null || s.tone === "ok" ? 0 : 0.35} />
        </mesh>
      </group>
      {/* A larger, see-through target, so a first-time user's ray finds the tank easily. */}
      <mesh position={[0, TANK_H / 2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, TANK_H + 0.04, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {top && (
        <mesh ref={beacon} position={[0, 0.005, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[TANK_R * 1.9, TANK_R * 2.3, 48]} />
          <meshBasicMaterial color="#ffffff" transparent depthWrite={false} />
        </mesh>
      )}
      {(on || hover) && (
        <mesh position={[0, 0.004, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[TANK_R * 1.3, TANK_R * (on ? 1.75 : 1.5), 40]} />
          <meshBasicMaterial color={on ? "#ffffff" : "#7dd3fc"} />
        </mesh>
      )}
      {inXR && (
        <>
          {lift > 0 && (
            <mesh position={[0, TANK_H + (labelY - TANK_H) / 2, 0]}>
              <boxGeometry args={[0.0025, labelY - TANK_H, 0.0025]} />
              <meshBasicMaterial color="#a1a1aa" />
            </mesh>
          )}
          <group position={[0, labelY, 0]}>
            <Billboard>
              <CanvasCard
                rows={rows} worldWidth={size.w} worldHeight={size.h} pxPerM={LABEL_PX_PER_M} padM={LABEL_PAD_M}
                anchor="bottom" border={on || top || hover ? "#ffffff" : s.tone === "ok" ? "#52525b" : shell}
              />
            </Billboard>
          </group>
        </>
      )}
    </group>
  );
}

function SystemDisk({ c, inXR }: { c: Cluster; inXR: boolean }) {
  return (
    <group position={[c.x, 0, c.z]}>
      <mesh position={[0, 0.0015, 0]}>
        <cylinderGeometry args={[c.r, c.r, 0.003, 48]} />
        <meshStandardMaterial color="#3a3e46" />
      </mesh>
      {inXR && (
        <Billboard position={[0, 0.03, c.r]}>
          <CanvasCard rows={[{ text: c.system_id, color: "#e4e4e7", size: 64, bold: true }]} worldWidth={0.07} pxPerM={2000} padM={0.004} />
        </Billboard>
      )}
    </group>
  );
}

// The turning part: tabletop, north marker, systems, tanks and their VR labels.
function Model({ tanks, clusters, states, lifts, selected, top, turn, onSelect }: Pick<TwinCanvasProps,
  "tanks" | "clusters" | "states" | "lifts" | "selected" | "top" | "turn" | "onSelect">) {
  const inXR = useXR((x) => x.session != null);
  return (
    <group position={MODEL_CENTER} rotation-y={turn * SNAP_RAD}>
      <mesh position={[0, -0.015, 0]}>
        <cylinderGeometry args={[TURNTABLE_R, TURNTABLE_R, 0.03, 96]} />
        <meshStandardMaterial color="#25272c" />
      </mesh>
      <mesh position={[0, -0.015, 0]}>
        <torusGeometry args={[TURNTABLE_R, 0.006, 8, 96]} />
        <meshStandardMaterial color="#52525b" />
      </mesh>
      {/* North: the table turns, so the site's north stays marked. */}
      <mesh position={[0, 0.012, -TURNTABLE_R + 0.05]} rotation-x={-Math.PI / 2}>
        <coneGeometry args={[0.022, 0.05, 3]} />
        <meshStandardMaterial color="#d4d4d8" />
      </mesh>
      <Billboard position={[0, 0.06, -TURNTABLE_R + 0.05]}>
        <CanvasCard rows={[{ text: "N", color: "#ffffff", size: 70, bold: true }]} worldWidth={0.05} pxPerM={2000} padM={0.003} />
      </Billboard>
      {clusters.map((c) => <SystemDisk key={c.system_id} c={c} inXR={inXR} />)}
      {tanks.map((t) => {
        const s = states.get(t.facility_id);
        return s ? (
          <Tank key={t.facility_id} t={t} s={s} lift={lifts.get(t.facility_id) ?? 0}
            on={selected === t.facility_id} top={top === t.facility_id} inXR={inXR} onSelect={onSelect} />
        ) : null;
      })}
    </group>
  );
}

// The stand under the turntable and the floor. They do not turn.
function Room() {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[3, 64]} />
        <meshStandardMaterial color="#141519" />
      </mesh>
      <mesh position={[MODEL_CENTER[0], 0.01, MODEL_CENTER[2]]}>
        <cylinderGeometry args={[0.3, 0.34, 0.02, 48]} />
        <meshStandardMaterial color="#1c1d21" />
      </mesh>
      <mesh position={[MODEL_CENTER[0], (TABLE_TOP_Y - 0.03) / 2, MODEL_CENTER[2]]}>
        <cylinderGeometry args={[0.07, 0.09, TABLE_TOP_Y - 0.03, 32]} />
        <meshStandardMaterial color="#1c1d21" />
      </mesh>
    </>
  );
}

// 2D only: drag turns the view around the model, scroll zooms. The camera starts (and comes back,
// on Reset view) looking down at the table from the judge's side, farther back on narrow screens.
function Controls2D({ viewKey }: { viewKey: number }) {
  const inXR = useXR((x) => x.session != null);
  const camera = useThree((s) => s.camera);
  const { width, height } = useThree((s) => s.size);
  const ref = useRef<ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    if (inXR) return;
    const k = Math.min(2.4, Math.max(1, 1.3 / (width / Math.max(1, height))));
    camera.position.set(MODEL_CENTER[0], MODEL_CENTER[1] + 1.1 * k, MODEL_CENTER[2] + 1.3 * k);
    camera.lookAt(MODEL_CENTER[0], MODEL_CENTER[1], MODEL_CENTER[2]);
    ref.current?.target.set(MODEL_CENTER[0], MODEL_CENTER[1], MODEL_CENTER[2]);
    ref.current?.update();
  }, [viewKey, inXR, camera, width, height]);
  if (inXR) return null;
  return (
    <OrbitControls ref={ref} makeDefault target={MODEL_CENTER} enableDamping enablePan={false}
      minDistance={0.4} maxDistance={4.5} maxPolarAngle={Math.PI / 2.1} />
  );
}

function Labels2D({ tanks, clusters, states, selected, top, turn, anchors }: Pick<TwinCanvasProps,
  "tanks" | "clusters" | "states" | "selected" | "top" | "turn" | "anchors">) {
  const inXR = useXR((x) => x.session != null);
  const points = useMemo<LabelPoint[]>(() => {
    const a = turn * SNAP_RAD;
    return [
      ...tanks.map((t) => {
        const tone = states.get(t.facility_id)?.tone ?? "ok";
        const rank = t.facility_id === selected ? 5 : t.facility_id === top ? 4 : RANK[tone];
        return { key: tankKey(t.facility_id), at: toWorld(t.x, TANK_H + 0.006, t.z, a), rank };
      }),
      ...clusters.map((c) => ({ key: systemKey(c.system_id), at: toWorld(c.x, 0.003, c.z + c.r, a), rank: 0, free: true })),
    ];
  }, [tanks, clusters, states, selected, top, turn]);
  if (inXR) return null;
  return <Projector points={points} anchors={anchors} />;
}

export default function TwinCanvas({ store, viewKey, onTurn, onReset, ...rest }: TwinCanvasProps) {
  const picked = rest.selected ? rest.states.get(rest.selected) ?? null : null;
  return (
    <Canvas camera={{ position: [0, 1.9, 0.06], fov: 45, near: 0.01, far: 40 }} dpr={[1, 2]}>
      <color attach="background" args={["#0f1013"]} />
      <XR store={store}>
        <ambientLight intensity={0.7} />
        <hemisphereLight args={["#ffffff", "#222222", 0.6]} />
        <directionalLight position={[1, 3, 2]} intensity={1.3} />
        <Room />
        <Model {...rest} />
        <VrStage s={picked} onReset={onReset} onTurn={onTurn} />
        <Controls2D viewKey={viewKey} />
        <Labels2D {...rest} />
      </XR>
    </Canvas>
  );
}
