"use client";
// The environment every view of /twin stands in (docs/TWIN-THEME.md), on the sky clock (Sun 06:05):
// the sky follows the site's real local time (clock.ts; the site from ?site=, Midland by default).
// Noon is a clear blue sky with the sun's disc and bright daylight; midnight a pitch-black sky with
// 2500 stars, a faint milky band and a moon; dawn and dusk warm gradients between (sky.ts skyLook).
// A 2 km desert of gentle tan dunes; mesas on the horizon in the sky's haze; far rigs between
// them; sodium lamps at the pads after dark. Under 15 draw calls in all (about 9 with pads).
// `?skyAt=HH:MM` pins the site's clock (for checks and screenshots); there is no slider.
//
// World owns, while mounted: the scene fog (in the horizon's color, per view mode), the scene
// background (the sky's zenith, the color views fade through), the sun-or-moon and hemisphere
// lights, and the camera's far plane (raised to WORLD_FAR if it is nearer). Remove any other fog
// or global light the canvas had. It expects a `flat` canvas (no tone mapping), as /twin uses.
// Its frame: x east, y up, -z north, meters, the judge's start at the origin, the ground at y = 0
// and flat within FLAT_R (45 m). Put the World group inside whatever turns for the snap turn, and
// the sky, the moon and the dusk turn with it.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useThree } from "@react-three/fiber";
import { Color, Fog, type DirectionalLight, type Group, type Object3D, type PerspectiveCamera } from "three";
import { SIZE, type ViewMode } from "../theme";
import { LOOK, skyLook, WORLD_FAR, type SkyLook, type V3 } from "./sky";
import { atLocal, localLabel, moonFor, sitePlace, sunAt } from "./clock";
import { DESERT } from "./Ground";
import { lit, RIM, setNight } from "../models/shaders";
import { type XZ } from "./terrain";
import { SkyDome, Stars, type SkyState } from "./Sky";
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
function useAtmosphere(fogColor: Color, near: number, far: number, background: string) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const [fog] = useState(() => new Fog("#000000", 40, 700));
  const [bg] = useState(() => new Color("#000000"));
  useEffect(() => {
    const prevFog = scene.fog, prevBg = scene.background;
    scene.fog = fog;
    scene.background = bg;
    return () => { scene.fog = prevFog; scene.background = prevBg; };
  }, [scene, fog, bg]);
  useEffect(() => { bg.set(background); }, [bg, background]);
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

// The sky clock: the site's real local time, re-read every 15 s (the minute, and the site in the
// URL, which the entry map may change without a reload). One state change a minute at most.
function readSky(): { site: string | null; at: [number, number] | null } {
  if (typeof window === "undefined") return { site: null, at: null };
  const q = new URLSearchParams(window.location.search);
  const m = /^(\d{1,2}):?(\d{2})?$/.exec(q.get("skyAt") ?? "");
  return { site: q.get("site"), at: m ? [Math.min(23, Number(m[1])), Math.min(59, Number(m[2] ?? 0))] : null };
}
export interface SkyClock extends SkyState { elDeg: number; label: string; zone: string; site: string }
declare global { interface Window { __sky?: SkyClock } }

export function useSkyClock(): SkyClock {
  const key = () => `${typeof window === "undefined" ? "" : window.location.search}|${Math.floor(Date.now() / 60_000)}`;
  const [tick, setTick] = useState(key);
  useEffect(() => {
    const on = () => setTick(key());
    const id = window.setInterval(on, 15_000);
    window.addEventListener("popstate", on);
    window.addEventListener("avon:site", on);   // the US map picked a site (TwinScreen)
    return () => { window.clearInterval(id); window.removeEventListener("popstate", on); window.removeEventListener("avon:site", on); };
  }, []);
  return useMemo(() => {
    void tick;
    const { site, at } = readSky();
    const place = sitePlace(site);
    const date = at ? atLocal(new Date(), place.zone, at[0], at[1]) : new Date();
    const sun = sunAt(date, place.lat, place.lon);
    const clock: SkyClock = {
      look: skyLook(sun.elDeg), sunDir: sun.dir, moonDir: moonFor(sun),
      elDeg: sun.elDeg, label: localLabel(date, place.zone), zone: place.zone, site: place.key,
    };
    if (process.env.NODE_ENV !== "production") window.__sky = clock;
    return clock;
  }, [tick]);
}

// The key light: the sun while it is up (and just after it sets), the moon after dark. Both are
// zero at -4 degrees, so the switch never jumps. Its position never dips under the horizon.
function keyLight(look: SkyLook, el: number, sunDir: V3, moonDir: V3) {
  const sun = el > -4;
  const d = sun ? sunDir : moonDir;
  const y = Math.max(0.08, d[1]);
  const k = 200 / Math.hypot(d[0], y, d[2]);
  return {
    color: sun ? look.sun : MOON_LIGHT,
    intensity: sun ? look.sunI : look.moonI,
    position: [d[0] * k, y * k, d[2] * k] as V3,
  };
}
const MOON_LIGHT = "#c9d5ee";
const NIGHT_RIM = "#34425e";

export function World({ mode, pads = NO_PADS, padScale = 1, still, maxRealLights = 4, posts }: WorldProps) {
  const reduced = useReducedMotion();
  const calm = still ?? reduced;
  const look = LOOK[mode];
  const sky = useSkyClock();
  const L = sky.look;
  const night = L.stars;
  // A clear day sees farther than the night.
  const fogFar = look.fogFar * (1 + 0.6 * (1 - night));
  const fogColor = useMemo(() => new Color(L.fog).multiplyScalar(look.fogDim), [L.fog, look.fogDim]);
  useAtmosphere(fogColor, look.fogNear, fogFar, L.zenith);
  const key = useRef<DirectionalLight>(null);
  const target = useRef<Object3D>(null);
  // The sky, the 2 km of desert and the stars never take a pointer ray: the headset's pointers test
  // the whole scene every frame, and these are the most triangles in it.
  const root = useRef<Group>(null);
  useLayoutEffect(() => { root.current?.traverse((o) => { o.raycast = noRay; }); });
  useEffect(() => {
    if (key.current && target.current) key.current.target = target.current;
  }, []);
  // The table view's world is a little dimmer (LOOK.moon 1.4 of 1.7), so the table stays the hero.
  const lightK = look.moon / 1.7;
  const kl = keyLight(L, sky.elDeg, sky.sunDir, sky.moonDir);
  const keyColor = useMemo(() => new Color(kl.color), [kl.color]);
  const hemiSky = useMemo(() => new Color(L.hemiSky), [L.hemiSky]);
  const hemiGround = useMemo(() => new Color(L.hemiGround).lerp(new Color(DESERT.sodium), look.warmHemi * 0.25 * night), [L.hemiGround, look.warmHemi, night]);
  const lamps = look.dim * night;
  // The models' shared sky uniforms: lamp cones after dark, the sky's light on silhouettes.
  useEffect(() => {
    setNight(night);
    RIM.value.set(L.hemiSky).multiplyScalar(0.22).lerp(new Color(NIGHT_RIM), night);
    // Lamps, windows and screens read as lit after dark and as plain fittings in daylight.
    lit().color.setScalar(0.55 + 0.45 * night);
  }, [night, L.hemiSky]);
  return (
    <group name="world" ref={root}>
      <SkyDome dim={look.dim} still={calm} sky={sky} />
      <Stars dim={look.dim * night} still={calm} />
      <Ridges dim={look.dim} haze={L.horizon} tint={L.ridge} />
      <Ground pads={pads} padRadius={SIZE.padRadius * padScale} padGlow={look.padGlow * night}
        home={night > 0.5 ? look.home : 0} homeGlow={look.homeGlow * night} />
      <FarLights dim={look.dim * (0.2 + 0.8 * night)} still={calm} />
      <PadLights positions={pads} scale={padScale} maxReal={maxRealLights} dim={lamps} posts={posts} />
      <hemisphereLight color={hemiSky} groundColor={hemiGround} intensity={L.hemiI * (look.hemi / 1.1)} />
      <directionalLight ref={key} color={keyColor} intensity={kl.intensity * lightK} position={kl.position} />
      <object3D ref={target} />
    </group>
  );
}
