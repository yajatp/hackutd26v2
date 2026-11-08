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
| yajat-codex-quest-perf.md | Yajat (Codex), in `avon-codex/`, after quest.mjs | `scripts/quest-perf.mjs`: frame time, draw calls and offline check for /twin and /vr; baseline in docs/QUEST-PERF.md | yajat/quest-perf |
| yajat-codex-cloud.md | Yajat (Codex), in `avon-codex/` | Between-judges reset and a smoke check for the hosted copy (Vercel + SpacetimeDB maincloud `avon-hackutd26`) | yajat/cloud |
| yajat-claude-lockdown-avon.md | Yajat (Claude Code) | LOCKDOWN on the Avon side (docs/LOCKDOWN.md): lockdown table and reducers, the console's shutter-and-evidence sequence, Phone 1 and banners | yajat/lockdown |
| sreesh-claude-lockdown-darkroom.md | Sreesh (Claude Code) | LOCKDOWN on the Darkroom side: /box seals, the hash chain drawn live, witness ticks, the crack on rollback | sreesh/lockdown-darkroom |
| sreesh-claude-darkroom-theme.md | Sreesh (Claude Code), same session after lockdown | The Darkroom side in theme ('secure room': ethiack teal, mint for verified, Pixelify status words) with motion on everything: /box, /witness, /join, plus motion on /spacetime | sreesh/lockdown-darkroom or sreesh/darkroom-theme |
| yajat-codex-sites.md | Yajat (Codex), after the cloud prompt | Oil sites across America: a site registry, `--center` for fake sites, one SpacetimeDB database per site, local and hosted | yajat/sites |
| yajat-codex-fleet.md | Yajat (Codex), after sites | Provision the sites (local and hosted), `cloud:check --all`, and `lib/fleet.ts`: every site's live status in one hook | yajat/fleet |
| yajat-claude-map.md | Yajat (Claude Code), after lockdown | `/map`: zoomable US map (own Albers projection, offline GeoJSON), live site markers, a site panel with links, and a site comparison | yajat/map |

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
