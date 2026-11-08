// Where everything stands on one facility's pad, as plain numbers (unit-tested in models.test.ts).
// Pad-local meters: the tank at the origin, +x east, -z north, y up. The judge's life-size start is
// SIZE.standOff south of the tank, facing it, so nothing stands in that
// corridor. The pump house sits east of the tank; pumpjacks stand around the pad 10-17 m out,
// side-on to the middle so their nod reads from the tank.
import { SIZE } from "../theme";
import { JACK } from "./rig";

export type P3 = [number, number, number];

export const TANK_R = SIZE.tankDiameter / 2;
export const START = { x: 0, z: SIZE.standOff };

// The pump house: its door faces south (+z), its pump skid is on its west side, toward the tank.
export const HOUSE = { x: 7.6, z: -2.6, w: 3.4, d: 2.7, h: 2.6 };
export const SKID = { x: 4.7, z: -2.6 };

// Two light masts, each with two lamps aimed at the tank.
export const MASTS: { x: number; z: number }[] = [{ x: -6.8, z: 4.2 }, { x: 14.5, z: -5.5 }];
export const MAST_H = 9.2;

export interface JackSlot {
  x: number; z: number;     // samson post on the ground
  yaw: number;              // rotation.y of the unit (its +x points to its wellhead)
  phase: number;            // 0..1, so the pad's units nod out of step
  well: [number, number];   // the wellhead (x, z)
}

// Good spots for the first eight wells (compass bearing in degrees from north, clockwise; radius m),
// clear of the start corridor, the house and the masts, and which way the unit faces (flip: its
// wellhead on the counter-clockwise end), chosen so no flowline crosses another unit. More wells go
// round an outer ring.
const PRESET: [number, number, boolean][] = [
  [300, 12, false], [38, 12.5, true], [242, 11.5, false], [335, 15, true],
  [118, 13, false], [282, 16.5, true], [12, 16.5, true], [200, 15, true],
];

export function jackSlots(n: number): JackSlot[] {
  const out: JackSlot[] = [];
  for (let i = 0; i < n; i++) {
    let bearing: number, r: number, flip = i % 2 === 1;
    if (i < PRESET.length) [bearing, r, flip] = PRESET[i];
    else {
      const k = i - PRESET.length;
      bearing = 215 + ((k + 0.5) * 290) / Math.max(1, n - PRESET.length);
      r = 17.5;
    }
    const b = (bearing * Math.PI) / 180;
    const x = r * Math.sin(b), z = -r * Math.cos(b);
    // Side-on to the middle: the beam runs along the tangent, alternating direction.
    const yaw = -b + (flip ? Math.PI : 0);
    const well: [number, number] = [x + JACK.front * Math.cos(yaw), z - JACK.front * Math.sin(yaw)];
    out.push({ x, z, yaw, phase: (i * 0.381966 + 0.13) % 1, well });
  }
  return out;
}

// A unit's footprint as circles (x, z, r): motor and crank at the back, wellhead at the front.
export function jackFootprint(s: JackSlot): [number, number, number][] {
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  return [-3.3, -1.65, 0, 1.65, 3.3].map((u) => [s.x + u * c, s.z - u * sn, 1.15]);
}

const lerp2 = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// The flowline from a wellhead to the tank: out of the wellhead's side, down to the ground,
// straight in, and up into a nozzle on the shell.
export function flowline(s: JackSlot): P3[] {
  const w = s.well;
  const d = Math.hypot(w[0], w[1]);
  const toward = (m: number): [number, number] => lerp2(w, [0, 0], m / d);
  const a = toward(0.45), b = toward(1.4), c = toward(d - TANK_R - 0.9), e = toward(d - TANK_R - 0.05);
  return [[a[0], 0.55, a[1]], [b[0], 0.22, b[1]], [c[0], 0.22, c[1]], [e[0], 0.85, e[1]]];
}

// The tank to the pump house and on off the pad (the start of the line to the system's centre).
export const TRANSFER: P3[][] = [
  [[TANK_R - 0.05, 0.5, -0.55], [3.1, 0.5, -0.55], [3.1, 0.5, -2.6], [SKID.x - 0.85, 0.5, -2.6]],
  [[1.4, 1.25, -1.25], [2.7, 1.25, -3.75], [HOUSE.x - HOUSE.w / 2 - 0.02, 1.25, -3.75]],
  [[HOUSE.x + HOUSE.w / 2 + 0.02, 0.5, -2.2], [SIZE.padRadius - 0.6, 0.5, -2.2]],
];

// Where the mast lamps point: a spot between the mast and the tank.
export function mastAim(m: { x: number; z: number }): [number, number] {
  return [m.x * 0.45, m.z * 0.45];
}
