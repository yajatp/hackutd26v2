# Avon: full reference plan (about 24,000 words)

This is the long version produced by the 39-agent research and review run on Sat Nov 7. For day-to-day work use docs/PLAN.md; its section 0 (the narrowed plan) overrides anything here that disagrees, including times.

---

# Darkroom: Avon. HackUTD 2026 "Zero Day" master plan (final)

**The team is exactly 3 people: Mohan Chillara, Yajat Parmar, Sreesh Manayakar.** There is no 4th member. Ignore any old text that says "3 of our 4" or lists 4 roles.

**Clock.** Checked with `date` on L3 at **6:53pm CST Sat Nov 7**. Darkroom HEAD is still `a0719b3` and its `.gitignore` still lacks `data/eog/` (VERIFIED). The 6:40pm slots of revision 5 are already missed, so **this plan restarts the clock at 7:10pm**. Every time below is a real clock time. Nobody uses older plan times.

> ### What was verified (read this first)
>
> **Measured by our Python research prototypes (VERIFIED as runs; PARTIAL for the app until the TypeScript port reproduces them; all in-sample, because thresholds were tuned on full_week and the snapshots are cuts of full_week):**
> - **EOG detection** (`evaluate.py`, `eval_all.txt`): full_week **23/23 events** (13 pump failures, 5 leaks, 5 worn pumps), **0 false positives**. Snapshots: 13/13, 15/15, 21/21, all 0 false positives. 110 prefix cuts of full_week: 0 false positives. Pump failure onset and end exact. Leak onset error at most 1.0 h; leak detection lag mean 0.65 h, max 1.33 h. Worn-pump lag 2.67 to 3.92 h. Hours to shutdown within 0.021 h on all 7 ongoing snapshot failures; trip times within 2 minutes.
> - **Optimizer match rate** (`validate.py`, `validate_output.txt`): with the answer key's onset facts as inputs, **20/20 plans exact**, plus the opening scene exact ($905 truck; $1,958.33 shut-in; $5,016.00 do nothing). From **raw telemetry: 20/20 same decision, 14/20 exact** (misses 1 to 3 minutes, $8 to $39). With a 6-reading fit and baseline inflow, snapshot plans reach 6/7 exact, worst 1 minute off. Brute force on 1,400 random single-failure cases found nothing cheaper. Joint plan under 5 ms for 5 failures and 4 trucks.
> - **Physics check** (`physics.py`, `physics_residual.py`): clean residual sd 0.12 points; worst 30-minute window 0.96 points; so a 2.0-point alarm threshold has about 2x margin on full_week.
> - **SpacetimeDB on localhost** (prototype, `rtt.out`): full_week ingest 0.47 to 0.61 s; a row reached a second client in median 1.5 ms (max 4.6 ms); a stale append was rejected (`seq must be head+1`); a root DELETE reached subscribers live.
> - **Repo facts:** `lib/chain.ts` has 8 passing tests; its `verifyChain` passes a tail-cut log (bug to fix); Node 22 on L3 cannot run `.ts` but `npx tsx` can; committing the prototypes breaks `tsc` unless `tsconfig.json` is fixed; the pre-push hook will block teammate commits (section 7.3).
>
> **UNVERIFIED (nobody relies on these or says them out loud until checked):** the TypeScript port reproducing the numbers above; any held-out accuracy (we have none; `test/` arrives Sunday); phones and Quest reaching the laptops; phone round trip over Wi-Fi; `finish_ingest` run time inside a reducer; browser CSV parse time; Spacetime sponsor accepting a self-hosted module; whether a travel router is allowed; minors overnight; food, judging-slot and closing times; Quest developer mode; the Windows owner-token command; per-sender views in SpacetimeDB 2.14.1; store stock and prices; whether "Avon Basin Operating Co." is a real company; whether "GPT Astra" is a real product name.

**Ambition rule (from Mohan).** All code is written with frontier AI coding agents (Claude Opus class, the tool Mohan calls "GPT Astra", and Mohan's multi-agent Claude Code workflows). Skill is not a constraint. We never cut a feature because it is "too hard for beginners". Every cut here is a **clock, live-demo reliability or rule-fit** cut.

**How to read this.** Nobody reads all of it. Read section 1, the "What was verified" box, your own card in 8.1, and the sections your card points to.

**Tags.** VERIFIED = checked in a source file, the repo, an official site or a measured run today. PARTIAL = documented or partly checked, not tested by us end to end. UNVERIFIED = check before anyone relies on it.

**Words used everywhere (glossary for first-timers)**
- **L1 / L2 / L3:** the three laptops. L1 = OPS (EOG console and attack target). L2 = BOX (isolated breach room). L3 = VERIFIER (Mohan's laptop).
- **Phone 1 / 2 / 3:** Phone 1 = attacker and ops hotspot. Phone 2 = Commander (Mohan). Phone 3 = Legal (a judge uses it).
- **Beat 1 / 2 / 3:** the three parts of the demo (EOG console, sensor lie, breach room).
- **Gate:** a check at a fixed time with a pass condition you can prove from command output. If it fails, the listed fallback happens. No debate.
- **MW (merge window):** a fixed time when Mohan merges branches into `main`, runs tests and tags it `good-HHMM` (a known-good state we can roll back to).
- **Reducer / table / subscription:** SpacetimeDB terms. A table holds rows. A reducer is a server function that changes rows. A subscription pushes row changes to every screen live.
- **Witness:** the last log position and hash that a device saved. If the log later gets shorter or different, the device shows ROLLBACK DETECTED or TAMPERING DETECTED.
- **Short cut:** the reduced beat 3 (defined in 2.3). It is the safe fallback demo.
- **Smoke test:** one command that runs the demo path end to end (`npm run smoke`).
- **Demo worktree:** a second checkout of `main` at `../darkroom-demo` used only for running the demo. Development happens in the normal checkout.

### Decisions already fixed (Mohan copies these into TEAM.md "Decisions" in commit part 3, so nobody "fixes" them at 1am)

1. **Scripts that import `lib/*.ts` run through tsx.** Node 22.22.1 has no TypeScript support (VERIFIED). `npx tsx <file>.mjs` importing `lib/chain.ts` works (VERIFIED). tsx is already a devDependency (VERIFIED).
2. **Time units:** every `*_ts` field (and the bare `ts` in `reading` and `WideRow`) is **data time in ts_unix seconds**. Every `*_at` field is **wall time in microseconds**. The event log's wall time is `logged_at`. A test checks both through `lib/live.ts`.
3. **Hardcode check:** the SPEC nominal pressure offsets (150 and 50 psi) live only in `lib/eog/spec-reference.ts`, allowlisted by path.
4. **Phone 3 is never pinned** (no Guided Access, no screen pinning). Do Not Disturb on, auto-lock Never, a teammate holds it. A judge joins by camera or by typing the code into `/incident`.
5. **Every demo script acts on the local database only.** `smoke`, `demo:boot`, `demo:reset` and `set-host` take `--side avon|darkroom`. Only L3 runs `--side both`.
6. **Datasets are served by a route handler, not from `public/`.** `app/datasets/route.ts` lists folders; `app/datasets/[name]/[file]/route.ts` streams one of the 3 files. Both read `EOG_DIR` on every request, so `test/` appears after a `git pull` and a page refresh with no restart. (`next start` does not serve files added to `public/` after start: VERIFIED in Next's source.) Fallback if the route slips: `demo:boot` copies into `public/datasets/`.
7. **Demo data:** console, beat 2 and smoke run on `mock_test_2026-10-10T1530` (2 ongoing S5 pump failures at its "now"). full_week is for the 23-event test, ingest timing and dropdown checks. At full_week's last timestamp no pump is failed (VERIFIED).
8. **fake_test is built from mock_test**, so it also has ongoing failures.
9. **EOG data lives outside the repo** at `../eog-data`. `EOG_DIR` defaults there. `.gitignore` still lists `data/eog/` and `public/datasets/` as a second guard.
10. **Incidents:** `demo:reset` closes the current incident and opens nothing. "Open incident" on `/box` opens the next one and logs **7 entries** (`incident_opened` plus 6 `scope_seeded`). `tamper.mjs` refuses with `fewer than 4 entries; open the incident first`.
11. **Owner token files hold the bare token only** (5.2). Scripts read the file, trim it, take the last word, never print it.
12. **Pre-push guard: option (b)** (7.3). Mohan edits the toolbox check to read a per-repo allowlist.

---

## 1. TL;DR

**Banner line (said first in every demo):** "A hacker fakes a tank sensor. Physics catches the lie."

**One-line pitch:** At 3am a pump fails in Avon. Darkroom tells the night shift what broke, when the tank shuts in, and the cheapest fix. When the "failure" is really a hacker faking a sensor, physics catches the lie, and the breach response runs on an isolated box whose log shows any cut or edit.

1. Three linked beats: (1) the EOG console loads any data folder and gives the cheapest plan; (2) a judge drags a fake sensor and physics catches it; (3) a Winstead-style breach room runs on an isolated network with a tamper-evident log and Texas notice clocks.
2. Tracks: EOG + Winstead + Spacetime (sponsors), Design (our one HackUTD track), Beginner (automatic: all 3 of us are first-time hackers).
3. The EOG engine is prototyped and scored: 23/23 events, 0 false positives, 20/20 plan decisions (in-sample; PARTIAL until ported).
4. SpacetimeDB is the real backend: the EOG engine runs in a reducer, every rule is a reducer over pure functions, every screen is a subscription.
5. Hard times: status check 7:10pm, CP1 7:40pm and 8:15pm, video v0 by 8:00pm, S2 and EOG-0 8:45pm (decide by 9:00), walking skeleton 9:30pm, G-EOG 9:50pm, Devpost submitted 9:50pm, Devpost full draft 10:45pm, G-E2E 11:05pm, G-EOG2 1:00am, full beat-3 decision 1:45am, feature freeze 6:00am, repo public 10:30am, final submit and code cutoff 11:30am, judging 1 to 4pm, all 3 at closing.

---

## 2. Tracks

### 2.1 What we enter

| Slot | Track | Status |
|---|---|---|
| Sponsor 1 | EOG "Beat the Shutdown" | Enter. No gate. It is the base of the demo. |
| Sponsor 2 | Winstead PC "Cyber Incident Response Dashboard" | Enter. |
| Sponsor 3 | Spacetime "Build on Spacetime" | Enter unless gate S1 fails (2.3). NMC² "Keep the World Running" is the backup for slot 3. |
| General 1 (HackUTD track) | **Design** | Enter. Only ONE of Hardware, Design or Virality is allowed (VERIFIED, Devpost rules). We do **not** tick Hardware. |
| General 2 | **Beginner** | **Confirmed.** Teams with "more than 66% beginner (first time hackers)" are considered automatically (VERIFIED, Devpost rules). All 3 of us are first-timers (Mohan, commit acfaedf). |

Rules that matter (VERIFIED, Devpost rules and overview):
- Up to 3 sponsor tracks, 1 HackUTD track, any number of MLH tracks. Every project is also judged in the General Track.
- Register the team on Devpost by 11:00pm Sat. Edits are allowed until the final deadline.
- Final submission 12:00pm Sun is a hard stop; all code pushed by then. We stop at 11:30am. Demo video max 2 minutes; skits allowed.
- All members must be on the Devpost. You must demo at judging and **be present at closing to accept a prize**. All 3 attend closing.
- "AI usage is encouraged, but you must submit an idea that you developed in some way."
- "No coding/building before noon on Saturday." The first darkroom commit (a0719b3) is from 3:44pm Sat (VERIFIED). It is large because it is the create-next-app scaffold plus the lock file.
- Spacetime: "Submit a public GitHub repo, and the majority of your backend must be built on Spacetime. Access code can be acquired by visiting our booth." (VERIFIED, tracks.md)
- Judging is "science fair style". Visit length UNVERIFIED, so our default run is 90 seconds.

### 2.2 Why these tracks

- **EOG:** their data is our story, and our prototype matches their answer keys. Past EOG winners had maps, trends, discrepancy detection, forecasts and actions.
- **Winstead:** their brief says "the attacker has access to all internal systems", and beat 2 creates exactly that incident. Their site lists oil and gas and energy clients (VERIFIED, winstead.com).
- **Spacetime:** every screen is live across laptops, phones and a headset. Their judges want Spacetime as "the key requirement", not a bolt-on chat (VERIFIED, MHacks 2026 write-up).
- **Design:** the console is built for a tired operator at 3am. That is a design problem first.
- **Beginner:** automatic, and we can show a complete working project.

### 2.3 Gates and exact fallbacks (in time order)

| Gate | When | Pass condition (provable from output) | If it fails |
|---|---|---|---|
| **S1 Spacetime sponsor rules** | Sreesh at the booth on his 7:20 walk; final by 9:50pm | No explicit "no" to Q1 (self-hosted `spacetime start` TypeScript module + public repo qualifies) or Q3 (Next.js only serves pages and data files; all state in reducers counts as the majority of the backend). Name and exact words in TEAM.md. **Access code collected**, recorded in team chat (never in the repo). Q2 (what the code unlocks) answered. | A sponsor "no" **only removes the Spacetime track** and frees slot 3 (Mohan decides by 11:30am Sun whether NMC² takes it; rep "Harsha \| NMC2" is on Discord). The backend stays. No rebuild. |
| **Venue desk** | Sreesh, first stop of the walk | Recorded with names: travel router (no uplink) allowed tonight and at judging; minors overnight (waiver or chaperone); parents' pickup and drop-off; food times; sleeping room; closing time; printer; judging slot length and room; Quest and loaner return deadline. | No router: no-router fallback (5.6). No minors overnight: 8.2. Unclear slot length: 90-second run. Judging in another room: allow 60 minutes to move. |
| **CP1 reachability** | **L1 half 7:40 to 7:50pm. L2 half 8:15 to 8:25pm** | RUNBOOK CP1 commands (below). Phone 1 opens `http://<L1 IP>:3001/v1/ping` and `http://<L1 IP>:3000` over the Phone 1 hotspot. Phone 2 (another client of that hotspot) opens the same against L2. Screenshots. **Quest leg is non-blocking** (first boot can take 20 to 40 minutes). | Change the hotspot phone or the laptop. Fix now. |
| **R1 Quest adb** (optional) | After Quest setup, only if dev mode is allowed. 15-minute cap. Never delays a merge | `adb devices` lists the Quest on L1. After `adb reverse`, `http://localhost:3000/xr` opens and Enter AR works. | 2D `/quest` over the hotspot (the default). AR cut. |
| **R1b offline AR** | After R1 passes | Same `/xr` with the Quest's Wi-Fi off shows local-font text and makes no CDN requests. | 2D `/quest` only. |
| **S2 Spacetime technical** | **8:45pm, decide by 9:00pm** | (a) Phone 1 loads `/rtt` from L1 over the hotspot with a live `useTable(tank_live)`; **phone median round trip under 1 s** (screenshot). (b) `time` output for full_week ingest under 60 s, and `SELECT COUNT(*) FROM reading` = 30240. Quote the measured numbers. | **Only this gate triggers a rebuild:** Next.js route handlers + Server-Sent Events + an in-memory store calling the same `lib/rules/*` (2 to 3 hours). One-way door: decided by 9:00, no SSE code before then. |
| **EOG-0** | **8:45pm** | `npm test` shows 23 events, 0 false positives on full_week. A raw `/console` table (top alert, countdown, plan sentence, cost vs do nothing) on mock_test: S5_PUMP_C first at about 2.05 h, then S5_PUMP_B at about 3.44 h. | Ship detection only for now. Mohan's read-only reviewer diffs TS output against `prototypes/out_*.json` before 9:50pm. |
| **Walking skeleton** | **9:30 to 9:45pm**, from the demo worktrees after MW2b (9:25) | `/console`: `load_dataset` + `ingest_batch` on mock_test; `useTable(alert)` connects and renders 0 or more rows (alerts need `finish_ingest`, which lands at 9:50). `/attack`: `report_tank_level`. `/quest`: `useTable(tank_live)` updates. `/box`: made Commander by `npm run claim-box`; renders scope fixtures; `append_event` type `incident_opened` (facility `SKELETON`), then `chat`. `/join`: `join_incident` stub returns a role. `/incident`: renders fixtures, reads the log. | Stop new UI work; Mohan's lane helps the owner of the missing route. No automatic cut. Beat-3 scope is decided once, at 1:45am. |
| **G-EOG** | **9:50pm** (MW3) | `npm test` 23 events / 0 FP; 10-10 order EVENT_21 first; planner 91/91 fixtures; opening scene $905 / $1,958.33 / $5,016.00; no `NaN` on the tripped-tank cut (2026-10-08T13:30Z). `finish_ingest` adapter merged and `time spacetime call avon finish_ingest` under 5 s (UNVERIFIED; decide here, do not optimize). UI may slip to MW4. | Engine too slow in a reducer: compute in the browser and publish through `publish_alerts`; change the Spacetime wording (Q19). Accuracy fails: ship pump failures (exact) and mark leaks and worn pumps "beta". |
| **DARKROOM join test** | Within 30 minutes of the router being configured; 15-minute cap; **latest start 10:15pm**. If configured after 10:00pm, fold it into G-E2E setup at 10:45 | L2, Phone 2 and Phone 3 join DARKROOM. Phones open `http://<L2 IP>:3001/v1/ping` and `http://<L2 IP>:3000`. L3 runs `curl http://<L2 IP>:3001/v1/ping` (at G-E2E setup if Mohan's agent is busy, because DARKROOM has no internet). | Fix the router or use the no-router fallback (5.6). |
| **G-E2E (short cut)** | **11:05 to 11:35pm** (30-minute cap). Setup 10:45 to 11:05 | `npm run smoke -- --side avon` passes on L1's demo worktree and `--side darkroom` on L2's. Phone 1 rescans the attack QR (smoke rotates the code). A stranger drives the short cut: beat 1, the beat-2 catch, "Open incident", a scope update, the root delete, the witness banner on the phones, and `npx tsx verify.mjs --witness witness.json --host <L2 IP>` on L3 exiting non-zero. This is hallway test 1. Video v1 takes recorded. | All stretch work stops until it passes. Ask the NMC² rep whether the ops console fits "Keep the World Running". |
| **G-EOG2** | **1:00am**, on Yajat's branch on L1 dev (:3002) | In order: `npm run score` prints the raw-telemetry table; `npm run hardcode-check` prints nothing; dropdown and picker load mock_test, all 3 snapshots, full_week and fake_test with no crash; fake_test assertions pass. | Quote only what passes. |
| **Full beat 3** | **Merge 1:15am, phone run 1:20 to 1:35am, decision 1:45am** | (1) Extended smoke passes on darkroom at MW5: join by code, promote, revoke, mark the ledger, Legal signs, clocks render, Phone 3 rejoin, plus evidence import, Legal notes and chat if shipped. (2) Human run on DARKROOM (Mohan and Yajat) on tag `good-0115`: Phone 3 joins by camera QR, is promoted, signs, is revoked, rejoins by typed code; its witness survives. | Either fails: **the short cut is the final demo.** Decided once, at 1:45. |
| **Code cutoff** | **11:30am Sun** | No commits or pushes after the 11:30 submit. The demo runs `good-1100`. `test/` needs no code change (thresholds are data-derived, datasets read at request time). | If `test/` breaks something, use mock_test (9.7). Never patch after 11:30. |

**RUNBOOK CP1 commands** (on the laptop being tested, only while it is on the Phone 1 hotspot):
1. Stop any dev Spacetime on 127.0.0.1:3001.
2. Terminal 1: `spacetime start --listen-addr 0.0.0.0:3001`.
3. Terminal 2 (main checkout, after `npm ci`): `npx next dev -H 0.0.0.0 -p 3000`.
4. Windows: allow node and spacetimedb-standalone through the firewall on the **Private** profile; set the hotspot network to Private.
5. Test from the phone. Screenshot.
6. After: Ctrl+C both, restart Spacetime on `127.0.0.1:3001`, and only then rejoin venue Wi-Fi.

**The short cut (named once, used everywhere):** beat 1, then the slider and the physics catch, then beat 3 reduced to: "Open incident" on `/box` (creates the tank row from the typed facility and logs 7 entries), the scope board with the HR obligation card (read-only), the root delete, the witness banners and the verifier. **In the short cut, phones are unjoined read-only witnesses; they never write.** All writes come from the `/box` Commander identity. No join flow, no chat on phones, no clocks, no determination. It is the G-E2E target, backup video v1, and the fallback if full beat 3 misses 1:45am.

---

## 3. "Built for you": how each judge feels it was made for them

### 3.1 EOG

**Their judging words** (VERIFIED, EOG README): creativity of the solution; user experience and aesthetics; usefulness and functionality; "If you are optimizing cost, how correctly/optimally you do so"; "Data comes from the files, no hardcoding"; "Make sure you follow the instructions". A `test/` folder (new network S6 to S11, no answer key) arrives "right before judging". Code should "switch between the different folders seamlessly".

**Product**
- **"Load folder" picker** (`<input webkitdirectory>`): reads files in the browser. Works on a running server.
- **Dataset dropdown** from the `/datasets` route (Decision 6). Scans `$EOG_DIR/history/*`, `$EOG_DIR/test` and `$EOG_DIR/fake_test` on every request. Path guard: only scanned folder names and only `network.json`, `ops.json`, `telemetry.csv`. When `test/` lands: `git pull` in `../eog-data`, refresh, it appears. That is "switch seamlessly".
- **"Hard case" preset** in `data/presets.json` (data, not code), labeled `Practice data: hardest saved case`. It points at `snapshot_2026-10-10T0900`: S4_A, S4_C and S4_D down with a fleet of 2; EVENT_21 ranks first though it started last. Joint plan (VERIFIED, validate_output.txt): EVENT_19 = 1 truck; EVENT_20 = shut in S4_WELL_D2 at +108 min ($1,215); EVENT_21 = 1 truck plus S4_WELL_A2 shut-in at +291 min ($975). Shows the shared-fleet chip and the joint options table.
- **"Now" = the last `ts_unix` in the telemetry**, never the system clock.
- Every price, fleet size, truck capacity, response and cycle time, repair hour, capacity and limit comes from `network.json` and `ops.json`.
- **Alert order (SPEC):** pump failures first, smallest time to shutdown first, ties to higher lost revenue per hour. Then leaks, then worn pumps. A leak shows as `URGENT` (the README calls it an "Urgent Alert").
- **Already shut in:** ranks first: `SHUT IN since HH:MM UTC · wells resume at HH:MM UTC (repair)`, plan "none (already shut in)", cost = lost revenue/hr × repair hours left.
- **Sparkline** on each failure row: last 6 h of level, warning and shutdown lines from the files, dashed projection to trip time, truck arrivals as drops. A 72-point series stored in the alert row (`level_series`).
- **Confidence:** `exact` for pump failures; `High / Medium / Early` for leaks and wear. Countdown band: `Shuts in 2 h 54 m (2 h 50 m to 2 h 58 m)` from the fit residual (UNVERIFIED as a calibrated interval).
- **Options table:** do nothing, cheapest shut-in, cheapest trucks, trucks plus shut-ins. Chosen option first with a `Chosen` pill and `saves $X vs do nothing`.
- **events.json export** in the exact SPEC shape. (Card countdown uses the planner's trip time; events.json uses the SPEC formula; they differ by about a minute at most.)
- **Beat 2 is framed as "data integrity"** (the 2025 EOG theme was discrepancy detection). The spoof touches only the live tank panel, labeled `SIMULATED ATTACK · overlay only · files unchanged`. It never changes beat 1.
- `prototypes/README.md`: "Offline research scripts, not used by the app." A judge browsing the repo must see that constants in `data/` and `prototypes/` are not app code.

**Screens and wording.** Use the data's words: "shut in", "trips at", "hours to shutdown", "send 1 truck (1 trip)", "turn off S2_WELL_C1 at 12:46 UTC", "inspect S5_PIPELINE_B", "lost revenue $2,450/hr", "bbl", "level 78%". Leak rows: `URGENT · LEAK · inspect S5_PIPELINE_B now`. Wear rows: `INSPECT · pump wearing`. Pitch words: "night-shift operator", "control center", "real-time alerts", "data-driven decision". Never "AI predicts", raw anomaly scores, "guaranteed optimal". We avoid "spill" as style (EOG's README does use it once).

**Time zone on /console:** every time is UTC and labeled. Header `NOW (last reading) 15:30 UTC Oct 10`. Countdown `Shuts in 2 h 03 m · at 17:33 UTC`.

**Proof line** (muted 13px under the header): `Loaded test/ · N systems · N facilities · N rows · parse N s · engine N s · physics threshold N pts`. Every number from the real load.

**Demo:** EOG order: 90 s on beat 1 (the judge drives: "Load folder", picks `test/`, clicks the top row, opens the options table, then the Hard case preset), 45 s on beat 2, 30 s on beat 3. Reload mock_test after.

**Devpost:** their 6 bullets as subheads. Under "how correctly/optimally": the method, the `npm run score` table, the raw-telemetry table with both counts, the fake_test result, the in-sample caveat. Under "no hardcoding": the loader, fake_test, the hardcode check, "the app never reads `answer_key.json`".

### 3.2 Winstead

**Their words** (VERIFIED, tracks.md): a "command center" for "during, and after a Cyber Incident"; "operate inside potentially compromised networks as an isolated system"; "The assumption must be that the attacker has access to all internal systems. The system must be independently secure." Components: **Access Control** ("Administrative ability to add individuals"), **Incident Documentation** ("standards for cyber incident documentation", "real-time updating and status monitoring"), **Scope definitions** ("status of the compromised data (locked for ransomware, exfiltrated, etc.)"), **Communications** ("real-time communications within the system"), plus isolation. Judged on **Security**, **Ease of use under stress** ("will not likely recall tutorials") and **Creativity**.

| Their item | What we show | On-screen words |
|---|---|---|
| Isolated system | Box laptop on its own router: WAN port empty; repeater, tethering and cloud management off. A live L2 terminal loops `ping 1.1.1.1` and `nslookup example.com`; both fail. L2 gets DHCP from the router, so its route table **does** show a default route to the router. We say so: "the default route points at our router, whose WAN port is empty". Router's "Internet: disconnected" page on a phone. Evidence enters only as a short reference a person types, checked against a fixed schema. | `Imported 1 fact · SUSPECTED · source: compromised host` |
| Access Control | Commander taps "Add member": a 60 s one-time code as a QR and as 10 characters (base32, about 50 bits, `crypto.getRandomValues`; only the hash stored; expiry set by the reducer). Roles: Commander, Responder, Legal, Viewer. Promote and **revoke** are logged. | `Sreesh admitted as Legal by Mohan (in person) · 14:02 CST` / `Judge removed by Mohan` |
| Incident Documentation | Status strip, CST and UTC timeline rebuilt from the log, `/report` with a CSF 2.0 mapping table. | `INC-0007 · RESPOND · 3 open tasks · updated 8 s ago`; "organized by NIST SP 800-61r3 / CSF 2.0 functions" |
| Scope definitions | Scope board: asset, data type, records, residency, status, confidence, reason, updated by, age. Counts only. | `ENCRYPTED (ransomware)`, `EXFILTRATED (copied out)`, `ACCESSED`, `TAMPERED`, `CLEAN`, `UNKNOWN`; `SUSPECTED` (dashed) / `CONFIRMED` (solid) |
| Communications | One team channel; each chat line is a log event. A "Legal notes" thread every member can read and only Legal can post in, labeled honestly. | Team: `NOT PRIVILEGED · Every message is permanent and may be discoverable.` Legal notes: `Visible to all members · only Legal can post`. Privilege banner only inside Legal notes, only after `Counsel engaged: <name>, <time>`. |
| Security | Isolation, server-side rules keyed on `ctx.sender`, device witnesses, a verifier on a separate laptop, one set of alarm strings. | `LOG VERIFIED · 214 entries · head 3f9a…`, `ROLLBACK DETECTED AT #k`, `TAMPERING DETECTED AT #k` |
| Ease of use | A NEXT card on top of every phone screen. Any responder action in 2 taps. Legal's determination is one review screen with one button. Two timed hallway tests (11:05pm, 9:20am). | `NEXT: Legal, review and sign the determination` |
| Creativity | The physics lie opens the incident. Legal's determination starts the Texas clocks. Evidence crosses as a reference a person carries. | |

**The Texas law beat** (VERIFIED, Tex. Bus. & Com. Code §521.053, official text fetched Nov 7 2026, local copy BC521.txt):
- §521.053(b) covers **every** individual whose sensitive personal information was, or is reasonably believed to have been, **acquired**, not only Texans. (b-1) lets residents of other states be notified under their own state's law. The 250 floor applies only to the AG notice in (i).
- Under (i) the 30 days run from "the date on which the person determines that the breach occurred". **A responder's tap triggers nothing. Only Legal's signed determination starts any clock.**
- **When the incident opens**, the HR row (212 Texans, name + SSN + DL, EXFILTRATED, CONFIRMED) shows: `POSSIBLE NOTICE OBLIGATION · §521.053(b): every affected individual (212 now; up to 4,332 if the ledger is marked) · non-Texans may be notified under their state's law (b-1) · AG threshold not met (212 Texans, under 250) · Legal must determine`. The short cut shows this card too (read-only).
- **Marking the royalty ledger EXFILTRATED** (2 taps) changes it live to: `… §521.053(b) individuals: up to 4,332 (212 HR + 4,120 ledger, not de-duplicated) · AG threshold met (250+ Texans: up to 2,052) · applies if Legal determines a breach · §521.053(i)`.
- Ledger residents line: `TX 1,840 · NM 610 · OK 520 · other US 1,150 · (b) covers all of them · (b-1) lets non-Texans be notified under their state's law · counsel picks`.
- EU staff row: `EU staff (300): ACCESSED, not counted unless Legal finds acquisition · §521.053(b) and GDPR may both apply`. Never imply Texas law cannot apply to them.
- **Determination screen:** prefilled, read-only summary: determined at = now; became aware at = incident opened; jurisdictions TX + EU; Texans up to 2,052; persons notified up to 4,332 (4,632 if Legal includes EU staff); rationale = a seeded sentence; law enforcement = No. One `Sign determination` button and an `Edit details` link. If law enforcement = Yes, it can pause the individuals clock with a logged reason (§521.053(d)).
- **Clocks (only after the determination):**
  - `Texas AG: as soon as practicable, not later than Tue Dec 8 2026 · §521.053(i)` (for a Sun Nov 8 determination).
  - `Texas individuals: without unreasonable delay · outer limit Thu Jan 7 2027 · §521.053(b)`.
  - `GDPR Art. 33 (Netherlands entity → Dutch DPA): without undue delay and, where feasible, within 72 h of awareness · if GDPR applies · a late notice must give reasons (Legal to assess)`. Plus `Art. 34 data subjects: without undue delay if high risk`.
  - `Credit bureaus: not triggered (needs more than 10,000 persons notified at one time) · §521.053(h)`.
- Show `Suspected since 13:58 CST` next to `Determined 14:00 CST by <name> (Legal, admitted in person by Mohan)`.
- Dates use the CST calendar date (fixed UTC-6 through Mar 13 2027, VERIFIED).
- The AG website says "30 days after the discovery"; the statute says "determines". We show the statutory date and may show the earlier one labeled "conservative".
- §521.053(j) (VERIFIED): the AG posts a public listing of breach notifications.
- Footer, 12px muted: `Demo rules, not legal advice. Statute text checked Nov 7 2026 at statutes.capitol.texas.gov.`

**Seeded breach** (fictional "Avon Basin Operating Co."; `FICTIONAL COMPANY · SEEDED DATA` watermark; check the name against Texas SOS and a web search before it goes on screen, UNVERIFIED; never name EOG or any real company as the victim). Every seeded row carries a `SCENARIO` tag. `lib/rules/scope.ts` (Sreesh) is the single source of these rows from 9:50pm on.

| Order | Asset | Data | Records | Residency | Starts as | Reason line |
|---|---|---|---|---|---|---|
| 1 | Tank level telemetry (facility typed at Open incident) | sensor data | 1 | n/a | TAMPERED · SUSPECTED | "physics disagrees with the reported level" |
| 2 | HMI / domain credentials | username + password | 38 | n/a | ACCESSED · SUSPECTED | "how they faked the sensor: stolen HMI login" · `not SPI under §521.002` |
| 3 | Royalty and mineral-owner ledger | name + SSN/TIN + address + ACH | 4,120 | 1,840 TX · 610 NM · 520 OK · 1,150 other US | UNKNOWN · SUSPECTED | "same domain login opens the royalty share" (the row that gets marked) |
| 4 | HR / payroll (field staff) | name + SSN + driver's license | 212 | 212 TX | EXFILTRATED · CONFIRMED | individual notice card from the start |
| 5 | EU affiliate staff (Netherlands office) | name + national ID + payroll | 300 | EU | ACCESSED · SUSPECTED | GDPR through an EU office, Art. 3(1). Not narrated |
| 6 | SCADA historian | telemetry | n/a | n/a | ENCRYPTED (ransomware) · CONFIRMED | "is encryption acquisition? Legal to determine". Not narrated |

**Phone 3 identity rule:** `join_incident` from an identity that is already a member does not fail. It sets the role from the new code, re-activates a revoked member, updates the name and logs `member_rejoined`. In the Winstead order the judge joins Phone 3 as Responder, is promoted to Legal, signs, and is revoked. `demo:reset` re-activates Phone 3 as Legal (logged). In rehearsal, check that the camera opens the same browser that holds the witness; on Android it may open Google Lens, so the judge types the code instead.

**Demo:** read their rule word for word, then 110 s on beat 3 (full version). **Devpost:** one paragraph per component using their labels, then Security, Ease of use (hallway numbers) and Creativity.

### 3.3 Spacetime

**Their words** (VERIFIED): "public GitHub repo", "the majority of your backend must be built on Spacetime", primary backend is "the key requirement", demo videos "were especially helpful"; they rejected "just an extra chat feature attached to an otherwise unrelated application"; they praised novelty and concrete problems.

**Product:** every screen is a subscription and every action is a reducer. The EOG engine runs inside `finish_ingest` and writes `alert` rows; `/console` renders from `useTable(alert)`. A `dispatch` reducer behind "Send 1 truck" shows the plan and truck ETA on `/quest`. Next.js only serves pages and dataset files.

**"What disappears if you delete Spacetime?"** Ingest, the EOG engine and alerts, dispatches, the replay tick, the physics check and incident trigger, the attacker endpoint, roles and join codes, the seq and prev_hash rule, membership checks on every write, scope and clock projections. Root-level tampering is caught by the clients and the verifier, not by Spacetime, and we say so.

**At their table, in order:** the `spacetimedb/` folder with committed bindings; the README diagram; a live `spacetime call` with a bad prev_hash rejected (`seq must be head+1`); `npm run smoke -- --side darkroom --only reject` (`rejected: not a member`); the root delete ("the subscription pushed the delete to every witness at once; over our network the round trip is [read /rtt median] ms"); a Phone 1 tap updating L1's `/console` and `/quest` at once; if full beat 3 shipped, a Phone 2 chat line appearing on L2 and Phone 3 at once; the public repo. Headset only on request.

**Devpost:** repo link, diagram, "why self-hosted" (the isolated box cannot reach Maincloud, and should not), measured numbers. A Vercel "try it" link only if labeled "offline EOG mode in the browser; the live system runs self-hosted on SpacetimeDB".

### 3.4 Design (our HackUTD track)

**Words** (the Devpost general Design criterion; no Design-track rubric exists in our sources): "accessibility, layout, visual design, and the intuitiveness of the user journey", "user-friendly and visually appealing".

**Product**
- Night-shift theme as the default. Tokens: bg #121417, surface #1B1F24, text #E6E8EB, muted #9AA3AD, plus critical, warning, info, ok. `font-variant-numeric: tabular-nums` on countdowns and money.
- Color only for abnormal states (ISA-101, PARTIAL). Never color alone: every status is a word plus an icon (triangle = critical, circle = warning, square = info).
- `lib/status.ts` maps every state to `{label, token, icon}`; all banner strings live there.
- Contrast: text at least 4.5:1; status text on tinted fills at least 4.5:1; large numerals at least 3:1. Ratios go on Devpost.
- Sizes: touch targets at least 48px with 8px gaps; phone body text at least 16px; scope labels at least 20px; `/attack` slider thumb at least 56px with the fake value at 32px.
- `/console` layout by rank: (1) top alert card, countdown 56px or more, headline = action and act-by time; (2) compact rows; (3) reported-vs-physics panel; (4) proof line.
- One row per problem, never one per sensor (ISA-18.2 practice, PARTIAL).
- **Beat strip:** L1 and `/quest` show "1 EOG → 2 Sensor lie → 3 Breach" and advance on their own. L2 and phones start at 3.
- Connection chip: `LIVE` or amber `RECONNECTING · last update 14 s ago`; buttons grayed while disconnected.
- Phones: NEXT card on top; one banner slot (ROLLBACK or TAMPERING, then POSSIBLE NOTICE OBLIGATION, then RECONNECTING); legal disclaimer as a 12px footer.
- `/box`: Winstead's 5-part checklist as a narrow, muted "Demo guide" rail, collapsible with one key.
- Quest text on an opaque dark panel (at least 85%), glyphs about 3 cm tall at 1.5 m.

**Demo:** the 90-second run with its 10-second design line. **Devpost:** 6 images, the `/console` top-alert card first; each caption names the design choice; contrast ratios listed.

### 3.5 Beginner (automatic, confirmed)

What a Beginner judge likely values (UNVERIFIED): a complete working project, a clear story, visible learning.
- Say "All three of us are first-time hackers" once, at the close, without apology. Also on Devpost.
- Be honest about AI: "We used AI coding agents heavily. We specified the tests, checked every answer against EOG's keys, and each of us can explain our part."
- Each person explains the part they own in Q&A.
- Devpost section "Beginner: all 3 of us are first-time hackers", plus one concrete learning per person.
- Tonight, each of us checks that our Devpost profile shows no earlier hackathon submission.

---

## 4. Product

### 4.1 What the user sees (screens)

| Route | Device | What it shows |
|---|---|---|
| `/console` | L1 OPS laptop (faces judges) | Banner line, beat strip, "Load folder" and dataset dropdown (incl. Hard case), NOW label (UTC), proof line, top alert card, compact rows with sparklines, inspector group, Resolved, options table, "Send 1 truck", events.json export. Right side: reported-vs-physics panel for the latest spoofed tank, labeled `SIMULATED ATTACK · overlay only · files unchanged`. On a catch: full-screen red `SENSOR DISAGREES WITH PHYSICS` for 3 s plus a short tone, then the evidence card (ops incident ID, facility, reported, predicted, residual, data time UTC, 8-character ref). A QR for `/attack?k=<attack code>` built from `config.public_host`. |
| `/attack` | Phone 1 (judge holds it) | Tanks with an ongoing failure first, labeled `filling now`, one preselected. A big slider calling `report_tank_level` with the attack code. If rejected: `Code expired: rescan the QR on the console`. |
| `/quest` (2D) and `/xr` (AR, stretch) | Quest 3S | "Sensor says" and "Physics says", the banner, the dispatched plan and truck ETA. |
| `/rtt` | Any device | Gate page: live row count and median round trip. |
| `/box` | L2 BOX laptop | Status strip, scope board, NEXT card, "Open incident" (facility field), "Add member" (60 s code as QR and 10 characters), member list with promote and revoke, "Import ops evidence", log head, witness status, Demo guide rail. |
| `/join?c=…` then `/incident` | Phones 2 and 3 | Role badge, NEXT card, banner slot, compact scope board, obligation cards, team chat and Legal notes, review-and-sign, clocks, witness banner, connection chip, "Join with code". In the short cut these screens only read. |
| `/report` | L2 | Printable record: timeline (CST + UTC), scope, determination, clocks, access log, CSF 2.0 mapping. |
| `verify.mjs` | L3 terminal | `npx tsx verify.mjs --watch witness.json --host <L2 IP>` prints `witness at seq X head …` on every change. `--witness witness.json` prints `LOG VERIFIED · n entries · head …`, `ROLLBACK DETECTED AT #k · box ends at seq 210, L3 saw seq 213 (head 3f9a…)`, or `TAMPERING DETECTED AT #k`. |

### 4.2 Must-ship (5 items, all on the demo path)

Part of every item: design tokens, `components/ui` (StatusPill, AlertRow, NextCard), `lib/status.ts`, the beat strip, the connection chip, and pure-function tests.

**M1. EOG engine and alerts console on any folder (Yajat).**
- `lib/eog/detect.ts`, `planner.ts`, `load.ts`: pure TS ports of `prototypes/detect.py` and `planner.py`. No dependencies, no clock, no Node APIs (they also run inside the reducer).
- `load.ts` emits the same `WideRow` the `reading` table stores, including `well_status_mask` (bit i = the facility's i-th well in network.json order is producing; assert at most 32 wells). Browser and reducer get identical inputs. (full_week has 597 samples with a well at status 0, VERIFIED.)
- Guards: level ≥ shutdown − 0.05 or all wells off → hours to limit = 0, rank first, "already shut in". Never divide by inflow ≤ 0.
- Truck removal = trucks × truck capacity from ops. Physics step uses `dt_h` from `ts_unix`.
- Offset warning against `SPEC_NOMINAL_OFFSET_PSI` from `lib/eog/spec-reference.ts`; warns past 20 psi.
- **By 9:50pm (G-EOG):** engine items in 2.3, plus the `finish_ingest` adapter `spacetimedb/src/eog.ts`.
- **By 10:45pm (MW4):** ranked layout, options table with Chosen row, Hard case preset, `/datasets` routes, dropdown and picker, raw markup swapped to `components/ui`.
- **By 1:00am (G-EOG2), in order:** score with the raw-telemetry table; hardcode-check with self-test; events.json; sparklines; confidence and band; URGENT leaks; dispatch button; fake_test; parse timing.
- `npm run score` diffs our output against all 4 answer keys, plus a **raw-telemetry table** for the 7 ongoing snapshot failures (EVENT_11/12/13, 15, 19/20/21): joint plan must match on kind, trucks, trips and wells, and hours to limit within 0.05 h. It prints 7 rows and two counts: `N of 7 match (shut-in start within 1 min)` and `M of 7 exact to the minute`. The app never loads `answer_key.json`.
- `scripts/make-fake-test.ts` builds `$EOG_DIR/fake_test/` from mock_test: rename S1..S5 to S6..S10 everywhere; clone S5 as S11; +37 psi on `discharge_psi` and pipeline pressure; oil 71, gas 2.4; cost per trip 1,140; truck capacity 130 bbl; one system's fleet 3; shift all timestamps +17 days.
- **Expected fake_test output is committed** (`npm test` cannot run Python). `planner.py` has no CLI (VERIFIED), so Yajat writes `prototypes/plan_now.py`. Commands: `python3 -I prototypes/detect.py ../eog-data/fake_test --json prototypes/out_fake_test.json` and `python3 -I prototypes/plan_now.py ../eog-data/fake_test > prototypes/out_fake_test_plans.json`. On L1 if it has Python (checked at G0), else Mohan runs them on L3. If it slips, the fake_test plan check is quoted as "not run".
- Tests (under `lib/`): full_week 23 events, 0 FP; 10-10 order EVENT_21 first; snapshot hours to limit within 0.05 h; 91 planner fixtures (exact kind, trucks, trips, wells, start minute, cost within $1); opening scene; tripped-tank cut no NaN; mock_test top two; fake_test. **Data tests skip with `SKIP: EOG data missing at $EOG_DIR (RUNBOOK G0)`.**

**M2. Physics lie detector and attacker (Yajat; pure logic in `lib/rules/physics.ts`).**
- **Replay:** `start_replay` runs 1 tick per second, each tick = one 5-minute sample. For the chosen tank the loop runs from max(now − 6 h, failure onset − 30 min) to "now". Physics is seeded from the **file** reading at loop start, runs free with `physicsStep()` (clamped at **0 and shutdown**), and re-seeds only at loop restart. It never anchors to the live reported value. An active alarm stays latched across loops.
- **Threshold:** `cleanResidualMax(rows)` = for every facility and every 30-minute window, seed from the file, run free, take |physics − file level|; skip windows touching the shutdown clamp or with a gap over 10 minutes. `threshold = max(2.0, 2 × cleanResidualMax)`. On full_week this should be 2.0 (prototype max 0.96; PARTIAL until the TS test prints it).
- **Latch:** `|reported − physics| > threshold` for 2 ticks in a row. A flat fake on a failed pump grows 0.58 to 0.81 points per tick, so it latches in about 4 to 5 ticks; a dragged slider crosses at once.
- Default tank = highest fill rate over the last 30 minutes. `/attack` preselects it.
- `report_tank_level` requires the current `attack_code` (rotated on reset with `ctx.random`) and works only on `avon`.
- L1's panel and the Quest follow the latest spoofed tank in under 1 s.
- Evidence ref = first 8 hex characters of sha256 of the canonical evidence JSON, plus the ops incident ID.
- Beat-2 UI (`/attack`, panel, evidence card, banner) is Yajat's 9:50 to 10:45pm job, with `scripts/set-host.mjs` and `scripts/boot-avon.mjs`.
- Tests: clean loops on full_week, mock_test and every snapshot never latch; a flat spoof latches by tick 6 and not on the first sample; a slider moving 1 point per tick latches within 8 ticks; full_week threshold is 2.0.

**M3. Darkroom incident room on the isolated box (Sreesh: screens and pure rules; Mohan: reducers).**
- **Short cut (G-E2E):** scope board in story order with reasons and SCENARIO tags; HR obligation card (read-only); status strip; witness banner; `/incident` with NEXT card and banner slot (read-only); `scope_update` from `/box`; "Open incident" (7 entries); `new_demo_incident`. `/box` is made Commander by `npm run claim-box`.
- **Full version (1:45am decision), in priority order:** join with 60 s one-time codes; roles, promote and revoke; the Phone 3 rejoin rule; "Join with code"; review-and-sign determination; clocks as text computed in the projection. Phone 2 becomes Commander by scanning a Commander-role code from `/box`.
- **Cut order if Mohan's 11:35pm to 1:15am block shrinks (decided now):** first evidence import, then Legal notes and `counsel_engaged`, then team chat. Join, roles, sign and clocks are never cut before these three.
- Evidence import (if kept): `append_event` type `evidence_imported` (ops incident ID + facility + ref), validated by `lib/rules/evidence.ts`, text only, stored with `sha256(raw input)`, labeled `integrity of what we received, not truth of the reading`. Rejects show `Evidence rejected: failed schema`.
- Pure rules owned by Sreesh: `lib/rules/next.ts`, `scope.ts`, `clocks.ts`, `evidence.ts`. Empty NEXT: `NEXT: Nothing for you. Waiting for Commander.`
- Sreesh codes screens against the `act.*` signatures and fixtures, and sees them on real data at the 12:45am integration merge.
- FICTIONAL watermark and `/report` with CSF 2.0: after G-E2E.
- Tests: `scope.test.ts` (open shows the (b) card with 212 now, up to 4,332, "AG threshold not met"; marking the ledger gives "AG threshold met (250+ Texans: up to 2,052) · applies if Legal determines a breach"; no clock before determination); `clocks.test.ts` (determination 2026-11-08T20:00Z gives AG 2026-12-08 and individuals 2027-01-07; awareness 2026-11-08T19:58Z gives GDPR 2026-11-11T19:58Z; credit bureaus not triggered at 4,332 and 4,632, triggered at 10,001); `next.test.ts`; `evidence.test.ts`; Phone 3 rejoin in smoke.

**M4. Tamper-evident log, drill, verifier and reset (Mohan).**
- `append_event(expected_seq, expected_prev, incident_id, type, payload_json)`. **No `actor` argument.** The server looks up `member` by `ctx.sender` (compare with `.isEqual()` everywhere; the prototype tested it), rejects non-members with `SenderError('not a member')`, checks the role, sets actor = `name|role|identity hex`, hashes with `lib/chain.ts`. A test hashes one fixture through the module, the browser and `verify.mjs` and asserts equal hex.
- **Server-side writers** (`incident_opened` seeding, `join_incident`, `set_role`, `remove_member`, `legal_determination`, the avon tick) append through `appendServerEvent(ctx, incident_id, type, payload)`. Only client `append_event` calls can hit a stale head; clients retry once.
- Keys: `event_log` has an auto-increment `id` and a unique string `incident_seq = ${incident_id}:${seq}`. `chain_head` keyed by incident_id. A new incident's genesis prev_hash = the previous incident's final head.
- Witnesses (`lib/witness.ts`): each device stores `{genesis, seq, head, hashes[]}` per incident in localStorage and runs `verifyChain` and `checkWitness` on every change; they return the first divergent seq.
- **Verifier fix (VERIFIED problem):** `verifyChain` (`lib/chain.ts` lines 70 to 81) passes a tail-cut chain. So L3 runs `--watch`, polling `chain_head` every 1 s, and after the drill `--witness` runs `checkWitness`, prints the cut and exits non-zero. `--file log.json` also works.
- Scripts (`.mjs`, run through tsx): `tamper.mjs` (refuses under 4 entries; root `spacetime sql` DELETE for `seq > head − 3`); `demo-boot.mjs` (dispatcher: `--side avon` calls Yajat's `boot-avon.mjs`, `--side darkroom` calls Mohan's `boot-darkroom.mjs`; cold start under 60 s); `demo-reset.mjs` (under 10 s); `claim-box.mjs`; `claim-console.mjs`; `ingest.mjs`; `smoke.mjs`. Scripts read the side's owner token file (`--token-file`, default `~/avon-owner.token` or `~/darkroom-owner.token`), take the last word, never print it.
- **`demo:boot`** (local database only): finds the LAN IP with `os.networkInterfaces()`, prints it, calls owner-only `set_public_host` and `set_side`, restarts Spacetime on `0.0.0.0:3001`, publishes **without** `--delete-data` (only a `--fresh` flag wipes, never used on Sunday), starts `next start`. On L1 with USB connected, re-runs both `adb reverse` mappings. A test asserts the QR host is not `localhost` or `127.0.0.1`.
- **Reset rules** (`demo:reset --side <local>` on L1 and L2 between judges). **Keeps:** members and roles (Phone 3 re-activated as Legal), phone sessions, loaded dataset, beat-1 alerts, old chains (read-only). **Clears:** spoof, latch, open incident (closed, not reopened), scope rows, clocks, replay position, attack code (rotated). Phones show `READY · next drill INC-0008`. `new_demo_incident` and `set_role` accept **owner or Commander**, so the owner-token script is never refused; smoke tests this.
- Test (inside `smoke.mjs --side darkroom`): open, scope update, drill, reset, open again, append, tamper the new incident, verify both chains.

**M5. SpacetimeDB as the backend (Mohan; two adapter files owned by Yajat).**
- One module in `spacetimedb/`, published as `avon` on L1 and `darkroom` on L2. Side set by owner-only `set_side`. Reducer lists in 5.2.
- Avon has an operator identity; `/console` shows `Not operator · identity ab12…` until `npm run claim-console -- <identity hex>`.
- `finish_ingest` runs `detect` + `planJoint` over `reading` and writes `alert` rows with `level_series` (adapter `spacetimedb/src/eog.ts`, Yajat). `publish_alerts` exists only as the G-EOG fallback.
- `tick` calls `lib/rules/physics.ts` (adapter `spacetimedb/src/physics_tick.ts`, Yajat).
- `dispatch(alert_id, option_id)`, shown on `/quest` (after G-E2E).
- `lib/live.ts` and the Spacetime provider (Mohan, 8:05 to 8:35pm) pick the database per route: `avon` for `/console`, `/attack`, `/quest`, `/xr`, `/rtt`; `darkroom` for `/box`, `/join`, `/incident`, `/report`. u64 bigint converts to number once, at the hook boundary.
- Generated bindings committed. README diagram. Measured numbers.

### 4.3 Stretch (in order; each has a go/no-go time)

Nothing starts until G-E2E passes. Overnight work reaches main only at the 1:15am and 5:45am merges. **CUTS.md rule:** each stretch names the CUTS.md item it replaces before it starts. Four items only ("halve scope, then halve again").

| # | Stretch | Value | Owner | Start | Go/no-go |
|---|---|---|---|---|---|
| S1 | **Network map:** SVG from network.json lat/lon (offline); click a facility for its trend; works on fake_test's 6 systems | Every recent EOG winner had one | Yajat | 1:00am | **2:30am** |
| S2 | **What-if replay slider** ("pretend now is HH:MM UTC") | README asks for replay and time travel | Yajat | 2:30am | **3:45am** |
| S8 | **AG report fields checklist** on `/report` (`§521.053(i): 1 ✓ 2 ✓ 3 ✓ 4 ✓ 5 ☐ 6 ✓`; "the AG report may be an open record; §521.053(j) makes the listing public") | Winstead documentation | Sreesh | 4:15am | **5:30am** |
| S4 | **Immersive AR on the Quest** (WebXR over `adb reverse`), only if R1 and R1b passed. Includes the local-font and local-models fix in `/xr` | Design wow, shown only on request | Sreesh | 4:15am (dev on L2 against `avon-dev`) | **5:30am**; final check on L1 at the 7am dry run |

**Parked** (only with Mohan's explicit OK and a CUTS.md swap): private Legal channel via per-sender view; phone-width `/console` and shift handoff; Playwright tests; runtime Hard case pick; uplink probe; `viewer-try`.

**6:00am: feature freeze (H18).** Fixes only unless Mohan says otherwise.

### 4.4 Explicit cuts (add to CUTS.md)

- **Clock:** Nvidia / local Nemotron, Photon, Tiger Data, ScrabbleBot; physical tubs, pump and sensor rig; Raspberry Pi box; 3D-printed prop; ed25519 signing on phones; webcam QR import; clock-skew flag.
- **Rule fit:** Hardware HackUTD track (only one HackUTD track allowed).
- **Stack:** FastAPI / Python / SQLite / Vite. The stack is Next.js 15 + TypeScript + SpacetimeDB.
- **Demo reliability:** Vercel for the live demo (a preview of `/console` offline mode only; `vercel --prod` only with Mohan's OK); TLS proxy, self-signed certs, mkcert; Meta casting (likely needs internet, PARTIAL); scrcpy unless a 15-minute test passes and Mohan approves; AirPods and Beats in the demo (Bluetooth off on the box and Darkroom phones); legal-clock timers (clocks are computed text); static join QR, printed Wi-Fi QR, fixed attacker QR; Guided Access on Phone 3; Playwright as a gate; MAC allowlist on DARKROOM; Quest USB tether if S4 does not ship.
- **Overclaim risk:** AI-drafted breach notices; "automatically notifies the AG"; HIPAA/SEC; TSA directives and CIRCIA on screen.
- **Planner scope:** plans with mixed trip counts per truck; plans that only delay a trip.
- **Winstead extras:** insurer task, war-game watermark, statute pop-ups, animated multi-frame QR.
- **Process:** Yajat merging to main; workshops for points; MLH extras; parked stretch items unless swapped in.

---

## 5. Architecture

### 5.1 Components and data flow

```
"AVON COMPANY NETWORK" (compromised side, internet allowed)     "DARKROOM" (isolated, no uplink)
 Phone 1 hotspot (gates and judging; L1 uses venue Wi-Fi for dev) Travel router: WAN EMPTY; repeater/tethering/cloud/WPS OFF; 5 GHz; WPA2
 ├─ L1 OPS laptop (demo worktree ../darkroom-demo on main)        ├─ L2 BOX laptop (demo worktree)
 │   Next.js :3000 (/console /attack /quest /xr /rtt /datasets)   │   Next.js :3000 (/box /join /incident /report)
 │   Spacetime :3001, database "avon"                             │   Spacetime :3001, database "darkroom"
 │   finish_ingest runs the EOG engine in a reducer               │   live terminal: ping 1.1.1.1 + nslookup, both failing
 │   EOG data at ../eog-data (EOG_DIR)                            │   dev server (owner's branch): Next :3002, 127.0.0.1 only
 ├─ Phone 1 ATTACKER + hotspot: http://<public_host>:3000/attack?k=…
 └─ Quest 3S: 2D /quest over the hotspot (USB to L1 only if S4)   ├─ Phone 2 COMMANDER (Mohan; mobile data off)
                                                                  ├─ Phone 3 LEGAL (judge uses it; read-only witness in the short cut)
                                                                  └─ L3 VERIFIER (Mohan): npx tsx verify.mjs --watch, 1 s polling
 One-way human link: L1 evidence card (ops incident ID + facility + 8-char ref) ──a person types it──> /box
```

There is **no network path** between avon (L1) and darkroom (L2). Only L3, in its own local test, reads both databases.

**Flow**
1. **Load.** On `/console` the operator picks a folder. The browser parses the CSV (Node 0.24 to 0.32 s for 19 to 23 MB; browser time UNVERIFIED; if over 3 s on fake_test, use a Web Worker), pivots to `WideRow`s, calls `load_dataset`, `ingest_batch` (1,000 rows per call, at most 4 in flight), `finish_ingest`, then `start_replay`. Alerts appear via `useTable(alert)`.
2. **Attack.** Phone 1 calls `report_tank_level` with the code. The tick latches and appends `sensor_disagrees` and `incident_opened` on avon. L1 and the Quest update; L1 shows the evidence card.
3. **Breach room.** On `/box` someone types the facility into "Open incident" (or imports evidence in the full version). Darkroom opens INC-000N and logs 7 entries. Phones witness them.
4. **Tamper.** Root runs `npm run tamper` on L2; the last 3 entries go. Deletes reach subscribers live (VERIFIED in prototype). Every witness flips to ROLLBACK DETECTED. L3 compares against its saved witness.

### 5.2 Spacetime module (TypeScript, SpacetimeDB 2.14.1, pinned)

Start from `prototypes/spacetime-index.ts`. **Fix its four known bugs first:** (1) physics re-anchors to the reported value every agreeing tick (line 205); (2) `append_event` takes `actor` from the client (line 217); (3) it has its own hash code instead of importing `lib/chain.ts`; (4) physics clamps at 100%, not at shutdown (line 200). It also hardcodes `'INC-1'`, and its `reading` row has only `wellsProducing: u8`: add `well_status_mask: u32` before Yajat writes `eog.ts`. Use `ctx.timestamp` and `ctx.random()`; `Date.now` and `Math.random` do not exist in modules.

**Tables**

| Table | Public | Side | Purpose |
|---|---|---|---|
| config (singleton) | yes | both | owner, operator (avon), side, public_host, dataset_id, t_start, t_end, sim_ts, step_sec, playing, physics_threshold |
| ops (singleton) | yes | avon | prices, truck capacity and cost, repair hours |
| facility, well | yes | avon | from network.json |
| reading | **no** | avon | one `WideRow` per facility per sample incl. `well_status_mask`; btree [facility_id, ts] |
| tank_live | yes | avon | reported_pct, physics_pct, residual, disagree, disagree_count, spoofed, pump_status |
| spoof, attack_code | no | avon | fake level; current code |
| alert, dispatch | yes | avon | alerts with `level_series`; chosen actions |
| incident | yes | both | incident_id, ops_incident_id, opened_at, opened_by, status, genesis_prev |
| join_code | no | darkroom | code hash, role, expires_at, created_by |
| member | yes | darkroom | identity (pk), name, role, admitted_by, admitted_at, active |
| scope_row, legal_clock | yes | darkroom | projections rebuilt from the log |
| event_log | yes | both | id (auto-inc pk), incident_seq (unique), incident_id, seq, prev_hash, logged_at, actor, type, payload_json, hash |
| chain_head | yes | both | keyed by incident_id: seq, hash, count |
| rtt_probe | yes | both | written by `rtt_ping` |
| tick_timer | no | avon | schedule table, 1 s |

**How `/console` gets the attack code:** primary, an operator-only per-sender view (documented, untested by us, PARTIAL; Mohan's read-only agent checks it by 8:05pm). Fallback by 9:00pm: a public `attack_qr` row, said honestly ("only keeps out people who do not have the page; the real gate is the hotspot passphrase").

Anonymous HTTP SQL can read every public table (VERIFIED, docs). That is why Legal notes are labeled "visible to all members".

**Reducers per side** (each refuses with `SenderError('wrong side')` on the other side):
- **Both:** owner-only `set_side`, `set_public_host`; anyone `rtt_ping(client_nonce)`; `new_demo_incident` (owner, operator on avon, or Commander on darkroom).
- **avon only:** owner-only `claim_console`; owner or operator `load_dataset`, `ingest_batch`, `finish_ingest`, `publish_alerts` (fallback), `start_replay`, `pause_replay`, `seek`, `clear_spoof`; `report_tank_level(facility_id, level_pct, code)`; `dispatch(alert_id, option_id)`; scheduled `tick` (writes the ops `incident` row and appends `sensor_disagrees` / `incident_opened`). Client `append_event` is refused on avon.
- **darkroom only:** owner-only `claim_box`, `seed_member(identity, name, role)`; owner or Commander `set_role`, `remove_member`; Commander `create_join_code(code_hash, role)` (expires 60 s after `ctx.timestamp`); `join_incident(code, name)`; `append_event` (types: `incident_opened` Commander, seeds scope and logs 6 `scope_seeded`; `evidence_imported` Commander; `scope_update` Responder or higher; `chat` any member; `legal_note` and `counsel_engaged` Legal); `legal_determination` Legal.

All rule logic lives in `lib/rules/*.ts` as pure functions with tests. Reducers are thin adapters.

**Known gotchas (VERIFIED in prototype):** each custom `t.object` type needs a unique name; the module needs `typescript` as a devDependency; u64 values are bigint; `useTable` rows are readonly; the WebSocket incoming queue limit is 2,048 per client; a standalone server lets anyone who reaches it publish, including `--delete-data` (so bind 127.0.0.1 in dev).

**Owner token.** Publish before ever running `spacetime login` on a box. `spacetime login show --token` prints sentences, so save only the last word of the token line:
- Linux (L3): `spacetime login show --token | grep -i 'auth token' | awk '{print $NF}' > ~/avon-owner.token`
- Windows PowerShell (L1, L2; UNVERIFIED until run at G0): `((spacetime login show --token | Select-String 'auth token').Line -split ' ')[-1] | Set-Content -NoNewline "$env:USERPROFILE\avon-owner.token"` (L2 uses `darkroom-owner.token`).
- Check without printing: Linux `awk '{print length($0), NF}' ~/avon-owner.token` prints `<length> 1`; PowerShell `(Get-Content "$env:USERPROFILE\avon-owner.token").Split(' ').Count` prints `1`.
- On L3 one server publishes both databases, so both files hold the same L3 token.
- Agents never `cat` the token file and never run `spacetime login show --token` without the pipe.

### 5.3 EOG engine

**Detection (`lib/eog/detect.ts`)**
- Per-dataset calibration from all pump-running samples (median and 1.4826×MAD) of `discharge − disposal_psi`, `pipe_pressure − disposal_psi`, `flow / max_flow_bpd`, `(recv − flow)/flow`. On full_week about +149.7 and +49.8 psi, sd about 3 psi (VERIFIED). Never hardcode offsets or system names.
- z-scores per running sample. Worn-pump score `d = (zF + zD)/2`. Leak score `l = (zP + zR)/2`.
- Window W = 12 running samples, T_ON = 1.5, T_OFF = 0.5, K_CLEAR = 3, LOOKBACK = 48 h.
- **pump_failure** = runs of status 2, exact. **pipeline_leak**: pipeline pressure low and receive flow below pump flow while running; step onset. **pump_degradation**: flow below max and discharge falling while running; ramp onset; ends at a following failure's onset.
- Leaks and wear are visible only while the pump runs (about two thirds of the time). Show "first seen" plus bounds, and "ongoing (pump off since HH:MM UTC, cannot confirm resolution)".
- `hours_to_limit = (shutdown − level) / (inflow/24/capacity×100)`, level = least-squares line over the last 6 samples, inflow = mean over the same samples.

**Measured accuracy (Python prototype; VERIFIED as runs, PARTIAL for the app, in-sample)**

| Dataset | Events found | False positives | Notes |
|---|---|---|---|
| full_week | 23/23 (13 failures, 5 leaks, 5 worn pumps) | 0 | Failure onset and end exact. Leak onset ≤ 1.0 h, end ≤ 1.42 h. Worn-pump onset ≤ 1.75 h, end exact |
| snapshot 10-08 1200 | 13/13 | 0 | Order matches (S2_B, S2_C, S2_A) |
| snapshot 10-09 0330 | 15/15 | 0 | |
| snapshot 10-10 0900 | 21/21 | 0 | Status 20/21 (EVENT_17 resolve not observable). Order matches (S4_A, S4_C, S4_D) |
| 110 prefix cuts of full_week | n/a | 0 | Every leak caught by the next cut |

- Detection lag: leaks mean 0.65 h, max 1.33 h. Worn pumps 2.67 to 3.92 h. A worn pump under about 3 to 4 hours old is not shown yet. We say so.
- Hours to limit within 0.021 h on all 7 snapshot failures. Trip times within 2 minutes on the 12 that trip.
- mock_test at its "now": S5_PUMP_C (73.5%, 2.05 h) and S5_PUMP_B (59.6%, 3.44 h).

**Optimizer (`lib/eog/planner.ts`)**
- Units: minutes, barrels, dollars; t = 0 at plan start. Touching shutdown counts as a trip.
- No-action trip time T = (Vmax − V0)/q. If T > H (repair horizon): "none, peaks at X%". Do nothing = lost revenue per minute × (H − T).
- Trucks: n = 1 to free trucks, m = 1 to M trips each; arrivals at response + k×cycle before H; level strictly below shutdown before each arrival; each arrival removes min(n × capacity, water in tank).
- Shut-ins: fast path ranks wells by cost per bbl avoided with an exact latest start (`Math.max(0, Math.ceil(+t.toFixed(6)) - 1)`); fallback enumerates which arrival gap each well starts in, cheapest first, re-checked by simulation.
- Joint plan per system: product of options with total trucks ≤ fleet; tie-break `[cost in cents, trucks, trips]`; knapsack over trucks for many failures.
- Sequential mode for replay (how the full_week key was made).
- Inputs from telemetry: onset = first status 2; H = onset + repair hours − now; level = linear fit over the last 6 readings since onset; inflow = baseline water of producing wells (`well_status_mask`); free trucks = whole fleet.

**Measured (VERIFIED by `validate.py`; PARTIAL for the app):** opening scene exact ($905 truck at 01:35; S1_WELL_C2 at 02:25 for $1,958.33; do nothing $5,016.00, trip 04:48:48). Key onset facts as inputs: 20/20 exact. Raw telemetry: 20/20 same decision, 14/20 exact (misses 1 to 3 minutes, $8 to $39). With the 6-reading fit plus baseline inflow, snapshots 6/7 exact, worst 1 minute. Brute force on 1,400 random single-failure cases found nothing cheaper (not tested on triples or joint plans). Joint planning under 5 ms for 5 failures and 4 trucks.

**Hardcode check (G-EOG2, must print nothing): `npm run hardcode-check` = `node scripts/hardcode-check.mjs`** (Yajat; imports nothing from `lib/`).
- **Scanned:** `lib/eog/**` (minus allowlisted `spec-reference.ts`), `lib/rules/physics.ts`, `spacetimedb/src/eog.ts`, `spacetimedb/src/physics_tick.ts`, `scripts/ingest.mjs`. Only `.ts` and `.mjs`. Other `lib/rules/**` files hold Winstead seed numbers (for example "1,150"), so they are not scanned.
- **Never scanned:** tests, `__fixtures__/`, `make-fake-test.ts`, `score-eog.ts`, the checker, other scripts, `prototypes/`, `data/`, UI files.
- **Rule:** no prototype facts in comments of scanned files (no "-0.85", "S1_WELL_C2", "2026-10").
- **Patterns:** `\b(150|905|1050|92|85)\b`, `/ *12\b`, `S[1-5]_`, `2026-10`.
- **Allowlist `scripts/hardcode-allow.txt`:** one repo-relative path per line; blank lines ignored; missing file prints `ALLOWLIST MISSING`. Holds exactly `lib/eog/spec-reference.ts`.
- **Self-test every run:** scans a temp file holding `const a = 150`; if not reported, prints `SELF-TEST FAILED`.
- **Never use a shell `grep | grep -vFf` pipeline.** A blank-line allowlist silently passes with GNU grep (tested).

### 5.4 Physics check (beat 2)

- Model: `L[k+1] = clamp(L[k] + (inflow[k] − flow[k])/24/cap×100×dt_h, 0, shutdown)`.
- Clean data (VERIFIED): residual sd 0.12 points, max 0.46 over 6 h; 30-minute window max 0.96, 120-minute max 1.00.
- Rule: alarm when |reported − free-running physics| > `max(2.0, 2 × cleanResidualMax)` for 2 samples in a row.
- **Sunday margin check on `test/`:** L3 stays online until `test/` is pulled into `../eog-data` and `python3 -I prototypes/physics_residual.py ../eog-data/test` has run; deadline **12:50pm**. If `test/` is not out, skip. It only confirms the margin; no code changes follow.
- Badges: `SENSOR AGREES WITH PHYSICS` / `SENSOR DISAGREES WITH PHYSICS`.
- Limits we say out loud: an attacker who fakes every sensor consistently beats this; a slow drift under about 2 points across the window is not caught. It is a consistency check, not proof.

### 5.5 Hash chain and witness core

- `lib/chain.ts` exists (8 passing tests): `canonical`, `hashEvent` (SHA-256 via @noble/hashes), `appendEvent`, `verifyChain`, `checkWitness`, `witnessOf`, `GENESIS_PREV`. Add an optional genesis-prev argument and `hashes[]` in the witness.
- The same file is imported by the module, the pages and `verify.mjs`, proven by a cross-path test.
- Server rule: seq and prev_hash must match the head, and the writer must be a member with the right role.
- Root can still DELETE or UPDATE through SQL, or republish with `--delete-data`, and can recompute every hash. Witnesses catch what they saw. Q&A line: "Root can rewrite the log. It cannot make it match the heads our devices already hold."
- `verify.mjs`: `fetch('http://<L2 IP>:3001/v1/database/darkroom/sql', {method:'POST', body:"SELECT * FROM event_log"})`, map the positional rows (check shape at build time), filter by incident, run `verifyChain` and `checkWitness`.
- Honest limit: a device that never saw entries cannot miss them. So L3 polls every second, and the Commander reads L3's seq aloud before the drill.

### 5.6 Network setup

- **Ask the help desk first** (on the walk): is a personal travel router with no uplink allowed at our table tonight and during judging? Record the answer and the name before anyone buys one.
- **Router setup (owner Sreesh, the moment it is in hand; Mohan if Sreesh is in a gate).** About 20 to 30 minutes: 5 GHz, WPA2, SSID visible; turn off Repeater, Tethering, Cellular, remote management (GoodCloud if GL.iNet, PARTIAL) and WPS; non-default admin password; DHCP reservation for L2; SSID in RUNBOOK (passphrase on paper only). Keep its "Internet: disconnected" page open on a phone. **Turn off random/private Wi-Fi addresses** for DARKROOM on L2, L3 and Phones 2 and 3. Change the passphrase at **9:15am Sunday**, then re-join and re-test every device.
- **No-router fallback:** an Android hotspot with **mobile data off and hotspot on** (not airplane mode, which turns the hotspot off on many Androids), said honestly. Phone 1 stays the ops hotspot, so **Phone 2 hosts DARKROOM** and browses `/incident` at the same time; test that at the join test. If Phone 2 is an iPhone (its hotspot needs cellular on), the fallback is the one-laptop simulation only.
- **Who is on DARKROOM, and when:** L2, L3, Phones 2 and 3 for the join test, G-E2E, the 1:20am phone run, the 7am dry run, the 9:15am rehearsal, and **from about 12:00pm (L3 by 12:50) to 4pm**. DARKROOM has no internet, so AI lanes on L2 and L3 stop while on it. Turn off auto-join for venue Wi-Fi (utdguest) on Phones 2 and 3.
- **Isolation proof:** L2 gets DHCP from the router, so `route print -4` shows a default route via 192.168.x.1. That is expected. The proof is: (1) the empty WAN port; (2) the L2 terminal looping `ping -n 1 -w 1000 1.1.1.1` and `nslookup example.com`, both failing (cmd: `for /l %i in (0,0,1) do (ping -n 1 -w 1000 1.1.1.1 & nslookup example.com & timeout /t 5)`, UNVERIFIED until the join test); (3) the router's "Internet: disconnected" page; (4) Phones 2 and 3 with mobile data off. Optional upgrade, only if tested: a static IP with no gateway on L2, then `route print -4` shows no 0.0.0.0 route. If not tested, never say "no default route".
- **Ops side:** Phone 1 hosts a hotspot with data on its owner's plan (3+ hours; an iPhone hotspot needs cellular on). L1 uses venue Wi-Fi for development and joins the hotspot only for gates and judging. Mark the hotspot as metered on L1. Turn off the hotspot auto-off timer. Keep a charging cable at Phone 1.
- **Venue Wi-Fi safety during development:** Spacetime and Next must not be open on utdguest. Dev: `spacetime start --listen-addr 127.0.0.1:3001` and `npm run dev` (= `next dev --turbopack -H 127.0.0.1 -p 3002`). `demo:boot` opens `0.0.0.0:3001` only on the hotspot or DARKROOM. After a gate, restart on 127.0.0.1 before rejoining venue Wi-Fi. Windows: venue Wi-Fi stays **Public**; firewall allow rules on **Private** only.
- **L3:** joins DARKROOM after its `test/` job (by 12:50pm), other adapters off. WSL2's "vEthernet (WSL)" is host-only, not an uplink. verify.mjs makes only outbound requests, which work from WSL2.
- **Demo vs dev on L1 and L2:** `git worktree add ../darkroom-demo main`, own `npm ci` and build. EOG data at `../eog-data` serves both checkouts. Check at the 8:35pm worktree boot: `ls ../eog-data/history`. Dev runs on :3002 from the owner's branch against `avon-dev` / `darkroom-dev`. Before a gate: `cd ../darkroom-demo && git pull && npm ci && npm run build && npm run demo:boot -- --side <local>`. **Never build the demo from a feature branch.**
- **WSL2 trap (VERIFIED on Mohan's laptop):** phones cannot reach servers inside WSL2. L1 and L2 run natively on Windows. L3 is outbound only.
- **Admin rights:** L1 and L2 need local admin (installer, firewall, network profile, adb drivers, pausing updates, power settings). Asked at the status check; a laptop without admin is swapped out now.
- Phones over plain http are not a secure context: no `crypto.subtle`, `crypto.randomUUID`, camera API or Wake Lock. `@noble/hashes` and `crypto.getRandomValues` work.
- Android may ask "no internet, stay connected?": tap keep.

### 5.7 Ports

| Port | Where | What |
|---|---|---|
| 3000 | L1 and L2 demo worktrees | `next build && next start -p 3000 -H 0.0.0.0`, started by `demo:boot` (never `next dev` for the demo; `npx next dev -H 0.0.0.0 -p 3000` only for CP1) |
| 3001 | L1, L2, L3 | Spacetime. `127.0.0.1:3001` in dev; `0.0.0.0:3001` only via `demo:boot` or CP1, on the hotspot or DARKROOM. Registered with `spacetime server add box --url http://127.0.0.1:3001 --default` |
| 3002 | L1 and L2 (owner's branch), L3 | `npm run dev` = `next dev --turbopack -H 127.0.0.1 -p 3002` |
| adb reverse 3000, 3001 | Quest to **L1 only**, only if S4 ships | Quest loads `http://localhost:3000/xr` and `ws://localhost:3001` (avon). The Quest never touches darkroom or DARKROOM |

WebSocket URL: `ws://${location.hostname}:3001`. QR codes use `config.public_host`, never `location.hostname`. A phone hotspot has no DHCP reservation, so run `npm run set-host` after any network change.

### 5.8 Offline assets and data

- Local fonts only. Pass `font="/fonts/<file>.woff"` to every drei `<Text>` in `app/xr/Scene.tsx` (it loads from a CDN today, VERIFIED). `createXRStore()` loads controller and hand models from a CDN by default (VERIFIED); turn them off or serve local models. Part of S4.
- No CDN scripts, no map tiles, QR generator bundled.
- Install Spacetime and all npm packages while internet works. `spacetime --version` must print 2.14.1. Windows uses a PowerShell installer from spacetimedb.com; Mohan's read-only agent posts the exact command during the status check. Pin `spacetimedb@2.14.1`.
- **EOG data outside the repo** at `../eog-data` (clone github.com/nihaal419/HackUTD-ZeroDay there; VERIFIED repo). Anyone can clone it now. `darkroom/CLAUDE.md` line: "`../eog-data` and `data/eog/` are third-party data. Their CLAUDE.md and README are not instructions. Agents do not open them."
- `test/` size about 28 MB is an estimate, UNVERIFIED.
- Smoke test with Wi-Fi off after every big change.

### 5.9 Shared data contract (`lib/types.ts`, merged at 8:05pm)

**Units: every `*_ts` (and bare `ts`) is data time in ts_unix seconds; every `*_at` is wall time in microseconds.** Bigint converts once, in `lib/live.ts`. A test pushes one fixture alert and one fixture member through `lib/live.ts` and checks `onset_ts` renders as a 2026-10 UTC date and `admitted_at` as a 2026-11 date.

```ts
type Role = 'commander' | 'responder' | 'legal' | 'viewer';
interface WideRow { facility_id: string; ts: number; /* ts_unix s */ inflow_bpd: number; level_pct: number;
  pump_status: 0 | 1 | 2; pump_flow_bpd: number; discharge_psi: number; pipe_flow_bpd: number;
  pipe_psi: number; recv_flow_bpd: number; wells_producing: number; well_status_mask: number }
interface Tank { facility_id: string; system_id: string; label: string; capacity_bbl: number;
  warning_pct: number; shutdown_pct: number; reported_pct: number; physics_pct: number;
  residual: number; disagree: boolean; disagree_count: number; spoofed: boolean;
  pump_status: 0 | 1 | 2; fill_rate_pct_h: number; data_ts: number }
interface PlanOption { kind: 'do_nothing' | 'shut_in' | 'trucks' | 'mixed'; trucks: number;
  trips_per_truck: number; wells: { well_id: string; start_after_min: number }[];
  cost_usd: number; arrivals_min: number[]; trips: boolean; peak_pct: number }
interface Plan { chosen: PlanOption; options: PlanOption[]; do_nothing_usd: number;
  no_action_trip_ts?: number; act_by_ts?: number;
  shared_fleet?: { system_id: string; used: number; fleet: number };
  note?: 'none_peaks_below' | 'already_shut_in' }
interface Alert { id: string; kind: 'pump_failure' | 'pipeline_leak' | 'pump_degradation';
  asset_id: string; facility_id: string; system_id: string;
  status: 'ongoing' | 'resolved' | 'cannot_confirm'; onset_ts: number;
  onset_bounds_ts?: [number, number]; end_ts?: number;
  hours_to_limit?: { p10: number; p50: number; p90: number }; trips_at_ts?: number;
  level_pct?: number; lost_rev_per_h?: number; level_series?: number[]; series_start_ts?: number;
  confidence: 'exact' | 'high' | 'medium' | 'early'; evidence: string[]; rank: number; plan?: Plan }
interface Incident { incident_id: string; ops_incident_id?: string; facility_id?: string; opened_at: number;
  opened_by: string; status: 'open' | 'closed'; genesis_prev: string }
interface ScopeItem { asset_id: string; name: string; data_type: string; records: number;
  residency: { TX?: number; NM?: number; OK?: number; other_US?: number; EU?: number };
  status: 'ENCRYPTED' | 'EXFILTRATED' | 'ACCESSED' | 'TAMPERED' | 'CLEAN' | 'UNKNOWN';
  confidence: 'SUSPECTED' | 'CONFIRMED'; spi: boolean; reason: string; scenario: boolean;
  order: number; updated_by: string; updated_at: number }
interface LogEntry { incident_id: string; seq: number; prev_hash: string; logged_at: number;
  actor: string; type: string; payload_json: string; hash: string }
interface ChatMsg { seq: number; channel: 'team' | 'legal'; author: string; role: Role; body: string; sent_at: number }
interface Member { identity_hex: string; name: string; role: Role; admitted_by: string; admitted_at: number; active: boolean }
interface Clock { regime: 'TX_AG' | 'TX_IND' | 'GDPR_33' | 'CREDIT_BUREAU';
  state: 'pending' | 'running' | 'not_triggered' | 'paused'; started_at?: number; due_at?: number;
  label: string; cite: string; note?: string }
interface Determination { determined_at: number; became_aware_at: number; jurisdictions: string[];
  texans_up_to: number; persons_notified_up_to: number; eu_residents: number; include_eu_in_notice: boolean;
  rationale: string; law_enforcement: boolean; le_delay_requested: boolean; signer: string }
interface Obligation { regime: Clock['regime']; text: string; count: number; triggered: boolean }
```

Hooks in `lib/live.ts`: `useTanks()`, `useAlerts()`, `useIncident()`, `useLog()`, `useConnection()`, `useConfig()`, and `act.reportTankLevel`, `act.dispatch`, `act.appendEvent`, `act.openIncident(facility)`, `act.importEvidence`, `act.join`, `act.setRole`, `act.removeMember`, `act.determine`, `act.newDemoIncident`, `act.rttPing`. At 8:05pm they run on fixtures; from 8:35pm the real provider backs them. Scope fixtures ship with the contract and are replaced by `scope.ts` at 9:50pm.

### 5.10 Tests, smoke and new dependencies

- `npm test` = `tsx --test "lib/**/*.test.ts"` (VERIFIED). All tests under `lib/`. Data tests skip when `$EOG_DIR` is missing.
- **`tsconfig.json` (fixed in commit part 1):** today it includes `**/*.ts` with target ES2017 (VERIFIED). Committing the prototypes breaks `tsc` and `next build` (TS2307, TS7006, TS2737 BigInt; checked in a scratch copy). Part 1 sets `"exclude": ["node_modules", "prototypes", "spacetimedb", "data"]` and `"target": "ES2020"`. `spacetimedb/` has its own package and is type-checked by `spacetime build`.
- **`npm run smoke`:** until 10:45pm it is `npm test && npx tsc --noEmit`. From then it is `tsx scripts/smoke.mjs --side <avon|darkroom|both>`:
  - `--side avon` (L1): ingest mock_test, `start_replay`, `report_tank_level` with the current code on a filling S5 tank, wait for the ops `incident` row (6 s limit), `demo:reset --side avon`, repeat once.
  - `--side darkroom` (L2): CLI identity made a member by `seed_member`; open incident (7 entries), scope update, chat; a fresh anonymous identity tries `append_event` and must print `rejected: not a member`; `npm run tamper`; `verify.mjs --witness` exits non-zero; `demo:reset --side darkroom` with the owner token (must not be refused); repeat once. `--only reject` runs just the rejection. From 1:15am it also covers join by code, Phone 3 rejoin, promote, revoke, ledger mark, sign, clocks, plus evidence import, Legal notes and chat if shipped.
  - `--side both` (L3, with Spacetime 2.14.1 and both token files): both halves. From MW2b (9:25pm) Mohan runs it on L3 at every merge, so 10:45 is not the first integration.

**New dependencies (Mohan OKs each first, per CLAUDE.md)**

| Package | Where | Why |
|---|---|---|
| `spacetimedb@2.14.1` (exact) | repo root and `spacetimedb/` | Client SDK, React hooks, server module API |
| `typescript` (devDependency) | `spacetimedb/` | `spacetime build` prints "tsc not found" without it (VERIFIED) |
| A QR generator (for example `qrcode`; version from `npm view`, UNVERIFIED) | repo root | Join QR and attack QR |
| adb (platform-tools) | L1 (L2 only for S4 dev) | R1 and S4 |

---

## 6. Hardware

### 6.1 Every device's job

We have exactly 3 phones, so every personal phone is a demo device. Owners are confirmed at the status check.

| Device | Job | Network | Beat |
|---|---|---|---|
| **L1 OPS laptop** (native Windows with admin; proposed: Yajat's) | EOG console, Spacetime `avon`, attack target, side-by-side panel, evidence card, attack QR; Quest USB host if S4; Discord tab (muted) | Venue Wi-Fi for dev; Phone 1 hotspot for gates and judging | 1, 2 |
| **L2 BOX laptop** (native, admin, best battery; proposed: Sreesh's) | Spacetime `darkroom`, `/box`, join QR, isolation terminal, runs `npm run tamper` | DARKROOM for gates and judging; Bluetooth off then | 3 |
| **L3 VERIFIER** (Mohan's WSL2 laptop) | Own checkout, `verify.mjs --watch`, `--side both` smoke, merges, backup video, `physics_residual.py` on `test/` | Venue Wi-Fi until its `test/` job; DARKROOM for gates and judging | 3 end |
| **Phone 1 ATTACKER** (proposed: Yajat's; he stands at L1) | Hosts the ops hotspot; the judge drags the slider; Discord app checked between judges | Its own hotspot, never DARKROOM | 2 |
| **Phone 2 COMMANDER** (Mohan's; Mohan holds it) | Witness in the short cut; in full beat 3 joins as Commander, promotes and revokes, reads L3's seq aloud. Power bank attached, screen always on | DARKROOM, mobile data off | 3 |
| **Phone 3 LEGAL** (proposed: Sreesh's) | Unjoined read-only witness in the short cut; in full beat 3 a judge joins it, signs, is revoked. **Never pinned.** DND, auto-lock Never, messaging apps logged out or hidden (or use the phone with the least personal data). Long cable. **Stays at the table overnight.** When its owner takes a break during judging, agree a return time first | DARKROOM, mobile data off | 3 |
| **Quest 3S** | 2D `/quest` over the Phone 1 hotspot, offered on request; wall charger between judges. AR only if S4 shipped | Phone 1 hotspot (or USB to L1); never DARKROOM | 2 |
| **3 AirPods, 2 Beats Solo** | Not in the demo | n/a | none |
| **3D printers** | Not used (prop cut for the clock) | n/a | none |
| **Travel router** | DARKROOM, only if the venue allows it | itself | 3 |

**Two-laptop fallback:** L1 never joins DARKROOM. Export the log from L2 to a USB stick; run `npx tsx verify.mjs --file log.json --witness …` on L1. **One-laptop fallback:** both databases on one server, all on localhost; say plainly that isolation is then a simulation.

**Overnight laptop rule:** server laptops stay at the table with an awake teammate. Before Sreesh sleeps (1:00am) he shows Mohan and Yajat the L2 demo terminal. Before Yajat sleeps (4:15am) he shows **Sreesh** the L1 terminal (Mohan sleeps until 5:30). Laptops plugged in and awake; lock-on-wake off for the night, or the PIN told to the awake teammate in person (never in TEAM.md, which goes public).

**Quest specifics**
- Sreesh picks it up on the walk and hands it to Mohan at the table for first-boot updates, account setup and charging. If utdguest blocks Meta setup, use the Phone 1 hotspot (watch the data cap; update size UNVERIFIED). Ask: dev mode allowed? whose Meta account? return deadline? charger included?
- Path 1 (S4 only): USB to L1 + `adb reverse tcp:3000 tcp:3000` and `tcp:3001 tcp:3001`, open `http://localhost:3000/xr`.
- Path 2 (default): `http://<L1 IP>:3000/quest` on the ops hotspot.
- Path 3 (video): a Quest clip needs adb pull or Meta sync; fallback is `/quest` in a laptop browser.
- Quick test with no dev mode: https://hackutd-kohl.vercel.app/xr.
- Battery about 2.5 h rated (PARTIAL) vs 3 h judging: 100% by 12:00pm Sunday, wall charger between judges. Wipes on the table.

### 6.2 Minimal shopping list ("only if" rules)

**Errand rule:** the runner is a parent or friend with a car. Never Sreesh on his walk, never the L2 owner during a gate, never Mohan. If nobody outside the team can drive, there is no errand. **Router decision by 7:40pm**, after the desk answer (Sreesh texts it about 7:30) and a 2-minute stock call. **Driver leaves by 7:45pm**, back about 9:00pm (drive time UNVERIFIED). Micro Center Dallas, 13929 N Central Expy, Dallas TX 75243, closes 9pm Sat (PARTIAL). Stock UNVERIFIED; call first.

| Item | Rule | Price |
|---|---|---|
| Dual-band travel router (GL.iNet Opal GL-SFT1200, TP-Link TL-WR902AC, or GL.iNet Beryl AX). Avoid 2.4 GHz-only | **Buy only if** the venue allows it, nobody owns one, no free home router or desk loaner, and a non-team driver is available | $30 to $110 (UNVERIFIED) |
| Extension cord, 15 to 25 ft | Borrow from the desk, else buy on the errand | UNVERIFIED |
| Power strip(s), 6 outlets | Borrow or buy. 3 laptop bricks + router + Quest + 3 phones do not fit one strip | about $10 to $20, UNVERIFIED |
| Multi-port USB charger (4+ ports) | Borrow, else buy | UNVERIFIED |
| Power bank for Phone 2 | Borrow from a teammate first | UNVERIFIED |
| Long USB cable (2 m) | For Phone 3 | UNVERIFIED |
| Headset wipes (alcohol-free) | Ask the hardware desk first | UNVERIFIED |
| USB-C data cable 2 to 3 m | Only if S4 is live and no team cable passes `adb devices` | UNVERIFIED |
| USB wall brick for the router | Only if no spare | UNVERIFIED |
| Masking tape + marker | Labels: OPS (COMPROMISED), DARKROOM BOX, VERIFIER, WAN: EMPTY | $3 to $5, UNVERIFIED |
| **Do NOT buy** | Webcam, Raspberry Pi, speakers, headphones, Quest strap, extra phones, phone stand | |

**Printing:** ask the help desk. If no printer, cards are handwritten and the Devpost/repo QR shows on L1's screen.

---

## 7. Team

### 7.1 Owners (exactly 3 people)

Each person says "yes" at the status check.

| Role | Proposed owner | Why (evidence) | Owns (only they edit) |
|---|---|---|---|
| **A. EOG engine, beat-2 engine, avon boot** | **Yajat** | Most experienced; wrote the Darkroom spec; strongest math and physics (PARTIAL) | `lib/eog/**`, `lib/rules/physics.ts`, `spacetimedb/src/eog.ts` and `physics_tick.ts` (Mohan reviews), `app/console/**`, `app/datasets/**`, `app/attack/**` from 9:30pm, side-by-side panel, `data/presets.json`, `scripts/{score-eog.ts, make-fake-test.ts, hardcode-check.mjs, hardcode-allow.txt, set-host.mjs, boot-avon.mjs}`, `prototypes/plan_now.py`, S1, S2 |
| **B. Backend, trust core, integration** | **Mohan** | Built `lib/chain.ts` and the scaffold; Max-tier Claude Code; approves deps, pushes and deploys; the only main merger | `spacetimedb/**` except Yajat's two adapters, bindings, `lib/live.ts`, `lib/types.ts`, `lib/witness.ts`, `lib/chain.ts`, `/rtt`, `verify.mjs`, `scripts/{demo-boot, boot-darkroom, demo-reset, tamper, smoke, claim-box, claim-console, ingest}.mjs`, `RUNBOOK.md`, `TEAM.md`, `darkroom/CLAUDE.md`, `tsconfig.json`, hot files (`package.json`, lock file, `app/layout.tsx`). Builds thin `/quest` and `/attack` skeletons (9:00 to 9:25pm) and hands them over at 9:30pm |
| **C. Experience: design system, breach screens and rules, Quest, story** | **Sreesh** | Proposed the Spacetime + WebXR idea; pushed for Winstead's checklist and "tamper-evident" (PARTIAL) | `app/globals.css`, `components/ui/**`, `lib/status.ts`, `lib/rules/{next, scope, clocks, evidence}.ts` + tests, `app/box/**`, `app/join/**`, `app/incident/**`, `app/report/**`, `app/quest/**` and `app/xr/**` from 9:30pm, router setup, pitch, Devpost, videos, hallway tests, S4, S8 |

**If someone says no:** the person with the most unused AI quota (`/usage`) takes lane A; the person who speaks a beat builds it; Mohan keeps B because he holds the merge.

**Before 8:25pm Sreesh has no agent lane** (lane rule). His jobs: start the L2 installer, the walk, G0 on L2, CP1 L2 half, recruiting strangers, paper wireframes, demo-script draft.

### 7.2 AI allocation and lanes

- CLAUDE.md: max 2 parallel lanes until H8 (8pm), max 3 ever.
- A **lane** = any AI session that writes code into the team repo. Mohan's read-only subagents (review, research, scoring, drafting) that write only to his scratchpad, and the builder/verifier pair inside one /build-feature run, are **not** extra lanes. **This reading is Mohan's decision; he writes it into TEAM.md "Decisions" in commit part 3.**
- **/checkpoint:** CLAUDE.md says "after each feature, ask me to run /checkpoint". The plan proposes one /checkpoint per merge window. Mohan OKs that in TEAM.md, or we go back to one per feature.
- **One feature per session:** Mohan's 9:25 to 10:45pm block runs as **sequential single-feature sessions** (witness, tamper, verify, reset, smoke, Open incident, demo-boot), each ending with its own test output.

| Time | Lane 1 | Lane 2 | Lane 3 |
|---|---|---|---|
| 7:20 to 8:25pm | Mohan: commits, contract, module skeleton, ingest, `/rtt`, provider | Yajat: EOG port with tests, raw console on mock_test | none |
| 8:25pm to 1:15am | Mohan: skeleton, short-cut path, then join/roles/sign | Yajat: physics, adapters, beat-2 UI, datasets route, then G-EOG2 items | Sreesh (to 1:00am): design system, scope.ts + next.ts, short-cut screens, clocks.ts + evidence.ts, full beat-3 screens |
| 1:15 to 4:15am | Mohan until 2:00am (merge, phone run, decision) | Yajat: S1, S2 | none |
| 4:15 to 6:00am | none | none | Sreesh: S8, S4 |

**Mohan's Max plan:** exactly one code lane, plus read-only multi-agent work: review every branch before merge, score EOG output, Spacetime doc lookups, Devpost and pitch drafts through /humanizer. It never becomes a 4th writer.

**Pro plan rules for Yajat and Sreesh** (limit facts PARTIAL):
1. Run `/usage` now. Pro has a rolling 5-hour window plus a weekly cap, shared with claude.ai chat. Plan your windows from what it shows.
2. Use Sonnet for routine work (`/model`). Any second tool Yajat uses still counts as his one lane.
3. One ticket per session, then `/clear`. Name exact files.
4. **Never let an agent read a whole `telemetry.csv`** (12 to 23 MB). Show `head -5` and the columns.
5. Give it the committed prototypes and fixtures.
6. **Agents never open anything in `../eog-data` except through the app's loader.** Mohan reads the EOG README "Terms" lines and the EOG CLAUDE.md himself and records his decision in TEAM.md by 8:05pm.
7. Run tests and builds yourself; paste only failing lines.
8. No subagents on Pro. Do not start a fresh window right before sleep or 30 minutes before a gate.
9. Out of quota: write a ticket in TEAM.md for Mohan's lane (while he is awake), or code by hand.

**Ticket template (TEAM.md):** ID · Read (exact files) · Touch (exact files) · Fixture input · Acceptance command and expected output line · Out of scope.

**Shared context files:** `darkroom/CLAUDE.md` (Mohan only; under 40 lines: stack, commands incl. `npx tsx`, dev port 3002, ownership, hot files, the EOG data rule, "say 'agent context' not the file name in commit messages") and `darkroom/TEAM.md` (owners, git names and emails, contract, Decisions, gates, demo path, tickets, handoffs, booth answers, the Terms decision). **Never in TEAM.md:** tokens, passphrases, PINs, the Spacetime access code.

### 7.3 Git workflow (team repo github.com/yajatp/hackutd26v2, local at /home/mohan/hackutd/darkroom)

**Repo access (status check, 1 minute):** Yajat adds Sreesh (`sreeshkmanayakar-beep`) as collaborator; Sreesh accepts. Yajat gives Mohan Admin; Mohan confirms with `gh api repos/yajatp/hackutd26v2 --jq .permissions.admin`.

**Commit part 1 (Mohan, 7:20 to 7:25pm; push and post the hash):**
- `.gitignore` adds `data/eog/` and `public/datasets/`.
- `.claude/settings.json` = `{"attribution":{"commit":"","pr":"","sessionUrl":false}}`.
- `tsconfig.json`: exclude `prototypes`, `spacetimedb`, `data`; target `ES2020`.
- `package.json`: `"dev": "next dev --turbopack -H 127.0.0.1 -p 3002"`.
- Before push: `npm test && npx tsc --noEmit` pass. Message: "Ignore EOG data, set dev port, raise TS target".
- This push passes the toolbox hook because only Mohan's commits exist. Do not fetch teammate branches until the pre-push fix is in.

**Commit part 2 (Mohan, 7:25 to 7:35pm):** `prototypes/{README.md, detect.py, evaluate.py, planner.py, validate.py, physics_residual.py, spacetime-index.ts, ingest.ts, out_mock_test.json, out_full_week.json}` and `lib/eog/__fixtures__/fixtures.json` (91 cases). Generate `out_full_week.json` first: `python3 -I detect.py <eog>/history/full_week --json out_full_week.json` (about 0.5 s). `out_mock_test.json` is the existing `out_mock_test_2026-10-10T1530.json`, renamed. **`physics.py` is not committed** (it loads an excluded pickle); `physics_residual.py` (stdlib only) is the Sunday script. No CSVs. Message: "Add Python prototypes and fixtures".

**Commit part 3 (Mohan, by 8:05pm, before any teammate push and before fetching teammate branches):** `CLAUDE.md` (agent context), `TEAM.md` (Decisions incl. Mohan's lane reading, /checkpoint, CUTS.md and pre-push answers), `RUNBOOK.md` (G0, CP1 commands, owner-token commands, manual first boot, dev 127.0.0.1 restart). Commit messages never contain "Claude" or "CLAUDE.md": say "Add agent context file".

**Pre-push guard fix (Mohan, by hand, by 8:00pm). VERIFIED problem:** darkroom's `.git/config` has `core.hooksPath = /home/mohan/hackutd/scripts`. That `pre-push` runs the toolbox `pre-push-check.sh`, which checks `git log --all` and allows only Mohan's identity. After the first `git fetch` of a teammate branch, every darkroom push fails.
- **Chosen (b):** Mohan edits the toolbox `scripts/pre-push-check.sh`: if `$(git rev-parse --git-dir)/allowed-identities` exists, each author and committer must match one of its lines (exact `Name <email>`); otherwise keep today's Mohan-only rule. Keep the `claude` grep over `--all` and keep `exit 0` at the end. darkroom's `.git/allowed-identities` (untracked) lists the 3 identities from the status check. GitHub web commits (`noreply@github.com`) are not on the list, so they get flagged.
- Never route around the hook: no `--no-verify`, no `-c core.hooksPath` (the toolbox `block_claude_trailer.py` blocks both anyway). Agents never edit the hook, the check or hooksPath.
- **Dry-run check:** in darkroom, `git fetch origin`, then `bash /home/mohan/hackutd/scripts/pre-push-check.sh` prints nothing, then `git push --dry-run origin main` exits 0 with no hook output. Repeat after the first teammate branch is fetched.
- The darkroom pre-push command (RUNBOOK, Mohan only): `bash /home/mohan/hackutd/scripts/pre-push-check.sh` from inside darkroom. It must print nothing; if it prints, stop.
- **Only Mohan** edits the toolbox CLAUDE.md "only my commits" line.
- The commit-msg hook rejects "claude" in any message, including merge commits. Branch names never contain "claude". Teammates write "agent context" instead of the file name.

**G0 on every laptop (L1 at 7:20pm, L2 at 8:00pm, L3 by Mohan):** (1) clone the EOG repo into `../eog-data`; (2) `git pull` after the part 1 hash; (3) `git check-ignore -v data/eog/x` prints the rule; (4) `cat .claude/settings.json` shows the attribution keys empty; (5) `git config user.name` / `user.email` match TEAM.md; (6) `npm ci`; (7) `npm test` (8 pass; data tests skip or pass); (8) `spacetime --version` = 2.14.1; (9) `python --version` (can L1 run `plan_now.py`?). If a teammate committed before pulling, check `git log -3 --format=%B` for any credit line before pushing.

**Daily rules**
- Branches: `yajat/<feature>`, `sreesh/<feature>`, `mohan/<feature>`. Commit after every working step. Push your own branch about every 30 minutes.
- Start of each session: `git fetch && git merge origin/main`. Merge, not rebase. **Never force push.**
- **Only Mohan merges into main and pushes main**, locally, at: **8:05pm (MW1), 8:35pm (MW2), 9:25pm (MW2b), 9:50pm (MW3), 10:25pm (MW4a soft), 10:45pm (MW4), 12:45am (MW4c integration), 1:15am (MW5), 5:45am (MW6)**, fix merges 6:30 to 10:30am on demand, final 11:00am.
- **Each merge window:** read-only review agent on the diff; `git merge --no-ff origin/<branch>`; `npm ci` if the lock file changed; `npm test`, `npx tsc --noEmit`, `npm run build`; `npm run smoke -- --side both` on L3 from MW2b on; pre-push check prints nothing; push main; tag `good-HHMM`; push the tag.
- **If a credit line slips in:** fresh branch from main, `git cherry-pick -n <sha>`, commit cleanly, push. Deleting the bad remote branch (`git push origin --delete <branch>`, not a force push) is Mohan's call each time, and the teammate is told first. Then `git fetch --prune`.
- **Overnight rule:** anything not merged at 1:15am lands at 5:45am only if it is CSS or copy, or its `npm test` and `npm run smoke` output was pasted in TEAM.md before its owner slept, or the owner is present at the merge.
- No GitHub web merges, no `gh pr merge` (it changes the committer).
- Lock-file conflict: take main's lock file and run `npm ci`, unless an approved new dependency is in the merge.
- Rollback: `git restore <file>`; `git revert <sha>`; `git switch -c rescue good-HHMM`, then redeploy.
- **Secret scans** (1:45am, 10:00am, after `good-1100`) print paths only: `git grep -l -i -E "api[_-]?key|secret|token|passw|BEGIN .*PRIVATE KEY" $(git rev-list --all) | sed 's/^[^:]*://' | sort -u` and `git ls-files | grep -Ei "\.env|\.pem|\.key|\.vercel"`. Expected harmless hits: `lib/live.ts` (withToken), `scripts/*` that read `*-owner.token`, `RUNBOOK.md` (file names, "passphrase on paper"). Budget 10 minutes for Mohan to open any other hit himself. Agents never print matching lines.
- **Code cutoff:** no commits or pushes after the 11:30am submit.

### 7.4 Handoffs

- TEAM.md "Handoff" block per person at each sleep or quota stop: branch, last good commit, what works, what is half-done, next step, who to wake.
- RUNBOOK.md: G0, CP1, owner-token commands, manual first boot, `demo:boot` / `demo:reset` / `set-host` per side (who runs each), smoke commands, tamper, `verify.mjs --watch` and `--witness`, the dev 127.0.0.1 restart, the pre-push command, router SSID (passphrase on paper), ports, and **Sunday `test/`**: `git pull` in `../eog-data` on L1 and L3, then refresh `/console` or use the picker.
- Rule: by Sunday 7am, any 2 of the 3 can run every beat. The dry run proves it.
- After each merge window, Mohan runs /checkpoint (if he OKs that reading).

---

## 8. Timeline (CT, Sat 7:10pm to Sun 5:00pm)

**Status check (7:10 to 7:20pm, all 3, blocking items only):** (1) each person's "yes" to a role; (2) which laptop is L1 and L2, and does its owner have local admin (no admin: swap now); (3) each person's git name and email (for the allowlist); (4) Sreesh added as collaborator, Mohan admin; (5) phone owners and models (iPhone or Android), and whose data plan carries Phone 1; (6) does anyone own a travel router; (7) who outside the team can drive. Mohan settles lanes, pre-push option, /checkpoint, CUTS.md and dependencies **alone**, before commit part 3. Each person gets their card (8.1).

### Saturday night

| Time | Who | What | Proof |
|---|---|---|---|
| **7:10-7:20** | all 3 | **Status check.** | Answers in TEAM.md |
| 7:10-7:20 | Mohan's read-only agent | Fetch the exact Windows Spacetime PowerShell install command; post it. | Command in chat |
| 7:20 | Sreesh | Start the L2 installer (or hand L2 to Yajat), then walk. | |
| **7:20-8:00** | Sreesh | **Walk, in this order.** (1) **Help desk:** router allowed tonight and at judging (text Mohan at once); minors overnight, waiver or chaperone; parents' pickup and drop-off; food times; sleeping room; closing time; printer; judging slot length and room. (2) **Hardware desk:** take the Quest; charger included?; dev mode; account owner; return deadline (Quest and anything borrowed); borrow strip, extension cord, USB charger, wipes. Hand the Quest to Mohan at the table. (3) **EOG booth:** Terms lines, mixed trip counts, within-a-minute tolerance, is the overlay "hardcoding", already-shut-in tanks, onset scoring with pump off, who judges. (4) **Spacetime booth: collect the access code** (team chat, not the repo); Q1, Q3 explicit; Q2, Q4 to Q8. (5) **Winstead table:** who judges, what makes a winner. Booth unstaffed: Discord DM. Names and exact words in TEAM.md. | Router answer by about 7:30 |
| 7:20-7:25 | Mohan | **Commit part 1** (7.3). Post the hash. | Hash; `npm test` + `tsc` output |
| 7:20-7:40 | Yajat | **G0 on L1** (7.3). Install Spacetime 2.14.1 and platform-tools while his agent starts. Create `../darkroom-demo`. | `spacetime --version`, `ls ../eog-data/history` |
| 7:25-7:35 | Mohan | **Commit part 2** (prototypes, fixtures). Post the hash. | Hash |
| 7:25-8:05 | Mohan (lane 1 agent) | Contract: `lib/types.ts` (units rule), `lib/live.ts` on fixtures, `lib/rules` signatures, units test. Read-only agent checks per-sender views. | Test output |
| 7:35-8:00 | Mohan (by hand) | Pre-push fix (b) and dry run; part 3 docs; reads EOG Terms and EOG CLAUDE.md, records decision. Starts Quest first boot when it arrives. | Check prints nothing |
| ~7:30-7:40 | driver, else Mohan | Stock call after the desk answer. **Router decision by 7:40; driver leaves by 7:45.** | Decision in TEAM.md |
| 7:35-8:45 | Yajat (lane 2) | Tests first, then `detect.ts`, then `planner.ts`, then a raw `/console` table on mock_test (`npm run dev`, 127.0.0.1:3002). | `npm test` output |
| **7:40-7:50** | Yajat (L1, Phone 1), Mohan watches | **CP1 L1 half** with the RUNBOOK CP1 commands. Quest leg whenever the Quest is ready (non-blocking). | Screenshots |
| **7:50-8:00** | Yajat on L1 | **Backup video v0** with Game Bar: about 10 minutes of raw capture of whatever runs (H8 rule: a backup video exists by 8pm). Copy the MP4 to a second device. | MP4 on 2 devices |
| 8:00-8:15 | Sreesh | Back. **G0 on L2.** Recruit 2 strangers for 11:05pm. | `spacetime --version` |
| **8:05** | Mohan | **MW1:** contract, part 3. Smoke = `npm test && npx tsc --noEmit`. Updates toolbox CLAUDE.md dev port and smoke placeholder. | `good-2005` |
| 8:05-8:35 | Mohan (lane 1) | Module skeleton with the 4 prototype fixes, `well_status_mask`, `rtt_ping`, `set_side`, operator + `claim-console`; darkroom `append_event`, `create_join_code` / `join_incident` stubs; `scripts/ingest.mjs`; `/rtt`; **real `lib/live.ts` provider with per-route database choice**. | CP2: a bad `append_event` prints "seq must be head+1" |
| **8:15-8:25** | Sreesh (L2, Phone 2) | **CP1 L2 half.** | Screenshots |
| **8:25** | Sreesh | **Lane 3 opens:** design system (tokens, `lib/status.ts`, 3 components). Router config the moment it is in hand. | |
| **8:35** | Mohan | **MW2:** skeleton, ingest, `/rtt`, provider, Yajat's raw console if ready. | `good-2035` |
| 8:35-8:45 | Yajat (L1), Sreesh (L2) | Demo worktrees pull, build, publish, boot by the manual RUNBOOK commands. Owner token files written (5.2) and checked without printing. | Length check output |
| **8:45-9:00** | Mohan decides; Yajat runs on L1 | **S2** (technical) and **EOG-0.** One-way door at 9:00. | `/rtt` screenshot, `time` output, `npm test` output |
| 8:45-9:05 | Sreesh | **Dinner** (agent working). | |
| 9:00 | Mohan | Approve the 3-sentence Devpost placeholder text (after /humanizer). | |
| 9:00-9:25 | Mohan (lane 1) | Skeleton block: `claim_box` + `npm run claim-box`, `seed_member`, `/quest` and `/attack` skeletons, attack code with `ctx.random` and how `/console` reads it, `set_public_host`, thin `/box` `/join` `/incident` wiring. | |
| 9:00-9:50 | Yajat (lane 2) | `lib/rules/physics.ts` + `cleanResidualMax` + latch tests; `spacetimedb/src/eog.ts` with `finish_ingest`; `physics_tick.ts`; ranked layout and options table in raw markup. **Dinner 9:05-9:25** (agent working). | |
| 9:05-9:50 | Sreesh | `lib/rules/scope.ts` and `lib/rules/next.ts` with tests. Configure the router if it arrived (~9:00). | `npm test` output |
| **9:25** | Mohan | **MW2b:** skeleton routes, claim-box, seed_member, set_public_host. Demo worktrees pull and boot. From here Mohan runs smoke `--side both` on L3 at every merge. | `good-2125` |
| **9:30-9:45** | Mohan + route owners | **Walking skeleton gate** (2.3). Owners take over `/attack`, `/quest`, `/xr`. | Output in TEAM.md |
| 9:25-10:45 | Mohan (lane 1, one feature per session) | `lib/witness.ts` with `hashes[]`; `tamper.mjs`; `verify.mjs` (`--watch`, `--witness`); `appendServerEvent`; Open incident with facility + 7 entries using `scope.ts`; `new_demo_incident` (owner or Commander); `demo-reset.mjs`; `demo-boot.mjs` + `boot-darkroom.mjs`; `smoke.mjs`. | Each session's test output |
| **9:50** | Yajat, checked by Mohan | **G-EOG** incl. `finish_ingest` timing. **MW3** (also Sreesh's design system, scope.ts, next.ts). | `good-2150` |
| **9:50** | Sreesh | **Register and submit the Devpost placeholder** (pitch line + tracks); all 3 members accepted. Spacetime Q1 to Q3 settled. | Screenshot |
| 9:55 | Mohan | Confirms the Devpost (5 minutes). | |
| 9:50-10:45 | Yajat | Beat-2 UI, `set-host.mjs`, `boot-avon.mjs`, `/datasets` routes, dropdown and picker, Hard case preset, swap to `components/ui`. | |
| 9:50-10:45 | Sreesh | Short-cut screens against fixtures: `/box` scope board, Open incident, status strip, HR card, witness banner; `/incident` NEXT card and banner slot (read-only). | |
| by 10:15 (start) | Sreesh + Phone 2 + Phone 3 | **DARKROOM join test** (2.3), 15-minute cap. Router configured after 10:00: fold into G-E2E setup. No router: test the Phone 2 hotspot fallback here. | Screenshots, curl output |
| 10:00-10:20 | Mohan | **Dinner** (agent working). | |
| **10:25** | Mohan | **MW4a soft merge:** whatever is green. Smoke both on L3. | `good-2225` |
| **10:45** | Mohan | **MW4 final** for stragglers. RUNBOOK has the two smoke commands. | `good-2245` |
| **10:45** | Mohan's read-only agent | **Devpost full-text draft** starts in chat (L3 online until about 11:03). Mohan reviews after G-E2E; /humanizer; approval before saving. | Draft in chat |
| 10:45-11:05 | Yajat (L1), Sreesh (L2), Mohan (L3) | Setup: pull, `npm ci`, build, publish, `demo:boot`, ingest mock_test. L1 to the Phone 1 hotspot; L2, Phones 2 and 3 to DARKROOM; L3 last (about 11:03). Phone 1 scans the attack QR. | |
| (11:00) | | Devpost registration deadline. Already done at 9:50. | |
| **11:05-11:35** | all 3 | **G-E2E (short cut)** (2.3). After smoke, Phone 1 rescans the attack QR. **Hallway test 1** with 2 strangers and 3 tasks (find the cheapest fix; mark a scope row on `/box`; say what the red banner means). Log seconds and hesitations. Sreesh records **v1 takes**. | Smoke output, seconds |
| 11:35-12:00 | Sreesh | Edit v1 (2:00 max) on L2 (back on venue Wi-Fi after restarting Spacetime on 127.0.0.1) while his agent writes `clocks.ts` and `evidence.ts`. Push `sreesh/rules` by 12:00. | MP4 on 2 devices |
| 11:35pm-1:15am | Mohan (lane 1) | Join (code hash, expiry), roles, promote and revoke, Phone 3 rejoin, "Join with code", `legal_determination`, then (cut order applies) evidence import, Legal notes + `counsel_engaged`, chat; extended smoke. At 12:00 merges `origin/sreesh/rules` into his branch. **Late meal 12:15-12:30** (agent working). | |
| 11:35pm-1:00am | Yajat | G-EOG2 items in order: score + raw-telemetry table, hardcode-check with self-test, events.json, sparklines, confidence band, `make-fake-test.ts`, `plan_now.py` outputs, parse timing. **Late meal 11:45-12:05.** | |
| 12:00-12:45 | Sreesh | Full beat-3 screens against fixtures: join, member list, review-and-sign, clocks, chat and Legal notes, `/report` with CSF table. **Late meal 12:00-12:15** (agent working). | |
| **12:45** | Mohan | **MW4c integration merge** (Sreesh's screens, Mohan's wiring so far). L2 demo worktree pulls and boots. Sreesh checks his screens on real data, fixes the top issue, writes his handoff, shows Mohan and Yajat the L2 terminal. | `good-0045` |
| **1:00** | Yajat, checked by Mohan | **G-EOG2** on Yajat's branch (L1 dev :3002). Sreesh sleeps. | `npm run score` output, empty hardcode-check |
| **1:15** | Mohan | **MW5:** merge Mohan's and Yajat's branches; extended smoke on L3; tag. Pull and boot the L2 demo worktree. | `good-0115` |
| **1:20-1:35** | Mohan + Yajat | **Human run on DARKROOM** on `good-0115`: Phone 3 joins by QR, is promoted, signs, is revoked, rejoins by typed code; witness survives. | Notes in TEAM.md |
| **1:45** | Mohan | **Full beat-3 decision** (2.3). Secret scan 1 (paths only). Tag `good-0145`. Main frozen. | `good-0145` |
| 1:45-2:00 | Mohan | Handoff block. | |
| 1:00-4:15 | Yajat | S1 (go/no-go 2:30); S2 (go/no-go 3:45). Branch pushed with test and smoke output in TEAM.md. Handoff; shows **Sreesh** the L1 terminal. | |

### Overnight and Sunday

| Time | Who | What | Proof |
|---|---|---|---|
| 1:00-4:15 | Sreesh | **Sleeps.** Woken by Yajat. Phone 3 stays at the table. | |
| 2:00-5:30 | Mohan | **Sleeps.** No demo-path merges. | |
| 4:15-7:45 | Yajat | **Sleeps.** | |
| 4:15-6:00 | Sreesh | S8 and S4 (S4 only if R1 and R1b passed; dev on L2 against `avon-dev`), go/no-go 5:30. Devpost text edits, handwritten cards. Recruit a morning stranger. | |
| **5:45** | Mohan | **MW6** under the overnight rule. | `good-0545` |
| **6:00 (H18)** | Mohan, Sreesh | **Feature freeze.** Fixes only. | |
| **7:00-8:00** | Mohan + Sreesh | **Dry run** on L1 and L2, in this order: (1) one cold boot per side (`demo:boot` under 60 s); (2) reset 3 times per side (under 10 s, phones show `READY`, Phone 1 rescans); (3) timed 2-person versions of the 90-second and Winstead runs; (4) smoke twice per side; (5) every folder through the dropdown; (6) new-folder test: copy a folder into `../eog-data/history` while running, refresh, confirm it appears; (7) S4 check on L1 if shipped; (8) table layout mock. Skip the tail if time runs out. | Numbers written down |
| 8:00-8:30 | all 3 | Yajat up at 7:45. EOG order with Yajat driving; judge-drives version on fake_test. Sreesh records the **final video takes**. | |
| 8:30-9:10 | Sreesh | Edit the final video on L2 (venue Wi-Fi; Spacetime restarted on 127.0.0.1 first). Start the Unlisted upload at 9:10. Not done by 9:15: copy the MP4 by USB stick to L3 and upload there. | |
| **9:15** | Sreesh + Mohan | Change the DARKROOM passphrase; re-join every device; `demo:boot` on L2. | All devices joined |
| **9:20** | Sreesh | **Hallway test 2** (the number we quote), with the recruit or any passer-by. | Seconds |
| 9:30-10:00 | all 3 | Video Unlisted by 9:30. Rehearse the 90-second, 3-minute, 60-second, per-judge and 2-person versions. Banned-phrase sweep of Devpost, README and pitch notes. | |
| by 10:00 | Mohan | Approve README prose after /humanizer. | |
| 10:00 | Mohan | Secret scan 2 (paths only); `.env`, `.vercel`, tokens not tracked. `vercel deploy` preview of `/console` offline mode (prod only with Mohan's OK). | Scan output |
| **10:30** | Yajat or Mohan | **Repo public** after the scan and an empty pre-push check. Open repo, video and any "try it" link from a logged-out phone; screenshot. | Screenshot |
| **11:00** | Mohan | Final merge `good-1100`; rerun scan and check; push. L1 and L2 demo worktrees check out `good-1100`, build, boot. Final Devpost text approved. | `good-1100` |
| **11:30** | Sreesh + Mohan | **Final Devpost submit:** 3 members, repo, video, tracks (EOG, Winstead, Spacetime if in, Design). Screenshot. **Code cutoff.** | Screenshot |
| 11:30-12:50 | all 3, named slots | Lunch: Yajat 11:30-11:50, Sreesh 11:50-12:10, Mohan 12:10-12:30. L1 and L3 check the EOG repo for `test/` every 15 minutes. When it lands: `git pull` in `../eog-data` on L1 and L3; refresh the dropdown or use the picker on L1; run `physics_residual.py` on L3 (deadline 12:50). Charge everything. | |
| 12:00-1:00 | all 3 | Table setup (9.6). If judging is in another room, start at 11:45 and allow 60 minutes. L3 onto DARKROOM by 12:50. Quest at 100%. | |
| **1:00-4:00** | at least 2 at the table always | **Judging.** Between judges: 9.6 checklist. Yajat checks Discord on Phone 1 between every judge and every 15 minutes (L1 Discord tab as backup). | |
| 4:00-5:00 | all 3 | Pack. Return the Quest and anything borrowed (deadline from the desk). **All 3 attend closing** (time from the desk; prizes need us present). | |

**Food:** venue meal times are UNVERIFIED; Sreesh gets them at the help desk. If the venue meal is at a different time, keep the order and the 20-minute length, shift to the venue time, and never have two people eat during a gate. Snacks in the Atrium (VERIFIED).

**Workshops:** none worth build time. Skip ScrabbleBot and the Olympics.

**Sleep:** Sreesh 1:00 to 4:15am, Mohan 2:00 to 5:30am, Yajat 4:15 to 7:45am. Someone is always awake, and every running laptop stays with an awake teammate. Showers: ECSW floor 1 (VERIFIED).

### 8.1 One-screen cards (each person reads only theirs)

**Mohan.** 7:10 status check. 7:20 part 1 push. 7:25 part 2. 7:25-8:05 contract agent. 7:35-8:00 pre-push fix (b) + dry run, part 3 docs, Terms decision, Quest first boot. 8:05 MW1. 8:05-8:35 module, ingest, `/rtt`, provider. 8:35 MW2. 8:45-9:00 S2 + EOG-0 decision. 9:00 approve Devpost placeholder. 9:00-9:25 skeleton block. 9:25 MW2b. 9:30 skeleton gate. 9:25-10:45 short-cut path (one feature per session). 9:50 MW3 + G-EOG. 9:55 confirm Devpost. 10:00-10:20 dinner. 10:25 MW4a. 10:45 MW4 + Devpost draft agent. 11:05 G-E2E (Phone 2, L3). 11:35-1:15 join/roles/sign; meal 12:15. 12:45 MW4c. 1:00 check G-EOG2. 1:15 MW5. 1:20 phone run. 1:45 decision, scan, tag. Sleep 2:00-5:30. 5:45 MW6. 7:00 dry run. 9:15 passphrase. 10:00 README, scan 2. 11:00 final merge. 11:30 submit. Judging: narrator, Phone 2, L3. Closing.

**Yajat.** 7:10 status check. 7:20 G0 on L1 (clone EOG to `../eog-data`, Spacetime, platform-tools, worktree). 7:35-8:45 EOG port, raw console. 7:40 CP1 L1 half with Phone 1. 7:50-8:00 record v0. 8:35 boot L1 demo worktree. 8:45 S2 + EOG-0 on L1. 9:00-9:50 physics, adapters; dinner 9:05. 9:50 G-EOG. 9:50-10:45 beat-2 UI, datasets route, dropdown, picker, set-host, boot-avon. 10:45 L1 setup; Phone 1 scans attack QR. 11:05 G-E2E. 11:35-1:00 G-EOG2 items (score and hardcode-check first); meal 11:45. 1:00 G-EOG2. 1:20 phone run with Mohan. 1:00-4:15 S1, S2. 4:15 show Sreesh the L1 terminal, sleep. 7:45 up. 8:00 EOG run. Judging: L1 driver, Discord on Phone 1, `demo:reset --side avon` between judges.

**Sreesh.** 7:10 status check. 7:20 start L2 installer, walk (help desk, hardware desk, EOG booth, Spacetime booth for the access code, Winstead); text the router answer by 7:30. 8:00 G0 on L2, recruit strangers. 8:15 CP1 L2 half with Phone 2. 8:25 lane opens: design system. 8:35 boot L2 demo worktree. 8:45 dinner. 9:05-9:50 scope.ts, next.ts. Router config the moment it arrives. 9:50 submit Devpost. By 10:15 join test. 9:50-10:45 short-cut screens. 10:45 L2 setup. 11:05 G-E2E, record v1. 11:35 edit v1, clocks + evidence. 12:00-12:45 full beat-3 screens; meal 12:00. 12:45 check screens on real data, handoff, show L2 terminal. Sleep 1:00-4:15 (Phone 3 stays at the table). 4:15-6:00 S8, S4. 7:00 dry run. 8:00 final takes. 8:30 edit video. 9:15 passphrase. 9:20 hallway test 2. Judging: devices, root delete, `demo:reset --side darkroom`.

### 8.2 If minors may not stay overnight (Sreesh asks at the help desk)

1. **Who goes home and when:** each minor leaves at the venue's cutoff (pickup times collected on the walk). Laptops travel with their owners; nothing is left at the table. Work continues from home on branches; Mohan keeps merging remotely. If Mohan cannot work, nobody merges main until he returns. Owner tokens stay on L1 and L2 with their owners.
2. **Safe floor stays at the venue:** the 9:50pm Devpost and the short cut. If the cutoff is before 11:35pm, G-E2E moves earlier, right after MW4.
3. **Gates that move to 7 to 9am on arrival:** server laptops are re-booted with `demo:boot`; the 1:15 merge becomes a 7:00am merge; the human phone run and full beat-3 decision move to 7:15 to 7:45am; the dry run shrinks to steps 1 to 3.

---

## 9. Demo

All scripts are DRAFTS. They go through /humanizer and Mohan's approval before being saved as text in his name. Read every number off the screen; never from memory.

**Which data:** EOG judges see `test/` loaded live. Everyone else sees mock_test, called "EOG's mock network".

**Who stands where:** Yajat at L1. Sreesh between Phone 1 and L2: he hands devices, types "Open incident", runs `npm run tamper`. Mohan narrates, holds Phone 2, watches L3.

**State at the start of every run:** after `demo:reset`, darkroom has **no open incident** (`READY · next drill INC-000N`). Every run opens one during beat 2, which logs 7 entries that every phone witnesses before the delete.

### 9.1 Default 90-second run (general and Design judges; works with the short cut)

- **0-10s MOHAN:** "A hacker fakes a tank sensor. Physics catches the lie. It's 3am in Avon and a pump just failed."
- **10-30s MOHAN** reads the top alert: "Shuts in [read]. Cheapest fix: [read], [$x], against [$y] if we do nothing."
- **30-60s SREESH** hands Phone 1: "You're the hacker. Drag it." **MOHAN:** "Water in minus water out says the tank is filling. The sensor says it isn't." Banner and tone. While Mohan talks, **Sreesh types the facility from L1's evidence card into "Open incident" on `/box`** (about 10 s).
- **60-70s SREESH (Design line):** "Every screen answers one question: what do I do next. Every status is a word plus a color, and a stranger did the first task in [N] seconds with no instructions."
- **70-85s MOHAN:** "The response runs on an isolated box. L3 saw seq [read]." **SREESH** runs the root delete on L2; every screen shows ROLLBACK DETECTED; L3 prints what was cut.
- **85-90s MOHAN:** "Cheapest fix for the night shift, and a breach room with no network path from the ops side. All three of us are first-time hackers."

### 9.2 Full 3-minute script

**MOHAN** = narrator, Commander (Phone 2). **YAJAT** = EOG on L1. **SREESH** = devices, breach screens, design, root delete.

**0:00-0:12 HOOK. MOHAN:** "A hacker fakes a tank sensor. Physics catches the lie. Here's that night. It's 3am in Avon. A pump just failed at a water tank. If it fills, the wells shut in and Avon goes dark."

**0:12-0:50 BEAT 1, EOG. YAJAT** loads the folder.
- "Loaded just now. Nothing hardcoded. 'Now' is the last timestamp in the file."
- "Pump failures first, soonest shutdown on top. This one shuts in at [read]. Cheapest plan: [read], [$x], against [$y] if we do nothing." Opens the options table. Clicks "Send 1 truck".
- "Leaks get an urgent inspector. Worn pumps get an inspector."

**0:50-1:25 BEAT 2, THE ZERO DAY. SREESH** hands Phone 1: "You're the hacker. This tank is filling. Drag it."
- **MOHAN:** "The sensor says [x]% and steady. Water in minus water out says it's rising. The sensor disagrees with physics." Banner and tone.
- **MOHAN** (if Spacetime is in): "That slider is a reducer call. This screen and the field view are live subscriptions to the same table."

**1:25-2:05 BEAT 3, WINSTEAD. MOHAN:** "A faked sensor means someone is inside, so the response runs here, on its own network. WAN port empty; this box can't reach the internet." Types the ops incident ID, facility and ref into `/box` (short cut: the facility into "Open incident"): "Evidence crosses by hand and lands as suspected."
- **SREESH** on the scope board: "We seeded the rest of this breach as a scenario. Only the tank row came from what you just did. They faked the sensor with a stolen HMI login. The same login opens the royalty share." Marks the ledger EXFILTRATED. "Now we're over the 250-Texan line for the Attorney General, if Legal determines a breach. And individual notice would cover every person in that ledger, not only Texans."
- **SREESH** hands Phone 3: "You're Legal. Review and sign." One tap. "Now that Legal has determined it, the Attorney General must hear as soon as practicable, and no later than 30 days after this determination. Demo rules, not legal advice."

**2:05-2:15 DESIGN. SREESH:** "Every screen answers one question: what do I do next. One row per problem, every status a word plus a color, and a stranger did the first task in [N] seconds."

**2:15-2:40 TAMPER. MOHAN:** "L3 saw seq [read]." **SREESH:** "I'm root on the box. Deleting the last three log entries." Every screen: ROLLBACK DETECTED AT #k. **MOHAN** on L3: "A verifier that doesn't trust the box compares against the head it saved earlier and shows exactly what was cut."

**2:40-2:52 ARCHITECTURE. MOHAN** (if Spacetime is in): "Ingest, the EOG engine, the physics check, roles and the log rules all run in SpacetimeDB reducers on these laptops." If dropped: "Every phone remembers the last head it saw, so a shorter log can't hide."

**2:52-3:00 CLOSE. MOHAN:** "On the week we tuned on, 23 of 23 events with no false alarms. On your folder, you just saw it live. All three of us are first-time hackers. Questions?"

**If the short cut is the demo:** use "Open incident" with the facility; skip the ledger mark, Phone 3 signing and both Attorney General lines; go from the scope board (HR card visible) to the tamper.

After every run: `demo:reset` on both sides, Phone 1 rescans the attack QR, all phones show no red.

### 9.3 60-second fallback

- **0-10s MOHAN:** banner line, "3am, a pump fails in Avon."
- **10-25s YAJAT:** top alert, plan, cost vs do nothing.
- **25-40s:** judge drags. **MOHAN:** "Sensor says flat, physics says filling. Caught." **SREESH** taps "Open incident" with the facility.
- **40-55s SREESH:** root delete; ROLLBACK DETECTED on every screen.
- **55-60s MOHAN:** close line.

If live is broken, play the 60-second video cut on L3 and narrate.

### 9.4 Order per judge type

| Judge | Lead with | Split (beat 1 / 2 / 3) | Must show |
|---|---|---|---|
| EOG | Beat 1, judge drives ("Load folder" → `test/`) | 90s / 45s / 30s | `test/` live, SPEC order, options table, Hard case with shared trucks, events.json, sparkline, map and replay if built, raw-telemetry score (both counts), "files unchanged" overlay. Reload mock_test after |
| Winstead | Their rule word for word | 20s / 30s / 110s | Isolation terminal and empty WAN port; judge joins Phone 3 as Responder, marks a row in 2 taps, is promoted to Legal, signs, is revoked; card change; clocks; root delete; verifier. Short cut if full beat 3 did not ship |
| Spacetime | Architecture card, then `spacetimedb/` | 60s code / 90s demo | Bad prev_hash rejected, non-member rejected, root delete pushed live; Phone 1 tap updating L1 and `/quest`; measured numbers; public repo |
| Design / general | 90-second run | as written | NEXT card, word plus color, hallway number, beat strip |

### 9.5 Two-person versions (break rotation, 1 to 4pm)

Person A = narrator and driver (L1, then Phone 2, glances at L3). Person B = devices and root (hands Phone 1 and Phone 3, types "Open incident", runs the tamper, runs `demo:reset` on L2 while A runs it on L1, has Phone 1 rescan the attack QR).
- **90 seconds:** A says every line. B hands Phone 1 at 30s, opens the incident during beat 2, runs the root delete at 70s on A's cue ("L3 saw seq [read]. Go.").
- **Winstead:** A reads the rule, drives `/box`, holds Phone 2. B hands Phone 3, coaches the QR or typed code, runs the root delete.

### 9.6 Station setup at the judging table

```
 [ OPS SIDE: "OPS (COMPROMISED)" ]            [ DARKROOM: "DARKROOM BOX" ]              [ VERIFIER ]
  Banner line card above L1                    L2 /box + failing ping/nslookup loop     L3: npx tsx verify.mjs --watch (1 s)
  L1 facing judges: /console + side-by-side    Router "WAN: EMPTY", admin page on phone backup video ready
  Phone 1 on an improvised stand + charger     Phone 2 (Mohan, power bank), Phone 3 (long cable)
  Quest: 2D /quest, on a wall charger
```

- Extension cord to the outlet; power strips and the USB charger behind the table; chargers labeled.
- DND on every device. Phones auto-lock Never. Phone 3 not pinned, held by a teammate. Laptops never sleep on power, lid close does nothing, Windows Update paused 7 days.
- On the table: team name and table number, Winstead's rule card, the 5 components card, the Devpost/repo QR (printed or on L1's screen). **Not on the table:** any join QR, the Wi-Fi QR or passphrase.
- At least 2 people at the table from 1 to 4pm.
- **Between every judge:** `demo:reset` on L1 and L2; Phone 1 rescans the attack QR; mock_test reloaded if an EOG judge loaded `test/`; all phones show `READY` and no red; batteries checked; Yajat checks Discord.

### 9.7 If something breaks (never debug in front of a judge)

| Breaks | Say | Do |
|---|---|---|
| `test/` fails to load | "test/ errored on X; here's the unseen mock set." | Try the folder picker. If it truly errors, load mock_test. Never fake a result. Never patch code. |
| Phone 1 drag rejected | "Same slider, on the console." | Use L1's slider; rescan the attack QR after the judge leaves. |
| Phone 1 can't reach L1 | "Same slider, on the console." | `npm run set-host` after the judge leaves. |
| Quest asleep | "Here's exactly what the headset sees." | Point at L1's side-by-side. |
| Evidence import rejects | "The Commander opens it by hand." | "Open incident" with the facility. |
| Phone 3 camera opens the wrong app | "You can also type the code." | Judge types the 10-character code. |
| Phones drop off DARKROOM | "The phones are a convenience; the box is the system." | Run beat 3 on L2's screen. |
| Rollback banner doesn't appear | "The live check is the warning; the proof is the verifier." | `npx tsx verify.mjs --witness witness.json --host <L2 IP>` on L3. |
| Tamper says fewer than 4 entries | "Let me open the incident first." | Open incident, then tamper. |
| Spacetime down | "Here's the recording." | Play the segment; `demo:boot` after the judge leaves. |
| Staff ask us to turn off DARKROOM | "The venue asked us to turn off our router; here's beat 3 on one screen." | One-laptop fallback, said plainly. |
| Everything | "Let me show you the 60-second cut." | Play it and narrate. |

---

## 10. Judge Q&A

Only claim what is built and tested at that moment. Replace bracketed numbers with the app's output.

1. **(EOG) "Here's test/. Anything hardcoded?"** Load it live. "The loader reads network.json, ops.json and telemetry.csv. 'Now' is the last ts_unix. Offsets, noise and the physics threshold are learned from the data. We also built a fake unseen network with renamed systems, shifted pressures, new prices and a new truck size, and the output follows the files. answer_key.json is only read by our offline scorer."
2. **(EOG) "Is the overlay hardcoding?"** "No. The attack touches only the live tank panel, labeled 'simulated attack, overlay only, files unchanged'. Alerts and plans always read your files."
3. **(EOG) "Is the plan optimal?"** "We try every truck count and trip count, and compute the latest safe shut-in times exactly, against doing nothing. A brute-force check on 1,400 random single-failure cases found nothing cheaper; every truck does the same number of trips. From raw telemetry, [N of 7] snapshot plans match your keys with the shut-in start within a minute, and [M of 7] are exact. The misses are 1 to 3 minutes off, from sensor noise." Never say "guaranteed".
4. **(EOG) "Leak vs worn pump?"** "A leak: the far end gets less water than the pump sends, and pipeline pressure drops. A worn pump: it moves less than its rated flow and its discharge pressure falls. Both are noise-normalized scores learned from your data."
5. **(EOG) "When did the leak start?"** "We only see it while the pump runs, so we show when we first saw it and the window it could have started in."
6. **(EOG) "Why not show a worn pump that started an hour ago?"** "A slow ramp takes about 3 to 4 hours to separate from noise without false alarms. We chose zero false alarms."
7. **(EOG) "Are your numbers held out?"** "No. We tuned on full_week, and the snapshots are cuts of it. That's why we test on a fake unseen network and run your test folder live."
8. **(theme) "What if the attacker fakes the flow sensors too, or drifts slowly?"** "Then this check misses it. It catches readings that disagree with each other. A drift under about 2 points across the window also gets through. It's a consistency check, not proof."
9. **(Winstead) "I'm root. I delete your last 10 entries."** "Every device stores the highest seq and head it has seen, so a shorter log shows ROLLBACK DETECTED. The verifier polls every second, saved the head before the drill, and prints what was cut. Root can rewrite the log. It cannot make it match the heads our devices already hold. Limit: a device that never saw those entries can't miss them, so the Commander reads the verifier's seq aloud."
10. **(Winstead) "Your checker is JavaScript served by the box I own."** "Right. The in-browser check is the live warning. The proof is verify.mjs from our own checkout on a separate laptop."
11. **(Winstead) "Can anyone sign as Legal?"** "No. The server takes the identity from the connection, checks membership and role, and writes the actor itself. The Commander admitted that person in person, and that admission is in the log." Show `npm run smoke -- --side darkroom --only reject` printing `rejected: not a member`.
12. **(Winstead) "Can a Viewer read counsel's messages?"** "Yes. Legal notes are visible to every member; only Legal can post. We label it that way on screen."
13. **(Winstead) "When did the client determine the breach, who decided, how many people?"** Open the DETERMINATION entry. "521.053 runs from the date the person determines the breach occurred. A responder's tap only creates a possible-obligation card. Only Legal's determination starts the clocks. Once Legal determines a breach, the 212 payroll staff need individual notice. Marking the ledger put us over 250 Texans for the Attorney General, and individual notice would cover everyone in it, up to 4,332 people, again only once Legal determines a breach."
14. **(Winstead) "What about the New Mexicans?"** "Texas (b) covers them too. (b-1) lets us use New Mexico's law for them instead. Counsel picks."
15. **(Winstead) "Phones are on Wi-Fi. How is that isolated?"** "Wi-Fi only gets you to the box. Membership needs a one-time code the Commander issues in person, valid 60 seconds and once, and every add and removal is logged. The box's default route points at our own router, and that router's WAN port is empty: you can see ping to 1.1.1.1 and DNS failing in that terminal. We can't stop radio jamming; the box's screen and an exported log still work. A real deployment would use per-device credentials."
16. **(Winstead) "Where does the box's input come from?"** "No network path. The only input is a short reference a person types in, which we treat as untrusted: fixed schema, text only, and we log its hash."
17. **(Winstead) "Is the chat privileged?"** "We can't promise that. The team channel says 'not privileged'. The privilege label appears only in Legal notes after counsel is engaged. Whether privilege applies is counsel's call."
18. **(Winstead) "Does GDPR apply to a Texas operator?"** "Only through an EU office, or by offering services to or monitoring people in the EU. The EU rows belong to the Netherlands affiliate, the clock runs from awareness, and it says 'where feasible' and 'if GDPR applies'. Texas law can reach those staff too if their data was acquired; today they're marked accessed, so Legal decides."
19. **(Spacetime) "What disappears if I delete Spacetime?"** Point at the module (list in 3.3). "Root tampering is caught by the clients and the verifier, not by Spacetime. Spacetime's subscriptions are why every phone flips at once." If the engine stayed in the browser: "Alerts are computed in the browser and published through a reducer so every device shares them."
20. **(Spacetime) "Why self-hosted?"** "The box is isolated by design. It can't reach Maincloud, and shouldn't."
21. **(Spacetime) "What's your latency?"** "On localhost, a row one client appended reached a second client in a median of 1.5 ms. Over our phone network, the round trip was [measured /rtt median] ms."
22. **(general) "What did you build this weekend, and did AI write it?"** "All project code is from after noon Saturday; git log shows it. Our first commit is large because it's the Next.js scaffold plus the lock file. Our Python prototypes are in the repo too. Some ideas come from Yajat's earlier research, no code reused. We used AI coding agents heavily and disclosed it. We specified the tests and checked every answer against EOG's keys, and each of us can walk you through our part."
23. **(Design) "Who uses this, and why a headset?"** "Night-shift operators at produced-water sites, and incident-response teams. The headset is for someone walking the site. Everything works on a laptop or phone. The market fit is a hypothesis."

**Phrases to use:** "tamper-evident"; "integrity, not authenticity"; "isolated, no uplink"; "no network path; the only input is a reference a person carries across, which we treat as untrusted"; "suspected vs confirmed"; "Legal must determine"; "the determination date starts the Texas clock (§521.053)"; "as soon as practicable, and no later than 30 days"; "awareness starts the GDPR clock, where feasible, if GDPR applies"; "250 or more Texans for the Attorney General, if Legal determines a breach"; "organized by NIST SP 800-61r3 / CSF 2.0 functions"; "what you'd hand the Attorney General"; "who knew what, and when"; "demo rules, not legal advice"; "the isolation protects the box, not the truth of the data"; "triage data, not a forensic image"; "we're not lawyers; we built this so lawyers can decide faster"; "cheapest plan we found, scored against your answer keys"; "data time"; "shuts in at"; "overlay only, files unchanged"; "the default route points at our router, whose WAN port is empty".

**Never say:** "tamper-proof", "unhackable", "can't be hacked", "100% secure", "military-grade"; "can't rewrite history" or "can't be rewritten"; "blockchain"; "air-gapped"; "no default route" or "no route" (unless the static-IP upgrade was tested); "compliant", "keeps you compliant"; "automatically notifies the AG", "AI writes your breach notice"; "the clock starts when the responder clicks"; "the AG notice is triggered" before a determination; "Texas requires notice within 72 hours"; "you have 60 days" or "you have 30 days"; "30 days from discovery" as the statute's words; "only Texans need notice"; "Texas law doesn't cover the EU staff"; "this chat is privileged"; "Legal-only channel"; "at the direction of counsel" outside Legal notes; "the hash proves the evidence is true"; "forensically sound"; "no data was taken"; "encrypted means safe"; "EOG was breached" or any real company as victim; "HIPAA/SEC ready"; "zero-trust"; any case citation from memory; "guaranteed optimal"; "AI predicts"; "spill"; "the hacker can't reach it" (say "no network path"); "within milliseconds" over Wi-Fi; "GPT Astra" unless it is a real product name.

---

## 11. Devpost and video plan

**Devpost** (all text is a DRAFT; Mohan approves after /humanizer; README prose follows the same rule before 10:30am).
- **9:50pm placeholder:** title, banner line, tracks, 3 members, placeholder screenshot. Full draft started 10:45pm, edited after G-E2E.
- Title: Darkroom: Avon.
- Tagline (draft): "Catches hackers faking oilfield sensors, then runs the breach response offline."
- Required: description, public repo (we stop pushing at 11:30am), tracks, video (2:00 max), all 3 members.
- Tracks: EOG, Winstead, Spacetime (unless the sponsor said no; then NMC² if Mohan chooses), Design. Beginner is automatic.
- Sections:
  1. The night in Avon (banner line first).
  2. What it does (the three beats).
  3. EOG: their 6 bullets as subheads; score table, raw-telemetry table with both counts, fake_test result, in-sample caveat, the $905 / $1,958 / $5,016 example labeled "practice data"; "try it" link only if it opens logged out.
  4. Winstead: one paragraph per component; Security (incl. the honest isolation proof); Ease of use (both hallway numbers); Creativity.
  5. Spacetime: repo link, `spacetimedb/`, diagram, why self-hosted, measured numbers (1.5 ms labeled localhost one-way; the /rtt round trip over Wi-Fi).
  6. Design (Devpost general Design criterion): contrast ratios, word plus color plus icon, touch sizes, layout, user journey under stress.
  7. Beginner: "All three of us are first-time hackers," plus one learning per person.
  8. How we built it (stack, Built-with tags, prototypes in the repo).
  9. Challenges, accomplishments, what we learned, what's next.
  10. Honest limits: tamper-evident, not tamper-proof; consistency-check and drift limits; Legal notes visibility; demo legal rules; worn pumps need about 3 to 4 hours to show.
  11. Built this weekend, AI use disclosed, "ideas from earlier projects (no code reused)".
  12. 6 images: `/console` top-alert card (thumbnail); options table; reported vs physics; scope board with obligation card; 3 screens showing ROLLBACK DETECTED plus verifier output; architecture diagram.

**Video (max 2:00, target 1:55; skits allowed)**

| Time | Shot |
|---|---|
| 0:00-0:08 | Skit: dark room, phone buzzes. "A hacker fakes a tank sensor. Physics catches the lie." |
| 0:08-0:30 | L1: load folder, top alert, countdown, plan, cost vs do nothing |
| 0:30-0:42 | Options table close-up; Hard case shared trucks (map or replay if built) |
| 0:42-1:02 | Hand drags the slider; side-by-side; 3 s Quest clip (or `/quest` in a laptop browser); full-screen banner |
| 1:02-1:17 | Empty WAN port and failing ping terminal, scope board, the 2-tap ledger mark, phone scanning the join QR |
| 1:17-1:29 | Phone 3 signs; obligation card and clocks; a chat line. Voiceover: "Now that Legal has determined it, the Attorney General must hear as soon as practicable, and no later than 30 days after this determination." |
| 1:29-1:44 | Wide shot: root delete, all screens ROLLBACK DETECTED, verifier output |
| 1:44-1:52 | Architecture card (Spacetime in the middle only if entered) |
| 1:52-1:55 | Title card: Darkroom: Avon, 3 names, repo URL |

- **Versions:** v0 recorded 7:50 to 8:00pm on L1 by Yajat (raw, backup only); v1 takes during G-E2E (11:05 to 11:35pm), edited by 12:00am (the short cut); final takes at 8:00am, edited 8:30 to 9:10am on L2, Unlisted by 9:30am. **If the short cut is the final demo:** drop the ledger mark and the join-QR scan from 1:02-1:17, drop the 1:17-1:29 shot, and extend the tamper shot.
- Record each beat as its own take (Windows Game Bar and Clipchamp probably suffice, PARTIAL; Clipchamp may need internet, UNVERIFIED).
- Check from a logged-out phone. MP4 on 2 laptops and 1 phone. A 60-second cut for the table.

---

## 12. Risks (top 26)

L / I = likelihood / impact (H, M, L).

| # | Risk | L / I | Prevention | 30-second recovery |
|---|---|---|---|---|
| 1 | Phones or the Quest can't reach the laptops | H / H | Native L1 and L2 with admin; CP1 with written commands; firewall + Private profile on hotspot/DARKROOM | Run beat 3 on L2's screen; slider on L1 |
| 2 | No isolated network device, or the venue bans routers | M / H | Ask first on the walk; decision 7:40; driver leaves 7:45 | Android hotspot on Phone 2 (data off, hotspot on); one-laptop fallback |
| 3 | QR codes encode localhost or a stale IP | H / H | `public_host` from `demo:boot`; test; `set-host` after any change | Type the URL or code |
| 4 | Physics never catches the flat fake (prototype re-anchor and clamp bugs, VERIFIED) | H / H if unfixed | Free-running physics clamped at shutdown; latch tests | Drag the slider far |
| 5 | Verifier prints LOG VERIFIED after a tail delete (VERIFIED in chain.ts) | H / H if unfixed | `--watch` at 1 s; smoke asserts non-zero exit; seq read aloud | Point at the phones' banners |
| 6 | Reset breaks the next judge (nothing to delete, stale attack code, refused reset) | H / H | Decision 10 (open logs 7 entries); rescan step; owner-or-Commander reset; reset 3 times per side in the dry run | Open incident by hand; `demo:boot` after the judge leaves |
| 7 | Mohan's lane overloaded and integration slips | H / H | Rules to Sreesh, boot-avon and set-host to Yajat; smoke both from 9:25; soft merge 10:25; written cut order | Ship the short cut (decided once, 1:45am) |
| 8 | Pre-push hook blocks every darkroom push once teammate branches are fetched (VERIFIED) | H / H | Option (b) before part 3; dry-run push; no fetch of teammate branches before it | Stop and tell Mohan; never route around the hook |
| 9 | Prototypes break `tsc` and `next build` (VERIFIED in a scratch copy) | H / H if unfixed | tsconfig exclude + ES2020 in part 1 | `git revert` the prototype commit |
| 10 | Scripts fail on Windows or plain Node | M / H | All scripts through tsx | Run the step by hand from RUNBOOK |
| 11 | Demo built from a feature branch, or dev and demo collide | M / H | Demo worktree on main; dev on 127.0.0.1:3002 and dev databases | Rebuild from the last good tag |
| 12 | EOG data or answer keys committed | L / H | Data at `../eog-data`; `.gitignore` too; scans | `git rm --cached` and push; never force push |
| 13 | Owner token file holds the CLI sentence, not the token | H / H if unfixed | Strip to the last word; scripts take the last word; length check | Re-run the strip command |
| 14 | Code changed after the noon hard stop | M / H | Cutoff 11:30; datasets read at request time | Load mock_test |
| 15 | Quest not set up, no dev mode, or AR fails offline | M / M | Pickup on the walk; CP1 Quest leg non-blocking; R1 capped | 2D `/quest`, then L1 view, then clip |
| 16 | EOG port loses accuracy, or browser and reducer disagree | M / H | Tests first; same `WideRow`; fake_test; NaN guards | Exact pump failures only |
| 17 | Hardcode check passes falsely or fails on noise | M / M | Narrow scanned set, path-only allowlist, self-test, no facts in comments | Read the hit list; fix with Mohan's OK |
| 18 | Engine too slow in a reducer | M / M | Timed at 9:50; no optimizing | `publish_alerts` fallback |
| 19 | Spacetime sponsor says no, or the backend dies at the table | M / H | Sponsor "no" only changes tracks; technical failure decided by 9:00pm | NMC² for slot 3; video segment |
| 20 | Full beat 3 passes CLI smoke but fails on phones | M / H | 12:45 integration merge; 1:20 human run on the tagged build | Short cut |
| 21 | Strangers on venue Wi-Fi reach dev servers | L / H | 127.0.0.1 binding; Public profile | Republish, `demo:boot` |
| 22 | Laptops locked, asleep or stolen overnight | M / H | Plugged in, awake, terminal shown to an awake teammate | Owner unlocks; RUNBOOK |
| 23 | Devpost or repo failures | M / H | Submit 9:50pm; final 11:30am; logged-out checks | Second teammate fixes before noon |
| 24 | Pro quota runs out at a gate | H / M | `/usage`, window plan, one ticket per session | Ticket to Mohan's lane |
| 25 | Minors may not stay overnight | M / H | Ask on the walk; 8.2 | 8.2: safe floor at the venue, gates move to 7 to 9am |
| 26 | Overclaiming security or law (incl. "no default route") | M / H | Banned list; statute-exact text; honest isolation proof | "Let me be precise: that applies only if Legal determines a breach." |

Also watch: devices sleeping or updating; only 2 people at the table (use 9.5); Discord announcements missed (Yajat on Phone 1); the Phone 1 data cap; the hardware desk closing before the return; the EOG README "Terms" lines (a human decides); the 30-minute start slip, absorbed by 11:35pm (do not let it grow).

---

## 13. Checklists

### Tonight (by 9:50pm)
- [ ] Status check done (roles, L1/L2 + admin, git identities, repo access, phone owners and models, Phone 1 data plan, router, driver).
- [ ] Part 1 pushed: `.gitignore`, attribution off, tsconfig exclude + ES2020, dev script on 127.0.0.1:3002; `npm test` + `tsc` passed.
- [ ] Part 2 pushed (prototypes incl. README, `out_full_week.json`, `out_mock_test.json`, `physics_residual.py`, fixtures; no `physics.py`, no CSVs).
- [ ] Pre-push fix (b) in, allowlist written, dry-run push clean; part 3 pushed (agent context, TEAM.md with Mohan's decisions, RUNBOOK with CP1 and token commands).
- [ ] EOG data cloned to `../eog-data` on L1, L2, L3.
- [ ] Walk done: help desk (router, minors, pickup times, food, sleeping room, closing, printer, slots), hardware desk (Quest, charger, dev mode, return deadline, borrowed items), EOG booth, **Spacetime access code collected**, Winstead.
- [ ] Each of us checked our Devpost profile shows no earlier hackathon.
- [ ] Quest set up and charging.
- [ ] Router decided by 7:40; configured by Sreesh; random MAC off for DARKROOM on L2, L3, Phones 2 and 3.
- [ ] Spacetime 2.14.1 on L1, L2 **and L3**; adb on L1.
- [ ] CP1 screenshots (Phone 1 → L1, Phone 2 → L2; Quest when ready).
- [ ] Contract merged at 8:05 with the units test. Video v0 on 2 devices by 8:00.
- [ ] S2 and EOG-0 outputs at 8:45; decision by 9:00. Owner token files written and checked by length only.
- [ ] Walking skeleton passed (9:30 to 9:45).
- [ ] Devpost placeholder submitted 9:50; all 3 accepted.
- [ ] Dev servers bound to 127.0.0.1 while on venue Wi-Fi.
- [ ] 2 strangers recruited for 11:05pm.

### Before sleep (each person)
- [ ] Branch pushed; handoff block in TEAM.md; test and smoke output pasted if aiming for the 5:45am merge.
- [ ] Laptop plugged in, never-sleep on, Windows Update paused, terminal shown to an awake teammate, PIN told in person only.
- [ ] Devices charging; Phone 3 stays at the table; alarm or wake-up person named.
- [ ] Mohan: main frozen at 1:45; decision written (smoke + phone run results).
- [ ] Backup video v1 on 2 devices.

### Sunday morning
- [ ] 5:45 merge, 6:00 freeze, tag.
- [ ] 7:00 dry run in the ranked order (cold boot, reset 3 times, 2-person timing first).
- [ ] 8:00 EOG run on fake_test; final takes recorded.
- [ ] Final video edited on L2, Unlisted by 9:30 (L3 upload backup); MP4 on 2 laptops and 1 phone.
- [ ] 9:15 passphrase changed, every device re-joined; 9:20 hallway test 2 recorded.
- [ ] Banned-phrase sweep; README prose approved.
- [ ] 10:00 secret scan (paths only, expected hits known); pre-push check prints nothing.
- [ ] 10:30 repo public; links checked logged out.
- [ ] 11:00 `good-1100`; demo worktrees on it.
- [ ] 11:30 final submit; screenshot; no more commits.
- [ ] `test/` pulled into `../eog-data` on L1 and L3; visible in the dropdown; `physics_residual.py` margin by 12:50 (or skipped).

### At the table (12:00 to 1:00, then between every judge)
- [ ] Extension cord and strips in; router on, WAN empty and labeled; L2 ping/nslookup loop failing on screen.
- [ ] L3 on DARKROOM only, `verify.mjs --watch` printing seq.
- [ ] Phones 2 and 3: mobile data off + DARKROOM, auto-lock Never, DND on; Phone 3 not pinned, messaging hidden, long cable; Phone 2 on its power bank.
- [ ] Phone 1 hotspot on, on its charger, `/attack` open with the **current** code (rescanned); L1 on the hotspot; `set-host` run.
- [ ] Quest at 100%, 2D `/quest`, wall charger.
- [ ] mock_test loaded for general judges; `test/` in the dropdown for EOG judges.
- [ ] No join QR or Wi-Fi QR on the table.
- [ ] Yajat checks Discord on Phone 1. Badges on. 2 people at the table.
- [ ] Between judges: `demo:reset` on L1 and L2, rescan the attack QR, reload mock_test after an EOG run, phones show `READY`, batteries checked.

---

## 14. Open questions

| Question | Who resolves | By when |
|---|---|---|
| Spacetime Q1 and Q3 explicit answers; **access code collected**; Q2, Q4 to Q8 | Sreesh (walk; Discord DM backup) | 9:50pm |
| If the sponsor says no or stays unclear: slot 3 to NMC²? | Mohan | 11:30am Sun |
| Router allowed tonight and at judging | Sreesh (help desk) | ~7:30pm |
| Minors overnight; waiver or chaperone; parents' pickup and drop-off times | Sreesh (help desk) | ~7:30pm |
| Food times, sleeping room, closing ceremony time, printer | Sreesh (help desk) | ~7:30pm |
| Judging slot length, how slots are picked, which room | Sreesh (help desk) | ~7:30pm |
| Earlier hackathons on any of our Devpost profiles | all 3 | 9:50pm |
| Quest: dev mode, account owner, charger included, return deadline (Quest and borrowed items) | Sreesh (hardware desk) | 7:45pm |
| Laptop OS and admin; L1/L2; git identities; phone owners and models; Phone 1 data plan and cap | all 3 | 7:20pm |
| Does anyone own a router? Who can drive? Stock | all 3 / driver or Mohan | 7:40pm |
| Lane reading; /checkpoint per merge window; one-feature-per-session plan; CUTS.md rule | Mohan (written in TEAM.md) | 8:05pm |
| Pre-push option (b) and the toolbox CLAUDE.md line | Mohan | 8:00pm |
| New dependencies (spacetimedb@2.14.1, typescript, QR generator) | Mohan | 8:05pm |
| Windows Spacetime installer command | Mohan's read-only agent | 7:20pm |
| Windows owner-token PowerShell command works as written | L1 and L2 owners | 8:45pm |
| EOG README "Terms" lines and EOG CLAUDE.md: Mohan's decision (booth answer from Sreesh) | Mohan | 8:05pm |
| EOG booth: mixed trip counts; tolerance; overlay as hardcoding; already-shut-in tanks; onset scoring; who judges | Sreesh (walk) | 8:00pm |
| Per-sender views in 2.14.1 TypeScript (attack code) (PARTIAL) | Mohan (read-only agent) | 8:05pm; fallback by 9:00pm |
| Does `git push --dry-run` run the pre-push hook here (PARTIAL) | Mohan (observe at the dry run) | 8:00pm |
| Does L1 have Python for `plan_now.py` | Yajat (G0) | 7:40pm |
| Winstead: who judges; "what would make you pick a winner?" | Sreesh (walk) | 9:00pm |
| Does "Avon Basin Operating Co." match a real entity? | Sreesh | 9:00pm |
| Statutory AG date only, or also the "discovery" date? | Mohan + Sreesh | 10:45pm |
| Is "GPT Astra" a real product name (only matters for Devpost wording)? | Mohan | 10:00am Sun |
| Does `test/` use different offsets, noise or ops numbers? | Yajat | Sun 12:50pm |
| Browser parse time for a test/-sized file on L1 | Yajat | 1:00am |
| Spacetime round trip over Wi-Fi to phones | Mohan | 8:45pm (S2) |
| `finish_ingest` run time inside the reducer | Mohan + Yajat | 9:50pm |
| L2 isolation loop command works; optional static-IP no-gateway test | Sreesh | join test |
| Vercel project and Deployment Protection | Mohan | 10:00am Sun |
| CLAUDE.md placeholders (demo target, tracks, one test, smoke command, dev port 3002) | Mohan | 8:05pm |
