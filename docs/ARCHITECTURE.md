# Avon architecture

Avon reads oil-field telemetry, detects operating problems and sensor issues, and presents response plans. It uses two SpacetimeDB databases: `avon` is the company-side operational view; `darkroom` is an incident room on its own isolated local network. The databases are not linked. A person carries an evidence reference from the console to the room. Isolation depends on the actual network setup.

```text
 Company network                                 Isolated local network
 Laptop 1: /console ──────┐                     Laptop 2: /box ───────┐
 Phone 1: /attack ────────┼──> SpacetimeDB      Phone: /witness ──────┼──> SpacetimeDB
 Phone: /console ─────────┘    avon             Laptop 3: verifier ──┘    darkroom
          │                                                   ▲
          └──────── person carries evidence reference ─────────┘
```

## Database `avon`

The module is `spacetimedb/src/index.ts`. Public tables are available for subscription; private tables stay on the server.

| Table | Visibility | One row represents |
|---|---|---|
| `config` | Public | Current dataset and latest data timestamp. |
| `dataset_source` | Private | Original network and operations JSON for rebuilding the dataset. |
| `facility` | Public | A facility and its tank, pump, pipeline and wells. |
| `reading` | Private | One facility at one sample time, in wide form. |
| `alert` | Public | One ranked console alert, including its JSON. |
| `console_meta` | Public | Current console totals, events and build time. |
| `fault` | Public | One simulated fault on a tank sensor. |
| `sensor_issue` | Public | One ranked sensor issue as JSON. |
| `load_lock` | Private | The identity and start time of the current load. |
| `confirmation` | Public | A plan snapshot confirmed by an identity. |

| Reducer (arguments) | Caller, checks and writes |
|---|---|
| `load_dataset(networkJson, opsJson, datasetId)` | Any reachable client. Parses JSON, checks facility shape and rejects another identity's lock younger than 60 seconds. Clears readings, faults, confirmations, facilities, source and config; writes the new facilities, source, config and lock. The old board stays until finish. |
| `ingest_batch(rows)` | Lock holder when a lock exists; otherwise any client. Requires config, known facilities and matching well counts. Deduplicates facility/time pairs, inserts readings and advances the data timestamp. |
| `finish_ingest()` | Lock holder when a lock exists; otherwise any client. Checks readings, expected row count and final timestamp. Runs the EOG engine inside the reducer, replaces alerts, metadata and sensor issues, and clears the lock. |
| `inject_fault(assetId, kind)` | Any reachable client. Checks the kind, loaded data and tank. Writes a backdated simulated fault and rebuilds the board using a copy of the readings. |
| `clear_fault(assetId)` | Any reachable client. Deletes that fault, or all faults for an empty ID, and rebuilds the board. |
| `confirm_plan(alertId)` | Any reachable client. Requires a current alert with a fix; writes the server's headline and cost with caller identity and time. |

The lock prevents batches from different identities mixing during an active load; it is not authorization. After 60 seconds another identity may start a new load. Faults do not change the source files or stored readings.

## Database `darkroom`

The module is `spacetimedb-darkroom/src/index.ts`. All four tables are public.

| Table | Visibility | One row represents |
|---|---|---|
| `config` | Public | The box owner and incident counter. |
| `member` | Public | An identity, name, role, enrollment details and active state. |
| `event_log` | Public | A sequenced incident or membership event, its canonical payload and hashes. |
| `chain_head` | Public | The latest sequence, hash and entry count. |

| Reducer (arguments) | Caller, checks and writes |
|---|---|
| `init` (module initialization) | Publisher becomes owner and first Commander. Creates config, member, genesis membership event and head. |
| `seed_member(identity, name, role)` | Owner only. Validates name and role, upserts the member and appends `member_added`. |
| `open_incident(title)` | Active Commander. Validates title, increments the counter and appends `incident_opened` with a server-selected ID. |
| `append_event(expectedSeq, expectedPrev, incidentId, type, payloadJson)` | Active member with permission for the type. Checks expected head, incident existence and closure, JSON and type-specific payload. Appends the event and updates the head. |

Commanders open and close incidents; Commanders and Responders update scope and import evidence; all three roles can chat. Closed incidents reject further events. Every actor is constructed on the server from the active member row for `ctx.sender`; clients do not supply it. Each event hashes canonical JSON containing its sequence, previous hash, incident, timestamp, actor, type and payload. The first links to a zero genesis value. The module refuses to append if the head's referenced entry is missing.

## Data flow

1. The browser checks a selected folder and converts its telemetry into wide rows. It calls `load_dataset`, sends batches and calls `finish_ingest`; `scripts/ingest.mjs` provides a command-line load path.
2. `finish_ingest` reconstructs the dataset and runs `buildConsole`: detection, planning and sensor health. It writes the public board tables. Subscribed clients rebuild their views when those rows change.
3. Phone 1 calls `inject_fault` for Kill, Fake or Drift. The reducer overlays the simulated fault on reconstructed readings and rebuilds the same tables; screens display the resulting state.
4. The console creates an evidence record, SHA-256 fingerprint and short reference. A person opens an incident on `/box` and enters the reference, optionally with the full fingerprint. The reducer checks format and consistency when a fingerprint is supplied, then logs the import. The reference is not an automatic transfer or proof that the sensor was truthful. `/report` prints the incident (timeline, scope, evidence with collectors and fingerprints, chain status and head fingerprint) from the same log.

## Verification

Each `/box` or `/witness` browser keeps a witness in local storage: genesis hash, last witnessed sequence and head hash. A verified longer log advances it. The chain check reports `TAMPERING` for broken contents or links, and `ROLLBACK DETECTED` when a previously witnessed tail is missing. The member table is compared with membership events and a mismatch reports `MEMBER LIST CHANGED`. A witness detects rewrites of history it has already seen; it cannot establish the truth of a new event.

`scripts/verify.mjs` uses the shared TypeScript rules; `scripts/verify-standalone.mjs` is a Node-only copy for a separate laptop. Both accept a witness file, server or exported log, and can watch. In server mode they also compare the member table and the head's sequence/hash with the last event, reporting `CHAIN HEAD CHANGED` on a mismatch. File mode lacks those table checks. The browser currently checks the chain and members but does not compare `chain_head` with the last event.

## Measurements

- `npm ci && npm test` on this checkout: **89 passed, 0 failed, 0 skipped**. Node 22.17.0 produced an engine warning for the installed SpacetimeDB package.
- `docs/planner-accuracy.md`: **18 of 20** listed answer-key cases match exactly; the other two make the same decisions with different timings and costs.
- `REDTEAM-claude.md`: the first pass caught **24** of 34 attacks and missed 10. The rerun, with the payload-byte and chain-head checks and the witness fix now on main (`92dc51d`), measured **28 caught, 6 missed**; both verifiers agreed on every attack. The 6 misses are listed under known limits.
- `docs/RUNBOOK-L1.md` records three cold boots on one laptop at **4.1 to 4.3 seconds**, and the listed ingest at **0.7 seconds**. These are local measurements, not general performance guarantees.

## Known limits

- An owner with control of the box can append a forged event under another member's name and move the head; hashes provide integrity, not authenticity (`REDTEAM-claude.md`).
- An owner can forge a membership event and matching member row; an inactive unlogged member row is ignored by the member comparison (`REDTEAM-claude.md`).
- A verifier without an earlier witness cannot detect a complete, consistently rehashed history; deleting and restoring identical rows is also indistinguishable.
- The browser does not flag a head-only edit until it affects the verified log; the CLI head check does not check the stored count or a missing head.
- The Avon reducers trust clients on their network; the load lock does not prevent an authorized-looking client from replacing data or injecting faults.
- Darkroom uses unencrypted `ws://`; a network observer can obtain reusable credentials, and public tables can be read by anyone with network access (`REVIEW-codex.md`).
- A compromised phone or someone controlling the box display can misrepresent what a user sees; isolation requires a separately configured local network (`app/box/ThreatModelCard.tsx`).
- The planner does not prove the globally cheapest plan: whole-minute rounding can miss a cheaper split (`docs/planner-accuracy.md`).
- Silence checks cover sensors; physics-based drift and lie checks apply to tank levels, not every individual sensor (`lib/rules/health.ts`).
- A selected Fake fault does not guarantee that the engine will classify every target as LYING, and the remote's label can imply otherwise (`REVIEW-codex-2.md`).
- Opening an incident and entering the evidence on the Darkroom are manual; the delete demonstration requires enough entries (`REVIEW-codex-2.md`).
