Build the Phone 1 "break a sensor" remote for Avon. You are in a clone of yajatp/hackutd26v2 (Next.js 15 + TypeScript + Tailwind 4) on branch yajat/attack, made from origin/mohan/live. Run `npm ci` first. EOG's data is in ../eog-data next to this folder (../eog-data/history/...).

Read first: docs/PLAN.md section 0 (lines 5-92; the 0:45-1:10 demo beat), then lib/attack.ts (the contract you build on).

What it is: a judge holds Phone 1 and taps Kill or Fake on a tank. Within seconds the main console shows that tank's sensor as DEAD ("No reading for 10 min. Last value 61%.") or LYING ("Physics says +9.1 pts/h. Sensor says 0."). Every injected fault is labeled SIMULATED, because EOG's real data has no broken sensors.

Build app/attack/page.tsx ("use client"), phone-first:
- Uses ONLY useAttack() from lib/attack.ts (status, targets, active, inject, clear). Do not call Spacetime or any API directly; the main session wires the real backend behind useAttack() later without changing its types.
- A target picker (big buttons, one per target label) and three big action buttons: Kill (sensor goes silent), Fake (sensor freezes at its current value), Drift (sensor slowly drifts). Tapping one calls inject(kind, asset_id).
- A permanent banner: "SIMULATED: these faults are injected for the demo. EOG's data has no broken sensors."
- The active faults list with a Clear button each, and Clear all.
- Status: show DISCONNECTED in red when status is "disconnected", "Connecting..." when connecting.
- Readable on a phone at arm's length: buttons at least 56 px tall, high contrast, works in light and dark mode, no horizontal scroll at 360 px width.
- No new dependencies, no fonts or scripts from the internet (the demo box runs offline).

Rules: only create app/attack/** files. Do not edit lib/attack.ts or anything else (other agents own those files tonight). Commit on yajat/attack with your own git identity; push only that branch (git push origin yajat/attack); never push to main or mohan/live, never force push.
Done when: `npx tsc --noEmit` shows no errors in app/attack, `npx eslint app/attack` passes, and `npm run dev` then http://localhost:3000/attack works at 360x740 (paste a screenshot or describe what you checked).
