# Handoff for the new chat (Sun 05:55, deadline 07:00)

Mohan is moving to a new session (bypass permissions, fresh context). This file and `../STATE.md` are the handoff; `../CLAUDE.md` rules still apply. Mohan's full request is in `/mnt/c/Users/mohan/Desktop/megaprompt.txt`; read it first.

## Where things stand (all committed and pushed)

- **Repo:** yajatp/hackutd26v2, branches `main` and `mohan/live` at the same commit (`git log -1`). The last known-good tag is `good-0551`. Nothing is uncommitted except `app/vr/lab/` (old design experiments, never committed; ignore them).
- **Live:** https://avon-hackutd26.vercel.app (production; deployed at 05:30 from `8fa393e`, before the realism pass). Redeploy from a clean worktree:
  ```
  git worktree add --detach <scratch>/deploy-X HEAD
  cp -r <scratch>/deploy-dc312ab/.vercel <scratch>/deploy-X/
  cd <scratch>/deploy-X
  vercel deploy --prod --yes --build-env NEXT_PUBLIC_AVON_URI=wss://maincloud.spacetimedb.com --build-env NEXT_PUBLIC_AVON_DB=avon-hackutd26
  ```
  Here `<scratch>` is `/tmp/claude-1000/-home-mohan-hackutd/cc6783b3-d858-4dcc-87dc-d3b59da978ef/scratchpad`, and `.vercel` is the link file. Mohan has approved production deploys for this run.
- **SpacetimeDB:**
  - local: 127.0.0.1:3001, nickname `avonlocal`, databases `avon` and `avon-<site>`;
  - hosted: maincloud, databases `avon-hackutd26` and `avon-hackutd26-<site>`.

  Publish in place, never `--delete-data` on these. Reset with `npm run demo:reset` (local) and `npm run demo:reset:cloud` (hosted).
- **Screens:**
  - `/` front door, `/console`, `/attack` (Phone 1), `/insight`, `/map`, `/twin` (Quest), `/vr` station, `/spacetime`;
  - the Darkroom (`/box`, `/witness`, `/join`, `/report`), which is local-only by design.
- **Checks, all passing at 05:51:**
  - `npm run e2e` and `npm run e2e -- --lockdown`;
  - `npm run smoke`;
  - `npm test`, plus the folder tests: `npx tsx --test app/twin/*.test.ts "app/twin/**/*.test.ts"`, app/console, app/attack, app/insight, app/map, app/ui, app/box;
  - `npm run cloud:check -- --all`.
- **The dev server** runs on :3000 (`npm run dev -- -H 0.0.0.0`). Never run `next build` or `npm run build` while it runs; builds go to `.next-build` anyway.

## Mohan's decisions for this phase (asked 05:52)

1. **Pump data: honest and richer.** Keep EOG's Midland numbers truthful: both S5 failures cost $905 because EOG prices every trip the same, and the judges compare plans to EOG's answer key. Show what genuinely differs per pump: level, fill rate in pts/h, hours to limit, lost revenue per hour, truck ETA, wells affected, and a cost curve (insight tables: `flow_series`, `breach_risk`, `scenario`). Generated sites may vary trucking cost per facility by distance.
2. **Font:** Hanken Grotesk for text and IBM Plex Mono for labels, standing in for TWK Everett. Both are already served from `public/fonts` and declared in `app/fonts.css`.
3. **Scope: everything goes to the Sui style** (https://www.sui.io, measured 05:50):
   - pure black `#000`, panels `#131518` / `#222529`, greys `#6C7584` / `#89919F` / `#A1A7B2`, white type;
   - ONE standout colour, Sui blue `#298DFF`;
   - red and amber only for alert states;
   - no neon cyan, no glows, no hacker styling.

   That covers every website screen, the VR world and the VR dashboard. The DeepBook photo is the mood: clean, corporate, quiet.
4. **Sky clock:** each site's real local time, with no slider. Noon is a clear sunny day, midnight is pitch black with stars, and gradients fill in between. Zones (`lib/sites.ts`): Midland, San Antonio, Laredo and Williston use America/Chicago; Carlsbad and Casper use America/Denver.

## What to build, as parallel lanes (own files each)

- **L1, Sui design system on the web:**
  - tokens in `app/globals.css` and `app/ui`; every screen's CSS (console, attack, insight, map, home, vr, spacetime, box, witness, join, report);
  - keep every word and the e2e DOM contract (`scripts/e2e/screens.mjs`), and keep `npm run e2e -- --lockdown` passing;
  - replace the neon and holographic cues, use one blue accent;
  - professional vocabulary: no "doing nothing costs" or "these plans cost". Use "Cost if unaddressed", "Response cost", "Savings", "Spare trucks". Change the words the e2e reads only together with `scripts/e2e`.
- **L2, VR corporate redesign** (`app/twin/theme.ts` palette to Sui; dock, dashboard, panels, labels, the how-to card):
  - clean dark panels with thin borders and a blue accent, no glow;
  - Hanken Grotesk / Plex Mono in canvas text;
  - dashboard vocabulary as in L1;
  - the dashboard shows one card at a time with simple controls;
  - add **prediction graphs and what-if simulations**: level over time to the trip with and without the plan, rate in vs rate out, and a "Simulate: pump fails / sensor spoofed" popup driven by `whatIf()` and `insight`;
  - keep the pipe popout.
- **L3, VR environment:**
  - a realistic sky and sun or moon from the site's real local time;
  - daylight lighting at noon, stars at midnight;
  - drop the violet "Permian Night" dusk and the hacker look, and make it read as an everyday, somewhat realistic game: professional, with wow but not overwhelming;
  - stay within the Quest 3S budget (`docs/TWIN-THEME.md`: about 200 draw calls and 250k triangles in stereo; check with `npm run perf`).
- **L4, VR entry flow:**
  - on Enter VR, start with a 3D map of the US (`lib/sites.ts`, live status from `lib/fleet.ts`);
  - the judge picks a site, which loads that site's database (`siteDatabase()` in `lib/live.ts`, `?site=`), and then the current Table, Overview and Walk experience;
  - add a way back to the map.
- **L5, data richness:**
  - per-pump details everywhere a pump is shown (decision 1);
  - generated sites: realistic pad names instead of `Facility-4dcda90a2ab0` (county-based, e.g. "Loving County 7"), regenerated with `npm run sites` and `npm run sites -- --cloud`. Move the old `../eog-data/fake/<site>` folders aside first: rm is blocked by a hook, so use mv;
  - optionally, per-facility trucking cost by distance in the generator.

L1 and L2 can run at once. L2, L3 and L4 all touch `app/twin`, so split ownership: L2 owns `nav/`, `Panel3D`, `Labels*`, `CanvasText` and `theme.ts`; L3 owns `world/` and the lighting in `TwinCanvas`; L4 owns a new `app/twin/usmap/` and the entry state in `TwinScreen`. Or run them one after another in one lane.

## Open items from QA (`docs/test-final-0445.md` on `origin/yajat/final-qa`)

- **Bug 11, unresolved:** S4 Facility B shows inflow 1,497 with outflow 0 and no "pump failed". Yajat's Codex was asked to decide whether that's a missed failure or normal pump cycling (`PROMPTS/yajat-codex-qa-fixes.md`; check `origin/yajat/qa-fixes`).
- **Bug 2:** a witness phone over the LAN needs a real-phone test. **Bug 7:** the Darkroom's first boot (Codex).
- **Bug 10:** the `/insight` truck tile label.

## Teammates

- Yajat's Claude is on `PROMPTS/yajat-claude-qa-round2.md` (real devices).
- Yajat's Codex is on `PROMPTS/yajat-codex-qa-fixes.md`.
- Sreesh's agents are out of budget.
- Review teammate branches before merging. Squash-merge locally and run `bash ../scripts/pre-push-check.sh` before every push. No AI-credit lines, and no word "Claude" in commit messages.

## After 07:00

Freeze. Then the video, pitch and supplementals, all text in Mohan's voice via `/humanizer`. Then the Devpost update, and make the repo public after a secret scan.
