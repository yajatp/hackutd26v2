Task: reset and check the hosted copy (Vercel plus SpacetimeDB maincloud)

Context: Avon (repo yajatp/hackutd26v2). Make a branch `yajat/cloud` from the newest `origin/mohan/live`. The venue Wi-Fi blocks devices from reaching each other, so the Avon side now also runs hosted:
- the screens at https://avon-hackutd26.vercel.app (`/console`, `/attack`, `/twin`, `/vr`), built with `NEXT_PUBLIC_AVON_URI=wss://maincloud.spacetimedb.com` and `NEXT_PUBLIC_AVON_DB=avon-hackutd26`;
- the `avon` module published to maincloud as the database `avon-hackutd26`.

The Darkroom stays local on purpose: it is the isolated box. Read `lib/live.ts` (avonUri, AVON_DB), `scripts/ingest.mjs` (its `--cloud` flag), `scripts/reset-avon.mjs` (what a reset between judges must leave) and `scripts/e2e/screens.mjs` (readConsole).

Build, Node 22, standard library plus the generated bindings and the Playwright loader we already use; add no dependency:
1. `scripts/reset-cloud.mjs`: the between-judges reset for the hosted copy, run from a laptop that has `../eog-data`.
   - Connect with the bindings in `lib/module_bindings` to `wss://maincloud.spacetimedb.com` and database `avon-hackutd26`. Allow overrides with `--uri` and `--db`, but refuse anything that is not wss://.
   - Reload `history/mock_test_2026-10-10T1530` through the same reducers `scripts/ingest.mjs` uses. You may import its functions if you export them without changing its behaviour.
   - Clear every fault (`clear_fault("")`).
   - Read back `console_meta`, `fault`, `sensor_issue` and `confirmation`. Print `READY in X s`, the top card's facility, and `faults N active, N sensor issues, N confirmed plans`, the same shape as `npm run demo:reset`. Exit 0 only when all three counts are 0.
   - Never use the spacetime CLI, never log in, never print tokens.
2. `scripts/cloud-check.mjs`: a smoke test of the hosted copy as a judge sees it.
   - Headless Chrome via `loadPlaywright` and `launchBrowser` from `scripts/e2e/playwright.mjs`.
   - Open https://avon-hackutd26.vercel.app/console. Run `readConsole` from `scripts/e2e/screens.mjs` and check LIVE, S5 · FACILITY C, "Do this: Call 1 truck now, 1 trip", $905 and "trips in 2h 03m".
   - Open `/attack` at 360x740 and check it says LIVE.
   - Open `/vr` and check its first readiness line says Live data.
   - Print one PASS or FAIL line per check, with the round-trip shown in the badge (e.g. "LIVE · 183 ms"), and exit 0 or 1. `--url` takes another deployment.
3. Tests (`node --test`) for any pure parts, for example parsing the counts and refusing a ws:// URI.

Files you own: `scripts/reset-cloud.mjs`, `scripts/cloud-check.mjs`, their tests, and an exported helper in `scripts/ingest.mjs` only if needed. Do not edit app code or `package.json`; Mohan adds `npm run demo:reset:cloud` and `npm run cloud:check` when merging. Do not run `next build` or `npm run build`. Do not deploy to Vercel.

Done when:
- the tests pass;
- `node scripts/reset-cloud.mjs` prints READY with 0 / 0 / 0 against the real hosted database (paste it);
- `node scripts/cloud-check.mjs` passes against https://avon-hackutd26.vercel.app (paste it).

Commit on `yajat/cloud` with your own git identity and no AI-credit lines. Push only that branch, never to main or mohan/live, never force push. Mohan merges.
