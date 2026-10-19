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
