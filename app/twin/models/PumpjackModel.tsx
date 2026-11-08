"use client";
// Beam pumps at life size (about 8 m long, 5 m to the top of the horsehead), all of a pad's units in
// six instanced draw calls (base and samson post, walking beam with horsehead, crank with
// counterweights, pitman arms, polished rod, bridle) plus one for their soft shadows. Each unit's
// crank turns about once every 6 s at its own pace; the linkage in rig.ts moves the pitman, the
// beam and the rod exactly as a real conventional unit does. running=false eases the crank to a
// stop over about 1.6 s (and back up when it runs again).
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Matrix4, type InstancedMesh } from "three";
import { flatQuad, jackBeam, jackBridle, jackCrank, jackPitman, jackRod, jackStatic } from "./geometry";
import { softDisc } from "./kit";
import { painted, shadowMaterial } from "./shaders";
import { crankSpeed, JACK, jackPose, jackRate } from "./rig";
import { noRay } from "./common";

export interface JackItem {
  x: number; z: number;      // samson post on the ground, in the parent's meters
  yaw: number;               // rotation.y; the unit's +x points at its wellhead
  phase: number;             // 0..1: where its crank starts and its own pace
  running: boolean;
}

const base = new Matrix4(), local = new Matrix4(), out = new Matrix4(), sc = new Matrix4();

function baseOf(it: JackItem) {
  return base.makeRotationY(it.yaw).setPosition(it.x, 0, it.z);
}

export function Pumpjacks({ items, shadow = true }: { items: JackItem[]; shadow?: boolean }) {
  const n = items.length;
  const parts = {
    still: useRef<InstancedMesh>(null), beam: useRef<InstancedMesh>(null), crank: useRef<InstancedMesh>(null),
    pitman: useRef<InstancedMesh>(null), rod: useRef<InstancedMesh>(null), bridle: useRef<InstancedMesh>(null),
    shade: useRef<InstancedMesh>(null),
  };
  // The crank's angle and speed per unit survive re-renders; a running unit starts at full speed.
  const sim = useRef<{ theta: number[]; omega: number[] }>({ theta: [], omega: [] });
  const sig = items.map((it) => `${it.x.toFixed(2)},${it.z.toFixed(2)},${it.yaw.toFixed(3)}`).join("|");
  const layout = useMemo(() => items.map((it) => ({ ...it })), [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const s = sim.current;
    s.theta = layout.map((it, i) => s.theta[i] ?? it.phase * Math.PI * 2);
    s.omega = layout.map((it, i) => s.omega[i] ?? (it.running ? (2 * Math.PI * jackRate(it.phase)) / JACK.periodS : 0));
    const st = parts.still.current, sh = parts.shade.current;
    layout.forEach((it, i) => {
      baseOf(it);
      st?.setMatrixAt(i, base);
      out.multiplyMatrices(base, sc.makeScale(9.6, 1, 3.4).setPosition(-0.45, 0.035, 0));
      sh?.setMatrixAt(i, out);
    });
    if (st) { st.instanceMatrix.needsUpdate = true; st.computeBoundingSphere(); }
    if (sh) sh.instanceMatrix.needsUpdate = true;
  }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1), s = sim.current;
    const beam = parts.beam.current, crank = parts.crank.current, pitman = parts.pitman.current;
    const rod = parts.rod.current, bridle = parts.bridle.current;
    if (!beam || !crank || !pitman || !rod || !bridle) return;
    for (let i = 0; i < n; i++) {
      const it = items[i];
      if (!it) continue;
      s.omega[i] = crankSpeed(s.omega[i] ?? 0, it.running, dt, jackRate(it.phase));
      s.theta[i] = ((s.theta[i] ?? 0) + s.omega[i] * dt) % (Math.PI * 2);
      const p = jackPose(s.theta[i]);
      baseOf(layout[i] ?? it);
      out.multiplyMatrices(base, local.makeRotationZ(p.beam).setPosition(0, JACK.pivotY, 0));
      beam.setMatrixAt(i, out);
      out.multiplyMatrices(base, local.makeRotationZ(p.theta).setPosition(JACK.crankX, JACK.crankY, 0));
      crank.setMatrixAt(i, out);
      out.multiplyMatrices(base, local.makeRotationZ(p.pitmanAngle).setPosition(p.pin[0], p.pin[1], 0));
      pitman.setMatrixAt(i, out);
      out.multiplyMatrices(base, local.makeTranslation(JACK.front, p.carrierY, 0));
      rod.setMatrixAt(i, out);
      out.multiplyMatrices(base, local.makeScale(1, JACK.pivotY - p.carrierY, 1).setPosition(JACK.front, JACK.pivotY, 0));
      bridle.setMatrixAt(i, out);
    }
    for (const m of [beam, crank, pitman, rod, bridle]) m.instanceMatrix.needsUpdate = true;
  });

  if (n === 0) return null;
  const mat = painted();
  return (
    <group name="pumpjacks" key={n}>
      <instancedMesh ref={parts.still} args={[jackStatic(), mat, n]} />
      <instancedMesh ref={parts.beam} args={[jackBeam(), mat, n]} frustumCulled={false} />
      <instancedMesh ref={parts.crank} args={[jackCrank(), mat, n]} frustumCulled={false} />
      <instancedMesh ref={parts.pitman} args={[jackPitman(), mat, n]} frustumCulled={false} />
      <instancedMesh ref={parts.rod} args={[jackRod(), mat, n]} frustumCulled={false} />
      <instancedMesh ref={parts.bridle} args={[jackBridle(), mat, n]} frustumCulled={false} />
      {shadow && <instancedMesh ref={parts.shade} args={[flatQuad(), shadowMaterial(softDisc()), n]} raycast={noRay} frustumCulled={false} renderOrder={0} />}
    </group>
  );
}

// One pumpjack at its own origin (+x toward its wellhead).
export function PumpjackModel({ running, phase = 0, shadow = true }: { running: boolean; phase?: number; shadow?: boolean }) {
  const items = useMemo(() => [{ x: 0, z: 0, yaw: 0, phase, running }], [phase, running]);
  return <Pumpjacks items={items} shadow={shadow} />;
}
