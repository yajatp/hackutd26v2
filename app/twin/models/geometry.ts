// Every model's shape, life size in meters, built once from boxes, cylinders and extrusions and
// merged per unit (Parts in kit.ts). Low poly on purpose: the Quest draws a whole pad in about 20
// calls and a few thousand triangles.
import {
  BufferGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Matrix4, PlaneGeometry, Shape, TorusGeometry, Vector3,
  type Color,
} from "three";
import { color, GAUGE } from "./shaders";
import { at, between, Parts, type V3 } from "./kit";
import { HOUSE, MAST_H, MASTS, SKID, TANK_R, mastAim } from "./pad";
import { JACK } from "./rig";

// Natural field colors, fixed here so the equipment never takes the UI theme's colors (sky clock
// pass, Sun 06:13: daylight shows the real paint, the sun and moon light it).
const PAL = () => ({
  steel: color("#c2c7cf"),
  steelDark: color("#6e7279"),
  steelLight: color("#dadde2"),
  plate: color("#bcc0c8"),
  seam: color("#85817c"),
  concrete: color("#8f8a82"),
  // Field paint, not toy paint: a faded olive drab beam and a dirty cream horsehead, as on the
  // older units across the Permian (verifier, Sun 05:40). The keys keep their old names.
  blue: color("#6d7457"),
  blueDark: color("#535244"),
  white: color("#c4bca6"),
  housing: color("#3a3d42"),
  wall: color("#c3c0b8"),
  wallDark: color("#7d8087"),
  lamp: color("#ffe6c8"),
  window: color("#f3d6a8"),
  screen: color("#3d7fc4"),
  // Permian stock tanks are painted desert tan, courses a shade apart.
  tan: color("#b9a37f"),
  tanDark: color("#a8916c"),
});

const cache: Record<string, BufferGeometry> = {};
function once(key: string, make: () => BufferGeometry): BufferGeometry {
  return (cache[key] ??= make());
}

const rotY = (p: V3, a: number): V3 => {
  const v = new Vector3(...p).applyAxisAngle(new Vector3(0, 1, 0), a);
  return [v.x, v.y, v.z];
};

// ---- tank ----------------------------------------------------------------------------------------

export const TANK = {
  R: TANK_R, base: 0.2, top: 6.0, roofH: 0.42, railY: 7.05,
  ladder: 1.0,                 // the ladder's bearing from the gauge (south), toward the east
  bandY: [0.42, 1.02] as [number, number],
};
const COURSE = (TANK.top - TANK.base) / 4;
const roofY = (r: number) => TANK.top + TANK.roofH * (1 - r / TANK.R);

export function tankGeometry(): BufferGeometry {
  return once("tank", () => {
    const P = PAL(), p = new Parts(), R = TANK.R;
    p.add(new CylinderGeometry(R + 0.2, R + 0.26, TANK.base, 32), P.concrete, at([0, TANK.base / 2, 0]));
    for (let k = 0; k < 4; k++) {
      p.add(new CylinderGeometry(R, R, COURSE, 32, 1, true), k % 2 ? P.tan : P.tanDark, at([0, TANK.base + COURSE * (k + 0.5), 0]));
      for (let j = 0; j < 8; j++) {
        const a = ((j + (k % 2) * 0.5) * Math.PI * 2) / 8 + 0.2;
        p.box(0.035, COURSE, 0.02, P.seam, at([Math.sin(a) * (R + 0.004), TANK.base + COURSE * (k + 0.5), Math.cos(a) * (R + 0.004)], [0, a, 0]));
      }
    }
    for (let k = 1; k < 4; k++) p.add(new TorusGeometry(R + 0.006, 0.018, 4, 48), P.seam, at([0, TANK.base + COURSE * k, 0], [Math.PI / 2, 0, 0]));
    p.add(new TorusGeometry(R + 0.012, 0.05, 5, 48), P.steelLight, at([0, TANK.top, 0], [Math.PI / 2, 0, 0]));
    p.add(new ConeGeometry(R + 0.07, TANK.roofH, 32, 1, true), P.steelLight, at([0, TANK.top + TANK.roofH / 2, 0]));

    // Thief hatch by the ladder's landing, its lid in the pumpjack blue.
    const h = rotY([0, 0, 0.95], TANK.ladder - 0.35);
    p.add(new CylinderGeometry(0.24, 0.24, 0.2, 12), P.steel, at([h[0], roofY(0.95) + 0.06, h[2]]));
    p.add(new CylinderGeometry(0.28, 0.28, 0.06, 12), P.blue, at([h[0], roofY(0.95) + 0.19, h[2]]));
    // Vent with a gooseneck and a flame arrestor.
    p.rod([0, TANK.top + TANK.roofH - 0.05, 0], [0, 7.15, 0], 0.075, P.steel, 8);
    p.add(new TorusGeometry(0.18, 0.075, 6, 10, Math.PI), P.steel, at([0.18, 7.15, 0]));
    p.rod([0.36, 7.15, 0], [0.36, 6.98, 0], 0.075, P.steel, 8);
    p.add(new CylinderGeometry(0.12, 0.12, 0.14, 10), P.white, at([0.36, 6.93, 0]));

    // Top rail round the roof.
    const rr = R - 0.12;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      p.rod([Math.sin(a) * rr, roofY(rr), Math.cos(a) * rr], [Math.sin(a) * rr, TANK.railY, Math.cos(a) * rr], 0.025, P.white, 5);
    }
    p.add(new TorusGeometry(rr, 0.034, 4, 64), P.white, at([0, TANK.railY, 0], [Math.PI / 2, 0, 0]));
    p.add(new TorusGeometry(rr, 0.022, 4, 64), P.white, at([0, (TANK.railY + TANK.top) / 2 + 0.05, 0], [Math.PI / 2, 0, 0]));

    // Straight ladder with a cage, at TANK.ladder from the gauge.
    const L = TANK.ladder, z = R + 0.2;
    for (const x of [-0.23, 0.23]) {
      p.bar(rotY([x, 0.25, z], L), rotY([x, TANK.railY, z], L), 0.05, 0.05, P.steelLight);
      for (let y = 0.9; y < TANK.top; y += 1.5) p.bar(rotY([x, y, R - 0.02], L), rotY([x, y, z], L), 0.04, 0.04, P.steelDark);
    }
    for (let y = 0.55; y < TANK.railY - 0.1; y += 0.3) {
      p.bar(rotY([-0.23, y, z], L), rotY([0.23, y, z], L), 0.035, 0.035, P.steelLight);
    }
    const hoop = new Matrix4().makeRotationY(L);
    for (let y = 2.4; y < TANK.railY + 0.1; y += 0.75) {
      p.add(new TorusGeometry(0.38, 0.018, 4, 12, Math.PI), P.steelLight, hoop.clone().multiply(at([0, y, z], [Math.PI / 2, 0, 0])));
    }
    for (const a of [0.35, Math.PI / 2, Math.PI - 0.35]) {
      const cx = Math.cos(a) * 0.38, cz = z + Math.sin(a) * 0.38;
      p.bar(rotY([cx, 2.4, cz], L), rotY([cx, TANK.railY, cz], L), 0.025, 0.025, P.steelLight);
    }

    // The level gauge's housing (the glowing strip sits on it) and, at its top, the level sensor
    // the attack fakes.
    p.box(GAUGE.bar + 0.16, GAUGE.height + 0.2, 0.09, P.housing, at([0, GAUGE.bottom + GAUGE.height / 2, R + 0.015]));
    p.box(0.34, 0.3, 0.26, P.housing, at([0, TANK.top + 0.02, R + 0.16]));
    p.rod([0, TANK.top - 0.13, R + 0.1], [0, GAUGE.bottom + GAUGE.height + 0.1, R + 0.06], 0.02, P.steelDark, 4);

    // Nozzles where the transfer lines meet the shell.
    p.rod([R - 0.05, 0.5, -0.55], [R + 0.14, 0.5, -0.55], 0.13, P.steelDark, 10);
    p.rod([1.32, 1.25, -1.18], [1.45, 1.25, -1.3], 0.13, P.steelDark, 10);
    return p.merge();
  });
}

// The tank for the miniatures (Table, Overview): the same silhouette in about 200 triangles (shell
// in two tones, roof, top ring, gauge housing), since the ladder, cage, seams and rail are under a
// pixel at table scale. Level of detail for the Quest's budget.
export function tankGeometryLow(): BufferGeometry {
  return once("tank-low", () => {
    const P = PAL(), p = new Parts(), R = TANK.R;
    p.add(new CylinderGeometry(R + 0.2, R + 0.26, TANK.base, 12, 1, true), P.concrete, at([0, TANK.base / 2, 0]));
    p.add(new CylinderGeometry(R, R, (TANK.top - TANK.base) / 2, 14, 1, true), P.tanDark, at([0, TANK.base + (TANK.top - TANK.base) * 0.25, 0]));
    p.add(new CylinderGeometry(R, R, (TANK.top - TANK.base) / 2, 14, 1, true), P.tan, at([0, TANK.base + (TANK.top - TANK.base) * 0.75, 0]));
    p.add(new ConeGeometry(R + 0.07, TANK.roofH, 14, 1, true), P.steelLight, at([0, TANK.top + TANK.roofH / 2, 0]));
    p.add(new CylinderGeometry(R - 0.12, R - 0.12, 0.08, 14, 1, true), P.white, at([0, TANK.railY, 0]));
    p.box(GAUGE.bar + 0.16, GAUGE.height + 0.2, 0.09, P.housing, at([0, GAUGE.bottom + GAUGE.height / 2, R + 0.015]));
    p.box(0.34, 0.3, 0.26, P.housing, at([0, TANK.top + 0.02, R + 0.16]));
    return p.merge();
  });
}

// The state band's open cylinder and the hover rim's, around the shell.
export function bandGeometry(): BufferGeometry {
  return once("band", () => new CylinderGeometry(TANK.R + 0.03, TANK.R + 0.03, TANK.bandY[1] - TANK.bandY[0], 40, 1, true)
    .translate(0, (TANK.bandY[0] + TANK.bandY[1]) / 2, 0));
}
export function rimGeometry(): BufferGeometry {
  return once("rim", () => new CylinderGeometry(TANK.R + 0.09, TANK.R + 0.09, 1.3, 40, 1, true).translate(0, TANK.top + 0.35, 0));
}
export function gaugeGeometry(): BufferGeometry {
  return once("gauge", () => new PlaneGeometry(GAUGE.width, GAUGE.height).translate(0, GAUGE.bottom + GAUGE.height / 2, TANK.R + 0.07));
}

// ---- pumpjack (instanced; each part in its own moving frame, see rig.ts) ---------------------------

function extrude(points: [number, number][], depth: number, z0: number): BufferGeometry {
  const s = new Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return new ExtrudeGeometry(s, { depth, bevelEnabled: false }).translate(0, 0, z0);
}

export const JACK_LED: V3 = [-3.75, 1.3, 0];

export function jackStatic(): BufferGeometry {
  return once("jack-static", () => {
    const P = PAL(), p = new Parts();
    p.box(7.0, 0.18, 2.4, P.concrete, at([-0.8, 0.09, 0]));
    p.add(new CylinderGeometry(0.75, 0.8, 0.12, 14), P.concrete, at([JACK.front, 0.06, 0]));
    for (const z of [-0.72, 0.72]) p.box(6.5, 0.28, 0.22, P.steelDark, at([-0.85, 0.32, z]));
    for (const x of [-3.6, -1.0, 1.0, 2.1]) p.box(0.2, 0.22, 1.66, P.steelDark, at([x, 0.32, 0]));
    // Samson post: an A-frame of four legs to the saddle bearing, braced halfway up.
    const top = JACK.pivotY - 0.18;
    const legs: [V3, V3][] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push([[sx * 1.0, 0.45, sz * 0.72], [sx * 0.06, top, sz * 0.2]]);
    for (const [a, b] of legs) p.bar(a, b, 0.17, 0.17, P.blueDark);
    const atY = ([a, b]: [V3, V3], t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    for (const t of [0.4]) {
      p.bar(atY(legs[0], t), atY(legs[2], t), 0.1, 0.1, P.blueDark);
      p.bar(atY(legs[1], t), atY(legs[3], t), 0.1, 0.1, P.blueDark);
      p.bar(atY(legs[2], t), atY(legs[3], t), 0.1, 0.1, P.blueDark);
    }
    p.box(0.5, 0.2, 0.56, P.steel, at([0, top + 0.06, 0]));
    // Gear reducer on its stand, the crank shaft through it, the motor and belt guard behind.
    p.box(1.25, 0.5, 0.95, P.steelDark, at([JACK.crankX, 0.55, 0]));
    p.box(1.05, 0.5, 0.72, P.blue, at([JACK.crankX, 1.05, 0]));
    p.add(new CylinderGeometry(0.5, 0.5, 0.72, 16), P.blue, at([JACK.crankX, JACK.crankY, 0], [Math.PI / 2, 0, 0]));
    p.rod([JACK.crankX, JACK.crankY, -0.66], [JACK.crankX, JACK.crankY, 0.66], 0.1, P.steel, 10);
    p.box(0.8, 0.35, 0.7, P.steelDark, at([-3.75, 0.5, 0]));
    p.add(new CylinderGeometry(0.3, 0.3, 0.8, 14), color("#a9a493"), at([-3.75, 0.95, 0], [Math.PI / 2, 0, 0]));
    p.box(1.05, 0.55, 0.08, P.white, at([-3.2, 1.05, 0.5]));
    // Wellhead: flange, tree, a side tee and the stuffing box the polished rod runs through.
    p.add(new CylinderGeometry(0.3, 0.3, 0.2, 12), P.steelDark, at([JACK.front, 0.25, 0]));
    p.rod([JACK.front, 0.35, 0], [JACK.front, 0.98, 0], 0.13, P.white, 10);
    p.rod([JACK.front, 0.55, -0.45], [JACK.front, 0.55, 0.45], 0.07, P.white, 8);
    for (const z of [-0.3, 0.3]) p.add(new TorusGeometry(0.12, 0.02, 4, 10), P.blue, at([JACK.front, 0.55, z]));
    p.rod([JACK.front, 0.98, 0], [JACK.front, 1.14, 0], 0.1, P.steelDark, 10);
    return p.merge();
  });
}

// Walking beam, horsehead and equalizer, about the saddle bearing (origin), level.
export function jackBeam(): BufferGeometry {
  return once("jack-beam", () => {
    const P = PAL(), p = new Parts();
    p.box(5.75, 0.42, 0.3, P.blue, at([-0.125, 0, 0]));
    p.box(5.75, 0.05, 0.32, P.white, at([-0.125, 0.235, 0]));
    const f = JACK.front, pts: [number, number][] = [[2.45, 0.21], [2.7, 0.95]];
    for (let i = 0; i <= 10; i++) {
      const a = ((22 - i * 5.2) * Math.PI) / 180;
      pts.push([f * Math.cos(a), f * Math.sin(a)]);
    }
    pts.push([2.55, -1.15], [2.45, -0.21]);
    p.add(extrude(pts, 0.5, -0.25), P.white);
    p.box(0.24, 0.24, 1.6, P.blueDark, at([-JACK.rear, -0.04, 0]));
    p.box(0.34, 0.3, 0.42, P.steel, at([-JACK.rear, -0.2, 0]));
    return p.merge();
  });
}

// Crank arms with their counterweights, about the crank shaft (origin); pin toward +x at angle 0.
export function jackCrank(): BufferGeometry {
  return once("jack-crank", () => {
    const P = PAL(), p = new Parts();
    const cw: [number, number][] = [[0.28, -0.24], [1.08, -0.54], [1.17, 0], [1.08, 0.54], [0.28, 0.24]];
    for (const s of [-1, 1]) {
      p.box(1.2, 0.28, 0.1, P.blue, at([0.38, 0, s * 0.55]));
      p.add(extrude(cw, 0.22, s > 0 ? 0.44 : -0.66), P.white);
      p.rod([JACK.crankR, 0, s * 0.6], [JACK.crankR, 0, s * 0.78], 0.07, P.steelDark, 8);
    }
    return p.merge();
  });
}

// The two pitman arms, from the crank pin (origin) up +y to the equalizer.
export function jackPitman(): BufferGeometry {
  return once("jack-pitman", () => {
    const P = PAL(), p = new Parts();
    for (const s of [-1, 1]) p.box(0.12, JACK.pitman, 0.08, P.blueDark, at([0, JACK.pitman / 2, s * 0.72]));
    return p.merge();
  });
}

// Carrier bar and polished rod, at the carrier bar (origin).
export function jackRod(): BufferGeometry {
  return once("jack-rod", () => {
    const P = PAL(), p = new Parts();
    p.box(0.14, 0.1, 0.56, P.steelDark, at([0, 0, 0]));
    p.box(0.12, 0.12, 0.12, P.steel, at([0, 0.1, 0]));
    p.rod([0, 0.15, 0], [0, -2.3, 0], 0.035, P.steelLight, 6);
    return p.merge();
  });
}

// The bridle's two wire ropes, hanging 1 m down from the horsehead (origin); scaled to length.
export function jackBridle(): BufferGeometry {
  return once("jack-bridle", () => {
    const P = PAL(), p = new Parts();
    for (const z of [-0.14, 0.14]) p.box(0.03, 1, 0.03, P.steelDark, at([0, -0.5, z]));
    return p.merge();
  });
}

export function flatQuad(): BufferGeometry {
  return once("quad-flat", () => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
}
export function billboardQuad(): BufferGeometry {
  return once("quad", () => new PlaneGeometry(1, 1));
}

// ---- pump house and its pump skid -------------------------------------------------------------------

// The house at its own origin, door to +z; with `skid`, the pump skid at its place west of it.
function addHouse(p: Parts, lit: Parts, P: ReturnType<typeof PAL>, o: V3, skid: boolean) {
  const { w, d, h } = HOUSE;
  const T = (x: number, y: number, z: number): V3 => [o[0] + x, o[1] + y, o[2] + z];
  p.box(w + 0.5, 0.15, d + 0.5, P.concrete, at(T(0, 0.075, 0)));
  p.box(w, h, d, P.wall, at(T(0, 0.15 + h / 2, 0)));
  for (let i = 0; i < 12; i++) for (const s of [-1, 1]) p.box(0.06, h, 0.03, P.wallDark, at(T(-w / 2 + ((i + 0.5) * w) / 12, 0.15 + h / 2, s * (d / 2 + 0.015))));
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) p.box(0.03, h, 0.06, P.wallDark, at(T(s * (w / 2 + 0.015), 0.15 + h / 2, -d / 2 + ((i + 0.5) * d) / 9)));
  // Gable roof along x, with its attic filled.
  const pitch = 0.42, span = d / 2 + 0.3, top = 0.15 + h;
  const len = span / Math.cos(pitch);
  for (const s of [-1, 1]) p.box(w + 0.45, 0.08, len, P.steelLight, at(T(0, top + (span / 2) * Math.tan(pitch) + 0.05, (s * span) / 2), [s * pitch, 0, 0]));
  const tri = new Shape();
  tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, (d / 2) * Math.tan(pitch)); tri.closePath();
  p.add(new ExtrudeGeometry(tri, { depth: w, bevelEnabled: false }).translate(0, 0, -w / 2).rotateY(Math.PI / 2), P.wall, at(T(0, top, 0)));
  p.box(0.5, 0.35, 0.5, P.steelDark, at(T(-0.9, top + 0.45, -0.2)));
  // Door, frame and the lamp over it; a lit window.
  const dz = d / 2 + 0.035;
  p.box(1.0, 2.1, 0.06, P.blue, at(T(0.65, 0.15 + 1.05, dz)));
  p.box(1.16, 0.08, 0.08, P.white, at(T(0.65, 0.15 + 2.14, dz)));
  for (const s of [-1, 1]) p.box(0.08, 2.18, 0.08, P.white, at(T(0.65 + s * 0.54, 0.15 + 1.09, dz)));
  p.box(0.36, 0.12, 0.32, P.housing, at(T(0.65, 2.62, d / 2 + 0.16)));
  lit.box(0.3, 0.02, 0.26, P.lamp, at(T(0.65, 2.55, d / 2 + 0.17)));
  p.box(1.0, 0.7, 0.05, P.housing, at(T(-0.85, 1.55, dz)));
  lit.box(0.88, 0.58, 0.02, P.window, at(T(-0.85, 1.55, dz + 0.03)));
  lit.box(0.02, 0.58, 0.025, P.housing, at(T(-0.85, 1.55, dz + 0.04)));
  if (!skid) return;
  // The pump skid, west of the house, toward the tank: pump, coupling, motor, the discharge into
  // the house, and a control panel with a holo screen.
  const k: V3 = [o[0] + SKID.x - HOUSE.x, o[1], o[2] + SKID.z - HOUSE.z];
  const K = (x: number, y: number, z: number): V3 => [k[0] + x, k[1] + y, k[2] + z];
  p.box(2.1, 0.2, 1.1, P.steelDark, at(K(0, 0.1, 0)));
  p.add(new CylinderGeometry(0.34, 0.34, 0.32, 14), P.blue, at(K(-0.8, 0.52, 0), [Math.PI / 2, 0, 0]));
  p.rod(K(-0.65, 0.5, 0), K(-0.2, 0.5, 0), 0.24, P.blue, 12);
  p.box(0.32, 0.32, 0.36, P.white, at(K(0.0, 0.52, 0)));
  p.rod(K(0.15, 0.52, 0), K(1.0, 0.52, 0), 0.3, P.steel, 14);
  p.rod(K(-0.8, 0.5, 0), K(-0.8, 1.0, 0), 0.11, P.steelDark, 8);
  p.rod(K(-0.8, 1.0, 0), K(HOUSE.x - HOUSE.w / 2 - SKID.x + 0.02, 1.0, 0), 0.11, P.steelDark, 8);
  p.rod(K(0.75, 0.2, -0.75), K(0.75, 1.0, -0.75), 0.04, P.steelDark, 6);
  p.box(0.55, 0.75, 0.18, P.housing, at(K(0.75, 1.3, -0.75)));
  lit.box(0.4, 0.28, 0.02, P.screen, at(K(0.75, 1.4, -0.65)));
}

export const HOUSE_LAMP: V3 = [0.65, 2.5, HOUSE.d / 2 + 0.25];
export const SKID_LED: V3 = [SKID.x - HOUSE.x + 0.75, 1.13, SKID.z - HOUSE.z - 0.64];

export function houseGeometry(): { solid: BufferGeometry; lit: BufferGeometry } {
  const solid = once("house", () => {
    const P = PAL(), p = new Parts(), l = new Parts();
    addHouse(p, l, P, [0, 0, 0], true);
    cache["house-lit"] = l.merge();
    return p.merge();
  });
  return { solid, lit: cache["house-lit"] };
}

// ---- the pad's fixed furniture: house, skid, light masts, pipe supports -------------------------------

export interface MastLamp { lamp: V3; ground: V3 }

export function mastLamps(): MastLamp[] {
  const out: MastLamp[] = [];
  for (const m of MASTS) {
    const [ax, az] = mastAim(m);
    const dx = ax - m.x, dz = az - m.z, d = Math.hypot(dx, dz);
    const ux = dx / d, uz = dz / d;
    for (const s of [-1, 1]) {
      out.push({
        lamp: [m.x + ux * 0.35 - uz * s * 0.6, MAST_H - 0.12, m.z + uz * 0.35 + ux * s * 0.6],
        ground: [ax - uz * s * 2.2, 0.02, az + ux * s * 2.2],
      });
    }
  }
  return out;
}

export function furnitureGeometry(): { solid: BufferGeometry; lit: BufferGeometry; cones: BufferGeometry } {
  const solid = once("furniture", () => {
    const P = PAL(), p = new Parts(), l = new Parts(), cones = new Parts();
    addHouse(p, l, P, [HOUSE.x, 0, HOUSE.z], true);
    for (const m of MASTS) {
      const [ax, az] = mastAim(m);
      const yaw = Math.atan2(ax - m.x, az - m.z);
      p.add(new CylinderGeometry(0.36, 0.4, 0.3, 10), P.concrete, at([m.x, 0.15, m.z]));
      p.rod([m.x, 0.3, m.z], [m.x, MAST_H + 0.2, m.z], 0.13, P.steelDark, 8, 0.08);
      p.box(1.5, 0.08, 0.1, P.steelDark, at([m.x, MAST_H + 0.05, m.z], [0, yaw + Math.PI / 2, 0]));
    }
    for (const { lamp, ground } of mastLamps()) {
      const yaw = Math.atan2(ground[0] - lamp[0], ground[2] - lamp[2]);
      const m = new Matrix4().makeTranslation(lamp[0], lamp[1], lamp[2])
        .multiply(new Matrix4().makeRotationY(yaw)).multiply(new Matrix4().makeRotationX(0.55));
      p.box(0.55, 0.16, 0.4, P.housing, m);
      l.box(0.46, 0.02, 0.32, P.lamp, m.clone().multiply(new Matrix4().makeTranslation(0, -0.085, 0)));
      cones.add(new ConeGeometry(3.0, 1, 20, 1, true), P.lamp, between(ground, lamp));
    }
    // Pipe supports under the transfer lines.
    for (const [x, z] of [[2.2, -0.55], [3.1, -1.6], [11.5, -2.2], [15.5, -2.2]] as [number, number][]) {
      p.box(0.5, 0.06, 0.12, P.steelDark, at([x, 0.36, z], [0, Math.PI / 2, 0]));
      p.rod([x, 0, z], [x, 0.36, z], 0.04, P.steelDark, 5);
    }
    cache["furniture-lit"] = l.merge();
    cache["furniture-cones"] = cones.merge();
    return p.merge();
  });
  return { solid, lit: cache["furniture-lit"], cones: cache["furniture-cones"] };
}

// ---- flare stack ---------------------------------------------------------------------------------------

export const FLARE = { tip: 14.15, flameW: 4.2, flameH: 7.4, halo: 9 };

export function flareGeometry(): BufferGeometry {
  return once("flare", () => {
    const P = PAL(), p = new Parts();
    p.box(2.6, 0.3, 2.6, P.steelDark, at([0, 0.15, 0]));
    p.add(new CylinderGeometry(0.7, 0.7, 3.0, 16), P.white, at([2.5, 0.95, 0], [0, 0, Math.PI / 2]));
    for (const x of [1.6, 3.4]) p.box(0.25, 0.4, 1.0, P.steelDark, at([x, 0.3, 0]));
    p.rod([1.0, 0.95, 0], [0.25, 0.95, 0], 0.16, P.steelDark, 10);
    p.rod([0, 0.3, 0], [0, 13.6, 0], 0.33, P.steel, 14, 0.27);
    for (const [y, c] of [[11.8, P.white], [12.4, P.blueDark], [13.0, P.white]] as [number, Color][]) p.add(new CylinderGeometry(0.285, 0.29, 0.6, 14), c, at([0, y, 0]));
    p.add(new CylinderGeometry(0.38, 0.32, 0.55, 14), P.steelDark, at([0, 13.85, 0]));
    p.add(new CylinderGeometry(1.0, 1.0, 0.08, 18), P.steelDark, at([0, 11.2, 0]));
    p.add(new TorusGeometry(0.98, 0.03, 4, 24), P.white, at([0, 12.2, 0], [Math.PI / 2, 0, 0]));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.rod([Math.cos(a) * 0.98, 11.2, Math.sin(a) * 0.98], [Math.cos(a) * 0.98, 12.2, Math.sin(a) * 0.98], 0.025, P.white, 4);
    }
    for (const x of [-0.2, 0.2]) p.bar([x, 0.3, 0.52], [x, 11.2, 0.52], 0.045, 0.045, P.steelLight);
    for (let y = 0.6; y < 11.2; y += 0.35) p.bar([-0.2, y, 0.52], [0.2, y, 0.52], 0.03, 0.03, P.steelLight);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const g: V3 = [Math.cos(a) * 7.5, 0.1, Math.sin(a) * 7.5];
      p.rod([0, 10.6, 0], g, 0.02, P.steelDark, 3);
      p.box(0.4, 0.2, 0.4, P.concrete, at(g));
    }
    return p.merge();
  });
}

export function flameGeometry(): BufferGeometry {
  return once("flame", () => new PlaneGeometry(1, 1).translate(0, 0.5, 0));
}
