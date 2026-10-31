---
name: vfx-design
description: Design, build and honestly critique real-time game VFX — attack and move animations, particles, shaders, impacts, hits, auras, beams, projectiles, explosions, glow and bloom, element effects (fire, water, ice, electric, psychic…), and the motion of the attacker and target during a hit (wind-up, lunge, recoil, knockback, settle), plus the sound that lands with them. Use this skill whenever a task touches any visual effect in a game or interactive scene, even when the user only says an effect "looks flat", "like clip art", "cartoonish", "washed out", "too white", "like the wrong element", "too big/small", "weightless" or "off". Load it BEFORE reading the effect's code: it changes how you look at the reference, how you build the effect in layers, and it makes a render-and-critique loop with a scored rubric mandatory before you may call anything done. Not for UI chrome, layout or static illustration.
---

# VFX design for games

## Why this skill exists

Three failures keep coming back when a model builds game VFX, and all three are failures of
*looking*, not of code:

1. **Flat / clip-art.** Shapes drawn as filled vector paths or decals on the ground plane. A
   tilted camera sees a sticker. Real VFX are *lit volumes*: they have a core, a body, a rim, a
   shadow and a position in depth. Nothing in this skill matters more than this one shift.
2. **Weightless motion.** Beats that start at full speed, impacts with no contact frame, bodies
   that never anticipate or recoil, dissipation that just fades. The eye reads mass from timing.
3. **Judging from the code.** Deciding an effect is done because the constants look right. The
   only evidence that an effect reads is a frame you looked at next to the reference frame.

So the method below is deliberately front-loaded on reference and layered build, and it ends in a
loop that does not let you report "done" on a render you have not scored.

## The method — in this order, every time

### 0. Name the moment (≤5 lines, in your scratch notes)
What happens, to whom, at what power tier, in how many milliseconds, and where the eye must be
at each beat (attacker → lane → target → aftermath). An effect that cannot be described as a
sequence of three to five beats will not read as one on screen either.

### 1. Get the reference — never from memory
Fetch the actual clip or frames of the thing you are imitating (the game's own animation, the
studio's reference, the user's video). Extract frames at a fixed rate and *look at them*. Write a
**reference brief**: each beat with a time range, what appears (shape, count, size relative to the
subject), its palette as 3–4 sampled hexes, how it moves, how it dies, and what the 3D version adds
(volume, lighting, camera, blur). The format and an example are in
`references/principles.md § Reference brief`. When no clip exists, build the brief from the
nearest sibling effect plus the element file in `references/elements/`, and say so in your report.

Card text, rulings and *reference looks* are the same kind of thing: looked up, never recalled.

### 2. Design the read before you touch code
Decide, and write down:
- **Hierarchy.** One primary read per beat (the thing the eye lands on), one secondary layer that
  supports it (trails, sparks, foam), tertiary ambience at most. Three things fighting = clutter.
- **Silhouette.** What shape the beat is at thumbnail size. If you cannot draw it in one stroke,
  the viewer cannot see it in 200 ms.
- **Value structure.** Where is the brightest point, what surrounds it, where is the dark that
  makes it bright? Additive *light* (fire, electricity, psychic glow) is bright core → body → dark
  soft edge; *matter* (water, rock, ice, smoke) is a translucent or solid body with a lit rim and a
  shadow. White lives only in filaments, glints and the one contact frame. Never in fills.
- **Colour script.** Three colours (deep, body, hot) plus at most one accent, taken from the
  reference hexes. Hue drift toward white or cyan under gain is how water becomes ice and fire
  becomes a lamp; hold saturation in the mid-tones.
- **Timing arc.** Anticipation → action → impact → dissipation, with the impact frame the single
  highest-contrast frame of the whole effect and dissipation the longest phase, decelerating and
  losing energy (shrinking, falling, cooling). Nothing plays on top of anything: beats overlap in
  time only when one is the dissipation of the other.
- **Card / body motion.** The subject anticipates and drives, the target takes the hit along the
  attack direction and settles with a damped spring. Rules and timing tables:
  `references/card-motion.md`.
- **Sound.** Which cue carries anticipation, which transient lands on the contact frame, what tail
  matches the element. `references/sound-coupling.md`.
- **Element identity.** Read the element's file in `references/elements/` and its "not its
  neighbour" section before drawing a single shape. Most "looks wrong" verdicts are an element
  reading as its neighbour (water as ice, electric as plain light, psychic as fairy).

### 3. Build volumetric from the first line
Every drawn thing is a lit 3D form, not a decal:
- Lift it off the surface and face it to the camera with a lean, so it does not cut the ground.
- Give it a normal (sphere, tube or bumped sheet) and light it from one consistent direction with
  a Lambert body, a Fresnel rim and a small specular glint; let the surface under it take a shadow
  or a light pool.
- Texture its interior (noise erosion, a flow map, a flipbook) so it has grain at the scale the
  camera sees; a smooth gradient reads as plastic.
- Let only filaments and glints exceed 1.0 for bloom. Bloom is a garnish on light that already
  reads; it cannot create volume and it will erase it.
- Make it obey mass: gravity on drops and debris, drag on sparks, inertia on anything that stops.
Formulas and the traps behind each of these: `references/techniques.md`.

### 4. Render, critique, iterate — mandatory, with a hard bar
Render the **seven frames**: rest before · anticipation peak · mid-travel or charge peak · the
contact frame · contact + ~120 ms · mid-dissipation · settle. Add one frame from the far seat or
the second camera when the scene has one. Compose them next to the reference frames at the same
beats into one sheet and *read the sheet*, not the code.

Score every axis of `references/critique-rubric.md` from 1 to 5 with one sentence of evidence that
names the frame. The axes: volume & depth · light & value · element identity · palette · scale &
placement · timing & weight · readability & hierarchy · reference parity · technical cleanliness.

- **Any axis under 4 blocks "done".** Fix the cause the rubric names, re-render, re-score. Up to
  three rounds.
- After three rounds, report the remaining misses as misses, with their scores. Never round up,
  never describe a 3 as "mostly there".
- Score what you see. "The code sets the rim to 0.6" is not evidence; "frame 4: the drop has a
  bright rim up-left and a darker rim down-right" is.

### 5. Report
State the reference you followed and where the frames live, the final rubric with evidence,
what changed and why, the taste calls you made and the ones the user should make, and exactly
which beats to look at in the real app. Deliver the comparison sheet itself, not a description of it.

## Hard rules — each is a past correction, and the reason is the rule

- **No whiteouts, white slabs or white discs.** White over a dark scene reads as a hole or a
  sticker, and over a bright card face it disappears. White is for a filament or the one contact
  frame; a splash is pale *blue*, foam is *tinted* white, a flash has a coloured corona.
- **No decals on the ground plane.** Flat rings around the attacker's feet, "floor rings", lattice
  grids and sunburst fans read as clip art on a tilted camera. A ring is a lit torus or it is cut.
- **Nothing on top of anything.** Sequence beats; a scene is a sentence, not a pile.
- **One palette from start to payoff.** No mid-effect backdrop change, no full-screen tints, no
  caption boxes or ribbons unless the reference has them and the brief keeps them.
- **The element must survive the neighbour test.** Cover the hexes with your thumb: does the shape
  and motion alone say water and not ice? If not, it is not finished.
- **The target reacts along the attack.** A knock that goes the wrong way, or none, costs more
  weight than any particle buys back.
- **Looking is the verification.** A unit test proves the maths; only a frame proves the look.

## What to read, and when

| Need | Read |
|---|---|
| The reference brief format, hierarchy, value, colour, timing and scale principles | `references/principles.md` |
| Scoring an effect, and the failure-signature → cause → fix table | `references/critique-rubric.md` |
| Shader and implementation formulas (erosion, Fresnel, fake volume normals, flipbooks, trails, bloom math, blend modes, refraction, depth) | `references/techniques.md` |
| Attacker and target motion: anticipation, drive, hit stop, recoil, knockback, settle, timing tables | `references/card-motion.md` |
| Sound timing against the contact frame, layering, tier mapping | `references/sound-coupling.md` |
| Particle, fill-rate and frame-time budgets; what a software renderer can and cannot tell you | `references/performance.md` |
| One element's shape, value, palette, motion, textures and its neighbours | `references/elements/<element>.md` (index and neighbour table in `elements/README.md`) |
| This repository: pipeline map, where constants live, capture commands, house rules verbatim | `references/this-repo.md` |

Read the element file and the rubric for every task. Read the others when the task touches them.
Read only the element you work on; the files are independent.

## Report template

```
## <Effect> — <round n of ≤3>
Reference: <clip/frames path or "nearest sibling: X + elements/Y.md">; brief at <path>
Frames: <sheet path> (rest · anticipation · travel · contact · +120 · dissipation · settle · far seat)

| Axis | Score | Evidence (frame) |
|---|---|---|
| Volume & depth | n | … |
| Light & value | n | … |
| Element identity | n | … |
| Palette | n | … |
| Scale & placement | n | … |
| Timing & weight | n | … |
| Readability & hierarchy | n | … |
| Reference parity | n | … |
| Technical cleanliness | n | … |

Changed: <files, one line each, with the why>
Decided for you: <taste calls you made>
Your call: <taste calls only the user can make, each with a rendered A/B if cheap>
Look at: <the exact beats and seats to check in the app>
Misses (if any after round 3): <axis, score, what would fix it>
```
