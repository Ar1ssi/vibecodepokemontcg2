# Flying — how it reads

**Identity:** air made visible — thin translucent white-cyan ribbons, crescents and spirals that
sweep fast, wrap, and unwind; feathers and dust kicked up; a dive comet for the big moves.

## Physical truth
Wind has no body: you see it only by what it carries (dust, feathers, speed lines) and by thin
translucent streaks of motion. Its colour is white tinted by the scene (pale cyan, pale cream),
never saturated. It is fast, long, and curved: it sweeps around things rather than hitting them,
and it dies by *unwinding* — ribbons straighten and fade, spirals loosen. Impacts are a vertical
white air streak striking down and crescent blade fragments bursting out.

## Shape language
- Ribbons: long thin translucent streaks with a soft core and a sharper leading edge, curving;
  2–4 in a sweep, spiralling around the target from feet to head for a whirlwind.
- Crescents: curved wind-blades (Air Cutter, Air Slash) with a brighter edge; a cluster of thin
  criss-cross slash lines and glints on the target.
- Comets: the attacker as a yellow-green or green-cyan comet with a white core and wind rings
  (Brave Bird, Dragon Ascent) slamming in with a big burst and radial speed lines.
- Tornadoes: a tall spiral column of ribbons on the target (Hurricane; Bleakwind adds snow).
- Feathers: a few white or coloured feathers tumbling away after a strike; pebbles kicked up at
  the take-off.

## Value & light (additive, pale)
Core white `#F8F8F8` (thin, in the leading edge) → hot pale cyan `#DDEFFF` / `#E8E8F0` → body
`#9CCFEF` / `#C8C8C0` → deep `#6B8FB3` / `#708030` at the trailing edge, fading to nothing. Alpha
is low (0.3–0.6): wind is seen through. A solid white ribbon is a slab; a white blob before the
strike is the recurring failure. Signature hues override: Brave Bird yellow-green `#C0E870` with a
red-pink aura `#E84040 #F8C0C0`; Dragon Ascent green `#3CC86A #B8F04A`; Oblivion Wing crimson
`#D91E4B #FF2E6E`; Aeroblast cyan `#26E0FF #1E63E0`.

## Palette (sampled)
- deep `#6B8FB3` · body `#9CCFEF` · hot `#DDEFFF` · core `#F8F8F8` (Bleakwind Storm, Air Cutter `#F0C8E0 #C8A8D8`)
- Gust / Peck accents: cream `#E8DCA8`, red `#E82020` (Peck's spark), yellow `#F8F030`.
- Drift to avoid: toward saturated cyan (ice/water) or toward opaque white slabs.

## Motion signature
- Charge (150–400 ms): white gust lines swirl in front of the wings; the attacker flaps (a quick
  `across` oscillation) or rears; for dives it rises off the board (`rise`) with pebbles kicked up.
- Travel: a crescent flings across in 150–250 ms on a wide arc; a dive is a `dash` with a comet
  trail and speed lines; a whirlwind forms around the target in 300–500 ms.
- Contact: a vertical white air streak strikes down onto the target (one or two frames), crescent
  fragments burst sideways, curved swoosh trails sweep past as the target is knocked; a small
  pale-blue star for pecks.
- Dissipation: ribbons unwind and straighten as they fade; fragments linger ~800 ms spinning;
  feathers tumble down slowly; dust settles.
- Wind never stops dead; it always continues past the target.

## What sells it
- Ribbons as thin leaned sprites or splines with a soft core and sharper leading edge, alpha
  0.3–0.6, long, with a slight twist along their length.
- Spirals as 3–5 ribbons on a helix around the target, radius growing then tightening, alpha
  fading as they unwind.
- Crescents as motion-blurred arcs with a brighter edge; fragments as small curved shards.
- Speed lines radial from the contact point on the big hit only; a comet trail as the attacker's
  silhouette echoed and dimmed with a coloured aura.
- Feathers as two-sided tumbling sprites with sway; pebbles as tiny debris with gravity.

## Card motion & sound
`rise` + `dash` for dives (lift with a shadow, then the drive), `brace` with a flap tremor for gusts
and cutters, `warp` for Aerial Ace's vanish. The target `knock` with wind-swept drift (the knock
continues slightly past the usual stop), `float` for lifting gusts. Sound: a whoosh rising to a
swish transient, a flutter tail; dives add a wind roar.

## Not its neighbour
- vs **Ice (snow haze)**: snow settles down; wind sweeps across and up.
- vs **Water (streams)**: water has body, refraction and foam; wind is translucent and thin.
- vs **Normal (speed lines, white force)**: normal's white is a filled warm-gold force; flying's
  white is thin, cool and transparent.
- vs **Bug (wing-blades)**: bug's are short green needles that stab; flying's are long white
  ribbons that sweep.

## Reference cues (SV)
- Gust: white curved gust lines in front of the wings, then a small white whirlwind wraps the
  target from feet to head and unwinds.
- Aerial Ace: a vanish with white air streaks and pebbles; a vertical white streak strikes down;
  yellow spark shards; curved swoosh trails as the target is knocked.
- Air Cutter: one long white crescent sweeps a wide arc; a cluster of thin white/cyan slash lines
  and glints on the target.
- Wing Attack: a tall white/cyan wing-slash drops onto the target; pale-cyan blade fragments ring it.
- Brave Bird: yellow-green aura flames and white wind rings around a white core; a flaming comet;
  a big white burst with radial speed lines; white wind curls linger.

## Failure signatures seen here → fix
- Aerial Ace / Air Cutter white blob on the attacker or the struck card → tone the glow down; the
  white slash arc is the read.
- Aeroblast orbiting cyan "atom" rings round the target with a white starburst → a cyan charge at
  the attacker, a helix/spiral beam to the defender, no flare rings.
- Brave Bird circling white feathers in a ring round the attacker → a chartreuse spiral, no ring.
- Bleakwind Storm throwing white crescents → a tall white-grey spiral column on the defender with snow.
- Dragon Ascent / Oblivion Wing in the default cyan → the signature's green / crimson.
