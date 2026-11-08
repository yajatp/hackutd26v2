Task: one command that gets the Quest 3S onto the demo: `scripts/quest.mjs`

Context: Avon (repo yajatp/hackutd26v2). Make a branch `yajat/quest` from `origin/mohan/live`. The judge's VR view is `/twin` in the Quest Browser, with a station page at `/vr`. Browsers allow immersive VR only on https or `localhost`. So the Quest reaches the laptop over USB with `adb reverse`, which makes the headset's `localhost:3000` (the web app) and `localhost:3001` (SpacetimeDB) point at the laptop. The reverse resets whenever the cable comes out or the headset restarts, which will happen on judging day. L1 is a Mac (primary); Windows is second.

Build `scripts/quest.mjs` (Node 22, standard library only):
```
node scripts/quest.mjs              # check, reverse both ports, open /vr in the Quest Browser
node scripts/quest.mjs --watch      # keep re-applying the reverse whenever the Quest reconnects
node scripts/quest.mjs --url /twin  # open another page
node scripts/quest.mjs --no-open    # only the ports
```
1. Find adb in this order: `$ADB`, `PATH`, `$ANDROID_HOME/platform-tools`, `~/Library/Android/sdk/platform-tools`, `/opt/homebrew/bin`, `%LOCALAPPDATA%\Android\Sdk\platform-tools`. If there is none, print how to install it (`brew install android-platform-tools`; on Windows, Google's "SDK Platform-Tools" zip). Also print the no-cable route: in the Quest Browser open `chrome://flags`, set "Insecure origins treated as secure" to Enabled with `http://<this laptop's LAN IP>:3000` (work out the IP from `os.networkInterfaces()`), relaunch, open `http://<IP>:3000/vr`.
2. `adb devices -l`. With no device, say "Plug the Quest in with a USB-C cable and put it on." For "unauthorized", say "Put the headset on and press Allow on Allow USB debugging (tick Always allow)." With several devices, pick the one whose model mentions Quest, or take `--serial`.
3. Check that this laptop serves `http://127.0.0.1:3000/vr` and that something answers on `127.0.0.1:3001`. If not, say "Start Avon first: npm run demo" and exit 1.
4. `adb reverse tcp:3000 tcp:3000` and `adb reverse tcp:3001 tcp:3001`, then confirm both with `adb reverse --list`.
5. Unless `--no-open`, open the page in the Quest Browser with `adb shell am start -a android.intent.action.VIEW -d http://localhost:3000/vr` aimed at the Quest Browser package. Find the real package name with `adb shell pm list packages | grep -i browser`, don't assume it. If that fails, print the URL to type.
6. End with one line, either `Quest ready: http://localhost:3000/vr` or the problem and its fix. Exit 0 when ready, 1 otherwise.
`--watch` polls `adb devices` every 3 s. When the Quest (re)appears, it redoes step 4 and prints one line with the time. Ctrl+C stops it.

Tests in `scripts/quest.test.mjs` (`node --test scripts/quest.test.mjs`) use a stub adb, a small node script pointed to by `$ADB` that prints canned output and logs its arguments. Cover these cases:
- adb missing (the no-cable route is printed with a LAN URL);
- no device;
- unauthorized;
- the happy path (reverse is called for both ports, and the open command is sent);
- `--watch` re-applying the reverse after a simulated reconnect.

Files you own: `scripts/quest.mjs`, `scripts/quest.test.mjs`. Do not edit `package.json` or anything else (Mohan adds `"quest": "node scripts/quest.mjs"` when merging). No dependencies.

Done when:
- the tests pass (paste the output);
- if Yajat has developer mode on the Quest 3S, a real run with the headset plugged into L1 and the output pasted (the page opening in the headset counts);
- if developer mode is not on yet, a real run without the headset, showing the no-device message.

Commit on `yajat/quest` with your own git identity and no AI-credit lines. Push only that branch, never to main or mohan/live, never force push. Mohan merges.
