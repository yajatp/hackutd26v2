Independent review of Avon before the demo. Find what would break or embarrass us in front of judges. Do not fix anything.

Setup (in avon-codex/, the folder you used for the fake site):
  git fetch origin
  git switch -c yajat/review origin/main
Read first: docs/PLAN.md section 0 (lines 5-92: the 90-second demo and the words we may and may not use), then README.md.

What to review: everything added tonight, `git diff 53a8cfd..origin/main` (about 9,000 lines). Spend most of your time on:
1. The demo path in PLAN.md section 0: lib/eog/* (detector, planner, alerts, validate), app/console/*, lib/live.ts, app/attack/*, lib/attack.ts.
2. Backend rules in SpacetimeDB reducers: spacetimedb/src/index.ts (avon: load_dataset, ingest_batch, finish_ingest, inject_fault, clear_fault) and spacetimedb-darkroom/src/index.ts (darkroom: open_incident, append_event, seed_member). Who can call each one? Can a client write something it should not (another member's name as actor, a closed incident, a stale or forged chain entry)?
3. Evidence integrity: lib/chain.ts, lib/rules/darkroom/*, scripts/verify.mjs, scripts/tamper.mjs, scripts/darkroom-reset.mjs, lib/evidence.ts. Can a log be cut or edited without ROLLBACK DETECTED or TAMPERING showing?
4. Claims: app/box/ThreatModelCard.tsx and any UI text. Flag any sentence the code does not back. Banned words: air-gapped, tamper-proof, unhackable, independently secure.

Run and paste the last lines of each (no SpacetimeDB server needed for these):
  npm ci
  npm test
  npx tsc --noEmit
  npm run lint
  npm run check:hardcode

Report: at most 15 findings, most severe first. For each: severity (demo-breaking / security / wrong claim / minor), file:line, what goes wrong, and the exact steps or input that trigger it. Mark anything you are not sure of as UNSURE. No style notes, no refactors.

Write the report to REVIEW-codex.md at the repo root, commit it on yajat/review with your own git identity, and push only that branch: git push origin yajat/review. Never push to main or mohan/live, never force push. Edit no other file.
