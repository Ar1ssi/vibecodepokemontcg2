# Electric — how it reads

**Identity:** angular, branching bolts with a white-hot filament inside a coloured halo; on all at
once, snapped off, leaving an afterglow and a few stray arcs.

## Physical truth
Lightning is a plasma channel: a very thin, very bright core (white) with a coloured glow around
it (gold-yellow at game scale; blue-violet for the rarest, hottest discharges). It jumps in straight
segments with sharp angles and forks; it appears in a frame and is gone in the next; it leaves the
air glowing and crackling for a moment. It is *light*: it has no body, casts no shadow, and lights
what is near it.

## Shape language
- Bolts: polylines of straight segments with corners, forking into thinner branches; the main
  channel thickest, branches thinner and shorter; never a smooth curve.
- Knots and balls: a plasma sphere with arcs crawling on its surface and jumping off it.
- Rings: concentric electric rings around the strike point, made of short arcs, not smooth circles.
- Sparks: short bright dashes that fly and die; blue-white specks that drift up after.
- A lattice (Electro Shot's charge) is a geometric cage of bolts, tight and bright — rare, and a
  trap on a tilted board (see failures).

## Value & light (additive light)
Filament `#FFFFFF` at 1.5–2.5 (the one place white is right) → hot `#FFF7B0` → body (gold
`#FFD700` / `#FFE135`) → halo fades to nothing. The halo takes the *move's* colour: gold for
thunder, cyan `#3FE0FF` for plasma/legendary bolts, violet for Wildbolt. Bloom only on the filament.
A bolt that is all pale blue-white blooms into a cyan smear and reads as plain light.

## Palette (sampled)
- Thunder family: deep `#FFB43A`(halo edge) · body `#FFD700` · hot `#FFF7B0` · filament `#FFFFFF`;
  accent: a thin blue edge `#87CEEB` / `#B0E0E6` (Thunder Fang, Wild Charge).
- Plasma / legendary: body `#3FE0FF` · hot `#C9F7FF` · filament white · accent violet `#8E7BFF`
  (Bolt Strike), `#6A4BFF` (Electro Drift), gold core `#FFD84A` inside cyan (Zap Cannon).
- Drift to avoid: halo in the pale-blue edge colour → every bolt blooms white-cyan (a past bug).

## Motion signature
- Charge (anticipation, 200–500 ms): cheek/mouth sparks, a glow at the source, arcs crawling on
  the attacker's rim; the sound crackles.
- Strike: the bolt appears *whole* in one frame (or grows root-to-tip in two), holds 2–4 frames
  with its path re-randomised each frame (flicker), then is gone.
- Contact: a white-gold spiky starburst, concentric arc rings expanding, sparks cascading out and
  up; the target's rim lit gold.
- Dissipation: afterglow fades in 100–200 ms; one or two stray arcs jump on the target for
  300–600 ms; blue-white specks drift up. No slow fade of the bolt itself.
- Thunder: storm darkening overhead, a single steep diagonal bolt from above, the biggest burst.

## What sells it
- Jittered polylines with forks (fractal subdivision or the drawer's bolt poses), thickness
  tapering along branches; per-frame re-seed for flicker.
- Capsule/tube segments drawn with **max blending** so joints do not double up.
- A thin filament (≤ 15 % of the halo width) at HDR, halo at ≤ 0.9.
- A plasma sphere: fake sphere normal + Fresnel shell, surface arcs via noise threshold.
- Instant on, snap off: no ease on alpha; a 1–2 frame afterglow sprite.
- Sparks as velocity-stretched dashes with drag.

## Card motion & sound
`brace` with a gold rim and arcs; a contact move (Wild Charge) is a `dash` with an electric trail.
The target `knock` with a stutter (two quick re-knocks) and a gold rim. Sound: a crackle build, a
sharp snap-crack on contact, a sizzling arc tail; no whoosh.

## Not its neighbour
- vs **plain light / glow**: a bolt has corners and a filament; a glow has neither.
- vs **Fairy**: fairy sparkles are soft four-point stars that drift; sparks are hard dashes that
  fly and die.
- vs **Ice (Freeze Shock)**: cyan electric keeps its corners and snaps; ice glints and settles.
- vs **Psychic**: psychic is smooth and slow and bends the scene; electric is jagged and instant.

## Reference cues (SV)
- Thunderbolt / Thunder Shock: a single bright white-yellow bolt from the attacker to the target;
  a sharp flash and a small spark burst; the target flinches.
- Thunder: dark clouds gather; a massive bolt descends steeply; a white-gold explosion with
  concentric rings and arcing bolts; lingering arcs dissipate upward over ~2 s.
- Wild Charge: a yellow-green aura; a sprint with a white-yellow trail; a starburst with ring
  sparks and blue edge flares.
- Electro Shot: a tight blue-white lattice charges over ~1 s, then a segmented white-gold beam.
- Zap Cannon: a massive cyan sphere launched; a cyan-white explosion with a white-gold core.

## Failure signatures seen here → fix
- "Thunderbolt looks like clip art" → bolts as 3D tube capsules with a filament, lifted and arced
  off the cloth, flickering per frame; not a flat yellow polyline with a glow.
- Every bolt blooming white-cyan → the halo in the move's gold, the filament the only HDR part.
- A lattice drawn flat round the attacker → cut, or stand it as a small bright cage at the
  source for the charge only.
