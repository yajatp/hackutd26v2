// "Permian Night", the headset world's theme (docs/TWIN-THEME.md). Every color, font and scale
// in the redesigned /twin comes from here, so the world, the models, the menu and the effects match.

export const C = {
  skyZenith: "#070b24",
  skyMid: "#1d1a4f",
  skyHorizon: "#5b2f6e",
  duskGlow: "#ff7a4d",
  stars: "#dfe8ff",
  ground: "#2a211c",
  groundLit: "#6b4f3a",
  holo: "#4de2ff",
  holoDim: "#1b6f86",
  glass: "rgba(10,16,40,0.78)",
  text: "#eaf3ff",
  textDim: "#9fb2d6",
  ok: "#3ddc97",
  warn: "#ffb020",
  alert: "#ff3b4e",
  steel: "#c9ced6",
  pumpjack: "#2f5bd3",
  pumpjackLight: "#e8ecf2",
} as const;

// The console's meaning, in the headset's colors: tone "alert" = pump failed, "warn" = check.
export const TONE_COLOR = { alert: C.alert, warn: C.warn, ok: C.ok } as const;

export const FONT = {
  label: '"Chakra Petch", "Barlow Condensed", sans-serif',
  body: '"Barlow", "Roboto", sans-serif',
  // Load before drawing canvas text, so the headset never shows a fallback face.
  load: ['600 64px "Chakra Petch"', '700 64px "Chakra Petch"', '400 64px "Barlow"', '500 64px "Barlow"'],
} as const;

export type ViewMode = "table" | "overview" | "ground";

export const VIEW = {
  table: { siteMeters: 1, label: "Table" },         // the holographic miniature, as on entry
  overview: { siteMeters: 14, label: "Overview" },  // the site on the desert floor around you
  ground: { siteMeters: null, label: "Walk" },      // life size at one facility pad
} as const;

export const FADE_MS = 250;           // each half of a view change: fade out, move, fade in
export const SNAP_TURN_DEG = 30;

// Real sizes in meters, for the life-size view and the models.
export const SIZE = {
  tankDiameter: 3.7,
  tankHeight: 6,
  padRadius: 20,
  standOff: 8,                         // ground view: start this far south of the tank
} as const;
