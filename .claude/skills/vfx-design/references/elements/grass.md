# Grass — how it reads

**Identity:** leaves with mass carried on wind, vines that grow and lash, and a green-yellow energy
(solar, seed, life) that glows soft and warm.

## Physical truth
Two materials. **Plant matter**: leaves are thin, light, two-sided objects that tumble, flip and
catch light on one face; vines are flexible ropes that grow from a root and whip with inertia;
petals are softer leaves. **Life energy**: a warm green-yellow light (chlorophyll green toward
sun yellow) that gathers and releases; Solar Beam is sunlight through a lens. Grass effects are
often *windy*: leaves ride a spiral, a ring or a stream of air.

## Shape language
- Leaves: almond or crescent, pointed, with a midrib; they fly edge-on and flat alternately
  (tumble), never as discs. Count carries the read: 8–15, not one.
- Vines: a tapering rope that grows from the attacker, coils once beside it, then whips in a
  crescent stroke; two crossing lashes read as an X.
- Blades (Leaf Blade): huge cyan-green crescent streaks with sparks and flying leaf chevrons.
- Energy: a soft green-yellow sphere with yellow sparkles orbiting; a yellow-white beam with
  radial lines (Solar Beam); motes that float.
- Wind: a horizontal glowing ring or spiral around the attacker carrying leaves and dust — in the
  3D reference a lit volume, on a tilted board a trap (see failures).

## Value & light
Leaves are matter: a lit face and a shadow face, a glint along the edge, cast shadows on the
cloth. Energy is light: core pale yellow `#F7F731` → body green → soft edge; bloom on the sparkles
only. Hits are small yellow-white star sparks and thin green cut lines — many small, no single
big flash.

## Palette (sampled)
- Leaves: deep `#317B31` · body `#53B523` / `#52D63A` · hot `#8ED86A` / `#A8F078` · edge glint `#EFEFCE`
- Energy: body `#31E731` · hot `#B8E731` · core `#F7F731`; Solar Beam `#31E7B8 #52E7CE #FFFF00 #EFEFEF`.
- Accents: Magical Leaf's pink `#E040C8` and blue `#397BE7` motes; Petal Dance is a pink palette
  `#F770D0 #FF52C8 #E7B8F7` with gold `#F7D000`; Seed Flare pairs green `#52D600` with magenta `#B829F8`.
- Drift to avoid: leaves toward neon lime with no dark face → plastic confetti.

## Motion signature
- Charge: leaves rise and whirl around the attacker in a loose column or ring (400–1100 ms),
  faster and denser toward release; or a vine grows and coils (300–600 ms).
- Travel: leaves peel off in a stream toward the target with small puff trails, each tumbling;
  200–350 ms; a vine lash is one 60–120 ms stroke.
- Contact: a run of small green-yellow star sparks and thin cut lines across the target, staggered
  60–100 ms; leaf bits scatter; a small tinted flash. Energy moves: a sharp green-yellow starburst.
- Dissipation: leaves drift down under gravity with air drag (slow, swaying), fade late; cut lines
  fade; motes float up.
- Leaves never stop mid-air; they fall.

## What sells it
- Two-sided leaf sprites with a lit/shadow face flipping as they tumble; an edge glint on the
  lit face; cast shadows.
- Tumble = rotation about two axes at different rates; sway on descent.
- A vine as a tapering tube that grows along a spline with inertia at the tip; its lash is a
  motion-blurred crescent.
- Wind as thin translucent ribbons with leaves *caught* in them, not a flat ring.
- Energy spheres with fake sphere normal + orbiting yellow sparkles; beams with radial lines only
  at the impact.

## Card motion & sound
Physical: `lunge` for Vine Whip/Leaf Blade (the vine does the reaching, the card leans); ranged:
`brace`. Target: `knock`, small for leaf volleys, `stagger` for multi-cut. Sound: rustling leaves
and a whip-crack for vines; a soft chime-swell for energy; a crisp slash for blades.

## Not its neighbour
- vs **Bug**: bug is needles, shells and jittery buzz; grass flows and tumbles.
- vs **Flying**: wind ribbons alone are flying; grass wind *carries leaves*.
- vs **Fairy**: petals are grass-pink but fall with mass; fairy sparkles drift weightless.

## Reference cues (SV)
- Vine Whip: a thin bright-green vine grows from the back, coils, then whips onto the target;
  small yellow-white starburst with green sparks.
- Razor Leaf: a glowing green wind ring spins round the attacker with leaves and dust; leaves
  scatter forward; the hit is a run of small sparks and cut lines.
- Leaf Blade: three huge cyan-green blade streaks across the target with sparks, speed lines,
  leaf chevrons; the last horizontal cut biggest.
- Energy Ball: a cyan-green ring at the target, a yellow-green sphere grows with orbiting
  sparkles, contracts, releases as a starburst.
- Solar Beam: a cyan-green aura with motes, then a yellow-white beam with radial lines and a
  near-white bloom at impact.

## Failure signatures seen here → fix
- Absorb's big floor ring round the attacker reading as clip art → a green sparkle glow on the
  attacker; the pre-glow dropped.
- Leaf orientation unconfirmed (open) → leaves fly point-first along their velocity and tumble;
  check frame 3 for edge-on and flat leaves both present.
- A wind ring drawn flat at the feet → ribbons stood and leaned, leaves caught in them, or cut.
