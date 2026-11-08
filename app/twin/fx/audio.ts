// chirp(kind): a short synthesized two-tone alert (WebAudio oscillators, no audio file). Browsers
// only let sound start after a user gesture, so nothing plays until unlockAudio() has run inside
// one (armAudioOnGesture does that on the first click, tap or key; "Enter VR" is such a click).
import { chirpPlan, CHIRP_GAP_MS } from "./motion";
import type { FxKind } from "./events";

let ctx: AudioContext | null = null;
let muted = false;
let lastAt = -Infinity;

const muteListeners = new Set<() => void>();
export function setMuted(m: boolean): void {
  if (m === muted) return;
  muted = m;
  for (const f of muteListeners) f();
}
export function isMuted(): boolean { return muted; }
// For useSyncExternalStore: every sound toggle (2D button, VR dock) reads the one mute state.
export function subscribeMuted(f: () => void): () => void {
  muteListeners.add(f);
  return () => { muteListeners.delete(f); };
}
export function audioReady(): boolean { return ctx !== null && ctx.state === "running"; }
// The shared context (null until a gesture unlocked it), for the site's ambience (ambience.ts).
export function audioContext(): AudioContext | null { return ctx; }

// Call from inside a click, tap or key handler.
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
}

// Unlocks on the first gesture anywhere on the page. Returns the cleanup for a useEffect.
export function armAudioOnGesture(): () => void {
  const on = () => unlockAudio();
  const kinds = ["pointerdown", "keydown", "touchend"] as const;
  for (const k of kinds) window.addEventListener(k, on, { passive: true });
  return () => { for (const k of kinds) window.removeEventListener(k, on); };
}

// Plays the kind's two tones. False when muted, locked, or another chirp just played.
export function chirp(kind: FxKind, opts: { muted?: boolean; volume?: number } = {}): boolean {
  if (muted || opts.muted || !ctx || ctx.state !== "running") return false;
  const now = performance.now();
  if (now - lastAt < CHIRP_GAP_MS) return false;
  lastAt = now;
  const t0 = ctx.currentTime + 0.01;
  const master = ctx.createGain();
  master.gain.value = opts.volume ?? 0.6;
  const soft = ctx.createBiquadFilter();       // takes the fizz off the square and saw waves
  soft.type = "lowpass";
  soft.frequency.value = 3200;
  soft.connect(master).connect(ctx.destination);
  for (const n of chirpPlan(kind)) {
    const at = t0 + n.at, end = at + n.dur;
    const o = ctx.createOscillator();
    o.type = n.wave;
    o.frequency.setValueAtTime(n.f0, at);
    if (n.f1 !== n.f0) o.frequency.exponentialRampToValueAtTime(n.f1, end);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(n.gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(g).connect(soft);
    o.start(at);
    o.stop(end + 0.02);
  }
  return true;
}
