# Design 075 parity ledger: every move vs its Poképédia video (EV = Scarlet/Violet unless noted)
# verdict: ok · tweak (small spec change) · rework · n/a ; then the fix
absorb (grass) — tweak: drop the attacker pre-glow (not in SV); SV marks the foe with a small green ring first; the big floor ring round the attacker at the end reads as clip art → a green sparkle glow on the attacker instead.
acid (poison) — tweak: SV acid is an orange-yellow spray that splashes and smokes on the foe; ours is purple → amber tint.
aerial-ace (flying) — tweak: white blob on the attacker before the strike → tone the attacker glow down; the white slash arc matches.
aeroblast (flying) — rework: SV is a cyan orb charged at the mouth, then a cyan swirling tornado beam to the foe; ours orbits cyan "atom" rings round the foe and ends in a white starburst → cyan coreCharge at the attacker, a helix/spiral beam to the defender, no flare rings.
air-cutter (flying) — tweak: crescents match; the white blob on the struck card at contact is too strong.
ancient-power (ancient) — tweak: the circle round the attacker reads as clip art → drop it; SV raises several violet-ringed stones round the user before they fly → more stones, violet glow on them.
aqua-jet (water) — ok-ish/tweak: water cloak + dash read; white blob on the struck card at contact too strong.
GLOBAL — the light heat sheen (white core, alpha .6–.75) shows as a white slab on the struck card on most light materials → tone the light HEAT_VARIANTS core down globally.
aqua-tail (water) — tweak: SV swings a blue water crescent and splashes; our contact blades read as ice → a water slashArc + splash, no crystal shards.
astonish (ghost) — tweak: SV is a lunge and a small violet-blue sparkle burst on the foe, no eyes → swap the eye glyph for a small violet burst.
astral-barrage (ghost, sig) — tweak: violet spirit flames round the user and a dark violet dome on the foe match in kind; our attacker floor rings read as clip art (drop) and the dome is a hard outline → fill it dark.
GLOBAL — floor rings round the ATTACKER (charge rings) read as clip art like the face rings → drop them; keep defender floor rings only on quake moves.
arm-thrust — video download truncated; refetch.
arm-thrust (fighting) — tweak: SV strikes with open white palms (repeated), orange impact sparks; ours has an attacker floor ring (drop) and sparks only → palm/fist stamps at the defender.
aura-sphere (aura) — tweak: SV charges a blue sphere between the paws (blue streaks) and flies it to a cyan burst; ours has an attacker ring (drop) and a white blob → keep the sphere blue in flight, cyan burst, less white.
aurora-beam (ice) — tweak: SV is a bright rainbow/prismatic beam with pink-rainbow streaks and a rainbow burst; ours is faint travelling hoops → a clear rainbow beam (hued).
avalanche (ice) — tweak: SV drops snow boulders on the foe into a big snow cloud; ours drops one icicle → a volley of snow chunks from the sky + a white snow cloud.
behemoth-bash (steel, sig) — rework: SV is a crimson-orange aura on Zamazenta, a charge, then a big gold-orange explosion; ours is giant white slabs + rings → red/orange aura, gold-orange burst, no white, no rings.
behemoth-blade (steel, sig) — rework: SV is a blue aura, a glowing blade, a dash and blue/violet slash streaks into a bright burst; ours is white slabs + rings → blue aura, blue-violet slash streaks, no white.
bite (dark) — tweak: SV snaps white fang outlines (a jaw) shut on the foe; ours slashes pink → white fangs closing.
fire-blast (fire) — n/a (user-directed 大; SV itself is a big fireball blast without the 大).
shadow-ball (ghost) — tweak: SV charges with violet ribbon arcs round the user and flies a SOLID black-violet orb to a dark burst; our ball reads pale/white-rimmed → solid dark core, violet rim, no white.
brave-bird (flying) — tweak: SV wraps the user in swirling yellow-green energy, charges, white impact; ours circles white feathers in a ring round the attacker → chartreuse spiral, no ring.
NOTE — renders from here on are game-faithful: withoutImpactBeats(spec) + the type's TCG Live impact (Medium) at contact. Earlier white-flash notes partly reflected impactFlash beats the game drops.
FIXED (pass 1): absorb acid aerial-ace air-cutter ancient-power(no change: stone-per-blow) aqua-tail astonish astral-barrage aura-sphere aurora-beam avalanche behemoth-bash behemoth-blade bite shadow-ball brave-bird · GLOBAL: aura glow-only, floor rings dropped (not Ground), light heat sheen toned · OPEN: aeroblast(sig) rework, arm-thrust palms
bleakwind-storm (flying, sig) — tweak: SV drops a grey-white snow tornado on the foe; ours throws white crescents → a tall spiral column on the defender (white-grey) with snow.
blizzard (ice) — tweak: SV whites the foe out in drifting snow haze + flakes; ours lands a white disc and ice shards → a drifting white snow cloud over the foe, flakes, fewer shards.
blue-flare (fire, sig) — tweak: SV is a cyan-blue flame beam wrapped in violet-pink fire into a big cyan-white burst; ours glows ORANGE on the attacker (rim follows the fire material, not the blue tint), a white slab beam and a magenta 5-point star → rim in the move's tint (spec-level tint), slimmer beam, no white star core.
bolt-strike (electric, sig) — tweak: SV wraps Zekrom in a CYAN-blue electric sphere and charges in with cyan bolts; ours glows yellow → spec-level cyan tint for the rim/heat and the bolts.
bubble (water) — ok: bubbles float to the foe and pop.
bug-buzz (buzz) — ok: green sound-wave rings travel to the foe, as SV.
GLOBAL — card rim/heat colour follows the material only; tinted (signature) moves need a spec-level `tint` so the cards glow in the move's colour.
bulldoze (ground) — ok: a stomp and a ground ripple (Ground keeps its floor rings).
bullet-punch (steel) — tweak: SV flies blurred white fist outlines into a white impact; ours shows one small white dot → a volley of 'fist' units, steel-white.
close-combat (fighting) — tweak: SV is a flurry of yellow-orange impact flashes and streaks on the foe; ours shows almost nothing → staggered yellow streak fans (non-dressing) on the defender through the flurry.
collision-course (fighting, sig) — tweak: SV dashes into a golden fire WHEEL and an orange burst; our flat yellow spiked sun disc reads as clip art → a gold 'wheel' unit in flight, no sun disc.
confusion (psychic) — tweak: SV swallows the foe in a big soft pink-white psychic sphere; ours draws wavy rings → add a large soft pink-white glow on the defender under the rings.
core-enforcer (dragon, sig) — rework: SV fires green-yellow beams that carve a Z of light across the ground; ours glows purple (dragon rim) with a white blob → lime/green beam + spec tint (green rim), a Z streak at the defender.
cross-poison (poison) — ok: violet X slash, violet splatter.
crush-grip (normal, sig) — tweak: the giant white hand matches; the end flare is a white star → gold sparks/flare, no white core.
dark-pulse (dark) — tweak: SV pulses dark violet-magenta waves out of the user into a magenta-black burst; our concentric target-reticle rings read as clip art → radial magenta glow pulses + dark tendrils, no reticle.
dark-void (dark, sig) — tweak: SV throws a black-violet orb that opens a black-hole vortex on the foe; ours: pink reticle rings at the user, then a hard-outlined dome → violet orb in flight, a filled dark vortex, soft rim.
GLOBAL — the 'shade' dome / the dark glyph's concentric rings carry hard outlines (clip art) → soften the shade rim; replace the reticle rings.
FIXED (pass 2): aeroblast(sig) bleakwind-storm blizzard blue-flare bolt-strike bullet-punch close-combat collision-course confusion core-enforcer dark-pulse(global bands) dark-void(global rim) · crush-grip ok in-game (white star is dressing) · GLOBAL: spec tint
dazzling-gleam (fairy) — tweak: SV flashes pink-white sparkle and multicoloured glints from the user; our stroked star outlines read as clip art → sparkle glints, filled twinkles, no outline stars.
diamond-storm (rock/gem, sig) — tweak: SV swirls pink-white diamonds round the user, then rains crystals on the foe; ours draws giant 4-point star flares → small flares, a rain of facet units from the sky.
disarming-voice (fairy) — ok: pink sound rings from the user (SV tints the scene pink).
doom-desire (steel, sig) — rework: SV strikes the foe with a beam of pink-white light from the sky and a red-pink burst; ours is huge white 4-point stars and a white sky slab → pink/red tints, small flare, a slim sky beam.
double-iron-bash (steel, sig) — tweak: SV is two heavy nut-fist punches with white streaks; ours is one big white star slab → two fist stamps, no star.
GLOBAL — signature specs use big 'cross' starFlares and tall pillars tinted white/near-white → slabs; cap their size.
FIXED (pass 3): dazzling-gleam diamond-storm doom-desire double-iron-bash · GLOBAL: signature flares ≤0.6, pillars ≤1.2×0.5, fairy sigil bloom
draco-meteor (dragon) — tweak: SV throws a violet orb up and rains magenta meteors into a big magenta cloud; ours sends a white pillar up and one flash → magenta pillar up, a meteor volley from the sky, a magenta cloud.
dragon-ascent (flying/dragon, sig) — tweak: SV is green (Rayquaza) climbing and diving as a green-cyan comet; ours is cyan crescents → spec tint green, green comet.
dragon-breath (dragon) — tweak: SV breathes a pink-violet stream with yellow sparks; ours is a white beam slab → pink-violet slimmer beam.
dragon-claw (dragon) — ok: violet claw streaks.
dragon-energy (dragon, sig) — rework: SV fills the screen with magenta energy orbs, then pink rays; ours is two white starbursts → magenta orb volley/cloud, a pink beam, no white star.
GLOBAL — the dragon palette's core/hot run near-white, so its beams and flares bloom white → shift them to pink-violet.
FIXED (pass 4): draco-meteor dragon-ascent dragon-breath dragon-energy · dragon-claw ok · GLOBAL: dragon palette violet-magenta
dragon-pulse (dragon) — tweak: SV fires a violet-pink pulse beam with a white flash; ours shows only a faint blob → a clear magenta beam (palette now magenta), wider.
draining-kiss (fairy) — tweak: SV kisses with a pink heart, then green-white orbs drain back to the user; our drained orbs are white → green drain tint.
dual-chop (dragon) — ok: two violet chops.
dynamax-cannon (dragon, sig) — tweak: SV is a huge magenta beam/burst; ours a white beam slab → magenta (palette), slimmer beam.
earth-power (ground) — ok: the ground glows orange and erupts under the foe.
FIXED (pass 5): dragon-pulse draining-kiss dynamax-cannon
earthquake (ground) — ok: cracks, slabs rising under the foe, dust (Ground keeps its rings).
electro-drift (electric, sig) — tweak: SV wraps Miraidon in violet-blue lightning and streaks across; ours glows yellow/white → spec tint violet-blue.
electro-shot (electric, sig) — tweak: SV crackles blue-white round the user, then blasts; ours is a yellow-white slab beam → blue-white tint, slimmer beam.
energy-ball (solar) — tweak: SV forms a GREEN sphere ringed in green and flies it to a green burst; ours glows yellow (solar) with a white orb → green tint on the cards and the ball.
eternabeam (dragon, sig) — rework: SV fires a crimson-red beam into a dark red haze; ours draws white X slashes at the user and a white beam → crimson beam, crimson tint, no X.
FIXED (pass 6): electro-drift electro-shot energy-ball eternabeam · earthquake ok
fairy-wind (fairy) — tweak: SV swirls pink-white wind ribbons to the foe with sparkles; ours is a pink beam slab + white blob → a pink spiral wind, no beam slab.
feint-attack (dark, USUL) — ok: a feint and a red-black hit.
fell-stinger (bug) — tweak: SV stabs with a needle under a green-yellow ring glow; ours shows only the card rim → a visible lime needle in flight (spiked unit).
fiery-wrath (dark, sig) — tweak: SV erupts a dark crimson vortex on the foe; ours pink reticle (now soft bands globally) → crimson tint, a dark shade sphere.
flash-cannon (steel) — tweak: SV charges a white-cyan orb and fires a blue-white beam; ours a white slab beam → slimmer, blue-white tint.
FIXED (pass 7): fairy-wind fell-stinger fiery-wrath flash-cannon · feint-attack ok
fleur-cannon (fairy, sig) — tweak: SV charges pink sparkle and fires a pink beam into a pink burst; ours: pink dome (now soft), white beam slab, star outline (now bloom) → pink beam via the beam fix, spec tint pink.
focus-blast (aura) — tweak: SV flies a big cyan-white energy ball into a yellow-white burst; ours a white blob → a visible cyan ball, less white.
freeze-shock (ice, sig) — tweak: SV freezes Kyurem in ice, then shoots a cyan electric ice ball; ours white glow + ice flare → spec tint cyan.
freezing-glare (psychic, sig) — tweak: SV fires a violet-blue psychic beam from glowing eyes; ours a white-blue slab beam → violet-blue beam via the beam fix.
fury-cutter (bug) — ok: a lime slash.
GLOBAL — beams bloom into white slabs: the beam's core pass is too wide/white → narrow the core, lead with the body colour.
FIXED (pass 8): fleur-cannon focus-blast freeze-shock freezing-glare(beam fix) · GLOBAL: beam passes, charge-orb heart
fusion-bolt (electric, sig) — tweak: SV turns Zekrom into a cyan electric orb and strikes with cyan bolts; ours glows yellow → spec tint cyan.
fusion-flare (fire, sig) — ok: a fireball sun over the user, a fiery explosion on the foe.
future-sight (psychic) — ok: psychic rings on the user, later a vortex on the foe (SV's is darker violet with a green ring).
glacial-lance (ice, sig) — ok: a thrown lance, ice spikes bursting round the foe.
glaciate (ice, sig) — ok: the foe encased in an ice block.
FIXED (pass 9): fusion-bolt
gust (flying) — ok: wing flap, white wind wisps on the foe.
head-smash (rock) — tweak: SV glows red-orange, headbutts, and lands a big yellow-orange impact with rock debris; ours shows grey crack lines only → red-orange tint on the cards, orange impact streaks.
heart-swap (psychic, sig) — ok (after the soft dome rim): pink orbs swap, a pink dome on the target.
hex (ghost) — partial: SV is violet-black smoke tendrils on the foe; ours keeps the ghost eyes (a 063 design rule pinned by tests) — left as is.
high-horsepower (ground) — partial: SV stamps a gold horseshoe; no horseshoe shape exists, ours reads as a heavy hoof with dust (left).
FIXED (pass 10): head-smash
hurricane (flying) — ok: a whirl of white wind round the foe.
hydro-cannon (water, sig) — tweak: SV rings the user with water and fires a huge water blast; ours is faint bubbles → a thick blue water beam.
hydro-pump (water) — tweak: SV fires a strong cyan water jet into a white splash; ours is a chain of stacked rings (pulse-train) → a solid widening water beam.
hydro-steam (water, sig) — tweak: SV is a bright blue-white jet and a white steam cloud on the foe; ours a ring chain → solid beam + white steam cloud.
hyperspace-fury (dark, sig) — partial: SV opens gold portal rings with many punching arms and magenta bursts; ours magenta shards (no portal shape; left).
FIXED (pass 11): hydro-cannon hydro-pump hydro-steam
hyperspace-hole (psychic, sig) — tweak: SV opens a dark violet swirling portal by the user, which reappears at the foe; ours draws hard violet ellipse outlines → filled soft portals, no outline.
ice-beam (ice) — ok: a blue-white beam, flakes.
ice-burn (ice, sig) — tweak: SV wreathes Kyurem in cold flame, then an icy blast; ours draws a red GRID lattice round the user (clip art) and a big white ice star → drop the grid, smaller ice star.
ice-hammer (ice) — ok: an icy hammer falls on the foe.
ice-shard (ice) — ok: small ice shards thrown.
FIXED (pass 12): hyperspace-hole ice-burn
ice-spinner (ice) — ok: spinning on ice into the foe, shards.
icy-wind (ice) — ok: icy gusts and frost on the foe.
infestation (bug) — ok: a swarm whirling round the foe.
iron-head (steel) — tweak: SV glints a steel head and charges in; ours swells a big white orb on the user → steel-blue charge tint (the charge-orb heart fix also helps).
iron-tail (steel) — ok: a white tail swipe.
FIXED (pass 13): iron-head
ivy-cudgel (grass, sig) — ok: a teal-green aura, the swing, a teal burst.
judgment (normal, sig) — tweak: SV charges a gold orb under a gold ring, then gold beams rain on the foe into an explosion; ours orbits the orb with spinning ring arcs (coreCharge `rings`, the "spinning circle" again) → no rings, gold pillars from above.
karate-chop (fighting, LGPE) — ok: a quick chop flash.
lands-wrath (ground, sig) — tweak: SV lights the ground gold and bursts gold columns up under the foe; ours fans black spikes at the user → drop the dark fan; the gold columns stay.
leaf-blade (grass) — ok: a green blade streak.
GLOBAL — coreCharge `rings` spin tongue arcs round the charge orb: the spinning circle the user rejected → drop `rings` everywhere.
FIXED (pass 14): judgment lands-wrath · GLOBAL: coreCharge rings dropped
leaf-storm (grass) — ok: leaves swirl round the foe into a green burst.
lick (ghost) — tweak: SV licks with a big pink tongue; ours a tiny violet slash → a thick pink tongue sweep (slashArc, pink).
liquidation (water) — ok: a water crash and splash.
low-sweep (fighting) — ok: a sweeping kick, an orange spark.
luster-purge (psychic, sig) — ok: a white-gold light orb and a gold burst (SV is white light too).
FIXED (pass 15): lick
lunge (bug) — ok: a lunge and a yellow spark.
magical-leaf (grass) — ok: glowing leaves fly with sparkles.
magma-storm (fire, sig) — ok: flame pillars and a fire spiral round the foe (the defender is the top card), cracks under it.
malignant-chain (poison, sig) — ok: pink-violet chain links wrap the foe (the kept ring is the chain's coil).
megahorn (bug) — ok: a green horn drives in, a yellow burst.
metal-claw (steel) — ok: a steel claw slash.
meteor-assault (fighting, sig) — tweak: SV lights the leek gold, charges and lands a golden impact; ours shows faint orange and cracks → gold tint on the cards, gold impact streaks.
mighty-cleave (rock, sig) — ok: a gold-orange cleave.
mist-ball (psychic, sig) — ok: a misty white-violet ball and a violet-white burst.
moonblast (fairy) — ok (after the star bloom fix): moonlight, a pink-white orb, a pink burst.
FIXED (pass 16): meteor-assault
moongeist-beam (ghost, sig) — tweak: SV spreads Lunala's violet crescent wings and fires a white-violet lunar beam; ours is a white slab beam and a white cross → violet spec tint (the beam fix thins the white).
mud-bomb (ground/mud, USUL) — ok: a brown mud ball, brown splatter.
mud-shot (mud) — ok: a stream of mud blobs.
mud-slap (mud) — ok: mud flung at the foe.
multi-attack (normal, sig) — tweak: SV glows orange-gold and slashes with an orange arc; ours white blades → gold-orange tint.
FIXED (pass 17): moongeist-beam multi-attack
mystical-power (psychic, sig) — ok: pink-cyan rings swirl round the foe into a burst.
natures-madness (fairy, sig) — ok after the global fixes (star bloom, soft dome rim): lightning, then a pink-teal sphere engulfs the foe.
night-shade (ghost) — partial: SV is dark violet ribbons and a dark burst; ours keeps the ghost eyes (063 rule pinned by tests).
night-slash (dark) — ok: a pink-violet slash.
nuzzle (electric) — ok: small cheek sparks.
nihil-light (dragon, sig; USUL video) — tweak: the reference is a pink-magenta light burst; ours draws a yellow GRID lattice (clip art) and white blobs → drop the lattice, a pink-green charge.
oblivion-wing (flying, sig) — tweak: SV is Yveltal's crimson beam in a red vortex; ours a pink slab beam and teal wing crescents → crimson tint.
octazooka (water; LPA) — tweak: an inky black blob is shot; ours blue bubbles → dark ink tint.
ominous-wind (ghost; LPA) — ok: violet wind.
origin-pulse (water, sig) — tweak: SV swarms blue orbs, then rains blue beams; ours a big blue star at the user → orb volley, no star.
FIXED (pass 18): nihil-light oblivion-wing octazooka origin-pulse
outrage (dragon) — tweak: SV wraps the user in a violet rage aura, then lands yellow-star impacts on the foe; ours swirls violet blades and shows little at contact → yellow impact streak bursts on the defender.
peck (flying) — ok: a quick peck.
petal-dance (petal) — ok: swirling petals.
phantom-force (ghost) — ok: vanishes into violet haze and strikes (eyes kept per 063 tests).
pin-missile (bug) — ok: needles fly in.
FIXED (pass 19): outrage
photon-geyser (psychic, sig) — tweak: SV charges a gold-white light orb, then a green-gold geyser erupts under the foe; ours a white flare and a cyan pillar → gold spec tint.
plasma-fists (electric, sig) — tweak: SV crackles cyan-blue lightning off the fists; ours glows yellow → cyan spec tint.
play-rough (fairy) — tweak: SV is a white dust-cloud brawl with gold stars and pink hearts; ours small pink slashes → a white dust cloud on the foe.
poison-jab (poison) — ok: a violet jab and splash.
poison-sting (poison) — ok: a violet sting.
FIXED (pass 20): photon-geyser plasma-fists play-rough
poison-tail (poison) — ok: a violet tail swipe and splatter.
powder-snow (ice) — ok after the beam fix: a light powder-snow stream (the pulse-train is test-pinned).
power-gem (gem) — tweak: SV orbits and fires RED gems with violet-pink glints; ours white needles → red-pink gem tint.
precipice-blades (ground, sig) — ok: gold stone blades erupt under the foe, then a red one.
psybeam (psychic) — ok after the beam fix: a pink-violet beam with psychic rings.
FIXED (pass 21): power-gem
prismatic-laser (psychic, sig) — ok: rainbow beams onto the foe.
psyblade (psychic) — ok: violet-pink psychic slashes.
psychic (psychic) — ok: psychic rings round the foe, a pink burst.
psycho-boost (psychic, sig) — ok: a violet-white orb and burst.
psycho-cut (psychic) — ok: a violet crescent blade.
psystrike (psychic, sig) — tweak: SV strikes the foe with a violet psychic sphere; ours flies a gold atom of spinning rings (unit 'rings') and a white star → a violet orb body, no rings.
pursuit (dark, USUL) — ok: a dark slash as the foe flees.
razor-leaf (grass) — ok: leaves cut the foe.
relic-song (normal, sig) — ok: musical notes and a pastel shimmer (its kept ring is the sound wave).
rock-blast (rock) — ok: rocks fired one after another.
FIXED (pass 22): psystrike
roar-of-time (dragon, sig) — tweak: SV glows Dialga's blue gem and lands blue-white light streaks into a blue blast; ours a white-cyan cross slab, then blue hexes → blue spec tint, a smaller flare.
rock-slide (rock) — tweak (partial): SV drops several rocks with dust; ours keeps 4 (one per blow, 063 test-pinned) but larger.
rock-throw (rock) — ok: a thrown rock.
rock-tomb (rock) — ok: rocks wall the foe in.
rock-wrecker (rock) — ok: a huge boulder bursts into debris.
FIXED (pass 23): roar-of-time rock-slide(partial)
ruination (dark, sig) — ok: crimson-black spikes erupt round the foe.
sacred-fire (fire, sig) — tweak: SV flies a magenta-blue sacred fireball into rainbow flames; ours lands a white cross slab → smaller flare, the rainbow flames stay.
sacred-sword (fighting, sig) — tweak: a quick gold-white slash in SV; ours ends in a big white cross flare → smaller flare.
sand-tomb (mud) — ok: sand whirls round the foe.
scald (water) — tweak: SV fires a boiling white-blue water jet with steam; ours a chain of rings → a solid hot-water jet.
FIXED (pass 24): sacred-fire sacred-sword scald · GLOBAL: signature cross flares ≤0.4
sandsear-storm (ground, sig) — tweak: SV whips a sand tornado with embers onto the foe; ours flies shards and a gold cross (now capped) → add a sand spiral column on the defender.
searing-shot (fire, sig) — n/a: Poképédia has no video.
secret-sword (fighting, sig) — ok (render predates the flare cap): a bright slash and a gold-white burst.
seed-flare (grass, sig) — ok: green-white shock, a light burst.
shadow-claw (ghost) — ok: violet claw strikes.
NOTE — renders before pass 24 show signature cross flares at 0.6 h; they are 0.4 h now.
FIXED (pass 25): sandsear-storm · GLOBAL: all signature flares ≤0.45
shadow-force (ghost, sig) — ok: vanish into shadow, a violet slash.
shadow-punch (ghost) — ok: a violet fist strike.
shock-wave (electric) — tweak: SV pulses a soft green-yellow sphere off the user, then yellow arcs; our stroked yellow ellipse rings read as clip art → a soft electric aura instead of the rings.
signal-beam (bug, USUL) — ok: a green-yellow beam.
silver-wind (silver) — ok: silver powder streams at the foe.
FIXED (pass 26): shock-wave
sludge (poison) — tweak: SV splatters magenta-violet sludge; our sludge globs match, but the pool on the foe has a hard stroked outline (clip art) → soften the poison pool's rim (kit-wide).
sludge-bomb (poison) — tweak: SV splatters magenta-violet sludge; our sludge globs match, but the pool on the foe has a hard stroked outline (clip art) → soften the poison pool's rim (kit-wide).
sludge-wave (poison) — tweak: SV splatters magenta-violet sludge; our sludge globs match, but the pool on the foe has a hard stroked outline (clip art) → soften the poison pool's rim (kit-wide).
smack-down (rock) — ok: a rock knocks the foe down with dust.
smart-strike (steel) — tweak: SV charges a horn and strikes into a blue-white burst; ours draws a stroked targeting reticle round the attacker (clip art) → no reticle (steel sigil soft).
FIXED (pass 27): sludge sludge-bomb sludge-wave smart-strike · GLOBAL: poison pool rim, steel sigil glint
snarl (dark) — ok (ripples now soft bands): a dark shout and a crimson hit.
solar-beam (solar) — tweak: SV's video shows the charge turn (absorbing light); our default-kind floor rings round the attacker survived the floor-ring sweep → dropped (Solar Beam and one more grass spec).
spacial-rend (dragon, sig) — tweak: SV rends space in pink-violet; ours a white slab at the user → pink spec tint.
spectral-thief (ghost, sig) — ok: a shadow rises from the foe's shadow.
spirit-break (fairy) — ok (star outline now a bloom).
springtide-storm (fairy, sig) — ok: pink hearts and a pink storm (white star now capped).
FIXED (pass 28): solar-beam spacial-rend
steam-eruption (water, sig) — ok-ish: a white steam jet and an orange burst (its star now capped).
steel-beam (steel) — tweak: SV fires a steel-blue beam with silver shards; ours still blooms white (the steel palette is near-white) → a steel-blue beam tint.
steel-wing (steel) — ok: steel feathers strike.
stomping-tantrum (ground) — ok: stomps and ground ripples.
stone-edge (rock) — ok: stone spikes erupt round the foe.
FIXED (pass 29): steel-beam
struggle-bug (bug) — ok: green insect sparks.
sunsteel-strike (steel, sig) — tweak: SV glows Solgaleo gold and charges as a meteor; ours flies a spiked sun disc (clip art) → a gold fireball body, gold spec tint.
superpower (fighting) — tweak: SV erupts an orange-blue impact burst on the foe; ours shows almost nothing at contact → orange impact streaks.
surf (water) — tweak: SV washes a white-blue wave over the foe; ours a ring chain → a solid widening wave beam.
tachyon-cutter (steel, sig) — n/a: the Poképédia video is a menu screen.
FIXED (pass 30): sunsteel-strike superpower surf
techno-blast (normal, sig) — ok-ish: a violet-white beam (SV's is violet-white too).
tera-starstorm (stellar, sig) — ok: teal-cyan charge and prismatic beams.
thousand-arrows (ground, sig) — ok: green arrows rain on the foe.
thousand-waves (ground, sig) — ok: its rings are the ground wave itself (kept); green hexes.
throat-chop (dark) — ok (ripples now bands): a dark chop.
GLOBAL — Ground's attacker-side floor rings (charge rings, 5) dropped; its defender quake rings stay.
FIXED (pass 31): ground attacker rings
surging-strikes (water, sig) — n/a: the Poképédia download keeps arriving truncated.
thunder (electric) — tweak: SV drops a yellow bolt into a gold sphere; our bolts bloomed white-cyan → the bolt halo now follows the move's hot colour (yellow), electric-wide.
thunder-cage (electric, sig) — ok: bolts trap the foe.
thunder-fang (electric) — ok: a yellow electric bite.
thunder-shock (electric) — ok: a small spark.
thunderclap (electric) — ok: a quick bolt.
FIXED (pass 32): thunder · GLOBAL: electric bolt halo
thunderous-kick (fighting, sig) — ok (render predates the 0.4 flare cap): a fiery kick, a gold burst.
triple-kick (fighting) — ok: small kick sparks (SV's are small too).
twineedle (bug; LGPE) — ok: two needles.
twister (dragon) — ok: violet wind blades swirl round the foe.
v-create (fire, sig) — ok: a flaming V on the user, a fiery strike.
vacuum-wave (aura) — ok: a quick air blast.
venoshock (poison) — ok: a violet splash, the pool (its rim stroke went in pass 27).
vine-whip (grass) — ok: a vine lash.
water-gun (water) — tweak: SV squirts a thin water stream; ours a ring chain → a thin solid stream.
water-pledge (water) — ok: water columns burst under the foe.
waterfall (water) — ok: a rising water crash.
wave-crash (water) — ok: a water-wrapped tackle.
FIXED (pass 33): water-gun
whirlpool (water) — ok: a water vortex round the foe.
wicked-blow (dark, sig) — ok (flare now capped): a crimson strike and slash.
wild-charge (electric) — ok: an electric charge into a yellow burst.
wildbolt-storm (electric, sig) — ok (bolt halo now yellow): a storm of bolts on the foe.
wing-attack (flying) — ok: wing slashes.
x-scissor (bug) — ok: an X slash.
zap-cannon (electric) — ok-ish: SV flies a big electric orb; ours charges and strikes (orb reads small) — candidate for a larger projectile.
zen-headbutt (psychic) — ok: a psychic aura and a pink-violet hit.
# COMPLETE: 225 specs reviewed (222 with a video; n/a: searing-shot, surging-strikes, tachyon-cutter).
