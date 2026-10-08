### Zen Headbutt — psychic · physical · tier 2
Refs: sprite N2B2 (4530 ms, effect frames 40–133) · modern EV (5000 ms)
Sprite beats:
- 0–330 ms: camera swings round to a front close-up of the attacker (no effect drawn yet).
- 330–630 ms: background dims to near-black; held until ~2790 ms.
- 690–870 ms: small translucent cyan orb forms on the attacker's chest; first few thin cyan streaks.
- 930–990 ms: orb flares to a large cyan halo with a pale core (~1/3 of the body); ~10–15 thin cyan/white speed-lines dart around the attacker in random directions.
- 1050–1170 ms: orb shrinks to a small white-cyan dot and rises to the head.
- 1230–1290 ms: second flare at the head: white core, cyan halo, ~1.5× head size.
- 1350–1590 ms: orb floats just above the head, pulsing small→large twice (grey core, teal rim).
- 1620–1710 ms: camera whip-pans right to the defender; the attacker sprite swells and exits lower-left (the "charge" is the camera move; no sprite reaches the target).
- 1830 ms: contact — one small teal 4-point sparkle at the defender's base.
- 1860–2040 ms: ~10 pale-cyan 4-point stars burst out from the defender's centre and spread in a ring; dark-blue star flash at the centre at ~1920 ms.
- 2100–2520 ms: stars turn into small violet twinkles plus cyan line fragments drifting outward and fading.
- 2580–2790 ms: last twinkles gone; at 2820 ms background and camera restore.
Screen: camera swing to attacker 0–330 ms; whole background dimmed to near-black 330–2790 ms; camera whip-pan to defender 1620–1710 ms; no white flash, no shake.
Palette: #88d8d8, #e8e8e8, #29cece, #9c7bbd
Modern cue: camera cuts to the attacker's face; violet glow on the forehead, then a thin white ring halo with violet/cyan crystal spikes bristling from the head while it charges (~1.1–2.2 s). At release a pink-red screen tint flashes, and the attacker flies head-first as a pink-white comet with orange flame flecks;
impact is a magenta/white starburst followed by orange smoke puffs, teal arc lines and slowly floating violet orbs around the target.
Board mapping:
- 0: vignette(attacker, #2a1840, 0.5, 700) + aura(attacker, light, cyan, 600)
- 150: orb(attacker, small→medium, cyan-white, grow-release) on the card's top edge, pulsing at 150 and 400
- 600: lunge(attacker→defender, reach: full lane, windup: 120) with the orb riding the leading edge, cyan-violet trail
- 850: impactFlash(defender, cyan-white, medium) + burst(defender, star, 8, medium, ring) + vignette(defender, #2a1840, 0.4, 400)
- 950–1400: burst(defender, star, 6, small, random) violet twinkles fading
- contact at 850; total 1400
Flags: house-rule conflicts — sprite dims the whole background to near-black for ~2.5 s (mapped to local vignettes on attacker then defender); modern pink-red full-screen tint at release dropped; the sprite's charge is a camera whip-pan (mapped to a lunge).

### Psycho Cut — psychic · physical · tier 2
Refs: sprite N2B2 (3300 ms, effect frames 39–101) · modern EV (3400 ms)
Sprite beats:
- 0–120 ms: camera swings round to a front close-up of the attacker.
- 180–360 ms: dark plum mist blooms around the attacker's whole body (soft, translucent, ~1.2× body).
- 300–780 ms: a plum concentric-ring disc (target/spiral pattern, 4–5 rings) grows at the chest from a dot to ~half body width; the mist fades out by ~540 ms.
- 840–1020 ms: disc softens and turns semi-transparent, rings appear to rotate.
- 1050–1290 ms: disc swings edge-on and peels into lilac crescent blades; at ~1290 ms two crescents arc around the body (large one left, small one right).
- 1350–1620 ms: camera eases back to the default view while ONE lilac crescent (about the defender's height, translucent, concave side trailing) flies on a shallow upward arc from the attacker's right hand to the defender.
- 1650–1860 ms: contact — the crescent sweeps through the defender bottom-left→top-right and exits over its right shoulder, fading; no hit flash, no visible recoil.
- 1890 ms: effect gone.
Screen: camera swing to attacker 0–120 ms and back 1350–1620 ms; no tint, flash or shake.
Palette: #5a295a, #8c5a8c, #bd8cbd, #bd94c6
Modern cue: camera cuts to the defender and the scene dims slightly; a glowing magenta-violet crescent streaks in from lower-left and slices through with a tall white blade flash (~1.73 s), then 2–3 more crescents follow from alternating angles (white X-flash ~2.0 s).
Between slices a translucent violet sphere wraps the target, magenta rings orbit it and white 4-point star sparks spit off; ends with violet rings fading (~2.6 s).
Board mapping:
- 0: cloud(attacker, mist, small, none) plum + ring(attacker, target, 4) concentric plum rings tightening into a disc, 0–500
- 500: projectile(crescent, 1, arc, fast, trail: lilac, spin: none) along the lane
- 780: slash(defender, blade, 1, 60°) following the crescent's exit + impactFlash(defender, lilac, medium)
- 820–1250: ring(defender, halo, 1) magenta swirl fading + burst(defender, star, 4, small, random)
- contact at 780; total 1250
Flags: uncertainty — modern lands 3–4 separate crescent slices while the sprite lands one; mapped as a single hit. Modern dims the whole scene during the hits (dropped, no vignette needed).

### Confusion — psychic · special · tier 1
Refs: sprite N2B2 (2910 ms, effect frames 42–83) · modern EV (4500 ms)
Sprite beats:
- 0–330 ms: background dims to near-black; the attacker sprite washes out to a pale blue-white glow (peak ~120–150 ms), then returns to its normal colours by ~330 ms.
- 360–450 ms: camera swings/zooms onto the defender (nothing travels along the lane).
- 510 ms: defender is tinted violet and one small magenta ring appears on it.
- 540–660 ms: two concentric magenta rings expand from the defender's centre to ~1.2× its body; defender fully violet-tinted.
- 690–990 ms: rings hold around the defender, brightening and wobbling slightly (no shake of the defender itself).
- 1020–1080 ms: rings expand a little and fade out.
- 1110–1170 ms: violet tint drains from the defender.
- 1260–1620 ms: background brightens back and the camera returns to the default view.
Screen: background dimmed to near-black 0–~1260 ms; camera move to defender 360–450 ms and back 1260–1620 ms; no flash, no shake.
Palette: #b8c8f0, #b048b0, #c858d8, #6848a8
Modern cue: small pink/cyan ripple ring pulses beside the attacker's head, camera cuts to the defender; a huge soft pale-pink sphere swells around the target and saturates to magenta (~2.6–3.0 s), splits into overlapping blue/magenta ring-bubbles,
then a white sphere flash with radial streaks at ~3.2 s; ends with a large violet ring shockwave widening past the target and floating pink/cyan motes (3.4–3.8 s).
Board mapping:
- 0: aura(attacker, light, #b8c8f0, 300)
- 300: vignette(defender, #2a1840, 0.4, 600) + aura(defender, plain, #6848a8, 600)
- 350: ring(defender, halo, 2) magenta, growing to 1.2× card and wobbling
- 600: impactFlash(defender, magenta, medium) + ring(defender, shockwave, 1)
- 600–1000: rings and tint fade
- contact at 600; total 1000
Flags: house-rule conflicts — sprite dims the whole background to near-black for ~1.3 s (mapped to a defender vignette); modern's camera-filling pink sphere and white bloom at ~3.2 s dropped (kept card-local). Uncertainty — the sprite has no distinct hit beat; contact placed at the ring peak.

### Psybeam — psychic · special · tier 2
Refs: sprite N2B2 (3990 ms, effect frames 47–130) · modern EV (4000 ms)
Sprite beats:
- 0–360 ms: camera swings round beside the attacker and zooms in (no effect drawn).
- 360–660 ms: hold; attacker flaps; camera slowly rotates back toward the lane.
- 720 ms: first faint yellow ring appears at the attacker's front edge.
- 780–870 ms: a stream of hollow oval rings (each ~half a card wide, overlapping like a tube) grows out from the attacker toward the defender, colours cycling yellow→magenta→blue→violet; the head reaches the defender at ~870 ms (lane crossed in ~150 ms).
- 900–1260 ms: continuous ring-tube from attacker to defender, rings scrolling forward; the defender takes a deepening magenta/violet tint; camera slowly pulls back.
- 1290–1590 ms: the tail detaches from the attacker and the last rings travel into the defender, shrinking.
- 1590–1830 ms: last rings dissolve on the defender, which is now fully magenta-tinted.
- 1890–2490 ms: the tint fades back to the defender's normal colours.
Screen: camera swing 0–360 ms and slow drift back during the beam; no tint, flash or shake.
Palette: #ce0ae7, #c8a020, #3356ba, #7829d8
Modern cue: a wavy magenta ring outline wraps the attacker and its core charges white (1.3–1.75 s); at 1.8 s a thick white-pink beam with cyan edge streaks fires, camera cuts to the target where the beam drills in inside wavy magenta and yellow outlines (~2.0 s);
a yellow starburst flash at ~2.6 s, then a huge magenta dome with hollow yellow/white rings and bubbles bursts out and hangs over the target, fading by ~3.6 s.
Board mapping:
- 0: charge(attacker, ring, 3, 300) magenta rings tightening + orb(attacker, small, white-pink, grow-release)
- 300: beam(ring, medium, segmented, 650, jitter: low) hollow rings cycling yellow→magenta→blue→violet along the lane
- 450: impactFlash(defender, magenta, medium) + aura(defender, plain, #9838a8, 750)
- 950: beam tail runs into the defender; burst(defender, ring, 6, small, random) hollow rings
- 950–1350: rings and tint fade
- contact at 450; total 1350
Flags: house-rule conflicts — modern's yellow starburst bloom and the camera-filling magenta dome/tint (2.6–3.6 s) dropped; the sprite version is clean.

