// Pumpjack linkage, as plain numbers (unit-tested in models.test.ts). Life size, in meters, in the
// unit's own vertical plane: x toward the horsehead (the well), y up, origin on the ground under
// the samson post. The crank turns, the pitman pulls the walking beam's rear end down and up, and
// the beam nods about the saddle bearing. The horsehead's face is an arc around that bearing, so
// the bridle always hangs straight down at x = FRONT and the rod moves by FRONT * beam angle.

export const JACK = {
  pivotY: 3.9,          // saddle bearing on top of the samson post (x = 0)
  front: 3.3,           // bearing to the horsehead's face: the bridle hangs at x = front
  rear: 2.7,            // bearing to the equalizer, where the pitman arms pull
  crankX: -2.7,         // crank shaft on the gear reducer
  crankY: 1.35,
  crankR: 0.75,         // crank pin radius
  pitman: 2.55,         // pitman arm length
  periodS: 6,           // one nod about every 6 s
  carrierY: 2.15,       // carrier bar height while the beam is level
  settleS: 1.6,         // a stopping or starting unit reaches 95% of its new speed in this time
} as const;

export type Jack = typeof JACK;

export interface JackPose {
  theta: number;                      // crank angle, radians; 0 = pin toward the horsehead
  beam: number;                       // walking beam angle, radians; + = horsehead up
  pin: [number, number];              // crank pin
  equalizer: [number, number];        // rear end of the beam, where the pitman arms attach
  pitmanAngle: number;                // rotation about z that turns +y onto pin -> equalizer
  carrierY: number;                   // carrier bar (top of the polished rod)
}

// The beam angle for a crank angle: the four-bar linkage (ground, crank, pitman, rear arm) solved
// in closed form, on the branch where the beam stays near level.
export function beamAngle(theta: number, j: Jack = JACK): number {
  const px = j.crankX + j.crankR * Math.cos(theta);
  const py = j.crankY + j.crankR * Math.sin(theta);
  const dx = -px, dy = j.pivotY - py;              // pin to bearing
  const d = Math.hypot(dx, dy);
  const k = (d * d + j.rear * j.rear - j.pitman * j.pitman) / (2 * j.rear);
  const c = Math.acos(Math.min(1, Math.max(-1, k / d)));
  return Math.atan2(dy, dx) - c;
}

export function jackPose(theta: number, j: Jack = JACK): JackPose {
  const beam = beamAngle(theta, j);
  const pin: [number, number] = [j.crankX + j.crankR * Math.cos(theta), j.crankY + j.crankR * Math.sin(theta)];
  const equalizer: [number, number] = [-j.rear * Math.cos(beam), j.pivotY - j.rear * Math.sin(beam)];
  const ex = equalizer[0] - pin[0], ey = equalizer[1] - pin[1];
  return { theta, beam, pin, equalizer, pitmanAngle: Math.atan2(-ex, ey), carrierY: j.carrierY + j.front * beam };
}

// Frame-rate independent easing of the crank's speed: 95% of the way to the target after settleS.
export function crankSpeed(current: number, running: boolean, dtS: number, rate = 1, j: Jack = JACK): number {
  const target = running ? (2 * Math.PI * rate) / j.periodS : 0;
  const next = target + (current - target) * Math.exp((-3 * dtS) / j.settleS);
  return Math.abs(next - target) < 1e-4 ? target : next;
}

// Each unit's own pace from its phase (0..1), within +-5% of the 6 s nod, so a pad never nods in step.
export function jackRate(phase: number): number {
  return 1 + 0.05 * Math.sin(phase * 2 * Math.PI * 3.7 + 1.3);
}

// A small deterministic noise in 0..1 (the flame and glow flicker).
export function hash1(n: number): number {
  const h = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
}

export function flicker(tS: number, seed = 0): number {
  const a = tS * 9.0 + seed * 17.0, b = tS * 23.0 + seed * 5.0;
  const n = (i: number) => {
    const f = Math.floor(i), t = i - f, s = t * t * (3 - 2 * t);
    return hash1(f) * (1 - s) + hash1(f + 1) * s;
  };
  return 0.6 * n(a) + 0.4 * n(b);
}
