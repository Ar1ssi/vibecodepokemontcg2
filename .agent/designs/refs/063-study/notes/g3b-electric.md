# G3b electric — move animation study notes

### Nuzzle — electric · physical · tier 1
Refs: sprite none · modern EV (7000 ms, effect frames 33–73; later 133–170 is the paralysis status effect, not the attack)
Sprite beats:
- (no sprite-era animation; beats read from the EV video at 100 ms sheet resolution, t = 0 at its frame 33)
- 0–200 ms: the attacker hops up off the water and the camera stays wide on the beach; no effect shapes yet.
- 200–500 ms: the attacker darts toward the foe (it turns side-on and shrinks into the distance); a thin translucent white-blue ring appears round the foe's body and tightens on it.
- 500–600 ms: the attacker is back at its spot; a yellow-white spark flash blooms on the foe's body — contact at ~600 ms.
- 600–900 ms: the flash grows into a bright yellow-white crackling burst with small jagged bolts, wrapped in the white ring, then dims.
- 900–1330 ms: a few thin yellow bolt flecks and single white arc lines drift upward off the foe's head and out of frame, then nothing.
Screen: none (camera stays on the wide shot; no tint, no flash beyond the local burst, no shake).
Palette: #F6E04A, #FFF7B0, #FFFFFF, #B8E8F2
Modern cue: this is the whole reference. Camera never leaves the over-the-shoulder wide shot; the hit reads as a tiny, quick yellow spark burst plus a soft white ring on the foe, then small yellow bolt flecks rising away. Very low-key — affectionate rub, not a strike. The long blue-white spark crackle at 4400–5700 ms is paralysis.
Board mapping:
- 0: cardMotion(attacker, hop)
- 150: dash(attacker→defender, stop, trails: spark)
- 400: impactFlash(defender, #FFF7B0, light) + ring(defender, halo, 1)
- 450–800: burst(defender, spark, 6, 0.5 card, up) fading + aura(defender, spark, #F6E04A, 350)
- contact at 400; total 950
Flags: missing refs — no sprite-era animation (manifest sprite: null; Pokémon Central has no Gen 3–5 file); modern video only. Uncertainty — sheet step is 100 ms, so beat edges are ±100 ms; the white ring on the foe before contact is read from 3 tiles.

### Thunder Fang — electric · physical · tier 2
Refs: sprite N2B2 (2520 ms, effect frames 34–83) · modern EV (3500 ms, effect frames 35–70)
Sprite beats:
- 0–180 ms: yellow glowing sphere/aura builds around the attacker's mouth, brightens.
- 180–330 ms: sphere at full bright yellow; white spark tendrils start to flicker around it.
- 330–480 ms: sparks intensify; attacker lunges toward defender (sprite moves off-frame).
- 480–600 ms: large yellow-white sparking ball appears and hovers over the defender's body.
- 600–840 ms: ball pulses and engulfs the defender; bright white core with blue jagged spiky edges — contact at ~750 ms.
- 840–1080 ms: spark ball dims and disperses into small blue-white flicker-shapes rising off the defender.
Screen: camera follows the lunge 330–480 ms, pans back to the defender 600–900 ms. No tint, no full-screen flash, minor shimmer during contact.
Palette: #FFEB42, #FFD700, #B0E0E6, #87CEEB
Modern cue: attacker's eyes and fangs glow bright yellow-white; it rears back (wind-up), then a large stylised yellow fanged bite shape (like a crescendo or curved lightning bolt) swings from the attacker's mouth toward the foe — contact ~1166 ms after the glow starts (within the EV video at frame 53); a bright white-yellow spiky starburst and sparks explode on the foe; blue-white sparkles drift upward.
Board mapping:
- 0: aura(attacker, spark, #FFD700, 350)
- 150: cardMotion(attacker, tilt)
- 300: dash(attacker→defender, stop, trails: bolt)
- 450: projectile(bolt, 1, straight, fast, trail: spark, spin: none)
- 600: impactFlash(defender, #FFFACD, strong) + burst(defender, spark, 8, 0.6 card, ring)
- 700–1000: burst(defender, bolt, 6, 0.8 card, up) fading + aura(defender, spark, #87CEEB, 400)
- contact at 600; total 1100
Flags: none

### Wild Charge — electric · physical · tier 3
Refs: sprite N2B2 (3990 ms, effect frames 24–80) · modern EV (4000 ms, effect frames 18–54)
Sprite beats:
- 0–180 ms: attacker body shakes; blue electrical aura begins to glow around the whole body, growing brighter.
- 180–480 ms: attacker crouches low; bright blue-cyan electricity pulses around it; yellow-white spark flashes flicker intermittently; charge builds.
- 480–720 ms: attacker lunges forward toward the defender; a trail of white-yellow spark streaks follows behind; the body re-tints yellow.
- 720–900 ms: large white-yellow spark cloud hovers over the defender's body; bright glow pulses.
- 900–1200 ms: spark cloud engulfs the defender in white-yellow electricity with small bolt shapes; blue edge flashes — contact at ~1050 ms.
- 1200–1500 ms: electricity dissipates into smaller rising spark flickers and fades; attacker returns to normal.
Screen: camera stays on the wide shot; no pan, no background tint, no full-screen flash, minor shimmer during charge (180–480 ms) and contact (900–1200 ms).
Palette: #00CED1, #FFE135, #FFFF00, #87CEEB
Modern cue: attacker (four-legged forme) glows bright yellow-green with an electric aura; it charges and sprints at the foe with a white-yellow electrical trail streaking behind it; impact at the foe is a bright white-yellow spiky starburst with concentric circular spark rings and blue edge flares; sparks cascade and arc upward; contact ~1400 ms after first glow effect.
Board mapping:
- 0: aura(attacker, spark, #00CED1, 500) pulsing
- 150: cardMotion(attacker, crouch)
- 300: charge(attacker, bolt, 3, 400)
- 450: dash(attacker→defender, stop, trails: bolt)
- 750: impactFlash(defender, #FFFFE0, strong) + burst(defender, spark, 12, 1 card, ring)
- 850–1400: burst(defender, bolt, 8, 1.2 card, up) fading + aura(defender, spark, #87CEEB, 600)
- contact at 750; total 1600
Flags: none

### Thunder Shock — electric · special · tier 1
Refs: sprite N2B2 (1980 ms, effect frames 6–30) · modern EV (3500 ms, effect frames 18–38; bonus frames 40–75 for paralysis status effect)
Sprite beats:
- 0–180 ms: yellow-white spark bolts flutter and crackle around the attacker's body; crackling sound implied.
- 180–360 ms: sparks grow brighter and more numerous around the attacker.
- 360–540 ms: small bright yellow-white spark bolt shoots from the attacker toward the defender (fast arc).
- 540–720 ms: the spark reaches the defender and flashes white-yellow on contact; small blue spark flecks scatter outward.
- 720–900 ms: spark afterglow fades; attacker returns to normal.
Screen: no camera motion, no background tint, no full-screen flash, no shake.
Palette: #FFE135, #FFEB3B, #FFF44F, #E0E6FF
Modern cue: attacker (Pikachu on a beach) winds up with cheek sparks glowing bright yellow-white; a single bright white-yellow spark bolt streaks from its mouth to the opponent on the far side (human trainer in modern form); the bolt hits as a sharp white-yellow flash with a small spark burst; the opponent flinches.
Board mapping:
- 0: aura(attacker, spark, #FFE135, 300)
- 150: projectile(bolt, 1, straight, fast, trail: spark, spin: none)
- 450: impactFlash(defender, #FFFFE0, light) + burst(defender, spark, 4, 0.3 card, up)
- 550–800: burst(defender, spark, 2, 0.4 card, up) fading
- contact at 450; total 900
Flags: none

### Shock Wave — electric · special · tier 2
Refs: sprite none · modern none (no animation files available)
Sprite beats:
- (no sprite-era animation and no modern video reference available; entry written from memory of the move's behaviour in modern games)
- 0–200 ms: attacker glows bright blue-white around the body; a faint rippling shimmer spreads outward from the attacker's location.
- 200–400 ms: the shimmer grows into a visible wave or series of expanding concentric rings of blue-white electricity; the first wave reaches the defender.
- 400–700 ms: multiple rings hit the defender in sequence; bright white-yellow flash on the defender's body — contact at ~400 ms.
- 700–1100 ms: the rings dissipate and fade to transparent blue static; small spark motes drift upward.
Screen: (from memory) no camera motion, no background tint, no full-screen flash, minor shimmer/ripple visual effect during the wave propagation.
Palette: #00D4FF, #87CEEB, #E0E6FF, #FFFFFF
Modern cue: (from memory, unverified) a sonic-wave-like energy ripple emanates from the attacker, forming expanding rings of blue-white electricity; the defender is engulfed in multiple concentric electric-ring impacts; the wave is purely kinetic (no projectile object), making it appear inevitable and unavoidable — matching the modern-game mechanic where Shock Wave never misses.
Board mapping:
- 0: aura(attacker, spark, #00D4FF, 300)
- 150: ring(table, shockwave, 3) expanding outward, then hitting defender
- 350: impactFlash(defender, #FFFFE0, medium) + ring(defender, target, 2)
- 450–800: burst(defender, spark, 6, 0.6 card, ring) fading + aura(defender, spark, #87CEEB, 400)
- contact at 350; total 1100
Flags: missing refs — no sprite-era animation and no modern video files (manifest sprite: null, modern video not fetched); entry written from memory of the move's behaviour in Pokémon Scarlet/Violet and is unverified against any visual reference. The "never misses" mechanic was read into the wave nature but has no visual source.

### Electro Shot — electric · special · tier 3
Refs: sprite none · modern EV (7500 ms, effect frames 15–430)
Sprite beats:
- (no sprite-era animation; beats read from the EV video, t = 0 at frame 15 where the glow starts)
- 0–300 ms: the attacker (Raichu-Alola) glows bright blue-white; white streaks and sparkles flicker around the body as energy builds.
- 300–900 ms: a geometric lattice structure of blue-white lightning forms and surrounds the attacker, growing more defined and luminous; the lattice glows brighter with white-gold interior streaks.
- 900–1100 ms: the lattice structure compresses tightly around the attacker; the glow intensifies to near-white.
- 1100–1400 ms: the compressed lattice decompresses and shoots as a solid white-yellow beam toward the defender; the beam has thin blue-white edges and internal segmented lightning structure.
- 1400–1600 ms: the beam hits the defender with a massive bright white-gold starburst and spiky ray explosion; the attacker appears to discharge a secondary arc backward — contact at ~1400 ms.
- 1600–2100 ms: the explosion settles into lingering white-gold sparks and blue arcs around the defender; the sparks fade upward and out.
- 2100–2500 ms: a pinkish-purple glow appears around the attacker (stat boost effect, not part of the attack itself) and slowly fades as the animation winds down.
Screen: camera stays wide on both attacker and defender throughout; no pan, no background tint or full-screen flash, no shake; the lattice and beam provide all dramatic visual.
Palette: #00BFFF, #87CEEB, #FFD700, #FFFFFF
Modern cue: the attacker charges a complex geometric structure of blue-white lightning into a tight lattice, building intensity over ~1 s; the lattice releases as a segmented white-gold beam with blue edges that strikes the foe with an extremely bright and sharp spiky explosion; secondary arcs and trailing sparks persist long after impact, creating a "lingering discharge" effect.
Board mapping:
- 0: aura(attacker, spark, #00BFFF, 700) pulsing bright
- 200: canvas(geometric blue-white lightning lattice structure forming and tightening around the attacker card over ~800 ms)
- 600: ring(attacker, halo, 2) bright blue-white
- 900: beam(bolt, wide, segmented, 300, medium) with white-gold colour
- 1200: impactFlash(defender, #FFFFE0, very strong) + burst(defender, spark, 15, 1.2 card, random)
- 1300–1800: burst(defender, bolt, 10, 1 card, up) fading + aura(defender, spark, #87CEEB, 700)
- contact at 1200; total 2100
Flags: missing refs — no sprite-era animation (manifest sprite: null; Electro Shot is a Gen 8 move with no sprite precedent). Modern video exists but was only analysed at the 100 ms sheet resolution; beat edges are ±100 ms uncertain.

### Thunder — electric · special · tier 3
Refs: sprite N2B2 (3840 ms, effect frames 12–48) · modern EV (6600 ms, effect frames 20–98)
Sprite beats:
- 0–120 ms: the whole background (sky) gradually shifts from blue to yellow-orange; the game environment becomes tinted.
- 120–360 ms: the sky tint deepens; a dense dark-yellow cloud forms overhead; the attacker stands still.
- 360–720 ms: the cloud darkens; electrical yellow-white energy crackles inside the cloud; attacker glows faintly with yellow electricity as it channels.
- 720–900 ms: multiple massive bright yellow-white lightning bolts streak down from the cloud toward the defender; white flash on contact with the defender — contact at ~840 ms.
- 900–1200 ms: lightning bolts fade; the background colour shift reverses, sky returns to blue; faint blue-white afterglow remains.
Screen: full-screen background colour tint (yellow-orange #FF9900 → #FFFF99) from 120–1200 ms. No camera motion, no full-screen white flash beyond the impact glow, minor electrical shimmer during the discharge (720–900 ms).
Palette: #FFD700, #FFFF00, #FFD966, #FFFFFF
Modern cue: dramatic weather shift — attacker (Raichu) on a beach; dark storm clouds gather overhead (~200–600 ms); the attacker tilts/raises its ears as if channelling; a massive bright yellow-white lightning bolt descends from the clouds in one steep diagonal strike; at impact (~1000 ms), a huge white-gold explosion engulfs the defender; concentric electric rings and multiple arcing bolts radiate outward; the explosion compresses then bursts again with lingering arcs that dissipate upward over ~2 s.
Board mapping:
- 0: vignette(table, #FFD700, 0.6, 1200) fading in over 300 ms
- 150: cardMotion(attacker, tilt)
- 400: charge(attacker, bolt, 2, 500)
- 600: projectile(bolt, 3, straight, very fast, trail: spark, spin: none) descending onto defender
- 900: impactFlash(defender, #FFFACD, very strong) + burst(defender, spark, 15, 1.3 card, random)
- 1000–1800: burst(defender, bolt, 10, 1.2 card, up) fading + ring(defender, shockwave, 2) + aura(defender, spark, #FFD700, 800)
- contact at 900; total 2000
Flags: house-rule conflict — sprite tints the entire background yellow-orange for ~1 s; replaced by a vignette around the defender. Modern features weather-shift camera effects and full-screen cloud imagery; simplified to local card effects.

### Zap Cannon — electric · special · tier 3
Refs: sprite N2B2 (5940 ms, effect frames 24–90) · modern EV (4500 ms, effect frames 18–34)
Sprite beats:
- 0–200 ms: attacker stands neutral; yellow-white electrical glow begins to build around the body.
- 200–480 ms: the glow intensifies to bright yellow-white; crackling and sparking sounds implied; attacker tilts slightly as it channels.
- 480–600 ms: a large dark-blue sphere of pure electrical energy materialises on the table to the left of the attacker; it glows with bright inner light.
- 600–900 ms: the sphere swells and pulses, its glow intensifying; bright yellow-white spark flickers escape from it.
- 900–1050 ms: a burst of bright yellow electric sparks and bolts shoots from the sphere toward the defender; white-yellow flash on contact — contact at ~1020 ms.
- 1050–1200 ms: a full-screen radial sunburst pattern fills the view: dense radiating blue and yellow-black electrical lines emanate from the defender (the "cannon" discharge effect).
- 1200–1500 ms: the sunburst pattern fades; attacker returns to normal stance.
Screen: full-screen radial sunburst pattern (rays of blue and yellow-black) from 1050–1200 ms (house-rule conflict: sunburst fan is not permitted; replaced by local effects). No camera motion, no background tint, no partial screen flash.
Palette: #0099FF, #00BFFF, #FFD700, #FFFF00
Modern cue: attacker (Magnezone) glows bright blue-cyan with visible electrical arcs; it charges a massive sphere of bright blue-cyan energy in front of itself; the sphere launches toward the foe in one powerful shot; impact is a brilliant cyan-white explosion with a concentrated core of white-gold light and radiating blue electrical waves.
Board mapping:
- 0: aura(attacker, spark, #0099FF, 600) pulsing
- 150: cardMotion(attacker, tilt)
- 300: charge(attacker, bolt, 4, 700)
- 550: orb(lane, large, #0099FF, hover) moving toward defender
- 800: impactFlash(defender, #FFFFE0, very strong) + burst(defender, spark, 16, 1.3 card, random)
- 900–1500: burst(defender, bolt, 12, 1.2 card, up) fading + ring(defender, shockwave, 3) + aura(defender, spark, #00BFFF, 800)
- contact at 800; total 1800
Flags: house-rule conflict — sprite includes a full-screen radial sunburst pattern (blue/yellow-black rays); this violates the "no sunburst fans" rule and is replaced by local card effects (ring + burst + aura).
