Task: test the merged demo on L1 now (no code changes)

Context: Avon (repo yajatp/hackutd26v2). This is a test run, not a build. Use a checkout at the newest `origin/mohan/live` with a clean `git status`. If your other session (the `/spacetime` task) is editing `avon/`, make a separate one:
```bash
git fetch origin
git worktree add ../avon-test -b yajat/l1-test-2 origin/mohan/live
cd ../avon-test && npm ci
```
Only one `npm run demo` can own ports 3000 and 3001, so stop any other one first.
Yajat does the taps and wears the headset. You run the commands, watch the screens, time things and write everything down. When something fails, do not fix it: record the exact command, output and screen text, then move on.

A. Cold boot: `npm run demo`. Record the seconds to READY and the LAN address it prints.

B. The judge-as-operator flow, three times. The judge plays the night-shift operator on `/console`.
1. On L1's browser, open `http://localhost:3000/console` with the `mock_test_2026-10-10T1530` site. Check the top card: S5 Facility C, "Call 1 truck now, 1 trip", $905, trips in 2h 03m. Press **Confirm this plan**. It must read "✓ CONFIRMED by the night shift at <time>".
2. A teammate's real phone on the same hotspot opens `http://<LAN IP>:3000/attack`, picks the S5 Facility C tank and taps **Fake**. Time from tap to the console changing. The console must show "Sensors to check" with LYING and SIMULATED, and the top card must say "CONFIRMED, THEN CHANGED".
3. Press **Open an incident in the Darkroom**. Write down the AV-XXXX-XXXX reference.
4. On the phone tap **Clear all**. The console goes back to the confirmed card.
5. `npm run demo:reset`. Record the seconds to READY.
Also run `npm run smoke` once and paste the last 20 lines.

C. The Quest 3S (the VR view `/twin` and its station page `/vr` are on mohan/live now; pull first). This is the important unknown, so test it even if B has problems.
Route 0, the hosted copy (try this first; it needs only internet, not the laptop): in the Quest Browser open `https://avon-hackutd26.vercel.app/vr`. It should say Live data and This browser can enter VR. Press Open the model, then Enter VR, and run the in-VR checks below. Phone 1 for it is `https://avon-hackutd26.vercel.app/attack` on any phone with internet. Record whether it worked, then also try A or B so we know the laptop route too.
Route A, no cable and no developer mode (try first):
1. Put the Quest on the same hotspot as L1.
2. In the Quest Browser, open `chrome://flags`, search for "insecure" and set **Insecure origins treated as secure** to Enabled. In its text box enter `http://<LAN IP>:3000`, then relaunch the browser.
3. Open `http://<LAN IP>:3000/vr`. Record the "Before you hand it over" lines; we want "Live data" and "This browser can enter VR". If it says "No VR on this address", the flag did not take: go to Route B.
4. Press **Open the model**, then **Enter VR**.
Route B, cable and developer mode (if A fails):
- turn on developer mode in the Meta Horizon app and restart the headset;
- run `brew install android-platform-tools`;
- connect USB-C, then in the headset press Allow;
- run `npm run quest -- --watch` on L1 and paste its output;
- in the headset, `/vr` should say it can enter VR. Then press Open the model, then Enter VR.
In VR, record pass or fail and what you saw for each of these:
- the How to use card ahead, the table below it, and S5 Facility C red with its panel on the right;
- trigger (or pinch) on a tank opens its panel;
- the thumbstick turns the table 30 degrees per push, and Reset view puts it back;
- a teammate taps Fake on S5 Facility C on Phone 1, and within a few seconds the tank reads LYING · SIMULATED in the headset (then Clear all);
- someone new to VR, told only "Point at a tank and pull the trigger", knows what to do.

Write the results to `docs/test-L1-<HHMM>.md`:
- one table for B (run, confirm OK, tap to console change in seconds, AV- ref, reset seconds, problems);
- the smoke tail;
- C, step by step, with what the headset showed (a photo of the headset view is welcome).
Commit only that file on `yajat/l1-test-2` with your own git identity. Use no AI-credit lines and keep the word "Claude" out of the message. Push only that branch, never to main or mohan/live, never force push. Tell Mohan the C result the moment you have it (which route worked): it decides whether anyone needs developer mode.
