Task (about 5:05): full QA of the whole app, the hosted copy and the Quest. Find bugs; don't fix them.

Context: Avon (repo yajatp/hackutd26v2). Mohan wants the whole app working by about 6:00, then one review pass. Mohan's main session is merging the last lanes and redeploying https://avon-hackutd26.vercel.app. Your job: use every screen the way a judge and the team will, on the hosted copy and on the Quest 3S, and write down everything that is broken, confusing, slow or ugly.

Work in a clean checkout of the newest `origin/mohan/live` (`git fetch && git switch -C yajat/final-qa origin/mohan/live`). Do not change app code.

Run through, recording pass or fail, the exact text on screen, and a screenshot or photo for every failure:
1. **The front door** `/`: every row opens its screen.
2. **The judge's flow on the hosted copy:**
   - `/console`: Confirm this plan;
   - Phone 1 on a real phone, `/attack`: Fake on S5 Facility C;
   - the console shows CONFIRMED, THEN CHANGED and LYING · SIMULATED;
   - Open an incident in the Darkroom gives an AV- reference;
   - **Lock down and move to the Darkroom** (hold): the shutter, the evidence card, and Phone 1 locked out;
   - End lockdown;
   - Undo Fake on Phone 1.
3. **`/insight`:** the budget numbers, the rate in vs rate out charts, potential breaches, and What if (run a pump failure on an S2 facility; does the ripple make sense?).
4. **`/map`:** six sites. Click Eagle Ford, then Open console: is it a different site with LIVE? Is the compare table sorted?
5. **`/twin` on the Quest 3S:**
   - Enter VR;
   - Table, Overview and Walk views;
   - trigger on a tank opens its panel (the bug from your last test);
   - the thumbstick turn;
   - the dashboard and Confirm from inside VR;
   - a Fake from the phone shows in VR;
   - comfort and frame rate (does anything stutter?).
6. **Between judges:** `npm run demo:reset:cloud`, then `npm run cloud:check -- --all`.
7. **The Darkroom on its own network (L2):**
   - the box laptop and the witness phones on one hotspot or travel router;
   - `npm run demo:darkroom`;
   - bring the AV- reference, open the incident, watch the chain, close it;
   - `/report` prints.

Write `docs/test-final-<HHMM>.md`: one table per section (step, pass or fail, what you saw), then a ranked bug list (most demo-breaking first) with the exact steps to reproduce. Commit only that file on `yajat/final-qa` and push. Tell Mohan the top 5 bugs the moment you have them; don't wait for the end.

Commit with your own git identity and no AI-credit lines; keep the word "Claude" out of messages. Push only that branch.
