### Blue Flare — Reshiram · fire · special · power 130
Refs: video EV (5467 ms, 30 fps, effect frames 22–108) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a cyan-white lane stream from Reshiram's open mouth that bursts on the defender in a blue core ringed by magenta spikes.
Video beats (t = 0 at frame 22):
- 0–600 ms (f22–40): camera cut to a low side view; Reshiram rears on the grass, wings spread wide (f30), head raised, mouth open; a pale horizon band of light grows across the frame (f24–40) and a cyan glint gathers at the mouth (f36–40). Colours #E8FBFF, #8FF4FF.
- 600–833 ms (f40–47): a cyan-white beam leaves the mouth along the lane; narrow at f41, full width by f45–47, held on the horizon line.
- 833–1000 ms (f47–52): the beam reaches the defender; a blue-magenta bloom opens at the defender, magenta spiked tongues splaying out (f49–53); the defender's HP bar starts to drop (f49–61).
- 1000–1900 ms (f52–79): one long cyan stream from the mouth to the defender with wobbling edges; the defender sits inside a deep-blue core with magenta and cyan spikes fanning out (f55–77). No orbiting bodies; the stream is one tongue.
- 1900–2000 ms (f79–82): sunburst rays from the defender (f79, f82–84), then the whole screen goes white-cyan (f81–82, 1967–2000 ms).
- 2067–2267 ms (f84–90): magenta ring at the defender around a cyan core (f84–86); the burst breaks into cyan flakes (f88–90).
- 2267–2733 ms (f90–104): flakes fall and the beam fades; a blue haze lingers around the defender with small blue motes (f94–102).
- 2933–3000 ms (f110–112): camera pulls back to the wide view; a 2-frame red-orange flare trails Reshiram's tail as it flies back.
- 3000–3433 ms (f112–125): Reshiram returns to its start pose with wings spread; the defender faints from ~3500 ms ("est K.O."), which is not part of the move.
Pokémon: 0–600 ms rears up with wings spread and mouth open (wind-up, glow rising at the mouth); 600–1000 ms holds the beam at the mouth (glow 1); 1000–1200 ms the body is pushed back by the release, no lunge; 2933–3000 ms (EV) tail flare, then it returns home by ~3.3 s.
Camera & screen: a close side-on cut at 0 ms and a pull-back to the wide view at 2933 ms; a full-screen white-cyan bloom at 1967–2000 ms and a sunburst at 1900–2000 ms. Board: the cuts → none (card motion only); the bloom → impactFlash on the defender at contact; the sunburst → dropped (no spinning fans), with local speedRays at contact.
Palette: #1E5BD6, #4FD8FF, #E8FBFF, #0B1B6E, #E23DBF
Closest generic: flamethrower (fire special 3): Appendix A has a continuous stream of red-orange flame puffs from the mouth across the lane, then puffs pile on the defender (contact 3100 ms). Must differ: one cyan-white beam with a magenta-spiked burst at contact and a lingering blue haze; no puff stream.
Board mapping:
- 0–600: aura(attacker, hz 2, alpha 0.6) · coreCharge(attacker, lead 0.42, r0 0.18, r1 0.56)
- 600–1900: beam(kind 'widening', w 0.8) from the attacker's mouth to the defender (front layer; grows, holds, retracts)
- 900–1800: vignette(defender, maxAlpha 0.45) · 1000–1320: speedRays(defender, count 28) · 1000–1500: starFlare(defender, arms 'ring')
- 1000–1180: impactFlash(defender, top) · 1000: particles(defender, count 22, kind ember, cyan)
- 1300–2400: aura(defender, hz 2, alpha 0.5) (the lingering haze)
- attacker rear-lurch (rear 0.14, lurch 0.4, glow 1), defender knock 0.3 (heat 1)
- contact at 1000; total 2200
New pieces: none (the blue body and magenta accent are a material palette override on fire, not a drawer).
Flags: house-rule translations (the whole-screen white-cyan bloom at 1967–2000 ms → impactFlash at contact; the sunburst rays at 1900–2000 ms → dropped, local speedRays kept at contact; camera cuts at 0 and 2933 ms → none); uncertainty (the 2-frame orange tail flare at 2933–3000 ms is not mapped; palette hex values estimated by eye; the defender is unnamed in EV).
### Fusion Flare — Reshiram (also Kyurem-White) · fire · special · power 100
Refs: video EV (5900 ms, 30 fps, effect frames 24–158) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a huge golden fireball forming above Reshiram's head, then dropping onto the defender and bursting into a fire column with a flat ring at its base.
Video beats (t = 0 at frame 24):
- 0–133 ms (f24–28): camera cut to a dark stage; a red-orange glow spreads at Reshiram's feet (f24–26), then golden streaks fan up from the base (f28).
- 133–533 ms (f28–40): wings open high (f26–34), then the arms spread horizontally into a cross (f40); the glow grows at the feet.
- 533–1033 ms (f40–55): arms held out at mid height; 6–8 golden-yellow spikes fan out and up from the feet (f44–53) with orange flames under the body; an orange fire lash crosses the top right (f53).
- 1033–1367 ms (f55–65): a bright golden sphere appears above the attacker's head (f55–59), grows to about 0.6 h with orange rings (f61–63) and settles overhead (f65).
- 1367–2200 ms (f65–90): the orb hovers over the attacker, spinning, with flame rings around a white core (f65–89); the streaks still fan at the base.
- 2200–2733 ms (f90–106): the orb descends diagonally toward the defender (top of frame at f100, centre at f104, lands on the defender with sparks at f106).
- 2800–3200 ms (f108–120): the impact: an orange-yellow starburst with a white centre, radial spikes (f108), then a fire bloom spreads round the defender (f110–118).
- 3200–3833 ms (f120–139): a fire dome holds round the defender with a curved yellow ring at its base (f122–134); the defender is seen inside the glow (f135).
- 3833–4100 ms (f139–147): a white flash (f139), then a flat horizontal yellow-white streak fan across the table (f141–145); the flames fade with sparks (f147).
- 4100–4567 ms (f147–161): fire and embers fade; the scene returns to the snow stage at f161 (after the move).
Pokémon: 0–133 ms rears its feet into the glow; 533–1033 ms wings held in a cross (arms out); 1033–2200 ms holds the orb overhead with wings spread; 2200–2733 ms the orb drops; the card returns home by ~3.4 s (EV).
Camera & screen: cut to the dark stage at 0 ms, cut back to the snow stage at 4567 ms; a whiteout flash at 3833–3900 ms (f139) and a flat horizontal streak fan at 3900–4033 ms. Board: no cuts (card motion only); the white flash becomes impactFlash (top) on the defender at contact; the horizontal fan becomes a floor ring at the defender.
Palette: #E8481A, #FF9A1F, #FFE35A, #FFF8DC
Closest generic: blast-burn (fire special 3): Appendix A has red-orange fire pillars rising at the attacker, then yellow flame pillars erupting on the defender's side (contact 2460 ms). Must differ: a golden orb forms overhead and drops onto the defender, then one fire column stands with a flat ring at its base.
Board mapping:
- 0–500: coreCharge(attacker, lift 1.0, r0 0.3, r1 0.75) · aura(attacker, hz 2, alpha 0.5)
- 500–1000: projectile(path 'arc', from lift 1.0, bow 1.1, r0 0.5, r1 0.8, tongues 9) — the orb drops onto the defender
- 900–1800: vignette(defender, maxAlpha 0.45) · ring(defender, kind 'floor', count 2, r0 0.3, r1 1.5)
- 1000–1180: impactFlash(defender, top) · 1000–1500: starFlare(defender, arms 'ring') · 1000–1900: pillar(defender, from 'below', height 1.8, w 0.9)
- 1000: particles(defender, count 22, kind ember) · 1400–2400: smoke(defender, count 6)
- attacker rise (lift 0.6, hover 1.2, land 1.6), defender knock 0.4 (heat 1)
- contact at 1000; total 2400
New pieces:
- coreCharge param lift: centres the sphere lift h above the attacker's card (EV f55–90); a param, not in design 063's table.
- projectile param from lift: starts the arc at the lifted orb so it drops onto the defender (EV f90–106).
- fire body with two rotating tongue rings: arcs round the hot sphere, one pass each (EV f61–89).
Flags: house-rule translations (the whole-screen white flash at f139 → impactFlash at contact; the flat horizontal streak fan → a floor ring; camera cuts at 0 and 4567 ms → none); uncertainty (the golden streaks at the base, 0–1000 ms, are not mapped: no upward spike-fan drawer; EV hides the orb's drop path behind the defender, so gen7 f100–108 is used; the defender is unnamed in the sheets; about 2.7 s of reference is compressed into 1.0 s of contact).
### Magma Storm — Heatran · fire · special · power 100
Refs: video EV (6200 ms, 30 fps, effect frames 36–171) · gen7 USUL (used for: shape/path/count/angle)
Signature read: magma columns erupt from the ground at the defender's feet, then a golden spiral vortex rises from a rock mound and the defender is flung up in the air.
Video beats (t = 0 at frame 36; ±2 frames):
- 0–167 ms (f36–41): Heatran rotates its shell toward the defender; the yellow-orange spots on its shell brighten (f38–41); the camera pushes in on the shell.
- 200 ms (f42): camera cut to the defender in the open desert; the whole screen turns deep red (f42–157).
- 700–833 ms (f57–61): a white-orange magma column rises from the ground at the defender's left (f57), tall by f59, with a rock mound and a swirl ring at its base (f61).
- 967–1367 ms (f65–77): flame tongues fan up around the first column; a second column rises to the right of the defender (f67–69); a second rock mound with a swirl ring appears on the right (f77).
- 1500–2200 ms (f81–102): both mounds burn; a third thin white column rises to the left of the defender (f98), a swirl ring spins at the left base (f102).
- 2267–2733 ms (f104–118): flames of three columns surround the defender; the defender stays in the middle.
- 2800–3000 ms (f120–126): radial white-gold flare and a near-whiteout (f124–126).
- 3067–3900 ms (f128–153): a tall golden spiral column (a tornado of yellow-white streaks, 2.5 turns) rises from the centre rock mound; the mound and rocks fly up and round it.
- 3967–4300 ms (f155–165): the column thins to a white-yellow pillar (f159); the defender is flung up, tinted pink, airborne (f159–161), then falls back to the ground (f163–165).
- 4433–4500 ms (f169–171): the pink heat tint fades; the screen returns to the normal desert colour (f171).
- 4967 ms (f185): Heatran is back in view at its home position (after the move).
Pokémon: 0–167 ms rotates its shell and brightens the shell spots (f36–41); it is off camera from f42; the body does not return until the end. gen7 f60–70: Heatran curls into a dome before the fire wave (gen7, shape only).
Camera & screen: push-in to the shell (f38–41); cut to the defender (f42); whole-screen red tint f42–157; whiteout f124–126 (2800–3000 ms); normal colour again at f171. Board: camera cuts → none (card motion only); the red tint → a local vignette around the defender; the whiteout → impactFlash (top) at the defender at contact.
Palette: #FFF2B8, #FFB52E, #FF6A1A, #C2301A, #6B5548
Closest generic: blast-burn (fire special 3): Appendix A has tall red-orange fire pillars at the attacker, then yellow pillars on the defender's side (contact 2460 ms). Must differ: a ground fire wave runs from the attacker to the defender, three columns with rock mounds stand round it, and a golden spiral rises from the centre mound.
Board mapping:
- 0–600: aura(attacker, hz 2, alpha 0.6)
- 500–1100: beam(kind 'widening', w 0.5) from the attacker to the defender — the ground fire wave (gen7 f75–125)
- 600–1000: pillar(defender, from 'below', height 1.8, w 0.6) · pillar(defender, from 'below', height 1.5, w 0.45, dx -0.7) · pillar(defender, from 'below', height 1.5, w 0.45, dx 0.7)
- 500–2000: terrain(defender, kind 'crack', radius 1.4) · 900–1800: vignette(defender, maxAlpha 0.45)
- 800–1800: spiral(defender, turns 2.5, r0 0.2, r1 1.1, rpm 90) · 1000–1800: mound(defender, count 7, radius 0.4, at each column base) · splash(defender, count 8, arc 140, direction -90, gravity 0.5)
- 1000–1180: impactFlash(defender, top)
- attacker brace (wind-up 0 → 0.7 c, settle 0.7 c → 1.1 c, glow 0.6), defender float (lift 0.15 h, tilt ±4°, bounce 0.06), heat 1
- contact at 1000; total 2400
New pieces:
- pillar param dx: offsets a column from the target's centre (EV has three columns, two at ±0.7 h).
- mound drawer (new): a static cluster of 7 magma rocks at each column base (rock shards, fire-coloured glow on the upper edge), held to the end (EV f61–171).
Flags: house-rule translations (the whole-screen red tint → a local vignette; the whiteout at 2800–3000 ms → impactFlash at contact; the camera cut at 200 ms → none; the gen7 ground fire wave → kept as a local beam); uncertainty (t0 at f36 is ±2 frames; palette hex values estimated by eye; float has no heat param, so heat 1 is passed outside the table; the airborne beat uses float's lift only, not the real knock-up arc).
### Sacred Fire — Ho-Oh (also Entei) · fire · physical · power 100
Refs: video EV (4300 ms, 30 fps, effect frames 22–104) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a magenta-white orb at Ho-Oh's chest that streaks out as a rainbow fireball and bursts on the defender into a multicoloured flame fountain.
Video beats (t = 0 at frame 22):
- 0–267 ms (f22–30): a magenta-violet glow grows at Ho-Oh's chest into a sphere with a white core.
- 267–700 ms (f30–43): the sphere grows in front of the body; the wings open wide (f41, 633 ms); cyan sparks at the sphere's edge (f43).
- 700–900 ms (f43–49): a cyan ring outline appears round the pink-blue sphere (f45–49).
- 900–1100 ms (f49–55): the sphere leaves Ho-Oh and streaks right as a pink-blue-red fireball; Ho-Oh lunges forward with it (f51–53).
- 1100–1300 ms (f55–61): impact on the defender: a multicoloured burst (pink, blue, red sparks, f57–59), then a white 8-spike starburst on the defender (f61–63, ~1300–1367 ms).
- 1367–1867 ms (f63–78): the defender stands inside a rising multicoloured flame fountain (pink, cyan, red, yellow, blue tongues, f66–76).
- 1900–2533 ms (f78–98): the fountain continues with cyan and red sprays; white-cyan sparkle flashes at f82–94 (the in-game "super effective" text is UI, not mapped).
- 2533–2733 ms (f99–104): flames and sparkles fade; the defender is clear again (f104).
- 2767–3533 ms (f105–128): Ho-Oh flies back to its hover position at the top left (f111–122), wings spread, with a red-yellow trail as it goes (f123–128).
Pokémon: 0–267 ms the chest glows and the wings are raised (charge); 633 ms wings wide; 900–1100 ms it lunges forward with the sphere (f51–53); after contact it hovers and returns home by ~3.5 s.
Camera & screen: no camera move or full-screen effect is seen inside t0–contact (sheets at 4-frame steps); the white starburst and the rainbow fountain stay local to the defender. Board: none needed beyond the local starFlare and pillar.
Palette: #F050D0, #4FE3FF, #FF4A2A, #FFD84A, #3B7BFF
Closest generic: fire-punch (fire physical 3): Appendix A has the background ramping to crimson, a red fist dropping on the defender and a yellow-orange fire clump at contact (1725 ms). Must differ: a magenta-white orb leaves Ho-Oh's chest as its own projectile, and the impact is a multicoloured fountain, not a fist.
Board mapping:
- 0–400: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5) (palette override: magenta, white core) · ring(attacker, kind 'face', count 1, r0 0.4, r1 0.8, 400–900)
- 700–1000: projectile(path 'straight', r0 0.34, r1 0.5, tongues 9) — the rainbow sphere from the attacker to the defender
- 1000–1180: impactFlash(defender, top) · 1000–1300: starFlare(defender, arms 'ring', width 0.46)
- 1000–1900: pillar(defender, from 'below', height 1.3, w 1.6) — the flame wall with multicoloured tongues (gen7 f56–97) · 1000: particles(defender, count 22, kind ember, pink/cyan/yellow)
- 1900–2200: aura(defender, hz 3, alpha 0.5)
- attacker dash (wind 0 → 0.3 c, dash 0.3 c → 1.0 c, pass → 1.15 c, return → 1.7 c, two trail ghosts), defender knock 0.45 (heat 1)
- contact at 1000; total 2200
New pieces: fire tongue per-tongue hue — each tongue draws from a colour list (pink, cyan, red, yellow, blue) instead of one palette; the EV rainbow fountain (f57–98) needs it.
Flags: uncertainty (t0 at f22 is the faint chest glow; Ho-Oh's wing outline is not an effect and is not mapped; the defender is green-topped and unnamed in the sheets; gen7 f28–55 shows the chest flame cyan-white with a loop before the dive, EV a magenta sphere: EV colours kept, gen7 used for the path and the flame-wall width; the multicoloured fountain is one pillar, not the EV's many tongues); house-rule translations (none needed: the starburst is already local).
### Searing Shot — Victini · fire · special · power 100
Refs: video EB (5767 ms, 30 fps, effect frames 26–160; no EV video) · gen7 USUL (used for: shape/path/count/angle)
Signature read: Victini leaps inside a towering flame column, then a fire blast crosses to the defender and erupts in repeated fire pillars at its feet.
Video beats (t = 0 at frame 26; the leap starts, the text box still shows):
- 0–267 ms (f26–34): Victini rises off the beach with a small yellow flame at its feet (f34); the camera follows it up.
- 267–600 ms (f34–44): flame bursts at its feet grow into a yellow-orange column round the body (f36–42); vertical black speed lines appear at both sides (f44).
- 600–1000 ms (f44–56): a dense column of yellow-orange and purple tongues rises round Victini, the sky turns warm orange (f48–50), white puffs at the top right (f52–54).
- 1000–1800 ms (f56–80): the column keeps climbing with tongues in red, orange, purple and yellow; Victini stays in the centre; the defender's HP bar appears (f78–80).
- 1800–2000 ms (f80–86): the flame mass shifts toward the defender (gen7 f80–86 shows the blast crossing with a fire dome at the defender); on EB the defender is seen at the top right (f86).
- 2067–2267 ms (f88–94): a yellow-white radial burst at the defender with a ring of sparks (f92–94).
- 2267–2600 ms (f94–104): the burst fades; the defender is in yellow fire and Victini's column is gone (f98); repeated eruptions at the defender's feet (f100–104).
- 2600–3333 ms (f104–126): yellow-white fire pillars keep erupting at the defender's feet, with thin yellow columns rising between the two cards (f108–124); a white flash at the top right (f126).
- 3333–4000 ms (f126–146): the defender turns orange (burned) and stays in the fire; yellow streaks rise between the cards (f132–146).
- 4000–4533 ms (f146–162): the flames die down and the scene's warm colour fades back to the blue sky (f162).
- 4533–4867 ms (f162–172): the defender stands in blue again; Victini lands at its home position (after the move).
Pokémon: 0–267 ms Victini rises (leap); 267–1000 ms it stays in the flame column; 1000–2000 ms it holds in the flame; 2000–2600 ms it lands back and settles; the body is not seen to move after 3000 ms.
Camera & screen: the camera follows the leap (0–300 ms); the whole scene turns warm orange (f48–146) with a white flash at the top right (f126); the vertical black speed lines (f44–86); the defender turns orange (heat tint, f100–146). Board: the warm screen tint → a local vignette on the defender; the speed lines → none (no motion-line drawer); the white flash → impactFlash (top) at contact; the orange body → heat tint on the defender.
Palette: #FFE14D, #FF8A1F, #E83A1E, #9A3BC8, #FFF6C8
Closest generic: lava-plume (fire special 2): Appendix A has red-orange lava spheres scattering across the field from the attacker toward the defender, with a white-hot core flash at contact. Must differ: the blast travels to the defender and erupts in repeated yellow pillars at its feet, and Victini leaps through a flame column first.
Board mapping:
- 0–800: pillar(attacker, from 'below', height 1.5, w 0.9) · aura(attacker, hz 3, alpha 0.6)
- 800–1000: projectile(path 'straight', r0 0.5, r1 0.9, tongues 9) — the blast travels to the defender
- 1000–1180: impactFlash(defender, top) · 1000–1300: starFlare(defender, arms 'ring', width 0.46) · 1000–1400: ring(defender, kind 'floor', count 2, r0 0.3, r1 1.5)
- 1000–2000: pillar(defender, from 'below', height 1.6, w 0.6) · 1400–2400: pillar(defender, from 'below', height 1.0, w 0.5, dx -0.7 and dx 0.7) — the repeated eruptions
- 1000: particles(defender, count 18, kind ember) · 1600: particles(defender, count 12, kind ember) · 1000–2400: vignette(defender, maxAlpha 0.45)
- attacker rise (lift 0.6, hover 1.2, land 1.6), defender knock 0.3 (heat 1)
- contact at 1000; total 2400
New pieces: pillar param dx (as in Magma Storm; the repeated side eruptions need offset columns).
Flags: missing refs (no EV video: EB is the primary); house-rule translations (the warm whole-screen tint f48–146 → local vignette; the white flash at f126 → impactFlash at contact; the black speed lines f44–86 not mapped: no motion-line drawer); uncertainty (t0 at f26 is the leap, the first effect is the flame at f34–36; the defender's orange colour is read as burn/heat tint, not verified; the thin yellow columns (gen7 f88–124) are mapped as pillars of width 0.6).
### V-create — Victini · fire · physical · power 180
Refs: video EB (6467 ms, 30 fps, effect frames 22–169; no EV video) · gen7 USUL (used for: shape/path/count/angle)
Signature read: Victini's two flame wings fan out in a V behind it as it dashes into the defender, which erupts in a fire pillar.
Video beats (t = 0 at frame 22; Victini starts a hop, the text box still shows):
- 0–400 ms (f22–34): Victini hops forward and grows in the foreground (f32); the camera cuts to a landscape at f34.
- 533–867 ms (f38–48): an orange wedge of flame sweeps across the bottom (f38); Victini sits in an orange flame burst (f40) with a white-gold sun forming behind it (f42–51).
- 1033–1233 ms (f53–59): cyan, white and yellow lock-on rings round Victini (f53–59), a horizontal white flare line across the screen (f55–57), grey wedges left and right; a red halo grows (f55–61).
- 1300–1633 ms (f61–71): a whole-screen red tint and a flame field across the bottom (f61–67); flame V-wings sprout from Victini's sides with pink tips (f69).
- 1633–1900 ms (f71–79): the V-wings spread wide (f73), then shrink (f77); Victini is back to normal size (f79).
- 2100–2533 ms (f85–98): Victini sits small; flame V-wings grow back and fan wide (f87–93, pink and orange, the widest near f93).
- 2533–2933 ms (f98–110): the screen whites out (f98–106), then fades back (f108–110).
- 3000–3500 ms (f112–126): a flame burst at Victini's base (f120) and a white flash at the top; Victini moves to the bottom right (f124).
- 3467–3867 ms (f126–138): Victini closes on the defender with flame wings; a sparkling white burst at the defender (f126).
- 3867–4000 ms (f138–142): a long orange-white lance streaks from Victini to the defender (f140), then a yellow-white radial burst (f142).
- 4067–4367 ms (f144–153): an orange ring at the defender's base (f144) and a yellow fire column rises (f147–153).
- 4367–4900 ms (f153–169): the column stands tall with embers (f157–165), then fades (f169).
- 4967–5700 ms (f171–193): daylight; Victini and the defender are standing again (after the move).
Pokémon: 0–400 ms hops; 533–1033 ms the sun forms behind it, wings not yet out; 1567–1900 ms flame V-wings out; 2433 ms wings out again; 3467–3933 ms dashes to the defender with wings out; after contact it returns home by ~5 s.
Camera & screen: a cut to a landscape at 400 ms; a whole-screen red tint at 1300–1633 ms; a whiteout at 2533–2933 ms; the whole screen warm through the column (4067–4967 ms). Board: the cut → none (card motion only); the red tint → a local vignette round the defender; the whiteout → dropped (no whiteouts in the house rules); the contact flash → impactFlash (top) on the defender.
Palette: #FFE55C, #FF8A1A, #E0301F, #FF8CC8, #5FE8FF
Closest generic: fire-punch (fire physical 3): Appendix A has the background ramping to crimson, a red fist dropping on the defender and a yellow-orange fire clump at contact (1725 ms). Must differ: Victini's flame V-wings and white sun sit on the attacker, a lance streaks the lane, and a fire pillar erupts at the defender instead of a fist.
Board mapping:
- 0–800: coreCharge(attacker, lead 0.42, r0 0.2, r1 0.55) · vwings(attacker, spread 55°, flap 2 Hz) (NEW drawer) · ring(attacker, kind 'face', count 3, r0 0.3, r1 1.0, 300–1000)
- 700–1000: beam(kind 'solid', w 0.3) from the attacker to the defender — the lance
- 1000–1180: impactFlash(defender, top) · 1000–1300: starFlare(defender, arms 'ring', width 0.46) · 1000–1400: ring(defender, kind 'floor', count 2, r0 0.3, r1 1.5)
- 1000–2000: pillar(defender, from 'below', height 1.8, w 0.8) · 1000: particles(defender, count 22, kind ember)
- 800–1400: vignette(defender, maxAlpha 0.45)
- attacker dash (wind 0 → 0.3 c, dash 0.3 c → 1.0 c, pass → 1.15 c, return → 1.7 c, two trail ghosts), defender knock 0.45 (heat 1)
- contact at 1000; total 2400
New pieces:
- vwings drawer (new): two tongue fans from the attacker's flanks, spread ±55° into a V and flapping (EV f69–93, gen7 f68–94); the signature image.
Flags: missing refs (no EV video: EB is the primary); house-rule translations (the whole-screen red tint → local vignette; the whiteout at 2533–2933 ms → dropped; the horizontal flare line → the lance beam; the camera cut to a landscape at 400 ms → none); uncertainty (t0 at f22 is the first hop; the sun is the first effect at f40; the defender is unnamed; about 6 s of reference is compressed into 2.4 s).
### Hydro Steam — Walking Wake · water · special · power 80
Refs: video EV (6300 ms, 30 fps, effect frames 16–163) · gen7 none
Signature read: a pale-blue steam beam from the serpent's open mouth that breaks in a white steam cloud over a green defender, with a cyan fin halo rising behind its head first.
Video beats (t = 0 at frame 16; the serpent holds its pose in the day stage until then):
- 0–200 ms (f16–22): camera cut to a night stage; a cyan fin halo lifts round the head and wraps it (f16–22).
- 200–600 ms (f22–34): the halo spins; the body rears with its tail raised; the mouth opens wide (f34).
- 600–1000 ms (f34–46): a white-blue charge flares at the mouth with radial white shards (f40–46); the charge builds.
- 1000–1733 ms (f46–68): radial shards and a white star at the mouth (f48–68), held, flickering.
- 1733–2133 ms (f68–80): the white charge tightens to a bright point at the mouth (f72–78) with a dark-blue outer ring.
- 2133–2400 ms (f80–88): a pale-cyan beam leaves the mouth and grows along the lane (f80–82); it reaches the defender at ~2400 ms (f88) and a white steam cloud opens over it.
- 2400–3267 ms (f88–114): the beam holds at full length as the cloud grows; the cloud is white and dense (f96–112), with wisps of cyan in its edges.
- 3267–3467 ms (f114–120): the beam fades; the white cloud turns to a thinner ring (f116–120).
- 3467–4200 ms (f120–142): the steam drifts; the defender is visible inside a grey-white haze (f124–142).
- 4200–4867 ms (f142–162): the haze thins to a grey swirl at the defender's base (f144–162) and fades.
- 4867–6267 ms (f162–189): the serpent is back in the day stage (f164) in its home pose (after the move).
Pokémon: 0–200 ms the fin halo lifts round the head (the card's rim glow); 200–1000 ms it rears with the mouth open (the glow builds); 1000–2133 ms it holds the charge at the mouth; 2133–3267 ms it holds the beam; after 3267 ms it lowers to its home pose by ~4.9 s.
Camera & screen: a cut from the day stage to a night stage at f16 (the start); the stage stays night for the whole move; no full-screen tint or flash. Board: the cut → none (card motion only); the white cloud at 2400–3200 ms is local to the defender, so it stays as the local cloud.
Palette: #A8F0FF, #4FD8F0, #FFFFFF, #2E7CE6, #C7D8E6
Closest generic: hydro-pump (water special 3): Appendix A has a glowing pale-cyan orb at the attacker's hands, one continuous cyan-white beam to the defender, then white-cyan splash puffs and mist clouds (contact 900 ms). Must differ: a thin steam beam from the mouth after a fin-halo charge, breaking into a white steam cloud over the defender; no water column.
Board mapping:
- 0–400: ring(attacker, kind 'fins', count 6) (NEW variant) · 0–1000: aura(attacker, hz 2, alpha 0.6)
- 300–1000: beam(kind 'solid', w 0.4) from the attacker's mouth to the defender (water sheet)
- 900–1800: cloud(defender, count 8, radius 0.4, drift 0.6, alpha 0.5, mist colour #C7D8E6) · 1000–1800: smoke(defender, count 6)
- 1000–1180: impactFlash(defender, top) · 1200–2000: splash(defender, count 8, arc 140, direction -90, gravity 0.7)
- attacker rear-lurch (rear 0.14, lurch 0.4, glow 1), defender knock 0.3 (heat 1)
- contact at 1000; total 2000
New pieces:
- ring kind 'fins' (new variant): six short cyan tongues round the head, spinning, with the water sheet tongue (EV f16–34).
Flags: house-rule translations (none needed: the night stage is the scene, not a tint; the camera cut at f16 → none); uncertainty (the reference's beam reaches the defender at ~2.4 s, so the charge and beam are compressed about 2.4× to fit contact at 1.0 s; t0 at f16 is the cut; the defender is unnamed and green-winged in the sheets; the steam cloud is mapped as cloud with mist colour, not as splash).
### Origin Pulse — Kyogre · water · special · power 110
Refs: video EV (4500 ms, 30 fps, effect frames 22–110) · gen7 USUL (used for: shape/path/count/angle)
Signature read: Kyogre rounds into a finned ball inside a ring of glowing blue orbs, then fires radial cyan sheets from its body and dives through the orbs onto the defender.
Video beats (t = 0 at frame 22; the cut to the close view):
- 0–100 ms (f22–25): camera cut to a close side view; the whale body turns end-on and rounds into a ball with wide white-tipped fins (f22–26, gen7 shape f37–39).
- 200–400 ms (f28–34): thin electric-blue arcs jump round the body (f28); 6–8 blue orbs appear round it (f28–30) and a large translucent blue shell starts to grow (f30).
- 400–733 ms (f34–44): the shell fills the view as a whole-screen blue field (f32–36, house-rule conflict); 8–12 blue orbs (#2E9BFF, rim #7FF2FF, white cores) hang round the body (f36–44).
- 800–1000 ms (f46–50): cyan streaks run out from the wings (f46–50), and the body elongates (f50).
- 1000–1200 ms (f52–58): the orbs drift into a loop round the body; a white-cyan helix ring spins at the body's middle (f52–58).
- 1200–1533 ms (f58–68): the orbs tighten into a ring around the body; the body holds in the centre with fins spread (f62–68, gen7 f53–67).
- 1667–2000 ms (f72–82): radial cyan sheets (about 10) burst from the body's centre in every direction (f72–82, gen7 f78–84); a white flash in the centre (f74–76).
- 2067–2667 ms (f84–102): the body flies right through the orb cloud and passes the defender (f84–96); cyan bursts and sprays hit the defender's base (f88–100).
- 2667–3067 ms (f102–114): the burst at the defender fades; the cyan sheets trail off (f106–112).
- 3067–3733 ms (f114–134): the body flies back to its home pose (f120–134).
Pokémon: 0–100 ms the body rounds into a ball with fins spread (the card rim glow); 200–1667 ms it holds the ball form with the orb cloud round it; 1667–2000 ms the radial burst; 2067–2667 ms it dives through the orbs and passes the defender; 2667–3733 ms it flies back and is in its home pose by ~3.7 s.
Camera & screen: a cut to a close side view at 0 ms; a close zoom on the body at 200–400 ms; a whole-screen blue field at 400–733 ms (the blue shell); a camera pull-back to the wide view at 2067 ms (gen7 f84). Board: the cut and the zoom → none (card motion only); the whole-screen blue field → dropped (the orb cloud stays round the attacker); the white flash at 1733–1900 ms → impactFlash (top) on the defender at contact.
Palette: #2E9BFF, #7FF2FF, #E2F8FF, #1E5FD6, #0B2A6E
Closest generic: hydro-pump (water special 3): Appendix A has a pale-cyan charge orb at the attacker's hands, then one continuous cyan-white beam to the defender. Must differ: the body rounds into a ball inside a ring of blue orbs, fires radial sheets from its centre, then dives through the orbs onto the defender; the water is orbs and fans, not a jet.
Board mapping:
- 0–800: orbitCharge(attacker, count 8, half 'back', r0 0.3, r1 0.5) · orbitCharge(attacker, count 8, half 'front', r0 0.3, r1 0.5) · aura(attacker, hz 2, alpha 0.6)
- 500–1000: starFlare(attacker, arms 'ring', width 0.3) — the radial sheets from the body (target attacker: NEW param)
- 900–1800: vignette(defender, maxAlpha 0.45) · ring(defender, kind 'floor', count 3, r0 0.3, r1 1.4, 1000–1800)
- 1000–1180: impactFlash(defender, top) · 1000–1800: cloud(defender, count 5, radius 0.3, drift 0.4, alpha 0.5) · 1000: particles(defender, count 18, kind droplet)
- attacker dash (wind 0 → 0.3 c, dash 0.3 c → 1.0 c, pass → 1.15 c, return → 1.7 c, two trail ghosts), defender knock 0.3 (heat 1)
- contact at 1000; total 2000
New pieces:
- starFlare param target (new): anchors the star on the attacker; EV's radial sheets come off Kyogre's body.
Flags: house-rule translations (the whole-screen blue field at 400–733 ms → dropped, the orb cloud stays on the attacker; the cut and zoom → none; the white flash at 1733–1900 ms → impactFlash at contact); uncertainty (the 2.0 s radial burst and the 2.7 s dive are compressed into the 1.0 s before contact, so the dive is shown by the dash only; the defender is unnamed by the sheets).
### Steam Eruption — Volcanion · water · special · power 110
Refs: video EV (4502 ms, 29.99 fps, effect frames 32–124) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a white steam lance from Volcanion's maroon body into the defender, with a steam column rising under the defender and a steam cloud left behind.
Video beats (t = 0 at frame 32; the ring body starts to turn):
- 0–467 ms (f32–46): the spiked ring body turns to face the defender; its spikes and arms rise (f34–46).
- 533–600 ms (f48–50): blue-violet glow spheres light up at the arms and mouth (f48–50; gen7 shows twin white-cyan orbs at the arms, f46–54).
- 667–1000 ms (f52–62): a white steam lance runs from Volcanion's mouth down-right to the defender (f52–62).
- 800–1133 ms (f56–66): a white-orange starburst with sparks bursts at the defender (f56–66); a steam cloud rises round it (f58–66).
- 1200–1867 ms (f68–88): the lance holds; the defender sits in an orange-white steam cloud and its sprite glows orange (f72–90, heat tint).
- 1933–2267 ms (f90–100): the defender is knocked back and spins (f92–94, blurred); the burst fades into drifting steam (f94–100).
- 2267–2800 ms (f100–116): gen7 only: a vertical steam column rises under the defender (gen7 f76–94) and the steam expands into a white field over the area behind it (gen7 f102–114, house-rule conflict).
- 2800–3133 ms (f116–126): the steam clears; the defender stands up (f116–122); Volcanion is back in its wide view (f126).
Pokémon: 0–467 ms the ring turns and its arms rise (the card's rim glow); 533–1000 ms the arm orbs glow and hold the lance (glow 1); 1000–2000 ms it holds in place; after contact it does not move forward (static pose); home by ~3.1 s.
Camera & screen: a cut to the wide view at f28 (before t0); a camera hold on the defender from f52; a board-wide white steam field at f102–114 (gen7), and a white-orange starburst at the defender (EV). Board: the cut → none (card motion only); the white field → dropped (replaced by the local cloud on the defender); the starburst → impactFlash (top) + starFlare on the defender at contact; the orange glow → the defender's heat tint.
Palette: #FFE9A8, #FF9A3C, #FF5A2A, #3E7BFF, #C7D8E6
Closest generic: hydro-cannon (water special 3): Appendix A has a pale-cyan orb at the attacker's hands that releases into a water column across the lane, then foam rings and splash at contact (2100 ms). Must differ: a white steam lance from the mouth into the defender, a steam column under the defender and a steam cloud; no water column, no foam.
Board mapping:
- 0–600: aura(attacker, hz 2, alpha 0.6) · coreCharge(attacker, lead 0.42, r0 0.18, r1 0.45)
- 300–1000: beam(kind 'solid', w 0.45) from the attacker to the defender (steam lance, water sheet)
- 800–1800: pillar(defender, from 'below', height 1.6, w 0.6) · cloud(defender, count 7, radius 0.35, drift 0.6, alpha 0.5) · 1200–1800: smoke(defender, count 5)
- 900–1600: vignette(defender, maxAlpha 0.45) · 1000–1180: impactFlash(defender, top) · 1000–1400: starFlare(defender, arms 'ring', width 0.46)
- 1000: particles(defender, count 20, kind droplet, gravity 0.7)
- attacker rear-lurch (rear 0.04, lurch 0.1, glow 1), defender knock 0.4 (heat 1)
- contact at 1000; total 2000
New pieces: none (the steam lance is the water sheet tongue; the column is pillar).
Flags: house-rule translations (the board-wide white steam field (gen7 f102–114) → local cloud and smoke on the defender; the orange heat tint → the defender's heat; the camera cut at f28, before t0 → none); uncertainty (t0 at f32 is ±2 frames; the defender is green and unnamed; EV's lance comes from the mouth and gen7's from the arm orbs, so the lane follows gen7; the attacker's pose is near static, so the lurch is small; about 3 s of reference effect is compressed into 1.0 s of contact).
### Surging Strikes — Urshifu · water · physical · power 25
Refs: video EV (13333 ms, 30 fps, effect frames 24–52 for the first wave; repeat waves 152–168 and 260–268; sheets at 4-frame steps) · gen7 none
Signature read: a grey-and-white Urshifu leaps at a gold bird and lands three blue-white water strikes in a row, each a burst on the bird's wing.
Video beats (t = 0 at frame 24; the stance starts to change):
- 0–267 ms (f24–31): Urshifu crouches and leans forward with its arms lowered (f24–31).
- 267–533 ms (f32–40): it leaps off the sand (f32–36) and spins in the air (f37); yellow claw sparks start (f39).
- 533–600 ms (f40–42): a white-blue streak runs from its leg to the bird's wing (f40), a first burst at the bird's wing (f42).
- 600–900 ms (f42–51): three blue-white bursts land on the bird in quick succession (f42–47, f48, f50), its HP bar drops (f45–50), and the bird is pushed right and down (f49–51).
- 900–1067 ms (f51–56): Urshifu lands and holds its stance (f52–56).
- 1067–4267 ms (f56–152): the bird flies back to the sky, Urshifu holds its stance on the sand (f60–140).
- 4267–4800 ms (f152–168): second wave: Urshifu leaps again (f152, yellow-black streaks at the body), a white streak to the bird (f156), bursts on the bird (f160, f164, f168). Sheet-level timing (±4 frames).
- 7867–8133 ms (f260–268): third wave: bursts on the bird (f260, f264, f268). Sheet-level timing (±4 frames).
- 9200–11067 ms (f300–356): the bird is shown in close-up flying and then falling into the sea (f328–356); a white splash on the sand at f360–364 (after the move).
Pokémon: 0–267 ms the stance changes (crouch, lean); 267–533 ms it leaps (lunge); 533–900 ms it holds the strikes in the air (yellow claws); 900–1067 ms it lands; later it re-leaps in waves two and three.
Camera & screen: no cut on the first wave; the camera stays on Urshifu and the bird; a close-up of the bird at f328–352 (after the move, not mapped). Board: none needed (no screen effect in wave 1); the bird's close-up is out of scope.
Palette: #7FD8FF, #E2F8FF, #2E9BFF, #FFFFFF, #FFD84A
Closest generic: aqua-tail (water physical 3): Appendix A has the attacker sway and rear, bubbles and ripple rings under it, then a white-pink crescent tail swipe at contact (2900 ms), with a white foam band at the defender's base. Must differ: three named blue-white strikes on the bird's wing (550, 750, 1000 ms), each a burst; no tail sweep, no foam band.
Board mapping:
- 0–400: aura(attacker, hz 3, alpha 0.5)
- 500–800: starFlare(defender, arms 'cross', width 0.3) — hit 1 at 550 · 700–1000: starFlare(defender, arms 'cross', width 0.3) — hit 2 at 750
- 900–1180: starFlare(defender, arms 'ring', width 0.46) — hit 3, the damage, at 1000 · 1000–1180: impactFlash(defender, top)
- 1000–1600: splash(defender, count 6, arc 140, direction -90, gravity 0.7) · 1000: particles(defender, count 14, kind droplet, gravity 0.7)
- attacker lunge (wind 0 → 0.4 c, strike 0.4 c → 1.0 c, recoil 1.0 c → 1.5 c), defender stagger (hits 3, gapMs 200, strength 0.3, lead 450 ms)
- contact at 1000 (the third strike); total 2000
New pieces:
- stagger param lead (new): the first knock comes 450 ms before contact so the third lands on contact; the preset itself starts at contact.
Flags: house-rule translations (none: no screen effect in wave 1); uncertainty (only wave 1 is mapped; waves two and three at f152–168 and f260–268, read at 4-frame steps, are not mapped; the move is three hits in the games, so the later bursts may repeat it (to confirm); the bird is gold and black and unnamed; wave 1 spans 0.9 s and is compressed to 0.55–1.0 s).
### Land's Wrath — Zygarde · ground · physical · power 90
Refs: video EB (5100 ms, 30 fps, effect frames 0–151; no EV video) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a black fan of spiky fronds with yellow-green dots rising behind the attacker, then gold light columns and rock slabs erupting out of the ground under the defender.
Video beats (t = 0 at frame 0; the silhouette is up on the first frame, the text box shows over it):
- 0–1267 ms (f0–38): Zygarde's black silhouette, a fan of tapered fronds with yellow-green dots and white inner dots, stands behind the attacker; the fan spreads wide (f14–24) and folds in (f26–32); at f34 the green hex-cell body shows at the base (gen7 f35–45 confirms).
- 1267–1433 ms (f38–43): the stage darkens to a night sky (house-rule conflict); a gold ring forms at the base (f43).
- 1433–2100 ms (f43–63): the gold ring spreads out across the ground (f43–63), grey-brown dust clouds roll round it (f45–65); the fan's frond tips burn yellow (f49–59).
- 2100–2300 ms (f63–69): the defender (purple-white Pokémon) is lifted in the dust (f63–69).
- 2300–2933 ms (f69–88): three to four gold-white light columns rise round the defender (f78–88); the ground glows gold with crack lines radiating from it (f75–90).
- 3000–3133 ms (f90–94): gold-white light fills the view; a whiteout at f92 (3067 ms); the HP bar appears at f94.
- 3133–3867 ms (f94–116): black rock slabs and orange fire columns erupt from the ground round the defender (f94–116); the frond fan stays in the foreground (f94–104).
- 3867–4433 ms (f116–133): the slabs and the light fade into a black-white field (f117–133).
- 4433–4700 ms (f135–141): a white field, then the day stage returns (f141).
- 4700–5033 ms (f141–151): the silhouette fades back in over the day stage (f143–151) (after the move).
Pokémon: 0–1267 ms the fronds spread and fold (the card's rim glow); 1267–2100 ms the body rises out of the fan (the attacker's rise); 2100–3067 ms it holds, fronds forward; after contact it is covered by the slabs and fades with the field.
Camera & screen: a night-sky cut at f39–63 (1267–2100 ms); the whiteout at f92 (3067 ms); the black-white field at f117–139; a return to the day stage at f141. Board: the night sky → dropped (no background change mid-effect); the whiteout → impactFlash (top) on the defender at contact; the field fades → none.
Palette: #0A0A0C, #C8E84A, #F2B233, #FFE15A, #FFFBE6
Closest generic: earthquake (ground physical 3): from memory, unverified (Appendix A has no Ground entry). Must differ: a black frond fan rises from the attacker with a gold ring at its base, and gold light columns and rock slabs erupt round the defender instead of a shock through the ground.
Board mapping:
- 0–450: fan(attacker, count 9, spread 120, dark #0A0A0C, dots #C8E84A) (NEW drawer) · 450–700: ring(attacker, kind 'floor', count 3, r0 0.3, r1 1.3) · 500–800: terrain(attacker, kind 'dust', radius 1.4)
- 700–1000: pillar(defender, from 'below', height 1.8, w 0.45, dx -0.6) · pillar(defender, from 'below', height 1.8, w 0.6, dx 0) · pillar(defender, from 'below', height 1.8, w 0.45, dx 0.6) · terrain(defender, kind 'crack', radius 1.4)
- 1000–1180: impactFlash(defender, top) · 1000–1600: shards(defender, count 8, arc 360, distance 1.1) · 1000: particles(defender, count 20, kind shard) · 1000–1800: vignette(defender, maxAlpha 0.45)
- attacker stomp (lift 0 → 0.8 c, slam 0.8 c → 1.0 c, settle → 1.4 c), defender knock 0.4 (heat 0.5)
- contact at 1000; total 2200
New pieces:
- fan drawer (new): a radial fan of dark tapered tongues rising from the attacker's base over `spread` degrees, lime dots at the tips (EB f0–32 and f94–104).
- pillar param dx (new): offsets the three light columns by ±0.6 h, as in Magma Storm.
Flags: missing refs (no EV video: EB is the primary); house-rule translations (the night-sky cut at f39–63 → dropped; the whiteout at f92 → impactFlash at contact; the black-white field at f117–139 → none); uncertainty (t0 at f0 from the silhouette, already up on frame 0; contact at about f96 (3.2 s) compressed to 1.0 s; the defender is unnamed; palette estimated by eye).
### Precipice Blades — Groudon · ground · physical · power 120
Refs: video EV (5333 ms, 30 fps, effect frames 18–158) · gen7 USUL (used for: shape/path/count/angle)
Signature read: Groudon's gold-white spires bursting out of the ground in rings round it and round the defender, ending in one tall red column that rises out of the defender's dust.
Video beats (t = 0 at frame 18; the camera cuts to Groudon's frontal view):
- 0–333 ms (f18–28): camera cut to a frontal view; Groudon rises from its reclining pose into a standing pose (f18–26); its red and white spiked body and grey belly face the camera; no blades yet. (The stage's blue light beam at top right, f0–16, is background, not the move.)
- 333–733 ms (f28–40): gold-yellow spires burst out of the ground in a ring round Groudon's feet (f28–40); a dust cloud rolls out with them (f36–40); a red-orange streak runs at the top right (f40).
- 733–1200 ms (f40–54): the ring is taller and denser (f40–54), white-gold blade tips, yellow sparks; Groudon lowers its head (f48–54).
- 1200–1467 ms (f54–62): the spires sink back into the ground (f56–60); Groudon crouches (f58–62).
- 1467–2000 ms (f62–78): Groudon lunges: its red-white claw and head enter from the left edge (f62–78); the defender (grey Pokémon) stands in dust on the right (f64–66); dust rises (f66–72); spires come up round the defender's feet (f74–78).
- 2000–2533 ms (f78–94): a ring of pale-gold spires rises round the defender (f78–94, gen7 f78–94 shows 6–8 spires); yellow sparks at their tips (f84–90); a white-gold glow at the ground (f82–90).
- 2533–2667 ms (f94–98): the defender's HP bar appears (f96–98); the spires stay up.
- 2667–2933 ms (f98–104): contact: a white-yellow column rises at the defender (f102–104), white-gold sparks burst out (f102–104).
- 2933–3333 ms (f104–118): the column turns red with orange edges and sparks; a tall red-orange pillar stands on the defender (f112–118).
- 3333–4067 ms (f118–140): the red column thins and fades into a gold dust cloud (f120–136); the defender stands in dust (f130–140).
- 4067–4667 ms (f140–158): Groudon's head and tail return to the home pose in the sand stage (f144–158).
Pokémon: 0–333 ms it stands up (rise); 333–1200 ms the ring of spires rises round it (it holds the stance, with the head lowered at 733–1200 ms); 1200–1467 ms it crouches; 1467–2000 ms it lunges with the arm (the card's lunge); after contact it is back in its stance and returns home by ~4.7 s.
Camera & screen: a cut to a frontal view at f18 (start); a sunburst fan of god rays over the field in gen7 (f96–149), not in EV; a whiteout-like gold field in gen7 (f78–94). Board: the cut → none; the sunburst → not translated (no spinning fans); the gold field → dropped (the spires and the dust stay local); the contact flash → impactFlash (top) on the defender.
Palette: #FFF6B8, #FFD84A, #FF8A1F, #E8282A, #C98B5A
Closest generic: earthquake (ground physical 3): from memory, unverified (Appendix A has no Ground entry). Must differ: gold-white spires come up in a ring round the attacker and then round the defender, the attacker lunges with its arm, and the defender takes one red column rising out of its dust.
Board mapping:
- 300–800: pillar(attacker, from 'below', height 1.0, w 0.35, dx -0.7 / -0.35 / 0.35 / 0.7) · terrain(attacker, kind 'dust', radius 1.4, 300–1000)
- 800–1000: pillar(defender, from 'below', height 1.2, w 0.35, dx -0.7 / -0.35 / 0.35 / 0.7)
- 1000–1180: impactFlash(defender, top) · 1000–1400: pillar(defender, from 'below', height 1.8, w 0.6) · 1000–1800: shards(defender, count 8, arc 360, distance 1.0) · 1000: particles(defender, count 20, kind shard)
- 1400–2200: pillar(defender, from 'below', height 1.6, w 0.5, palette #E8282A → #C98B5A) · 1000–1800: vignette(defender, maxAlpha 0.45)
- attacker lunge (wind 0 → 0.4 c, strike 0.4 c → 1.0 c, recoil 1.0 c → 1.5 c), defender knock 0.4 (heat 0.5)
- contact at 1000; total 2200
New pieces:
- pillar param dx (new): offsets four spires per ring, as in Magma Storm; the rings are 300–800 ms round the attacker and 800–1000 ms round the defender.
- red column: a palette override on the ground material (#E8282A → #C98B5A), not a drawer.
Flags: house-rule translations (the gold whiteout-like field in gen7 f78–94 → dropped; the god-ray sunburst in gen7 f96–149 → not translated; the frontal cut at f18 → none); uncertainty (t0 at f18 is the cut, the stage light at f0–16 is background; the lunge arm's path is seen only at the left edge in EV and is taken from gen7; the defender is grey and unnamed; the reference's contact at f98 (2.7 s) is compressed to 1.0 s; palette estimated by eye).
### Sandsear Storm — Landorus · ground · special · power 100
Refs: video EV (5500 ms, 30 fps, effect frames 26–164) · gen7 none
Signature read: Landorus's white cloud and grey tail ring sweeping toward the defender, then a grey sand tornado with orange fire lines spiralling round the defender and rising off the ground.
Video beats (t = 0 at frame 26; the camera cuts to the wide landscape and Landorus's tail sweeps out):
- 0–267 ms (f0–24, before t0; not mapped): Landorus holds its pose at the left, the white cloud at its base and the grey tail ring arched over it; the text box is not yet up.
- 0–400 ms (f26–38): camera cut to a wide landscape; the tail ring swings out toward the defender (f26–34) and the white cloud drifts forward with it (f26–38).
- 400–533 ms (f38–42): the trainer appears at the left and the ring turns over the defender (f40–42); a faint orange fire arc starts on the ground near the trainer (f42).
- 533–733 ms (f42–48): orange-red fire arcs run along the ground at the bottom of the frame (f42–46); the defender (grey-blue armoured Pokémon) is hit and tumbles (f46–48) and rolls over (f48–56).
- 733–1067 ms (f48–58): the defender rolls back and shows its HP bar (f58); the ring stays over the table.
- 1067–1533 ms (f58–72): a grey-brown sand funnel starts to turn round the defender (f64–72), fire lines weave through it (f66–72).
- 1533–2333 ms (f72–96): the funnel grows into a tall grey helix with orange-red fire rings at its base (f78–96); sparks and sand rise.
- 2333–3000 ms (f96–116): the helix keeps rising (f102–114); a bright yellow starburst appears at the defender's base (f116, 3000 ms).
- 3000–3333 ms (f116–124): orange-red flares spread across the ground under the defender (f118–124); the helix thins.
- 3333–4333 ms (f126–156): the sand clears; the defender sits in the dust (f126–154); the cloud and ring hold at the left.
- 4333–4600 ms (f156–164): Landorus returns to its home pose with the cloud and tail ring (after the move).
Pokémon: 0–400 ms the tail ring swings and the cloud drifts (the card's lean); 400–1000 ms it holds the lean; 1000–1200 ms the tail is over the defender; after contact it recovers to its home pose by ~4.5 s.
Camera & screen: a wide cut at f26 (start); a hazy yellow screen tint at f26–40 (background haze); a yellow starburst at f116 (3000 ms) at the defender's base; no full-screen flash. Board: the cut → none; the hazy tint → dropped (no whole-screen tint); the starburst → starFlare on the defender, local.
Palette: #E8EEF5, #D9B77A, #5A4A3A, #FF8A1A, #FFE14D
Closest generic: whirlpool (water special 1): Appendix A has the background going black, a deep teal underwater backdrop fading in over the whole screen, then glossy blue bubbles pouring off the defender (contact 660 ms). Must differ: a grey-brown sand funnel with orange fire rings at its base, a white cloud and tail ring sweeping out from the attacker, and a yellow starburst at the base; no full-screen backdrop.
Board mapping:
- 0–800: cloud(attacker, count 6, radius 0.35, drift 0.4, alpha 0.5, colour #E8EEF5)
- 500–1000: terrain(defender, kind 'crack', radius 1.4) — the orange fire arcs along the ground (approximated as cracks)
- 1000–1800: spiral(defender, turns 2.5, r0 0.2, r1 1.1, rpm 90, sand #D9B77A / dark #5A4A3A) · cloud(defender, count 8, radius 0.35, drift 0.8, alpha 0.5, colour #D9B77A)
- 1000–1180: impactFlash(defender, top) · 1000–1800: vignette(defender, maxAlpha 0.45) · 1000: particles(defender, count 18, kind shard, colour #D9B77A) · 1500–1700: starFlare(defender, arms 'ring', width 0.46, colour #FFE14D)
- attacker rear-lurch (rear 0.1, lurch 0.3, glow 0.6), defender knock 0.3 (heat 0.5)
- contact at 1000; total 2200
New pieces: none.
Flags: house-rule translations (the hazy yellow screen tint at f26–40 → dropped; the yellow starburst at f116 → starFlare local at the defender); uncertainty (t0 at f26 is the camera cut and the tail sweep; the pose at f0–24 is before t0; the fire arcs (f42–46) are seen only at the bottom of the frame and mapped as cracks, which only approximates them; the defender is unnamed; no gen7, so the shape is EV only; contact at f48 (0.73 s) fits the budget with little compression).
### Thousand Arrows — Zygarde · ground · physical · power 90
Refs: video EB (6233 ms, 30 fps, effect frames 38–175; no EV video) · gen7 USUL (used for: shape/path/count/angle)
Signature read: Zygarde's lime-green core bursts into radial cyan arrows that rain down from the sky onto the defender, with green hex-leaf shards scattering at its feet.
Video beats (t = 0 at frame 38; the lime ring at the base is the first effect):
- 0–200 ms (f38–44): a lime-green ring spreads at the base of Zygarde's body (f38–42); the green core lights at the mouth (f40–44).
- 200–600 ms (f44–56): a green-white core at the mouth; cyan arrow streaks burst outward and up from the body (f47–57).
- 600–1100 ms (f56–71): the body is wrapped in a dense lime-cyan burst; radial arrow streaks fan up (f59–69); a white core flare at the chest (f57–69).
- 1100–1233 ms (f71–75): white flash at the body (f71–73); the camera cuts to a landscape at f75 (1233 ms) with a white-cyan radial burst over the body (f75–93).
- 1233–1867 ms (f75–94): a wide radial burst of cyan spikes goes up over the field; the defender stands in the field (f79–93) as the burst hits; its HP bar appears at f94 (1867 ms).
- 1867–3400 ms (f94–140): arrow rain: cyan and white arrow bolts fall from above onto the defender, with green hex-leaf chips at its feet (f94–140).
- 3400–3767 ms (f141–151): arrows strike round the defender; green flashes at its feet (f141–147) and green shards scatter (f147–151).
- 3833–4567 ms (f153–175): the field clears; the defender stands in dust (f153–163) and the view returns to the home pose (f165–175).
- 4567–4933 ms (f175–186): Zygarde's silhouette returns over the day stage (after the move).
Pokémon: 0–200 ms the body's base glows lime (the card's rim glow); 200–1100 ms the body holds the green core at the mouth, arrows radiate off it; 1100–1233 ms the white flash; after 1233 ms the body is off camera until f175.
Camera & screen: a camera cut to a landscape at f75 (1233 ms); a white flash at the body (1100–1200 ms); a whole-screen radial burst over the field (1233–1833 ms, f75–93); the rain covers the table (1867–3400 ms). Board: the cut → none (card motion only); the whole-screen white flash → impactFlash (top) on the defender at contact, no full-screen flash; the radial burst → local shards at the attacker; the rain → rain on the defender, local.
Palette: #7DFF4A, #5FFFD7, #FFFFFF, #2E9B3A, #0A0A0C
Closest generic: earthquake (ground physical 3): from memory, unverified (Appendix A has no Ground entry). Must differ: the arrows come from the sky and rain on the defender instead of a shock through the ground, and the palette is lime and cyan rather than earth tones.
Board mapping:
- 0–600: coreCharge(attacker, lead 0.42, r0 0.2, r1 0.5) · ring(attacker, kind 'floor', count 2, r0 0.3, r1 1.0) · aura(attacker, hz 2, alpha 0.5)
- 300–1000: shards(attacker, count 10, arc 360, distance 1.0) — the radial arrows (tongue, jag 1) · 1000–1180: impactFlash(defender, top)
- 1000–1400: starFlare(defender, arms 'ring', width 0.3) · 1000–2000: rain(defender, count 12, height 1.6, spread 0.9) · 1000–1800: shards(defender, count 6, arc 360, distance 0.9)
- 1000: particles(defender, count 18, kind shard, colour #7DFF4A) · 1000–1800: vignette(defender, maxAlpha 0.45)
- attacker brace (wind-up 0 → 0.7 c, settle 0.7 c → 1.1 c, glow 0.6), defender knock 0.3 (heat 0.5)
- contact at 1000; total 2000
New pieces: none (the lime-cyan palette is a material override on ground).
Flags: missing refs (no EV video: EB is the primary); house-rule translations (the white whole-screen flash at 1100–1200 ms → impactFlash at contact; the whole-field radial burst at 1233–1833 ms → local shards at the attacker; the camera cut at 1233 ms → none); uncertainty (t0 at f38 is the first lime ring, the silhouette before it is not an effect; the reference's rain runs about 3.8 s and is compressed to 1.0 s of effect plus a 1.0 s rain; the defender is unnamed; palette estimated by eye).
### Thousand Waves — Zygarde · ground · physical · power 90
Refs: video EB (7867 ms, 30 fps, effect frames 36–185; no EV video) · gen7 USUL (used for: shape/path/count/angle)
Signature read: Zygarde's green hex-shard burst rolls across the field as a swarm and piles up over the defender, which is then hit by crystal shards from above.
Video beats (t = 0 at frame 36; the first green sparks at the body's side):
- 0–133 ms (f36–40): green sparks at the body's right side (f36–38) and a green core inside the body (f38–40).
- 133–533 ms (f40–52): a green-white core at the body; a radial green burst with cyan streaks and sparks (f42–50); the body pulses brighter (f44–52).
- 533–733 ms (f52–58): hex shards burst from the body's centre with white sparks at their tips (f52–58).
- 767–1567 ms (f59–83): a large green-white hex-shard burst grows over the field (about 30 shards); the camera tracks it; a white starburst at its core (f73–83).
- 1567–1967 ms (f83–95): the swarm pulls in and holds; concentric green ring outlines (f86–90).
- 1967–2700 ms (f95–117): the swarm rolls across the field toward the defender with motion blur (f95–105); a blue-white core crosses the field (f103–111) and fades (f113–117).
- 2733–3000 ms (f118–126): camera cut to a tree landscape (f120–126); the defender stands in the field (f126–128).
- 3067–3467 ms (f128–140): contact: a white-green flash at the defender's base (f130–132), a thin horizontal green line (f138), a white starburst with cyan spikes (f140).
- 3533–3867 ms (f142–152): green concentric wave rings expand round the defender (f142–152); green shards fly up and out.
- 3867–4333 ms (f152–166): a cluster of green hex crystals fills the defender's footprint; cyan sparkles at the top (f152–166).
- 4333–4700 ms (f166–176): the crystals burst and scatter as green hex shards (f168–176).
- 4700–5300 ms (f177–195): falling hex shards strike the defender (f177–185); its HP bar drops (f183).
- 5300–6633 ms (f195–235): the defender is down (f209–235, UI text not mapped); Zygarde's silhouette returns over the day stage from f197 (after the move).
Pokémon: 0–400 ms the body glows (the card's rim glow, brace); 400–1000 ms it holds the core and releases the hex burst; after 1000 ms it is off camera until the end.
Camera & screen: a camera pan that tracks the swarm (f59–117); a cut to a tree landscape at f120 (2733 ms); a white starburst at the defender at contact (f132, f140); the swarm is local to the field. Board: the pan and cut → none (card motion only); the white starburst → impactFlash (top) and starFlare on the defender at contact; the swarm's roll → terrain 'wave' from attacker to defender (no camera move).
Palette: #41F058, #B8F87A, #E9FFC4, #7FF7FF, #1E5E1E
Closest generic: earthquake (ground physical 3): from memory, unverified (Appendix A has no Ground entry). Must differ: a green hex-shard swarm rolls across the field and gathers over the defender, not a shock through the ground.
Board mapping:
- 0–400: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5) · aura(attacker, hz 2, alpha 0.6)
- 300–1000: shards(attacker, count 12, arc 360, distance 1.0) · ring(attacker, kind 'floor', count 2, r0 0.3, r1 1.2) · 600–1000: terrain(attacker, kind 'wave', radius 1.4) — the swarm rolling to the defender
- 1000–1180: impactFlash(defender, top) · 1000–1400: starFlare(defender, arms 'ring', width 0.3) · 1000–1800: shards(defender, count 10, arc 360, distance 1.1) · ring(defender, kind 'floor', count 3, r0 0.3, r1 1.5)
- 1000–1800: vignette(defender, maxAlpha 0.45) · 1000: particles(defender, count 22, kind shard, colour #41F058)
- attacker brace (wind-up 0 → 0.7 c, settle 0.7 c → 1.1 c, glow 0.6), defender knock 0.3 (heat 0.5)
- contact at 1000; total 2000
New pieces: none.
Flags: missing refs (no EV video: EB is the primary); house-rule translations (the camera pan and cut at 59–120 ms → none; the white starburst at contact → impactFlash and starFlare local); uncertainty (t0 at f36 is the first spark, the silhouette-to-body change at f22–24 is a cut and not counted; the reference's contact (f130, 3.1 s) is compressed to 1.0 s; the defender is unnamed; terrain 'wave' only approximates the swarm roll, since its ellipses are not hex shards; palette estimated by eye).
### Diamond Storm — Diancie · rock · physical · power 100
Refs: video EV (5000 ms, 30 fps, effect frames 7–130) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a halo of pink-white diamond shards orbits Diancie, then the shards fly across the arena and burst on the defender in a shower of sparkle.
Video beats (t = 0 at frame 7; the first white glint at Diancie's lower body):
- 0–433 ms (f7–20): a white glint at Diancie's lower body (f7–14), fading by f14; Diancie holds its pose; the camera holds the wide view.
- 433–633 ms (f20–26): camera push-in to a close-up of Diancie's head and chest; a white horizontal streak in the sky behind (f20).
- 633–900 ms (f26–34): horizontal scanline flicker across the whole frame over Diancie (f28–34), pink-white stripes (screen effect).
- 900–1133 ms (f34–38): camera pulls back to the wide view; the trainer appears at the right (f36); a ring of pink-white diamond shards begins round Diancie (f38).
- 1133–1700 ms (f38–56): about 10 pink-white diamonds orbit Diancie on a tilted ring (f38–56); a horizontal blue-cyan light band spans the arena behind (f40–56, full width).
- 1700–2033 ms (f56–66): a cyan halo ring round Diancie (f56–66); the diamonds widen their orbit (f58–66).
- 2033–2400 ms (f66–74): camera push-in on the crystals: they burst and fly toward the camera (f68–72), white sparkles at the edges (f68–74).
- 2400–3100 ms (f74–96): the crystals drift across the arena toward the defender (f76–96); white sparkle glints around Diancie's side (f84–92).
- 2967–3300 ms (f96–106): contact: a white-blue star bursts at the defender (f94–100) and a white-cyan sparkle cloud spreads over it (f100–106).
- 3300–3800 ms (f106–118): a bloom of pink-white shards round the defender (f108–112); a yellow radial starburst at its base (f118–122).
- 3800–4400 ms (f118–130): pink and cyan sparkle sprays over the defender (f122–126), fading (f128–130).
- 4400–4967 ms (f130–148): the crystals clear; Diancie stands at the left with a white glow at its feet (f132–138); the defender stands at the right (after the move).
Pokémon: 0–433 ms a white glint on its body (the card's glow); 433–1133 ms the body holds, the camera pushes in on its head; 1133–2033 ms the diamond halo orbits it and the cyan ring forms; after 2033 ms the crystals leave it and it holds still.
Camera & screen: a push-in to Diancie's head (433–633 ms); scanline flicker across the frame (633–900 ms); a camera pull-back (900 ms); a full-width blue-cyan light band behind the body (1133–1700 ms); a camera push-in to the crystals (2033–2400 ms); a magenta-orange screen tint in gen7 (f52–66, not in EV). Board: all camera moves → none; the scanline flicker → dropped; the full-width light band → dropped (no full-width band); the gen7 magenta tint → dropped (no mid-effect background change); the defender's white flash → impactFlash (top).
Palette: #F9C5F0, #7FF7FF, #2E7CE6, #FFFFFF, #FFE14D
Closest generic: stone-edge (rock physical 3): from memory, unverified (Appendix A has no Rock entry). Must differ: the shards orbit the attacker in a halo before flying out, and the shower falls on the defender; the colour is pink-white and cyan, not stone grey.
Board mapping:
- 0–433: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.45) · aura(attacker, hz 2, alpha 0.5) · ring(attacker, kind 'face', count 2, r0 0.4, r1 0.9, 433–1133)
- 1000–1700: orbitCharge(attacker, count 8, half 'back', r0 0.35, r1 0.5) · orbitCharge(attacker, count 8, half 'front', r0 0.35, r1 0.5) — the diamond halo (rock material)
- 1000–1180: impactFlash(defender, top) · 1000–1400: starFlare(defender, arms 'ring', width 0.3) · 1000–1600: starFlare(defender, arms 'cross', width 0.3, colour #FFE14D)
- 1000–1800: shards(defender, count 10, arc 360, distance 1.1) · rain(defender, count 10, height 1.4, spread 0.9) · vignette(defender, maxAlpha 0.45)
- 1000: particles(defender, count 22, kind shard, colour #F9C5F0)
- attacker brace (wind-up 0 → 0.7 c, settle 0.7 c → 1.1 c, glow 0.5), defender knock 0.3 (heat 0.5)
- contact at 1000; total 2000
New pieces: none.
Flags: house-rule translations (the scanline flicker at 633–900 ms, the full-width blue-cyan band at 1133–1700 ms and the gen7 magenta tint (f52–66) → all dropped; the camera push-ins and pull-back → none); uncertainty (t0 at f7 is a small white glint, confirmed by a zoom of f4–19; the text box names Diancie as the attacker, the defender is unnamed; the reference's contact at f96 (2.97 s) is compressed to 1.0 s; palette estimated by eye).
### Mighty Cleave — Iron Boulder · rock · physical · power 95
Refs: video EV (5033 ms, 30 fps, effect frames 18–146) · gen7 none
Signature read: the Iron Boulder's gold ring plates flip out round its body, then a huge gold crescent blade sweeps across the frame and cleaves the defender in a shower of orange sparks.
Video beats (t = 0 at frame 18; the close-up cut shows the gold rings already moving):
- 0–200 ms (f18–24): camera cut to a close-up of the Iron Boulder's legs and gold ring plates (f18–22); the body begins to tilt toward the camera (f24).
- 200–600 ms (f24–36): the gold plates swing and flip out round the body (f26–34); a white sun-flare behind the head (f34–36).
- 600–1000 ms (f36–48): the body spins and rolls over (f38–46), then comes back upright and smaller at f48 (1000 ms), moving toward the defender.
- 1000–1067 ms (f48–50): a yellow-white star at the body's front (f50).
- 1067–1400 ms (f50–60): a gold-yellow crescent blade appears in front of the attacker and sweeps up (f56–60), with an orange streak behind it (f54–58).
- 1400–1733 ms (f60–68): the crescent grows into a large gold hexagonal blade in front of the attacker (f58–68), with trailing motion lines.
- 1733–1933 ms (f70–76): a huge gold-orange slash streak across the whole frame with a white core (f70–76): the contact.
- 1933–2267 ms (f76–86): the defender (orange-pink bull shape) takes the hit; white stars at its head (f76–80); orange sparks and fire flares rise round it (f82–90).
- 2267–2600 ms (f86–96): the sparks fall; the defender turns grey-dark (f96).
- 2600–3133 ms (f96–112): the camera holds on the defender; the attacker is off camera at the left (f112).
- 3133–3533 ms (f112–124): the attacker returns to its home position (f120–124).
- 3533–4400 ms (f124–150): the attacker stands at home; the defender's K.O. text shows (f146–150, UI, not mapped).
Pokémon: 0–200 ms the close-up cut (no motion of the body yet); 200–1000 ms the ring plates flip out and the body spins; 1000–1400 ms it lunges forward with the blade in front; after 1400 ms the blade holds over the defender, then the body returns home by ~3.5 s.
Camera & screen: a close-up cut at f18 (start); the whole-screen gold-orange slash streak at f70–76 (1733–1933 ms); a whole-screen white core at f72–74; a yellow-white star at f50. Board: the cut → none (card motion only); the full-screen slash → a local slashArc on the defender (no full-screen streak); the white core → impactFlash (top) on the defender at contact; the speed lines → local speedRays on the defender.
Palette: #FFD84A, #FFF3B0, #FF8A1F, #C8D0DC, #3A3F55
Closest generic: night-slash (dark physical 3): from memory, unverified (Appendix A has no Dark entry). Must differ: a gold crescent blade in front of the attacker, then one large gold hexagonal blade; the defender is hit by sparks and fire, not a dark slash.
Board mapping:
- 0–400: aura(attacker, hz 3, alpha 0.5) · ring(attacker, kind 'face', count 2, r0 0.4, r1 0.9, 300–1000)
- 800–1200: slashArc(defender, sweep 120, radius 0.7, count 2, gapDeg 30, angle 45) — the gold crescent (#FFD84A, #FFF3B0, white edge)
- 1000–1180: impactFlash(defender, top) · 1000–1300: starFlare(defender, arms 'cross', width 0.3) · 1000–1400: speedRays(defender, count 16)
- 1000–1800: shards(defender, count 8, arc 360, distance 1.0) (#FF8A1F) · vignette(defender, maxAlpha 0.45) · 1000: particles(defender, count 22, kind shard, colour #FFD84A)
- attacker lunge (wind 0 → 0.4 c, strike 0.4 c → 1.0 c, recoil 1.0 c → 1.5 c), defender knock 0.45 (heat 0.5)
- contact at 1000; total 2000
New pieces: none (the gold palette is a material override on rock).
Flags: house-rule translations (the whole-screen gold-orange slash at f70–76 → local slashArc on the defender; the whole-screen white core at f72–74 → impactFlash at contact; the camera cut at f18 → none; the speed lines → local speedRays); uncertainty (EV only, no gen7; t0 at f18 is the close-up cut, the first move change is the gold plates from f24; the attacker's spin (f38–46) is not mapped, since one attacker preset applies; a green '?' icon at f4–26 is not mapped; the defender is named by the K.O. text at f146–150 (a Tauros-type bull); contact at f76 (1.93 s) is compressed to 1.0 s; palette estimated by eye).
### Ivy Cudgel — Ogerpon · grass · physical · power 100
Refs: video EV (5067 ms, 30 fps, effect frames 36–126) · gen7 none
Signature read: Ogerpon's club wrapped in a spinning green ivy ball with pale-cyan rings, which slams down into a cyan-yellow shard burst and a ground ring at the defender.
Video beats (t = 0 at frame 36; Ogerpon starts its run toward the defender):
- 0–133 ms (f36–40): Ogerpon runs in from the left with its arms back (f38–40); the camera follows.
- 133–467 ms (f40–50): it plants its feet and raises its club over its head (f42–46); pale-cyan rings flare round the club (f42–50).
- 467–733 ms (f50–58): a pale-cyan ring rotates round the club (f50–56); cyan flame-like wisps swirl at the top (f52–56).
- 733–1067 ms (f58–68): the green ivy ball forms round the club and spins (f58–66, pale green); the club is wrapped in a green-white spiral of leaves (f60–68).
- 1067–1500 ms (f68–80): the ball spins faster with pale rings round it (f70–76); it moves in an arc above the head (f76–84) with leaf chips falling off (f72–80).
- 1500–1867 ms (f80–92): the ball is brought down toward the defender in a large arc (f82–88), its rings tightening (f86–90); a bright cyan-white flash grows at the defender (f90–92).
- 1867–2000 ms (f92–96): the strike: a pale-green column rises at the defender (f92), a yellow-white burst with orange sparks (f94–96).
- 2000–2400 ms (f96–108): a cyan-yellow shard burst; dark rock chips fly up (f98–106), a cyan ring spreads along the ground round the defender (f98–108).
- 2400–2733 ms (f108–118): the chips and ring fade into a dark grey dust cloud over the defender (f108–118).
- 2733–3133 ms (f118–130): the defender stands in the dust; its HP bar drops (f124–134); Ogerpon returns to its home pose (f136–140).
- 3467–3800 ms (f140–150): Ogerpon walks back to its home position at the left (f142–150).
Pokémon: 0–133 ms it runs in (lunge); 133–1067 ms it raises the club and charges the ball (the card's rim glow); 1067–1867 ms it swings the ball down in an arc; 1867–2000 ms it strikes; after 2000 ms it recovers and returns home by ~3.8 s.
Camera & screen: a follow camera on the run (0–133 ms); the strike burst and dust are local; a bright cyan-white flash at the defender (1867–2000 ms). Board: the follow camera → none; the flash → impactFlash (top) at contact; the dust cloud → smoke on the defender; no full-screen tint in this move.
Palette: #7FFFD4, #C6FFE3, #3FA34D, #FFE14D, #0B0B0B
Closest generic: vine-whip (grass physical 1): Appendix A has one thin green vine lashing the defender's top-left with a small yellow-white spark at contact, and leaf flecks drifting up. Must differ: the club wrapped in a spinning ivy ball swings down in an arc and erupts into shards and a cyan ground ring; no whip lash.
Board mapping:
- 0–300: aura(attacker, hz 2, alpha 0.5) · 300–800: ring(attacker, kind 'face', count 2, r0 0.4, r1 0.8)
- 300–1000: orbitCharge(attacker, count 6, half 'back', r0 0.25, r1 0.45) · orbitCharge(attacker, count 6, half 'front', r0 0.25, r1 0.45) — the spinning ivy ball (leaf material)
- 1000–1180: impactFlash(defender, top) · 1000–1300: starFlare(defender, arms 'cross', width 0.3)
- 1000–1600: shards(defender, count 8, arc 360, distance 1.0) · 1000–1800: ring(defender, kind 'floor', count 2, r0 0.3, r1 1.4) · 1300–2000: smoke(defender, count 4)
- 1000: particles(defender, count 18, kind shard, colour #7FFFD4) · 1000–1800: vignette(defender, maxAlpha 0.45)
- attacker lunge (wind 0 → 0.4 c, strike 0.4 c → 1.0 c, recoil 1.0 c → 1.5 c), defender knock 0.3 (heat 0.5)
- contact at 1000; total 2000
New pieces: none (the leaf material carries the ivy ball; the dark rock chips use a shard colour).
Flags: house-rule translations (none needed: no full-screen tint; the bright flash is already local); uncertainty (EV only, no gen7; t0 at f36 is the first run frame; the swing path (f76–88) is read from EV alone and is coarse; the defender is a small pink-grey Pokémon, unnamed; contact at f92 (1.7 s) is compressed to 1.0 s; palette estimated by eye).
### Seed Flare — Shaymin · grass · special · power 120
Refs: video EV (4267 ms, 30 fps, effect frames 2–126) · gen7 USUL (used for: shape/path/count/angle)
Signature read: Shaymin sits in a green seed vortex and fires a fan of white-yellow crescent blades across the lane, which burst on Groudon in a rainbow of shards.
Video beats (t = 0 at frame 2; the first seed dots leave Shaymin):
- 0–267 ms (f2–10): cyan-white seed dots burst off Shaymin (f2–8); a yellow-white arc sweeps out from it (f8–10); the card's rim glow starts.
- 267–933 ms (f10–30): a white-cyan elliptical vortex forms round Shaymin (f10–30) with yellow arcs (f12–22) and green seed dots drifting outward (f4–30); the vortex stretches across the table at f26–30.
- 933–1133 ms (f30–36): Shaymin stands inside a white ring (f32–34); a whole-screen cyan-white flash at f36 (1133 ms) (house-rule conflict).
- 1133–1333 ms (f36–42): yellow-orange rays fan out from the centre (f38); white crescent blades start to sweep up from it (f40–42).
- 1333–1867 ms (f42–58): white crescent blades run across the lower frame from Shaymin toward the defender (f44–62, gen7 f66–94 gives the path); a yellow-green starburst at the defender's front (f46); a burst of yellow, magenta, cyan and white spikes on Groudon (f48–58).
- 1867–2400 ms (f58–74): a cyan-white flare at Groudon's legs (f58–74); magenta and cyan streaks (f60–64); white crescent sweeps across it (f70–74).
- 2400–2867 ms (f74–88): crescent blades and cyan-magenta shards; Groudon stays in the burst (f76–80); the "not very effective" text shows (f88–94, UI, not mapped).
- 2867–3267 ms (f88–100): rainbow shards fill the top of the frame (f88–96); a purple light column stands behind Groudon (f88–96).
- 3267–4133 ms (f100–126): Groudon stands in its home position (f100–126); a red flare at the top left (f116–126); Shaymin returns to its lower-left home pose (f118–126).
Pokémon: 0–933 ms the seed vortex is round Shaymin (glow); 933–1333 ms it holds still in the white ring (the card's rim glow, no lunge); after 1333 ms it stays in place and holds the blades' release (no travel); home by ~4.1 s.
Camera & screen: a cut from the stage at f0–2; a wide camera on Shaymin (f2–30); a close camera on Shaymin (f32–58); a low camera on Groudon (f64–94); a wide view again from f96 (3133 ms); a whole-screen cyan-white flash at f36 (1133 ms); a sunburst of yellow-orange rays at f38–40 (1200–1333 ms). Board: the cuts → none (card motion only); the whole-screen flash → dropped; the sunburst → local speedRays on the defender; the rainbow shards → shards on the defender.
Palette: #7CFF5B, #E9FF5E, #FFF8B0, #3FE8FF, #FF4FD8
Closest generic: seed-flare (the Appendix A generic at line 1269: a green seed pod on the defender's base with a pink-cyan star burst and a white-cyan cross beam). Must differ: the charge is a vortex round the attacker, the blades cross the lane, and the impact is a rainbow shard burst, not one pod on the base.
Board mapping:
- 0–400: aura(attacker, hz 3, alpha 0.5) · orbitCharge(attacker, count 6, half 'back', r0 0.25, r1 0.45) · orbitCharge(attacker, count 6, half 'front', r0 0.25, r1 0.45) — the seed dots (grass material: body = seed)
- 0–900: spiral(attacker, turns 1.5, r0 0.2, r1 0.7, rpm 120) — the white-cyan vortex round Shaymin
- 500–1000: volley(count 3, stagger 90, r0 0.14, r1 0.2, bow 0.3) — three white crescent blades crossing the lane; the last defines contact
- 1000–1180: impactFlash(defender, top) · 1000–1400: starFlare(defender, arms 'ring', width 0.3) · 1000–1320: speedRays(defender, count 28)
- 1000–1800: shards(defender, count 10, arc 360, distance 1.2) · slashArc(defender, sweep 120, radius 0.7, count 2, gapDeg 30, angle 45) · 1000: particles(defender, count 20, kind shard, colour #7CFF5B)
- 1000–2000: vignette(defender, maxAlpha 0.45) · 1400–2300: ring(defender, kind 'floor', count 2, r0 0.3, r1 1.5)
- attacker brace (wind-up 0 → 0.7 c, settle 0.7 c → 1.1 c, glow 0.8), defender knock 0.45 (heat 0.5)
- contact at 1000; total 2200
New pieces: none.
Flags: house-rule translations (the whole-screen cyan-white flash at f36 (1133 ms) → dropped; the sunburst at f38–40 → local speedRays; the camera cuts → none; the purple light column → not mapped); uncertainty (t0 at f2 is the first seed dots; the reference's contact at f46–58 (1.5–1.9 s) is compressed to 1.0 s, so the blades sweep in about 0.6 s (2–3× compression); brace is not a tier-3 preset in the table, used because Shaymin stays put; Groudon is the defender by the EV tag; gen7 f66–94 gives the blade count and path, EV the colours).
