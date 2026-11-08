// The /twin entry flow, as plain data: the judge starts at a 3D map of the US, picks a site, works
// that site (Table, Overview, Walk) and can go back to the map. No page reload anywhere: a reload
// would end the headset's XR session. Unit-tested in entry.test.ts.
import { SITES } from "@/lib/sites";
import type { SiteSummary } from "@/lib/fleet";

// The Darkroom (app/twin/darkroom/): the isolated incident room. `site` is where the judge came
// from (null from the map), so "Return to the site" goes back there.
export type Entry = { at: "map" } | { at: "site"; site: string } | { at: "darkroom"; site: string | null };

export const MAP: Entry = { at: "map" };

const KEYS = new Set<string>(SITES.map((s) => s.key));

export function isSiteKey(key: string | null | undefined): key is string {
  return !!key && KEYS.has(key.toLowerCase());
}

// /twin?site=<key> goes straight to that site; no parameter (or an unknown one) starts at the map.
export function initialEntry(search: string): Entry {
  const key = new URLSearchParams(search).get("site");
  return isSiteKey(key) ? { at: "site", site: key.toLowerCase() } : MAP;
}

// Picking a marker. An unknown key keeps the current state.
export function pickSite(cur: Entry, key: string): Entry {
  if (!isSiteKey(key)) return cur;
  const site = key.toLowerCase();
  return cur.at === "site" && cur.site === site ? cur : { at: "site", site };
}

export function backToMap(): Entry {
  return MAP;
}

// Into the Darkroom from the map or a site; entering again keeps the state.
export function enterDarkroom(cur: Entry): Entry {
  if (cur.at === "darkroom") return cur;
  return { at: "darkroom", site: cur.at === "site" ? cur.site : null };
}

// "Return to the site": back to the site the judge came from, or the map if none.
export function leaveDarkroom(cur: Entry): Entry {
  if (cur.at !== "darkroom") return cur;
  return cur.site ? { at: "site", site: cur.site } : MAP;
}

// The site whose live data stays connected: the site, or the one the Darkroom was entered from.
export function entrySite(e: Entry): string | null {
  return e.at === "map" ? null : e.site;
}

// The query string for history.replaceState: ?site=<key> at a site, no site parameter at the map.
// Every other parameter is kept as it was.
export function entrySearch(search: string, e: Entry): string {
  const q = new URLSearchParams(search);
  const site = entrySite(e);
  if (site) q.set("site", site);
  else q.delete("site");
  const s = q.toString();
  return s ? `?${s}` : "";
}

// A site's state on the map: red for a pump failure, a simulated fault or a lockdown; amber for
// inspections and sensor issues; otherwise normal. Grey while it has not answered.
export type SiteTone = "alert" | "warn" | "ok" | "idle";

type Status = Pick<SiteSummary, "status" | "pumpFailures" | "inspections" | "sensorIssues" | "simulatedFaults" | "lockdown" | "facilities">;

export function siteTone(s: Status): SiteTone {
  if (s.status !== "connected") return "idle";
  if (s.lockdown || s.pumpFailures > 0 || s.simulatedFaults > 0) return "alert";
  if (s.inspections > 0 || s.sensorIssues > 0) return "warn";
  return "ok";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// The status line on a site's map label, in the console's plain words.
export function siteStatusText(s: Status): string {
  if (s.status === "connecting") return "Connecting";
  if (s.status === "disconnected") return "Offline";
  if (s.lockdown) return "Lockdown active";
  const parts: string[] = [];
  if (s.pumpFailures > 0) parts.push(plural(s.pumpFailures, "pump failure", "pump failures"));
  if (s.simulatedFaults > 0) parts.push(plural(s.simulatedFaults, "spoofed sensor", "spoofed sensors"));
  if (s.inspections > 0) parts.push(plural(s.inspections, "inspection", "inspections"));
  if (parts.length === 0 && s.sensorIssues > 0) parts.push(plural(s.sensorIssues, "sensor issue", "sensor issues"));
  if (parts.length === 0) return s.facilities > 0 ? `${plural(s.facilities, "facility", "facilities")} · Normal` : "Normal";
  return parts.slice(0, 2).join(" · ");
}
