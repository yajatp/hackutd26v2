# Lockdown: the action sequence when we think we are hacked

Mohan (Sun 03:15): "we need to have the actual action sequence for when we get hacked, we need to enter our 'lockdown darkroom', so figure out and plan the animations for that as well." This file is the storyboard every screen follows.

The judge plays the night operator. A sensor disagrees with physics (LYING · SIMULATED), and the plan they confirmed rests on it (CONFIRMED, THEN CHANGED). The judge decides the company network may be compromised. They lock it down and move the decision to the isolated Darkroom box, carrying the evidence by hand.

## The state (SpacetimeDB, avon module)

- Table `lockdown` (public, one row): active, started_at, started_by (identity), reason, evidence_ref (AV-XXXX-XXXX), tank (asset id), ended_at.
- Reducers: `enter_lockdown(reason, evidence_ref, tank)` and `end_lockdown()`.
- Every Avon screen subscribes, so all of them react within about a frame of each other.
- The darkroom module is not touched. The Darkroom is isolated: the Avon side never writes to it. A person carries the reference.

## The sequence

| t | Where | What happens | Animation |
|---|---|---|---|
| 0 | `/console`, the top card | The "CONFIRMED, THEN CHANGED" block now has a second button: **Lock down and move to the Darkroom** (red outline). The judge presses it. | The button holds for 600 ms to confirm (a fill bar), so it is never pressed by accident. |
| 0-1.2 s | `/console` | Lockdown starts. | A shutter sweeps top to bottom, and a thin red scan line rides its edge. The page dims to 35% under it. The header badge turns to **LOCKDOWN** (solid red). A low two-tone sounds (WebAudio, muted if reduced motion). |
| 1.2-2.4 s | `/console` | The plan freezes: "Plan on hold. It rests on a sensor that may be compromised. No truck rolls until someone checks the tank on site." | The plan card desaturates and a diagonal hold stripe slides across it. |
| 2.4-3.4 s | `/console` | The evidence card rises to the centre: the AV- reference large, "Carry this to the Darkroom box. Nothing is sent from here." and three steps: Walk to the Darkroom box; type the reference; the Commander opens the incident. | The card rises 24 px and fades in. The AV- characters type in one by one, and the fingerprint scrolls under it. |
| same moment | `/attack` (Phone 1, the attacker) | "The site is in LOCKDOWN. The operator moved to the Darkroom." Kill, Fake and Drift grey out. | A red flash, then the controls fold down. The attacker sees they were noticed. |
| same moment | `/twin` (VR) | The world reacts. The holo data layer flickers off. A red perimeter ring sweeps out from the suspect tank, and a wireframe cage drops over that tank. A toast reads "LOCKDOWN: move to the Darkroom", and the dashboard shows the AV- reference large. | The ring takes 1.5 s. The cage drops in 400 ms with a small bounce. Comfort mode: no sweep, the cage only. |
| same moment | `/vr`, `/insight` | A red LOCKDOWN banner with the AV- reference. | It slides down once. |
| next | `/box` (Darkroom, its own network) | Someone types the AV- reference into **Bring evidence from the console**. The box opens the incident and logs the evidence (one step, already built). | The screen seals: a stamp-in "INC-0001 OPEN". The hash chain then draws a new link per entry; each link drops in, its hash text scrolls, and it locks to the one above. |
| next | `/witness` (phones in the room) | Each phone mirrors every new entry. | A soft chime and a "witnessed #k" tick per link. |
| later | `/box` | The Commander closes the incident. | The last link gets a seal ring, and the chain turns from moonlight to a quiet green. |
| demo | `/box` after a root delete | ROLLBACK DETECTED AT #k. | The chain cracks at link k (a red fracture line runs through it). The phones flash red with the count. This is the judge's "it can't be quietly edited" moment. |
| end | `/console` | After the on-site check, **End lockdown**. | The shutter reverses. The plan card resaturates and asks to be confirmed again. |

## Rules

- The words a judge reads must be plain. The state words stay the console's (LYING, SIMULATED, CONFIRMED, THEN CHANGED, ROLLBACK DETECTED).
- Every animation has a reduced-motion version: the final state, instant.
- The lockdown never blocks reading the data. The data keeps flowing but is marked untrusted. Only the decision moves.
- `npm run e2e` must still pass. Lockdown is opt-in (a button), so the e2e path never enters it. Add an e2e step only if it stays under about 5 s.

## The look (from Mohan's reference, ethiack.com; notes in docs/DESIGN-RESEARCH.md, round 2)

- The LOCKDOWN title card: "LOCKDOWN" and "MOVE TO THE DARKROOM" in Pixelify Sans 700 (`app/fonts.css`), inside thin crop-mark corners, with a horizontal light streak passing once behind the text.
- Finding tags: small solid-red tags with a square marker ("■ LYING · SIMULATED") pop in over the suspect tank or row with a 120 ms scale from 0.9 to 1. Potential-breach tags use amber.
- A live event terminal: a narrow monospace `SpacetimeDB.log` column on the console during lockdown, streaming the reducer events as rows land (fault, confirmation, lockdown). The Darkroom box streams its own log entries the same way.
- Big numbers (the AV- reference, the budget) may use Pixelify Sans; sentences stay Barlow.
