# Quest: the judge's VR view (/twin)

`/twin` shows the loaded site as a table-size 3D model, from the same live `avon` data as the console. When a teammate taps **Fake** on Phone 1, the faked tank turns amber with **LYING · SIMULATED** in the model too. It is an add-on. The 90-second laptop demo comes first, and the same page works in any normal browser, so the demo never depends on the headset.

What the judge sees in VR ("Permian Night", docs/TWIN-THEME.md): a Permian oil field at night under a violet sky, with a dusk glow in the west, a moon, stars, mesas and far rig lights. VR starts at the **table**: a round holographic ops table at waist height with the site as a glowing miniature on it. Each facility has its tank (a glowing level gauge, and a state band that is red for pump failed, amber for a sensor to check and green for OK), its nodding pumpjacks, and a pipeline to its system's flare. Failed tanks are washed red with a pulsing column of light over them, sensors to check amber, and a cyan ring marks the console's top problem (S5 Facility C). One real facility stands life size out on the desert, 34 m away to the front left, with its pumpjacks nodding. Nothing is selected on entry. A **How to use** card floats straight ahead; it fades after 8 seconds or at the judge's first trigger pull. A **menu** with Table, Overview, Walk, Dashboard and Reset sits on the table's near rim like a console.

- Point at a tank and pull the trigger (or pinch with a bare hand): its panel opens beside the table, at about eye level, with a line to the tank. **Walk to this pad** jumps to that facility at life size.
- **Overview**: the whole site on the desert floor around the judge, with knee-high tanks.
- **Walk**: life size on one pad, with the tank over the judge's head and pumpjacks beside them. Other facilities show as lights on the horizon, plus signs ("10 km NE") for the ones with problems. The trigger still picks tanks and signs. To move, **push the thumbstick forward**: a cyan arc drops to the pad with a ring where you will land. Let the stick go to jump there.
- **Dashboard**: the console's totals, the top fix card with **Confirm this plan**, the sensors to check, and Go to. It opens 1 m ahead; any open tank panel steps out while it is open.
- A sideways thumbstick push turns the table (Table view) or the judge (Overview, Walk) 30 degrees. Reset goes back to the table.
- When a teammate taps Fake on Phone 1, the attack moment plays: a warn beacon spins on that tank, an amber shockwave rolls across the whole table (its grid dims under it), its gauge tears, and a toast at eye level, 1 m ahead, says "▲ S5 Facility C · tank level sensor LYING · SIMULATED" for 6 seconds, with a short chirp. An open panel steps aside for it.

The station page `/vr` runs these checks live (connection, site, whether this browser can enter VR, faked sensors) and holds the hand-off steps below; open it on the laptop or in the Quest Browser first.

There are two ways to open it on the Quest. Use (a) for a quick look. Use (b) for real VR.

## (a) 2D, in the Quest browser, over the hotspot

1. Put the Quest on the same hotspot or Wi-Fi as Laptop 1 (Settings → Wi-Fi).
2. Start Avon with `npm run demo:avon`. It prints the laptop's LAN address (see RUNBOOK-L1.md, section 2).
3. In the Quest Browser, open `http://<laptop IP>:3000/twin`, for example `http://10.169.150.177:3000/twin`.

The model shows in a flat browser window. Point and pull the trigger on a tank (or its label) to open its panel. Drag to turn the view; Reset view puts it back.

There is **no Enter VR button** in this mode, and that is expected. Browsers allow immersive VR only on a secure page (https or `localhost`), and `http://<laptop IP>` is neither. For VR, use (b).

If the chip says DISCONNECTED, the Quest can't reach port 3001. Use the checks in RUNBOOK-L1.md, section 5.

## (b) Immersive VR: USB cable and `localhost`

`localhost` counts as a secure page, so the Quest Browser offers VR there. `adb reverse` makes the Quest's `localhost:3000` and `localhost:3001` reach the laptop over the USB cable. No Wi-Fi is needed for this part.

One-time setup:
1. Turn on **developer mode** for the headset: in the Meta Horizon app on the phone that owns the Quest, go to Devices → the headset → Headset settings → Developer mode. (Meta asks for a developer account first; it is free.) Restart the headset.
2. Install adb on Laptop 1: `brew install android-platform-tools` on macOS. On Windows, download Google's "SDK Platform-Tools" zip and use `adb.exe` from it.

Every time:
1. Start Avon on the laptop (`npm run demo:avon`).
2. Connect the Quest to the laptop with a USB-C cable. Put the headset on. If it asks **Allow USB debugging?**, tick "Always allow from this computer" and press Allow.
3. On the laptop:
   ```bash
   adb devices                     # the Quest must be listed as "device", not "unauthorized"
   adb reverse tcp:3000 tcp:3000   # the web app
   adb reverse tcp:3001 tcp:3001   # SpacetimeDB (the live data)
   ```
4. In the Quest Browser, open `http://localhost:3000/twin`. The chip must say ■ LIVE.
5. Press **Enter VR** at the top right.

Run the two `adb reverse` lines again after you unplug the cable or restart the headset.

Do **not** switch the dev server to https (Next's https dev mode) to get VR over Wi-Fi. An https page cannot open our plain `ws://` connection to SpacetimeDB, so every screen on it would show DISCONNECTED. The USB route above is the supported one.

## (c) Handing the headset to a judge

1. Set a **stationary** boundary on the headset (the judge stands still; nobody needs room to walk).
2. Open `http://localhost:3000/twin` as in (b). Stand where the judge will stand and face the way they will face, then press **Enter VR**. The model appears in front of whoever is wearing the headset at that moment.
3. Check that the How to use card is ahead, the table is below it with the lit desert around it, and the menu is on the table's near rim. No panel is open yet.
4. Take the headset off and hand it over. Give the judge the right controller for their right hand (and the left one if they want it).
5. Say one sentence:

   > "Point at any tank and pull the trigger to see what's wrong and what to bring. The menu on the table takes you down to walk the pad; there, push the stick forward to move."

6. If the table is off to one side once they have it on, ask them to hold the Meta button on the right controller for a second to recenter.
7. Between judges: press the Meta button and exit VR. Run `npm run demo:reset` on the laptop. Then press Enter VR again. Every entry goes back to the table view, facing north, with nothing selected.

If a teammate taps Fake on Phone 1 while the judge watches, the attack moment plays on the faked tank within a few seconds (beacon, shockwave, torn gauge, toast, chirp), and its panel reads LYING · SIMULATED. Tap **Clear all** before the next judge. A calm "simulated fault cleared" toast follows.

## (d) Showing the judge's view on a screen

So the rest of the table can follow along:
- **Cast to the laptop:** on the laptop, open `https://www.oculus.com/casting` in Chrome. In the headset, open quick settings → Camera → Cast, and pick the computer. Both devices must be on the same network, and the laptop page needs the internet to load.
- **Cast to a TV** with Chromecast: the same Cast menu lists it.
- **Cast to a phone:** the Meta Horizon app → Cast.

Casting adds a short delay. That is fine for watching. With no internet, skip casting and let the room watch the laptop's `/twin` in a normal browser window: it shows the same live model.

## Tested

2026-11-08, on Laptop 1's dev server, in desktop Chrome with the IWER headset emulator (Meta Quest 3 profile) on `/twin/emulate`:
- Enter VR opened the table view with S5 Facility C's panel beside it, 11 degrees from the judge's gaze.
- Aiming the right controller at S1 Facility B and pulling the trigger selected it, and the panel moved beside that tank.
- The menu's Walk, Overview and Dashboard buttons worked with the trigger.
- A thumbstick push turned the judge 30 degrees in Overview.
- In Walk, a trigger pull aimed at the pad teleported the judge. The teleport arc itself did not draw in the emulator.
- Fake on `/attack` for S5 Facility C played the shockwave, beacon and toast in the headset view, and Clear all reverted it.
- Every request went to 127.0.0.1.

**Not yet tried on a real Quest.** Try (b) once before the first judge: check the frame rate (the world's sky and desert are full-screen shaders), the teleport arc, and the chirp.

2026-11-08 04:30-05:00, the fix round after the Quest review, same emulator:
- Selected S1 Facility A at the table, closed its panel with Close, then pulled the trigger at the empty spot where Walk to this pad had been: the view stayed Table (before the fix the invisible button sent the judge to Walk).
- In Walk, a trigger pull on the S5 Facility C tank (aimed 1.5 m and 4 m up) opened its panel and did not move the judge; a trigger pull on the S5 Facility B sign opened its panel. Thumbstick forward showed the arc and ring; letting go teleported the judge.
- A sideways push turned the table 30 degrees; a forward push with a sideways lean did not turn it. In Walk a sideways push turned the judge 30 degrees.
- Opening the Dashboard in Walk with a tank panel open hid the panel.
- Not tried in this round: the attack moment at the table (it needs a Fake from /attack), and anything on a real Quest.
