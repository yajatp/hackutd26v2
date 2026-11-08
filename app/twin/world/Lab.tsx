"use client";
// The World on its own, for looking at it on a screen: /twin/lab/world. A plain canvas, an orbit
// view, a toggle for each view mode, a few camera presets and a draw-call readout. The grey tank
// and table are stand-ins for scale only (hide them with ?bare=1); the real models are another
// part's work. Query: ?mode=table|overview|ground &cam=front|dusk|moon|up|back &still=1 &bare=1 &fov=70
import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Color, type Camera, type Scene, type WebGLRenderer } from "three";
import { C, FONT, SIZE, VIEW, type ViewMode } from "../theme";
import { World } from "./World";
import { dirFrom, DUSK_AZ_DEG, MOON_AZ_DEG } from "./sky";
import type { XZ } from "./terrain";

type Cam = "front" | "dusk" | "moon" | "up" | "back";
const MODES: ViewMode[] = ["table", "overview", "ground"];
const CAMS: Cam[] = ["front", "dusk", "moon", "up", "back"];

const EYE: Record<ViewMode, [number, number, number]> = {
  table: [0, 1.6, 0.2],
  overview: [0, 1.6, 9],
  ground: [0, 1.6, SIZE.standOff],
};
const FRONT: Record<ViewMode, [number, number, number]> = {
  table: [0, 0.8, -0.95],
  overview: [0, 0.2, -1],
  ground: [0, 3.2, 0],
};
const OVERVIEW_SCALE = 1 / 12;
const PADS: Record<ViewMode, readonly XZ[]> = {
  table: [],
  overview: [[-5, -4], [3, -6.5], [6, 1.5], [-2.5, 3]],
  ground: [[0, 0], [-260, -430], [390, -310], [540, 190], [-480, 120], [120, -620]],
};

function lookAt(mode: ViewMode, cam: Cam): [number, number, number] {
  if (cam === "front") return FRONT[mode];
  const [az, el] = cam === "dusk" ? [DUSK_AZ_DEG + 8, 5] : cam === "moon" ? [MOON_AZ_DEG - 6, 26] : cam === "up" ? [20, 58] : [180, 6];
  const d = dirFrom(az, el), e = EYE[mode];
  return [e[0] + d[0], e[1] + d[1], e[2] + d[2]];
}

declare global {
  interface Window { __worldLab?: { gl: WebGLRenderer; scene: Scene; camera: Camera } }
}

function Rig({ mode, cam }: { mode: ViewMode; cam: Cam }) {
  const camera = useThree((s) => s.camera);
  const ref = useRef<ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    const e = EYE[mode], t = lookAt(mode, cam);
    camera.position.set(...e);
    camera.lookAt(...t);
    ref.current?.target.set(...t);
    ref.current?.update();
  }, [camera, mode, cam]);
  return <OrbitControls ref={ref} makeDefault enableDamping dampingFactor={0.08} rotateSpeed={0.5} maxDistance={60} />;
}

function Readout({ out }: { out: RefObject<HTMLSpanElement | null> }) {
  const n = useRef(0);
  useFrame(({ gl }) => {
    if (++n.current % 15 !== 0 || !out.current) return;
    const r = gl.info.render;
    out.current.textContent = `${r.calls} draw calls · ${(r.triangles / 1000).toFixed(1)}k triangles`;
  });
  return null;
}

// Stand-ins for scale only: a life-size tank on the walk pad, knee-high tanks in the overview,
// the round table in the table view.
function StandIns({ mode }: { mode: ViewMode }) {
  const steel = useMemo(() => new Color(C.steel), []);
  if (mode === "ground") {
    return (
      <mesh position={[0, SIZE.tankHeight / 2, 0]}>
        <cylinderGeometry args={[SIZE.tankDiameter / 2, SIZE.tankDiameter / 2, SIZE.tankHeight, 24]} />
        <meshLambertMaterial color={steel} />
      </mesh>
    );
  }
  if (mode === "overview") {
    return (
      <>
        {PADS.overview.map(([x, z]) => (
          <mesh key={`${x},${z}`} position={[x, (SIZE.tankHeight * OVERVIEW_SCALE) / 2, z]}>
            <cylinderGeometry args={[(SIZE.tankDiameter / 2) * OVERVIEW_SCALE, (SIZE.tankDiameter / 2) * OVERVIEW_SCALE, SIZE.tankHeight * OVERVIEW_SCALE, 16]} />
            <meshLambertMaterial color={steel} />
          </mesh>
        ))}
      </>
    );
  }
  return (
    <group position={[0, 0, -0.95]}>
      <mesh position={[0, 0.39, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 0.78, 16]} />
        <meshLambertMaterial color={new Color(C.ground)} />
      </mesh>
      <mesh position={[0, 0.79, 0]}>
        <cylinderGeometry args={[0.78, 0.78, 0.03, 48]} />
        <meshBasicMaterial color={new Color(C.holoDim)} />
      </mesh>
    </group>
  );
}

function param<T extends string>(q: URLSearchParams, key: string, allowed: readonly T[], fallback: T): T {
  const v = q.get(key);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export default function Lab() {
  const q = useMemo(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search), []);
  const [mode, setMode] = useState<ViewMode>(() => param(q, "mode", MODES, "ground"));
  const [cam, setCam] = useState<Cam>(() => param(q, "cam", CAMS, "front"));
  const [still, setStill] = useState(() => q.get("still") === "1");
  const bare = q.get("bare") === "1";
  const fov = Number(q.get("fov")) || 70;
  const out = useRef<HTMLSpanElement>(null);
  const button = (on: boolean) => ({
    minHeight: 44, padding: "0 16px", borderRadius: 10, cursor: "pointer",
    font: `600 15px ${FONT.label}`, letterSpacing: "0.04em",
    color: on ? C.skyZenith : C.text, background: on ? C.holo : "transparent",
    border: `1px solid ${on ? C.holo : C.holoDim}`,
  });
  return (
    <main style={{ position: "fixed", inset: 0, background: C.skyZenith }}>
      <Canvas flat dpr={[1, 1.5]} camera={{ position: EYE[mode], fov, near: 0.05, far: 40 }}
        onCreated={({ gl, scene, camera }) => { if (process.env.NODE_ENV !== "production") window.__worldLab = { gl, scene, camera }; }}>
        <World mode={mode} pads={PADS[mode]} padScale={mode === "overview" ? OVERVIEW_SCALE : 1} still={still} />
        {!bare && <StandIns mode={mode} />}
        <Rig mode={mode} cam={cam} />
        <Readout out={out} />
      </Canvas>
      <div style={{
        position: "absolute", left: 16, top: 16, right: 16, maxWidth: 640, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
        padding: 12, borderRadius: 14, background: C.glass, border: `1px solid ${C.holoDim}`, color: C.text, font: `400 14px ${FONT.body}`,
      }}>
        <strong style={{ font: `700 16px ${FONT.label}`, letterSpacing: "0.06em", color: C.holo, marginRight: 8 }}>WORLD LAB</strong>
        {MODES.map((m) => (
          <button key={m} type="button" style={button(mode === m)} onClick={() => { setMode(m); setCam("front"); }}>{VIEW[m].label}</button>
        ))}
        <button type="button" style={button(still)} onClick={() => setStill((s) => !s)}>{still ? "Motion off" : "Motion on"}</button>
        <span style={{ flexBasis: "100%", height: 0 }} />
        {CAMS.map((c) => (
          <button key={c} type="button" style={button(cam === c)} onClick={() => setCam(c)}>{c[0].toUpperCase() + c.slice(1)}</button>
        ))}
        <span ref={out} data-readout style={{ flexBasis: "100%", color: C.textDim, font: `500 13px ${FONT.body}` }} />
      </div>
    </main>
  );
}
