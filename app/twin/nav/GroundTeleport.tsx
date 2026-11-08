"use client";
// Walking a facility pad at life size (the ground view), on the common Quest pattern: push the
// controller's thumbstick forward and a holo arc drops from the controller to the pad with a
// landing ring; let the stick go and the judge jumps there, with a quick blink (ViewContext
// teleport). The pad is the circle of SIZE.padRadius around the focus tank, which views.ts puts at
// the world origin; a landing off the pad or inside the tank is pulled back onto it (clampToPad).
//
// Why the thumbstick and not the trigger: with the library's teleport pointer the trigger did both
// jobs, and the arc (which lands about 2.5 m ahead on a level aim) always beat the ray to a tank
// 6 m away, so a trigger pull on the tank teleported the judge instead of opening its panel. Now the
// trigger only ever goes to the ray (tanks, signs, the menu, panels), and the store's teleport
// pointer is off (TELEPORT_STORE_OPTIONS, used by app/twin/xr.ts). Hands get no teleport.
// The snap turn (VrStage) reads only a mostly sideways push, so aiming never turns the judge.
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { type XRStoreOptions } from "@react-three/xr";
import { AdditiveBlending, Matrix4, Object3D, Vector3, type Group, type InstancedMesh, type MeshBasicMaterial } from "three";
import { C, SIZE } from "../theme";
import { landing, teleportArc, type V3 } from "../plan";
import { stickX, stickY, teleportAim } from "../stage";
import { NO_HIT } from "./follow";
import { clampToPad } from "./views";
import { useView } from "./ViewContext";

// The store's teleport pointer stays off on controllers and hands: GroundTeleport draws its own arc
// from the thumbstick (see above).
export const TELEPORT_STORE_OPTIONS = {
  controller: { teleportPointer: false },
  hand: { teleportPointer: false },
} as const;

// Type check only: the options above fit createXRStore's (fails tsc if the library's shape changes).
const _check: XRStoreOptions = {
  controller: { model: false, grabPointer: false, ...TELEPORT_STORE_OPTIONS.controller },
  hand: { model: false, ...TELEPORT_STORE_OPTIONS.hand },
};
void _check;

const DASHES = 48;
const ARC_DOTS = 26;
const ARC_SPEED = 10;                      // m/s: a 45 degree aim lands about 12 m out

// Wraps the pad in the ground view only: the thumbstick teleport and a soft holo ring that marks
// the pad's edge, so the judge sees where they can go. `yaw` is the origin's current turn
// (rotation.y), so a teleport after a snap turn still lands under the head. `children` (the world's
// own pad mesh, if any) are drawn as they are.
export function GroundTeleport({ children, radius = SIZE.padRadius, still = false, yaw = 0 }: { children?: ReactNode; radius?: number; still?: boolean; yaw?: number }) {
  const { mode, teleport, faceYaw, busy } = useView();
  const ring = useRef<MeshBasicMaterial>(null);
  const dashes = useRef<InstancedMesh>(null);
  useFrame(() => {
    if (ring.current) ring.current.opacity = still ? 0.5 : 0.35 + 0.2 * Math.sin(performance.now() / 900);
  });
  // The dashed inner ring: one instanced mesh (one draw call), placed once.
  useLayoutEffect(() => {
    const m = dashes.current;
    if (!m) return;
    const o = new Object3D();
    for (let i = 0; i < DASHES; i++) {
      const a = (i / DASHES) * Math.PI * 2;
      o.position.set(Math.cos(a) * (radius - 0.5), Math.sin(a) * (radius - 0.5), 0);
      o.rotation.set(0, 0, a + Math.PI / 2);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [radius, mode]);
  if (mode !== "ground") return children ? <>{children}</> : null;
  return (
    <>
      {children}
      <StickTeleport radius={radius} still={still} busy={busy} onLand={(hit, head) => teleport(landing(hit, head, faceYaw + yaw))} />
      <group rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
        <mesh raycast={NO_HIT}>
          <ringGeometry args={[radius - 0.12, radius, 128]} />
          <meshBasicMaterial ref={ring} color={C.holo} transparent opacity={0.45} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <instancedMesh ref={dashes} args={[undefined, undefined, DASHES]} raycast={NO_HIT} frustumCulled={false}>
          <planeGeometry args={[0.5, 0.06]} />
          <meshBasicMaterial color={C.holoDim} transparent opacity={0.7} depthWrite={false} toneMapped={false} />
        </instancedMesh>
      </group>
    </>
  );
}

// The arc and its landing ring, driven by each controller's thumbstick (stage.ts teleportAim). Reads
// the raw gamepad axes and the target-ray pose from the XR frame, so any controller layout works.
// Three draw calls while aiming (the dots, the ring, the ring's glow), none otherwise.
function StickTeleport({ radius, still, busy, onLand }: {
  radius: number; still: boolean; busy: boolean;
  onLand(hit: { x: number; z: number }, head: { x: number; z: number }): void;
}) {
  const camera = useThree((s) => s.camera);
  const root = useRef<Group>(null);
  const dots = useRef<InstancedMesh>(null);
  const cursor = useRef<Group>(null);
  const aim = useRef(new WeakMap<XRInputSource, boolean>());
  const last = useRef<{ src: XRInputSource; hit: V3 } | null>(null);
  const tmp = useMemo(() => ({ m: new Matrix4(), o: new Object3D(), p: new Vector3(), d: new Vector3(), inv: new Matrix4(), head: new Vector3() }), []);

  useFrame((state, _dt, frame?: XRFrame) => {
    const g = root.current;
    if (!g) return;
    const session = frame?.session ?? state.gl.xr.getSession();
    const ref = state.gl.xr.getReferenceSpace();
    let shown = false;
    if (session && frame && ref) {
      const origin = camera.parent;
      origin?.updateWorldMatrix(true, false);
      for (const src of session.inputSources) {
        if (!src.gamepad || src.hand) continue;
        const axes = src.gamepad.axes;
        const was = aim.current.get(src) ?? false;
        const r = teleportAim(stickX(axes), stickY(axes), was);
        aim.current.set(src, r.aiming);
        if (r.fire && last.current?.src === src) {
          const hit = last.current.hit;
          last.current = null;
          // The head's offset from the origin, in the origin's own (turned) frame.
          tmp.head.setFromMatrixPosition(camera.matrix);
          if (!busy) onLand({ x: hit[0], z: hit[2] }, { x: tmp.head.x, z: tmp.head.z });
          continue;
        }
        if (!r.aiming || shown) continue;
        const pose = frame.getPose(src.targetRaySpace, ref);
        if (!pose) continue;
        // The controller's ray in world meters: its pose in the reference space, through the origin.
        tmp.m.fromArray(pose.transform.matrix);
        if (origin) tmp.m.premultiply(origin.matrixWorld);
        tmp.p.setFromMatrixPosition(tmp.m);
        tmp.d.set(-tmp.m.elements[8], -tmp.m.elements[9], -tmp.m.elements[10]).normalize();
        const arc = teleportArc([tmp.p.x, tmp.p.y, tmp.p.z], [tmp.d.x, tmp.d.y, tmp.d.z], ARC_SPEED, 9.8, 0, ARC_DOTS);
        if (!arc.hit) continue;
        const land = clampToPad({ x: arc.hit[0], z: arc.hit[2] }, radius - 0.4);
        last.current = { src, hit: land };
        shown = true;
        // The dots in the parent's frame (the site root: the world origin in the ground view).
        if (g.parent) tmp.inv.copy(g.parent.matrixWorld).invert();
        else tmp.inv.identity();
        const d = dots.current;
        if (d) {
          arc.points.forEach((pt, i) => {
            tmp.o.position.set(pt[0], pt[1], pt[2]).applyMatrix4(tmp.inv);
            // Small at the hand, fuller toward the landing (perspective already enlarges the near ones).
            tmp.o.scale.setScalar(i < 2 ? 0.0001 : 0.3 + 0.7 * (i / (ARC_DOTS - 1)));
            tmp.o.updateMatrix();
            d.setMatrixAt(i, tmp.o.matrix);
          });
          d.instanceMatrix.needsUpdate = true;
        }
        if (cursor.current) {
          cursor.current.position.set(land[0], 0.05, land[2]).applyMatrix4(tmp.inv);
          cursor.current.scale.setScalar(still ? 1 : 1 + 0.08 * Math.sin(performance.now() / 160));
        }
      }
      // Stick back without a fresh aim this frame: nothing pending.
      if (!shown && last.current && !(aim.current.get(last.current.src) ?? false)) last.current = null;
    }
    g.visible = shown;
  });

  return (
    <group ref={root} visible={false} name="twin-teleport-arc">
      <instancedMesh ref={dots} args={[undefined, undefined, ARC_DOTS]} raycast={NO_HIT} frustumCulled={false} renderOrder={8}>
        <sphereGeometry args={[0.045, 8, 6]} />
        <meshBasicMaterial color={C.holo} transparent opacity={0.9} blending={AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
      </instancedMesh>
      <group ref={cursor}>
        <mesh rotation-x={-Math.PI / 2} raycast={NO_HIT} renderOrder={8}>
          <ringGeometry args={[0.38, 0.5, 48]} />
          <meshBasicMaterial color={C.holo} transparent opacity={0.95} blending={AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} raycast={NO_HIT} renderOrder={7}>
          <circleGeometry args={[0.36, 32]} />
          <meshBasicMaterial color={C.holoDim} transparent opacity={0.5} blending={AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
        </mesh>
      </group>
    </group>
  );
}
