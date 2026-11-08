# Quest scene performance baseline

Run `node scripts/quest-perf.mjs` with the demo running; use `--url /vr`, `--seconds 6`, `--throttle 1`, or `--json` as needed. The default is `/twin`, 10 seconds, 4× CPU throttling and a 1280 × 720 viewport. `QUEST_PERF_ORIGIN` can select a different local development-server origin. The probe watches requests from navigation through measurement, including WebSockets. Texture uploads are counted from navigation, while draw calls and triangles are sampled during the measurement. Triangles cover WebGL triangle, strip and fan draw calls, including instances; they are submitted primitives, not visible triangles. A zero WebGL count on a 2D canvas is expected.

## Baseline

Recorded 2026-11-08 on the development laptop, using the current branch's Next development server on port 3002 and the already-running local SpacetimeDB on port 3001. The database's config identified `mock_test_2026-10-10T1530`. Another checkout was already serving port 3000, so this used `QUEST_PERF_ORIGIN=http://127.0.0.1:3002`. This is a development-server baseline, not a production build or an immersive WebXR session. Each measurement used 10 seconds after a two-second settle.

| Route | CPU throttle | Frames | Frame ms median / p95 | >13.9 / >11.1 ms | Draws median / max | Triangles median / max | Uploads / largest | JS heap | External requests |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| /twin | 4× | 601 | 16.7 / 16.8 | 100% / 100% | 88 / 88 | 15,608 / 15,608 | 9 / 100 × 103 | 20.74 MiB | 0 |
| /twin | 1× | 601 | 16.7 / 16.7 | 100% / 100% | 88 / 88 | 15,608 / 15,608 | 9 / 100 × 103 | 19.21 MiB | 0 |
| /vr | 4× | 601 | 16.7 / 16.8 | 100% / 100% | 0 / 0 | 0 / 0 | 0 / none | 9.47 MiB | 0 |
| /vr | 1× | 601 | 16.7 / 16.8 | 100% / 100% | 0 / 0 | 0 / 0 | 0 / none | 10.75 MiB | 0 |

The requestAnimationFrame intervals here are capped near 60 Hz, so even an idle frame exceeds both headset budgets. They measure cadence, not CPU or GPU frame execution time, and cannot establish whether the Quest meets 72 or 90 Hz. Headless Chrome may use software WebGL on the CPU, making absolute numbers pessimistic; renderer and machine configuration matter, so compare like-for-like runs and verify on the headset. The 2D `/twin` view excludes immersive-only labels, panels, and controller work. `/vr` uses a 2D canvas, so its zero WebGL calls say nothing about its canvas drawing cost. Heap is a single post-sample CDP reading, not a peak. External requests are observed browser requests, not proof that every interactive path works offline.

No Quest was connected to adb at measurement time; no real headset reading is available. With a developer-mode headset connected, open `chrome://inspect` on L1, inspect Quest Browser on `/twin`, and record 10 seconds in the Performance panel. Record the observed frame rate and whether the session was immersive here.

## Likely scene costs to investigate

These are hypotheses from `app/twin/*.tsx`, not measured savings. Verify each in the same scene and on the headset before accepting it.

1. **Separate tank meshes and materials.** Each tank has shell, rim, fill and transparent hit target meshes; instance or batch shared geometry by material/state, retaining picking separately. Expected saving: fewer draw calls, roughly proportional to tank count; exact reduction depends on states and visibility.
2. **2D label projection and collision layout.** `Projector` sorts and allocates items, reads dimensions, checks overlaps and writes styles every frame. Cache dimensions and recompute placement only when camera, data or size changes; batch reads before writes. Expected saving: lower main-thread work and fewer forced layouts, especially with many labels. This applies to the 2D view, not immersive labels.
3. **Per-tank animation callbacks.** Every tank runs `useFrame`, computes a sine and writes transforms/material properties even when not pulsing. Skip inactive tanks or update active animations in a shared loop. Expected saving: fewer per-frame callbacks and writes, scaling with tank count.
4. **Translucent double-sided shells and invisible hit meshes.** Shells use transparent, double-sided standard materials; hit targets are transparent meshes. Simplify shell rendering and use raycast-only hit geometry where possible. Expected saving: less overdraw and potentially fewer submissions; validate picking and visual quality.
5. **Immersive text textures and card meshes.** `CanvasCard` creates individual textures and meshes for labels and panels, with tank labels at 2,000 pixels per meter. Atlas or share stable labels and reduce texture resolution where readable. Expected saving: fewer textures, uploads and draws in XR; halving both texture dimensions reduces their pixel area by about 75%. Textures are memoized by content, not redrawn every frame.
