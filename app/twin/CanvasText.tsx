"use client";
// Text inside the 3D scene for immersive VR, where page DOM is not visible. Drawn with the
// system font onto a 2D canvas and used as a texture, so it needs no font download (drei's Text
// would fetch a font from a CDN).
import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";

// `size` is in texture px; on a card drawn at pxPerM px per meter, a row is size / pxPerM meters tall.
export interface TextRow { text: string; color: string; size: number; bold?: boolean }

interface Spec {
  rows: TextRow[];
  widthPx: number;
  heightPx: number | null;          // null: as tall as the wrapped text
  padPx: number;
  bg: string;
  border: string;
  align: "center" | "left";
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const LEAD = 1.3;                   // row pitch, in font sizes

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

function draw({ rows, widthPx, heightPx, padPx, bg, border, align }: Spec): CanvasTexture {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = (r: TextRow, size = r.size) => `${r.bold ? 700 : 400} ${size}px ${FONT}`;
  const inner = widthPx - 2 * padPx;
  const lines: { r: TextRow; text: string; size: number }[] = [];
  for (const r of rows) {
    ctx.font = font(r);
    if (heightPx === null) {
      for (const text of wrap(ctx, r.text, inner)) lines.push({ r, text, size: r.size });
    } else {
      // Fixed box: one line per row, shrunk to fit the width if it must.
      const w = ctx.measureText(r.text).width;
      lines.push({ r, text: r.text, size: w > inner ? Math.floor((r.size * inner) / w) : r.size });
    }
  }
  const textH = lines.reduce((s, l) => s + l.r.size * LEAD, 0);
  const height = heightPx ?? Math.ceil(2 * padPx + textH);
  canvas.width = widthPx;
  canvas.height = height;
  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = Math.max(4, Math.round(padPx / 3));
  ctx.beginPath();
  ctx.roundRect(ctx.lineWidth / 2, ctx.lineWidth / 2, widthPx - ctx.lineWidth, height - ctx.lineWidth, Math.min(16, height / 4));
  ctx.fill();
  ctx.stroke();
  ctx.textBaseline = "middle";
  ctx.textAlign = align;
  const x = align === "center" ? widthPx / 2 : padPx;
  let y = (height - textH) / 2;
  for (const { r, text, size } of lines) {
    ctx.font = font(r, size);
    ctx.fillStyle = r.color;
    ctx.fillText(text, x, y + (r.size * LEAD) / 2);
    y += r.size * LEAD;
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// A flat card of text `worldWidth` meters wide. With `worldHeight` the card is exactly that tall
// (one line per row); otherwise the rows wrap and the card is as tall as its text. `anchor` says
// which edge sits on the card's origin.
export function CanvasCard({
  rows, worldWidth, worldHeight, pxPerM = 1600, padM = 0.012, bg = "#111114", border = "#52525b",
  anchor = "center", align = "center",
}: {
  rows: TextRow[]; worldWidth: number; worldHeight?: number; pxPerM?: number; padM?: number; bg?: string; border?: string;
  anchor?: "center" | "bottom" | "top"; align?: "center" | "left";
}) {
  const spec = JSON.stringify({
    rows, bg, border, align,
    widthPx: Math.round(worldWidth * pxPerM),
    heightPx: worldHeight === undefined ? null : Math.round(worldHeight * pxPerM),
    padPx: Math.round(padM * pxPerM),
  } satisfies Spec);
  const texture = useMemo(() => draw(JSON.parse(spec) as Spec), [spec]);
  useEffect(() => () => texture.dispose(), [texture]);
  const h = (texture.image as HTMLCanvasElement).height / pxPerM;
  const y = anchor === "bottom" ? h / 2 : anchor === "top" ? -h / 2 : 0;
  return (
    <mesh position={[0, y, 0]}>
      <planeGeometry args={[worldWidth, h]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  );
}
