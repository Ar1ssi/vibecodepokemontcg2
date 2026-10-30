# Rock & Ground — how they read

**Identity (rock):** hard, faceted grey-brown stones with real mass: they rise, fly, tumble, land,
bounce and throw dust.
**Identity (ground):** the earth itself: sand and dust in sheets and vortices, glossy mud globs,
cracks that split the surface with a gold-orange glow underneath, columns and quakes that lift
the target.

## Physical truth
Stone is opaque solid matter: flat facets, a lit face and a shadow face, a sharp edge highlight,
a cast shadow, and *weight* — stones accelerate under gravity, tumble, and stop dead when they
land, kicking dust. Sand is granular: it flows in sheets and spirals, hangs as a dusty haze, and
settles. Mud is a glossy liquid-solid: rounded globs with a specular, sticking and dripping. A
crack is a dark line with light coming up through it when the ground is magma-lit.

## Shape language
- Stones: irregular polyhedra, 5–9 facets, varied sizes (one big, several small), never spheres
  or discs; a volley of several, not one.
- Debris and dust: small chunks with a dust puff on landing; dust as soft tan clouds that rise and
  thin; a low dust band lingering at the base.
- Sand: a sweeping wall, a flat horizontal vortex at the target's base with spiral streaks rising
  from it, a tall sand spiral column for storms.
- Mud: 20–30 glossy dark-brown rounded globs in a shallow arc, splatter and drips that stick.
- Cracks: a dark fracture pattern under the target with gold-orange light in it; columns and
  blades of stone erupting from the cracks; floor rings are *allowed under the defender* on quake
  moves because the ground is the subject.
- Gems (Power Gem, Diamond Storm): faceted crystals with a coloured body and pink/violet glints.

## Value & light (matter)
Stone: lit face tan-grey → body grey-brown → shadow face dark brown, an edge highlight near-white
and *small*, a cast shadow on the cloth. Dust: soft tan, tinted, ≤ 0.5 alpha, rising. Ground
energy: gold `#FFD84A` / `#F2B233` light in the cracks and columns (Land's Wrath, Precipice
Blades), red-orange `#E8282A` at the hottest. Nothing blooms except the crack light and gem glints.

## Palette (sampled)
- Rock: deep `#3A3F55` / `#5A4A3A` · body `#8B7B6F` / `#C8D0DC` · hot `#C8B8A8` · highlight `#E8D8C8`
  (Octazooka dust, Mighty Cleave); Ancient Power stones carry a **violet** glow accent.
- Sand: deep `#586818` · body `#888848` / `#A8A040` · hot `#A89868` · dust `#D9B77A` / `#E8EEF5` (Sand Tomb, Sandsear Storm).
- Mud: deep `#583828` · body `#5A4A3A` / `#786858` · gloss `#B8A858`.
- Ground energy: gold `#FFD84A` · orange `#FF8A1F` · red `#E8282A` · cream `#FFF6B8` (Precipice Blades).
- Head Smash: a red-orange tint on the cards and yellow-orange impact.
- Drift to avoid: stones toward flat grey discs; dust toward white smoke; crack light toward white.

## Motion signature
- Charge: stones rise out of the ground around the attacker in 2–4 jumps (300–600 ms), hover with
  a slight bob and a glint, dust falling off them; sand gathers as a low swirl; the ground glows
  under the target for quakes.
- Travel: stones fly in a volley, each on its own arc with gravity and tumble, 200–350 ms; mud
  globs in a shallow arc; a sand wall sweeps across the lane.
- Contact: stones *land* — a hard stop, a dust puff, a small pale spark star per stone; the
  biggest last; quakes split the ground with cracks and erupt columns under the target; the
  target lifts (`float`) or sinks (`sink`) with the ground.
- Dissipation (long): dust clouds rise, slow and thin; small debris bounces and skitters to rest;
  mud drips and stains; cracks cool from gold to dark; the low dust band is last to go.
- Stones never float at a constant speed, fade in mid-air or vanish on contact without debris.

## What sells it
- Real 3D debris (the `debris` kind: writes depth, per-facet shading, `gloss`/`smooth`) with
  closed-form gravity arcs and tumble; cast shadows.
- A big stone and many small ones; dust puffs (matter sprites, over) at each landing.
- Sand as layered translucent ribbons and a spiral column of sprites with an upward scroll.
- Mud globs as lit spheres with a specular and a drip tail; splatter decals that stick (dissolve late).
- Cracks as a dark fracture sprite under the target with an additive gold light layer in it;
  columns as upright lit prisms that erupt and sink.

## Card motion & sound
Rock throws: `brace` or `rear-lurch`; head/body slams: `lunge`. Quakes: `stomp` (the attacker
plants), the target `float` then drops, or `sink` for traps. Sound: a rumble build, a rock thud
with a rattle of debris, a sandy hiss tail; quakes add a sub-bass.

## Not its neighbour
- vs **Steel**: steel is cool silver with a long white highlight and orange sparks; stone is warm
  grey-brown with a small highlight and dust.
- vs **Fighting**: fighting's bursts are light; rock's are matter that lands.
- vs **Poison (mud vs sludge)**: mud is brown-tan and matte-glossy; sludge is violet-magenta and bubbles.
- vs **Fire (magma)**: ground's heat is gold light *in* the cracks, not tongues of flame.

## Reference cues (SV)
- Sand Tomb: a sand wall sweeps across; a flat sand vortex forms at the target's feet with spiral
  streaks rising; a low dust band lingers; the scene is dusted brown.
- Mud-Slap: a glossy dark-brown mud splash erupts before the attacker and flies as 20–30 rounded
  globs in a shallow arc; splatter sticks and drips.
- Ancient Power: several violet-ringed stones rise round the user before they fly.
- Precipice Blades: gold stone blades erupt under the target, then a red one.
- Land's Wrath: the ground lights gold and gold columns burst up under the target.
- Rock Slide: several rocks drop with dust.

## Failure signatures seen here → fix
- Ancient Power's circle round the attacker (clip art) → dropped; more stones with a violet glow.
- Rock Slide dropping only 4 small rocks → more and larger, with dust.
- Head Smash showing grey crack lines only → red-orange tint on the cards, orange impact streaks, rock debris.
- Sandsear Storm flying shards and a gold cross → a sand spiral column on the defender with embers.
- Land's Wrath fanning black spikes at the user → dropped; the gold columns stay.
- Diamond Storm's giant 4-point star flares → small flares, a rain of facet units from the sky.
- Power Gem's white needles → red-pink gems with violet glints.
