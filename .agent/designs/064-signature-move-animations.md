# 064: Signature move animations for legendary Pokémon
Status: draft (awaiting the user's approval)
Date: 2026-10-08 · Builds on design 063 (approved 2026-10-05), which it extends and never replaces.

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

## Current state (read this session)
- Design 063 is approved, not built. On this branch the look-test files exist:
  `client/src/setup/netcode/mat-fx/moves/fire-blast-pose.mjs`, `fire-blast.js`,
  `fire-material.js`; 063 slice 2 turns them into `move-spec.mjs`, `move-player.js`,
  `move-drawers.js`, `move-poses.mjs`, `card-motion.mjs`, `materials/`.
- `combat.js attack(plan)` (`client/src/setup/netcode/mat-fx/combat.js:206`) still plays the
  generic lunge; 063 § Wiring inserts `moveFor` + `playMove` there. The plan carries
  `attackerId`, `defenderId`, `attackName`, `damage`, `user`.
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
  the 87 studied moves appear as an attack name, on 88 cards (Land's Wrath 7, Sunsteel Strike 7,
  Dynamax Cannon 5, Moongeist Beam 5, Photon Geyser 5, Sacred Fire 5, Secret Sword 5, Thunderous
  Kick 5, …). The other legendaries reach their signature through the strongest-attack rule.
  One corpus card names another species' move: Darkrai (DP Promos DP24) has attacks named Roar
  of Time and Spacial Rend; by rule 4 they play Dialga's and Palkia's moves.

## References — how they were gathered (so a later session can refetch)
Pipeline committed under `.agent/designs/refs/064-study/` (media and sheets are not committed;
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
   signature slice never edits a generic type file.
6. **Timing**: (a) reuse tier 3; (b) a new tier `S` (1800–2600 ms, contact 900–1200). Pick
   **(b)**: the SV references run 4–7 s; 2.2 s is too short for a charge + a signature image +
   an aftermath, while 2.6 s with contact ≤ 1200 keeps every hold and the queue budget unchanged.
7. **Status moves aimed at the opponent** (Dark Void, Heart Swap): (a) skip; (b) animate with a
   "contact" that is the effect landing. Pick **(b)** (the user kept them); they play only by name
   match or as the owner's strongest attack, so a damage number may or may not follow.
8. **New materials**: 063 has 17 type materials and no `normal`. Signature moves of Normal type
   (Crush Grip, Judgment, Multi-Attack, Relic Song, Techno Blast default, Tera Starstorm) need
   `normal` (pale gold-white pressure light) and `stellar` (prismatic). Pinned in § Materials.

## Design
### File map
```
client/src/setup/netcode/mat-fx/moves/signature/
  signature-moves.mjs       SIGNATURE_MOVES, SIGNATURE_BY_SLUG, CARD_TYPED, MASK_MATERIAL (pure data)   slice 1
  signature-select.mjs      normalizeAttackName, baseDamage, strongestAttackName, signatureForSlug,
                            signatureFor, signatureMaterial (pure)                                        slice 1
  specs/<vgType>.mjs        one MoveSpec (tier 'S') per signature move of that type                       slices 4–11
  specs/index.mjs           SIGNATURE_SPECS = { [moveId]: MoveSpec } merged from the type files            slice 1 (empty)
  __tests__/signature-moves.test.mjs · signature-select.test.mjs · signature-specs.test.mjs
client/src/setup/netcode/mat-fx/moves/move-spec.mjs        TIER_BAND.S, the S contact rule, statClass 'status'  slice 1
client/src/setup/netcode/mat-fx/moves/materials/normal.js, stellar.js                         slice 2
client/src/setup/netcode/mat-fx/moves/move-drawers.js + move-poses.mjs   the new drawers (§ New drawers)    slice 3
client/src/setup/netcode/mat-fx/combat.js   attack(plan): signature first (§ Wiring)                         slice 1
client/src/css/mat-fx.css                   .fx-move__heat--<material> modifiers for normal/stellar             slice 2
.claude/skills/fx-preview/rec/rec-move.mjs  MOVE=<id> also finds SIGNATURE_SPECS                              slice 1
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

### Wiring (`combat.js attack(plan)`; 063 § Wiring with one step in front)
```
card = registry.get(plan.attackerId)?.card
slug = pokemonSpriteForName(card?.name, { types: card?.types })?.slug ?? null
sig  = signatureFor(card, { attackName: plan.attackName, slug })
spec = sig && SIGNATURE_SPECS[sig.move]
if (spec && from && to && src) {
  played = playMove({ spec: { ...spec, material: sig.material }, attacker, defender, seed, impacts, attackerCard: card })
  if (played) return played.holdMs
}
…063's moveFor path, unchanged…
```
`index.js soundPlanFor` uses the same pure call: `family = spec?.family ?? pick?.family`. A
signature whose spec has not shipped yet falls through to 063 (then to the lunge), so slices ship
one type at a time with nothing broken. Reduced motion skips it like every transient attack scene.

### `move-spec.mjs` changes (063's validator, extended)
- `TIER_BAND.S = [1800, 2600]`; for tier `'S'`: `contactMs ∈ [900, 1200]` and
  `contactMs / durationMs ∈ [0.38, 0.62]`; `statClass` may be `'status'` (only with tier `'S'`).
- `vgType` enum gains `'normal'` (063's 17 + normal); `material` enum gains `'normal'`, `'stellar'`.
- Everything else (beats, layers, drawer params, cost rule ≤ 30 tongues, particles ≤ 24 per burst,
  ≤ 2 bursts, ≤ 28 total, nodes ≤ 40, `pad ∈ [1.2, 2.6]`) is 063's, unchanged.

### New pieces (the study's `New pieces` lines, consolidated; each is pinned)
The four study batches asked for ~40 missing pieces. Almost all are the same few gaps, so they
become a handful of general extensions instead of one drawer per move. Every extension defaults
to 063's behaviour, so no 063 spec changes. Each gets a pure pose fn in `move-poses.mjs` and a
test (slice 3).

**A. Two params on every drawer** (`check` accepts them on all 24 + the new ones):
- `tint: { deep?, body?, hot?, core? }` — hex strings that replace the material's palette keys
  for this beat only. Mechanism: every material function takes a final optional `palette`
  argument (same keys as `material.palette`, rgb arrays); `tintedPalette(palette, tint)` in
  `materials/_shared.js` parses `#RRGGBB` → `[r,g,b]` and returns a merged copy; drawers pass it
  through. Used by every entry whose `Palette` differs from its type (Blue Flare's blue fire,
  Thousand Arrows' lime, Mighty Cleave's gold, Bolt Strike's dark wisps, Core Enforcer's green, …).
- `hues: string[]` — on drawers that draw several tongues/bodies/rings, item `i` is drawn with
  `tintedPalette(palette, { body: hues[i % n], hot: lighten(hues[i % n], 0.35) })`, where
  `lighten(hex, f)` mixes with white by `f`. Sacred Fire's rainbow fountain, Prismatic Laser's
  prism column, Luster Purge's rainbow halo, Relic Song's rings.

**B. Placement (`anchor`)** on `coreCharge`, `orbitCharge`, `starFlare`, `speedRays`, `ring`,
`shockRings`, `pillar`, `glyph`, `cloud`, `fan`, `shade`:
`anchor: 'attacker' | 'defender' | 'sky-attacker' | 'sky-defender'` plus `dx`, `dy` in h.
`sky-*` is 1.6 h above the card on screen (the same point as 063's `bolt from 'sky'`); `dx`/`dy`
are screen offsets for `sky-*` and lane offsets (along, across) otherwise. Each drawer's default
anchor is the one 063 fixed (starFlare/speedRays/pillar → defender; coreCharge/orbitCharge →
attacker). Origin Pulse's star on Kyogre, Plasma Fists' spokes round Zeraora, Thunder Cage's sky
orb, Fusion Flare's overhead orb, Judgment's orb over Arceus.

**C. Extended params on 063 drawers**
| drawer | new params (default = 063) | used by |
|---|---|---|
| `coreCharge` | `lift` h above the attacker on screen (0) · `rings` 0–2 rotating tongue arcs round the body, radius 1.25 r, 1 turn/s (0) | Fusion Flare, Judgment, Techno Blast |
| `projectile` | `from: 'attacker' \| 'defender' \| 'sky-defender' \| 'lift'` ('attacker') · `to: 'defender' \| 'attacker'` ('defender') · `path` gains `'drop'` (from `sky-defender`, straight, `f = s²`) · `unit` (below, 'body') | Heart Swap and Oblivion Wing drain (`from 'defender'`, `to 'attacker'`), Dragon Ascent and Judgment (`'drop'`), Fusion Flare (`from 'lift'`) |
| `orbitCharge`, `volley`, `shards` | `unit` ('body') · `shards.mode: 'burst' \| 'cluster'` ('burst'; `cluster` = the fragments sit still at the anchor's base, lit on the upper edge, held to the beat's end) | Hyperspace Fury hands, Roar of Time hex plates, Magma Storm rock mounds |
| `pillar` | `count` 1–4 (1) · `spread` h, columns evenly over ±spread/2 (0) · `stagger` ms between columns (0) · `dx` h (0) | Magma Storm, Searing Shot, Land's Wrath, Precipice Blades, Doom Desire |
| `ring` | `kind` gains `'fins'` (`count` short tongue spokes round the anchor, spinning at `rpm`) | Hydro Steam |
| `bolt` | `count` 1–12 bolts fanned across the target footprint (1) · `spread` h (0.8) · `curve` bow in h (0) · `from` takes an anchor | Thunder Cage strands, Thunderclap |
| `glyph` | `kind: 'material' \| 'lattice' \| 'hex'` ('material' = 063's sigil); `lattice` = a 4 × 3 grid of 1 px strokes at `r`, rotating 20°/s; `hex` = a flat hexagon plate (fill body, 1 px core edge) | Ice Burn's red lattice, Roar of Time |

`unit` — the body a travelling or orbiting drawer draws, each a function in
`materials/_units.js` taking `(ctx, x, y, r, angleDeg, s, palette)`:
`'body'` (the material's own body/projectile, 063), `'rings'` (three 0.1 r-wide rings at 0°/60°/120°
tilt, rotating; Psystrike), `'spiked'` (body + 14 triangular spikes 0.45 r long, rotating 30°/s;
Sunsteel Strike), `'facet'` (a hexagon-faceted sphere: 6 triangles shaded hot→deep by angle;
Freeze Shock, Tera Starstorm), `'hoop'` (an upright ellipse 0.65 r × r of tongues on its rim,
spinning about the vertical axis by scaling x with `cos(2π·2s)`; Electro Drift), `'crescent'`
(a tongue bent along a circular arc of 0.3 w bow, with a 1 px `core` edge line; Tachyon Cutter,
Mighty Cleave), `'fist'` (a rounded-square silhouette 0.8 r with a 0.25 r cuff band in `hot`;
Hyperspace Fury), `'hex'` (the glyph hexagon plate, tumbling: rotate `360·s`; Roar of Time).

**D. New drawers**
| drawer | pose fn | draws | params (default) | used by |
|---|---|---|---|---|
| `fan` | `fanPose(s, h, p)` → `{ tongues: [{ x, y, angleDeg, length, width }], alpha }` | `count` tapered tongues from the anchor, spread evenly over `spread` degrees centred on `direction` (lane degrees; 180 = away from the defender), lengths in `[lenMin, lenMax]` h alternating, growing over the first `grow` of the beat, flapping ±`flap`° at 3 Hz, spinning `spin`°/s, fading over the last 20 % | `anchor 'attacker'`, `count 6`, `spread 110`, `direction 180`, `lenMin 0.6`, `lenMax 1.0`, `width 0.22`, `grow 0.3`, `flap 0`, `spin 0` | V-create (two beats, `direction ±125`, `flap 12`), Land's Wrath fronds, Behemoth Bash blade fan, Eternabeam blade star (`count 4`, `spread 360`, `spin 40`), Plasma Fists spokes (`count 12`, `spread 360`), Dragon Energy radial burst |
| `shade` | `shadePose(s, h, p)` → `{ x, y, rx, ry, rimAlpha, swirl, alpha }` | a dark volume drawn `source-over`: `kind 'disc'` (flat ellipse, ry = 0.45 rx, a portal), `'dome'` (upper half-ellipse rising from the anchor's floor), `'giant'` (a tall rounded silhouette 2.2 h high behind the anchor with two `#FFD23F` eye ovals when `eyes`); fill = material `deep` with value-noise mottling (the grain tile at alpha 0.25), rim = 0.04 h stroke in `body` at `rimAlpha`; grows over 25 %, holds, shrinks over the last 25 %; `swirl` rpm turns the mottling | `anchor 'defender'`, `kind 'disc'`, `r 0.9`, `rimAlpha 0.6`, `swirl 20`, `eyes false` | Hyperspace Hole/Fury portals, Dark Void and Astral Barrage domes, Spectral Thief's shadow giant |
| `grip` | `gripPose(s)` → `{ y, curl, alpha }` | a five-fingered glove (normal material body fill, 1 px `#1E1B1F` outline) descending from `sky-defender` to the defender over 40 %, fingers curling 0 → 70° over 40–70 %, holding to the end | `size 1.2` | Crush Grip |

The player draws `shade` in the `source-over` group with `vignette`, `smoke` and
`terrain 'crack'` (063 § Player step 5/7).

**E. Card motion additions** (`card-motion.mjs`)
- attacker `rear-lurch.hold` ms (0): the wind-up pose holds that long before the thrust; thrust
  and recoil shift by `hold`. For the long charges (Roar of Time, Prismatic Laser, Eternabeam,
  Origin Pulse, Psystrike).
- attacker `lunge.strikes` 1–3 (1): the strike window `[0.4 c, c]` splits evenly into `strikes`
  rewind-and-strike pairs (rewind 60 % of each part to along −0.1, strike 40 % to `reach`);
  contact is the last. Double Iron Bash (2), Hyperspace Fury (3).
- attacker preset `warp`: 0 → 0.3 c scale 1 → 0.15 while `along` moves to 0.3 of the lane;
  hidden (scale 0.15, rim 0) to 0.85 c; reappears at `along = length − 0.9 h` scaling to 1 by c
  (the strike); then `springHome` back over c → 1.5 c. Hyperspace Hole, Spectral Thief.
- attacker `echo: { alpha, offset, fadeMs }` (none): one extra ghost image of the attacker art
  behind it, `offset` h back along the lane, at `alpha`, fading over `fadeMs` from 0 ms (a fused
  or departing copy). Fusion Bolt, Fusion Flare, Bolt Strike. Counts toward the 40-node limit.
- defender `stagger.lead` ms (0): the first knock lands `lead` ms before contact, the last at
  contact. Surging Strikes (`hits 3`, `lead 450`).
- defender `knock` strength: signature physicals 0.45, specials 0.35 (unchanged cap).

**F. CSS particle classes** (`mat-fx.css`, beside 063 § D's six): `.fx-particle--zzz` (a `::before`
`content: 'Z'`, 700 weight, 0.18 h font size via `--fx-particle-size`, colour from
`--fx-particle-color`; Dark Void's sleep motes, rising: `direction -90`, `gravity -0.2`) and
`.fx-particle--note` (`content: '♪'`, same rules; Relic Song, two bursts in two colours).

**G. Materials `normal` and `stellar`** (`materials/normal.js`, `materials/stellar.js`; the
interface of 063 § Materials)
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
Signature specs use 063's 14 families (`FAMILY_VOICES`, 063 § C) — no new voices. Each entry's
board mapping names its family in the spec; the family rule of 063 § C applies.

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | `card` missing from the registry | `slug` null → name match only; no name match → 063 path | [ ] select test |
| 2 | `attackName` empty/undefined | `normalizeAttackName` → `''` → no name match; strongest rule compares `''` → null | [ ] select test |
| 3 | `card.attacks` missing / not an array / all damage `''` | `strongestAttackName` → null → only name match plays | [ ] select test |
| 4 | tie on base damage | the later printed attack is the strongest | [ ] select test |
| 5 | printed damage `'30×'`, `'120+'`, `'50-'` | base damage 30, 120, 50 | [ ] select test |
| 6 | curly vs straight apostrophe (Nature’s Madness, Land’s Wrath) | both normalise to the same key | [ ] select test |
| 7 | a form slug not in the table (`arceus-fire`, `silvally-water`, `deoxys-attack`, `zacian-crowned`) | walks to the base slug | [ ] select test |
| 8 | a slug whose walk would cross species (`mewtwo`, `ho-oh`, `tapu-koko`) | exact keys win; `mewtwo` never walks to `mew` (no `-`) | [ ] select test |
| 9 | an explicit `null` form (`calyrex`, `moltres`) | null — no signature, no further walk | [ ] select test |
| 10 | name match on a non-owner (Darkrai DP24 "Roar of Time") | plays Roar of Time (Options 1) | [ ] select test |
| 11 | signature selected but its spec not shipped | falls through to 063's `moveFor`, then the lunge | [ ] wiring (manual) |
| 12 | zero damage dealt (prevented, or a status move by name) | the signature still plays; contact announced; no number | [ ] recording |
| 13 | Tag Team card (`Reshiram & Charizard-GX`) | resolver slug is `charizard` → no slug signature; name match still works | [ ] select test |
| 14 | attack against a Benched Pokémon (long lane) | geometry from 063: the scene reads on a long lane; recorded once per spec on a bench target | [ ] recording |
| 15 | opponent's seat (board turned 180°) | 063 § Both seats; recorded on both seats | [ ] recording |
| 16 | type-changing move on a Colorless card (Arceus, Silvally) | material `normal` | [ ] select test |
| 17 | Ogerpon mask forms | `ogerpon-hearthflame-mask → fire`, `-wellspring-mask → water`, `-cornerstone-mask → rock`, base → grass | [ ] select test |
| 18 | reduced motion | skipped like every transient attack scene (063 D105) | [ ] existing |
| 19 | a spec over the cost rule | `validateSpec` fails the specs test | [ ] specs test |
| 20 | two attacks in one batch | 063 queue: each scene plays in order inside the 3800 ms budget | [ ] existing |

## Test plan
- `signature-moves.test.mjs`: 81 rows; every `owners` entry, `vgType`, `statClass`, `material`
  valid; every `SIGNATURE_BY_SLUG` value is null or a key of `SIGNATURE_MOVES`; the six skipped
  self-status ids are absent; every move id reachable by slug or by name (all are by name).
- `signature-select.test.mjs`: rows 1–10, 13, 16, 17 of the edge table, plus one assertion per
  form override in `SIGNATURE_BY_SLUG` (`kyurem-black → freeze-shock`, …).
- `signature-specs.test.mjs`: every `SIGNATURE_SPECS` entry passes `validateSpec`, has tier `'S'`,
  its id is a `SIGNATURE_MOVES` key and its `vgType` matches; per shipped type file, every move of
  that type has a spec (the coverage grows slice by slice).
- `move-spec.test.mjs` (063's): tier `S` bands and the `status` class.
- Visual: 063 § Recording procedure per spec (both seats, one bench target), key frames checked
  against the Appendix S entry; probe median ≤ 17 ms, p95 ≤ 140 ms.

## Builder recipe — one signature spec
1. Open the move's Appendix S entry: `Signature read`, `Video beats`, `Palette`, `Board mapping`,
   `New pieces`, `Flags`. Open its sheets if on disk (refetch with `refs/064-study/fetch-sig.mjs`).
2. Copy the closest spec in `signature/specs/<type>.mjs`, else 063's `specs/<type>.mjs` entry
   named by `Closest generic`; set `id`, `name`, `vgType`, `statClass`, `tier: 'S'`, `family`,
   `material`.
3. `durationMs` = the entry's total clamped into `[1800, 2600]`; `contactMs` = its contact clamped
   into `[900, 1200]`, then into the 0.38–0.62 ratio.
4. Translate the board mapping beat by beat (063's vocabulary map + § New drawers). The
   `Signature read` image must be the largest shape on screen at its moment.
5. Colours: the material's palette; when the entry's palette differs from the type palette (Blue
   Flare is blue fire, Sacred Fire is rainbow-tinged gold, Freeze Shock is ice + electric), pass
   the entry's hex values as the drawer's `tint` param (§ New drawers) — never a new material.
6. Run the specs test; record both seats + a bench target; compare with the entry; commit
   `feature: design 064 <type> - <move>` with `flag:` lines for deviations.

## Migration / rollout
No data migration and no protocol change. Until a type's signature specs ship, its legendaries
play 063's generic move (or the lunge), so every slice is independently safe. Revert path: delete
the `signature/` folder and the three wiring lines; 063 is untouched.

## Work plan — slices ≤1 session, each leaving the repo green
Prerequisite: 063 slices 1–2 landed (selection, generic player, `move-spec.mjs`, materials index,
fire). A signature type slice also needs that type's material; if 063 has not shipped it yet, the
slice builds `materials/<type>.js` first exactly per 063 § Materials (that is 063's row for the
type, done early — note it under 063 § Deviations).

| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 | create `moves/signature/signature-moves.mjs`, `signature-select.mjs`, `specs/index.mjs` (`SIGNATURE_SPECS = Object.freeze({})`), `__tests__/signature-moves.test.mjs`, `signature-select.test.mjs`, `signature-specs.test.mjs`; modify `move-spec.mjs` (tier S, `status`, `normal`/`stellar` enums), `combat.js attack` (§ Wiring), `index.js soundPlanFor`, `rec-move.mjs` (`MOVE` looks in `SIGNATURE_SPECS` too) | § Data, § Selection, § Wiring exactly | `strongestAttackName([{name:'A',damage:'60'},{name:'B',damage:'120+'}]) → 'B'` · `([{name:'A',damage:'90'},{name:'B',damage:'90'}]) → 'B'` · `([{name:'A',damage:''}]) → null` · `baseDamage('30×') → 30` · `signatureForSlug('arceus-fire') → 'judgment'` · `('mewtwo') → 'psystrike'` · `('calyrex') → null` · `('kyurem-black') → 'freeze-shock'` · `('ogerpon-wellspring-mask') → 'ivy-cudgel'` · `('charizard') → null` · `signatureFor({name:'Darkrai',attacks:[]}, {attackName:'Roar of Time', slug:'darkrai'}) → {move:'roar-of-time', reason:'name'}` · `signatureFor({attacks:[{name:'Read the Wind',damage:''},{name:'Aero Dive',damage:'130'}]}, {attackName:'Aero Dive', slug:'lugia'}) → {move:'aeroblast', reason:'strongest'}` · same card, `attackName:'Read the Wind'` → null · `signatureMaterial('ivy-cudgel', {slug:'ogerpon-hearthflame-mask'}) → 'fire'` · `signatureMaterial('judgment', {card:{types:['Colorless']}}) → 'normal'` · `normalizeAttackName('Nature’s Madness') === normalizeAttackName("Nature's Madness")` · validateSpec: tier S 1800/900 ok, 2700 → error, contact 1300 → error, statClass 'status' with tier 3 → error | user's trigger rule (2026-10-08); Lugia V (Sword & Shield Promos) attacks from `out/pkmn-pokemon-cards.json` (Read the Wind, Aero Dive 130); Darkrai DP24 (corpus) | `node --test` on the three new tests + `move-spec.test.mjs`; `pnpm test:changed` green; a Lugia V Aero Dive still plays 063's path (no spec yet) |
| 2 | create `materials/normal.js`, `materials/stellar.js`, `materials/_units.js`; modify `materials/_shared.js` (`tintedPalette`, `lighten`), every existing `materials/<type>.js` (final optional `palette` arg), `materials/index.js`, `mat-fx.css` (`.fx-particle--zzz`, `.fx-particle--note`) | § New pieces A (tint/hues mechanism), C (`unit` list), F, G | materials test (063's recording-context pattern): each of normal/stellar draws ≥ 1 fill per function with only its palette colours; `tintedPalette({body:[1,2,3]}, {body:'#FF0000'}).body → [255,0,0]`; `lighten('#000000', 0.5) → '#808080'`; every unit draws without throwing at s ∈ {0, 0.5, 0.99}, balanced save/restore | Appendix S palettes of Judgment, Crush Grip, Multi-Attack, Tera Starstorm | tests green; a stub spec per material recorded once (sheets reviewed) |
| 3 | modify `move-poses.mjs`, `move-drawers.js`, `card-motion.mjs`, `move-player.js` (shade in the source-over group); tests `move-poses.test.mjs`, `card-motion.test.mjs` | § New pieces B, C, D, E | `fanPose(0.5, 100, {count:4, spread:360})` → 4 tongues 90° apart · `shadePose(0.1, 100, {r:0.9})` rx < 90 (growing) · `gripPose(0.7).curl ≈ 70` · `lunge` with `strikes 2`: two local maxima of `along` in [0.4 c, c], the last at c · `warp` scale 0.15 at 0.5 c · `stagger.lead 450`: first knock impulse at contact − 450 · `rear-lurch.hold 200` thrust starts 200 ms later than without · every drawer's `check` accepts `tint`, `hues`, `anchor`, rejects `anchor 'nowhere'` | 063 § Drawers conventions | tests green; 063's Fire Blast spec still matches its recording (no regression) |
| 4 | create `signature/specs/fire.mjs`, `grass.mjs`; modify `specs/index.mjs` | one MoveSpec per move: blue-flare, fusion-flare, magma-storm, sacred-fire, searing-shot, v-create, ivy-cudgel, seed-flare | specs test: 8 specs valid, tier S, material per § Options 4 | Appendix S Fire, Grass | recordings both seats + bench reviewed against each entry; probe within limits |
| 5 | create `specs/water.mjs`, `ice.mjs` | hydro-steam, origin-pulse, steam-eruption, surging-strikes, freeze-shock, glacial-lance, glaciate, ice-burn | same pattern | Appendix S Water, Ice | same |
| 6 | create `specs/electric.mjs` | bolt-strike, electro-drift, fusion-bolt, plasma-fists, thunder-cage, thunderclap, wildbolt-storm | same | Appendix S Electric | same |
| 7 | create `specs/ground.mjs`, `rock.mjs` | lands-wrath, precipice-blades, sandsear-storm, thousand-arrows, thousand-waves, diamond-storm, mighty-cleave | same | Appendix S Ground, Rock | same |
| 8 | create `specs/fighting.mjs`, `poison.mjs`, `fairy.mjs` | collision-course, sacred-sword, secret-sword, thunderous-kick, malignant-chain, fleur-cannon, natures-madness, springtide-storm | same | Appendix S Fighting, Poison, Fairy | same |
| 9 | create `specs/psychic.mjs` (first half) | freezing-glare, heart-swap, hyperspace-hole, luster-purge, mist-ball, mystical-power | same | Appendix S Psychic | same |
| 10 | modify `specs/psychic.mjs` (second half) | photon-geyser, prismatic-laser, psyblade, psycho-boost, psystrike | same; Psychic coverage complete | Appendix S Psychic | same |
| 11 | create `specs/flying.mjs`, `steel.mjs` | aeroblast, bleakwind-storm, dragon-ascent, oblivion-wing, behemoth-bash, behemoth-blade, doom-desire, double-iron-bash, sunsteel-strike, tachyon-cutter | same | Appendix S Flying, Steel | same |
| 12 | create `specs/dragon.mjs` | core-enforcer, dragon-energy, dynamax-cannon, eternabeam, nihil-light, roar-of-time, spacial-rend | same | Appendix S Dragon (Nihil Light's entry is from memory: build it as written, flag it) | same |
| 13 | create `specs/dark.mjs`, `ghost.mjs`, `normal.mjs` | dark-void, fiery-wrath, hyperspace-fury, ruination, wicked-blow, astral-barrage, moongeist-beam, shadow-force, spectral-thief, crush-grip, judgment, multi-attack, relic-song, techno-blast, tera-starstorm | same; every `SIGNATURE_MOVES` id now has a spec | Appendix S Dark, Ghost, Normal | same; then the user's look pass over all 81 (one sheet each) and the DECISIONS lines below |

DECISIONS lines at landing (D-numbers assigned then): signature trigger = name match, else the
legendary's strongest attack (user, 2026-10-08); tier S 1800–2600 ms with contact ≤ 1200 ms
(hold and queue budget unchanged); `normal` and `stellar` materials; drawer `tint`/`hues`/
`anchor`/`unit` extensions. No new dependency.

## Deviations (Builder appends here during build)

## Appendix S — per-move study entries
<!-- APPENDIX-S -->
