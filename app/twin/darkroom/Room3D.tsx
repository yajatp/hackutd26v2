"use client";
// The Darkroom in the scene: an enclosed, quiet room (floor, walls and ceiling as one box seen from
// inside, a floor, a desk), soft neutral light, a wall sign, and a console panel in the Sui style:
// the incident and its AV- reference, and the Darkroom's live status when its database answers
// (served from the laptop), or why it cannot be reached (the field network, by design).
// About 10 draw calls. No glow.
import { useEffect, useMemo, useRef, type ComponentRef } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useXR } from "@react-three/xr";
import { BackSide, Color, type PerspectiveCamera } from "three";
import { useRoomSnapshot } from "./useRoom";
import type { RoomValue } from "../usmap/EntryContext";
import { canvasTexture, SUI, write } from "../usmap/paint";
import { Button3D, fill, useFonts, wrap } from "./Button3D";
import { consoleRows, DOES_NOT, ISOLATED_LINE, PROTECTS, type ConsoleRows } from "./logic";

const noRay = () => {};
const CONSOLE_AT: [number, number, number] = [0, 1.36, -1.35];
const CW = 1.2, CPX = 1800, CPY = 1200;
const SANS = '"Hanken Grotesk", system-ui, sans-serif';

function paintConsole(ctx: CanvasRenderingContext2D, rows: ConsoleRows, incident: RoomValue["incident"]) {
  fill(ctx, CPX, CPY, SUI.panel, SUI.raised, 4, 28);
  const x = 72;
  write(ctx, "DARKROOM · INCIDENT CONSOLE", x, 76, { size: 28, weight: 500, color: SUI.grey2, mono: true, spacing: 4 });
  const conn = rows.live ? "LIVE · ISOLATED NETWORK" : rows.connection === "connecting" ? "CONNECTING" : "NOT REACHABLE FROM HERE";
  ctx.font = `500 26px "IBM Plex Mono", monospace`;
  write(ctx, conn, CPX - 72 - ctx.measureText(conn).width - conn.length * 3, 76, { size: 26, weight: 500, color: rows.live ? SUI.blue : SUI.grey2, mono: true, spacing: 3 });
  ctx.fillStyle = SUI.raised;
  ctx.fillRect(x, 112, CPX - 2 * x, 2);

  // (a) The incident.
  write(ctx, "INCIDENT", x, 160, { size: 24, weight: 500, color: SUI.grey1, mono: true, spacing: 4 });
  ctx.font = `600 38px ${SANS}`;
  let y = 214;
  for (const l of wrap(ctx, incident.line ?? "No active attack at this site.", CPX - 2 * x).slice(0, 2)) {
    write(ctx, l, x, y, { size: 38, weight: 600, color: incident.line ? SUI.white : SUI.grey3 }); y += 50;
  }
  if (incident.ref) {
    write(ctx, "EVIDENCE REFERENCE", x, y + 22, { size: 24, weight: 500, color: SUI.grey1, mono: true, spacing: 4 });
    write(ctx, incident.ref, x, y + 84, { size: 64, weight: 500, color: SUI.blue, mono: true, spacing: 2 });
    write(ctx, "Enter this reference on the Darkroom box.", x + 560, y + 86, { size: 32, weight: 500, color: SUI.grey3 });
    y += 130;
  }
  y += 24;
  ctx.fillStyle = SUI.raised;
  ctx.fillRect(x, y, CPX - 2 * x, 2);
  y += 52;

  if (rows.live) {
    // (b) Live status from the Darkroom database.
    const tone = rows.status.tone === "alert" ? SUI.red : rows.status.tone === "ok" ? SUI.blue : SUI.grey2;
    ctx.fillStyle = tone;
    ctx.beginPath(); ctx.arc(x + 10, y + 4, 10, 0, Math.PI * 2); ctx.fill();
    write(ctx, rows.status.text, x + 36, y + 4, { size: 44, weight: 700, color: rows.status.tone === "alert" ? "#F87171" : SUI.white, maxW: 840 });
    const inc = rows.incident === "open" ? "Incident open" : rows.incident === "closed" ? "Incident closed" : "No incident yet";
    write(ctx, `${inc} · ${rows.count} entries`, x + 900, y + 4, { size: 32, weight: 500, color: SUI.grey3 });
    y += 64;
    write(ctx, "NEWEST ENTRIES (HASH CHAIN)", x, y, { size: 24, weight: 500, color: SUI.grey1, mono: true, spacing: 4 });
    y += 46;
    if (rows.entries.length === 0) { write(ctx, "No entries yet.", x, y, { size: 30, weight: 500, color: SUI.grey2 }); y += 44; }
    for (const e of rows.entries) {
      write(ctx, e.seq, x, y, { size: 28, weight: 500, color: SUI.grey3, mono: true });
      write(ctx, e.kind, x + 110, y, { size: 28, weight: 500, color: SUI.white, mono: true, maxW: 460 });
      write(ctx, e.who, x + 620, y, { size: 30, weight: 500, color: SUI.white, maxW: 340 });
      write(ctx, e.hash, x + 1000, y, { size: 28, weight: 500, color: SUI.grey2, mono: true });
      y += 44;
    }
    y += 16;
    write(ctx, "TEAM", x, y, { size: 24, weight: 500, color: SUI.grey1, mono: true, spacing: 4 });
    const team = rows.team.length ? rows.team.map((m) => `${m.name} · ${m.role}`).join("   ") : "No members yet.";
    write(ctx, team, x + 120, y, { size: 30, weight: 500, color: SUI.grey3, maxW: CPX - 2 * x - 120 });
  } else {
    // (c) Not reachable: the isolation is the feature.
    ctx.font = `600 36px ${SANS}`;
    for (const l of wrap(ctx, ISOLATED_LINE, CPX - 2 * x).slice(0, 3)) { write(ctx, l, x, y, { size: 36, weight: 600, color: SUI.white }); y += 48; }
    y += 20;
    const col = (title: string, items: readonly string[], cx: number) => {
      let yy = y;
      write(ctx, title, cx, yy, { size: 24, weight: 500, color: SUI.grey1, mono: true, spacing: 4 });
      yy += 46;
      ctx.font = `500 28px ${SANS}`;
      for (const it of items) {
        const ls = wrap(ctx, it, 760);
        ctx.fillStyle = SUI.grey2; ctx.fillRect(cx, yy - 3, 8, 8);
        for (const l of ls.slice(0, 2)) { write(ctx, l, cx + 24, yy, { size: 28, weight: 500, color: SUI.grey3 }); yy += 38; }
        yy += 10;
      }
    };
    col("PROTECTS AGAINST", PROTECTS, x);
    col("DOES NOT PROTECT AGAINST", DOES_NOT, x + 860);
  }
}

function Console({ room }: { room: RoomValue }) {
  const fonts = useFonts();
  const snap = useRoomSnapshot();
  const rows = useMemo(() => consoleRows(snap), [snap]);
  const key = JSON.stringify([rows, room.incident]);
  const tex = useMemo(() => canvasTexture(CPX, CPY, (ctx) => { if (fonts) paintConsole(ctx, rows, room.incident); else fill(ctx, CPX, CPY, SUI.panel, SUI.raised, 4, 28); }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fonts, key]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh name="twin-darkroom-console" position={CONSOLE_AT} rotation-x={-0.12} raycast={noRay}>
      <planeGeometry args={[CW, (CW * CPY) / CPX]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} fog={false} />
    </mesh>
  );
}

const SW = 2.4, SPX = 2000, SPY = 260;
function Sign() {
  const fonts = useFonts();
  const tex = useMemo(() => canvasTexture(SPX, SPY, (ctx) => {
    fill(ctx, SPX, SPY, SUI.panel, SUI.raised, 4, 24);
    if (!fonts) return;
    write(ctx, "DARKROOM", 90, 120, { size: 96, weight: 700, color: SUI.white, spacing: 6 });
    write(ctx, "ISOLATED NETWORK · NO INTERNET CONNECTION", 760, 124, { size: 40, weight: 500, color: SUI.grey3, mono: true, spacing: 4 });
  }), [fonts]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh name="twin-darkroom-sign" position={[0, 2.35, -3.98]} raycast={noRay}>
      <planeGeometry args={[SW, (SW * SPY) / SPX]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} fog={false} />
    </mesh>
  );
}

// 2D only: a fixed start inside the room looking at the console; drag looks around.
function RoomControls2D() {
  const inXR = useXR((x) => x.session != null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const ref = useRef<ComponentRef<typeof OrbitControls>>(null);
  // Shifted right so the console sits left of the page's side panel (Page.tsx).
  const target: [number, number, number] = [0.36, 1.28, -1.35];
  useEffect(() => {
    if (inXR) return;
    camera.fov = 55;
    camera.updateProjectionMatrix();
    camera.position.set(0.36, 1.55, 0.35);
    camera.lookAt(...target);
    ref.current?.target.set(...target);
    ref.current?.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inXR, camera]);
  if (inXR) return null;
  return <OrbitControls ref={ref} makeDefault target={target} enableDamping dampingFactor={0.08} enablePan={false} rotateSpeed={0.5} minDistance={0.6} maxDistance={2.6} />;
}

// The room has no sky: a plain black background and no fog while it is up; the scene's own come
// back on leaving.
function SceneReset() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const bg = scene.background, fog = scene.fog;
    scene.background = new Color("#000000");
    scene.fog = null;
    return () => { scene.background = bg; scene.fog = fog; };
  }, [scene]);
  return null;
}

export function DarkroomRoom({ room, onMap }: { room: RoomValue; onMap(): void }) {
  return (
    <group name="twin-darkroom">
      <SceneReset />
      <ambientLight intensity={0.55} color="#e8ecf2" />
      <hemisphereLight args={["#dfe5ee", "#1a1c20", 0.6]} />
      <pointLight position={[0, 2.8, -1]} intensity={6} distance={9} decay={1.6} color="#f2f4f8" />
      {/* Walls and ceiling: one box seen from inside (6 m wide, 3 m high, 6 m deep). */}
      <mesh position={[0, 1.5, -1]} raycast={noRay}>
        <boxGeometry args={[6, 3, 6]} />
        <meshStandardMaterial color="#2a2d33" roughness={0.95} metalness={0} side={BackSide} />
      </mesh>
      <mesh position={[0, 0.002, -1]} rotation-x={-Math.PI / 2} raycast={noRay}>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color="#17191c" roughness={0.9} metalness={0} />
      </mesh>
      {/* The ceiling light: a plain pale panel. */}
      <mesh position={[0, 2.99, -1.2]} rotation-x={Math.PI / 2} raycast={noRay}>
        <planeGeometry args={[1.4, 0.5]} />
        <meshBasicMaterial color="#cfd5dd" toneMapped={false} />
      </mesh>
      {/* The desk the console stands on. */}
      <mesh position={[0, 0.72, -1.3]} raycast={noRay}>
        <boxGeometry args={[1.5, 0.05, 0.6]} />
        <meshStandardMaterial color="#222529" roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.36, -1.5]} raycast={noRay}>
        <boxGeometry args={[1.3, 0.7, 0.08]} />
        <meshStandardMaterial color="#131518" roughness={0.8} />
      </mesh>
      <Sign />
      <Console room={room} />
      <Button3D name="twin-darkroom-return" label="Return to the site" primary width={0.3} onPress={room.leave}
        position={[-0.2, 0.86, -1.08]} rotation={[-0.7, 0, 0]} />
      <Button3D name="twin-darkroom-map" label="Back to map" width={0.24} onPress={onMap}
        position={[0.2, 0.86, -1.08]} rotation={[-0.7, 0, 0]} />
      <RoomControls2D />
    </group>
  );
}
