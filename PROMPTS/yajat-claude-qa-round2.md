Task (now, then when Mohan says "redeployed"): QA round 2, on the real devices

Your first pass (`docs/test-final-0445.md`) was excellent; keep the same format and add to that file on `yajat/final-qa`. Triage of your bugs:
- **1 and 5** are already fixed in `mohan/live`: Phone 1's lockdown banner, and Undo Kill / Undo Fake / Undo Drift on Phone 1. The hosted copy was a 4:10 build.
- **6** may be fixed by the same change.
- **4** is in Mohan's map lane.
- **8, 9, 10, and 12's console part** are fixed at merge.
- Codex takes **7, 11, 2** and the rest of **12**.

NOW, with real devices, which only Yajat can do:
1. **Bug 2 for real:** put the box laptop (L2 or the Mac stand-in) and a real phone on one hotspot, run `npm run demo:darkroom`, and open `http://<box IP>:3000/witness` on the phone. LIVE or DISCONNECTED? Then `/join` on the phone with a code from `/box`.
2. **The judge's flow with a real phone as Phone 1** on the hosted copy. Run `npm run demo:reset:cloud` first and after.

AFTER Mohan says "redeployed":
3. Recheck bugs 1, 5 and 6 on the hosted copy: Phone 1 locked out during LOCKDOWN, and **Undo Fake** restores the sensor.
4. Section 1 (`/`), section 4 (`/map`: six sites, Eagle Ford's console) and section 5 (`/twin` on the Quest 3S), including:
   - **Audio:** in the Quest Browser, open `/twin`, press Enter VR, then tap Fake on Phone 1. Do you hear the two-tone alert from the headset? Then the ambient sound (wind, pumpjacks, the flare) if it's in that build.
   - **Comfort and frame rate:** walk view, teleport, does anything stutter?
   - **Realism:** does it read as an oil lease? What looks fake?
5. `npm run cloud:check -- --all` once the map lane lands.

Report the top problems to Mohan the moment you find them. Commit only the test doc. Use your own git identity, no AI-credit lines, and keep the word "Claude" out of messages.
