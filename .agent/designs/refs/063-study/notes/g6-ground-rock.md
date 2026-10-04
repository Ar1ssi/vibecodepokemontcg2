### Sand Tomb — ground · physical · tier 1
Refs: sprite N2B2 (6300 ms, effect frames 39–127) · modern EV (5000 ms)
Sprite beats:
- 0–600 ms: no effect yet; camera zooms in on the defender (HUD hidden).
- 600–1500 ms: ~15–25 translucent olive/khaki rounded-square sand clumps plus fine dust specks swirl up from the defender's base, wrapping its body and climbing as a loose column above it (rising vortex, slow ~1 card-height per 0.5 s).
- 1500–2100 ms: column thins; the last clumps drift up out of frame and fade. No impact flash, no defender motion.
- 2370–2640 ms: camera pulls back to the default view; HP bar drains 2730–3000 ms and the defender blinks (generic hit flicker ~3120 ms).
Screen: camera zoom-in on defender 0–600 ms and pull-back 2370–2640 ms; no tint, flash or shake.
Palette: #586818, #888848, #a8a040, #a89868
Modern cue: Whole scene dims to a dusty sand-brown haze (~800–3000 ms) while a sand wall sweeps from the attacker across to the defender; a flat horizontal sand ring/vortex forms around the defender's feet with thin spiral streaks rising past it, HP drops as the ring closes (~1800 ms), and a low dust band lingers before the light returns (~3000 ms). Camera stays behind the attacker.
Board mapping:
- 0: terrain(defender, sand-vortex) — flat swirling ring under the card, 0–900 ms
- 100: burst(defender, sand, 16, 0.6× card, up) spiralling up around the card, fading at the top by 800 ms
- 450: impactFlash(defender, #a8a040, low) + cardMotion(defender, shiver)
- contact at 450 ms; total 1000 ms
Flags: house-rule conflicts — modern tints the whole scene sand-brown (dropped; optional vignette(defender, #a89868, low)). Uncertainty — neither reference has a single impact beat (damage is the vortex itself), so the 450 ms contact is a board choice.

### Mud-Slap — ground · physical + special (both cells) · tier 1
Refs: sprite N2B2 (2790 ms, effect frames 39–92) · modern EV (5000 ms)
Sprite beats:
- 0–270 ms: camera tightens on the attacker; no effect yet.
- 300–480 ms: soft brown mud puffs spew from the attacker's front and lengthen into a ragged stream.
- 480–690 ms: camera pans along with it; a continuous band of ~20 soft square mud blotches flows straight down the lane into the defender (crosses in ~0.2 s).
- 690–930 ms: mud piles into a cloud over the defender's body and face while trailing blotches keep arriving.
- 780–1080 ms: 2–4 small gold 8-point star sparks pop around the defender's head (accuracy-drop "dazzle"); the cloud shrinks onto the head and fades out by 1140 ms.
- 1230–1590 ms: camera pulls back to the default view.
Screen: camera close-up on attacker 0–480 ms, pan to defender 480–690 ms, pull-back 1230–1590 ms; no tint, flash or shake.
Palette: #786858, #5a4a3a, #583828, #b8a858
Modern cue: A splash of glossy dark-brown mud erupts in front of the attacker (~1600 ms) and flies as a loose volley of 20–30 rounded globs in a shallow arc to the defender; on arrival (~2130 ms) a small pale-yellow spark star pops at the feet and mud splatters, sticks and drips down the body, leaving stains. A generic blue stat-drop overlay follows (~3500–4700 ms). Camera static.
Board mapping:
- 0: cardMotion(attacker, crouch) as a short wind-up
- 150: projectile(mud-glob, 10, volley, fast, brown smear trail, none) along the lane, arriving 450 ms
- 450: burst(defender, mud-glob, 10, 0.5× card, random) + terrain(defender, mud-splash) + impactFlash(defender, #786858, medium)
- 550: burst(defender, star, 3, small, ring) gold dizzy sparks, fading by 900 ms
- contact at 450 ms; total 1000 ms
Flags: none

