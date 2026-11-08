Task (hefty): oil sites across America, one SpacetimeDB database each, for the US map

Context: Avon (repo yajatp/hackutd26v2). Make a branch `yajat/sites` from the newest `origin/mohan/live`. Mohan wants a zoomable map of America with clickable sites, "like how EOG has sites around there", and a way to compare sites (e.g. Midland, San Antonio).

The client already supports one database per site: any Avon page opened with `?site=<key>` connects to `avon-<key>`, and to `<NEXT_PUBLIC_AVON_DB>-<key>` on the hosted copy (see `siteDatabase` in `lib/live.ts`). Your job is the data and tooling behind that. A separate lane builds the map UI from your registry. Do `PROMPTS/yajat-codex-cloud.md` first if it is not done; it is shorter.

Read:
- `scripts/make-fake-site.mjs` (yours: renames IDs and rescales a real EOG folder);
- `scripts/ingest.mjs` (`--cloud`, `--uri`, `--db`);
- `scripts/boot-avon.mjs` and `scripts/reset-avon.mjs`;
- `spacetimedb/README.md`;
- `lib/live.ts` (`siteDatabase`, `AVON_DB`).

Build:
1. `lib/sites.ts`, a registry. Each site has: key, name, basin, city, state, lat, lon, the source folder, and a seed. Use EOG's real operating areas and their public, well-known locations:
   - `permian`: Permian Basin, Midland TX. The existing `mock_test_2026-10-10T1530`, already in database `avon` / `avon-hackutd26`; its key maps to the default database, no suffix.
   - `delaware`: Delaware Basin, near Carlsbad NM.
   - `eagleford`: Eagle Ford, south of San Antonio TX.
   - `dorado`: South Texas Dorado, near Laredo TX.
   - `powder`: Powder River Basin, near Casper WY.
   - `williston`: Williston Basin, near Williston ND.

   Coordinates are for map placement only. Keep the comment honest: these are illustrative sites built from EOG's challenge data, not EOG's real facilities.
2. `make-fake-site.mjs` gets `--center <lat,lon>`, which moves every facility so the site's centre sits there and keeps its shape. Add `--name`. Keep it deterministic per seed, and keep its tests passing.
3. `scripts/sites.mjs` (`npm run sites` once Mohan wires it). For each non-default site:
   - generate its folder under `../eog-data/fake/<key>` from `history/full_week` or the snapshots with its own seed, so the problems differ across sites;
   - publish the avon module to the local server as `avon-<key>` (in place; never `--delete-data` on an existing database);
   - ingest the site.

   With `--cloud` it also publishes and ingests `avon-hackutd26-<key>` on maincloud. Use `spacetime publish -s maincloud --module-path spacetimedb -y avon-hackutd26-<key>`. Only Yajat's or Mohan's machine can do this, and only if logged in; never run `spacetime login` from the script, never print tokens. Print a summary table: site, database, facilities, top problem, plans total.
4. `scripts/reset-cloud.mjs` (from the cloud prompt) gets `--site <key>` and `--all`.
5. Tests with `node:test`: registry integrity (unique keys, coordinates within the US, the default site has no suffix), and `--center` moving the centroid.

Do not edit app code or `package.json`; Mohan wires `npm run sites`. Do not run `next build` or `npm run build`.

Done when:
- the tests pass;
- `node scripts/sites.mjs` creates and loads all the local site databases (paste the summary);
- `http://localhost:3000/console?site=eagleford` shows a different site with LIVE;
- if you are logged in on the hosted side, `--cloud` loads the hosted copies too (paste the summary).

Commit on `yajat/sites` with your own git identity and no AI-credit lines. Push only that branch, never to main or mohan/live, never force push. Mohan merges.
