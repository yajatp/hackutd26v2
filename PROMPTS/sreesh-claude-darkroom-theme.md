Task (hefty, continue in the same session after or alongside the lockdown animations): the Darkroom side in theme, with motion on everything

Mohan (Sun 03:40): "make sure everything has animations and is in theme". Every Avon screen is now dark and animated (`/console`, `/attack`, `/vr`, `/insight`, `/twin`), but the Darkroom screens `/box`, `/witness` and `/join` still have the old white look. `/spacetime` is in theme but mostly static. On the same branch as your lockdown work (`sreesh/lockdown-darkroom`), or a new one `sreesh/darkroom-theme` from the newest `origin/mohan/live`, make them one product.

Read `docs/DESIGN.md`, `docs/DESIGN-RESEARCH.md` (round 2: ethiack.com is the reference for the Darkroom) and `docs/LOCKDOWN.md` ("The look"). Then look at `/console`, `/attack`, `/vr` and `/report` in the browser to match their language.

**The Darkroom theme, "secure room"** (put the tokens in one CSS file under `app/box/`; `/witness` and `/join` import it):
- **Palette:** background `#0b191b` (dark teal), text `#e6f2ee`, secondary `#8fb3aa`, hairlines `rgb(230 242 238 / .14)`. Mint `#3dff9a` means verified, witnessed and closed. Red `#ef4444` means tampering and rollback; amber `#f59e0b` means read-only and warnings. Mint is never decoration.
- **Type:** Barlow for text, Barlow Condensed for headlines, Pixelify Sans for the big status words (LOG VERIFIED, ROLLBACK DETECTED AT #k, INCIDENT OPEN), monospace for hashes and AV- references. All are in `app/fonts.css`.
- **ethiack's moves:**
  - status statements inside thin crop-mark corners;
  - a sticky narrow `darkroom.log` column on `/box` streaming entries as they land;
  - small square-marker tags (■ VERIFIED, ■ READ ONLY).
- No white cards. Use sections with hairlines on the teal.

**Motion on everything** (150–420 ms, ease-out; nothing loops forever; `prefers-reduced-motion` shows the final states instantly):
- `/box`:
  - sections enter with a stagger on first load;
  - every button has hover and press;
  - forms (Bring evidence, Add a member, chat) show sending, then sent;
  - the join code's countdown ring drains smoothly;
  - the new-entry link animation from your lockdown work, the seal, and the crack.
- `/witness`:
  - the fingerprint ticks in character by character when it changes;
  - the "This phone remembers #k" counter rolls;
  - a mint flash on each verified check;
  - the red crack on rollback.
- `/join`:
  - the code input reveals one character per box as typed;
  - Join the team gives a press, sending, then a mint check draw;
  - errors shake;
  - after joining, the "what you can do" list staggers in.
- `/spacetime` (Avon side, night palette as `/console`; keep its look and add motion):
  - matrix cells light up, then decay, when a transaction lands;
  - new rows in the feed slide in from the top;
  - table row counts tick.

Keep every word and every behaviour the same. The smoke test and the verifiers do not read these screens' styling, but `scripts/smoke` and `lib/rules/darkroom` must still pass. Files you own: `app/box/**`, `app/witness/**`, `app/join/**`, `app/spacetime/**`. Do not edit `lib/**`, `spacetimedb*/**`, `app/console/**`, `app/attack/**`, `app/twin/**`, `app/insight/**` or `app/ui/**`. Never run `next build` or `npm run build`. No new dependencies.

Done when:
- `npx tsc --noEmit` and `npx eslint` on your folders are clean, and your tests pass;
- `npm run smoke` passes;
- you post screenshots of `/box` (open incident, chain growing), `/witness` (verified, and rollback), `/join` (typing and joined) and `/spacetime` (a transaction lighting the matrix).

Commit with your own git identity, no AI-credit lines and no word "Claude" in messages; push only your branch, never to main or mohan/live, never force push. Mohan merges.
