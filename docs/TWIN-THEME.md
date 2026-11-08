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
