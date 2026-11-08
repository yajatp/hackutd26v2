Second review: check that your first findings are fixed, then try to break the Darkroom's evidence integrity again. Do not fix anything in the app.

START ONLY when origin/main has a commit whose message starts with "Fix review findings". Then, in avon-codex/:
  git fetch origin
  git switch -c yajat/review-2 origin/main
  npm ci
Read: REVIEW-codex.md (your first report), docs/PLAN.md section 0, app/box/ThreatModelCard.tsx, lib/chain.ts, lib/rules/darkroom/*.ts, lib/darkroom-live.ts, scripts/verify.mjs, spacetimedb-darkroom/src/index.ts.

Part 1, re-check: for each finding in REVIEW-codex.md say FIXED, PARTLY FIXED or NOT FIXED, with the same trigger steps you used before. The main session said it would fix 2, 3 (target order only), 7, 8, 9, 10 and 11 in this commit; 1, 3 (the phone label), 5 and 6 come later.

Part 2, red team the Darkroom, on a throwaway server only:
  spacetime start --listen-addr 127.0.0.1:3101   (a second server, never the team's 3001)
  publish spacetimedb-darkroom to it as a database you name (e.g. dr-redteam) with -s http://127.0.0.1:3101
  seed it with scripts/darkroom-seed.mjs pointed at that server if it supports it, or call seed_member yourself
Then, as the box owner with SQL access, try to change the record so that a screen that already saw it (and scripts/verify.mjs with a saved witness) does NOT report ROLLBACK DETECTED or TAMPERING. Ideas: payload numbers like 1e309, NaN, -0, huge integers; duplicate JSON keys; unicode lookalikes and different normalization; "__proto__" keys; very long strings; editing chain_head only; inserting a row with a duplicate seq; reordering rows; deleting then re-adding the same rows; changing the member table (role or name) without a log entry; replaying an old entry. For each attempt: what you changed, what /box or /witness showed (open it against your server if you can), what verify.mjs printed, and whether it was caught.

Write both parts to REVIEW-codex-2.md at the repo root (most serious first, at most 20 items, UNSURE where unsure), commit on yajat/review-2 with your own git identity, and push only that branch. Never push to main or mohan/live, never force push. Edit no other file. SpacetimeDB safety: never touch port 3001 or databases named avon or darkroom, never spacetime login, never print a token.
