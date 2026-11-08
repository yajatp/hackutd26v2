# Python prototypes (reference for the TypeScript port)

Stdlib-only Python that the TS engine in `lib/eog/` is ported from. Data comes from `EOG_DIR`
(default `../eog-data`, a copy of github.com/nihaal419/HackUTD-ZeroDay).

| File | What it does | Check |
|---|---|---|
| `detect.py` | Finds pump failures, worn pumps, leaks; countdown for failures | `python3 -I evaluate.py`: full_week 23/23, 0 false positives |
| `planner.py` | Cheapest truck / shut-in / do-nothing plan, shared fleet | `python3 -I validate.py ../../eog-data`: 20/20 + opening scene |
| `make_fixtures.py` | Wrote `lib/eog/__fixtures__/fixtures.json` (91 planner cases) | |
| `htl_test.py` | Countdown smoothing vs the answer key | |

`lib/eog/__fixtures__/detect_<folder>.json` is `detect.py --json` output for each history folder.
