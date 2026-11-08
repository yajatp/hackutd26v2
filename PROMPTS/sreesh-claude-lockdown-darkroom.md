Task (hefty): LOCKDOWN on the Darkroom side: the box seals and the chain grows on screen

Context: Avon (repo yajatp/hackutd26v2). Run `git fetch origin`, then make a branch `sreesh/lockdown-darkroom` from the newest `origin/mohan/live`. Your report-print work is merged. Read `docs/LOCKDOWN.md` first; it is the storyboard, and the rows from "next | /box" onward are yours. Then read:
- `app/box/` (BoxScreen, BringEvidence (the one-step evidence form), StatusBanner, ThreatModelCard, AddMemberPanel);
- `app/witness/`;
- `lib/darkroom-live.ts`;
- `lib/rules/darkroom/status.ts` (VERIFIED, ROLLBACK DETECTED AT #k, TAMPERING AT #k);
- `docs/DESIGN.md`;
- `app/report/report.css` (your own print look; match it on screen).

Build. These are animations and presentation; keep the data logic as is.
1. **`/box` seals when an incident opens from brought evidence:** a stamp-in "INC-0001 OPEN" (scale from 1.15 to 1 with a short shake). The box's header turns to the lockdown state for the duration of the incident.
2. **The hash chain as a live drawing on `/box`:** every log entry is a link. When a new entry arrives through the subscription, its link drops in from above (about 300 ms). Its hash text scrolls into place, and a connector draws from its prev_hash to the hash of the link above, showing it locks to it.
3. **`/witness` phones:** each new entry gives a soft chime (WebAudio, after a tap to enable sound) and a "witnessed #k" tick that pops in. The phone shows a compact version of the same chain.
4. **Close:** when the Commander closes the incident, the last link gets a seal ring and the chain turns from moonlight to a quiet green.
5. **ROLLBACK DETECTED or TAMPERING AT #k:** the chain cracks at link k. A red fracture line draws through it, the links below it drop out of line, and the status banner pulses red once. The witness phones flash red with the count. This is the judges' "nobody can secretly edit this" moment, so make it land.
6. **Reduced motion:** the final states, instantly.
7. Keep every word the screens say today, and keep the verifier outputs unchanged. Add `node:test` tests for any pure helper, for example which links are "new" since the last render.

Files you own: `app/box/**`, `app/witness/**` and new files under them. Do not edit `lib/**`, `spacetimedb*/**`, `app/console/**`, `app/attack/**` or `app/twin/**` (other lanes). Never run `next build` or `npm run build`. No new dependencies.

To see real data: `npm run demo:darkroom`, then `node scripts/darkroom-seed.mjs`. That needs SpacetimeDB 2.14.1 installed: `curl -sSf https://install.spacetimedb.com | sh`. Open an incident, bring an evidence reference (AV-1177-2830 works), close it. For the rollback, the smoke test shows how (`scripts/smoke/`), or use `node scripts/verify.mjs` after deleting rows on your own local copy. Reset with `node scripts/darkroom-reset.mjs`.

Done when:
- the tests pass;
- `npx tsc --noEmit` is clean in your folders;
- `npx eslint app/box app/witness` is clean;
- you post a short screen recording (or 4 screenshots) of: the seal, a link dropping in, the closed chain, and the crack on rollback.

Commit on `sreesh/lockdown-darkroom` with your own git identity, with no AI-credit lines and without the word "Claude" in messages. Push only that branch. Never push to main or mohan/live, never force push. Mohan merges.
