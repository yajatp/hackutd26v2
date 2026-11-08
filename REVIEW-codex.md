# Avon independent demo review

Reviewed `53a8cfd..877054a` against the 90-second path in `docs/PLAN.md` section 0. I used the existing EOG datasets, direct engine calls, and a disposable loopback SpacetimeDB 2.14.1 instance for the Avon reducer authorization check.

On the intended mock dataset, the clean top card showed S5 Facility C, a 2h 03m countdown, and one truck for one trip at $905. The same tank produced DEAD with a 10-minute gap under Kill and LYING with a flat reading under Fake. Both were marked SIMULATED in the engine output.

1. **Demo-breaking | `app/console/Board.tsx:33` and `app/box/BoxScreen.tsx:199`.** The final beat promises that clicking the console button opens an incident on Laptop 2. After Fake on S5 Facility C, click **Open an incident in the Darkroom**. The click only displays a reference on Laptop 1. Laptop 2 still requires a Commander to type a title, open the incident, and log the reference in a separate form. With only the publisher, box screen enrollment, and one new incident in the log, the root-delete drill also refuses to run because it needs four entries (`scripts/tamper.mjs:30`).

2. **Demo-breaking | `app/console/page.tsx:116`, `lib/live.ts:212`, and `spacetimedb/src/index.ts:181`.** Two folder loads can clear and write the same global reading table. On the console, double-click the mock dataset button while it says **Reading**, or load it from two screens at once. If both `load_dataset` calls finish before either upload sends its batches, both send rows into the same table. I reproduced the interleaving with the real upload code and stubbed reducers. It sent 48,810 rows for 24,405 distinct facility and timestamp pairs. The server's row check rejects that count and the previous board was already cleared.

3. **Demo-breaking | `app/attack/page.tsx:64` and `app/attack/page.tsx:154`.** The phone labels a selected Fake fault **LYING · ON** based on its kind, regardless of the engine's verdict. Load the mock dataset and tap Fake without changing the default target, S1 Facility A. Replaying the reducer's 30-minute flat fault produces no LYING alert for that tank on the laptop. This also happens on seven other mock tanks. Selecting S5 Facility C produces the promised alert.

4. **Demo-breaking | `README.md:5`, `docs/PLAN.md:83`, and `package.json:5`.** A fresh checkout following the judge instructions starts Next without publishing or ingesting the Avon database. The root page redirects to the subscription-only console, which has no alerts to show. The alternative command listed in the plan, `npm run demo`, exits with `Missing script: "demo"`.

5. **Security | `spacetimedb/src/index.ts:111`, `:148`, `:221`, `:229`, and `:243`.** The Avon reducers have no caller checks. On the disposable instance, a fresh second client injected and cleared faults in another client's dataset. It then called `loadDataset({ networkJson: '{"systems":[]}', opsJson: '{}', datasetId: 'replaced' })` without uploading readings. The call erased the existing readings and the original client's next `finishIngest` failed with `no readings`. Any client that can reach the demo port can do this.

6. **Security | `lib/darkroom-live.ts:114`.** The Darkroom sends reusable member credentials over plaintext on reconnect. On a test LAN with traffic visible to another host, reload a browser enrolled as Commander. The installed SDK uses the stored member token as an HTTP Bearer credential in its request to `/v1/identity/websocket-token` when the connection URL is `ws://`. A host that can observe that request can reuse the credential to submit writes as the Commander. I verified the transport path in the installed SDK without capturing a credential.

7. **Security | `lib/darkroom-live.ts:193`, `lib/rules/darkroom/replay.ts:138`, and `lib/chain.ts:35`.** A crafted edit by the box owner can suppress the tamper warning on devices that already witnessed the log. In a disposable copy of a witnessed log, change a row's `payload_json` to `{"x":1e309}` while leaving its hash unchanged. The row parser accepts it as JSON and hashing throws `canonical: non-finite number`. I reproduced the exception through `rowToEvent` and `chainStatus`. The browser's scheduled recompute has no catch and leaves its previous status displayed. The CLI verifier reports an error instead of a tamper verdict.

8. **Security | `spacetimedb-darkroom/src/index.ts:64` and `lib/darkroom-live.ts:181`.** The browser displays member rows from a separate mutable table and only verifies `event_log`. With owner SQL access in a disposable box, change an enrolled Viewer's role in `member` to Commander without adding a log entry. The role shown on the screen and used by `openIncident` changes without a witness alert. The next incident is hashed normally under the altered role. This contradicts the box's statement at `app/box/BoxScreen.tsx:142` that every change shown is in the log. Verified by tracing the authorization and subscription paths.

9. **Wrong claim | `lib/eog/planner.ts:164` and `:270`.** The planner reports a tank that already tripped as a $0 plan with no trip. Copy `history/full_week` and truncate its telemetry at 2026-10-08 06:00 UTC, keeping that sample. Avon validates the folder. S1 Facility C is at the 92% limit, all three wells have already shut in, and the repair ends at 06:20 UTC. The countdown says **at shutdown now**, but the card shows a $0 **Nothing** plan with no trip time or loss. Zero live inflow makes `noActionTripMin` return infinity before the planner accounts for the shutdown already in progress.

10. **Wrong claim | `lib/eog/planner.ts:205` and `docs/planner-accuracy.md:32`.** The documented claim that the planner is exact on exact inputs fails once shut-ins are rounded to whole minutes. Call `planJoint` with one 100 bbl tank at 88.7%, a 92% shutdown limit, 20 minutes of repair remaining, no trucks, and two wells producing 144 and 1,008 bpd of water with daily revenues of $1,440 and $7,200. The planner shuts the second well at +1 min for $95. Shutting that well at +2 min and the first well at +18 min costs $92 and peaks at 91.9%, which `simulate` accepts.

11. **Wrong claim | `docs/PLAN.md:13` and `lib/rules/health.ts:54`.** The short pitch says every sensor is checked against physics. The drift and lie checks only attach to tank level series. For example, `healthOf(ds, pumpId, "flow_bpd")` checks whether the pump-flow series went silent. A fresh but incorrect flow reading can contribute to a tank-level warning or a detector alert without the pump-flow sensor itself receiving a physics verdict.

No committed credentials matching the private key, GitHub token, AWS key, or JWT patterns checked were found in the diff. The Darkroom reducers derive the actor from `ctx.sender` and reject wrong roles, stale heads, and writes to a closed incident through the normal reducer path.

## Requested checks

`npm ci` exited 0. It warned that Node 22.17.0 falls outside the installed SpacetimeDB package's declared range. The last lines also reported dependency advisories.

```text
added 524 packages, and audited 531 packages in 16s

184 packages are looking for funding
  run `npm fund` for details

8 vulnerabilities (7 moderate, 1 high)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
```

`npm test` exited 0.

```text
1..85
# tests 85
# suites 0
# pass 85
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3394.030625
```

`npx tsc --noEmit` exited 0 with no output.

`npm run lint` exited 0.

```text
> darkroom@0.1.0 lint
> eslint
```

`npm run check:hardcode` exited 0.

```text
> darkroom@0.1.0 check:hardcode
> node scripts/hardcode-check.mjs
```
