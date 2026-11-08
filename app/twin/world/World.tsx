"use client";
// "Permian Night" (docs/TWIN-THEME.md): the environment every view of /twin stands in. A violet
// sky with a warm dusk on the west-north-west horizon, 2500 stars and a faint milky band, a big
// gibbous moon, the odd meteor; a 2 km desert of gentle dunes; mesas on the horizon; far rigs
// blinking between them; sodium lamps at the pads. Under 15 draw calls in all (about 9 with pads).
//
// World owns, while mounted: the scene fog (in the horizon's color, per view mode), the scene
// background (C.skyZenith, the color views fade through), the moon and hemisphere lights, and
// the camera's far plane (raised to WORLD_FAR if it is nearer). Remove any other fog or global
// light the canvas had. It expects a `flat` canvas (no tone mapping), as /twin uses.
// Its frame: x east, y up, -z north, meters, the judge's start at the origin, the ground at y = 0
// and flat within FLAT_R (45 m). Put the World group inside whatever turns for the snap turn, and
// the sky, the moon and the dusk turn with it.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useThree } from "@react-three/fiber";
import { Color, Fog, type DirectionalLight, type Group, type Object3D, type PerspectiveCamera } from "three";
import { C, SIZE, type ViewMode } from "../theme";
import { LOOK, MOON_DIR, WORLD_FAR } from "./sky";
import { type XZ } from "./terrain";
import { SkyDome, Stars } from "./Sky";
import { Ground } from "./Ground";
import { FarLights, Ridges } from "./Horizon";
import { PadLights } from "./PadLights";

export interface WorldProps {
  mode: ViewMode;
  pads?: readonly XZ[];               // pad centers in this frame (meters); omit or [] on the table
  padScale?: number;                  // object scale at the pads: 1 = life size (walk view)
  still?: boolean;                    // reduced motion; default follows prefers-reduced-motion
  maxRealLights?: number;             // real point lights at the nearest lamp posts (default 4, max 6)
  posts?: readonly XZ[];              // lamp posts round each pad, real meters from its center (PadLights)
}

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribe(cb: () => void) {
  const m = window.matchMedia(REDUCED);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(REDUCED).matches, () => false);
}

const NO_PADS: readonly XZ[] = [];
const noRay = () => {};

// The fog, the background and the far plane, kept for the World's lifetime (so materials compile
// once) and handed back on unmount.
function useAtmosphere(fogColor: Color, near: number, far: number) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const [fog] = useState(() => new Fog(C.skyHorizon, 40, 700));
  useEffect(() => {
    const prevFog = scene.fog, prevBg = scene.background;
    scene.fog = fog;
    scene.background = new Color(C.skyZenith);
    return () => { scene.fog = prevFog; scene.background = prevBg; };
  }, [scene, fog]);
  useEffect(() => {
    fog.color.copy(fogColor);
    fog.near = near;
    fog.far = far;
  }, [fog, fogColor, near, far]);
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    if (!cam.isPerspectiveCamera || cam.far >= WORLD_FAR) return;
    const prev = cam.far;
    cam.far = WORLD_FAR;
    cam.updateProjectionMatrix();
    return () => { cam.far = prev; cam.updateProjectionMatrix(); };
  }, [camera]);
}

export function World({ mode, pads = NO_PADS, padScale = 1, still, maxRealLights = 4, posts }: WorldProps) {
  const reduced = useReducedMotion();
  const calm = still ?? reduced;
  const look = LOOK[mode];
  const fogColor = useMemo(() => new Color(C.skyHorizon).multiplyScalar(look.fogDim), [look.fogDim]);
  useAtmosphere(fogColor, look.fogNear, look.fogFar);
  const moon = useRef<DirectionalLight>(null);
  const target = useRef<Object3D>(null);
  // The sky, the 2 km of desert and the stars never take a pointer ray: the headset's pointers test
  // the whole scene every frame, and these are the most triangles in it.
  const root = useRef<Group>(null);
  useLayoutEffect(() => { root.current?.traverse((o) => { o.raycast = noRay; }); });
  useEffect(() => {
    if (moon.current && target.current) moon.current.target = target.current;
  }, []);
  const moonColor = useMemo(() => new Color(C.stars).lerp(new Color(C.holo), 0.08), []);
  const hemiSky = useMemo(() => new Color(C.skyHorizon).lerp(new Color(C.stars), 0.25), []);
  const hemiGround = useMemo(() => new Color(C.groundLit).lerp(new Color(C.duskGlow), look.warmHemi), [look.warmHemi]);
  return (
    <group name="world" ref={root}>
      <SkyDome dim={look.dim} still={calm} />
      <Stars dim={look.dim} still={calm} />
      <Ridges dim={look.dim} />
      <Ground pads={pads} padRadius={SIZE.padRadius * padScale} padGlow={look.padGlow} home={look.home} homeGlow={look.homeGlow} />
      <FarLights dim={look.dim} still={calm} />
      <PadLights positions={pads} scale={padScale} maxReal={maxRealLights} dim={look.dim} posts={posts} />
      <hemisphereLight color={hemiSky} groundColor={hemiGround} intensity={look.hemi} />
      <directionalLight ref={moon} color={moonColor} intensity={look.moon}
        position={[MOON_DIR[0] * 200, MOON_DIR[1] * 200, MOON_DIR[2] * 200]} />
      <object3D ref={target} />
    </group>
  );
}
