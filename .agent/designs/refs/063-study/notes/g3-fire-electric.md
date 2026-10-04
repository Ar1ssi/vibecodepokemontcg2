### Flame Charge — fire · physical · tier 1
Refs: sprite N2B2 (4710 ms, effect frames 36–142) · modern EV (5500 ms)
Sprite beats:
- 0–60 ms: camera pushes in on the attacker (no effect shapes yet).
- 60–810 ms: ~10 fat flame puffs (yellow core, red rim) spawn at the attacker's feet and climb its side in a vertical loop that encircles the body; the attacker sprite is re-tinted red-orange for the whole charge.
- 870–1950 ms: the puffs swirl down and clump around the lower body, pulsing; the attacker squashes into a crouch (1770–1950 ms).
- 1950–2400 ms: the attacker springs forward-right out of frame; no projectile, the camera follows it toward the defender.
- 2640–2760 ms: white 4-point star with a red/orange fire rim flashes on the defender's centre — contact.
- 2820–3180 ms: ~12 small flame puffs form a ring round the defender, rise and spread upward, then fade to translucent smoke.
Screen: camera push-in on attacker 0–60 ms; camera tracks the charge and pans/zooms to the defender 1950–2580 ms; pans back 3240–3600 ms. No background tint, no full-screen flash, no shake.
Palette: #EF0601, #F16E02, #F2B201, #F4ED01
Modern cue: red-orange flame ribbons spiral round the attacker as a hollow swirl shell (~0–470 ms after first effect), it hops, curls up and is wrapped in a glowing yellow-orange fire sphere crackling with streaks, then rams off-screen; impact is a local white-gold spiky starburst on the foe (~1430 ms) with sparks drifting off. A separate Speed-up swirl (white/pink wind rings round the attacker) follows the hit — stat effect, not part of the attack.
Board mapping:
- 0: aura(attacker, flame, #F16E02, 400) + cardMotion(attacker, crouch)
- 380: dash(attacker→defender, stop, trails: ember)
- 600: impactFlash(defender, #FFF4E0, medium) + burst(defender, flame, 8, small, ring)
- 650–950: burst(defender, ember, 10, 0.6 card, up) fading out
- contact at 600; total 1000
Flags: none

### Flame Wheel — fire · physical · tier 2
Refs: sprite N2B2 (3720 ms, effect frames 44–110) · modern EV (3500 ms)
Sprite beats:
- 0–540 ms: camera slowly pushes in on the attacker (no effect shapes yet).
- 540–1080 ms: a chain of ~8 small flame balls (yellow core, red rim) appears behind the attacker and orbits it in one vertical wheel — down the back, under the feet, up the front, over the top — the balls growing as they go.
- 1080–1260 ms: the attacker lunges forward-right out of frame; no projectile, the camera pans to the defender.
- 1320–1500 ms: white 4-point star flashes on the defender's centre while ~12 small flame flecks spray out from it in a ring — contact at ~1380 ms.
- 1560–1980 ms: ~8 larger flame puffs scattered round the defender float up and outward, shrink and fade.
Screen: camera push-in on attacker 0–540 ms; pan/zoom to the defender 1080–1320 ms; pan back 2040–2340 ms. No tint, no full-screen flash, no shake.
Palette: #D02A0B, #F0700C, #F3CB11, #FFFFFF
Modern cue: attacker's back flames flare and drip sparks, it drops to all fours and is swallowed by a tall column of yellow fire that tightens into a spinning upright fire hoop (a 3D ring volume, dark scorch streaks in it); the camera follows the hoop as it rolls at the foe with speed streaks. Impact is a white-hot core inside the wrapping ring plus a spray of embers (~1730 ms after first effect); the foe recoils.
Board mapping:
- 0: aura(attacker, flame, #F0700C, 500) + canvas(ring of 8 ember balls orbiting the attacker card once, growing)
- 450: cardMotion(attacker, spin) + dash(attacker→defender, stop, trails: flame)
- 750: impactFlash(defender, #FFF4E0, medium) + burst(defender, ember, 12, 0.6 card, ring)
- 800–1300: burst(defender, flame, 8, 1 card, up) drifting out and fading
- contact at 750; total 1350
Flags: none

### Fire Punch — fire · physical · tier 3
Refs: sprite IT5 (6200 ms, effect frames 92–241) · modern EV (3501 ms)
Sprite beats:
- 0–300 ms: camera swings off the attacker and zooms onto the defender.
- 300–1050 ms: the whole background ramps from blue/teal to deep crimson; then the defender sprite itself turns pink-red (1125–1200 ms).
- 1275–1425 ms: one big translucent dark-red fist appears over the defender and shrinks fast onto it (comes "out of the screen"), ending as a small solid red fist pressed on the defender's head.
- 1425–1650 ms: fist holds on the defender.
- 1725–2000 ms: the fist bursts into a dense clump of yellow-orange fire over the defender — contact at ~1725 ms.
- 2000–2475 ms: the clump breaks into ~15 flame flecks that scatter out and up, drift and fade; the fist fades out by ~2525 ms.
- 2475–3725 ms: defender stays red-tinted; red background fades back to blue as the camera pans back (2800–3725 ms).
Screen: camera pan/zoom to the defender 0–300 ms and back 2800–3725 ms; full-screen crimson background tint (~#8A1A1A) 300–3725 ms. No white flash, no shake.
Palette: #D1070F, #EB7000, #F1AB00, #EDD500
Modern cue: the attacker only winds up (no fire on it); cut to the foe, where a giant stylised yellow fist with an orange flame outline slams in from the side, yellow spiky impact lines radiate, the fist squashes flat against the foe, then dissolves into orange flame wisps and rising embers. Contact ~130 ms after the fist appears; no screen tint.
Board mapping:
- 0: vignette(defender, #8A1418, 0.45, 1700) fading in over 500 ms
- 300: lunge(attacker→defender, reach 0.85, windup 300)
- 650: canvas(large red-orange flaming fist over the defender, scaling 1.6→1.0 onto the card in 250 ms)
- 900: impactFlash(defender, #FFD24A, strong) + burst(defender, flame, 10, 0.8 card, ring) + shake(card, small, 250)
- 950–1600: burst(defender, ember, 12, 1 card, up) fading; aura(defender, flame, #EB7000, 500)
- contact at 900; total 1800
Flags: house-rule conflict — sprite tints the whole background crimson for ~3.4 s; replaced by a vignette around the defender.

### Ember — fire · special · tier 1
Refs: sprite N2B2 (2670 ms, effect frames 32–84) · modern EV (3000 ms)
Sprite beats:
- 0–480 ms: camera pans from the attacker to the defender and zooms in; no projectile is drawn crossing.
- 480–720 ms: a single yellow teardrop flame (~¼ of the defender's height) appears on the defender's body — contact at ~480 ms — and flickers up into a taller orange/red flame tongue licking the body.
- 690–1050 ms: the defender sprite turns solid red (burn tint); the flame shrinks to small flickers at its head and goes out.
- 1050–1560 ms: defender stays red-tinted, then returns to normal as the camera pans back.
Screen: camera pan/zoom to the defender 0–480 ms, back 1200–1560 ms. No tint, no flash, no shake.
Palette: #F5D632, #F1AF0D, #EB6C06, #D22908
Modern cue: attacker rears back, a small white flash at its mouth blooms into a puff of yellow fire (≈150 ms), then a low stream of embers skims along the ground to the foe, leaving a glowing red-orange line on the floor; contact ~530 ms after first effect with a small bright spark, then embers crackle and flicker round the foe and die out over ~500 ms.
Board mapping:
- 0: cardMotion(attacker, tilt)
- 150: projectile(ember, 3, straight, fast, trail: spark, spin: none)
- 500: impactFlash(defender, #FFD866, light) + aura(defender, flame, #EB6C06, 400)
- 550–900: burst(defender, ember, 6, 0.5 card, up) fading
- contact at 500; total 950
Flags: uncertainty — the sprite draws no projectile at all (flame just appears on the defender); the lane projectile is taken from the modern ember stream.

### Incinerate — fire · special · tier 2
Refs: sprite N2B2 (5070 ms, effect frames 52–146) · modern EV (4000 ms)
Sprite beats:
- 0–150 ms: a small yellow spark at the attacker's mouth swells into a fireball.
- 150–330 ms: a chain of fat fire puffs (yellow core, red rim, dark smoky tail) streams diagonally from the attacker to the defender while the camera swings to follow; head of the stream reaches the defender at ~330 ms — contact.
- 330–870 ms: the stream keeps pouring as 6–8 puffs along the lane into the defender's body, with an orange-brown smoke haze where it hits.
- 870–1050 ms: stream cuts off; its tail puff lands and splits into 2–3 separate flame columns (stacked puffs) standing on the defender.
- 1050–2280 ms: the columns burn and wander over the defender's body; the defender sprite turns solid red.
- 2160–2640 ms: flames die; the defender's head goes black with dark smoke puffs rising off it (scorched), then clears.
Screen: camera swings from attacker to defender 150–330 ms, pans back 2820–3480 ms. No tint, no flash, no shake.
Palette: #F10B00, #F36C01, #F4B001, #F3EC00
Modern cue: the attacker glows white-hot from within, then 2–3 golden-orange flame ribbons spin round it horizontally like gyroscope rings, flinging embers (~0–550 ms); one fire arc whips to the foe — a small white arc slash, then a white-yellow bloom (~870 ms) that becomes a crackling fire engulfing the foe, sparks drifting up for ~1 s before dying out.
Board mapping:
- 0: aura(attacker, flame, #F36C01, 350) + ring(attacker, halo, 2)
- 250: beam(flame, medium, pulse-train, 450, low)
- 450: impactFlash(defender, #FFE070, medium) + aura(defender, flame, #F36C01, 600)
- 500–1000: burst(defender, flame, 3, 0.5 card, up)
- 1000–1350: cloud(defender, smoke, small, up) fading
- contact at 450; total 1400
Flags: none

### Mystical Fire — fire · special · tier 2
Refs: sprite none · modern EV (3500 ms, effect frames 24–84)
Sprite beats:
- (no sprite-era animation; beats read from the EV video, t = 0 at its frame 24)
- 0–270 ms: a flame ignites at the attacker's wand/hand and is swung through the air, leaving a looping fire trail that curls over and down in front of it.
- 270–700 ms: the trail closes into an upright fire circle in front of the attacker, rimmed by a thin violet/magenta magic-circle line, with a red glow behind it.
- 700–830 ms: the circle fills with yellow fire; thin white light streaks flick out of it.
- 830–1170 ms: a huge billowing mass of yellow-orange fire laced with magenta sparkles and white streaks blasts out of the circle and rolls across to the foe (camera rides along).
- 1170–1300 ms: the fire mass reaches the foe; a white 4-point twinkle marks contact at ~1300 ms.
- 1370–1700 ms: spiky yellow impact burst with pink flame tongues; the foe is engulfed in yellow fire with magenta wisps.
- 1730–1930 ms: the fire recedes into licks at the foe's feet and dies out; the foe recoils.
Screen: camera close behind the attacker, tracks the fire mass to the foe 830–1300 ms, cuts back 1930–2130 ms. No tint, no flash, no shake.
Palette: #F9920B, #FCCF31, #FDEF53, #FB92F9
Modern cue: the defining read is the hand-drawn fire circle (a flat glowing ring volume with a magenta rim) that then vents a soft volumetric fireball cloud; magenta sparkle particles ride inside the yellow fire; the hit is a spiky yellow starburst plus an engulfing yellow-pink flame cloud on the foe.
Board mapping:
- 0: aura(attacker, flame, #FCCF31, 400) + canvas(fire trail drawn as one upright loop over the attacker card, magenta rim)
- 400: ring(attacker, halo, 1) in #FB92F9
- 550: beam(flame, wide, widening, 350, medium) with magenta sparkle flecks
- 900: impactFlash(defender, #FFF3B0, strong) + burst(defender, spark, 10, 0.8 card, random) in #FDEF53/#FB92F9
- 950–1350: aura(defender, flame, #F9920B, 400) fading
- contact at 900; total 1350
Flags: missing refs — no sprite-era animation (manifest sprite: null; Pokémon Central has no Gen 3–5 file); modern video only.

### Lava Plume — fire · special · tier 2
Refs: sprite N2B2 (3390 ms, effect frames 38–112) · modern EV (4500 ms, effect frames 0–89)
Sprite beats:
- 0–360 ms: large red-orange explosion bursts spawn at the attacker's feet, expanding outward and upward; the attacker shakes but stays in place.
- 360–1050 ms: ~8–10 large red-orange lava sphere effects (bubble-like, darker red core, orange rim) scatter across the playfield from attacker toward defender, rising and falling; a brownish smoky haze trails behind them.
- 1050–1500 ms: lava spheres contract and fall back down; the attacker's sprite returns to normal position; effects fade to translucent smoke.
- 1650–2100 ms: a few final embers and smoke wisps drift up and vanish.
Screen: no camera motion, no background tint (green/tan battlefield visible throughout), no white flash, minor vibration during the explosion (0–360 ms).
Palette: #D1070F, #EB7000, #F1AB00, #9B6B47
Modern cue: attacker plants its feet firmly; a blue-purple ground energy glow (shockwave ripples) spreads outward from beneath the foe (~400 ms); then a massive orange-yellow lava eruption bursts upward in multiple tall geysers / plume columns engulfing the foe; magma spray and embers cascade; contact is a white-hot core flash within the plumes (~1470 ms); the foe recoils as the eruption settles into licking flames.
Board mapping:
- 0: charge(attacker, flame, 1, 600)
- 300: terrain(defender, fissure) + aura(defender, flame, #EB7000, 800)
- 450: burst(table, flame, 8, 1.5 card, scatter) with lava sphere shapes
- 900: impactFlash(defender, #FFD866, strong) + burst(defender, flame, 12, 1.2 card, ring)
- 950–1500: cloud(defender, smoke, large, up) fading; aura(defender, flame, #EB7000, 600)
- contact at 900; total 1600
Flags: none
### Flame Burst — fire · special · tier 2
Refs: sprite N2B2 (2550 ms, effect frames 29–57) · modern USUL (4040 ms, effect frames 20–65)
Sprite beats:
- 0–270 ms: camera and sprites are still; no effect drawn yet (text typing).
- 270–750 ms: a cluster of light blue energy waves/ripples emanates from the attacker and spreads toward the defender, growing in size.
- 750–1200 ms: the blue wave reaches the defender; yellow-orange flame colours mix in; a burst of orange-yellow flame erupts at the defender's position — contact at ~900 ms.
- 1200–1500 ms: the flame/orange aura around the defender grows and then fades; blue glow subsides.
Screen: no camera motion, no background tint, no white flash, minor ripple shimmer during the wave (270–900 ms).
Palette: #3366CC, #FF9900, #FFCC00, #FF6600
Modern cue: a large orb of yellow-white flame with orange-red edges bursts into existence roughly midway between attacker and foe (~800 ms); it then bounces/rolls toward the foe in a smooth arc, shrinking slightly and leaving an orange smoke trail; at the foe, a secondary sparkle/impact burst (white-yellow) flashes; lingering flame wisps dissipate. Contact ~800 ms.
Board mapping:
- 0: charge(attacker, flame, 1, 400)
- 250: projectile(flame, 1, arc, medium, trail: ember, spin: none) homing toward defender
- 650: impactFlash(defender, #FFF9E6, strong) + burst(defender, flame, 6, 0.8 card, ring)
- 700–1200: aura(defender, flame, #FF9900, 500) fading; burst(defender, ember, 4, 1.2 card, up)
- contact at 650; total 1200
Flags: none
### Blast Burn — fire · special · tier 3
Refs: sprite N2B2 (6540 ms, effect frames 27–145) · modern EV (5000 ms, effect frames 32–98)
Sprite beats:
- 0–810 ms: static setup; text typing; background begins to tint red.
- 810–1350 ms: background is now deep red (#8A1418); large red-orange vertical fire pillar shapes emerge at the attacker's position, growing taller.
- 1350–2460 ms: pillars peak at maximum height, yellow flames mix in at the tops, creating a dense cluster; defender sprite is tinted red-orange.
- 2460–3000 ms: yellow flame pillars erupt on the defender side, reaching tall above it; the yellow flames are at peak intensity — contact at ~2460 ms.
- 3000–4050 ms: the pillars shrink and fade; the red background tint gradually fades back to normal.
Screen: full-screen red background tint (#8A1418) starting ~810 ms and fading out ~3600 ms. No white flash, no shake.
Palette: #D1070F, #EB7000, #FFD700, #FFFF00
Modern cue: attacker rears back and channels energy into a large purple-pink-core fire orb with yellow edges (~1050 ms); the orb explodes down and across toward the foe in a blast of purple and gold fire; a golden ring forms on the ground where the foe stands (~1650 ms); towering yellow-orange flame pillars erupt in a circle around the foe with golden ring arcs, engulfing the target (contact ~2450 ms); the pillars burn and gradually settle as the battlefield clears.
Board mapping:
- 0: charge(attacker, flame, 1, 800) + vignette(attacker, #8A1418, 0.4, 2700) fading in
- 400: orb(lane, large, #FFD700, grow-release)
- 1000: terrain(defender, fissure)
- 1200: pillar(defender, fire, tall) ×3 spread in an arc
- 1400: impactFlash(defender, #FFF9E6, strong) + ring(defender, shockwave, 2)
- 1450–2200: burst(defender, flame, 15, 1.5 card, ring) fading; aura(defender, flame, #EB7000, 800)
- contact at 1400; total 2100
Flags: house-rule conflict — sprite tints the entire screen red for ~2.8 s; replaced by a vignette around the defender fading in.
### Overheat — fire · special · tier 3
Refs: sprite N2B2 (5130 ms, effect frames 36–113) · modern EV (5499 ms, effect frames 24–109)
Sprite beats:
- 0–1080 ms: attacker (Ho-Oh) wings glow faintly with red-orange light; text typing phase.
- 1080–1440 ms: wings brighten, a large red-orange sunburst-like circular effect emerges behind the attacker's wings.
- 1440–2100 ms: the sunburst expands; yellow colours mix in at the core, making it brighter and larger; defender appears in foreground.
- 2100–2430 ms: the effect is at peak intensity with bright yellow-orange-red colors; the entire area around the defender glows.
- 2430–3300 ms: the intense glow fades slowly; the effect shrinks and cools from yellow toward red.
- 3300–3900 ms: the red glow fades back to normal; background returns to regular colors — contact at ~2430 ms.
Screen: gradual darkening/reddening of the entire screen as the glow builds (1080–2430 ms), then gradual lightening as it fades. No white flash, no shake.
Palette: #D1070F, #EB7000, #FFD700, #FFFF00
Modern cue: attacker rears up with flames licking around it; ground beneath the foe begins to glow orange; a massive burst of yellow-orange-white flame erupts upward and outward engulfing the foe; the flames are dense and billowing, with embers cascading; contact is a white-hot core flash at the foe's position (~2700 ms); the foe is surrounded by tall, intense flames that gradually cool and settle.
Board mapping:
- 0: charge(attacker, flame, 1, 1000)
- 400: terrain(defender, quake-cracks) + vignette(defender, #8A1418, 0.3, 1700) fading in
- 700: burst(table, flame, 10, 2 card, ring) rising
- 1000: impactFlash(defender, #FFF9E6, very-strong) + ring(defender, shockwave, 3)
- 1050–2000: aura(defender, flame, #EB7000, 1000) fading; burst(defender, ember, 20, 2 card, ring) fading
- contact at 1000; total 2000
Flags: none
### Flamethrower — fire · special · tier 3
Refs: sprite IT5 (6600 ms, effect frames 88–175) · modern EV (4533 ms, effect frames 44–89)
Sprite beats:
- 0–2200 ms: static field with attacker and defender in position; text typing; background is normal green.
- 2200–2650 ms: background tints red-brown; attacker's mouth begins to glow/brighten in red-orange.
- 2650–3100 ms: a continuous stream of fat red-orange flame puffs shoots from the attacker's mouth across the lane toward the defender; the puffs are large, blocky, and move swiftly — contact at ~3100 ms.
- 3100–3600 ms: the stream continues to hit the defender; large orange-yellow flame puffs accumulate around the defender's body.
- 3600–4375 ms: the stream fades out; the red background tint fades back to green.
Screen: full-screen red-brown background tint starting at ~2200 ms and fading out ~3600 ms. No white flash, no shake.
Palette: #D22908, #EB6C06, #F1AF0D, #F5D632
Modern cue: attacker (Charizard) rears back with flame building in its mouth; a white core flash (~1480 ms) then a large burst of purple-magenta-tinged yellow-orange flame erupts and travels diagonally across to the foe; thick ribbons and streaks of fire cross the lane with embers trailing; contact is a bright yellow-white core with orange flares (~1900 ms); the foe is engulfed in intense orange-yellow flame for several frames before it subsides.
Board mapping:
- 0: charge(attacker, flame, 1, 800)
- 400: beam(flame, wide, pulse-train, 650, medium)
- 700: impactFlash(defender, #FFF9E6, strong) + burst(defender, flame, 8, 1 card, ring)
- 750–1300: aura(defender, flame, #EB6C06, 600) fading; burst(defender, ember, 10, 1.2 card, up) fading
- contact at 700; total 1450
Flags: house-rule conflict — sprite tints the entire screen red-brown for ~1.4 s; replaced by localized flame aura on the defender.
