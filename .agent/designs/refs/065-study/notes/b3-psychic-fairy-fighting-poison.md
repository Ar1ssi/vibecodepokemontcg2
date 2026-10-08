### Freezing Glare — Articuno · psychic · special · power 90
Refs: video EV (7066 ms, 29.72 fps, effect frames 32–209) · gen7 none
Signature read: Articuno's breast glows purple, a blue-then-white beam fires from it into the defender, and the defender bursts into grey splinters.
Video beats (t = 0 at frame 32; the wide pre-move shot, f0–31, has the text "Articuno utilise Regard Glaçant !" from f18):
- pre-t0 (f0–31): wide shot; Articuno (lilac-pink, dark head) at left-centre on a rock ledge; a spiked grey-blue Pokémon (the defender) at right; a purple tail streak at lower-left (f0–30).
- 0–471 ms (f32–46): close side view; Articuno rears, spreads and flaps its wings (f36–46) with its long purple tail curling at lower-left; a trainer at the left edge.
- 471–606 ms (f46–50): wings fully spread (widest at f50), frontal view.
- 774–841 ms (f55–57): a blue-white glint at the breast (f55–57), then a white starburst (f57–59).
- 976–1043 ms (f61–63): a violet glow at the breast; thin white dashed streaks begin to run lower-right (f63–69).
- 1312–2322 ms (f71–101): a purple orb glows at the breast with white sparks; the dashed streaks stream lower-right.
- 2456–2557 ms (f105–108): a huge white disc at the breast (f105–106), then a white starburst with radial spokes (f108).
- 2624–3432 ms (f110–134): a blue beam fires from the breast to lower-right (f110–112; blue with swirling blue rings), turns white-cyan (f114), then is a thick white beam with a pink-violet fringe (f116–134) with white swirl rings at its root.
- 3499 ms (f136): camera cut to a side view; the beam runs horizontally into the defender (a grey faceted body at centre-right).
- 3499–4172 ms (f136–156): the beam hits; purple-pink sparks and grey splinters fly off the defender (f138–156).
- 4240 ms (f158): whole-screen cyan-white flash.
- 4341–4677 ms (f161–171): whole-screen lilac concentric rings (f161–163), then a white-violet radial starburst across the frame (f163–171).
- 4677–5081 ms (f171–183): purple-white smoke and pale bubble discs round the defender; the frame dims to blue-purple.
- 5081–5619 ms (f183–199): the defender stands in a blue-purple haze with lilac bubble discs.
- 5686–5956 ms (f201–209): wide view returns; Articuno flies up from the ledge with its tail trailing (f201), then lands back and settles (f203–209).
Pokémon: rears and spreads its wings with the tail curling (0–467 ms); glints and holds a purple orb at the breast (774–2389 ms); fires the blue-then-white beam from the breast (2691–3499 ms); flies back to the ledge (5686–5955 ms). Cue for the card ghost: a lift and glow into the charge, a brace at the release, a rise on the return.
Camera & screen: a wide-to-close cut at f31–32 (at t0); a side-view cut at f136 (3499 ms); a whole-screen cyan-white flash at 4240 ms; whole-screen lilac rings and a white-violet starburst at 4341–4677 ms; a blue-purple dim at 4677–5619 ms; the wide reset at f201 (5686 ms). Board replacement: the cuts become card motion; the flash becomes impactFlash on the defender; the rings become one ring on the defender; the starburst is dropped; the dim becomes a local vignette.
Palette: #FEFCFF (beam core, sampled), #13B7FF (ice-cyan beam edge, sampled at f112), #0735F3 (beam root blue, sampled at f110), #A65BEB (breast orb, eyeballed), #CFABFF (purple haze, sampled at f175).
Closest generic: hydro-cannon (Water special 3: a beam from the attacker with an orb at its mouth, Appendix A). Must differ: a blue-then-white beam from a purple breast orb, and the defender breaks into grey splinters, not splash rings.
Board mapping:
- 0: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5) · orbitCharge(attacker, count 3, half 'back', r0 0.16, r1 0.24) · attacker brace (glow 0.6) 0–500
- 500: beam(defender, kind 'segmented', w 0.08, gap 0.4) — the dashed streaks, 500–700
- 700: beam(defender, kind 'solid', w 0.5) — grows 700–925, holds to 1280, retracts 1280–1600 (the reference beam runs ~3.5 s; compressed to the budget)
- 1000: impactFlash(defender) · shards(defender, count 8, arc 360, distance 1.1) · ring(defender, kind 'face', count 2, r0 0.3, r1 1.4)
- 1000–2000: vignette(defender, maxAlpha 0.45) · cloud(defender, count 6, drift 0.5, alpha 0.4) · mote particles ×12 at defender
- defender knock 0.3 (tremble from 0.82 c)
- contact at 1000; total 2200
New pieces: none
Flags: house-rule translations (whole-screen cyan-white flash → impactFlash on the defender; lilac rings → one ring; starburst dropped; blue-purple dim → local vignette; camera cuts dropped); the reference's beam-to-contact (~3.5 s) is compressed to the 1.0 s contact window; palette override on the psychic material for the cyan-white beam; uncertainty: the defender's species is not confirmed; no Gen 7 reference.

### Heart Swap — Manaphy / Magearna · psychic · status · power —
Refs: video EV (6433 ms, 30 fps, effect frames 10–181) · gen7 USUL (not needed)
Signature read: Manaphy's two antennae rise into a V, a magenta swirl-orb is drawn out of the defender across the lane into Manaphy, sits inside a pink dome, then goes back, so the two Pokémon swap stat changes.
Video beats (t = 0 at frame 10):
- 0–400 ms (f10–22): Manaphy's far antenna lifts from the floor and curls over its head (f12–22); the move-name text box from f14.
- 467–800 ms (f24–34): the antenna arches over the head (f24–28), then rises straight up (f30–34).
- 867–1133 ms (f36–44): both antennae rise into a V with pale blue tips (f40–44); Manaphy stays put.
- 1200–1267 ms (f46–48): a magenta swirl-orb with a pink halo appears at the defender (a small blue creature at right; species not read).
- 1300–1567 ms (f49–57): the orb glides left across the lane with a pink sparkle trail (f49–57).
- 1633–1900 ms (f59–67): the orb reaches Manaphy; a translucent pink dome forms round Manaphy with white sparkles at its top (f59–61), fading by f65–67.
- 1967–2300 ms (f69–79): Manaphy's antennae stand in a V with no orb in view.
- 2367–2500 ms (f81–85): the magenta orb is back at Manaphy's right side under a pink dome over Manaphy (f81–85).
- 2500–2767 ms (f85–93): the orb leaves Manaphy toward the defender with a pink sparkle trail.
- 2833–3000 ms (f95–100): a pink dome with white sparkles encloses the defender (f95–100).
- 3067–4000 ms (f102–130): Manaphy's antennae droop to the floor on the left (f102–130).
- 4067–5700 ms (f132–181): the stat-swap text box "Manaphy permute ses changements de stats avec celui de sa cible" is up; Manaphy idles with its antennae lowered; the text fades by f183.
Pokémon: body stays put; the antennae lift into a V (0–1133 ms) and droop after the second dome (3233 ms on). Cue for the card ghost: a brace on the lift, a glow on each dome, a float on the defender at the swap, and a settle at the end.
Camera & screen: a fixed wide camera for the whole move; no cut, tint, flash or shake. The domes are local to each card. Board replacement: none needed.
Palette: #D2137A (orb magenta, eyeballed), #F09CEA (pink halo, sampled at f48), #F0CBEF (dome fill, sampled at f97), #7FD7F0 (Manaphy highlight, sampled at f36), #FFFFFF (sparkle, eyeballed).
Closest generic: confusion (psychic special 1; no written 063 entry yet). Must differ: a status swap with no damage and no contact; the orb travels both ways, and each side gets a pink dome.
Board mapping:
- 0: brace(attacker, glow 0.6) · antenna lift is card-motion only
- 700: projectile(defender→attacker, path 'straight', r0 0.3, r1 0.5, tongues 3) — 700–900 ms, the reverse flag (New pieces)
- 950: aura(attacker, hz 2, alpha 0.6) to 1150 — the first dome on Manaphy
- 1370: projectile(attacker→defender, path 'straight', r0 0.3, r1 0.5, tongues 3) — 1370–1600 ms, the return
- 1700: aura(defender, hz 2, alpha 0.6) to 1900 — the dome on the defender
- attacker brace (glow 0.6), defender float (lift −0.15 h, tilt ±4°) 1700–1900
- no contact (status move); total 1900
New pieces: projectile reverse flag: the orb runs defender→attacker on the lane for the first pass (one flag, no new material).
Flags: status move (opponent-targeted, kept); the reference's ~3.2 s is compressed to 1.9 s; the stat-swap text box is not drawn; palette eyeballed except where marked sampled; Gen 7 not used; uncertainty: the orb's colours are read from the EV sheets, the defender species is not read.

### Hyperspace Hole — Hoopa · psychic · special · power 80
Refs: video EV (6000 ms, 30 fps, effect frames 24–179) · gen7 USUL (not needed)
Signature read: a dark violet portal opens in the lane, Hoopa is drawn into it and comes back out beside the defender, then a magenta-and-white starburst bursts on the defender.
Video beats (t = 0 at frame 24; pre-t0 is Hoopa idle at left-centre with the text box, and a camera drift at f17):
- pre-t0 (f0–23): Hoopa (magenta body, gold-rimmed rings, purple arms) at left-centre; a small light-blue elephant-like Pokémon at right; the move-name text box from f14.
- 0–67 ms (f24–26): a dark violet haze forms mid-lane between Hoopa and the defender.
- 67–400 ms (f26–36): the haze becomes a dark violet portal (black-violet core, pink specks), about one card high (f28–34); Hoopa is drawn into it (f36).
- 400–667 ms (f36–44): the portal is a large violet vortex with pink specks (f36–44); Hoopa's silhouette is inside (f36–38).
- 700–1100 ms (f45–57): the portal drifts slightly right and stays large (f45–57), with a violet swirl.
- 1167–1233 ms (f59–61): the portal shrinks and fades at its left (f59); Hoopa re-emerges at its right (f61).
- 1233–1433 ms (f61–67): Hoopa stands beside the portal (f63–67) with magenta and gold rings; a dark haze at its left fades (f65–69).
- 1433–1967 ms (f67–83): Hoopa and the defender stand; the dark haze at the left edge fades (f69–83).
- 1967–2167 ms (f83–89): a magenta-and-white starburst with blue spike edges fills most of the frame at the defender (f85, the largest; f87, a flower-shaped magenta core), fading to pink by f89.
- 2200–2333 ms (f90–94): a pink-white wash with purple rays covers the whole screen (f90–92), then the defender is pink-tinted (f92–94).
- 2333–2800 ms (f94–108): normal colour; Hoopa and the defender stand; a dark haze at the far left (f96–106).
- 2800–2933 ms (f108–112): a second dark portal opens at Hoopa's left (f108–112); Hoopa steps into it (f110–112).
- 2933–3667 ms (f112–134): the second portal holds large at the left (f114–130) and shrinks (f132–134).
- 3700–3767 ms (f135–137): a dark wisp remains at the left.
- 3833–4433 ms (f139–157): a large black shape opens at the top-left (f139); Hoopa steps out at the left (f141–149); a violet haze fills the left edge (f143–157).
- 4500–5167 ms (f159–179): the left-edge haze fades (f159–169); Hoopa idles at centre-left, the defender at right.
Pokémon: its rings turn at idle (pre-t0); it is pulled into the portal (400–667 ms); it re-emerges beside the portal (1233–1433 ms); the burst lands on the defender (1967–2167 ms); it walks into a second portal (2800–2933 ms) and steps out at the left (3833–4433 ms). Cue for the card ghost: a sink into the lane, a re-emerge at the defender's side, a settle; the burst is an effect, not a body dash.
Camera & screen: a camera drift at f17 (before t0); a whole-screen magenta-and-white burst at 2033–2167 ms (f85–89); a whole-screen pink wash at 2200–2333 ms (f90–94); a dark left-edge portal and haze at 2800–4433 ms (f108–157). Board replacement: the burst becomes a local starFlare and impactFlash on the defender; the pink wash is dropped; the second portal is dropped.
Palette: #1B0630 (portal core, eyeballed at f36), #7B2CB8 (portal rim violet, eyeballed at f44), #E040E0 (burst magenta, eyeballed at f87), #FCE6FF (burst white, eyeballed at f85), #3050FF (burst blue spike edge, eyeballed at f85).
Closest generic: psychic (special 3, no written 063 entry; Appendix A psychic row pending). Must differ: the signature is a violet portal the attacker enters and leaves, not a thrown orb; the hit comes from the burst on the defender after Hoopa re-emerges beside it.
Board mapping:
- 0: [new piece: portal] at lane mid, 0–600 ms · brace(attacker, glow 0.6) 0–300
- 300: attacker sink into the portal, 300–500 ms
- 500: attacker re-emerges beside the defender (the reverse of the sink), 500–900 ms; the portal shrinks and fades 500–900 ms
- 1000: starFlare(defender, arms 'ring', width 0.46) · impactFlash(defender) · ring(defender, kind 'face', count 2, r0 0.3, r1 1.4)
- 1000–1500: mote particles ×10 at defender (pink)
- defender knock 0.3 (tremble from 0.82 c), attacker brace (glow 0.6) after re-emerge
- contact at 1000; total 2200
New pieces: portal: a dark violet disc on a lane point (black core, violet rim, a slow swirl of ribbons; psychic material, deep #1B0630) that grows, holds and fades. Attacker sink/re-emerge: a card preset that shrinks and fades the ghost into the portal point, then reverses out at the exit point.
Flags: house-rule translations (whole-screen magenta-and-white burst → local starFlare and impactFlash on the defender; pink wash and the second portal dropped; camera drift dropped); missing drawer: portal (see New pieces); reference timing compressed to fit the contact window; palette eyeballed; Gen 7 not used.

### Luster Purge — Latios · psychic · special · power 95
Refs: video EV (8733 ms, 30 fps, effect frames 33–228) · gen7 USUL (not needed)
Signature read: Latios whitens and launches a rainbow-rimmed white-hot orb straight up and out of the frame, and the defender takes a yellow-white burst with dark orange cracks under a blue Special Defense haze.
Video beats (t = 0 at frame 23):
- pre-t0 (f0–22): wide shot; Latios (blue-white) at left-centre on grass below a grey cliff; a small lilac round Pokémon (the defender) at right; the move-name text box from f18.
- 0–333 ms (f23–33): Latios drifts forward; a faint yellow-green sparkle at its chest (f33).
- 333–733 ms (f33–45): Latios rises and tilts toward the defender; its body whitens from f39 and is fully white by f45.
- 833–933 ms (f48–51): a yellow-green halo ring expands from the body.
- 1033–1333 ms (f54–63): a rainbow-fringed ring (red, yellow, green) expands at the chest (about 0.7 h at f57–60), with red and yellow spikes at the chest (f60–63).
- 1433–1533 ms (f66–69): a white-yellow sphere with a rainbow ring forms at the chest.
- 1633 ms (f72): the sphere is a white starburst with rainbow rays.
- 1733–1833 ms (f75–78): the orb is launched up and out of the top of the frame, with rainbow rays.
- 1933–2233 ms (f81–90): Latios climbs toward the top-left; faint sparkles drift down (f84–90).
- 2333–3133 ms (f93–117): camera tilts to the sky and widens on the defender (a lilac round Pokémon with a curled tail at lower-right); Latios hovers high at the top-left; white light shafts fall from the top-left sky (f96–123).
- 3433–3533 ms (f126–129): impact: yellow-white sparks and dark orange cracks burst around the defender.
- 3633–3833 ms (f132–138): a yellow-white flash with orange-red streaks and yellow sparks round the defender.
- 3933–4133 ms (f141–147): a yellow-white horizontal streak crosses the defender from the left (f141–144); dark green speed lines at the right (f144–147).
- 4233–4633 ms (f150–162): "Ce n'est pas très efficace" text shows; the defender stands in the speed lines.
- 4733–4933 ms (f165–171): camera turns to the defender side-on (f165), widens (f168); Latios drops back to the top-left (f171).
- 5033–5833 ms (f174–198): Latios returns to left-centre; the defender stands at right; a blue glow starts on the defender (f198).
- 5833–6933 ms (f198–231): a blue Special Defense haze with sparkles wraps the defender (f204–222) and fades by f231; a "La Défense Spéciale ... baisse" text box shows from f207.
- 6933–7933 ms (f231–261): the haze is gone; Latios and the defender idle.
Pokémon: whitens and holds a halo (333–933 ms); builds the chest ring (1033–1333 ms); launches the orb up and out of frame (1433–1833 ms); climbs to the top-left and hovers (1933–3133 ms); drops back to its start after the hit (5033–5833 ms). Cue for the card ghost: a rise and hover on the charge, a glow on the chest, a launch glow, a return to the start position after contact.
Camera & screen: a slow drift at 0–333 ms (f23–33); a tilt up to the sky at 2333 ms (f93) with a wider framing on the defender (f93–129); a close side view of the defender at f165 (4733 ms); a wide reset at f168 (4833 ms). Light shafts from the top-left sky (2433–3133 ms, f96–123) are god-rays. A yellow-white flash at f132–138 is local to the defender. The blue haze is a local tint on the defender (5833–6933 ms). Board replacement: the camera moves are dropped; the sky shafts are dropped; the flash becomes impactFlash and a local starFlare on the defender; the blue haze becomes an aura on the defender, compressed into the contact window.
Palette: #FFFFFE (white-hot core, #E4F5A0 (halo, #FF5A5A (rainbow red, #FFF35C (impact yellow, #6468F1 (Special Defense haze.
Closest generic: solar-beam (Grass special 3, Appendix A: a light column from above onto the defender). Must differ: the orb is launched up and out first, the impact is a yellow-white burst with cracks, not a steady beam, and the sky light shafts are diagonal from the top-left.
Board mapping:
- 0: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5) · shockRings(attacker, count 2, delay 0.3) — the rainbow halo
- 400: projectile(attacker→defender, path 'arc', bow 1.2, r0 0.34, r1 0.5, tongues 6) — the orb is flung high and comes down at contact (compressed)
- 1000: starFlare(defender, arms 'cross', width 0.46) · impactFlash(defender) · ring(defender, kind 'floor', count 3, r0 0.3, r1 1.5)
- 1000–1600: aura(defender, hz 2, alpha 0.6) — the blue Special Defense haze, compressed into the window
- attacker rise (lift 0 → 0.6 c, hover → 1.2 c, land → 1.6 c), defender knock 0.3 (tremble from 0.82 c)
- contact at 1000; total 2200
New pieces: rainbow-fringe ring for the halo: the ring drawer's rim cycles red → yellow → green → blue on the psychic lens (needed for the halo and the chest ring).
Flags: house-rule translations (sky light shafts → dropped; camera tilt, widening and cuts dropped; the Special Defense haze pulled into the contact window); reference contact (~3.4 s) compressed to 1.0 s; palette override on the psychic material (gold and rainbow instead of the psychic palette); uncertainty: the defender's species is not confirmed; Gen 7 not used.

### Mist Ball — Latias · psychic · special · power 95
Refs: video EV (4667 ms, 30 fps, effect frames 16–104) · gen7 USUL (not needed)
Signature read: a lilac mist orb with white feathers forms at Latias's mouth, hovers high over the lane, then drops onto the defender (Latios, blue) in a yellow-white star that dissolves into a pale lilac mist cloud.
Video beats (t = 0 at frame 16):
- pre-t0 (f0–15): Latias (red and white) at left-centre with its head raised; Latios (blue) at right; the move-name text box at the bottom-left from f0.
- 0–267 ms (f16–24): Latias raises its head and wings; a grey-lilac mist puff forms at its front (f18–22); a small lilac sparkle at its mouth (f22).
- 267–400 ms (f24–28): a lilac-white orb with white feather flakes forms at Latias's mouth.
- 400–633 ms (f28–35): the orb grows and turns with a white swirl ring and feather flakes (f30–34).
- 633–1100 ms (f35–49): the orb hovers high over the lane (top-centre), a lilac-white sphere with a white swirl ring, feathers round it.
- 1100–1367 ms (f49–57): the orb turns bright white with a lilac halo and swirling feathers (f51–57) and moves down toward Latios.
- 1367–1700 ms (f57–67): the orb is a large white-violet sphere with a violet glow (f63–67); white feather streaks cross (f65–67).
- 1800–1933 ms (f70–74): the orb drops onto Latios from its upper-left (f70), then turns yellow-white with yellow spikes (f72–74).
- 2000–2067 ms (f76–78): a yellow-white star bursts on Latios with orange-red sparks and white feathers flying (f76–78).
- 2133–2333 ms (f80–86): the star becomes a pale lilac-white mist cloud over Latios, with white feathers (f80–86).
- 2400–2933 ms (f88–104): the move-result text "Ce n'est pas très efficace" shows from f88; the mist settles over Latios with white flakes drifting (f88–104); Latias stands at left (f92–104).
- 2967–3567 ms (f105–123): the mist thins to a few flakes at Latios (f105–115) and clears (f117–123).
- 3567–4100 ms (f123–139): both Pokémon idle; a faint lilac sparkle at Latios fades.
Pokémon: head and wings rise (0–267 ms); builds the orb at its mouth (267–633 ms); holds the orb high (633–1100 ms); throws it (1800 ms); stays in place and idles after the throw. Cue for the card ghost: a brace while the orb builds, a glow on the attacker during the charge, a settle after the hit.
Camera & screen: none; the camera is fixed throughout. The violet glow at f63–67 is on the orb, not a screen tint; the mist (f80–104) is local to the defender. Board replacement: the violet glow becomes an aura on the attacker; the burst is a local impactFlash on the defender; there is no screen tint.
Palette: #E9D5FF (orb core, eyeballed), #A77BFF (lilac rim, eyeballed), #FFF3A3 (yellow-white burst, eyeballed), #FF8A4C (orange-red sparks, eyeballed), #F5C6F0 (pink-white mist, eyeballed). The sampled background patches (f41, f65, f72, f92) were not the effect and are not used.
Closest generic: energy-ball (Grass special 3, a thrown light orb along the lane, Appendix A). Must differ: the orb hovers high before it drops (EV), the impact is a yellow-white star then a pale lilac mist, not a green seed-orb.
Board mapping:
- 0: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5) · cloud(attacker, count 6, radius 0.3, drift 0.5, alpha 0.4) 0–400 · aura(attacker, hz 2, alpha 0.5) 0–500
- 300: projectile(attacker→defender, path 'arc', bow 0.5, r0 0.34, r1 0.5, tongues 6) — the orb rises and drops onto the defender, 300–1000 ms
- 1000: impactFlash(defender) · ring(defender, kind 'face', count 2, r0 0.3, r1 1.4)
- 1000–1800: cloud(defender, count 8, radius 0.4, drift 0.6, alpha 0.5) — the pale mist settles · spiral(defender, turns 1.5, r0 0.2, r1 0.9, rpm 90) — the swirling feathers
- attacker brace (glow 0.6), defender float (lift −0.15 h, tilt ±4°)
- contact at 1000; total 2200
New pieces: none
Flags: house-rule translations (violet glow → aura on the attacker; burst → local impactFlash on the defender; no tint); the hover-and-drop is compressed to the contact window; palette eyeballed (sampled background patches not used); Gen 7 not used.

### Mystical Power — Azelf / Mesprit / Uxie · psychic · special · power 70
Refs: video EV (5533 ms, 29.82 fps, effect frames 14–124) · gen7 none
Signature read: Mesprit's pink ribbons glow in a lilac-white aura as it floats forward, a cyan-white flash fills the frame, then pink-and-cyan rings close round the green defender before a pink-violet starburst bursts on it.
Video beats (t = 0 at frame 14; the wide shot before it, f0–13, has Mesprit's ribbons and a green defender at right with the move-name text box):
- pre-t0 (f0–13): wide shot; Mesprit (pink ribbons, pale body) at left-centre; a green winged defender at right; the move-name text box from f0.
- 0–402 ms (f14–26): close shot of Mesprit beside the trainer (left); its ribbons spread; a faint lilac wisp at its base (f18–26).
- 402–1073 ms (f26–46): a lilac-white psychic aura blooms round Mesprit (f26–40) with violet sparks (f38–40) and white sparkles; it floats forward and up (f42–46).
- 1073–1543 ms (f46–60): the aura brightens round Mesprit; it swings toward the defender (f48–52); the trainer steps back at left (f52–54).
- 1341–1476 ms (f54–58): a whole-frame cyan-white flash (the largest change, f52–56) with a white flare on the lane (f54–58).
- 1476–1744 ms (f58–66): the camera cuts to the defender (f58): concentric pink rings (about 0.5–1.1 h) turn round it (f60–66), with cyan swoosh streaks from the left (f62–66).
- 1744–2079 ms (f66–76): the rings thicken; pink-white star sparkles spin in them (f70–76); the defender's body is in the rings' centre.
- 2079–2280 ms (f76–82): the rings shrink to the defender and turn violet-pink (f78–82); a magenta-pink starburst begins at its centre (f80–82).
- 2347–2884 ms (f84–100): impact: a magenta-pink and white starburst with sparkle rays bursts on the defender (f84–92), a white core at f88–92, concentric white rings (f90–100), and a violet-blue haze (f96–100).
- 2951–3219 ms (f102–110): the core shrinks to a white star (f102–106); cyan and purple streaks cross the frame (f106–112).
- 3286–3823 ms (f112–128): a violet-purple haze over the lower half clears (f112–124); orange-red streaks cross the left (f126–128).
- 3823–4762 ms (f128–156): streaks fade; Mesprit hangs at the left and the defender stands at right; the move-name box closes (f150–156).
- 4829–5030 ms (f158–164): both Pokémon idle.
Pokémon: ribbons spread and glow (0–400 ms); floats forward with a lilac aura (400–1073 ms); swings toward the defender (1073–1533 ms); a whole-frame flash, then Mesprit is out of the frame for the rings (1533–2800 ms) and returns at the left (2800 ms onward). Cue for the card ghost: a float and rise on the aura, a glow on the flash, a settle at the end.
Camera & screen: a close-up cut at f14 (0 ms); a whole-frame cyan-white flash at f52–58 (1533 ms); a cut to the defender at f58 (1476 ms); a wider framing from f84 (2347 ms). Board replacement: the cut is dropped; the whole-frame flash becomes impactFlash on the defender (not full-screen); the rings stay local to the defender; the violet-blue haze is dropped.
Palette: #FF4FB8 (magenta ring, #7FE7FF (cyan swoosh, #B56CFF (violet haze, #FFFFFF (flash core), #9FE0FF (pale aura.
Closest generic: psychic (special 3, Appendix A pending, so there is no written comparison). Must differ: the rings close round the defender before the star, and there is no projectile; the attacker floats and glows rather than lunging.
Board mapping:
- 0: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5) · orbitCharge(attacker, count 4, half 'back', r0 0.16, r1 0.24)
- 400: shockRings(attacker, count 2, delay 0.3)
- 600: ring(defender, kind 'face', count 3, r0 0.5, r1 1.0) — the magenta rings close round the defender
- 1000: impactFlash(defender) · starFlare(defender, arms 'ring', width 0.46)
- 1000–1600: glyph(defender, r 0.9) · cloud(defender, count 8, radius 0.4, drift 0.4, alpha 0.4)
- attacker rise (glow 0.5), defender float (lift −0.15 h, tilt ±4°)
- contact at 1000; total 2200
New pieces: none
Flags: house-rule translations (the whole-frame cyan-white flash → impactFlash on the defender, not full-screen; the violet-blue haze dropped; the camera cuts dropped); the reference's contact (f84–92, ~2.8 s) is compressed to the 1.0 s window; uncertainty: the defender is a green winged Pokémon (species not confirmed); palette eyeballed except where sampled; no Gen 7 reference.

### Photon Geyser — Necrozma · psychic · special · power 100
Refs: video EV (5833 ms, 30 fps, effect frames 14–166) · gen7 USUL (not needed)
Signature read: a red-black sphere with a white core swells at Necrozma's chest, a lime-yellow orb grows and hits the defender (, a white-gold lion), then a cyan-green column erupts from the defender's floor with rock chunks flying.
Video beats (t = 0 at frame 14; the wide pre-move shot, f0–13, has Necrozma at left and the defender at right):
- pre-t0 (f0–13): wide shot; Necrozma (black, with white crest) at left-centre; the defender at right; the move-name text box from f12.
- 0–267 ms (f14–22): a close-up on the chest; a yellow-white flare (f14–16), then a red sphere with a white core and black-red cracks begins to form (f18–22).
- 267–1000 ms (f22–44): the red-black sphere (about 0.6 h) holds with black-red cracks and a white core (f22–36); it flares with pink-white spikes (f38–42); it turns black-red with a magenta rim (f40–50).
- 1000–1200 ms (f44–50): the sphere is large (about 0.9 h), red-black with a white core and spokes (f44–50).
- 1267 ms (f52): a huge cream-green sphere with a white core fills the frame for one frame.
- 1333–2333 ms (f54–84): a lime-yellow orb appears mid-lane at Necrozma's right (f54), grows to about 0.4 h with lime lightning jags (f56–82), and holds (f64–82).
- 2333–2400 ms (f84–86): impact: a white-green starburst with green spikes (f84), then a cyan-white burst at the defender's front (f86).
- 2467–2867 ms (f88–100): Necrozma's wings spread; the defender stands at centre; cyan and orange sparks burst (f90–100).
- 2933–3267 ms (f102–112): a cyan-white radial burst fills the frame round the defender; a cream-white ring spreads on the floor (f106–112).
- 3333–3733 ms (f114–126): a cyan-green column rises from the floor under the defender (f114–126) with dark rock chunks flying (f116–130); the text "Ce n'est pas très efficace" shows from f122.
- 3867–4333 ms (f130–144): the column thins to a white centre with cyan streaks (f132–138); yellow cubes fly (f144–152).
- 4400–5000 ms (f146–164): the column dissolves into yellow cubes and cyan streaks; the defender idles at centre (f150–162).
- 5067–5333 ms (f166–174): the wide view returns; Necrozma at left and the defender at right, both idle.
Pokémon: chest flares and the red sphere forms (14–1000 ms); the sphere holds and changes colour (1000–1800 ms); the lime orb is thrown at the defender (1800–2400 ms); wings spread after the throw (2600–3000 ms). Cue for the card ghost: a glow and brace on the charge, a snap-release of the orb to the defender, a knock and a float on the defender while the column rises.
Camera & screen: a close-up cut at f14 (0 ms); a pull-back at f88 (2467 ms); a wide reset at f164 (5000 ms); a whole-frame white-yellow flare at f14–16 (0–67 ms); a whole-frame whiteout at f52 (1267 ms); a whole-frame cyan-white burst at f102–112 (3067–3600 ms); a cream-white whole-frame whiteout at f146–158 (4800–5133 ms). Board replacement: the cut and the pull-back become card motion; the whole-frame flares and whiteouts become impactFlash on the defender; the burst is local to the defender; the floor ring is one ring on the defender.
Palette: #8B0D0D (charge sphere, #FFFFFF (white core), #E7FF57 (lime orb, #A5FF5A (green halo, #BFF6FF (cyan-white burst.
Closest generic: hydro-cannon (Water special 3, a column from the attacker across the lane, Appendix A). Must differ: the orb is built and thrown first; the column rises from the defender's floor, not across the lane; the column is cyan-green and carries rock chunks.
Board mapping:
- 0: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.56) — the red-black sphere at the chest, 0–500 ms
- 500: projectile(attacker→defender, path 'straight', r0 0.34, r1 0.5, tongues 6) — the lime orb flies down the lane, 500–1000 ms
- 1000: impactFlash(defender) · starFlare(defender, arms 'ring', width 0.46) · shards(defender, count 8, arc 360, distance 1.1)
- 1000–1400: ring(defender, kind 'floor', count 3, r0 0.3, r1 1.5) — the cream-white floor rings
- 1100: pillar(defender, from 'below', w 0.6, height 1.8) — the cyan-green column rises from the defender's floor, 1100–2000 ms
- 1000–2000: vignette(defender, maxAlpha 0.45) · mote particles ×8 at defender
- attacker brace (glow 0.6), defender knock 0.3 (tremble from 0.82 c)
- contact at 1000; total 2200
New pieces: none
Flags: house-rule translations (whole-frame flares, whiteouts and the cyan-white burst → impactFlash and local starFlare/pillar on the defender; camera cuts and pull-back dropped); the reference's contact (f84–86, ~2.4 s) is compressed to the 1.0 s window, as in prismatic-laser; palette override on the psychic material for the red-black charge, lime orb and cyan column (see Palette); uncertainty: the palette is eyeballed, not sampled; Gen 7 not used; the defender's name in the HP box is not legible at this resolution (read as Solgaleo in one frame, unverified).

### Prismatic Laser — Necrozma · psychic · special · power 160
Refs: video EV (4833 ms, 30 fps, effect frames 6–110) · gen7 USUL (not needed)
Signature read: Necrozma's prism body throws rainbow streaks, a white-hot orb builds and flares beside it, then the defender (, white) stands in a rainbow column (cyan, green, pink, yellow) that rises from its floor and bursts in sparks.
Video beats (t = 0 at frame 6):
- pre-t0 (f0–5): wide shot; Necrozma (dark, with a white prism crest) at left, the defender at right; the move-name text box at f0.
- 0–333 ms (f6–16): thin cyan, pink and yellow streaks shoot from Necrozma's prism body (f6–16), with soft bokeh discs drifting at right.
- 333–667 ms (f16–26): the streaks fan into a rainbow ring round the prism (f18–26); a white-blue flare starts at the right (f20–26).
- 667–1000 ms (f26–36): the prism arms swing forward (f26–34); a white-hot orb (about 0.5 h) forms at its front with cyan and pink rays (f28–36).
- 1033–1400 ms (f37–48): the orb becomes a bright white burst with radial white spokes and coloured streaks (f37–47), flashing wider (f43–47).
- 1433–1500 ms (f49–51): a white-pink flare dims and shrinks (f49–51).
- 1567 ms (f53): camera cut to the defender at centre (white-gold), with the prism at the left edge.
- 1633–1867 ms (f55–62): a thin rainbow column starts to rise from the defender's floor (f58–62), yellow at the top.
- 1900–2333 ms (f63–76): the column is full height: yellow, green, cyan and pink-violet bands (f63–76); white sparkles and cyan streaks along the floor.
- 2367–2700 ms (f77–87): the column thickens and sparkles (f77–87); the defender stands in it (f84–87).
- 2733–3133 ms (f88–100): the column brightens (f90–94) and a cyan-white burst with pink-violet spikes flashes at the defender's feet (f96–100).
- 3167–3467 ms (f101–110): cyan-white burst and white-yellow sparks fade (f102–110); "Ce n'est pas très efficace" shows from f98.
- 3500–4500 ms (f111–141): the defender stands in a faint light haze (f111–125); the prism-arm (Necrozma) returns to the left (f127–143).
- 4533–4600 ms (f142–144): wide shot; both Pokémon idle.
Pokémon: the prism flares and throws streaks (0–1067 ms); the orb builds at the front and flares (1067–1600 ms); the defender is struck by the column (1833–3333 ms); Necrozma's arms return to the left after the hit (3700 ms onward). Cue for the card ghost: a brace and glow on the charge, a snap release of the flare, a trembling defender under the column, a float on the impact.
Camera & screen: a cut to the defender at f53 (1567 ms); the whole-frame white-pink flare at f37–51 (1100–1633 ms); a whole-frame cyan-white burst (f102–110, 3300–3600 ms); the rainbow column is local to the defender; no whole-frame tint. Board replacement: the camera cut is dropped; the flare becomes impactFlash on the defender; the column is a local pillar on the defender; the radial burst becomes a local starFlare on the defender.
Palette: #FF5FA2 (pink streak, #FFD84A (yellow column, #4DFF9A (green column, #47E6FF (cyan column and sparks, #B98CFF (violet streak.
Closest generic: solar-beam (Grass special 3, Appendix A: a light column from above onto the defender). Must differ: the column is a five-hue prism that rises from the defender's floor, not a steady beam from above, and it is preceded by a white-hot orb built beside Necrozma.
Board mapping:
- 0: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5) · orbitCharge(attacker, count 5, half 'back', r0 0.16, r1 0.24) · glint particles (4-point star) at the attacker
- 350: shockRings(attacker, count 2, delay 0.3) — the rainbow ring round the prism
- 600: starFlare(attacker, arms 'ring', width 0.46) to 800 — the release flare
- 1000: impactFlash(defender) · starFlare(defender, arms 'ring', width 0.46) · shards(defender, count 8, arc 360, distance 1.1)
- 1000–1600: pillar(defender, from 'below', w 0.5, height 1.8) — the rainbow column rises from the defender's floor (hue cycle is a New piece)
- 1000–1600: vignette(defender, maxAlpha 0.45) · cloud(defender, count 6, drift 0.5, alpha 0.4) · mote particles ×10 at defender (rainbow)
- attacker rear-lurch (glow 1), defender knock 0.3 (tremble from 0.82 c)
- contact at 1000; total 2200
New pieces: prism hue cycle for pillar: the pillar's tongues take one of five hues each (pink, yellow, green, cyan, violet), cycling per tongue; a material option on psychic (the ribbon tongue with a per-tongue hue), needed for the column.
Flags: house-rule translations (whole-frame white-pink flare and the cyan-white burst → impactFlash and local starFlare on the defender; the camera cut dropped; no tint); the reference's contact (~2.4 s) is compressed to the 1.0 s window, so the column arrives early; palette override on the psychic material (five-hue column, not the psychic palette); uncertainty: the palette is partly eyeballed; Gen 7 not used; the defender's name in the HP box is not legible at this resolution (read as Solgaleo, unverified).

### Psyblade — Iron Leaves · psychic · physical · power 80
Refs: video EV (5000 ms, 30 fps, effect frames 38–124) · gen7 none
Signature read: Iron Leaves (green, with a crown of fins) lunges, a long magenta psychic blade streaks across the field into the defender, and the defender is engulfed in a violet-magenta burst with pink rings and white sparks.
Video beats (t = 0 at frame 38; the wide shot before it, f0–37, has Iron Leaves standing at left-centre, its fins up, and a small yellow Pokémon at right; the move-name text box at the bottom):
- pre-t0 (f0–37): Iron Leaves stands and charges (f0–36) with its fins glowing pink at their tips; the move-name text box at the bottom-left.
- 0–267 ms (f38–46): Iron Leaves turns side-on and lunges forward, its fins flared (f38–46, largest at f44–46).
- 300–467 ms (f47–52): the camera moves to a wide shot of the field; Iron Leaves is out of frame at left (f48–52); the defender (small yellow) is at right.
- 533–733 ms (f54–60): a magenta psychic blade (a long crescent with a bright white core) streaks in from the right (f54) and crosses the field (f56–60) toward the defender.
- 733–1000 ms (f60–68): the blade reaches the defender; a magenta-white burst grows at its position (f62–68).
- 1067–1667 ms (f70–88): the burst becomes a large violet-pink explosion with blue-violet inner cloud (f70–82); pink rings spread (f76–86); white sparks scatter (f82–88).
- 1733–2067 ms (f90–100): the explosion turns pink and purple with white streaks radiating (f90–96); a cyan ring (f98) and yellow-violet spikes (f100–104).
- 2133–2467 ms (f102–112): the defender is shaken; yellow and pink sparks burst (f104–112); magenta rings at its feet.
- 2533–2933 ms (f114–126): the explosion fades; pink and violet specks drift (f114–120); the defender stands in the grass (f122–126).
- 3000–3667 ms (f128–148): the defender stands alone in the field; the sky is clear.
Pokémon: Iron Leaves stands and charges (0–36 frames, before t0); lunges forward (0–267 ms); leaves the frame (300–467 ms); the blade is a separate effect (533–700 ms); the defender is struck and flinches (733–1000 ms). Cue for the card ghost: a dash in (lunge), a recoil after contact, the defender knocked and wobbled.
Camera & screen: a zoom on the attacker (f38–46); a cut to the wide shot of the field at f47 (300 ms); a violet-pink wash over the field (f64–86, 800–1600 ms); a rainbow edge smear at the frame edges (f64–74); a pink-blue flicker at the frame edges. Board replacement: the zoom and cut are dropped; the violet-pink wash becomes a local vignette around the defender; the edge smear and flicker are dropped.
Palette: #B31DB7 (blade magenta, #DB96FC (pale violet burst, #4E1288 (deep violet burst, #FFFFFF (white core), #3CE8FF (cyan ring edge.
Closest generic: vine-whip (Grass physical 1, Appendix A: a thin slash arc across the defender). Must differ: the signature is a wide magenta crescent blade that crosses the field, then a violet-pink explosion on the defender, not a green whip.
Board mapping:
- 0: dash (attacker wind-up 0–0.3c, dash 0.3c–1.0c) — the lunge toward the camera
- 500: slashArc(defender, sweep 120, radius 0.7, count 2, gapDeg 30, angle 45) — the magenta crescent crosses 500–1000 ms (psychic ribbon tongue, hot 0.8)
- 1000: impactFlash(defender) · shards(defender, count 8, arc 360, distance 1.1)
- 1000–2000: vignette(defender, maxAlpha 0.45) · cloud(defender, count 6, drift 0.5, alpha 0.4) · spiral(defender, turns 1, r0 0.2, r1 0.8, rpm 120) — the violet burst
- attacker dash (recoil 1.0c–1.5c), defender knock 0.4
- contact at 1000; total 2200
New pieces: none
Flags: house-rule translations (the whole-frame violet-pink wash → local vignette around the defender; the frame-edge rainbow smear and flicker dropped; camera cut and zoom dropped); physical move, so the card weight is the dash and knock 0.4; uncertainty: the defender is a small yellow Pokémon (species not confirmed); no Gen 7 reference.

### Psycho Boost — Deoxys / Lugia · psychic · special · power 140
Refs: video EV (5467 ms, 30 fps, effect frames 2–122) · gen7 USUL (not needed)
Signature read: a violet-white psychic orb, ringed with cyan and white arcs and purple haze, forms over Deoxys, is thrown across the lane into the defender, and bursts there in a white-violet starburst with cyan-white rings.
Video beats (t = 0 at frame 2; the wide pre-move shot, f0, has Deoxys (orange, blue tendrils) at left and the defender (red-yellow) at right):
- pre-t0 (f0–1): wide shot; Deoxys at left-centre, the defender at right; the move-name text box.
- 0–267 ms (f2–10): the close view; Deoxys stands with its blue tendrils moving; a faint pink-violet glow at the top (f6–10).
- 267–667 ms (f10–22): a violet-white psychic sphere forms over Deoxys (f12–22) with cyan-white ring arcs (f14–20) and a purple haze (f14–22).
- 667–1200 ms (f22–38): the orb is large (about 0.9 h), with a white core, cyan-white rings and purple rays (f24–38); a cyan arc at its left (f30–32).
- 1267–1533 ms (f40–48): the orb's rings turn; it is a magenta-violet sphere with a white core and rings (f41–47).
- 1567–1833 ms (f49–57): the orb turns pink-violet with a cyan core (f53–57) and shrinks; Deoxys leans (f49–57).
- 1900–2233 ms (f59–69): the pink-violet orb with green-blue arcs is held over Deoxys's arm (f59–69); green-cyan jags run from it (f63–69).
- 2300–2467 ms (f71–76): the orb flies across the lane toward the defender (f71–75; a pink-violet sphere with a cyan core and green jags).
- 2500–2667 ms (f77–82): contact: the sphere hits the defender (f77–81); a white-violet burst fills the frame round the defender (f82–90).
- 2733–3000 ms (f84–92): the burst is a white core with magenta rays (f84–88), then pink-cyan rings spread (f88–92).
- 3033–3633 ms (f93–111): pink-cyan ring waves (f93–104), a white flash (f106–108), and a pink-violet starburst (f110–111).
- 3667–4300 ms (f112–131): a blue-violet cloud round the defender fades (f114–122); the scene clears to daylight (f123–131).
- 4367–5367 ms (f133–163): the defender and Deoxys stand; both idle (f135–163).
Pokémon: Deoxys's arm gathers the orb overhead (0–1267 ms); it leans as the orb shrinks (1600–1933 ms); it throws (2400 ms); it stands with its tendrils moving after the hit (4433 ms onward). Cue for the card ghost: a rear-lurch on the charge, a glow on the attacker, a lunge on the throw, then a settle.
Camera & screen: the close view at f2 (0 ms); a pan toward the defender from f56 (1800 ms); a near-whole-frame violet-white burst at f82–90 (2733–3000 ms); whole-frame pink-cyan rings at f88–104 (2933–3467 ms); a white flash at f106–108 (3533–3600 ms); a blue-violet cloud over the lower half at f114–122 (3800–4000 ms). Board replacement: the cut and the pan are dropped; the near-whole-frame burst becomes impactFlash on the defender; the pink-cyan rings become a local ring on the defender; the white flash and the cloud are dropped.
Palette: #C23CFF (violet orb, #FFFFFF (white core), #FF4FD8 (magenta ring, #3CE8FF (cyan arcs, #2A0A4A (deep violet.
Closest generic: fire-blast (the model entry; a charge, a projectile and a starFlare on the defender). Must differ: the orb is violet-white with cyan rings and is thrown straight rather than arcing, and the burst is a white-violet star with rings, not a yellow flare with tongues.
Board mapping:
- 0: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.56) · orbitCharge(attacker, count 5, half 'back', r0 0.16, r1 0.24)
- 300: shockRings(attacker, count 2, delay 0.3)
- 500: projectile(attacker→defender, path 'straight', r0 0.34, r1 0.56, tongues 6) — the orb flies straight down the lane (500–1000 ms)
- 1000: impactFlash(defender) · starFlare(defender, arms 'ring', width 0.46) · ring(defender, kind 'face', count 2, r0 0.3, r1 1.4)
- 1000–1600: vignette(defender, maxAlpha 0.45) · glyph(defender, r 0.9) · mote particles ×10 at defender
- attacker rear-lurch (glow 1), defender float (lift −0.15 h, tilt ±4°)
- contact at 1000; total 2200
New pieces: none
Flags: house-rule translations (the near-whole-frame violet-white burst → impactFlash on the defender; the pink-cyan whole-frame rings → a local ring on the defender; the white flash and the blue-violet cloud dropped; camera cut and pan dropped); the reference's contact (~2.6 s) is compressed to the board's 1.0 s window, as in prismatic-laser; the defender is a red-yellow quadruped; palette partly sampled, partly eyeballed; Gen 7 not used; the defender's name in the HP box is not legible at this resolution (read as Entei, unverified).

### Psystrike — Mewtwo · psychic · special · power 100
Refs: video EV (6000 ms, 30 fps, effect frames 47–145) · gen7 USUL (not needed)
Signature read: Mewtwo's hands draw gold-pink-violet psychic rings into a cluster, the cluster is thrown across the field at Zapdos, and an orange-white flare bursts on the bird, which then hovers under a pink-spiked burst.
Video beats (t = 0 at frame 26; the wide shot before it, f0–25, has Mewtwo's long tail lashing from its right, Zapdos at top-right, and the move-name text box):
- pre-t0 (f0–25): wide shot; Mewtwo's tail stretches from the trainer at left across the frame (f0–12), then retracts (f14–24); Zapdos (yellow) hovers at top-right.
- 0–267 ms (f26–34): the cut to a moonlit cliff; Mewtwo stands at centre-left; a violet glow starts at its feet (f30–34).
- 333–867 ms (f36–52): Mewtwo's hands rise and turn toward the defender; the purple light at its feet spreads (f40–52).
- 867–1467 ms (f52–70): a gold-and-pink ring with white sparks forms at Mewtwo's hands (f55–59); a violet pad glows at its feet (f63–71); violet arcs jump from the pad (f63–71).
- 1500–1867 ms (f71–82): three rings (gold, pink, violet; about 0.6–0.8 h) spin round Mewtwo's hands (f71–82) with lightning arcs from the base (f73–79).
- 1900–2667 ms (f83–106): the three-ring cluster leaves Mewtwo's hands and flies toward Zapdos at right (f83–98); pink-violet bubble trails behind it (f90–100); the rings reach the defender's side (f100–106).
- 2667–3000 ms (f106–116): the rings hit the defender's side (f106–110); a pink-violet burst with gold sparks flashes (f110–112); the defender is wrapped in the spinning rings (f104–110).
- 3000–3333 ms (f116–126): an orange-white flare fills the left of the frame (f116–118); a yellow starburst spreads round Zapdos (f118–124); a pink-orange burst at its centre (f124–126).
- 3400–4100 ms (f128–149): pink-violet spikes rise from the ground in front of Zapdos (f128–145) with violet glow at its feet (f131–139).
- 4033–5033 ms (f147–177): Zapdos hovers and idles at top-right (f147–175); Mewtwo's tail reappears at the bottom-left (f177–179) as the wide shot returns.
Pokémon: the tail lashes before the cut (pre-t0, 0–24 frames); the hands rise and call the rings (333–1467 ms); the rings are thrown (2033–2667 ms); the flare and burst on Zapdos (3033–3667 ms); Zapdos hovers after the hit (3700 ms on). Cue for the card ghost: a float and glow on Mewtwo during the build, a push-forward lunge on release, the defender knocked and hovering after.
Camera & screen: a cut to the close-up at f26 (0 ms); a wider framing for the rings (f52–110); a close view of the impact (f112–126); a wide reset at f177 (5033 ms). A whole-frame orange-white flare at f116–118 (3033–3133 ms) is the only full-frame effect. Board replacement: the cuts are dropped; the orange-white flare becomes impactFlash on the defender; the ring cluster becomes three rings on the defender's side of the lane; the pink spikes from the ground are dropped.
Palette: #FFD84A (gold ring, eyeballed), #FF6FD0 (pink ring, eyeballed), #8A3CFF (violet ring and pad, eyeballed), #FFFFFF (flare core), #FF9A2A (orange spikes, eyeballed at f118).
Closest generic: psychic (special 3, Appendix A pending, so there is no written comparison); the nearest written shape is shockRings / glyph. Must differ: the rings are three solid gold-pink rings thrown as one cluster, not an orb, and the impact is a gold-orange starburst.
Board mapping:
- 0: glyph(attacker, r 0.9) · orbitCharge(attacker, count 3, half 'back', r0 0.2, r1 0.4)
- 500: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5) · ring(attacker, kind 'floor', count 1, r0 0.3, r1 0.8) under the attacker — the violet pad
- 900: shockRings(attacker, count 3, delay 0.2) — the gold-pink rings on the release
- 1000: projectile(attacker→defender, path 'arc', bow 0.5, r0 0.3, r1 0.5, tongues 4) — three rings thrown down the lane as one projectile
- 1000: impactFlash(defender) · starFlare(defender, arms 'ring', width 0.46) · ring(defender, kind 'face', count 3, r0 0.3, r1 1.4)
- 1000–1500: vignette(defender, maxAlpha 0.45) · mote particles ×8 at defender
- attacker lunge (wind 0–0.4c, strike 0.4c–1.0c, recoil 1.0c–1.5c), defender knock 0.3 (tremble from 0.82 c)
- contact at 1000; total 2200
New pieces: rings-in-a-cluster projectile: a projectile whose head is three rotating rings (gold, pink, violet) rather than a body; needed for the thrown rings (one material unit on psychic).
Flags: house-rule translations (the orange-white flare → impactFlash on the defender; the close-up cuts and the wide reset dropped; the pink spikes from the ground dropped); the reference's contact (~3.0 s) is compressed to the 1.0 s window, as in prismatic-laser and psycho-boost; the defender is Zapdos (legible on screen); palette eyeballed; Gen 7 not used.

### Fleur Cannon — Magearna · fairy · special · power 130
Refs: video EV (5400 ms, 30 fps, effect frames 20–161) · gen7 USUL (not needed)
Signature read: Magearna's pink-violet dome opens round a glowing pink sphere, a magenta beam fires straight across the field into the defender, and the defender is wrapped in pink petals and bursts with a critical-hit box.
Video beats (t = 0 at frame 20; the wide shot before it, f0–19, has Magearna (grey-white) at left and the defender at right with the move-name text box):
- pre-t0 (f0–19): wide shot; Magearna on its grey dome base at left; the defender at right; the move-name box at the bottom.
- 0–267 ms (f20–28): a close shot on Magearna; pink sparkle stars round its dome (f20–22); a pink-violet ring grows under it (f22–28).
- 267–533 ms (f28–36): a pink-violet sphere forms at the dome's centre (f30–36), with petal spokes fanning from it (f32–36).
- 533–933 ms (f36–48): the sphere is pink-white and bright (f40–48) with a magenta ring round it; violet rays fan out (f42–48).
- 1000–1600 ms (f50–68): the sphere stays bright (f50–68); pink-violet petals and sparkle stars cluster round the dome (f54–68).
- 1667–2100 ms (f70–83): the sphere grows and flares (f70–73); at f73 (1767 ms) a magenta beam fires from the dome straight right (f73–81) across the field to the defender.
- 2133–2667 ms (f84–100): the beam is steady (f84–92); pink-violet petals burst round the defender (f90–98).
- 2733–3267 ms (f102–118): contact: the beam hits the defender (f92–104); pink petals and sparkles wrap it (f104–116); a "Coup critique !" box shows from f96 (in the bottom-left).
- 3333–3700 ms (f120–131): a violet-blue and pink burst fills the frame round the defender (f123–131), with white sparks.
- 3767–4300 ms (f133–149): pink petal smoke round the defender (f133–139) fades (f141–147).
- 4300–4700 ms (f149–161): the defender stands with white crescent ribbons; both idle at f161.
Pokémon: Magearna's dome opens and its petals spread (0–533 ms); it holds the charge in place (533–1667 ms); it fires the beam from the centre (1767 ms); it holds through contact (2133–3300 ms). Cue for the card ghost: a brace with a rising glow on the charge, a petal-wrap glow on release, a settle after the hit.
Camera & screen: a zoom in (f11–18) and a close-up cut at f20 (0 ms); the close-up holds to f92; the beam shot widens on the defender from f92 (2400 ms); the violet-blue burst (f123–131, 3433–3767 ms) is a whole-frame flash. Board replacement: the zoom and cut are dropped; the violet-blue flash becomes a local impactFlash on the defender; the pink petals are local.
Palette: #FEBCFD (sphere centre, sampled at f55), #FDF3FF (beam core, sampled at f77), #FD9EFC (magenta halo, sampled at f60), #AE8FDA (lilac sparkle haze, sampled at f40), #7A3CFF (violet burst, eyeballed at f127).
Closest generic: moonblast (fairy special 3; the fairy row of Appendix A is pending). Must differ: a straight pink-white petal beam built in a dome and wrapped in petals on impact, not a thrown sphere; the attacker stays in place.
Board mapping:
- 0: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.56) · ring(attacker, kind 'floor', count 2, r0 0.3, r1 0.9) to 1000 — the pink pad under the dome
- 400: orbitCharge(attacker, count 4, half 'back', r0 0.16, r1 0.24) — the petals and sparkles round the dome
- 600: beam(defender, kind 'solid', w 0.5) — grows 600–850, holds to 1200, retracts 1200–1400
- 1000: impactFlash(defender) · starFlare(defender, arms 'ring', width 0.46) · ring(defender, kind 'face', count 2, r0 0.3, r1 1.4)
- 1000–1600: vignette(defender, maxAlpha 0.45) · glyph(defender, r 0.9) · star particles ×12 at defender (fairy material particle)
- attacker brace (glow 0.8), defender knock 0.3 (tremble from 0.82 c)
- contact at 1000; total 2200
New pieces: none
Flags: house-rule translations (the violet-blue whole-frame flash → a local impactFlash on the defender; the zoom and cut dropped; the pink petals kept local); the reference's beam and contact are compressed to fit the window; the defender's species is not confirmed; palette sampled from EV (pink-white) with eyeballed magenta and violet; Gen 7 not used; the defender's name in the HP box is not legible at this resolution (read as Suicune, unverified).

### Nature’s Madness — Tapu Bulu / Tapu Fini / Tapu Koko / Tapu Lele · fairy · special · power —
Refs: video EB (6500 ms, 30 fps, effect frames 0–193) · no EV video (manifest modern tag is EB) · gen7 USUL (not needed)
Signature read: a yellow-and-orange Tapu-type Pokémon dives and strikes the defender with a yellow lightning bolt, the defender stands on a pink-violet disc, and it is sealed in a cyan-and-pink dome that bursts in a white starburst.
Video beats (t = 0 at frame 0; the attacker (yellow, orange crest) at left-centre, the defender (a small pale-brown bunny-like Pokémon) at right):
- 0–133 ms (f0–4): thin green lightning arcs at the top-right (f0–4), then a bright green flash at the top (f2–4).
- 133–467 ms (f4–14): the attacker is still; the arcs fade (f6–14).
- 533–1100 ms (f16–33): the move-name box is up (from f16); faint sparks at the defender's feet (f30–34).
- 1100–1500 ms (f33–45): a yellow-white sparkle flashes at the defender's feet (f36–38) and a white-green glint at the attacker's side (f40–46).
- 1533–2067 ms (f46–62): the attacker rises and tilts over the defender (f49–62); green-yellow wisps trail from its tail.
- 2100–2300 ms (f63–69): the strike: the attacker dives at the defender; a yellow lightning bolt runs from the top-right (f67–69) to the defender's head.
- 2333–2633 ms (f70–79): the attacker's wings are flared and it lands on the defender's left (f71–76); a pink-violet disc appears under it (f75–79).
- 2667–3167 ms (f80–95): the attacker stands on a pink-violet circular pad with cyan-white sparkles round it (f81–85); the pad turns pink-white (f87–95).
- 3200–3767 ms (f96–113): the attacker leaves the frame; the defender stands at centre with cyan-blue sparkles round it (f98–113).
- 3833–5233 ms (f115–157): the defender is sealed in a translucent cyan dome with concentric pink rings and white sparkles (f116–146), the dome fades (f147–157).
- 5300–5667 ms (f159–170): the defender is in a faint dome with pink rings; a white starburst with radial white spikes at f165–168, then a pink-blue explosion with violet rays at f167–170.
- 5700–6167 ms (f171–185): the burst fades; the defender stands again (f177–187); the attacker returns at the left (f189–193).
Pokémon: a green-arc lightning at the top (0–133 ms); it rises and tilts over the defender (1500–2067 ms); it dives and strikes (2100–2300 ms); it lands and hovers on its pad (2333–3167 ms); it leaves the frame while the dome holds (3200–5233 ms); it returns at the left after the burst (5700 ms onward). Cue for the card ghost: a rise and hover on the charge, a swoop down on the strike, a settle after contact.
Camera & screen: a steady wide shot with a slight pan to the defender (f98–157); a whole-screen white starburst at 5500–5700 ms (f165–171) and a pink whole-frame tint at 2933–3167 ms (f88–95); the dome is cyan-and-pink and local to the defender. Board replacement: the late whole-screen burst is dropped (it is past the contact window); the tint becomes a local vignette; the dome becomes a new local dome piece (see New pieces).
Palette: #ACF9FC (dome cyan, #FFFFFF (dome and burst core, #FFA5C0 (burst pink, #D887CC (pad violet-pink, #FF8B5B (orange-pink.
Closest generic: moonblast (fairy special 3; the fairy row of Appendix A is pending). Must differ: a yellow lightning bolt from above (the strike), a dome that seals the defender, and no thrown projectile; the attacker dives rather than shooting.
Board mapping:
- 0: aura(attacker, hz 2, alpha 0.5) to 400 — the green arcs at the top
- 300: rise(attacker: lift 0 → 0.6 c, hover → 1.2 c, land → 1.6 c) — the attacker rises then swoops
- 500: bolt(defender, from 'sky', segments 9, jag 0.12, branches 2, rerollMs 45) — the lightning bolt from above, 500–1000 ms (the fairy material's gold accent)
- 1000: impactFlash(defender) · starFlare(defender, arms 'ring', width 0.46) · ring(defender, kind 'face', count 2, r0 0.3, r1 1.4)
- 1000–2000: glyph(defender, r 0.9) · vignette(defender, maxAlpha 0.45) · mote particles ×10 at defender
- attacker rise (hover), defender knock 0.3 (tremble from 0.82 c; struck from above)
- contact at 1000; total 2200
New pieces: dome: a translucent sphere outline round a card (radius 0.9 h, cyan body alpha 0.35, pink rim alpha 0.6, rings expanding inside); a body-scale ring with a fill, on the fairy material; needed for the sealed-in defender.
Flags: house-rule translations (the whole-screen white burst at f165–171 → dropped as past the contact window; its punch is the impactFlash at contact; the pink whole-frame tint → local vignette; the dome stays local to the defender); no EV video, so the EB reference is primary (manifest modern tag); the reference strike (f67, ~2.2 s) is compressed to 1.0 s, as in prismatic-laser; palette override on the fairy material (cyan dome and yellow bolt); uncertainty: the attacker is a yellow-and-orange Tapu-type Pokémon (species not confirmed by this video); the defender species is not read; Gen 7 not used.

### Springtide Storm — Enamorus · fairy · special · power 100
Refs: video EV (5000 ms, 30 fps, effect frames 28–112) · gen7 none
Signature read: Enamorus, riding a white cloud, raises a large pink heart shield over the lane, a pink-white tornado spins round the defender, and a yellow-green star burst lands on it, then the wind breaks up.
Video beats (t = 0 at frame 28; the wide pre-move shot, f0–13, has Enamorus on its cloud at left with a pink tail, the defender (a small pink fairy) at right; the move-name box from f0):
- pre-t0 (f0–13): wide shot; Enamorus on its white cloud at left, a pink tail stretched over the field; the defender at right.
- 0–200 ms (f28–34): a cut to a close view of Enamorus on its cloud (f14); pink flecks gather at its hands (f26–33).
- 200–600 ms (f34–46): pink-white wind wisps sweep across the lane toward the defender (f34–40), curling round it (f38–46).
- 667–800 ms (f48–52): a magenta heart outline appears over Enamorus's head and grows (f48–52); the heart shield forms in front of it.
- 800–1533 ms (f52–74): a large translucent pink heart shield (about 0.8 h) stands in front of Enamorus (f50–66) with magenta edges and yellow sparks inside; a pink-white tornado grows round the defender (f54–74).
- 1600–2467 ms (f76–102): the tornado spins round the defender as a pink-white funnel (about 1.1 h tall) with white streaks (f76–98); the heart turns solid magenta with white streaks (f76–82).
- 2533–2600 ms (f104–106): contact in the reference: a yellow-green star-burst with a yellow streak across the lane hits the defender (f104–106).
- 2667–2800 ms (f108–112): a pink-white burst cloud spreads round the defender (f108–112); the tornado breaks up (f110–116).
- 2867–3267 ms (f114–126): pink ribbons trail off Enamorus (f114–120); the wind wisps fade (f116–122).
- 3267–4000 ms (f126–148): Enamorus returns to its cloud at the left (f120–148); the defender stands at right; both idle.
Pokémon: flecks gather at its hands (28–200 ms); the heart shield forms over the lane (667–1533 ms); it holds the heart while the tornado turns (1600–2467 ms); the ribbons trail off after contact (2867–3267 ms); it is back on its cloud from f120. Cue for the card ghost: a rise (hover) on the shield, a glow on the attacker during the heart, a settle after the burst.
Camera & screen: a close-view cut at f14 (before t0, not a camera move); no screen tint, flash or shake in the reference; the pink-white burst at f108–112 is local to the defender. Board replacement: none needed; the burst is already local.
Palette: #FBBEAF (heart and wind pink, sampled at f62), #FF2DAA (magenta heart edge, eyeballed), #FFF1F6 (tornado white-pink, eyeballed), #E8FF5A (yellow-green burst, eyeballed at f104–106), #FFD84A (yellow sparks, eyeballed).
Closest generic: moonblast (fairy special 3; the fairy row of Appendix A is pending); the nearest written shape is spiral (a whirlpool or Twister drawer). Must differ: a heart shield over the lane, and the tornado wraps the defender, not a column or a projectile.
Board mapping:
- 0: rise(attacker: lift 0 → 0.6 c, hover → 1.2 c) — Enamorus lifts onto its shield
- 0–400: orbitCharge(attacker, count 3, half 'back', r0 0.16, r1 0.24) — the wisps round the hands
- 200: spiral(defender, turns 2.5, r0 0.2, r1 1.1, rpm 90) — the tornado round the defender, 200–1000 ms
- 500: aura(attacker, hz 2, alpha 0.6) to 1000 — the heart shield (new piece: heart shape)
- 1000: impactFlash(defender) · starFlare(defender, arms 'ring', width 0.46) · ring(defender, kind 'face', count 2, r0 0.3, r1 1.4)
- 1000–1600: cloud(defender, count 6, radius 0.35, drift 0.5, alpha 0.5) — the pink-white burst cloud · mote particles ×8 at defender (fairy material, pink)
- attacker rise (hover), defender knock 0.3 (tremble from 0.82 c; the wind pushes it)
- contact at 1000; total 2200
New pieces: heart shield: a heart-shaped translucent body on the fairy material (a heart outline, pink fill alpha 0.5, magenta rim, sparks inside); the aura drawer draws a round glow, so a heart needs its own shape. Needed for the attacker's shield.
Flags: house-rule translations (none needed; the reference has no screen tint or flash); the reference's contact (f104, ~2.6 s) is compressed to the 1.0 s window, as in prismatic-laser; palette override on the fairy material (heart magenta, yellow-green burst); the defender is a small pink fairy (species not confirmed); no Gen 7 reference; the palette is partly eyeballed.

### Collision Course — Koraidon · fighting · physical · power 100
Refs: video EV (7666 ms, 29.35 fps, effect frames 10–223) · gen7 none
Signature read: Koraidon's white-and-violet crest loops, it leaps and smashes toward the camera, then a gold-orange flame ring spins and rolls down the lane and explodes on the defender in a gold-white burst with fire pillars and rock fragments.
Video beats (t = 0 at frame 10; the move-name box from f6; the attacker (orange-red, white crest) at left-centre, the defender (small, a rock pillar with a blue head) at right):
- 0–409 ms (f10–22): the crest (white-violet fins) loops round Koraidon's head (f10–20); its body is in a wide shot at left-centre.
- 409–818 ms (f22–34): the camera cuts to a side view (f18); Koraidon leaves and comes back into a close view with its crest unfurled (f22–34).
- 886–1431 ms (f36–52): Koraidon stands tall with wings open and crest flared (f36–52); ember flecks drift.
- 1499–1806 ms (f54–63): Koraidon crouches and leaps toward the camera with wings wide (f54–63).
- 1874–2351 ms (f65–79): Koraidon's leap carries it into the air with its wings sweeping (f67–79); a yellow-white flare at its feet (f67–71).
- 2419–2555 ms (f81–85): wings flare; Koraidon lands (f81–85) with a white and magenta arc round it.
- 2624–3203 ms (f87–104): a gold-orange flame ring (about 1.0 h tall) forms at the defender's side (f87–91), spins and grows (f93–101), and rolls down the lane toward the defender (f101–104).
- 3237–3441 ms (f105–111): the flame ring reaches the defender (f105–109) and bursts (f111): gold-white sparks and fire explode over the defender.
- 3509–3952 ms (f113–126): a gold-white explosion with fire columns and dark rock chunks (f114–124); the defender is engulfed.
- 3986–4361 ms (f127–138): dark rock chunks and fire pillars rise (f126–136); a white glow spreads (f134–138).
- 4395–5043 ms (f139–158): a whole-frame white-out (f139–158); gold sparks drift through it (f146–152).
- 5077–5383 ms (f159–168): the white-out clears to a gold-white flare round the defender (f160–168); a pink and gold pattern covers the frame (f162–168).
- 5417–6235 ms (f169–193): fire pillars of gold and white rise round the defender (f171–193) with rock chunks; "Ce n'est pas très efficace" shows from f170.
- 6303–7257 ms (f195–223): the fire dies down (f195–205); Koraidon returns to idle at lower-left (f207–223); the defender stands at right.
Pokémon: the crest loops (0–400 ms); it stands with wings open (867–1500 ms); it leaps at the camera (1533–2633 ms); it lands with its crest flared (2700–2867 ms); the flame ring is its release (2900–3800 ms); it idles at lower-left after the fight (6700 ms on). Cue for the card ghost: a dash in (rear-lurch) and a leap, a glow on the flame charge, a recoil after the hit.
Camera & screen: a cut to a side view at f18 (~270 ms); a close framing of the leap (f36–79); a whole-frame white-out at f139–158 (5033–5467 ms); the gold-white burst (f111–124) and the pink-gold pattern (f162–168) are whole-frame flashes; a dim at f195–205. Board replacement: the cuts are dropped; the white-out and the pink-gold pattern are dropped (the board's impactFlash is local to the defender); the gold-white burst becomes impactFlash and speedRays on the defender; the dim is dropped.
Palette: #F4C93E (flame ring gold, #FFC85E (warm yellow, #FFFFBE (white-gold core, #FF7A1A (orange embers, #D85EFF (crest violet edge.
Closest generic: close-combat (fighting physical 3; the fighting row of Appendix A is pending). Must differ: a gold-orange flame ring rolls down the lane before the burst, and Koraidon's crest and leap are the signature, not a punch.
Board mapping:
- 0: attacker dash (wind 0–0.3c, dash 0.3c–1.0c) — the leap at the camera
- 300: orbitCharge(attacker, count 3, half 'back', r0 0.16, r1 0.24) — the crest loops
- 500: projectile(attacker→defender, path 'straight', r0 0.6, r1 0.9, tongues 0) — the flame ring disc rolls down the lane (new piece: flame ring body)
- 1000: impactFlash(defender) · shards(defender, count 8, arc 360, distance 1.1) · ring(defender, kind 'face', count 2, r0 0.3, r1 1.4)
- 1000–1600: speedRays(defender, count 12) · vignette(defender, maxAlpha 0.45)
- attacker dash (recoil 1.0c–1.5c), defender knock 0.45 (heavy physical; tremble from 0.82 c)
- contact at 1000; total 2200
New pieces: flame ring body: a gold-orange ring disc on the fighting material's body with a ring of short flame tongues round its rim, rolling straight along the lane (the fighting palette overridden to gold-orange); needed for the release.
Flags: house-rule translations (the whole-frame white-out at f139–158 and the pink-gold whole-frame pattern at f162–168 → dropped; the local impactFlash and speedRays remain; the dim at f195–205 dropped; the cuts dropped); the reference contact (f107, ~3.2 s) is compressed to the 1.0 s window (the leap and smash are compressed into the first 0.5 s); palette override on the fighting material (gold-orange flame instead of the fighting palette); the defender is a small rock-and-blue pillar figure (species not confirmed); no Gen 7 reference.

### Sacred Sword — Cobalion / Terrakion / Virizion / Keldeo · fighting · physical · power 90
Refs: video EV (3500 ms, 30 fps, effect frames 12–69) · gen7 USUL (not needed)
Signature read: Virizion (green, red blade crests) lunges, a cyan blade streak and then magenta and cyan blade streaks cross the dark violet defender, and a yellow-orange star burst knocks it back.
Video beats (t = 0 at frame 12; the wide shot before it, f0–11, has Virizion at left-centre and the dark violet defender at top-right):
- 0–267 ms (f12–20): Virizion's red crests lift and flare (f12–16); the defender hovers at top-right with its wings spread (f0–20).
- 300–700 ms (f21–33): the defender sweeps its wings toward the lane (f21–29); Virizion steps forward (f21–26).
- 733–1000 ms (f34–42): Virizion lunges with its blades forward (f34–44); the blade crests flare red (f36–42).
- 1033–1433 ms (f43–55): Virizion dashes past (f43–51); the defender drifts over the lane (f44–55).
- 1433–1600 ms (f55–60): a cyan blade streak runs across the defender from the left (f59–60).
- 1633–1700 ms (f61–63): a magenta-and-cyan blade streak crosses the defender diagonally (f61–63), and a pale yellow flash appears at its centre (f62–63).
- 1733–1800 ms (f64–66): a yellow-orange star burst with sharp orange rays bursts on the defender (f64–66).
- 1833–2133 ms (f67–76): the defender is knocked back and tumbles (f67–76); a faint white-cyan ring round it (f68–72).
- 2167–2533 ms (f77–88): the defender drifts back up to top-right (f77–88), its wings folded.
- 2567–3067 ms (f89–104): the defender hovers at top-right with wings spread (f89–93); Virizion walks back to its start at lower-left (f94–104).
Pokémon: crests lift and flare (0–267 ms); lunges with blades forward (733–1000 ms); dashes past (1033–1433 ms); the defender is struck (1467–2200 ms) and knocked back (2233–2533 ms); Virizion returns to its start (3000–3500 ms). Cue for the card ghost: a dash in (lunge), a slash across the defender, a knock with squash and wobble.
Camera & screen: a steady wide shot throughout; no whole-frame flash, tint or shake in the reference; the blade streaks and the star burst are local to the defender.
Palette: #3B4451 (dark violet defender, #FFF5FF (flash white-pink, #8FD7B5 (pale green flash, #3CE8FF (cyan blade streak, #FF4FD8 (magenta blade streak.
Closest generic: close-combat (fighting physical 3; the fighting row of Appendix A is pending); the nearest written shape is slashArc. Must differ: crossed blades of light (cyan and magenta streaks) with a yellow-orange star burst, not a punch; the attacker is a leaping dash, not a rear-lurch.
Board mapping:
- 0: dash (wind 0–0.3c, dash 0.3c–1.0c) — Virizion lunges across the lane
- 300: slashArc(defender, sweep 120, radius 0.7, count 2, gapDeg 30, angle 45) — the cyan blade streak crosses the defender, 300–800 ms
- 600: slashArc(defender, sweep 120, radius 0.7, count 2, gapDeg 30, angle -45) — the magenta crossed streak, 600–1000 ms
- 500: shards(attacker, count 6, arc 90, distance 0.8) — the crest flecks
- 1000: impactFlash(defender) · starFlare(defender, arms 'ring', width 0.46) · shards(defender, count 8, arc 360, distance 1.1)
- 1000–1600: vignette(defender, maxAlpha 0.45) · speedRays(defender, count 12) — the star rays, local
- attacker dash (recoil 1.0c–1.5c), defender knock 0.45 (tremble from 0.82 c; heavy physical)
- contact at 1000; total 2200
New pieces: none
Flags: house-rule translations (none whole-frame: the star is local); the reference's contact (f64–66, ~1.8 s) is compressed to the 1.0 s window; uncertainty: the defender is dark violet and its species is not confirmed in this video; the palette is sampled for the defender and the flash, eyeballed for the streaks; Gen 7 not used.

### Secret Sword — Keldeo · fighting · special · power 85
Refs: video EV (4133 ms, 30 fps, effect frames 26–92) · gen7 USUL (not needed)
Signature read: Keldeo sparks a white-gold burst with a rainbow ring at its chest, a white flare fills the snowy field, and a yellow-white starburst with orange streaks hits the grey-white defender, which then stands in the snow.
Video beats (t = 0 at frame 26; the wide shot before it, f0–25, has Keldeo (orange-red, blue-and-yellow legs) at left-centre with the trainer behind; the move-name box from f0):
- pre-t0 (f0–25): snowy field; Keldeo stands on its own; the defender (a grey-white quadruped) at right; the move-name box at the bottom-left.
- 0–333 ms (f26–36): a white-gold sparkle at Keldeo's chest grows (f26–30) with a rainbow ring round it (f28–36, about 0.8 h); the trainer is in the glow.
- 367–800 ms (f37–50): a white horizontal flare crosses the field (f31–45), then a whole-frame whiteout spreads (f43–50).
- 833–1000 ms (f51–56): the whiteout clears; the defender is greyed-out and faint at right (f53–55).
- 1033–1200 ms (f57–62): a yellow-white starburst with orange streaks hits the defender (f57–61), with a magenta-white flare behind it (f59–61).
- 1200–1400 ms (f62–68): a white-blue burst with sparkles covers the defender (f62–68); the defender's HP bar drains (f62–68).
- 1433–1833 ms (f69–81): sparkles drift off the defender (f70–81); "Ce n'est pas très efficace" shows from f74.
- 1867–2200 ms (f82–92): the defender stands in the snow, sparkles fading (f82–92).
- 2233–3233 ms (f93–123): Keldeo and the defender face each other across the snow; both idle (f97–123).
Pokémon: a white-gold sparkle forms at the chest (0–333 ms); it holds the flare and the rainbow ring (367–800 ms); Keldeo is out of the frame during the whiteout (800–1000 ms); the burst lands on the defender (1033 ms); both idle after (3100 ms on). Cue for the card ghost: a rear-lurch on the charge, a glow on the attacker, a snap-forward on the release.
Camera & screen: a steady wide shot; the whole-frame whiteout at f43–50 (433–800 ms) and a whole-frame greyed tint at f53–55 are the full-frame effects. Board replacement: the whiteout and the grey tint are dropped (house rules: no whole-screen white bloom); the flare becomes impactFlash on the defender; the rainbow ring is one ring on the attacker.
Palette: #FFFFFF (white-gold core, #FFD84A (yellow-white starburst, #FF8A2A (orange streaks, #5ADCFF (rainbow ring cyan, #FF4FD8 (rainbow ring magenta.
Closest generic: aura-sphere (fighting special 2; the fighting row of Appendix A is pending). Must differ: a rainbow ring and a white flare that cross the field from the attacker, with a yellow-white star on the defender, not a blue-white sphere.
Board mapping:
- 0: aura(attacker, hz 2, alpha 0.6) to 400 — the rainbow ring round Keldeo (ring drawer used as a rainbow fringe)
- 200: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5) — the white-gold sparkle at the chest, 200–700 ms
- 700: projectile(attacker→defender, path 'straight', r0 0.3, r1 0.5, tongues 4) — the white flare crosses the lane, 700–900 ms
- 1000: impactFlash(defender) · starFlare(defender, arms 'cross', width 0.46) · shards(defender, count 8, arc 360, distance 1.1)
- 1000–1500: vignette(defender, maxAlpha 0.45) · speedRays(defender, count 10) — the streaks round the defender
- attacker brace (glow 0.6), defender knock 0.3 (tremble from 0.82 c)
- contact at 1000; total 2200
New pieces: none
Flags: house-rule translations (whole-frame white flare, whiteout and grey tint → dropped; impactFlash on the defender is the local punch); the reference contact (~1.3 s) sits inside the window; palette eyeballed; the defender is a grey-white quadruped (species not confirmed); Gen 7 not used.

### Thunderous Kick — Zapdos (Galar) · fighting · physical · power 90
Refs: video EV (6533 ms, 29.85 fps, effect frames 26–193) · gen7 none
Signature read: a crouched Galarian Zapdos (orange-red, black-and-orange crest) leaps and charges at the camera, its kick becomes a yellow blast of flame that rolls over the field, then bursts into a yellow flame column with white dust at the defender's base.
Video beats (t = 0 at frame 26; the wide shot before it, f0–25, has Zapdos crouched at centre-left on sand, the defender off-frame):
- 0–268 ms (f26–34): Zapdos is still crouched with its crest raised (f26–32); the move-name box is up from f14.
- 268–737 ms (f34–48): the camera cuts to a close view; Zapdos's leg extends toward the camera (f34–48) with its black-and-orange crest flared; a red-pink flame haze at its flank (f42–48).
- 737–1206 ms (f48–62): Zapdos's kick passes the lens (f48–56); a red-pink flame wash fills the upper frame (f49–57); dust kicked up at the lower-right (f53–59).
- 1240–1642 ms (f63–75): Zapdos is in a wide view (f63–69), its wing flaring; a red-orange light haze spreads (f63–67); a yellow streak runs across the field at f73–75.
- 1709–1910 ms (f77–83): a yellow kick-blast fills the frame from the right (f77–81), with a sharp yellow-white flare at the edge (f77); a shock-ring at f79 (a yellow arc, about 1 h wide).
- 1910–2245 ms (f83–93): the yellow blast is a solid yellow-orange flame wave covering the defender's side (f85–89); it draws in and shrinks (f89–93).
- 2245–2915 ms (f93–113): a yellow-orange flame column rises at the defender's position (f93–104) with white dust clouds spreading along the floor (f104–113); the column is at its tallest (f102–108).
- 3015–3518 ms (f116–131): the yellow flame column thins (f116–126); a pink-orange spiral of flame sweeps over the field at f132–138.
- 3618–4020 ms (f134–146): a whiteout flash with a sharp white flare covers the frame (f138–146).
- 4054–4590 ms (f147–163): the dust clears; the defender is out of the frame; Zapdos stands at left-centre (f167).
- 4724–5595 ms (f167–193): Zapdos idles at left-centre (f167–185); the "Le Tauros sauvage est K.O. !" line shows at f191–193.
Pokémon: crouches (0–267 ms); extends its leg toward the lens (267–700 ms); the kick passes and lands (733–1233 ms); the yellow blast is the kick's effect (1867–2867 ms); it stands with its crest after the flame column (5233 ms on). Cue for the card ghost: a dash (lunge) in with the kick, a squash-and-recoil at contact, a knock with a stagger on the defender.
Camera & screen: a close-view cut at f34 (~270 ms); a red-pink whole-frame flame wash at f42–67 (~530–1300 ms); a yellow whole-frame blast at f77–93 (~1700–2300 ms); a whiteout flash at f138–146 (~3800–4100 ms). Board replacement: the cut becomes card motion; the red-pink wash becomes a local vignette round the attacker's kick path; the yellow blast becomes impactFlash and a local starFlare on the defender; the whiteout is dropped.
Palette: #FF2A1A (red kick flame, eyeballed at f49–57), #FFF176 (yellow shock core, eyeballed at f77–81), #FFD84A (yellow-orange flame column, eyeballed at f98–108), #FFFFFF (white dust and flare, eyeballed at f138–146), #716B72 (grey dust, sampled at f50).
Closest generic: close-combat (fighting physical 3; the fighting row of Appendix A is pending) with bolt (electric). Must differ: a red-orange flame kick whose impact is a yellow blast of flame rather than a plain punch, and the attacker's leg is the signature shape.
Board mapping:
- 0: dash (wind 0–0.3c, dash 0.3c–1.0c) — the kick, 0–1000 ms (crouch and rise in the first 270 ms)
- 500: aura(attacker, hz 2, alpha 0.6) to 1000 — the red kick flame at the leg
- 1000: impactFlash(defender) · starFlare(defender, arms 'ring', width 0.46) · shards(defender, count 8, arc 360, distance 1.1)
- 1000: bolt(defender, from 'attacker', segments 9, jag 0.12, branches 2, rerollMs 45) — the yellow shock streak across the lane (the fighting material with a yellow palette)
- 1000–1600: speedRays(defender, count 12) · vignette(defender, maxAlpha 0.45) — the yellow blast round the defender
- attacker dash (recoil 1.0c–1.5c), defender knock 0.45 (heavy physical; tremble from 0.82 c)
- contact at 1000; total 2200
New pieces: none (the bolt drawer already exists; its fighting-material use is a palette choice)
Flags: house-rule translations (the red-pink whole-frame wash → local vignette on the kick path; the yellow whole-frame blast → local impactFlash and starFlare; the whiteout at f138–146 dropped; the cuts become card motion); the reference's kick (~2.0 s) is compressed to the 1.0 s window; palette override on the fighting material (red kick flame and yellow shock, not the fighting palette); the defender is a tan-brown Pokémon (species not confirmed; "Tauros" in the knock-out line); no Gen 7 reference.

### Malignant Chain — Pecharunt · poison · special · power 100
Refs: video EV (6033 ms, 30 fps, effect frames 58–180) · gen7 none
Signature read: Pecharunt's three magenta blob-bodies send a magenta ring-chain whipping across the lane, the chain winds the defender into a tall magenta-violet cage of rings, and a magenta burst flashes inside the cage before it fades to pink.
Video beats (t = 0 at frame 58; the wide shot before it, f0–57, has Pecharunt's three magenta blob-bodies at left-centre on sand and a golden-white Pokémon at right; the move-select panel is up from f0 to f40):
- pre-t0 (f0–57): wide shot; the three magenta blob-bodies stand at left (the move-select panel shows the four move names until f40); the move-name box from f42; a tall rock formation behind.
- 0–400 ms (f58–70): the camera cuts to a close view of the magenta bodies and the golden-white defender at right; a thin magenta chain link appears at the front body (f58–66).
- 400–733 ms (f70–80): the chain extends from the bodies toward the defender (f70–78), a magenta ring-chain whipping across the lane, its tip curling up at f76–80.
- 800–1067 ms (f82–90): the chain is a long magenta ring-chain that reaches the defender (f82–84), then a magenta burst covers the lane (f84–90) with ragged magenta shards.
- 1133–1867 ms (f92–114): the chain winds round the defender in magenta rings (f92–104); violet rings spread out round the defender (f96–104); a dark magenta cage of rings forms round it (f106–114).
- 1933–2467 ms (f116–132): the rings tighten round the defender into a tall cage (f116–126); pink-violet orbit rings spin round it (f118–126); the cage reaches its full height (f126–132).
- 2533–3067 ms (f134–150): a magenta burst flashes inside the cage (f138–148), with a yellow streak at f140 and magenta shards out to the sides (f142–148).
- 3067–3600 ms (f150–166): the cage shrinks and turns pink (f150–160), with small magenta sparks; the defender stands in pink haze (f160–166).
- 3667–4067 ms (f168–180): Pecharunt and the defender are back at the left side of the frame; the cage is gone; both idle (f170–180).
Pokémon: the three bodies send the chain (58–800 ms); they hold the cluster through the wrap (1200–2467 ms); the bodies stand at left after the burst (4233 ms on). Cue for the card ghost: a glow on the attacker during the chain, a thrust on release, a wobble on the defender as it is wrapped.
Camera & screen: a close cut at f58 (0 ms); a wide view for the chain (f70–90); a close view for the cage (f106–160); no whole-screen flash or tint. The magenta burst at f84–90 covers the lane (local to the defender's side). Board replacement: the cut is dropped; the chain becomes a local ring-chain body on the lane; the cage becomes a local ring-cage on the defender; the magenta burst becomes impactFlash on the defender.
Palette: #B7F3FE (white-cyan chain highlight, #9F4492 (magenta-violet cage, #D769DD (pink-violet burst, #D08AAC (pink-cage edge, #FF00E6 (chain magenta.
Closest generic: sludge-bomb (poison special 3; the poison row of Appendix A is pending). Must differ: a ring-chain that winds the defender into a tall cage, not a glob thrown at it; the chain is the signature.
Board mapping:
- 0: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5) — the chain's bodies charge, 0–300 ms
- 300: projectile(attacker→defender, path 'straight', r0 0.2, r1 0.3, tongues 6) — the chain shot across the lane, 300–800 ms (a ring-chain body: a new piece)
- 800: impactFlash(defender) · starFlare(defender, arms 'ring', width 0.46) · shards(defender, count 8, arc 360, distance 1.1)
- 1000: spiral(defender, turns 2, r0 0.3, r1 1.0, rpm 90) — the chain winds round the defender, 1000–1800 ms
- 1000–1600: vignette(defender, maxAlpha 0.45) · cloud(defender, count 6, drift 0.5, alpha 0.4) — the violet haze
- attacker rear-lurch (glow 0.6), defender knock 0.3 (tremble from 0.82 c; the wrap pulls it)
- contact at 1000; total 2200
New pieces: ring-chain body: a chain of linked rings (a drawer or a tongue-run of rings along a line, magenta, with a violet rim); needed for the shot and the wrap.
Flags: house-rule translations (the magenta burst and the cage stay local to the defender; no whole-screen flash or tint; the camera cut and the wide view dropped); the reference's chain contact (~0.9 s) sits inside the window, but the cage (~3 s) is compressed into the 1.0–1.8 s wrap; palette eyeballed except where sampled; the defender is a golden-white Pokémon with a sand base (species not confirmed); no Gen 7 reference.

