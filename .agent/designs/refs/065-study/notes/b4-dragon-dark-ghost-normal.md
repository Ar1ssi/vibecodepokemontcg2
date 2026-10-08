### Core Enforcer — Zygarde · dragon · special · power 100
Refs: video EB (7733 ms, 30 fps, effect frames 0–216) — no EV video · gen7 USUL (used for: shape/path/count/angle)
Signature read: a Zygarde rising into the sky under a white-green orb, then one Z-shaped bolt of green-white light zigzagging across the field into the defender.
Video beats (t = 0 at frame 0):
- 0–600 ms: Zygarde is a black silhouette (blue-tipped cloak, white glints), standing in place (frames 0–18).
- 667–1267 ms: colour returns (brown body, green cells with white dots), stands and gathers (frames 20–38).
- 1333–1533 ms: white-blue flare with vertical cyan light columns erupts at its base (frames 40–46).
- 1600–2333 ms: camera tilts up; Zygarde rises into the sky with its cells glowing white; a yellow-green orb with cyan spark lines forms over its head (frames 48–70).
- 2400–2733 ms: a ghost copy of Zygarde trails beside it (frame 72); the orb turns white and grows (frames 74–82).
- 2800–3333 ms: sunburst: white-yellow-green rays fan out to the right of the sphere; small cyan hexagonal rings float (frames 84–100).
- 3400–3800 ms: camera cuts to the defender's side; white-cyan flare at upper left; rays converge on the defender; green spikes rise from the ground at its feet (frames 102–114).
- 3867 ms: whole-screen white flash (frame 116).
- 3933–4267 ms: a white-green zigzag bolt sweeps from lower left through the defender; yellow shards burst at it (frames 118–128).
- 4267–5067 ms: the Z holds (white core, green glow, green spikes along each leg); close-up with a dark claw-like limb of Zygarde at left (frames 128–152).
- 5133–5467 ms: a diagonal white beam crosses the Z; yellow-green burst at the defender (frames 154–164).
- 5467–5800 ms: yellow-orange ring and a white burst with green shards (frames 164–174).
- 5800–7200 ms: whiteout that fades to pure white (frames 174–216), then the battle scene fades back in (frames 218–220).
- 7533–7667 ms: normal scene; the black silhouette returns (frames 226–230).
Pokémon: colour returns at 0.67 s; the body rises into the sky at 1.6–2.3 s with its cells lit white; it drops to the lower left of frame as the sphere forms (2.4–2.7 s); the claw is the close-up's only body shot (4.3–5.1 s).
Camera & screen: cut to a sky tilt at 1.6 s; cut to the defender's wide shot at 3.4 s; whole-screen white flash at 3.87 s; close-up 4.3–5.1 s; whiteout 5.8–7.2 s. Board replacement: no camera moves; the flash becomes impactFlash on the defender at contact; the whiteout is dropped; the sunburst becomes a local widening beam; close-ups are dropped.
Palette: #FFFFFF, #B8FF8A, #F2E94A, #5FE6F5
Closest generic: thunder (electric special 3, bolt drawer). The Z-bolt is the same drawer; it must differ by being green-white, not blue-yellow jagged, with the orb charge and the widening beam in front of it.
Board mapping:
- 0–520 ms: coreCharge(attacker, lead 0, r0 0.18, r1 0.56) · orbitCharge(attacker, count 5, half 'front')
- 520–900 ms: shockRings(attacker, count 2)
- 600–1100 ms: beam(defender, kind 'widening', w 0.5) from attacker
- 800–1500 ms: bolt(defender, from 'attacker', segments 3, jag 0.5, branches 0, rerollMs 45)
- 1000–1200 ms: impactFlash(defender) · shards(defender, count 8, arc 360, distance 1.1)
- attacker rise, defender knock 0.2
- contact at 1100; total 2200
New pieces: none
Flags: house-rule translations (whole-screen white at 3.87 s → impactFlash; whiteout 5.8–7.2 s dropped; sunburst fan 2.8–3.3 s → widening beam; camera cuts and close-ups dropped) · palette override (dragon violet replaced by EB green/yellow/white) · uncertainty: in EB the orb sits above the head and coreCharge is lane-relative (lead 0 puts it on the card centre); gen7 puts the orb at the chest, so the screen-up placement is a choice · defender knock 0.2 is not in the reference (no visible defender reaction; added as the standard hit)

### Dragon Energy — Regidrago · dragon · special · power 150
Refs: video EV (6000 ms, 30 fps, effect frames 24–159) · gen7 none
Signature read: a white-lit dragon head lunging out of a cloud of magenta energy orbs into the defender in one white burst.
Video beats (t = 0 at frame 24, the first frame with any effect; frames 0–23 are a static stand with the text box):
- 0–200 ms (frames 24–30): a white puff at the top left; the camera pushes in on Regidrago.
- 200–667 ms (frames 30–44): 8–10 magenta tendrils fan out from Regidrago, each ending in a bright orb; a translucent lilac bubble inflates around it (about 1 h radius by 233 ms); by 400 ms the whole frame is magenta with dozens of orbs.
- 700–1567 ms (frames 45–71): Regidrago is white-lit (body outlined white) and holds; the orb field pulses and clusters around it, close-up framing.
- 1633–2200 ms (frames 73–90): the orb cluster gathers to a tight knot at centre, then fires white-pink rays in all directions (frames 75–87).
- 2200–2600 ms (frames 90–102): Regidrago's head, white-lit with an open red mouth, lunges along the lane toward the defender.
- 2600–2733 ms (frames 102–106): contact; a white burst with radial spikes at the defender.
- 2733–3400 ms (frames 106–126): the defender is enveloped in a pink-white cloud; Regidrago recoils, then its colour returns (frame 120).
- 3400–4500 ms (frames 126–159): a magenta residue cloud clings to the defender and fades.
Pokémon: body turns white-lit at 0.7 s; the head lunges 2.2–2.6 s with jaws open; recoils 2.7–3.4 s and its full colour returns at 3.2 s.
Camera & screen: push-in 0–200 ms; whole-screen magenta wash 200–667 ms; close-up on the orb field 0.7–1.6 s; close-up of the head at 2.2 s. Board replacement: push-in and close-ups dropped; magenta wash becomes a local aura on the attacker; the fan of rays becomes speedRays on the defender.
Palette: #FF3CF0, #BE78FF, #FFD2F5, #FFFFFF, #C828C8
Closest generic: dragon-pulse (dragon special 3). Must differ: an orb cluster that gathers and fires rays, then a head lunge; not a pulse ring.
Board mapping:
- 0–200 ms: aura(attacker, hz 2, alpha 0.6)
- 0–600 ms: orbitCharge(attacker, count 6, half 'back') · orbitCharge(attacker, count 6, half 'front')
- 200–700 ms: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.45)
- 700–1000 ms: speedRays(defender, count 28)
- 1100–1300 ms: impactFlash(defender)
- 1150–2100 ms: cloud(defender, count 8, drift 0.3, alpha 0.5)
- attacker rear-lurch, defender knock 0.3
- contact at 1100; total 2200
New pieces: radial orb-burst from a point on the attacker outward in all directions (rays from the orb cluster, not toward the defender); speedRays only centres on the defender, so it is the nearest approximation here.
Flags: house-rule translations (whole-screen magenta wash → local aura; radial ray burst → speedRays on the defender; push-in and close-ups dropped) · palette override (dragon violet → magenta) · uncertainty: the radial burst approximation above.

### Dynamax Cannon — Eternatus · dragon · special · power 100
Refs: video EV (7000 ms, 30 fps, effect frames 6–201) · gen7 none
Signature read: a magenta orb crackling with white lightning at the attacker's mouth, which grows into one white-pink blast that hits the defender.
Video beats (t = 0 at frame 6, the first frame where the spine glow brightens; frames 0–5 are the standing pose):
- 0–533 ms (frames 6–22): the spine segments glow pink-magenta and brighten; the tail coils and rises; the text box appears at 200 ms (not an effect).
- 533–1067 ms (frames 22–38): the pink spine glow pulses along the body; the head rises.
- 1133–1533 ms (frames 40–52): Dynamax growth: the body becomes a giant with red-pink spiked plates; a violet-magenta light builds at the bottom right; close-up.
- 1533–1700 ms (frames 52–57): a magenta flare at bottom centre; red-white diagonal streaks from the upper right.
- 1700–2033 ms (frames 57–67): a magenta ring arc expands from the bottom centre; black-purple jagged shapes sweep at the right; white lightning crackles at the core.
- 2033–2967 ms (frames 67–95): a white-pink core with several expanding magenta rings and white electric ticks; the rings and lightning intensify.
- 2967–3300 ms (frames 95–105): the core bursts into a white-cyan burst (95), a whole-screen pink-red tint (97–99), then the frame fills white (101–105).
- 3333–4000 ms (frames 106–126): swirling pink-white rings and red streaks in a white wash.
- 4067–5067 ms (frames 128–158): the white-pink blast fills the scene; the defender sits inside it (its HP bar appears at 4.67 s).
- 5100–5500 ms (frames 159–171): radial white-pink sunburst lines fill the screen.
- 5500–5833 ms (frames 171–181): pink smoke clouds disperse; a red horizontal beam streaks from the attacker side across to the defender.
- 5833–6500 ms (frames 181–201): the defender stands (purple, cyan-white crest flaring); the cloud clears.
- 6567–6767 ms (frames 203–209): the attacker is back at its starting size and pose.
Pokémon: the body glows along its spine 0–1.1 s; grows into the giant form at 1.1–1.5 s with red-pink plates; holds the charge to about 3.3 s; returns to its starting size at 6.6 s.
Camera & screen: close-up on the attacker from 1.1 s; whole-screen pink tint 3.03–3.10 s; whole-screen white flash 3.17–3.33 s; whole-screen radial sunburst 5.1–5.5 s; the wide camera returns at 6.6 s. Board replacement: close-ups and the camera return dropped; the tint and white flash become impactFlash on the defender at contact; the radial sunburst is dropped.
Palette: #FF2BD6, #FF3B6B, #FFFFFF, #7FF7FF, #5A1FA6
Closest generic: hydro-cannon (water special 3). Must differ: a magenta orb with rings and white lightning charges before the beam, and the blast is a white-pink burst, not a water column.
Board mapping:
- 0–800 ms: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5) · aura(attacker, hz 2, alpha 0.6) from 300 ms
- 500–800 ms: shockRings(attacker, count 3)
- 700–1100 ms: bolt(from 'attacker', segments 5, jag 0.12, branches 2, rerollMs 45)
- 800–1200 ms: beam(kind 'solid', w 0.5) from attacker to defender
- 1100–1300 ms: impactFlash(defender)
- 1100–1800 ms: cloud(defender, count 8, drift 0.3, alpha 0.5)
- attacker rise, defender knock 0.3
- contact at 1100; total 2200
New pieces: none
Flags: house-rule translations (whole-screen tint and white flash → impactFlash on the defender; radial sunburst dropped; close-ups and camera return dropped) · uncertainty: the Dynamax growth is much larger than rise's 1.12 scale, so the giant size is not reproduced · defender identity (the purple crest creature) and its position are read from the wide shots only · the 3.3 s charge is compressed to 0.8 s to fit the budget

### Eternabeam — Eternatus · dragon · special · power 160
Refs: video EB (19900 ms, 30 fps, effect frames 60–575) — no EV video · gen7 none
Signature read: a dark four-bladed star turning in a magenta vortex, its red-pink spokes and a white column aimed down onto the defender.
Video beats (t = 0 at frame 60, the first move-specific motion after the camera cut; frames 0–59 are idle sway behind the text box, not counted):
- 0–500 ms (frames 60–75): the camera now shows a rock field; the attacker lifts and turns, its purple-blue blades spread.
- 500–1000 ms (frames 75–90): the body curls into a ring-like spin; the field darkens to brown.
- 1000–1500 ms (frames 90–105): the body rotates, horizontal then diagonal, with white-tipped blades.
- 1500–2500 ms (frames 105–135): the body shrinks to a small red-pink vertical form with red particles; a white crescent curls around it (135).
- 2500–2833 ms (frames 135–145): a magenta-pink crescent arc sweeps across; a violet vortex dome appears at the top (145).
- 2833–4833 ms (frames 145–205): the magenta dome spins with a white core, then fades (200–205).
- 4833–5500 ms (frames 205–225): black screen, then a pale pink-white bloom with a faint green swirl.
- 5500–6667 ms (frames 225–260): pink-white bloom with white lightning (235); a dark spiky sphere forms at the centre (240–260).
- 6667–8000 ms (frames 260–300): the spiky sphere opens into a four-armed silver blade-star with a red-pink core.
- 8000–10333 ms (frames 300–370): the blade-star holds in the magenta swirl with a horizontal blade through the centre, then dims.
- 10333–10667 ms (frames 370–380): white four-point sparkles at the blade tips (370–375); a white ring with radial dashes forms (380).
- 10667–11000 ms (frames 380–390): a huge white ring fills the frame (385); red-pink rays spread from the centre (390).
- 11000–12000 ms (frames 390–420): whole-screen red tint with a white glow from below (395); red-pink spokes radiate; a white column rises at bottom centre (400–420).
- 12000–13000 ms (frames 420–450): a long white diagonal beam (405); the camera cuts to the defender (445).
- 13000–13667 ms (frames 450–470): the defender stands; pink beams streak from above and strike the ground around it (460–470).
- 13667–14000 ms (frames 470–480): white-pink burst with radial spikes at the defender (475–490); pink pillars from above.
- 14333–14833 ms (frames 490–505): white burst with a cyan ring spiralling around it (495–505).
- 14833–15667 ms (frames 505–530): pink-red burst with purple arcs and debris; lightning at 530.
- 15667–16333 ms (frames 530–550): whiteout.
- 16500–17167 ms (frames 555–575): fade back to the wide field; "K.O." text at 17.2 s.
- 17167–17900 ms (frames 575–597): normal battle end.
Pokémon: the attacker spins and shrinks in the 0.5–2.5 s span, becomes the blade-star at 6.7–8.0 s, and holds it until 10.3 s; no visible defender body reaction before the beams.
Camera & screen: camera cut to a rock backdrop at 0 ms; cut to the defender at 12.0 s; whole-screen magenta swirl through 0–10 s; whole-screen red tint at 11.1 s; whole-screen white ring at 10.7 s; whiteout 15.7–16.3 s. Board replacement: camera cuts dropped; the full-screen swirl becomes a local spiral around the attacker; the whiteout becomes impactFlash on the defender; the radial burst becomes speedRays on the defender; the full-screen tint and ring are dropped.
Palette: #C81EFF, #FF2E7A, #6A1FD0, #FFFFFF, #5FD8FF
Closest generic: draco-meteor (dragon special 3). Both fall from the sky onto the defender, but this is a set of pink beams from a magenta vortex and a blade-star, not meteors with cracks.
Board mapping:
- 0–500 ms: spiral(attacker, turns 2.5, r0 0.2, r1 1.1, rpm 90)
- 700–1100 ms: rain(defender, count 6, height 1.6, spread 0.9)
- 1000–1200 ms: impactFlash(defender) · ring(defender, count 2, r0 0.3, r1 1.5, kind 'floor')
- 1000–1400 ms: speedRays(defender, count 28)
- attacker spin turns 1, defender knock 0.45
- contact at 1100; total 2200
New pieces: dark blade-star, four tapered silver-black blades around a red-pink core, held then slowly spinning; no drawer draws a star of blades (glyph is rings, eyes or a five-point outline), so it needs its own drawer using the dragon tongue with a steel-like edge line.
Flags: house-rule translations (full-screen swirl → local spiral; whiteout → impactFlash; radial burst → speedRays; camera cuts and full-screen tint and ring dropped) · no EV video (EB used as primary) · uncertainty: t = 0 at frame 60 is the first move-specific motion after the cut, not a clear effect onset · compressed from 13.7 s to 1.1 s to contact (about 12x), so the blade-star and vortex are a single held image

### Nihil Light — Zygarde (Mega) · dragon · special · power 200
Refs: none — no video, no sprite, no gen7 (manifest status no-animation); no EV video
Signature read (from memory, unverified): a bright lattice of light forms around Mega Zygarde and releases into one beam at the defender.
Video beats (t = 0 at frame 0): none — no reference media.
- 0–600 ms (from memory, unverified): Mega Zygarde's cells glow and the light lattice forms around it.
- 600–1100 ms (from memory, unverified): the light gathers into one beam pointed at the defender.
- 1100–1500 ms (from memory, unverified): contact; the beam breaks against the defender.
Pokémon: (from memory, unverified) the cells glow white during the charge; no reference for the body's motion.
Camera & screen: none in the reference (no media); proposed: none beyond the board's local effects.
Palette: unknown (no reference); placeholder proposed from core-enforcer's EB palette, unverified: #FFFFFF, #B8FF8A, #F2E94A, #5FE6F5
Closest generic: solar-beam (grass special 3, beam and pillar of light). Must differ: a dragon-style lattice charge and a zigzag bolt on contact, as in Zygarde's other moves.
Board mapping (proposed, consistent with core-enforcer; unverified):
- 0–520 ms: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.56) · orbitCharge(attacker, count 5, half 'front')
- 520–900 ms: shockRings(attacker, count 2)
- 600–1100 ms: beam(defender, kind 'solid', w 0.5) from attacker to defender
- 800–1500 ms: bolt(from 'attacker', segments 3, jag 0.5, branches 0, rerollMs 45)
- 1000–1200 ms: impactFlash(defender)
- attacker brace, defender knock 0.3
- contact at 1100; total 2200
New pieces: none
Flags: missing refs · uncertainty: the entire entry is from memory (unverified); the palette, beat order and the lattice image all need a reference before design 064 uses them; the mapping copies core-enforcer's Zygarde structure as a placeholder

### Roar of Time — Dialga · dragon · special · power 150
Refs: video EV (6000 ms, 30 fps, effect frames 24–165) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a magenta-blue time orb over Dialga's head, then one white-cyan beam with violet edges that fans into parallel streaks and bursts into blue shards on the defender.
Video beats (t = 0 at frame 24; frames 14–23 are the front camera cut with the text box, not counted):
- 0–133 ms (frames 24–28): Dialga's head and neck rise; the crest spikes lift.
- 133–267 ms (frames 28–32): the wings spread wide and the crest opens; the head tip glows red.
- 267–400 ms (frames 32–36): small blue-white sparks appear above the head at top right (33–35).
- 400–700 ms (frames 36–45): a blue-magenta orb with radial sparks forms above the head; the sky darkens to deep blue (36–44).
- 700–1500 ms (frames 45–69): the orb grows; the camera pulls right; the defender's horn and head enter at lower right (57–69).
- 1500–1633 ms (frames 69–73): a white-blue spark at the head; a magenta streak (71).
- 1633–2200 ms (frames 73–90): a beam fires diagonally from the head to lower right: white-cyan core, dark-purple edges, a fan of parallel streaks, white crystal shards around it (81–89).
- 2200–2533 ms (frames 90–100): the full-width beam crosses the frame; an explosion of white-blue spikes and blue shards at the defender (94–100).
- 2533–3067 ms (frames 100–116): dark-blue splats and shards around the defender; its HP bar appears (108); the beam keeps hitting (114–116).
- 3133–3333 ms (frames 118–124): a white ring around the defender with an orange-red glow; the defender recovers.
- 3333–3667 ms (frames 124–134): blue shards on the floor; "Ce n'est pas très efficace..." text (132–134).
- 3700–4433 ms (frames 135–157): the defender stands; a blue glow at its chest (147–155); the camera cuts to the arena (157).
- 4633–5167 ms (frames 163–179): Dialga dithers in from the left (dot-pattern dissolve at 163–165), then stands fully (167–179).
Pokémon: rises and spreads its wings 0–0.27 s; the orb sits at the head 0.4–1.5 s; the beam fires at 1.6 s; Dialga is off-screen after the beam until the dithered return at 4.6 s.
Camera & screen: pull right 0.9–1.5 s; sky to deep blue 0.4–1.4 s; explosion on the defender 2.2–2.6 s; arena cut 4.4 s; dithered return 4.6 s. Board replacement: camera moves and the sky darkening dropped (the darkening becomes a local aura on the attacker); the dithered return dropped.
Palette: #FFFFFF, #52E6FF, #2E4FE0, #7A2BD6, #E14CFF
Closest generic: steel-beam (steel special 3): tight white-blue beam core with beam 'solid' and sparks. Must differ: a violet-edged beam that widens into parallel streaks, a time orb charged above the head, and blue hex shards.
Board mapping:
- 0–500 ms: orbitCharge(attacker, count 5, half 'front') · coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5)
- 300–700 ms: aura(attacker, hz 2, alpha 0.6)
- 700–1100 ms: beam(defender, kind 'widening', w 0.5) from attacker
- 1000–1200 ms: impactFlash(defender) · shards(defender, count 8, arc 360, distance 1.1)
- 1100–1600 ms: ring(defender, count 2, r0 0.3, r1 1.5, kind 'floor')
- attacker rear-lurch, defender knock 0.3
- contact at 1100; total 2200
New pieces: hexagon plate, a flat six-sided blue crystal that tumbles outward from the defender (gen7 116–131, EV 104–110 blue shards); no drawer makes flat hexagons (shards gives angular fragments), so it needs the ice material's crystal tongue drawn as a hexagon.
Flags: house-rule translations (background darkening → local aura; gen7 time-warp swirl and background change dropped; camera moves and the dithered return dropped) · uncertainty: t = 0 at frame 24 (the 14 cut is excluded); the EV beam is diagonal (head to lower right) and gen7's is horizontal, mapped to the board's lane; the orb is above the head in EV, so coreCharge's lane-relative lead is an approximation; the "not very effective" text is not drawn

### Spacial Rend — Palkia · dragon · special · power 100
Refs: video EV (6967 ms, 30 fps, effect frames 32–179) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a gold-pink vortex around Palkia, then thin white rift lines stretched across the field and a pink crescent slash that breaks the defender in a shatter of violet glass.
Video beats (t = 0 at frame 32, the first frame with the dark rift smear behind the defender; frames 0–31 are idle with rain and the text box from frame 21):
- 0–133 ms (frames 32–36): a dark grey rift smear opens behind the defender at top right and spreads (36–40).
- 133–333 ms (frames 36–42): Palkia's head pearl glows silver-grey (40–42); the camera closes in.
- 333–667 ms (frames 42–52): camera front; Palkia rises onto its hind legs with its spikes out (44–52).
- 700–767 ms (frames 53–55): Palkia turns toward the camera; its body fills the frame.
- 833–1033 ms (frames 57–63): a golden-orange vortex builds around Palkia (57–59), turning pink-white (61–63).
- 1033–1500 ms (frames 63–77): the vortex carries cyan radial lines (65) and black rift slabs (69–73).
- 1500–1767 ms (frames 77–85): dense spiral with radial cyan streaks and dark spiky rifts; the vortex sharpens.
- 1767–1900 ms (frames 85–89): a pink ring expands from the centre; the vortex shrinks; wide camera.
- 1900–2100 ms (frames 89–95): thin white horizontal rift lines stretch across the field (91–93); dark orbs gather on them (95).
- 2100–2367 ms (frames 95–103): dark orbs cluster around the centre; the defender enters at right (103).
- 2367–2533 ms (frames 103–108): the defender stands large at right; a pink crescent swoops around its wing (105); the hit lands at 108.
- 2533–2833 ms (frames 108–117): white-pink burst with cyan spikes and purple streaks; the defender recoils (110–116).
- 2833–3167 ms (frames 117–127): diagonal pink, purple and cyan lines cross the frame; "C'est peu efficace!" at 126.
- 3167–3867 ms (frames 127–148): a magenta star in the defender's body; a purple vertical beam (134); radial lines; the defender recovers.
- 3867–4267 ms (frames 148–160): whiteout with purple-white angular shards filling the frame; the field shows through.
- 4267–4867 ms (frames 160–178): shards fly apart around the defender; white fades to purple lines.
- 4867–5767 ms (frames 178–205): Palkia returns (tail at left); a dust ring under its tail (183–187); the field clears.
Pokémon: the attacker stays in place and rises to its hind legs (0.3–0.7 s), then holds the vortex; it does not lunge; it returns to its starting pose at 4.9–5.8 s.
Camera & screen: rift smear behind the defender 0–0.4 s; camera close-up 0.13–0.3 s; camera front 0.33–0.7 s; wide camera 1.9 s; defender cut-in 2.4 s; whiteout 3.9–4.3 s. Board replacement: camera moves dropped; the whiteout becomes impactFlash on the defender; the full-screen shatter (gen7 146–160 too) becomes local shards on the defender.
Palette: #FF7FD9, #FFC46B, #9A3CF0, #8FF6FF, #14101C
Closest generic: twister (dragon special 1, spiral vortex). Must differ: a gold-pink vortex with black rift slabs, then horizontal rift lines and a pink crescent slash, not a wind tornado.
Board mapping:
- 0–400 ms: cloud(defender, count 6, drift 0.3, alpha 0.5) (the rift smear) · 0–1000 ms: spiral(attacker, turns 2.5, r0 0.2, r1 1.1, rpm 180)
- 700–1000 ms: ring(attacker, count 1, r0 0.3, r1 1.3, kind 'face')
- 800–1100 ms: beam(defender, kind 'segmented', w 0.3) from attacker
- 900–1100 ms: cloud(defender, count 8, drift 0.3, alpha 0.5) (dark orbs gather)
- 1000–1200 ms: slashArc(defender, sweep 120, radius 0.7, count 2, gapDeg 30) · impactFlash(defender)
- 1100–1500 ms: shards(defender, count 8, arc 360, distance 1.1) · speedRays(defender, count 28)
- attacker rise, defender knock 0.45
- contact at 1100; total 2200
New pieces: none
Flags: house-rule translations (whiteout 3.9–4.3 s → impactFlash; full-screen glass shatter → local shards; the gold-pink vortex and the rift smear stay local; camera moves dropped; "C'est peu efficace!" text not drawn) · uncertainty: t = 0 at frame 32 (the first effect; frames 21–31 are idle with the text box) · the EV rift lines span the whole field, longer than the lane; mapped as a segmented beam on the lane · the defender knock 0.45 is a choice, the reference shows a repeated burst rather than one knock

### Dark Void — Darkrai · dark · status · power —
Refs: video EV (10333 ms, 30 fps, effect frames 23–309) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a violet-black void sphere with magenta cracks drops onto the defender's ground and opens into a dark dome, and the defender falls asleep under drifting Z motes.
Video beats (t = 0 at frame 23, the first move-specific motion: Darkrai tips forward as the camera tilts to the sky; frames 0–22 are idle with the text box from frame 15):
- 0–167 ms (frames 23–28): Darkrai bends forward, its head dropping toward the ground at left.
- 233–400 ms (frames 30–35): a magenta crack starburst opens at the centre between the two cards, jagged lines radiating to about 1 h.
- 400–1000 ms (frames 35–53): a violet-magenta sphere with a white core and a thin purple ring forms above the lane and grows (about 0.6 h radius by 1000 ms).
- 1000–1667 ms (frames 53–73): the sphere shrinks and drops; dark purple spores fall from it toward the ground at mid-field.
- 1667–2033 ms (frames 73–84): the sphere reaches ground level at the defender's side with a blue ring spreading across the floor (84).
- 2033–2933 ms (frames 84–111): a dark dome rises from the ground with pink rings and a violet glow; blue floor ripples spread out.
- 2933–4233 ms (frames 111–150): the dome flattens and dissolves into a dark haze; the background darkens to near black (126–150; gen7 shows the same).
- 4233–8833 ms (frames 150–288): the defender stands alone (the falling and rise are in video-3 at frames 156–231); "s'est endormi" text at frame 252 (6.9 s); Zzz motes appear at frame 288 (8.8 s).
- 8833–9533 ms (frames 288–309): blue Z motes rise over the defender and fade out; the defender sleeps through to the end.
Pokémon: Darkrai's body leans forward 0–167 ms; no further body motion is recorded in the sampled frames; the defender falls to the ground at 4.4–4.6 s (frames 156–162), then rises back into the air and sleeps (Zzz at 8.8 s). The attacker has no body reaction after the void.
Camera & screen: camera tilts up at 0 ms; background darkens to near black 3.4–4.2 s (frames 126–150; gen7 shows a full-field black). Board replacement: camera tilt dropped; the background darkening becomes a local vignette on the defender at maxAlpha 0.45 (ghost's 0.55 max is allowed but not needed).
Palette: #5B2BD6, #B43CFF, #FF3DA0, #1A1028, #6FD7FF
Closest generic: dark-pulse (dark special 3). Must differ: the dark pulse is a travelling ring with no status; this sphere forms above the lane, drops onto the defender, opens into a dome and then a sleep effect.
Board mapping (status move, no contact; c = 1000 nominal for card presets):
- 0–400 ms: aura(attacker, hz 2, alpha 0.6) · coreCharge(attacker, lead 0.42, r0 0.18, r1 0.4)
- 400–1000 ms: ring(defender, count 2, r0 0.3, r1 1.4, kind 'floor')
- 600–1100 ms: projectile(attacker→defender, path 'arc', bow 0.4, r0 0.34, r1 0.4) (the void sphere falling onto the defender's side)
- 1000–1600 ms: cloud(defender, count 8, drift 0.3, alpha 0.5) (dark spores)
- 1100–1600 ms: vignette(defender, maxAlpha 0.45)
- 1400–2000 ms: ring(defender, count 2, r0 0.3, r1 1.4, kind 'floor')
- attacker brace, defender none (status: no knock)
- contact at —; total 2000
New pieces: sleep motes (blue Z glyphs rising from the defender and fading); no drawer draws a Z shape, so it needs a particle class with a 'Z' glyph or a small drawn 'Z' stroke, rising over 600 ms.
Flags: status move · house-rule translations (background darkening to near black → local vignette on the defender; the camera tilt and ground cut dropped) · missing drawer (sleep Z motes) · uncertainty: the 9.5 s effect is compressed to 2.0 s (about 4.8x), so the sleep sequence and the falling and rising of the defender are shortened or dropped; t = 0 at frame 23 is the first lean, the crack starts at frame 30

### Fiery Wrath — Moltres (Galar) · dark · special · power 90
Refs: video EV (5500 ms, 30 fps, effect frames 0–164) · gen7 none
Signature read: a crimson-pink flaming bird (Galarian Moltres) diving in a loop through a huge red-magenta fireball, then striking the defender's ground circle.
Video beats (t = 0 at frame 0: the flame bird is already on screen with its fire wings; the text box appears at frame 12, so it is not counted):
- 0–400 ms (frames 0–12): the flame bird spreads its pink-red wings at top centre; the wing tips flicker.
- 400–700 ms (frames 12–21): the bird dives down-right, leaving a pink fire trail toward the defender side.
- 700–1267 ms (frames 21–38): the bird rakes low across the field (22–34), then loops upward; at frame 36 a red-magenta fire sphere opens around it.
- 1267–2600 ms (frames 38–78): a huge red fireball (about 1.4 h radius) with a purple-blue core; the bird circles inside it; swirl rings expand (42–66); the fire fades out at 74–76 and the bird rises out of it (78–82).
- 2600–3267 ms (frames 78–98): the bird reappears above at top left and dives onto the defender's red ground circle at right; the defender's ring is visible (84–90).
- 3267–3667 ms (frames 98–110): contact: the bird hits the defender; the HP bar drops (orange at 98, red at 104–106).
- 3667–4267 ms (frames 110–128): the bird circles over the defender; the red ring shape stays on the ground.
- 4267–5467 ms (frames 128–164): the bird flies back to the left with wings wide, then slowly rises; the defender's ring fades.
Pokémon: the attacker's fire wings flicker 0–0.4 s; it dives 0.4–0.7 s; loops and circles 0.7–2.6 s; strikes the defender at 3.27 s (contact); circles 3.7–4.3 s and leaves.
Camera & screen: camera tracks right 0–0.7 s; whole-screen red-magenta wash while the fireball covers the frame (1.3–2.5 s; frames 42–76); red ground ring under the defender (2.6–4.3 s). Board replacement: camera track dropped; the full-screen wash becomes a local spiral around the attacker (no whole-screen tint); the defender ring becomes a local vignette on the defender.
Palette: #FF4D8B, #E0175A, #9B1B7A, #6A2CC0, #2A0F24
Closest generic: fire-blast (the look-test entry: fireball + tongues + flare). Must differ: the bird circles inside a fire sphere and strikes from above; no mid-air shot. Overheat (fire special 3) is the nearest table move, but it has no loop.
Board mapping:
- 0–400 ms: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5) · orbitCharge(attacker, count 4, half 'back')
- 400–1000 ms: projectile(attacker→defender, path 'arc', bow 0.2, r0 0.34, r1 0.5, tongues 7) (the bird's dive)
- 700–1200 ms: spiral(attacker, turns 2.5, r0 0.2, r1 1.1, rpm 180) (the fireball around the bird)
- 1100–1300 ms: impactFlash(defender) · speedRays(defender, count 16)
- 1100–1800 ms: vignette(defender, maxAlpha 0.45)
- 1400–2200 ms: smoke(defender, count 4)
- attacker rear-lurch, defender knock 0.3
- contact at 1100; total 2200
New pieces: none
Flags: house-rule translations (whole-screen red-magenta wash → local spiral; the defender's ground ring → local vignette; camera track dropped) · palette override (dark crimson accent #FF3D6E replaced by the reference's pink-red; the tongues use the fire tongue path with that override, as Energy Ball does for grass) · uncertainty: the defender's name is not legible in the sheets, so it is described by position only; the fireball's exact centre is the lane midpoint, approximated as attacker-centred; compression ~3x (3.27 s contact to 1.1 s)

### Hyperspace Fury — Hoopa (Unbound) · dark · physical · power 100
Refs: video EV (6500 ms, 30 fps, effect frames 22–177) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a purple-violet Hoopa-Unbound whose hands swarm out of its ring-mouth body and strike the defender one after another, each strike a magenta shard burst under floating gold-rimmed black portal rings.
Video beats (t = 0 at frame 22: the first pink tint on the attacker's body; the text box runs 12–22 and is not counted):
- 0–133 ms (frames 22–26): pink energy tint on the body; the camera cuts to a close-up (24–26).
- 133–333 ms (frames 26–32): magenta bursts at the attacker's left flank; the first arms begin to lengthen.
- 333–1100 ms (frames 32–55): magenta flames rise from the ground at the attacker's base (36–46); a white vertical light column at the body's centre (34–48); the hands fan out and extend along the lane.
- 1100–1467 ms (frames 55–66): several hands orbit the body (gen7 shows six white-gold hands in a ring at 56–68); magenta rings begin to wrap the body.
- 1467–2000 ms (frames 66–82): the body fills with pink-magenta light; a purple-gold ring vortex forms overhead (EV 67–71); gen7 shows the magenta ring around the body (70–92).
- 2000–2800 ms (frames 82–106): gold-rimmed black portal rings (yellow, black centre) float above the defender, one after another (EV 73–97); the defender is at the right on the ground.
- 2800–3733 ms (frames 106–134): hands strike the defender in turn; each strike is a magenta-pink shard burst with dark red spikes at the defender's feet (EV 98–124); the defender's HP bar drops.
- 3733–4700 ms (frames 134–163): about four more bursts with cyan beams between the rings (gen7 134–166, EV 136–163); the defender sinks and flattens.
- 4700–5100 ms (frames 163–175): the defender recovers and stands (EV 167–177).
- 5167–5700 ms (frames 177–193): the attacker returns to its pose; the camera widens (EV 179–193).
Pokémon: the body does not move; its hands extend and orbit 0.3–1.1 s, and the hands strike the defender 2.8–4.7 s (about 6 visible hits, EV 93–163); the body stays still and does not lunge.
Camera & screen: a close-up cut at 0.1 s; the camera pans to the sky (1.5–2.0 s); the defender's cut-in at 2.1 s; the hyperspace background (gen7 black 112–118, then a violet and red swirl 124–166) is a full-screen background change. Board replacement: close-ups and pans dropped; the swirl and the black cut become a local aura on the attacker and a local vignette on the defender; the magenta sky ring becomes ring(attacker).
Palette: #E0189A, #FF4FD8, #7A2AB8, #F5C542, #0B0716
Closest generic: night-slash (dark physical 3: shadow slash, slashArc, knock). Must differ: the strikes are magenta shard bursts from hands, not a blade slash; the gold portal rings are the signature.
Board mapping:
- 0–500 ms: aura(attacker, hz 2, alpha 0.6) · orbitCharge(attacker, count 6, half 'back')
- 250–900 ms: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5) · 500–1100 ms: spiral(attacker, turns 2, r0 0.2, r1 1.0, rpm 180) (the hands' orbit)
- 600–1100 ms: ring(attacker, count 2, r0 0.3, r1 1.3, kind 'face')
- 600–1000 ms: shards(defender, count 5, arc 240, distance 0.8) (hits 1–2)
- 1000–1400 ms: ring(defender, count 3, r0 0.3, r1 1.4, kind 'face') (portal rings) · 1050–1300 ms: shards(defender, count 8, arc 360, distance 1.1) · impactFlash(defender)
- attacker lunge, defender stagger (hits 3, strength 0.45, gapMs 220)
- contact at 1050; total 2200
New pieces: hands drawer: six white-gold hands (grey-blue fists with gold cuffs) that orbit the attacker and then extend along the lane to strike; no drawer draws a fist, so it needs a small silhouette unit (one line).
Flags: uncertainty: multi-hit (about 6 visible hits in the reference, compressed to 3 with the damage on the last) · house-rule translations (full-screen hyperspace swirl and black cut → local aura and vignette; close-ups and camera pans dropped) · uncertainty: the gold portal ring needs an accent colour on the ring drawer (its material is magenta); the body does not move in the reference, so the attacker 'lunge' is the nearest card preset, not a match

### Ruination — Chi-Yu · dark · special · power 1
Refs: video EV (6000 ms, 30 fps, effect frames 0–172) · gen7 none
Signature read: an orange-red Chi-Yu sinking into a black-spiked ground pit with crimson fractures, then a dark spike field rising under the defender.
Video beats (t = 0 at frame 0: Chi-Yu's red fins are already fluttering; the text box appears at frame 14 and is not counted):
- 0–400 ms (frames 0–12): the red fins flutter in place; no effect yet.
- 467–600 ms (frames 14–18): the body tilts forward and the fins fan out in front.
- 600–1100 ms (frames 18–33): the body sinks and drifts down-left; the fin tips point down (24–33).
- 1100–1567 ms (frames 33–47): the body hovers low and moves right toward the centre of the field.
- 1567–2100 ms (frames 47–63): dark-red ground fractures open under Chi-Yu (51–53: pink crescent streaks and black splats); the first black spiked shards rise (57–63).
- 2100–2600 ms (frames 63–78): the pit fills with black spiky shards and red cracks; magenta and violet orbs rise from it (61–79).
- 2600–3100 ms (frames 78–93): dense black-red spikes surround Chi-Yu; the body is pulled down into them (83–90).
- 3100–3333 ms (frames 93–100): Chi-Yu sinks into the pit; the pit ring glows red.
- 3333–3600 ms (frames 100–108): the screen darkens to near black with red at the left (102); a camera cut to the defender at right (104–106).
- 3600–4000 ms (frames 108–120): black-red vertical pillars rise under the defender with pink streaks across the ground; the defender is hit at about frame 120 (4.0 s).
- 4000–5000 ms (frames 120–150): a full-screen red-magenta tint with vertical pillars and violet orbs; the pit ring stays at the defender's feet.
- 5000–5833 ms (frames 150–175): the spikes fade; the defender drops and rises (159–165); Chi-Yu returns to its place at right (175–179).
Pokémon: Chi-Yu's fins flutter 0–0.4 s; it sinks and drifts 0.6–1.1 s, sinks into the pit at 3.1–3.3 s, and returns at 5.8 s; the body stays inside the pit 3.3–4.0 s.
Camera & screen: camera tracks the attacker 0–1.5 s; screen darkens to near black 3.3–3.6 s; camera cut to the defender 3.5 s; full-screen red-magenta tint 4.0–5.0 s with vertical pillars. Board replacement: camera moves and the cut dropped; the darkening and the full-screen tint become a local vignette on the defender (maxAlpha 0.45); the vertical pillars become pillar(defender) from below.
Palette: #0E0A0C, #E0142E, #FF2A7A, #9B2AE0, #FF7A3A
Closest generic: dark-pulse (dark special 3). Must differ: the ground pit of black spikes that the attacker sinks into, not a travelling pulse.
Board mapping:
- 0–400 ms: aura(attacker, hz 2, alpha 0.6) · 400–1000 ms: orbitCharge(attacker, count 5, half 'front') (the red fins)
- 700–1100 ms: terrain(defender, kind 'crack', radius 1.4) · 800–1300 ms: pillar(defender, from 'below', height 1.8, w 0.6)
- 900–1200 ms: cloud(defender, count 6, drift 0.3, alpha 0.5) · 1000–1600 ms: vignette(defender, maxAlpha 0.45)
- 1100–1500 ms: shards(defender, count 6, arc 360, distance 0.8) · 1100–1300 ms: impactFlash(defender)
- attacker stomp, defender sink
- contact at 1100; total 2200
New pieces: none
Flags: house-rule translations (full-screen red tint 4.0–5.0 s and the darkening 3.3–3.6 s → local vignette; camera cut and tracks dropped) · shared move (the move is listed for four owners; the reference is Chi-Yu) · uncertainty: the pit is compressed about 3.6x; the attacker's sink into the pit is mapped to 'stomp', the nearest card preset; power 1 is as listed in signature-list.tsv and is not used by the mapping

### Wicked Blow — Urshifu · dark · physical · power 75
Refs: video EV (4000 ms, 30 fps, effect frames 21–110) · gen7 none
Signature read: a black-and-white Urshifu (Single Strike style) spinning a crimson-and-white ring of slash arcs around itself, then dashing into the defender with a yellow starburst on contact and a crimson crescent of slashes sweeping over it.
Video beats (t = 0 at frame 21: the camera cuts to Urshifu's close-up as its fists come up; frames 0–20 are the static lane with the text box, not counted):
- 0–167 ms (frames 21–26): Urshifu stands with its fists raised; a crimson glow builds on the body at 26.
- 233–400 ms (frames 28–33): a white-pink flare bursts around the body with spiky white rays (28–29); a white ring of arcs starts rotating around the body (30–33).
- 400–800 ms (frames 33–45): crimson-black flame shapes rise off the body and ground; the white ring keeps turning; magenta streaks at the top (36–39).
- 800–967 ms (frames 45–50): the flames fall away; Urshifu crouches and leans forward.
- 967–1300 ms (frames 50–60): Urshifu dashes along the lane toward the defender; two motion-blurred afterimages trail it (49–57); a white spiral streak at its fists (54–56).
- 1333–1433 ms (frames 61–64): contact; a yellow-white starburst on the defender (64–68).
- 1567–1833 ms (frames 68–76): a magenta-blue flash, then a red-white ring that expands around the defender (69–72), and the defender's HP bar drops.
- 1833–2267 ms (frames 76–89): crimson crescent arcs sweep across the defender's body with white edges (78–89); "Coup critique !" text at 81.
- 2267–2967 ms (frames 89–110): the arcs fade; the defender stands; Urshifu holds its pose in the lane (95–110).
- 2967–3267 ms (frames 110–119): the camera widens; Urshifu returns to a neutral stance (111–119).
Pokémon: fists raise 0–0.2 s; a crouch and a forward lean 0.8–1.0 s; a dash of about 0.3 s with two trailing afterimages to contact at 1.43 s; it holds at the defender's side from 2.2 s and returns to neutral at 3.2 s.
Camera & screen: a cut to the close-up at 0 ms (no move); a wide shot cut at 3.0 s; a whole-screen red-white flash at 0.27 s (the white-pink flare covers the frame); the defender's flash fills the screen at 1.6 s. Board replacement: the cut and the wide shot are dropped; the whole-screen flash at 0.27 s becomes a local aura on the attacker; the defender's flash becomes impactFlash on the defender; the screen-wide spikes become speedRays on the defender.
Palette: #FF3D6E, #E8142F, #1A0A10, #FFF08A, #7A3CFF
Closest generic: night-slash (dark physical 3, shadow slash, slashArc, knock). Must differ: the crimson-and-white ring of arcs is spun around the attacker before the dash, and the move ends with a crimson crescent sweep on the defender, not a single slash.
Board mapping:
- 0–267 ms: aura(attacker, hz 2, alpha 0.6)
- 267–1000 ms: ring(attacker, count 2, r0 0.3, r1 1.3, kind 'face') (the white ring of arcs) · spiral(attacker, turns 2, r0 0.2, r1 0.9, rpm 180) (the crimson flames)
- 1000–1300 ms: beam(defender, kind 'solid', w 0.3) from attacker (the dash streak)
- 1150–1350 ms: impactFlash(defender) · shards(defender, count 6, arc 360, distance 0.9)
- 1200–1700 ms: ring(defender, count 2, r0 0.3, r1 1.4, kind 'floor') (the red-white ring)
- 1200–2100 ms: slashArc(defender, sweep 120, radius 0.7, count 3, gapDeg 30, angle 45) (the crimson crescent arcs)
- attacker dash (with two trail ghosts), defender knock 0.45
- contact at 1150; total 2300
New pieces: none
Flags: house-rule translations (whole-screen flare at 0.27 s → local aura; spiky full-screen rays → speedRays on the defender; camera cut and wide shot dropped) · compression (reference contact at 1.43 s, compressed to 1.15 s to fit the tier; the reference effect runs about 3.0 s, compressed to 2.3 s) · palette from the EV frames · uncertainty: the attacker's white ring is taken as arcs (ring 'face'), not the solid body the reference shows at the crouch

### Astral Barrage — Calyrex (Shadow Rider) · ghost · special · power 120
Refs: video EV (8032 ms, 29.88 fps, effect frames 14–238) · gen7 none
Signature read: a violet spectral steed rearing in a field of magenta ground flames and purple spires, then a black-violet dome that swallows the defender before a white-cyan burst.
Video beats (t = 0 at frame 14: the first spectral sparkle on the mount's chest; frames 0–13 are idle with the text box from frame 4):
- 0–134 ms (frames 14–18): blue-violet sparks at the mount's chest and forelegs; the camera cuts to a wide shot at 18, with magenta ground flames at the bottom edge.
- 134–535 ms (frames 18–30): the mount rears; magenta ground flames rise at its base and around the defender's side (20–36).
- 535–1071 ms (frames 30–46): purple orbs and magenta flame bushes spread across the ground; the mount holds in place.
- 1071–1606 ms (frames 46–62): the mount rises on its hind legs; violet spectral wisps stream from its mane; the defender stands at left.
- 1606–2075 ms (frames 62–76): a close camera; the mount lunges toward the camera with a motion blur (66–72); a violet ring of streaks sweeps across.
- 2075–2610 ms (frames 76–92): purple spires erupt upward around the mount (74–92); a teal plant-like base shape rises under the mount (84–100).
- 2610–3481 ms (frames 92–118): the spires fade; the mount's head fills the left of frame in a close-up (102–118).
- 3481–4552 ms (frames 118–150): a violet dome rises from the ground at the defender's side (120–130); it turns black with violet mottling (130–146).
- 4552–4886 ms (frames 150–160): the dome darkens to near black; the defender is inside it; a cyan-white burst at the centre (158–162).
- 4886–5890 ms (frames 160–190): purple ring rings expand around the dome (174–190); purple spires and cyan sparks fan out (162–178).
- 5890–6560 ms (frames 190–210): the dome floods with magenta lattice (194–202) and fades to a pink glow (204–210).
- 6560–7497 ms (frames 210–238): the pink glow fades; the defender stands again; the mount returns to its starting pose (222–238).
Pokémon: the mount sparkles 0–0.13 s; rears 0.13–0.5 s; lunges toward the camera 1.6–2.0 s (motion blur); holds the spires 2.0–2.6 s; returns to its starting pose 6.6–7.5 s.
Camera & screen: a cut to the wide shot at 0.13 s; a whole-screen violet tint 1.6–2.0 s (the lunge); a close-up 2.6–3.4 s; a white-cyan flash at the defender 4.8–5.1 s. Board replacement: camera cuts and close-ups dropped; the whole-screen violet tint becomes a local vignette on the defender (maxAlpha 0.55, which ghost allows); the white-cyan burst becomes impactFlash on the defender; the magenta lattice floods the dome, so it becomes a local cloud.
Palette: #7A3CFF, #C9A8FF, #E43BE0, #1A0A2E, #7FF7FF
Closest generic: shadow-ball (ghost special 3: a dark sphere with violet rim). Must differ: a rising dome that swallows the defender from the ground, and the violet spires around the attacker; a shadow ball is a thrown sphere.
Board mapping:
- 0–400 ms: aura(attacker, hz 2, alpha 0.6) · orbitCharge(attacker, count 4, half 'back')
- 400–900 ms: pillar(attacker, from 'below', height 1.2, w 0.4) (the violet spires around the mount)
- 600–1000 ms: ring(defender, count 2, r0 0.3, r1 1.4, kind 'floor')
- 700–1000 ms: projectile(attacker→defender, path 'straight', r0 0.34, r1 0.5, tongues 5)
- 1000–1200 ms: impactFlash(defender) · vignette(defender, maxAlpha 0.55)
- 1050–1500 ms: cloud(defender, count 8, drift 0.3, alpha 0.6) (the dark dome)
- attacker brace, defender stagger (hits 2, strength 0.4, gapMs 180)
- contact at 1100; total 2200
New pieces: violet dome: a hemisphere rising from the defender's floor, black core with violet mottling and a violet rim, held then fading; no drawer draws a dome, so it needs a ghost-material unit (a half-ellipse, rim alpha 0.6, mottling from value noise) .
Flags: house-rule translations (whole-screen violet tint 1.6–2.0 s → local vignette at 0.55; white-cyan flare → impactFlash; camera cuts and close-ups dropped; magenta lattice → local cloud) · compression (reference contact at 4.8 s, compressed to 1.1 s, about 4.4x; the 7.5 s effect is compressed to 2.2 s) · uncertainty: the defender's name is not legible at this scale, so it is described by position; the dome is read from frames 120–160 only; the 'stagger' with two hits is a choice, the reference shows one burst

### Moongeist Beam — Lunala · ghost · special · power 100
Refs: video EV (8600 ms, 30 fps, effect frames 29–255) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a violet-winged Lunala spreading its moon-crested wings in a close-up, a white-blue orb glowing at its chest, then a cyan-white beam that bursts across the lane into the white lion-like defender.
Video beats (t = 0 at frame 29: the camera cuts from the wide shot to the close-up of Lunala's spread wings; frames 0–28 are the static wide shot with the text box from frame 15):
- 0–233 ms (frames 29–36): wings spread wide, the gold crescent crests glow; a white cloud puffs at the ground (32–36).
- 233–533 ms (frames 36–45): a golden-white star flash at the top (42); the wings hold open with white sparks.
- 533–1133 ms (frames 45–63): the wings hold; the chest glows white (48–63); gold stars around the base.
- 1133–1400 ms (frames 63–71): white-blue energy converges at the chest; small blue sparks (68–71).
- 1400–2400 ms (frames 71–101): a white-blue orb forms at the chest; a translucent halo grows (104); the wings close in toward the body (74–101).
- 2400–2900 ms (frames 101–116): the orb bulges with radial white streaks (110–116); the wings tuck around it.
- 2900–3300 ms (frames 116–128): the orb spins with white sparkles; the camera cuts to the defender side (128–130).
- 3367–3967 ms (frames 130–148): the camera tracks the orb as it moves toward the white lion-like defender; a silver-blue crescent arc sweeps (133–145).
- 3967–4467 ms (frames 148–163): a horizontal cyan-white beam crosses the lane, with violet streaks beside it (148–154); a cyan ring forms around the defender (157–160).
- 4467–4767 ms (frames 163–172): contact: a white-cyan starburst with blue spikes at the defender (163–172); the HP bar drops.
- 4767–5467 ms (frames 172–193): repeated bursts with cyan and violet spikes at the defender; a white ring expands (187); a dark star at 193.
- 5533–5933 ms (frames 195–207): another white-cyan burst (195–198), then blue-violet clouds (201–207); "C'est peu efficace!" at 207.
- 6033–6700 ms (frames 210–230): the white lion-like defender stands in a blue glow (213–219), then stands alone.
- 6733–7533 ms (frames 231–255): Lunala returns to the wide shot (249–255).
Pokémon: the wings spread 0–0.4 s; the chest glows and the orb forms 0.6–2.4 s; the wings close in 1.5–2.4 s; the wings hold open again to the wide shot at 7.5 s; the body stays in place; no lunge.
Camera & screen: a cut to the close-up at 0 ms; cut to the defender side at 3.3 s; a dark night wash; a whole-screen white-cyan flash at 4.5–4.8 s and again 5.5–5.9 s; the wide shot returns 7.5 s. Board replacement: close-ups and camera cuts dropped; whole-screen flashes become impactFlash on the defender; the night wash is dropped (the sky stays as the table); the cyan burst becomes a local ring on the defender.
Palette: #E8F7FF, #5FE6F5, #7A4FFF, #FFD86B, #0B1733
Closest generic: shadow-ball (ghost special 3, a dark sphere with a violet rim). Must differ: the reference is a white-blue crescent orb charged at the chest, then a cyan beam, not a thrown dark sphere.
Board mapping:
- 0–400 ms: aura(attacker, hz 2, alpha 0.6) · coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5)
- 200–800 ms: orbitCharge(attacker, count 5, half 'back') (the crescent crest) · 500–900 ms: shockRings(attacker, count 2)
- 700–1100 ms: beam(defender, kind 'solid', w 0.5) from attacker · 900–1150 ms: impactFlash(defender)
- 1000–1300 ms: ring(defender, count 2, r0 0.3, r1 1.4, kind 'face') · 1100–1500 ms: starFlare(defender, arms 'cross')
- 1150–1900 ms: shards(defender, count 8, arc 360, distance 1.1)
- attacker rise, defender knock 0.3
- contact at 1150; total 2300
New pieces: none
Flags: house-rule translations (whole-screen white-cyan flashes 4.5–5.9 s → impactFlash and a local ring; camera cuts, close-ups and the night wash dropped) · palette override (ghost violet → moon white-cyan; the violet wings stay as the attacker's accent) · compression (contact at 4.47 s compressed to 1.15 s, about 3.9x; the 7.5 s effect compressed to 2.3 s) · uncertainty: t = 0 at frame 29 (the cut to the close-up); the beam path is from gen7 (the orb fires along the lane), not visible in the EV camera

### Shadow Force — Giratina · ghost · physical · power 120
Refs: video EV (9967 ms, 30 fps, effect frames 18–297) · gen7 USUL (used for: path: the strike comes from the upper-left of the defender, not straight down)
Signature read: a black-violet Giratina sinking into a dark shadow pool that spreads across the floor, then reappearing above-left of the defender and diving in with a cyan-white burst and violet shards.
Video beats (t = 0 at frame 18: the first change in Giratina's head and tendrils; frames 0–17 are a slow camera drift around a near-static Giratina, not counted):
- 0–400 ms (frames 18–30): the tendrils and head sweep forward; the camera drifts around the close-up.
- 400–1000 ms (frames 30–48): the head and tendrils fold down toward the lane; the body tilts left.
- 1000–1500 ms (frames 48–63): the head points down and left at the ground; the text "disparaît instantanément" appears (63–69).
- 1500–2000 ms (frames 63–78): the body lifts out of frame upward; the floor turns blue-white and the camera tilts up (72).
- 2000–2800 ms (frames 78–102): Giratina drops toward the floor; its underside sinks into a black-violet shadow void (87–90); a dark pool spreads under it (93–108).
- 2800–3300 ms (frames 102–117): the pool covers the floor; Giratina is gone (111–117).
- 3300–4400 ms (frames 117–150): the dark floor clears; the trainer walks in (126–147); lightning crackles in the sky above the defender (150–162).
- 4800–5000 ms (frames 162–168): a cyan-white burst with a black spike star at the defender (165); violet-black shards burst outward (168–174).
- 5200–6200 ms (frames 174–204): Giratina reappears large above-left of the defender and sweeps down diagonally (177–204); black and violet shadow shards swirl around the defender (171–198).
- 6200–6600 ms (frames 204–216): the body dives at the defender from the left; cyan spikes flash (213–216).
- 6600–6900 ms (frames 216–225): cyan-white star burst on the defender (219, 222); a purple-white radial burst (225).
- 7000–7400 ms (frames 228–240): violet shards fly out and fall (228–234); the white lion-like defender stands (237).
- 7400–8200 ms (frames 240–264): the white lion-like defender stands in the purple-tinted arena; "C'est peu efficace !" (243–261); dark-purple shards fade on the defender (264–267).
- 8300–9300 ms (frames 267–297): Giratina returns to an idle lane pose at the attacker's side (270–297).
Pokémon: the head and tendrils sweep and fold 0–1.0 s; the body sinks into the shadow pool 2.0–2.8 s and vanishes by 3.3 s; it reappears above-left and dives 5.2–6.6 s; it strikes the defender at 6.6 s; it returns to an idle lane pose 8.3–9.3 s.
Camera & screen: camera drift 0–0.4 s; camera tilt to the sky 1.5–2.0 s; close-up cuts throughout; the floor pool and the sky lightning are local to the lane; whole-screen cyan-white flash at 4.8–5.0 s and purple-white flash at 6.6–6.9 s. Board replacement: camera drifts, tilts and cuts dropped; the pool becomes a local cloud and terrain crack on the attacker's footprint; both whole-screen flashes become impactFlash on the defender; the sky lightning is dropped.
Palette: #0E0A14, #6B2BD9, #B56BFF, #5FF2FF, #FFFFFF
Closest generic: phantom-force (ghost physical 3, a vanish-then-strike). Must differ: a dark shadow pool sinks the attacker first, then a strike from above-left with a cyan-white burst and violet shards; phantom-force has no pool.
Board mapping:
- 0–400 ms: aura(attacker, hz 2, alpha 0.6)
- 0–700 ms: cloud(attacker, count 8, drift 0.3, alpha 0.6) (the shadow pool under the attacker)
- 300–900 ms: terrain(attacker, kind 'crack', radius 1.4) (the dark pool on the floor)
- 700–1000 ms: vignette(defender, maxAlpha 0.55)
- 1000–1200 ms: slashArc(defender, sweep 120, radius 0.7, count 2, gapDeg 30, angle 45) · impactFlash(defender)
- 1100–1400 ms: shards(defender, count 8, arc 360, distance 1.1) (the violet shards)
- attacker dash (with two trail ghosts), defender knock 0.45
- contact at 1100; total 2200
New pieces: none
Flags: house-rule translations (whole-screen cyan-white and purple-white flashes → impactFlash; sky lightning and camera drifts dropped; the floor pool → local cloud and crack) · compression (EV contact at 6.6 s compressed to 1.1 s, about 6x; the 9.3 s effect compressed to 2.2 s, so the vanish is shortened and the reappearance is folded into the dash) · gen7 used for the strike path (the upper-left approach) · the EV strike is a single dive; the mapping keeps one hit, as the brief requires · uncertainty: the defender is described by position only (its species is not legible at this scale); the mapping uses the EV colours and the gen7 path only

### Spectral Thief — Marshadow · ghost · physical · power 90
Refs: video EB (6100 ms, 30 fps, effect frames 30–180) — no EV video · gen7 USUL (used for: shape/path/count/angle)
Signature read: a teal copy of Marshadow dashes in and leaves a violet pool under its stop point; a tall dark shadow giant with two yellow eyes rises behind the defender and white stars strike it.
Video beats (t = 0 at frame 30: Marshadow's body starts to slide right; frames 0–29 are idle with the text box from frame 0):
- 0–133 ms (frames 30–34): Marshadow's body slides right; a teal glow comes on at the edge (34).
- 133–533 ms (frames 34–46): a teal silhouette dashes right with pale trails at its feet (38–44); it stops mid-field (46).
- 533–1000 ms (frames 46–60): a dark violet pool spreads under the stop point (48–56); a magenta flame column starts at the pool (58–60).
- 1000–1533 ms (frames 60–76): the magenta column and dark violet smoke fill the pool (62–68); pale violet spark streaks rise (70–74).
- 1533–2000 ms (frames 76–90): the violet fog sweeps along the ground toward the defender (78–90); white-violet ground streaks.
- 2000–2467 ms (frames 90–104): the defender (a small cream creature at the right) stands in the violet pool (92–102); a huge dark shadow with two yellow eyes starts to rise behind the defender (102–104); white stars burst at the defender (102).
- 2467–2933 ms (frames 104–118): the shadow giant towers behind the defender with yellow eyes (106–110); three white stars strike the defender (104–116); purple spark bursts at its feet.
- 2933–3533 ms (frames 118–136): the shadow column thins and falls; the defender's HP bar drops to red (134–136).
- 3533–4267 ms (frames 136–158): the column dissolves into a grey-violet mist; the defender stands (142–158).
- 4267–5000 ms (frames 158–180): a magenta flame sweep from the attacker's side (156–164); the attacker returns to its stance (168–182).
Pokémon: the teal copy slides and dashes 0.03–0.53 s with pale trails; it stops and leaves a pool 0.53–1.0 s; it does not strike the defender body; it returns to its stance at 4.3–5.0 s.
Camera & screen: no camera cuts in the EB reference; a full-screen violet fog wash 2.0–3.0 s (frames 90–118); the magenta flame sweeps the field 4.2–4.5 s. Board replacement: the whole-screen fog becomes a local cloud on the defender; the flame sweep becomes a local pillar on the attacker; no camera changes to drop.
Palette: #3FD0B0, #2E0B4A, #E040E8, #C98BFF, #0C0614, #FFD23F
Closest generic: shadow-claw (ghost physical 3, a dark claw strike). Must differ: the teal copy dash, a violet pool under the attacker's stop point, and the tall shadow giant with yellow eyes rising behind the defender; shadow claw has none of these.
Board mapping:
- 0–400 ms: aura(attacker, hz 2, alpha 0.6, colour #3FD0B0) · 200–800 ms: terrain(attacker, kind 'crack', radius 1.4)
- 400–900 ms: cloud(attacker, count 6, drift 0.3, alpha 0.5) · 800–1100 ms: pillar(attacker, from 'below', height 1.6, w 0.5)
- 1000–1300 ms: cloud(defender, count 8, drift 0.3, alpha 0.6) · 1100–1500 ms: vignette(defender, maxAlpha 0.55)
- 1050–1300 ms: impactFlash(defender) · shards(defender, count 6, arc 360, distance 0.9) · 1100–1600 ms: pillar(defender, from 'above', height 1.8, w 0.6)
- attacker dash (with two trail ghosts), defender stagger (hits 2, strength 0.4, gapMs 180)
- contact at 1100; total 2200
New pieces: shadow giant: a tall dark silhouette behind the defender with two yellow eye ovals, rising and sinking over the beat; no drawer draws it, so it needs a ghost-material silhouette unit (a tall rounded shape with two yellow eyes).
Flags: house-rule translations (whole-screen violet fog 2.0–3.0 s → local cloud on the defender; the magenta sweep → local pillar on the attacker) · palette override (the teal copy glow #3FD0B0 and the yellow eyes are outside the ghost palette) · compression (contact at 2.4 s in EB compressed to 1.1 s, about 2.2x; the 6.1 s reference compressed to 2.2 s) · uncertainty: the stars are read as three hits, but the brief's contact rule puts the damage on the last one; the defender is described by position only (its species is not legible at this scale); the mapping uses EB colours and the gen7 path

### Crush Grip — Regigigas · normal · physical · power —
Refs: video EV (2967 ms, 30 fps, effect frames 0–88) · gen7 USUL (used for: shape/path/angle: the glove comes down from above onto the defender)
Signature read: a white five-fingered glove on a black-striped, gold-tipped arm closes over the defender, then a yellow-white burst of radial beams bursts out at contact.
Video beats (t = 0 at frame 0: Regigigas's striped arm is already reaching forward; the text box is up and is not counted):
- 0–967 ms (frames 0–29): the arm extends forward and down toward the defender; the gold tips shine (17–29).
- 1000–1433 ms (frames 30–43): a white five-fingered glove forms in front of Regigigas and reaches for the defender (33–43).
- 1467–1567 ms (frames 44–47): contact; a white-blue flash with yellow sparks bursts at the defender (45–47).
- 1600–1867 ms (frames 48–56): a yellow starburst with red-yellow glow at the defender; yellow radial beams fan out (52–56).
- 1867–2000 ms (frames 56–60): the beams fade; the defender stands with a faint glow; a clenched white-orange ball sits mid-lane (58–59).
- 2000–2600 ms (frames 60–78): the orange-white ball shrinks and dims (62–73); the defender stands (74–78).
- 2633–2933 ms (frames 79–88): Regigigas is back in its stance; the defender is in the lane.
Pokémon: the arm extends 0–1.0 s; the glove reaches 1.0–1.4 s; it closes on the defender at 1.5 s (contact); Regigigas holds its arm out 1.5–2.0 s and returns to stance at 2.6 s.
Camera & screen: the camera stays on Regigigas 0–1.0 s; a whole-screen white-blue flash at 1.5 s (frames 45–47); a whole-screen yellow burst 1.6–1.9 s (frames 48–56). Board replacement: the whole-screen white flash and yellow burst become impactFlash and radial speedRays on the defender; no camera moves to drop.
Palette: #FFFFFF, #F2C230, #FFF5B0, #E8552B, #1E1B1F
Closest generic: lunge (the design-063 normal fallback: Pick A keeps today's lunge for Normal). Must differ: the glove reaches down from above and closes on the defender, then a yellow radial burst fires; lunge has no glove and no burst.
Board mapping:
- 0–1000 ms: attacker lunge (wind 0–400 ms, strike toward the defender at 400–1100 ms)
- 1100–1300 ms: impactFlash(defender) · shards(defender, count 8, arc 360, distance 1.0) (the yellow sparks)
- 1100–1500 ms: speedRays(defender, count 16) (the yellow radial beams)
- 1150–1450 ms: ring(defender, count 2, r0 0.3, r1 1.2, kind 'floor')
- defender knock 0.45
- contact at 1100; total 2200
New pieces: normal material: design 063 defines no Normal material (MATERIALS.default = fire, so a Normal move would draw fire); the palette above and a white-to-gold body, a tongue for the glove's fingers and an impact disc are the minimum (one line each in Flags). Glove drawer: a white five-fingered glove silhouette that moves in from above or the attacker's side, closes (fingers curl toward the palm over 0.4 s), then fades at contact; no existing drawer draws a hand.
Flags: house-rule translations (whole-screen white-blue flash 1.5 s → impactFlash on the defender; whole-screen yellow burst → local speedRays) · missing normal material (see New pieces) · uncertainty: t = 0 at frame 0, since the arm is already moving; the EV and gen7 defenders differ, so the colours follow EV and the path follows gen7; the glove's exact squeeze timing is not visible through the EV camera

### Judgment — Arceus · normal · special · power 100
Refs: video EV (5267 ms, 30 fps, effect frames 16–156) · gen7 USUL (used for: path: the orb is held overhead then drops straight onto the defender)
Signature read: a golden ring of light turning around Arceus's body, a white-gold orb charged over its head, then the orb dropping straight down onto the defender in a fiery radial burst.
Video beats (t = 0 at frame 16: the first Arceus glow after the "Arceus utilise Jugement !" text box; frames 0–15 are idle):
- 0–267 ms (frames 16–24): a white-gold glow and thin light streaks appear around Arceus's body (18–22); the gold ring rotates.
- 267–733 ms (frames 24–38): a golden ring of light spins around Arceus (28–38); radial sparks burst from the centre; the ring grows to about 1 h radius.
- 733–1133 ms (frames 38–50): the ring reaches full size; a bright white-gold spark forms at the top (40–46); the camera pans to the sky (46–50).
- 1133–1733 ms (frames 50–68): a golden star-core charges above Arceus (54–62); thin white-gold spike lines radiate (66); the core is now a white-gold sphere with a flare ring (68).
- 1733–2133 ms (frames 68–80): the orb is a bright fiery sphere; lightning arcs strike around it (68–78); the orb holds (76–80).
- 2133–2800 ms (frames 80–100): the orb expands into a huge yellow-orange fireball with a ring of white-yellow spikes and shock arcs (84–92); the orb's glow spreads (94–100).
- 2800–3267 ms (frames 100–114): the orb falls onto the defender (102–110); the defender is hit; a dense burst of white-yellow spikes, dust and rocks at its feet (104–116).
- 3333–3933 ms (frames 116–134): the fire burst spreads and dies down; the defender is pushed back (130–134); the camera holds.
- 3933–4667 ms (frames 134–156): the defender stands again; the attacker's ring fades; Arceus is in its stance at the end (152–156).
Pokémon: Arceus's ring spins 0.3–1.1 s; it holds the orb overhead 1.1–2.8 s; the orb drops onto the defender at 2.8–3.3 s; Arceus is still and does not lunge.
Camera & screen: a camera pan up to the sky at 1.0–1.1 s (frames 46–50); a whole-screen black and gold-yellow field 1.1–2.2 s (frames 48–82: black background, orange-yellow radial rays); a whole-screen orange flare 2.3–3.1 s (frames 84–110); the defender's cut-in at 3.3 s (frame 116). Board replacement: the pan is dropped; the black field and the orange flare become a local aura on the attacker and a local vignette on the defender; the radial rays become speedRays on the defender; the orange whole-screen flare becomes impactFlash on the defender.
Palette: #FFF3A6, #FFB347, #FF7A1A, #FFE066, #FFFFFF, #1A1200
Closest generic: fire-blast (the look-test entry: a charged orb, a projectile and a flare on contact). Must differ: the orb is charged overhead and drops onto the defender from above, not a lane projectile; the golden ring and the radial burst are the signature.
Board mapping:
- 0–400 ms: aura(attacker, hz 2, alpha 0.6) · orbitCharge(attacker, count 6, half 'back') (the gold ring)
- 300–1000 ms: shockRings(attacker, count 2) · orbitCharge(attacker, count 6, half 'front')
- 700–1200 ms: coreCharge(attacker, lead 0.0, r0 0.2, r1 0.55) (the charged orb over the head)
- 1100–1600 ms: projectile(attacker→defender, path 'straight', r0 0.5, r1 0.7, tongues 5) (the orb dropping onto the defender)
- 1100–1300 ms: impactFlash(defender) · speedRays(defender, count 28)
- 1150–1600 ms: shards(defender, count 8, arc 360, distance 1.1) · ring(defender, count 2, r0 0.3, r1 1.4, kind 'floor')
- attacker rear-lurch, defender knock 0.45
- contact at 1100; total 2200
New pieces: normal material (none in design 063; see Crush Grip) · the drop is a vertical 'projectile' (from above the attacker to the defender), which the projectile drawer does not do; use 'straight' along the lane as the nearest approximation, flagged below.
Flags: house-rule translations (whole-screen black field and orange flare → local aura, vignette and impactFlash; camera pan dropped; radial rays → speedRays on the defender) · missing normal material (see New pieces) · uncertainty: the vertical drop is mapped to a lane-level 'straight' projectile (the reference drops from directly overhead); the reference is 5.3 s, compressed to 2.2 s, about 2.4x; the defender is a yellow electric mouse-like creature at the lane's right (a lightning tail by frame 120); its name is not legible at this scale, so it is described by position only

### Multi-Attack — Silvally · normal · physical · power 120
Refs: video EB (5000 ms, 30 fps, effect frames 34–150) — no EV video · gen7 USUL (used for: shape/count/path: the crescent arcs around the attacker and three vertical bursts on the defender)
Signature read: a yellow-white glow on Silvally's fist and a sweep of yellow crescent slashes around it, then three vertical yellow-white bursts that strike the defender one after another.
Video beats (t = 0 at frame 34: the first forward step of Silvally; the text box runs 0–34 and is not counted):
- 0–400 ms (frames 34–46): Silvally steps forward and lowers its body; a faint yellow glow starts at its fist.
- 400–867 ms (frames 46–60): a bright yellow-white orb forms at the fist (50–60); thin yellow-white streaks fly off it.
- 867–1333 ms (frames 60–74): a yellow crescent slash arcs around the attacker (58–70); a second crescent sweeps the other way (62–66); the defender stands in the lane at right.
- 1333–1733 ms (frames 74–86): more crescents and yellow-orange streaks sweep across the frame (74–86); the attacker is in a yellow-orange haze (gen7 shows the same haze).
- 1733–2200 ms (frames 86–100): the attacker's glow fades; the defender (named in the on-screen French text) is hit at frame 96–100 with the first yellow-orange starburst.
- 2200–2533 ms (frames 100–110): a white-yellow burst of vertical spikes at the defender (100–110), repeated (gen7 shows three bursts at 82–92).
- 2533–3467 ms (frames 110–138): the defender bobs in the air and recovers (114–118); Silvally returns to its stance (122–138).
- 3467–3867 ms (frames 138–150): the defender is K.O. (text box at 144–148).
Pokémon: Silvally steps forward 0–0.4 s; the glow builds at its fist 0.4–0.9 s; the crescents sweep 0.9–1.7 s; the defender is hit 2.2–2.5 s (EB, with the bursts read from gen7); Silvally returns to its stance by 3.5 s.
Camera & screen: no camera cuts; the whole-screen yellow-orange haze 0.7–2.2 s (EB frames 54–100; gen7 frames 44–74); a whole-screen flash at the defender 2.2 s. Board replacement: the whole-screen haze becomes a local aura on the attacker and a local vignette on the defender; the flash becomes impactFlash on the defender.
Palette: #FFFFFF, #FFE066, #FFB020, #FF7A1A, #3A2A10
Closest generic: close-combat (fighting physical 3: a dash and a shock streak, with a stagger on the defender). Must differ: the yellow-white crescents swept around the attacker first, then three vertical bursts on the defender.
Board mapping:
- 0–400 ms: aura(attacker, hz 2, alpha 0.6, yellow-white) · coreCharge(attacker, lead 0.42, r0 0.18, r1 0.45)
- 400–1100 ms: orbitCharge(attacker, count 4, half 'back') · ring(attacker, count 2, r0 0.3, r1 1.3, kind 'face')
- 600–1000 ms: shards(defender, count 5, arc 240, distance 0.8) (hits 1–2)
- 1050–1300 ms: shards(defender, count 8, arc 360, distance 1.1) · impactFlash(defender) · speedRays(defender, count 16)
- attacker lunge, defender stagger (hits 3, strength 0.45, gapMs 220)
- contact at 1050; total 2200
New pieces: normal material (none in design 063; see Crush Grip) · the three vertical bursts are a vertical 'pillar' from the floor with a yellow-white tongue, which the pillar drawer can do with from 'below'; flagged as a reuse, not a new piece.
Flags: house-rule translations (whole-screen yellow-orange haze → local aura and vignette; whole-screen flash → impactFlash) · missing normal material (see New pieces) · compression (EB contact at 2.1 s compressed to 1.05 s, about 2x; the 5 s reference compressed to 2.2 s) · palette (Silvally's glow changes with its Memory type; the reference's yellow-white glow is used, not a type colour) · uncertainty: hit count 3 is read from gen7's three bursts; EB shows at least two bursts at 96–110, so the count is an estimate

### Relic Song — Meloetta · normal · special · power 75
Refs: video EV (13500 ms, 30 fps, effect frames 24–240) · gen7 USUL (used for: shape/path/count: the rings sweep out from the attacker toward the defender, and the note layout)
Signature read: music notes and a pale staff of lines around Meloetta, then a set of rainbow-coloured rings spinning around it and a pink-violet ring that bursts out at the defender.
Video beats (t = 0 at frame 24: the first music note and the staff lines appear behind Meloetta; the text box runs 0–24 and is not counted):
- 0–400 ms (frames 24–36): pale staff lines and the first notes appear over the lane; the ground turns pink-violet (28–36).
- 400–1000 ms (frames 36–54): the sky and ground wash out to pink-lilac; big translucent pastel bubbles spread across the field (40–54); the music notes rise.
- 1000–1533 ms (frames 54–70): a pale-cyan oval ring of spark lines turns around Meloetta's legs (54–64); rainbow notes swirl (60–70).
- 1533–2200 ms (frames 70–90): the rings spread wide around the attacker; the notes fill the frame; pale sparkle stars (74–90).
- 2200–2800 ms (frames 90–108): the rings tilt and spin; a pastel green-yellow wash covers the field (92–100); the attacker lifts and spins (100–110).
- 2867–3667 ms (frames 110–134): big spinning rings of cyan, pink and lime (114–126); the rings expand to the defender's side (124–134).
- 3667–4333 ms (frames 134–154): a violet-purple ring erupts (142–146); a lime-green ring (150–154) and a magenta ring (162–170) spin around the attacker.
- 4333–4867 ms (frames 154–170): the rings spin fast, with white arcs and flicker (154–166); the defender side is hit by a white-pink flare (158–166).
- 4867–6000 ms (frames 170–204): the rings dissolve; Meloetta lands (182–190); the defender is K.O. at 198–202.
- 6000–7200 ms (frames 204–240): the defender is gone (the KO text runs 236–264); the field is clear.
- 7200–12600 ms (frames 240–402): form change: a white-yellow orb flashes and Meloetta transforms (the red-orange form, frames 306–402); the transformation is not part of the attack.
Pokémon: Meloetta lifts and turns through the rings 1.0–2.8 s; a spin on the spot at 2.9–4.3 s; the rings hit the defender at 4.5–4.8 s; Meloetta lands 5.2–5.5 s.
Camera & screen: a pastel wash over the whole screen 0.4–1.0 s and 2.2–2.5 s; a whole-screen white-pink flare 4.5–4.8 s; a whole-screen yellow-white flash at 7.8 s (the form change). Board replacement: the whole-screen pastel wash becomes a local aura on the attacker; the white-pink flare becomes impactFlash on the defender; the form-change flash is dropped (not part of the attack).
Palette: #FFB3E6, #B3E8FF, #C7F5A8, #FFF3A8, #B07CFF, #FFFFFF
Closest generic: psychic (psychic special 3, a lens with rings). Must differ: rainbow music notes and spinning pastel rings around the attacker, not a lens and a psychic burst; the notes are the signature.
Board mapping:
- 0–600 ms: aura(attacker, hz 2, alpha 0.6, colour pastel) · orbitCharge(attacker, count 6, half 'back')
- 300–1000 ms: spiral(attacker, turns 2, r0 0.2, r1 1.1, rpm 120) (the spinning rings and notes)
- 600–1000 ms: ring(attacker, count 2, r0 0.3, r1 1.3, kind 'face') (the rings around the attacker)
- 900–1500 ms: volley(defender, count 3, stagger 90, r0 0.14, r1 0.2, bow 0.3) (the notes flying across, the last one contact)
- 1000–1200 ms: impactFlash(defender) · speedRays(defender, count 16)
- 1100–1600 ms: ring(defender, count 2, r0 0.3, r1 1.4, kind 'face') (the pink-violet ring)
- attacker spin turns 1, defender stagger (hits 2, strength 0.4, gapMs 180)
- contact at 1100; total 2200
New pieces: note drawer: small music notes (a notehead and a stem with a flag) that rise and drift across the lane in pastel colours; no drawer draws a note, so it needs a unit that draws one notehead and stem, with rainbow tint from the palette.
Flags: house-rule translations (whole-screen pastel washes → local aura; whole-screen white-pink flare → impactFlash; the form-change flash after the KO is dropped as not part of the attack) · compression (the reference attack runs 0.4–5.8 s, with the KO at 5.8 s, compressed to 2.2 s, about 2.6x) · status: relic song is a damaging special move (the rings and KO are the attack's own effects) · uncertainty: the defender is described by position only (its name is not legible at this scale); the defender colours follow the sheets; the form change at 8–13.5 s is outside the mapping

### Techno Blast — Genesect · normal · special · power 120
Refs: video EB (5200 ms, 30 fps, effect frames 28–129) — no EV video · gen7 USUL (used for: shape/path/count/angle: the energy ball forms at the cannon mouth and the beam fires down the lane)
Signature read: Genesect's cannon charges a violet-white energy ball at its mouth, then fires a violet-white beam with cyan and blue sparks across the lane into the defender in a white burst.
Video beats (t = 0 at frame 28: the cannon begins to lift and tilt toward the defender; the text box runs 0–36 and is not counted):
- 0–400 ms (frames 28–40): the cannon lifts and tilts toward the defender; Genesect's body rises; the sky stays blue.
- 400–1000 ms (frames 40–58): the camera cuts to a dark violet background with white star points; a green-yellow ring builds at the cannon mouth (45–55).
- 1000–1400 ms (frames 58–70): a violet-white energy ball grows at the cannon mouth with radial spikes (62–70).
- 1400–1800 ms (frames 70–82): the ball fills with yellow-white light; a violet beam grows from the cannon toward the defender (74–82) with white streaks.
- 1800–2133 ms (frames 82–92): the beam crosses the lane; a green-white plume trails behind it (84–92); the defender stands at right.
- 2133–2533 ms (frames 92–104): the beam hits the defender; a white-violet burst fills the frame (94–104); the defender's HP bar drops.
- 2533–2933 ms (frames 104–116): a whiteout with violet-white arcs and spirals (108–116); the defender is in the arc.
- 2933–3233 ms (frames 116–125): white smoke clouds and shards around the defender (117–125).
- 3233–3367 ms (frames 125–129): the smoke clears; the defender stands; Genesect is back in its stance.
Pokémon: the cannon lifts 0–0.4 s; the ball charges 0.4–1.4 s; the beam fires at 1.4–2.1 s and hits at 2.2 s; the body stays on its feet; it returns to its stance at 3.4 s.
Camera & screen: a whole-screen dark violet cut at 0.4–1.0 s (the night background); a whiteout 2.5–2.9 s (frames 104–116); the arena returns 3.4 s. Board replacement: the whole-screen violet cut becomes a local aura on the attacker; the whiteout becomes impactFlash on the defender; the smoke becomes a local cloud on the defender.
Palette: #A34BFF, #E9B8FF, #66E6FF, #C8FF6B, #FFFFFF, #1A0E2E
Closest generic: flash-cannon (steel special 2, a white-blue beam core with sparks; the nearest beam). Must differ: a charged energy ball at the cannon mouth, then a violet-white beam with green-yellow plume and a smoke-cloud finish, not a plain white beam.
Board mapping:
- 0–400 ms: aura(attacker, hz 2, alpha 0.6, violet) · orbitCharge(attacker, count 4, half 'back')
- 400–1000 ms: ring(attacker, count 2, r0 0.3, r1 1.3, kind 'face') · 700–1300 ms: coreCharge(attacker, lead 0.42, r0 0.18, r1 0.5)
- 800–1100 ms: beam(defender, kind 'widening', w 0.5) from attacker
- 1000–1300 ms: beam(defender, kind 'solid', w 0.5) from attacker · impactFlash(defender) · speedRays(defender, count 16)
- 1100–1600 ms: cloud(defender, count 8, drift 0.3, alpha 0.5) · shards(defender, count 6, arc 360, distance 0.9)
- attacker lunge (wind 0–300 ms, strike 300–1000 ms), defender knock 0.45
- contact at 1100; total 2200
New pieces: none beyond the normal material (see Crush Grip); the cannon-mouth glow is covered by coreCharge.
Flags: house-rule translations (whole-screen dark violet cut and whiteout → local aura and impactFlash; smoke kept local) · missing normal material (see New pieces) · palette (no normal palette exists in design 063; the colours are the reference's own) · compression (reference contact at 2.2 s, compressed to 1.1 s, about 2x; the 3.4 s effect is compressed to 2.2 s) · uncertainty: the beam's path is the lane (gen7 confirms it runs horizontally); the defender's species is not legible at this scale, so it is described by position only, with the colours taken from EB

### Tera Starstorm — Terapagos · normal · special · power 120
Refs: video EV (7334 ms, 29.59 fps, effect frames 30–140) · gen7 none
Signature read: a cyan-blue Terapagos shell spinning in a star-trail spiral, then a tall cyan light pillar rising from the ground with three tilted white-cyan rings around it, and cyan crystal shards exploding on the defender.
Video beats (t = 0 at frame 30: the camera cuts from the idle lane shot to the star shell; frames 0–29 are the idle Terapagos with its mint tail and the text box, not counted):
- 0–237 ms (frames 30–37): the cyan-blue shell appears at the trainer's side with a mint-green sparkle trail.
- 237–811 ms (frames 37–54): the shell spins; a green-white star spiral wraps around it (38–54); white sparks shed from the spiral (40–46).
- 811–1250 ms (frames 54–67): the shell glows cyan-white (55–61); a whole-screen white flash with two diagonal white-yellow beams (63–65) from the top corners; the background darkens to night blue (55–67).
- 1250–1386 ms (frames 67–71): the night wash stays; a cyan-white pillar starts to rise from the ground at the shell's base (69–71).
- 1386–2028 ms (frames 71–90): the pillar rises to the sky (71–83); a gold-yellow ring of sparks spins around its upper part (73–81); cyan star shards fan out at its base (83).
- 2028–2501 ms (frames 90–104): three tilted white-cyan rings spin around the pillar (83–101); a cyan-green diagonal streak runs from the pillar toward the defender (85–99); a yellow star flashes at the streak's end (87–99).
- 2501–2704 ms (frames 104–110): contact: cyan crystal shards burst across the defender's ground (104–108); the defender is hit (108).
- 2704–3109 ms (frames 110–122): repeated white-cyan starbursts at the defender (110–122); cyan triangle shards fly off each burst.
- 3109–3717 ms (frames 122–140): the bursts fade; the defender's yellow body shows a white glow (128–134); the background returns to daylight (140).
- 3717–6252 ms (frames 140–215): the defender stands (K.O. text at 183–185) and the field clears; Terapagos returns to its idle tail at 158 (in frames 158–185).
Pokémon: the shell (Terapagos) spins in place 0.2–0.8 s; it does not move along the lane; the shell's glow peaks at 1.0–1.2 s; the pillar rises from its base 1.4–2.0 s; the shell sits still until the end of the attack.
Camera & screen: a camera cut to the close wide shot at 0 ms; a whole-screen night-blue darkening 0.8–2.0 s (frames 55–90); a whole-screen white flash with two diagonal beams 1.1–1.2 s (frames 63–65); a whole-screen white-yellow flash at 2.7–3.1 s (frames 110–122). Board replacement: the cut is dropped; the whole-screen night darkening becomes a local vignette on the defender (maxAlpha 0.45), since a mid-effect background change is banned; the white flash becomes impactFlash on the defender; the diagonal beams become beam(defender, 'solid').
Palette: #5FF2E0, #2FB8FF, #E6FFFF, #FFE07A, #0F2A55
Closest generic: solar-beam (grass special 3: a column of light and the pillar drawer). Must differ: the pillar rises from the ground under the attacker, not down from the sky; cyan crystal shards and a three-ring halo are the signature, not a green beam.
Board mapping:
- 0–400 ms: aura(attacker, hz 2, alpha 0.6, cyan) · orbitCharge(attacker, count 6, half 'back') · 200–700 ms: spiral(attacker, turns 2, r0 0.2, r1 0.9, rpm 180)
- 400–800 ms: coreCharge(attacker, lead 0, r0 0.2, r1 0.45) · 600–1000 ms: pillar(attacker, from 'below', height 1.6, w 0.5)
- 800–1100 ms: ring(defender, count 3, r0 0.3, r1 1.4, kind 'face') · beam(defender, kind 'solid', w 0.3) from attacker · vignette(defender, maxAlpha 0.45)
- 1000–1250 ms: impactFlash(defender) · speedRays(defender, count 16)
- 1000–1300 ms: shards(defender, count 8, arc 360, distance 1.1) · 1200–1600 ms: shards(defender, count 6, arc 360, distance 0.9) (aftermath, same hit)
- attacker rise, defender knock 0.3
- contact at 1100; total 2200
New pieces: none
Flags: house-rule translations (camera cut dropped; whole-screen night darkening → local vignette on the defender; white flash → impactFlash; diagonal beams kept as one beam) · compression (reference contact at 2.5 s from t = 0, compressed to 1.1 s, about 2.3x; the 3.7 s effect (frames 30–140) compressed to 2.2 s) · uncertainty: the repeated bursts at 2.6–3.4 s are read as one hit's aftermath (the move is single-hit; the brief's multi-hit rule does not apply); 'rise' for the shell is a choice, the shell does not move along the lane in the reference · the defender is Psyduck (EV), and its yellow colour and the defender's own glow are from the sheets


