"use client";
// The entry scene: a map of the US lying on the table in front of the judge (the same Albers
// frame and Census outlines as /map), a marker per oil site in its live state (lib/fleet.ts), and
// a label per site (name, basin, status) in two rows off the map's edges with a leader line to its
// marker. Pointing at a marker or a label with the controller ray and pulling the trigger, or
// clicking it with the mouse, picks that site. Draw calls: plate, land, borders, leaders, then
// marker + hit disc + label per site (about 22 for six sites).
import { useEffect, useMemo, useState } from "react";
import { BufferGeometry, Float32BufferAttribute, type CanvasTexture } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Geometry } from "@/app/map/projection";
import type { SiteSummary } from "@/lib/fleet";
import { MODEL_CENTER, TABLE_TOP_Y } from "../stage";
import { labelSpots, MAP_D, MAP_W, outlineGeometry, toTable, type LabelSpot } from "./geo";
import { siteStatusText, siteTone } from "./entry";
import { canvasTexture, dot, loadFonts, panel, SUI, TONE_DOT, TONE_TEXT, write } from "./paint";

const LABEL_W = 0.2;
const FAR_SCALE = 1.35;                     // the far row is about 1.6 m from the judge
const LPX = 640, LPY = 210;                 // label texture, px (3200 px per m: 60 px is 1.9 cm)
const LABEL_H = (LABEL_W * LPY) / LPX;
const NEAR_TILT = -(58 * Math.PI) / 180;   // the near row lies back toward the judge
const FAR_TILT = -(14 * Math.PI) / 180;
const LIFT = 0.012;                         // the map's surface over the tabletop
const SKIP = new Set(["Alaska", "Hawaii", "Puerto Rico"]);

type Feature = { properties?: { name?: string }; geometry: Geometry };
let outline: Promise<{ lines: Float32Array; tris: Float32Array }> | null = null;
function loadOutline() {
  outline ??= fetch("/geo/us-states.json")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((g: { features: Feature[] }) => outlineGeometry(g.features.filter((f) => !SKIP.has(f.properties?.name ?? "")).map((f) => f.geometry)))
    .catch((e) => { outline = null; throw e; });
  return outline;
}

function geometryOf(pos: Float32Array): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.computeBoundingSphere();
  return g;
}

function useOutline() {
  const [geo, setGeo] = useState<{ land: BufferGeometry; borders: BufferGeometry } | null>(null);
  useEffect(() => {
    let live = true;
    loadOutline().then((o) => { if (live) setGeo({ land: geometryOf(o.tris), borders: geometryOf(o.lines) }); }, () => {});
    return () => { live = false; };
  }, []);
  useEffect(() => () => { geo?.land.dispose(); geo?.borders.dispose(); }, [geo]);
  return geo;
}

function paintLabel(s: SiteSummary, hot: boolean, fonts: boolean): CanvasTexture {
  const tone = siteTone(s);
  return canvasTexture(LPX, LPY, (ctx) => {
    panel(ctx, LPX, LPY, hot ? SUI.blue : SUI.line, hot ? 5 : 3, 24);
    if (!fonts) return;
    dot(ctx, 40, 52, 9, TONE_DOT[tone]);
    write(ctx, s.name, 64, 54, { size: 50, weight: 600, color: SUI.white, maxW: LPX - 90 });
    write(ctx, `${s.basin} · ${s.state}`.toUpperCase(), 34, 112, { size: 24, weight: 500, color: SUI.grey2, mono: true, spacing: 2, maxW: LPX - 60 });
    write(ctx, siteStatusText(s), 34, 164, { size: 32, weight: 500, color: TONE_TEXT[tone], maxW: LPX - 60 });
  });
}

function SiteLabel({ s, spot, hot, fonts, onPick, onHover }: {
  s: SiteSummary; spot: LabelSpot; hot: boolean; fonts: boolean; onPick(key: string): void; onHover(key: string, on: boolean): void;
}) {
  const statusKey = `${s.name}|${s.basin}|${siteStatusText(s)}|${siteTone(s)}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tex = useMemo(() => paintLabel(s, hot, fonts), [statusKey, hot, fonts]);
  useEffect(() => () => tex.dispose(), [tex]);
  const tilt = spot.row === "near" ? NEAR_TILT : FAR_TILT;
  const k = spot.row === "near" ? 1 : FAR_SCALE;
  const y = (k * LABEL_H / 2) * Math.cos(tilt) + 0.004;
  return (
    <mesh
      name={`usmap-label-${s.key}`} position={[spot.x, y, spot.z]} rotation-x={tilt} scale={k}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onPick(s.key); }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(s.key, true); }}
      onPointerOut={() => onHover(s.key, false)}
    >
      <planeGeometry args={[LABEL_W, LABEL_H]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} fog={false} />
    </mesh>
  );
}

export function UsMap3D({ sites, onPick }: { sites: SiteSummary[]; onPick(key: string): void }) {
  const geo = useOutline();
  const [hovered, setHovered] = useState<string | null>(null);
  const [fonts, setFonts] = useState(false);
  useEffect(() => { let live = true; loadFonts().then(() => { if (live) setFonts(true); }); return () => { live = false; }; }, []);
  const hover = (key: string, on: boolean) => setHovered((cur) => (on ? key : cur === key ? null : cur));

  const marks = useMemo(() => sites.map((s) => { const [x, z] = toTable(s.lon, s.lat); return { s, x, z }; }), [sites]);
  const spots = useMemo(() => new Map(labelSpots(marks.map((m) => ({ key: m.s.key, x: m.x, z: m.z })), LABEL_W, 0.015, LABEL_W * FAR_SCALE).map((p) => [p.key, p])), [marks]);
  // Leader lines: marker up to the label's nearest edge.
  const leaders = useMemo(() => {
    const pos: number[] = [];
    for (const m of marks) {
      const p = spots.get(m.s.key);
      if (!p) continue;
      const tilt = p.row === "near" ? NEAR_TILT : FAR_TILT;
      // Near row: the top edge (it leans back toward the map); far row: the bottom edge.
      const edgeZ = p.row === "near" ? p.z - (LABEL_H / 2) * Math.sin(-tilt) : p.z + (FAR_SCALE * LABEL_H / 2) * Math.sin(-tilt);
      const edgeY = p.row === "near" ? 0.004 + LABEL_H * Math.cos(tilt) : 0.004;
      pos.push(m.x, 0.003, m.z, p.x, edgeY + 0.002, edgeZ);
    }
    return geometryOf(new Float32Array(pos));
  }, [marks, spots]);
  useEffect(() => () => leaders.dispose(), [leaders]);

  return (
    <group name="twin-usmap" position={[MODEL_CENTER[0], TABLE_TOP_Y + LIFT, MODEL_CENTER[2]]}>
      {/* The plate under the map and both label rows. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.002, 0.03]} onClick={(e: ThreeEvent<MouseEvent>) => e.stopPropagation()}>
        <planeGeometry args={[MAP_W + 0.08, MAP_D + 0.26]} />
        <meshBasicMaterial color={SUI.page} toneMapped={false} fog={false} />
      </mesh>
      {geo && (
        <>
          <mesh geometry={geo.land} raycast={() => {}}>
            <meshBasicMaterial color={SUI.raised} side={2} toneMapped={false} fog={false} />
          </mesh>
          <lineSegments geometry={geo.borders} position-y={0.0008} raycast={() => {}}>
            <lineBasicMaterial color={SUI.grey1} transparent opacity={0.75} toneMapped={false} fog={false} />
          </lineSegments>
        </>
      )}
      <lineSegments geometry={leaders} raycast={() => {}}>
        <lineBasicMaterial color={SUI.grey2} transparent opacity={0.8} toneMapped={false} fog={false} />
      </lineSegments>
      {marks.map(({ s, x, z }) => {
        const hot = hovered === s.key;
        return (
          <group key={s.key} position={[x, 0, z]}>
            <mesh position-y={0.005} raycast={() => {}}>
              <cylinderGeometry args={[hot ? 0.014 : 0.011, hot ? 0.014 : 0.011, 0.01, 24]} />
              <meshBasicMaterial color={TONE_DOT[siteTone(s)]} toneMapped={false} fog={false} />
            </mesh>
            {/* A wider, flat, invisible target so the ray and the mouse find the marker easily. */}
            <mesh
              name={`usmap-site-${s.key}`} position-y={0.006} rotation-x={-Math.PI / 2}
              onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onPick(s.key); }}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); hover(s.key, true); }}
              onPointerOut={() => hover(s.key, false)}
            >
              <circleGeometry args={[0.03, 32]} />
              <meshBasicMaterial color={SUI.blue} transparent opacity={hot ? 0.35 : 0} depthWrite={false} toneMapped={false} fog={false} />
            </mesh>
          </group>
        );
      })}
      {marks.map(({ s }) => {
        const p = spots.get(s.key);
        return p ? <SiteLabel key={s.key} s={s} spot={p} hot={hovered === s.key} fonts={fonts} onPick={onPick} onHover={hover} /> : null;
      })}
    </group>
  );
}
