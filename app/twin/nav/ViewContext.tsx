"use client";
// Which of the three views the judge is in, and the comfortable way between
// them: fade to the night sky (skyZenith) over FADE_MS, switch while dark, fade back. The camera
// never glides on its own. Mount <ViewProvider> around the page (it works outside the Canvas too:
// r3f bridges the context in); mount <ViewFade /> at the scene root and <ViewOrigin /> inside <XR>.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { XROrigin } from "@react-three/xr";
import { BackSide, type Mesh, type MeshBasicMaterial } from "three";
import { useAvonConsole, type SiteFacility } from "@/lib/live";
import { C, FADE_MS, type ViewMode } from "../theme";
import { fadeAlpha, HOLD_MS, IDLE_FADE, type FadeClock } from "./motion";
import { clampToPad, pickFocus, siteTransform, type SiteTransform, type V3, type XZ } from "./views";

export const TELEPORT_FADE_MS = Math.round(FADE_MS * 0.5);   // a teleport is a quick blink

export interface ViewApi {
  mode: ViewMode;
  focus: string | null;                  // ground: the facility pad the judge is on
  busy: boolean;                         // a fade is running; setMode is ignored until it ends
  setMode(mode: ViewMode, focus?: string | null): boolean;   // false when busy
  transform: SiteTransform;              // where the site goes in this view (views.ts)
  stand: V3;                             // the judge's feet: the view's start, or the last teleport
  faceYaw: number;
  teleport(point: XZ): void;             // ground only: jump to a point on the pad (quick blink)
  dashboard: boolean;
  setDashboard(open: boolean): void;
  toggleDashboard(): void;
  comfort: boolean;                      // the menu's comfort setting: motion effects off (see useStill)
  setComfort(on: boolean): void;
  fade: RefObject<FadeClock>;            // read every frame by <ViewFade />
}

const ViewContext = createContext<ViewApi | null>(null);

export function useView(): ViewApi {
  const v = useContext(ViewContext);
  if (!v) throw new Error("useView() must be inside <ViewProvider>");
  return v;
}

export function ViewProvider({ children, initialMode = "table", initialDashboard = false, facilities: given }: {
  children: ReactNode;
  initialMode?: ViewMode;
  initialDashboard?: boolean;
  facilities?: SiteFacility[];           // default: the live site from useAvonConsole()
}) {
  const live = useAvonConsole();
  const facilities = given ?? live.facilities;
  const [mode, setModeNow] = useState<ViewMode>(initialMode);
  const [focus, setFocus] = useState<string | null>(null);
  const [teleported, setTeleported] = useState<V3 | null>(null);
  const [busy, setBusy] = useState(false);
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [comfort, setComfort] = useState(false);
  const fade = useRef<FadeClock>(IDLE_FADE);
  const busyRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The latest site and view, for resolving a focus at the moment of the switch.
  const latest = useRef({ facilities, view: live.view, focus });
  latest.current = { facilities, view: live.view, focus };

  useEffect(() => () => { for (const t of timers.current) clearTimeout(t); }, []);

  // Out, hold, in. setTimeout (not requestAnimationFrame): window rAF pauses in an immersive session.
  const run = useCallback((ms: number, apply: () => void) => {
    busyRef.current = true;
    setBusy(true);
    const later = (f: () => void, t: number) => { timers.current.push(setTimeout(f, t)); };
    fade.current = { phase: "out", t0: performance.now(), ms };
    later(() => {
      apply();
      fade.current = { phase: "hold", t0: performance.now(), ms };
      later(() => {
        fade.current = { phase: "in", t0: performance.now(), ms };
        later(() => {
          fade.current = IDLE_FADE;
          busyRef.current = false;
          timers.current = [];
          setBusy(false);
        }, ms);
      }, HOLD_MS);
    }, ms);
  }, []);

  const setMode = useCallback((m: ViewMode, f?: string | null) => {
    if (busyRef.current) return false;
    run(FADE_MS, () => {
      const { facilities: fs, view, focus: was } = latest.current;
      // Ground resolves its pad now (asked-for, else the current one, else the top problem), so a
      // new top problem in the live data never moves the judge without a fade.
      setFocus(m === "ground" ? pickFocus(fs, f === undefined ? was : f, view) : f === undefined ? was : f);
      setModeNow(m);
      setTeleported(null);
    });
    return true;
  }, [run]);

  const teleport = useCallback((p: XZ) => {
    if (busyRef.current) return;
    run(TELEPORT_FADE_MS, () => setTeleported(clampToPad(p)));
  }, [run]);

  const toggleDashboard = useCallback(() => setDashboard((o) => !o), []);

  const transform = useMemo(() => siteTransform(mode, focus, facilities), [mode, focus, facilities]);
  const stand = mode === "ground" && teleported ? teleported : transform.stand;

  const value = useMemo<ViewApi>(() => ({
    mode, focus: transform.focus, busy, setMode, transform, stand, faceYaw: transform.faceYaw, teleport,
    dashboard, setDashboard, toggleDashboard, comfort, setComfort, fade,
  }), [mode, transform, busy, setMode, stand, teleport, dashboard, toggleDashboard, comfort]);

  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

// Motion effects off: prefers-reduced-motion, or the menu's comfort setting. Every animated part
// (beacon spin, shockwave, glitch tearing, the menu's easing) reads this; static states stay.
export function useStill(): boolean {
  const comfort = useContext(ViewContext)?.comfort ?? false;
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduced(m.matches);
    read();
    m.addEventListener("change", read);
    return () => m.removeEventListener("change", read);
  }, []);
  return reduced || comfort;
}

// The fade: an inside-out sphere around the judge's head, drawn over everything in skyZenith.
// Mount it at the scene root (not inside a moved or scaled group).
export function ViewFade({ radius = 0.35 }: { radius?: number }) {
  const { fade } = useView();
  const mesh = useRef<Mesh>(null);
  const mat = useRef<MeshBasicMaterial>(null);
  useFrame(({ camera }) => {
    const m = mesh.current, k = mat.current;
    if (!m || !k) return;
    const a = fadeAlpha(fade.current, performance.now());
    m.visible = a > 0.002;
    if (!m.visible) return;
    camera.getWorldPosition(m.position);
    k.opacity = a;
  });
  return (
    <mesh ref={mesh} renderOrder={10_000} frustumCulled={false} visible={false}>
      <sphereGeometry args={[radius, 24, 16]} />
      <meshBasicMaterial ref={mat} color={C.skyZenith} side={BackSide} transparent opacity={0} depthTest={false} depthWrite={false} fog={false} toneMapped={false} />
    </mesh>
  );
}

// The judge's feet in the headset: the view's stand point (or the last teleport), facing its yaw.
// `yaw` adds a turn (the thumbstick's snap turn in the overview and Walk views).
// Wraps @react-three/xr's <XROrigin>; render it once inside <XR>.
export function ViewOrigin({ children, yaw = 0 }: { children?: ReactNode; yaw?: number }) {
  const { stand, faceYaw } = useView();
  return <XROrigin position={stand} rotation-y={faceYaw + yaw}>{children}</XROrigin>;
}
