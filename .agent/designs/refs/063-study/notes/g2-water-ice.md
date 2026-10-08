### Aqua Jet — water · physical · tier 1
Refs: sprite N2B2 (4020 ms, effect frames 30–120) · modern EV (3501 ms)
Sprite beats:
- 0–420 ms: no effect shapes; camera drops low behind the attacker and pushes in on it.
- 450–630 ms: attacker sprite tilts forward and shrinks as it leaps into the distance toward the defender; gone at 630.
- 690–1050 ms: pale-cyan water spouts (flame-shaped vertical jets, ~1/3 screen tall) burst up where the attacker stood, with flat white speed streaks skimming the ground; a new jet appears each few frames as the camera tracks along the lane.
- 1110–1710 ms: camera reaches the defender; 3–4 tall blue water columns stream past and through the defender left→right, white ground streaks under them.
- 1770–2280 ms: one tall blue column stands on the defender (contact ≈1770); ~15 cyan droplets fly out in a ring and fall; white sparkle specks around the base.
- 2340–2700 ms: column gone; a white/grey sparkle mist hangs over the defender, drifts up and fades.
Screen: camera push-in 0–420, camera track attacker→defender 690–1110, camera return ≈2880–3000; no tint, flash or shake.
Palette: #A8D8E8, #88C8F8, #3898C8, #F0F8F8
Modern cue: camera cuts low behind the attacker, which is wrapped in a swirling translucent water shell crossed by thin white speed lines; the water mass rushes the camera (motion blur). Cut to the defender: white splash puff on contact (≈1.97 s) and 3–4 thin white arcs expanding over the defender, a few droplets hang and fade.
Board mapping:
- 0: aura(attacker, water, #88C8F8, 250)
- 200: dash(attacker→defender, stop, trails: gust-line white streaks + droplet spray)
- 450: impactFlash(defender, #A8D8E8, medium) + burst(defender, droplet, 12, 0.6 card, ring)
- 450–750: pillar(defender, water, 0.8 card) + ring(defender, halo, 2)
- contact at 450; total 1000
Flags: none

### Waterfall — water · physical · tier 2
Refs: sprite N2B2 (3600 ms, effect frames 30–108) · modern EV (4333 ms)
Sprite beats:
- 0–240 ms: no effect shapes; camera pushes in on the attacker.
- 300–420 ms: background darkens to black around both Pokémon.
- 480–600 ms: background fades into a full-screen scrolling waterfall: blue and lilac zigzag bands falling downward (stays until 2100).
- 600–1080 ms: 6–8 small clear bubbles (white rim, transparent) rise and cling around the attacker.
- 1080–1200 ms: camera rushes past the attacker toward the defender (attacker swells in the foreground, then leaves frame) — the charge.
- 1200–1740 ms: contact ≈1200; defender sprite blanched grey-white; periwinkle and deep-blue paint-splat blobs (4–6, irregular star-edged) burst out of the defender's top and bob upward, small blue dots scatter; thin white vertical water streaks pour down over the defender; 1–2 white star hit sparks at its base.
- 1800–2100 ms: splats gone, defender colour returns; waterfall background still scrolling.
- 2160–2340 ms: background fades to black, then back to normal at 2400.
Screen: camera push-in 0–240; black fade 300–420; full-screen waterfall background 480–2100; black fade 2160–2340; camera rush toward defender 1080–1200. No shake.
Palette: #4888C8, #C8B8D8, #7888F8, #1818F0
Modern cue: a frothy white-blue geyser erupts from the ground at the attacker (≈1.0–2.0 s) while it rears; the attacker lunges and a churning water column bursts up under the defender (≈2.2–3.5 s), spray fanning sideways, with 5–6 repeated yellow-white star flashes as the water pummels it; foam fades by 3.7 s. Camera low and close on the defender for the hit.
Board mapping:
- 0: pillar(attacker, water, 0.6 card) + cardMotion(attacker, crouch)
- 250: vignette(defender, #4888C8, 0.35, 900)
- 300: lunge(attacker→defender, reach 1.0, windup 150)
- 550: impactFlash(defender, #C8D8F8, strong) + pillar(defender, water, 1.2 card) + burst(defender, droplet, 12, 0.8 card, up)
- 650–1100: burst(defender, droplet, 8, 0.5 card, down) for the falling white streaks
- contact at 550; total 1300
Flags: house-rule conflicts — sprite blacks out the background twice and swaps the whole background for a scrolling waterfall pattern (480–2100); translated to a defender vignette.

### Liquidation — water · physical · tier 2
Refs: sprite none · modern EV (4533 ms, effect frames 22–112)
Sprite beats:
- none (Gen VII move, no sprite animation). Beats below are read from the EV video, t = 0 at frame 22.
- 0–1040 ms: whole scene tints lilac/indigo; attacker wrapped in a translucent blue water aura — flame-like water tongues licking over its body, small bubbles rising, ripple rings on the ground beneath it, a white-blue glint pulsing on its back.
- 1110–1180 ms: attacker surges forward toward the defender, water streaming off it.
- 1240–2280 ms: cut to the defender; flurry of ~10 cartoon impact pops around it: 4-point yellow and coral-red stars and cyan water puffs/curls, each living 100–200 ms, scattered left and right of the defender.
- 2280–2350 ms: one big yellow-white flash star with orange spikes on the defender — the final hit (contact).
- 2420–2620 ms: an expanding cyan bubble-sphere shockwave around the defender with white radial spike lines and a few floating bubbles.
- 2690–3020 ms: blue water ribbons and droplets fall away and fade; the tint lifts.
Screen: whole-scene lilac tint 0–3020; camera cut attacker→defender at 1240; no shake.
Palette: #3898E8, #48E0F0, #F0E890, #E87060
Modern cue: water aura reads as a living skin of blue flame-like water on the attacker plus ground ripple rings; the hit is a comic brawl of yellow/coral stars and cyan puffs ending in a big white-yellow star, then a cyan spherical shockwave with radial white spikes and bubbles; ribbons of water drip off.
Board mapping:
- 0: aura(attacker, water, #3898E8, 400) + ring(attacker, ripple, 2)
- 350: lunge(attacker→defender, reach 1.0, windup 200)
- 600, 720: burst(defender, star, 2, 0.4 card, random) — pre-hit pops, no damage
- 850: impactFlash(defender, #F8F0C0, strong) + ring(defender, shockwave, 1) + burst(defender, bubble, 10, 0.8 card, ring)
- 950–1250: burst(defender, droplet, 8, 0.6 card, down)
- contact at 850 (last pop carries the damage); total 1350
Flags: missing refs — no sprite-era animation (Pokémon Central has no Gen 3–5 animation either), modern only; house-rule conflict — the video tints the whole scene lilac for the whole move (dropped).

### Wave Crash — water · physical · tier 3
Refs: sprite none · modern EV (6501 ms, effect frames 48–122)
Sprite beats:
- none (Gen VIII move, no sprite animation). Beats below are read from the EV video, t = 0 at frame 48.
- 0–100 ms: the attacker turns into a translucent blue water shell.
- 200–1070 ms: a swirling water vortex spins flat on the ground around the attacker: white foam ring churning, blue bubbles rising off it, thin white light streaks radiating outward, deep-blue glow at its core.
- 1170–1470 ms: the vortex collapses into a dense white froth cloud around the attacker, which then scatters into foam flecks.
- 1570–1870 ms: the attacker rides forward on a curling cyan-white wave toward the defender, white streak arcs trailing.
- 1970–2270 ms: crash: a huge cyan-white radial splash bursts out of the defender, filling most of the frame, motion blur (contact ≈1970).
- 2370–2570 ms: sheets of blue water and spray streaks settle and fade.
- (≈3400 ms on: the attacker is shown again for the recoil text; no visible recoil effect.)
Screen: camera cuts to a low side view of the attacker (frame 33), whip-pans with the charge (≈1570), close on the defender for the crash; motion blur 1970–2270; no tint.
Palette: #5898F8, #98E8F8, #E8F8F8, #2850E0
Modern cue: a ground vortex of churning foam and bubbles winds up around the attacker like a whirlpool, then the attacker surfs a curling wave and the impact is a radial cyan-white splash explosion with blur that briefly fills the frame; water sheets drip down after.
Board mapping:
- 0: aura(attacker, water, #5898F8, 1100) + terrain(attacker, wave) spinning foam ring
- 900: cloud(attacker, mist, 0.9 card, up) white froth puff
- 1050: dash(attacker→defender, stop, trails: wave crest + foam flecks)
- 1350: impactFlash(defender, #E8F8F8, strong) + burst(defender, droplet, 20, 1.2 card, ring) + ring(defender, shockwave, 1) + shake(card, medium, 300)
- 1450–1900: cloud(defender, mist, 1.0 card, down) settling spray; cardMotion(attacker, recoil) on the ghost's return
- contact at 1350; total 2000
Flags: missing refs — no sprite-era animation (Pokémon Central has none either), modern only; house-rule conflict — the video's crash splash fills most of the frame (kept local to the defender).

### Aqua Tail — water · physical · tier 3
Refs: sprite IT5 (6681 ms, effect frames 44–128) · modern EV (3500 ms)
Sprite beats:
- 0–260 ms: no effect shapes; camera pushes in on the attacker.
- 310–1450 ms: wind-up, body only: the attacker sprite sways, flattens to the left, rears up tall, then settles back (tail-swing pose).
- 1530–1980 ms: 12–15 large clear bubbles (white rims, pale-cyan fill) spray sideways out of the attacker in two clusters, drift outward and shrink; 3–4 concentric white ripple rings spread on the floor under the attacker, the floor patch tints blue.
- 2240–2810 ms: camera pans to the defender; the blue floor tint fades.
- 2900 ms: a white-pink motion-blur crescent swipes across the top of the defender — the tail strike (contact).
- 2990–3250 ms: a thick white foam band wraps the defender's base and spreads sideways; white sparkle specks spray up above the defender.
- 3340–3690 ms: the foam turns lilac, sinks and fades; sparkles drift and fade.
Screen: camera push-in 0–260, pan to defender 2240–2810; no tint, flash or shake.
Palette: #F8F8F8, #A8D8E8, #4898D8, #D8C8E8
Modern cue: the attacker leaps and corkscrews out of a crown of white-cyan splash, water spiralling around it; cut to the defender as a thick translucent cyan tail-arc (a curved water tube) sweeps in from below, contact is a white star flash with a horizontal cyan water streak (≈2.3 s), then a white-blue spray burst and glittering droplets.
Board mapping:
- 0: cardMotion(attacker, spin) + ring(attacker, ripple, 3)
- 300: burst(attacker, bubble, 12, 0.8 card, ring)
- 650: lunge(attacker→defender, reach 1.0, windup 250)
- 1000: slash(defender, blade, 1, 30°) drawn as a thick cyan water crescent; impactFlash(defender, #F8F8F8, medium) + burst(defender, droplet, 14, 0.9 card, cone)
- 1100–1750: cloud(defender, mist, 1.0 card, sideways) white foam band fading lilac + cloud(defender, sparkle, 0.6 card, up)
- contact at 1000; total 1800
Flags: none

### Water Gun — water · special · tier 1
Refs: sprite N2B2 (2970 ms, effect frames 41–86) · modern EV (3501 ms)
Sprite beats:
- 0–120 ms: no effect shapes; camera pushes in on the attacker.
- 180 ms: a small white puff appears at the attacker's mouth.
- 240–480 ms: a chain of soft glowing cyan-white blobs (round, evenly spaced, 6–8 visible at once) streams in a straight line from the attacker to the defender's upper-left; the head reaches the defender at ≈480 (contact).
- 480–720 ms: camera pans and zooms onto the defender while the stream keeps flowing.
- 540–1170 ms: continuous stream hammers the defender; blobs bunch up and compress at the impact point, puffs of white-grey mist burst there.
- 1230–1350 ms: stream ends; leftover white mist fades on the defender.
Screen: camera push-in 0–120, pan/zoom onto defender 480–720; no tint, flash or shake.
Palette: #D8F8F8, #68F8F8, #48D8D8, #F8F8F8
Modern cue: small and quick: the attacker rears back, a white-cyan glow flares at its mouth and a short spray of water streaks shoots out; on the defender a white-cyan splash sphere bursts (≈2.2 s), water clings and drips off it. No camera change.
Board mapping:
- 0: cardMotion(attacker, tilt)
- 150: beam(droplet, 0.12 card, pulse-train, 500, low)
- 450: impactFlash(defender, #D8F8F8, light) + burst(defender, droplet, 8, 0.5 card, cone)
- 450–850: cloud(defender, mist, 0.5 card, up)
- contact at 450; total 950
Flags: none

### Bubble — water · special · tier 1
Refs: sprite N2B2 (5010 ms, effect frames 28–152) · modern LPA (3001 ms)
Sprite beats:
- 0–300 ms: no effect shapes; camera pushes in behind the attacker.
- 360–780 ms: one, then two small clear bubbles form at the attacker's mouth and wobble.
- 720–1140 ms: a stream of ~10 bubbles (clear, white rim, dark-teal lower crescent; mixed sizes) puffs out of the attacker in a wavy line toward the defender; camera pans to the defender 900–1200.
- 1200–1680 ms: bubbles drift slowly across in a loose wobbling cluster, swelling as they near the camera; the first reach the defender ≈1680 (contact).
- 1680–2520 ms: 8–12 bubbles crowd over the defender's body and pop one by one (simply vanish, no splash).
- 2880–3720 ms: a second, smaller wave: 10–15 small bubbles rise off the defender's body, growing as they float upward, then pop.
Screen: camera push-in 0–300, pan to defender 900–1200; no tint, flash or shake.
Palette: #E8E8E8, #387888, #A8D8E0, #285868
Modern cue: fixed wide camera; a glowing cluster of white-cyan bubbles with faint pink/lilac iridescent rims blooms at the attacker, drifts across in two clumps, envelops the defender (≈2.2 s) and pops into cyan sparkles. Soft bloom on the bubble rims, no impact flash.
Board mapping:
- 0: burst(attacker, bubble, 3, 0.3 card, cone)
- 150: projectile(bubble, 10, volley, slow, wobble, none)
- 600: impactFlash(defender, #E8F8F8, light) + burst(defender, bubble, 8, 0.6 card, random) popping
- 750–1000: burst(defender, bubble, 6, 0.5 card, up) small rising bubbles
- contact at 600; total 1000
Flags: none

### Whirlpool — water · special · tier 1
Refs: sprite N2B2 (4140 ms, effect frames 46–126) · modern EV (3999 ms)
Sprite beats:
- 0–360 ms: (t = 0 at frame 46) the background gradually darkens toward black; the attacker does not move (camera already pushed in before this).
- 360–420 ms: background fully black, only the two sprites visible.
- 480–600 ms: a deep-blue/teal underwater backdrop with faint clear bubble outlines and vertical wavy light bands fades in over the whole screen (brightest light-blue band 840–1100).
- 660–1260 ms: contact ≈660; 8–15 glossy blue bubbles (varied sizes) pour out above the defender and stream up and to the right off the top of the frame; the defender sprite goes translucent purple-blue and sinks/bobs a few px as if submerged.
- 1260–1320 ms: backdrop fades back to black.
- 1320–1680 ms: the last dark-blue bubbles rise off the defender and fade out against black; the defender returns to normal colour.
- 2040–2400 ms: black fades back to the normal battle background.
Screen: background darken 0–420, full-screen underwater backdrop 480–1260, black 1260–2040, restore 2040–2400; no shake, no flash, no camera move.
Palette: #3890E8, #68B8F8, #1840A0, #A0D8F8
Modern cue: fixed wide side camera. The attacker flicks its tail and is wrapped in a ring of thin white-cyan water streaks that flattens into a ground vortex with small white flecks; cyan ribbon streaks shoot across to the far defender and coil into a tall, translucent cylinder of spinning cyan-white water lines around it (≈0.7–1.5 s). It ends in a yellow-white spiked star flash inside the cylinder (≈1.87 s, contact) with orange sparks, then cyan droplets scatter and fade.
Board mapping:
- 0: ring(attacker, ripple, 2) + cardMotion(attacker, tilt)
- 150: projectile(wave, 3, spiral, fast, droplet trail, spin) along the lane
- 300: vignette(defender, #1840A0, 0.35, 700)
- 350: canvas(tall translucent cylinder of spinning cyan-white streak lines over the defender, tightening, 400 ms) + cardMotion(defender, spin) on its ghost
- 650: impactFlash(defender, #E8F8F8, light) + burst(defender, bubble, 10, 0.6 card, up)
- 650–950: burst(defender, droplet, 6, 0.5 card, down)
- contact at 650; total 1050
Flags: house-rule conflicts — sprite blacks out the whole background and swaps in a full-screen underwater backdrop (translated to a defender vignette); the modern hit is a spiked yellow-white star flash (replaced by a pale impactFlash).

### Octazooka — water · special · tier 2
Refs: sprite N2B2 (2550 ms, effect frames 29–84) · modern LPA (3100 ms)
Sprite beats:
- 0–180 ms: no effect shapes; attacker sprite winds up and tenses, moving left.
- 180–360 ms: dark brown/grey muddy bursts (3–5, roughly round, irregular edges) erupt from the ground where the attacker was, with tan dust clouds rising; they darken and deepen.
- 360–1050 ms: the muddy bursts spread and compress into a thick, dark-brown pool on the mat; white-grey dust motes drift upward and fade.
- 1050–1500 ms: the pool darkens to near-black with a glossy rim, then fades to grey and disappears; contact ≈1050.
Screen: no camera move, tint, flash or shake.
Palette: #6B5D4F, #8B7B6F, #C8B8A8, #E8D8C8
Modern cue: red-orange mist coalesces around the attacker; black glob-like projectiles (8–12 dark spheres with slight variance in size and speed) stream across toward the defender, then impact as a white splash burst on the defender with yellow-white sparks lingering.
Board mapping:
- 0: aura(attacker, water, #6B5D4F, 400)
- 150: dash(attacker→defender, stop, trails: water droplet spray)
- 350: projectile(mud-glob, 10, volley, fast, none, none)
- 700: impactFlash(defender, #E8D8C8, medium) + burst(defender, mud-splash, 12, 0.7 card, ring)
- 800–1200: cloud(defender, mist, 0.6 card, up)
- contact at 700; total 1200
Flags: none

### Scald — water · special · tier 2
Refs: sprite N2B2 (4260 ms, effect frames 40–130) · modern EV (8567 ms)
Sprite beats:
- 0–240 ms: no effect shapes; attacker sprite winds up, leaning back and raising arms.
- 240–600 ms: a thin cyan-to-blue beam (straight line, ~1/6 screen wide) forms at the attacker's hands and extends toward the defender.
- 600–1080 ms: the beam widens and brightens; contact ≈600; pale-cyan light spreads along its path.
- 1080–1500 ms: the beam fades; white-grey mist clouds coalesce around the defender's hit location.
- 1500–2100 ms: red-pink star shapes (4–6, angular, small) appear mixed in the white mist over the defender; mist continues to drift and fade.
- 2100–2400 ms: mist and stars dissipate; background returns to normal.
Screen: no camera move; background slightly desaturates 600–1500; no flash or shake.
Palette: #A8C8F8, #68B8F8, #E8C0F8, #F8E8D8
Modern cue: attacker rears back, mouth glowing cyan-white; a massive geyser of hot water bursts outward (≈2.0–2.5 s), white-cyan steam and spray fanning out in an arc; the hit lands as a white flash on the defender with repeated yellow-white sparks (≈2.5–3.5 s); foam and spray settle.
Board mapping:
- 0: cardMotion(attacker, crouch)
- 120: beam(droplet, 0.2 card, pulse-train, 700, low)
- 450: impactFlash(defender, #F8E8D8, medium) + burst(defender, spark, 8, 0.6 card, cone)
- 600–1200: cloud(defender, mist, 0.8 card, up)
- 800, 950, 1100: burst(defender, spark, 3, 0.3 card, random) for lingering sparks
- contact at 450; total 1400
Flags: none

### Water Pledge — water · special · tier 3
Refs: sprite N2B2 (3420 ms, effect frames 38–75) · modern EV (3500 ms)
Sprite beats:
- 0–240 ms: no effect shapes; attacker sprite winds up, leaning back.
- 240–480 ms: the attacker moves left and downward; 3–4 small cyan droplets begin forming near the mat.
- 480–900 ms: cyan droplets (4–6, small spheres) streak across the lane toward the defender, some leaving faint trails.
- 900–1200 ms: contact ≈900; a tall pale-cyan pillar (vertical column, ~1.2 card tall, translucent) rises from the defender's location; its edges shimmer with lighter cyan.
- 1200–1500 ms: the pillar widens and brightens; white/pale-cyan ribbons swirl inside it; white sparkle specks drift upward from the top.
- 1500–2100 ms: the pillar fades from the bottom up; white mist settles and dissipates.
- 2100–2280 ms: final settling of residual mist.
Screen: camera nudges slightly toward the defender ≈900–1200; no tint, flash or shake.
Palette: #88D8F8, #48B8E8, #C8E8F8, #F8F8F8
Modern cue: the attacker kneels and raises both hands as water swirls up around it in a bright cyan aura; a stream of water-droplet projectiles launches across and a tall, translucent cyan pillar erupts on the defender (≈2.0–2.8 s) with white foam at its crown and white-blue radial streaks spiralling outward; the pillar collapses into falling water droplets.
Board mapping:
- 0: cardMotion(attacker, crouch)
- 150: projectile(droplet, 6, volley, medium, wobble, none)
- 400: pillar(defender, water, 1.0 card) + impactFlash(defender, #C8E8F8, light)
- 500–1200: ring(defender, halo, 3) white spiral streaks + burst(defender, spark, 8, 0.7 card, up)
- 1200–1700: cloud(defender, mist, 0.8 card, down)
- contact at 400; total 1600
Flags: none

### Hydro Cannon — water · special · tier 3
Refs: sprite N2B2 (4530 ms, effect frames 36–100) · modern EV (4000 ms)
Sprite beats:
- 0–360 ms: no effect shapes; attacker sprite winds up intensely, tensing and leaning back.
- 360–900 ms: a pale-cyan orb (round, ~0.4 card diameter, glowing) forms and grows at the attacker's hands, reaching peak brightness at ≈600 ms.
- 900–1350 ms: the orb releases; a broad pale-cyan to deep-blue water column forms and travels across the lane; the attacker recoils.
- 1350–2100 ms: scene transitions to an underwater view (dark teal background with faint bubbles and light bands); the water column is now massive and brilliant, filling most of the view.
- 2100–2700 ms: contact ≈2100; white foam and light-blue splash rings ripple outward from the defender's location; small bright droplets scatter.
- 2700–3300 ms: foam settles and fades; the underwater scene gradually lightens.
- 3300–3900 ms: transition back to normal battlefield; residual mist clears.
Screen: background transition to underwater teal 1350–2100, then back to normal 3300–3900; no shake or direct flash.
Palette: #A8D8F8, #5898E8, #1860D8, #E8F8F8
Modern cue: the attacker unleashes a massive cylindrical water beam from its mouth, bright cyan-white with concentric rings of water texture; it travels across and impacts the defender as a explosive white-blue sphere burst (≈2.0–2.5 s) with radial streaks and heavy spray; water sheets cascade downward and droplets linger.
Board mapping:
- 0: aura(attacker, water, #5898E8, 600) + charge(attacker, orb, 1, 500)
- 450: lunge(attacker→defender, reach 1.1, windup 300)
- 900: impactFlash(defender, #E8F8F8, strong) + ring(defender, shockwave, 1) + burst(defender, droplet, 16, 1.0 card, ring)
- 1000–1600: cloud(defender, mist, 0.9 card, down)
- 1100, 1250: burst(defender, spark, 6, 0.4 card, up)
- contact at 900; total 1700
Flags: house-rule conflict — sprite transitions to underwater view; kept as unified land-based animation in board mapping.

### Hydro Pump — water · special · tier 3
Refs: sprite N2B2 (3600 ms, effect frames 36–78) · modern EV (4500 ms)
Sprite beats:
- 0–180 ms: no effect shapes; attacker sprite winds up, leaning back and tensing.
- 180–540 ms: a medium-sized pale-cyan orb (glowing, ~0.3 card diameter) forms at the attacker's hands; it pulses slightly.
- 540–900 ms: the orb releases as a continuous bright cyan-white beam (slightly conical, wide at the base) that extends toward the defender.
- 900–1380 ms: contact ≈900; the beam hits; white-cyan splash puffs erupt from the defender's location; 5–8 white star-shaped sparks scatter outward at high speed.
- 1380–1800 ms: lingering white-grey mist clouds hang over the defender and drift upward; cyan ripple rings expand on the mat.
- 1800–2100 ms: all effects fade to baseline.
Screen: no camera move; slight desaturation of the background during the beam 540–1380; no flash or shake.
Palette: #88D8F8, #48A8E8, #1878D0, #F0F8F8
Modern cue: the attacker opens its mouth and a bright cyan-to-white continuous water beam erupts (≈1.0–2.5 s), thick and powerful; it strikes the defender as a white-blue radial splash burst (≈2.5–3.5 s) with multiple yellow-white spark flashes interleaved, then large droplets hang and fall away.
Board mapping:
- 0: cardMotion(attacker, tilt)
- 150: charge(attacker, orb, 1, 300)
- 350: beam(droplet, 0.25 card, pulse-train, 800, medium)
- 650: impactFlash(defender, #F0F8F8, strong) + burst(defender, spark, 10, 0.8 card, cone)
- 750–1200: ring(defender, ripple, 2) + cloud(defender, mist, 0.7 card, up)
- 850, 950: burst(defender, spark, 4, 0.35 card, random)
- contact at 650; total 1500
Flags: none

### Surf — water · special · tier 3
Refs: sprite N2B2 (4020 ms, effect frames 45–89) · modern EV (4000 ms)
Sprite beats:
- 0–300 ms: no effect shapes; the background gradually transitions to a light-tan sandy beach view with bright blue ocean on the far side; attacker sprite moves and poses.
- 300–900 ms: a tall, translucent bright-cyan wave crest (curved, ~1.5 card tall) builds on the defender's side of the screen, with white foam at its peak and fine white spray lines radiating outward.
- 900–1350 ms: contact ≈900; the wave crashes down explosively in a wide arc of white foam and blue water sheets; motion blur streaks emphasize the impact.
- 1350–1800 ms: white spray and foam particles scatter outward and fall; cyan ripple rings spread on the mat beneath the defender.
- 1800–2400 ms: foam fades to pale white mist; water sheets dissipate and settle; residual spray drifts up and vanishes.
- 2400–3000 ms: the background transitions back to the normal battlefield view.
Screen: background shift to beach/ocean 300–2400; no camera pan; no tint or direct flash; subtle motion blur 900–1050.
Palette: #48B8E8, #88D8F8, #1878D0, #F8F8F8
Modern cue: camera pulls back for a wide view; the attacker leaps onto a curling cyan-white wave crest; the wave surges forward with white foam churning at its peak; it crashes spectacularly on the defender (≈2.0–3.0 s) as a massive radial white-blue splash, spray fanning in all directions with motion blur, then water cascades off in sheets.
Board mapping:
- 0: terrain(table, wave) growing wave crest on the defender side
- 300: ring(defender, ripple, 1) pre-impact water rings
- 500: lunge(attacker→defender, reach 1.2, windup 400) attacker rides the wave
- 800: impactFlash(defender, #F8F8F8, strong) + burst(defender, droplet, 18, 1.2 card, ring) + ring(defender, shockwave, 1)
- 900–1300: cloud(defender, mist, 1.0 card, down) falling spray
- 1000, 1150: burst(defender, droplet, 8, 0.6 card, random)
- contact at 800; total 1800
Flags: house-rule conflict — sprite background shifts to beach/ocean scene; kept as table-only terrain effect in board mapping.

