# Design research for the VR station (Sun 01:55)

Ten recent Awwwards Sites of the Day and startup honourable mentions, each visited at 1440 px wide (hero, then one screen down). Notes are what each site does, then what we can use for `/vr` and `/twin`. Fonts and colors were read from the live pages.

| Site | Seen | Palette | Type | Signature move | For us |
|---|---|---|---|---|---|
| Extrafazant (Nov 8) | extrafazant.nl | #f4f4f4 / #101010, bright blue bits | Helvetica Now condensed caps mixed with a light serif in one headline | Centered mixed-type headline, a collage of polaroids on black | Mixed faces read as an agency, not a control room. Skip. |
| Grids, Obys (Nov 2) | grids03.obys.agency | #fff / #000 | Obys Sans, enormous and tight | Bitmap block graphic header; an index of numbered lectures with right-aligned timecodes on hairlines; heavy black bars as dividers | The hand-off is a real sequence. An index with time budgets is honest numbering. Bitmap blocks echo our dither. |
| MECHA (Oct 31) | mecha-xyz.webflow.io | #fff / #262933, one maroon block | Neue Haas Grotesk small, Flecha serif display | Isometric line drawing of the logo, dithered photos, hairline metric tables | Same subject (automation in legacy industry). Dither plus hairline data tables suit a station page. |
| Signal-A (Oct 18) | signal-a.studio | #fff / #000 | GT America Mono for meta, Neue Haas for a huge justified statement mixing weights | Live local clocks in mono; long hairlines across columns | Live clocks fit a night shift: laptop time next to the data's time. |
| Grail (Nov 4) | grail-app.com | #000, saturated pixel art | PP Pangaia serif caps | Cards floating at different depths in real 3D, scroll-driven | Closest to VR: a 3D preview with floating labels is what the judge will see. |
| Wafer (startup HM, Oct 14) | wafer.ai | sage sky, then near-black | Space Grotesk and Space Mono | Thin-line instrument diagrams (rings, gauges) with tiny mono values over a dithered cloud image | Instruments are our world. A dial for time to trip is real data, not decoration. |
| Second Ride (startup HM, Oct 15) | second-ride.de | photography, warm yellow | Nunito Sans | Photo-led e-commerce | Nothing for us. |
| FORMAT, Obys (Oct 19) | format.obys.agency | #222 / #fff | Obys Sans, blocky display letters | A dial with a needle and labels round the rim; rotated vertical labels | The dial again: a gauge reads at a glance in a headset too. |
| DeepBook (Nov 3) | deepbook-v2-wip.webflow.io | #000 / #fff, #1E6EF3 | TWK Everett | A full-bleed field of short vertical dashes forming waves; crop-mark frames | A dash field could show every sensor as a signal; a faked one out of phase. |
| Spyker (Oct 30) | spykercars.com | #000 / #fff | Futura condensed caps, small; PT Serif body | Restraint: one small condensed headline on black | Condensed, small and sparing is how DIN should be used on the night page. |

## What they share

- Two inks. Every strong site here is close to monochrome, with at most one extra color. Ours: night and moonlight, with red and amber kept for state.
- Type does the work: one family at very different sizes, no decoration.
- One signature interaction per site, never five.
- Hairlines and tables for data. Cards only where something floats in 3D (Grail), not as page furniture.

## Versions built from this

`/vr/lab` lists them. `instrument` (Wafer, FORMAT, MECHA), `index` (Grids, Signal-A), `signal` (DeepBook), `depth` (Grail, Spyker). Version zero is `/vr` itself (MECHA's dither). Each was scored by an independent critic; the result and the choice are in DECISIONS.md.

## Round 2 (Sun 03:25): puture.co.kr and ethiack.com, for the 3D space (Mohan's picks)

Scrolled read-only with a headless browser; cookies declined on ethiack. Both use Lenis smooth scrolling and a WebGL canvas.

**puture.co.kr** (#000 / near-white / electric blue; Geist Mono chips, a Korean variable sans):
- An infinite perspective grid floor with "+" crosshair markers is the space everything lives in.
- Its carousel: project cards stand as tilted 3D panels on that grid, and the scroll moves through them in depth.
- Glossy blue glass cubes with white icons float in the space.
- The process is a 3D path of connected waypoints on the grid (concept, prototype, test).
- An exploded stack of isometric layers; a giant wordmark under a light beam at the end.

**ethiack.com** (#0b191b dark teal, neon mint; FK Grotesk and FK Raster pixel type):
- Red finding tags ("RCE IN API", "XSS IN DASHBOARD") pop over a pixel-mosaic city.
- Pixel-type statements sit in crop-mark frames with a horizontal light streak ("ATTACKERS MOVE FASTER").
- A sticky `Console.log` terminal streams down the right edge the whole time.
- Mint stat cards with huge pixel numbers (99.5%, 30x).
- Its carousel is a plain 34-logo marquee.

**What we take, and where:**
1. The VR dashboard as **puture's carousel**: glass cards on an arc in front of the judge (Budget, Top fix, Sensors, Potential breaches, What if). The thumbstick or a point-and-pull steps through them, which keeps the controls simple.
2. **puture's grid floor with + markers** under the table and overview modes, so the data space reads as technical.
3. **puture's floating glass cubes** as the menu dock buttons, with icons.
4. **puture's waypoint path** for the what-if ripple: the consequences as waypoints laid across the ground from the facility (T+0, the trip at T+2h03, wells shut in, the truck).
5. **ethiack's red finding tags** for the attack: "LYING · SIMULATED" pops over the tank, and amber "potential breach" tags over the tanks at risk.
6. **ethiack's pixel statement in crop marks** for the LOCKDOWN title card, set in Pixelify Sans (OFL), our stand-in for FK Raster.
7. **ethiack's Console.log** as a live SpacetimeDB event terminal: inject_fault, confirm_plan, enter_lockdown, streaming on a side wing in VR and on the console during lockdown.
8. **ethiack's pixel stat numbers** for the budget ($1,810 vs $9,957).
9. A theme switch in the VR menu: Permian Night, Grid (puture: light, blue glass) and Terminal (ethiack: teal, mint, pixel). Mohan's team picks.
