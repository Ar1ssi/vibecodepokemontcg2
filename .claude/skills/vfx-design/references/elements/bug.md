# Bug — how it reads

**Identity:** many small hard things — needles, stingers, shells, wing-blades — in jittery, rapid,
repeated motion, in chitin green-yellow with grey-white edges; buzz moves add green sound rings.

## Physical truth
Insects are small, hard, numerous and fast: their attacks are volleys of needles, repeated stabs,
scissor cuts and rapid wing-beats. Their colour is chitin: lime-green to yellow-green with a
glossy, slightly iridescent highlight, grey-white at edges and tips. Bug energy (Bug Buzz, Signal
Beam) is a vibration — expanding rings and oscillating lines in green, with a cyan or magenta
accent for the beam. Bug motion *jitters*: small irregular timing offsets, repeated hits.

## Shape language
- Needles and stingers: thin tapered spikes, pointed, flying point-first; 6–12 in a volley
  (count is the read — one small needle is invisible).
- Scissors and horns: crossed blade streaks (X-Scissor) in green-white; a single thick horn
  thrust (Megahorn) with a drill-like twist.
- Wings: translucent, veined, fast-beating (Air Slash shares with flying; bug wings are shorter
  and greener).
- Buzz rings: concentric green rings expanding from the attacker, oscillating in thickness, with a
  wavy edge (sound).
- Webs and silk: thin white strands with a sheen (String Shot).
- Swarms: many tiny dark dots with glints moving as a cloud (Infestation).

## Value & light (hard matter + green light)
Needles: body chitin green `#9ACD32` / `#7FA82A` → tip and edge grey-white `#E6E6E6` with a sharp
glint; a dark shadow side. Buzz: additive green `#39FF6A` rings → hot `#C6FFE3` edge, fading. The
white lives in needle tips and glints; a white blob at contact is not bug.

## Palette (sampled)
- deep `#3FA34D` · body `#7FFFD4`-ish lime `#9ACD32` · hot `#C6FFE3` · edge grey-white `#E6E6E6`
  (Ivy Cudgel's lime `#7FFFD4 #C6FFE3 #3FA34D`, Fell Stinger's green-yellow ring glow)
- Accent: yellow `#FFE14D` for sting sparks; Signal Beam's rainbow (cyan/magenta/green) is its own.
- Drift to avoid: toward grass's leafy green with flowing motion, or toward colourless grey needles.

## Motion signature
- Charge (150–300 ms): needles bristle out of the attacker's rim in a jittered fan; a green-yellow
  ring glow at the stinger; wings blur.
- Travel: a volley of needles flies point-first, straight and fast (100–180 ms), staggered
  30–60 ms apart with jitter; a scissor cut arrives in two crossing 80 ms strokes.
- Contact: each needle lands with a tiny green-yellow spark and a small knock (stagger); the last
  hit is a slightly bigger green burst; a horn thrust is one hard hit with a hit stop.
- Dissipation: needles stick briefly then dissolve; sparks die fast; buzz rings fade as they
  expand; a few green motes drift.
- Bug timing is never even: offset each repeat by a small random amount.

## What sells it
- Needles as velocity-aligned tapered sprites (`alignDeg` along the flight heading) with a glint
  at the tip and a shadow side; size 0.12–0.2 heights so they read, count 6–12.
- Stagger with jitter on both emission and impact; `stagger` knocks on the target.
- Scissor streaks as two motion-blurred crescents crossing at the target with a green-white edge.
- Buzz rings as stood, leaned ring sprites with a wavy edge (noise on the radius), expanding and
  thinning, oscillating alpha at a high rate (vibration).
- Chitin highlight: a thin iridescent sheen (slight hue shift along the highlight).

## Card motion & sound
`lunge` with a quick, short reach for horns and bites; `brace` for volleys with a buzzing rim
jitter (tiny high-frequency `across` tremor during the charge). The target `stagger` for volleys,
`knock` for horns. Sound: a buzz build, sharp tick/snick transients per needle, a chitinous click
tail; Bug Buzz a droning swell.

## Not its neighbour
- vs **Grass**: grass flows (leaves tumble, vines whip) and is leaf-green with a dark face; bug
  jitters (needles, scissors) and is chitin-lime with grey-white tips.
- vs **Flying**: flying's wing-blades are long white ribbons that sweep; bug's are short green
  needles that stab.
- vs **Ice (needles)**: ice needles are pale blue, glint cold, and grow in place; bug needles are
  green-grey and fly.

## Reference cues (SV)
- Pin Missile: a volley of green needles flies at the target, each landing with a small spark.
- X-Scissor: two crossing green-white blade streaks on the target.
- Fell Stinger: a needle stab under a green-yellow ring glow.
- Bug Buzz: green sound rings expand from the user; the target shakes.
- Megahorn: a thick horn thrust with a twist into a hard hit.

## Failure signatures seen here → fix
- **"Pin Missile needles small"** (open verdict): needles sized for the canvas at ~0.06 heights
  with no tip glint → 0.12–0.2 heights, aligned to flight, a grey-white tip glint and a dark side,
  8–12 of them staggered; each landing with a spark and a small stagger knock.
- Fell Stinger showing only the card rim → a visible lime needle in flight (spiked unit).
- Bug attacks reading as grass → chitin palette and jitter, not leaf flow.
