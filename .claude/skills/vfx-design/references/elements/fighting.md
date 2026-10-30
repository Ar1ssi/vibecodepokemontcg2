# Fighting — how it reads

**Identity:** physical force made visible: translucent giant limb stamps (fist, palm, foot), gold-
orange starbursts with speed lines and shards, and a flurry of hits; aura moves add a blue sphere.

## Physical truth
There is no fighting *element*; the reference's convention is impact energy — warm (gold-orange)
light that bursts *from the point of contact*, plus a stylised solid: a translucent limb that
appears beside the target, strikes, squashes against it and dissolves. Weight comes from the body
animation (a real wind-up and drive) and from hit stop more than from any particle.

## Shape language
- Limb stamps: a huge translucent white-grey or gold fist/palm/foot (sole forward for kicks)
  that pops in beside the target, slams, flattens, lingers as an outline, then dissolves.
- Starbursts: spiky yellow-white stars with orange shard streaks; radial speed lines on the big
  hit; concentric spark rings on the final blow.
- Flurries (Close Combat, Arm Thrust): staggered yellow-orange flashes and thin white/yellow slash
  streaks criss-crossing the target for ~1 s, the last biggest; grey smoke rises after.
- Aura (Aura Sphere, Focus Blast): a blue/cyan sphere charged between the paws with blue streaks,
  flown to a cyan burst.
- Wheels (Collision Course): a golden fire wheel in flight, not a spiked sun disc.

## Value & light (additive, warm)
Core pale yellow-white `#FFFFBE` (small) → hot `#EEDB00` / `#FFC85E` → body orange `#EE7900` /
`#EEAE00` → deep red-brown `#B4482C` at the shard tips. Shards and streaks carry the orange; the
starburst's white is a small core, never the whole star. Limb stamps are translucent (alpha
0.5–0.7) with a lit edge so the target shows through; a solid white limb is a slab.

## Palette (sampled)
- deep `#B4482C` · body `#EE7900` · hot `#EEAE00` / `#EEDB00` · core `#ECEBE9` (Close Combat, Arm Thrust)
- Low Sweep foot `#EEAC01` with pale yellow `#ECEC52`; Collision Course gold `#F4C93E #FFC85E #FF7A1A`
  with a violet crest edge `#D85EFF`; Secret Sword white-gold `#FFD84A` with rainbow ring accents
  cyan `#5ADCFF` / magenta `#FF4FD8` (one accent pair, only there).
- Aura: blue `#2E7CE6` body → cyan `#48E0F0` burst; keep it blue in flight, cyan at contact.
- Drift to avoid: toward white (a white cross flare, a white blob at the attacker) → normal/generic.

## Motion signature
- Wind-up (short, 150–300 ms): a crouch or rear, a warm rim gathering at the striking edge; no
  floor ring, no sun disc.
- Drive: a `lunge` or `dash` with blur; for stamp moves the attacker only shifts and the limb
  appears beside the target.
- Contact: hit stop 60–80 ms; the stamp flattens; a starburst with shards *out* of the point; the
  target knocked hard along the attack; for flurries, 4–8 staggered hits 80–140 ms apart with
  decreasing knocks.
- Dissipation: shards fall with gravity, the stamp fades to an outline then goes, grey smoke
  rises slowly, a red-orange tint at the frame edges (local vignette) lifts.

## What sells it
- Stamps as leaned, lifted translucent sprites with a lit rim; a squash *of the stamp* at contact
  (the card never squashes) and a dissolve exit.
- Starbursts from TCG Live impact textures (spikes, flash lines, ring) in the gold-orange palette,
  the white confined to a small core; orange shard streaks as velocity-stretched sprites with
  gravity.
- Speed lines only on the biggest hit, radial from the contact point, one frame or two.
- Grey smoke (matter) after a heavy hit.
- An aura sphere as a lit blue sphere with blue streaks orbiting, Fresnel shell, cyan burst.

## Card motion & sound
`lunge` with a strong reach for contact moves; `stomp` for ground-shaking kicks; `brace` for aura
shots. The target `knock` 0.3–0.45 heights, `stagger` for flurries. Sound: a thud/crack transient
(the heaviest in the bank), a grunt-whoosh wind-up, short rattle tail; flurries repeat with falling level.

## Not its neighbour
- vs **Normal**: normal is white-gold and colourless; fighting is orange with red-brown shards.
- vs **Fire**: no tongues, no soot, no ramp; starbursts and stamps.
- vs **Rock**: rock throws stones with dust; fighting throws limbs and light.

## Reference cues (SV)
- Arm Thrust: two huge translucent white-grey palms slap alternately beside the target, each with
  a small orange-gold star burst and ember flecks.
- Low Sweep: a giant translucent red-orange foot sweeps horizontally into the target's base; a
  pale-yellow star burst with orange shards and white sparks.
- Close Combat: the attacker blurs away; a ~1.2 s flurry of yellow-white starbursts and thin slash
  streaks on the target; a big white-yellow radial burst with speed lines and an orange-red edge
  tint; grey smoke.
- Triple Kick: three foot stamps, the third biggest and most orange; the target knocked back each time.
- Aura Sphere: a blue sphere between the paws, blue streaks, flown to a cyan burst.

## Failure signatures seen here → fix
- Attacker floor ring on Arm Thrust → dropped; palm/fist stamps at the defender instead.
- Close Combat / Superpower "shows almost nothing at contact" → staggered yellow-orange streak
  fans on the defender through the flurry; orange impact streaks.
- Collision Course's flat spiked sun disc (clip art) → a gold wheel unit in flight.
- Aura Sphere / Focus Blast white blob → a visible blue/cyan ball, less white.
- Sacred Sword's big white cross flare → a small gold-white flash; flares capped at 0.4 heights.
