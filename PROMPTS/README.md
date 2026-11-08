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
| sreesh-claude-ui-audit.md | Sreesh (Claude Code) | UI audit (report only) + 90-second demo run sheet | none (no commits) |

Setup on Yajat's laptop, once:

```bash
git clone https://github.com/yajatp/hackutd26v2.git avon
git clone https://github.com/nihaal419/HackUTD-ZeroDay eog-data
cd avon
git switch -c yajat/attack origin/mohan/live
git worktree add ../avon-codex -b yajat/fake-site origin/mohan/live
```

Push only your own branch. Never push to main or mohan/live, never force push. Mohan merges.
