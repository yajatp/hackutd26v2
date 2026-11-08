Task: make the printed Darkroom record something a judge wants to keep (`/report`)

Context: Avon (repo yajatp/hackutd26v2). Setup, once:
```bash
git clone https://github.com/yajatp/hackutd26v2.git avon && cd avon
git switch -c sreesh/report-print origin/mohan/live
npm ci
```
Read `docs/PLAN.md` section 0, `docs/DESIGN.md`, `docs/ARCHITECTURE.md` (Darkroom half) and every file in `app/report/`.
The demo ends with the judge printing the incident record from the isolated Darkroom box. It lists every entry in the hash-chained log, the evidence with its AV- reference, and the chain status (VERIFIED, ROLLBACK DETECTED AT #k, or TAMPERING AT #k). The paper is the thing the judge walks away with, and it's what the Design judges will hold. Right now it is a plain web page.

Build (presentation only):
1. A real print design for US Letter (`@media print` in `app/report/report.css`, plus markup changes in `ReportView.tsx`). Page 1 shows, from top to bottom:
   - the incident title;
   - the chain status, worded exactly as the screen says it, big;
   - the head fingerprint, large enough to compare by eye with the box screen;
   - who was in the room;
   - the time it opened and closed.
2. Draw the log as a chain. Each entry shows seq, time, author, type, its payload in one line, and the first 8 hex of its hash. A visible link shows that each entry's prev_hash is the hash of the entry above it. Never split an entry across pages (`break-inside: avoid`). If the status is ROLLBACK or TAMPERING, mark the entry where it breaks in red. Red means only that.
3. Evidence: the AV- reference in monospace and who collected it. Then "How to verify this yourself" with the real commands from `app/report/` (keep them correct).
4. Colors from `docs/DESIGN.md` for paper: ink `#102231` on white, secondary `#4a5a63`, DIN font stack, no web fonts (the box is offline). It has to look right in grayscale too.
5. The on-screen `/report` keeps working and gets the same typography.

Do not change what the report says or how it is computed: no edits to `app/report/model.ts` logic or to `lib/**`. Files you own: `app/report/ReportView.tsx`, `app/report/report.css`, and new files under `app/report/` only. Keep `app/report/report.test.tsx` passing (`npx tsx --test app/report/report.test.tsx`). Update it only if you change markup the test reads, and say so. No dependencies. Do not run `next build` or `npm run build`.

To see real data, either:
- run the Darkroom locally (`npm run demo:darkroom` needs SpacetimeDB 2.14.1: `curl -sSf https://install.spacetimedb.com | sh`);
- or, simpler, render `ReportView` with the fixture from `report.test.tsx` on a preview route `app/report/preview/page.tsx`, clearly marked SAMPLE.

Check the print with Chrome's print preview, or with Playwright `page.pdf({ format: "Letter" })`. Check it for a clean record and for one with a rollback.

Done when the tests pass, `npx tsc --noEmit` and `npx eslint app/report` show no errors in `app/report`, and you post the PDF pages (clean and rollback) as images to the team.

Then commit on `sreesh/report-print` with your own git identity. No AI-credit lines, and keep the word "Claude" out of commit messages. Push only that branch, never to main or mohan/live, never force push. Mohan merges.

PART 2 (after PART 1, report only, no edits): a fresh-eyes design review of `/vr` and `/spacetime` once Mohan says they are on mohan/live. Use the rules in `docs/DESIGN.md`. List what reads as generic or templated, what a first-time judge would not understand in 5 seconds, and anything broken at 390 px or in the Quest Browser. One line each, with the fix.
