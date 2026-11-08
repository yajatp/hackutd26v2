// What the map says about each site, as pure helpers (tested in app/map/model.test.ts): its worst
// state, its finding tags, the comparison order, and EOG's basins drawn softly behind the markers.
import type { SiteSummary } from "../../lib/fleet.ts";

export type Tone = "alert" | "warn" | "ok" | "off";

// Red for a pump failure or a lockdown, amber for a sensor to check, a place to inspect or a
// simulated fault, calm green when the console has nothing; dust while there is no data.
export function toneOf(s: SiteSummary): Tone {
  if (s.status !== "connected" && s.datasetId === null) return "off";
  if (s.lockdown || s.pumpFailures > 0) return "alert";
  if (s.sensorIssues > 0 || s.inspections > 0 || s.simulatedFaults > 0) return "warn";
  return "ok";
}

export interface Tag { tone: Tone; icon: string; text: string }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ethiack-style finding tags, worst first: "■ 2 PUMP FAILURES".
export function tagsOf(s: SiteSummary): Tag[] {
  const out: Tag[] = [];
  if (s.status === "connecting" && s.datasetId === null) return [{ tone: "off", icon: "□", text: "CONNECTING" }];
  if (s.status === "disconnected" && s.datasetId === null) return [{ tone: "off", icon: "□", text: "NO DATA" }];
  if (s.lockdown) out.push({ tone: "alert", icon: "▲", text: "LOCKDOWN" });
  if (s.pumpFailures) out.push({ tone: "alert", icon: "■", text: plural(s.pumpFailures, "PUMP FAILURE", "PUMP FAILURES") });
  if (s.sensorIssues) out.push({ tone: "warn", icon: "●", text: plural(s.sensorIssues, "SENSOR TO CHECK", "SENSORS TO CHECK") });
  if (s.inspections) out.push({ tone: "warn", icon: "●", text: plural(s.inspections, "TO INSPECT", "TO INSPECT") });
  if (s.simulatedFaults) out.push({ tone: "warn", icon: "●", text: plural(s.simulatedFaults, "SIMULATED FAULT", "SIMULATED FAULTS") });
  if (!out.length) out.push({ tone: "ok", icon: "■", text: "ALL CLEAR" });
  return out;
}

export const saving = (s: SiteSummary) => Math.max(0, s.doNothing - s.plans);

export const money = (x: number) => "$" + Math.round(x).toLocaleString("en-US");

// A generated site's ids end in a 12-digit hash (scripts/make-fake-site.mjs): "Facility-4dcda90a2ab0"
// reads as "Facility 4DCD", "shut in Well-61ae6a3d1cda" as "shut in Well 61AE".
export const shortIds = (text: string) =>
  text.replace(/\b([A-Z][a-z]+)-([0-9a-f]{4})[0-9a-f]{8}\b/g, (_m, kind: string, h: string) => `${kind} ${h.toUpperCase()}`);

// The console's facility label: "S5_FACILITY_C" -> "S5 · FACILITY C".
export const pretty = (id: string) => shortIds(id).replace(/^(S\d+)_/, "$1 · ").replace(/_/g, " ");

export type SortKey = "name" | "pumpFailures" | "sensorIssues" | "plans" | "doNothing" | "saving";
export interface Sort { key: SortKey; dir: "asc" | "desc" }

// `short` heads the column on a phone; `wide` columns fold into the site's cell there instead.
export const COLUMNS: { key: SortKey; label: string; short: string; money: boolean; wide?: true }[] = [
  { key: "name", label: "Site", short: "Site", money: false },
  { key: "pumpFailures", label: "Pump failures", short: "Failures", money: false },
  { key: "sensorIssues", label: "Sensors to check", short: "Sensors", money: false, wide: true },
  { key: "plans", label: "These plans cost", short: "Plans", money: true, wide: true },
  { key: "doNothing", label: "Doing nothing costs", short: "Nothing", money: true, wide: true },
  { key: "saving", label: "Saving", short: "Saving", money: true },
];

const valueOf = (s: SiteSummary, key: SortKey): number | string => (key === "saving" ? saving(s) : key === "name" ? s.name : s[key]);

// Ties fall back to the saving, then the name, so the order never jumps between renders.
export function sortSites(sites: readonly SiteSummary[], sort: Sort): SiteSummary[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...sites].sort((a, b) => {
    const va = valueOf(a, sort.key), vb = valueOf(b, sort.key);
    const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
    return sign * c || saving(b) - saving(a) || a.name.localeCompare(b.name);
  });
}

// A click on a column: the same column flips, a new one starts at its natural order (names
// A to Z, numbers biggest first).
export function nextSort(cur: Sort, key: SortKey): Sort {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "name" ? "asc" : "desc" };
}

export interface FleetTotals { live: number; sites: number; failures: number; failingSites: number; plans: number; doNothing: number }
export function totalsOf(sites: readonly SiteSummary[]): FleetTotals {
  const t: FleetTotals = { live: 0, sites: sites.length, failures: 0, failingSites: 0, plans: 0, doNothing: 0 };
  for (const s of sites) {
    if (s.status === "connected") t.live++;
    t.failures += s.pumpFailures;
    if (s.pumpFailures) t.failingSites++;
    t.plans += s.plans;
    t.doNothing += s.doNothing;
  }
  return t;
}

// Which side of its marker a site's label sits on, so the Texas sites do not collide at the US view.
export const LABEL_SIDE: Record<string, Side> = {
  permian: "right", delaware: "left", eagleford: "right", dorado: "left", powder: "right", williston: "right",
};

// EOG's basins as soft ellipses (centre lon/lat, semi-axes in degrees, rotation): approximate
// extents for orientation, not survey boundaries. A label shows from zoom minK, so the Texas
// basins do not crowd the US view.
export const BASINS = [
  { key: "permian", name: "Permian Basin", lon: -102.3, lat: 31.6, a: 2.2, b: 1.75, rot: 10, label: [-101.2, 33.7], minK: 1.6 },
  { key: "delaware", name: "Delaware Basin", lon: -103.9, lat: 31.7, a: 1.05, b: 0.95, rot: -30, label: [-105.6, 30.4], minK: 2.6 },
  { key: "eagleford", name: "Eagle Ford", lon: -98.0, lat: 29.0, a: 2.7, b: 0.5, rot: 38, label: [-95.6, 30.9], minK: 1.6 },
  { key: "dorado", name: "South Texas Dorado", lon: -99.4, lat: 27.7, a: 0.7, b: 0.45, rot: 30, label: [-101.2, 26.9], minK: 2.6 },
  { key: "powder", name: "Powder River Basin", lon: -105.8, lat: 43.9, a: 1.2, b: 1.9, rot: 0, label: [-108.1, 45.7], minK: 1 },
  { key: "williston", name: "Williston Basin", lon: -103.0, lat: 47.6, a: 3.4, b: 1.9, rot: 0, label: [-99.0, 46.5], minK: 1 },
] as const;

// Labels that fit. Each marker's label is a box beside its dot: level with it on its preferred
// side, else the other side, else raised or lowered on either side to clear a near neighbour.
// Markers are placed best first by rank (the selected one, then the demo's default site, then
// worst state); a label that would cover an earlier label, any marker's dot, a blocked box (the
// zoom buttons, the hint, the open panel) or cross the map's edge is hidden until the map is
// zoomed in (it still shows on hover and focus).
export type Side = "left" | "right";
export interface LabelBox { key: string; x: number; y: number; side: Side; w: number; h: number; rank: number }
export interface Placement { side: Side; dy: number }   // dy: px the label sits below (+) or above (-) its dot
export type Rect = [number, number, number, number];   // x0, y0, x1, y1 in map px

const DOT = 12;                                  // half the marker's hit square, px
const EDGE = 4;                                  // a label keeps this far inside the map's edge

export function labelWidth(name: string, tags: readonly string[]): number {
  return Math.max(name.length * 7.6 + 14, ...tags.map((t) => t.length * 7.4 + 26));
}

export const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

export const inside = (r: Rect, b: Rect, edge = EDGE) =>
  r[0] >= b[0] + edge && r[1] >= b[1] + edge && r[2] <= b[2] - edge && r[3] <= b[3] - edge;

export const dotRect = (m: LabelBox): Rect => [m.x - DOT, m.y - DOT, m.x + DOT, m.y + DOT];

export function labelRect(m: LabelBox, p: Placement): Rect {
  const x0 = p.side === "right" ? m.x + DOT : m.x - DOT - m.w;
  return [x0, m.y - m.h / 2 + p.dy, x0 + m.w, m.y + m.h / 2 + p.dy];
}

export function placeLabels(
  items: readonly LabelBox[],
  opts: { bounds?: Rect; blocked?: readonly Rect[] } = {},
): Map<string, Placement> {
  const shown = new Map<string, Placement>();
  const taken: Rect[] = [...items.map(dotRect), ...(opts.blocked ?? [])];
  const rectOf = labelRect;
  for (const m of [...items].sort((a, b) => a.rank - b.rank)) {
    const other: Side = m.side === "right" ? "left" : "right";
    const lift = Math.max(0, m.h / 2 - 8);
    const tries: Placement[] = [
      { side: m.side, dy: 0 }, { side: other, dy: 0 },
      { side: m.side, dy: -lift }, { side: m.side, dy: lift },
      { side: other, dy: -lift }, { side: other, dy: lift },
    ];
    for (const p of tries) {
      const r = rectOf(m, p);
      if (opts.bounds && !inside(r, opts.bounds)) continue;
      if (taken.some((t) => overlaps(r, t))) continue;
      taken.push(r);
      shown.set(m.key, p);
      break;
    }
  }
  return shown;
}

// The demo's default site ranks just after the selected one, so Midland keeps its label at the
// crowded Texas cluster of a phone's US view.
export function labelRank(key: string, tone: Tone, selected: string | null, defaultKey: string): number {
  if (key === selected) return -2;
  if (key === defaultKey) return -1;
  return TONE_RANK[tone];
}

// A basin's name, as a box about its centre: shown only while the whole word is on the map, clear of
// the buttons and of every marker and label.
export const basinLabelWidth = (name: string) => name.length * 8.8 + 6;

export const TONE_RANK: Record<Tone, number> = { alert: 0, warn: 1, ok: 2, off: 3 };
