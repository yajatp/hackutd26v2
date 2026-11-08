// Shared bits for the effects: one soft glow texture (a neutral mask, tinted by each material's
// color), theme colors with an alpha, and the theme's fonts loaded before any canvas text.
import { CanvasTexture, SRGBColorSpace } from "three";
import { FONT } from "../theme";

let glow: CanvasTexture | null = null;

// A round soft spot, bright in the middle, gone at the rim. Made once, shared by every halo.
export function glowTexture(): CanvasTexture {
  if (glow) return glow;
  const n = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  // A mask, not a color: the material's color tints it.
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(255,255,255,0.75)");
  g.addColorStop(0.45, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, n, n);
  glow = new CanvasTexture(canvas);
  glow.colorSpace = SRGBColorSpace;
  return glow;
}

// withAlpha(C.warn, 0.4) -> "rgba(r,g,b,0.4)", for canvas strokes in a theme color.
export function withAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const v = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

let fontsLoading: Promise<void> | null = null;

// Chakra Petch and Barlow from /fonts (app/fonts.css). Resolves once, also on failure.
export function themeFontsReady(): Promise<void> {
  fontsLoading ??= Promise.all(FONT.load.map((f) => document.fonts.load(f))).then(() => undefined, () => undefined);
  return fontsLoading;
}
