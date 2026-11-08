# Runbook: Laptop 2 (the Darkroom box) and Laptop 3 (the verifier)

Laptop 2 (L2) is the box. It runs SpacetimeDB (database `darkroom`), the box screen at `/box`, and the witness page at `/witness` for the phones. It sits on its own hotspot (DARKROOM) with nothing plugged into the internet port. Laptop 3 (L3) runs the verifier: one file and Node, nothing else.

What was tested, on Mohan's laptop (Windows 11, WSL2 Ubuntu, Node 22.22.1, SpacetimeDB 2.14.1), 2026-11-08:
- `node scripts/boot-darkroom.mjs --db darkroom-boot --no-web` against a SpacetimeDB that was already running: reused it, published, enrolled the team. A second run kept the data.
- The cold-start path (nothing on port 3001; the script starts SpacetimeDB on `0.0.0.0:3001` in the background and starts `npm run dev`) was tested with a stand-in `spacetime` and web server in an isolated network namespace. It has **not** been run cold against the real SpacetimeDB yet. Do that once on L2 before the demo (section 2).
- `verify-standalone.mjs` and `scripts/verify.mjs` printed identical output on a clean log, after the root delete, and after one edited row.
- **Not tested:** a real phone against L2, the `netsh` and firewall commands below, Windows without WSL.

## 1. One-time setup (on venue Wi-Fi: `npm ci` needs the internet)

**Linux or WSL2** (in the WSL terminal):

```bash
curl -sSf https://install.spacetimedb.com | sh -s -- -y
spacetime version install 2.14.1
spacetime version use 2.14.1
spacetime --version          # must say: spacetimedb tool version 2.14.1
```

**Windows without WSL** (PowerShell): `iwr https://windows.spacetimedb.com -useb | iex`, then the same `spacetime version` commands.

Then, in the repo:

```bash
npm ci
spacetime server add --url http://127.0.0.1:3001 avonlocal    # only if `spacetime server list` has no avonlocal
```

`darkroom-seed.mjs`, `darkroom-reset.mjs` and `tamper.mjs` talk to the server nickname `avonlocal`. Add it with SpacetimeDB running (the first boot in section 2 starts it). If the server is not running, add `--no-fingerprint`.

**SpacetimeDB safety.** The CLI's default server is maincloud, which is the public cloud. Every command here passes `-s avonlocal` or `-s http://127.0.0.1:3001`. Never run the plain `spacetime login`; it goes to the cloud. Never use `--delete-data` or `--fresh` on `darkroom` during the demo.

**Who owns the box.** The CLI identity that first publishes `darkroom` owns it. The seed, reset and tamper scripts call owner-only reducers as that same CLI identity. On a fresh CLI, the first publish prints "logged in directly to your target server". That is a local identity from this laptop's own server, not a cloud login. Run every `spacetime` command and every script from the **same** place: all in WSL, or all in PowerShell. WSL and PowerShell keep separate CLI configs, so mixing them gives `owner only` errors. If a publish stops with "not logged in", get a local identity with `spacetime login --server-issued-login http://127.0.0.1:3001`. It talks only to this laptop's server.

## 2. Boot (every time)

Join the DARKROOM hotspot first. The laptop's IP depends on the network.

```bash
npm run demo:darkroom
```

| Flag | What it does |
|---|---|
| (none) | full boot, as below |
| `--no-web` | everything except the web server (use it if `npm run dev` is already running) |
| `--fresh` | **wipes** the database first (new genesis). Every screen then needs Demo reset. Not for rehearsals: use section 6 |
| `--db <name>` | a test database. The screens always use `darkroom` |

It runs these steps in order and stops with a plain message if one fails:

| Step | What | Time (measured) |
|---|---|---|
| 0 | `spacetime --version` must be 2.14.1. If not, it stops before doing anything else | |
| 1 | `spacetime start --listen-addr 0.0.0.0:3001` in the background, then waits until `/v1/ping` answers. Skipped if SpacetimeDB already answers on 3001. Log: `~/.darkroom/spacetime.log` | 0.1 s when already running |
| 2 | `spacetime publish -s http://127.0.0.1:3001 --module-path spacetimedb-darkroom -y darkroom` (no wipe unless `--fresh`) | 0.2 s |
| 3 | `node scripts/darkroom-seed.mjs`: Dana (Commander), Sam (Responder), Lee (Viewer). A rerun says "already a member" | 0.1 s |
| 4 | `npm run dev -- -p 3000`, then loads `/box` and `/witness` once so they are compiled. Reuses a web server that already serves `/box` | |

Then it prints each LAN address with the two URLs and whether ports 3000 and 3001 answer on it:

```
  This laptop:  http://localhost:3000/box

  eth0 172.29.12.148   [3000 ok; 3001 ok]
    Box screen:     http://172.29.12.148:3000/box
    Witness phones: http://172.29.12.148:3000/witness
```

`3001 NOT reachable` means SpacetimeDB listens on 127.0.0.1 only (it was started with `npm run st:start`). Phones cannot reach that. See section 5, item 2.

**Ctrl+C** stops the web server. SpacetimeDB keeps running, so the log and the phones' connections survive a closed terminal. To stop it: `pkill -f spacetimedb-standalone` (Linux/WSL) or `taskkill /IM spacetimedb-standalone.exe /F` (Windows).

## 3. WSL2: let the phones reach WSL

WSL2 has its own network address behind Windows. Phones on the hotspot reach Windows, not WSL. So Windows must forward ports 3000 and 3001 to WSL. Skip this section if L2 runs the repo in Windows directly, but still add the firewall rule.

1. In WSL, find the WSL IP (the first address):

   ```bash
   hostname -I          # or: ip addr show eth0
   ```

2. In an **admin** PowerShell on Windows, with that address as `<WSL IP>`:

   ```powershell
   netsh interface portproxy add v4tov4 listenport=3001 listenaddress=0.0.0.0 connectport=3001 connectaddress=<WSL IP>
   netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=<WSL IP>
   netsh interface portproxy show v4tov4
   ```

3. Firewall, same admin PowerShell. Allow both ports on the **Private** profile only:

   ```powershell
   New-NetFirewallRule -DisplayName "Darkroom 3000-3001" -Direction Inbound -Protocol TCP -LocalPort 3000,3001 -Profile Private -Action Allow
   ```

   The same rule with netsh: `netsh advfirewall firewall add rule name="Darkroom 3000-3001" dir=in action=allow protocol=TCP localport=3000,3001 profile=private`

4. Set the DARKROOM hotspot network to Private: `Get-NetConnectionProfile` shows its name, then `Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private`.

5. The phones use the **Windows** Wi-Fi address, not the WSL address the boot prints. Run `ipconfig` and find "Wireless LAN adapter Wi-Fi" → "IPv4 Address". The witness URL is `http://<Windows Wi-Fi IP>:3000/witness`.

6. SpacetimeDB in WSL must listen on `0.0.0.0:3001`, because the forward goes to the WSL address, not to 127.0.0.1. Check with `ss -ltnp | grep 3001` in WSL.

The WSL address changes after `wsl --shutdown` or a reboot. Then delete the old forwards and add them again with the new address:

```powershell
netsh interface portproxy delete v4tov4 listenport=3001 listenaddress=0.0.0.0
netsh interface portproxy delete v4tov4 listenport=3000 listenaddress=0.0.0.0
```

L2's own browser can open `http://localhost:3000/box` on Windows. WSL forwards localhost by itself.

## 4. Screens

**Box screen (L2).** Open `http://localhost:3000/box`. The first time, it says "This screen can read the record but cannot write to it" and shows a command with its identity. In the repo, run it:

```bash
node scripts/darkroom-seed.mjs --add <identity from /box> --name "Box screen" --role Commander
```

The screen then shows "You: Box screen (Commander)". Each browser has its own identity: enroll again after you change browsers or clear the site's data. The enrollment survives a rehearsal reset.

**Witness phones.** Join DARKROOM and open `http://<box-ip>:3000/witness`. No enrollment: phones only read. The chip must say LIVE and the banner LOG VERIFIED.

## 5. If a phone shows DISCONNECTED (or the page won't load)

Work down this list:

1. **The page does not load at all.** The phone cannot reach L2.
   - Is the phone on DARKROOM, and is the IP the one from the latest boot? On WSL, it is the Windows Wi-Fi IP from `ipconfig` (section 3, step 5).
   - WSL: `netsh interface portproxy show v4tov4` must list 3000 and 3001 with the **current** `hostname -I` address.
   - Firewall rule on Private, and the hotspot network set to Private (section 3, steps 3 and 4).
   - Some hotspots block device-to-device traffic. Try another phone as the hotspot.
2. **The page loads but the chip says DISCONNECTED.** Port 3000 works, port 3001 (SpacetimeDB) does not.
   - On the phone, open `http://<box-ip>:3001/v1/ping`. A blank page means 3001 is reachable. An error means it is blocked: the firewall rule or the 3001 forward is missing.
   - On L2: `ss -ltnp | grep 3001` (Linux/WSL) or `netstat -ano | findstr 3001` (Windows). It must show `0.0.0.0:3001` or `*:3001`. If it shows `127.0.0.1:3001`, stop that SpacetimeDB (section 2, Ctrl+C note) and run `npm run demo:darkroom` again. The data stays.
   - Did SpacetimeDB die? Look at `~/.darkroom/spacetime.log`, then run `npm run demo:darkroom` again.
3. **It says Connecting and never turns LIVE.** Same checks as item 2. The page retries every 2 seconds by itself.
4. **L2's IP changed** (it rejoined the hotspot, or WSL restarted). Run `npm run demo:darkroom` again and use the new URL. On WSL, redo the forwards (section 3).
5. **LIVE, but ROLLBACK DETECTED or TAMPERING AT #0 before anyone deleted anything.** That screen still remembers the previous rehearsal's log. Press **Demo reset** on it.

## 6. Rehearsal reset (between judges)

After a drill, on L2:

```bash
node scripts/darkroom-reset.mjs
```

It wipes and republishes only `darkroom` and enrolls the same members again (box screen included). Then press **Demo reset** once on every open `/box` and `/witness` screen: L2 and every phone. The button asks you to confirm. Each one forgets the old log and starts a new witness on the new one. The box screen stays enrolled. On L3, delete `witness.json` (section 7).

Do not use `--fresh` for this. It wipes the enrolled box screen too.

The drill itself (needs at least 4 log entries; open an incident first): `node scripts/tamper.mjs`. Every screen that saw the deleted entries shows `ROLLBACK DETECTED AT #k`.

## 7. Laptop 3: the verifier

L3 needs only Node 18 or newer. No repo, no `npm install`.

1. While you still have the internet, copy `scripts/verify-standalone.mjs` from the repo to L3 (USB stick, or download it). It is one file.
2. Join DARKROOM. Check that L3 can reach the box: `curl http://<box-ip>:3001/v1/ping` or open that URL in a browser. On WSL L2, `<box-ip>` is the Windows Wi-Fi IP.
3. Before the drill, save a witness:

   ```bash
   node verify-standalone.mjs --host <box-ip> --witness witness.json
   ```

   Expected: `LOG VERIFIED` and `saved: witness now #N`.
4. During the drill, watch it live (Ctrl+C to stop):

   ```bash
   node verify-standalone.mjs --host <box-ip> --witness witness.json --watch
   ```

5. After the root delete:

   ```bash
   node verify-standalone.mjs --host <box-ip> --witness witness.json
   ```

   Expected: `ROLLBACK DETECTED AT #k`, the reason on the `why:` line, exit code 1.

Exit codes: 0 verified (or empty), 1 rollback or tampering, 2 could not check (box not reachable, bad file). `--export log.json` saves the log it read, and `--file log.json` checks a saved log with no network.

Between rehearsals, delete `witness.json` on L3. That is L3's Demo reset. Otherwise the new log shows `TAMPERING AT #0`.

The output is the same as `scripts/verify.mjs` from the repo, line for line. The hashing and witness rules are copied from `lib/chain.ts` and `lib/rules/darkroom/status.ts`. If those files change, update `verify-standalone.mjs` too and compare both verifiers on one log.

## 8. Known noise (harmless)

- `publish` prints "tsc not found in node_modules". The module still builds and publishes.
- A republish with no schema change prints an empty "Database Migration Plan", then "Updated database".
- `npm run dev` warns about "multiple lockfiles" and "Cross origin request detected" when a phone opens the LAN URL. Warnings only.
