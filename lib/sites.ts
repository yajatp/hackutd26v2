// Illustrative sites built from EOG's challenge data. The coordinates place map markers
// near EOG's public operating areas and do not identify any EOG facility.
// `counties` are real counties of each basin; scripts/make-fake-site.mjs names a generated
// site's pads after them ("Loving County 7"). Midland keeps EOG's own facility ids.
// `timeZone` is the site's local clock (IANA zone).
export const DEFAULT_SITE_KEY = "permian";

export const SITES = [
  { key: DEFAULT_SITE_KEY, name: "Midland", basin: "Permian Basin", city: "Midland", state: "TX", lat: 31.9973, lon: -102.0779, source: "history/mock_test_2026-10-10T1530", seed: 0, timeZone: "America/Chicago", counties: ["Midland", "Martin", "Andrews"] },
  { key: "delaware", name: "Carlsbad", basin: "Delaware Basin", city: "Carlsbad", state: "NM", lat: 32.4207, lon: -104.2288, source: "history/full_week", seed: 41, timeZone: "America/Denver", counties: ["Eddy", "Lea", "Loving", "Reeves"] },
  { key: "eagleford", name: "San Antonio South", basin: "Eagle Ford", city: "San Antonio", state: "TX", lat: 28.9520, lon: -98.4786, source: "history/snapshot_2026-10-10T0900", seed: 73, timeZone: "America/Chicago", counties: ["Karnes", "Gonzales", "La Salle", "McMullen"] },
  { key: "dorado", name: "Laredo", basin: "South Texas Dorado", city: "Laredo", state: "TX", lat: 27.5036, lon: -99.5076, source: "history/snapshot_2026-10-09T0330", seed: 109, timeZone: "America/Chicago", counties: ["Webb", "Zapata"] },
  { key: "powder", name: "Casper", basin: "Powder River Basin", city: "Casper", state: "WY", lat: 42.8501, lon: -106.3252, source: "history/snapshot_2026-10-08T1200", seed: 151, timeZone: "America/Denver", counties: ["Converse", "Campbell", "Johnson"] },
  { key: "williston", name: "Williston", basin: "Williston Basin", city: "Williston", state: "ND", lat: 48.1470, lon: -103.6180, source: "history/snapshot_2026-10-10T0900", seed: 197, timeZone: "America/Chicago", counties: ["McKenzie", "Williams", "Mountrail"] },
] as const;
