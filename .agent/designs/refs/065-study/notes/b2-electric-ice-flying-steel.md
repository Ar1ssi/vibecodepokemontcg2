### Bolt Strike — Zekrom · electric · physical · power 130
Refs: video EV (7433 ms, 30 fps, effect frames 8–200) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a huge cyan electric sphere with curled dark green-black wisps, held at the attacker's chest, that flies down the lane and bursts into a cyan lightning fan on the defender.
Video beats (t = 0 at frame 8; ms = (frame − 8) × 33.3):
- 0–470 ms (f8–22): camera pushes in on Zekrom; it rears with both wings and the tail cone spread; the body rim turns white by f20–22.
- 470–730 ms (f22–30): body bleaches to a white silhouette (whiteout); a large white sphere swells in front of its chest, lane side; wings go white.
- 800–1130 ms (f32–36): sphere turns cyan; a thin cyan ring circles it; a four-arm cross star-flare sits on the core.
- 1130–2000 ms (f36–68): sphere sustains, cyan with a pale core; about ten dark green-black curled wisps crawl over its surface, cyan jagged arcs ring outward; camera held on the sphere.
- 2070–2130 ms (f70–72): white flash and a violet ring at the sphere; it releases.
- 2200–2330 ms (f74–78): camera cut to the defender side; a fan of jagged cyan blades sweeps onto the defender from the attacker side; white bloom on the defender at f78 (contact ~2270 ms).
- 2400–2670 ms (f80–88): white starburst with horizontal speed streaks; camera shakes.
- 2730–3400 ms (f90–110): cyan lightning columns drop from above onto the defender; floor burst; defender HP bar falls from f92.
- 3470–3930 ms (f112–126): column dims to a pale wash.
- 4000–4730 ms (f128–150): full-screen pale-blue wash (scene cut).
- 4800–5270 ms (f152–166): defender alone on the snow; normal colours return.
- 5330–6330 ms (f168–200): Zekrom returns to its spot as a translucent cyan ghost; white flare round the tail at f190–198 (6000–6270 ms); cyan aura ring contracts by f200.
Pokémon: rears and whitens (0–730 ms), holds the sphere with wings open to 2000 ms, releases at 2070 ms; returns to its spot as a cyan ghost, flare at its tail at 6000–6270 ms. Cue for the card ghost: rim glow up to 1 by 470 ms, then recoil; the ghost fades to cyan at 5330 ms.
Camera & screen: push-in at 0 ms; cut to the defender side at 2200 ms; full-screen pale-blue wash 4000–4730 ms; camera shake at 2400 ms; defender-only cut 4800 ms. Board replacement: whiteouts → attacker rim glow (`glow` 1) and `impactFlash` local to the defender; the wash and cut are dropped; the starburst stays local (16 rays); shake is the existing contact shake.
Palette: #3FE0FF, #C9F7FF, #FFFFFF, #0F2B33, #8E7BFF
Closest generic: wild-charge (Appendix A, Electric, tier 3): a card dash with an electric trail. What must differ: Bolt Strike is a charged sphere that travels down the lane, not the body dashing; dark wisps circle the sphere; contact is a bolt column from the sky plus a starburst.
Board mapping:
- 0: coreCharge(lead 0.42, r0 0.18, r1 0.56); orbitCharge(count 5, half 'back'); orbitCharge(count 5, half 'front', palette.override deep #0F2B33 for the wisps)
- 560: shockRings(count 1, delay 0.3)
- 620–1060: projectile(path 'straight', r0 0.3, r1 0.5, tongues 6)
- 1100: impactFlash(defender)
- 1100–1600: bolt(from 'sky', segments 9, jag 0.12, branches 2); speedRays(count 16, 1130–1350); embers burst (defender, count 14, kind streak)
- 1500–1900: aura(attacker, hz 2, alpha 0.6)
- attacker rear-lurch (rear 0.14, glow 1), defender knock (strength 0.3, with tremble before contact)
- contact at 1100; total 2400
New pieces: none (the dark wisps are a palette override of the electric material's tongue).
Flags: house-rule translations (whiteouts at 0–730 and 4000–4730 ms, cut and wash dropped; starburst kept local); total 2400 ms exceeds the tier-3 band of 2200 ms, within the signature budget of 1.8–2.6 s; uncertainty: the attacker's exact motion in gen7 (lunge with the glowing tail cone at gen7 f44–59) is not reproduced here, and the EV defender position during the cut at 2200 ms is read from one tile.

### Electro Drift — Miraidon · electric · special · power 100
Refs: video EV (8534 ms, 29.88 fps, effect frames 20–204) · gen7 none
Signature read: a glowing blue-white electric oval hoop with a gold rim, rolling out of Miraidon's violet dive and bursting into a white-cyan column under the defender.
Video beats (t = 0 at frame 20; ms = (frame − 20) × 33.5):
- 0–130 ms (f20–24): camera cuts from the wide shot to a cliff backdrop; Miraidon is already pitched and rotating in a dive; body turns violet; first blue-white arcs at f24.
- 130–470 ms (f24–33): white-violet sparks and thin blue arcs along the sides; the body spins as it dives.
- 470–1440 ms (f33–63): close-up; violet body with gold edges; blue-white bolts crackle round it; a white-blue trail flares from its underside as it drives toward the camera.
- 1440–2140 ms (f63–82): pink-violet swirls wrap the body (f79–82, 1975–2075 ms).
- 2175–3000 ms (f85–109): body dissolves into a large oval electric hoop (blue-white core, #FFD84A gold rim, cyan arcs) that rolls rightward and shrinks as it leaves.
- 3080–3380 ms (f112–121): camera cut to the defender side; the hoop reaches the defender's flank with cyan sparks and a gold ground glow.
- 3415–3815 ms (f124–134): a long diagonal white-violet streak (drive line, gold trailing edge) cuts from the attacker's side to the defender.
- 3915–4115 ms (f137–143): defender wrapped in cyan-white arcs; white flash at f143 (contact ~4115 ms; the damage pops here).
- 4215–4415 ms (f146–152): full-screen white burst, then pale-blue wash (house rule).
- 4515–5620 ms (f155–188): white-cyan column erupts from the ground at the defender; cyan and white bolts fan out; gold ground glow sweeps; defender HP bar drops (f164–185).
- 5720–6155 ms (f191–204): cut back to the attacker side; the hoop reappears lower-centre and shrinks away.
- 6355–6857 ms (f210–225): Miraidon re-forms from the hoop's base, violet, rearing; back at its hover spot by f246 (7560 ms).
Pokémon: dives and spins 0–600 ms (body rotates, arms tucked); arcs crackle over the body 130–1440 ms; dissolves into the hoop at 2175 ms; re-forms rearing at 6355 ms. Cue for the card ghost: spin (one turn) on the dive, then an aura glow on return.
Camera & screen: cliff cut at 0 ms; camera follows Miraidon to 2175 ms; cut to the defender side at 3080 ms; full-screen white burst 4215–4315 ms, then a pale-blue wash at 4415 ms; cut back to the attacker at 5720 ms. Board replacement: the white burst becomes a local `impactFlash` on the defender; the cuts and wash are dropped (fixed board view); the column stays on the defender.
Palette: #6A4BFF, #3FD9FF, #DFF9FF, #FFD84A, #2B2FB8
Closest generic: wild-charge (Appendix A, Electric physical tier 3), a charged body dash. What must differ: this is special; the body dives and dissolves into a separate rolling electric hoop; contact is a ground column with bolts, not a fan.
Board mapping:
- 0–550: attacker spin (turns 1); bolt(from 'attacker', segments 9, jag 0.12, branches 2, rerollMs 45) 0–500
- 400–900: orbitCharge(count 8, half 'front', r0 0.16, r1 0.24), a stand-in for the hoop's bodies (the hoop itself is a New piece)
- 600–1000: projectile(path 'straight', r0 0.4, r1 0.5, tongues 3), the hoop travelling the lane
- 760–1000: beam(kind 'solid', w 0.5); defender tremble (pre-contact)
- 1000: contact; impactFlash(defender) (top layer, local); speedRays(count 16, 1000–1250); particles: sparks (defender, count 14, streak)
- 1000–1500: pillar(from 'below', height 1.6, w 0.6) on the defender; bolt(from 'sky', segments 9, jag 0.12, branches 2, rerollMs 45)
- 1200–1900: aura(attacker, hz 2, alpha 0.6)
- attacker spin, defender knock 0.2
- contact at 1000; total 2200
New pieces:
- hoop: an upright oval ring (about 0.55 h × 0.85 h) drawn as electric tongues on its perimeter (material electric, jag 0.4) with a #FFD84A edge, spinning about its vertical axis as it rolls along the lane (600–1000 ms); replaces the projectile and orbitCharge stand-ins.
Flags: house-rule translations (the 4215–4415 ms white burst and wash become a local impactFlash; the three camera cuts are dropped); no gen7, so beat order and path come from EV only (the hoop's lane travel is inferred from frames 85–121 and is uncertain); return of the hoop not mapped (it dissolves at contact); total 2200 ms within the signature budget; uncertainty: contact frame (143 or 146).

### Fusion Bolt — Zekrom · electric · physical · power 100
Refs: video EV (5900 ms, 30 fps, effect frames 0–163) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a giant white Kyurem ghost fused over Zekrom, then a cyan orb with a halo ring at its chest that releases as a ball and a white column drops out of the sky onto the defender.
Video beats (t = 0 at frame 0; ms = frame × 33.3):
- 0–400 ms (f0–12): a huge white Kyurem body (the fused ghost) fills the foreground with Zekrom's black silhouette on top; a yellow-white spark at the mouth from f0; the camera pushes in on Zekrom from f12.
- 400–1200 ms (f12–36): Zekrom's body goes translucent cyan (f24–36), its tail-cone tip glows cyan from f26; the Kyurem ghost is gone by f14.
- 1200–1970 ms (f40–59): a bright blue-white orb at the chest with a thin rotating blue ring and radial white bolts, widening to concentric rings with spikes (f53–59).
- 2030–2500 ms (f61–75): the orb becomes a vertical cyan column rising from its base, with grey-white dust at the ground.
- 2570–2970 ms (f77–89): cut to a dark-blue cliff backdrop; snow only.
- 3000–3200 ms (f90–96): a small cyan star appears high in the sky and grows as it descends.
- 3270–3400 ms (f98–102): full-screen cyan bloom with a horizontal streak (house rule).
- 3470–3600 ms (f104–108): a flattened horizontal electric ring with white horizontal bolts sweeping across.
- 3670–3867 ms (f110–116): the ring expands and a vertical white column drops from it to the ground.
- 3867–4067 ms (f116–122): contact: column and star flare land on the defender; HP bar drops orange at f118–124 (contact ~3870 ms).
- 4500–4967 ms (f135–149): defender inside crescent slashes with dark shards; bolt streaks from the left (f147–149).
- 5030–5433 ms (f151–163): cyan glow dome under the defender; the defender goes pale.
Pokémon: crouches with the fused white ghost behind it (0–400 ms); body goes translucent cyan with a glowing tail-cone tip (800–1200 ms); off-camera from 1200 ms, when the orb takes over the shot; no body motion after release.
Camera & screen: push-in on Zekrom 400 ms; close on the orb 1200–1970 ms; dark cliff cut 2570–2970 ms; full-screen cyan bloom 3270–3400 ms; defender close-up from 3670 ms. Board replacement: the bloom becomes local speedRays on the defender; the cliff cut is dropped; the camera stays fixed.
Palette: #3FD9FF, #E9FBFF, #FFFFFF, #2C8CFF, #DDE6EE
Closest generic: wild-charge (Appendix A, Electric physical tier 3). What must differ: no body dash; the orb is built at the chest and released as a ball; the damage comes as a column that falls from the sky with a halo ring around the defender.
Board mapping:
- 0–1000: attacker brace (glow 1); aura(attacker, hz 2, alpha 0.6) 0–400; coreCharge(lead 0.42, r0 0.18, r1 0.56) 0–1000; bolt(from 'attacker', segments 9, jag 0.12, branches 2, rerollMs 45) 400–1000
- 1000–1300: shockRings(count 2, delay 0.3); starFlare(arms 'ring', width 0.46) on the defender
- 700–1000: projectile(path 'straight', r0 0.34, r1 0.56, tongues 4) travelling the lane
- 700–1100: pillar(from 'above', height 1.8, w 0.6) on the defender; bolt(from 'sky', segments 9, jag 0.12, branches 2, rerollMs 45) 900–1400
- 1100: contact; impactFlash(defender); speedRays(count 16, defender, 1100–1300)
- 1100–1500: ring(kind 'floor', count 2, r0 0.3, r1 1.3) on the defender; defender tremble (pre-contact) then knock (strength 0.3)
- attacker brace, defender knock 0.3
- contact at 1100; total 2200
New pieces:
- fused ghost: a white second copy of the attacker's art behind it (offset 0.5 h, alpha 0.35, fades 0–400 ms); the card-motion trail ghosts exist only for dash, so this needs a ghost layer, not a drawer.
Flags: house-rule translations (the full-screen bloom at 3270–3400 ms becomes local speedRays; the cliff cut dropped); the EV Kyurem ghost at 0–12 f has no drawer and is marked as a New piece; uncertainty: t0 is frame 0 because the spark and ghost are already present, and if the fused overlay is a pre-move cutscene, t0 is frame 12 (400 ms); the "C'est super efficace" text box is UI and not treated as an effect; total 2200 ms within the signature budget.

### Plasma Fists — Zeraora · electric · physical · power 100
Refs: video EB (8500 ms, 30 fps, effect frames 29–243) — no EV video · gen7 USUL (used for: shape/path/count/angle)
Signature read: a white Zeraora with yellow crest whose fists meet over a crackling cyan chest ball and who drops from the sky on a lightning column, the impact throwing beige rock clods out of a cyan-white blast.
Video beats (t = 0 at frame 29; ms = (frame − 29) × 33.3):
- 0–420 ms (f29–42): camera cut to a close Zeraora on a green field; it crouches with fists forward and arms wide; the attacker is static before f29 in the wide shot.
- 420–1000 ms (f42–60): small blue sparks at the fists (f42–45), cyan-white arcs from the chest and fists (f48–57).
- 1000–2000 ms (f60–90): long white and yellow-white straight spokes radiate from the body in every direction (f64–97), 8–12 at a time.
- 2000–2800 ms (f90–113): fists come together at the chest; a cyan-white crackling ball forms (f100–112); a yellow spike rises above the head (f106–109).
- 2800–3400 ms (f113–133): horizontal bolts across the frame (f121–124); camera close on the chest with bolts radiating outward (f128–134).
- 3600–3750 ms (f137–140): Zeraora leaps up; a dark shock ring with cyan arcs forms at its feet (f140).
- 3800–4100 ms (f143–152): two to four vertical white-cyan pillars rise at the defender's spot; the burst lifts beige clods (f149–152).
- 4170–4870 ms (f155–173): Zeraora lands in the crater; the defender stands inside the pillars; beige round clouds fly outward.
- 4900–5100 ms (f176–182): contact: a cyan starburst erupts from the defender's base; blue shards fan out; defender HP bar begins falling (orange at f177).
- 5200–5400 ms (f185–191): whiteout haze, then a full white-cyan blast with beige clods (house rule).
- 5400–6000 ms (f192–207): beige round puffs burst from a cyan-white core.
- 6000–6500 ms (f210–225): cyan-white starburst core with bolts across the lane; HP bar orange to red (f222–225).
- 6600–7130 ms (f228–243): defender on pale ground with horizontal lightning sheets; the scene whites out by f243.
Pokémon: crouches with fists forward (0–420 ms), arms spread and charged (420–1000 ms), fists together over the chest (2000–2800 ms), leaps (3600 ms), lands in the crater (4170 ms); off-camera from 4500 ms. Cue for the card ghost: lunge; dive onto the defender along a column; no rebound.
Camera & screen: cut to a close view at f29; close on the chest at f128–134; wide-to-crater at f137–158; whiteouts at f185–191 and f228–252; the cuts are dropped. Board replacement: the chest flash becomes a local flash on the attacker; the whiteout becomes a local impactFlash on the defender; the rest is fixed-view.
Palette: #3FE6FF, #FFFFFF, #FFF27A, #2D6BFF, #E9D3A0
Closest generic: wild-charge (Appendix A, Electric physical tier 3): a body dash with an electric trail. What must differ: a charge-up of spokes and a chest ball first; the strike is a dive that rides a lightning column from the sky; the impact is a cyan-white burst that throws beige clouds, with no trail.
Board mapping:
- 0–700: coreCharge(lead 0.2, r0 0.18, r1 0.5); bolt(from 'attacker', segments 9, jag 0.12, branches 2, rerollMs 45) 300–700; spokes(count 12, lengths 0.6–1.1 h) (new piece)
- 700: shockRings(count 2, delay 0.3) on the attacker (the chest release)
- 800–1100: pillar(from 'above', height 1.8, w 0.6) on the defender; defender tremble (pre-contact)
- 1000–1300: bolt(from 'sky', segments 9, jag 0.12, branches 2, rerollMs 45) on the defender
- 1100: contact; impactFlash(defender); pillar(from 'below', height 1.6, w 0.6) 1100–1500; speedRays(count 16, defender, 1100–1300)
- 1100–1500: cloud(count 6, radius 0.35, drift 0.6, alpha 0.5, palette.override #E9D3A0); shards(count 8, arc 360, distance 1.1) 1100–1400; terrain(kind 'crack', radius 1.4) 1100–1500
- attacker lunge (wind 0–440, strike 440–1100 to the defender, recoil to 1650), defender knock 0.45
- contact at 1100; total 2400
New pieces:
- spokes: radial electric spikes around a card (count 10–12, 0.6–1.1 h long, straight tongues from the card centre, jag 0.03, white and yellow-white, material electric). speedRays draws only around the defender, so this needs its own drawer or a target parameter.
Flags: no EV video (EB is the primary reference); house-rule translations (the chest flash and the 185–191 and 228–252 whiteouts become local flashes or are dropped; the close-ups and cuts are dropped; the beige clods stay local); gen7 shows the dive on a lightning column, which the board follows, and the EV leap at 137 is read as the same dive; uncertainty: the long pale shape at the top-left of EV frames 0–27 is unidentified and not drawn; total 2400 ms within the signature budget.

### Thunder Cage — Regieleki · electric · special · power 80
Refs: video EV (6500 ms, 30 fps, effect frames 0–193) · gen7 none
Signature read: two yellow blades that close over the defender like a cage, then a yellow-white orb high above it that drops a web of bolts onto a ground starburst.
Video beats (t = 0 at frame 0; no text box in this clip; ms = frame × 33.3):
- 0–420 ms (f0–12): two wide yellow blades (layered plates with wobbling edges) extend from Regieleki's sides toward the defender at the right.
- 470–1000 ms (f14–30): the blades swing forward and wrap over the defender, closing a cage shape around it.
- 1000–1560 ms (f30–47): camera cut to a dark cave; the blades bend into a dome above Regieleki and yellow tendrils grow down to the ground (f40–48).
- 1600–2200 ms (f48–66): the tendrils retract and fold in; the cage collapses to a yellow tendril mass over the defender's spot (f51), then fans strands upward (f53–59).
- 2200–2800 ms (f66–84): the mass becomes a bright yellow-white orb with an orange rim, blue arcs and radial spikes (f65–75), then bursts (f77) and rises high over the defender (f81–97).
- 2830–3730 ms (f85–112): the orb hangs high above the defender, sparks falling; camera tilts at f112–116.
- 3870–4000 ms (f116–120): full-screen white flash (house rule).
- 4070–5000 ms (f122–150): a web of ~10 thin yellow-white bolts drops from the orb and fans to the ground around the defender; bright base burst under the defender (f124–150).
- 5100–5170 ms (f153–155): contact: the base burst grows to a yellow starburst with cyan streaks; the bolt web collapses (f155–157).
- 5270–5630 ms (f157–169): defender inside spiky yellow-green sparks and shards; HP bar falls (f163–169).
- 5700–6430 ms (f171–193): the blades re-form on Regieleki and extend toward the defender again.
Pokémon: stands still with its blades doing the work; blades extend (0–420 ms), close (470–1000 ms), collapse into the orb (1600–2200 ms), and re-form at 5700 ms; the body itself does not move.
Camera & screen: cave cut at 1000 ms; camera tilt 3730–3870 ms; full-screen white flash 3930–4000 ms; cut back to the defender 5270 ms. Board replacement: the flash becomes a local flash on the sky orb (New piece); the cut and tilt are dropped.
Palette: #F5EE4A, #FFF7B0, #FFFFFF, #FFB43A, #3FB5FF
Closest generic: shock-wave (Appendix A, Electric special tier 2): rings of electricity that hit the defender. What must differ: the defender is caged by two blades and a bolt web from an orb in the sky; contact is a ground starburst, not rings.
Board mapping:
- 0–450: slashArc(target 'defender', count 2, sweep 180, radius 0.7, gapDeg 30, angle 45) (the two blades)
- 0–900: attacker brace; rain(target 'defender', count 10, height 1.6, spread 0.9) (the cage strands)
- 350–900: sky orb (New piece) 1.6 h above the defender, pulsing, flaring at 900
- 900–1000: defender tremble (pre-contact)
- 1000: contact; impactFlash(defender); starFlare(arms 'ring', width 0.46) 1000–1300; shards(count 8, arc 360, distance 1.1) 1000–1400; speedRays(count 16, defender, 1000–1200); particles: sparks (defender, count 14, streak)
- 1000–1500: defender knock (strength 0.2)
- attacker brace, defender knock 0.2
- contact at 1000; total 2200
New pieces:
- sky orb: the electric material's body (sphere with 6 radiating jags) hovering 1.6 h above the target and pulsing; no drawer places a body above the target.
- cage strands: 8–12 thin curved bolts from the sky orb fanning down to the target's footprint, held through the beat; `rain` draws straight short tongues only.
Flags: house-rule translations (the full-screen white flash at 3930–4000 ms becomes a local flash on the sky orb; the cave cut and camera tilt dropped); no gen7; no text box at the start (the effect is already visible at frame 0), so t0 is frame 0; uncertainty: the defender's path (the blades and the cage are read from one tile per beat); total 2200 ms within the signature budget.

### Thunderclap — Raging Bolt · electric · special · power 70
Refs: video EV (3499 ms, 30.01 fps, effect frames 0–104) · gen7 none
Signature read: the pink umbrella crest of Raging Bolt turns into a glowing white-blue disc that fires one cyan bolt across the lane, which hits a yellow defender (Raikou) and turns it white.
Video beats (t = 0 at frame 0; ms = frame × 33.3):
- 0–466 ms (f0–14): camera on the attacker's side; a cyan zigzag bolt with a star spark sits at its foot, from frame 0; the text box appears at f11.
- 500–1267 ms (f15–37): cut to a night sky with rain; the crest holds high; nothing else moves.
- 1267–1467 ms (f38–44): the crest turns white-blue; cyan zigzags crackle from it; a white-blue disc forms over the crest (f40–44); a vertical bolt rises from it (f42–43); a horizontal cyan bolt leaves it toward the right at f44.
- 1500 ms (f45): camera cut to the grass hillside; the bolt crosses toward the defender.
- 1533–1733 ms (f46–52): the defender (yellow and white striped, Raikou) stands on the slope; HP bar at top.
- 1767–1833 ms (f53–55): defender turns into a full white silhouette (flash).
- 1867–1933 ms (f56–58): a white-cyan orb at the defender's left with cyan arcs.
- 1967–2100 ms (f59–63): cyan zigzag burst and a four-point flash at the defender's flank; a vertical cyan bolt drops from the sky at the defender's right (f59–63).
- 2133–2500 ms (f64–75): cyan spiky shards on the grass at the defender's left, fading; defender stands.
- 2533–2667 ms (f76–80): camera pans to the attacker's leg entering the left; dust at the ground.
- 2700–3467 ms (f81–104): camera on the attacker; "not very effective" text box (f81); the cyan foot zigzag persists to f104.
Pokémon: stands still; the crest's white-blue disc charges (1267–1467 ms) and releases one horizontal bolt; the body does not move. Cue for the card ghost: aura on the attacker from 0; brace.
Camera & screen: cut to the night sky at 500 ms; cut to the defender at 1500 ms; full white silhouette 1767–1833 ms; camera pan 2533 ms; cut to the attacker at 2700 ms. Board replacement: the white silhouette becomes a local impactFlash on the defender; the cuts and pan are dropped (fixed board view).
Palette: #3FD8FF, #A9F2FF, #E8FBFF, #FFFFFF, #2C7BFF
Closest generic: thunder-shock (Appendix A, Electric special tier 1): a short spark on the defender. What must differ: the bolt is discharged from a glowing crest disc, flies as a single cyan bolt, and the impact is a four-point flash with a vertical bolt from the sky.
Board mapping:
- 0–600: aura(attacker, hz 3, alpha 0.6); coreCharge(lead 0.5, r0 0.2, r1 0.5) (the crest disc)
- 700–1000: projectile(path 'straight', r0 0.3, r1 0.3, tongues 3) (the bolt crossing the lane)
- 800–1000: defender tremble (pre-contact)
- 1000: contact; impactFlash(defender); starFlare(arms 'cross', width 0.46) 1000–1300; shards(count 8, arc 360, distance 1.1) 1000–1300; bolt(from 'sky', segments 9, jag 0.12, branches 2, rerollMs 45) on the defender 1000–1300; speedRays(count 16, defender, 1000–1200)
- 1000–1500: defender knock (strength 0.2)
- attacker brace, defender knock 0.2
- contact at 1000; total 2200
New pieces: none (the foot zigzag at the attacker's feet is optional; bolt draws from the attacker to a target, so a rest-point zigzag would need an anchor parameter).
Flags: house-rule translations (the white silhouette 1767–1833 ms becomes a local impactFlash; the cuts and the camera pan are dropped); no gen7; "not very effective" text box is UI, not treated as an effect; uncertainty: the contact frame (53 by the white silhouette or 58 by the burst); total 2200 ms within the signature budget.

### Wildbolt Storm — Thundurus · electric · special · power 100
Refs: video EV (6000 ms, 30 fps, effect frames 16–165) · gen7 none
Signature read: a dark violet tornado of spiral tongues that screws up around the defender, shot through with golden sparks, then flashed open by crossing blue-white and pink beams.
Video beats (t = 0 at frame 16; ms = (frame − 16) × 33.3):
- 0–470 ms (f16–30): the white cloud under the attacker dims to grey-blue (f16–18); the body and its ring of dark spiked orbs stay in place; text box at f20.
- 470–930 ms (f30–44): camera cut to a lake; the cloud and ring drop low and move toward the defender; golden streaks run along the ground (f42–44).
- 930–1500 ms (f44–60): the attacker sweeps low across the field; thin golden lines streak along the ground toward the defender (f45–59).
- 1500–2000 ms (f60–76): grey-violet mist gathers round the defender (f59–67); a dark violet vortex starts at its base (f63–67) and climbs (f69–77).
- 2000–3300 ms (f76–116): a tall dark violet spiral column spins round the defender; yellow-white sparks burst at its base (f73–98); golden lines whirl round the base (f96–118).
- 3300–3500 ms (f116–120): the column collapses; a blue-white beam and a pink beam cross the defender horizontally (f120–122); contact ~3470 ms.
- 3600–4000 ms (f122–126): yellow-white starburst on the defender with pink and cyan streaks.
- 4000–4600 ms (f128–138): sparks fall around the defender; a pale ring forms at its base (f130–134); sparks dwindle by f141.
- 4700–5300 ms (f141–159): the defender stands calmly; the attacker's cloud and ring return into frame at f159–161.
- 5400–5900 ms (f163–179): attacker back at its spot with the cloud base.
Pokémon: the cloud and body hover (f16–30), sweep low toward the defender (f30–60), then hold above the storm (f60–116) and return to spot from f159. Cue for the card ghost: rise (lift, hover) then return.
Camera & screen: cut to the lake at 470 ms; camera holds on the defender from 1500 ms; the beams flash 3470–3600 ms; cut back to the attacker at 4700 ms. Board replacement: the beam flash becomes a local starFlare on the defender; the cuts are dropped; the grey mist stays local (a cloud around the defender).
Palette: #2B1D4D, #5B3FA0, #FFE066, #BFE6FF, #FF8FD1
Closest generic: whirlpool (Appendix A, Water special tier 1): a spiral of tongues around the defender. What must differ: this is a dark violet electric tornado with golden sparks at its base, and the defender is hit by crossing beams and a starburst, not by water.
Board mapping:
- 0–470: attacker rise (lift 0–0.6 c, hover to 1.2 c); cloud(target 'defender', count 8, radius 0.35, drift 0.6, alpha 0.5, palette.override #8E8AB0) 200–800 (grey mist)
- 300–1000: spiral(target 'defender', turns 2.5, r0 0.2, r1 1.1, rpm 90, palette.override #2B1D4D with #5B3FA0) (the tornado)
- 400–800: beam(kind 'segmented', w 0.3) from attacker to defender (golden streaks); embers(defender, count 14, kind streak, 500–1000) (sparks at the base)
- defender tremble 800–1000
- 1000: contact; impactFlash(defender); starFlare(arms 'cross', width 0.46) 1000–1300; beam(kind 'solid', w 0.4, 1000–1300) (the crossing beams); speedRays(count 16, defender, 1000–1200)
- 1100–1600: rain(count 10, height 1.6, spread 0.9) (falling sparks); ring(kind 'floor', count 2, r0 0.3, r1 1.3) 1100–1500
- attacker rise, defender float
- contact at 1000; total 2200
New pieces: none (the tornado uses spiral with a palette override; the crossing beams use beam solid).
Flags: house-rule translations (the 3470–3600 ms flash becomes a local starFlare; the lake cut and camera follow are dropped; the grey haze is kept local); no gen7; t0 is frame 16 because the cloud dims there, if that is a pre-move state t0 is frame 30 (500 ms); uncertainty: the beam path (horizontal, through the defender) read from one tile; total 2200 ms within the signature budget.

### Freeze Shock — Kyurem · ice · physical · power 140
Refs: video EV (10867 ms, 30 fps, effect frames 0–324) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a pale-blue frosted sphere, built in Kyurem's hands and chest, that flies down the lane and bursts into a six-point ice crystal that encases the defender.
Video beats (t = 0 at frame 0; raw ms = frame × 33.3):
- 0–2100 ms (f0–63): Kyurem hovers in a charge pose with its tail cone and wing edges already cyan; cyan arcs run round the body and wings; the defender (a white-blue bird) hovers at the right; text box "Kyurem utilise Éclair Gelé !" from f0.
- 2200–2700 ms (f66–81): arcs persist; a second text box "est baigné d'une lumière glaciale" (f69–81); no new shapes.
- 2700–3200 ms (f82–97): pale white orbs and snowflakes appear round the chest and right arm (f82–94); a cyan bolt crosses at f97.
- 3300–3800 ms (f100–115): a cyan bolt runs from the right arm (f103–109); a white sphere at the far right (f103); a cyan ring forms round the chest (f112–115).
- 3900–4200 ms (f118–127): cyan arcs and a bolt streak from the chest to the right; a blue-cyan halo sphere forms at the chest (f121–127).
- 4300–5050 ms (f130–151): cyan halo rings expand round the chest (f130–139); glow dome (f136–139); arcs at the right (f151).
- 5100–6000 ms (f154–179): the arcs fade; Kyurem re-holds the charge pose.
- 6100–6600 ms (f182–197): camera cut: a close view of Kyurem's flank (f182), then a wide cut to a giant blue bird defender on the right (f188–197).
- 6700–7200 ms (f200–215): Kyurem turns ice-blue-white; a pale-blue faceted sphere forms at its chest with orbiting crystal shards (f203–215).
- 7300–7700 ms (f218–230): the sphere flies to the defender with a bright cyan burst (f221–227); a full-screen white-cyan cloud wipe at f230 (house rule).
- 7700–8200 ms (f233–245): a radial white-blue flash with ice shards on the defender (f239–245); contact about frame 221 (7400 ms).
- 8200–9000 ms (f246–270): a six-point crystal lattice encases the defender (f246–270); HP bar appears at the top right (f264).
- 9100–10000 ms (f273–300): the crystal shatters into falling shards; the defender's HP bar drops (orange at f282, red at f291–297).
- 10100–10800 ms (f303–324): Kyurem back at its spot with the charge pose again.
Pokémon: holds the charge pose with arms out (0–2100 ms); orbs and snowflakes gather at its chest (2700–3800 ms); flies with a cut to the bird; turns ice-blue at 6700 ms and releases the sphere; returns to its spot from 10100 ms. Cue for the card ghost: a rise (hover), then a lunge on release; the ghost recoils to its spot.
Camera & screen: text box and camera hold at 0 ms; cut to Kyurem's flank 6100 ms; cut to the bird 6280 ms; full-screen white-cyan wipe 7700 ms; full-screen radial flash 8000 ms; the camera returns to a wide shot 10100 ms. Board replacement: both wipes become a local impactFlash on the defender; the cuts are dropped (fixed view).
Palette: #36D6F0, #A8EEFF, #FFFFFF, #2E7FD8, #7FC8F2
Closest generic: fire-blast (the accepted look test, Appendix A worked example): a charged body that releases one sphere. What must differ: the sphere is ice (a faceted frost body with orbiting crystals, not a fireball); the impact is a six-point crystal lattice that encases the defender, not a flame star.
Board mapping:
- 0–600: orbitCharge(count 5, half 'back', material ice; snowflake bodies) and orbitCharge(count 5, half 'front'); aura(attacker, hz 2, alpha 0.6) 0–600
- 300–800: coreCharge(lead 0.42, r0 0.18, r1 0.56) (the chest sphere builds)
- 600–1000: projectile(path 'straight', r0 0.4, r1 0.6, tongues 4) (the frost sphere, New piece below)
- 800–1000: defender tremble (pre-contact)
- 1000: contact; impactFlash(defender) (top layer, local); starFlare(arms [0, 60, 120, 180, 240, 300] degrees, width 0.46) on the defender 1000–1400 (the six-point crystal); speedRays(count 16, defender, 1000–1200)
- 1000–1500: shards(count 8, arc 360, distance 1.1) bursting from the defender; cloud(count 6, radius 0.35, drift 0.6, alpha 0.5) 1000–1800 (ice mist, palette [200, 230, 245])
- 1200–1800: smoke(count 6) on the defender (ice mist colour, alpha ≤ 0.32) for the aftermath
- attacker rise (lift 0–0.6 c, hover 1.2 c); defender freeze (cyan tint 0.8 → 0 over 900 ms, no travel)
- contact at 1000; total 2200
New pieces:
- frost sphere: the ice material's projectile head drawn as a faceted pale-blue sphere (r 0.4–0.6 h) with 3 orbiting crystal shards; the material spec draws crystal heads, not a sphere, so the material's projectile must allow a sphere head.
Flags: house-rule translations (the full-screen white-cyan cloud wipe at 7700 ms and the radial flash at 8000 ms become a local impactFlash; the cuts to the flank and bird are dropped); long raw reference (10.9 s, charge from 0 to 6.7 s) compressed to 2.2 s, so the board keeps only the charge, the release and the crystal lattice; the crystal lattice is mapped to starFlare with explicit six arms (no new drawer); uncertainty: the contact frame (221 vs 230); gen7 used for the frost sphere path and the arm bolts only.

### Glacial Lance — Calyrex-Ice · ice · physical · power 120
Refs: video EV (6000 ms, 30 fps, effect frames 30–179) — no gen7 · gen7 none
Signature read: a crystal lance spikes out of the rider's flank and lunges into a row of towering ice spires; the impact throws a burst of ice shards across the defender's space.
Video beats (t = 0 at frame 30; raw ms = (frame − 30) × 33.3):
- 0–200 ms (f30–36): static wide shot; snowflake sparkles at the feet (f30); small cyan sparks at the flank (f32); ice shards form under the body (f34).
- 200–470 ms (f36–44): a cyan lance streak juts from the flank toward the defender (f36–38); the mane and flank grow pale ice spikes (f42–44).
- 470–1000 ms (f44–55): ice shards build round the body (f44–53); a rearing pose; a row of translucent crystal spires begins rising behind the defender at f53–55.
- 1000–2000 ms (f55–90): cyan arcs spin round the attacker (f55–67); the crystal spires stand fully formed behind the defender (f67–89); a blue orb sparks at the attacker's chest (f85–89).
- 2000–2600 ms (f90–104): the attacker rears; a white ice lance-spike extends from its horn toward the defender (f96–100); a pale ring at the lance tip (f96); a white burst at the tip (f102–104).
- 2600–2930 ms (f106–118): the attacker lunges forward with cold blue trails (f106–112); the lance points at the spires (f114–118).
- 3000–3130 ms (f120–124): full-screen motion-blur whiteout (f122, house rule); contact at 3130 ms (f124).
- 3130–3700 ms (f124–141): a pale ice explosion with sharp shards and cyan streaks on the defender's side (f124–134); HP bar orange at f135–141.
- 3700–4970 ms (f141–179): shards scatter, drift and fade (f153–171); defender HP falls; the attacker stands; the scene settles at f179.
Pokémon: stands rearing (0–470 ms), shards and cyan arcs build (470–1000 ms), rears and lunges with the lance (2000–2930 ms), then stands still. Cue for the card ghost: dash on the strike, then a recoil to the spot.
Camera & screen: static wide shot throughout; the whiteout at f122 is the only full-screen effect, dissolving by f134. Board replacement: the whiteout becomes a local impactFlash on the defender; no camera moves to map.
Palette: #A6E6FF, #6FD3FF, #2F7FD6, #CFF3FF, #FFFFFF
Closest generic: aqua-jet (Appendix A, Water physical tier 1): a dash with a trail toward the defender. What must differ: the trail is a crystal lance (a solid beam), not a water streak; the impact throws ice shards and the spires stand behind the defender.
Board mapping:
- 0–300: aura(attacker, hz 2, alpha 0.6); orbitCharge(count 4, half 'front', material ice) (shards under the body)
- 0–450: coreCharge(lead 0.42, r0 0.18, r1 0.4) (the flank spark)
- 400–1000: beam(kind 'solid', w 0.3, from attacker to defender) (the crystal lance)
- 500–1000: pillar(from 'below', height 1.6, w 0.5) on the defender (the spires, palette ice)
- 300–1000: attacker dash (wind 0–0.3 c, dash 0.3 c–1.0 c, trails at lags 0.035 and 0.07)
- 900–1000: defender tremble (pre-contact)
- 1000: contact; impactFlash(defender) (top layer, local); starFlare(arms 'ring', width 0.46) 1000–1300; shards(count 8, arc 360, distance 1.1) 1000–1300; speedRays(count 16, defender, 1000–1200); ring(kind 'face', count 2, r0 0.3, r1 1.1) 1000–1400
- 1000–1400: defender knock (strength 0.45, heavy physical)
- 1200–1800: cloud(count 8, radius 0.35, drift 0.6, alpha 0.5, palette [200, 230, 245]) (the ice mist around the spires)
- attacker dash, defender knock 0.45
- contact at 1000; total 2200
New pieces: none.
Flags: house-rule translations (the full-screen motion-blur whiteout at 3067 ms becomes a local impactFlash on the defender); no gen7; the EV camera is static, so no cuts or pans are mapped; the spires are mapped to the pillar drawer (an earth-spike column) instead of a new piece; uncertainty: whether the lance is a single solid beam or a short crystal dash (the lance-streak is read from one tile per beat); the raw reference (6 s) compresses to 2.2 s, so the spire rise and the rear are compressed to the first second.

### Glaciate — Kyurem · ice · special · power 65
Refs: video EV (7633 ms, 30 fps, effect frames 28–228) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a cyan ice dome and crystal column that rises from the floor under the defender and shatters into shards, after Kyurem's ground slam sends an ice field across the arena.
Video beats (t = 0 at frame 28; raw ms = (frame − 28) × 33.3):
- 0–660 ms (f28–48): cyan ribbon loops spiral round Kyurem's wings and body (f28–46); a white-blue orb starts at the chest (f48).
- 660–1000 ms (f48–58): the chest orb brightens to a white-blue starburst (f56–58); white snow clouds spread across the ground (f60–66).
- 1000–1670 ms (f58–78): camera cut to the defender (the orange bird) with cyan radial dashes round it (f70–78).
- 1670–2330 ms (f78–98): the bird's flame wings spread (f82–90); an ice column begins under it (f92); a rainbow-edged blue halo ring forms at its base (f98–102).
- 2330–3200 ms (f98–124): the ice column grows round the bird and encloses it (f102–116); full-screen radial white flash (f118–122, house rule); contact at 3200 ms (f124).
- 3200–3830 ms (f124–142): the column shatters into shard debris (f124–138); the bird is inside a white haze; HP bar falls (f126–146).
- 3830–4830 ms (f142–172): the bird recovers in mist (f140–154); the camera returns to the wide shot (f156–172).
- 4830–5830 ms (f174–196): speed-drop aura, a blue-violet swirl with pink streaks, round the bird (f174–186); the bird flies sideways out (f188–196).
- 5830–6370 ms (f198–228): the bird returns to its spot with flames fading.
Pokémon: Kyurem's wings spread and loop ribbons (0–660 ms); the chest orb builds (660–1000 ms); it stays on the far side of the frame while the column builds; no body motion at contact. Gen 7 adds a ground slam (a wide blue ring under Kyurem, then a field of ice spreading over the floor). Cue for the card ghost: stomp (lift, slam at contact), then settle.
Camera & screen: cut to the defender at 1000 ms; full-screen radial white flash 3280–3550 ms; camera back to the wide shot 4830 ms. Board replacement: the flash becomes a local impactFlash on the defender; the cuts are dropped (fixed view); the ice field is a local terrain wave.
Palette: #58D8FF, #E6F8FF, #2B8FE0, #7C5CFF, #FFFFFF
Closest generic: hydro-pump (Appendix A, Water special tier 3): a column that rises from under the defender. What must differ: the column is an ice dome of crystal that shatters into shards and haze, not a water spout; the move opens with a floor-wide ice field from the attacker.
Board mapping:
- 0–500: aura(attacker, hz 2, alpha 0.6); orbitCharge(count 5, half 'back') (the cyan ribbon loops)
- 300–700: coreCharge(lead 0.42, r0 0.18, r1 0.5) (the chest orb)
- 500–1000: terrain(kind 'wave', radius 1.4) rolling the ice field from the attacker to the defender
- 700–1000: defender tremble (pre-contact)
- 1000: contact; impactFlash(defender) (top layer, local); pillar(from 'below', height 1.8, w 0.7) on the defender 1000–1800 (the ice dome); speedRays(count 16, defender, 1000–1200)
- 1000–1400: ring(kind 'floor', count 2, r0 0.3, r1 1.3) on the defender (the halo ring at the base)
- 1200–1800: shards(count 8, arc 360, distance 1.1) as the dome breaks; cloud(count 8, radius 0.35, drift 0.6, alpha 0.5) on the defender (the white haze, palette [200, 230, 245])
- 1500–2000: aura(defender, hz 2, alpha 0.4) in violet #7C5CFF (the speed-drop cue)
- attacker stomp (lift 0–0.8 c, slam at contact); defender freeze (cyan tint 0.8 → 0 over 900 ms, no travel)
- contact at 1000; total 2200
New pieces: none.
Flags: house-rule translations (the 3280–3550 ms full-screen white flash becomes a local impactFlash; the camera cut and return are dropped; the speed-drop text box is UI and the aura is kept local); gen7 used only for the ground slam and the ice field; the raw reference (7.6 s) compresses to 2.2 s, so the field and the charge share the first second; uncertainty: the defender's speed-drop aura timing (f174–186) is read from one tile; the contact frame is f124 (3200 ms) and may be f122.

### Ice Burn — Kyurem · ice · special · power 140
Refs: video EV (11133 ms, 30 fps, effect frames 0–333) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a red wire-lattice cage left behind a grey dragon as it lunges, then a white-cyan and orange burst on the defender that opens into a pale ice crystal flower.
Video beats (t = 0 at frame 0 — the clip opens with the red lattice already on the attacker; ms = frame × 33.4):
- 0–1340 ms (f0–40): the attacker stands with a red wire-lattice cage over its body (a grid of red strokes), a pale-red trail along its tail; text box "Kyurem utilise Feu Glacé !" (f0–18), then "est entouré d'un air glacial" (f21–81).
- 1340–2600 ms (f40–78): the lattice holds; the attacker's body and tail stay steady; pale blue ice wisps build at its front (f58–78).
- 2600–3000 ms (f78–90): blue ice shards and blue-white bolts burst out at its front (f78–81); the attacker starts to lunge toward the defender (f84).
- 3000–3200 ms (f90–96): contact: an orange and white-cyan burst at the midpoint between the cards (f90–96); the red lattice trails behind as a second copy (f87–99).
- 3200–3570 ms (f96–107): orange sparks and pale cyan streaks on the defender's side; the attacker's cage fades to mist (f99–111).
- 3570–4000 ms (f107–120): a pink-white sphere forms on the defender (f105–108); the attacker's lattice reappears at the lane (f114–117).
- 4000–5400 ms (f120–162): the attacker recoils and turns; the lattice returns to its spot (f126–150); the defender stands by.
- 5400–6200 ms (f162–186): the attacker's blade-like ice sword sweeps at the defender (f171–183); a blue-green field of mist with cyan bolts and a white burst at f177–183.
- 6200–7400 ms (f186–222): a white ice starburst of faceted crystal blades opens on the defender (f186–213); the lattice is gone; the burst is white-out (f198–222).
- 7400–8200 ms (f222–246): a fire-and-ice flare (orange at the left, f219–228); white-blue radial burst (f231); the flower forms (f243–249).
- 8200–10100 ms (f249–303): the ice crystal flower (eight faceted petals) holds on the defender (f252–276); it breaks into falling shards (f273–291); the defender's HP falls (f273–300); mist remains (f282–309).
- 10100–11100 ms (f306–333): both cards return to their spots; the lattice re-forms round the attacker (f312–333).
Pokémon: the grey attacker stands with a red wire cage on its body (0–2600 ms), lunges at 2600 ms, and recoils to its spot (4000–5400 ms). Cue for the card ghost: a lunge on the strike with a trailing ghost that carries the lattice; recoil spring to home.
Camera & screen: the defender's cut-in (f186–213) and whole-screen white-outs (f198–222, f231) are the house-rule conflicts; the camera otherwise holds on the wide field view. Board replacement: the white-outs become local impactFlash and a local starFlare on the defender; the cut-in is dropped.
Palette: #CFF4FF, #4FC3FF, #FFFFFF, #FF9A2E, #FF3D5A
Closest generic: fire-blast (Appendix A worked example): a charged body that lunges and bursts on the defender with a star flare. What must differ: the strike is ice (blue wisps, pale mist, a crystal flower held on the defender), with an orange fire core at contact and a red wire cage on the attacker.
Board mapping:
- 0–800: aura(attacker, hz 2, alpha 0.6, palette.override #FF3D5A) (the red cage glow); orbitCharge(count 5, half 'back', material ice) (the ice wisps)
- 300–1000: coreCharge(lead 0.42, r0 0.18, r1 0.5) (the ice-white front orb)
- 800–1000: ice wisps and shards at the front (orbitCharge count 6, half 'front', r0 0.2, r1 0.3)
- attacker lunge (wind 0–0.4 c, strike 0.4 c–1.0 c to the defender, recoil 1.0 c–1.5 c); lattice ghost (New piece) trailing at lags 0.035 and 0.07
- 900–1000: defender tremble (pre-contact)
- 1000: contact; impactFlash(defender) (top layer, local); starFlare(arms 'cross', width 0.46, palette.override orange #FF9A2E) 1000–1300; speedRays(count 16, defender, 1000–1200)
- 1000–1500: shards(count 8, arc 360, distance 1.1, palette ice) bursting from the defender; ring(kind 'face', count 2, r0 0.3, r1 1.1) 1000–1400
- 1300–2200: starFlare(arms 'ring', width 0.46) on the defender (the eight-petal ice flower); cloud(count 8, radius 0.35, drift 0.6, alpha 0.5, palette [200, 230, 245]) 1300–2200 (ice mist)
- attacker lunge, defender knock (strength 0.3)
- contact at 1100; total 2400
New pieces:
- lattice ghost: a red wire-lattice cage (1 px strokes, grid 4 × 3 cells, colour #FF3D5A, alpha 0.7, slow rotation) drawn over the attacker ghost, held 0–1000 ms and trailing the lunge; no drawer draws a wireframe, so this needs a stroke-grid drawer or a card-ghost overlay.
Flags: house-rule translations (the 198–222 and 231 whiteouts become a local impactFlash; the defender cut-in at 186–213 is dropped); the lattice is a New piece; gen7 used for the lunge path and the ice-blade sweep; t0 is frame 0 because the clip opens with the lattice already drawn (the true start is before the clip); the EV contact is the first burst at f90–96 (3.0 s raw), compressed to 1100 ms, and the later sword and crystal sequences are mapped as the defender's aftermath only; uncertainty: which card carries the lattice (read as the attacker's ghost); total 2400 ms within the signature budget.

### Aeroblast — Lugia · flying · special · power 100
Refs: video EV (4300 ms, 30 fps, effect frames 33–128) · gen7 USUL (used for: shape/path/count/angle)
Signature read: a cyan ring-orb that grows at Lugia's wing, flies across the lane, and wraps Ho-Oh in a looping cyan vortex that flashes white at its core.
Video beats (t = 0 at frame 33; ms = (frame − 33) × 33.3):
- 0–67 ms (f33–35): first effect: a small cyan spark at Lugia's wing (f33); a cyan ring at its chest (f35).
- 200–270 ms (f39–41): the ring grows and tilts; short cyan streaks fly off (f37–41).
- 400–870 ms (f45–59): the cyan orb grows at the chest with concentric rings and streaks (f45–53), then becomes a bright sphere with a white ring (f55–59).
- 930–1070 ms (f61–65): the orb pulses white at the core (f63), then starts to move to the lane (f65).
- 1100–1400 ms (f66–74): two cyan rings leave the orb toward the defender (f68–74).
- 1400–1600 ms (f76–82): the orb is a tight helix sphere with white star flares inside it (f76–82).
- 1630–2200 ms (f84–98): the sphere grows into a vortex of cyan bands and crescents that covers the defender (f84–98); blue wind streaks cross the sea (f88–98).
- 2230–2400 ms (f99–104): contact: a white-cyan core flash inside the vortex at Ho-Oh (f97–101); the vortex wraps the defender (f102–104).
- 2400–3300 ms (f105–126): the vortex fades and a thin white ring circles the defender (f102–107); the body dissolves (f108–119).
- 3300–4300 ms (f120–128): Lugia returns to its spot; the wide night-sea shot resumes (f120–121).
Pokémon: Lugia spreads its wings and rears (0–400 ms, the orb builds at its chest); the orb leaves the wing toward the lane (1100 ms); Lugia stays on its spot while the vortex hits (2230 ms); it recovers its pose (3300 ms). Cue for the card ghost: rise (lift and hover), then recoil to the spot after contact.
Camera & screen: a striped wipe at f28–32 (a transition, dropped); a whole-frame white flash at f97–101 (house rule: local impactFlash on the defender); the night-sea cut at f120 is dropped; the wide shot holds otherwise.
Palette: #26E0FF, #1E63E0, #A8F3FF, #FFFFFF, #0E1F5C
Closest generic: whirlpool (Appendix A, Water special tier 1): a spiral of tongues around the defender. What must differ: the vortex is a cyan wind cylinder with crescent rings and white star flares, and the orb is built at the attacker's chest and travels across the lane first.
Board mapping:
- 0–500: coreCharge(lead 0.42, r0 0.16, r1 0.45, palette override cyan #26E0FF / #A8F3FF); ring(kind 'face', count 2, r0 0.2, r1 0.6) on the attacker 100–500; orbitCharge(count 4, half 'front') (the cyan sparks)
- attacker rise (lift 0–0.6 c, hover 1.2 c)
- 450–1000: projectile(path 'straight', r0 0.42, r1 0.6, tongues 4, palette cyan) (the orb crossing the lane)
- 600–800: impactFlash(attacker) (top layer, local; the white core pulse)
- 1000–1600: spiral(target 'defender', turns 2.5, r0 0.2, r1 1.1, rpm 90, palette override cyan #26E0FF / #1E63E0) (the vortex)
- 1000–1300: starFlare(arms 'ring', width 0.46, palette white) on the defender (the star flares inside)
- 1050: contact; impactFlash(defender) (top layer, local); ring(kind 'face', count 2, r0 0.3, r1 1.1) 1050–1450 (the white ring)
- defender float (lift −0.15 h, tilt ±4° at 1.5 Hz, held through the beat, drop with bounce)
- contact at 1050; total 2000
New pieces: none (the vortex uses spiral with a cyan palette override; the star flares use starFlare).
Flags: house-rule translations (the whole-frame white flash at f97–101 becomes a local impactFlash; the striped wipe and the night-sea cut are dropped); the raw reference (4.3 s) is compressed to 2.0 s with contact at 1050 ms (raw f99 = 2230 ms); the flying palette is replaced by the reference's cyan (#26E0FF) as the record for this move; gen7 used for the orb's lane path and the vortex shape; uncertainty: the star-flare count inside the vortex (3 in gen7, 2 in EV).

### Bleakwind Storm — Tornadus · flying · special · power 100
Refs: video EV (5500 ms, 30 fps, effect frames 29–149) — no EV video beyond the primary · gen7 none
Signature read: a grey-white helix tornado that rises over the defender's footprint, its base collapsing into a pale ice-mist disc that shimmers with rings.
Video beats (t = 0 at frame 29; ms = (frame − 29) × 33.3):
- 0–167 ms (f29–34): first wind: a faint white arc at the bottom-right of the frame (f29), then white ground streaks at the front (f34); text box "Boréas utilise Typhon Hivernal !" (f22–39).
- 167–567 ms (f34–46): white ground streaks spread under the trainer and across the snow (f36–40); the purple loop bends toward the defender (f42–46).
- 567–1000 ms (f46–59): the purple loop arcs high over Tornadus (f48–56); the camera pans to the defender at f50; a white wedge crosses the defender's left side (f56–62).
- 1000–1670 ms (f59–79): a silver-grey vortex starts at the defender's footprint (f62–66, a blue-white swirl ring on the ground); it rises into a tall column (f68–82).
- 1670–2500 ms (f79–104): the column spins into a helix tube of grey-white bands (f80–102); white ground streaks sweep round its base (f84–112).
- 2500–3330 ms (f104–129): the helix holds; streaks trail to the right (f108–112); the column base turns pale blue (f116–118).
- 3330–4000 ms (f129–149): the column collapses into a blue-white ice-mist disc at the defender's base with shimmering rings (f116–124), then fades.
- 4000–5000 ms (f149–179): the effect is gone; Tornadus stays on its cloud; the purple loop moves again (f156–164).
Pokémon: Tornadus stays on its cloud (0–1000 ms), the purple loop arcs over it (570–1000 ms); the body does not move at contact; the loop moves at 4700 ms. Cue for the card ghost: rise (lift and hover); no lunge.
Camera & screen: a camera cut to the snow field at f28 and a pan to the defender at f50; no full-screen tint or flash; the snow is weather, not an effect. Board replacement: the pan is dropped (fixed view).
Palette: #DDEFFF, #9CCFEF, #6B8FB3, #FFFFFF, #3E6FB5
Closest generic: whirlpool (Appendix A, Water special tier 1): a spiral of tongues round the defender. What must differ: the helix is grey-white and wind-like, the base collapses into an ice-mist disc with shimmering rings, and the attacker's loop is a visible ribbon.
Board mapping:
- 0–600: rise (attacker, lift 0–0.6 c, hover 1.2 c); beam(kind 'segmented', w 0.3, from attacker to defender, 150–600) (the ground streaks)
- 300–900: cloud(target 'defender', count 6, radius 0.35, drift 0.6, alpha 0.4, palette white/#9CCFEF) (the wind lead-in)
- 600–1000: defender tremble (pre-contact)
- 1000: contact; impactFlash(defender) (top layer, local) 1000–1250; spiral(target 'defender', turns 2.5, r0 0.2, r1 1.1, rpm 90, palette override #DDEFFF/#6B8FB3) 1000–2000 (the helix tornado)
- 1100–1800: beam(kind 'helix', w 0.3, turns 3, from the defender's base) (the tube's bands); beam(kind 'segmented', w 0.3, 1200–1800) (the base streaks)
- 1700–2200: cloud(target 'defender', count 8, radius 0.35, drift 0.6, alpha 0.5, palette [200, 230, 245]) (the ice mist disc)
- 1800–2200: ring(kind 'floor', count 2, r0 0.3, r1 1.3) on the defender (the shimmering rings)
- defender float (lift −0.15 h, tilt ±4° at 1.5 Hz, held through the beat, drop with a 0.06 bounce)
- contact at 1000; total 2200
New pieces: none (the helix uses spiral with a palette override; the ice disc uses cloud and ring).
Flags: house-rule translations (the camera pan at f50 is dropped; no full-screen flash in the reference); the purple loop is visible from f0 before the first move-specific wind at f29 (the loop is read as the attacker's ribbon, not an effect), so t0 is f29 (if the loop counts as effect, t0 is f0 and every time shifts by 967 ms); gen7 none; the raw reference (5.5 s) compresses to 2.2 s with contact at 1000 ms (raw f59); uncertainty: the grey-white helix colour is read from one tile (#9CCFEF is the closest sample).

### Dragon Ascent — Rayquaza · flying · physical · power 120
Refs: video EV (10500 ms, 30 fps, effect frames 28–157) · gen7 USUL (used for: shape/path/count/angle)
Signature read: Rayquaza uncoils and rises with gold chain-rings round it, then a green-yellow sphere falls from the sky onto the defender and bursts into a green-white leaf-and-rock explosion.
Video beats (t = 0 at frame 28; ms = (frame − 28) × 33.5):
- 0–100 ms (f28–31): text box "Rayquaza utilise Draco-Ascension !" (from f15); the coil's tail fins spread with a pale green flare at the fin (f28–31).
- 100–300 ms (f31–37): the lower coil unfurls and tilts; the head turns up; the body starts to rise (f33–37).
- 370–1270 ms (f39–66): camera cut to a cliff-and-sea backdrop; Rayquaza spins and rises with green motion trails, rearing tall at f45–54 with blur (house-rule: the cut is dropped).
- 1270–2000 ms (f66–88): the body coils into a loop over the defender's side (f79–88); gold-yellow edges show on the loop (f79–91).
- 2000–2600 ms (f88–106): the loop collapses and the body fades upward out of frame (f94–103); yellow-green sparks fall (f97–106).
- 2640–3000 ms (f106–115): camera cut to the defender side; empty sky and the red-ringed sphere defender at the right.
- 3000–3350 ms (f115–121): a small four-point cyan star appears in front of the defender (f118); a gold-rimmed rainbow burst at f121.
- 3350–4150 ms (f121–136): an energy ball grows in front of the defender with concentric cyan rings and speed streaks (f124–136).
- 4150–4800 ms (f139–152): contact: green-white explosion with leaf-like pale-green shards at the defender (f142); rock chips and sparks (f145–154); the defender's HP falls (f151–157).
- 4800–5900 ms (f152–157): the explosion grows to yellow-green cloud; the defender remains in it.
Pokémon: uncoils (0–300 ms), rises with trails (370–1270 ms), loops over the defender's side (1270–2000 ms), fades upward (2000–2600 ms). Cue for the card ghost: rise and rear, then the body leaves the frame and returns; the ghost's gold rings are the orbitCharge.
Camera & screen: cliff cut at 370 ms; sky cut at 2640 ms; the cut back to the defender at 3000 ms; the green-white burst is local; no full-screen flash in the EV clip beyond the contact cloud (f152–157). Board replacement: the cloud becomes a local impactFlash on the defender; the cuts are dropped (fixed board view).
Palette: #3CC86A, #B8F04A, #F4E84A, #5FF0F0, #FFFFFF
Closest generic: brave-bird (the card-motion dash, physical flying tier 2–3): a dash with the card's trail. What must differ: the attacker rises and loops instead of dashing, the strike is a sphere that falls from above (not a lane dash), and the impact is a leaf-and-rock cloud (not a feather burst).
Board mapping:
- 0–370: attacker rise (lift 0–0.6 c, hover 1.2 c, glow 0.5); orbitCharge(count 5, half 'back', palette override gold #F4E84A) (the tail fins and loop)
- 370–1000: orbitCharge(count 6, half 'front', r0 0.2, r1 0.35, palette override #B8F04A) (the gold rings)
- 600–1000: projectile(path 'arc', bow 0.4, r0 0.4, r1 0.5, tongues 4, palette green #3CC86A) (the descending sphere stand-in; the true drop is in New pieces)
- 800–1000: defender tremble (pre-contact)
- 1000: contact; impactFlash(defender) (top layer, local); starFlare(arms 'ring', width 0.46, palette cyan #5FF0F0) 1000–1400; shards(count 8, arc 360, distance 1.1, palette #B8F04A/#3CC86A, leaf) 1000–1500; ring(kind 'face', count 2, r0 0.3, r1 1.1) 1000–1400; speedRays(count 16, defender, 1000–1200)
- 1000–1400: defender knock (strength 0.45, heavy physical)
- attacker rise, defender knock 0.45
- contact at 1000; total 2200
New pieces:
- comet drop: a green-yellow sphere with 3 trailing tongues falling from 1.6 h above the defender (screen) into its footprint over 800–1000 ms; projectile is lane-only, so this needs a vertical-drop path in the projectile drawer.
Flags: house-rule translations (the cliff and sky cuts are dropped; the 3000 ms cut back to the defender is dropped; the contact cloud stays local); gen7 used for the falling sphere shape and the ring-loop path; uncertainty: t0 is frame 28 (the fins move at 28–29, the rise is clear at 33); the raw reference (10.5 s) compresses to 2.2 s, so the uncoil and loop share the first second; the defender's sphere hit is at f142 (contact) and may be f139.

### Oblivion Wing — Yveltal · flying · special · power 80
Refs: video EB (12766 ms, 30.08 fps, effect frames 0–364) — no EV video · gen7 USUL (used for: shape/path/count/angle)
Signature read: Yveltal rears with its wings arched, then a dark-crimson sphere fires a red beam and a crimson column erupts from the ground under the defender; the drain is a teal-green sparkle orb that returns to the attacker.
Video beats (t = 0 at frame 0 — the clip opens mid-rear with the text box "Yveltal utilise Mort'Ailes !" already up, so the true start is earlier; ms = frame × 33.2):
- 0–800 ms (f0–24): Yveltal rears with its wings arched over the camera (f0–12), then the wings spread flat and sweep (f16–24).
- 830–1000 ms (f28–36): thin white vertical streaks rain on the ground between the cards (f28–36).
- 1330–2200 ms (f40–66): camera cut to a close view on Yveltal rising with its wings spread against a blue sky (f44–68); a dark-crimson body.
- 2300–3050 ms (f72–92): full-screen black-out with a dark-red silhouette and a red core (f72–76, house rule); the silhouette rises and a magenta ring grows round it (f51 gen7 ref, EB f80–92).
- 3050–3700 ms (f92–112): a magenta-core crimson sphere with an orange crescent flare (f96); a red beam streaks across the screen from it (f100–112).
- 3700–3870 ms (f112–116): camera cut to the defender side (a white bird, Airmure, on the desert floor).
- 3870–4250 ms (f116–128): a dark-red column rises from the ground under the defender (f120–124); the beam ends on the column at f128 (contact ~4250 ms).
- 4250–4960 ms (f128–152): the column bursts into red shards and black smoke at its base (f128–152); crimson and magenta sparks (f140–148).
- 4960–5600 ms (f152–168): smoke thins; a pale red disc spreads on the ground; the defender stands in it (f164).
- 5600–6600 ms (f168–192): cut back to Yveltal; it turns and returns to its stance (f176–188).
- 6600–8300 ms (f192–240): gold rings and sparkles round the attacker (f192–204, the 'super effective' box is UI, not an effect); wings flail (f208–232).
- 8300–9800 ms (f240–288): teal-green sparkle orb forms on the defender side (f264–284, the drain orb, teal #6BE8A0 with white sparks and an orange disc).
- 9800–10900 ms (f288–330): the drain orb dims; Yveltal's HP bar rises (368 → 393 over f288–340).
- 10900–12700 ms (f330–384): "L'énergie ... est drainée !" text; Yveltal stands in its stance.
Pokémon: rears with wings arched (0–800 ms), spreads its wings (800–1000 ms), rises toward the camera (1330–2200 ms), fires a beam from its chest sphere (3050–3700 ms), and recovers its stance (5600–6600 ms). Cue for the card ghost: rear-lurch (rear and lunge), then a recoil to the spot; the drain is a heal on the attacker's bar.
Camera & screen: cut to a close view at 1330 ms; full-screen black-out at 2300–3050 ms (house rule, dropped); cut to the defender at 3700 ms; cut back at 5600 ms. Board replacement: the black-out becomes a local dark vignette round the attacker (alpha ≤ 0.45, shade #120608); the cuts are dropped (fixed view).
Palette: #D91E4B, #FF2E6E, #7A0F26, #120608, #6BE8A0, #FF9A3C
Closest generic: dark-pulse (Appendix A, Dark special, pending): a dark body that travels as rings. What must differ: the beam is solid crimson and the column erupts from the ground under the defender; the drain orb is teal-green, not dark.
Board mapping:
- 0–800: attacker rear-lurch (rear 0.14, glow 1); aura(attacker, hz 2, alpha 0.5, palette override #7A0F26/#120608) (the dark wing glow)
- 300–800: coreCharge(lead 0.42, r0 0.18, r1 0.5, palette #D91E4B / #FF2E6E) (the chest sphere)
- 800–1000: rain(target 'defender', count 8, height 1.6, spread 0.9, palette white streaks) (the white ground streaks)
- 550–950: beam(kind 'solid', w 0.5, from attacker to defender, palette #D91E4B) (the red beam)
- 1000: contact; impactFlash(defender) (top layer, local); pillar(from 'below', height 1.8, w 0.6, palette #7A0F26 deep) 1000–1400 (the crimson column)
- 1000–1400: ring(kind 'floor', count 2, r0 0.3, r1 1.3, palette #D91E4B) on the defender (the red disc)
- 1000–1400: splash(target 'defender', count 10, arc 140, direction -90, gravity 0.5) with palette red shards (the shards)
- 1200–1800: smoke(target 'defender', count 6, palette #120608) (the black smoke at the base)
- defender knock (strength 0.3)
- 1400–2000: aura(defender, hz 2, alpha 0.6, palette #6BE8A0) (the teal drain halo)
- attacker rear-lurch, defender knock 0.3
- contact at 1000; total 2200
New pieces:
- drain orb: a teal-green sparkle body (#6BE8A0 with white motes) that leaves the defender at 1200 ms and travels along the lane back to the attacker over 1200–1800 ms; projectile is lane-forward only, so it needs a reverse path.
Flags: house-rule translations (the full-screen black-out at 2300–3050 ms becomes a local dark vignette; the cut to the defender side and the cut back are dropped); EB is the primary (no EV video); gen7 used for the crimson silhouette, the magenta ring and the drain orb's shape; the 'super effective' and drain text boxes are UI, not effects; uncertainty: t0 is frame 0 (the attacker is already rearing; the earlier wind-up is not in the clip); the contact at f128 may be f124; the column's ground origin is read from one tile.

### Behemoth Bash — Zamazenta · steel · physical · power 100
Refs: video EV (6000 ms, 30 fps, effect frames 26–161) · gen7 none
Signature read: a crowned Zamazenta wrapped in an orange-red crown-shield of blades that charges up and then smashes into the defender in a yellow-white explosion with cyan flecks.
Video beats (t = 0 at frame 26 — the camera cut to the wide field; ms = (frame − 26) × 33.3):
- 0–300 ms (f26–35): camera cut from the close-up to a wide field; Zamazenta is steady with a faint orange-red glow on its crown and shield edges (f26–30); text box "Zamazenta utilise Aegis Maxima !" (f0–45).
- 300–700 ms (f35–47): the orange-red shield grows and crown blades fan out (f36–47); small orange-red rings and sparks spread round the feet (f36–44).
- 700–1300 ms (f47–65): the crown-shield widens into a fanned set of 5–6 tapered orange-red blades round the body (f47–65); red sparks orbit it at the feet (f52–65).
- 1300–1700 ms (f65–77): orange flame sheets flare round the shield and sweep across the defender's side (f67–79); a purple-pink blade-form slices across at f73–75.
- 1700–1900 ms (f77–83): a blue-white flare on the attacker's flank (f77–81); a white-yellow starburst begins on the defender (f81–83).
- 1900–2100 ms (f83–88): contact: full white-yellow flash on the defender with speed lines (f83–87) (house rule: whole-screen; kept local).
- 2100–2800 ms (f88–108): a large yellow-white explosion fills the defender's footprint with cyan flecks and orange shards (f90–108).
- 2800–3400 ms (f108–124): the explosion turns amber and orange, shards fly (f110–124); a yellow glow pools at the base (f118–124).
- 3400–4100 ms (f124–134): the whole frame turns orange-red (house rule: full-screen tint, dropped); flame bursts on the defender's side (f131–134).
- 4100–5100 ms (f134–161): tint fades to grey-green; the defender stands; the attacker returns to its spot (f147–161).
Pokémon: Zamazenta stands steady (0–300 ms), its crown-shield grows and fans to its full width (300–1300 ms), it lunges with the shield at contact (~1900 ms), and it returns to its spot after the explosion (4100 ms). Cue for the card ghost: lunge (wind 0–400 ms, strike to the defender at contact, recoil) with a crown glow (aura) on the wind.
Camera & screen: camera cut to the wide field at 0 ms; full-screen white flash at 1900–2100 ms (house rule, becomes local); full-screen orange-red tint 3400–4100 ms (house rule, dropped); the grey-green fade at 4100 ms is the scene returning to normal. Board replacement: the white flash is a local impactFlash on the defender; the tint is dropped; the cut is dropped (fixed view).
Palette: #FF5A2E, #FFB13B, #FFF27A, #FFFFFF, #3FE0FF
Closest generic: fire-punch (Appendix A, Fire physical tier 3): a fiery physical strike. What must differ: a crown-shield of blades charges first (not a fist of flame), the impact is a yellow-white explosion with cyan flecks and orange shards, and the afterglow is amber rather than red.
Board mapping:
- 0–400: lunge attacker wind (wind 0–0.4 c, lift scale 1.06); aura(attacker, hz 2, alpha 0.6, palette override #FF5A2E/#FFB13B) (the crown glow); orbitCharge(count 6, half 'back', r0 0.18, r1 0.26, palette #FF5A2E) (the red sparks round the feet)
- 300–700: shockRings(count 2, delay 0.3, palette #FFB13B) on the attacker (the crown rings)
- 400–1000: lunge strike: attacker to the defender (strike 0.4 c–1.0 c, reach min(0.9 h, length − 0.9 h))
- 700–1000: coreCharge(lead 0.42, r0 0.2, r1 0.5, palette #FF5A2E / #FFB13B) (the shield core)
- 900–1000: defender tremble (pre-contact)
- 1000: contact; impactFlash(defender) (top layer, local, white); starFlare(arms 'dai', width 0.46, palette #FFF27A/#FFFFFF) 1000–1300; speedRays(count 16, defender, 1000–1200)
- 1000–1500: shards(count 8, arc 360, distance 1.1, palette #FFB13B/#FF5A2E) on the defender; ring(kind 'face', count 2, r0 0.3, r1 1.1, palette #FFF27A) 1000–1400
- 1000–1800: pillar(from 'below', height 1.8, w 0.7, palette #FFF27A) on the defender (the explosion column); cloud(target 'defender', count 8, radius 0.35, drift 0.6, alpha 0.5, palette #FFB13B) 1000–2000 (the amber mass)
- 1400–2200: aura(defender, hz 3, alpha 0.5, palette override #FF7A2E) (the orange afterglow)
- 1000–1500: particles: flecks (defender, count 14, kind streak, palette #3FE0FF) (the cyan flecks)
- attacker lunge (wind 0–400, strike 400–1000, recoil 1000–1500), defender knock (strength 0.45, heavy physical)
- contact at 1000; total 2200
New pieces:
- crown-shield blade fan: 5–6 tapered orange-red tongues fanned from the attacker's back at ±60° (0.4–1.0 h long), drawn with the fire material's tongue and rotating slowly with the lunge; starFlare centres on the defender, orbitCharge is a ring of bodies, so no existing drawer fans blades off the attacker.
Flags: house-rule translations (the full-screen white flash at 1900–2100 ms becomes a local impactFlash; the full-screen orange-red tint at 3400–4100 ms is dropped; the camera cut is dropped); no gen7; contact is at raw f83–88 (1900–2100 ms), compressed to 1000 ms on the board, so the wind-up and the shield growth share the first second; uncertainty: t0 is the camera cut at f26 (the glow is faint at f26–30); the cyan flecks are drawn as particles, not a drawer.

### Behemoth Blade — Zacian · steel · physical · power 100
Refs: video EV (6500 ms, 30 fps, effect frames 18–193) · gen7 none
Signature read: Zacian holds a long white-gold sword out in front of it, then leaps along the lane in a violet light-storm and ends in a yellow-orange blade explosion on the defender.
Video beats (t = 0 at frame 18 — the camera cut to the close view with the sword extended; ms = (frame − 18) × 33.3):
- 0–300 ms (f18–26): the sword's white-gold blade extends forward from the hand; text box "Zacian utilise Gladius Maximus !" (f6–45); blue sparkle motes appear at the feet (f26).
- 300–1000 ms (f26–48): blue motes orbit the feet and spread (f36–48); the blade stays pointed at the defender.
- 1000–1500 ms (f48–63): Zacian's crystal wings unfold above it (cyan-blue, pale-tipped) (f51–63); the motes thicken.
- 1500–1800 ms (f65–71): Zacian leaps forward with the sword low (f65–69); a white-blue lane streak opens behind it (f71).
- 1800–2600 ms (f73–97): white-blue, violet and cyan streaks run along the lane to the defender (f73–83); the defender's side shows cyan and pink shards (f85–95); a violet burst at f97 (contact ~2600 ms raw).
- 2600–3300 ms (f98–120): full-frame violet and magenta light rays fan out in all directions (f98–108), then a cyan ring under the defender (f116–124) (house rule: full-screen rays, kept as a local sunburst on the defender).
- 3300–3900 ms (f120–132): a bright white flash on the defender (f128–132) with a pink-violet glow under it (house rule: local).
- 3900–4500 ms (f134–146): a yellow-orange blade-burst dome engulfs the defender; the HP bar falls (f140–146).
- 4500–5000 ms (f147–163): the burst persists and turns amber, fading toward the top (f147–167).
- 5000–5900 ms (f167–193): the scene returns to the grass field; Zacian stands at its spot, sword back at its side (f171–191); it returns to its stance (f193).
Pokémon: holds the sword forward (0–300 ms), unfolds its crystal wings (1000–1500 ms), leaps along the lane (1500–1800 ms), and returns to its spot (5000–5900 ms). Cue for the card ghost: lunge (wind with the sword extended, strike along the lane, recoil) with a blue glow on the wind.
Camera & screen: camera cut to the close view at 0 ms; full-frame violet ray storm 2600–3300 ms (house rule: a sunburst that must be local); full-screen white flash 3300–3900 ms (house rule: local); cut back to the wide field at 5000 ms; the blade-burst stays local to the defender.
Palette: #2F8CFF, #7FD8FF, #B26BFF, #FFF4C2, #FFB13B
Closest generic: iron-head (Appendix A, Steel physical, entry still pending): a steel physical strike. What must differ: a blade-sword is held forward and carried along the lane (not a head-butt), the wings open first, and the impact is a violet ray-burst then a yellow-orange blade-burst.
Board mapping:
- 0–400: lunge attacker wind (wind 0–0.4 c, lift scale 1.06); aura(attacker, hz 3, alpha 0.6, palette #7FD8FF) (the wing glow)
- 0–600: orbitCharge(count 6, half 'front', r0 0.2, r1 0.3, palette #2F8CFF) (the blue motes at the feet)
- 300–1000: beam(kind 'solid', w 0.3, palette #FFF4C2, from attacker to defender) (the sword blade, pointing at the defender)
- 400–1000: coreCharge(lead 0.42, r0 0.18, r1 0.45, palette #7FD8FF) (the wing glow)
- 600–1000: shockRings(count 2, delay 0.3, palette #7FD8FF) on the attacker (the wing unfold)
- 900–1000: defender tremble (pre-contact)
- 1000: contact; impactFlash(defender) (top layer, local, palette #B26BFF/#FFFFFF); speedRays(count 16, defender, 1000–1300, palette #B26BFF/#5BE0FF); starFlare(arms 'cross', width 0.46, palette #B26BFF) 1000–1300
- 1000–1400: beam(kind 'solid', w 0.4, from attacker to defender, palette #B26BFF) (the violet lane streak); shards(count 8, arc 360, distance 1.1, palette #5BE0FF / #FF7AD9) on the defender
- 1100–1500: ring(kind 'floor', count 2, r0 0.3, r1 1.3, palette #5BE0FF) on the defender (the cyan ring)
- 1300–1500: impactFlash(defender) (top layer, local, palette #FFFFFF) (the second flash)
- 1300–1800: pillar(from 'below', height 1.8, w 0.7, palette #FFB13B) on the defender (the blade burst)
- 1300–2000: cloud(target 'defender', count 8, radius 0.4, drift 0.4, alpha 0.5, palette #FFD04A) (the yellow-orange mass)
- 1400–2200: aura(defender, hz 3, alpha 0.5, palette #FF9A2E) (the amber afterglow)
- attacker lunge (wind 0–400, strike 400–1000, recoil 1000–1500), defender knock (strength 0.45, heavy physical)
- contact at 1000; total 2200
New pieces: none.
Flags: house-rule translations (the full-frame violet ray storm at 2600–3300 ms becomes a local speedRays on the defender; the full-screen white flash at 3300–3900 ms becomes a local impactFlash; the camera cuts are dropped); no gen7; the red dotted line from Zacian's hand at f0–16 is read as the game's aim UI, not drawn; the raw contact (f97, 2600 ms) is compressed to 1000 ms on the board; uncertainty: t0 (f18) is the camera cut; the wing shape is read from one tile.

### Doom Desire — Jirachi · steel · special · power 140
Refs: video EV (10267 ms, 30 fps, effect frames 27–288) · gen7 USUL (used for: shape/path/count/angle; the USUL clip's French text reads "Carnareket" where the EV text reads "Vœu Destructeur" — see Flags)
Signature read: Jirachi's gold four-point star-flare, then a delayed strike of many magenta light columns falling from above onto the defender, with a cyan-white wave and blue ground orbs.
Video beats (t = 0 at frame 27 — the camera cut into the forest, Jirachi's first move pose; ms = (frame − 27) × 33.3):
- 0–200 ms (f27–33): camera cut from the waterfall to a forest; Jirachi tilts low over the ground; a white-gold ring forms under it (f30–33); text box "Jirachi utilise Vœu Destructeur !" (f0–27).
- 200–500 ms (f33–42): a bright gold four-point star-flare forms on Jirachi with a red-pink core (f39–42).
- 500–1000 ms (f42–57): the star grows; a cyan ring with white sparks circles it (f45–48); violet spike-glints ring it (f51–57); a red core flares at its centre (f48–57).
- 1000–1800 ms (f57–81): the star dims; Jirachi floats and dims (f63–75); the camera stays on it (f77–81).
- 1800–5600 ms (f81–220): the wish: the text box reads "Jirachi souhaite que la capacité ... se déclenche !" (f92–152) while Jirachi hovers in the waterfall, then the cut to the forest (f178–196) shows the defender (a wild Pokémon) with the trainer; a dark-crimson ring and rainbow rays appear round the defender (f199–205).
- 5600–6600 ms (f217–231): contact: a cyan-white wave and full-screen white-magenta burst of shards (f217–231; house rule: whole-screen white).
- 6600–7800 ms (f234–261): magenta and white radial rays with cyan shard spikes sweep across the defender's footprint (f234–258); a cyan-white wave sweeps across the frame (f261–273).
- 7800–8600 ms (f273–288): the defender recoils in the waterfall (f276–288); its HP bar falls.
- 8600–10267 ms (f288–306): Jirachi returns to its spot (f294–306).
Pokémon: Jirachi rises and tilts (0–200 ms), its star flare grows (200–1000 ms), it hovers for the wish (1000–5600 ms), and it returns to its spot (8600 ms). Cue for the card ghost: rise and hover (wish), then a glow on the star, then recoil to the spot.
Camera & screen: cut to the forest at 0 ms; cut to the forest at 5600 ms (the defender's side); full-screen white-magenta burst at 5600–6600 ms (house rule); full-screen cyan-white wave 6600–7800 ms (house rule: local). Board replacement: the whole-screen bursts become a local impactFlash on the defender; the cuts are dropped (fixed view); the long wait is compressed out.
Palette: #FFE066, #FFFFFF, #5BE0FF, #FF2E88, #B26BFF
Closest generic: solar-beam (Appendix A, Grass special tier 3): a light column from above (the pillar drawer from 'above'). What must differ: Doom Desire is a delayed steel strike, so the charge is a gold star on the attacker and the damage is a field of several magenta columns falling from above, with cyan ground orbs and a cyan-white wave, not one beam.
Board mapping:
- 0–500: attacker rise (lift 0–0.6 c, hover 1.2 c, glow 0.5); coreCharge(lead 0.42, r0 0.18, r1 0.5, palette #FFE066 / #FFFFFF) (the gold star)
- 300–700: ring(kind 'face', count 2, r0 0.3, r1 0.8, palette #5BE0FF) on the attacker (the cyan ring)
- 400–1000: orbitCharge(count 6, half 'front', r0 0.2, r1 0.3, palette #B26BFF) (the violet spike-glints)
- 700–1000: pillar(from 'above', height 1.8, w 0.6, palette #FF2E88) on the defender (the first column falling)
- 900–1000: defender tremble (pre-contact)
- 1000: contact; impactFlash(defender) (top layer, local, #FFFFFF); starFlare(arms 'ring', width 0.46, palette #FFE066) 1000–1400 (the gold rays); speedRays(count 16, defender, 1000–1300, palette #FF2E88 / #5BE0FF)
- 1000–1500: pillar(from 'above', height 1.8, w 0.4, palette #FF2E88) (the second and third columns, staggered at 1100 and 1200); pillar(from 'below', height 1.6, w 0.7, palette #5BE0FF) on the defender (the cyan ground orbs)
- 1000–1800: shards(count 8, arc 360, distance 1.1, palette #5BE0FF / #FFFFFF) on the defender; ring(kind 'floor', count 2, r0 0.3, r1 1.2, palette #5BE0FF) on the defender
- 1000–2000: cloud(target 'defender', count 8, radius 0.4, drift 0.4, alpha 0.5, palette #B26BFF) (the violet aftermath)
- defender knock (strength 0.3)
- contact at 1000; total 2200
New pieces:
- falling-column field: 3–4 magenta columns (pillar from 'above') staggered 100 ms apart across the defender's footprint, each with a white core; the pillar drawer draws one column, so the field needs a count parameter.
Flags: house-rule translations (the whole-screen white-magenta burst at 5600–6600 ms and the full-screen cyan-white wave at 6600–7800 ms become a local impactFlash and speedRays on the defender; the cuts are dropped; the wish wait (about 4 s raw) is compressed out); the gen7 USUL clip's text reads "Carnareket" (its wish and strike sequence matches EV, so the two are read as the same move, but the French name differs and the gen7 defender is a bat, not the EV wild Pokémon); status move: no; uncertainty: t0 is f27 (the forest cut, the first move pose); the contact frame is f217 (or f231); total 2200 ms within the budget.

### Double Iron Bash — Melmetal · steel · physical · power 60
Refs: video EB (8300 ms, 30 fps, effect frames 33–207) — no EV video · gen7 none
Signature read: two hex-plated steel fists (gold collar) punch the defender one after the other, each landing with a sand puff, sparks and a white ground shockwave ring.
Video beats (t = 0 at frame 33 — the first arm motion; ms = (frame − 33) × 33.3):
- 0–200 ms (f33–39): the text box "Melmetal utilise Écrous d'Poing !" (f0–42); the right arm begins to swing forward (f33–36), the fist rears back.
- 200–600 ms (f39–51): both arms extend toward the defender; the hex fists advance (f42–51) with silver arm tubes.
- 700–800 ms (f54–57): first contact: fists meet the defender's chest with a thin sword-like white streak (f56–57) and sparks (f57); the defender's side flares.
- 800–1100 ms (f57–66): the first punch lands; sand and dust kick up under the fists (f60–66); gold streaks spray upward (f63–66).
- 1100–1700 ms (f66–84): a white ground shockwave ring spreads round the fists (f69); a white flash at f72 (1300 ms); sparks scatter (f72–78) and the ring fades (f84).
- 1700–3000 ms (f84–123): the fists pull back; the arms reset to rest (f87–123).
- 3100–4100 ms (f126–159): the fists rest at their stance; the defender stands.
- 4300–4800 ms (f162–177): second windup: the fists swing out and extend toward the defender again (f162–177).
- 4900–5100 ms (f180–186): second contact: the fist hits the defender with sand and sparks (f183–186).
- 5200–5500 ms (f189–199): a second white ground ring and a white flash at the defender (f195–197); sparks streak off (f189–199).
- 5600–5800 ms (f201–207): the ring thins; gold streaks fade.
- 5900–7100 ms (f209–247): the arms return to rest; the scene settles.
Pokémon: Melmetal stands (0–200 ms), rears and extends both arms (200–700 ms), punches (700–1100 ms), resets (1700–3000 ms), and punches again (4300–5100 ms). Cue for the card ghost: lunge (wind, strike, recoil) with the second strike replaying the lunge.
Camera & screen: no camera cut; the frame is fixed. Full-screen white flash at 1300 ms and a second at 5400 ms (house rule: local, as a flash on the defender). No tint.
Palette: #9AA7B8, #D5DEEA, #FFFFFF, #FFB347, #E8D7A8
Closest generic: dual-chop (Appendix A, Dragon physical, entry pending): a two-hit physical strike with a stagger. What must differ: two steel fists (not a claw), each hit throws sand and a white ground ring, and the second hit lands on a full reset.
Board mapping:
- 0–400: attacker lunge wind (wind 0–0.4 c); aura(attacker, hz 2, alpha 0.4, palette #D5DEEA) (the steel glint on the fists)
- 400–1000: attacker lunge strike toward the defender (strike 0.4 c–1.0 c); shards(count 4, arc 90, distance 0.6, palette #D5DEEA) at the fist tips (the first punch's sparks)
- 500: hit 1; impactFlash(defender) (top layer, local, white); speedRays(count 10, defender, 500–700, palette #FFB347 / #FFFFFF) (sparks)
- 900–1000: defender tremble (pre-contact)
- 1000: hit 2 (last, contact); impactFlash(defender) (top layer, local, white) 1000–1200; ring(kind 'floor', count 2, r0 0.3, r1 1.3, palette #FFFFFF / #D5DEEA) 1000–1600 (the white shockwave ring)
- 1000–1500: shards(count 8, arc 360, distance 1.1, palette #FFB347 / #D5DEEA) on the defender; smoke(count 6, palette #E8D7A8) 1000–1700 (the sand puffs)
- 1000–1800: particles: sparks (defender, count 14, streak, palette #FFB347)
- attacker lunge recoil 1000–1500; defender stagger (hits 2, strength 0.45, gapMs 500) (the two knocks, the last carries the spring)
- hit 1 at 500; contact (hit 2) at 1000; total 2200
New pieces:
- attacker double-lunge: the card-motion `lunge` strikes once; the second punch needs the strike replayed (lunge re-wind 500–900 ms, strike 900–1000), so the preset must take a `strikes` count.
Flags: no EV video (EB is the primary reference); house-rule translations (the full-screen white flashes at 1300 ms and 5400 ms become local impactFlash on the defender); multi-hit: two strikes, the damage is on the second hit (1000 ms, inside the 1.2 s bound); gen7 none; uncertainty: t0 is frame 33 (the arms begin to move at f33); the first contact (f57, 800 ms raw) and the second (f186, 5100 ms raw) are compressed to 500 and 1000 ms, so the real gap is not kept; total 2200 ms within the signature budget.

### Sunsteel Strike — Solgaleo · steel · physical · power 100
Refs: video EV (9367 ms, 30 fps, effect frames 27–279) · gen7 USUL (used for: shape/path/count/angle; the USUL clip labels the species "Galileo", same move Choc Météore)
Signature read: Solgaleo leaps high off the field and releases a spiked gold-yellow sun that flies down the lane with rainbow streaks and bursts into a yellow-white starburst on the defender.
Video beats (t = 0 at frame 27 — the camera cut to the close view and first mane spread; the text box is up from f14 and the body is static to f24; ms = (frame − 27) × 33.3):
- 0–400 ms (f27–39): close shot; the mane fans up and out, its gold-yellow tips glowing; the head lifts.
- 400–1000 ms (f39–57): mane spreads wide; a blue-white star glyph lights on the forehead (f54–57); the body faces the camera.
- 1000–1800 ms (f57–80): the forehead glyph is bright blue-white (f57–69); the mane edges glow gold; the body turns side-on (f71–80).
- 1800–2300 ms (f80–95): Solgaleo crouches (f83–86), then the mane rises and lifts (f88–95).
- 2300–3300 ms (f95–125): leap: the body rises and leaves the frame (f98–113); a gold body with a glowing mane is high over the field (f116); a white dust ring spreads on the ground (f116–122).
- 3300–3800 ms (f125–140): a small gold silhouette high at top centre (f128); a yellow-white starburst forms with rainbow streaks (green and magenta at f131; violet and cyan at f137–140) fanning down toward the defender. Contact on the defender at 3467 ms (f131–134).
- 3800–4300 ms (f140–154): a large sun-burst on the defender, yellow-white with orange and red sparks; rainbow rays sweep out (f142–154).
- 4300–5800 ms (f157–202): pink-violet rings at the defender (f157); an orange-yellow fireball with spokes and rings holds over the defender's footprint (f160–202).
- 5800–7600 ms (f202–255): cut to a second view of the defender (Magmar against a sky-field): a yellow-white explosion (f213–216), an orange burst (f219–228), then orange embers over the field (f231–255).
- 7600–8400 ms (f255–279): Solgaleo returns to its spot; the field clears; the defender stands.
Pokémon: stands still for the text (0–400 ms), mane spreads and glows (400–1800 ms), crouches (1800–2000 ms), leaps off the field (2300–3300 ms), and returns to its spot after the burst (7600 ms). Cue for the card ghost: rise (lift, hover), then the sun is released from the ghost's chest; recoil to the spot.
Camera & screen: cut to the close view at 0 ms; leap follows the body off the frame (2300–3300 ms); the cut to the second view 5800 ms and the full-frame yellow-white explosion 6200–6400 ms (house rule, becomes local); the return at 7600 ms. Board replacement: the whole-frame explosion becomes a local impactFlash on the defender; the cuts are dropped (fixed view).
Palette: #FFD23F, #FFF3A0, #FF8A1F, #3FE0FF, #FFFFFF (rainbow rays also show #7EE06A green and #E0338A magenta)
Closest generic: fire-blast (the accepted look test, Appendix A worked example): a charged sphere flies down the lane and bursts on the defender with a star flare. What must differ: the sphere is a spiked gold sun with rainbow streaks (not a red ball), the attacker leaps high first, and the contact is a yellow-white starburst with rings, not a flame star.
Board mapping:
- 0–600: attacker rise (lift 0–0.6 c, hover 1.2 c, glow 0.5); aura(attacker, hz 2, alpha 0.6, palette #FFD23F) (the mane glow)
- 0–700: orbitCharge(count 5, half 'back', r0 0.18, r1 0.3, palette #FFD23F) (the mane rays)
- 300–900: coreCharge(lead 0.42, r0 0.2, r1 0.55, palette #FFF3A0 / #FFD23F) (the sun builds at the chest); shockRings(count 2, delay 0.3, palette #FFD23F) on the attacker (the halo rings)
- 600–1000: projectile(path 'straight', r0 0.5, r1 0.7, tongues 8, palette #FF8A1F / #FFD23F) (the spiked sun crossing the lane; the spike head is a New piece)
- 700–1000: beam(kind 'solid', w 0.3, palette #7EE06A) and beam(kind 'solid', w 0.3, palette #E0338A) along the lane (the rainbow streaks trailing the sun)
- 900–1000: defender tremble (pre-contact)
- 1000: contact; impactFlash(defender) (top layer, local, #FFF3A0 → #FFFFFF); starFlare(arms 'ring', width 0.46, palette #FFD23F) 1000–1300; speedRays(count 16, defender, 1000–1200, palette #FF8A1F / #3FE0FF)
- 1000–1500: ring(kind 'floor', count 3, r0 0.3, r1 1.4, palette #FF8A1F / #FFD23F) on the defender (the rings); shards(count 8, arc 360, distance 1.1, palette #FFD23F / #FF8A1F) on the defender
- 1100–1800: cloud(target 'defender', count 6, radius 0.4, drift 0.4, alpha 0.5, palette #FFB347) (the orange aftermath)
- attacker rise (lift 0–0.6 c, hover 1.2 c, land 1.6 c), defender knock (strength 0.45, heavy physical)
- contact at 1000; total 2200
New pieces:
- spiked sun head: the projectile head as a gold-yellow sphere with 14–16 triangular spikes rotating slowly, drawn with the fire material's sphere plus a spike ring; no drawer draws a spiked body.
Flags: house-rule translations (the full-frame yellow-white explosion at 6200–6400 ms and the orange whiteout at 6400–6700 ms become a local impactFlash and starFlare on the defender; the cuts to the second view and the cut back are dropped); the rainbow streaks are kept local as two lane beams; the raw reference (9.4 s) compresses to 2.2 s, so the leap and the charge share the first second; gen7 used for the flight path and the halo-then-sun order; uncertainty: the EV has two bursts (3467 ms and 6200 ms), and the board takes the first as contact (the second is mapped as the aftermath); the contact frame is f131 (3467 ms raw), and t0 is f27 (the cut), so the leap's start is about 0.9 s before the first beat; total 2200 ms within the signature budget.

### Tachyon Cutter — Iron Crown · steel · special · power 50
Refs: video EV (11700 ms, 30 fps, effect frames 181–291) · gen7 none
Signature read: a steel-blue Iron Crown rears up and raises its cyan horn-blades, then throws a fan of three bent cyan blades that strike the defender with a starburst of cyan and orange rays.
Video beats (t = 0 at frame 181 — the rear and horn curl; the text box "Chef-de-Fer utilise Lame Tachyonique !" is up from f176; ms = (frame − 181) × 33.3):
- 0–133 ms (f181–185): the body rears up on its hind legs; the horn tilts back and glows cyan.
- 133–333 ms (f185–191): the horn curls into a crescent; the body is fully up; the horn glows cyan-white (f188–191).
- 333–533 ms (f191–197): the crescent splits into two thin white-cyan curved blades (f194–197).
- 533–933 ms (f197–209): the blades lift off the horn in a bent shape (f200–206); a third blade forms (f209).
- 933–1233 ms (f209–218): three curved blades sweep forward toward the defender (f209–212); cyan speed rays fan out from the defender's side (f212–218).
- 1233–1433 ms (f218–224): contact: a cyan-white starburst on the defender with orange rays extending right (f215–221); sparks burst (f221); the defender's HP falls orange (f224).
- 1433–1633 ms (f224–230): the defender is wrapped in sparks and recoils; the blades are gone.
- 1633–3300 ms (f230–285): the attacker stands with the cyan horn glow fading (f248–263); the defender stands.
- 3300–3400 ms (f285–291): a small white puff appears at the defender's spot (not part of the move; see Flags).
- 3400–5700 ms (f291–348): the attacker is idle; a second text box appears (f321–348) with the cyan horn blades back up (f318–348).
Pokémon: rears and curls the horn (0–400 ms), splits the horn into blades (400–900 ms), and stands still after the strike (1600 ms onward). Cue for the card ghost: rear-lurch (rear, horn lift), then recoil to the spot.
Camera & screen: a steady wide shot throughout; no camera cut; the orange rays at 215–218 f are part of the burst, not a screen tint. Board replacement: none needed (the fixed view matches the board).
Palette: #3FE0FF, #E9FFFF, #7FE9FF, #2AB6E6, #FFA94D
Closest generic: leaf-blade (Appendix A, Grass physical tier 3): a bladed physical strike with a fan of blades. What must differ: the blades are steel (cyan-white, bent into crescents), the attacker rears first, and the impact is a cyan starburst with orange rays rather than leaves.
Board mapping:
- 0–400: attacker rear-lurch (rear 0.14, glow 0.7); aura(attacker, hz 2, alpha 0.6, palette #3FE0FF) 0–700 (the horn glow)
- 400–1000: volley(count 3, stagger 90, r0 0.14, r1 0.2, bow 0.3, palette #E9FFFF / #3FE0FF) (the three crescent blades; the New piece below gives them the curve)
- 900–1000: defender tremble (pre-contact)
- 1000: contact; impactFlash(defender) (top layer, local, #FFFFFF) 1000–1200; speedRays(count 16, defender, 1000–1300, palette #3FE0FF / #FFA94D) (the cyan and orange rays)
- 1000–1400: slashArc(target 'defender', sweep 120, radius 0.7, count 2, gapDeg 30, angle 45, palette #E9FFFF / #3FE0FF) (the blade cut)
- 1000–1400: shards(count 6, arc 150, distance 0.9, palette #7FE9FF) (the cyan sparks)
- defender knock (strength 0.2); attacker rear-lurch recoil 1000–1500
- contact at 1000; total 2000
New pieces:
- crescent blade: a curved steel blade (the tongue with a bow of 0.3 w, steel material's specular line), drawn as the steel material's blade bent along its centre line; `tongue` has no bow parameter today.
Flags: none in the house-rule sense (no whole-screen effect; the orange rays are local); uncertainty: t0 is frame 181, where the rear begins, so the horn's cyan is not a cue (it is present from f0); the white puff at f285–291 may be the defender's faint or return, and is not mapped; the second text box at f321–348 is UI or a replay, not an effect; "Chef-de-Fer" is the French name of Iron Crown; the move's raw contact is f218 (1233 ms), inside the 0.9–1.2 s band only if the board's contact at 1000 ms is taken as the first visible burst at f215 (1133 ms).

