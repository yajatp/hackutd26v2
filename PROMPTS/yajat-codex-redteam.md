Build an automated red-team suite for the Darkroom's tamper-evident log, run it, and report what it misses. Do not fix the app.

Setup, in avon-codex/:
  git fetch origin
  git switch -c yajat/redteam origin/main
  npm ci
Read: REVIEW-codex.md and REVIEW-codex-2.md (yours), lib/chain.ts, lib/rules/darkroom/status.ts (chainStatus, memberMismatch), lib/rules/darkroom/replay.ts (rowToEvent), scripts/verify.mjs, scripts/tamper.mjs, spacetimedb-darkroom/src/index.ts, spacetimedb-darkroom/test/evidence.ts (a working example of the generated bindings).

Build scripts/redteam.mjs (Node ESM; it may load the TypeScript libs through tsx exactly like scripts/verify.mjs does). For each attack it:
  1. publishes spacetimedb-darkroom with --delete-data to a fresh throwaway database (rt-<n>) on a throwaway server you start yourself: spacetime start --listen-addr 127.0.0.1:3101 (never the team's 3001),
  2. builds a normal log through the reducers: seed 2 members, open an incident, 2 scope updates, 2 chat lines, 1 evidence_imported,
  3. saves a witness exactly as scripts/verify.mjs --witness does,
  4. applies one attack as the box owner with `spacetime sql -s http://127.0.0.1:3101 rt-<n> "..."`,
  5. runs scripts/verify.mjs --port 3101 --db rt-<n> --witness <file>, and prints one line: CAUGHT or MISSED, the attack name, and the verdict text.
Attacks (at least these): delete the last 3 entries; delete a middle entry; edit a chat payload (hash unchanged); edit a payload and recompute that entry's hash; edit and recompute every later hash plus chain_head; payload number 1e309; NaN or -0 in a payload; duplicate JSON keys in payload_json; unicode lookalike or different normalization in a name; a "__proto__" key; change the actor field; change ts; swap two entries' seq; insert a forged entry with a duplicate seq; delete everything and re-add the same rows; delete the last entries and append a new valid-looking entry; edit chain_head only; change a member's role in the member table; delete a member row; add a member row. End with a summary: N caught, M missed, and exit 1 if any MISSED. Add `--keep` to leave the throwaway databases for inspection; by default stop your 3101 server at the end.

Then run it and write REDTEAM.md at the repo root: the full output, and for each MISSED attack one paragraph on why it is missed and whether a judge would see it as a real hole (e.g. "an owner with root can rewrite everything and recompute every hash; only the witness catches it, and that is expected"). Be honest: CAUGHT only when verify.mjs printed TAMPERING / ROLLBACK DETECTED / MEMBER LIST CHANGED.

Rules: create only scripts/redteam.mjs, scripts/redteam/ (helpers, if needed) and REDTEAM.md. Edit nothing else. SpacetimeDB safety: only port 3101 and databases named rt-*; never touch 3001, never the databases avon or darkroom, never spacetime login, never print a token. Commit on yajat/redteam with your own git identity and push only that branch; never push to main or mohan/live, never force push.
