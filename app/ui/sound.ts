// The night-shift sound choice (app/ui/NightGate.tsx asks once per browser session). Kept in
// sessionStorage, with a copy in memory for browsers that refuse storage. Sound helpers ask
// soundOn() before they play: off unless the person chose With sound.

export type SoundChoice = "on" | "off";

const KEY = "avon-sound";
let memo: SoundChoice | null = null;

export function soundChoice(): SoundChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(KEY);
    if (v === "on" || v === "off") return v;
  } catch { /* storage blocked: the copy in memory */ }
  return memo;
}

export function setSoundChoice(c: SoundChoice): void {
  memo = c;
  try { window.sessionStorage.setItem(KEY, c); } catch { /* memory only */ }
}

export function soundOn(): boolean {
  return false;   // sound is removed (Mohan, Sun 07:25); soundChoice() is kept for the gate's wording
}
