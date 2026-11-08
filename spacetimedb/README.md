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
| `budget` | yes | one system: trucks the plans call against its fleet (ops.json), plans against doing nothing, production at risk per hour (`lib/eog/budget.ts`) |
| `flow_series` | yes | one facility: hourly rate in (inflow) and rate out (pump), level, and the level change physics expects, last 24 h (`lib/eog/flows.ts`) |
| `breach_risk` | yes | one tank: what a spoofed (held flat) level sensor would hide and what believing it costs against the truth, most dollars first (`lib/eog/breach.ts`) |
| `scenario` | yes | one `what_if` run: kind, asset, who asked, the ripple as JSON; newest 20 kept (`lib/eog/whatif.ts`) |
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
| `what_if(kind, asset_id)` | any client* | kind `pump_fail`, `sensor_spoof`, `sensor_dead` or `pipeline_leak`: runs the ripple on what the console sees now and writes one `scenario` row; never changes the board |
| `compute_breaches()` | any client* | rewrites `breach_risk` from the readings as loaded (finish_ingest already does it once per load) |

`finish_ingest` and every rebuild (`inject_fault`, `clear_fault`) also rewrite `budget` and `flow_series`, so a simulated fault shows there too. `finish_ingest` writes `breach_risk` from the readings as loaded: on mock_test, local `finish_ingest` took 85-180 ms before `breach_risk` existed and 156-773 ms with it (the spread is machine load); adding the ripple chart data took it from 156-233 ms to 229-311 ms (two local loads each); the hosted copy took 677 ms. `/insight` reads all four tables.

Each ripple step names its future (`branch`): `event` and `check` happen in every future, `plan` (and `fleet`, another facility's plan that moves with it) is acting on the truth, `ignored` is nobody acting, `lie` is trusting a faked sensor, `flag` is acting only once the sensor check flags it. `projection` holds the tank level in each future as `[minutes after now, level %]` points, with the truck pickups, the trip and the sensor flag marked; `/insight` draws it above the timeline. Rows written before this field existed have `projection` missing, and the page skips the chart for them.

Check the tables after a load (SpacetimeDB 2.14.1 needs a name on an aggregate: `COUNT(*) AS n`, not bare `COUNT(*)`):

```
spacetime sql -s avonlocal avon "SELECT COUNT(*) AS n FROM flow_series"   # 15 on mock_test
spacetime sql -s avonlocal avon "SELECT COUNT(*) AS n FROM breach_risk"   # 15
spacetime sql -s avonlocal avon "SELECT COUNT(*) AS n FROM budget"        # 5 systems
spacetime sql -s avonlocal avon "SELECT id, kind, asset_id, title FROM scenario"
```

The ripple, in short: `pump_fail` plans the stopped pump with the system's other failures through the same planner (`planJoint`), so it shows which other facility's plan changes when the trucks move, the trip time if nobody acts, and the night's cost before and after. `sensor_spoof` and `sensor_dead` on a failed pump rerun the whole engine on a copy faked since the failure and meet the plan the lie produces with the real tank; on a running pump they plan a stop the console cannot see, with the time the physics check (`lib/rules/health.ts`) would flag the sensor. `pipeline_leak` sizes the spill from this data's own leaks, waits the detector's delay, then isolates the line.
| `enter_lockdown(reason, evidence_ref, tank)` | any client* | starts a LOCKDOWN: evidence_ref must match `AV-XXXX-XXXX`, reason 1 to 200 characters (lib/rules/lockdown.ts); refused while one is already active |
| `end_lockdown()` | any client* | ends it after the on-site check: keeps the row with active false and ended_at set, and clears `confirmation` so every plan asks to be confirmed again; refused when none is active |

\* The Avon side trusts its own network in this prototype; that is a stated limit (docs/ARCHITECTURE.md, the threat model card). The isolated Darkroom module checks every caller.

Tests: `npm run test:st` (ingest, parity with the engine run directly in Node, the live subscription, a disconnect), `npm run smoke` (the whole demo path through these reducers).

The whole system, both databases and the known limits: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).
