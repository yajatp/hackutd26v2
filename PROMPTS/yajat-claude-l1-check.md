Check tonight's whole Avon side on this laptop (L1, macOS) the way judging day will run it, and report. Small job: change code only if a script fails on macOS. Work in avon/.

Setup:
  git fetch origin
  git switch -c yajat/l1-check origin/main
  npm ci
Read: docs/RUNBOOK-L1.md (yours), the top comment of scripts/smoke.mjs, PROMPTS/README.md.

Run, in order, and keep the last lines of each:
1. npm run demo        (boot; leave it running in its own terminal)
2. npm run smoke -- --runs 3
   It runs the whole demo path on its OWN databases (avon-smoke, darkroom-smoke) on this laptop's server and must end with SMOKE PASSED. It was written on Linux; if it fails on macOS for a portability reason (paths, temp dirs, tsx, shell commands), fix only scripts/smoke.mjs or scripts/smoke/* with the smallest change and say what you changed.
3. npm run fake:site   (builds a second, different oil site from EOG's data in ../eog-data/fake/permian_site)
   On http://localhost:3000/console click the permian_site button. Expected: names like "Facility-3226807a279b", 2 pump failures, the top one "trips in 2h 03m". Note what the top card says.
4. On a phone: open the /attack URL that npm run demo printed, tap Fake on the first tank, check the laptop console shows LYING · SIMULATED at the top and the fix card for that tank says CHECK THE TANK SENSOR FIRST. Tap Clear all.
5. npm run demo:reset  (must print READY with the mock_test top card)

Write what happened in a new section "Checks, Sun early morning" at the end of docs/RUNBOOK-L1.md: each step, pass or fail, times, and anything odd. Commit on yajat/l1-check with your own git identity (only docs/RUNBOOK-L1.md, plus scripts/smoke* if you had to fix them), push only that branch and open a PR. Never push to main or mohan/live, never force push. SpacetimeDB safety as before: always -s http://127.0.0.1:3001, never spacetime login, never print a token, never --delete-data on avon or darkroom.
