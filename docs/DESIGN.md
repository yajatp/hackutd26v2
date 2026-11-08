# Design language for new pages

The product screens (`/console`, `/attack`, `/box`, `/witness`) keep the shared look in `app/globals.css` and `app/ui/`. Do not restyle them. New judge-facing pages (`/vr`, `/spacetime`, the printed `/report`) use the language below. `/vr` (`app/vr/`) is the reference page.

## Color

| Name | Hex | Use |
|---|---|---|
| Night | `#102231` | page background on screen; ink on paper |
| Moonlight | `#d7dee0` | text on night |
| Dust | `#8fa1aa` | secondary text on night (`#4a5a63` on paper) |
| Rule | `rgb(215 222 224 / 0.16)` | hairlines between list rows |
| Red | `#ef4444` | state only: pump failed, tampering, rollback |
| Amber | `#f59e0b` | state only: a sensor to check, a place to inspect |

Red and amber mean what they mean on the console, and nothing else. Never use them for decoration, buttons or headings.

## Type

One family, DIN (the typeface of industrial and road signage), from system fonts only, because the demo runs offline:
`font-family: "Bahnschrift", "DIN Alternate", "Roboto", system-ui, sans-serif;`

- Headlines: bold, condensed (`font-stretch: 75%`), sentence case, tight line height.
- Body: 17px, line height 1.5, lines under about 70 characters.
- Numbers: `font-variant-numeric: tabular-nums`.
- Monospace only for things a person types or compares by eye: commands, hashes, AV- references.

## Layout and principles

- One bold moment per page, built from live data (on `/vr` it is the dithered table lit by the pointer). Everything else stays quiet.
- Text is left-aligned on one margin. Use lists with hairline rules, not grids of cards. No shadows, no gradients, no rounded "SaaS" cards.
- Do not use: all-caps labels above headings, "→" on buttons, "A · B · C" meta strings (the console's own state words like `LYING · SIMULATED` are fine), numbered markers unless the content is a real sequence, or fade-in-on-scroll.
- Motion only when the data changes or the person acts. Respect `prefers-reduced-motion`.
- Words: name things the way the operator would. Buttons say what happens ("Open the model", not "Submit"). Errors say what to do next.

## Quality floor

Works offline, at 360 px wide and in the Quest Browser (about 1280 px wide), with visible keyboard focus. Check with `npx tsc --noEmit`, `npx eslint <your folder>` and screenshots at 1440, 1280x720 and 390 wide. Do not run `next build` or `npm run build` on a laptop that is running the demo.
