# UI audit and polish pass (Sreesh's Fix 7)

Sun 8 Nov, about 00:20-00:45. Goal: Avon reads as one product to a judge in the 90-second demo (docs/PLAN.md section 0, changed Sun 00:15: the judge drives /console, a teammate holds Phone 1 on /attack, Laptop 2 runs /box, a witness phone runs /witness).

Rules used: color only when something is wrong, every status also a word or an icon, the next action biggest and on top. Words used: tamper-evident, isolated local network, integrity, not authenticity, simulated. Banned words (none found in app/): air-gapped, tamper-proof, unhackable, independently secure.

Issues are ranked by how much each would confuse a judge. Each gives the exact element text, what is wrong, a one-line fix and whether it was fixed. No number, evidence sentence or data path changed: the screens read the same lib fields as before.

## Shared pieces (new)

- `app/globals.css`: one palette as hex tokens (background, foreground, surface, muted, line, alert, warn) with light and dark values, one system font stack, and shared classes `.card`, `.section-title`, `.btn`, `.btn-primary`, `.field`, `.badge` with tones `ok`, `warn`, `alert`, `solid`, `sim`.
- `app/ui/Badge.tsx`: `Badge`, `SimulatedBadge`, `SensorBadge` (▲ DEAD, ▲ LYING, ● DRIFTING) and `ConnBadge` (■ LIVE, ● Connecting..., ▲ DISCONNECTED). Used on all four screens.
- `app/ui/AppHeader.tsx`: one header pattern. "Avon · every site, one view" (/console), "Avon · Break a sensor" (/attack), "Darkroom · incident room" (/box), "Darkroom · witness" (/witness), with the connection badge on the right.
- `app/ui/LogEntries.tsx`: the newest Darkroom log entries, worded the same on /box and /witness.

## /console (Laptop 1, the judge drives it)

1. `Load a site:` row with `permian_mock` … `snapshot_2026-10-10T0900`, `Open a folder…`. Nine developer folder names fill two rows above the fix card and look like the main controls. The loaded folder was marked only by a darker border (color only). Fix: a compact secondary row "Site data:", the loaded folder marked "✓" and aria-pressed; big primary buttons only when nothing is loaded ("Start here: load a site's data"). **Fixed.** The buttons stay visible because the demo and the checks click `mock_test_2026-10-10T1530`.
2. Header `Avon · every site, one view`. It does not say what Avon does, and while connected the page shows no connection state at all. Fix: sub-line "What broke, the cheapest fix, and which sensors to trust." and the shared ■ LIVE badge on the right. **Fixed.**
3. `LYING · S5 · TANK C level` with a gray `SIMULATED` tag, and `CHECK THE TANK SENSOR FIRST: LYING`. The state is plain bold text with no icon. SIMULATED is a 12 px gray tag that looks different from the one on /attack. Fix: shared `SensorBadge` (▲ LYING) and the dashed `SIMULATED` badge, the same on /attack. **Fixed.**
4. `Checked: 317,265 readings · …`, `WHY NOT THE OTHERS`, `Times come from noisy readings: …`, `first seen about …`. These are 12 px at 60-70% opacity, too faint to read on a projector at 1366x768. Fix: 14 px minimum, with the muted color token instead of opacity. **Fixed.**
5. `Do this: Call 1 truck now, 1 trip` on the top card is 24 px, the same size as `$905`, so the next action is not clearly the biggest thing. Fix: 30 px on the top card, and an ▲ icon on `TRIPS IN 2H 03M`. **Fixed.**
6. `DISCONNECTED from Spacetime. Showing the last data received.` and `Connecting to Spacetime…`. "Spacetime" is a tool name a judge does not know. Fix: "▲ DISCONNECTED from the live data. Showing the last data received." The header badge shows Connecting.... **Fixed.**
7. The `Confirm` button is missing. PLAN.md section 0 (changed Sun 00:15) has the judge press Confirm on the top card, but the console has no such button. Fix: build it in a feature lane. **Not fixed:** it is a new feature with its own state, not polish. Flag for Mohan.
8. `trips in`, `tank would trip`, `shut in` on the fix card. These are field words a judge may not know. Fix: explain them in the narration ("trip: the tank's high-level shutdown"). **Not fixed:** RUNBOOK-L1.md quotes "TRIPS IN 2H 03M" as its boot check, and "shut in" comes from the engine's plan text, which is tested.

## /attack (Phone 1, 360 px wide)

1. `Kill` / `Fake` / `Drift`. At 360x740 the bottom of the Fake button was at y=1354, two screens below the 15-tank list, so the main action was off screen. Fix: "2 · Break it" is now a bar that sticks to the bottom of the screen, with the three buttons in one row and the picked tank's name. **Fixed:** the Fake button now ends at y=678 at 360x740, with the 15 tanks still listed.
2. Header `Break a sensor` has no product name, so it looks like a separate app. Fix: the shared header "Avon · Break a sensor" with the shared ■ LIVE badge. **Fixed.**
3. Page colors `bg-zinc-50 dark:bg-zinc-950` on `<main>` were a second palette (computed as lab() colors), different from /console's. Fix: the shared hex tokens on body for every screen. **Fixed.**
4. `SIMULATED: these faults are injected for the demo. EOG's data has no broken sensors.` A three-line amber paragraph pushed the action down, and its SIMULATED looked different from the console's. Fix: the shared SIMULATED badge plus one 14 px sentence. **Fixed.**
5. Fault tags `▲ LYING`, `▲ DEAD`, `● DRIFTING` used a red pill style (`alertTag`) found only on this screen. Fix: the shared `SensorBadge`. **Fixed.**
6. Type: /attack, /box and /witness used Arial from `body`, while /console used the system font, so the product had two typefaces. Fix: one system font stack on body (no web fonts, so it works offline). **Fixed.**
7. `Clear` / `Clear all` used a third button style (`plainBtn`), and the tank radios were 56 px rows, 15 of them. Fix: the shared `.btn`, and 48 px rows (still a full touch target) under the sticky action bar. **Fixed.**
8. The round "N" bubble at the bottom left (the Next.js dev-mode indicator) covers "DEAD" and "goes silent" on the Kill button at 360x740, because the demo boots with `npm run dev`. Fix: `devIndicators: false` in next.config.ts (error overlays still show). **Not fixed:** next.config.ts is outside this lane's files. Flag for Mohan.

## /box (Laptop 2, the Darkroom)

1. In dark mode `<main>` forced `bg-white text-neutral-900`, so Laptop 2 showed a white page next to a dark Laptop 1 and looked like another product. Fix: the shared tokens, so the page follows light and dark. **Fixed.**
2. `Incident room on the box. Every change below is an entry in a hash-chained log.` and `head f70a514e…` in the LOG VERIFIED banner. "Hash-chained" and "head" are jargon. Fix: "Every change below is an entry in a tamper-evident log on this box." and "fingerprint f70a514e…". **Fixed.**
3. `Reference from the console` is a 176 px input, the same size as Source and Note. In the new demo the judge types the AV- reference here, so it should be the biggest thing in its card. Fix: a 240 px input in 20 px mono, a bold label and the primary "Log evidence" button. **Fixed** in code. It was not seen in a browser: an isolated browser is not enrolled, so the box shows read only.
4. Header `Darkroom` with `● Connected to the box` / `● Disconnected from the box`. The header pattern differs from Avon's, and both states use the same ● icon and differ only in color. Fix: the shared header "Darkroom · incident room" and the shared ■ LIVE / ● Connecting... / ▲ DISCONNECTED badge. **Fixed.**
5. Section headings `INCIDENT` (small caps), `Scope board` / `Evidence` / `Team chat` (18 px), `Threat model` / `Newest log entries` / `Team` (16 px). Three heading styles on one screen, and none matched /console. Fix: one `.section-title` on all four screens. **Fixed.**
6. Choice buttons `ENCRYPTED` `EXFILTRATED` `ACCESSED` `SUSPECTED` and `SUSPECTED` `CONFIRMED`. The pressed one was shown by fill color only. Fix: "✓" before the pressed option, plus aria-pressed. **Fixed.**
7. `LOG VERIFIED`, scope column values like `EXFILTRATED`, and the `OPEN` / `CLOSED` tags. LOG VERIFIED had no icon, and the scope states were plain text with the same weight as SUSPECTED. Fix: ✓ LOG VERIFIED and ▲ ROLLBACK DETECTED; scope states as badges (▲ ENCRYPTED and EXFILTRATED, ● ACCESSED and SUSPECTED); the shared OPEN and CLOSED badges. **Fixed.**
8. `This screen can read the record but cannot write to it.` above `node scripts/darkroom-seed.mjs --add <64 hex characters> …`. A stranger sees a terminal command when the screen is not enrolled. Fix: an amber card with a ● READ ONLY badge. **Fixed** (badge and card). The command stays because the box owner needs it.

## /witness (witness phone, 360 px wide)

1. In dark mode `<main>` forced a white page on the phone. Fix: the shared tokens. **Fixed.**
2. Header `Darkroom witness` with `● Connected to the box`. The header pattern differs, and connected and disconnected use the same ● icon. Fix: "Darkroom · witness" (fits on one row with the badge at 360 px) and the shared connection badge. **Fixed.**
3. `Chain head` with a 64-character hash, and `head f70a514e…` in the banner. Both are jargon. Fix: "Newest fingerprint" and "fingerprint f70a514e…". **Fixed.**
4. `Newest entries` listed raw type names (`#4 member_added · Box owner · f70a514e`), while /box says "member added". Fix: the shared `LogEntries` list ("Newest log entries", the same labels). **Fixed.**
5. The entries list was 12 px mono on a phone. Fix: 14 px. **Fixed.**
6. `LOG VERIFIED` had no icon, so only red versus plain separated it from ROLLBACK DETECTED at a glance. Fix: ✓ LOG VERIFIED, ▲ ROLLBACK DETECTED, ○ NO ENTRIES YET. **Fixed.**
7. Type: Arial here, the system font on /console. Fix: the shared font stack. **Fixed.**
8. The Threat model card runs more than two screens on the phone. **Not fixed:** it is the Winstead pitch and must stay; the status that matters (LOG VERIFIED or ROLLBACK DETECTED) stays on top.

## How it was checked

- Isolated headless Chrome (Playwright 1.65, a fresh browser per run), against the running dev server at 127.0.0.1:3000 and SpacetimeDB at 127.0.0.1:3001. The fault was injected the way RUNBOOK-L1.md says (tap "S5 · Facility C tank", then Fake) and removed with Clear all, which then showed "Active faults (0)". No incident was opened on /box: an isolated browser is read only there.
- Before (taken before any edit): `/home/mohan/hackutd/.playwright-mcp/ui-console-before.png`, `ui-console-fake-before.png`, `ui-attack-before.png`, `ui-box-before.png`, `ui-witness-before.png` (plus `-full-` full-page and `ui-dark-*-before.png` dark-mode versions).
- After: `/home/mohan/hackutd/.playwright-mcp/ui-console-after.png`, `ui-console-fake-after.png`, `ui-attack-after.png`, `ui-box-after.png`, `ui-witness-after.png` (plus `-full-` and `ui-dark-*-after.png`).
- Same numbers before and after on /console with mock_test_2026-10-10T1530: the dollar amounts in page order are $9,957, $1,810, $905, $1,810, $905, $3,055, $2,150, $5,642, $905, $1,810, $905, $2,599, $1,694, $4,315 in both runs, and "Checked: 317,265 readings · 5 systems · 15 facilities · 45 wells · every 5 min · 10-05 00:00 to 10-10 15:30 UTC" in both.
- Positions at 1366x768 (after): the bottom of "Do this:" is at y=382 (y=316 before; the header gained its one-line explanation). With the Fake fault, the bottom of "▲ LYING S5 · TANK C level SIMULATED" is at y=322 (y=259 before).
- Light and dark (after): every screen's body is rgb(250, 250, 250) in light mode and rgb(10, 10, 11) on rgb(244, 244, 245) text in dark mode. Before, /box and /witness stayed white in dark mode, and /attack's colors were lab() values.
- At 360x740 (after), /attack and /witness have scrollWidth 360 and no visible non-mono text under 14 px, both with and without a fault.
- Environment note: at 00:29:49-00:30:06 another lane ran `next build` in this working tree. It wiped the dev server's `.next` output, so every page returned 500 and then 404 on its scripts. I recreated the empty `.next/static/development` folder, and the main session restarted the dev server at 00:37:31. All after screenshots were taken after that restart.
- After screenshots replaced: the first after run showed "→ DRIFTING" wrapping inside the Drift button and three rows of site buttons. Both were fixed, and the screenshots above are from the second run.
