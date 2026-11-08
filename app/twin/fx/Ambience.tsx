"use client";
// The lease at night, by ear (docs/TWIN-THEME.md "Immersion"): synthesized WebAudio only, no files,
// on the one shared context (audio.ts, unlocked by the first click or Enter VR; silent before).
// - wind: low broadband noise, slowly gusting (every view);
// - insects: a faint high chirr that comes and goes (Walk);
// - each pumpjack: a thump and a creak on its stroke, positional, stopping when the pump failed
//   (the unit coasts down over about 3 s, so the last strokes come slower);
// - the motor hum near the nearest unit, fading out over about 3 s when the pump failed;
// - the flare's roar, positional, louder close up.
// The listener follows the camera (the headset's in VR). The nearest two sources pan with HRTF,
// the rest equal-power (cheap). Mute and the comfort setting do not change the world; mute
// silences the bus (setMuted in audio.ts).
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";
import { audioContext, isMuted } from "./audio";
import { JACK, jackRate } from "../models/rig";

export interface AmbienceProps {
  walk: boolean;                                   // positional sources only in Walk
  jacks: { x: number; z: number; phase: number }[];
  running: boolean;                                // false: the pump failed (units coast, hum fades)
  flare: [number, number, number] | null;
}

interface Bus {
  ctx: AudioContext; master: GainNode; wind: GainNode; insects: GainNode; walkBus: GainNode;
  hum: GainNode; humPan: PannerNode; flarePan: PannerNode; noise: AudioBuffer;
  sources: AudioScheduledSourceNode[];             // the loops and oscillators, stopped on unmount
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 3.2 + w * 0.15; }
  return b;
}

function loop(ctx: AudioContext, buf: AudioBuffer, rate = 1): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
  s.start(ctx.currentTime + Math.random() * 0.1, Math.random() * 1.5);
  return s;
}

function panner(ctx: AudioContext, hrtf: boolean, ref = 6, max = 400): PannerNode {
  return new PannerNode(ctx, { panningModel: hrtf ? "HRTF" : "equalpower", distanceModel: "inverse", refDistance: ref, maxDistance: max, rolloffFactor: 1.2 });
}

function build(ctx: AudioContext): Bus {
  const noise = noiseBuffer(ctx);
  const sources: AudioScheduledSourceNode[] = [];
  const keep = <T extends AudioScheduledSourceNode>(n: T): T => { sources.push(n); return n; };
  const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  // Wind: brown-ish noise, low-passed.
  const wind = ctx.createGain(); wind.gain.value = 0.18;
  const wl = ctx.createBiquadFilter(); wl.type = "lowpass"; wl.frequency.value = 520; wl.Q.value = 0.4;
  keep(loop(ctx, noise, 0.7)).connect(wl).connect(wind).connect(master);
  const walkBus = ctx.createGain(); walkBus.gain.value = 0; walkBus.connect(master);
  // Insects: band-passed noise, amplitude-modulated at a cricket's pulse rate.
  const insects = ctx.createGain(); insects.gain.value = 0;
  const ib = ctx.createBiquadFilter(); ib.type = "bandpass"; ib.frequency.value = 4300; ib.Q.value = 14;
  const am = ctx.createGain(); am.gain.value = 0;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 28; const lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
  keep(lfo).connect(lfoG).connect(am.gain); lfo.start();
  keep(loop(ctx, noise, 1.3)).connect(ib).connect(am).connect(insects).connect(walkBus);
  // Motor hum: 60 Hz mains, a couple of harmonics, positional at the nearest unit.
  const hum = ctx.createGain(); hum.gain.value = 0;
  const humPan = panner(ctx, true, 3, 60);
  for (const [f, g] of [[60, 0.5], [120, 0.3], [180, 0.12]] as const) {
    const o = keep(ctx.createOscillator()); o.type = "sawtooth"; o.frequency.value = f;
    const og = ctx.createGain(); og.gain.value = g * 0.08;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
    o.connect(lp).connect(og).connect(hum); o.start();
  }
  hum.connect(humPan).connect(walkBus);
  // The flare: low roar with a flutter.
  const flarePan = panner(ctx, true, 8, 600);
  const fl = ctx.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = 300;
  const fg = ctx.createGain(); fg.gain.value = 0.9;
  keep(loop(ctx, noise, 0.45)).connect(fl).connect(fg).connect(flarePan).connect(walkBus);
  return { ctx, master, wind, insects, walkBus, hum, humPan, flarePan, noise, sources };
}

// One stroke's sound at a unit: the polished-rod thump at the bottom and a creak on the way up.
function stroke(b: Bus, at: Vector3, hrtf: boolean, k: number) {
  const { ctx } = b, t = ctx.currentTime + 0.02;
  const p = panner(ctx, hrtf, 4, 120);
  p.positionX.value = at.x; p.positionY.value = 1.5; p.positionZ.value = at.z;
  p.connect(b.walkBus);
  const thump = ctx.createOscillator(); thump.type = "sine";
  thump.frequency.setValueAtTime(85, t); thump.frequency.exponentialRampToValueAtTime(42, t + 0.22);
  const tg = ctx.createGain(); tg.gain.setValueAtTime(0.0001, t); tg.gain.exponentialRampToValueAtTime(0.55 * k, t + 0.01); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  thump.connect(tg).connect(p); thump.start(t); thump.stop(t + 0.4);
  const creak = ctx.createOscillator(); creak.type = "sawtooth";
  const c0 = t + 0.9;
  creak.frequency.setValueAtTime(210, c0); creak.frequency.linearRampToValueAtTime(265, c0 + 0.5);
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 6;
  const cg = ctx.createGain(); cg.gain.setValueAtTime(0.0001, c0); cg.gain.exponentialRampToValueAtTime(0.06 * k, c0 + 0.12); cg.gain.exponentialRampToValueAtTime(0.0001, c0 + 0.55);
  creak.connect(bp).connect(cg).connect(p); creak.start(c0); creak.stop(c0 + 0.6);
  creak.onended = () => p.disconnect();
}

export function Ambience({ walk, jacks, running, flare }: AmbienceProps) {
  const bus = useRef<Bus | null>(null);
  const next = useRef<number[]>([]);
  const coast = useRef({ k: 1 });
  const v = useRef({ pos: new Vector3(), fwd: new Vector3(), up: new Vector3(), tmp: new Vector3(), q: new Quaternion() });
  useEffect(() => () => {
    const b = bus.current;
    if (b) {
      b.master.gain.value = 0;
      for (const s of b.sources) { try { s.stop(); } catch { /* already stopped */ } s.disconnect(); }
      b.master.disconnect();
    }
    bus.current = null;
  }, []);
  // Leaving Walk or a new set of units: forget the stroke schedule, so overdue units do not all
  // thump on the same frame when the judge comes back.
  useEffect(() => { next.current = []; }, [walk, jacks]);
  useFrame(({ camera, gl, clock }, dtRaw) => {
    const ctx = audioContext();
    if (!ctx || ctx.state !== "running") return;
    const b = (bus.current ??= build(ctx));
    const dt = Math.min(dtRaw, 0.1), now = ctx.currentTime;
    b.master.gain.setTargetAtTime(isMuted() ? 0 : 0.85, now, 0.15);
    b.walkBus.gain.setTargetAtTime(walk ? 1 : 0, now, 0.4);
    b.wind.gain.setTargetAtTime(0.13 + 0.09 * Math.max(0, Math.sin(clock.elapsedTime * 0.21) * Math.sin(clock.elapsedTime * 0.07 + 1)), now, 0.8);
    b.insects.gain.setTargetAtTime(walk ? 0.05 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.5)) : 0, now, 0.6);
    // The listener: the headset's camera in VR, the page's camera otherwise.
    const cam = gl.xr.isPresenting ? gl.xr.getCamera() : camera;
    const { pos, fwd, up } = v.current;
    cam.getWorldPosition(pos);
    cam.getWorldQuaternion(v.current.q);
    fwd.set(0, 0, -1).applyQuaternion(v.current.q);
    up.set(0, 1, 0).applyQuaternion(v.current.q);
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
    }
    // Pump failure: the units coast down over about 3 s, and the hum fades with them.
    const c = coast.current;
    c.k = running ? Math.min(1, c.k + dt / 0.5) : Math.max(0, c.k - dt / 3);
    if (walk && jacks.length > 0) {
      let best = 0, bestD = Infinity;
      jacks.forEach((j, i) => { const d = Math.hypot(j.x - pos.x, j.z - pos.z); if (d < bestD) { bestD = d; best = i; } });
      const nj = jacks[best];
      b.humPan.positionX.value = nj.x; b.humPan.positionY.value = 0.9; b.humPan.positionZ.value = nj.z;
      b.hum.gain.setTargetAtTime(0.5 * c.k, now, 0.3);
      const order = jacks.map((j, i) => [Math.hypot(j.x - pos.x, j.z - pos.z), i]).sort((a, b2) => a[0] - b2[0]).map((x) => x[1]);
      const t = clock.elapsedTime;
      jacks.forEach((j, i) => {
        const period = JACK.periodS / jackRate(j.phase);
        next.current[i] ??= t + j.phase * period;
        if (t >= next.current[i]) {
          if (c.k > 0.15) stroke(b, v.current.tmp.set(j.x, 0, j.z), order.indexOf(i) < 2, c.k);
          next.current[i] = t + period / Math.max(0.3, c.k);
        }
      });
    } else b.hum.gain.setTargetAtTime(0, now, 0.3);
    if (walk && flare) {
      b.flarePan.positionX.value = flare[0]; b.flarePan.positionY.value = flare[1] + 12; b.flarePan.positionZ.value = flare[2];
    }
  });
  return null;
}

// A footstep on caliche gravel where a teleport lands: two short bursts of band-passed noise.
let crunchBuf: AudioBuffer | null = null;
export function crunch(): void {
  const ctx = audioContext();
  if (!ctx || ctx.state !== "running" || isMuted()) return;
  crunchBuf ??= noiseBuffer(ctx);
  for (const [dt, g] of [[0, 0.35], [0.11, 0.25]] as const) {
    const t = ctx.currentTime + 0.02 + dt;
    const s = ctx.createBufferSource(); s.buffer = crunchBuf; s.playbackRate.value = 2.4;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 0.9;
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    s.connect(bp).connect(gn).connect(ctx.destination);
    s.start(t, Math.random()); s.stop(t + 0.16);
  }
}
