# SpacetimeDB module `darkroom` (the isolated incident room)

TypeScript module for SpacetimeDB 2.14.1, self-hosted on the Darkroom laptop, on its own network with nothing plugged into the internet port. `/box` and `/witness` are live subscriptions to its public tables. It is a separate database from `avon` on purpose: if they shared one, the isolation would be fake. A person carries the evidence reference between them.

Every write is an entry in an append-only, hash-chained log. Hashing uses `lib/chain.ts` (the same code the screens and both verifiers use). The author of an entry is always the server's member row for `ctx.sender`, never a name sent by the client.

```
npm run demo:darkroom          # boot the Darkroom laptop (scripts/boot-darkroom.mjs)
node scripts/darkroom-seed.mjs # enroll the demo team; --add <identity> enrolls a screen
node scripts/darkroom-reset.mjs # between rehearsals: wipe only this database, keep members
node scripts/verify.mjs --witness w.json             # check the record (repo checkout)
node scripts/verify-standalone.mjs --host <box ip>   # one file, Node only, for laptop 3
```

## Tables

| Table | Public | One row is |
|---|---|---|
| `config` | yes | the box owner and the incident counter |
| `member` | yes | a member: identity, name, role (Commander, Responder, Viewer), active |
| `event_log` | yes | one log entry: seq, prev_hash, incident, time, actor, type, payload, hash |
| `chain_head` | yes | the newest entry's seq and hash |

## Reducers

| Reducer | Who | What it does |
|---|---|---|
| `init` | the module | the publisher becomes the box owner and Commander; logged as `member_added` |
| `seed_member(identity, name, role)` | box owner | enrolls a member; logged as `member_added` |
| `open_incident(title)` | Commander | opens the next INC-nnnn; logged |
| `append_event(expected_seq, expected_prev, incident, type, payload)` | members, by role | `scope_update` (Commander, Responder), `chat` (all), `evidence_imported` (Commander, Responder; the AV- reference must match its fingerprint), `incident_closed` (Commander; the incident then refuses every write). Refuses a stale head, a non-member, an unknown incident |

## What the screens and verifiers catch

Deleted entries (ROLLBACK DETECTED AT #k, from each device's witness), edited or unhashable entries and stored bytes that differ from what the module wrote (TAMPERING AT #k), member rows changed outside the log, and a chain head that does not match the last entry. Not caught: the box owner appending a brand-new forged entry (entries are not signed per device). Full results: REDTEAM-claude.md.

The whole system, both databases and the known limits: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).
