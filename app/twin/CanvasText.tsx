"use client";
// Text inside the 3D scene for immersive VR, where page DOM is not visible. Drawn in Hanken Grotesk, with IBM Plex Mono for labels (served
// from /fonts by app/fonts.css, so no CDN) onto a 2D canvas and used as a texture. Nothing is drawn
// until those faces have loaded, so the headset never shows a fallback font.
// Cards are the night page's language: night at 92%, square corners, moonlight hairlines.
import { useEffect, useMemo, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, ShaderMaterial, SRGBColorSpace, type Material } from "three";
import { glitchFrame } from "@/app/vr/field";

// `size` is in texture px; on a card drawn at pxPerM px per meter, a row is size / pxPerM meters tall.
export interface TextRow {
  text: string;
  color: string;
  size: number;
  face?: "head" | "body";       // head: IBM Plex Mono; body (default): Hanken Grotesk
  weight?: 400 | 500 | 600 | 700;
  bold?: boolean;               // shorthand for weight 600
  gap?: number;                 // extra space above the row, px
  rule?: string;                // a hairline above the row, in this color
  swatch?: string;              // a small square of this color before the text; "ring" draws a ring
  right?: string;               // more text on the same line, set flush right (a cost, a count)
}

interface Spec {
  rows: TextRow[];
  widthPx: number;
  heightPx: number | null;      // null: as tall as the wrapped text
  padPx: number;
  bg: string;
  border: string | null;
  borderPx: number;
  align: "center" | "left";
  fit: boolean;                 // shrink the card to its longest line
}

export const MAX_TEX_PX = 1024;          // label and card textures stay at most this wide
export const CARD_BG = "rgba(19, 21, 24, 0.96)";   // Sui panel #131518
const BODY = '"Hanken Grotesk", "Helvetica Neue", Arial, system-ui, sans-serif';
const HEAD = '"IBM Plex Mono", ui-monospace, Menlo, monospace';   // small labels and figures
const LEAD = 1.28;                       // row pitch, in font sizes

let fontsLoading: Promise<void> | null = null;

// Loads every face the cards use (from /fonts, declared in app/fonts.css). Resolves once,
// also on failure, so a missing file still lets the text draw.
export function fontsReady(): Promise<void> {
  fontsLoading ??= Promise.all([
    document.fonts.load('400 64px "IBM Plex Mono"'),
    document.fonts.load('500 64px "IBM Plex Mono"'),
    document.fonts.load('400 64px "Hanken Grotesk"'),
    document.fonts.load('500 64px "Hanken Grotesk"'),
    document.fonts.load('600 64px "Hanken Grotesk"'),
    document.fonts.load('700 64px "Hanken Grotesk"'),
  ]).then(() => undefined, () => undefined);
  return fontsLoading;
}

export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    fontsReady().then(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  return ready;
}

const fontOf = (r: TextRow, size = r.size) =>
  `${r.face === "head" ? Math.min(500, r.weight ?? (r.bold ? 500 : 400)) : r.weight ?? (r.bold ? 600 : 400)} ${size}px ${r.face === "head" ? HEAD : BODY}`;

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      out.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  out.push(line);
  return out;
}

function draw({ rows, widthPx, heightPx, padPx, bg, border, borderPx, align, fit }: Spec): CanvasTexture {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const swatchW = (r: TextRow) => (r.swatch ? Math.round(r.size * 1.25) : 0);
  const rightW = (r: TextRow) => {
    if (!r.right) return 0;
    ctx.font = fontOf(r);
    return ctx.measureText(r.right).width + r.size;
  };
  const inner = widthPx - 2 * padPx;
  const lines: { r: TextRow; text: string; size: number; first: boolean }[] = [];
  for (const r of rows) {
    ctx.font = fontOf(r);
    if (heightPx === null) {
      const side = swatchW(r) + rightW(r);
      ctx.font = fontOf(r);
      wrap(ctx, r.text, inner - side).forEach((text, i) => lines.push({ r, text, size: r.size, first: i === 0 }));
    } else {
      // Fixed box: one line per row, shrunk to fit the width if it must.
      const w = ctx.measureText(r.text).width + swatchW(r);
      lines.push({ r, text: r.text, size: w > inner ? Math.floor((r.size * inner) / w) : r.size, first: true });
    }
  }
  let width = widthPx;
  if (fit) {
    let longest = 0;
    for (const l of lines) {
      ctx.font = fontOf(l.r, l.size);
      longest = Math.max(longest, ctx.measureText(l.text).width + swatchW(l.r));
    }
    width = Math.min(widthPx, Math.ceil(longest + 2 * padPx));
  }
  const pitch = (l: (typeof lines)[number]) => l.r.size * LEAD + (l.first ? l.r.gap ?? 0 : 0);
  const textH = lines.reduce((s, l) => s + pitch(l), 0);
  const height = heightPx ?? Math.ceil(2 * padPx + textH);
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = borderPx;
    ctx.strokeRect(borderPx / 2, borderPx / 2, width - borderPx, height - borderPx);
  }
  ctx.textBaseline = "middle";
  let y = (height - textH) / 2;
  for (const l of lines) {
    const { r, text, size } = l;
    if (l.first && r.gap) y += r.gap;
    if (l.first && r.rule) {
      ctx.fillStyle = r.rule;
      ctx.fillRect(padPx, Math.round(y - (r.gap ?? 0) / 2) - 1, width - 2 * padPx, Math.max(2, Math.round(borderPx)));
    }
    const mid = y + (r.size * LEAD) / 2;
    const sw = swatchW(r);
    let x = align === "center" ? width / 2 : padPx;
    if (r.swatch && l.first) {
      const s = Math.round(r.size * 0.62);
      const sx = align === "center" ? width / 2 - (ctx.measureText(text).width + sw) / 2 : padPx;
      if (r.swatch === "ring") {
        ctx.strokeStyle = r.color;
        ctx.lineWidth = Math.max(2, Math.round(s / 6));
        ctx.beginPath();
        ctx.arc(sx + s / 2, mid, s / 2 - ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = r.swatch;
        ctx.fillRect(sx, Math.round(mid - s / 2), s, s);
      }
    }
    ctx.font = fontOf(r, size);
    ctx.fillStyle = r.color;
    ctx.textAlign = align;
    if (align === "left") x += sw;
    else x += sw / 2;
    ctx.fillText(text, x, mid);
    if (r.right && l.first) {
      ctx.textAlign = "right";
      ctx.fillText(r.right, width - padPx, mid);
    }
    y += r.size * LEAD;
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// The faked tank's label: horizontal bands of the texture pushed sideways on the /vr glitch
// cadence (glitchFrame). One texture read; uFrame < 0 draws the label clean.
const GLITCH_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const GLITCH_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uFrame;
uniform float uOpacity;
varying vec2 vUv;
float hash(float a, float b) { return fract(sin(a * 12.9898 + b * 78.233) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  if (uFrame >= 0.0) {
    float band = floor(uv.y * 6.0 + hash(uFrame, 1.0) * 0.8);
    float g = hash(band + 3.0, uFrame);
    uv.x += g < 0.5 ? (g / 0.5 - 0.5) * 0.07 : 0.0;
  }
  vec4 c = texture2D(map, uv);
  c.a *= step(0.0, uv.x) * step(uv.x, 1.0);
  gl_FragColor = vec4(c.rgb, c.a * uOpacity);
  #include <colorspace_fragment>
}`;

// A flat card of text `worldWidth` meters wide (at most; `fit` shrinks it to the text). With
// `worldHeight` the card is exactly that tall (one line per row); otherwise the rows wrap and the
// card is as tall as its text. `anchor` says which edge sits on the card's origin. `fade` (0..1),
// read every frame, sets its opacity without a re-render.
export function CanvasCard({
  rows, worldWidth, worldHeight, pxPerM = 1600, padM = 0.012, bg = CARD_BG, border = null, borderM = 0.0012,
  anchor = "center", align = "center", fit = false, glitch = false, still = false, fade,
}: {
  rows: TextRow[]; worldWidth: number; worldHeight?: number; pxPerM?: number; padM?: number; bg?: string;
  border?: string | null; borderM?: number; anchor?: "center" | "bottom" | "top"; align?: "center" | "left";
  fit?: boolean; glitch?: boolean; still?: boolean; fade?: RefObject<number>;
}) {
  const ready = useFontsReady();
  // Never wider than MAX_TEX_PX: a wide card draws at fewer px per meter, same size in the world.
  const ppm = Math.min(pxPerM, MAX_TEX_PX / worldWidth);
  const k = ppm / pxPerM;
  const spec = JSON.stringify({
    rows: rows.map((r) => ({ ...r, size: Math.round(r.size * k), gap: r.gap === undefined ? undefined : Math.round(r.gap * k) })),
    bg, border, align, fit,
    borderPx: Math.max(2, Math.round(borderM * ppm)),
    widthPx: Math.min(MAX_TEX_PX, Math.round(worldWidth * ppm)),
    heightPx: worldHeight === undefined ? null : Math.round(worldHeight * ppm),
    padPx: Math.round(padM * ppm),
  } satisfies Spec);
  const texture = useMemo(() => (ready ? draw(JSON.parse(spec) as Spec) : null), [spec, ready]);
  useEffect(() => () => texture?.dispose(), [texture]);
  const glitchMat = useMemo(() => (glitch && texture ? new ShaderMaterial({
    uniforms: { map: { value: texture }, uFrame: { value: -1 }, uOpacity: { value: 1 } },
    vertexShader: GLITCH_VERT, fragmentShader: GLITCH_FRAG, transparent: true, depthWrite: false,
  }) : null), [glitch, texture]);
  useEffect(() => () => glitchMat?.dispose(), [glitchMat]);

  useFrame((state) => {
    if (glitchMat) {
      const f = glitchFrame(state.clock.elapsedTime * 1000, still);
      glitchMat.uniforms.uFrame.value = f === null ? -1 : f % 997;
      glitchMat.uniforms.uOpacity.value = fade?.current ?? 1;
    }
  });

  if (!texture) return null;
  const img = texture.image as HTMLCanvasElement;
  const w = img.width / ppm, h = img.height / ppm;
  const y = anchor === "bottom" ? h / 2 : anchor === "top" ? -h / 2 : 0;
  return (
    <mesh position={[0, y, 0]} renderOrder={2}>
      <planeGeometry args={[w, h]} />
      {glitchMat ? <primitive object={glitchMat} attach="material" /> : <FadingBasic texture={texture} fade={fade} />}
    </mesh>
  );
}

function FadingBasic({ texture, fade }: { texture: CanvasTexture; fade?: RefObject<number> }) {
  const [mat, setMat] = useState<Material | null>(null);
  useFrame(() => { if (mat && fade) mat.opacity = fade.current ?? 1; });
  return <meshBasicMaterial ref={setMat} map={texture} transparent toneMapped={false} depthWrite={false} fog={false} />;
}
