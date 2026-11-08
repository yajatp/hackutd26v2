# Avon: team plan

Sat 7:20pm to Sun 5pm (CT). Agents write the code; our limits are clock time and a demo that never breaks. These times replace the full plan's; its verified technical decisions hold. Devpost title: **Avon**. "The Darkroom" is the breach room, named in beat 3 only.

## 0. NARROWED PLAN (Sat ~8:15pm). This section wins over anything below that disagrees.

Why: ChatGPT and Gemini, acting as harsh judges, both said the same thing. The idea is strong, but we show too much. Judges get 3 minutes and see 25+ tables. If they can't explain our project back to a friend, we lose. So we narrow.

### What a judge must understand (and nothing else)

**The 5-second version:** "Avon tells oil-field night crews what's broken, what it costs to fix, and which sensors are lying."

**The 15-second version:** "EOG told us every site uses different tools, and they only find out a sensor died when its data stops. Avon reads any site's data, finds the problem, plans the cheapest fix, checks every tank level against physics and every sensor for silence. If a sensor might be hacked, the evidence goes to a sealed room that proves nobody edited the record."

Three ideas, in this order. Everything else is optional.
1. **What's broken and the cheapest fix** (EOG). The hero.
2. **Which sensors to trust** (dead, drifting, lying). The twist.
3. **A record nobody can secretly edit** (Darkroom). The ending.

### The default demo: 90 seconds, one laptop, the judge works the shift

(Changed Sun 00:15, Mohan: the judge plays the night-shift operator, not the hacker.) The judge drives Laptop 1 (/console) as the person on shift. A teammate holds Phone 1 (/attack) out of the judge's view and plays the bad night. Laptop 2 (the Darkroom) sits next to Laptop 1.

| Time | What happens | Who |
|---|---|---|
| 0:00-0:15 | "You're on the night shift for EOG. An engineer told us she only finds out a sensor died when its data stops, and every site runs different software." | Mohan |
| 0:15-0:45 | The judge reads the top card: what broke, when the tank shuts in, the cheapest fix and **why the other options lose**. The judge presses **Confirm** on it. | Judge, Mohan narrates |
| 0:45-1:10 | Out of view, a teammate taps **Fake** on Phone 1. The console puts **LYING · SIMULATED** on top: "Physics says +9.4 pts/h. Sensor says 0." The plan for that tank changed because of the bad reading. The judge decides not to trust it. | Sreesh (Phone 1), judge |
| 1:10-1:30 | The judge presses **Open an incident in the Darkroom**, walks the AV- reference to Laptop 2 and types it in. A teammate deletes log entries as root: **ROLLBACK DETECTED** on Laptop 2 and on the witness phone. "Nobody can quietly rewrite what happened." | Judge, Sreesh, Mohan |

Close: "One view for every site, the cheapest fix, and you know which sensors to trust."

### 30-second add-ons, only when that judge asks
- **EOG:** load the `test/` folder live, then the events table. "Everything comes from your three files."
- **Winstead:** show the threat model card (below), add a member by code, mark one scope row EXFILTRATED.
- **Spacetime:** stop Spacetime and every screen says Disconnected. Show the reducers in `spacetimedb/src`. Explain the two databases (below).
- **Design:** "A stranger found the next action in [N] seconds with no help."
- **Quest:** only if a judge wants to try it, and only if it's already working. Never part of the main demo.

### The fix card (make the optimizer inspectable)
Never show only "Cheapest: $905". Show:
- The plan: trucks, trips each, when the first truck arrives, when the tank would have tripped.
- Total cost.
- The alternatives and their costs: shut in which wells from when; do nothing.
- One line on why each alternative loses (for example, "Do nothing: wells shut in 04:49 to 06:20, $5,016").
- If our time is a minute or two off because of sensor noise, say so plainly: "same decision, start time within 3 minutes."

### Sensor health: show evidence, not a mystery number
- Drop the 0-100 trust score from the main screen. Show the evidence instead: "Physics says +9.1 pts/h. Sensor says 0. Off for 30 min."
- DEAD: "No reading for 10 min. Last value 61%."
- DRIFTING: "Off from physics by 0.9 pts/h, growing."
- Show "0 false alarms on clean data (5 folders checked)" once that check passes. Until then, don't claim it.
- Every injected fault carries a **SIMULATED** badge. Their real data has no broken sensors, and we say so.

### Winstead, narrowed
Pitch the Darkroom as **an isolated incident documentation and evidence-integrity room**, not as "a cybersecurity product". Put this threat model card on Laptop 2:

**Protects against**
- An attacker on the company network reading or changing the incident record (the Darkroom is on its own router with nothing plugged into the internet port).
- Someone quietly editing or deleting log entries afterward (fingerprint chain, witness phones, and a separate verifier laptop).
- People writing to the record without being let in (in-person join code; roles checked by the server).

**Does not protect against**
- Someone with physical control of the Darkroom laptop changing what it displays live.
- A compromised phone.
- Proving the original sensor evidence was true. We prove the record wasn't changed after it was written (integrity, not truth).

Words: "isolated local network", "tamper-evident", "integrity, not authenticity". Never: "air-gapped", "tamper-proof", "unhackable", "independently secure".

Darkroom must-haves: open incident, scope board (ENCRYPTED, EXFILTRATED, ACCESSED, SUSPECTED vs CONFIRMED), team chat where every message is a log entry, root delete and ROLLBACK DETECTED, verifier on Laptop 3. Nice-to-haves if time allows: join by code, Legal determination with the Texas clock ("demo rules, not legal advice").

### Spacetime, explained simply
- Two databases on purpose: `avon` (the company side) and `darkroom` (the isolated room). If they shared one database, the isolation would be fake. That's the answer if a judge asks.
- Don't quote the 1.5 ms number as performance; it was on one laptop. Say "every screen updates instantly because they all subscribe to the same live data."

### Quest: optional garnish
- The site twin must also run in a normal browser window, so the demo never depends on the headset.
- Use the Quest only for judges who want to try it, cast to a screen.

### README for judges (3 steps)
1. `npm ci`
2. `spacetime start` (then publish the module; exact command in the README)
3. `npm run demo`, then open http://localhost:3000

### Priority order for the rest of the build
1. EOG console plus the fix card, loading any folder (including a fake second site) with no code change.
2. Sensor health (DEAD, LYING first; DRIFTING after) with evidence text and SIMULATED badges.
3. Darkroom must-haves plus the threat model card.
4. Design polish of the main console: color only when something is wrong, the next action always on top.
5. Then nice-to-haves: join by code, Legal clock, Quest, cross-site feed panel.


## 1. Pitch

**One line:** Avon puts every site's sensors in one view and gives the night shift the cheapest fix. It flags any sensor that goes silent and checks every tank level against physics. When a sensor lies, a person carries the evidence to the Darkroom: a breach room on an isolated laptop with a tamper-evident log.

**Banner (first words of every demo):** "Every site, one view. Dead, drifting or lying, Avon checks."

**30 seconds (Mohan):** "An EOG rep who works in IoT told us: every site runs different tools, and she only finds out a sensor died when its data stops. Avon puts every site in one view; a new format is one adapter file. The night shift sees what broke, when the tank shuts in, and the cheapest fix. Every sensor is watched for silence, and every tank level is checked against physics. A lying sensor may be a hacker, so we carry it to a breach room on an isolated laptop. Avon tells you when you can trust your data. When you can't, the Darkroom is where you respond."

## 2. Tracks and why

- **EOG:** our base. full_week prototype: 23/23 events, 0 false positives; raw telemetry 20/20 same decision, 14/20 exact to the minute (in-sample; PARTIAL until the port matches).
- **Winstead:** a lying sensor is the incident; the box is isolated; all 5 required components always shown.
- **Spacetime:** it is the backend. full_week ingest about 0.5 s; about 1.5 ms one client to another, both on localhost (VERIFIED).
- **Design:** a console for a tired operator at 3am. **Beginner:** automatic (all 3 first-timers).

## 3. What we build

| Screen | Device | Shows |
|---|---|---|
| `/console` | L1 left | Picker with each loaded site's worst state. Alerts in SPEC order: pump failures by hours to limit (ties to higher lost revenue), then leaks and worn pumps (SEND INSPECTOR). Events table: category, asset, onset, end or ONGOING, plan at onset. Options, health strip, feed. Empty state: "No pump failure in progress. Latest: [event], plan at onset [read]." |
| `/console?site=fake_test` | L1 right (own connection) | Site B: health strip and shared feed |
| `/attack` | Phone 1 | Kill, Drift, Fake. Each calls reducer `inject_fault` into an overlay table. `SIMULATED · overlay only · files unchanged` |
| `/quest` | Quest 3S | Site twin |
| `/box`, `/report` | L2 | Open incident, scope, members, status strip; report: CST and UTC timeline, determination, access log |
| `/incident` | Phones 2, 3 | NEXT card, scope, team chat, witness banner |
| `verify.mjs` | L3 | Independent log check |

**Sensor health: one feature, three states**, trust score 0 to 100. A scheduled reducer `tick` replays one 5-minute sample per second per site and writes `sensor_health` for every sensor; the browser computes nothing. DEAD shows in about 2 s, a flat fake is LYING by tick 6, Drift drops trust 10+ points in 10 s.
- **DEAD:** any sensor with no new reading for 2 samples (10 min of data time). A tank at its network.json limit reads SHUT IN.
- **DRIFTING (tank level):** 1-hour physics error above about 0.7 points an hour (1.5 times the worst clean error), under the LYING line. Clean full_week worst: 0.47 points measured at the end of each 1-hour window (the full plan's 30-minute worst is 0.96); calibrate the DRIFTING line per folder. 0 alarms on clean folders: UNVERIFIED.
- **LYING (tank level):** keeps reporting but misses physics by more than max(2.0, 2 x clean max) for 2 ticks, even when flat. LYING wins over DEAD and DRIFTING. Banner `SENSOR DISAGREES WITH PHYSICS`. L1 shows OPEN INCIDENT with an evidence ref; a person types it into the box. On real readings the card says to check the sensor first.
- full_week has no gaps (VERIFIED), so DEAD and DRIFTING are injected and labeled simulated.

**Other rep changes**
- **One view:** any folder with the three EOG files loads with no code change. "Every site keeps its own tools. Avon puts them in one view. Today it reads EOG's three-file format. A new site's format is one adapter file, not a new app."
- **Cross-site feed:** a shared table every console subscribes to. Only the server writes it (tick or `post_feed`), setting seq and hash with `lib/chain.ts`. The chain shows rows were not edited, not who wrote them: feed rows are hints, and the incident record lives in the Darkroom.
- **Cheap sensors:** "Over months, trust by source shows which cheap in-house sensors hold up. These tags are demo labels."
- **Quest, "walk into any site, same view":** a tabletop-scale 3D model of the site in the Quest browser, from network.json lat/lon; tap a sensor for last heartbeat and what to bring. Cast to a screen; printed tank base beside it. Not AR (needs https or adb reverse). No camera recognition.
- **Darkroom seed:** `FICTIONAL COMPANY · SEEDED DATA` watermark.

**3 beats:** (1) two sites, top alert, cheapest fix; (2) the judge breaks sensors on Phone 1; (3) breach room, root delete. **Short cut (the no-join floor; used if full beat 3 misses 1:45am):** phones are read-only witnesses. Open the incident, show the scope board, root delete, then ROLLBACK DETECTED on every screen, then the verifier. No join, chat, clocks or determination. Join, revoke, chat, Legal sign and clocks are layered on top only when they work.

**CUTS.md swaps:** what-if replay out (the 1 s tick stays), DEAD/DRIFTING in. AG checklist out, feed in. Network map and immersive AR out, twin in. Evidence import out, printed prop and casting in.

## 4. How it works

```
OPS (Phone 1 hotspot)                      DARKROOM (own router, WAN empty)
folder -> L1 /console (site A | site B)    L2 /box, Spacetime "darkroom"
 Spacetime "avon":                           members, chat, scope, /report
  ingest > EOG engine > alerts               hash-chained log
  tick (1/s) > physics > health > feed     Phones 2, 3 keep witness copies
Phone 1 fault remote, Quest twin           L3 verify.mjs re-checks the log
   one way: a person types the evidence ref ---> /box
```

- **SpacetimeDB** (2.14.1, self-hosted): a database that runs our server code. A **reducer** changes rows; a **subscription** pushes each change to every screen; a **scheduled reducer** runs on a timer, so silence gets noticed.
- **Physics:** next level = level + water in minus water out. The sensor must agree.
- **Hash chain:** each entry carries the fingerprint of the one before. Each phone keeps the last one it saw (a **witness**), so a cut shows.
- L1 and L2 run native Windows; phones cannot reach WSL2 (VERIFIED).

## 5. Built for you

**EOG** (rep lines are our notes, not exact quotes)
- Rep: every site has different hardware and software. README: "switch between the different folders seamlessly." The judge loads `test/`.
- Rep: she learns a sensor died only when data stops. DEAD flags it 10 minutes after the last heartbeat, with what to bring.
- Rep: sites share good tech, with a lag. The feed takes under a second.
- Rep: EOG likes cheap sensors. Trust by source shows which hold up.
- "No hardcoding", "how optimally": hardcode check, fake network, 4 answer keys.

**Winstead** (5 required components)
1. "Isolated system": own router, WAN empty, ping fails on screen.
2. "Add individuals": 60-second one-time codes (hash stored); Commander, Responder, Legal, Viewer; logged "<name> admitted as Legal by Mohan (in person)".
3. "Incident documentation": status strip `INC-0007 · RESPOND · 3 open tasks`, timeline, `/report` by NIST SP 800-61r3 / CSF 2.0 functions.
4. Scope "locked for ransomware, exfiltrated": those statuses, SUSPECTED vs CONFIRMED.
5. "Real-time communications": one team channel, each message a log entry, `NOT PRIVILEGED · may be discoverable`.

**Spacetime**
- "Majority of your backend": ingest, engine, tick, health, feed, roles, log rules are reducers. Not "an extra chat feature": stop Spacetime and every screen shows Disconnected.
- "Public GitHub repo": public 10:30am Sunday, with a README Spacetime section.

**Design** ("intuitiveness of the user journey"): word plus icon for every status, color only when abnormal, a NEXT card on top, contrast 4.5:1, 48px targets.

## 6. Owners and AI usage

- **Mohan:** Spacetime module and tick shell, contract, chain, `post_feed`, witness, verifier, join, roles, revoke, chat, Legal sign, scripts, README. Only merger. Narrator.
- **Yajat:** EOG engine, `/console`, picker, physics and health in the tick, fault remote, score, hardcode check, fake_test, twin. Drives L1.
- **Sreesh:** the walk, design system, Darkroom screens, `/report`, clocks, feed panel, router, Quest cast, prop, pitch draft (Mohan approves), Devpost, video, hallway tests.

**AI:** Mohan (top-tier Claude Code): one code lane plus read-only agents (not lanes). Yajat and Sreesh (Claude Pro): check `/usage`, Sonnet for routine work, one ticket per session then `/clear`, no subagents, no telemetry.csv in prompts. **Lanes:** max 2 until 8pm, max 3 ever; Sreesh's opens 8:15pm. Only Mohan merges; no force push; pre-push check prints nothing; no AI credit lines.

## 7. Timeline (CT)

| Time | Who | What |
|---|---|---|
| 7:20-7:35 | all | Status check; Yajat makes Mohan repo admin; Yajat adds Sreesh as a collaborator on github.com/yajatp/hackutd26v2; Sreesh accepts |
| 7:35-8:15 | Sreesh | Walk: desks and booths |
| 7:35-8:15 | Mohan | Commits 1-2 (setup, prototypes, fixtures) pushed by about 7:45, hash posted; commit 3, pre-push fix, contract |
| 7:35-9:00 | Yajat | G0 and identity check against the status-check notes; after pulling commits 1-2 (about 7:45), EOG port, tests first (first prompt leaves out TEAM.md and RUNBOOK.md until the 8:05 pull) |
| **8:15** | Mohan | **MW1.** Sreesh's lane opens; reachability checks |
| 8:15-9:00 | Mohan | Skeleton, ingest, tick, health and feed tables, `post_feed` |
| **9:00** | Mohan | **MW2** |
| 9:00-9:50 | Yajat / Sreesh | Physics and health in the tick / scope, next, router |
| **9:50** | Mohan | **MW3**: EOG check |
| 9:50-10:45 | all | Yajat: picker, fault remote, health strip. Mohan: open incident, tamper, verify, smoke. Sreesh: breach screens |
| 10:00 | Sreesh | Devpost placeholder, 3 members |
| **10:45** | Mohan | **MW4.** Devpost draft in before 11:00 |
| 11:05-11:35 | all | End-to-end on real devices, target: the short-cut floor (no join); hallway test 1 |
| 11:35-1:15 | Mohan | Join, roles, revoke, chat, then Legal sign |
| 11:35-1:00 | Yajat | Score, hardcode check, fake_test, trust, a per-folder 'simulated-only health' toggle (must exist before the 6:00am freeze) |
| 11:35-12:45 | Sreesh | clocks, `/report`, beat-3 screens, feed panel |
| **12:45** | Mohan | **MW4c**; 0-alarm check on fake_test |
| 1:00-4:15 | Sreesh / Yajat | Sleeps / site twin |
| **1:15** | Mohan | **MW5**; phone run; reset, boot; **1:45** full beat 3 or short cut (no-join floor plus whatever layers work); sleeps 2:00-5:30 |
| 4:15 | Yajat | Pushes twin with test output; Phone 1 to Sreesh; sleeps to 7:45 |
| 4:15-5:40 | Sreesh | Twin on L1 and Quest (CSS and copy only), cast, print pickup |
| **5:45** | Mohan | **MW6** |
| **6:00** | all | **Feature freeze** |
| 6:00-7:45 | Mohan, Sreesh | Cold boot, reset 3x per side, smoke, every folder |
| 7:45-8:00 | Yajat | EOG run on fake_test |
| 8:00-9:00 | all | Dry run: timed 90 s, 3 min, Winstead, 2-person |
| 9:00-10:00 | all | Record the final 2-minute Devpost video Sunday morning |
| 10:00-10:15 | Sreesh | Passphrase change, rejoin every device; hallway test 2 |
| 10:00-11:00 | Mohan | Secret scan, README, repo public 10:30, good-1100 |
| **11:30** | Sreesh, Mohan | **Final Devpost submit.** Code cutoff |
| 11:30-1:00 | all | Lunch slots, setup, Quest 100% by 12 |
| 11:40-12:00 | Yajat | `test/` check (or when it lands): no crash or NaN, 0 health flags, a plan per pump failure. If flags: simulated-only health on `test/`, said aloud |
| **1:00-4:00** | all 3 | **Judging**; one away at most 10 min |
| 4:00-5:00 | all | Pack, return Quest, closing |

## 8. Demo script

Mohan narrates, holds Phone 2. Yajat drives L1. Sreesh hands devices, opens the incident, runs the root delete. Read numbers off the screen. **Default: the 90-second run, then questions.** 3 minutes if the judge wants more.

- **0:00-0:15 MOHAN:** Banner. "An EOG rep only learns a sensor died when its data stops. And every site runs different tools."
- **0:15-0:50 YAJAT:** "Left is mock_test, right is a second site, fake_test. Shuts in at [read]. Cheapest fix: [read], [$x], against [$y] if we do nothing. On your data: [read health counts]."
- **0:50-1:35 SREESH** hands Phone 1: "You're the bad night." Kill. **MOHAN** (after 2 s): "Dead. Flagged 10 minutes after the last heartbeat at [read], not when someone noticed. Bring [read]." At the cast: "Same site in the headset." Drift: "Trust [read] and falling." Fake: "Water in minus water out says filling. The sensor says flat. It's lying. Site B got it within a second." Sreesh types the ref into `/box`.
- **1:35-2:30 MOHAN:** "A lying sensor can mean someone is inside, so a person carries it here, to its own network." **SREESH:** "Only the tank alert came from your tap; the rest is seeded demo data. Every screen answers: what do I do next. A stranger did the first task in [N] seconds."
- **2:30-2:50 MOHAN:** "L3 saw seq [read]." **SREESH:** "I'm root. Deleting the last three entries." ROLLBACK DETECTED. **MOHAN:** "The verifier shows what was cut."
- **2:50-3:00 MOHAN:** "All of it runs on SpacetimeDB on these laptops. 23 of 23 events on the week we tuned on, [read] on a network we never tuned on. All three of us are first-time hackers."

**90 seconds:** banner (10 s); top alert, both sites (20 s); judge taps Kill then Fake, "Dead, then lying, site B saw it", Sreesh opens the incident (25 s); root delete, L3 cut (25 s); close (10 s).
**60 seconds:** same order, 10/15/15/15/5 s.
**2 people:** the narrator also drives L1; the other hands Phone 1 and runs the delete.

**Leads:** **EOG:** the judge loads `test/`, then the events table. **Winstead (90 s, by number):** (1) ping 1.1.1.1 fails on L2, WAN disconnected; (2) Add member, the judge joins on Phone 3, is promoted; (3) status strip and timeline update; (4) the judge marks the ledger EXFILTRATED, SUSPECTED becomes CONFIRMED; (5) the judge's chat line reaches Phone 2; then root delete, verifier, judge revoked. Legal sign if built ("Demo rules, not legal advice"). **Spacetime:** the judge taps Kill, both windows and the twin change; `spacetimedb/src` (reducers, tick, server-set seq); `spacetime call` with a bad prev_hash, rejected. **Design:** the 90-second run.

## 9. Top judge questions

1. **"Here's test/. Hardcoded?"** Load it. "Everything comes from the three files. answer_key.json is read only by our offline scorer."
2. **"Optimal?"** "We try every truck and trip count and the latest safe shut-ins. Brute force on 1,400 single failures found nothing cheaper. For shared trucks, joint plans match your keys on [N of 7] ongoing failures in the 3 snapshots." Never "guaranteed".
3. **"Dead vs shut in? Did our data have dead sensors?"** "At its limit a tank is flat on purpose: SHUT IN. full_week had no gaps; test/: [read]. Dead and drifting here are simulated."
4. **"Our sites use different software, in different cities."** "One adapter per format. Every console subscribes to one shared Spacetime database; here one server, in the field a hub."
5. **"Slow drift, or every sensor faked?"** "Drift faster than about 0.7 points an hour on full_week shows as DRIFTING; the line is set per folder at 1.5 times its worst clean error. Slower drift, or faked flow sensors too, gets through. It is a consistency check, not proof."
6. **"I'm root. I delete entries."** "Every device kept the last head it saw. Root can rewrite the log, not the heads we hold."
7. **"Who can read it? Can anyone sign as Legal?"** "The Wi-Fi passphrase gates reads. Every write needs membership and the right role, checked on the server; the log shows who admitted whom." Show `rejected: not a member`.
8. **"Did AI write it?"** "Heavily, and disclosed. We decided what every test checks, checked every answer against EOG's keys, and each of us can explain our part."

**Use:** tamper-evident; isolated, no uplink; consistency check; simulated; cheapest plan we found; Legal must determine; integrity, not authenticity.
**Never:** tamper-proof; unhackable; air-gapped; blockchain; guaranteed optimal; AI predicts; spill; "detects every hack"; "recognizes your equipment"; "EOG was breached"; compliant; privileged; automatically notifies the AG; the clock starts when the responder clicks.

## 10. Top risks

| Risk | Fix |
|---|---|
| Phones or Quest can't reach laptops | Native Windows, RUNBOOK CP1, 8:15 check; slider on L1 |
| Mohan's lane overloaded | Cut Legal sign, then clocks (short cut). Join, roles, revoke and chat are never cut first. |
| `site_id` slips | Both windows show one site, and we say so |
| Health flags real data | 0-alarm tests on every folder; 11:40 `test/` check |
| EOG engine too slow in a reducer (UNVERIFIED) | `publish_alerts`: compute in the browser; say so |
| Quest cast fails (needs internet, PARTIAL) | Not working by 6am: twin on L1 only |
| Overclaiming | "Never" list; say "simulated" |

## 11. Hardware

- **L1 (Yajat):** ops console, site A and site B windows, Spacetime "avon".
- **L2 (Sreesh):** the box, Spacetime "darkroom", root delete.
- **L3 (Mohan):** merges, smoke. At judging: DARKROOM only, other adapters off; verify.mjs only reads L2.
- **Phone 1 (Yajat):** ops hotspot, fault remote, Discord.
- **Phone 2 (Mohan):** Commander.
- **Phone 3 (Sreesh):** the judge's phone; stays at the table.
- **Quest 3S:** twin on the Phone 1 hotspot, cast; wall charger between judges.
- **Travel router:** only if allowed; buy only if nobody owns one. Else Phone 2 hosts DARKROOM (Android, data off); an iPhone means a one-laptop simulation, said plainly.
- **AirPods, Beats:** unused.
- **3D printer:** tank base prop; request on Harp tonight (prints until 10am).

## 12. Open questions

| Question | Owner |
|---|---|
| Router allowed? Minors overnight, food, closing, judging slot | Sreesh (help desk) |
| Design plus Beginner both count? Confirm at help desk | Sreesh |
| Quest dev mode, charger, return deadline | Sreesh (hardware) |
| Spacetime code: what it unlocks; does self-hosted plus a public repo qualify | Sreesh (booth) |
| Who judges EOG; can `test/` have gaps? | Sreesh (EOG booth) |
| EOG "Terms" lines, `site_id`, CUTS.md, dependencies | Mohan |
| DRIFTING threshold: 0 alarms on clean folders | Yajat |


---

# Per-person cards

## Mohan: backend, trust core, integration, narrator

**Tonight, in order**
1. **7:20 status check.** Done when: roles agreed, L1/L2 picked (Windows, admin), 3 identities noted, you are repo admin.
2. **Commits 1-3 by 8:05** (push 1-2 by about 7:45 and post the hash for Yajat): setup (ignore EOG data, attribution off, dev on 127.0.0.1:3002); prototypes and fixtures; agent context file, TEAM.md (owners, identities, contract), RUNBOOK.md (G0, CP1). Done when: `npm test && npx tsc --noEmit` pass.
3. **Pre-push fix (b)**, 3-identity allowlist. Done when: after `git fetch`, the check prints nothing.
4. **Contract (lane 1)**, prompt below. **8:15 MW1.**
5. **Skeleton:** ingest, 1 s scheduled tick, `sensor_health` and `feed` tables, `post_feed` (server sets seq and hashes), live hooks. Done when: bad append prints `seq must be head+1`; two tabs post in one second, both land; Spacetime stopped shows Disconnected. **9:00 MW2.**
6. **9:50 MW3** + EOG check. Then open incident, tamper + ROLLBACK DETECTED, `verify.mjs --witness` exits non-zero on a tail cut. Done when: `npm run smoke -- --side darkroom` passes.
7. **10:45 MW4;** approve the humanized Devpost draft. **11:05** end-to-end, target: the short-cut floor (no join).
8. **11:35-1:15** join codes, roles, revoke, team chat (never cut), then Legal sign. Done when: smoke prints `rejected: not a member`.
9. **12:45 MW4c, 1:15 MW5,** phone run, reset and boot, **1:45** Legal sign and clocks in or out. Sleep 2:00-5:30.

**Tomorrow:** 5:45 MW6, 6:00 freeze, 8:00 dry run, 9:00 video, 10:00 scan and README (Spacetime steps, reducer table), 10:30 public, 11:00 good-1100, 11:30 submit. Judging: narrator, Phone 2, L3 on DARKROOM only.

**First prompt (lane 1)**
> Read TEAM.md and RUNBOOK.md. Write lib/types.ts and lib/live.ts. Keep the types in TEAM.md's Contract section, including Role, ScopeRow and ChatMsg (channel 'team' | 'legal'). Add `site_id: string` to WideRow, Tank and Alert. Add `SensorState = 'ok' | 'shut_in' | 'dead' | 'drifting' | 'lying'` and SensorHealth {key (`site_id:asset_id:metric`, primary key), site_id (indexed), asset_id, metric, state, trust 0-100, last_heartbeat_ts, what_to_bring, source_tag?}. Add FeedEntry {site_id (indexed), seq, prev_hash, hash, kind: 'bad_sensor' | 'bad_batch' | 'fix', text, actor, logged_at}; only the server sets seq and hashes. `*_ts` is data seconds, `*_at` wall microseconds; convert bigint once in lib/live.ts. Export useSensorHealth() and useFeed(), on fixtures only under NODE_ENV=test. Add a units test. Done when npm test and npx tsc --noEmit pass; paste the output. No new dependencies. Do not commit.

## Yajat: EOG engine, sensor health, console, site twin

**Tonight, in order**
1. **7:20 status check.** Make Mohan admin on yajatp/hackutd26v2. Add Sreesh as a collaborator on github.com/yajatp/hackutd26v2; Sreesh accepts. L1 and Phone 1 are yours.
2. **G0 on L1:** EOG repo to `../eog-data`, `npm ci`, Spacetime 2.14.1. Check your git identity against the status-check notes (TEAM.md lands at 8:05). Pull Mohan's commits 1-2 (about 7:45, he posts the hash) before your first prompt. Done when: 5 history folders, identity matches, `npm test` passes.
3. **detect.ts and planner.ts, tests first.** Done when (MW3, 9:50): full_week 23 events, 0 false positives; opening scene $905 / $1,958.33 / $5,016.00; 91/91 planner fixtures; snapshot_10-08 and 10-10, with the answer key's onset facts as inputs (fixtures), match `reference_action` on kind, trucks, trips, wells, start minute, cost within $1; 10-10 puts EVENT_21 first; hours to limit within 0.05 h. From raw telemetry, expect the same decision with start times off by up to 3 minutes.
4. **Raw /console on mock_test.** Done when: S5_PUMP_C first (about 2.05 h), then S5_PUMP_B; leaks and worn pumps, events table, empty state.
5. **8:15 reachability:** RUNBOOK CP1 first; Phone 1 opens L1 :3000 and :3001/v1/ping. Screenshots.
6. **9:00-9:50** `lib/rules/physics.ts`, `lib/rules/health.ts` (add to the hardcode scan), `spacetimedb/src/physics_tick.ts`, `inject_fault`, finish_ingest. Done when: 0 DEAD/DRIFTING/LYING on every clean folder; a tank at its network.json limit reads SHUT IN; a flat fake on S5 reads LYING by tick 6, never DEAD; Kill shows DEAD on L1 within 3 s, no browser code computing health.
7. **9:50-10:45** picker, fault remote, health strip, second window. Done when: every folder loads with no restart.
8. **11:35-1:00** score (N of 7), hardcode check prints nothing, fake_test, trust, picker worst state, a per-folder 'simulated-only health' toggle (the `test/` fallback; must exist before the 6:00am freeze).
9. **1:00-4:15 twin.** Done when: both test sites render, colored by state, tap shows heartbeat. Paste test and smoke output in TEAM.md, push yajat/twin, give Sreesh Phone 1 (hotspot on, charging). Sleep to 7:45.

**Tomorrow:** 7:45 EOG run on fake_test, 8:00 dry run, 9:00 video, 11:40 `test/` check. Judging: drive L1, `demo:reset --side avon` between judges.

**First prompt**
> (Run after pulling commits 1-2. Before the 8:05 pull, leave out TEAM.md and RUNBOOK.md.) Read TEAM.md, RUNBOOK.md, prototypes/README.md, prototypes/detect.py and lib/eog/__fixtures__/fixtures.json. Do not open telemetry.csv; columns are timestamp,ts_unix,asset_id,metric,value (5-minute samples). Port detect.py to lib/eog/detect.ts; write lib/eog/detect.test.ts first. Pure TypeScript: no dependencies, clock or Node APIs (it runs in a SpacetimeDB reducer). Data from EOG_DIR (default ../eog-data); data tests print SKIP if missing. Never hardcode offsets, prices or names. Done when npm test shows full_week 23 events, 0 false positives, and npx tsc --noEmit is clean; paste the output. Do not commit.

## Sreesh: experience, Darkroom screens, Quest, story

**Tonight, in order**
1. **7:20 status check.** Accept Yajat's collaborator invite on github.com/yajatp/hackutd26v2. Start the L2 installer.
2. **7:35-8:15 walk.** Help desk: router (text Mohan), minors overnight, food, closing, judging slot, Design plus Beginner. Hardware: Quest, charger, dev mode, return time. Harp: print. EOG: who judges, can `test/` have gaps. Spacetime: code (team chat only), what it unlocks, does self-hosted plus public repo qualify. Done when: answers in TEAM.md.
3. **G0 on L2** (identity matches TEAM.md), **8:15 reachability:** RUNBOOK CP1, Phone 3 opens L2 :3000 and :3001/v1/ping.
4. **8:15 lane: design system.** Done when: status tests pass.
5. **9:00-9:50** scope.ts, next.ts with tests; router if allowed.
6. **9:50-10:45** breach screens with add member and team chat; DARKROOM join test by 10:15. **10:00** Devpost placeholder, all 3 members, screenshot.
7. **10:45** paste the approved draft before 11:00. **11:05** end-to-end (target: the short-cut floor, no join), hallway test 1.
8. **11:35-12:45** clocks.ts, `/report` (status strip, CST and UTC timeline, NIST SP 800-61r3 / CSF 2.0), beat-3 screens, feed panel. Clocks PENDING until Legal signs: §521.053(b) individuals: without unreasonable delay, at most 60 days after determination; (i) AG: as soon as practicable, at most 30 days, if 250+ Texans; GDPR Art. 33: within 72 h of awareness where feasible, if it applies. A responder tap starts nothing. "Demo rules, not legal advice." Push by 12:40; sleep 1:00-4:15.

**Tomorrow:** 4:15-5:40 twin on L1 and Quest (CSS and copy only), cast, print. 8:00 dry run, 9:00 video, 10:00 passphrase and rejoin, hallway test 2, 11:30 submit. Judging: devices, root delete, `demo:reset --side darkroom`.

**First prompt (8:15)**
> Read TEAM.md. Build the design system. app/globals.css tokens: bg #121417, surface #1B1F24, text #E6E8EB, muted #9AA3AD, plus critical, warning, info, ok. lib/status.ts maps every state to {label, token, icon}: sensor OK, SHUT IN, DEAD, DRIFTING, LYING; scope ENCRYPTED (ransomware), EXFILTRATED (copied out), ACCESSED, TAMPERED, CLEAN, UNKNOWN; confidence SUSPECTED (dashed), CONFIRMED (solid); connection LIVE, RECONNECTING; banners ROLLBACK DETECTED, TAMPERING DETECTED, SENSOR DISAGREES WITH PHYSICS, POSSIBLE NOTICE OBLIGATION; chat label NOT PRIVILEGED. components/ui: StatusPill, AlertRow, NextCard. Word plus icon, never color alone (triangle critical, circle warning, square info, check ok). Tabular numbers. Targets 48px. Test: every state has label and icon; every text pair is 4.5:1 or more. Done when npm test and npx tsc --noEmit pass; paste output. No new dependencies. Do not commit.

---

## About this plan
- Built Sat Nov 7 from a 39-agent research and review run (prototypes of the EOG detector, cost optimizer and Spacetime backend), then condensed and reviewed by a 6-person council and a fact and consistency check. The 10 issues that check found are fixed.
- The long reference version (about 24,000 words) is in the team vault: 05 Build/FULL PLAN (reference, verified).md.
