// The lockdown's low two-tone (docs/LOCKDOWN.md, 0-1.2 s). WebAudio, no files. Browsers only let a
// page make sound after the person touched it, so the hold on the button unlocks the context
// (unlockSound) and the sequence plays it (playLockdownTone). Muted when reduced motion is on.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx ??= new AC();
  } catch {
    return null;
  }
  return ctx;
}

// Call from the press itself (a user gesture), so the tone can play a moment later.
export function unlockSound(): void {
  const a = audio();
  if (a && a.state === "suspended") a.resume().catch(() => {});
}

function tone(a: AudioContext, freq: number, at: number, dur: number) {
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.18, at + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

// Down a fourth: 220 Hz then 165 Hz, 0.32 s each. `reverse` plays it back up for End lockdown.
export function playLockdownTone(reverse = false): void {
  const a = audio();
  if (!a || a.state !== "running") return;
  const t = a.currentTime + 0.02;
  const [hi, lo] = [220, 165];
  tone(a, reverse ? lo : hi, t, 0.32);
  tone(a, reverse ? hi : lo, t + 0.34, reverse ? 0.24 : 0.42);
}
