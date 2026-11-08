Task (about 5:05): add the LOCKDOWN path to the browser rehearsal (`npm run e2e -- --lockdown`)

Context: Avon (repo yajatp/hackutd26v2). Make a branch `yajat/e2e-lockdown` from the newest `origin/mohan/live`. `npm run e2e` (`scripts/e2e.mjs`, `scripts/e2e/screens.mjs`, `scripts/e2e/playwright.mjs`) drives the judge's path on `/console` and Phone 1. LOCKDOWN is new (`docs/LOCKDOWN.md`; `app/console/lockdown/*`; the `lockdown` table and the `enter_lockdown` / `end_lockdown` reducers; Phone 1's `LockdownBanner`), and nothing tests it end to end.

Build `--lockdown`, which runs after step 5 of the normal run:
- L1: on the top card, press and hold **Lock down and move to the Darkroom** for the hold time.
- L2: the console shows the LOCKDOWN state and the evidence card, with the same AV- reference as step 5. Phone 1 shows its lockdown banner, and its fault buttons are disabled.
- L3: press **End lockdown**. The console returns, and Phone 1's controls work again.
- Print one PASS or FAIL line with timings for each step.
- Read selectors from the real DOM (read the lockdown components). If you need a stable hook, add a `data-testid` and say which line and file; do not change any words.
- The normal run without `--lockdown` must not change. If a stable selector truly needs an app change, keep it to `data-testid` attributes and list them; Mohan merges them.

Also: when a step fails, `scripts/e2e.mjs` should save the page's console errors next to the screenshot.

Files: `scripts/e2e.mjs`, `scripts/e2e/**`, plus `data-testid`-only edits if unavoidable. Never run `next build` or `npm run build`.

Done when `npm run e2e` and `npm run e2e -- --lockdown --runs 2` both pass on L1; paste the output. Commit with your own git identity, no AI-credit lines, push only `yajat/e2e-lockdown`. Mohan merges.
