# Critique rubric — scoring a render honestly

Score the **sheet**, never the code. Each axis 1–5. Each score carries one sentence of evidence that
names a frame ("contact frame: …", "settle: …"). Any axis under 4 blocks "done" and names the next
fix. Three rounds at most; then report misses as misses.

## The frames

Render these seven at the scene clock, freezing the animation clock (not wall time) so the frame is
deterministic:

| # | Frame | Why this one |
|---|---|---|
| 1 | Rest, before | The baseline the effect must return to; shows what it must contrast with |
| 2 | Anticipation peak | Is there a wind-up at all; does energy gather at the source |
| 3 | Mid-travel / charge peak | The primary shape in flight or at full charge: volume, texture, scale |
| 4 | Contact frame | The highest-contrast frame; hit stop; target displacement begins |
| 5 | Contact + ~120 ms | Energy leaving the contact point; the white-blowout trap frame |
| 6 | Mid-dissipation | How the matter dies; secondary physics |
| 7 | Settle | Everything back at rest, no residue, no popped overlay |
| + | Far seat / second camera | Mirrored scene reads, art turned correctly |

Compose them in one sheet next to the reference frames at the same beats (reference row above,
yours below). If there is no reference clip, the row above is the brief's text per beat.

## The axes

### 1. Volume & depth
Does every drawn thing read as a lit 3D form in the scene?
- **5** Lit side and shadow side from one light; the form occludes and is occluded by the cards;
  it casts a shadow or light pool; interior texture moves with it; lifted and leaned, nothing cuts
  the ground plane.
- **4** Lit as a volume with a rim; one of shadow / occlusion / texture is weak.
- **3** Gradient-shaded but no direction to the light; sits on the ground; some pieces are decals.
- **2** Flat fills with a soft edge; "clip art", "sticker".
- **1** Vector paths on the cloth; rings and fans around the feet.

### 2. Light & value
Is the value structure right for light vs matter, and is white where it belongs?
- **5** Core → body → dark edge for light, lit → body → shadow + rim for matter; white only in
  filaments and the contact frame; bloom only on thin >1.0 regions; the brightest point is the
  primary.
- **4** Structure right; bloom slightly wide or a glint a touch large.
- **3** Fills are too even; some white in fills; bloom softens the form.
- **2** White slab or disc at contact; a bloomed interior; heat sheen stacks white on the target.
- **1** Whiteout, full-screen bloom, god rays.

### 3. Element identity (the neighbour test)
Cover the colours with your thumb. Does shape + motion alone say the element?
- **5** Unmistakable from silhouette and motion; survives the neighbour test from `elements/README.md`.
- **4** Reads; one piece borrows a neighbour's vocabulary (a water splash with a shard, a bolt that curves).
- **3** Needs the colour to read; motion generic.
- **2** Reads as the neighbour (water as ice, electric as plain light, psychic as fairy, fire as a lamp).
- **1** Reads as "generic magic": rings, sparkles, a flash.

### 4. Palette
Against the reference hexes.
- **5** deep/body/hot match within a shade; accent present if the reference has one; saturation
  held in mid-tones; target-card interaction checked on a light and a dark card.
- **4** One stop drifts (a body a touch pale).
- **3** Hue right, saturation lost to gain: pale and chalky.
- **2** Wrong hue family (purple acid, orange rim on a blue flame).
- **1** Palette changes mid-effect; rainbow.

### 5. Scale & placement
In subject heights, against the reference proportion, on the real camera.
- **5** Sizes match the reference proportion; anchored to source / lane / target; foreshortening
  handled (stood or arced); count carries small things.
- **4** One piece ±25 %.
- **3** Primary right, secondary wrong (rings too wide, needles too small, splash too short).
- **2** Primary wrong by ×2 either way; floats between anchors.
- **1** Fills the board or is invisible.

### 6. Timing & weight
The arc and the bodies.
- **5** Anticipation → fast action → a true contact frame with hit stop → long decelerating
  dissipation; attacker drives and recoils, target knocked along the attack and settles with a
  damped spring; nothing plays on top of anything; sound transient on the contact frame.
- **4** Arc present; one phase rushed (short dissipation) or the knock a little weak.
- **3** No anticipation, or impact is a fade-in; target reacts late or wrong way.
- **2** Beats stack; constant speed; bodies static.
- **1** Everything appears at once and fades together.

### 7. Readability & hierarchy
- **5** One primary per beat survives the thumbnail; secondary supports; tertiary is quiet; the
  damage read is never covered.
- **4** Primary reads; secondary competes briefly.
- **3** Two primaries; clutter in the contact frame.
- **2** Busy; the eye has nowhere to land.
- **1** Noise.

### 8. Reference parity
Beat by beat against the brief.
- **5** Every beat present with its shape, size, timing and colour; house-rule conflicts replaced
  by the brief's local substitute; nothing added the reference lacks.
- **4** One beat compressed or simplified.
- **3** A beat missing or an extra (a ring, a flare) the reference does not have.
- **2** Same element, different effect.
- **1** Invented.

### 9. Technical cleanliness
- **5** No hard quad edges, no z-fighting, nothing clipping through a card, no popping at start
  or end, frame 7 identical to frame 1, no GL/console errors, both seats correct, fallback path
  (no WebGL / reduced motion) still reads.
- **4** One cosmetic seam visible only at freeze.
- **3** A visible pop or a quad edge cutting the cloth.
- **2** Residue after settle, or a piece drawn on the wrong side of a card.
- **1** Errors, missing textures, effect fails on one seat.

## Scoring rules

- Evidence names a frame and describes what is *in it*. Not what the code intends.
- A 4 is "the user would accept this"; a 5 is "the user would not change it". When unsure between
  4 and 3, it is a 3.
- A score under 4 names its fix from the table below, in the same row of the report.
- Round n+1 re-renders *all* seven frames; fixes move things.
- After round 3, remaining scores are reported with their fixes. No rounding up, no "mostly".

## Failure signature → cause → fix

| You see | Usual cause | Fix |
|---|---|---|
| A white slab / disc at contact | A white fill at alpha ≥ 0.6, or gain on a whole fill, or bloom threshold ≤ 1 | Tint the fill (pale blue / yellow / violet), keep fills ≤ 0.9, put the white in a filament or the one contact frame only, raise bloom threshold, lower strength |
| "Clip art", "sticker", "decal" | Shapes drawn flat on the ground plane; gradient-filled paths; no light direction | Lift and lean; give a normal and a light; texture the interior; shadow on the ground; stand bursts upright about the contact point |
| Water reads as ice | Pale cyan-white palette, hard glassy edges, static shards, foam too white and too much | Deeper saturated blue body; soft foam only where it tears; continuous flow and gravity (arcs, drips); round forms; mist not shards |
| Ice reads as water | Rounded forms, flowing motion | Facets, needles, hexagons; growth in jumps; hard glints; shatter or frost mist |
| Electric reads as plain light / cyan bloom | Soft glow without bolt structure; halo colour pale blue; everything blooms | Hard angular bolts with a hot filament and a coloured (gold or the move's tint) halo; instant on, snap off; bloom only the filament |
| Psychic reads as fairy | Pink/white sparkle, soft stars | Lens distortion and rings in violet/magenta/cyan; slow swell, implode |
| Fire reads as a lamp | Even yellow-orange fill, no soot, no taper | Temperature ramp along the tongue; eroded tips; smoke/soot under it; embers with gravity |
| Rings / fans around the attacker | Charge beats drawn as floor rings, sunbursts, lattices | Cut them; the charge is energy gathering *at the source* (a glow with motes, a coil, a sphere) |
| Weightless | No anticipation; no hit stop; fade dissipation | Add the wind-up; freeze at contact 1–3 frames; let matter fall/cool/drip |
| Target does not react / wrong way | Knock missing or not along the attack vector | Knock along the lane with a damped spring; tilt into the hit |
| Beats stack | Overlapping `at` ranges with two primaries | Sequence; keep overlap only as cause → consequence |
| Too big / too small | Sizes in px or in lane units not mapped to subject heights; count too low | Re-measure against the reference proportion; add count for small things |
| Hard quad edge cutting the cloth | Billboard intersecting the ground; no lean, no soft depth | Lean toward the camera by half the size; lift; feather the edge |
| Seam / popping at start or end | Overlay inserted at full alpha; effect removed before its fade ends | Fade in over the anticipation; remove on the settle promise, not a fixed timer |
| Pale and chalky | Gain on a whole fill; mixing toward white | Gain only the hot stop; mix toward white ≤ 0.35 except filaments |
| Effect invisible on a bright card | Light drawn additive over white | Give it a dark body (soot, deep edge) or draw matter over; a coloured rim |
| Reads as the wrong power tier | Same size, count and duration for every move | Scale count, reach and dissipation length with tier; a tier-1 move is small and quick |
