Task (now): fix the QA bugs outside Mohan's running lanes, and settle bug 11

Context: Avon (repo yajatp/hackutd26v2). Make a branch `yajat/qa-fixes` from the newest `origin/mohan/live`. Yajat's QA pass (`docs/test-final-0445.md` on `origin/yajat/final-qa`) found 12 bugs. Mohan's lanes are editing `app/console`, `app/insight`, `app/vr`, `app/attack`, `app/ui`, `app/spacetime`, `app/twin`, `app/box`, `app/witness`, `app/map` and `app/page.tsx`, so do NOT edit those.

1. **Bug 11 (most important; EOG judges check our detector):** `/insight` shows S4 Facility B with `in 1,497 · out 0` and no "Pump failed", and S5 Facility A with `in 1,901 · out 477`. The console lists only S5 B and S5 C as pump failures. Decide from the data whether this is a missed failure or normal behaviour, for example a pump cycling off between its start and stop levels, or a tank low enough that the pump is meant to be off. Read only:
   - `../eog-data/history/mock_test_2026-10-10T1530` (`network.json` pump `start_level_pct` / `stop_level_pct`, the telemetry for S4's pump and tank);
   - `lib/eog/detect.ts` and `lib/eog/flows.ts`;
   - the challenge's `SPEC.md` and `answer_key.json` in that folder if present (compare, never load it in the app).

   Write `docs/qa-bug11.md`: what the pump and tank did hour by hour, and the verdict.
   - If it is a real miss, write a failing test in `lib/eog/detect.test.ts` and the smallest fix that passes it, with every existing test still passing (`timeout 600 npx tsx --test lib/eog/*.test.ts lib/rules/*.test.ts`) and `npm run smoke` still passing.
   - If it is normal, propose (do not apply) a one-line chart tag for `/insight`, such as "Pump off (tank at stop level)", for Mohan to add.
2. **Bug 7:** `npm run demo:darkroom` stops on a fresh laptop with `No such saved server configuration: avonlocal`. Make `scripts/boot-darkroom.mjs` and `scripts/darkroom-seed.mjs` work with no saved nickname: pass the server URL (`http://127.0.0.1:3001`) everywhere, or add the nickname automatically before the first use. Never touch maincloud.
3. **Bug 12, the parts in your files:**
   - the boot banner text for `/box` in `scripts/boot-darkroom.mjs` should match what the page shows;
   - in `app/report/**`, the page-3 verifier command should use the box's IP placeholder (`--host <box IP>`), not `localhost`, and "Box screen (Commander)(entry #5)" needs its missing space.
4. **Bug 2 (diagnose only):** a witness page opened at `http://<LAN IP>:3000/witness` showed DISCONNECTED in a desktop browser pane, while Node and curl connected. Read how `lib/darkroom-live.ts` builds its ws URL. Check whether Chrome's Private Network Access or anything else could block `ws://<LAN IP>:3001` from that origin. Write the finding into `docs/qa-bug11.md` under a "Bug 2" heading, with a one-line test for the real phone.

Tests with `node:test` for anything you change. Never run `next build` or `npm run build`. Never print tokens.

Commit on `yajat/qa-fixes` with your own git identity, no AI-credit lines, push only that branch. Tell Mohan the bug 11 verdict the moment you have it.
