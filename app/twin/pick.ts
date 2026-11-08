"use client";
// Pointer handlers for one facility (a tank, its label, its marker): hover; select on a screen
// click (not a drag) or, in the headset, on a trigger release over the same facility within
// CLICK_MS of its press. The library's own click also needs the ray to stay on one mesh from press
// to release, which a first-time user's squeeze and hold often does not (the ray drifts from the
// tank's shell to its label or its unseen target), so the headset path checks the facility, not
// the mesh.
import { useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";

export const CLICK_MS = 1500;

export function usePick(id: string, inXR: boolean, onSelect: (id: string) => void, onHover: (id: string, on: boolean) => void) {
  const downs = useRef(new Map<number, number>());
  return useMemo(() => ({
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(id, true); if (!inXR) document.body.style.cursor = "pointer"; },
    onPointerOut: () => { onHover(id, false); document.body.style.cursor = ""; },
    onPointerDown: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); downs.current.set(e.pointerId, performance.now()); },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      const t0 = downs.current.get(e.pointerId);
      downs.current.delete(e.pointerId);
      if (inXR && t0 !== undefined && performance.now() - t0 <= CLICK_MS) { e.stopPropagation(); onSelect(id); }
    },
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (inXR || e.delta <= 6) onSelect(id); },
  }), [id, inXR, onSelect, onHover]);
}
