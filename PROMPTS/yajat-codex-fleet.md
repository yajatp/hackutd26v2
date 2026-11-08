Task: the live fleet: every oil site's status in one hook, and provision the sites

Context: Avon (repo yajatp/hackutd26v2). Your sites work is merged into mohan/live (`6318e2c`): `lib/sites.ts`, `npm run sites`, `npm run demo:reset:cloud`, `npm run cloud:check`. Make a branch `yajat/fleet` from the newest `origin/mohan/live`.

Yajat's Claude is building the US map page in parallel against the interface below, so match it exactly.

1. **Provision** on L1:
   - run `npm run sites` (local) and `npm run sites -- --cloud` (hosted, if logged in), and paste both summaries;
   - make `npm run cloud:check` accept `--site <key>` and `--all` (each site's `/console?site=<key>` must show LIVE and its own top card), and run it for all sites against https://avon-hackutd26.vercel.app.
2. **`lib/fleet.ts`**, the client hook the map uses. One connection per site database, built from `connectAvon` and `siteDatabase` in `lib/live.ts`. Do not change `lib/live.ts` except to export a helper you need. Subscribe only to the small public tables you need: `console_meta`, `alert`, `sensor_issue`, `fault`, and `lockdown` if the bindings have it.
   ```ts
   export interface SiteSummary {
     key: string; name: string; basin: string; city: string; state: string; lat: number; lon: number;
     db: string; status: "connecting" | "connected" | "disconnected";
     datasetId: string | null; facilities: number;
     pumpFailures: number; inspections: number; sensorIssues: number; simulatedFaults: number;
     plans: number; doNothing: number;              // dollars, from console_meta totals
     top: { facilityId: string; text: string } | null;   // the console's top card in one line
     lockdown: boolean;
   }
   export function useFleet(): { sites: SiteSummary[]; ready: boolean };   // ready when every site answered or timed out
   export function summarize(...): SiteSummary;   // pure: rows -> summary, tested
   ```
   - Close every connection on unmount.
   - Reconnect quietly, using `connectAvon`'s existing retry.
   - Never call reducers.
3. **Tests** (`node --test` or `npx tsx --test`): `summarize` on fixture rows (counts, money, top line), and a site with no database showing as disconnected rather than throwing.

Files: `lib/fleet.ts`, its test, `scripts/cloud-check.mjs`, `scripts/sites.mjs` if needed. Do not edit app code (the map is Claude's). Never run `next build` or `npm run build`. Never run `spacetime login` or print tokens.

Done when:
- the tests pass;
- the provisioning summaries and `cloud:check --all` output are pasted;
- `npx tsc --noEmit` is clean.

Commit on `yajat/fleet` with your own git identity and no AI-credit lines. Push only that branch. Mohan merges.
