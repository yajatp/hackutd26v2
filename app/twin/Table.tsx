"use client";
// The table: the page's one bold moment. The same dithered flashlight as /vr (app/vr/field.ts),
// now in 3D: a 4x4 ordered Bayer dither fixed to the tabletop (4 mm cells, so it does not crawl
// as the judge's head moves), between the table's night and a dim moonlight. Brightness is a small
// ambient plus a soft pool around one light point. The light follows the pointer's spot on the
// table (the mouse in 2D, a controller's ray or a hand in VR); with no pointer it rests on the
// console's top problem. A 2 mm moonlight rim marks the edge; each system is a thin ring.
// The threshold matrix is the 8x8 Bayer matrix /vr uses, so both pages dither alike.
import { useMemo, useRef, type RefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Color, ShaderMaterial, Vector2, Vector3, type Group, type Mesh, type PointLight } from "three";
import type { Cluster, PlacedTank } from "./model";
import { TURNTABLE_R } from "./stage";
import {
  approach, DITHER_CELL_M, LIGHT_MS, LIGHT_SIGMA_M, lightRest, lightTarget, MOON, TABLE_INK, type Pt,
} from "./look";
import { CanvasCard } from "./CanvasText";

const RIM_M = 0.002;
const TABLE_DEPTH = 0.03;

// Where the light is, shared by the table (which hears the pointer) and the light (which eases).
export interface LightState { pointer: Pt | null; at: Pt; started: boolean }
export const newLight = (): LightState => ({ pointer: null, at: { x: 0, z: 0 }, started: false });

const VERT = /* glsl */ `
varying vec2 vP;
void main() {
  // The disc lies in the mesh's xy plane, turned flat: table x east, z south.
  vP = vec2(position.x, -position.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// One light point, no loops. A lit cell is a square dot with a hairline gap, antialiased; cells
// smaller than about 1.4 screen pixels fade to the dither's average so the far side does not
// shimmer.
const FRAG = /* glsl */ `
uniform vec3 uGround;
uniform vec3 uInk;
uniform vec3 uRim;
uniform vec2 uLight;
uniform float uCell;
uniform float uSigma;
uniform float uAmbient;
uniform float uPool;
uniform float uRadius;
uniform float uRimW;
varying vec2 vP;

// Ordered 8x8 Bayer threshold matrix (the one app/vr/field.ts uses).
const float BAYER8[64] = float[64](
   0.0, 32.0,  8.0, 40.0,  2.0, 34.0, 10.0, 42.0,
  48.0, 16.0, 56.0, 24.0, 50.0, 18.0, 58.0, 26.0,
  12.0, 44.0,  4.0, 36.0, 14.0, 46.0,  6.0, 38.0,
  60.0, 28.0, 52.0, 20.0, 62.0, 30.0, 54.0, 22.0,
   3.0, 35.0, 11.0, 43.0,  1.0, 33.0,  9.0, 41.0,
  51.0, 19.0, 59.0, 27.0, 49.0, 17.0, 57.0, 25.0,
  15.0, 47.0,  7.0, 39.0, 13.0, 45.0,  5.0, 37.0,
  63.0, 31.0, 55.0, 23.0, 61.0, 29.0, 53.0, 21.0);

void main() {
  vec2 c = vP / uCell;
  vec2 cell = floor(c);
  int i = int(mod(cell.x, 8.0)) + 8 * int(mod(cell.y, 8.0));
  float threshold = (BAYER8[i] + 0.5) / 64.0;
  vec2 d = vP - uLight;
  float lum = uAmbient + uPool * exp(-dot(d, d) / (2.0 * uSigma * uSigma));
  vec2 f = abs(fract(c) - 0.5);
  vec2 w = fwidth(c);
  vec2 inside = 1.0 - smoothstep(vec2(0.4) - 0.5 * w, vec2(0.4) + 0.5 * w, f);
  float on = step(threshold, lum) * inside.x * inside.y;
  on = mix(on, clamp(lum, 0.0, 1.0) * 0.64, smoothstep(0.7, 1.1, max(w.x, w.y)));
  vec3 col = mix(uGround, uInk, on);
  float r = length(vP);
  float aa = fwidth(r);
  col = mix(col, uRim, smoothstep(uRadius - uRimW - aa, uRadius - uRimW, r));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function useTableMaterial() {
  return useMemo(() => new ShaderMaterial({
    uniforms: {
      uGround: { value: new Color(TABLE_INK) },
      uInk: { value: new Color("#9eb0b8") },          // a dim moonlight
      uRim: { value: new Color(MOON) },
      uLight: { value: new Vector2() },
      uCell: { value: DITHER_CELL_M },
      uSigma: { value: LIGHT_SIGMA_M },
      uAmbient: { value: 0.05 },
      uPool: { value: 0.78 },
      uRadius: { value: TURNTABLE_R },
      uRimW: { value: RIM_M },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  }), []);
}

// The tabletop and its edge. It hears the pointer: moving over it moves the light (and, on a
// screen, a small cursor dot); a click on empty table closes the info panel.
export function Tabletop({ model, light, inXR, cell, onEmptyClick }: {
  model: RefObject<Group | null>; light: LightState; inXR: boolean; cell: number; onEmptyClick(): void;
}) {
  const mat = useTableMaterial();
  const dot = useRef<Mesh>(null);
  const p = useMemo(() => new Vector3(), []);
  useFrame(() => {
    mat.uniforms.uLight.value.set(light.at.x, light.at.z);
    mat.uniforms.uCell.value = cell;                     // look.ts ditherCell: 4 mm in VR
  });

  const move = (e: ThreeEvent<PointerEvent>) => {
    const g = model.current;
    if (!g) return;
    g.worldToLocal(p.copy(e.point));
    light.pointer = { x: p.x, z: p.z };
    if (dot.current && !inXR) {
      dot.current.visible = true;
      dot.current.position.set(p.x, 0.0012, p.z);
    }
  };
  const leave = () => {
    light.pointer = null;
    if (dot.current) dot.current.visible = false;
  };
  return (
    <>
      <mesh
        rotation-x={-Math.PI / 2} material={mat}
        onPointerMove={move} onPointerOut={leave}
        onClick={(e) => { if (e.delta <= 4) onEmptyClick(); }}
      >
        <circleGeometry args={[TURNTABLE_R, 160]} />
      </mesh>
      <mesh position={[0, -TABLE_DEPTH / 2, 0]}>
        <cylinderGeometry args={[TURNTABLE_R, TURNTABLE_R * 0.985, TABLE_DEPTH, 160, 1, true]} />
        <meshBasicMaterial color="#0a1721" />
      </mesh>
      {/* Where the mouse meets the table. In VR the controller ray draws its own round cursor. */}
      <mesh ref={dot} visible={false} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.0035, 20]} />
        <meshBasicMaterial color={MOON} toneMapped={false} />
      </mesh>
    </>
  );
}

// The light point eases toward its target: the hovered tank, else the pointer's spot on the table,
// else the top problem. A moonlight point light rides above it, so tanks in the pool are lit too.
export function Torch({ light, tanks, top, hovered, still }: {
  light: LightState; tanks: PlacedTank[]; top: string | null; hovered: string | null; still: boolean;
}) {
  const lamp = useRef<PointLight>(null);
  useFrame((_, dt) => {
    const rest = lightRest(tanks, top);
    if (!light.started && tanks.length > 0) {
      light.at = rest;                       // the first look lands on the problem, no sweep
      light.started = true;
    }
    const h = hovered ? tanks.find((t) => t.facility_id === hovered) : undefined;
    const to = lightTarget(h ? { x: h.x, z: h.z } : light.pointer, rest, TURNTABLE_R - 0.02);
    const ms = Math.min(dt, 0.1) * 1000;
    light.at = { x: approach(light.at.x, to.x, ms, still ? 0 : LIGHT_MS), z: approach(light.at.z, to.z, ms, still ? 0 : LIGHT_MS) };
    lamp.current?.position.set(light.at.x, 0.2, light.at.z);
  });
  return <pointLight ref={lamp} color={MOON} intensity={0.16} distance={0.7} decay={2} />;
}

// One thin moonlight ring per system. In VR its id lies flat on the table at the ring's near edge;
// on a screen the page's DOM label does that job (Labels.tsx).
export function Pads({ clusters, inXR }: { clusters: Cluster[]; inXR: boolean }) {
  return (
    <>
      {clusters.map((c) => (
        <group key={c.system_id} position={[c.x, 0, c.z]}>
          <mesh position={[0, 0.0006, 0]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[c.r - 0.0012, c.r, 128]} />
            <meshBasicMaterial color={MOON} transparent opacity={0.42} depthWrite={false} toneMapped={false} />
          </mesh>
          {inXR && (
            <group position={[0, 0.001, c.r + 0.016]} rotation-x={-Math.PI / 2}>
              <CanvasCard
                rows={[{ text: c.system_id, color: "#8fa1aa", size: 44, face: "head", weight: 600 }]}
                worldWidth={0.06} pxPerM={2000} padM={0.002} fit bg="rgba(0,0,0,0)"
              />
            </group>
          )}
        </group>
      ))}
    </>
  );
}

// North, at the table's far rim: the table turns, so the site's north stays marked.
export function North() {
  return (
    <group position={[0, 0.001, -TURNTABLE_R + 0.035]} rotation-x={-Math.PI / 2}>
      <CanvasCard rows={[{ text: "N", color: MOON, size: 70, face: "head", weight: 600 }]} worldWidth={0.05} pxPerM={2000} padM={0.002} fit bg="rgba(0,0,0,0)" />
    </group>
  );
}
