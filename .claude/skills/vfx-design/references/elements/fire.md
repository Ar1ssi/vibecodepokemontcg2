# Fire — how it reads

**Identity:** licking tapers on a temperature ramp, rising and curling, blackening to soot at the
edges and tips, shedding embers that cool as they climb.

## Physical truth
Fire is incandescent gas: hottest and brightest where fuel meets air (the base and the core), cooling
along the tongue to red, then to black soot. Hot gas rises and turbulence tears the tongue into
flickering tips. It emits light (additive) but it also makes *smoke*, which is matter and dark.
That smoke is why fire reads over a bright background.

## Shape language
- Tongues: a teardrop that swells out of its root and thins to an eroded tip; wider than you
  think at the base, never a uniform ribbon.
- A jet or burst is a *fan* of tongues from one root, not one wide shape.
- Fireballs: a nucleus with a boiling surface and a trailing tail of tongues; never a smooth disc.
- Embers: small, few, bright, with gravity-defying lift and drag; they cool from pale yellow to
  red to grey.
- Soot and smoke: soft, dark, under and behind the flame, drifting up and away.
- Edges are soft and eroded by noise, never a clean outline.

## Value & light (additive light + matter smoke)
Core (white only in the thinnest filament) → hot (pale yellow) → body (orange) → deep (red) → soot
(near black). The ramp runs *along* the tongue from base to tip and *across* it from centre to
edge. Only the last few percent of the ramp passes 1.0 so a filament blooms, never a disc. Without
the soot stop a flame over a white card face vanishes; without the dark red the orange reads as a
lamp.

## Palette (sampled, Scarlet/Violet)
- deep `#D22908` · body `#EB6C06` · hot `#F1AF0D` · core `#F5D632` (Flamethrower, Ember)
- Flame Charge `#EF0601 #F16E02 #F2B201 #F4ED01`; Flame Wheel adds `#FFFFFF` in the core only.
- Accent on high-tier flames: a **magenta-violet tinge** in the charge and the ball
  (Flamethrower's purple-magenta-tinged burst, Blast Burn's purple-pink core, Mystical Fire's
  magenta rim `#FB92F9`). One accent; use it in the core/charge, not the tongues.
- Blue fire (Blue Flare) is a separate palette: `#1E5BD6 #4FD8FF #E8FBFF`, violet-pink wrap `#E23DBF`.
- Drift to avoid: gain on the body → yellow → white: the flame becomes a light bulb.

## Motion signature
- Charge (anticipation, 200–450 ms): a white-yellow point at the source blooms into a small puff;
  2–3 flame ribbons may spin around the attacker like gyroscope rings, flinging embers (Incinerate).
- Travel: a fireball covers the lane in 150–250 ms in a shallow arc with a tongue tail; a
  flamethrower reaches in one or two frames as thick ribbons crossing the lane with embers trailing.
- Contact: a white-hot core flash *inside* the flame (one frame), then the flame engulfs the target
  and licks for 300–600 ms; sparks drift up.
- Dissipation (longest): tongues thin to tips and erode; soot darkens; embers rise and cool; heat
  shimmer (a subtle distortion) lingers after the light is gone.
- Fire never fades evenly: it dies from the tips.

## What sells it
- Temperature ramp along the tongue (techniques § Temperature ramps) with the soot stop.
- Noise erosion scrolling *toward the tip*, two scales; domain warp for the boil.
- Heat distortion of what is behind (a small refraction) under and above the flame.
- A fan of jets from one root for bursts; each root fades so the hub does not stack to white.
- Embers as velocity-stretched sprites with lift and drag, cooling colour over life.
- Smoke/soot sprites (matter, over) under the flame, rising slower than the embers.
- A light pool on the surface and an orange rim on the attacker during the charge.

## Card motion & sound
Ranged fire: `brace` / `rear-lurch` with an orange rim glow gathering; the target `knock` with a
heat veil (tinted, ≤ 0.35) fading through the settle. Sound: a whump transient on contact, a roar
whoosh for tier 3, a sizzle tail; the charge has a short fwoosh as the point blooms.

## Not its neighbour
- vs **Dragon**: dragon uses fire's structure in violet-magenta with cyan edges and is cleaner
  (no soot). Fire is warm and dirty.
- vs **Electric**: fire has no corners; everything is a curve.
- vs **a lamp**: the ramp and the soot. A flat orange-yellow fill is a lamp.
- vs **Fighting**: fighting's gold-orange bursts are starbursts and stamps with speed lines, no
  tongues, no soot.

## Reference cues (SV)
- Ember: white flash at the mouth → a low stream of embers skims the ground leaving a glowing line.
- Flamethrower: white core flash, then thick purple-tinged yellow-orange ribbons cross the lane;
  bright yellow-white core at contact; the target engulfed, flames subside.
- Flame Wheel: a tall column tightens into a spinning upright fire hoop with dark scorch streaks.
- Fire Punch: a giant stylised yellow fist with an orange flame outline squashes against the
  target and dissolves into wisps and embers.
- Overheat / Blast Burn: ground glow under the target, then towering pillars that burn and settle.

## Failure signatures seen here → fix
- Fireball core saturating white over a light card → cap the core below 1.0 except the filament;
  add soot behind it.
- Fire jets stacking white at the hub → fade each jet's root; fewer jets, wider.
- Flame as a thin vector tongue on the cloth → lift it, stand the burst upright, give it the ramp
  and erosion; it needs width at the base.
