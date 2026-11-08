Task: `/spacetime`, a live "under the hood" page for the SpacetimeDB judges

Context: Avon (repo yajatp/hackutd26v2). Make a branch `yajat/spacetime-live` from `origin/mohan/live`. Read `docs/ARCHITECTURE.md`, `spacetimedb/README.md`, `docs/DESIGN.md` and `lib/live.ts` first.
The SpacetimeDB judges want to see SpacetimeDB doing the work. This page runs on a second screen next to `/console` during the demo. When the judge presses Confirm on the console, or a teammate taps Fake on Phone 1, this page shows the reducer call landing and the rows it changed, live.

Build (read-only: this page never calls a reducer):
1. Open your own connection to the `avon` database. Reuse what `lib/live.ts` exports (`connectAvon`, `avonUri`, `AVON_DB`); do not edit `lib/live.ts`. Subscribe to every public table: config, facility, alert, console_meta, sensor_issue, fault, confirmation (check `lib/module_bindings` for exact names).
2. A live feed of row changes. Each insert, update or delete is one line: the time it arrived, the table, the operation, and the 1 to 3 fields a person cares about (e.g. fault: asset and kind; confirmation: headline and cost). Newest first, keep the last 200. Coalesce a big rebuild (finish_ingest rewrites every alert) into one line, e.g. "alert: 14 rows replaced".
3. Which reducer caused it. Check the SDK types in `lib/module_bindings` and `node_modules/spacetimedb` for the event on a row callback (`ctx.event`). If the reducer name and caller are really there, show them (inject_fault, confirm_plan, finish_ingest...). If they are not, leave it out. Do not guess.
4. The one bold moment: a live matrix of reducers (rows) by tables (columns), from `spacetimedb/README.md`. When a transaction lands, its reducer's row and the tables it touched light up, then settle. It answers "which reducer writes which table" from what actually happened. Respect `prefers-reduced-motion`.
5. Per table: current row count and time of the last change. A connection chip (reuse `ConnBadge` from `app/ui/Badge.tsx`).
Design: follow `docs/DESIGN.md` exactly (night page, DIN, red and amber only for state, no card grids).

Files you own: `app/spacetime/**` only. Put the feed logic in a pure function (`app/spacetime/feed.ts`) with tests in `app/spacetime/feed.test.ts`, run with `npx tsx --test app/spacetime/*.test.ts`. Do not edit any other file. Do not add dependencies. Do not run `next build` or `npm run build`; use `npx tsc --noEmit`, `npx eslint app/spacetime` and the dev server.

Done when:
- the tests pass;
- tsc and eslint show no errors in `app/spacetime`;
- on L1 with `npm run demo` running, you tap Fake then Clear on `/attack` and press Confirm on `/console`, and `/spacetime` shows each one landing, with the right table changes;
- you paste screenshots at 1440 and 390 wide plus the test output.

Commit on `yajat/spacetime-live` with your own git identity, no AI-credit lines, keep the word "Claude" out of commit messages, push only that branch. Never push to main or mohan/live, never force push. Mohan merges.
