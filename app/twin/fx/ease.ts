"use client";
// Smooth motion helpers for hover and selection. Values ease every frame without a React render:
// read `.current` inside your own useFrame. `still` (reduced motion, comfort) jumps straight there.
import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, type Object3D } from "three";
import { approach } from "./motion";

export type Vec3 = readonly [number, number, number];

// useEase(0.3, 150) -> ref whose .current eases to 0.3 (95% there after 150 ms).
// useEase([x, y, z], 200) -> ref to a Vector3 easing to that point.
export function useEase(target: number, ms: number, still?: boolean): RefObject<number>;
export function useEase(target: Vec3, ms: number, still?: boolean): RefObject<Vector3>;
export function useEase(target: number | Vec3, ms: number, still = false): RefObject<number> | RefObject<Vector3> {
  const scalar = typeof target === "number";
  const goal = useRef(new Vector3());
  if (scalar) goal.current.set(target, 0, 0);
  else goal.current.set(target[0], target[1], target[2]);
  const vec = useRef<Vector3 | null>(null);
  vec.current ??= goal.current.clone();           // starts where it is told, no ease from zero
  const num = useRef<number>(goal.current.x);
  useFrame((_, dt) => {
    const v = vec.current!, g = goal.current, d = Math.min(dt, 0.1) * 1000, s = still ? 0 : ms;
    v.set(approach(v.x, g.x, d, s), approach(v.y, g.y, d, s), approach(v.z, g.z, d, s));
    num.current = v.x;
  });
  return scalar ? num : (vec as RefObject<Vector3>);
}

export const POLISH_MS = 150;

// Hover and selection on one object: a hovered thing rises `lift` and grows by `grow`; a selected
// one stays up and breathes a little. Put it on an inner group whose rest transform is identity
// (it writes that group's position.y and scale). Returns the eased 0..1 "attention" for glows.
export function usePolish(target: RefObject<Object3D | null>, { hovered, selected = false, lift = 0.006, grow = 0.05, ms = POLISH_MS, still = false }: {
  hovered: boolean; selected?: boolean; lift?: number; grow?: number; ms?: number; still?: boolean;
}): RefObject<number> {
  const k = useRef(0);
  useFrame((state, dt) => {
    k.current = approach(k.current, hovered || selected ? 1 : 0, Math.min(dt, 0.1) * 1000, still ? 0 : ms);
    const o = target.current;
    if (!o) return;
    const breathe = selected && !still ? 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 2.6) : 0;
    o.position.y = lift * k.current;
    o.scale.setScalar(1 + grow * k.current + grow * 0.3 * breathe);
  });
  return k;
}
