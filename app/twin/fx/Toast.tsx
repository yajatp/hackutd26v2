"use client";
// The in-VR notice (docs/TWIN-THEME.md "The attack moment", step 4): a glass card that slides up
// from below the judge's view to 1.0 m ahead at about eye level, says what happened in the
// console's words ("S9 Facility Q · tank level sensor / LYING · SIMULATED / Your confirmed plan
// rests on it"), holds 6 s with a draining bar, and slides away. It draws over every panel
// (renderOrder 40+), and an open info panel steps aside while it is up (TOAST_CLOCK). It follows the judge's head lazily while it is
// up. Several notices queue and play in turn. Mount it at the scene root (outside any turned or
// scaled group). `still`: a short fade in place, no slide, no light bar, no following.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, CanvasTexture, SRGBColorSpace, Vector3, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { C, FONT, TONE_COLOR } from "../theme";
import { glowTexture, themeFontsReady, withAlpha } from "./glow";
import { approach, toastPose, TOAST_CLOCK, TOAST_HOLD_MS } from "./motion";
import type { FxKind, FxNotice } from "./events";

const PX_PER_M = 1460;
const W_PX = 1024;
const QUEUE_MAX = 3;
const FOLLOW_MS = 700;      // lazy follow of the head while the card is up
const SLIDE_M = 0.32;       // starts this far below its place

interface Drawn { texture: CanvasTexture; w: number; h: number }

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function icon(ctx: CanvasRenderingContext2D, kind: FxKind, cx: number, cy: number, s: number, tone: string) {
  ctx.save();
  ctx.shadowColor = withAlpha(tone, 0.8);
  ctx.shadowBlur = 22;
  if (kind === "cleared") {
    ctx.strokeStyle = tone;
    ctx.lineWidth = s * 0.1;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = s * 0.12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, cy + s * 0.01);
    ctx.lineTo(cx - s * 0.05, cy + s * 0.16);
    ctx.lineTo(cx + s * 0.22, cy - s * 0.14);
    ctx.stroke();
  } else {
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.48);
    ctx.lineTo(cx + s * 0.52, cy + s * 0.42);
    ctx.lineTo(cx - s * 0.52, cy + s * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.skyZenith;
    ctx.fillRect(cx - s * 0.05, cy - s * 0.16, s * 0.1, s * 0.34);
    ctx.fillRect(cx - s * 0.05, cy + s * 0.24, s * 0.1, s * 0.1);
  }
  ctx.restore();
}

// Writes `text` from x, shrinking the font until it fits `max`. Returns the width used.
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, weight: number, family: string, px: number, max: number): number {
  let size = px;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > 18 && ctx.measureText(text).width > max) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  ctx.fillText(text, x, y);
  return ctx.measureText(text).width;
}

export function drawToast(n: FxNotice): Drawn {
  const tone = TONE_COLOR[n.tone];
  const pad = 34, bar = 12, iconS = 64;
  const x0 = bar + pad + iconS + 26;
  const max = W_PX - x0 - pad;
  const rowName = 50, rowState = 64, rowSub = n.sub ? 40 : 0;
  const top = 30;
  const yName = top + rowName * 0.62;
  const yState = yName + rowName * 0.62 + rowState * 0.68;
  const ySub = yState + rowState * 0.5 + rowSub * 0.95;
  const h = Math.ceil((n.sub ? ySub + rowSub * 0.5 : yState + rowState * 0.42) + 40);

  const canvas = document.createElement("canvas");
  canvas.width = W_PX;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const r = 22;
  // The glass, lighter at the top edge, with a hairline of holo.
  roundRect(ctx, 2, 2, W_PX - 4, h - 4, r);
  ctx.fillStyle = C.glass;
  ctx.fill();
  const sheen = ctx.createLinearGradient(0, 0, 0, h);
  sheen.addColorStop(0, withAlpha(C.holo, 0.16));
  sheen.addColorStop(0.35, withAlpha(C.holo, 0.03));
  sheen.addColorStop(1, withAlpha(tone, 0.08));
  ctx.fillStyle = sheen;
  ctx.fill();
  ctx.strokeStyle = withAlpha(C.holo, 0.5);
  ctx.lineWidth = 2;
  ctx.stroke();
  // Corner brackets: the holo layer's frame.
  ctx.strokeStyle = C.holo;
  ctx.lineWidth = 4;
  const k = 28, m = 10;
  for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [W_PX - m, m, -1, 1], [m, h - m, 1, -1], [W_PX - m, h - m, -1, -1]] as const) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * k);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx * k, cy);
    ctx.stroke();
  }
  // The state's color as a glowing bar down the left edge.
  ctx.save();
  roundRect(ctx, 2, 2, W_PX - 4, h - 4, r);
  ctx.clip();
  ctx.shadowColor = tone;
  ctx.shadowBlur = 24;
  ctx.fillStyle = tone;
  ctx.fillRect(2, 2, bar, h - 4);
  ctx.restore();

  icon(ctx, n.kind, bar + pad + iconS / 2, yName + (yState - yName) / 2, iconS, tone);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  // Row 1: where, then what (dim).
  ctx.fillStyle = C.text;
  const wName = fitText(ctx, n.name, x0, yName, 700, FONT.label, rowName, max * 0.6);
  if (n.what) {
    ctx.fillStyle = C.textDim;
    fitText(ctx, ` · ${n.what}`, x0 + wName, yName + 2, 600, FONT.label, 40, max - wName);
  }
  // Row 2: the console's state line, big, in its state color.
  ctx.save();
  ctx.shadowColor = withAlpha(tone, 0.65);
  ctx.shadowBlur = 18;
  ctx.fillStyle = tone;
  fitText(ctx, n.state, x0, yState, 700, FONT.label, rowState, max);
  ctx.restore();
  // Row 3: what it means for the judge.
  if (n.sub) {
    const subColor = n.kind === "faked" ? C.warn : n.kind === "failed" ? C.text : C.textDim;
    ctx.fillStyle = subColor;
    ctx.beginPath();
    ctx.arc(x0 + 9, ySub, 8, 0, Math.PI * 2);
    ctx.fill();
    fitText(ctx, n.sub, x0 + 28, ySub, 500, FONT.body, rowSub, max - 28);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, w: W_PX / PX_PER_M, h: h / PX_PER_M };
}

const camPos = new Vector3(), fwd = new Vector3(), goal = new Vector3();

export interface ToastProps {
  events: readonly FxNotice[];  // append-only log (useAttackFx().notices); each new seq plays once
  distance?: number;            // meters ahead of the eyes; default 1.0
  drop?: number;                // meters below eye level; default 0.05
  holdMs?: number;              // default TOAST_HOLD_MS (6 s)
  still?: boolean;
}

export function Toast({ events, distance = 1.0, drop = 0.05, holdMs = TOAST_HOLD_MS, still = false }: ToastProps) {
  const [current, setCurrent] = useState<FxNotice | null>(null);
  const [fonts, setFonts] = useState(false);
  const queue = useRef<FxNotice[]>([]);
  const showing = useRef<FxNotice | null>(null);
  const lastSeq = useRef(-1);
  const started = useRef<number | null>(null);
  const finishing = useRef(false);
  const root = useRef<Group>(null);
  const slide = useRef<Group>(null);
  const panel = useRef<MeshBasicMaterial>(null);
  const halo = useRef<MeshBasicMaterial>(null);
  const scan = useRef<Mesh>(null);
  const scanMat = useRef<MeshBasicMaterial>(null);
  const hold = useRef<Mesh>(null);
  const placed = useRef(false);
  const yaw = useRef(0);

  useEffect(() => {
    let live = true;
    themeFontsReady().then(() => { if (live) setFonts(true); });
    return () => { live = false; };
  }, []);

  // The next queued notice (or none) becomes the one on show.
  const next = useCallback(() => {
    showing.current = queue.current.shift() ?? null;
    setCurrent(showing.current);
  }, []);

  useEffect(() => {
    const fresh = events.filter((e) => e.seq > lastSeq.current);
    if (fresh.length === 0) return;
    lastSeq.current = Math.max(...fresh.map((e) => e.seq));
    queue.current = [...queue.current, ...fresh].slice(-QUEUE_MAX);
    if (!showing.current) next();
  }, [events, next]);

  const drawn = useMemo(() => (current && fonts ? drawToast(current) : null), [current, fonts]);
  useEffect(() => () => drawn?.texture.dispose(), [drawn]);
  useEffect(() => { started.current = null; finishing.current = false; placed.current = false; }, [drawn]);

  useFrame((state, dt) => {
    const g = root.current;
    if (!g) return;
    if (!drawn) { g.visible = false; TOAST_CLOCK.up = false; return; }
    const now = state.clock.elapsedTime * 1000;
    started.current ??= now;
    const p = toastPose(now - started.current, holdMs, still);
    if (p.done) {
      g.visible = false;
      TOAST_CLOCK.up = false;
      if (!finishing.current) {
        finishing.current = true;
        next();
      }
      return;
    }
    g.visible = true;
    TOAST_CLOCK.up = true;

    // Where the card wants to be: `distance` ahead on the flat, `drop` under the eyes, facing them.
    state.camera.getWorldPosition(camPos);
    state.camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    goal.copy(camPos).addScaledVector(fwd, distance);
    goal.y = camPos.y - drop;
    if (g.parent) g.parent.worldToLocal(goal);
    const wantYaw = Math.atan2(-fwd.x, -fwd.z);
    if (!placed.current) {
      placed.current = true;
      g.position.copy(goal);
      yaw.current = wantYaw;
    } else if (!still) {
      const d = Math.min(dt, 0.1) * 1000;
      g.position.set(approach(g.position.x, goal.x, d, FOLLOW_MS), approach(g.position.y, goal.y, d, FOLLOW_MS), approach(g.position.z, goal.z, d, FOLLOW_MS));
      let dy = wantYaw - yaw.current;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw.current += dy - approach(dy, 0, d, FOLLOW_MS);
    }
    g.rotation.set(-Math.atan2(drop, distance), yaw.current, 0, "YXZ");

    if (slide.current) slide.current.position.y = -SLIDE_M * p.slide;
    if (panel.current) panel.current.opacity = p.opacity;
    if (halo.current) halo.current.opacity = 0.55 * p.glow * p.opacity;
    if (scan.current && scanMat.current) {
      scan.current.visible = p.scan >= 0;
      scan.current.position.x = -drawn.w / 2 + p.scan * drawn.w;
      scanMat.current.opacity = 0.9 * (1 - p.scan) * p.opacity;
    }
    if (hold.current) {
      const inner = drawn.w - 0.06;
      hold.current.scale.x = Math.max(0.0001, p.left);
      hold.current.position.x = -inner / 2 + (inner * p.left) / 2;
    }
  });

  if (!drawn || !current) return <group ref={root} visible={false} />;
  const tone = TONE_COLOR[current.tone];
  const inner = drawn.w - 0.06;
  return (
    <group ref={root} visible={false}>
      <group ref={slide}>
        <mesh position={[0, 0, -0.004]} renderOrder={40}>
          <planeGeometry args={[drawn.w * 1.5, drawn.h * 2.4]} />
          <meshBasicMaterial ref={halo} map={glowTexture()} color={tone} transparent depthTest={false} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh renderOrder={41}>
          <planeGeometry args={[drawn.w, drawn.h]} />
          <meshBasicMaterial ref={panel} map={drawn.texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={scan} position={[0, 0, 0.001]} renderOrder={42}>
          <planeGeometry args={[0.014, drawn.h * 0.92]} />
          <meshBasicMaterial ref={scanMat} color={C.holo} transparent depthTest={false} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh ref={hold} position={[0, -drawn.h / 2 + 0.012, 0.001]} renderOrder={42}>
          <planeGeometry args={[inner, 0.0045]} />
          <meshBasicMaterial color={C.holo} transparent opacity={0.85} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
