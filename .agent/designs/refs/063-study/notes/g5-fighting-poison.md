### Arm Thrust — fighting · physical · tier 1
Refs: sprite N2B2 (2370 ms, effect frames 29–75) · modern EV (8000 ms)
Sprite beats:
- 0–600 ms: camera pans/zooms from attacker to defender (attacker slides off left, defender grows to centre); no drawn effect yet
- 750–810 ms: a black, striped open palm slaps over the defender's upper body from upper right; defender sprite darkens under it
- 840–900 ms: second palm, pale cream and translucent, same spot (slightly lower-left); defender stays greyed
- 960 ms: third palm, yellow-striped, appears on the defender
- 990–1020 ms: palm becomes a solid yellow disc (~defender-sized) ringed by 8–10 white puff balls — the hit
- 1050–1080 ms: disc opens into a jagged yellow ring that expands and dulls to olive, puffs still on it
- 1110–1380 ms: ring dissolves into fine white sparkle dust drifting up and outward, fades out
Screen: camera pan/zoom toward defender 0–600 ms; no tint, no flash, no shake
Palette: #111508, #c9c89c, #dad812, #ecebe9
Modern cue: static camera behind the attacker; two huge translucent white-grey open palms (left and right) pop in beside the defender and slap alternately, several slaps per hit, each slap sparks a small orange-gold star burst with ember flecks on the target; hands shrink and vanish after each volley; volley repeats for hit 2 ("2 hits"); no lunge, the attacker only shifts its arms.
Board mapping:
- 0: lunge(attacker→defender, reach short, windup 150)
- 300 / 450: canvas(open palm stamp on defender, alternating left/right, 120 ms each) — hits 1 and 2, small shake(card, 2px, 80) each
- 600: canvas(palm stamp, yellow) + impactFlash(defender, yellow, medium) + burst(defender, spark, 10, small, ring) — hit 3 carries the damage pop
- 650: ring(defender, shockwave, 1) dissolving into cloud(defender, sparkle, small, up) to 950
- contact at 600; total 1000
Flags: none

### Karate Chop — fighting · physical · tier 2
Refs: sprite none (— ms, effect frames —) · modern none (— ms)
Sprite beats:
- (from memory, unverified) 0–250 ms: an open hand seen edge-on (white/cream glove-like) appears above and to one side of the defender
- (from memory, unverified) 250–400 ms: the hand swings down diagonally across the defender in one short chopping arc
- (from memory, unverified) 400–600 ms: a yellow/orange star-shaped impact burst at the contact point on the defender, defender sprite blinks/shakes, then everything clears
Screen: (from memory, unverified) none beyond the defender's own hit shake
Palette: (from memory, unverified) #f8f8f0, #e8d8a8, #f8a038, #f8e060
Modern cue: (from memory, unverified) 3D games (XY–USUM era) have the attacker hop forward and bring its arm down on the target; a pale streak follows the arm and an orange-white impact burst lands on the target. No video available to confirm.
Board mapping:
- 0: lunge(attacker→defender, reach medium, windup 250)
- 450: slash(defender, blade, 1, -55° top-right → bottom-left, white edge)
- 550: impactFlash(defender, warm white, medium) + burst(defender, spark, 8, small, cone down-left)
- 560: shake(card, 4px, 200)
- contact at 550; total 1250
Flags: missing refs — manifest status "no-animation" (no sprite, no modern, no game tags on Poképédia); every beat, palette and the modern cue are from memory, unverified — verify against a Gen 5/Gen 7 capture before the designer relies on them

### Low Sweep — fighting · physical · tier 2
Refs: sprite N2B2 (2880 ms, effect frames 35–95) · modern EV (5001 ms)
Sprite beats:
- 0–390 ms: camera zooms in on the attacker (it fills the frame, HUD clears); no drawn effect
- 390–750 ms: fast camera swing from attacker to defender, attacker exits lower-left, defender lands centred and enlarged
- 780 ms: faint translucent foot outline flickers over the defender's lower front
- 810–870 ms: hit — a black footprint (sole + toes, white rim) stamps at the defender's base; a yellow jagged star burst at ground level with 6–8 white-yellow puff balls; defender sprite tilts back
- 900–1050 ms: star fades; puff balls drift outward/up and turn orange while shrinking; defender rights itself; footprint stays
- 1080–1410 ms: footprint gone by ~1230 ms; last orange embers fade by 1410 ms
- 1440–1800 ms: camera returns to the neutral two-shot
Screen: camera zoom on attacker 0–390 ms, swing to defender 390–750 ms, return 1440–1800 ms; no tint, no flash, no shake
Palette: #050502, #ecec52, #f7f7ef, #eeac01
Modern cue: static camera; attacker crouches and kicks in place; a giant translucent glowing red-orange foot (sole forward, toes visible) sweeps horizontally into the defender's lower body (~1930–2170 ms), then a pale-yellow star burst with orange shards and white sparks erupts at the contact point; the foot lingers and fades. Blue down-arrow stat-drop swirl follows (Speed drop, not part of the hit).
Board mapping:
- 0: cardMotion(attacker, crouch) 0–200
- 200: lunge(attacker→defender, reach medium, windup 200) aimed at the defender's bottom edge
- 480: canvas(sweeping foot silhouette, red-orange, arcs left→right across the defender's bottom edge, 150 ms)
- 600: impactFlash(defender, yellow, medium) + burst(defender bottom edge, star, 8, small, up) + cardMotion(defender, tilt) + canvas(black footprint stamp at defender's base, fades by 1000)
- contact at 600; total 1300
Flags: none

### Triple Kick — fighting · physical · tier 2
Refs: sprite N2B2 (5100 ms, effect frames 33–148) · modern EV (9567 ms)
Sprite beats:
- 0–360 ms: camera pans/zooms onto the defender; HUD hides at ~570 ms
- 630–690 ms: kick 1 — a foot sole (5 round toes, dark outline) fades in over the defender's body, translucent grey-green then solid yellow-green
- 720–750 ms: foot and defender jolt left; a large yellow jagged star flashes behind the foot, roughly defender-sized (hit 1)
- 780–870 ms: star decays into a pale white-green halo, foot re-solidifies once then fades out
- 960–1500 ms: HUD returns; defender blinks to a black silhouette ~5 times while HP drains (engine hit blink, not move art)
- 1620–1830 ms: kick 2, same foot → jolt → star → fade sequence (star at 1710–1740 ms); hit blink 1950–2460 ms
- 2610–2820 ms: kick 3, same sequence (star at 2700–2730 ms); hit blink 2910–3450 ms; then "hit 3 times" text
Screen: camera pan/zoom to defender 0–360 ms; no tint, no flash, no shake
Palette: #e9f754, #cce710, #111111, #e7e7e7
Modern cue: static camera; the attacker does a handstand spinning kick in place for each hit (~2.9 s apart); at the defender an orange-red foot sole slams in with a white-yellow starburst and orange shard streaks, the defender is knocked back, then the foot lingers as a gold outline and red sparks drift off. Third burst is the biggest and most orange.
Board mapping:
- 0: lunge(attacker→defender, reach short, windup 150)
- 300: projectile(foot, 1, straight, fast) lands on defender + burst(defender, star, 6, small, ring) + shake(card, 2px, 80) — hit 1
- 650: same foot + star — hit 2 (each kick: cardMotion(attacker, hop))
- 1000: foot + burst(defender, star, 10, medium, ring) + impactFlash(defender, yellow, medium) + shake(card, 4px, 200) — hit 3 carries the damage pop
- contact at 1000; total 1400
Flags: none

### Close Combat — fighting · physical · tier 3
Refs: sprite N2B2 (3750 ms, effect frames 46–124) · modern EV (4500 ms)
Sprite beats:
- 0–150 ms: camera swings from attacker to defender, attacker exits lower-left
- 180–450 ms: the whole stage darkens to solid black around the defender (black by ~300 ms)
- 480–540 ms: background cuts to full-screen horizontal blue/teal speed lines; first yellow flecks spray from the defender
- 570–1020 ms: barrage — golden-yellow fists (front view, ~40% of defender size) stamp over the defender's upper body at jittering offsets, 2–4 overlapping at once with afterimages, shifting to orange; a continuous ring-spray of ~30 small oval flecks (yellow, orange, red) radiates outward to the screen edges
- 1050–1380 ms: fists turn translucent and fade, last orange fist lower-left; flecks thin out; defender flashes red-tinted at ~1380 ms
- 1410–1770 ms: speed lines hold with the defender alone
- 1800–1980 ms: speed lines fade to black, then the stage returns; camera swings back to the attacker by 2340 ms
Screen: full-screen fade to black 180–450 ms, full-screen blue speed-line background 480–1800 ms, fade back 1800–2010 ms; camera swing in 0–150 ms and out 2010–2340 ms; no shake
Palette: #eeae00, #ee7900, #eedb00, #b4482c
Modern cue: attacker blurs into a dash and vanishes; camera cuts to a close-up of the defender; a ~1.2 s flurry of yellow-white starbursts and long thin white/yellow slash streaks criss-crosses the target (attacker never seen); ends with a big white-yellow radial burst with speed lines and an orange-red tint at the frame edges, then grey smoke rises from the target.
Board mapping:
- 0: vignette(defender, deep blue-black, strong, 0–1500) + cardMotion(attacker, crouch)
- 200: dash(attacker→defender, stop, trails) — ghost stays on the defender for the barrage
- 450–1050: canvas(fist stamps, 8 hits at jittered offsets on the defender, yellow→orange, ~75 ms apart) + burst(defender, ember, 24, large, ring) + shake(card, 2px, per stamp)
- 1150: final big fist + impactFlash(defender, yellow, strong) + ring(defender, shockwave, 1) + shake(card, 6px, 300) — last hit carries the damage pop
- 1300: ghost returns home; cloud(defender, smoke, small, up) to 1900
- contact at 1150; total 1900
Flags: house-rule conflict — sprite blacks out the whole screen and swaps in a full-screen speed-line background (180–2010 ms); modern ends on a screen-filling white radial burst with edge tint — both translated to a defender vignette and a local impactFlash
