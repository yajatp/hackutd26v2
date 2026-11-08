# Darkroom red team, independent pass (Claude)

A second pass next to Codex's `scripts/redteam.mjs` / `REDTEAM.md`. It covers the attacks review-2 listed but skipped, plus a few more. App code at `995d22e` (main), after the review-2 fixes. Nothing in the app was changed.

**How:** `scripts/redteam-claude.mjs`. Each attack gets its own steps:

1. A fresh throwaway database `rt-c<n>` on its own throwaway server: `127.0.0.1:3102`, with its own `--data-dir`. Never 3001 or 3101.
2. A normal 8-entry log built through the reducers: the owner's genesis, `seed_member` Sreesh/Responder, `open_incident`, 2 `scope_update`, 2 `chat`, and 1 `evidence_imported`.
3. A witness saved by `scripts/verify.mjs --witness`.
4. One edit as the box owner, using `spacetime sql` (and once a republished module).
5. `verify.mjs` run again.

CAUGHT means `verify.mjs` printed TAMPERING, ROLLBACK DETECTED or MEMBER LIST CHANGED and exited 1.

**About the screens:** `/box` and `/witness` connect only to `ws://<host>:3001`, database `darkroom`, so I could not point them at the throwaway server. They run the same `chainStatus` → `memberMismatch` → `advanceWitness` on the same `rowToEvent` rows (`lib/darkroom-live.ts:193`), so the verdicts below are what they would show. Not checked in a browser.

**Result: 24 caught, 10 missed, 2 refused by the database. The control (no edit) verified.**

## What matters, most serious first

1. **MISSED: the owner can append a forged entry in anyone's name, and every witness accepts it.** I appended a chat with a valid hash and a moved `chain_head`, signed as `Sreesh|Responder|<Sreesh's identity>`: "I wiped the historian backups myself." Result: `LOG VERIFIED`, and the witness moves forward to include it. `/box` would show it as Sreesh's line. Replaying an old entry at the end is the same attack and is also missed.
   - Why: an entry's hash proves only its position in the chain, not who wrote it. `actor` is plain text, and nothing is signed with a key only that member holds. The witness freezes the past, not the future.
   - A judge would see this as a real hole if they asked "can root add a fake entry?" The honest answer is yes.
   - Fix (bigger than a hack night): members sign entries with a device key whose public half is in the `member_added` entry, and verifiers check the signatures. Until then, the pitch line "Nobody can quietly rewrite what happened" is accurate. "Nobody can fake an entry" is not.
2. **MISSED: the owner can add a member who is consistent with the log.** I republished a modified module **without `--delete-data`** (any database owner can) to insert a member row, plus a matching forged `member_added` entry. Result: `LOG VERIFIED`. The member check compares the table only with the log, and the owner can extend both. This is the same root cause as item 1.
   - Also: "SQL cannot insert a member row" is not protection. `spacetime sql` INSERT into `member` fails only because SQL in SpacetimeDB 2.14 has no Timestamp literal. Republishing gets around it in one command.
3. **MISSED: duplicate keys with the forged value first.** Payload `{"text":"Backups are gone.","text":"Backups are intact, checked at 02:40."}` gives `LOG VERIFIED`. `JSON.parse` keeps the last key, so the hash, the screens and `--export` all see the original text. Anyone reading the table directly (`spacetime sql`, a forensics dump) sees "Backups are gone." first.
   - The stored bytes no longer match what was hashed, and nothing notices. With the forged value last, it is caught.
   - Fix (one line, same idea for items 4 and 5): treat a row as tampered when `payload_json !== canonical(JSON.parse(payload_json))`. The module always writes canonical JSON (`spacetimedb-darkroom/src/index.ts`, `appendEntry`), so an honest row always passes.
4. **MISSED, harmless: same meaning in different bytes.** Extra spaces, `A` escapes or a different key order in `payload_json` give `LOG VERIFIED`. The parsed payload, and so what every screen shows, is unchanged. The fix in item 3 would catch it.
5. **MISSED, harmless: a huge integer that rounds to the same double.** `9007199254740992` changed to `...993` gives `LOG VERIFIED`. The module never writes numbers in payloads today (every field is text). The fix in item 3 would catch it.
6. **MISSED: editing only `chain_head` passes, and the next honest entry is blamed.** Setting `chain_head.hash` to garbage gives `LOG VERIFIED`, because `verify.mjs` never reads `chain_head`. The module then writes the next honest entry on top of the bad head. After an honest chat, verify reports `TAMPERING AT #8`: the honest member's entry, not the owner's edit.
   - Moving `chain_head` back after deleting entries also gets around the module's "log is cut" guard: honest writes continue on the cut log. The witness still catches it (`TAMPERING AT #7`), but the label says tampering, not rollback.
   - Fix: verify and the screens check that `chain_head` (public) equals the last entry's seq and hash, and report the head itself when it doesn't.
7. **MISSED, expected: a full rewrite (edit, recompute every later hash and `chain_head`) when the verifier has no witness.** `LOG VERIFIED`. With a witness it is caught (`TAMPERING AT #7`). This is the documented limit in `lib/chain.ts`: a verifier that never saw the log has nothing to compare against.
8. **MISSED, harmless: an inactive member row added outside the log.** `memberMismatch` ignores rows with `active = false`. An inactive member can't write, so nothing is shown or allowed.
9. **MISSED, correct: delete everything and re-add identical rows.** `LOG VERIFIED`. The record is byte-for-byte the same, so there is nothing to catch.

## Caught (24)

Delete the last 3 (`ROLLBACK DETECTED AT #5`). Delete a middle entry. Edit a payload with the hash unchanged, with only its hash recomputed, or with every later hash and `chain_head` recomputed (witness). 1e309: now `TAMPERING AT #6` with exit 1; the review-2 crash is fixed. `NaN`. `-0` added. Duplicate keys with the forged value last. Cyrillic lookalike. NFC → NFD. `__proto__` key. Changed actor, ts, type. Swapped seq. Delete the last 2 and append 2 valid ones (witness: `TAMPERING AT #7`). Head-only edit followed by an honest write. Cut log with `chain_head` moved back. Member table: role, name, delete, deactivate, and an active row added by republished module (`MEMBER LIST CHANGED OUTSIDE THE LOG`).

Refused by the database: an entry with a duplicate `seq` (primary key), and a member row by SQL INSERT (no Timestamp literal; see item 2 for the way around it).

## Full output

```
OK     control: no change
       LOG VERIFIED (exit 0)
CAUGHT delete the last 3 entries
       ROLLBACK DETECTED AT #5 (exit 1)
CAUGHT delete a middle entry (#3)
       TAMPERING AT #3 (exit 1)
CAUGHT edit a chat payload, hash unchanged
       TAMPERING AT #6 (exit 1)
CAUGHT edit a chat payload and recompute its hash
       TAMPERING AT #7 (exit 1)
CAUGHT edit a chat payload, recompute every later hash and chain_head
       TAMPERING AT #7 (exit 1)
MISSED same full rewrite, verifier has no witness
       LOG VERIFIED (exit 0)
CAUGHT payload number 1e309
       TAMPERING AT #6 (exit 1)
CAUGHT payload NaN (not JSON)
       TAMPERING AT #6 (exit 1)
CAUGHT payload -0 added
       TAMPERING AT #6 (exit 1)
MISSED duplicate keys, forged text FIRST (JSON.parse keeps the last)
       LOG VERIFIED (exit 0)
CAUGHT duplicate keys, forged text LAST
       TAMPERING AT #6 (exit 1)
MISSED same meaning, different bytes (spaces, \u escapes, key order)
       LOG VERIFIED (exit 0)
MISSED huge integer that rounds to the same double
       LOG VERIFIED (exit 0)
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
CAUGHT delete the last 2 entries, append 2 valid new ones
       TAMPERING AT #7 (exit 1)
MISSED append a forged entry in another member's name (valid hash, chain_head moved)
       LOG VERIFIED (exit 0)
MISSED replay an old entry at the end (valid hash)
       LOG VERIFIED (exit 0)
MISSED edit chain_head only
       LOG VERIFIED (exit 0)
CAUGHT edit chain_head only, then an honest member writes
       TAMPERING AT #8 (exit 1)
CAUGHT cut the log and move chain_head back, then honest writes continue
       TAMPERING AT #7 (exit 1)
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

24 caught, 10 missed, 2 refused by the database, control OK
```

## Run it again

```bash
spacetime start --listen-addr 127.0.0.1:3102 --data-dir "$TMPDIR/st-3102"
node scripts/redteam-claude.mjs            # all attacks, about 3 minutes
node scripts/redteam-claude.mjs --only member --keep
```

Exit code 1 means at least one attack was MISSED, which is expected today. Run it with the server started with its own `--data-dir`. A second server on the default data folder holds that folder's lock, so the team's 3001 can't start (see `docs/RUNBOOK-L1.md`, section 5).
