"use client";
// The 3D parts of the entry flow that VrStage renders: the map scene with its welcome card, and
// the "Back to map" button at a site. Sui style (paint.ts).
import { useEffect, useMemo, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { SiteSummary } from "@/lib/fleet";
import { facing, HOW_TO, type P3 } from "../stage";
import { UsMap3D } from "./UsMap3D";
import { canvasTexture, dot, loadFonts, panel, SUI, write } from "./paint";
import { Button3D } from "../darkroom/Button3D";

function useFonts() {
  const [ok, setOk] = useState(false);
  useEffect(() => { let live = true; loadFonts().then(() => { if (live) setOk(true); }); return () => { live = false; }; }, []);
  return ok;
}

// The welcome card, where the site view's How to use card stands: what this is and what to do.
const CARD_W = 0.74, CPX = 1000, CPY = 330;
function MapCard() {
  const fonts = useFonts();
  const tex = useMemo(() => canvasTexture(CPX, CPY, (ctx) => {
    panel(ctx, CPX, CPY, SUI.line, 3, 28);
    if (!fonts) return;
    write(ctx, "AVON · SITE SELECTION", 52, 62, { size: 26, weight: 500, color: SUI.grey2, mono: true, spacing: 4 });
    write(ctx, "Choose a site", 52, 132, { size: 64, weight: 700, color: SUI.white });
    write(ctx, "Point at a site on the map and pull the trigger.", 52, 200, { size: 34, weight: 500, color: SUI.grey3 });
    let x = 60;
    for (const [c, label] of [[SUI.blue, "Normal"], [SUI.amber, "Inspection"], [SUI.red, "Pump failure or alert"]] as const) {
      dot(ctx, x, 268, 9, c);
      x += 26 + write(ctx, label, x + 22, 268, { size: 30, weight: 500, color: SUI.grey3 }) + 44;
    }
  }), [fonts]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh name="twin-usmap-card" position={HOW_TO.at} rotation-y={facing(HOW_TO.at)} raycast={() => {}}>
      <planeGeometry args={[CARD_W, (CARD_W * CPY) / CPX]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
  );
}

export function MapStage({ sites, inXR, onPick }: { sites: SiteSummary[]; inXR: boolean; onPick(key: string): void }) {
  return (
    <>
      <UsMap3D sites={sites} onPick={onPick} />
      {inXR && <MapCard />}
    </>
  );
}

// Back to map: a small button at the table's front left, by the judge's left hand, facing them.
export const BACK_AT: P3 = [-0.58, 1.0, -0.52];
const BW = 0.2, BPX = 520, BPY = 140;
// The Darkroom button sits just under it (darkroom/: the isolated incident room).
export function BackButton3D({ onBack, site, onDarkroom }: { onBack(): void; site: string; onDarkroom?(): void }) { // site: its display name
  const fonts = useFonts();
  const [hot, setHot] = useState(false);
  const tex = useMemo(() => canvasTexture(BPX, BPY, (ctx) => {
    panel(ctx, BPX, BPY, hot ? SUI.blue : SUI.raised, hot ? 5 : 3, 22);
    if (!fonts) return;
    write(ctx, "←  Back to map", 40, 56, { size: 44, weight: 600, color: hot ? SUI.blue : SUI.white });
    write(ctx, site.toUpperCase(), 42, 106, { size: 22, weight: 500, color: SUI.grey2, mono: true, spacing: 3, maxW: BPX - 70 });
  }), [fonts, hot, site]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <group position={BACK_AT} rotation-y={facing(BACK_AT)}>
      <mesh
        name="twin-back-to-map" rotation-x={-(20 * Math.PI) / 180}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onBack(); }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHot(true); }}
        onPointerOut={() => setHot(false)}
      >
        <planeGeometry args={[BW, (BW * BPY) / BPX]} />
        <meshBasicMaterial map={tex} transparent toneMapped={false} fog={false} />
      </mesh>
      {onDarkroom && (
        <Button3D name="twin-darkroom-button" label="Darkroom" width={0.2} onPress={onDarkroom}
          position={[0, -0.068, 0.025]} rotation={[-(20 * Math.PI) / 180, 0, 0]} />
      )}
    </group>
  );
}
