"use client";
// The security alert in the headset: a Sui panel (#131518, thin red border, white type, Plex Mono
// label) placed 0.85 m in front of the judge when it appears, with "Enter the Darkroom" (blue) and
// "Not now". It stays where it was placed (it does not chase the head).
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import { canvasTexture, SUI, write } from "../usmap/paint";
import { Button3D, fill, useFonts, wrap } from "./Button3D";
import { ALERT_MOVE, ALERT_TITLE } from "./logic";

const W = 0.62, PX = 1240, PY = 640;
const noRay = () => {};

export function SecurityAlert3D({ line, onEnter, onDismiss }: { line: string; onEnter(): void; onDismiss(): void }) {
  const fonts = useFonts();
  const g = useRef<Group>(null);
  const placed = useRef(false);
  const tmp = useMemo(() => ({ p: new Vector3(), f: new Vector3() }), []);
  const tex = useMemo(() => canvasTexture(PX, PY, (ctx) => {
    fill(ctx, PX, PY, SUI.panel, SUI.red, 4, 24);
    if (!fonts) return;
    ctx.fillStyle = SUI.red;
    ctx.fillRect(56, 50, 14, 14);
    write(ctx, "SECURITY · FIELD NETWORK", 86, 58, { size: 26, weight: 500, color: "#F87171", mono: true, spacing: 4 });
    write(ctx, ALERT_TITLE, 56, 130, { size: 60, weight: 700, color: SUI.white });
    ctx.font = `500 34px "Hanken Grotesk", system-ui, sans-serif`;
    let y = 206;
    for (const l of wrap(ctx, line, PX - 112).slice(0, 2)) { write(ctx, l, 56, y, { size: 34, weight: 600, color: SUI.white }); y += 46; }
    y += 8;
    ctx.font = `500 30px "Hanken Grotesk", system-ui, sans-serif`;
    for (const l of wrap(ctx, ALERT_MOVE, PX - 112).slice(0, 2)) { write(ctx, l, 56, y, { size: 30, weight: 500, color: SUI.grey3 }); y += 42; }
  }), [fonts, line]);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame((state) => {
    if (placed.current || !g.current) return;
    state.camera.getWorldPosition(tmp.p);
    state.camera.getWorldDirection(tmp.f);
    tmp.f.y = 0;
    if (tmp.f.lengthSq() < 1e-6) tmp.f.set(0, 0, -1);
    tmp.f.normalize();
    g.current.position.set(tmp.p.x + tmp.f.x * 0.85, tmp.p.y - 0.12, tmp.p.z + tmp.f.z * 0.85);
    g.current.rotation.set(0, Math.atan2(-tmp.f.x, -tmp.f.z), 0);
    placed.current = true;
  });
  const h = (W * PY) / PX;
  return (
    <group ref={g} name="twin-security-alert">
      <mesh raycast={noRay} renderOrder={49}>
        <planeGeometry args={[W, h]} />
        <meshBasicMaterial map={tex} transparent depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <Button3D name="twin-alert-enter" label="Enter the Darkroom" primary width={0.25} onPress={onEnter} position={[-0.135, -h / 2 + 0.05, 0.002]} />
      <Button3D name="twin-alert-dismiss" label="Not now" width={0.17} onPress={onDismiss} position={[0.115, -h / 2 + 0.05, 0.002]} />
    </group>
  );
}
