import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";

// `next build` and `next start` use their own folder, so a build (a lane's checker, a test) can
// never wipe the running dev server's .next mid-demo. Vercel expects .next, so it keeps it.
export default function config(phase: string): NextConfig {
  const prod = phase === PHASE_PRODUCTION_BUILD || phase === PHASE_PRODUCTION_SERVER;
  return {
    distDir: prod && !process.env.VERCEL ? ".next-build" : ".next",
    // The demo runs `npm run dev`; the dev "N" bubble covered the Kill button on 360 px phones.
    devIndicators: false,
  };
}
