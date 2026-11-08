Two jobs for Avon, no code edits. Setup, once: `git clone https://github.com/yajatp/hackutd26v2.git avon && git clone https://github.com/nihaal419/HackUTD-ZeroDay eog-data && cd avon && git switch --detach origin/mohan/live`. Work inside avon/ (the repo root has app/, lib/, docs/).

Read first: docs/PLAN.md section 0 (lines 5-92). Words to use: "isolated local network", "tamper-evident", "integrity, not authenticity", "simulated". Never: "air-gapped", "tamper-proof", "unhackable", "independently secure".

JOB 1: UI audit (Sreesh's Fix 7), report only.
Run `npm ci && npm run dev` and open http://localhost:3000/console, then click each folder button (mock_test_2026-10-10T1530 first). /box and /witness (the Darkroom screens) land on mohan/live later tonight; when Mohan says they are there, `git fetch origin && git switch --detach origin/mohan/live` again and audit them the same way.
Report, per screen, at most 8 issues ranked by how much they would confuse a judge in a 90-second demo:
- what a first-time user sees first, and whether the next action is the most visible thing
- status shown by color only (it must also be in words)
- jargon a judge would not know
- text too small at 1366x768 or on a phone (360 px wide) for /witness
- inconsistent names, labels or styles between /console and /box
For each: screen, exact element text, what is wrong, a one-line fix. Do not edit files; other agents own them tonight.

JOB 2: demo run sheet (Sreesh's Fix 10), text only.
Write the 90-second demo as a table: time, who (Mohan, Yajat, Sreesh, the judge), what they say in at most 15 words, what is on which screen. Follow PLAN.md section 0's table. Then the 5 most likely judge questions with a 2-sentence answer each, and the one sentence we say if something breaks live.
Mark anything that depends on a feature you could not see working as [NOT SEEN WORKING].

Send both back as text to Mohan. Do not commit anything.
