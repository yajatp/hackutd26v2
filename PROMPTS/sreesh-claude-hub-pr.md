Task (a PR, small and contained): the front door at `/`, the page a judge lands on from the hosted link

Be economical: read only what is named, take one or two screenshots, and stop when the checks pass.

Setup: `git fetch origin && git switch -c sreesh/hub origin/mohan/live` (run `npm ci` only if node_modules is missing).

Today `app/page.tsx` redirects to `/console`. The hosted link https://avon-hackutd26.vercel.app is what judges get, so `/` should be a proper entry: one screen that says what Avon is and opens every part of the demo. Read `app/page.tsx`, `app/vr/Station.tsx` with `app/vr/vr.module.css` (the look to match), `lib/live.ts` (`useAvonConsole`, `AvonProvider`) and `docs/PLAN.md` section 0 (the three ideas).

Build `app/page.tsx` plus `app/home/**` (a client component and a CSS module):
1. A full-width night page, on the theme of `/vr`. Top line: the "Avon" wordmark and the live connection badge (`ConnBadge` from `app/ui/Badge.tsx`, inside `AvonProvider`).
2. One large line, in Barlow Condensed 700 at full width: **"What broke, the cheapest fix, and which sensors to trust."** Under it, one sentence: "A night shift on a Permian oil site, live on SpacetimeDB."
3. The screens as a numbered index, because there is a real order to the demo. Each row has its number, its name, one line saying what it is for, and a live hint where cheap, for example "2 pump failures" from `useAvonConsole().view`.
   1. Console (`/console`): the night operator's screen.
   2. Phone 1 (`/attack`): a teammate breaks a sensor.
   3. The model (`/twin`): the site in 3D and VR.
   4. Insight (`/insight`): the budget, flows, breaches, what if.
   5. Map (`/map`): sites across America. Show it only if `app/map` exists; otherwise leave the row out.
   6. Darkroom (`/box`): the isolated incident room.
   7. SpacetimeDB (`/spacetime`): the database, live.
   8. VR station (`/vr`): hand the judge the headset.

   Each row is a full-width link on hairlines. On hover it inverts to a moonlight fill with night text (MECHA's style, 120 ms), and its number slides 8 px right.
4. **Motion:** rows enter with a 40 ms stagger on load (once); reduced motion shows them instantly.
5. Any page reached from here keeps a `?site=` parameter if `/` had one.

Rules: change only `app/page.tsx` and new files under `app/home/`. Don't edit `lib/**`, `app/ui/**` or other routes; other lanes are working there. Keep a plain link to `/console` that works without JavaScript. Never run `next build` or `npm run build`. No dependencies.

Checks:
- `npx tsc --noEmit` clean in your files;
- `npx eslint app/page.tsx app/home` clean;
- a screenshot at 1440 and at 390 wide.

Then commit with your own git identity, no AI-credit lines and no word "Claude" in the message. Push `sreesh/hub` and **open a pull request** into `main`:
```
gh pr create --repo yajatp/hackutd26v2 --base main --head sreesh/hub --title "Front door at /" --body "The entry page for the hosted link: what Avon is and every screen in demo order. Checks: tsc, eslint, screenshots attached in the PR."
```
Do not merge it; Mohan reviews and merges locally. Reply with the PR link.
