# Prompts for teammate agents

Paste one file into one agent. Each job owns its own files and branch, so the agents never collide.

| File | Who runs it | Job | Branch |
|---|---|---|---|
| yajat-claude-attack-remote.md | Yajat (Claude Code), in `avon/` | Phone 1 Kill / Fake / Drift remote at `app/attack/` | yajat/attack |
| yajat-codex-fake-site.md | Yajat (Codex), in `avon-codex/` | Fake second oil site + hardcode check; later a review | yajat/fake-site |
| yajat-claude-boot-l1.md | Yajat (Claude Code), in `avon/`, after the remote | Boot Avon on L1 from cold, phone over the hotspot, one-command boot + runbook | yajat/boot |
| yajat-codex-review.md | Yajat (Codex), in `avon-codex/`, after the fake site | Independent review of tonight's code, findings in REVIEW-codex.md | yajat/review |
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
