Task (about 5:05, small budget): the demo run sheet for the new flow. This is an internal document for rehearsal; Mohan approves all public text separately.

Setup: `git fetch origin && git switch -c sreesh/runsheet origin/mohan/live`. Read: `docs/PLAN.md` section 0, `docs/LOCKDOWN.md`, `docs/QUEST.md`, `docs/TWIN-THEME.md` (the three views), `PROMPTS/yajat-claude-final-qa.md` (the flow being tested), `docs/RUNBOOK-L1.md` and `docs/RUNBOOK-L2.md`. Do not read code.

Write `docs/RUNSHEET.md`, about one page:
1. **Who stands where:** L1 with the console, Phone 1 in a teammate's hand, the Quest station, and L2 the Darkroom box with its own hotspot and the witness phones.
2. **The judge's demo, timed to about 3 minutes:**
   - minute by minute: what the judge does, what the teammate does, and what the judge should see;
   - the order: the console, Confirm, the teammate's Fake, CONFIRMED, THEN CHANGED, LOCKDOWN, carry the AV- reference to the box, the incident opens and the chain grows, the rollback crack as the tamper demo, `/report`;
   - after that, the VR offer: the Quest with Table, Walk and the dashboard;
   - optional: `/insight`'s What if and `/map`.
3. **One sentence per teammate to say at each moment.** Plain, not salesy.
4. **The reset between judges:** `npm run demo:reset` (L1), `npm run demo:reset:cloud` for the hosted copy, `node scripts/darkroom-reset.mjs` (L2), and Undo on Phone 1.
5. **If it breaks:** the five most likely failures (no LIVE, the Quest says no VR, a phone can't reach L1 on venue Wi-Fi, the box not reachable, a shared hosted database with stray faults), each with its one-line fix.

Keep it scannable. Use plain words and no buzzwords: "tamper-evident" and "isolated local network", never "air-gapped" or "unhackable". Commit with your own git identity and no AI-credit lines; keep "Claude" out of messages. Push `sreesh/runsheet` and open a PR into main with `gh pr create --base main --head sreesh/runsheet --title "Demo run sheet" --body "Internal run sheet for rehearsal."`. Do not merge.
