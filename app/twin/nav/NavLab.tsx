"use client";
// PREVIEW (app/twin/lab/nav): the menu dock and the dashboard in front of a camera at eye height,
// on the live avon data, over a stand-in Permian night sky (the real sky is the world lane's).
// A plain r3f Canvas, no headset: point with the mouse, click to press. Arrow keys turn the
// "head" 30 degrees to show the dock's lazy follow; ?yaw=<deg> starts turned, ?mode= picks a view,
// ?board=0 starts with the dashboard closed.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { BackSide, Color, ShaderMaterial, type Camera, type PerspectiveCamera, type Scene } from "three";
import { C } from "../theme";
import { useAvonConsole } from "@/lib/live";
import type { ConsoleView } from "@/lib/eog/alerts";
import { Dashboard, type DashboardSource } from "./Dashboard";
import { Dock } from "./Dock";
import { EYE_M } from "./views";
import { useView, ViewButtons, ViewFade, ViewProvider } from "./index";
import type { ViewMode } from "../theme";

declare global {
  interface Window { __navLab?: { scene: Scene; camera: Camera } }
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uDusk; uniform vec3 uGround;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 c = h > 0.0 ? mix(uHorizon, uMid, smoothstep(0.0, 0.5, h)) : uGround;
  c = h > 0.5 ? mix(uMid, uZenith, smoothstep(0.5, 1.0, h)) : c;
  // The warm dusk band, strongest in the west (-x).
  float west = 0.5 + 0.5 * dot(normalize(vDir.xz + 1e-4), vec2(-1.0, 0.0));
  c += uDusk * exp(-abs(h) * 22.0) * (0.25 + 0.75 * west) * 0.9;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

function Sky() {
  const mat = useMemo(() => new ShaderMaterial({
    uniforms: {
      uZenith: { value: new Color(C.skyZenith) }, uMid: { value: new Color(C.skyMid) }, uHorizon: { value: new Color(C.skyHorizon) },
      uDusk: { value: new Color(C.duskGlow) }, uGround: { value: new Color(C.ground) },
    },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: BackSide, depthWrite: false,
  }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh renderOrder={-10}>
      <sphereGeometry args={[60, 48, 24]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

function Stars() {
  const positions = useMemo(() => {
    const n = 700, out = new Float32Array(n * 3);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 * Math.PI, v = 0.08 + rnd() * 0.92, r = 55;
      const y = v, s = Math.sqrt(1 - y * y);
      out.set([Math.cos(u) * s * r, y * r, Math.sin(u) * s * r], i * 3);
    }
    return out;
  }, []);
  return (
    <points>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color={C.stars} size={0.18} sizeAttenuation transparent opacity={0.85} depthWrite={false} />
    </points>
  );
}

function Ground() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[58, 64]} />
        <meshBasicMaterial color={C.ground} />
      </mesh>
      <gridHelper args={[40, 40, C.holoDim, C.holoDim]} position={[0, 0.005, 0]} />
    </group>
  );
}

// The "head": a camera at eye height that turns in 30 degree steps (arrow keys).
function Head({ yawDeg }: { yawDeg: number }) {
  const cur = useRef(yawDeg);
  useFrame(({ camera }, dt) => {
    const target = (yawDeg * Math.PI) / 180;
    cur.current = target + (cur.current - target) * Math.exp(-dt * 10);
    camera.position.set(0, EYE_M, 0);
    camera.rotation.set(-0.12, cur.current, 0, "YXZ");
    (camera as PerspectiveCamera).updateProjectionMatrix?.();
  });
  return null;
}

function State() {
  const { mode, focus, busy, dashboard, comfort } = useView();
  return (
    <p data-testid="nav-state" style={{ margin: 0, color: C.textDim, fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}>
      mode {mode} · focus {focus ?? "none"} · busy {String(busy)} · dashboard {String(dashboard)} · comfort {String(comfort)}
    </p>
  );
}

function readParams() {
  if (typeof window === "undefined") return { yaw: 0, mode: "table" as ViewMode, board: true, attack: false };
  const q = new URLSearchParams(window.location.search);
  const m = q.get("mode");
  return {
    yaw: Number(q.get("yaw") ?? 0) || 0,
    mode: (m === "overview" || m === "ground" ? m : "table") as ViewMode,
    board: q.get("board") !== "0",
    attack: q.get("attack") === "1",
  };
}

// ?attack=1: the live view as it reads after the attack moment, made up in this page only: the top
// plan's tank sensor LYING and SIMULATED, listed under Sensors to check, and the plan confirmed a
// minute ago. Nothing is sent to the database: its confirm only throws.
function useAttackPreview(on: boolean): DashboardSource | undefined {
  const live = useAvonConsole();
  return useMemo(() => {
    if (!on || !live.view) return undefined;
    const v = live.view;
    const top = v.alerts.find((a) => a.fix);
    if (!top) return undefined;
    const evidence = "Level climbs 4.1 pts/h with the pump off and no inflow. Physics says it should hold.";
    const tank = top.event.facility_id.replace("FACILITY", "TANK");
    const view: ConsoleView = {
      ...v,
      alerts: v.alerts.map((a) => (a === top ? { ...a, tank_sensor: { state: "lying", evidence, simulated: true } } : a)),
      sensors: [{ key: `${tank}:level_pct`, asset_id: tank, metric: "level_pct", facility_id: top.event.facility_id, state: "lying", evidence, simulated: true }, ...(v.sensors ?? [])],
    };
    return {
      status: live.status, facilities: live.facilities, view,
      confirmations: { [top.id]: { headline: top.fix!.headline, cost: top.fix!.plan.cost, atMs: Date.now() - 60_000 } },
      confirm: async () => { throw new Error("Preview only: nothing was sent."); },
    };
  }, [on, live.view, live.status, live.facilities]);
}

function PreviewBoard({ attack }: { attack: boolean }) {
  return <Dashboard source={useAttackPreview(attack)} />;
}

export default function NavLab() {
  const [start] = useState(readParams);
  const [yaw, setYaw] = useState(start.yaw);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setYaw((y) => y + 30);
      if (e.key === "ArrowRight") setYaw((y) => y - 30);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <ViewProvider initialMode={start.mode} initialDashboard={start.board}>
      <main style={{ position: "fixed", inset: 0, background: C.skyZenith }}>
        <Canvas
          flat dpr={[1, 1.5]} camera={{ position: [0, EYE_M, 0], fov: 72, near: 0.02, far: 200 }} data-testid="nav-canvas"
          // Development only: lets a check script find the buttons (named nav-*) on screen.
          onCreated={({ scene, camera }) => { if (process.env.NODE_ENV !== "production") window.__navLab = { scene, camera }; }}
        >
          <Head yawDeg={yaw} />
          <Sky />
          <Stars />
          <Ground />
          <Dock />
          <PreviewBoard attack={start.attack} />
          <ViewFade />
        </Canvas>
        <div style={{ position: "absolute", left: 16, bottom: 16, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <ViewButtons />
          <State />
        </div>
      </main>
    </ViewProvider>
  );
}
