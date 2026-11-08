# Second independent review

Reviewed `0c828fb` against the first report. Statuses below use the original triggers; unless stated otherwise they are code rechecks, not fresh end-to-end demonstrations.

1. **PARTLY FIXED.** The demo script now explicitly has the judge carry the reference to Laptop 2; the button still does not create an incident there, and the root-delete drill still needs sufficient entries.
2. **PARTLY FIXED.** One browser now refuses a second concurrent load and batches from another identity are rejected after a new load takes the lock. But `load_dataset` still clears the live board and replaces the lock unconditionally (`spacetimedb/src/index.ts:132`); a second screen can interrupt an in-progress load. If the second screen fails to finish, the first cannot finish and the board remains empty. Repeated batches are deduplicated.
3. **PARTLY FIXED.** Failed-pump targets are sorted first; on the mock dataset this puts the intended tank first. The phone still labels a Fake fault LYING based on kind even when that tank's engine verdict is not LYING.
4. **FIXED.** `npm run demo` now exists and boots/publishes/ingests. The prior real-phone boot is recorded in the L1 runbook; not rerun for this review.
5. **NOT FIXED.** Untrusted clients can still call `load_dataset`, replace the dataset and clear the board, and call fault reducers. The load lock does not authorize those calls.
6. **NOT FIXED.** Reconnecting still uses plaintext `ws://` with reusable credentials on the local network; no transport change was found.
7. **PARTLY FIXED.** `chainStatus` catches an unhashable `1e309` payload and the browser should report tampering. On a disposable server, the CLI printed `TAMPERING AT #1` but then `verify: canonical: non-finite number` and exited 2: `scripts/verify.mjs:89` hashes the same bad entry again when explaining the verdict. Watch mode reports `CANNOT REACH THE BOX` instead. The browser was not opened against the disposable server.
8. **PARTLY FIXED.** The screen compares the member table against logged member changes. The independent CLI verifier still checks only the event log (`scripts/verify.mjs:51`): after changing a seeded member's role by owner SQL on a disposable database, it printed `LOG VERIFIED` and exited 0 with the saved witness. Browser behavior was not tested live.
9. **FIXED by code inspection.** The tripped-tank presentation was changed to account for an existing shut-in. The original full-week truncation was not rerun.
10. **PARTLY FIXED.** The accuracy document now acknowledges the rounding counterexample; the planner still returns the $95 plan for the original $92 counterexample, and broad cheapest-fix wording remains in the pitch.
11. **FIXED in the reviewed pitch.** PLAN now distinguishes physics checks on tank levels from silence checks on all sensors.

## Disposable-server attempts and limits

Started a separate in-memory SpacetimeDB on `127.0.0.1:3101`, published throwaway databases, seeded a member, and saved a verifier witness before each edit. Changed `payload_json` at sequence 1 to `{"x":1e309}` without changing its hash: the CLI result is in item 7. Changed a member's role from Commander to Viewer without a log entry: the CLI result is in item 8. No screen was connected to this server. Other suggested attacks (duplicate keys and sequences, unicode, head-only edits, replay and deletion/re-addition) were not exercised, so this is not a complete red-team pass.
