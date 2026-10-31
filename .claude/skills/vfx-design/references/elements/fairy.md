# Fairy — how it reads

**Identity:** pink-white light that glitters: soft sparkles, four-point twinkles, hearts, petals,
moonlight and pink wind ribbons, with lilac shadows and a cyan or green accent; gentle, weightless,
and *filled*, never outlined.

## Physical truth
Fairy is glamour: soft, diffuse light with many small bright points that twinkle (scale and alpha
pulsing out of phase), drifting with no gravity, often carried on a pink wind. Its bodies are
spheres of soft pink-white light (an orb, a moon, a dome) with a lilac rim. Its impacts are a
sparkle shower and a pink burst, sometimes a white dust-cloud brawl with gold stars and hearts.

## Shape language
- Sparkles and twinkles: filled four-point stars and small soft dots, varied sizes, pulsing;
  dozens, not a few; never stroked outlines.
- Orbs and domes: a soft pink-white sphere with a lilac rim (Moonblast's moon, Fleur Cannon's
  charge, Nature's Madness's pink-teal sphere); a soft dome engulfing the target.
- Wind: pink-white ribbons spiralling to the target with sparkles caught in them.
- Hearts and petals: pink hearts (Draining Kiss, Play Rough), soft petals (Petal Blizzard shares
  with grass).
- Beams: a pink beam with a pale core and a magenta halo (Fleur Cannon), slim.
- Light rays: soft pink rays fading (Dazzling Gleam), from the source outward, brief.

## Value & light (additive, soft)
Core `#FDF3FF` / `#FFF1F6` (small, in the orb centre or a twinkle's heart) → hot pink `#FD9EFC` /
`#FEBCFD` → body `#F09CEA` / `#D887CC` → deep lilac `#AE8FDA` / `#7A3CFF`. Accent: cyan `#ACF9FC`
(Nature's Madness dome) or green `#E8FF5A` (Springtide burst, Draining Kiss drain). Bloom lives in
the twinkles' hearts; a bloomed moon disc is a white disc (a past flag). The lilac deep is what
separates fairy from "white sparkle".

## Palette (sampled)
- deep `#AE8FDA` · body `#F09CEA` · hot `#FD9EFC` · core `#FDF3FF` (Fleur Cannon, Heart Swap)
- Springtide Storm `#FBBEAF #FF2DAA #FFF1F6 #E8FF5A #FFD84A`; Nature's Madness `#ACF9FC #FFA5C0 #D887CC #FF8B5B`.
- Drift to avoid: toward pure white (a white blob, a white beam slab) or toward psychic violet.

## Motion signature
- Charge (300–600 ms): sparkles gather and swirl at the source, a soft pink glow grows, hearts or
  petals rise; the twinkles pulse out of phase.
- Travel: a pink wind spiral carries sparkles to the target in 300–500 ms (slow for an attack);
  an orb floats; a beam fires soft-edged and holds briefly.
- Contact: a pink burst with a sparkle shower, a soft dome swelling and fading, gold stars and
  hearts for rough play; a small pink flash, never white.
- Dissipation: sparkles twinkle out one by one, drifting up with no gravity; petals fall slowly;
  the glow fades last; drained energy returns to the user as green-white orbs.

## What sells it
- Many small filled twinkle sprites (the TCG Live sparkle/star textures) with per-sprite phase on
  scale and alpha; bloom only on their hearts.
- Orbs as soft spheres with a lilac Fresnel rim and a pale core, not a flat disc.
- Pink wind as thin translucent ribbons on a spiral path with sparkles emitted along them.
- Hearts and petals as two-sided sprites tumbling slowly with no gravity (hearts) or slight sway (petals).
- A soft dome: a large sphere at low alpha with a soft rim, dissolving.

## Card motion & sound
`brace` with a pink rim and a gentle `float` on the attacker for moon moves; the target `knock`
softly, or `float` for engulfing domes. Sound: chimes and a glitter shimmer, a soft pop on contact,
a twinkling tail.

## Not its neighbour
- vs **Psychic**: psychic is violet-magenta with lens distortion and rings and dims the scene;
  fairy is pink-white, glitters, and does not bend anything.
- vs **Ice**: ice glints hard and blue and settles; fairy twinkles soft and pink and drifts up.
- vs **Normal**: normal is white-gold without sparkle.
- vs **Grass (petals)**: grass petals have mass and fall; fairy petals float.

## Reference cues (SV)
- Dazzling Gleam: pink-white sparkle and multicoloured glints flash from the user.
- Fairy Wind: pink-white wind ribbons swirl to the target with sparkles.
- Moonblast: moonlight, a pink-white orb, a pink burst.
- Draining Kiss: a pink heart kiss, then green-white orbs drain back to the user.
- Play Rough: a white dust-cloud brawl on the target with gold stars and pink hearts.
- Fleur Cannon: pink sparkle charges, a pink beam into a pink burst.

## Failure signatures seen here → fix
- Dazzling Gleam's stroked star outlines (clip art) → filled twinkles and sparkle glints.
- Fairy Wind as a pink beam slab plus a white blob → a pink spiral wind, no slab.
- Moonblast's moon as a white bloomed disc (flagged) → a soft pink-white sphere with a lilac rim,
  the bloom confined to a small core.
- Draining Kiss's white drained orbs → green tint.
- Play Rough's small pink slashes → a white dust cloud on the target with gold stars and hearts.
