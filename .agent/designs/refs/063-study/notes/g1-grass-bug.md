# G1 grass-bug — move animation study notes

### Vine Whip — grass · physical · tier 1
Refs: sprite N2B2 (2670 ms, effect frames 52–85) · modern EV (3433 ms)
Sprite beats:
- 0–60 ms: one thin green vine (crescent-shaped whip stroke) swings in from the upper-left and cracks down across the defender's top-left; small pale-yellow star spark at the contact point.
- 90–120 ms: a second vine lashes diagonally from lower-left to upper-right, crossing the first (an X read over two frames); yellow-white spark plus a grey-green dust puff on the defender's centre.
- 150–210 ms: the vine recoils upward along the defender's right side as one curved stroke and vanishes.
- 120–1000 ms: ~10 small green comma/crescent flecks (leaf bits) scatter above the defender, drift slowly upward and fade out.
Screen: camera zooms/pans onto the defender before the effect (−480–0 ms) and pans back to the wide shot at 420–660 ms; no flash, no tint, no shake.
Palette: #39AD39, #00BD00, #89BC18, #EFEFCE
Modern cue: fixed side camera. A thin bright-green vine grows from the attacker's back, coils in a loop beside it (~0.9–1.5 s), then the body rears and lunges as the vine whips forward onto the target. Impact is a small yellow-white starburst with green sparks at the target (~1.7–1.8 s), green flecks linger ~0.3 s; no camera move, no shake.
Board mapping:
- 0: cardMotion(attacker, tilt) wind-up
- 180: slash(defender, blade, 1, −35°) as a green vine-arc stroke; small impactFlash(defender, #EFEFCE, low)
- 300: slash(defender, blade, 1, +40°) crossing lash; impactFlash(defender, #EFEFCE, medium); shake(card, small, 150)
- 300: burst(defender, leaf, 8, small, up) — flecks drift up and fade by 950
- contact at 300 (second lash carries the damage pop); total 1000
Flags: none

### Razor Leaf — grass · physical · tier 2
Refs: sprite N2B2 (3900 ms, effect frames 48–114) · modern EV (3233 ms)
Sprite beats:
- 0–1140 ms: 12–15 almond-shaped green leaves rise and whirl in a loose column around the attacker, wrapped in a soft pale-green glow; they orbit faster and denser toward the end.
- 1140–1320 ms: the leaves peel off the attacker in a stream toward the defender, each leaf trailing small white puffs.
- 1320–1560 ms: the leaf stream passes straight through the defender on a diagonal and exits off the upper-right, white puff trail fading behind it.
- 1470–1920 ms: 6–8 thin yellow crescent slash marks cut across the defender in quick succession (criss-crossing, white-edged), then fade by 1980 ms.
Screen: camera pans onto the attacker (−240–0 ms), pans to the defender following the leaves (1200–1380 ms), pans back to the wide shot (1980–2400 ms); no flash, no tint, no shake.
Palette: #53B523, #8ED86A, #F7F731, #E8DD03
Modern cue: fixed camera. A glowing green wind ring spins horizontally around the attacker with leaves caught in it and dust puffs kicked up from the ground (~0.6–1.1 s); the leaves then scatter forward toward the target. The hit is a run of small green-yellow star sparks and thin green cut lines on the defender (~1.7–2.5 s), no single big flash.
Board mapping:
- 0: aura(attacker, wind, #53B523, 450) with leaves whirling around the card
- 400: projectile(leaf, 8, volley, fast, white puff trail, spin)
- 650: slash(defender, blade, 4, criss-cross) yellow crescents, staggered 60 ms
- 650: impactFlash(defender, #F7F731, medium); shake(card, small, 200)
- contact at 650; total 1300
Flags: none

### Leaf Blade — grass · physical · tier 3
Refs: sprite IT5 (7275 ms, effect frames 128–258) · modern EV (4000 ms)
Sprite beats:
- 0–350 ms: one bright-green leaf-shaped sword appears above the defender's upper-left and sweeps diagonally down-right across it, leaving 4–5 fading afterimage copies (a fan of ghost blades); it ends lying flat at the defender's feet and fades.
- 400–750 ms: a second sword drops in vertical at the upper-right and sweeps down-left across the defender, same afterimage fan, fades low-left.
- 850–1050 ms: a third sword enters horizontally from the left and sweeps right through the defender's middle with a bright green speed streak; a straight horizontal green cut line flashes across the body at ~1050 ms.
- 1100–2600 ms: ~12 small glowing green leaves pop out around the defender in a loose ring and sway in place.
- 2600–3250 ms: the leaves fade out in place.
Screen: camera pans/zooms onto the defender before the effect (−900–−175 ms) and pans back after (3350–4050 ms); no flash, no tint, no shake.
Palette: #63F763, #31F729, #317B31, #52B521
Modern cue: the attacker rears and leaps off-screen, then a hard cut to a close-up of the defender. Three huge cyan-green blade streaks cross the target (diagonal, opposite diagonal, horizontal ~1.9–2.6 s), each with a burst of white-green star sparks, radial speed lines, flying leaf chevrons and motion blur; the last horizontal cut is the biggest, with a zoom-blur camera shake. Leaves drift down as the camera cuts back.
Board mapping:
- 0: lunge(attacker→defender, long reach, windup 200)
- 350: slash(defender, blade, 1, −45°) green sword with afterimage trail
- 650: slash(defender, blade, 1, +45°) same, mirrored
- 950: slash(defender, blade, 1, 0°) horizontal; impactFlash(defender, #63F763, strong); shake(card, medium, 250)
- 950: burst(defender, leaf, 12, medium, ring) — leaves hover and fade by 1900
- contact at 950 (third cut carries the damage pop); total 2000
Flags: none

### Absorb — grass · special · tier 1
Refs: sprite IT5 (12080 ms, effect frames 48–115) · modern EV (7500 ms)
Sprite beats:
- 0–240 ms: the whole background dims to a near-black dark green and stays dim.
- 400–1200 ms: 8–10 small glowing yellow motes (white core, gold halo) appear around the defender and drift on loose wandering paths across to the attacker, gathering at its base.
- 1200–2100 ms: the attacker sprite flushes to a pale white-green silhouette while 4–6 cyan four-point sparkle stars (with a thin ring, like a crosshair) twinkle around it.
- 2100–2700 ms: the attacker's colour returns and the background brightens back to normal.
- after the effect (≈3080–3240 ms) the defender blinks (the engine's damage blink); much later (≈6640–7760 ms) the engine's HP-restore effect plays: green bubbles rise around the attacker with cyan sparkles.
Screen: full-background dim to near-black green 0–2700 ms; no flash, no shake, no camera move.
Palette: #F7F7EF, #BDA500, #E7EFCE, #31EFEF
Modern cue: fixed camera. A green glowing ring forms on the defender and contracts into a single bright-green orb (~1.1–1.7 s), which glides along the ground back to the attacker (~1.7–2.5 s); the attacker glows green with motes floating round it, then a thin cyan-green bubble ring expands around it shedding small leaves (~3.4–3.7 s). The generic heal dome (green hemisphere, cyan sparkles) follows at ~4.4–5.3 s.
Board mapping:
- 0: ring(defender, target, 1) green, contracting; vignette(defender, #1C2410, low, 500)
- 150: impactFlash(defender, #E7EFCE, low)
- 200: projectile(orb, 6 small motes, homing defender→attacker, medium, soft glow trail)
- 650: aura(attacker, light, #E7EFCE, 300); burst(attacker, fairy-light, 5, small, random) cyan
- contact at 150 (damage pops as the drain starts); total 1000
Flags: house-rule conflict — the sprite dims the whole background for ~2.7 s; replaced by a light local vignette. Uncertainty — the sprite shows the defender's damage blink only after the effect (≈3.1 s); contact placed at the drain start. The projectile runs defender→attacker (reverse lane). The generic HP-restore effect (heal bubbles/dome) is not mapped.

### Magical Leaf — grass · special · tier 2
Refs: sprite IT5 (6925 ms, effect frames 129–246) · modern EV (3500 ms)
Sprite beats:
- 0–1900 ms: dark-green leaves (15–20, almond-shaped) flutter down from above and swirl round the attacker in a growing loose cloud; each leaf carries a soft glow halo that cycles magenta / pink / blue / violet.
- 1925–2125 ms: the leaf cloud streams off toward the defender (camera follows).
- 2125–2625 ms: the leaves home in on the defender from several directions (curving paths), converging on it and vanishing.
- 2225–2925 ms: small pink-magenta and pale-blue four-point star sparkles pop on and around the defender one after another, then fade.
Screen: camera pans/zooms onto the attacker before the effect (−900–−100 ms), to the defender at 1925–2125 ms, back to the wide shot at 3225–3625 ms; no flash, no tint, no shake.
Palette: #086308, #E040C8, #397BE7, #F870D0
Modern cue: fixed camera. A burst of pale-green leaves plus pink and blue glowing motes erupts around the attacker (~0.6–1.1 s); the attacker flings them and the leaves fly at the target in curving paths with white four-point sparkles. Hits land as a magenta sparkle cluster on the target (~2.2–2.3 s) and finish with a yellow star burst (~2.5–2.6 s).
Board mapping:
- 0: burst(attacker, leaf, 10, medium, ring) with magenta/blue glow halos; aura(attacker, light, #E040C8, 400)
- 400: projectile(leaf, 8, homing, medium, magenta-blue glow trail, spin)
- 850: burst(defender, star, 6, small, random) pink and blue sparkles; impactFlash(defender, #F870D0, medium)
- contact at 850; total 1350
Flags: none

### Leaf Storm — grass · special · tier 3
Refs: sprite IT5 (15550 ms, effect frames 126–271) · modern EV (4567 ms)
Sprite beats:
- 0–525 ms: the background fades from blue-teal to near-black; the attacker stays lit, nothing else on screen.
- 525–1225 ms: the background comes back as a bright yellow-green field with scrolling darker-green horizontal stripes (the move's own backdrop); still no effect on the sprites.
- 1225–1575 ms: a pale-green spiral swirl (two or three thin concentric rings) appears at the attacker's feet and tightens into a bright-green vortex around its body.
- 1575–1925 ms: the vortex widens into spinning ring bands with small white-cyan sparkles; 15–20 almond-shaped green leaves burst out of it and stream toward the defender in a loose fan (camera follows).
- 1925–2750 ms: the leaves whirl around the defender from all directions, some large and close, while a spiky green star-shaped burst with a white ring pulses on the defender's centre 3–4 times (~2225, 2400, 2575, 2750 ms), each pulse smaller and paler.
- 2750–3100 ms: burst and leaves fade out; the defender is left alone on the green field.
- 3100–3625 ms: the background darkens back through olive to near-black and then returns to the normal battle backdrop (≈3800 ms).
- after the effect (≈4150 ms) the defender flashes white (the engine's damage blink); much later (≈6400–7700 ms) the engine's stat-fall effect plays on the attacker (blue bubbles rising; "Special Attack harshly fell!").
Screen: camera pans/zooms onto the attacker (−700–−175 ms), to the defender at 1750–1925 ms, back to the wide shot at ≈3800 ms; full-background change to near-black then yellow-green 0–3625 ms; no flash, no shake.
Palette: #52D63A, #2E9A2E, #A8F078, #EFF7E0
Modern cue: fixed camera, then a hard cut. A green-cyan glowing disc spins at the attacker's feet with thin green wind streaks orbiting it (~1.2–2.0 s); the attacker flings an arm and giant glowing crescent leaf-swooshes whirl off toward the target (~2.0–2.4 s). Cut to a close-up of the defender inside a huge green vortex with leaves (~2.5 s), then a yellow-white starburst with orange ground glow, speed lines and flying yellow leaf bits (~2.6–3.2 s, including a brief near-white bloom at ~3.1 s); green streaks and leaves fade by ~3.7 s and the camera cuts back to the wide shot (~4.3 s).
Board mapping:
- 0: charge(attacker, leaf, 10, 450); vignette(attacker, #0F2A10, low, 600)
- 300: aura(attacker, wind, #52D63A, 450); ring(attacker, halo, 2) green, expanding from the card base
- 600: projectile(leaf, 14, spiral, fast, green glow trail, spin) fanning from the attacker to the defender
- 1000: impactFlash(defender, #A8F078, strong); shake(card, medium, 250)
- 1000: burst(defender, leaf, 14, medium, ring) whirling and fading by 1700; burst(defender, star, 6, medium, ring) spiky green-yellow
- 1150–1450: two smaller pulses burst(defender, star, 4, small, ring), no extra flash
- contact at 1000; total 1900
Flags: house-rule conflict — the sprite turns the whole background near-black then bright yellow-green for ~3.6 s, and the 3D video has a near-white bloom at ~3.1 s; both replaced by a light local vignette on the attacker and a green (not white) impactFlash on the defender. Not mapped: the engine's damage blink and the stat-fall bubbles on the attacker (the Special Attack drop is a game effect). Sprite frame 292 white silhouette is the engine blink, not part of the move.

### Solar Beam — grass · special · tier 3
Refs: sprite N2B2 (10350 ms, effect frames 52–335) · modern EV (11766 ms)
Sprite beats:
- 0–1560 ms: cyan-turquoise aura glows and swells around the attacker; small bright cyan sparkles orbit.
- 1560–2400 ms: aura brightens and intensifies, cyan to yellow-green gradient.
- 2400–5250 ms: bright yellow glow surrounds the attacker with small yellow-white motes drifting upward; the background fades to a pale yellow-green.
- 5250–5700 ms: white flash across the screen; background turns bright yellow-green.
- 5700–7200 ms: a stark white and yellow beam fires from the attacker across the lane toward the defender; bright cyan-green speed streaks trail behind it.
- 7200–8100 ms: the beam impacts the defender with a large bright yellow starburst; white core with green-yellow radiating tendrils; small white-yellow sparkles scatter.
- 8100–9600 ms: the starburst and sparkles fade away; background returns to normal.
Screen: full-background pale yellow-green tint 2400–5700 ms, then bright yellow-green 5700–7500 ms; white flash at 5250–5400 ms; no shake, no camera move.
Palette: #31E7B8, #52E7CE, #FFFF00, #F7F731, #EFEFEF
Modern cue: fixed camera with slow zoom to the attacker. A cyan-green aura orbits the attacker with small motes (~0.5–2.5 s); then a bright yellow-white beam charges and fires at the target (~3.0–3.7 s) with radial speed lines and a near-white bloom at the impact point (~3.8–4.2 s); green streaks and sparkles linger and fade (~4.2–5.0 s).
Board mapping:
- 0: charge(attacker, leaf, 8, 600); aura(attacker, light, #52E7CE, 600)
- 300: ring(attacker, halo, 1) cyan, expanding from the card base
- 900: impactFlash(attacker, #FFFF00, low)
- 1500: beam(orb, medium, solid, 1800, low) yellow-green firing from attacker toward defender
- 2700: impactFlash(defender, #F7F731, strong); shake(card, medium, 300)
- 2700: burst(defender, orb, 8, large, ring) yellow-white starburst with green streaks
- contact at 2700; total 3200
Flags: house-rule conflict — the sprite dims the whole background to pale yellow-green then bright yellow-green for ~3.3 s; replaced by a light local vignette. The sprite shows a full-screen white flash at ~5.3 s; replaced by impactFlash on the defender.

### Seed Flare — grass · special · tier 3
Refs: sprite N2B2 (3960 ms, effect frames 38–128) · modern EV (4267 ms)
Sprite beats:
- 0–240 ms: a green seed pod with a pink-magenta stigma (star-shaped flower centre) erupts from below the defender; positioned at the defender's base.
- 240–600 ms: white sparkles and small cyan-green energy arcs orbit the seed, building outward.
- 600–900 ms: cyan-turquoise sparkles explode outward in a widening ring around the seed; the seed glows brighter.
- 900–1200 ms: the burst peaks — bright pink-magenta and cyan-turquoise petals and sparks fly radially in a star pattern; a white-cyan cross beam of energy flashes through the centre.
- 1200–1500 ms: the burst fades; scattered sparkles linger and fade.
Screen: no background change, no flash, no shake, no camera move.
Palette: #52D600, #B829F8, #31E7E7, #F7EFFF
Modern cue: a green glowing ring forms on the ground at the target (~0.5–1.0 s); a pink-magenta seed pod or bud appears in the centre (~1.0–1.3 s); then a bright burst of cyan-green and pink-magenta petals and sparks erupts outward with white energy streaks (~1.5–2.2 s); the effect fades quickly (~2.2–2.5 s).
Board mapping:
- 0: ring(defender, target, 1) green, contracting into a seed shape
- 150: orb(defender, medium, #52D600, grow-release)
- 300: burst(defender, star, 10, large, ring) pink-magenta and cyan petals; impactFlash(defender, #F7EFFF, strong); shake(card, small, 150)
- contact at 300; total 900
Flags: none

### Petal Dance — grass · special · tier 3
Refs: sprite IT5 (7050 ms, effect frames 40–282) · modern EV (4999 ms)
Sprite beats:
- 0–600 ms: pink and yellow petals coalesce below the attacker into a loose flower shape; small petals surround a yellow centre.
- 600–1200 ms: the flower petals burst outward and upward in a loose spray, scattering around the attacker.
- 1200–2100 ms: petals swirl in a widening spiral around the attacker, drifting upward and spreading across to the defender; pale pink and magenta tones.
- 2100–3600 ms: petals envelope the defender in a soft cloud, swirling and slowly settling around it; the petals fade in place as the dance concludes.
- 3600–4200 ms: scattered petals continue to drift downward and fade away.
Screen: no background change, no flash, no shake; camera pans/zooms onto the attacker (−500–0 ms), follows the petals to the defender (1200–1800 ms), then pans back (3600–4200 ms).
Palette: #F770D0, #FF52C8, #E7B8F7, #F7D000
Modern cue: a burst of pink-magenta petals erupts around the attacker with white trailing sparkles (~0.8–1.5 s); the petals flow and curve toward the target in a continuous stream (~1.5–2.5 s); hit as a soft magenta-white sparkle shower on the target (~2.5–3.0 s); petals drift down and fade (~3.0–3.5 s).
Board mapping:
- 0: burst(attacker, petal, 12, medium, ring) pink-magenta with yellow centre
- 200: projectile(petal, 10, homing, medium-fast, soft pink glow trail, spin)
- 700: burst(defender, petal, 12, medium, ring) swirling and fading by 2200; impactFlash(defender, #FF52C8, medium); shake(card, small, 200)
- contact at 700; total 2200
Flags: none

### Energy Ball — grass · special · tier 3
Refs: sprite N2B2 (4080 ms, effect frames 42–134) · modern EV (5500 ms)
Sprite beats:
- 0–450 ms: a pale yellow-green aura appears and expands around the defender; the glow intensifies from cyan to yellow-green.
- 450–900 ms: the aura reaches peak brightness; small yellow sparkles orbit within the glow.
- 900–1350 ms: the aura contracts and solidifies into a distinct bright green sphere (orb) at the defender's centre; yellow-white sparkles swirl around it.
- 1350–1800 ms: the green orb hovers, spinning slowly, with bright yellow motes trailing around it.
- 1800–2100 ms: the orb flashes and bursts; small green particles and yellow sparks scatter outward then fade.
- 2100–2700 ms: scattered sparkles and particles continue to fade away.
Screen: no background change, no flash, no shake, no camera move.
Palette: #31E731, #F7F731, #B8E731, #EFEFEF
Modern cue: a cyan-green ring forms on the ground at the target (~0.3–0.8 s); a bright yellow-green glowing sphere grows and stabilizes (~0.8–2.0 s) with yellow sparkles orbiting; then the orb contracts briefly and releases with a sharp green-yellow starburst (~2.5–3.0 s); the effect fades (~3.0–3.5 s).
Board mapping:
- 0: ring(defender, target, 1) green, expanding into a glow
- 150: orb(defender, medium, #31E731, hover) with yellow sparkles orbiting; aura(defender, light, #B8E731, 600)
- 600: impactFlash(defender, #F7F731, medium); shake(card, small, 150)
- 600: burst(defender, orb, 6, small, ring) green-yellow sparkles fading by 1200
- contact at 600; total 1600
Flags: none
