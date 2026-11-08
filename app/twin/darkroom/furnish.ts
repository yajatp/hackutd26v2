// The Darkroom's furniture layout, pure and seeded so the room is the same on every load: server
// racks along the back wall, office chairs around the desk, papers on the desk and the floor, and
// the status LEDs on the racks. Metres, world space; the room is x -3..3, z -4..2, y 0..3.
// Run the checks: npx tsx --test app/twin/darkroom/furnish.test.ts

export type Rect = { x0: number; x1: number; z0: number; z1: number };

export const ROOM: Rect = { x0: -3, x1: 3, z0: -4, z1: 2 };
export const DESK = { x0: -1.35, x1: 1.35, z0: -1.6, z1: -1.0, top: 0.745 } as const;
// Where the judge stands and looks at the console: kept clear of chairs and floor papers.
export const WALKWAY: Rect = { x0: -0.7, x1: 0.9, z0: -1.0, z1: 2.0 };
// The two 3D buttons on the desk's front edge, and the second monitor's foot: no papers there.
export const BUTTONS_ZONE: Rect = { x0: -0.42, x1: 0.4, z0: -1.24, z1: -0.98 };
export const MONITOR = { x: -1.04, z: -1.42, yaw: 0.35, w: 0.56, h: 0.33 } as const;
export const MONITOR_ZONE: Rect = { x0: -1.35, x1: -0.72, z0: -1.6, z1: -1.32 };

// Four 42U racks against the back wall, left of centre (fronts face the room, +z).
export const RACK = { w: 0.6, d: 0.9, h: 2.0 } as const;
export const RACKS: readonly { x: number; z: number }[] = [-2.6, -1.98, -1.36, -0.74].map((x) => ({ x, z: -4 + 0.03 + RACK.d / 2 }));
export const RACK_ZONE: Rect = { x0: -2.95, x1: -0.4, z0: -4, z1: -4 + 0.03 + RACK.d + 0.05 };
// The wall sign (Room3D draws it 2.4 m wide, centred on the back wall) plus a margin: nothing may
// hang in front of it. The cable tray runs above the racks; its ceiling hangers stay clear of the sign.
export const SIGN_ZONE = { x0: -1.25, x1: 1.25 } as const;
export const TRAY = { x0: RACKS[0].x - RACK.w / 2 - 0.02, x1: RACKS[RACKS.length - 1].x + RACK.w / 2 + 0.02 } as const;
export function trayHangers(): number[] {
  const { x0, x1 } = TRAY;
  return [x0 + 0.15, (x0 + x1) / 2, Math.min(x1 - 0.15, SIGN_ZONE.x0 - 0.05)];
}
// A filing cabinet against the right wall (drawers face -x, w runs along z); a whiteboard on the
// back wall, right of the sign; a wall clock above it.
export const CABINET = { x: 3 - 0.02 - 0.31, z: -2.85, w: 0.5, d: 0.62, h: 1.32 } as const;
export const CABINET_ZONE: Rect = { x0: CABINET.x - CABINET.d / 2 - 0.05, x1: 3, z0: CABINET.z - CABINET.w / 2 - 0.05, z1: CABINET.z + CABINET.w / 2 + 0.05 };
export const WHITEBOARD = { x: 2.05, y: 1.45, w: 1.4, h: 0.95 } as const;
export const CLOCK = { x: 2.05, y: 2.4, r: 0.16 } as const;

// Office chairs: two pulled out from the desk, one by the whiteboard swung round toward the room,
// each turned a little, never on the walkway. Yaw 0 faces -z (the desk).
export const CHAIR_R = 0.34;
export const CHAIRS: readonly { x: number; z: number; yaw: number }[] = [
  { x: -1.45, z: -0.7, yaw: 1.1 },
  { x: 1.5, z: -0.72, yaw: 0.9 },
  { x: 1.65, z: -2.55, yaw: 2.2 },
];

export function inRect(r: Rect, x: number, z: number, pad = 0): boolean {
  return x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
}

// Small, fast, seeded PRNG (mulberry32).
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PAPER = { w: 0.21, d: 0.297 } as const;   // A4, lying flat
export type Paper = { x: number; y: number; z: number; yaw: number; tiltX: number; tiltZ: number; tint: number; onDesk: boolean };

// Loose piles on the desk (centre, sheets) and drifts on the floor (centre, spread, sheets).
const DESK_PILES: readonly [number, number, number][] = [[0.72, -1.3, 7], [1.02, -1.16, 4], [-0.85, -1.15, 5], [0.42, -1.5, 4], [-0.4, -1.5, 3]];
const FLOOR_DRIFTS: readonly [number, number, number, number][] = [
  [-1.6, -1.9, 0.6, 9], [1.55, -1.5, 0.55, 7], [-1.9, -0.6, 0.5, 5], [0.3, -2.4, 0.6, 6], [1.9, -2.9, 0.5, 4], [-2.3, 0.6, 0.4, 3],
];
const MARGIN = 0.18;   // keep sheets this far off the walls

function deskOk(x: number, z: number): boolean {
  const r = Math.hypot(PAPER.w, PAPER.d) / 2;
  return x - r * 0.6 >= DESK.x0 && x + r * 0.6 <= DESK.x1 && z - r * 0.6 >= DESK.z0 && z + r * 0.6 <= DESK.z1
    && !inRect(BUTTONS_ZONE, x, z, 0.12) && !inRect(MONITOR_ZONE, x, z, 0.06);
}

export function floorOk(x: number, z: number): boolean {
  return x >= ROOM.x0 + MARGIN && x <= ROOM.x1 - MARGIN && z >= ROOM.z0 + MARGIN && z <= ROOM.z1 - MARGIN
    && !inRect(WALKWAY, x, z, 0.12) && !inRect(DESK, x, z, 0.12) && !inRect(RACK_ZONE, x, z, 0.12) && !inRect(CABINET_ZONE, x, z, 0.12);
}

export function scatterPapers(seed = 11): Paper[] {
  const r = rng(seed);
  const out: Paper[] = [];
  const jitter = (s: number) => (r() * 2 - 1) * s;
  for (const [cx, cz, n] of DESK_PILES) {
    let y = DESK.top + 0.001;
    const base = jitter(0.5);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 8; k++) {
        const x = cx + jitter(0.05), z = cz + jitter(0.05);
        if (!deskOk(x, z)) continue;
        out.push({ x, y, z, yaw: base + jitter(0.35), tiltX: 0, tiltZ: 0, tint: r(), onDesk: true });
        y += 0.0012;
        break;
      }
    }
  }
  for (const [cx, cz, s, n] of FLOOR_DRIFTS) {
    let placed = 0;
    for (let k = 0; k < n * 12 && placed < n; k++) {
      const x = cx + jitter(s), z = cz + jitter(s);
      if (!floorOk(x, z)) continue;
      const tiltX = jitter(0.07), tiltZ = jitter(0.07);
      // Lift a tilted sheet so its low edge stays above the floor.
      const lift = Math.abs(Math.sin(tiltX)) * PAPER.d / 2 + Math.abs(Math.sin(tiltZ)) * PAPER.w / 2;
      out.push({ x, y: 0.004 + lift + placed * 0.0004, z, yaw: r() * Math.PI * 2, tiltX, tiltZ, tint: r(), onDesk: false });
      placed++;
    }
  }
  return out;
}

// Status LEDs on the rack fronts: two per server unit at the right of the bezel. Most are steady
// blue or green; a few blink with activity; a handful blink amber (a drive that needs a look).
export type LedKind = "blue" | "green" | "activity" | "amber";
export type Led = { x: number; y: number; z: number; kind: LedKind; phase: number };
// Server units per rack, as [bottom height, unit height] in metres, from the floor up.
export const UNITS: readonly [number, number][] = [
  [0.12, 0.18], [0.32, 0.09], [0.43, 0.09], [0.54, 0.09], [0.68, 0.18], [0.88, 0.09], [0.99, 0.045], [1.06, 0.09],
  [1.17, 0.09], [1.3, 0.18], [1.5, 0.09], [1.61, 0.09], [1.72, 0.09],
];

export function rackLeds(seed = 7): Led[] {
  const r = rng(seed);
  const out: Led[] = [];
  const front = RACKS[0].z + RACK.d / 2 + 0.012;
  RACKS.forEach((rk, ri) => {
    UNITS.forEach(([y0, h], ui) => {
      for (let j = 0; j < 2; j++) {
        const roll = r();
        const kind: LedKind = roll < 0.035 ? "amber" : roll < 0.12 ? "activity" : roll < 0.62 ? "blue" : "green";
        out.push({ x: rk.x + RACK.w / 2 - 0.085 + j * 0.022, y: y0 + h / 2, z: front, kind, phase: r() * 10 + ri + ui * 0.1 });
      }
    });
  });
  // At least two amber blinkers, so the room always shows one drive that needs attention.
  let amber = out.filter((l) => l.kind === "amber").length;
  for (let i = 5; amber < 2 && i < out.length; i += 37) { if (out[i].kind !== "amber") { out[i].kind = "amber"; amber++; } }
  return out;
}

// What an LED shows at time t (seconds): 0 blue, 1 green, 2 amber, 3 off.
export function ledShade(l: Led, t: number): 0 | 1 | 2 | 3 {
  if (l.kind === "blue") return 0;
  if (l.kind === "green") return 1;
  if (l.kind === "amber") return Math.floor((t + l.phase) / 0.7) % 2 === 0 ? 2 : 3;
  // Activity: mostly on, with short irregular off flickers.
  const s = Math.floor((t + l.phase) * 6);
  return ((s * 2654435761) >>> 0) % 5 === 0 ? 3 : 0;
}
