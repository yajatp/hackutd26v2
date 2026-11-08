"use client";
// A flat Sui-style button in the scene (canvas texture on a plane): dark panel, thin border, white
// label; the primary one is solid Sui blue. Hover turns the border blue. No glow.
import { useEffect, useMemo, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { canvasTexture, loadFonts, SUI, write } from "../usmap/paint";

export function useFonts(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => { let live = true; loadFonts().then(() => { if (live) setOk(true); }); return () => { live = false; }; }, []);
  return ok;
}

// Word-wraps `s` into lines no wider than maxW at the current ctx.font.
export function wrap(ctx: CanvasRenderingContext2D, s: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of s.split(/\s+/)) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxW) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

export function fill(ctx: CanvasRenderingContext2D, W: number, H: number, bg: string, edge: string, edgePx: number, r: number) {
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  ctx.roundRect(edgePx / 2, edgePx / 2, W - edgePx, H - edgePx, r);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = edgePx;
  ctx.strokeStyle = edge;
  ctx.stroke();
}

const PX = 560, PY = 130;
export function Button3D({ name, label, primary = false, width = 0.22, onPress, position, rotation }: {
  name: string; label: string; primary?: boolean; width?: number; onPress(): void;
  position?: [number, number, number]; rotation?: [number, number, number];
}) {
  const fonts = useFonts();
  const [hot, setHot] = useState(false);
  const tex = useMemo(() => canvasTexture(PX, PY, (ctx) => {
    const bg = primary ? (hot ? "#4DA1FF" : SUI.blue) : SUI.panel;
    const edge = primary ? bg : hot ? SUI.blue : SUI.raised;
    fill(ctx, PX, PY, bg, edge, 4, 22);
    if (!fonts) return;
    ctx.font = `600 44px "Hanken Grotesk", system-ui, sans-serif`;
    const w = Math.min(PX - 60, ctx.measureText(label).width);
    write(ctx, label, (PX - w) / 2, PY / 2 + 2, { size: 44, weight: 600, color: primary ? SUI.white : hot ? SUI.blue : SUI.white, maxW: PX - 60 });
  }), [fonts, hot, primary, label]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh
      name={name} position={position} rotation={rotation} renderOrder={50}
      onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onPress(); }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHot(true); }}
      onPointerOut={() => setHot(false)}
    >
      <planeGeometry args={[width, (width * PY) / PX]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} fog={false} depthTest={false} />
    </mesh>
  );
}
