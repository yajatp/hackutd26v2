"use client";
// /twin/lab/fx: the attack moment on a stand-in tank, outside the real /twin, so the effects can be
// judged alone. A plain r3f Canvas at life size (the judge 13 m south of a 6 m tank at night). A
// script fakes the tank's sensor, fails a pump next door and clears everything, in a loop; each
// step goes through diffFaults and useAttackFx exactly as the twin will. A shockwave also leaves
// the tank every 3 s. Buttons drive it by hand; ?still=1 previews reduced motion, ?cam=x,y,z moves
// the eye.
// Reads no live data and calls no reducer.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { BackSide, BufferGeometry, Color, Float32BufferAttribute, ShaderMaterial, type Group, type HemisphereLight, type Mesh, type WebGLRenderer } from "three";
import { C, FONT, SIZE, TONE_COLOR } from "../theme";
import type { TankState, Tone } from "../model";
import { glowTexture } from "./glow";
import { useAttackFx } from "./useAttackFx";
import { AlarmBeacon } from "./AlarmBeacon";
import { Shockwave } from "./Shockwave";
import { GlitchGauge, useGlitch } from "./Glitch";
import { Toast } from "./Toast";
import { audioReady, unlockAudio } from "./audio";
import { useEase, usePolish } from "./ease";

declare global {
  interface Window { __fx?: { gl: WebGLRenderer; audioReady(): boolean } }
}

// Stand-in facilities (ids that are in no dataset).
const Q = "S9_FACILITY_Q", R = "S9_FACILITY_R", T = "S9_FACILITY_T";

interface Scenario { fakedQ: "LYING" | "DRIFTING" | null; failedR: boolean; confirmedQ: boolean }
const QUIET: Scenario = { fakedQ: null, failedR: false, confirmedQ: true };

function tank(facility_id: string, short: string, lines: { text: string; tone: Tone }[], fill: number | null, fix: TankState["fix"] = null): TankState {
  const tone = lines.some((l) => l.tone === "alert") ? "alert" : lines.some((l) => l.tone === "warn") ? "warn" : "ok";
  return {
    facility_id, system_id: "S9", tank_id: facility_id.replace("FACILITY", "TANK"), name: `S9 Facility ${short}`, short: `S9 · ${short}`,
    tone, sensor: lines.some((l) => /^(LYING|DEAD|DRIFTING)/.test(l.text)) ? "warn" : null, lines, fill, evidence: [], fix, bring: [],
  };
}

function statesOf(s: Scenario): TankState[] {
  return [
    tank(Q, "Q", s.fakedQ ? [{ text: `${s.fakedQ} · SIMULATED`, tone: "warn" }] : [{ text: "OK", tone: "ok" }], 0.72),
    tank(R, "R", s.failedR ? [{ text: "PUMP FAILED · trips in 2h 03m", tone: "alert" }] : [{ text: "OK", tone: "ok" }], 0.86,
      s.failedR ? { headline: "Call 1 truck now, 1 trip", cost: 777 } : null),
    tank(T, "T", [{ text: "OK", tone: "ok" }], 0.4),
  ];
}

// The loop the lab plays by itself, in seconds from the start.
const SCRIPT: { at: number; s: Scenario }[] = [
  { at: 0.9, s: { ...QUIET, fakedQ: "LYING" } },
  { at: 7.5, s: { ...QUIET, fakedQ: "LYING", failedR: true } },
  { at: 14, s: { ...QUIET, failedR: true } },
  { at: 19, s: QUIET },
];
const LOOP_S = 22;
const WAVE_EVERY_MS = 3000;

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
  vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.5, h));
  c = mix(c, uZenith, smoothstep(0.45, 1.0, h));
  float west = smoothstep(0.2, 1.0, -vDir.x * 0.8 + 0.4);
  c += uDusk * exp(-pow(h / 0.06, 2.0)) * (0.25 + 0.75 * west);
  c = mix(c, uGround, smoothstep(0.0, -0.04, h));
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
  const stars = useMemo(() => {
    const g = new BufferGeometry();
    const p: number[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 700; i++) {
      const u = rnd() * Math.PI * 2, v = 0.06 + rnd() * 0.94;
      const r = 150, y = v * r, rr = Math.sqrt(r * r - y * y);
      p.push(Math.cos(u) * rr, y, Math.sin(u) * rr);
    }
    g.setAttribute("position", new Float32BufferAttribute(p, 3));
    return g;
  }, []);
  useEffect(() => () => { mat.dispose(); stars.dispose(); }, [mat, stars]);
  return (
    <>
      <mesh material={mat} renderOrder={-1}><sphereGeometry args={[180, 32, 16]} /></mesh>
      <points geometry={stars}>
        <pointsMaterial color={C.stars} size={1.3} sizeAttenuation transparent opacity={0.85} depthWrite={false} />
      </points>
    </>
  );
}

function Ground() {
  const tex = useMemo(() => glowTexture(), []);
  return (
    <>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[170, 48]} />
        <meshStandardMaterial color={C.ground} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 2]}>
        <planeGeometry args={[46, 46]} />
        <meshBasicMaterial map={tex} color={C.groundLit} transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </>
  );
}

// A plain tank, life size: steel shell, roof, a glowing state band at the base, a soft shadow.
function StandInTank({ at, s, faked, still, children }: { at: [number, number, number]; s: TankState; faked: boolean; still: boolean; children?: React.ReactNode }) {
  const r = SIZE.tankDiameter / 2, h = SIZE.tankHeight;
  const tone = TONE_COLOR[s.tone];
  const [hover, setHover] = useState(false);
  const body = useRef<Group>(null);
  usePolish(body, { hovered: hover, lift: 0.15, grow: 0.02, still });
  const torn = useGlitch(faked, { still, seed: 3 });
  const band = useRef<Mesh>(null);
  useFrame(() => { if (band.current) band.current.position.x = torn.current.dx * 0.12; });
  return (
    <group position={at}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <circleGeometry args={[r * 1.5, 32]} />
        <meshBasicMaterial color={C.skyZenith} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <group onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
        <group ref={body}>
          <mesh position={[0, h / 2, 0]}>
            <cylinderGeometry args={[r, r, h, 48]} />
            <meshStandardMaterial color={C.steel} metalness={0.55} roughness={0.42} />
          </mesh>
          <mesh position={[0, h + 0.22, 0]}>
            <cylinderGeometry args={[0.35, r + 0.04, 0.44, 48]} />
            <meshStandardMaterial color={C.steel} metalness={0.55} roughness={0.5} />
          </mesh>
          <mesh ref={band} position={[0, 0.45, 0]}>
            <cylinderGeometry args={[r + 0.03, r + 0.03, 0.32, 48, 1, true]} />
            <meshBasicMaterial color={tone} toneMapped={false} />
          </mesh>
          {children}
        </group>
      </group>
    </group>
  );
}

function Scene({ states, still }: { states: TankState[]; still: boolean }) {
  const confirmed = useMemo(() => new Set([Q]), []);
  const fx = useAttackFx(states, { confirmed });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), WAVE_EVERY_MS);
    return () => window.clearInterval(id);
  }, []);
  const byId = new Map(states.map((s) => [s.facility_id, s]));
  const q = byId.get(Q)!, r = byId.get(R)!, t = byId.get(T)!;
  const qFaked = fx.faked.has(Q);
  // The night darkens a little while a sensor is faked, and comes back when it clears.
  const mood = useEase(qFaked ? 1 : 0, 900, still);
  const hemi = useRef<HemisphereLight>(null);
  useFrame(() => { if (hemi.current) hemi.current.intensity = 1.6 - 0.55 * mood.current; });
  return (
    <>
      <Sky />
      <Ground />
      <hemisphereLight ref={hemi} args={[C.skyMid, C.ground, 1.6]} />
      <directionalLight color={C.duskGlow} position={[-20, 6, 4]} intensity={1.4} />
      <directionalLight color={C.holo} position={[8, 10, 14]} intensity={0.45} />
      <StandInTank at={[0, 0, 0]} s={q} faked={qFaked} still={still}>
        <group position={[0, 3.2, SIZE.tankDiameter / 2 + 0.03]}>
          <GlitchGauge level={q.fill} active={qFaked} width={0.42} height={4.8} seed={1} still={still} />
        </group>
        <group position={[0.55, SIZE.tankHeight + 0.44, 0.3]}>
          <AlarmBeacon active={qFaked} size={0.9} still={still} light />
        </group>
      </StandInTank>
      <StandInTank at={[-9, 0, -7]} s={r} faked={false} still={still}>
        <group position={[0, 3.2, SIZE.tankDiameter / 2 + 0.03]}>
          <GlitchGauge level={r.fill} active={false} color={TONE_COLOR[r.tone]} width={0.42} height={4.8} still={still} />
        </group>
      </StandInTank>
      <StandInTank at={[10, 0, -11]} s={t} faked={false} still={still} />
      <Shockwave origin={[0, 0.03, 0]} trigger={tick + (fx.waves[Q] ?? 0)} radius={16} still={still} />
      <Toast events={fx.notices} still={still} />
    </>
  );
}

function useStillPref(): [boolean, (b: boolean) => void] {
  const [still, setStill] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("still");
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setStill(q === "1" || m.matches);
  }, []);
  return [still, setStill];
}

// ?cam=x,y,z moves the starting eye (for close-ups); default 13 m south at eye height.
function startCam(): [number, number, number] {
  const v = new URLSearchParams(window.location.search).get("cam")?.split(",").map(Number);
  return v && v.length === 3 && v.every(Number.isFinite) ? [v[0], v[1], v[2]] : [0, 1.7, 13];
}

export default function FxLab() {
  const [cam] = useState(startCam);
  const [scenario, setScenario] = useState<Scenario>(QUIET);
  const [auto, setAuto] = useState(true);
  const [still, setStill] = useStillPref();
  const states = useMemo(() => statesOf(scenario), [scenario]);
  const t0 = useRef(0);

  useEffect(() => {
    if (!auto) return;
    t0.current = performance.now();
    let step = -1;
    const id = window.setInterval(() => {
      const t = ((performance.now() - t0.current) / 1000) % LOOP_S;
      let k = -1;
      for (let i = 0; i < SCRIPT.length; i++) if (t >= SCRIPT[i].at) k = i;
      if (k !== step) {
        step = k;
        setScenario(k < 0 ? QUIET : SCRIPT[k].s);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [auto]);

  const manual = (s: Partial<Scenario>) => { unlockAudio(); setAuto(false); setScenario((c) => ({ ...c, ...s })); };
  const btn: React.CSSProperties = {
    font: `600 14px ${FONT.label}`, letterSpacing: "0.06em", textTransform: "uppercase", color: C.text,
    background: C.glass, border: `1px solid ${C.holoDim}`, borderRadius: 8, padding: "8px 12px", cursor: "pointer",
  };
  return (
    <main style={{ position: "fixed", inset: 0, background: C.skyZenith }}>
      <Canvas
        flat dpr={[1, 1.5]} camera={{ position: cam, fov: 60, near: 0.05, far: 400 }}
        onCreated={({ gl }) => { if (process.env.NODE_ENV !== "production") window.__fx = { gl, audioReady }; }}
      >
        <Scene states={states} still={still} />
        <OrbitControls target={[0, 3, 0]} enablePan={false} minDistance={4} maxDistance={40} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
      <div style={{ position: "absolute", top: 16, left: 16, right: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", pointerEvents: "none" }}>
        <span style={{ font: `700 18px ${FONT.label}`, color: C.holo, letterSpacing: "0.08em", marginRight: 8 }}>ATTACK MOMENT · FX LAB</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, pointerEvents: "auto" }}>
          <button style={{ ...btn, borderColor: C.warn }} onClick={() => manual({ fakedQ: "LYING" })}>Fake Q · LYING</button>
          <button style={{ ...btn, borderColor: C.warn }} onClick={() => manual({ fakedQ: "DRIFTING" })}>Fake Q · DRIFTING</button>
          <button style={{ ...btn, borderColor: C.alert }} onClick={() => manual({ failedR: true })}>Fail R</button>
          <button style={{ ...btn, borderColor: C.ok }} onClick={() => manual({ fakedQ: null, failedR: false })}>Clear all</button>
          <button style={btn} onClick={() => { unlockAudio(); setAuto(true); }}>{auto ? "● Auto" : "Auto"}</button>
          <button style={btn} onClick={() => setStill(!still)}>{still ? "Comfort on" : "Comfort off"}</button>
        </div>
      </div>
      <p style={{ position: "absolute", bottom: 12, left: 16, margin: 0, font: `500 13px ${FONT.body}`, color: C.textDim, pointerEvents: "none" }}>
        Drag to orbit. Click once anywhere to allow the chirp. Q: {states[0].lines[0].text} · R: {states[1].lines[0].text}
      </p>
    </main>
  );
}
