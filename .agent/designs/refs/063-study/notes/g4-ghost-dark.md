### Lick — ghost · physical · tier 1
Refs: sprite N2B2 (2940 ms, effect frames 43–96) · modern EV (3900 ms)
Sprite beats:
- 0–420 ms: camera pushes in on the defender (attacker slides off-screen bottom-left); no effect shapes yet.
- 420–720 ms: an orange tongue smear appears on the defender's chest and stretches straight UP over the face as one soft rounded vertical stroke (~1/3 of the sprite's width), its colour paling orange → peach → cream as it rises.
- 690–900 ms: the stroke turns grey-white and drifts upward off the head, leaving 2–3 thin vertical streak lines above it that vanish by 930 ms.
- 900–1350 ms: hold on the zoomed defender, nothing drawn.
- 1350–1590 ms: camera pulls back to the default two-Pokémon view.
Screen: camera push-in 0–420 ms and pull-back 1350–1590 ms; no tint, flash or shake.
Palette: #F0B080, #F0D0B0, #F0E0C0, #E07090
Modern cue: whole scene dims to a cold violet tint (~930 ms), camera cuts to the defender; a huge glossy pink 3D tongue swoops in from off-screen left, curls up past the target and sweeps back out (47–59 f, ~400 ms). Contact is a cyan-white sparkle puff with purple/black motes on the target that drizzles down and fades over ~400 ms; tint lifts after.
Board mapping:
- 0: aura(attacker, shadow, #7050A0, 250)
- 150: canvas(defender: one fat pink rounded tongue stroke sweeping bottom→top across the card face, 250 ms, then fading upward into 3 thin streaks)
- 330: impactFlash(defender, #E07090, light) + burst(defender, spark, 8, small, down)
- 380: cardMotion(defender, shiver)
- contact at 330; total 950
Flags: house-rule conflicts — modern dims the whole scene violet (dropped; optional vignette(defender, #605080, low) instead).

### Astonish — ghost · physical · tier 1
Refs: sprite N2B2 (3090 ms, effect frames 38–102) · modern EV (4001 ms)
Sprite beats:
- 0–210 ms: camera pans onto the attacker, which slides OUT of frame to the left (ducks out of sight).
- 240–450 ms: the attacker pops back in from the left, bigger/closer, with a quick upward hop toward the foe (the "boo"), then settles.
- 480–630 ms: camera swings to the defender and pushes in; nothing drawn.
- 810 ms: 6–8 small blue sweat droplets appear around the top of the defender.
- 840–960 ms: a jagged startle mark (white arch with 3–4 spikes, like a crown outline, ~1.5× the head's width) pops above the defender's head, turns cream → yellow while growing and rising, then blurs out by 960 ms; the droplets fly up and outward from it.
- 960–1500 ms: the droplets float near the top of the frame, drifting slowly and fading; camera pulls back 1620–1920 ms.
Screen: camera pans/push-ins 0–630 ms and pull-back 1620–1920 ms; no tint, flash or shake.
Palette: #F8F8F8, #E0E040, #B0B020, #2080D0
Modern cue: a cyan glowing core lights in the attacker, bursts into a cyan-white sphere ringed with white/pink needle streaks (~70 ms), then a violet dome shockwave with black shards blasts outward from the attacker and its arc fragments sweep across to the target. Hit = cyan-white crackle cluster on the target decaying into purple/black falling motes, plus a yellow "!" startle icon over the target as it flinches back.
Board mapping:
- 0: cardMotion(attacker, crouch) — ghost card dips and fades to ~30% (ducks out)
- 220: cardMotion(attacker, hop) — reappears at full opacity with a sharp hop toward the defender (no travel)
- 320: ring(attacker, shockwave, 1) violet #6040E0
- 450: canvas(defender: yellow spiky startle arch above the top edge, pops in white, turns #E0E040, rises 20 px and fades by 650) + burst(defender, droplet, 7, small, up) #2080D0
- 470: cardMotion(defender, recoil)
- contact at 450; total 950
Flags: none

### Shadow Punch — ghost · physical · tier 2
Refs: sprite N2B2 (2400 ms, effect frames 40–79) · modern EV (3000 ms)
Sprite beats:
- 0–150 ms: the attacker darkens from its purple to a near-black shadow silhouette (whole sprite, no outline glow).
- 180–390 ms: the black silhouette sways/jerks in place (wind-up); nothing travels across the field.
- 420–510 ms: on the defender, grey smoke puffs ring out and a small white 8-point star flares at its centre, immediately turning into a dark olive-black spiky starburst; grey dotted streak lines radiate outward.
- 450–720 ms: a translucent grey-white fist (knuckles facing the viewer, ~half the defender's width) materialises at the defender's left side, solidifies to white while sweeping left → right across the body (contact ≈ 540 ms), then turns ghostly with 2–3 ripple rings and fades on the right.
- 630–810 ms: black specks scatter out from the defender and drift away.
- 960–1170 ms: the attacker's silhouette eases back to its normal purple.
Screen: none (camera push-in only, already set before t = 0).
Palette: #180818, #D0D8D8, #808890, #302810
Modern cue: the attacker's arm stretches out of frame as a long elastic purple limb; at the target a glowing cyan 3D fist punches out of a black-spiked starburst, swells, and a hot magenta/violet splash bursts behind it. The fist then collapses to a cyan outline, then a magenta outline, while violet/black shards spin away and a purple haze lingers ~400 ms over the target.
Board mapping:
- 0: aura(attacker, shadow, #201040, 400) — card dims to a dark silhouette
- 250: cardMotion(attacker, thrash) — short jab, no travel (the fist appears at the target, not along the lane)
- 450: canvas(defender: one big fist shape, cyan #40E0F0 fill with dark outline, pops in at the defender's near edge and drives across the card, 200 ms; then shrinks to a magenta outline and fades)
- 540: impactFlash(defender, #F030D0, medium) + burst(defender, shard, 8, medium, ring) violet/black
- 560: shake(card, small, 200); 650: cloud(defender, mist, small, none) violet, fades by 1100
- contact at 540; total 1300
Flags: none

