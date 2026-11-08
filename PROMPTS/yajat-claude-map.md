Task (hefty): `/map`: a zoomable map of America with EOG's basins, live sites you can click, and a site comparison

Context: Avon (repo yajatp/hackutd26v2). Your lockdown branch passed review (16/16 tests, tsc clean). Mohan merges it as soon as two of his lanes finish with the same files. Make a new branch `yajat/map` from the newest `origin/mohan/live`.

Mohan: "can you also make a zoom outable map of america so we can click on specific sites in america like how EOG has sites around there" and "compare to datasets from each of the sites (eg, midland, san antonio)".

Read:
- `lib/sites.ts`: six sites with lat/lon, basin, city;
- `lib/live.ts`: `siteDatabase`, and `?site=<key>` on any page opens that site;
- `docs/DESIGN.md` and `docs/DESIGN-RESEARCH.md` (round 2: puture's grid and crosshair markers, ethiack's red finding tags);
- `docs/TWIN-THEME.md` (the headset's Permian Night palette).

Codex is building `lib/fleet.ts` in parallel with exactly this interface. Build against it, with a local stub until it lands:
```ts
export interface SiteSummary { key; name; basin; city; state; lat; lon; db; status: "connecting" | "connected" | "disconnected";
  datasetId: string | null; facilities: number; pumpFailures: number; inspections: number; sensorIssues: number; simulatedFaults: number;
  plans: number; doNothing: number; top: { facilityId: string; text: string } | null; lockdown: boolean }
export function useFleet(): { sites: SiteSummary[]; ready: boolean };
```

Build `app/map/**`, one page:
1. **The map:** the contiguous US as SVG.
   - Write the Albers USA conic projection yourself; no d3. It's about 30 lines: standard parallels 29.5 and 45.5, centred near 38N 98W.
   - The state outlines come from a small public-domain GeoJSON saved in `public/geo/` (for example Natural Earth admin-1 or US Census cartographic boundaries, simplified; under about 300 KB; keep its licence beside it). It must render with no internet.
   - Zoom and pan without a library: mouse wheel and pinch to zoom around the cursor, drag to pan, double-click to zoom in, a "Zoom out to the US" button. Ease every change (about 300 ms).
   - Basins are labelled softly. Each site is a marker: a pulsing ring coloured by its worst state (red pump failure, amber sensor or inspect, calm green OK) with a small finding tag in the ethiack style ("■ 2 PUMP FAILURES").
2. **Click a site:** the map flies to it (zoom ease), and a side panel slides in with its name, basin and city; LIVE status; facilities; pump failures; sensor issues; the night's cost (plans vs doing nothing); the top card in one line; and buttons Open console (`/console?site=<key>`), Open the model (`/twin?site=<key>`) and Phone 1 (`/attack?site=<key>`).
3. **Compare sites:** a small-multiples table or bars under or beside the map, one row per site. Show pump failures, sensor issues, plans cost, doing-nothing cost and the saving, sortable by clicking a column, and highlight the selected site.
4. **The look:**
   - night background with puture's faint perspective grid and "+" crosshair markers behind the map;
   - states as thin moonlight lines over a slightly lighter land fill;
   - Chakra Petch for labels, Barlow for text, as in `app/fonts.css`;
   - red and amber only for state;
   - prefers-reduced-motion respected;
   - works at 390 px wide (the map on top, the panel as a bottom sheet).
5. **Tests:** the projection (Midland, Williston and Laredo land in the right order and in the frame), and the zoom math as pure helpers.

Files: `app/map/**`, `public/geo/**`. Don't touch other app folders (other lanes); Mohan adds links to `/map` from the console and `/vr`. Never run `next build` or `npm run build`. No new dependencies.

Done when:
- the tests pass;
- `npx tsc --noEmit` and `npx eslint app/map` are clean;
- you have screenshots at 1440 and 390 of: the US view, zoomed into Texas with a site panel open, and the compare table.

Commit on `yajat/map` with your own git identity, no AI-credit lines, and the word "Claude" kept out of messages. Push only that branch. Mohan merges.
