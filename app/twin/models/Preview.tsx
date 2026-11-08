"use client";
// The models' preview (/twin/lab/models): one facility at life size under the Permian night, the
// camera at eye height 1.6 m, 8 m south of the tank, looking at it; a flare stack on the horizon;
// and, east of the pad, a row of the three tank tones and a faked one, three pipes (flowing,
// still, failed) and a running and a stopped pumpjack. Not linked from the demo.
// URL: ?cam=eye|high|row|jack|flare  &tone=alert|warn|ok  &fill=0.88|none  &faked=1  &sel=1  &hov=1
//      &still=1  &only=facility (just the pad, for counting its draw calls)
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { BackSide, BufferAttribute, BufferGeometry, Color, ShaderMaterial, type Camera, type Scene, type WebGLRenderer } from "three";
import type { SiteFacility } from "@/lib/live";
import type { TankState, Tone } from "../model";
import { C, FONT } from "../theme";
import { FacilityModel } from "./FacilityModel";
import { FlareStackModel } from "./FlareStackModel";
import { NightLights } from "./NightLights";
import { PipeModel } from "./PipeModel";
import { PumpjackModel } from "./PumpjackModel";
import { TankModel } from "./TankModel";
import { Glows, type GlowItem } from "./common";
import { FLARE } from "./geometry";
import { jackSlots, type P3 } from "./pad";

const FACILITY: SiteFacility = {
  facility_id: "S5_FACILITY_C", system_id: "S5", lat: 31.9, lon: -102.3, tank_id: "S5_FACILITY_C_TANK",
  pump_id: "S5_FACILITY_C_PUMP", capacity_bbl: 1000, well_ids: ["W1", "W2", "W3"],
};

function stateFor(tone: Tone, fill: number | null): TankState {
  const text = tone === "alert" ? "PUMP FAILED · trips in 2h 03m" : tone === "warn" ? "LYING · SIMULATED" : "OK";
  return {
    facility_id: FACILITY.facility_id, system_id: "S5", tank_id: FACILITY.tank_id, name: "S5 Facility C", short: "S5 · C",
    tone, sensor: tone === "warn" ? "warn" : null, lines: [{ text, tone }], fill, evidence: [], fix: null, bring: [],
  };
}

const FLARE_AT: P3 = [-46, 0, -64];
const ROW_X = 64;

const CAMS: Record<string, { pos: P3; target: P3 }> = {
  eye: { pos: [0, 1.6, 8], target: [0, 3.0, 0] },
  high: { pos: [24, 22, 30], target: [0, 1, -2] },
  row: { pos: [ROW_X + 12, 1.6, 17], target: [ROW_X + 12, 3.2, 0] },
  jack: (() => {
    const s = jackSlots(3)[0];
    const d = Math.hypot(s.x, s.z), ux = s.x / d, uz = s.z / d;
    return { pos: [s.x - ux * 8.5, 1.6, s.z - uz * 8.5] as P3, target: [s.x, 2.4, s.z] as P3 };
  })(),
  flare: { pos: [FLARE_AT[0] + 14, 1.6, FLARE_AT[2] + 22], target: [FLARE_AT[0], FLARE.tip - 2, FLARE_AT[2]] },
};

function params() {
  const q = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const tone = (["alert", "warn", "ok"].includes(q.get("tone") ?? "") ? q.get("tone") : "alert") as Tone;
  const fillQ = q.get("fill");
  return {
    cam: CAMS[q.get("cam") ?? ""] ? (q.get("cam") as string) : "eye",
    tone,
    fill: fillQ === "none" ? null : fillQ ? Number(fillQ) : 0.88,
    faked: q.get("faked") === "1",
    sel: q.get("sel") === "1",
    hov: q.get("hov") === "1",
    still: q.get("still") === "1",
    only: q.get("only") === "facility",
  };
}

// The sky dome: zenith to horizon in the theme's violets, with the last dusk low in the west.
function Sky() {
  const mat = useMemo(() => new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: {
      uZenith: { value: new Color(C.skyZenith) }, uMid: { value: new Color(C.skyMid) },
      uHorizon: { value: new Color(C.skyHorizon) }, uDusk: { value: new Color(C.duskGlow) },
    },
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uDusk; varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.32, h));
        col = mix(col, uZenith, smoothstep(0.3, 0.95, h));
        float west = pow(max(0.0, dot(normalize(vDir.xz + 1e-5), vec2(-1.0, 0.0))), 2.5);
        col = mix(col, uDusk, exp(-max(h, 0.0) * 22.0) * (0.25 + 0.75 * west) * 0.85);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  }), []);
  const stars = useMemo(() => {
    const n = 1600, pos = new Float32Array(n * 3);
    let a = 11;
    const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2, y = 0.06 + 0.94 * Math.pow(r(), 0.7), s = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * s * 420, y * 420, Math.sin(th) * s * 420], i * 3);
    }
    return new BufferGeometry().setAttribute("position", new BufferAttribute(pos, 3));
  }, []);
  return (
    <>
      <mesh material={mat} renderOrder={-10}>
        <sphereGeometry args={[460, 32, 16]} />
      </mesh>
      <points geometry={stars} renderOrder={-9}>
        <pointsMaterial color={C.stars} size={1.6} sizeAttenuation={false} transparent opacity={0.85} fog={false} depthWrite={false} />
      </points>
    </>
  );
}

function Ground() {
  return (
    <mesh rotation-x={-Math.PI / 2} renderOrder={-5}>
      <circleGeometry args={[450, 64]} />
      <meshBasicMaterial color={C.ground} />
    </mesh>
  );
}

// Other pads far off, as lights on the horizon.
function FarPads() {
  const items = useMemo<GlowItem[]>(() => {
    const warm = new Color(C.duskGlow).lerp(new Color(C.stars), 0.55);
    return [[-160, -210], [120, -260], [260, -90], [-280, -40], [40, -330], [-90, -300]].map(([x, z]) => ({ p: [x, 6, z] as P3, size: 9, color: warm }));
  }, []);
  return <Glows items={items} />;
}

declare global {
  interface Window { __models?: { gl: WebGLRenderer; scene: Scene; camera: Camera } }
}

function CameraRig({ cam }: { cam: string }) {
  const camera = useThree((s) => s.camera);
  const ref = useRef<ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    const c = CAMS[cam];
    camera.position.set(...c.pos);
    ref.current?.target.set(...c.target);
    camera.lookAt(...c.target);
    ref.current?.update();
  }, [cam, camera]);
  return <OrbitControls ref={ref} makeDefault enableDamping dampingFactor={0.1} target={CAMS[cam].target} maxPolarAngle={Math.PI / 2.02} />;
}

function Row({ still }: { still: boolean }) {
  const tones: { tone: Tone; fill: number | null; faked?: boolean }[] = [
    { tone: "ok", fill: 0.42 }, { tone: "warn", fill: 0.71 }, { tone: "alert", fill: 0.93 }, { tone: "warn", fill: 0.6, faked: true },
  ];
  const pipe = (z: number): P3[] => [[ROW_X - 4, 0.3, z], [ROW_X + 10, 0.3, z], [ROW_X + 12, 0.3, z - 3], [ROW_X + 28, 0.3, z - 3]];
  return (
    <>
      {tones.map((t, i) => (
        <group key={i} position={[ROW_X + i * 8, 0, 0]}>
          <TankModel fill={t.fill} tone={t.tone} faked={t.faked} beacon={t.faked} still={still} selected={i === 2} hovered={i === 1} />
        </group>
      ))}
      <PipeModel points={pipe(7)} flowing />
      <PipeModel points={pipe(9)} flowing={false} />
      <PipeModel points={pipe(11)} flowing={false} failed />
      <group position={[ROW_X + 4, 0, -14]}><PumpjackModel running phase={0.2} /></group>
      <group position={[ROW_X + 18, 0, -14]}><PumpjackModel running={false} phase={0.6} /></group>
    </>
  );
}

export default function Preview() {
  const [p, setP] = useState(params);
  const fog = useMemo(() => new Color(C.skyHorizon).lerp(new Color(C.skyZenith), 0.35), []);
  const state = useMemo(() => stateFor(p.tone, p.fill), [p.tone, p.fill]);
  const btn = (on: boolean) => ({
    font: `600 13px ${FONT.label}`, letterSpacing: "0.04em", padding: "7px 10px", borderRadius: 4, cursor: "pointer",
    color: on ? C.skyZenith : C.text, background: on ? C.holo : C.glass, border: `1px solid ${on ? C.holo : C.holoDim}`,
  });
  return (
    <div style={{ position: "fixed", inset: 0, background: C.skyZenith }}>
      <Canvas
        flat dpr={[1, 1.5]} camera={{ position: CAMS[p.cam].pos, fov: 70, near: 0.05, far: 1200 }}
        onCreated={({ gl, scene, camera }) => { window.__models = { gl, scene, camera }; }}
      >
        {!p.only && <fog attach="fog" args={[fog, 70, 420]} />}
        {!p.only && <Sky />}
        {!p.only && <Ground />}
        <NightLights />
        <FacilityModel facility={FACILITY} state={state} fill={p.fill} faked={p.faked} selected={p.sel} hovered={p.hov}
          still={p.still} beacon={p.faked} padLight onSelect={() => setP((x) => ({ ...x, sel: !x.sel }))}
          onHover={(_, on) => setP((x) => ({ ...x, hov: on }))} />
        {!p.only && (
          <>
            <group position={FLARE_AT}><FlareStackModel light seed={1.3} still={p.still} /></group>
            <FarPads />
            <Row still={p.still} />
          </>
        )}
        <CameraRig cam={p.cam} />
      </Canvas>
      <div style={{ position: "absolute", left: 16, top: 16, display: "flex", flexWrap: "wrap", gap: 6, maxWidth: "calc(100vw - 32px)" }}>
        {Object.keys(CAMS).map((k) => <button key={k} style={btn(p.cam === k)} onClick={() => setP((x) => ({ ...x, cam: k }))}>{k}</button>)}
        {(["ok", "warn", "alert"] as Tone[]).map((t) => <button key={t} style={btn(p.tone === t)} onClick={() => setP((x) => ({ ...x, tone: t }))}>{t}</button>)}
        <button style={btn(p.faked)} onClick={() => setP((x) => ({ ...x, faked: !x.faked }))}>faked</button>
        <button style={btn(p.still)} onClick={() => setP((x) => ({ ...x, still: !x.still }))}>still</button>
      </div>
    </div>
  );
}
