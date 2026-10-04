### Peck — flying · physical · tier 1
Refs: sprite N2B2 (2560 ms, effect frames 24–63) · modern EV (2500 ms)
Sprite beats:
- 0–600 ms: no particles; camera pans/pushes in from the attacker to the defender (attacker slides off bottom-left), HUD hidden.
- 600–640 ms: 4–6 small yellow orbs pop in a loose ring around the defender's body.
- 640–760 ms: on the defender centre a small white 8-point star grows into a yellow 8-point star with a red core, white smoke puffs around it; defender squashes flat for one frame (~680 ms). Peak at 720 ms.
- 760–920 ms: the star shatters into yellow-green glitter, then orange embers drift outward/up and fade by 960 ms.
- 960–1560 ms: camera pulls back to the default view; no effect.
Screen: camera pan/zoom onto the defender 0–600 ms and back 960–1560 ms; no tint, flash or shake.
Palette: #F8F030, #E82020, #F8F8F8, #E07028
Modern cue: Kilowattrel flaps, rears its head back and jabs forward on the spot (no projectile, no travel); a small white/pale-blue starburst spark pops on the target at ~1730 ms and the target flinches. Static camera behind the attacker, no lighting change, no lingering particles.
Board mapping:
- 0: cardMotion(attacker, crouch) — short 120 ms rear-back
- 120: lunge(attacker→defender, reach 0.5, windup 120)
- 420: impactFlash(defender, #F8F030, medium) + burst(defender, star, 1, small, ring) + burst(defender, ember, 8, small, up)
- contact at 420; total 950
Flags: none

### Aerial Ace — flying · physical · tier 2
Refs: sprite N2B2 (3150 ms, effect frames 47–100) · modern EV (3533 ms)
Sprite beats:
- 0–90 ms: background dims to black; attacker stays put (no body motion).
- 240–330 ms: a thin cream-white streak draws in from the top-right corner down the diagonal toward the defender (telegraph line).
- 330–630 ms: a red diagonal band opens along that line (lower-left to upper-right) and widens until the whole screen is red; the defender is turned into a black silhouette.
- 540–720 ms: one orange-yellow slash streak races up the diagonal from lower-left (attacker side) into the defender; contact at ~720 ms with a small yellow spark cluster on the defender.
- 720–900 ms: 10–15 yellow/orange embers are flung up-right from the defender as the red background darkens back to black.
- 900–1350 ms: embers drift and fade; background returns to normal by ~1350 ms, defender colour back by ~1530 ms.
Screen: background to black at 0–90 ms, full-screen red diagonal band 330–900 ms, black again 900–1200 ms, normal by 1350 ms; defender silhouetted 330–1530 ms; no shake.
Palette: #F08020, #F8E048, #F0E0B0, #E86018
Modern cue: Squawkabilly flaps, then vanishes in a burst of speed leaving white air streaks and kicked-up pebbles; a vertical white air streak strikes down onto the target from above (~1850 ms), yellow spark shards burst out sideways, and curved white swoosh trails sweep past as the target is knocked back; the attacker reappears at home. Static camera, no lighting change.
Board mapping:
- 0: vignette(defender, #300808, medium, 900)
- 200: slash(defender, blade, 1, 45°) — thin cream telegraph line, 120 ms
- 300: dash(attacker→defender, passThrough, trails: gust-line white)
- 520: slash(defender, blade, 1, 45°) orange-yellow + impactFlash(defender, #F8E048, strong)
- 520: burst(defender, ember, 12, medium, cone up-right)
- contact at 520; total 1300
Flags: house-rule conflicts — sprite turns the whole screen black then red (diagonal band) and silhouettes the defender; translated to a local vignette(defender), background change dropped.

### Wing Attack — flying · physical · tier 2
Refs: sprite IT5 (5375 ms, effect frames 91–213) · modern EV (3000 ms)
Sprite beats:
- 0–375 ms: no particles; camera pans/pushes from the attacker onto the defender (attacker slides off bottom-left); attacker never visibly strikes.
- 825–1050 ms: hit 1 — a white 8-point starburst pops on the defender's lower body; a spray of 6–8 yellow feathers is flung up-left out of the hit; defender squashes down for one beat (~1000 ms).
- 1050–1400 ms: hit 2 — a second burst at chest/head height turns from white to a solid yellow 8-point star, pulses twice (peak ~1150 ms) and fades out by 1400 ms.
- 1400–1950 ms: the yellow feathers tumble and drift down/out around the defender, fading.
- 2375–3050 ms: camera pulls back to the default view.
Screen: camera pan/zoom onto the defender 0–375 ms and back 2375–3050 ms; no tint, flash or shake.
Palette: #F8F8F8, #F0E040, #E8D048, #C8B030
Modern cue: Flamigo dips and leans its body forward on the spot; a tall vertical white/cyan wing-slash streak drops onto the target (~1800 ms) and a ring of pale-cyan wind-blade fragments bursts out and lingers around it ~800 ms before fading. Static camera, no lighting change, the target barely flinches.
Board mapping:
- 0: cardMotion(attacker, crouch) — 150 ms
- 150: lunge(attacker→defender, reach 0.7, windup 150)
- 420: impactFlash(defender, #F8F8F8, medium) + burst(defender, star, 1, small, ring) — hit 1
- 640: impactFlash(defender, #F0E040, strong) + burst(defender, star, 1, medium, ring) — hit 2 (damage pop)
- 640: burst(defender, feather, 8, medium, up) — feathers drift down and fade by 1300
- contact at 640; total 1350
Flags: none

### Brave Bird — flying · physical · tier 3
Refs: sprite N2B2 (3720 ms, effect frames 42–122) · modern EV (4533 ms)
Sprite beats:
- 0–360 ms: camera swings toward the attacker; background darkens through brown to dark teal.
- 360–480 ms: background becomes a bright sky-blue with horizontal cloud streaks; the attacker vanishes (flies off) at ~420 ms.
- 510–570 ms: a white sparkle cloud gathers at screen centre-left and snaps into a white 8-point starburst ring with a yellow oval core (the bird diving in).
- 600–690 ms: a chain of small red beads shoots from the starburst up-right into the defender, followed by a volley of 6–8 large blurred pink-white glowing orbs and a red ring along the same diagonal; contact at ~690 ms as a red-white puff cluster engulfs the defender.
- 690–900 ms: the defender is knocked up-left while the camera zooms onto it; the red puff cluster flies off up-right; 10–12 pale green-yellow 4-point star sparkles scatter around the defender; the big orbs drift off the lower-left edge.
- 840–1860 ms: defender held as a solid red silhouette (hurt tint) while sparkles fade (gone by ~1140 ms).
- 1860–2400 ms: background darkens and returns to the arena, red tint fades, attacker reappears.
Screen: background dark 120–360 ms, full-screen sky-blue streaked background 360–1860 ms; camera swing at 0 ms and zoom onto the defender at ~700 ms; defender solid-red tint 840–1860 ms; no shake.
Palette: #F8F8F8, #E84040, #F8C0C0, #C0E870
Modern cue: Staraptor rears up; the camera cuts to a close front shot as yellow-green aura flames wrap it and white wind rings spiral around a bright white core; it launches up as a yellow-green flaming bird comet, then a cut to the target shows the comet slamming in with a big white burst and radial yellow speed lines nearly filling the screen (~3100 ms), followed by lingering white wind slash curls around the target.
Board mapping:
- 0: aura(attacker, flame, #C0E870, 600) + ring(attacker, halo, 2) — white wind rings spiral in
- 550: cardMotion(attacker, crouch) — 100 ms
- 650: dash(attacker→defender, stop, trails: flame streak #F8C0C0 + feather)
- 900: impactFlash(defender, #F8F8F8, strong) + burst(defender, orb, 6, large, cone) red-white puffs + shake(card, medium, 300)
- 950: burst(defender, star, 10, medium, random) — pale green-yellow sparkles, fade by 1400
- contact at 900; total 1900
Flags: house-rule conflicts — sprite replaces the whole background (dark, then bright streaked sky 360–1860 ms) and turns the defender solid red; modern ends in a near-full-screen white/yellow flash. Background change and red silhouette dropped, flash kept local to the defender.

### Gust — flying · special · tier 1
Refs: sprite N2B2 (3900 ms, effect frames 37–128) · modern EV (3000 ms)
Sprite beats:
- 0–210 ms: no particles; camera pans/pushes from the attacker onto the defender. Nothing travels across the lane.
- 570–630 ms: small pale dust puffs start at the defender's feet on the floor platform.
- 630–1500 ms: cream-tan dust clouds swirl in a widening ring around the defender's base (a low whirlwind on the floor, ~1.5× the defender's width) while small brown/olive square debris flecks are thrown up above its head; the defender bobs up and down with the wind (~900–1350 ms).
- 1500–2190 ms: the dust turns grey-white, thins and fades; debris flecks drift down and vanish.
- 2190–2730 ms: camera pulls back to the default view.
Screen: camera pan/zoom onto the defender 0–210 ms and back 2190–2730 ms; no tint, flash or shake.
Palette: #E8DCA8, #C8C8C0, #A06838, #708030
Modern cue: Noibat flaps on the spot; white curved gust lines swirl horizontally in front of its wings (~1300–1550 ms), then a small white whirlwind of curved streaks wraps the target from feet to head (~1730–2200 ms) and unwinds. Static camera, no lighting change, no debris.
Board mapping:
- 0: cardMotion(attacker, float) + burst(attacker, gust-line, 4, small, cone) — wing flap swirl
- 250: projectile(gust-line, 3, straight, fast, trail: none, spin: none)
- 420: cloud(defender, sand, medium, swirl) + canvas(white curved whirl strokes circling the defender card from bottom to top)
- 420: burst(defender, sand, 8, small, up) — debris flecks
- contact at 420; total 1000
Flags: none

### Air Cutter — flying · special · tier 2
Refs: sprite N2B2 (2760 ms, effect frames 36–91) · modern EV (3001 ms)
Sprite beats:
- 0–210 ms: no particles; camera pans/pushes from the attacker onto the defender.
- 270–450 ms: thin white horizontal speed lines streak left→right across the full width of the screen and keep scrolling (wind).
- 450–630 ms: 3–4 small pale pink-white crescent blades appear around the defender and start spinning like a pinwheel.
- 630–900 ms: 4–5 crescents grow to ~half the defender's size and whirl around and through it (head, body, feet), bright white-pink; peak ~750–870 ms.
- 900–1140 ms: crescents turn translucent lavender, keep spinning and fade; speed lines fade out by ~1080 ms.
- 1290–1650 ms: camera pulls back to the default view.
Screen: camera pan/zoom onto the defender 0–210 ms and back 1290–1650 ms; full-width horizontal speed lines 270–1080 ms; no tint, flash or shake.
Palette: #F8F0F8, #F0C8E0, #C8A8D8, #E8E8F0
Modern cue: Masquerain spins in place inside white wind swirls, then flings one long white crescent wind-blade that sweeps in a wide arc across the field; on the target a cluster of thin white/cyan criss-cross slash lines and glints flickers (~1670–2100 ms). Static camera, no lighting change.
Board mapping:
- 0: cardMotion(attacker, spin) + aura(attacker, wind, #E8E8F0, 400)
- 380: projectile(wind-blade, 3, volley, fast, trail: gust-line, spin: yes)
- 620: slash(defender, x, 2, 30°) + impactFlash(defender, #F0C8E0, medium)
- 620: burst(defender, crescent, 5, medium, ring) — spinning pink-white crescents, fade to lavender by 1100
- contact at 620; total 1300
Flags: house-rule conflicts — sprite runs horizontal speed lines across the full screen width (270–1080 ms); confined to the lane (gust-line trail) instead.
