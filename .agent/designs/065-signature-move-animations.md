# 065: Signature move animations for legendary Pokémon
Status: approved (user, 2026-10-08)
Date: 2026-10-08 · Builds on design 063 (shipped on main, D205), which it extends and never replaces.
Numbering: drafted and approved as "064"; renumbered 065 because main's 064 is the sampled
battle SFX design (D203/D204). Commits before the renumber say "design 064".

## Problem
Design 063 gives every attack a generic animation chosen from 154 main-series moves by VG type,
stat class and tier. A legendary Pokémon's attack then looks like any other Pokémon of its type:
Lugia's big attack plays a generic Flying special, Dialga's a generic Dragon special. The user
asked for each legendary's *signature move* (Aeroblast, Roar of Time, …) to have its own
animation, studied from the Scarlet/Violet battle videos, played when that card attacks.

## What the user decided (2026-10-08) — these are requirements
1. **Scope**: legendaries (box legends and sub-legendaries), mythicals, and the six "Paradox
   legend-tier" Pokémon (Walking Wake, Iron Leaves, Raging Bolt, Gouging Fire, Iron Crown, Iron
   Boulder). Not Ultra Beasts. Games up to and including Legends Z-A.
2. **Out of scope**: status moves that only affect the user's own side (Burning Bulwark, Jungle
   Healing, Geomancy, Lunar Dance, Lunar Blessing, Take Heart). Status moves aimed at the
   opponent stay (Dark Void, Heart Swap). Z-Moves, Max/G-Max Moves are out.
3. **References**: the Scarlet/Violet video (Poképédia `_EV.mp4`) is primary and the only source
   of materials, shading, colours and textures. A move with no SV video uses the newest game's
   video. The Generation 7 video (Ultra Sun/Moon) is a secondary reference for the *shape* of the
   animation (path, count, geometry, beat order) when the SV camera hides it.
4. **Trigger**: an attack whose name equals a signature move's name plays that move ("name
   match"); otherwise a legendary's *strongest* attack plays its signature move; every other
   attack keeps the generic design-063 animation.
5. **Study**: Haiku agents only; four study agents.

## Constraints (inherited from design 063 unless marked new)
- Everything in 063 § Constraints and § What the look test settled holds verbatim: cosmetic only,
  one clock, the move plays after the banner, sound before sight, both seats, house FX rules (no
  whiteouts, no board-wide blooms, no sunburst fans, no backdrop colour change, flares local),
  reduced motion, no build step, no engine/protocol change, 2D canvas + DOM only, the blur rule
  and the probe gate (median ≤ 17 ms, p95 ≤ 140 ms), ≤ 2 canvases, 2 ghosts, ≤ 24 particles per
  burst, ≤ 40 DOM nodes, `transform`/`opacity` keyframes only.
- **New — the signature tier `S`**: `durationMs ∈ [1800, 2600]`, `contactMs ∈ [900, 1200]` and
  `contactMs / durationMs ∈ [0.38, 0.62]`. The hold stays `contactMs + 40 ≤ 1240`, exactly the
  tier-3 ceiling, so 063's queue budget (3800) and chain arithmetic are unchanged.
- **New — a signature never looks like its type's generic move.** Every spec carries the one
  image a player must recognise (the entry's `Signature read`), drawn large and first.
- Data stays derived on the client from the card in the registry and the attack name the
  `attackExecuted` plan already carries (D104 precedent); both clients compute the same pick.

## Current state (read this session, on main after design 063 shipped — commit b804638, D205)
Paths below are under `client/src/setup/netcode/mat-fx/` unless absolute.
- `combat.js attack(plan)`: resolves `card`, `from`, `src`, then the defender (`plan.defenderId`
  or the opponent's Active); **a zero-damage plan or a missing defender returns
  `playAuraPulse` before any move is picked** (`isZeroDamage = damage === 0 && !(benchDealt >
  0)`); else `pickMove(plan, card)` = `moveFor(card, { instanceId, attackName, species:
  speciesFor(card), damage, benchDealt }, SPECS)` → `{ score: MoveSpec, family, … }`, and
  `playMove({ spec: pick.score, attacker: moveSide(…), defender: moveSide(…), seed:
  hashString(…), impacts: { strikeIn: announceStrike }, attackerCard: card })`; null → the lunge.
  `attackFamilyFor(plan)` (exported) is the same pick's `family`; `index.js soundPlanFor` adds it
  to the `attack` plan, and `fx-audio.mjs` sounds `FAMILY_VOICES[family]` (the sampled-SFX bank
  of main's design 064 leaves `attack` to these voices: `sfx-cues.mjs:224`).
- `moves/move-spec.mjs`: `TIER_BAND = { 1, 2, 3 }`, `CONTACT_BAND { min 0.38, max 0.62,
  tier1Max 0.7 }`, the cost constants (`TONGUE_BUDGET 30`, `PARTICLE_BUDGET 28`, `MAX_BURSTS 2`,
  `MAX_NODES 40`), `FAMILIES` (14), `MATERIAL_KEYS` (26: the 17 types plus the variants `petal`,
  `solar`, `aura`, `mud`, `ancient`, `gem`, `aurora`, `buzz`, `silver`; **no `normal`**),
  `PARTICLE_KINDS` (`ember droplet leaf shard glob feather flake streak mote star twinkle`),
  `DRAWER_PARAMS` (24 drawers), `tonguesAt`, `deriveFamily` (the family must equal it; Dragon
  `roar` only when `tier === 3`), `validateSpec` (tier ∈ {1, 2, 3}, `statClass` ∈ physical/special,
  `vgType` ∈ `VG_TYPES` = the move table's keys, **no `normal`**). Particle `gravity` ∈ [0, 2].
- `moves/param-kinds.mjs`: param kinds `num int enum deg arms target pair`; `TARGETS =
  ['attacker', 'defender']`. Already in `DRAWER_PARAMS`: a `target` on `vignette`, `speedRays`,
  `starFlare`, `impactFlash`, `smoke`, `splash`, `pillar`, `slashArc`, `terrain`, `cloud`,
  `spiral`, `aura`, `rain`, `shards`, `ring`, `glyph`; `volley.from ∈ attacker|defender|sky`;
  `bolt.from ∈ attacker|sky`. `move-geometry.mjs skyLane(lane)` starts `SKY_HEIGHT` 1.7 h above
  and `SKY_LEAN` 0.5 h left of the defender (screen terms). `coreCharge`, `orbitCharge`,
  `shockRings`, `projectile`, `beam` have no target (attacker → defender only).
- `moves/card-motion.mjs`: attacker `rear-lurch {rear, lurch, glow}`, `brace`, `lunge {wind,
  reach, glow}`, `dash`, `rise`, `stomp`, `spin`, `none`; defender `knock {strength ≤ 0.6, heat}`,
  `stagger {strength, hits 2–6, gapMs, heat}`, `float`, `sink`, `freeze`. `validateSpec` accepts
  `{ motion, params }` only on `attacker`/`defender`.
- `moves/move-player.js playMove(…)` as 063 § Player; `isSourceOver(beat)` = `vignette`, `smoke`,
  `terrain 'crack'`.
- `moves/materials/`: one file per type, variants beside their type (`grass.js` exports `grass`,
  `petal`, `solar`). Some build from a palette kit (`grass.js leafKit(palette, …)`, ice's
  functions take `pal`); others close over a module palette (`fire.js`). `materials/index.js
  MATERIALS`, `materialFor(key)` (default fire).
- `moves/specs/index.mjs SPECS` (17 type files) + `REFERENCE_SPEC_IDS = ['fire-blast']`. 063's
  table already has generic specs named `aeroblast` and `seed-flare` (Flying/Grass special tier 3).
- `.claude/skills/fx-preview/rec/rec-move.mjs`: `MOVE=<id>` looks only in `SPECS` (or
  `kitchen-sink`); `cut-move.sh` cuts the sheet.
- The plan carries `attackerId`, `defenderId`, `attackName`, `damage`, `benchDealt`, `user`.
- Client card objects carry `attacks: [{ name, damage, text, cost }]` with `damage` a printed
  string (`'120+'`, `'30×'`, `''`) (`client/src/setup/netcode/card-stats.js:40`,
  `client/src/setup/general/e2e-mode.mjs:37`).
- `pokemonSpriteForName(cardName, { types })` (`client/src/setup/deck-builder/core/card-sprites.mjs`)
  resolves card names to form slugs, checked this session: `Black Kyurem-EX → kyurem-black`,
  `Rapid Strike Urshifu VMAX → urshifu-rapid-strike-gmax`, `Single Strike Urshifu V → urshifu`,
  `Ice Rider Calyrex V → calyrex-ice-rider`, `Ultra Necrozma-GX → necrozma-ultra`,
  `Dusk Mane Necrozma-GX → necrozma-dusk`, `Mega Zygarde ex → zygarde-mega`,
  `Wellspring Mask Ogerpon ex → ogerpon-wellspring-mask`, `Galarian Moltres V → moltres-galar`,
  `Origin Forme Dialga VSTAR → dialga-origin`, `Terapagos ex → terapagos-terastal`,
  `Hoopa-EX → hoopa`, `Reshiram & Charizard-GX → charizard` (a Tag Team resolves to one partner).
- `normalizeEnergyType` (`client/src/actions/move-card-bundle/energy-token-assets.mjs:39`) gives
  `grass fire water lightning psychic fighting darkness metal dragon fairy colorless`.
- Card-pool coverage of the name-match rule, measured on the local corpus
  `out/pkmn-pokemon-cards.json` (6098 rows; the user ruled the local count sufficient): 28 of
  the 81 animated moves appear as an attack name, on 88 cards (Land's Wrath 7, Sunsteel Strike 7,
  Dynamax Cannon 5, Moongeist Beam 5, Photon Geyser 5, Sacred Fire 5, Secret Sword 5, Thunderous
  Kick 5, …). The other legendaries reach their signature through the strongest-attack rule.
  One corpus card names another species' move: Darkrai (DP Promos DP24) has attacks named Roar
  of Time and Spacial Rend; by rule 4 they play Dialga's and Palkia's moves.

## References — how they were gathered (so a later session can refetch)
Pipeline committed under `.agent/designs/refs/065-study/` (media and sheets are not committed;
the scripts rebuild them in a scratch folder):
1. **List** (`LIST-BRIEF.md`, one Haiku agent): PokéAPI species flags (`is_legendary`,
   `is_mythical`) + the six Paradox names → 100 species in scope; every PokéAPI move's
   `learned_by_pokemon` → a move is a signature move when all its learners are in scope and
   belong to one evolution line or one legendary group; Legends Z-A moves from Poképédia (PokéAPI
   lacks them). Result 81 moves; the lead then added six the data rule misses because of event
   distributions or empty PokéAPI learner lists: Sacred Fire (Ho-Oh; Entei by event), Psycho
   Boost (Deoxys; Lugia by event), Heart Swap (Manaphy; Magearna by event), Sacred Sword (the
   Swords of Justice; later TMs spread it), Behemoth Blade and Behemoth Bash (PokéAPI lists no
   learners). The user then removed six self-status moves → **81 moves animated**.
   `list-report.md` holds the near misses (Dragon Hammer, Gear Up, Night Daze, Raging Fury,
   Tail Glow, Transform — not signature moves) and the species left with no signature move.
2. **Fetch** (`fetch-sig.mjs`, resumable): PokéAPI French name → Poképédia page → the `EV` video,
   else the newest of `LPZA LPA EB USUL SL ROSA XY LGPE`, else a sprite GIF → contact sheets of
   30 tiles (≤ 4 sheets, frame index on each tile). Downloads use `curl --http1.1` (Poképédia
   cuts large HTTP/2 transfers). Result: 71 `EV`, 15 `EB` (Sword/Shield: Core Enforcer,
   Eternabeam, Plasma Fists, Nature's Madness, Searing Shot, V-create, Oblivion Wing, Spectral
   Thief, Land's Wrath, Thousand Arrows, Thousand Waves, Multi-Attack, Techno Blast, Double Iron
   Bash, Geomancy), 1 none (Nihil Light: Poképédia links `Lux_Nihilum_LPZA.mp4` but the file does
   not exist).
3. **Gen 7** (`fetch-gen7.mjs`): the `USUL` video (else `SL`) for 52 moves, sheeted as
   `gen7-<n>.png` — the secondary reference for shape.
4. **Study** (`STUDY-BRIEF.md`, four Haiku agents in type batches, `batches/*.txt`): one entry per
   move in a fixed schema → `notes/*.md` → merged into Appendix S below by `merge-notes.mjs`.

## The signature list (81 moves)
<!-- SIGNATURE-LIST -->
| Move | Owners | Type · class · power | Reference | Corpus cards by name |
|---|---|---|---|---|
| Crush Grip (`crush-grip`) | regigigas | normal · physical · - | EV + USUL | 1 |
| Judgment (`judgment`) | arceus | normal · special · 100 | EV + USUL | 0 |
| Multi-Attack (`multi-attack`) | silvally | normal · physical · 120 | EB + USUL | 0 |
| Relic Song (`relic-song`) | meloetta | normal · special · 75 | EV + USUL | 0 |
| Techno Blast (`techno-blast`) | genesect | normal · special · 120 | EB + USUL | 3 |
| Tera Starstorm (`tera-starstorm`) | terapagos | normal · special · 120 | EV | 0 |
| Blue Flare (`blue-flare`) | reshiram | fire · special · 130 | EV + USUL | 0 |
| Fusion Flare (`fusion-flare`) | kyurem, reshiram | fire · special · 100 | EV + USUL | 0 |
| Magma Storm (`magma-storm`) | heatran | fire · special · 100 | EV + USUL | 1 |
| Sacred Fire (`sacred-fire`) | ho-oh | fire · physical · 100 | EV + USUL | 5 |
| Searing Shot (`searing-shot`) | victini | fire · special · 100 | EB + USUL | 0 |
| V-create (`v-create`) | victini | fire · physical · 180 | EB + USUL | 0 |
| Hydro Steam (`hydro-steam`) | walking-wake | water · special · 80 | EV | 0 |
| Origin Pulse (`origin-pulse`) | kyogre | water · special · 110 | EV + USUL | 0 |
| Steam Eruption (`steam-eruption`) | volcanion | water · special · 110 | EV + USUL | 0 |
| Surging Strikes (`surging-strikes`) | urshifu | water · physical · 25 | EV | 0 |
| Ivy Cudgel (`ivy-cudgel`) | ogerpon | grass · physical · 100 | EV | 0 |
| Seed Flare (`seed-flare`) | shaymin | grass · special · 120 | EV + USUL | 1 |
| Bolt Strike (`bolt-strike`) | zekrom | electric · physical · 130 | EV + USUL | 0 |
| Electro Drift (`electro-drift`) | miraidon | electric · special · 100 | EV | 0 |
| Fusion Bolt (`fusion-bolt`) | kyurem, zekrom | electric · physical · 100 | EV + USUL | 0 |
| Plasma Fists (`plasma-fists`) | zeraora | electric · physical · 100 | EB + USUL | 3 |
| Thunder Cage (`thunder-cage`) | regieleki | electric · special · 80 | EV | 0 |
| Thunderclap (`thunderclap`) | raging-bolt | electric · special · 70 | EV | 0 |
| Wildbolt Storm (`wildbolt-storm`) | thundurus | electric · special · 100 | EV | 0 |
| Freeze Shock (`freeze-shock`) | kyurem | ice · physical · 140 | EV + USUL | 4 |
| Glacial Lance (`glacial-lance`) | calyrex | ice · physical · 120 | EV | 4 |
| Glaciate (`glaciate`) | kyurem | ice · special · 65 | EV + USUL | 2 |
| Ice Burn (`ice-burn`) | kyurem | ice · special · 140 | EV + USUL | 4 |
| Collision Course (`collision-course`) | koraidon | fighting · physical · 100 | EV | 0 |
| Sacred Sword (`sacred-sword`) | cobalion, terrakion, virizion, keldeo | fighting · physical · 90 | EV + USUL | 2 |
| Secret Sword (`secret-sword`) | keldeo | fighting · special · 85 | EV + USUL | 5 |
| Thunderous Kick (`thunderous-kick`) | zapdos | fighting · physical · 90 | EV | 5 |
| Malignant Chain (`malignant-chain`) | pecharunt | poison · special · 100 | EV | 0 |
| Land’s Wrath (`lands-wrath`) | zygarde | ground · physical · 90 | EB + USUL | 7 |
| Precipice Blades (`precipice-blades`) | groudon | ground · physical · 120 | EV + USUL | 0 |
| Sandsear Storm (`sandsear-storm`) | landorus | ground · special · 100 | EV | 0 |
| Thousand Arrows (`thousand-arrows`) | zygarde | ground · physical · 90 | EB + USUL | 0 |
| Thousand Waves (`thousand-waves`) | zygarde | ground · physical · 90 | EB + USUL | 0 |
| Aeroblast (`aeroblast`) | lugia | flying · special · 100 | EV + USUL | 0 |
| Bleakwind Storm (`bleakwind-storm`) | tornadus | flying · special · 100 | EV | 0 |
| Dragon Ascent (`dragon-ascent`) | rayquaza | flying · physical · 120 | EV + USUL | 1 |
| Oblivion Wing (`oblivion-wing`) | yveltal | flying · special · 80 | EB + USUL | 0 |
| Freezing Glare (`freezing-glare`) | articuno | psychic · special · 90 | EV | 0 |
| Heart Swap (`heart-swap`) | manaphy | psychic · status · - | EV + USUL | 0 |
| Hyperspace Hole (`hyperspace-hole`) | hoopa | psychic · special · 80 | EV + USUL | 0 |
| Luster Purge (`luster-purge`) | latios | psychic · special · 95 | EV + USUL | 3 |
| Mist Ball (`mist-ball`) | latias | psychic · special · 95 | EV + USUL | 0 |
| Mystical Power (`mystical-power`) | azelf, mesprit, uxie | psychic · special · 70 | EV | 0 |
| Photon Geyser (`photon-geyser`) | necrozma | psychic · special · 100 | EV + USUL | 5 |
| Prismatic Laser (`prismatic-laser`) | necrozma | psychic · special · 160 | EV + USUL | 0 |
| Psyblade (`psyblade`) | iron-leaves | psychic · physical · 80 | EV | 0 |
| Psycho Boost (`psycho-boost`) | deoxys | psychic · special · 140 | EV + USUL | 1 |
| Psystrike (`psystrike`) | mewtwo | psychic · special · 100 | EV + USUL | 0 |
| Diamond Storm (`diamond-storm`) | diancie | rock · physical · 100 | EV + USUL | 0 |
| Mighty Cleave (`mighty-cleave`) | iron-boulder | rock · physical · 95 | EV | 0 |
| Astral Barrage (`astral-barrage`) | calyrex | ghost · special · 120 | EV | 4 |
| Moongeist Beam (`moongeist-beam`) | lunala | ghost · special · 100 | EV + USUL | 5 |
| Shadow Force (`shadow-force`) | giratina | ghost · physical · 120 | EV + USUL | 0 |
| Spectral Thief (`spectral-thief`) | marshadow | ghost · physical · 90 | EB + USUL | 0 |
| Core Enforcer (`core-enforcer`) | zygarde | dragon · special · 100 | EB + USUL | 0 |
| Dragon Energy (`dragon-energy`) | regidrago | dragon · special · 150 | EV | 0 |
| Dynamax Cannon (`dynamax-cannon`) | eternatus | dragon · special · 100 | EV | 5 |
| Eternabeam (`eternabeam`) | eternatus | dragon · special · 160 | EB | 0 |
| Nihil Light (`nihil-light`) | zygarde | dragon · special · 200 | none | 0 |
| Roar of Time (`roar-of-time`) | dialga | dragon · special · 150 | EV + USUL | 1 |
| Spacial Rend (`spacial-rend`) | palkia | dragon · special · 100 | EV + USUL | 1 |
| Dark Void (`dark-void`) | darkrai | dark · status · - | EV + USUL | 1 |
| Fiery Wrath (`fiery-wrath`) | moltres | dark · special · 90 | EV | 3 |
| Hyperspace Fury (`hyperspace-fury`) | hoopa | dark · physical · 100 | EV + USUL | 3 |
| Ruination (`ruination`) | chi-yu, chien-pao, ting-lu, wo-chien | dark · special · 1 | EV | 0 |
| Wicked Blow (`wicked-blow`) | urshifu | dark · physical · 75 | EV | 0 |
| Behemoth Bash (`behemoth-bash`) | zamazenta | steel · physical · 100 | EV | 0 |
| Behemoth Blade (`behemoth-blade`) | zacian | steel · physical · 100 | EV | 1 |
| Doom Desire (`doom-desire`) | jirachi | steel · special · 140 | EV + USUL | 0 |
| Double Iron Bash (`double-iron-bash`) | melmetal | steel · physical · 60 | EB | 0 |
| Sunsteel Strike (`sunsteel-strike`) | solgaleo | steel · physical · 100 | EV + USUL | 7 |
| Tachyon Cutter (`tachyon-cutter`) | iron-crown | steel · special · 50 | EV | 0 |
| Fleur Cannon (`fleur-cannon`) | magearna | fairy · special · 130 | EV + USUL | 0 |
| Nature’s Madness (`natures-madness`) | tapu-bulu, tapu-fini, tapu-koko, tapu-lele | fairy · special · - | EB + USUL | 0 |
| Springtide Storm (`springtide-storm`) | enamorus | fairy · special · 100 | EV | 0 |
<!-- /SIGNATURE-LIST -->

## Options
1. **Name match: any species, or only the owners?** (a) any card whose attack has the name;
   (b) only the move's owners. Pick **(a)** — the user's rule says "a TCG attack named after the
   move plays it"; the attack name is what the banner just showed, so the animation agrees with
   the text on screen. The one corpus case (Darkrai DP24) reads correctly either way.
2. **"Strongest attack"**: (a) highest printed base damage; (b) highest energy cost; (c) last
   printed attack. Pick **(a)**, ties to the later printed attack (the printed order puts the big
   attack last), and only attacks with base damage > 0 qualify — a card whose attacks all print
   no damage has no strongest attack and never plays its signature except by name match. Base
   damage = the first integer in the printed string (`'120+' → 120`, `'30×' → 30`, `'' → 0`).
3. **Which signature when a species owns several** (Zygarde 5, Kyurem 3 forms, Necrozma 4 forms,
   Hoopa 2, Victini 2, Eternatus 2, Reshiram/Zekrom 2, Calyrex 2 riders, Urshifu 2 styles): a
   pinned slug table (§ Data) — form first, then the species' own move over a group move, then
   the highest power. The remaining moves (Dynamax Cannon, Fusion Bolt, Fusion Flare, Searing
   Shot, Thousand Waves) play by name match only. Rejected: random per instance (two Zygarde
   cards would disagree with the banner's weight for no reason).
4. **Type-changing moves** (Judgment, Multi-Attack, Techno Blast follow a plate/memory/drive;
   Ivy Cudgel follows Ogerpon's mask): the material follows the card — Judgment, Multi-Attack and
   Techno Blast take the card's TCG type (`colorless → normal`), Ivy Cudgel the mask slug.
   Tera Starstorm is always `stellar` (its SV look is the Stellar prism).
5. **Where the specs live**: (a) inside 063's `specs/<type>.mjs`; (b) a separate
   `signature/specs/<type>.mjs` registry. Pick **(b)**: 063's spec tests assert table
   coverage per type; signature specs have their own tier and their own coverage test, and a
   signature slice never edits a generic type file. 063's table already ships generic specs with
   the ids `aeroblast` and `seed-flare`; the two registries never merge, so the ids may repeat
   (`SPECS.aeroblast` is the generic Flying move, `SIGNATURE_SPECS.aeroblast` Lugia's).
6. **Timing**: (a) reuse tier 3; (b) a new tier `S` (1800–2600 ms, contact 900–1200). Pick
   **(b)**: the SV references run 4–7 s; 2.2 s is too short for a charge + a signature image +
   an aftermath, while 2.6 s with contact ≤ 1200 keeps every hold and the queue budget unchanged.
7. **Status moves aimed at the opponent** (Dark Void, Heart Swap): (a) skip; (b) animate with a
   "contact" that is the effect landing. Pick **(b)** (the user kept them); they play only by name
   match or as the owner's strongest attack, so a damage number may or may not follow.
8. **New materials**: 063 ships 26 materials (17 types + 9 variants) and no `normal`. Signature
   moves of Normal type (Crush Grip, Judgment, Multi-Attack, Relic Song, Techno Blast default, Tera
   Starstorm) need `normal` (pale gold-white pressure light) and `stellar` (prismatic). Pinned in
   § New pieces G.
9. **Per-move colours** (~25 entries record colours off their type's palette: Blue Flare's blue
   fire, Thousand Arrows' lime, Mighty Cleave's gold, …): (a) one named variant material per move,
   063's precedent (`petal`, `solar`, `gem` …); (b) every material gains `withPalette(palette)` and
   a beat may carry `tint`. Pick **(b)**: (a) would add ~25 materials that differ only in colour,
   while (b) is one mechanical refactor (several materials are already palette kits: `grass.js
   leafKit`, ice's `pal` functions) and makes any later colour fix a data change.
10. **Where the signature check runs**: (a) inside `moveFor`; (b) in `combat.js attack(plan)`
   ahead of the zero-damage check. Pick **(b)**: `moveFor` is 063's pure table pick and returns
   null for zero damage; a name-matched status move (Dark Void) must still play (Options 7), so the
   signature check has to come before `isZeroDamage`.

## Design
### File map
```
client/src/setup/netcode/mat-fx/moves/signature/
  signature-moves.mjs       SIGNATURE_MOVES, SIGNATURE_BY_SLUG, CARD_TYPED, TCG_TO_MATERIAL, MASK_MATERIAL   slice 1
  signature-select.mjs      slugFor, normalizeAttackName, baseDamage, strongestAttackName, signatureForSlug,
                            signatureMaterial, signatureFor (pure)                                         slice 1
  specs/index.mjs           SIGNATURE_SPECS = { [moveId]: MoveSpec } merged from the type files            slice 1 (empty)
  specs/<vgType>.mjs        one MoveSpec (tier 'S') per signature move of that type                       slices 5–15
  __tests__/signature-moves.test.mjs · signature-select.test.mjs · signature-specs.test.mjs                slice 1
client/src/setup/netcode/mat-fx/moves/move-spec.mjs        tier S, status, normal, new kinds/drawers (§ move-spec changes)  slices 1, 4
client/src/setup/netcode/mat-fx/moves/param-kinds.mjs      the 'anchor' kind                                  slice 4
client/src/setup/netcode/mat-fx/moves/materials/*.js       withPalette on every material                      slice 2
client/src/setup/netcode/mat-fx/moves/materials/normal.js, stellar.js, _units.js                            slice 3
client/src/setup/netcode/mat-fx/moves/move-player.js       tint resolution per beat; shade in the source-over group; echo ghost  slices 2, 4
client/src/setup/netcode/mat-fx/moves/move-drawers.js + move-poses.mjs + card-motion.mjs   § New pieces B–E   slice 4
client/src/setup/netcode/mat-fx/combat.js                  attack(plan) + attackFamilyFor: signature first (§ Wiring)  slice 1
client/src/css/mat-fx.css                                  .fx-move--m-normal/-stellar, .fx-particle--zzz/--note  slice 3
.claude/skills/fx-preview/rec/rec-move.mjs                 SIGNATURE=<id> plays SIGNATURE_SPECS[id]            slice 1
```

### Data (`signature-moves.mjs`, pure, frozen)
```js
export const SIGNATURE_MOVES = Object.freeze({
  // id: { name, vgType, statClass: 'physical'|'special'|'status', power, owners: [species slug], material }
  'aeroblast': { name: 'Aeroblast', vgType: 'flying', statClass: 'special', power: 100, owners: ['lugia'], material: 'flying' },
  …one row per move in § The signature list, in that table's order; material = vgType except the
  rows § Options 4 names…
});
export const CARD_TYPED = Object.freeze(new Set(['judgment', 'multi-attack', 'techno-blast']));
export const TCG_TO_MATERIAL = Object.freeze({ grass: 'grass', fire: 'fire', water: 'water',
  lightning: 'electric', psychic: 'psychic', fighting: 'fighting', darkness: 'dark', metal: 'steel',
  dragon: 'dragon', fairy: 'fairy', colorless: 'normal' });
export const MASK_MATERIAL = Object.freeze({ 'ogerpon': 'grass', 'ogerpon-wellspring-mask': 'water',
  'ogerpon-hearthflame-mask': 'fire', 'ogerpon-cornerstone-mask': 'rock' });
export const SIGNATURE_BY_SLUG = Object.freeze({ …the table below… });
```
`SIGNATURE_BY_SLUG` — the pinned answer to Options 3 (a `null` value stops the walk: that form
has no signature):
```
arceus judgment · articuno null · articuno-galar freezing-glare · azelf mystical-power ·
calyrex null · calyrex-ice-rider glacial-lance · calyrex-shadow-rider astral-barrage ·
chi-yu ruination · chien-pao ruination · cobalion sacred-sword · darkrai dark-void ·
deoxys psycho-boost · dialga roar-of-time · diancie diamond-storm · enamorus springtide-storm ·
eternatus eternabeam · genesect techno-blast · giratina shadow-force · groudon precipice-blades ·
heatran magma-storm · ho-oh sacred-fire · hoopa hyperspace-hole · hoopa-unbound hyperspace-fury ·
iron-boulder mighty-cleave · iron-crown tachyon-cutter · iron-leaves psyblade · jirachi doom-desire ·
keldeo secret-sword · koraidon collision-course · kyogre origin-pulse · kyurem glaciate ·
kyurem-black freeze-shock · kyurem-white ice-burn · landorus sandsear-storm · latias mist-ball ·
latios luster-purge · lugia aeroblast · lunala moongeist-beam · magearna fleur-cannon ·
manaphy heart-swap · marshadow spectral-thief · melmetal double-iron-bash · meloetta relic-song ·
mesprit mystical-power · mewtwo psystrike · miraidon electro-drift · moltres null ·
moltres-galar fiery-wrath · necrozma prismatic-laser · necrozma-dawn moongeist-beam ·
necrozma-dusk sunsteel-strike · necrozma-ultra photon-geyser · ogerpon ivy-cudgel ·
palkia spacial-rend · pecharunt malignant-chain · raging-bolt thunderclap · rayquaza dragon-ascent ·
regidrago dragon-energy · regieleki thunder-cage · regigigas crush-grip · reshiram blue-flare ·
shaymin seed-flare · silvally multi-attack · solgaleo sunsteel-strike · tapu-bulu natures-madness ·
tapu-fini natures-madness · tapu-koko natures-madness · tapu-lele natures-madness ·
terapagos tera-starstorm · terrakion sacred-sword · thundurus wildbolt-storm · ting-lu ruination ·
tornadus bleakwind-storm · urshifu wicked-blow · urshifu-rapid-strike surging-strikes ·
urshifu-rapid-strike-gmax surging-strikes · uxie mystical-power · victini v-create ·
virizion sacred-sword · volcanion steam-eruption · walking-wake hydro-steam · wo-chien ruination ·
yveltal oblivion-wing · zacian behemoth-blade · zamazenta behemoth-bash · zapdos null ·
zapdos-galar thunderous-kick · zekrom bolt-strike · zeraora plasma-fists · zygarde lands-wrath ·
zygarde-10 thousand-arrows · zygarde-complete core-enforcer · zygarde-mega nihil-light
```
How the table was made (for a later edit): forms first (Kyurem, Calyrex, Urshifu, Hoopa,
Necrozma, Zygarde, the Galarian birds); else the species' own single-owner move with the highest
power; group moves (Ruination, Nature's Madness, Mystical Power, Sacred Sword) only for species
with no move of their own. Zygarde's four forms get four different moves on purpose: the TCG
names Land's Wrath on most Zygarde cards; Thousand Arrows/Core Enforcer/Nihil Light keep the 10 %,
Complete and Mega cards distinct.

### Selection (`signature-select.mjs`, pure)
```js
slugFor(card) → string | null
  pokemonSpriteForName(card?.name, { types: card?.types })?.slug ?? null
  // import path from moves/signature/: '../../../../deck-builder/core/card-sprites.mjs' (move-select.mjs uses the same resolver)
normalizeAttackName(s) → string
  String(s ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
SIGNATURE_BY_NAME = new Map(Object.entries(SIGNATURE_MOVES).map(([id, m]) => [normalizeAttackName(m.name), id]))
baseDamage(printed) → integer ≥ 0
  Number(String(printed ?? '').match(/\d+/)?.[0] ?? 0)
strongestAttackName(attacks) → string | null
  over Array.isArray(attacks) ? attacks : []: keep the attack with the largest baseDamage(a.damage) > 0;
  on a tie the later index wins; null when no attack has baseDamage > 0
signatureForSlug(slug) → moveId | null
  s = String(slug ?? ''); while (s) { if (Object.hasOwn(SIGNATURE_BY_SLUG, s)) return SIGNATURE_BY_SLUG[s];
  const cut = s.lastIndexOf('-'); s = cut > 0 ? s.slice(0, cut) : '' } ; return null
  // 'arceus-fire' → 'arceus' → judgment; 'ogerpon-wellspring-mask' → 'ogerpon'; 'mewtwo' never → 'mew'
signatureMaterial(moveId, { slug, card }) → material key
  // normalizeEnergyType from '../../../../../actions/move-card-bundle/energy-token-assets.mjs'
  CARD_TYPED.has(moveId) → TCG_TO_MATERIAL[normalizeEnergyType(card?.types?.[0])] ?? SIGNATURE_MOVES[moveId].material
  moveId === 'ivy-cudgel' → walk slug through MASK_MATERIAL like signatureForSlug, default 'grass'
  else SIGNATURE_MOVES[moveId].material
signatureFor(card, { attackName, slug }) → { move, reason: 'name'|'strongest', material } | null
  1. named = SIGNATURE_BY_NAME.get(normalizeAttackName(attackName)); named → { move: named, reason: 'name' }
  2. move = signatureForSlug(slug); !move → null
  3. strongest = strongestAttackName(card?.attacks); !strongest → null
  4. normalizeAttackName(strongest) !== normalizeAttackName(attackName) → null
  5. → { move, reason: 'strongest' }   (material added by signatureMaterial in both branches)
```

### Wiring (`combat.js`; the shipped `attack(plan)` with one step in front of the zero-damage check)
```js
// beside pickMove: pure, so attack() and attackFamilyFor() agree
const pickSignature = (plan, card) => {
  if (!card) return null;
  const sig = signatureFor(card, { attackName: plan.attackName, slug: slugFor(card) });
  const spec = sig && SIGNATURE_SPECS[sig.move];
  return spec ? { ...sig, spec: { ...spec, material: sig.material } } : null;
};

export const attack = (plan) => {
  …card, from, src, defenderId, to exactly as shipped…
  const sig = to ? pickSignature(plan, card) : null;          // NEW, before isZeroDamage
  const sigDefenderSrc = sig ? combatSrc(defenderId, registry) : null;
  if (sig && sigDefenderSrc) {
    const played = playMove({ spec: sig.spec, attacker: moveSide(plan.attackerId, from, src, registry),
      defender: moveSide(defenderId, to, sigDefenderSrc, registry),
      seed: hashString(`${plan.attackerId}|${plan.attackName}|${plan.damage}`),
      impacts: { strikeIn: announceStrike }, attackerCard: card });
    if (played) return played.holdMs;
  }
  if (isZeroDamage(plan) || !to) { …aura pulse, as shipped… }
  …pickMove / playMove / playLunge, as shipped…
};

export const attackFamilyFor = (plan) => {
  const card = getCardRegistry().get(plan.attackerId)?.card;
  return pickSignature(plan, card)?.spec.family ?? pickMove(plan, card)?.family;
};
```
Imports added to `combat.js`: `signatureFor`, `slugFor` (`./moves/signature/signature-select.mjs`),
`SIGNATURE_SPECS` (`./moves/signature/specs/index.mjs`). `index.js soundPlanFor` is unchanged (it already calls
`attackFamilyFor`). A signature whose spec has not shipped yet returns null from `pickSignature`
and the shipped path runs, so slices ship one type at a time with nothing broken. Reduced motion
skips it like every transient attack scene. A zero-damage attack that is not a signature still
gets the aura pulse.

### `move-spec.mjs` changes (063's validator, extended; every change is additive)
- `TIER_BAND.S = [1800, 2600]`; new `S_CONTACT = [900, 1200]`. `validateSpec`: `tier ∈ {1, 2, 3,
  'S'}`; for `'S'` the contact must sit in `S_CONTACT` **and** the 0.38–0.62 ratio.
- `statClass` may be `'status'` only when `tier === 'S'`; `vgType` may be `'normal'` only when
  `tier === 'S'` (`VG_TYPES` stays the move table's keys).
- `MATERIAL_KEYS` gains `'normal'`, `'stellar'` (materials.test keeps it equal to `MATERIALS`).
- `PARTICLE_KINDS` gains `'zzz'`, `'note'`.
- `deriveFamily`: the Dragon `roar` rule reads `(spec.tier === 3 || spec.tier === 'S')`; nothing
  else changes, so every signature spec declares the family the rule derives.
- `DRAWER_PARAMS` gains the § New pieces entries; `DRAWER_FAMILY` gains `fan: 'burst'`,
  `shade: 'chime'` (→ `ghost` for Ghost/Dark by the existing override), `chain: 'projectile'`,
  `grip: 'punch'`; `tonguesAt` gains `fan → count`, `shade`/`chain`/`grip → 0`, and changes
  `pillar → 3 × count` and `bolt → count × (1 + branches)` (both default to 063's values).
- `checkMotion('attacker', …)` accepts an optional `echo` validated against
  `ECHO_PARAMS = { alpha: ['num', 0.1, 0.6, 0.35], offset: ['num', 0, 1, 0.5], fadeMs: ['int', 100, 1500, 400] }`.
- Everything else (beats, layers, cost rule ≤ 30 tongues, particles ≤ 24 per burst, ≤ 2 bursts,
  ≤ 28 total, nodes ≤ 40, `pad ∈ [1.2, 2.6]`) is 063's, unchanged.

### New pieces (the study's `New pieces` lines, consolidated; each is pinned)
The four study batches asked for ~40 missing pieces. Almost all are the same few gaps, so they
become a handful of general extensions instead of one drawer per move. Every extension defaults
to 063's behaviour, so no 063 spec changes (the 063 specs test stays green unedited). Each gets a
pure pose fn in `move-poses.mjs` and a test (slices 2–4).

**A. Two params on every drawer** (`check` accepts them on all 24 + the new ones):
- `tint: { deep?, body?, hot?, core? }` — hex strings that replace the material's palette keys
  for this beat only (Options 9). Mechanism (slice 2): every material object gains
  `withPalette(palette) → material` — the same frozen interface built over `palette` (a kit
  factory per file: `grass.js leafKit` and ice's `pal` functions already are; `fire.js` and the
  others that close over a module palette are wrapped the same way, `fire = fireKit(FIRE_PALETTE)`).
  `materials/_shared.js` gains `parseHex('#RRGGBB') → [r, g, b]`, `lighten(hex, f)` (mix with
  white by f) and `tintedPalette(palette, tint) → palette` (keys present in `tint` replaced).
  The player resolves a beat's material as `tint ? cachedTint(material, tint) : material`
  (`cachedTint` memoises per material key + `JSON.stringify(tint)` for the scene) and hands it to
  the drawer, so drawers never see `tint`. Used by every entry whose `Palette` differs from its
  type (Blue Flare's blue fire, Thousand Arrows' lime, Mighty Cleave's gold, Bolt Strike's dark
  wisps, Core Enforcer's green, …).
- `hues: string[]` (≤ 6 hex) — on drawers that draw several tongues/bodies/rings (`fan`,
  `pillar`, `ring`, `orbitCharge`, `volley`, `shards`, `splash`, `spiral`), item `i` uses
  `cachedTint(material, { body: hues[i % n], hot: lighten(hues[i % n], 0.35) })`. Sacred Fire's
  rainbow fountain, Prismatic Laser's prism column, Luster Purge's rainbow halo, Relic Song's rings.

**B. Placement.** 063 already gives most drawers a `target` (`'attacker' | 'defender'`, param
kind `target`) and lets `volley`/`bolt` come `from: 'sky'` (`skyLane`: 1.7 h above, 0.5 h left of
the defender on screen). Signatures need two more things:
- a new param kind `'anchor'` in `param-kinds.mjs`: `ANCHORS = ['attacker', 'defender', 'sky',
  'sky-attacker']`, where `'sky'` is `skyLane`'s start point and `'sky-attacker'` the same
  construction over the attacker (1.7 h above, 0.5 h left on screen). The `target` entry of
  `starFlare`, `speedRays`, `pillar`, `ring`, `glyph`, `cloud`, `shade`, `fan` switches from kind
  `target` to kind `anchor` (every existing value stays valid).
- a `target` (kind `anchor`, default `'attacker'`) on `coreCharge`, `orbitCharge`, `shockRings`,
  which 063 pins to the attacker, plus `dx`, `dy` (num, −2…2, default 0) on every drawer with an
  anchor: screen offsets for the `sky*` anchors, lane offsets (along, across) otherwise.
Uses: Origin Pulse's star on Kyogre (`starFlare target 'attacker'`), Plasma Fists' spokes round
Zeraora, Thunder Cage's sky orb (`coreCharge target 'sky'`), Fusion Flare's and Judgment's orb
over the attacker (`coreCharge target 'sky-attacker'`).

**C. Extended params on 063 drawers**
| drawer | new params (default = 063) | used by |
|---|---|---|
| `coreCharge` | `target`, `dx`, `dy` (B) · `rings` 0–2 rotating tongue arcs round the body, radius 1.25 r, 1 turn/s (0) | Fusion Flare, Judgment, Techno Blast |
| `projectile` | `from: 'attacker' \| 'defender' \| 'sky' \| 'sky-attacker'` ('attacker'; the same lanes as `volley.from`: `'defender'` flies back up the lane to the attacker, `'sky'` drops onto the defender along `skyLane`, `'sky-attacker'` drops from over the attacker onto the defender) · `unit` (below, 'body') | Heart Swap and Oblivion Wing drain (`from 'defender'`), Dragon Ascent and Judgment (`from 'sky'`), Fusion Flare (`from 'sky-attacker'`) |
| `orbitCharge`, `volley`, `shards` | `unit` ('body') · `shards.mode: 'burst' \| 'cluster'` ('burst'; `cluster` = the fragments sit still at the anchor's base, lit on the upper edge, held to the beat's end) | Hyperspace Fury hands, Roar of Time hex plates, Magma Storm rock mounds |
| `pillar` | `count` 1–4 (1) · `spread` h, columns evenly over ±spread/2 (0) · `stagger` ms between columns (0) · `dx` h (0) | Magma Storm, Searing Shot, Land's Wrath, Precipice Blades, Doom Desire |
| `ring` | `kind` gains `'fins'` (`count` short tongue spokes round the anchor, spinning at `rpm`) | Hydro Steam |
| `bolt` | `count` 1–12 bolts fanned across the defender's footprint (1) · `spread` h (0.8) · `curve` bow in h (0); `from` keeps 063's `attacker \| sky` | Thunder Cage strands, Thunderclap |
| `glyph` | `kind: 'material' \| 'lattice' \| 'hex' \| 'heart'` ('material' = 063's sigil); `lattice` = a 4 × 3 grid of 1 px strokes at `r`, rotating 20°/s; `hex` = a flat hexagon plate (fill body, 1 px core edge); `heart` = a heart outline of height 2 r, fill `body` at alpha 0.5, 0.03 h rim in `deep`, pulsing ±6 % at 2 Hz | Ice Burn's red lattice, Roar of Time, Springtide Storm's heart shield (on the attacker) |

`unit` — the body a travelling or orbiting drawer draws, each a function in
`materials/_units.js` taking `(ctx, x, y, r, angleDeg, s, palette)`:
`'body'` (the material's own body/projectile, 063), `'rings'` (three 0.1 r-wide rings at 0°/60°/120°
tilt, rotating; Psystrike), `'spiked'` (body + 14 triangular spikes 0.45 r long, rotating 30°/s;
Sunsteel Strike), `'facet'` (a hexagon-faceted sphere: 6 triangles shaded hot→deep by angle;
Freeze Shock, Tera Starstorm), `'hoop'` (an upright ellipse 0.65 r × r of tongues on its rim,
spinning about the vertical axis by scaling x with `cos(2π·2s)`; Electro Drift), `'crescent'`
(a tongue bent along a circular arc of 0.3 w bow, with a 1 px `core` edge line; Tachyon Cutter,
Mighty Cleave), `'fist'` (a rounded-square silhouette 0.8 r with a 0.25 r cuff band in `hot`;
Hyperspace Fury), `'hex'` (the glyph hexagon plate, tumbling: rotate `360·s`; Roar of Time),
`'wheel'` (a disc of radius r in `body` with 10 short tongues 0.5 r long on its rim pointing
outward, the whole unit rotating `720·s`°; Collision Course's rolling flame ring).

**D. New drawers**
| drawer | pose fn | draws | params (default) | used by |
|---|---|---|---|---|
| `fan` | `fanPose(s, h, p)` → `{ tongues: [{ x, y, angleDeg, length, width }], alpha }` | `count` tapered tongues from the anchor, spread evenly over `spread` degrees centred on `direction` (lane degrees; 180 = away from the defender), lengths in `[lenMin, lenMax]` h alternating, growing over the first `grow` of the beat, flapping ±`flap`° at 3 Hz, spinning `spin`°/s, fading over the last 20 % | `target 'attacker'`, `count 6`, `spread 110`, `direction 180`, `lenMin 0.6`, `lenMax 1.0`, `width 0.22`, `grow 0.3`, `flap 0`, `spin 0` | V-create (two beats, `direction ±125`, `flap 12`), Land's Wrath fronds, Behemoth Bash blade fan, Eternabeam blade star (`count 4`, `spread 360`, `spin 40`), Plasma Fists spokes (`count 12`, `spread 360`), Dragon Energy radial burst |
| `shade` | `shadePose(s, h, p)` → `{ x, y, rx, ry, rimAlpha, swirl, alpha }` | a volume drawn `source-over`: `kind 'disc'` (flat ellipse, ry = 0.45 rx, a portal), `'dome'` (upper half-ellipse rising from the anchor's floor), `'giant'` (a tall rounded silhouette 2.2 h high behind the anchor with two `#FFD23F` eye ovals when `eyes`), `'sphere'` (a full circle round the anchor card, the sealed-in bubble); fill = material `fill` key (`'deep'` default, `'body'` for a translucent bubble) at `fillAlpha` with value-noise mottling (the grain tile at alpha 0.25), rim = 0.04 h stroke in `body` at `rimAlpha`; grows over 25 %, holds, shrinks over the last 25 %; `swirl` rpm turns the mottling | `target 'defender'`, `kind 'disc'`, `r 0.9`, `fill 'deep'`, `fillAlpha 1`, `rimAlpha 0.6`, `swirl 20`, `eyes false` | Hyperspace Hole/Fury portals, Dark Void and Astral Barrage domes, Spectral Thief's shadow giant, Nature's Madness's sphere (`kind 'sphere'`, `fill 'body'`, `fillAlpha 0.35`) |
| `chain` | `chainPose(s, h, p)` → `{ links: [{ x, y, rotDeg }], alpha }` | `links` linked rings: over the first 60 % they string out along the lane from the attacker's leading edge to the head at `f = s'²` (s' = s / 0.6); over the last 40 % they slide onto an ellipse round the defender (rx 0.55 h, ry 0.75 h), wrapping it; each link a stroked ellipse 1.2 : 1 of radius `r`, alternating 0°/90° in-plane rotation, stroke 0.025 h in `body` with a `hot` core line | `links 9`, `r 0.09` | Malignant Chain |
| `grip` | `gripPose(s)` → `{ y, curl, alpha }` | a five-fingered glove (normal material body fill, 1 px `#1E1B1F` outline) descending from the `'sky'` point to the defender over 40 %, fingers curling 0 → 70° over 40–70 %, holding to the end | `size 1.2` | Crush Grip |

The player draws `shade` in the `source-over` group with `vignette`, `smoke` and
`terrain 'crack'` (063 § Player step 5/7).

**E. Card motion additions** (`card-motion.mjs`; each new param is a `MOTION_PARAMS` schema entry)
- attacker `rear-lurch.hold` (`['num', 0, 600, 0]`) ms: the wind-up pose holds that long before the thrust; thrust
  and recoil shift by `hold`. For the long charges (Roar of Time, Prismatic Laser, Eternabeam,
  Origin Pulse, Psystrike).
- attacker `lunge.strikes` (`['int', 1, 3, 1]`): the strike window `[0.4 c, c]` splits evenly into `strikes`
  rewind-and-strike pairs (rewind 60 % of each part to along −0.1, strike 40 % to `reach`);
  contact is the last. Double Iron Bash (2), Hyperspace Fury (3).
- attacker preset `warp` (`params: {}`, `endC: 1.5`): 0 → 0.3 c scale 1 → 0.15 while `along`
  moves to 0.3 of the lane; hidden (scale 0.15, glow 0) to 0.85 c; reappears at
  `along = length − 0.9 h` scaling to 1 by c (the strike); then `springHome` back over
  c → 1.5 c. Hyperspace Hole, Spectral Thief.
- `spec.attacker.echo: { alpha, offset, fadeMs }` (optional, `ECHO_PARAMS` in § move-spec
  changes): the player adds one more ghost image of the attacker art (`.fx-move__ghost
  .fx-move__ghost--echo`) behind the attacker ghost, `offset` h back along the lane, at `alpha`,
  fading to 0 over `fadeMs` from 0 ms (a fused or departing copy). Fusion Bolt, Fusion Flare,
  Bolt Strike. It counts toward the 40-node limit (`costErrors` adds 1 node when present).
- defender `stagger.lead` (`['num', 0, 600, 0]`) ms: the first knock lands `lead` ms before contact, the last at
  contact. Surging Strikes (`hits 3`, `lead 450`).
- defender `knock` strength: signature physicals 0.45, specials 0.35 (unchanged cap).

**F. Particle kinds `zzz` and `note`** (`PARTICLE_KINDS`; `mat-fx.css` beside 063's kinds, added
to the shared `position: absolute … background: var(--fx-p-color)` rule): each is the particle
div filled with `--fx-p-color` and cut by an SVG mask, `mask: url("data:image/svg+xml,…")
center / contain no-repeat` (with the `-webkit-mask` twin) —
`zzz`: viewBox `0 0 16 16`, path `M2 2h12v3L6 13h8v3H2v-3l8-8H2z` (a Z);
`note`: viewBox `0 0 16 16`, path `M6 2h7v4H8v7a3 3 0 1 1-2-2.83z` (an eighth note).
Dark Void's sleep motes: `kind 'zzz'`, `direction -90`, `spread 40`, `gravity 0`, `aspect 1`,
`size [0.12, 0.2]`; Relic Song: two `note` bursts in two colours.

**G. Materials `normal` and `stellar`** (`materials/normal.js`, `materials/stellar.js`; the
shipped material interface, with `withPalette`; registered in `materials/index.js` and
`MATERIAL_KEYS`; CSS `.fx-move--m-normal` and `.fx-move--m-stellar` set `--fx-move-hot/-body/
-deep/-core` from the palettes below, as `.fx-move--m-fire` does)
- **normal** — "pressure light", sampled from Judgment, Crush Grip and Multi-Attack (EV):
  `deep #E8552B`, `body #F2C230`, `hot #FFF5B0`, `core #FFFFFF`, `shade [40, 30, 10]`,
  `smoke null`, particle streak `rgb(255, 224, 102)`. `body` = sphere hot → body → transparent
  with a white core at 0.35 r; `tongue` = 063's shared tongue, body pass in `hot` blurred 0.08 w,
  crisp pass in `core` at 0.6 scale (light, not flame: no orange body pass); `projectile` =
  `body` + two thin `hot` rings at 1.3 r tilted 60°, rotating; `grain` strength 0.12.
- **stellar** — Tera Starstorm (EV is cyan crystal with a prismatic fringe):
  `deep #0F2A55`, `body #2FB8FF`, `hot #5FF2E0`, `core #E6FFFF`, accent hues
  `['#FF6FB5', '#FFE07A', '#7CFFB2', '#7FD8FF', '#C59BFF']`; `body` = the `'facet'` unit; `tongue`
  = the ice recipe's crystal tongue plus a 1 px fringe stroke offset 0.04 w outward in
  `accent[seed % 5]`; `grain` none.

**H. Card-typed and form materials** — § Options 4 (`signatureMaterial`).


### Timing (tier S)
| Part | ms | Rule |
|---|---|---|
| charge / signature image builds | 0 → 600–900 | the attacker's ghost winds up; the recognisable image appears here first |
| release / travel | → contact (900–1200) | lane travel is short (~0.75 h on Actives) — the image, not the trip, carries the read |
| contact | 900–1200 | `impacts.strikeIn(contactMs, ctx)`; damage number, hit flash, shake |
| aftermath | contact → 1800–2600 | the signature's afterimage (fragments, smoke, lingering glyph) |

### Sound
Signature specs use 063's 14 families (`FAMILY_VOICES`, `fx-audio.mjs`) — no new voices.
`validateSpec` requires `spec.family === deriveFamily(spec)` (with the tier-S Dragon rule above),
so the family follows from the beats; `attackFamilyFor` returns it (§ Wiring) and the shipped
`soundPlanFor` sounds it. Main's sampled-SFX bank (design 064, D203) does not own `attack`.

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | `card` missing from the registry | `pickSignature` → null → the shipped path | [ ] select test |
| 2 | `attackName` empty/undefined | `normalizeAttackName` → `''` → no name match; strongest rule compares `''` → null | [ ] select test |
| 3 | `card.attacks` missing / not an array / all damage `''` | `strongestAttackName` → null → only name match plays | [ ] select test |
| 4 | tie on base damage | the later printed attack is the strongest | [ ] select test |
| 5 | printed damage `'30×'`, `'120+'`, `'50-'` | base damage 30, 120, 50 | [ ] select test |
| 6 | curly vs straight apostrophe (Nature’s Madness, Land’s Wrath) | both normalise to the same key | [ ] select test |
| 7 | a form slug not in the table (`arceus-fire`, `silvally-water`, `deoxys-attack`, `zacian-crowned`) | walks to the base slug | [ ] select test |
| 8 | a slug whose walk would cross species (`mewtwo`, `ho-oh`, `tapu-koko`) | exact keys win; `mewtwo` never walks to `mew` (no `-`) | [ ] select test |
| 9 | an explicit `null` form (`calyrex`, `moltres`) | null — no signature, no further walk | [ ] select test |
| 10 | name match on a non-owner (Darkrai DP24 "Roar of Time") | plays Roar of Time (Options 1) | [ ] select test |
| 11 | signature selected but its spec not shipped | `pickSignature` → null; the shipped `moveFor` path, then the lunge | [ ] select test (`SIGNATURE_SPECS` empty in slice 1) |
| 12 | zero damage (prevented, or a status move by name) | a signature still plays (its check precedes `isZeroDamage`); contact announced; no number. A non-signature zero-damage attack keeps the aura pulse | [ ] recording |
| 13 | Tag Team card (`Reshiram & Charizard-GX`) | resolver slug is `charizard` → no slug signature; name match still works | [ ] select test |
| 14 | attack against a Benched Pokémon (long lane) | geometry from 063: the scene reads on a long lane; recorded once per spec on a bench target | [ ] recording |
| 15 | opponent's seat (board turned 180°) | 063 § Both seats; recorded on both seats | [ ] recording |
| 16 | type-changing move on a Colorless card (Arceus, Silvally) | material `normal` | [ ] select test |
| 17 | Ogerpon mask forms | `ogerpon-hearthflame-mask → fire`, `-wellspring-mask → water`, `-cornerstone-mask → rock`, base → grass | [ ] select test |
| 18 | reduced motion | skipped like every transient attack scene (063 D105) | [ ] existing |
| 19 | a spec over the cost rule | `validateSpec` fails the specs test | [ ] specs test |
| 20 | two attacks in one batch | 063 queue: each scene plays in order inside the 3800 ms budget | [ ] existing |
| 21 | id shared by both registries (`aeroblast`, `seed-flare`) | `SPECS` and `SIGNATURE_SPECS` never merge; Lugia/Shaymin play the signature, every other Flying/Grass card the generic; the recorder takes `SIGNATURE=<id>` for the signature | [ ] select test + recorder |
| 22 | a `tint` with a malformed hex | `checkParams` rejects it (`#RRGGBB` only); the player never sees it | [ ] move-spec test |
| 23 | no defender art (`combatSrc` null) | the signature is skipped; the shipped path decides (lunge) | [ ] wiring (manual) |

## Test plan
- `signature-moves.test.mjs`: 81 rows; every `owners` entry, `vgType`, `statClass`, `material`
  valid; every `SIGNATURE_BY_SLUG` value is null or a key of `SIGNATURE_MOVES`; the six skipped
  self-status ids are absent; every move id reachable by name.
- `signature-select.test.mjs`: rows 1–11, 13, 16, 17, 21 of the edge table, plus one assertion
  per form override in `SIGNATURE_BY_SLUG` (`kyurem-black → freeze-shock`, …).
- `signature-specs.test.mjs`: every `SIGNATURE_SPECS` entry passes `validateSpec`, has tier `'S'`,
  its key equals its `id`, its id is a `SIGNATURE_MOVES` key and its `vgType` matches; per shipped
  type file, every move of that type has a spec (the coverage grows slice by slice).
- `move-spec.test.mjs` (063's): tier `S` bands, `status`/`normal` only with `S`, the new kinds,
  drawers, `tonguesAt` values and `ECHO_PARAMS`; every 063 spec still valid.
- `materials.test.mjs` (063's): for every material, `withPalette(p)` draws only `p`'s colours (the
  recording context); `normal`/`stellar` registered and in `MATERIAL_KEYS`.
- Visual: 063 § Recording procedure per spec (both seats, one bench target) with
  `SIGNATURE=<id>`, key frames checked against the Appendix S entry; probe median ≤ 17 ms,
  p95 ≤ 140 ms.

## Builder recipe — one signature spec
1. Open the move's Appendix S entry: `Signature read`, `Video beats`, `Palette`, `Board mapping`,
   `New pieces`, `Flags`. Open its sheets if on disk (refetch with `refs/065-study/fetch-sig.mjs`).
2. Copy the closest spec in `signature/specs/<type>.mjs`, else the shipped 063 spec named by
   `Closest generic` (`moves/specs/<type>.mjs`); set `id`, `name`, `vgType`, `statClass`,
   `tier: 'S'`, `material`; set `family` to what `deriveFamily` returns (the specs test prints it).
3. `durationMs` = the entry's total clamped into `[1800, 2600]`; `contactMs` = its contact clamped
   into `[900, 1200]`, then into the 0.38–0.62 ratio.
4. Translate the board mapping beat by beat with the shipped `DRAWER_PARAMS` names, then Appendix
   S's vocabulary map for the new pieces. The `Signature read` image must be the largest shape on
   screen at its moment.
5. Colours: the material's palette; when the entry's palette differs from the type palette (Blue
   Flare is blue fire, Sacred Fire is rainbow-tinged gold, Freeze Shock is ice + electric), put
   the entry's hex values in that beat's `tint` (or `hues`) — never a new material.
6. Run the specs test; record both seats + a bench target with `SIGNATURE=<id>`; compare with the
   entry; commit `feature: design 065 <type> - <move>` with `flag:` lines for deviations.

## Migration / rollout
No data migration and no protocol change. Until a type's signature specs ship, its legendaries
play 063's generic move (or the lunge), so every slice is independently safe. Revert path: delete
`moves/signature/`, the `pickSignature` step and its imports in `combat.js` (and `attackFamilyFor`'s
first operand); every other change is additive and defaults to 063's behaviour.

## Work plan — slices ≤1 session, each leaving the repo green
Approval (user, 2026-10-08): every row below is a pinned contract, and every Appendix S entry is the
per-move contract for its slice. Nihil Light's entry stays a flagged placeholder until a reference
video exists; building it as written is approved.
Prerequisite: none — design 063 is shipped on main (D205) with all 17 type materials and the
generic player. Every slice starts from this branch merged with the latest main.

| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 | create `moves/signature/signature-moves.mjs`, `signature-select.mjs`, `specs/index.mjs` (`SIGNATURE_SPECS = Object.freeze({})`), `__tests__/signature-moves.test.mjs`, `signature-select.test.mjs`, `signature-specs.test.mjs`; modify `move-spec.mjs` (tier S, `S_CONTACT`, `status`/`normal` with S, `deriveFamily` S rule), `combat.js` (`pickSignature`, `attack`, `attackFamilyFor` per § Wiring), `rec-move.mjs` (`SIGNATURE=<id>` plays `SIGNATURE_SPECS[id]`) | § Data, § Selection, § Wiring, § move-spec changes (tier/status/normal/family lines) exactly | `strongestAttackName([{name:'A',damage:'60'},{name:'B',damage:'120+'}]) → 'B'` · `([{name:'A',damage:'90'},{name:'B',damage:'90'}]) → 'B'` · `([{name:'A',damage:''}]) → null` · `baseDamage('30×') → 30` · `signatureForSlug('arceus-fire') → 'judgment'` · `('mewtwo') → 'psystrike'` · `('calyrex') → null` · `('kyurem-black') → 'freeze-shock'` · `('ogerpon-wellspring-mask') → 'ivy-cudgel'` · `('charizard') → null` · `signatureFor({name:'Darkrai',attacks:[]}, {attackName:'Roar of Time', slug:'darkrai'}) → {move:'roar-of-time', reason:'name', material:'dragon'}` · `signatureFor({attacks:[{name:'Read the Wind',damage:''},{name:'Aero Dive',damage:'130'}]}, {attackName:'Aero Dive', slug:'lugia'}) → {move:'aeroblast', reason:'strongest', material:'flying'}` · same card, `attackName:'Read the Wind'` → null · `signatureMaterial('ivy-cudgel', {slug:'ogerpon-hearthflame-mask'}) → 'fire'` · `signatureMaterial('judgment', {card:{types:['Colorless']}}) → 'normal'` · `normalizeAttackName('Nature’s Madness') === normalizeAttackName("Nature's Madness")` · validateSpec: tier S 1800/900 ok, 2700 → error, contact 1300 → error, `statClass 'status'` with tier 3 → error, `vgType 'normal'` with tier 3 → error | user's trigger rule (2026-10-08); Lugia V (Sword & Shield Promos) attacks from `out/pkmn-pokemon-cards.json` (Read the Wind, Aero Dive 130); Darkrai DP24 (corpus) | the three new tests + `move-spec.test.mjs` green; `pnpm test:changed` green; a Lugia V Aero Dive still plays 063's path (no spec yet) |
| 2 | modify every `materials/<file>.js` (each material gains `withPalette`, built from a palette kit), `materials/_shared.js` (`parseHex`, `lighten`, `tintedPalette`), `move-spec.mjs` (`tint`, `hues` accepted on every drawer: a new param kind `'palette'` in `param-kinds.mjs` = an object whose keys ⊆ deep/body/hot/core with `#RRGGBB` values; `hues` = kind `'hexes'`, 1–6 `#RRGGBB`), `move-player.js` (`cachedTint`, per-beat material resolution, `hues` hand-off) | § New pieces A | for each of the 26 materials: `m.withPalette(m.palette)` draws the same recording as `m` (byte-equal command log for one glow/body/tongue/projectile call); `withPalette({…, body:[255,0,0]})` draws red where `m` drew its body colour; `parseHex('#ff0000') → [255,0,0]`; `lighten('#000000', 0.5) → '#808080'`; `checkParams('beam', {tint:{body:'#12345'}})` → 1 error; `({hues:[]})` → 1 error | 063 materials as shipped | `materials.test.mjs`, `move-spec.test.mjs`, `move-drawers.test.mjs` green; Fire Blast recording unchanged (no regression) |
| 3 | create `materials/normal.js`, `materials/stellar.js`, `materials/_units.js`; modify `materials/index.js`, `move-spec.mjs` (`MATERIAL_KEYS` + normal/stellar, `PARTICLE_KINDS` + zzz/note), `mat-fx.css` (`.fx-move--m-normal`, `.fx-move--m-stellar`, `.fx-particle--zzz`, `.fx-particle--note`) | § New pieces C (`unit` functions), F, G | materials test: normal/stellar draw only their palettes (+ stellar's accents); every unit draws without throwing at s ∈ {0, 0.5, 0.99} with balanced save/restore; `MATERIAL_KEYS` equals `Object.keys(MATERIALS)` minus `default` | Appendix S palettes of Judgment, Crush Grip, Multi-Attack, Tera Starstorm | tests green; one stub spec per material recorded once (sheets reviewed) |
| 4 | modify `param-kinds.mjs` (`'anchor'` kind, `ANCHORS`), `move-spec.mjs` (new/extended `DRAWER_PARAMS`, `DRAWER_FAMILY`, `tonguesAt`, `ECHO_PARAMS`), `move-poses.mjs`, `move-drawers.js`, `card-motion.mjs`, `move-player.js` (`shade` in `isSourceOver`, echo ghost, `unit` hand-off); tests `move-poses.test.mjs`, `move-drawers.test.mjs`, `card-motion.test.mjs`, `move-spec.test.mjs` | § New pieces B, C, D, E | `fanPose(0.5, 100, {count:4, spread:360})` → 4 tongues 90° apart · `shadePose(0.1, 100, {r:0.9})` rx < 90 (growing) · `gripPose(0.7).curl ≈ 70` · `chainPose(0.3, 100, {links:9})` → 9 links on the lane segment, `chainPose(0.99, …)` → 9 links within 0.56 h × 0.76 h of the defender centre · `lunge` with `strikes 2`: two local maxima of `along` in [0.4 c, c], the last at c · `warp` scale 0.15 at 0.5 c · `stagger.lead 450`: first knock impulse at contact − 450 · `rear-lurch.hold 200`: thrust starts 200 ms later than without · `tonguesAt('pillar', {count:2}) → 6` · `tonguesAt('bolt', {count:3, branches:2}) → 9` · `checkParams('starFlare', {target:'sky'}) → []`, `({target:'nowhere'})` → 1 error · `checkParams('coreCharge', {target:'sky-attacker', dx:0.2}) → []` | 063 drawer conventions (`move-drawers.js` header) | tests green; every 063 spec still valid and Fire Blast's recording unchanged |
| 5 | create `signature/specs/fire.mjs`, `grass.mjs`; modify `signature/specs/index.mjs` | one MoveSpec per move: blue-flare, fusion-flare, magma-storm, sacred-fire, searing-shot, v-create, ivy-cudgel, seed-flare | specs test: 8 specs valid, tier S, material per § Options 4 | Appendix S Fire, Grass | recordings both seats + bench reviewed against each entry; probe within limits |
| 6 | create `specs/water.mjs`, `ice.mjs` | hydro-steam, origin-pulse, steam-eruption, surging-strikes, freeze-shock, glacial-lance, glaciate, ice-burn | same pattern | Appendix S Water, Ice | same |
| 7 | create `specs/electric.mjs` | bolt-strike, electro-drift, fusion-bolt, plasma-fists, thunder-cage, thunderclap, wildbolt-storm | same | Appendix S Electric | same |
| 8 | create `specs/ground.mjs`, `rock.mjs` | lands-wrath, precipice-blades, sandsear-storm, thousand-arrows, thousand-waves, diamond-storm, mighty-cleave | same | Appendix S Ground, Rock | same |
| 9 | create `specs/fighting.mjs`, `poison.mjs`, `fairy.mjs` | collision-course, sacred-sword, secret-sword, thunderous-kick, malignant-chain, fleur-cannon, natures-madness, springtide-storm | same | Appendix S Fighting, Poison, Fairy | same |
| 10 | create `specs/psychic.mjs` (first half) | freezing-glare, heart-swap, hyperspace-hole, luster-purge, mist-ball, mystical-power | same | Appendix S Psychic | same |
| 11 | modify `specs/psychic.mjs` (second half) | photon-geyser, prismatic-laser, psyblade, psycho-boost, psystrike | same; Psychic coverage complete | Appendix S Psychic | same |
| 12 | create `specs/flying.mjs`, `steel.mjs` | aeroblast, bleakwind-storm, dragon-ascent, oblivion-wing, behemoth-bash, behemoth-blade, doom-desire, double-iron-bash, sunsteel-strike, tachyon-cutter | same | Appendix S Flying, Steel | same |
| 13 | create `specs/dragon.mjs` | core-enforcer, dragon-energy, dynamax-cannon, eternabeam, nihil-light, roar-of-time, spacial-rend | same | Appendix S Dragon (Nihil Light's entry is from memory: build it as written, flag it) | same |
| 14 | create `specs/dark.mjs`, `ghost.mjs` | dark-void, fiery-wrath, hyperspace-fury, ruination, wicked-blow, astral-barrage, moongeist-beam, shadow-force, spectral-thief | same | Appendix S Dark, Ghost | same |
| 15 | create `specs/normal.mjs` | crush-grip, judgment, multi-attack, relic-song, techno-blast, tera-starstorm | same; every `SIGNATURE_MOVES` id now has a spec | Appendix S Normal | same; then the user's look pass over all 81 (one sheet each) and the DECISIONS lines below |

DECISIONS lines at landing (D-numbers assigned then): signature trigger = name match, else the
legendary's strongest attack (user, 2026-10-08); tier S 1800–2600 ms with contact ≤ 1200 ms
(hold and queue budget unchanged); `normal` and `stellar` materials; material `withPalette` +
beat `tint`/`hues`, the `anchor` param kind, `unit`s and the fan/shade/chain/grip drawers. No new
dependency.

## Deviations (Builder appends here during build)
- Slice 2: `hues` hand-off is `info.materialAt(i)` (item i's hued material; the beat material
  when no hues), resolved by `resolveBeatColours` in `move-player.js`; no 063 drawer reads it
  yet — the multi-item drawers adopt it in slice 4, which owns `move-drawers.js`. A hued item
  keeps the beat's `tint` for the keys it does not set.
- Slice 2: kinds `'palette'` / `'hexes'` accept `null` (the "none" default `withDefaults` fills
  in); the schema entries are `tint: ['palette', null]`, `hues: ['hexes', 1, 6, null]`.
- Slice 2: `buzzKit(palette, base)` reuses `bug`'s glow/tongue/particle/shade objects for the
  untinted `buzz` (063's test pins `buzz.tongue === bug.tongue`); a tinted buzz builds its own.
- Slice 2: the red-body test asserts per-colour substitution for every material, and that ≥ 24
  of 26 draw their body colour in glow/body/tongue/projectile (dark's body grey is not drawn by
  those four calls).
- Slice 3: the `'body'` unit in `_units.js` is a palette-only fallback sphere (units take a
  palette, not a material); slice 4's drawers should call the material's own `body`/`projectile`
  for `unit 'body'` and use `UNITS[unit]` for the rest.
- Slice 3: units have only `s` (beat progress), no clock, so `'spiked'`'s "30°/s" is `60·s`°
  (a ~2 s tier-S beat) and `'facet'` turns `60·s`°.
- Slice 3: stellar's accents are palette keys `accent0`…`accent4` (plus `white` = its core, the
  edge key ice's crystal draws), so `withPalette`/`tint` cover them; its tongue reuses
  `ice.withPalette(palette).tongue`. Stellar `grain` is a no-op; normal's 0.12 is the spec's
  `grain` value (the player passes `spec.grain`), not baked into the material.
- Slice 3: no recordings / sheet review — no Playwright browser is installed in this build
  environment (`~/.cache/ms-playwright` absent). Record one stub spec per material with
  `rec-move.mjs` on a machine with the fx-preview tooling before landing.
- Slice 4: `anchorPoint(lane, target, dx, dy)` and `laneFromPoint(lane, x, y)` live in
  `move-poses.mjs` (pure; `move-geometry.mjs` is not in the slice's file list). Card anchors
  with dx = dy = 0 return the centre untouched, so every 063 drawer draws byte-identically: a
  node harness hashing every 063 spec's drawer command log (7 progress points per beat) and
  card-motion poses was equal before and after; a Chromium recording of Fire Blast
  (`rec-move.mjs`, stand-in card art) plays the accepted beats.
- Slice 4: a sky anchor on `coreCharge` hangs the orb at the point (no `lead` up the lane); on a
  card the 063 `lead` offset still applies on top of dx / dy.
- Slice 4: `ring kind 'fins'` needed a spin rate the design names but never declares: new
  `rpm` (['num', 0, 240, 60]); fins use 063's `count` (1–5) and sit at `r0`. `tonguesAt` also
  counts fins (`count`) and `coreCharge.rings` (`rings`), which the cost rule would otherwise miss.
- Slice 4: ranges the design left open: `pillar.spread` 0–3 h, `stagger` 0–400 ms;
  `bolt.spread` 0–3 h, `curve` −1…1 h; `fan` count 1–12, spread 0–360, lenMin 0.1–2,
  lenMax 0.1–2.5, width 0.05–0.6, grow 0.05–0.8, flap 0–45, spin −360…360; `shade` r 0.3–2,
  swirl 0–240, eyes enum [false, true]; `chain` links 3–16, r 0.03–0.3; `grip` size 0.5–2.
  Pillar columns spread on screen x; bolts fan their end points on screen x.
- Slice 4: `chainPose` works in the lane frame relative to the defender centre (x along, y
  across) and takes the lane length as `params.length` (default 3 h); the wrap ellipse is
  0.75 h along × 0.55 h across, so on the usual vertical lane it has the card's tall shape.
- Slice 4: `grip` fills with the beat material's `body` (Crush Grip's spec is `normal`) rather
  than importing `normal` itself; `shade` mottling uses the shared noise tile, absent in node, so
  tests cover fill + rim only.
- Slice 4: `UNIT_NAMES` in `move-spec.mjs` duplicates `UNIT_KEYS` (keeps the validator free of
  canvas code); `move-spec.test.mjs` pins them equal. `shards` with a non-body unit draws the
  unit at each fragment (r = half its length).
- Slice 4: the echo ghost is `.fx-move__ghost--echo`, inserted before the attacker ghost (so
  behind it), no new CSS; its opacity comes from WAAPI keyframes.
- Slice 3 follow-up (slice 4): Chromium works here (`CHROMIUM=/opt/pw-browsers/chromium`,
  `SIO_JS` from node_modules, `CARD_DIR` of stand-in PNGs since the CDNs are blocked), but the
  per-material stub recordings are still not made: they need temporary stub specs registered.
  Still due before landing.
- Slice 5: 063's `starFlare arms 'ring'` is 8 arms = 40 tongues, over the 30 budget on its own,
  so every entry that names it uses `RING5` (five arms 72° apart, reach 0.85 = 25 tongues) in
  `specs/fire.mjs`, or `'cross'` (20) where other beats share the contact moment (Sacred Fire,
  Ivy Cudgel, Seed Flare).
- Slice 5: particles have no colour param — a burst takes the spec material's particle colour,
  untinted. Blue Flare's cyan embers use `kind 'flake'` (still fire-coloured); Ivy Cudgel's
  `#7FFFD4` and Seed Flare's `#7CFF5B` shards stay the grass particle colour. A per-burst
  `tint` would need a `PARTICLE_PARAMS` entry (not in this slice's files).
- Slice 5: defender `knock` strength follows § New pieces E (physicals 0.45, specials 0.35)
  where the entry differs: Ivy Cudgel 0.45 (entry 0.3), Seed Flare 0.35 (entry 0.45).
- Slice 5: Fusion Flare's "lift 1.0" orb is `coreCharge target 'sky-attacker'` with no offset,
  so the `projectile from 'sky-attacker'` leaves exactly where the orb hung (a dx/dy on the
  charge would make the drop start 0.9 h away; `projectile` has no dx/dy). Ease `linear` so
  the drop reads; carries the § E echo (alpha 0.35, 0.5 h, 500 ms). On the self seat the
  sky-attacker point sits level with the defender (cards stack vertically), so the drop is a
  short sideways arc there; on the opp seat it is a long drop.
- Slice 5: Magma Storm's "mound at each column base" is one `shards mode 'cluster'` (6) at the
  defender (shards has no dx); the columns run 600/650 → 1300 (entry 600–1000, too short to
  read) and the golden spiral to 2100 so it shows after the columns; splash 4, spiral 8
  tongues to stay inside 30.
- Slice 5: Sacred Fire's rainbow fountain is `pillar count 3, spread 1.0, w 0.6` with five
  `hues` (one pillar has one hue, so the entry's single w 1.6 column could not be multicoloured).
- Slice 5: V-create's vwings are two `fan` beats (`direction ±125`, `count 4`, `spread 36`,
  `lenMin 0.9`, `lenMax 1.4`, `width 0.32`, `flap 12`) on the front layer: on the back layer
  at 3 × 1.0 h they hid behind the card. They hold to 900 ms at the attacker's home while the
  dash ghost leaves (fan anchors to the card, not the ghost).
- Slice 5: Searing Shot's particles are 15 + 12 (entry 18 + 12) for the 28-particle and
  40-node limits; Seed Flare's orbit charges carry 3 tongues each and its shards are 8 (entry
  10), its crescents `r0 0.26, r1 0.34` (entry 0.14–0.2 read as specks), its vortex spiral on
  the front layer. Aftermath beats the entries run past `durationMs` are clamped to it.
- Slice 5 review (recordings, both seats, `.agent/scratch/moves/sig-<id>-<seat>/`, not
  committed): every signature read shows at its moment except two weak spots — Magma Storm's
  golden spiral is mostly hidden by the columns until ~1300 ms, and Seed Flare's white-cyan
  vortex barely reads on the dark mat. Blue Flare's stream is short on Actives (the lane is
  ~0.75 h) and reads as a blue tongue rather than a long beam. Bench targets were not
  recorded: `rec-move.mjs` places both cards on Actives and has no bench option (not in this
  slice's files). Probe: median 16.7–17.3 ms on all; p95 60–70 ms for the grass and stellar
  specs but 100–190 ms for the fire ones — the accepted Fire Blast measures p95 192 ms in the
  same run (headless Chromium, software GL), so the fire overrun is the environment's blur
  cost, not these specs; re-probe on GPU hardware.
- Slice 3 follow-up (slice 5): one stub per new material recorded (Fire Blast's spec with
  `material 'normal'` / `'stellar'`, registered temporarily and removed): normal draws gold-white
  pressure light with ringed projectile bodies; stellar draws faceted cyan crystal bodies and
  crystal tongues, but its accent fringe is not visible at board scale (all cyan) — revisit
  with Tera Starstorm (slice 15). The slice 3 recording debt is closed.
- Slice 6: `family` follows `deriveFamily` (recipe step 2), not the entry's motion: Hydro Steam,
  Origin Pulse and Freeze Shock are `wind`, Steam Eruption and Surging Strikes `splash`, Glaciate
  `quake`, Ice Burn `burst`.
- Slice 6: `ring kind 'fins'` takes `count` 1–5 (slice 4), so Hydro Steam's halo is 5 fins (entry 6).
- Slice 6: Origin Pulse's 16 orbs carry `tongues 0` (orbs only) so the attacker-anchored `RING5`
  star (25) fits the budget; the dive is the dash motion alone (no second projectile).
- Slice 6: Surging Strikes' hits are 500–700 / 700–950 (`cross`) and 950–1250 (`RING5`), cut so
  no two stars overlap (cross + ring = 45 tongues); splash is 5 at 1100–1700 (entry 6 at 1000).
  Attacker lunge carries `strikes 3`; the opening aura uses a gold `hot` for the claw sparks.
- Slice 6: Freeze Shock's six-point crystal is `SIX` (6 arms, reach 1 = 30 tongues), so its
  shard burst moves to 1500–2000, after the crystal breaks (entry 1000–1500); the frost sphere is
  `projectile unit 'facet'`; particles are 16 `flake`s (the entry names none).
- Slice 6: Glacial Lance's spires (flags: pillar) are `pillar count 2, spread 1.2, height 2.0` on
  the back layer at 1320–2100, after the contact stars (cross 20 + shards 8 already at 1000);
  the contact star is `cross` (entry 'ring' = 40 tongues).
- Slice 6: Glaciate's ice column is `pillar 800–1400, w 0.9` (the board mapping names only ring
  and shards; the signature read needs the column), plus an `impactFlash` at contact (flags).
- Slice 6: Ice Burn's red lattice is `glyph kind 'lattice'` on the attacker card (0–1000), not a
  ghost overlay: it stays at home while the lunge ghost leaves. The eight-petal flower is `SIX`
  at 1500–2300, width 0.32 (8 arms = 40 tongues; width 0.46 hid the defender and the number).
- Slice 6 review (recordings both seats, `.agent/scratch/moves/sig-<id>-<seat>/`, not
  committed): every signature read shows. Weak spots: Glaciate's `terrain 'wave'` ice field
  barely reads at board scale; Hydro Steam's beam is short on Actives (as Blue Flare). No bench
  target (rec-move has none). Probe: median 16.8–17.1 ms, p95 58–87 ms on all eight.
- Slice 7: every Electric spec's `family` is `electric` (the type override in `deriveFamily`);
  defender `knock` follows § E (physicals 0.45, specials 0.35) over the entries' 0.2–0.3.
- Slice 7: Bolt Strike's projectile runs 620–1100 (entry 1060) so the sphere lands at contact;
  the wisps are both orbit halves tinted dark (`deep #0F2B33`, `body #1F4A4F`), not one.
- Slice 7: Electro Drift's hoop is `projectile unit 'hoop'` (gold `body` rim, `#DFF9FF` `hot`
  dots); the orbitCharge stand-in is dropped as the entry's New piece says. Added a violet
  attacker aura (the dive's violet body) and a gold floor ring (the ground glow); the beam is on
  the back layer so the hoop stays on top.
- Slice 7: Fusion Bolt's fused ghost is the attacker `echo` (alpha 0.35, 0.5 h, 400 ms) on a
  `brace`; the projectile runs to contact (1100) and the sky column holds to 1400; the defender
  star is `cross` (entry 'ring' = 40, over budget with the column and bolts), the halo is
  `coreCharge rings 1`, and `shockRings` anchor on the defender.
- Slice 7: Plasma Fists' spokes are `fan target 'attacker', count 12, spread 360, lenMin 0.6,
  lenMax 1.1, width 0.1` tinted white-yellow; clods are the cloud tinted `#E9D3A0` to 1700.
- Slice 7: Thunder Cage's cage strands are `bolt from 'sky', count 10, branches 0, spread 0.9,
  curve 0.4` (450–1000) replacing the entry's `rain`; the sky orb is `coreCharge target 'sky'`
  with a ring, flared by a small `impactFlash` 900–1100; the star is `cross` (budget).
- Slice 7: Thunderclap's shards are 6 (entry 8): cross 20 + bolt 3 + shards 8 = 31 tongues.
- Slice 7: Wildbolt Storm's tornado is `spiral tongues 16` ending at contact (cross 20 + beam 1 +
  16 > 30), tinted lighter than the entry (`body #7B5CD0`, `hot #B89CFF`) because `#2B1D4D` /
  `#5B3FA0` vanished on the mat; the falling sparks (`rain`) move to 1300–1800 after the star;
  a second spark burst (12) lands at contact besides the entry's base sparks at 500.
- Slice 7 review (recordings both seats, `.agent/scratch/moves/sig-<id>-<seat>/`, not
  committed): every signature read shows at its moment. Weak spots: Wildbolt Storm's tornado
  reads as scattered violet wisps round the defender, not a climbing column (spiral drawer
  limit); Thunder Cage's sky orb only shows from ~850 ms and sits small at the top while the
  strands carry the read; Fusion Bolt's echo ghost is faint at board scale. No bench target
  (rec-move has none). Probe: median 16.8–16.9 ms on all (one opp run 29.8 ms, a cold start);
  p95 57–150 ms, over 140 for Wildbolt Storm (150–222 ms after `tongues 16`) and near it for
  Plasma Fists (117–137) — same software-GL blur cost as slice 5's fire specs; re-probe on GPU.
- Slice 8: `family` follows `deriveFamily`: Precipice Blades and Mighty Cleave are `punch`
  (physical lunge + front `shards` at contact; Mighty Cleave would be `slash` only with its burst
  moved off the front layer), Sandsear Storm `wind`, Thousand Arrows `projectile` (the rain),
  Land's Wrath / Thousand Waves / Diamond Storm `burst`. Defender `knock` follows § E (physicals
  0.45, specials 0.35) over the entries' 0.3–0.4.
- Slice 8: particle bursts stay the material's colour (slice 5 rule): the entries' `colour`
  values on Sandsear Storm, Thousand Arrows, Thousand Waves, Diamond Storm and Mighty Cleave are
  not applied; Diamond Storm uses `kind 'twinkle'`, Mighty Cleave `ember`, the rest `shard`.
- Slice 8: Land's Wrath's three columns are one `pillar count 3, spread 1.2` (= dx −0.6/0/0.6),
  held 700–1400 (entry 700–1000) so they stand at contact; fan `count 9, spread 120` toward
  the back of the lane, 0–900, tinted black with lime `hot`; smoke 1400–2200 for the slabs' dust.
- Slice 8: Precipice Blades' four-spire rings are `pillar count 4, spread 1.4` (12 tongues each);
  the defender ring is on the back layer to 1200 so the central column stays on top.
- Slice 8: Sandsear Storm's starburst is `cross` 1500–1800 (entry 'ring' = 40; with the spiral's
  10 tongues the budget allows 20); the attacker cloud is radius 0.5, alpha 0.75 (0.35/0.5 did
  not read); fire arcs are `terrain 'crack'` tinted orange.
- Slice 8: Thousand Arrows: the rain starts at 800 (falls onto the defender into contact) and
  the contact star is a three-arm `TRIAD` (15) on the back layer, because ring 40 / cross 20 +
  rain 12 exceed 30; the defender shards move to 1350–1900; the radial arrows off the attacker
  are `shards spin 0` 300–800.
- Slice 8: Thousand Waves' contact star is `cross` (cross 20 + shards 10 = 30); hex shards use
  `unit 'hex'`; the swarm roll is `terrain 'wave'` anchored on the attacker, radius 1.6.
- Slice 8: Diamond Storm: the diamond halo (`orbitCharge unit 'facet', tongues 0`, r 0.1–0.14 —
  the entry's 0.35–0.5 are orbit-sized, which drew facets larger than the card) runs 250–850,
  before contact (entry 1000–1700, after the hit), then a 6-diamond `volley` 650–1000 carries
  them down the lane; the pink cross, then the gold cross at 1350–1700 and the sparkle `rain`
  1350–1950 run in sequence (two stars + shards + rain together = 50 tongues).
- Slice 8: Mighty Cleave's crescent is `slashArc` at its maximum `radius 1.2`, `thick 0.3`,
  750–1250 (entry 800–1200); the contact star and speed rays are on the back layer; smoke
  1300–2000 for the aftermath.
- Slice 8 review (recordings both seats, `.agent/scratch/moves/sig-<id>-<seat>/`, not
  committed): every signature read shows at its moment. Weak spots: Sandsear Storm's sand
  tornado reads as scattered tan flecks round the defender, not a funnel (spiral drawer limit,
  as Wildbolt Storm); Mighty Cleave's blade is two thin gold wedges rather than one broad
  crescent (slashArc shape limit); Land's Wrath's frond fan is thin dark rays, the lime tips
  faint; Thousand Arrows' three-arm star barely shows under the impact flash. No bench target
  (rec-move has none). Probe: median 16.8–16.9 ms on all; p95 61–103 ms.
- Slice 9: `family` follows `deriveFamily`: Collision Course, Sacred Sword and Thunderous Kick
  are `dash` (physical dash + front burst at contact), Secret Sword, Fleur Cannon and Springtide
  Storm `burst` (Fleur Cannon's beam starts before the contact star), Malignant Chain
  `projectile` (the `chain` beat), Nature's Madness `electric` (its sky `bolt` is the latest front
  beat at contact). Defender `knock` follows § E (physicals 0.45, specials 0.35).
- Slice 9: every entry's "starFlare arms 'ring'" is `cross` (fighting, poison: shards 8 share the
  moment) or `RING5` (fairy); Thunderous Kick's shards are 6 (cross 20 + bolt 3 + 6 = 29).
- Slice 9: Collision Course's flame ring is `projectile unit 'wheel'` (§ New pieces C) 450–1000,
  tongues 8, tinted gold-orange; the crest loops are both orbit halves tinted violet-white; two
  short `pillar`s 1100–1900 and smoke carry the reference's fire columns and dust (the entry's
  mapping stops at the burst).
- Slice 9: Sacred Sword's slashes use radius 0.9, thick 0.2 (0.7 / 0.12 read as hairlines); the
  crest flecks are `shards target 'attacker'` tinted pale green.
- Slice 9: Secret Sword's rainbow ring is `ring kind 'face', count 3` on the attacker with `hues`
  cyan / magenta / gold, not the aura; its flare projectile ends at contact (entry 900).
- Slice 9: Thunderous Kick's kick flame is the red aura (alpha 1, r 0.8–1.2) plus red
  `speedRays target 'attacker'` 450–1000 (the aura alone read as a thin ring); a yellow `pillar`
  1450–2100 is the reference's flame column; the vignette on the kick path is tinted red.
- Slice 9: Malignant Chain's shot and wrap are one `chain` beat (links 12, r 0.13) 300–1700: the
  chain strings down the lane to ~1000 and wraps the defender after; the cage is a 3-ring `face`
  ring plus the `spiral` moved to 1350–2150 (after the star; cross 20 + shards 8 + spiral 10 > 30);
  the contact star is at contact (entry 800) on the back layer so the chain stays on top.
- Slice 9: Fleur Cannon's dome is `shade kind 'dome'` on the attacker 0–1000 (the signature read
  names it; the entry lists no new piece); the beam carries a pink `tint`.
- Slice 9: Nature's Madness's dome is `shade kind 'sphere'` (r 0.95, fill cyan alpha 0.3, pink
  rim) 1050–2200 on the front layer, the pad a `floor` ring tinted violet-pink; the green arcs are
  the aura tinted green. Particle `gravity` has no negative range, so rising motes use 0.
- Slice 9: Springtide Storm's heart shield is `glyph kind 'heart'` on the attacker (r 1.0)
  300–1200, over a pink aura.
- Slice 9 review (recordings both seats, `.agent/scratch/moves/sig-<id>-<seat>/`, not
  committed): every signature read shows at its moment. Weak spots: Springtide Storm's tornado
  reads as scattered flecks round the defender (spiral drawer limit, as Wildbolt / Sandsear);
  Collision Course's flame wheel barely travels on Actives (short lane) and reads as a gold sun;
  Thunderous Kick's kick flame is an orange ring with rays rather than flame, and its shock bolt
  is short; Fleur Cannon's beam is short (as Blue Flare). No bench target (rec-move has none).
  Probe: median 16.7–17.0 ms on all; p95 59–201 ms, over 140 for Collision Course, Fleur Cannon
  and Springtide Storm (software-GL blur cost, as slices 5 and 7); re-probe on GPU.

- Slice 10: `psychic.mjs` ships its first half, so `signature-specs.test.mjs` exempts `psychic`
  from the per-type coverage test (`PARTIAL_TYPES`) until slice 11 adds the rest. `family`
  follows `deriveFamily`: Freezing Glare `beam`, Heart Swap `chime` (the heart glyph), Hyperspace
  Hole, Luster Purge, Mist Ball and Mystical Power `burst`. Defender `knock` 0.35 (§ E, specials)
  over the entries' 0.3; the entries' float `lift −0.15` is `lift 0.15` (screen-up positive).
- Slice 10: Heart Swap (status, no hit) keeps the board's contact for the queue at 1100 of 2000
  (entry 1900 total, no contact): the reverse orb (`projectile from 'defender'`) 450–900, the
  attacker dome 850–1300, the return orb 1050–1500, the defender dome 1450–2000; the entry's
  `aura` domes are `shade kind 'dome'` (the vocabulary map) with a small aura kept on the
  defender, plus a heart glyph and twinkles at contact. The rig still shows a damage number.
- Slice 10: Hyperspace Hole's portal has no lane-midpoint anchor: it is two `shade kind 'disc'`
  portals, one on the attacker (0–650, the sink, with a violet floor ring) and one on the
  defender (350–1000, the exit), with attacker `warp`; the star is `RING5` and the shards 5
  (25 + 5 = 30).
- Slice 10: Luster Purge's `bow 1.2` is over `projectile.bow`'s 0.6 maximum: `arc, bow 0.6`; the
  rainbow halo is a 3-ring `face` ring with `hues` red/yellow/green/blue plus white `shockRings`;
  the dark orange cracks are `terrain 'crack'` tinted; the blue haze aura runs 1200–2100.
- Slice 10: Mist Ball's orb is `arc, bow 0.6` (entry 0.5) ending at contact; its star is a `cross`
  on the front layer (the entry names none; without it no front beat is live at contact and the
  family is `charge`); the spiral has 8 tongues (6 + 20 + 8 = 34 otherwise).
- Slice 10: Mystical Power's closing rings are a front `face` ring with `hues` magenta/cyan, rpm
  120, 600–1050; the star is `RING5`; Freezing Glare's beams carry the sampled cyan/blue tint and
  its splinters are `shards` tinted grey (particle colour stays the material's, slice 5 rule).
- Slice 10 review (recordings both seats, `.agent/scratch/moves/sig-<id>-<seat>/`, not
  committed): every signature read shows at its moment. Weak spots: Hyperspace Hole's portals
  read as violet ring outlines — the dark disc fill barely shows on the dark mat; Freezing
  Glare's beam is thin and short on Actives (as Blue Flare) and the grey splinters are faint;
  Mist Ball's after-mist is faint. No bench target (rec-move has none). Probe: median
  16.8–17.0 ms on all; p95 54–79 ms.
- Slice 11: `psychic.mjs` is complete, so the `PARTIAL_TYPES` exemption is removed from
  `signature-specs.test.mjs`. `family` follows `deriveFamily`: Photon Geyser, Prismatic Laser,
  Psycho Boost and Psystrike `burst`, Psyblade `dash` (physical dash + front shards at contact).
  Defender `knock` follows § E (Psyblade 0.45, specials 0.35) over the entries' 0.3/0.4; Psycho
  Boost's float `lift −0.15` is `lift 0.15`.
- Slice 11: Photon Geyser's contact star is `cross` and its rock chunks are 5 `shards unit
  'body'` tinted grey-black (cross 20 + shards 5 + pillar 3 = 28; ring 40 + 8 over budget); a
  red aura joins the red-black charge; the column runs 1100–2000 tinted cyan-green.
- Slice 11: Prismatic Laser's five-hue column is `pillar count 3, spread 0.5, w 0.4` with the
  five `hues` (one pillar draws one hue — the slice 5 Sacred Fire finding — so the entry's single
  w 0.5 pillar recorded as a plain pink column); its contact star is `cross` and the entry's
  shards are dropped (cross 20 + 9 = 29); the prism ring is a 3-ring `face` ring with `hues`, the
  release flare `RING5 target 'attacker'` 600–850; orbit tongues carry the prism `hues`.
- Slice 11: Psyblade's crescents are `slashArc radius 1.0, thick 0.25` (0.7 reads as hairlines,
  slice 9); the violet burst adds pink/cyan `face` rings; spiral 10 tongues.
- Slice 11: Psycho Boost's star is `RING5`, its rings carry `hues` magenta/cyan; a violet cloud
  on the attacker stands for the purple haze. Psystrike's thrown cluster is `projectile unit
  'rings'` (§ New pieces C) 500–1000 (entry 1000, the contact itself), `arc, bow 0.5`, so the
  release shockRings move to 350–650 and the charge to 200–600; its star is `RING5` tinted
  orange-white, the defender rings a 3-ring `face` ring with the gold/pink/violet `hues`; the
  attacker `lunge` is `wind 0.4, reach 0.6`.
- Slice 11 review (recordings both seats, `.agent/scratch/moves/sig-<id>-<seat>/`, not
  committed): every signature read shows at its moment. Weak spots: Photon Geyser's red-black
  sphere reads as a red ring outline round the attacker rather than a filled sphere; Psyblade's
  crescents are thin magenta lines (slashArc shape limit, as Mighty Cleave); Psycho Boost's orb
  is cyan-cored more than violet-white. No bench target (rec-move has none). Probe: median
  16.8–17.0 ms on all; p95 59–88 ms.
- Slice 12: `family` follows `deriveFamily`: Aeroblast, Dragon Ascent and Sunsteel Strike `burst`,
  Bleakwind Storm `wind`, Oblivion Wing `splash`, Doom Desire `quake`, Behemoth Bash, Behemoth Blade
  and Double Iron Bash `punch`, Tachyon Cutter `slash`. Defender `knock` follows § E (physicals
  0.45, specials 0.35; Oblivion Wing and Tachyon Cutter over the entries' 0.3 / 0.2); Aeroblast and
  Bleakwind Storm keep the entries' float as `lift 0.15` (screen-up positive).
- Slice 12: every "starFlare arms 'ring'/'dai'" is `cross` (spiral 10 + 20; shards 8 + 20 + a
  pillar). Bleakwind Storm has no star (spiral 14 + helix 2; a 'dai' made 41). Aeroblast's orb is
  `projectile unit 'rings'` ending at contact 1050; its vortex `spiral` runs 1000–1700.
- Slice 12: Dragon Ascent's comet drop is `projectile from 'sky'` 550–1000 (no stand-in arc); the
  gold chain-rings are `orbitCharge unit 'rings', tongues 0` 370–1000; leaf particles; smoke for the
  rock dust.
- Slice 12: Oblivion Wing's drain orb is `projectile from 'defender'` 1200–1800 (r 0.36–0.48); the
  crimson column is `pillar w 0.9, height 2.2` to 1650 and the beam `w 0.75` (0.6 / 0.5 did not
  read); the black-out is an attacker `vignette` 0–900 tinted near-black.
- Slice 12: Behemoth Bash's crown-shield is `fan count 6, spread 120, direction 180, spin 30` on
  the front layer 0–950 (it stays at home while the lunge ghost leaves, as V-create); shards 6 so
  cross 20 + 6 + pillar 3 = 29. Double Iron Bash's two hits are `stagger lead 500, hits 2` (`gapMs`
  max 250) with `lunge strikes 2`; the fists are `orbitCharge unit 'fist'` 0–500, the first hit's
  sparks `shards unit 'hex'`. Behemoth Blade's sword is a `solid` beam 300–1000 tinted cream.
- Slice 12: Doom Desire's falling-column field is `pillar from 'above', count 3, spread 0.9,
  stagger 100` 1000–1500 (after the first column 700–1000); the cyan ground column and shards move
  to 1300–1800 (cross 20 + field 9 = 29); the gold star on the attacker is a `cross target
  'attacker'` 0–550 beside the coreCharge; the violet glints use `unit 'spiked'`.
- Slice 12: Sunsteel Strike's sun is `projectile unit 'spiked', tongues 6`; the rainbow streaks are
  two solid beams tinted green / magenta 700–1050. Tachyon Cutter's blades are `volley unit
  'crescent'` (r 0.26–0.34, the slice 5 Seed Flare finding), slashArc `radius 0.9, thick 0.2`.
- Slice 12 review (recordings both seats, `.agent/scratch/moves/sig-<id>-<seat>/`, not committed):
  every signature read shows at its moment except Bleakwind Storm, whose helix tornado reads as
  faint grey flecks round the defender (spiral drawer limit, as Wildbolt / Sandsear) with only the
  floor rings clear. Other weak spots: Aeroblast's vortex after contact is faint blue crescents (the
  ring-orb and white burst carry it); Behemoth Blade's violet storm barely shows (the contact is a
  white cross) and its sword is a short cream crystal on Actives; Oblivion Wing's beam is short (as
  Blue Flare). No bench target (rec-move has none). Probe: median 16.7–16.9 ms on all; p95
  54–185 ms, over 140 for Behemoth Bash (172–174) and Doom Desire (168–185) (software-GL blur cost,
  as slices 5, 7 and 9); re-probe on GPU.
- Slice 12: `signature-select.test.mjs` edge 11 ("a selected signature with no shipped spec falls
  through to 063") used Lugia V's Aeroblast as its unshipped example; it now uses Roar of Time
  (Darkrai by name, slice 13) and needs another unshipped move until slice 15 ships the last ones.
- Slice 13: `family` follows `deriveFamily`: every Dragon tier-S burst/beam is `roar` (Core
  Enforcer, Dragon Energy, Dynamax Cannon, Roar of Time, Spacial Rend), Eternabeam `quake` (the
  `pillar from 'above'`), Nihil Light `electric` (its bolt is the latest front beat at contact).
  Defender `knock` 0.35 (§ E, specials) over the entries' 0.2–0.45. Particle `spark` is not a
  kind: `streak`.
- Slice 13: Core Enforcer's and Nihil Light's Z-bolt is `bolt segments 3, jag 0.3` (entry 0.5 is
  over the 0.3 maximum), width 0.16–0.18 tinted green-white; Core Enforcer's orb sits on the card
  (`lead 0`, as the entry says): a `sky-attacker` orb hung off the board by the top bench on the
  opp seat and read as a separate object. Same for Roar of Time's time orb (`lead 0.42`).
- Slice 13: Dragon Energy's radial orb-burst is `fan target 'attacker', count 10, spread 360`
  (the vocabulary map's "radial orb-burst") 600–1000 beside the entry's speedRays; its orbit orbs
  carry `tongues 0`; a `RING5` white-pink star at contact.
- Slice 13: Eternabeam's blade-star is `fan count 4, spread 360, spin 90, width 0.3` tinted
  silver-black over a small red-pink `coreCharge lead 0`, 100–900; the white column the
  signature read names is `pillar from 'above'` 850–1400 (the entry's mapping has none).
- Slice 13: Roar of Time's hexagon plates are `shards unit 'hex'` tinted blue; contact star
  `cross`; beam `widening w 0.8` (0.6 barely showed between the Actives).
- Slice 13: Spacial Rend's vortex adds a gold aura and a 2-ring gold `face` ring 300–1000 under
  the spiral (the spiral alone read as flecks); the rift lines are a front `segmented` beam w 0.5;
  the crescent is `slashArc radius 1.1, thick 0.3` on the top layer 950–1350 with a smaller
  impactFlash after it (the full flash hid the slash).
- Slice 13: Nihil Light is built from its from-memory entry (approved placeholder; no reference
  exists) plus one addition: the "light lattice" its signature read names is `glyph kind
  'lattice'` on the attacker 0–700 (the entry's mapping had no lattice beat). Palette is Core
  Enforcer's, unverified. Restudy when a reference video appears.
- Slice 13: `signature-select.test.mjs` edge 11 now uses Dark Void (Darkrai by name, slice 14);
  slice 14 must switch it to a Normal move, and slice 15 drop or invert it.
- Slice 13 review (recordings both seats, `.agent/scratch/moves/sig-<id>-<seat>/`, not
  committed): every signature read shows at its moment. Weak spots: Roar of Time's and Dynamax
  Cannon's beams are short on Actives (as Blue Flare); Eternabeam's magenta vortex reads as pink
  flecks (spiral limit) while the blade-star carries it; Spacial Rend's crescent lands beside the
  defender rather than across it and its rift lines are faint. No bench target (rec-move has
  none). Probe: median 16.8–17.0 ms on all; p95 56–179 ms, over 140 for Dragon Energy self (179),
  Eternabeam self (144) and Spacial Rend self (149) (software-GL blur cost, as earlier slices);
  re-probe on GPU.
- Slice 14: `family` follows `deriveFamily`: Astral Barrage and Dark Void `ghost` (the front
  `shade` dome at contact), Moongeist Beam, Fiery Wrath and Ruination `burst`, Shadow Force and
  Wicked Blow `dash`, Spectral Thief `quake` (the `pillar from 'above'`), Hyperspace Fury `punch`.
  Defender `knock` follows § E (Moongeist Beam and Fiery Wrath 0.35 over the entries' 0.3).
- Slice 14: the domes (Astral Barrage, Dark Void) are `shade kind 'dome'` on the front layer
  (fillAlpha 0.85–0.9) so they swallow the defender; Spectral Thief's giant is `shade kind
  'giant', eyes true` on the back layer 500–1800; Shadow Force's and Ruination's pits add a
  `shade kind 'disc'` on the attacker beside the entry's cloud/crack; Hyperspace Fury's hands are
  `orbitCharge unit 'fist', half 'both'` 0–700 plus a `volley unit 'fist'` count 3 450–1050 (the
  hands extending down the lane), with `stagger lead 440` so its three hits land at 610/830/1050
  under the early shards; Ruination's spike field is `shards mode 'cluster'` (count 7, default
  unit — `unit 'spiked'` read as pink balls) 1050–1900 and its pillar is `count 2`.
- Slice 14: Dark Void (status) has no defender `none` motion: it uses `sink heat 0` (the
  defender falls asleep); contact is the nominal 1000 of 2000 (the rig still shows a damage
  number). Its Z motes are `kind 'zzz'` per § F; particles take the material colour (slice 5
  rule), so the Zs are dark-material magenta, not the entry's blue.
- Slice 14: Fiery Wrath adds a front `shards` beat at contact (without one no front beat is live
  at 1100 and the family is `charge`), a magenta attacker aura 300–1100 for the fireball and a
  floor ring for the defender's ground circle; its projectile runs to contact. Moongeist Beam's
  crescent crest is `orbitCharge unit 'crescent'` tinted gold; impactFlash at contact (entry
  900–1150). Shadow Force's and Wicked Blow's slashArcs are `radius 1.0, thick 0.25` (0.7 reads
  as hairlines, slice 9); Wicked Blow's starburst is `cross` (cross 20 + shards 6 + slash 3 +
  beam 1 = 30) and its slash runs 1250–2100.
- Slice 13's note on `signature-select.test.mjs` edge 11 is done: it now uses Crush Grip
  (Regigigas by name, normal, slice 15); slice 15 must drop or invert it.
- Slice 14 review (recordings both seats, `.agent/scratch/moves/sig-<id>-<seat>/`, not
  committed): every signature read shows at its moment. Weak spots: Shadow Force's shadow pool
  and Spectral Thief's giant are dark-on-dark and read mainly by their rims (the giant's eyes are
  small); Fiery Wrath's magenta spiral fireball barely shows (spiral limit) — the tongued orb and
  the ring carry it; Wicked Blow's crimson spiral reads as flecks while the white face rings
  carry the ring of arcs; Dark Void's Zs are small. No bench target (rec-move has none). Probe:
  median 16.8–17.6 ms on all; p95 65–158 ms, over 140 for Fiery Wrath (141–152), Wicked Blow
  self (144) and Ruination (140–158) (software-GL blur cost, as earlier slices); re-probe on GPU.

## Appendix S — per-move study entries
One entry per move, by type, in the schema of `refs/065-study/STUDY-BRIEF.md`. The entries are the
contract for slices 5–15; a builder adjusts numbers only inside the tier-S band and records any
other change under Deviations. Raw notes: `refs/065-study/notes/`; reference URLs, frame counts
and durations: `refs/065-study/move-refs.json`.

How the entries were made and what to trust: four Haiku agents read every primary contact sheet
(Scarlet/Violet, or Sword/Shield for the 15 moves without one) and the Gen 7 sheets where the shape
was unclear. Every entry proposes contact at 1000–1150 ms and a total of 2000–2400 ms, inside tier S;
the references run 4–13 s, so most beats are compressed 2–6× (the `Flags` say how much). The
`Video beats` times are measured on the reference; the `Board mapping` times are the board's. Every
"house-rule translation" flag marks a whiteout, full-screen tint, camera move or sunburst in the
reference that the mapping replaces with a local vignette, flash or card motion, or drops. **Nihil
Light has no reference anywhere** (Poképédia links a Z-A video file that does not exist); its entry
is from memory and is a placeholder modelled on Core Enforcer — build it as written and flag it, and
restudy it when a video appears. Defender names in the entries come from HP boxes and are sometimes
unverified; they do not matter to the board.

Vocabulary map — entry wording → the pinned piece (§ New pieces):
| entry says | build with |
|---|---|
| palette override / `palette.override` / "X palette needs a per-move override" | `tint` on that beat |
| per-tongue hue, prism hue cycle, rainbow fringe | `hues` |
| `target`/`anchor` param on starFlare/speedRays, "sky orb", "over its head", `lift` | the drawer's `target` (kind `anchor`: `'attacker'`, `'defender'`, `'sky'`, `'sky-attacker'`) + `dx`/`dy` |
| projectile reverse, drain orb, defender→attacker | `projectile from 'defender'` (or `volley from 'defender'`) |
| comet drop, vertical drop, "drops onto the defender" | `projectile from 'sky'` (or `volley from 'sky'`) |
| projectile `from lift`, orb dropped from over the attacker | `projectile from 'sky-attacker'` |
| pillar `dx`, side columns, falling-column field | `pillar dx` / `count` + `spread` + `stagger` |
| mound, rock cluster | `shards mode 'cluster'` |
| fins halo | `ring kind 'fins'` |
| cage strands | `bolt count` + `spread` + `curve` |
| vwings, blade fan, fronds, spokes, radial orb-burst, blade-star | `fan` |
| portal, dome, violet dome, sphere seal, shadow giant | `shade` (`disc`/`dome`/`sphere`/`giant`) |
| frost sphere, rings-in-a-cluster, spiked sun head, hoop, crescent blade, hands, hexagon plate, flame ring body | `unit` `'facet'`/`'rings'`/`'spiked'`/`'hoop'`/`'crescent'`/`'fist'`/`'hex'`/`'wheel'` |
| lattice ghost, heart shield | `glyph kind 'lattice'` / `'heart'` |
| ring-chain | `chain` |
| glove | `grip` |
| sleep motes (Z), music notes | particles `kind 'zzz'` / `'note'` |
| fused ghost, departing copy | attacker `echo` |
| double-lunge / N strikes | attacker `lunge.strikes` |
| attacker sink / re-emerge | attacker `warp` |
| stagger `lead` | defender `stagger.lead` |
| normal material | `materials/normal.js`; Tera Starstorm → `stellar` |
<!-- APPENDIX-S -->
### Normal

#### Crush Grip — Regigigas · normal · physical · power —
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

#### Judgment — Arceus · normal · special · power 100
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

#### Multi-Attack — Silvally · normal · physical · power 120
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

#### Relic Song — Meloetta · normal · special · power 75
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

#### Techno Blast — Genesect · normal · special · power 120
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

#### Tera Starstorm — Terapagos · normal · special · power 120
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

### Fire

#### Blue Flare — Reshiram · fire · special · power 130
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

#### Fusion Flare — Reshiram (also Kyurem-White) · fire · special · power 100
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

#### Magma Storm — Heatran · fire · special · power 100
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

#### Sacred Fire — Ho-Oh (also Entei) · fire · physical · power 100
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

#### Searing Shot — Victini · fire · special · power 100
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

#### V-create — Victini · fire · physical · power 180
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

### Water

#### Hydro Steam — Walking Wake · water · special · power 80
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

#### Origin Pulse — Kyogre · water · special · power 110
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

#### Steam Eruption — Volcanion · water · special · power 110
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

#### Surging Strikes — Urshifu · water · physical · power 25
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

### Grass

#### Ivy Cudgel — Ogerpon · grass · physical · power 100
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

#### Seed Flare — Shaymin · grass · special · power 120
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

### Electric

#### Bolt Strike — Zekrom · electric · physical · power 130
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

#### Electro Drift — Miraidon · electric · special · power 100
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

#### Fusion Bolt — Zekrom · electric · physical · power 100
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

#### Plasma Fists — Zeraora · electric · physical · power 100
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

#### Thunder Cage — Regieleki · electric · special · power 80
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

#### Thunderclap — Raging Bolt · electric · special · power 70
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

#### Wildbolt Storm — Thundurus · electric · special · power 100
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

### Ice

#### Freeze Shock — Kyurem · ice · physical · power 140
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

#### Glacial Lance — Calyrex-Ice · ice · physical · power 120
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

#### Glaciate — Kyurem · ice · special · power 65
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

#### Ice Burn — Kyurem · ice · special · power 140
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

### Fighting

#### Collision Course — Koraidon · fighting · physical · power 100
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

#### Sacred Sword — Cobalion / Terrakion / Virizion / Keldeo · fighting · physical · power 90
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

#### Secret Sword — Keldeo · fighting · special · power 85
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

#### Thunderous Kick — Zapdos (Galar) · fighting · physical · power 90
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

### Poison

#### Malignant Chain — Pecharunt · poison · special · power 100
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

### Ground

#### Land's Wrath — Zygarde · ground · physical · power 90
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

#### Precipice Blades — Groudon · ground · physical · power 120
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

#### Sandsear Storm — Landorus · ground · special · power 100
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

#### Thousand Arrows — Zygarde · ground · physical · power 90
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

#### Thousand Waves — Zygarde · ground · physical · power 90
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

### Flying

#### Aeroblast — Lugia · flying · special · power 100
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

#### Bleakwind Storm — Tornadus · flying · special · power 100
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

#### Dragon Ascent — Rayquaza · flying · physical · power 120
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

#### Oblivion Wing — Yveltal · flying · special · power 80
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

### Psychic

#### Freezing Glare — Articuno · psychic · special · power 90
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

#### Heart Swap — Manaphy / Magearna · psychic · status · power —
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

#### Hyperspace Hole — Hoopa · psychic · special · power 80
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

#### Luster Purge — Latios · psychic · special · power 95
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

#### Mist Ball — Latias · psychic · special · power 95
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

#### Mystical Power — Azelf / Mesprit / Uxie · psychic · special · power 70
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

#### Photon Geyser — Necrozma · psychic · special · power 100
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

#### Prismatic Laser — Necrozma · psychic · special · power 160
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

#### Psyblade — Iron Leaves · psychic · physical · power 80
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

#### Psycho Boost — Deoxys / Lugia · psychic · special · power 140
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

#### Psystrike — Mewtwo · psychic · special · power 100
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

### Rock

#### Diamond Storm — Diancie · rock · physical · power 100
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

#### Mighty Cleave — Iron Boulder · rock · physical · power 95
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

### Ghost

#### Astral Barrage — Calyrex (Shadow Rider) · ghost · special · power 120
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

#### Moongeist Beam — Lunala · ghost · special · power 100
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

#### Shadow Force — Giratina · ghost · physical · power 120
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

#### Spectral Thief — Marshadow · ghost · physical · power 90
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

### Dragon

#### Core Enforcer — Zygarde · dragon · special · power 100
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

#### Dragon Energy — Regidrago · dragon · special · power 150
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

#### Dynamax Cannon — Eternatus · dragon · special · power 100
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

#### Eternabeam — Eternatus · dragon · special · power 160
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

#### Nihil Light — Zygarde (Mega) · dragon · special · power 200
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
Flags: missing refs · uncertainty: the entire entry is from memory (unverified); the palette, beat order and the lattice image all need a reference before design 065 uses them; the mapping copies core-enforcer's Zygarde structure as a placeholder

#### Roar of Time — Dialga · dragon · special · power 150
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

#### Spacial Rend — Palkia · dragon · special · power 100
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

### Dark

#### Dark Void — Darkrai · dark · status · power —
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

#### Fiery Wrath — Moltres (Galar) · dark · special · power 90
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

#### Hyperspace Fury — Hoopa (Unbound) · dark · physical · power 100
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

#### Ruination — Chi-Yu · dark · special · power 1
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

#### Wicked Blow — Urshifu · dark · physical · power 75
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

### Steel

#### Behemoth Bash — Zamazenta · steel · physical · power 100
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

#### Behemoth Blade — Zacian · steel · physical · power 100
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

#### Doom Desire — Jirachi · steel · special · power 140
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

#### Double Iron Bash — Melmetal · steel · physical · power 60
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

#### Sunsteel Strike — Solgaleo · steel · physical · power 100
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

#### Tachyon Cutter — Iron Crown · steel · special · power 50
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

### Fairy

#### Fleur Cannon — Magearna · fairy · special · power 130
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

#### Nature’s Madness — Tapu Bulu / Tapu Fini / Tapu Koko / Tapu Lele · fairy · special · power —
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

#### Springtide Storm — Enamorus · fairy · special · power 100
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
<!-- /APPENDIX-S -->
- Slice 1: `signature-moves.test.mjs` accepts `normal`/`stellar` as materials ahead of slice 3
  (`MATERIAL_KEYS` gains them there); `SIGNATURE_BY_NAME` is exported from `signature-select.mjs`
  so the moves test can check name reachability. `rec-move.mjs` writes signature recordings to
  `.agent/scratch/moves/signature-<id>/` so they never overwrite 063's same-id recordings
  (`aeroblast`, `seed-flare`). `pnpm test:changed` could not run in this checkout (no `main`
  ref for `git merge-base`); `pnpm test` is fully green instead.
