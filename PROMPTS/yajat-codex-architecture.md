Write docs/ARCHITECTURE.md: the technical reference a SpacetimeDB judge reads to see that our backend really runs on Spacetime. Draft only: Mohan approves the text before it is merged. Do not change any code.

Setup, in avon-codex/:
  git fetch origin
  git switch -c yajat/architecture origin/main
Read the code, not old plans: spacetimedb/src/index.ts, spacetimedb/src/eog.ts, spacetimedb/src/wide.ts, spacetimedb-darkroom/src/index.ts, lib/live.ts, lib/darkroom-live.ts, lib/eog/alerts.ts (buildConsole), lib/rules/health.ts, lib/rules/faults.ts, lib/chain.ts, lib/rules/darkroom/status.ts, lib/evidence.ts, scripts/ingest.mjs, scripts/verify.mjs, scripts/verify-standalone.mjs, scripts/smoke.mjs, scripts/boot-avon.mjs, scripts/boot-darkroom.mjs, docs/PLAN.md section 0 (lines 5-100), app/box/ThreatModelCard.tsx, REVIEW-codex.md, REVIEW-codex-2.md, REDTEAM-claude.md, docs/planner-accuracy.md.

Sections, in this order, plain short sentences (no marketing words; never "air-gapped", "tamper-proof", "unhackable", "independently secure"; say "tamper-evident", "isolated local network", "integrity, not authenticity"):
1. One paragraph: what Avon is and why there are two SpacetimeDB databases (avon = the company side; darkroom = the isolated incident room on its own network; never linked; a person carries the evidence reference between them).
2. A diagram in plain ASCII or a Mermaid block: laptops, phones, the two databases, which page talks to which database.
3. Database avon: a table of every table (name, public or private, what one row is) and every reducer (name, arguments, who may call it, what it checks, what it writes). Include load_dataset / ingest_batch / finish_ingest (the EOG engine runs inside finish_ingest), inject_fault / clear_fault (simulated faults, applied to a copy of the readings), confirm_plan, the load lock.
4. Database darkroom: the same two tables, including how the actor of every entry comes from the server (ctx.sender's member row), the hash chain, chain_head, roles, closed incidents.
5. Data flow, step by step: a folder is checked in the browser, sent as rows, finish_ingest runs detect + plan + sensor health, the rows every screen subscribes to change, every screen redraws. Then the fault flow from Phone 1 and the evidence flow to the Darkroom.
6. How verification works: the witness on each device, ROLLBACK DETECTED / TAMPERING / MEMBER LIST CHANGED / CHAIN HEAD CHANGED, verify.mjs vs verify-standalone.mjs.
7. Measured numbers: only numbers you can point to in the repo (smoke output in scripts/smoke.mjs runs, test counts you get by running `npm test`, planner-accuracy.md, REDTEAM-claude.md, the L1 runbook timings). Next to each, where it comes from. Run `npm ci && npm test` yourself and quote the real pass count.
8. Known limits, honest: everything the reviews and the red team say is not covered (e.g. the box owner can append a new forged entry; the avon reducers trust their network; ws:// is not encrypted), each in one sentence.
Keep it under about 1,200 words plus the tables. Every claim must match the code; when unsure, say so.

Commit only docs/ARCHITECTURE.md on yajat/architecture with your own git identity, push only that branch and open a PR. Never push to main or mohan/live, never force push. No SpacetimeDB commands are needed; if you run any, never against 3001, never spacetime login, never print a token.
