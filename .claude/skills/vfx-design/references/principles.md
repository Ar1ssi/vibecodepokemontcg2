# Principles — how a real-time effect comes to read

These are the fundamentals every element file and the rubric assume. They are written as *why*
statements because the point is to see the problem in a frame, not to obey a number.

## 1. Readability: one primary read per beat

The eye can follow one thing at a time at game speed. Every beat of an effect has a **primary**
(the thing that carries the information: the fireball, the beam, the slash), a **secondary** that
supports it and gives it scale (embers off the fireball, foam on the beam, sparks off the slash),
and at most a **tertiary** ambience (haze, a floor glow, lingering motes). Three primaries = noise.

Test: squint at the frame, or scale it to a thumbnail. One shape should survive. If two shapes of
equal brightness and size survive, cut or dim one.

Hierarchy is made with *contrast*, not with size: the primary is the brightest or the most
saturated or the sharpest thing in frame; the secondary is dimmer, smaller or softer; the tertiary
is low-contrast and slow. Make all three bright and nothing is primary.

## 2. Silhouette and shape language

At thumbnail size an effect is a silhouette. Each element has a shape vocabulary that the viewer
has learned from a lifetime of real fire, water and lightning plus thirty years of games:

| Energy | Silhouette | Edges | Grows | Dies |
|---|---|---|---|---|
| Fire | licking tapers, upward | soft, eroded | from a point, upward and outward | thins to tips, blackens to soot, rises |
| Water | heavy sheets, arcs, drops | rounded, glassy, with foam where it tears | from a source, along gravity | splashes, drips, mists |
| Ice | facets, needles, hexagonal | hard, crystalline, refractive glints | grows outward in jumps | shatters or sublimes to frost mist |
| Electric | angular branching bolts, knots | hard, hot, instantaneous | all at once | snaps off; afterglow and stray arcs |
| Psychic | smooth lenses, rings, ribbons | soft, refracting, slow | swells | implodes or dissolves to motes |
| Earth | blocky debris, slabs, dust | hard chunks, soft dust | heaves up | falls under gravity, dust settles |
| Wind | ribbons, crescents, spirals | thin, fast, translucent | sweeps | unwinds and fades |
| Dark / ghost | smoke, tendrils, voids | soft, swallowing light | seeps | sinks and thins |

A shape from the wrong column is the most common reason an effect "reads as the wrong element",
before palette. Full per-element treatment: `elements/`.

## 3. Value structure: light vs matter

Two different objects, two different value structures. Confusing them is how water becomes ice
and fire becomes a lamp.

**Light** (fire, electricity, plasma, psychic glow, auras, flashes): drawn additive. Brightest and
most saturated at the core, cooling and dimming toward a soft edge that disappears into the scene.
The *surround* makes it bright: a flame over a dark card is bright, the same flame over a white
card is invisible, so give it a darker body (soot, smoke) or a coloured rim when the background is
bright. White is allowed only in filaments (the thinnest hottest lines) and the single contact
frame; a white *fill* is a slab, and bloom turns it into a disc.

**Matter** (water, rock, ice, smoke, debris, foam): drawn *over* the scene, covering what is under
it. It has a body colour, a shadow side, a lit side, a rim and often a specular glint. It takes a
shadow on the ground. It can refract. Its brightest point is a glint, not its fill. A "glow" on
matter is a thin rim of light, not a bloomed interior.

Rules that follow:
- Hot core → body → dark soft edge for light; lit side → body → shadow side + rim for matter.
- Something dark next to something bright is what makes the bright thing read. Smoke under fire,
  a deep blue under foam, soot behind embers.
- Bloom only where the value already exceeds 1.0 in a *thin* region. Bloom cannot make volume; it
  erases it by filling the dark that defined the form.
- White slab = fail. Pale blue, pale yellow, pale violet: tinted whites are how "white" should
  look at anything larger than a filament.

## 4. Colour script

Three colours plus one accent, from sampled reference hexes:
- **deep** — the dark end (shadow side, the edge of light, the smoke).
- **body** — the mid-tone you see most of.
- **hot** — the brightest, used sparingly: cores, rims, glints.
- **accent** (optional) — the one colour that is not the element's hue (electric's blue edge on
  yellow bolts, psychic's magenta against cyan, fire's magenta tinge on a high-tier flame).

Discipline:
- Hold saturation in the mid-tones. Gain (`colour * k`) on a whole fill desaturates toward white:
  water turns to ice, orange fire turns yellow then white. Gain only the hot stop; keep body ≤ 1.0.
- A ramp, not a flat fill: deep → body → hot along the form (a flame along its length, a drop from
  rim to glint, a bolt from edge to filament).
- The accent is one; two accents are a rainbow and read as "generic magic".
- The target's own art is part of the palette: a blue splash over a blue card needs its foam and
  shadow to separate it; test on a light card and a dark card.

## 5. Timing arc: anticipation, action, impact, dissipation

Mass is read from timing. Every beat that hits has four phases:

1. **Anticipation** (10–25 % of the time to contact): the attacker draws back, energy gathers at
   the source, the primary shape *forms* small and slow. Ease-in. Without it the strike has no
   cause and no weight.
2. **Action / travel**: fast. Near-linear or slight ease-out. A projectile covers the lane in
   120–250 ms at game scale; a beam reaches its target in one or two frames and then *holds*.
3. **Impact**: the single highest-contrast frame of the effect. For one to three frames
   everything stops (hit stop); the contact flash, the target's displacement and the damage read
   land here, together, and the sound transient lands here. Then the energy *leaves* the contact
   point outward (sparks, splash, shockwave), never inward.
4. **Dissipation**: the longest phase. Decelerating. The effect loses energy visibly: it shrinks,
   falls, cools, thins, drifts. A fade alone is not dissipation; the matter has to *go somewhere*
   (fire to soot and heat shimmer, water to drips and mist, electricity to a snap and afterglow).

Overlap in time only as cause and consequence: the splash begins at the beam's contact frame; the
mist begins as the splash falls. Two primaries at once is a pile, not a sequence.

Easing: anticipation eases in (quadratic or cubic); the strike is fast with a small overshoot;
settle is a damped spring (about one and a half swings, decaying by e⁻³). A pure linear fade is
the signature of an effect nobody timed.

## 6. Scale and placement

Measure everything in *subject heights* (card height on a card board, character height in a 3D
scene) and relative to the reference's proportion: if the reference's splash is one body tall,
yours is one card tall, not one card wide at a different aspect.

- A tilted camera foreshortens the ground plane. Anything drawn flat on it becomes a thin ellipse;
  stand bursts and rings upright about the contact point, arc travelling things off the ground.
- Small things need count or motion to read (eight needles, not one), big things need interior
  texture or they read as a flat blob.
- "Fills the frame" in a reference close-up translates to "about 1.5–2 subject heights" on a wide
  board: keep the energy, not the pixels.
- Place by anchor: the attacker's source (mouth, hands, the card's top edge toward the lane), the
  lane, the target's centre or its near edge. An effect floating between anchors reads as unrelated.

## 7. Depth and the 3D read

Why a thing reads as a volume rather than a sticker, in order of effect:
1. **Lighting with a direction** — a lit side and a shadow side from one consistent light. The
   single largest contributor.
2. **Occlusion** — the form hides what is behind it and is hidden by what is in front (cards,
   other elements). A beam that passes *through* the target card is a decal.
3. **Shadow or light pool on the surface** — the ground acknowledges the object.
4. **Interior texture at the right scale** — grain that moves with the form.
5. **Parallax and lean** — a billboard leaned toward the camera and lifted off the ground; near
   particles larger and faster than far ones.
6. **Rim light / Fresnel** — the edge catches the environment.
7. **Blur with speed** — a fast thing is stretched along its velocity and dimmer.

Bloom, flares and god rays are not on this list. They are the first things a model reaches for and
the last things a real effect needs.

## 8. Dissipation and secondary physics

What dies, and how, is most of an effect's screen time:
- Drops, debris and sparks have gravity and drag; they arc and they land.
- Fire thins at the tips and blackens to soot; embers rise and cool from yellow to red to grey.
- Water tears into foam where it moves fastest, drips from edges, and leaves mist that rises.
- Electricity does not fade: it snaps off, leaving a brief afterglow and one or two stray arcs.
- Smoke expands, slows and thins; it never shrinks.
- Ice shatters into shards with gravity, or sublimes into frost mist that drifts.
- Psychic energy implodes to a point or dissolves to slow motes.

## Reference brief — the format

Written before any code, saved beside your scratch frames. One block per beat.

```
# <Effect> — reference brief
Source: <clip path / frames path> · fps <n> · t0 = first frame with any effect
Subject height in the reference: <px> (all sizes below are in subject heights)

## Beat <n>: <name>   <t0>–<t1> ms
What: <shape, count, size in subject heights, where (source / lane / target / scene)>
Motion: <path, speed, ease, how it ends>
Palette: #deep #body #hot (#accent)  — sampled at frame <n>
3D version adds: <volume / lighting / camera / blur / particles>
Sound: <what lands here>

## Contact frame: <ms> — <what the single highest-contrast frame shows>
## House-rule conflicts: <full-screen tints, captions, camera moves that the brief drops, and the local substitute>
## Board mapping: <≤6 lines in the project's primitive vocabulary>
```

Example beat (from a study of Hydro Pump, Scarlet/Violet):
```
## Beat 2: the beam   1000–2500 ms
What: one continuous cyan-to-white water column from the mouth, ~0.35 heights wide, concentric
water texture running along it; white foam only at its surface streaks and its head.
Motion: reaches the target in one frame, then holds and churns; the head splashes radially.
Palette: #1878D0 #48A8E8 #88D8F8 (#F0F8F8 foam only) — frames 61–70
3D version adds: a tube with a lit stripe, the scene refracted through it, heavy spray.
Sound: a sustained rush under the hit transient.
```
