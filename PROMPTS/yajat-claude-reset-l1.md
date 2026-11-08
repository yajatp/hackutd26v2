Build the between-judges reset for Laptop 1 and prove it on this laptop. Work in avon/.

Setup:
  git fetch origin
  git switch -c yajat/reset origin/main
  npm ci
Read first: docs/PLAN.md section 0 (lines 5-40: the judge now plays the night-shift operator; a teammate plays the bad night on Phone 1), docs/RUNBOOK-L1.md (yours), scripts/boot-avon.mjs (yours), scripts/ingest.mjs, spacetimedb/src/index.ts (reducers clear_fault and the load path).

Why: between every judge, L1 must go back to the same clean start in seconds: no simulated faults, the demo site loaded, the console showing the same top card, Phone 1 showing 0 active faults.

Build scripts/reset-avon.mjs (Node, standard library only, macOS and Windows), already wired as `npm run demo:reset` in package.json (do NOT edit package.json):
1. Checks SpacetimeDB answers on 127.0.0.1:3001 and the avon database exists; if not, prints "run npm run demo first" and exits 1.
2. Clears every simulated fault: spacetime call -s http://127.0.0.1:3001 avon clear_fault '""'
3. Reloads the demo folder (default ../eog-data/history/mock_test_2026-10-10T1530, or a folder passed as the first argument) through scripts/ingest.mjs, exactly like boot step 3.
4. Checks the result over HTTP SQL (POST http://127.0.0.1:3001/v1/database/avon/sql): console_meta has the folder name as dataset_id, the fault table is empty, sensor_issue is empty, and alert rank 1 is the expected first card (on mock_test: facility S5_FACILITY_C).
5. Prints READY with the time taken and the two phone URLs (same LAN address logic as boot-avon.mjs), or a plain reason it is not ready.
It must not stop or restart SpacetimeDB or the dev server, must not publish, and must never use --delete-data.

Test on this laptop, with npm run demo running: tap Fake and Kill on two tanks from a phone, then run npm run demo:reset; the laptop console and the phone must both go back to the clean start without a page reload. Do it 3 times in a row and record the time each run took (goal: under 10 s). Add a short "Between judges" section to docs/RUNBOOK-L1.md.

Rules: only create scripts/reset-avon.mjs and edit docs/RUNBOOK-L1.md. No new dependencies. SpacetimeDB safety as before: always -s http://127.0.0.1:3001, never spacetime login, never print a token. Commit on yajat/reset with your own git identity and push only that branch; never push to main or mohan/live, never force push.
Done when the 3 timed runs passed. Reply with the times, what the console and phone showed after each reset, and anything that did not work.
