"use client";
// The site in Permian Night (docs/TWIN-THEME.md "Models"), placed by plan.ts for the view.
//
// MiniSite (table and overview): the same life-size models drawn small in "model space" (the site
// root divided by the view's modelScale): one TankModel per facility (gauge, state band, glow pool;
// hover and selection rings; the faked gauge tearing), every facility's pumpjacks in one instanced
// set (they stop where the pump failed), each system's pipelines in two bundles (flowing holo
// dashes, or still and pulsing alert), and one flare stack per system at its middle. The attack
// moment's beacon sits on a faked tank's roof and its shockwave rolls out across the table or the
// desert.
//
// GroundSite (Walk): the focus facility's whole pad at life size (FacilityModel), its system's
// pipeline running off the pad toward the flare on the horizon, the other facilities as lights in
// their real direction, and the pad as a teleport target.
//
// Selection: pick.ts (a trigger pull and release over any part of a facility, or a screen click).
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, type Mesh, type MeshBasicMaterial } from "three";
import type { SiteFacility } from "@/lib/live";
import type { Cluster, PlacedTank, TankState } from "./model";
import { C, TONE_COLOR, type ViewMode } from "./theme";
import { FacilityModel, FlareStackModel, Glows, noRay, PipeBundle, PipeModel, Pumpjacks, TankModel, TANK, type GlowItem, type JackItem } from "./models";
import { AlarmBeacon, Shockwave } from "./fx";
import { GroundTeleport, type SiteTransform } from "./nav";
import { groundHeight } from "./world";
import { groundMarkers, groundSystem, hitRadius, miniJacks, miniPipe, MINI, modelPos, type V3 } from "./plan";
import { topRingPulse } from "./look";
import { usePick } from "./pick";

export interface SiteProps {
  t: SiteTransform;
  facilities: SiteFacility[];
  tanks: PlacedTank[];
  clusters: Cluster[];
  states: Map<string, TankState>;
  selected: string | null;
  hovered: string | null;
  top: string | null;
  faked: ReadonlySet<string>;
  waves: Readonly<Record<string, number>>;
  still: boolean;
  inXR: boolean;
  originYaw: number;                       // the XR origin's snap turn (ground teleport needs it)
  onSelect(id: string | null): void;
  onHover(id: string, on: boolean): void;
}

const FLARE_SEED = 1.7;

// The console's top problem: a holo ring on the ground round the tank, breathing slowly.
function TopRing({ r, still }: { r: number; still: boolean }) {
  const mesh = useRef<Mesh>(null);
  const mat = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const p = topRingPulse(clock.elapsedTime, still);
    mesh.current?.scale.setScalar(1 + 0.1 * p);
    if (mat.current) mat.current.opacity = 0.95 - 0.5 * p;
  });
  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} position={[0, 0.08, 0]} raycast={noRay} renderOrder={2}>
      <ringGeometry args={[r, r * 1.09, 64, 1]} />
      <meshBasicMaterial ref={mat} color={C.holo} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
    </mesh>
  );
}

function MiniTank({ id, at, s, hitR, beaconSize, pillarM, selected, hovered, top, faked, still, inXR, onSelect, onHover }: {
  id: string; at: { x: number; z: number }; s: TankState | undefined; hitR: number; beaconSize: number; pillarM: number;
  selected: boolean; hovered: boolean; top: boolean; faked: boolean; still: boolean; inXR: boolean;
  onSelect(id: string): void; onHover(id: string, on: boolean): void;
}) {
  const pick = usePick(id, inXR, onSelect, onHover);
  return (
    <group name={`tank:${id}`} position={[at.x, 0, at.z]} {...pick}>
      <TankModel fill={s?.fill ?? null} tone={s?.tone ?? "ok"} faked={faked} selected={selected} hovered={hovered} still={still} shadow={false}
        tint pillarM={pillarM} />
      {/* A generous unseen target, so a first-time user's ray finds the tank. */}
      <mesh position={[0, (TANK.railY + 1) / 2, 0]} visible={false}>
        <cylinderGeometry args={[hitR, hitR, TANK.railY + 1, 12]} />
        <meshBasicMaterial />
      </mesh>
      {top && <TopRing r={hitR * 1.02} still={still} />}
      <group position={[0, TANK.railY + beaconSize * 0.2, 0]}>
        <AlarmBeacon active={faked} size={beaconSize} reach={5} still={still} />
      </group>
    </group>
  );
}

export function MiniSite({ t, facilities, tanks, clusters, states, selected, hovered, top, faked, waves, still, inXR, onSelect, onHover }: SiteProps) {
  const mode = t.mode as Exclude<ViewMode, "ground">;
  const look = MINI[mode];
  const ms = t.modelScale;
  const at = useMemo(() => new Map(tanks.map((x) => [x.facility_id, modelPos(t, x)])), [t, tanks]);
  const centres = useMemo(() => new Map(clusters.map((c) => [c.system_id, modelPos(t, c)])), [t, clusters]);
  const hitR = useMemo(() => hitRadius([...at.values()], mode === "table" ? 2.6 : 3.4), [at, mode]);
  const wells = useMemo(() => new Map(facilities.map((f) => [f.facility_id, f.well_ids.length])), [facilities]);

  // Pumpjacks in their own scaled group (a miniature's units are smaller than life beside the tank).
  const jacks = useMemo<JackItem[]>(() => tanks.flatMap((tank) => {
    const p = at.get(tank.facility_id)!, c = centres.get(tank.system_id) ?? p;
    const running = states.get(tank.facility_id)?.tone !== "alert";
    return miniJacks(tank.facility_id, p, c, wells.get(tank.facility_id) ?? 0, look.jackR)
      .map((j) => ({ x: j.x / look.jackScale, z: j.z / look.jackScale, yaw: j.yaw, phase: j.phase, running }));
  }), [tanks, at, centres, states, wells, look]);
  const pipes = useMemo(() => {
    const ok: V3[][] = [], failed: V3[][] = [];
    for (const tank of tanks) {
      const path = miniPipe(at.get(tank.facility_id)!, centres.get(tank.system_id) ?? at.get(tank.facility_id)!);
      if (path) (states.get(tank.facility_id)?.tone === "alert" ? failed : ok).push(path);
    }
    return { ok, failed };
  }, [tanks, at, centres, states]);

  return (
    <group name="site-mini" scale={ms}>
      {tanks.map((tank) => (
        <MiniTank
          key={tank.facility_id} id={tank.facility_id} at={at.get(tank.facility_id)!} s={states.get(tank.facility_id)} hitR={hitR}
          beaconSize={look.beaconM / ms} pillarM={look.pillarM / ms} selected={selected === tank.facility_id} hovered={hovered === tank.facility_id}
          top={top === tank.facility_id} faked={faked.has(tank.facility_id)} still={still} inXR={inXR}
          onSelect={onSelect} onHover={onHover}
        />
      ))}
      <group scale={look.jackScale}>
        <Pumpjacks items={jacks} shadow={mode === "overview"} />
      </group>
      <PipeBundle paths={pipes.ok} flowing radius={look.pipeR} dashSpacing={2.2} speed={1.4} />
      <PipeBundle paths={pipes.failed} flowing={false} failed radius={look.pipeR} />
      {clusters.map((c, i) => {
        const p = centres.get(c.system_id)!;
        return (
          <group key={c.system_id} position={[p.x, 0, p.z]} scale={mode === "table" ? 0.8 : 1}>
            <FlareStackModel seed={FLARE_SEED * (i + 1)} still={still} />
          </group>
        );
      })}
      {Object.entries(waves).map(([id, n]) => {
        const p = at.get(id);
        // The attack moment's ring in warn amber with an alert echo: it must stand out on the
        // cyan holo table, where a holo ring had no contrast.
        return p ? <Shockwave key={id} origin={[p.x, 0.1, p.z]} trigger={n} radius={look.waveM / ms} color={C.warn} accent={C.alert} wall={look.wallK} still={still} /> : null;
      })}
    </group>
  );
}

// A warm light over the life-size pad. Always mounted (intensity 0 off the pad), so changing view
// never changes the scene's light count, and no material recompiles mid-fade.
export function PadLamp({ on }: { on: boolean }) {
  return <pointLight color={C.duskGlow} intensity={on ? 30 : 0} distance={52} decay={1.3} position={[-1.5, 11, 6]} />;
}

export function GroundSite({ t, facilities, tanks, clusters, states, selected, hovered, faked, waves, still, inXR, originYaw, onSelect, onHover }: SiteProps) {
  const focus = t.focus;
  const facility = facilities.find((f) => f.facility_id === focus);
  const s = focus ? states.get(focus) : undefined;
  const failed = s?.tone === "alert";
  const sys = useMemo(() => groundSystem(t, clusters, tanks, groundHeight), [t, clusters, tanks]);
  const markers = useMemo(() => groundMarkers(t, tanks), [t, tanks]);
  // Every other facility: a light on the horizon in its state's color.
  const lights = useMemo<GlowItem[]>(() => markers.map((m) => ({
    p: [m.light[0], groundHeight(m.light[0], m.light[2]) + 9, m.light[2]] as V3,
    size: 26,
    color: new Color(TONE_COLOR[states.get(m.facility_id)?.tone ?? "ok"]),
  })), [markers, states]);
  const pick = usePick(focus ?? "", inXR, onSelect, onHover);
  if (!facility || !focus) return null;
  return (
    <group name="site-ground">
      <group {...pick}>
        <FacilityModel
          facility={facility} state={s} fill={s?.fill ?? null} faked={faked.has(focus)}
          selected={selected === focus} hovered={hovered === focus} still={still}
          onSelect={(id) => onSelect(id)} onHover={onHover}
        >
          <group position={[0, TANK.railY + 0.4, 0]}>
            <AlarmBeacon active={faked.has(focus)} size={MINI.ground.beaconM} still={still} light={false} />
          </group>
        </FacilityModel>
      </group>
      <Shockwave origin={[0, 0.08, 0]} trigger={waves[focus] ?? 0} radius={MINI.ground.waveM} color={C.warn} accent={C.alert} wall={MINI.ground.wallK} still={still} />
      <GroundTeleport still={still} yaw={originYaw} />
      {sys && <PipeModel points={sys.pipe} flowing={!failed} failed={failed} radius={0.16} />}
      {sys && (
        <group position={sys.flare} scale={1.8}>
          <FlareStackModel seed={FLARE_SEED} still={still} />
        </group>
      )}
      <Glows items={lights} />
    </group>
  );
}
