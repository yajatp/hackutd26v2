// Sound is removed (Mohan, Sun 07:25). Sound helpers still ask soundOn() before they play, and it
// always answers no. The old per-session choice is kept in sessionStorage (with a copy in memory
// for browsers that refuse storage) but nothing asks for it any more.

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
  return false;
}
