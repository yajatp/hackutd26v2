# Darkroom red team, independent pass (Claude)

A second pass next to Codex's `scripts/redteam.mjs` / `REDTEAM.md`. **Rerun on Sun Nov 8, early morning**, against main at `41c8bad`, which includes `9bddfe0` "Red-team fixes". The first pass (at `995d22e`) found 24 caught and 10 missed. Nothing in the app was changed for this rerun.

**How:** `scripts/redteam-claude.mjs`. Each attack gets its own steps:

1. A fresh throwaway database `rt-c<n>` on its own throwaway server: `127.0.0.1:3102`, with its own `--data-dir`. Never 3001 or 3101.
2. A normal 8-entry log built through the reducers: the owner's genesis, `seed_member` Sreesh/Responder, `open_incident`, 2 `scope_update`, 2 `chat`, and 1 `evidence_imported`.
3. A witness saved by **both** verifiers, each in its own file: `scripts/verify.mjs` and `scripts/verify-standalone.mjs` (the one-file verifier for laptop 3).
4. One edit as the box owner, using `spacetime sql` (and once a republished module).
5. Both verifiers run again. The suite prints `standalone DISAGREES` on any attack where the two differ in verdict or exit code.

CAUGHT means `verify.mjs` printed TAMPERING, ROLLBACK DETECTED, MEMBER LIST CHANGED or CHAIN HEAD CHANGED and exited 1.

**About the screens:** `/box` and `/witness` connect only to `ws://<host>:3001`, database `darkroom`, so I could not point them at the throwaway server. They run the same `chainStatus` → `memberMismatch` → `advanceWitness` on the same `rowToEvent` rows (`lib/darkroom-live.ts`). Not checked in a browser.

## Result

| | Caught | Missed | Refused by DB | Verifiers agree |
|---|---|---|---|---|
| First pass (`995d22e`) | 24 | 10 | 2 | (verify.mjs only) |
| **Main today (`41c8bad`)** | **25** | **9** | 2 | yes, all 36 |
| Main + the one-word fix below | 28 | 6 | 2 | yes, all 36 |

## 0. NEW, fix before judging: the verifiers never save a witness

Since `9bddfe0`, neither `verify.mjs` nor `verify-standalone.mjs` ever writes or moves a witness file. Any run, even on an honest log, prints `witness: none yet (will save to …)` and saves nothing. So the laptop-3 verifier has no memory, and **every attack that only a witness can catch passes**. Three attacks the first pass caught are now MISSED on main:

- edit a chat, recompute every later hash and `chain_head`: `LOG VERIFIED` (was `TAMPERING AT #7`)
- delete the last 2 entries, append 2 valid new ones: `LOG VERIFIED` (was `TAMPERING AT #7`)
- cut the log, move `chain_head` back, honest writes continue: `LOG VERIFIED` (was `TAMPERING AT #7`)

"Delete the last 3" is still caught, but now as `CHAIN HEAD CHANGED`, not `ROLLBACK DETECTED AT #5`. An owner who also moves `chain_head` back would get past it.

- **Why:** the new head check marks its status with `head: true`, and skips moving the witness when `status.head` is set (`scripts/verify.mjs:144`, `scripts/verify-standalone.mjs:298`). But a verified status from `chainStatus` already has `head: <hash>` (`lib/rules/darkroom/status.ts:40`). So `stray || status.head` is true on every honest log, and the witness is never saved.
- **Fix (one word, both files):** rename the flag, for example to `headChanged`, at the three spots in each verifier (the `head: true` that sets it, the `why` line in `report`, and the `next =` line). I tested this as a temporary local patch, then reverted it: 28 caught, 6 missed, both verifiers agree. Full output is at the end.
- **Not affected:** the `/box` and `/witness` screens call `advanceWitness` directly and never read that flag.
- **Test gap:** no test runs `verify.mjs` twice with a witness file. A smoke step "verify --witness twice, the second run says `saw up to #k`" would have caught this.

## Fixed by 9bddfe0 (with item 0 fixed)

- **Item 3, duplicate keys with the forged value first:** now `TAMPERING AT #6`. `rowToEvent` keeps the raw text when `payload_json !== canonical(JSON.parse(payload_json))`, so the hash check fails. This works on main even without item 0 fixed.
- **Item 4, same meaning in different bytes** (spaces, `\u` escapes, key order): now `TAMPERING AT #3`, by the same byte check. Works on main.
- **Item 5, huge integer that rounds to the same double:** now `TAMPERING AT #7`, by the same byte check. Works on main.
- **Item 6, `chain_head` edited alone:** now `CHAIN HEAD CHANGED OUTSIDE THE LOG (head #7, last entry #7)`. Both verifiers compare `chain_head` with the last entry. Works on main. The variant where an honest member writes after the head edit is still `TAMPERING AT #8`. The bad head is reported correctly if you verify before that write, but once the honest entry is on top of it, that entry is the one flagged.

## Still missed, by design or as a stated limit

1. **MISSED: the owner can append a forged entry in anyone's name, and every witness accepts it.** A chat with a valid hash and a moved `chain_head`, signed as `Sreesh|Responder|<Sreesh's identity>`: "I wiped the historian backups myself." Result: `LOG VERIFIED`, and the witness moves forward to include it. Replaying an old entry at the end is the same attack and is also missed.
   - **Limit for the threat model card:** an entry's hash proves where it sits in the chain, not who wrote it. The box owner can add new entries in any member's name. The witness freezes the past, not the future. "Nobody can quietly rewrite what happened" is accurate. "Nobody can fake an entry" is not. The real fix is per-member device keys that sign entries, which is too big for tonight.
2. **MISSED: the owner can add a member who is consistent with the log.** Republishing a modified module **without `--delete-data`** inserts a member row, plus a matching forged `member_added` entry. Result: `LOG VERIFIED`. Same root cause as item 1, and the same line on the card.
   - "SQL cannot insert a member row" is still no protection. The INSERT fails only because SQL in SpacetimeDB 2.14 has no Timestamp literal. Republishing gets around it in one command.
3. **MISSED, expected: a full rewrite when the verifier has no witness.** `LOG VERIFIED`. A verifier that never saw the log has nothing to compare against (`lib/chain.ts`). With a witness it is caught, once item 0 is fixed.
4. **MISSED, harmless: an inactive member row added outside the log.** `memberMismatch` ignores rows with `active = false`. An inactive member can't write.
5. **MISSED, correct: delete everything and re-add identical rows.** The record is byte-for-byte the same, so there is nothing to catch.

Refused by the database: an entry with a duplicate `seq` (primary key), and a member row by SQL INSERT (no Timestamp literal).

## verify.mjs vs verify-standalone.mjs

They agree on all 36 attacks, both on main as it is and with the item 0 fix: same first line, same exit code. They also share the item 0 bug, because the standalone copy carries the same line.

## Full output, main as it is (`41c8bad`)

```
OK     control: no change
       LOG VERIFIED (exit 0)
CAUGHT delete the last 3 entries
       CHAIN HEAD CHANGED OUTSIDE THE LOG (head #7, last entry #4) (exit 1)
CAUGHT delete a middle entry (#3)
       TAMPERING AT #3 (exit 1)
CAUGHT edit a chat payload, hash unchanged
       TAMPERING AT #6 (exit 1)
CAUGHT edit a chat payload and recompute its hash
       TAMPERING AT #7 (exit 1)
MISSED edit a chat payload, recompute every later hash and chain_head
       LOG VERIFIED (exit 0)
MISSED same full rewrite, verifier has no witness
       LOG VERIFIED (exit 0)
CAUGHT payload number 1e309
       TAMPERING AT #6 (exit 1)
CAUGHT payload NaN (not JSON)
       TAMPERING AT #6 (exit 1)
CAUGHT payload -0 added
       TAMPERING AT #6 (exit 1)
CAUGHT duplicate keys, forged text FIRST (JSON.parse keeps the last)
       TAMPERING AT #6 (exit 1)
CAUGHT duplicate keys, forged text LAST
       TAMPERING AT #6 (exit 1)
CAUGHT same meaning, different bytes (spaces, \u escapes, key order)
       TAMPERING AT #3 (exit 1)
CAUGHT huge integer that rounds to the same double
       TAMPERING AT #7 (exit 1)
CAUGHT unicode lookalike in a chat (Cyrillic o)
       TAMPERING AT #5 (exit 1)
CAUGHT different normalization (NFC -> NFD) in a scope note
       TAMPERING AT #3 (exit 1)
CAUGHT "__proto__" key in a payload
       TAMPERING AT #6 (exit 1)
CAUGHT change the actor field
       TAMPERING AT #6 (exit 1)
CAUGHT change ts
       TAMPERING AT #6 (exit 1)
CAUGHT change type (chat -> incident_closed)
       TAMPERING AT #6 (exit 1)
CAUGHT swap two entries' seq (#5 <-> #6)
       TAMPERING AT #5 (exit 1)
N/A    insert a forged entry with a duplicate seq
       edit refused:     HTTP status client error (400 Bad Request) for url (http://127.0.0.1:3102/v1/database/<db>/sql)
MISSED delete everything and re-add the same rows
       LOG VERIFIED (exit 0)
MISSED delete the last 2 entries, append 2 valid new ones
       LOG VERIFIED (exit 0)
MISSED append a forged entry in another member's name (valid hash, chain_head moved)
       LOG VERIFIED (exit 0)
MISSED replay an old entry at the end (valid hash)
       LOG VERIFIED (exit 0)
CAUGHT edit chain_head only
       CHAIN HEAD CHANGED OUTSIDE THE LOG (head #7, last entry #7) (exit 1)
CAUGHT edit chain_head only, then an honest member writes
       TAMPERING AT #8 (exit 1)
MISSED cut the log and move chain_head back, then honest writes continue
       LOG VERIFIED (exit 0)
CAUGHT change a member's role in the member table
       MEMBER LIST CHANGED OUTSIDE THE LOG (c25e5e5e) (exit 1)
CAUGHT change a member's name in the member table
       MEMBER LIST CHANGED OUTSIDE THE LOG (c25e5e5e) (exit 1)
CAUGHT delete a member row
       MEMBER LIST CHANGED OUTSIDE THE LOG (c25e5e5e) (exit 1)
CAUGHT deactivate a member (active = false)
       MEMBER LIST CHANGED OUTSIDE THE LOG (c25e5e5e) (exit 1)
N/A    add a member row by SQL INSERT
       edit refused:     HTTP status client error (400 Bad Request) for url (http://127.0.0.1:3102/v1/database/<db>/sql)
CAUGHT add an active member row (owner republishes a modified module)
       MEMBER LIST CHANGED OUTSIDE THE LOG (c2777777) (exit 1)
MISSED add an inactive member row (modified module)
       LOG VERIFIED (exit 0)
MISSED forged member_added entry plus a matching member row (modified module)
       LOG VERIFIED (exit 0)

25 caught, 9 missed, 2 refused by the database, control OK
verify-standalone.mjs agrees with verify.mjs on every attack
```

## Full output, with the item 0 fix (temporary local patch, not committed)

Lines that differ from the run above:

```
CAUGHT delete the last 3 entries
       ROLLBACK DETECTED AT #5 (exit 1)
CAUGHT edit a chat payload, recompute every later hash and chain_head
       TAMPERING AT #7 (exit 1)
CAUGHT delete the last 2 entries, append 2 valid new ones
       TAMPERING AT #7 (exit 1)
CAUGHT cut the log and move chain_head back, then honest writes continue
       TAMPERING AT #7 (exit 1)

28 caught, 6 missed, 2 refused by the database, control OK
verify-standalone.mjs agrees with verify.mjs on every attack
```

## Run it again

```bash
spacetime start --listen-addr 127.0.0.1:3102 --data-dir "$TMPDIR/st-3102"
node scripts/redteam-claude.mjs            # all attacks, both verifiers, about 4 minutes
node scripts/redteam-claude.mjs --only member --keep
```

Exit code 1 means at least one attack was MISSED (expected: items 1 to 5 above), or the two verifiers disagreed. Start the server with its own `--data-dir`. A second server on the default data folder holds that folder's lock, so the team's 3001 can't start (see `docs/RUNBOOK-L1.md`, section 5).
