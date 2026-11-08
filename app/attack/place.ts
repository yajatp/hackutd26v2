// Where a tank is, for Phone 1: the site (name, basin, state, as the US map and the model's site
// picker show it) and each tank's county and state. Pure, so place.test.ts runs it in Node.
import { DEFAULT_SITE_KEY, SITES } from "../../lib/sites.ts";

export type Site = (typeof SITES)[number];

// The site of ?site= (any case), or the default site. Unknown keys fall back to the default,
// like siteDatabase() in lib/live.ts.
export function siteFor(raw: string | null | undefined): Site {
  const key = (raw ?? "").toLowerCase();
  return SITES.find((s) => s.key === key) ?? SITES.find((s) => s.key === DEFAULT_SITE_KEY)!;
}

// "Midland · Permian Basin · TX"
export function siteLine(site: Site): string {
  return `${site.name} · ${site.basin} · ${site.state}`;
}

// A tank's county. Generated sites name each pad after its county ("La_Salle_County_4"), so
// that wins. Otherwise the generator's own rule (scripts/make-fake-site.mjs padNamer): system
// S<n> sits in the site's counties[(n - 1) % counties.length]. Null when neither applies.
export function countyOf(site: Site, facility_id: string, system_id: string): string | null {
  const pad = /^(.+?)_County_\d+$/.exec(facility_id);
  if (pad) return pad[1].replace(/_/g, " ");
  const sys = /^S(\d+)$/.exec(system_id);
  if (!sys || !site.counties.length) return null;
  const n = Number(sys[1]);
  return n >= 1 ? site.counties[(n - 1) % site.counties.length] : null;
}

// "Martin County, TX", or just "TX" when the county is unknown.
export function placeLine(site: Site, facility_id: string, system_id: string): string {
  const county = countyOf(site, facility_id, system_id);
  return county ? `${county} County, ${site.state}` : site.state;
}
