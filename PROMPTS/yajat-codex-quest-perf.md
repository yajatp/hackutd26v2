Task: a performance probe for the headset scene, `scripts/quest-perf.mjs`, and a baseline report

Context: Avon (repo yajatp/hackutd26v2). Make a branch `yajat/quest-perf` from the newest `origin/mohan/live`. The judge wears a Quest 3S, which renders the 3D site at `/twin` in the Quest Browser at 72 to 90 Hz. Our 3D scene must keep its frames under 13.9 ms (72 Hz), or first-time VR users feel sick and judges remember it. A visual redesign of `/twin` is in progress in another lane. We need a probe we can rerun after every change, and a baseline now. Do the quest.mjs task first if it is not finished; this is the next one.

Build `scripts/quest-perf.mjs` (Node 22, standard library plus the Playwright copy that `scripts/e2e/playwright.mjs` already loads from the npx cache; add no dependency):
```
node scripts/quest-perf.mjs                        # /twin, 1280x720, CPU slowed 4x, 10 s
node scripts/quest-perf.mjs --url /vr --seconds 6
node scripts/quest-perf.mjs --throttle 1 --json    # machine-readable
```
1. Launch headless Chrome with `loadPlaywright` and `launchBrowser` from `scripts/e2e/playwright.mjs`. Use a 1280x720 viewport (about the Quest Browser window). Slow the CPU with CDP `Emulation.setCPUThrottlingRate` (default 4, as a stand-in for a mobile chip).
2. Before the page loads (`page.addInitScript`), wrap the WebGL and WebGL2 draw calls (drawArrays, drawElements and their Instanced versions) to count calls per animation frame. Also count texture uploads (texImage2D and texSubImage2D, with their sizes).
3. Load `http://127.0.0.1:3000<url>`, wait for the canvas, let it settle 2 s, then record `requestAnimationFrame` frame times for `--seconds`.
4. Print one table:
   - frame time median and p95;
   - the share of frames over 13.9 ms and over 11.1 ms;
   - draw calls per frame, median and max;
   - triangles, if you can get them without editing app code;
   - texture uploads and the largest texture;
   - JS heap;
   - requests to any host that is not localhost or 127.0.0.1 (must be 0: the demo is offline).
   Exit 0 on success, 2 if Playwright or Chrome is missing (reuse the loader's message).
5. Put the stats in a pure function with tests in `scripts/quest-perf.test.mjs`: median, p95 and the share over budget, on known arrays. Run them with `node --test`.

Then write `docs/QUEST-PERF.md`:
- the probe's output for `/twin` and `/vr` at throttle 4 and at 1, on L1 with `npm run demo` running and the mock_test site loaded;
- a note that headless Chrome renders WebGL on the CPU, so absolute numbers are pessimistic and only comparisons between runs count;
- by reading `app/twin/*.tsx` (read only), the five most likely costs in the scene, each with a fix and the expected saving. For example: label textures redrawn every frame, too many separate meshes that could be instanced, the size of the canvas text textures, per-frame allocations in useFrame.
If Yajat has the Quest 3S in developer mode, also add one real reading: open `chrome://inspect` from L1 with the headset on USB, open `/twin`, record 10 s in the Performance panel, and note the frame rate.

Files you own: `scripts/quest-perf.mjs`, `scripts/quest-perf.test.mjs`, `docs/QUEST-PERF.md`. Do not edit app code, `package.json` or anything else; Mohan wires `npm run perf` when merging. Do not run `next build` or `npm run build`.

Done when:
- the tests pass;
- the probe runs on `/twin` and `/vr` (paste the output);
- the report is written.

Commit on `yajat/quest-perf` with your own git identity and no AI-credit lines. Push only that branch, never to main or mohan/live, never force push. Mohan merges.
