PART 1 (now): a fake second oil site + a hardcode check

Context: our app (Avon, repo yajatp/hackutd26v2; you are in a clone of it on branch yajat/fake-site, made from origin/mohan/live) reads any EOG dataset folder
(network.json, ops.json, telemetry.csv; schemas in SPEC.md of github.com/nihaal419/HackUTD-ZeroDay).
EOG judges will load a folder we have never seen. We must prove our engine has nothing hardcoded.

Setup: EOG's data is already in ../eog-data next to this folder (../eog-data/history/full_week/ exists). Read its README.md, SPEC.md, history/README.md.
Do not open telemetry.csv in full; columns are timestamp,ts_unix,asset_id,metric,value (5-minute samples).

Task A: scripts/make-fake-site.mjs (Node 22, standard library only, no npm packages).
  Usage: node scripts/make-fake-site.mjs <source folder> <out folder> [--seed N]
  Writes a valid, DIFFERENT site from an EOG folder:
  - Rename every ID with one mapping (systems S1..S5 -> e.g. PB, DL, MW...; facility/well/tank/pump/
    pipeline IDs to new names that do not follow the S<n>_<KIND>_<letter> pattern). Drop one system.
  - Per facility pick k in [0.8, 1.3] (seeded): scale tank capacity_bbl, pump max_flow_bpd, each well's
    baseline_water_bpd, and the telemetry values inflow_bpd, water_bpd, flow_bpd, receive_flow_bpd by k.
    Tank level_pct stays the same (the physics stays consistent because flows and capacity scale together).
  - Per system shift disposal pressure_psi by d in [-150, +200] psi and shift that system's pressure_psi
    and discharge_psi readings by the same d.
  - ops.json: new prices (oil 55-80, gas 2-4), cost_per_trip, truck_capacity_bbl, fleet sizes,
    response_min / cycle_min (all seeded); keep expected_repair_hours.
  - Shift every timestamp by a whole number of days (both columns).
  - If the source has answer_key.json, write the transformed one too (renamed assets, shifted times,
    drop reference_action and costs, since prices changed). Our app never loads answer_key.json.
  Run it on history/full_week and history/mock_test_2026-10-10T1530 into ../eog-data/fake/<name>/.

Task B: scripts/hardcode-check.mjs (standard library only).
  Prints NOTHING and exits 0 when clean. Otherwise prints file:line: text for each hit and exits 1.
  Scan lib/**, spacetimedb*/src/**, app/** (skip *.test.ts, __fixtures__,
  module_bindings, node_modules). Flag: any EOG asset or system ID (read them from
  ../eog-data/history/full_week/network.json, do not hardcode the list), and numeric literals equal to
  ops.json / network.json constants that only make sense as data (905, 150 truck bbl, prices 60 and 3.0,
  disposal pressures, the +150 / +50 psi offsets, fleet sizes when they appear next to "fleet").
  Keep false positives low: report the line, let a human judge.

Done when: both fake folders exist; `node scripts/make-fake-site.mjs` is deterministic for the same seed
(run twice, diff is empty); each fake folder has the same number of telemetry rows as its source minus
the dropped system; `node scripts/hardcode-check.mjs` runs (paste its output, hits are fine at this point).
Commit on yajat/fake-site with your own git identity and push only that branch; never push to main or mohan/live, never force push.
Do not edit any other file in the repo.

PART 2 (about 3am, Mohan will say when): independent review
  Review the diff Mohan points you to (git diff <base>..<head>). Report only bugs that would break the
  demo path in docs/PLAN.md section 0, leaked secrets, or claims the code does not back.
  For each: file:line, what breaks, how to trigger it. No edits, no style notes.
