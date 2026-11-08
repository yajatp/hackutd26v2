// The witness phone's sounds, made with WebAudio (no files). Browsers only let a page play sound
// after a tap, so nothing plays until enableSound() runs inside one.

let ctx: AudioContext | null = null;

export function enableSound(): boolean {
  if (typeof window === "undefined") return false;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch {
      return false;
    }
  }
  void ctx.resume().catch(() => {});
  return true;
}

function tone(freq: number, peak: number, start: number, length: number, type: OscillatorType) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

// A soft bell for one witnessed entry: E6 with a quiet fifth above, gone in under a second.
export function chime(delaySeconds = 0) {
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime + delaySeconds;
  tone(1318.5, 0.06, t, 0.85, "sine");
  tone(1975.5, 0.02, t, 0.6, "sine");
}

// Once when the record stops matching: two low falling tones.
export function alarm() {
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime;
  tone(220, 0.07, t, 0.3, "triangle");
  tone(165, 0.07, t + 0.28, 0.45, "triangle");
}
