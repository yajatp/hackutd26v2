# The headset world: "Permian Night"

Mohan tested `/twin` on the Quest 3S (Sun 02:45). The verdict: it works, but it "looks raw, no color, no emotion, no theme". He asked for:
- more 3D and more immersive, bigger, with better animations and smooth motion;
- a human-scale option at eye level "where the user actually feels almost like they are there", plus a higher-level view;
- dedicated 3D models, a lot of color and a background, a new font and colors, a theme;
- an animated attack moment;
- a dashboard that opens from a menu.

This file is the contract every part of the redesign builds against.

## Theme

A Permian Basin oil field at night under a huge violet-blue sky. Warm dusk still glows on the horizon, pumpjacks nod, a flare flickers in the distance, and a holographic operations layer floats over it all in cyan. The judge is the night-shift operator: alone in the dark, a beautiful place, something is wrong, and the data glows.

## Palette (all in `app/twin/theme.ts`, nothing hard-coded elsewhere)

| Token | Hex | Use |
|---|---|---|
| skyZenith | `#070b24` | top of the sky dome |
| skyMid | `#1d1a4f` | sky at 30 degrees |
| skyHorizon | `#5b2f6e` | sky at the horizon |
| duskGlow | `#ff7a4d` | thin warm band on the west horizon, flare light |
| stars | `#dfe8ff` | stars |
| ground | `#2a211c` | caliche desert, unlit |
| groundLit | `#6b4f3a` | desert under pad lights |
| holo | `#4de2ff` | the data layer: rings, rays, selection, panel edges, the table hologram |
| holoDim | `#1b6f86` | grid lines, inactive UI |
| glass | `rgba(10,16,40,0.78)` | panel fill |
| text | `#eaf3ff` | text on glass (never pure white) |
| textDim | `#9fb2d6` | secondary text |
| ok | `#3ddc97` | healthy tank glow |
| warn | `#ffb020` | sensor to check, inspect (LYING, DEAD, DRIFTING, INSPECT) |
| alert | `#ff3b4e` | pump failed |
| steel | `#c9ced6` | tank shells |
| pumpjack | `#2f5bd3` with `#e8ecf2` | walking beam and horsehead |

The state colors mean exactly what they mean on the console: alert means pump failed, warn means check the sensor. `holo` cyan is the UI and data color and is never used for a state.

## Type

Chakra Petch 600 and 700 for labels, headings and numbers in the headset; Barlow 400 and 500 for sentences. Both are served from `/fonts` (`app/fonts.css`). Canvas text must `await document.fonts.load(...)` before drawing.

Following [Meta's typography guidance](https://developers.meta.com/horizon/design/styles_typography/): body text at least about 18 px equivalent. In world units that is at least 0.022 m letter height at 1 m, more for panels further away. Heavier weights, and no pure white on pure black.

## The three views (scale modes)

| Mode | What the judge sees | Scale | Start position |
|---|---|---|---|
| `table` (default on Enter VR) | the holographic ops table: the site as a glowing miniature on a round table, desert and sky all around | site 1 m wide, table top at 0.8 m, 0.6 m ahead (as today) | standing at the table |
| `overview` | the higher-level view: the whole site laid on the desert floor around the judge, like standing on a hill | site 14 m wide on the ground (tanks about knee high) | south edge, facing north |
| `ground` | human scale, life size at a facility: tanks about 6 m tall over your head, pumpjacks nodding beside you, pipes at your feet | 1:1 meters; one facility pad of about 40 m around the user; other facilities are lights on the horizon in their real direction | on the pad of the selected (or top problem) facility, 8 m south of its tank, facing it |

- Switching views: fade to `skyZenith` (250 ms), move or scale, fade in (250 ms). Never move the camera smoothly without the user's input (comfort).
- In `ground`, teleport works with the controller's teleport ray onto the pad. "Go to <facility>" in the menu jumps to another facility.
- The thumbstick snap turn (30 degrees) rotates the world in every mode.

## The menu and the dashboard

A dock with five large buttons, at least 0.06 m each (60 px at 1 m, per Meta's guidance), floating 0.45 m below eye level and 0.9 m ahead: Table, Overview, Walk, Dashboard, Reset. It follows the judge's yaw lazily, catching up when they turn more than about 40 degrees.

Dashboard: a glass panel about 1.0 x 0.62 m, 1.2 m ahead, showing the console's own data from `useAvonConsole()`:
- the totals line ("2 pump failures · doing nothing costs $9,957 · these plans cost $1,810");
- the top fix card: facility, "Do this: Call 1 truck now, 1 trip", $905, trips in 2h 03m, and a big **Confirm this plan** button that calls `confirm(alertId)`, so the judge works the shift from inside VR;
- "Sensors to check";
- CONFIRMED, THEN CHANGED when it applies.

## Models (life size, meters; the view scales them)

- **Tank:** about 3.7 m diameter by 6 m. Steel shell with vertical seams; a roof with a hatch and a vent; a spiral or straight ladder and a top rail. A glowing level gauge strip (fill from the alert's level) runs on the side. A state band glows near the base in ok, warn or alert.
- **Pumpjack:** one per well in `well_ids`, placed around the pad. It has a walking beam, a horsehead, a samson post, a crank and a counterweight, and it nods about once every 6 s, desynchronised. It stops when its facility's pump failed.
- **Pump house:** a small shed with a pump and a light over the door.
- **Pipeline:** tubes from each facility to its system's centre, with moving light dashes along them showing flow. When the pump failed, the dashes stop and the pipe pulses `alert`.
- **Flare stack:** one per system, with a flickering flame and a warm point light.
- Low poly, with shared geometries and materials and instancing for repeats. No real-time shadows: fake ones with a soft dark disc under each object.

## The attack moment (a faked sensor appears in the data)

When a tank turns LYING (or DEAD or DRIFTING) and SIMULATED:
1. A rotating warn beacon lights on its roof.
2. A holo shockwave ring expands across the ground or table from it.
3. Its level gauge glitches, with horizontal tearing on the cadence of `glitchFrame` in `app/vr/field.ts`.
4. A toast slides in front of the judge: "▲ S5 Facility C · tank level sensor LYING · SIMULATED". If the judge confirmed a plan, it adds "Your confirmed plan rests on it".
5. A short synthesized two-tone chirp plays (WebAudio, no file).
6. The dashboard's card shows CONFIRMED, THEN CHANGED.
Clear all reverses it calmly.

## Performance budget (Quest 3S, 72 Hz)

- Draw calls under about 250 in `ground` and under 200 in `table`; triangles under 300k.
- No real-time shadows; no post-processing in XR; dpr capped at 1.5 in 2D.
- Instanced meshes for repeated parts.
- Measure with `npm run perf` (`/twin`, frame-rate cap off).

## Rules for every part

Offline only: no CDN, no drei `<Text>`, no remote GLTF. Models are procedural or a local file in `public/models` with a CC0 licence beside it. `prefers-reduced-motion`, and a comfort setting in the menu, turn off the beacon spin, the shockwave and the glitch tearing (static states stay). Keep every state word exactly as the console writes it. Never run `next build` or `npm run build`.

## Follow-up pass (after the first redesign lands)

- **Pipe popout** (Mohan, Sun 03:20): point at a pipeline and pull the trigger to get a small glass popout at that point on the pipe: flow in and out (bpd), pressure (psi), status (flowing, stopped: pump failed, possible leak), and the facilities on it. It closes on a second press or another selection.
- **Lockdown in VR** (docs/LOCKDOWN.md): holo layer off, a red perimeter ring, a cage over the suspect tank, a toast, and the AV- reference large on the dashboard.
- **Budget in the VR dashboard**: plans vs doing nothing, the saving, trucks used vs available (from the /insight lane's data).
- The reference sites Mohan's team sends (puture.co.kr carousel, ethiack.com), and a theme switch in the menu (two or three looks) so the team can pick.

## Realism pass: make it read as an actual Permian lease (Mohan, Sun 04:50)

References: a New Mexico OCD battery filing (wells, header, production and test separators, heater-treater, vapor recovery tower, oil stock tanks, LACT units); Keystone's central tank battery (separators, heater-treaters, oil and produced-water storage, LACT, vapor recovery, combustor, vent and relief); Basic Tank Battery Design ("the dike", i.e. secondary containment). Procedural, with real proportions, low poly, instanced; no downloaded models (licences, Quest frame time, offline).

- **Pad:** a rectangular caliche gravel pad (light tan around `#c9b48f`, speckled, about 60 x 40 m), not a round disc. A dirt lease road leaves the pad, and the pad has a low edge berm.
- **Tank battery:** the monitored oil stock tank plus two more stock tanks and one produced-water tank in a row, 12 ft diameter x 20 ft (3.7 x 6 m), painted desert tan with a darker base band. A shared catwalk runs across the roofs, with stairs at one end; thief hatches and vents sit on the roofs. Only the monitored tank carries the state band, the external float-gauge board (fill) and the label; the others are neutral context. Around them: a secondary containment dike, a low 0.9 m wall rectangle with a dark liner floor.
- **Process equipment** on skids beside the battery:
  - a horizontal two-phase separator (about 1.2 m diameter x 4 m) on saddles;
  - a vertical heater-treater with a firebox and a short stack;
  - a vapor recovery tower (tall, thin);
  - a LACT unit (a skid with a meter run and a small cabinet);
  - an enclosed combustor (a squat cylinder, about 2.5 m diameter x 6 m) with a faint glow at the top. The system's emergency flare stays.
- **Wells:** each pumpjack (about 8 to 10 m tall at the horsehead, Lufkin-style proportions) sits on its own small pad. Each has a wellhead (Christmas-tree valves) under the horsehead, an electric motor with a belt guard, and a power pole with a line to the next pole. A flowline runs from each wellhead back to a header manifold at the battery, on low pipe stands.
- **The rest:** chain-link fence segments around the battery with a gate and a lease sign; two pole lights.
- **Budget:** the same as above (under about 250 draw calls in Walk). Use instancing for tanks, poles, stands and fence posts.

## Immersion: "realistic as hell" (Mohan, Sun 04:55)

Whoever puts on the headset should feel they are standing on a lease at night. Realism comes from light, material, atmosphere, sound and scale together, not from polygons. All of it must stay within the Quest 3S budget.

- **Materials (procedural, no texture downloads):**
  - generate small canvas textures at load (256 to 512 px, then reused): caliche gravel with speckle and tyre tracks; tank paint with streaks, rust bleeding under seams and dust at the base; weathered galvanized steel; dirty pumpjack paint;
  - use roughness and metalness to match: painted steel rough 0.6, galvanized 0.4 / metal 0.6, gravel 1.0;
  - decals: a hazard diamond and a "DANGER H2S" placard on the tank, the lease sign, number stencils on the tanks.
- **Light:**
  - a low moon key light and a cool sky fill;
  - pole lights that throw real warm light pools, using at most 2 real lights near the user in Walk and faking the rest with emissive halos and light cookies on the ground;
  - the flare and combustor glow flickers onto nearby steel;
  - in Walk view only, one shadow-casting light (the nearest pole) at a 1024 shadow map; blob shadows everywhere else.
- **Atmosphere:**
  - distance fog matched to the horizon;
  - slow dust motes in the light pools (instanced points);
  - heat shimmer above the flare (a cheap distortion sprite);
  - wind-blown tumbleweed or dust puffs now and then;
  - stars and the Milky Way; distant facility lights and a far gas-plant glow on the horizon in their real directions;
  - mesquite and creosote scrub bushes scattered off-pad (instanced, low poly).
- **Sound** (WebAudio, synthesized, no files, positional with three's PositionalAudio, starts only after Enter VR or the first click):
  - wind, a low steady broadband;
  - each pumpjack's rhythmic creak and thump on its stroke, positional;
  - the flare's roar, positional and louder close up;
  - electrical hum near the motors;
  - insects at night;
  - the attack's two-tone chirp and the lockdown sound already exist; route them through the same mixer;
  - a mute toggle in the dock.
- **Scale and presence:**
  - in Walk, eye height is the user's real height; tanks tower at 6 m and pumpjacks at 8 to 10 m;
  - teleport arcs land on gravel with a footstep crunch;
  - the controller ray hits the ground with a soft holo reticle;
  - hand tracking can pinch anything a controller can point at.
- **Motion:**
  - pumpjacks out of phase at their real stroke rate;
  - counterweights rotating;
  - the flare flame noise-animated;
  - gauge needles and floats easing;
  - nothing in the world snaps.
- **Comfort:** no camera motion the user did not cause, fades on teleport, and a comfort toggle that turns off shimmer, dust and the beacon spin.

## Scope set by Mohan (Sun 04:52): "a lot more realistic than the original", within what the Quest 3S can run; realistic events; minimal UI

- **Realism is capped by the Quest 3S, not maximised.** Each item in the realism and immersion lists above earns its place only if `npm run perf` (frame-rate cap off, 4x CPU throttle) stays within budget in Walk and Table:
  - draw calls under about 200;
  - triangles under about 250k;
  - textures 512 px at most and few of them;
  - no post-processing in XR;
  - at most one shadow map (1024), in Walk only.

  Drop items in this order when over budget: heat shimmer, tumbleweed, dust motes, the real shadow, scrub density.
- **Events look like what would really happen on site.** The animation is the physical thing, not a holographic effect:
  - **Pump fails:** the pumpjack coasts to a stop over about 3 s, its beam settles, and the motor hum fades out. The tank's float gauge keeps creeping up, and an amber strobe on the battery's alarm pole starts flashing like a real one, a sharp flash about once a second that lights the nearby steel.
  - **Sensor faked (LYING):** the level transmitter on the tank, a small box at the gauge, blinks its status LED wrong. The float board and the reported number disagree, so the gauge needle twitches while the float keeps rising. A quiet red tag appears only on that transmitter.
  - **LOCKDOWN:** the site's pole lights fade to red emergency lighting over about 1 s; a single low two-tone sounds; the flare is unchanged.
  - **Undo or Clear:** everything eases back, the strobe stops, and the lights return to warm.
- **The UI stays minimal:**
  - small, quiet panels;
  - few words: the state word, one number and one action;
  - no big holographic cards or rings beyond the selection reticle;
  - the dock is five small icons with labels on hover;
  - the dashboard shows one card at a time;
  - text only where it informs.

  The drama is in the world, not in the interface.

## Immersion pass, what landed (Sun 05:20)

Measured with renderer.info on the dev server (2D, 1280x720, the seeded state with S5 · C PUMP FAILED):

| View | Before (2D) | After (2D) | After, iwer Quest 3 emulator (stereo) |
| --- | --- | --- | --- |
| Table | 105 calls, 164k tris | 78 calls, 99k tris | 184 to 202 calls, 209k tris (with the VR dock, labels, how-to card) |
| Overview | 91 calls, 160k tris | 64 calls, 96k tris | not measured (the 2D view buttons are hidden in XR) |
| Walk | 36 calls, 71k tris | 46 calls, 62k tris (61 while a sensor is faked: beacon, tag) | not measured |

- **Level of detail and instancing:** the miniatures use a 200-triangle tank (`tankGeometryLow`), every miniature shell is one instanced draw, the state glow pools are one instanced draw per tone, and the flare stacks are instanced (`FlareStacks`: 3 + n calls instead of 5 per stack). The desert floor grid went from 96 x 160 to 72 x 112.
- **Lights:** three point lights in every view, always mounted so the count never changes (one pad post light, PadLamp, the strobe), plus the hemisphere and the moon.
- **Events in Walk (`fx/SiteEvents.tsx`):** pump failed: the amber strobe on the alarm pole outside the dike flashes once a second and its real light hits the tank; the pumpjacks coast down as before. Sensor faked: the level transmitter's LED blinks fast and wrong (red and amber), one red tag hangs under it. LOCKDOWN (`locked` from `useAvonConsole().lockdown`): PadLamp, the mast beams and the mast heads ease to red over about 1 s and back on end. Comfort or reduced motion: the strobe holds a steady glow.
- **Realism:** the stock tank painted desert tan (courses a shade apart), a 0.6 m containment dike with a dark liner round the tank, about 240 instanced scrub bushes off the pad (one draw), and a lease sign by the start (facility name, DANGER H2S GAS, NO SMOKING, EMERGENCY 911).
- **Sound (`fx/Ambience.tsx`, on the shared context in `fx/audio.ts`):** wind in every view; in Walk, insects, each pumpjack's thump and creak on its stroke (positional, HRTF for the nearest two), the motor hum at the nearest unit (fades over 3 s when the pump fails), the flare's roar, and a gravel crunch on teleport. Mute: "Sound on / Muted" in the 2D view bar and a SOUND pill at the dock's right end.
- **Pipe popout (`PipePopout.tsx`):** click or trigger on the system pipeline in Walk: a small card at that point with IN and OUT bpd (the last hour of `insight.flows`), FLOWING or STOPPED · PUMP FAILED, and the facilities on the line. A second press closes it.
- **Dock:** buttons shrunk from 12 x 8.8 cm to 10 x 7.4 cm (still over Meta's 6 cm minimum).
- **Not done yet:** the dock as icon-only buttons with labels on hover, the dashboard one card at a time, the second stock tank (a fourth tank needs the pad's flowlines re-routed to a header), the separator, heater-treater, VRU, LACT and combustor, the rectangular pad and lease road, fence, power poles, procedural tank-paint textures, dust motes, heat shimmer, the gas-plant glow.

## Fix round (Sun 05:40-05:50)

- **Tank battery:** a stock tank and a smaller produced-water tank (grey-green fiberglass) in a row west of the monitored tank, one instanced draw of the tank's own geometry (`Battery` in `models/Lease.tsx`); the dike now runs round all three (x -9.65 to 3.3 m). Placed clear of the western units' flowlines.
- **Pumpjacks:** field paint, a faded olive drab beam and frame and a dirty cream horsehead, in place of the toy blue and white (`PAL` in `models/geometry.ts`).
- **Sensor faked:** the transmitter now has a small dial whose needle twitches between wrong readings about 7 times a second (`needleAngle`, tested) while the float keeps rising; comfort or reduced motion holds it at one wrong reading.
- **Pipe popout:** the pad's flowlines and transfer lines open the card too (`pipeWrap` on `FacilityModel`), not just the system pipeline.
- **Sound:** both toggles (2D bar, VR dock) read one mute state (`subscribeMuted` + `useSyncExternalStore`); the dock's toggle is now a sixth button as tall as the others (7.4 x 7.4 cm). The ambience stops its loops and oscillators on unmount and forgets its stroke schedule when Walk ends.
- **Measured (2D, 1280x720):** Table 78 calls / 99k tris, Overview 64 / 96k, Walk at S5 · C 50 / 72k (61 / 73k with a faked sensor). Stereo roughly doubles Walk to about 100 calls / 145k, under the 200 / 250k budget.
