# Ice — how it reads

**Identity:** hard, faceted, blue-white matter that grows in jumps, glints cold, and shatters into
shards or sublimes into drifting frost mist.

## Physical truth
Ice is a transparent crystalline solid: flat facets with sharp edges, internal refraction that
throws small hard glints (sometimes prismatic), a pale blue body where thick and near-colourless
where thin. It does not flow; it *forms* (frost creeps, crystals grow outward in steps) and it
*breaks* (shards with gravity, a crack, a shower). Snow and frost are its soft forms: white-grey
granular mist and flakes that settle.

## Shape language
- Crystals and needles: hexagonal prisms, spikes, lances; straight edges, pointed tips; they grow
  outward from a seed in discrete steps.
- Shards: angular fragments with gravity, tumbling, catching glints.
- Frost: a creeping fern pattern along a surface; a rim of white at a card's edge.
- Snow: soft flakes and a drifting white-grey haze; snow boulders are rounded but matte.
- Blocks: the target encased in a translucent faceted block (Glaciate).
- Beams: a blue-white beam with hard sparkle motes and flakes, not foam.

## Value & light (matter with hard glints)
Pale blue body, slightly darker blue at thick edges, facets that step in value, and small *hard*
white glints at facet corners (the only white at 1.0+). A Fresnel rim in pale blue. Frost mist is
soft and tinted. Ice never glows from inside; a "glowing ice" reads as light or as water. Snow is
matte: no glints, no refraction.

## Palette (sampled)
- deep `#2F7FD6` · body `#6FD3FF` · hot `#A6E6FF` · core `#CFF3FF` · glint `#FFFFFF` (Glacial Lance)
- Freeze Shock `#36D6F0 #A8EEFF #FFFFFF #2E7FD8`; Glaciate adds lilac `#7C5CFF`.
- Aurora / prismatic (Aurora Beam, Ice Burn's rainbow glints): a **rainbow accent** in the glints
  only — pink `#FF9A2E`-free; use the ice kit's mint `#A8F0D6` and lilac `#C8B4FF` as the two
  accents, never more.
- Drift to avoid: toward saturated mid blue → water. Ice is paler and its colour lives in the
  facets, not a fill.

## Motion signature
- Form (anticipation): frost creeps from the source; crystals grow outward in 3–5 jumps over
  200–400 ms with a glint at each step; a cold mist gathers.
- Travel: thrown shards and lances fly straight and fast (120–200 ms), tumbling with glints; a
  beam reaches in a frame with flakes drifting off it.
- Contact: a hard crack — shards burst outward with gravity, a single bright glint flash (one
  frame), frost blooms on the target's edge; for encasing moves the block forms in two or three
  jumps around the target.
- Dissipation: shards fall and skitter; frost mist drifts and thins; the block cracks and falls
  apart; a cold tint lingers on the target and fades late (tremble as it thaws).
- Ice does not flow, flicker or churn. If it moves continuously, it is water.

## What sells it
- Faceted geometry (real 3D shards, or sprites with a hard-edged faceted alpha) with per-facet
  shading and a sharp specular glint; Fresnel rim.
- Growth in steps: scale and count increase in discrete jumps, each with a glint.
- Refraction with low distortion and a pale tint; prismatic splitting at glints (offset the three
  channels slightly).
- Soft frost mist sprites (matter, over), slow, settling; snowflakes as small bright hexagons.
- Debris that writes depth and lands on the cloth.

## Card motion & sound
Ice beams: `brace`; the target `freeze` (cold tint, late tremble) rather than a plain knock when the
move freezes. Physical ice: `lunge` with shards at contact. Sound: a crack transient, glassy
chimes and a cold wind tail; a crystalline tinkle as shards land.

## Not its neighbour
- vs **Water**: water is round, continuous, saturated mid blue, soft-foamed, refracts strongly and
  flows; ice is faceted, stepped, pale, hard-glinted, static between jumps. Edges first.
- vs **Steel**: steel's highlight is white-warm and anisotropic along a surface; ice's is blue-cold
  and pointlike at corners.
- vs **Flying (wind)**: snow haze settles down; wind ribbons sweep across.
- vs **Fairy**: fairy glitters soft and pink; ice glints hard and blue.

## Reference cues (SV)
- Ice Beam: a blue-white beam with flakes; frost on the target.
- Blizzard: the target whited out in drifting snow haze and flakes (not a disc, not shards).
- Avalanche: snow boulders fall from above into a big snow cloud.
- Glacial Lance: a thrown lance, ice spikes bursting round the target.
- Glaciate: the target encased in an ice block.
- Aurora Beam: a bright prismatic beam with pink-rainbow streaks and a rainbow burst.

## Failure signatures seen here → fix
- Blizzard landing a white disc and ice shards → a drifting white snow cloud over the target,
  flakes, fewer shards.
- Avalanche dropping one icicle → a volley of snow chunks from the sky plus a white snow cloud.
- Ice Burn drawing a red grid lattice round the attacker (clip art) and a big white ice star → drop
  the lattice; a smaller star; cold flame in the ice palette.
- A water effect reading icy because of pale cyan-white and hard edges → see `water.md`.
