# SpacetimeDB module `avon` (the company side)

TypeScript module for SpacetimeDB 2.14.1, self-hosted. Every screen on the Avon side (`/console`, `/attack`, `/twin`) is a live subscription to the public tables below. The EOG engine runs **inside the `finish_ingest` reducer**: `src/eog.ts` rebuilds the dataset from the `reading` rows and calls `buildConsole()` from `lib/eog/` (detector, planner, sensor health), which is plain TypeScript imported into the module, not a separate server.

```
npm run st:start      # spacetime start --listen-addr 127.0.0.1:3001
npm run st:publish    # publish this module as database avon (local server only)
npm run st:generate   # client bindings -> lib/module_bindings
npm run demo          # boot everything on the EOG laptop (scripts/boot-avon.mjs)
```

## Tables

| Table | Public | One row is |
|---|---|---|
| `config` | yes | the loaded dataset: id, its "now", when it was loaded |
| `dataset_source` | no | network.json and ops.json as loaded |
| `facility` | yes | one facility from network.json: tank, pump, pipeline, wells, map position |
| `reading` | no | one facility at one 5-minute sample: every value the engine reads |
| `alert` | yes | one console card, in order, with the full plan as JSON |
| `console_meta` | yes | totals, the events list, the alert count (lets clients render a consistent board) |
| `sensor_issue` | yes | one sensor that reads dead, drifting or lying at "now", with its evidence |
| `fault` | yes | a simulated fault from Phone 1 (never changes the readings) |
| `confirmation` | yes | a plan the operator confirmed, as it read at that moment |
| `load_lock` | no | which screen is loading a site right now |
| `lockdown` | yes | one row (id 0): the site is in LOCKDOWN (docs/LOCKDOWN.md): active, started_at, started_by, reason, evidence_ref (AV-XXXX-XXXX), tank, ended_at |

## Reducers

| Reducer | Who | What it does |
|---|---|---|
| `load_dataset(network, ops, id)` | any client* | starts a load: facilities, sources, lock; refuses while another screen's load is under 60 s old; keeps the old board on screen |
| `ingest_batch(rows)` | the loading client | adds reading rows; skips duplicates |
| `finish_ingest()` | the loading client | checks nothing was lost, **runs the EOG engine**, rewrites `alert`, `console_meta`, `sensor_issue`, releases the lock |
| `inject_fault(asset, kind)` | any client* | Phone 1: kill / fake_flat / drift on a tank, then reruns the engine on a copy of the readings |
| `clear_fault(asset)` | any client* | removes one fault (or all with `""`) and reruns the engine |
| `confirm_plan(alert_id)` | any client* | records the plan's headline and cost from the server's own alert row |
| `enter_lockdown(reason, evidence_ref, tank)` | any client* | starts a LOCKDOWN: evidence_ref must match `AV-XXXX-XXXX`, reason 1 to 200 characters (lib/rules/lockdown.ts); refused while one is already active |
| `end_lockdown()` | any client* | ends it after the on-site check: keeps the row with active false and ended_at set, and clears `confirmation` so every plan asks to be confirmed again; refused when none is active |

\* The Avon side trusts its own network in this prototype; that is a stated limit (docs/ARCHITECTURE.md, the threat model card). The isolated Darkroom module checks every caller.

Tests: `npm run test:st` (ingest, parity with the engine run directly in Node, the live subscription, a disconnect), `npm run smoke` (the whole demo path through these reducers).

The whole system, both databases and the known limits: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).
