"use client";
// The pipe popout (docs/TWIN-THEME.md "Follow-up pass"): point at the pipeline in Walk and pull
// the trigger (or click it) and a small quiet glass card opens at that point on the pipe: flow in
// and out (bpd, the last hour of flow_series from useAvonConsole().insight), the line's status,
// and the facilities on it. It turns to face the judge; a second press, on the card or the pipe,
// closes it.
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import { useAvonConsole, type SiteFacility } from "@/lib/live";
import { shortName } from "./model";
import { C } from "./theme";
import { usePainted, type Painter } from "./nav/glass";
import { dot, glass, text } from "./nav/paint";
import { noRay } from "./models";
import type { V3 } from "./plan";

export interface PipeInfo { title: string; inBpd: number | null; outBpd: number | null; status: string; tone: string; on: string }

const W = 0.62, PPM = 1100;
const painter: Painter<PipeInfo, null> = {
  size: () => ({ w: W * PPM, h: 0.3 * PPM }),
  paint(ctx, s, Wp, Hp) {
    glass(ctx, 3, 3, Wp - 6, Hp - 6, { r: 22, edge: C.holoDim, edgeAlpha: 0.8, edgePx: 2, tintAlpha: 0.32 });
    const x = 34;
    text(ctx, s.title, x, 54, { size: 30, weight: 700, color: C.textDim, spacing: 4 });
    const fmt = (v: number | null) => (v == null || !Number.isFinite(v) ? "—" : `${Math.round(v)}`);
    text(ctx, `IN ${fmt(s.inBpd)}   OUT ${fmt(s.outBpd)} bpd`, x, 128, { size: 50, weight: 700, color: C.text });
    dot(ctx, x + 10, 196, 10, s.tone);
    text(ctx, s.status, x + 32, 196, { size: 36, weight: 700, color: s.tone, spacing: 2 });
    text(ctx, s.on, x, 268, { size: 30, face: "body", weight: 500, color: C.textDim });
    return null;
  },
};

export function pipeInfo(facility: SiteFacility, all: SiteFacility[], failed: boolean, flows: { facility_id: string; points: { inflow_bpd: number; outflow_bpd: number }[] }[]): PipeInfo {
  const f = flows.find((x) => x.facility_id === facility.facility_id);
  const last = f?.points[f.points.length - 1];
  const peers = all.filter((x) => x.system_id === facility.system_id).map((x) => shortName(x.facility_id, x.system_id));
  return {
    title: `PIPELINE · ${shortName(facility.facility_id, facility.system_id)}`,
    inBpd: last ? last.inflow_bpd : null,
    outBpd: failed ? 0 : last ? last.outflow_bpd : null,
    status: failed ? "STOPPED · PUMP FAILED" : "FLOWING",
    tone: failed ? C.alert : C.ok,
    on: `On it: ${peers.join(", ")}`,
  };
}

function Card({ at, info, onClose }: { at: V3; info: PipeInfo; onClose(): void }) {
  const tex = usePainted(painter, info);
  const g = useRef<Group>(null);
  const eye = useMemo(() => new Vector3(), []);
  useFrame(({ camera, gl }) => {
    const cam = gl.xr.isPresenting ? gl.xr.getCamera() : camera;
    cam.getWorldPosition(eye);
    if (!g.current) return;
    // Readable from where the judge stands: it keeps at least the size it has at 3.5 m.
    const d = eye.distanceTo(g.current.position);
    g.current.scale.setScalar(Math.max(1, d / 3.5));
    g.current.lookAt(eye.x, g.current.position.y, eye.z);
  });
  if (!tex) return null;
  return (
    <group ref={g} position={[at[0], at[1] + 0.75, at[2]]} name="pipe-popout">
      <mesh onClick={(e) => { e.stopPropagation(); onClose(); }} renderOrder={6}>
        <planeGeometry args={[W, (W * tex.h) / tex.w]} />
        <meshBasicMaterial map={tex.texture} transparent depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <mesh position={[0, -0.42, 0]} raycast={noRay}>
        <cylinderGeometry args={[0.004, 0.004, 0.5, 4]} />
        <meshBasicMaterial color={C.holoDim} transparent opacity={0.6} toneMapped={false} />
      </mesh>
    </group>
  );
}

// Wraps the pipeline: a press on it opens the card at the hit point.
export function PipePopout({ facility, failed, children }: { facility: SiteFacility; failed: boolean; children: ReactNode }) {
  const { facilities, insight } = useAvonConsole();
  const [at, setAt] = useState<V3 | null>(null);
  const info = useMemo(() => pipeInfo(facility, facilities, failed, insight.flows), [facility, facilities, failed, insight.flows]);
  const press = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const p = e.point;
    setAt((cur) => (cur ? null : [p.x, p.y, p.z]));
  };
  return (
    <>
      <group onClick={press} name="pipe-pick">{children}</group>
      {at && <Card at={at} info={info} onClose={() => setAt(null)} />}
    </>
  );
}
