"use client";
// Two small behaviours shared by the dock and the dashboard: keeping a group in front of the
// judge, lazily (motion.ts followYaw and followAnchor), and the hover / press / flash state of a
// pressable piece of glass, kept in refs so pointing never re-renders React.
import { useMemo, useRef, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import { ahead, followAnchor, followYaw, yawOf, type Anchor, type Follow } from "./motion";

export interface FollowOptions {
  aheadM: number;
  downM: number;
  tilt: number;                          // rotation.x so the face looks up at the eyes
  followDeg: number;
  still: boolean;
  active?: boolean;                      // false: not placed; becoming true snaps it in front of the judge
}

export function useFollowHead(root: RefObject<Group | null>, o: FollowOptions): void {
  const follow = useRef<Follow | null>(null);
  const anchor = useRef<Anchor>({ at: null, moving: false });
  const head = useMemo(() => new Vector3(), []);
  const dir = useMemo(() => new Vector3(), []);
  const wasActive = useRef(false);
  useFrame(({ camera }, dt) => {
    const g = root.current;
    const active = o.active ?? true;
    if (!g) return;
    if (!active) { wasActive.current = false; return; }
    const ms = Math.min(dt, 0.1) * 1000;
    camera.getWorldPosition(head);
    camera.getWorldDirection(dir);
    // Looking straight down gives no yaw: keep the last one.
    const flat = Math.hypot(dir.x, dir.z);
    const headYaw = flat > 0.2 || !follow.current ? yawOf(dir.x, dir.z) : follow.current.yaw;
    const h: [number, number, number] = [head.x, head.y, head.z];
    if (!wasActive.current || !follow.current) {
      follow.current = { yaw: headYaw, catching: false };
      anchor.current = { at: h, moving: false };
      wasActive.current = true;
    } else {
      follow.current = followYaw(follow.current, headYaw, ms, { followDeg: o.followDeg, still: o.still });
      anchor.current = followAnchor(anchor.current, h, ms, { catching: follow.current.catching, still: o.still });
    }
    const at = ahead(anchor.current.at!, follow.current.yaw, o.aheadM, o.downM);
    g.position.set(at[0], at[1], at[2]);
    g.rotation.set(o.tilt, follow.current.yaw, 0, "YXZ");
  });
}

export interface PressState { hover: boolean; down: boolean; flashAt: number }

// Pointer handlers for one pressable mesh. `onPress` runs on a click (trigger pulled and released
// on it, or a mouse click in 2D). The state lives in a ref for useFrame to animate.
export function usePress(onPress: () => void, enabled = true) {
  const state = useRef<PressState>({ hover: false, down: false, flashAt: -1 });
  const press = useRef(onPress);
  press.current = onPress;
  const on = useRef(enabled);
  on.current = enabled;
  const handlers = useMemo(() => {
    const cursor = (c: string) => { if (typeof document !== "undefined") document.body.style.cursor = c; };
    return {
      onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); state.current.hover = true; cursor(on.current ? "pointer" : ""); },
      onPointerOut: () => { state.current.hover = false; state.current.down = false; cursor(""); },
      onPointerDown: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); state.current.down = true; },
      onPointerUp: () => { state.current.down = false; },
      onClick: (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (!on.current) return;
        state.current.flashAt = performance.now();
        press.current();
      },
    };
  }, []);
  return { state, handlers };
}

// A raycast that never hits: for glows and decorations that must not steal the pointer.
export const NO_HIT = () => null;
