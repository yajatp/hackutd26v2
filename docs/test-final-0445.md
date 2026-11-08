# Final QA, 2026-11-08 from 04:45 CST

Checkout: `yajat/final-qa` at `5482978` (`origin/mohan/live`). No app code changed.
Hosted copy: https://avon-hackutd26.vercel.app, **before** Mohan's redeploy (`/map` is 404, `/` is a 307).
Box laptop for section 7: Yajat's MacBook Air (macOS, SpacetimeDB 2.14.1) standing in for L2, at `10.169.150.177`.

Status: sections 7, 2, 3 and 6 were done at 04:45-04:50 on the old deploy. The redeploy (`78fb360`) went live at 05:48, and the second pass ran at 07:00-07:40, partly blocked (see "Second pass" below). Real-phone and Quest steps are marked **TODO (Yajat)**: in this pass a second browser tab played Phone 1 and the witness phone.

## Ranked bugs (most demo-breaking first)

**After the redeploy (`78fb360`):**
- Bug 1: the deployed `/attack` now contains the lockout banner ("The site is in LOCKDOWN", `data-lockdown`). Probably fixed; not yet seen on a real phone.
- Bug 4: fixed. `cloud:check -- --all` passes.
- Bug 5: the deployed `/attack` now has the Undo button ("Undo <fault>" / "Restore the … sensor"). Probably fixed; not yet tapped.
- Bug 12 (raw IDs): fixed in `683ef3a`.


1. **Phone 1 is not locked out on the hosted copy.** Steps: `/console`, Fake on S5 Facility C from `/attack`, hold **Lock down and move to the Darkroom**. The console shows the LOCKDOWN shutter and evidence card, but `/attack` keeps the normal remote, with Kill, Fake and Drift all live, even after a reload (`html[data-lockdown]` stays unset). None of the deployed `/attack` chunks contains the banner text "The site is in LOCKDOWN". The deploy is older than `app/attack/LockdownBanner.tsx` (`f8be82f`, 03:57). **Recheck after the redeploy.**
2. **A witness phone may show DISCONNECTED over the LAN (unverified, needs a real phone).** Steps: `npm run demo:darkroom`, then open `http://10.169.150.177:3000/witness`. In the desktop browser pane, the page loads but the chip says **DISCONNECTED**, and the console shows `WebSocket connection to 'ws://10.169.150.177:3001/v1/database/darkroom/subscribe' failed`. The server side is fine:
   - `curl` of `/v1/ping` on the LAN IP gives 200;
   - a WebSocket upgrade with `Origin: http://10.169.150.177:3000` gets `101`;
   - Node connects;
   - the same browser connects to that socket from a `localhost:3000` page.

   So this is probably a browser-pane restriction, not the app. A real phone on the box's hotspot is the only real test.
3. **The hosted copy was left dirty between tests.** At 04:42, before anyone reset it, `/console` opened with 3 SIMULATED DEAD sensors (S2 Tank B, S2 Tank C, S3 Tank A, Kill since 15:20 UTC). They push the S5 Facility C plan card below the fold, so a judge would first see three red cards nobody explained. `npm run demo:reset:cloud` clears them (READY in 5.3 s). Reset after every test, not only between judges.
4. **`npm run cloud:check -- --all` fails:** `[cloud check] Unknown option '--all'`, exit 1. `--all` comes from the fleet lane (`yajat/fleet`), which is not in `mohan/live` (the branch is not on origin either). Plain `npm run cloud:check` passes.
5. **There is no "Undo Fake" on Phone 1.** Tapping **Fake** again does nothing: it stays `Fake LYING ▲ ON` and ACTIVE FAULTS stays at 4. The only way back is that row's **Clear** in section 3 of the remote, or **Clear all**. A judge told to "undo the Fake" will tap Fake again.
6. **A cleared row stays in Phone 1's ACTIVE FAULTS list.** Steps: with 4 faults active, tap **Clear** on S2 Facility B. The header drops to `ACTIVE FAULTS (3)`, but the S2 Facility B row stays on screen (still in the accessibility tree, 4 seconds later), overlapping the S2 Facility C row with a greyed Clear button. The exit animation never finishes.
7. **Darkroom first boot stops on a fresh laptop.** `npm run demo:darkroom` publishes, then stops with `darkroom-seed: Error: No such saved server configuration: avonlocal`. It is documented as one-time setup (`spacetime server add --url http://127.0.0.1:3001 avonlocal`), and the script prints the fix. Run it once on the real L2 before judging. After that, a second boot is READY in **5.7 s**.
8. **The box keeps an old success message after Close.** After closing INC-0001, the Bring-evidence panel still says `✓ Opened INC-0001 (entry #5) and logged AV-1177-2830 (entry #6).`, right under `No incident is open, so this also opens one`.
9. **The two clocks are mixed on the console.** The confirm stamp uses the wall clock ("CONFIRMED by the night shift at 04:43 AM"), and so does CONFIRMED, THEN CHANGED ("at 04:43 AM"). The header says `now 2026-10-10 15:30 UTC`. A fresh Fake also reads "Off for 25 min" and "Fake on since 15:00 UTC" the moment it is tapped.
10. **The `/insight` truck tile reads as the opposite of the sentence.** S2 Facility B what-if: the text says "2 of 2 S2 trucks were free", but the tile says `S2 trucks 0 of 2`. On S2 Facility A it says `2 of 2 (was 0)`. The tile counts trucks used; label it that way.
11. **Two `/insight` charts look like failures but carry no tag (question, not sure it is a bug).** S4 Facility B shows `in 1,497 · out 0` with no "Pump failed" tag. S5 Facility A shows `in 1,901 · out 477`. The console lists only the S5 B and S5 C pump failures.
12. Small things:
    - The `/report` page-3 verifier command says `--host localhost`, but it is meant for a separate laptop (L3); it should be the box IP.
    - `/report` prints "Box screen (Commander)(entry #5)" with no space.
    - The console's "Why not the others" shows raw IDs (`S5_WELL_C2`).
    - The boot banner says `/box` "shows its identity", but the page leads with join-code instructions and hides the identity in a collapsed "A box screen that needs to be a Commander".

## 7. Darkroom on its own network (Mac stand-in for L2)

| Step | Result | What I saw |
|---|---|---|
| Box and phones on one isolated hotspot | **TODO (Yajat)** | This Mac is on `10.169.150.177`. No phone joined. |
| `npm run demo:darkroom`, first run | FAIL (one-time) | Started SpacetimeDB on `0.0.0.0:3001` and published, then `No such saved server configuration: avonlocal`. Bug 7. |
| `npm run demo:darkroom`, after `spacetime server add … avonlocal` | PASS | `DARKROOM IS UP`, total **5.7 s**; `en0 10.169.150.177 [3000 ok; 3001 ok]` |
| Enroll the box screen | PASS | `/box` READ ONLY, then `darkroom-seed.mjs --add <id> --name "Box screen" --role Commander`, then "You: Box screen (Commander)" |
| Bring AV-1177-2830 (from the hosted console) | PASS | One press: `✓ Opened INC-0001 (entry #5) and logged AV-1177-2830 (entry #6).` |
| Watch the chain | PASS | Scope (#7), chat (#8), close (#9); `✓ LOG VERIFIED`, head `4b0783f8` on the box |
| Witness at `localhost:3000/witness` | PASS | LIVE, LOG VERIFIED, "This phone remembers #9 · 4b0783f8dff1…" |
| Witness at `http://10.169.150.177:3000/witness` | FAIL in the browser pane | DISCONNECTED. Bug 2. **TODO (Yajat): real phone.** |
| Close the incident | PASS | `CLOSED by Box screen at 04:45:38 AM (entry #9): Sensor faked in the demo; plan held, no data left the site` |
| `/report?incident=INC-0001` prints | PASS | Headless Chrome print-to-PDF: 3 pages. Page 1 has the title, LOG VERIFIED, the head and the room; page 2 the chain #0 to #9 and the evidence; page 3 the scope, the verifier and the limits. Nits in bug 12. |
| `verify-standalone.mjs --host 10.169.150.177` | PASS | `LOG VERIFIED`, 10 entries (#0..#9), head 4b0783f8dff1…, witness saved, exit 0 |

## 2. The judge's flow on the hosted copy

Phone 1 was a browser tab on the laptop (**TODO (Yajat): repeat the Fake and lockdown with a real phone**).

| Step | Result | What I saw |
|---|---|---|
| `/console` opens | PASS, with leftovers | LIVE · 58 ms. 3 stale SIMULATED DEAD cards above the plans (bug 3) |
| Top plan card | PASS | S5 · FACILITY C, trips in 2h 03m, Call 1 truck now, 1 trip, $905 |
| Confirm this plan | PASS | `✓ CONFIRMED by the night shift at 04:43 AM` |
| `/attack`, Fake on S5 Facility C | PASS | The console changed **0.45 s** after the tap |
| CONFIRMED, THEN CHANGED and LYING · SIMULATED | PASS | "You confirmed Call 1 truck now, 1 trip ($905) at 04:43 AM. It rests on a tank sensor that is now LYING (simulated)." |
| Open an incident in the Darkroom | PASS | Types in **AV-1177-2830**, fingerprint `11772830b82a843e…` |
| Lock down (hold 600 ms) | PASS on the console | Shutter, `LOCKDOWN / MOVE TO THE DARKROOM`, the plan ON HOLD, the AV-1177-2830 card, the walk-to-box steps |
| Phone 1 locked out | **FAIL** | No banner; the buttons stay live (bug 1) |
| End lockdown | PASS | The overlay closes; the card returns to the evidence panel and the hold button |
| Undo Fake on Phone 1 | FAIL as written, PASS with Clear | Tapping Fake again does not undo it (bug 5). The row's Clear returned the console to S5 C in **0.31 s**, as "Confirm this plan" (End lockdown asks for a new confirm, as designed) |
| Clearing a row | FAIL (visual) | The cleared row lingers and overlaps (bug 6) |

## 3. `/insight`

| Step | Result | What I saw |
|---|---|---|
| Budget numbers | PASS | Plans $1,810, saved $8,147, $9,957 if nobody acts, at risk $5,056/h. Matches the console ($9,957 − $1,810 = $8,147) |
| Rate in vs rate out charts | PASS, one question | 15 tanks, in/out/level, margins 0.2 to 0.8 pts/h. Killed sensors marked "Sensor dead". S4 B and S5 A in bug 11 |
| Potential breaches | PASS | Ranked: S4 D $10,807, S1 C $9,512, S4 C $9,427, S4 A $7,225, S2 A $6,571; "Show all 15 tanks" |
| What if: pump fails at S2 Facility A | PASS (makes sense) | 57% at 9.2 pts/h, 85% at 18:36, trip at 19:22 ($8,381 if nobody acts). The plan is 2 trucks now ($1,810), arriving 16:55 to take 300 bbl, about 30 pts, which carries the tank past the 21:30 repair |
| What if: pump fails at S2 Facility B (an earlier run was already there) | PASS (makes sense) | 44% at 9.5 pts/h trips at 20:32. Shutting in B2 at 19:08 costs $843, less than a $905 truck. The tile wording is in bug 10 |

## 6. Between judges

| Step | Result | What I saw |
|---|---|---|
| `npm run demo:reset:cloud` | PASS | `READY in 5.3 s`, top card S5_FACILITY_C, `0 active, 0 sensor issues, 0 confirmed plans` |
| `npm run cloud:check -- --all` | **FAIL** | `Unknown option '--all'` (bug 4) |
| `npm run cloud:check` | PASS | `/attack` LIVE; `/vr` LIVE · Live data; `/console` LIVE · 40 ms · S5 · FACILITY C · trips in 2h 03m · $905 (3 s) |

## Second pass, after the redeploy

Limits on this pass:
- The desktop browser pane was hidden, so pages were throttled and the clicks timed out.
- The laptop also slept between commands (05:58 → 07:00 → 07:37).
- Section 1 below is HTTP plus the headless `cloud:check`, not clicking through.
- `npm ci` in the QA worktree stopped the running Darkroom web server. It was restarted with `npm run demo:darkroom`; the data stays.

### 1. Front door `/`

| Step | Result | What I saw |
|---|---|---|
| `/` loads | PASS | LIVE · 38 ms. "What broke, the cheapest fix, and which sensors to trust." 8 rows |
| Row links | PASS | 01 Console `/console` (▲ 2 pump failures), 02 Phone 1 `/attack` (No faults injected), 03 The model `/twin` (15 facilities), 04 Insight `/insight` (Plans save $8,147), 05 Map `/map` (6 sites), 06 Darkroom `/box`, 07 SpacetimeDB `/spacetime` (38 ms round trip), 08 VR station `/vr` |
| Every row's page answers | PASS | All 9 routes return 200 in 0.15 to 0.38 s |
| One `/` request at 05:48 | FAIL once | `000` after a 10 s timeout. The next 3 tries returned 200 in 0.27 to 0.42 s |
| `/console` gate | NOTE | `/console` now opens on "Enter the night shift", with **With sound** and **Without sound** buttons. The clock reads "Midland 07:00", matching CST. The judge flow needs one extra tap |
| 06 Darkroom on the hosted copy | QUESTION | `/box` is local-only by design. A judge clicking row 06 on the hosted link gets a box with no SpacetimeDB to reach. Say so on the row, or point it at a sample `/report` |

### 4. `/map` and the sites

| Step | Result | What I saw |
|---|---|---|
| `/map` loads | PASS (HTTP) | 200; the front door says 6 sites |
| Every site's console is LIVE with its own top card (`cloud:check -- --all`, 17 s) | PASS | Midland S5 Facility C $905; delaware no pump failures; **eagleford** McMullen County 11, $1,297, trips in 2h 57m; dorado Webb County 27, $1,106; powder Campbell County 4, $2,111, trips in 1h 25m; williston Mountrail County 41, $1,388 |
| Click Eagle Ford, then Open console | **TODO** | Not clicked: the pane was hidden. The headless check above shows `/console?site=eagleford` is a different site with LIVE |
| Compare table sorted | **TODO** | Not checked |
| powder plan times | QUESTION | "Shut in Campbell County 4 well 2 at 12:00, and shut in Campbell County 4 well 3 at 13:56 · trips in 1h 25m". The plan times are on the snapshot clock (`snapshot_2026-10-08T1200`) while the header shows real local time, and the second shut-in falls after the trip time it shows. Check that this is the with-plan trip time |

### 5. `/twin` on the Quest 3S

**TODO (Yajat):**
- Enter VR.
- Try the Table, Overview and Walk views.
- Pull the trigger on a tank and check its panel opens.
- Turn with the thumbstick.
- Use the dashboard and Confirm from inside VR.
- Fake from the phone and check it shows in VR.
- Note comfort and frame rate.

`/twin` returns 200 on the hosted copy.
