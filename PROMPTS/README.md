# Prompts for teammate agents

Paste one file into one agent. Each job owns its own files and branch, so the agents never collide.

| File | Who runs it | Job | Branch |
|---|---|---|---|
| yajat-claude-attack-remote.md | Yajat (Claude Code), in `avon/` | Phone 1 Kill / Fake / Drift remote at `app/attack/` | yajat/attack |
| yajat-codex-fake-site.md | Yajat (Codex), in `avon-codex/` | Fake second oil site + hardcode check; later a review | yajat/fake-site |
| yajat-claude-boot-l1.md | Yajat (Claude Code), in `avon/`, after the remote | Boot Avon on L1 from cold, phone over the hotspot, one-command boot + runbook | yajat/boot |
| yajat-claude-l1-check.md | Yajat (Claude Code), in `avon/` | Run the whole Avon side on L1 like judging day: smoke x3, fake site, phone, reset | yajat/l1-check |
| yajat-codex-review.md | Yajat (Codex), in `avon-codex/`, after the fake site | Independent review of tonight's code, findings in REVIEW-codex.md | yajat/review |
| yajat-claude-reset-l1.md | Yajat (Claude Code), in `avon/` | Between-judges reset for L1: `npm run demo:reset` | yajat/reset |
| yajat-codex-review-2.md | Yajat (Codex), in `avon-codex/`, after "Fix review findings" lands | Re-check the first review, red-team the Darkroom on a throwaway server | yajat/review-2 |
| yajat-codex-redteam.md | Yajat (Codex), in `avon-codex/` | Automated red-team suite for the Darkroom log: CAUGHT / MISSED per attack, REDTEAM.md | yajat/redteam |
| yajat-claude-redteam-rerun.md | Yajat (Claude Code) | Rerun the red-team suite after the fixes; both verifiers must agree | yajat/redteam-rerun |
| yajat-codex-architecture.md | Yajat (Codex), in `avon-codex/` | Draft docs/ARCHITECTURE.md for the Spacetime judges (Mohan approves the text) | yajat/architecture |
| sreesh-claude-ui-audit.md | Sreesh (Claude Code) | UI audit (report only) + 90-second demo run sheet | none (no commits) |
| yajat-claude-spacetime-live.md | Yajat (Claude Code), in `avon/` | `/spacetime`: live feed of avon row changes and a reducer-by-table matrix, for the SpacetimeDB judges | yajat/spacetime-live |
| yajat-codex-quest.md | Yajat (Codex), in `avon-codex/` | `scripts/quest.mjs`: adb checks, reverse both ports, open /vr on the Quest 3S, `--watch` | yajat/quest |
| sreesh-claude-report-print.md | Sreesh (Claude Code), own clone | Print design for the Darkroom record at `/report`; then a design review of /vr and /spacetime | sreesh/report-print |
| yajat-claude-l1-test.md | Yajat (Claude Code), worktree `../avon-test` if `avon/` is busy | Test the merged demo on L1 now: judge flow x3 with a real phone, smoke, Quest 3S browser-flag route | yajat/l1-test-2 |

Setup on Yajat's laptop, once:

```bash
git clone https://github.com/yajatp/hackutd26v2.git avon
git clone https://github.com/nihaal419/HackUTD-ZeroDay eog-data
cd avon
git switch -c yajat/attack origin/mohan/live
git worktree add ../avon-codex -b yajat/fake-site origin/mohan/live
```

New judge-facing pages follow `docs/DESIGN.md`.

Push only your own branch. Never push to main or mohan/live, never force push. Mohan merges.
