Make the Avon side boot on THIS laptop from a clean start, and get a phone on the same hotspot to use it. At judging this laptop (L1) runs the EOG console and Phone 1's remote. It has never been booted here; that is the biggest risk left. Work in avon/.

Setup:
  git fetch origin
  git switch -c yajat/boot origin/main
  npm ci
Read first: docs/PLAN.md section 0 (lines 5-92), PROMPTS/README.md, scripts/ingest.mjs (top comment), package.json scripts st:*.

How Avon runs (already built, do not redesign it):
- SpacetimeDB 2.14.1 (self-hosted) is the backend. Database "avon" = module in spacetimedb/. The EOG engine runs inside its finish_ingest reducer.
- `npm run dev` serves the pages. /console shows the alerts; /attack is Phone 1's remote (Kill / Fake / Drift).
- Both pages connect to ws://<the hostname in the browser>:3001, so a phone that opens http://<laptop LAN IP>:3000 talks to SpacetimeDB on the laptop's port 3001.

SAFETY: the spacetime CLI's DEFAULT server is maincloud (public cloud). Never publish, call or sql against it. Always pass `-s http://127.0.0.1:3001` (or a server nickname that points there). Never run `spacetime login`. Never print a token. Never use --delete-data except on a database you just created yourself.

Task:
1. Install the SpacetimeDB CLI if missing and pin 2.14.1 (`spacetime --version` must say 2.14.1). Note the exact commands you used for this OS.
2. Boot in this order and write down what each step printed and how long it took:
   a. spacetime start --listen-addr 0.0.0.0:3001   (0.0.0.0 so phones can reach it; leave it running)
   b. spacetime publish -s http://127.0.0.1:3001 --module-path spacetimedb -y avon
   c. clone EOG's data next to the repo if it is not there: git clone https://github.com/nihaal419/HackUTD-ZeroDay ../eog-data
      then: npm run st:ingest -- ../eog-data/history/mock_test_2026-10-10T1530
   d. npm run dev   (Next listens on all interfaces; note the "Network:" URL it prints)
3. On this laptop open http://localhost:3000/console. Expected: S5 · FACILITY C at the top, "trips in 2h 03m", "Do this: Call 1 truck now, 1 trip", $905. Open /attack: it must say LIVE and list 15 tanks.
4. Phone test (hotspot or the same Wi-Fi): on a phone open http://<laptop LAN IP>:3000/attack and /console. Fix what blocks it (OS firewall rules for ports 3000 and 3001 on the private network profile, etc.). Expected: tapping Fake on S5 · Facility C tank shows "LYING ... SIMULATED" on the laptop's /console within a few seconds. Then tap Clear all.
5. Turn what worked into one command: scripts/boot-avon.mjs (Node, standard library only, cross-platform). It starts SpacetimeDB on 0.0.0.0:3001 if nothing listens there, publishes avon WITHOUT --delete-data, ingests a folder you pass (default mock_test), starts `npm run dev`, and prints the laptop's LAN IP and the two phone URLs. Add "demo:avon": "node scripts/boot-avon.mjs" to package.json scripts. Also write docs/RUNBOOK-L1.md: the exact steps and commands for this OS, the firewall steps, and what to do if the phone shows DISCONNECTED.
6. Cold boot test: close everything (stop SpacetimeDB and the dev server), run `npm run demo:avon` once, and repeat step 3 and 4. Do it 2 times in a row.

Rules: only create scripts/boot-avon.mjs and docs/RUNBOOK-L1.md, and only add the one demo:avon line to package.json. Do not edit any other file (others are working on them). No new npm dependencies. Commit on yajat/boot with your own git identity and push only that branch: git push origin yajat/boot. Never push to main or mohan/live, never force push.
Done when: steps 3, 4 and 6 worked; reply with the OS, the boot timings, the phone result (what you tapped, what the laptop showed), and anything that did not work.
