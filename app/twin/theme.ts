// The headset world's theme, in the Sui style (UI) with the world's own environment colors. Every color, font and scale
// in the redesigned /twin comes from here, so the world, the models, the menu and the effects match.

export const C = {
  // Environment (L3 owns how the world uses these; names kept stable).
  skyZenith: "#070b24",
  skyMid: "#1d1a4f",
  skyHorizon: "#5b2f6e",
  duskGlow: "#ff7a4d",
  stars: "#dfe8ff",
  ground: "#2a211c",
  groundLit: "#6b4f3a",
  // UI, in the Sui style (https://www.sui.io): black page, dark panels, thin borders, greys,
  // white type and ONE accent, Sui blue. Red and amber only for alert states.
  holo: "#298DFF",                 // the accent (old name kept): actions, selection, key numbers
  holoDim: "#222529",              // thin borders and quiet strokes
  glass: "rgba(19,21,24,0.96)",    // panel #131518
  text: "#FFFFFF",
  textDim: "#A1A7B2",
  ok: "#89919F",                   // calm states stay grey: the accent is for actions
  warn: "#F5A524",
  alert: "#F04438",
  steel: "#c9ced6",
  pumpjack: "#2f5bd3",
  pumpjackLight: "#e8ecf2",
  // Sui tokens by name.
  page: "#000000",
  panel: "#131518",
  raised: "#222529",
  line: "#2A2E33",
  grey1: "#6C7584",
  grey2: "#89919F",
  grey3: "#A1A7B2",
  accent: "#298DFF",
} as const;

// The console's meaning, in the headset's colors: tone "alert" = pump failed, "warn" = check.
export const TONE_COLOR = { alert: C.alert, warn: C.warn, ok: C.ok } as const;

export const FONT = {
  label: '"Hanken Grotesk", "Helvetica Neue", Arial, sans-serif',   // headings and button words
  body: '"Hanken Grotesk", "Helvetica Neue", Arial, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace',          // small uppercase labels and figures
  // Load before drawing canvas text, so the headset never shows a fallback face.
  load: ['400 64px "Hanken Grotesk"', '500 64px "Hanken Grotesk"', '600 64px "Hanken Grotesk"', '700 64px "Hanken Grotesk"', '400 64px "IBM Plex Mono"', '500 64px "IBM Plex Mono"'],
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
