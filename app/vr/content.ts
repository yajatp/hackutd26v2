// The station's words, shared by /vr and every design version under /vr/lab, so each version
// says the same thing and only the presentation differs. Plain strings; the pages add the live parts.

export const ADB = "adb reverse tcp:3000 tcp:3000\nadb reverse tcp:3001 tcp:3001";

export const TITLE = "Hand the judge the night shift.";

// The hand-off is a real sequence (numbering is earned). {top} is the starting tank's name.
export const STEPS: { text: string; cmd?: string; note?: string }[] = [
  { text: "Plug the Quest into this laptop with a USB-C cable. Put it on and press Allow if it asks about USB debugging." },
  { text: "On the laptop, send both ports over the cable:", cmd: ADB, note: "adb devices must list the Quest as device, not unauthorized." },
  { text: "In the Quest Browser, open localhost:3000/vr. The browser line in the checks should now say it can enter VR." },
  { text: "Press Open the model. Stand where the judge will stand, face the way they will face, and press Enter VR." },
  { text: "Check what's in front of you: the How to use card ahead, the table below it, and {top}'s panel open on the right." },
  { text: "Take the headset off and hand it over with the right controller. Tell the judge:" },
];

export const SAY = "You're the night operator. Point at a tank and pull the trigger to see what's wrong.";

// {origin} is the laptop's address as the Quest would type it.
export const NO_CABLE = {
  title: "No cable, or no developer mode on the Quest 3S",
  text: "Put the Quest on the same hotspot as the laptop. In the Quest Browser open chrome://flags, search for insecure, set Insecure origins treated as secure to Enabled and enter {origin}. Relaunch the browser, then open {origin}/vr. If the browser check says it can enter VR, carry on from step 4.",
};

export const CONTROLS: [string, string][] = [
  ["Point at a tank, pull the trigger", "Opens its panel. A pinch works with bare hands."],
  ["Push the thumbstick", "Turns the table 30 degrees."],
  ["Reset view", "Puts the table back in front of the judge."],
];

export const LEGEND: { tone: "alert" | "warn" | "ok" | "ring"; text: string }[] = [
  { tone: "alert", text: "Pump failed" },
  { tone: "warn", text: "A sensor to check, or a place to inspect" },
  { tone: "ok", text: "OK" },
  { tone: "ring", text: "The console's top problem" },
];

export const FAKED_NOTE = "On this page, a tank that breaks up is one Phone 1 is faking. In the headset it reads LYING · SIMULATED.";

export const TROUBLE: [string, string][] = [
  ["The headset says DISCONNECTED", "Run both adb reverse lines again. They reset when the cable comes out or the headset restarts."],
  ["There is no Enter VR button", "The Quest opened the laptop's network address without the browser flag. Use localhost:3000 over the cable, or set the flag."],
  ["adb devices says unauthorized", "Put the headset on and press Allow on the USB debugging prompt."],
  ["The judge lost the table", "Press Reset view. If that fails, take the headset back, stand in place and press Enter VR again."],
];

export const HTTPS_NOTE = "Keep the dev server on http. An https page can't open the plain ws:// link to SpacetimeDB, and every screen would say DISCONNECTED.";

export function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}
