# Runbook: Laptop 1 (EOG console + Phone 1 remote)

Laptop 1 runs the Avon side of the demo: SpacetimeDB (database `avon`), the console at `/console`, and Phone 1's fault remote at `/attack`. Tested on Yajat's laptop: macOS 26.7.1, Apple Silicon (arm64), Node 22.17.0, SpacetimeDB 2.14.1. Three cold boots in a row on 2026-11-08, each up in about 4 seconds. A real phone on the same network opened the printed `/attack` URL; tapping Fake showed LYING · SIMULATED on the laptop console.

## 1. One-time setup (macOS)

```bash
curl -sSf https://install.spacetimedb.com | sh -s -- -y
spacetime version install 2.14.1
spacetime version use 2.14.1
spacetime --version          # must say: spacetimedb tool version 2.14.1
```

The installer puts `spacetime` in `~/.local/bin`. If the shell can't find it, add `export PATH="$HOME/.local/bin:$PATH"` to `~/.zshrc`. `npm run demo:avon` also looks there on its own.

Then, in the repo:

```bash
npm ci
git clone https://github.com/nihaal419/HackUTD-ZeroDay ../eog-data    # only if ../eog-data is missing
```

Windows (not tested on this laptop): install with `iwr https://windows.spacetimedb.com -useb | iex` in PowerShell, then use the same `spacetime version` commands as above.

**SpacetimeDB safety.** The CLI's default server is maincloud, which is the public cloud. Every command here passes `-s http://127.0.0.1:3001`. Never run `spacetime login`. Never use `--delete-data` on `avon`.

## 2. Boot (every time)

```bash
npm run demo:avon                     # mock_test folder
npm run demo:avon -- <folder>         # any folder with network.json, ops.json, telemetry.csv
```

It runs these steps in order and stops with a plain message if one fails:

| Step | What | Time on L1 |
|---|---|---|
| 1 | `spacetime start --listen-addr 0.0.0.0:3001` (skipped if port 3001 is already in use; log in `$TMPDIR/avon-spacetime.log`) | 0.3 s |
| 2 | `spacetime publish -s http://127.0.0.1:3001 --module-path spacetimedb -y avon` (no `--delete-data`) | 0.2-0.3 s |
| 3 | `node scripts/ingest.mjs <folder>` (15 facilities × 1,627 timestamps) | 0.7 s |
| 4 | `npm run dev -- -p 3000`, then loads `/console` and `/attack` once so they're compiled | 2.8-3.0 s |
| | **total** | **4.1-4.3 s** |

Then it prints the phone URLs, after checking that the LAN address answers on both ports:

```
  This laptop:   http://localhost:3000/console
  Phone 1:       http://10.169.150.177:3000/attack
  Phone console: http://10.169.150.177:3000/console
    en0        10.169.150.177   ok
```

**Ctrl+C** stops everything the script started. Running it a second time while Avon is up stops at once ("port 3000 is already in use") and changes nothing.

Check it worked:
- `http://localhost:3000/console`: S5 · FACILITY C is at the top, "TRIPS IN 2H 03M", "Do this: Call 1 truck now, 1 trip", $905.
- `http://localhost:3000/attack`: the chip says ■ LIVE and lists 15 tanks.

## 3. Phone 1

1. Put the laptop and the phone on the same network: a phone hotspot both join, or the same Wi-Fi.
2. Run `npm run demo:avon` **after** joining. The IP changes from network to network, so use the one this run prints.
3. On the phone, open the printed `/attack` URL. Tap **S5 · Facility C tank**, then **Fake**. Within a second or two the laptop console shows "LYING · S5 · TANK C level SIMULATED. Physics says +9 pts/h. Sensor says 0." with no reload.
4. Tap **Clear all** before handing the phone to a judge.

## 3b. Between judges

With Avon up, in a second terminal:

```bash
npm run demo:reset                    # mock_test folder
npm run demo:reset -- <folder>        # if you booted with another folder
```

It clears every simulated fault, reloads the demo folder (same as boot step 3; this also clears the last judge's Confirm) and checks the result: the console shows the folder, no faults, no sensor issues, no confirmed plans, and S5 · FACILITY C on top. Then it prints **READY** with the time and the phone URLs. It never restarts SpacetimeDB or the dev server, never publishes, and leaves the open pages alone: the laptop console and Phone 1 both go back to the clean start by themselves, with no reload. If it prints **NOT READY**, the reason is on the same line. "run npm run demo first" means Avon isn't up.

Tested 2026-11-08 on L1: Fake on S5 · Facility C and Kill on S1 · Facility A from `/attack`, then reset, 3 times in a row: **0.9 s, 0.9 s, 0.8 s**. Again 3 times on the module with `confirm_plan`, with the top card confirmed before each reset: **1.0 s, 1.0 s, 1.0 s**. Each time the console went back to "2 pump failures · doing nothing costs $9,957", S5 · FACILITY C, TRIPS IN 2H 03M, $905, with no Sensors to check, and `/attack` showed Active faults (0).

## 4. Firewall

**macOS.** The firewall was off on L1, so nothing was needed. Check with:

```bash
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
```

If it says enabled, go to System Settings → Network → Firewall → Options and allow incoming connections for **node** and **spacetimedb-standalone**. Make sure "Block all incoming connections" is off. If macOS pops up "Allow incoming network connections?" on the first boot, click Allow.

**Windows** (not tested): set the hotspot or Wi-Fi network to **Private**, then in an admin PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Avon 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Profile Private -Action Allow
New-NetFirewallRule -DisplayName "Avon 3001" -Direction Inbound -Protocol TCP -LocalPort 3001 -Profile Private -Action Allow
```

## 5. If the phone shows DISCONNECTED (or the page won't load)

Work down this list:

1. **The page doesn't load at all on the phone.** The phone can't reach the laptop.
   - Check the phone is on the same hotspot or Wi-Fi, and that the IP is the one the latest boot printed.
   - Venue and campus Wi-Fi often block device-to-device traffic (client isolation). Switch both devices to a phone hotspot.
   - Check the firewall (section 4).
2. **The page loads but the chip says ▲ DISCONNECTED.** Port 3000 works but port 3001 (SpacetimeDB) doesn't.
   - On the phone, open `http://<laptop IP>:3001/v1/ping`. A blank page means 3001 is reachable. An error means it is blocked (firewall, section 4).
   - On the laptop, run `lsof -nP -iTCP:3001 -sTCP:LISTEN`. It must show `*:3001`. If it shows `127.0.0.1:3001`, SpacetimeDB was started with `npm run st:start`, which binds to localhost only, so phones can't reach it. Stop it, then run `npm run demo:avon`.
   - Did SpacetimeDB die? The boot script stops with "SpacetimeDB exited"; see `$TMPDIR/avon-spacetime.log`. Run `npm run demo:avon` again.
   - The log says `cannot take lock on database; spacetime.pid already exists`: another SpacetimeDB server on this laptop is using the default data folder, for example a throwaway one on port 3101 (`ps aux | grep spacetimedb-standalone`). Even with `--in-memory`, it holds the folder's lock. Stop it, or start throwaway servers with their own folder: `spacetime start --listen-addr 127.0.0.1:3101 --data-dir "$TMPDIR/st-3101"`.
3. **It says "● Connecting..." and never turns LIVE.** Same checks as item 2. The page retries every 2 seconds on its own, so it turns LIVE once the port is reachable.
4. **The laptop's IP changed** (rejoined the hotspot). Ctrl+C, run `npm run demo:avon` again, and use the new URL.
5. **No tanks listed, but LIVE.** No site is loaded. Run the boot again, or pick a site on the laptop console.

## 6. Known noise (harmless)

- `publish` prints "tsc not found in node_modules". The module still builds and publishes; it just skips the type check. `npm ci` inside `spacetimedb/` silences it, but needs the internet.
- `npm run dev` warns about "multiple lockfiles" (a `package-lock.json` in the parent folder) and "Cross origin request detected" when a phone opens the LAN URL. Both are warnings only in Next 15.5.
- On the first publish to a fresh server, the CLI prints "logged in directly to your target server". That is a local-only identity, not `spacetime login`.
- Claude's in-app browser cannot connect to port 3001 from the LAN URL (it blocks those requests), so it shows DISCONNECTED there. That doesn't apply to phones. A WebSocket from another process over the LAN address got through, and its faults showed up on the console.

## Checks, Sun early morning

Sun 2026-11-08, about 00:40-00:50 CST, on L1 (macOS 26.7.1, arm64, Node 22.17.0, SpacetimeDB 2.14.1), branch `yajat/l1-check` from `origin/main` at 405e633, after `npm ci` (8 s). Run the way judging day runs it.

| Step | Result | Time |
|---|---|---|
| 1. `npm run demo` | **PASS.** AVON IS UP. SpacetimeDB was already listening on 3001 (`*:3001`), so it used that one. publish 0.3 s, ingest 0.8 s, dev server + pages warm 5.3 s. Printed `http://10.169.150.177:3000/attack` with `en0 ok`. | 6.4 s total |
| 2. `npm run smoke -- --runs 3` | **FAIL as shipped, PASS after a macOS fix** (below). After the fix: all 7 steps PASS on all 3 runs, SMOKE PASSED. Top alert S5_PUMP_C, 2.05 h, $905. fake_flat evidence AV-1177-2830. `verify.mjs` says ROLLBACK DETECTED AT #2 after the owner delete. | runs 1.6 s, 1.4 s, 1.4 s (4.9 s total) |
| 3. `npm run fake:site`, then permian_site on `/console` | **PASS.** Wrote `../eog-data/fake/permian_site` (network.json, ops.json, 17.8 MB telemetry.csv). Prints nothing on success, exit 0. Console: "2 pump failures · doing nothing costs $12,421 · these plans cost $4,511". 4 systems, 12 facilities, 36 wells. Top card **FACILITY-3226807A279B · PUMP FAILED · TRIPS IN 2H 03M**, "Do this: Call 1 truck now, 1 trip", $1,266. Second card FACILITY-367BDDB66202, TRIPS IN 3H 26M. | 0.5 s to generate |
| 4. Phone, `/attack` | **PASS** (Yajat on a real phone). Before this I switched the console back to mock_test. Fake on the first tank (S5 · Facility C): laptop console showed LYING · SIMULATED, and the fix card said CHECK THE TANK SENSOR FIRST. Clear all, then `fault` and `sensor_issue` were both empty. | - |
| 5. `npm run demo:reset` | **PASS.** READY. Site mock_test_2026-10-10T1530, top card S5_FACILITY_C, 0 active faults, 0 sensor issues, 0 confirmed plans. Ran it twice. | 1.1 s wall, then READY in 0.8 s |

**The macOS fix to the smoke test.** As shipped, every run failed at step 1: `No such saved server configuration: avonlocal`. `scripts/smoke/safety.mjs` used a spacetime server nickname that exists only on the laptop where it was written. Its default data folder was also a Linux path, `/home/mohan/hackutd/eog-data/...`. Two one-line changes in `scripts/smoke/safety.mjs`:
- `SERVER` is now the URL `http://127.0.0.1:3001`, not a nickname. It works with no `spacetime server add`. It is still checked before every spacetime call, and it is still never maincloud.
- `DEFAULT_FOLDER` is now `../eog-data/history/mock_test_2026-10-10T1530`, found from the repo's location, the same `../eog-data` that `npm run fake:site` uses. Works on Linux and macOS.

`scripts/smoke/safety.test.mjs` was updated to match (6/6 pass), and a comment in `scripts/smoke.mjs` was updated. No other code changed. `scripts/smoke/acceptance.sh` still uses `/home/mohan/...` for its full_week case. It is Mohan's Linux acceptance script, so I left it alone.

**Odd, harmless.**
- The 3001 server that was already up had been started by another Claude session, with a data folder in that session's temp scratchpad. On judging day, start from a clean `npm run demo` so 3001 is the script's own server.
- `fake:site` prints nothing on success, so check `ls ../eog-data/fake/permian_site`.
- `/console` lists `full_week` and `mock_test_2026-10-10T1530` twice, once from `../eog-data/fake` and once from `history`. Use the second group for the judges' mock_test.
- Same known noise as section 6: "tsc not found", the Next "multiple lockfiles" warning.
