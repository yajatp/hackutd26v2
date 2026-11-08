# The 3D model and VR (`/twin`)

`/twin` shows the loaded site as a 3D model, from the same live `avon` data as the console. It works in any desktop browser and in the Quest Browser, and it enters immersive VR on a Meta Quest. Tested with a Quest 3S in mind: about 200 draw calls and 250k triangles in stereo (`npm run perf` measures it).

Entering VR starts on a 3D map of the United States with every site's live status. Picking a site loads that site's database and opens the site at **table** scale, with a menu for three views:

- **Table:** the whole site as a miniature at waist height. Point at a tank and pull the trigger (or pinch with a bare hand) to open its panel.
- **Overview:** the site on the ground around you, with knee-high tanks.
- **Walk:** life size on one pad. Push the thumbstick forward to aim a teleport arc, and let go to move.

A sideways thumbstick push turns the view 30 degrees. The **Dashboard** shows the console's totals, the top plan with **Confirm this plan**, forecasts and what-if simulations. When a teammate taps **Fake** on Phone 1, the faked tank reacts in the headset within a few seconds and its panel reads LYING · SIMULATED. The sky follows each site's real local time.

`/vr` is the station page: it checks the connection, the loaded site and whether this browser can enter VR, and repeats the steps below.

## In the Quest Browser over Wi-Fi (2D)

1. Put the Quest on the same network as the laptop running `npm run demo:avon`.
2. In the Quest Browser, open `http://<laptop IP>:3000/twin`.

The model shows in a flat window. There is no **Enter VR** button in this mode, and that is expected: browsers allow immersive VR only on a secure origin (https or `localhost`). For VR, use the USB route.

## Immersive VR over USB (`localhost`)

`adb reverse` makes the Quest's `localhost:3000` and `localhost:3001` reach the laptop over the cable, so the page counts as secure.

One-time setup:

1. Turn on developer mode for the headset in the Meta Horizon app (Devices → the headset → Headset settings → Developer mode), then restart the headset.
2. Install adb: `brew install android-platform-tools` on macOS, or Google's SDK Platform-Tools on Windows.

Every time:

```bash
npm run quest            # checks adb, reverses both ports and opens /vr on the headset
```

Or by hand:

```bash
adb devices                     # the Quest must be listed as "device"
adb reverse tcp:3000 tcp:3000   # the web app
adb reverse tcp:3001 tcp:3001   # SpacetimeDB
```

Then open `http://localhost:3000/twin` in the Quest Browser and press **Enter VR**. Run the `adb reverse` lines again after unplugging the cable or restarting the headset.

Don't switch the dev server to https to get VR over Wi-Fi: an https page can't open the plain `ws://` connection to a local SpacetimeDB, so every screen would show DISCONNECTED.

## Handing the headset over

1. Set a stationary boundary. Nobody needs room to walk.
2. Stand where the next person will stand, face the same way and press **Enter VR**.
3. If the view is off to one side, hold the Meta button on the right controller to recenter.
4. Between people, exit VR, run `npm run demo:reset` on the laptop and enter VR again. Every entry starts from the map.

To show the headset view to a room, cast from the headset's quick settings (Camera → Cast) to a laptop at `oculus.com/casting`, a Chromecast or the Meta Horizon app. Without internet, open `/twin` on the laptop instead: it shows the same live model.

Without a headset, `/twin/emulate` runs the same scene with a WebXR emulator in desktop Chrome.
