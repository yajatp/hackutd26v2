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

C. Quest 3S without a cable or developer mode. This is the important unknown, so test it even if B has problems.
1. Put the Quest on the same hotspot as L1.
2. In the Quest Browser, open `chrome://flags`, search for "insecure" and set **Insecure origins treated as secure** to Enabled. In its text box enter `http://<LAN IP>:3000`, then relaunch the browser.
3. Open `http://<LAN IP>:3000/xr`. Record what it says (we want "immersive-ar supported"), then press **Enter AR** and say whether a session starts.
4. Also open `http://<LAN IP>:3000/console` in the Quest Browser and record whether the status chip says LIVE.
If developer mode is already on, also test the cable route:
- run `adb devices`, then `adb reverse tcp:3000 tcp:3000` and `adb reverse tcp:3001 tcp:3001`;
- open `http://localhost:3000/xr` in the Quest Browser;
- record the same things as in step 3.

Write the results to `docs/test-L1-<HHMM>.md`:
- one table for B (run, confirm OK, tap to console change in seconds, AV- ref, reset seconds, problems);
- the smoke tail;
- C, step by step, with what the headset showed (a photo of the headset view is welcome).
Commit only that file on `yajat/l1-test-2` with your own git identity. Use no AI-credit lines and keep the word "Claude" out of the message. Push only that branch, never to main or mohan/live, never force push. Tell Mohan the C result the moment you have it: it decides whether anyone needs developer mode.
