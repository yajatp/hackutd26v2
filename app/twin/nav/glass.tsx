"use client";
// Canvas textures for the menu and the dashboard, drawn once the theme's fonts have loaded (so the
// headset never shows a fallback face) and redrawn only when what they say changes.
import { useEffect, useMemo, useState } from "react";
import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";
import { navFontsReady, paintGlow, type Ctx } from "./paint";

export function useNavFonts(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    navFontsReady().then(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  return ready;
}

export interface Painted<M> { texture: CanvasTexture; meta: M; w: number; h: number }

// A painter turns a plain spec into pixels and returns what the scene needs to know about them
// (where a button landed). Painters live at module level, so the memo keys only on the spec.
export interface Painter<S, M> {
  size(spec: S): { w: number; h: number };
  paint(ctx: Ctx, spec: S, w: number, h: number): M;
}

export function makeTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  t.minFilter = LinearFilter;          // no mipmaps: crisp text and no NPOT surprises
  t.generateMipmaps = false;
  return t;
}

export function usePainted<S, M>(painter: Painter<S, M>, spec: S): Painted<M> | null {
  const ready = useNavFonts();
  const key = JSON.stringify(spec);
  const out = useMemo(() => {
    if (!ready || typeof document === "undefined") return null;
    const s = JSON.parse(key) as S;
    const { w, h } = painter.size(s);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(w));
    canvas.height = Math.max(2, Math.round(h));
    const ctx = canvas.getContext("2d")!;
    const meta = painter.paint(ctx, s, canvas.width, canvas.height);
    return { texture: makeTexture(canvas), meta, w: canvas.width, h: canvas.height };
  }, [painter, key, ready]);
  useEffect(() => () => out?.texture.dispose(), [out]);
  return out;
}

// One soft glow texture per shape (aspect and corner), shared by every button of that shape.
const glows = new Map<string, CanvasTexture>();
export function glowTexture(wPx: number, hPx: number, padPx: number, r: number): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const key = `${wPx}x${hPx}:${padPx}:${r}`;
  let t = glows.get(key);
  if (!t) {
    const canvas = document.createElement("canvas");
    canvas.width = wPx;
    canvas.height = hPx;
    paintGlow(canvas.getContext("2d")!, wPx, hPx, padPx, r);
    t = makeTexture(canvas);
    glows.set(key, t);
  }
  return t;
}
