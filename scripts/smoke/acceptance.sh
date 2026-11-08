#!/usr/bin/env bash
# Acceptance checks for scripts/smoke.mjs (A1-A6). Slow: runs the smoke test 5 times.
#   bash scripts/smoke/acceptance.sh
# Prints one PASS/FAIL line per check, then ACCEPTANCE PASSED or ACCEPTANCE FAILED (n).
cd "$(dirname "$0")/../.." || exit 2
HTTP=http://127.0.0.1:3001
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
fails=0
check() { if [ "$1" = 0 ]; then echo "PASS  $2"; else echo "FAIL  $2"; fails=$((fails + 1)); fi; }
sql() { curl -s -X POST --data "$2" "$HTTP/v1/database/$1/sql"; }
rows() { python3 -c 'import json,sys; print(len(json.load(sys.stdin)[0]["rows"]))'; }
val() { sql "$1" "$2" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["rows"])'; }

# Row values only (the response also carries a timing that changes on every call).
AVON_BEFORE=$(val avon 'SELECT dataset_id FROM console_meta')
AVON_LOAD_BEFORE=$(val avon 'SELECT loaded_at FROM config')
DARK_BEFORE=$(val darkroom 'SELECT COUNT(*) AS n FROM event_log')
DARK_HEAD_BEFORE=$(val darkroom 'SELECT * FROM chain_head')
echo "before: avon dataset_id $AVON_BEFORE loaded_at $AVON_LOAD_BEFORE; darkroom event_log $DARK_BEFORE"


# A1: one run passes the golden path.
npm run smoke >"$OUT/a1" 2>&1; code=$?
tail -1 "$OUT/a1" | grep -qx 'SMOKE PASSED'; check $(( $? + code )) "A1 npm run smoke ends with SMOKE PASSED and exit 0 (exit $code)"
! grep -q '^FAIL' "$OUT/a1"; check $? "A1 no FAIL lines"
[ "$(grep -c '^PASS' "$OUT/a1")" -ge 7 ]; check $? "A1 at least 7 PASS lines"
grep '^PASS' "$OUT/a1" | grep -q 'avon-smoke' && grep '^PASS' "$OUT/a1" | grep -q 'darkroom-smoke'; check $? "A1 (1) both smoke databases published"
grep '^PASS' "$OUT/a1" | grep -q 'S5_PUMP_C' && grep '^PASS' "$OUT/a1" | grep -q '2\.0[0-9] h' && grep '^PASS' "$OUT/a1" | grep -q '905' && grep '^PASS' "$OUT/a1" | grep -q 'sensor_issue empty'; check $? "A1 (2) top alert S5_PUMP_C, ~2.05 h, plan 905, sensor_issue empty"
grep '^PASS' "$OUT/a1" | grep 'S5_TANK_C' | grep 'lying' | grep 'simulated true' | grep -qE 'Physics says .+ Sensor says 0\. Off for [0-9]+ min\.'; check $? "A1 (3) fake_flat makes S5_TANK_C lying, simulated, with evidence text"
grep '^PASS' "$OUT/a1" | grep -qE 'AV-[0-9A-F]{4}-[0-9A-F]{4}'; check $? "A1 (4) evidence ref AV-XXXX-XXXX"
grep '^PASS' "$OUT/a1" | grep 'evidence_imported' | grep -qE '\|Responder\|[0-9a-f]{64}'; check $? "A1 (5) evidence_imported actor ends with |Responder|<hex>"
grep '^PASS' "$OUT/a1" | grep -E 'ROLLBACK DETECTED AT #[0-9]+' | grep -q 'verify.mjs'; check $? "A1 (6) client and verify.mjs both say ROLLBACK DETECTED"
grep '^PASS' "$OUT/a1" | grep -q 'clear_fault'; check $? "A1 (7) clear_fault ran"
[ "$(sql avon-smoke 'SELECT * FROM fault' | rows)" = 0 ]; check $? "A1 avon-smoke fault table empty afterwards"
# 'SELECT 1' is HTTP 400 on this server ("Unsupported projection expression"); a missing database is 404.
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST --data 'SELECT * FROM event_log' "$HTTP/v1/database/darkroom-smoke/sql")" = 200 ]; check $? "A1 darkroom-smoke left in place"

# A2: three runs in a row.
npm run smoke -- --runs 3 >"$OUT/a2" 2>&1; code=$?
tail -1 "$OUT/a2" | grep -qx 'SMOKE PASSED'; check $(( $? + code )) "A2 --runs 3 ends with SMOKE PASSED and exit 0 (exit $code)"
! grep -q '^FAIL' "$OUT/a2"; check $? "A2 no FAIL lines"
[ "$(grep -c '^PASS' "$OUT/a2")" -ge 21 ]; check $? "A2 at least 21 PASS lines"
[ "$(grep -cE '^run [123]/3 passed in [0-9.]+ s' "$OUT/a2")" = 3 ]; check $? "A2 three runs, each with its own timing"
! grep -qE 'log is cut|stale head' "$OUT/a2"; check $? "A2 no 'log is cut' or 'stale head'"

# A4 output check: no JWT in the output.
[ "$(cat "$OUT/a1" "$OUT/a2" | grep -cE 'eyJ[A-Za-z0-9_-]{10,}')" = 0 ]; check $? "A4 no token in the output"

# A5: a folder where the golden path cannot hold fails cleanly.
npm run smoke -- --folder "${EOG_DIR:-../eog-data}"/history/full_week >"$OUT/a5" 2>&1; code=$?
[ "$code" = 1 ]; check $? "A5 full_week exits 1 (exit $code)"
grep -q '^FAIL' "$OUT/a5"; check $? "A5 at least one FAIL line"
tail -1 "$OUT/a5" | grep -qE '^SMOKE FAILED \([1-9][0-9]*\)$'; check $? "A5 ends with SMOKE FAILED (n)"
! grep -qE '^\s+at .+:[0-9]+:[0-9]+\)?$' "$OUT/a5"; check $? "A5 no stack trace"

# A3: the real databases did not change.
[ "$(val avon 'SELECT dataset_id FROM console_meta')" = "$AVON_BEFORE" ]; check $? "A3 real avon console_meta dataset_id unchanged ($AVON_BEFORE)"
[ "$(val avon 'SELECT loaded_at FROM config')" = "$AVON_LOAD_BEFORE" ]; check $? "A3 real avon not reloaded (config.loaded_at $AVON_LOAD_BEFORE)"
[ "$(val darkroom 'SELECT COUNT(*) AS n FROM event_log')" = "$DARK_BEFORE" ]; check $? "A3 real darkroom event_log count unchanged ($DARK_BEFORE)"
[ "$(val darkroom 'SELECT * FROM chain_head')" = "$DARK_HEAD_BEFORE" ]; check $? "A3 real darkroom chain_head unchanged"

# A6: static checks.
npx tsc --noEmit >"$OUT/tsc" 2>&1; check $? "A6 tsc --noEmit clean"
npx eslint scripts/smoke.mjs scripts/smoke >"$OUT/eslint" 2>&1; check $? "A6 eslint clean"
node --test 'scripts/smoke/*.test.mjs' >"$OUT/unit" 2>&1; check $? "A6 unit tests (node --test 'scripts/smoke/*.test.mjs')"
changed=$(git diff --name-only HEAD -- package.json scripts/ingest.mjs scripts/tamper.mjs scripts/verify.mjs scripts/darkroom-seed.mjs scripts/darkroom-reset.mjs spacetimedb/src spacetimedb-darkroom/src | tr '\n' ' ')
[ -z "$changed" ]; check $? "A6 protected files unchanged${changed:+ (differ from HEAD: $changed- not written by the smoke lane, check other lanes)}"
mine=$(git status --porcelain | grep -E 'scripts/smoke' | tr '\n' ' ')
[ "$mine" = "?? scripts/smoke.mjs ?? scripts/smoke/ " ]; check $? "A6 smoke lane entries are only ?? scripts/smoke.mjs and ?? scripts/smoke/ (got: $mine)"

for f in a1 a2 a5 tsc eslint unit; do [ -s "$OUT/$f" ] && grep -E '^(FAIL|SMOKE|run [0-9]|.*error)' "$OUT/$f" | head -20 | sed "s/^/  [$f] /"; done
if [ "$fails" = 0 ]; then echo "ACCEPTANCE PASSED"; else echo "ACCEPTANCE FAILED ($fails)"; exit 1; fi
