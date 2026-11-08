Task (hefty): LOCKDOWN on the Avon side: the action sequence when we think we are hacked

Context: Avon (repo yajatp/hackutd26v2). Make a branch `yajat/lockdown` from the newest `origin/mohan/live`. Read `docs/LOCKDOWN.md` first; it is the storyboard and the contract. Then read:
- `docs/PLAN.md` section 0 (the judge plays the night operator);
- `spacetimedb/README.md` and `spacetimedb/src/index.ts`;
- `lib/live.ts`, `app/console/Board.tsx` (ConfirmRow, CONFIRMED, THEN CHANGED) and `app/console/page.tsx`;
- `app/attack/`;
- `docs/DESIGN.md` (the night look).

Other lanes are editing `app/console/Board.tsx`, `app/attack/*` (animations), `spacetimedb/src/index.ts` (new tables for an /insight page) and `app/twin/**` (the VR redesign) on Mohan's machine right now. Keep your changes ADDITIVE and in NEW files wherever you can, so Mohan can merge them. Spell out every line you add to an existing file in your final message.

Build:
1. **SpacetimeDB (avon module):**
   - A public table `lockdown` with one row: active, started_at, started_by identity, reason, evidence_ref, tank, ended_at.
   - Reducers `enter_lockdown(reason, evidence_ref, tank)` and `end_lockdown()`. Validate inputs: evidence_ref matches `AV-XXXX-XXXX`, and reason is at most 200 characters.
   - Additive only: new table and reducers at the end of the module. Do not change existing tables or reducers.
   - Regenerate the bindings (`npm run st:generate`).
   - Publish to your local server in place: `spacetime publish -s <your local server> --module-path spacetimedb -y avon`, never `--delete-data`. Never publish to maincloud; Mohan does that.
   - Document both in `spacetimedb/README.md`.
2. **`lib/live.ts` (additive):** subscribe to `lockdown`, and expose `lockdown` (the row or null), `enterLockdown(...)` and `endLockdown()` from `useAvonConsole()`. Do not change any existing field.
3. **The console sequence**, in new files under `app/console/lockdown/`:
   - the hold-to-confirm button "Lock down and move to the Darkroom" (600 ms fill), shown in the CONFIRMED, THEN CHANGED block and in the Sensors to check block;
   - the full-screen overlay: shutter sweep with a red scan line, dim, LOCKDOWN badge, the plan frozen with a hold stripe and the "Plan on hold" sentence, then the evidence card with the AV- reference typed in, the fingerprint, and the three steps;
   - "End lockdown", which reverses the sequence;
   - a two-tone WebAudio sound;
   - reduced-motion versions.

   The AV- reference comes from `lib/evidence.ts` (`evidenceFor` / `evidenceForIssue`), the same one the console shows today. Hook it in with the fewest possible lines in `Board.tsx` and `page.tsx`, and list them.
4. **Phone 1** (new file `app/attack/LockdownBanner.tsx` plus one line in the page): "The site is in LOCKDOWN. The operator moved to the Darkroom." Fake, Kill and Drift grey out, with a red flash.
5. **`/vr` and `/insight`:** a `LockdownBanner` component they can mount (new file `app/ui/LockdownBanner.tsx`). Mount it in `/vr` (`app/vr/Station.tsx`, one line) only if that file merges cleanly. Leave `/twin` to the VR lane, but export what it needs: the row and a hook.
6. **Tests:** pure helpers (the reference validation, the sequence timing) with `node:test`. Keep `npm run e2e` passing. Lockdown is opt-in, so the e2e path never enters it.

Never run `next build` or `npm run build`. No new dependencies. Never print tokens or read `.env`.

Done when:
- the tests pass;
- `npx tsc --noEmit` is clean;
- `npm run smoke` passes;
- `npm run e2e` passes on your laptop;
- you have taken screenshots of the console mid-shutter, the console with the evidence card, and Phone 1 in lockdown.

Commit on `yajat/lockdown` with your own git identity and no AI-credit lines, and keep the word "Claude" out of commit messages. Push only that branch, never to main or mohan/live, never force push. Mohan merges.
