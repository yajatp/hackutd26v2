# Quest: the judge's VR view (/twin)

`/twin` shows the loaded site as a table-size 3D model, from the same live `avon` data as the console. When a teammate taps **Fake** on Phone 1, the faked tank turns amber with **LYING · SIMULATED** in the model too. It is an add-on. The 90-second laptop demo comes first, and the same page works in any normal browser, so the demo never depends on the headset.

What the judge sees in VR: a round table at waist height in front of them. Each tank is a cylinder; its color is its state (red: pump failed, amber: a sensor to check or a place to inspect, gray: OK) and its fill is the tank level when an alert reports it. The console's top problem has an expanding white ring and is already open in the info panel on the right. A **How to use** card and a big **Reset view** button float straight ahead. Point at a tank and pull the trigger (or pinch with a bare hand) to open its panel. The thumbstick turns the model 30 degrees per push. The judge never moves.

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
3. Check that the How to use card is ahead, the table is below it and the S5 Facility C panel is open on the right.
4. Take the headset off and hand it over. Give the judge the right controller for their right hand (and the left one if they want it).
5. Say one sentence:

   > "Point at any tank and pull the trigger to see what's wrong and what to bring; push the thumbstick to turn the site."

6. If the table is off to one side once they have it on, ask them to hold the Meta button on the right controller for a second to recenter.
7. Between judges: press the Meta button and exit VR. Run `npm run demo:reset` on the laptop. Then press Enter VR again. Every entry turns the model back to north and opens the top problem's panel.

If a teammate taps Fake on Phone 1 while the judge watches, the faked tank pulses amber with LYING · SIMULATED within a second or two. Tap **Clear all** before the next judge.

## (d) Showing the judge's view on a screen

So the rest of the table can follow along:
- **Cast to the laptop:** on the laptop, open `https://www.oculus.com/casting` in Chrome. In the headset, open quick settings → Camera → Cast, and pick the computer. Both devices must be on the same network, and the laptop page needs the internet to load.
- **Cast to a TV** with Chromecast: the same Cast menu lists it.
- **Cast to a phone:** the Meta Horizon app → Cast.

Casting adds a short delay. That is fine for watching. With no internet, skip casting and let the room watch the laptop's `/twin` in a normal browser window: it shows the same live model.

## Tested

2026-11-08, on Laptop 1's dev server, in desktop Chrome with the IWER headset emulator (Meta Quest 3 profile) injected by a test script. Enter VR appeared, entering VR opened S5 Facility C. One thumbstick push turned the model one step, and holding the stick did not repeat. Reset view (a 1-second trigger pull) and selecting a tank by pointing both worked. Every request went to 127.0.0.1. **Not yet tried on a real Quest.** Try (b) once before the first judge.
