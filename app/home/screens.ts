// The front door's index: every Avon screen in demo order, and the live hint each row shows.
// Pure (no React), so app/home/screens.test.ts runs it in Node.
import { SITES } from "../../lib/sites.ts";

export interface Screen { n: number; key: string; href: string; name: string; what: string }

// The real order of the demo, so the numbers are honest.
export const SCREENS: Screen[] = [
  { n: 1, key: "console", href: "/console", name: "Console", what: "The night operator's screen." },
  { n: 2, key: "attack", href: "/attack", name: "Phone 1", what: "A teammate breaks a sensor." },
  { n: 3, key: "twin", href: "/twin", name: "The model", what: "The site in 3D and VR." },
  { n: 4, key: "insight", href: "/insight", name: "Insight", what: "The budget, flows, breaches, what if." },
  { n: 5, key: "map", href: "/map", name: "Map", what: "Sites across America." },
  { n: 6, key: "box", href: "/box", name: "Darkroom", what: "The isolated incident room." },
  { n: 7, key: "spacetime", href: "/spacetime", name: "SpacetimeDB", what: "The database, live." },
  { n: 8, key: "vr", href: "/vr", name: "VR station", what: "Hand the judge the headset." },
];

// A known site key from ?site=, or null. Unknown values are dropped, never passed on.
export function siteParam(raw: string | string[] | undefined | null): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const key = (v ?? "").toLowerCase();
  return SITES.some((s) => s.key === key) ? key : null;
}

// Every screen keeps the site the front door was opened with.
export function hrefFor(href: string, site: string | null): string {
  return site ? `${href}?site=${encodeURIComponent(site)}` : href;
}

export function subtitleFor(site: string | null): string {
  const s = SITES.find((x) => x.key === site);
  if (!s || s.key === SITES[0].key) return "A night shift on a Permian oil site, live on SpacetimeDB.";
  return `A night shift at ${s.name} in the ${s.basin}, live on SpacetimeDB.`;
}

export type HintTone = "alert" | "warn" | "ok" | "quiet";
export interface Hint { text: string; tone: HintTone }

export interface LiveFacts {
  status: "connecting" | "connected" | "disconnected";
  failures: number | null;              // null until the board has arrived
  doNothing: number;
  plans: number;
  faults: number;
  facilities: number;
  lockdown: boolean;
  rttMs: number | null;
}

const money = (x: number) => "$" + Math.round(x).toLocaleString("en-US");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const ms = (x: number) => (x < 10 ? x.toFixed(1) : String(Math.round(x)));

// One short live line per row, where it is cheap to know.
export function hintFor(key: string, f: LiveFacts): Hint | null {
  if (f.status === "disconnected" && key !== "map" && key !== "vr") return { text: "Disconnected", tone: "quiet" };
  switch (key) {
    case "console":
      if (f.failures === null) return null;
      return f.failures ? { text: `▲ ${plural(f.failures, "pump failure", "pump failures")}`, tone: "alert" } : { text: "No pump failures", tone: "ok" };
    case "attack":
      return f.faults ? { text: `● ${plural(f.faults, "simulated fault", "simulated faults")} live`, tone: "warn" } : f.failures === null ? null : { text: "No faults injected", tone: "quiet" };
    case "twin":
      return f.facilities ? { text: plural(f.facilities, "facility", "facilities"), tone: "quiet" } : null;
    case "insight":
      return f.failures ? { text: `Savings ${money(Math.max(0, f.doNothing - f.plans))}`, tone: "quiet" } : null;
    case "map":
      return { text: plural(SITES.length, "site", "sites"), tone: "quiet" };
    case "box":
      return f.lockdown ? { text: "▲ LOCKDOWN", tone: "alert" } : null;
    case "spacetime":
      return f.rttMs !== null ? { text: `${ms(f.rttMs)} ms round trip`, tone: "quiet" } : null;
    default:
      return null;
  }
}
