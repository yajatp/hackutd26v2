# Running Brine locally

Brine runs as two independent halves, each with its own SpacetimeDB database:

- **The operations side** (`avon`): the console, Phone 1's fault remote, Insight, the map, the 3D model and the SpacetimeDB view.
- **The Darkroom** (`darkroom`): the incident room, the witness phones and the verifier. It is meant to run on a separate laptop on its own isolated network.

Both halves run on one laptop for development. They use the same ports (3000 for the web app, 3001 for SpacetimeDB), so run one boot script at a time, or use separate machines.

## Requirements

- Node 22 and npm.
- SpacetimeDB **2.14.1**. Other versions are not tested.
- The EOG challenge data, cloned next to this repository as `../eog-data`.

```bash
curl -sSf https://install.spacetimedb.com | sh -s -- -y
spacetime version install 2.14.1
spacetime version use 2.14.1
spacetime --version          # spacetimedb tool version 2.14.1
```

The installer puts `spacetime` in `~/.local/bin`; add it to your `PATH` if the shell can't find it. On Windows, install with `iwr https://windows.spacetimedb.com -useb | iex` in PowerShell (or use WSL2), then run the same `spacetime version` commands.

```bash
npm ci
git clone https://github.com/nihaal419/HackUTD-ZeroDay ../eog-data
```

**Keep the CLI local.** The SpacetimeDB CLI's default server is the public cloud. Every script here passes `-s http://127.0.0.1:3001`. Don't run a plain `spacetime login`, and don't use `--delete-data` on a database you want to keep.

## The operations side

```bash
npm run demo:avon                     # loads the mock_test folder
npm run demo:avon -- <folder>         # any folder with network.json, ops.json and telemetry.csv
```

The script starts SpacetimeDB on `0.0.0.0:3001`, publishes the `avon` module from `spacetimedb/`, ingests the folder, starts the dev server and prints the URLs for phones on the same network. It takes about 4 seconds on a laptop. Ctrl+C stops everything it started.

| Command | What it does |
| --- | --- |
| `npm run demo:reset` | Clears every simulated fault and reloads the folder, without restarting anything. |
| `npm run sites` | Provisions the extra map sites as their own databases (`avon-<site>`). |
| `npm run smoke` | Runs the golden path against the real reducers on throwaway databases. |
| `npm run e2e` | Drives the real screens in a browser (Playwright, from the npx cache). |

Open `http://localhost:3000` for the home page, `/console` for the operator's board and `/attack` on a phone for Phone 1.

### Hosted database

The web app reads `NEXT_PUBLIC_AVON_URI` (a `wss://` SpacetimeDB, such as maincloud) and `NEXT_PUBLIC_AVON_DB` at build time. Without them it connects to `ws://<page host>:3001`, database `avon`. `npm run demo:reset:cloud` and `npm run cloud:check` manage the hosted copy.

## The Darkroom

```bash
npm run demo:darkroom
```

The script starts SpacetimeDB, publishes the `darkroom` module from `spacetimedb-darkroom/`, enrolls three demo members (Commander, Responder, Viewer) and starts the web server. The CLI identity that first publishes `darkroom` owns it, and the seed, reset and tamper scripts act as that identity, so run every `spacetime` command from the same shell (all in WSL or all in PowerShell, not a mix). If a publish stops with "not logged in", get a local identity from your own server with `spacetime login --server-issued-login http://127.0.0.1:3001`; it never contacts the cloud.

| Flag | What it does |
| --- | --- |
| `--no-web` | Everything except the web server. |
| `--fresh` | Wipes the database first (a new genesis). Every screen then needs a reset. |
| `--db <name>` | Uses a test database. The screens always read `darkroom`. |

Open `/box` on the box laptop and `/witness` on phones in the room.

### Verifying the log

`scripts/verify-standalone.mjs` is a single file that needs only Node 18 or newer. Copy it to a separate laptop:

```bash
node verify-standalone.mjs --host <box IP> --witness witness.json           # check and save a witness
node verify-standalone.mjs --host <box IP> --witness witness.json --watch   # re-check every second
```

It prints `LOG VERIFIED`, `ROLLBACK DETECTED AT #k` or `TAMPERING AT #k`, and exits 1 on either failure. `scripts/verify.mjs` prints the same verdicts using the repo's shared rules. `scripts/tamper.mjs` edits the log on purpose, so you can watch a verifier catch it.

## Phones on the same network

Phones load the web app from port 3000 and connect to SpacetimeDB on port 3001, so both must be reachable from the phone.

- Put the laptop and phones on the same hotspot. Campus and venue Wi-Fi often block device-to-device traffic.
- **macOS:** if the firewall is on, allow incoming connections for `node` and `spacetimedb-standalone`.
- **Windows:** set the network to Private and allow inbound TCP 3000 and 3001. Under WSL2, forward both ports from Windows to the WSL address with `netsh interface portproxy`.

If a phone shows **DISCONNECTED**, port 3000 works but 3001 doesn't. Open `http://<laptop IP>:3001/v1/ping` on the phone: a blank page means it is reachable. On the laptop, `lsof -nP -iTCP:3001 -sTCP:LISTEN` must show `*:3001`; `npm run st:start` binds to localhost only, so use the boot script instead.

## Checks

```bash
npm test                 # engine, rules, hash chain and witness tests
npm run test:st          # SpacetimeDB module tests (see below)
npm run lint
npx tsc --noEmit
npm run check:hardcode   # no site-specific values in the engine
```

The module tests, and the Darkroom's seed, reset and tamper scripts, talk to the local server by the nickname `avonlocal`. Add it once while SpacetimeDB is running: `spacetime server add --url http://127.0.0.1:3001 avonlocal`.

The VR model has its own guide: [QUEST.md](QUEST.md).
