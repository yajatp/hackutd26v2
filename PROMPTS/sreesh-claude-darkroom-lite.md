Task (sized for a small remaining budget): put the Darkroom screens in theme, plus three key animations

Be economical: read only the files named here and don't explore the repo. Take at most 2 screenshots. Stop when the checks pass.

Setup: `git fetch origin && git switch -c sreesh/darkroom-lite origin/mohan/live && npm ci` (skip `npm ci` if node_modules exists).

Why: every Avon screen is now dark and animated, but `/box`, `/witness` and `/join` (the Darkroom) still look white and default. Make them one product. Change only the look; every word and behaviour stays.

How: copy the pattern the console used. Read `app/console/layout.tsx` and `app/console/console.module.css`. A route `layout.tsx` wraps the page in one class, and that class redefines the shared color tokens (`--background`, `--surface`, `--foreground`, `--muted`, `--line`, `--line-soft`, `--alert*`, `--warn*`) plus a few `:global(...)` overrides for `.btn`, `.btn-primary`, `.card`, `.section-title` and `.badge`. This changes the look with almost no component edits.

1. **Theme ("secure room", after ethiack.com):** create `app/box/darkroom.module.css` with one class `.room`:
   - background `#0b191b`; text `#e6f2ee`; muted `#8fb3aa`;
   - `--line: rgb(230 242 238 / .28)`; `--line-soft: rgb(230 242 238 / .12)`; `--surface: transparent`; `--surface-2: rgb(230 242 238 / .05)`;
   - `--alert: #fca5a5`; `--alert-bg: transparent`; `--alert-line: #ef4444`; `--alert-solid: #b91c1c`;
   - `--warn: #fde68a`; `--warn-bg: rgb(245 158 11 / .08)`; `--warn-line: #f59e0b`;
   - add `--verified: #3dff9a` (mint, only for verified, witnessed and closed);
   - `font-family: "Barlow", "Bahnschrift", system-ui, sans-serif`; `min-height: 100vh`;
   - cards: no white fill, hairline top border only; buttons: transparent with a hairline, primary solid `#e6f2ee` on `#0b191b`.

   Add `app/box/layout.tsx`, `app/witness/layout.tsx` and `app/join/layout.tsx`, each wrapping children in `<div className={s.room}>`. If a route already has a layout, add the wrapper inside it. The status headline (LOG VERIFIED / ROLLBACK DETECTED / TAMPERING) uses `font-family: "Pixelify Sans"` (already in `app/fonts.css`), and LOG VERIFIED turns mint. Find that element in `app/box/StatusBanner.tsx` and `app/witness/` with one grep.
2. **Three animations,** CSS only, in the same module, all off under `@media (prefers-reduced-motion: reduce)`:
   - **LOG VERIFIED lands:** a stamp-in (scale 1.12 to 1 with opacity, 260 ms ease-out) whenever the status text changes. Key the element by the status string so React remounts it.
   - **A new log entry:** the newest row in "Newest log entries" (on `/box`) and on `/witness` slides down and fades in (240 ms), with one mint flash of its left edge.
   - **ROLLBACK DETECTED or TAMPERING:** the banner shakes once (3 frames, 300 ms) and its red left rule pulses once.
3. **Checks:**
   - `npx tsc --noEmit` and `npx eslint app/box app/witness app/join` clean;
   - `npm run smoke` passes, if SpacetimeDB is installed; skip it otherwise and say so;
   - one screenshot each of `/box` and `/join`, if a local server runs.

Files you own: `app/box/**`, `app/witness/**`, `app/join/**` (new layouts and the CSS module, plus the minimum class or key edits). Don't touch `lib/**`, `spacetimedb*/**` or other `app/` folders. Never run `next build` or `npm run build`. No dependencies.

Commit on `sreesh/darkroom-lite` with your own git identity, no AI-credit lines and no word "Claude" in the message. Push only that branch. Reply with the commit hash and what you checked.
