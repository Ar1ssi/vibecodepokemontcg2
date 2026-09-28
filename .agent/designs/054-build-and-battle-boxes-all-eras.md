# 054: Build & Battle boxes of every era (XY kits → SM → SWSH → SV → ME)
Status: approved (self — one-shot, 2026-09-28; the user's "one shot this implementation in the same
branch" — Land: branch `claude/build-battle-boxes-plan-38pf0r`). Read the slices with § Deviations applied.
Date: 2026-09-28 · Builds on designs 051 (box, packs, format), 052 (unboxing scene), 053 (room format)

## Problem
Build & Battle today is one box: Phantasmal Flames (me02), four fixed 40-card decks, ME-era packs.
The user wants every other Build & Battle Box (and the Prerelease Kits the line grew out of), with
each era's real contents and pack structure, and every pack — Phantasmal Flames included — rolling
the boosted 30th Celebration pull rates. What differs per era is the box contents (a 23-card
Evolution pack assembled from groups and random Trainers vs a fixed deck) and the pack anatomy
(rarities, hit slots); the play rules (40 cards, 4 Prizes) are the same in every era (§ Research 2).

## Research (read 2026-09-28; every fact carries its source)
### 1. The product line
- Introduced as the **Prerelease Kit** ahead of XY—Fates Collide (2016); renamed **Build & Battle
  Box** at SM—Forbidden Light (June 2018, first sold at retail). Released alongside every main
  expansion since; never for a special set (no Shining Fates, Celebrations, Crown Zenith, Pokémon GO,
  151, Paldean Fates, Prismatic Evolutions, Ascended Heroes).
  Source: https://bulbapedia.bulbagarden.net/wiki/Build_%26_Battle_Box_(TCG) (composition + list).
- Contents changed twice (same page, "Composition"):
  1. **Fates Collide → Fusion Strike**: a 23-card *Evolution pack* + 4 booster packs, no Energy. The
     pack = the promo (inside the 23) + the promo's Pokémon group + one of the other three groups
     + random Supporters/Trainers from a small pool (no more than 2 copies of one card).
  2. **Brilliant Stars (Feb 2022) → Destined Rivals**: the same Evolution pack plus 17 Basic Energy,
     "making it a ready-to-play 40-card deck"; a deck-building tip sheet; a Live code card.
  3. **Mega Evolution (Sep 2025) →**: "each 40-card deck is completely predetermined, built around
     the included promotional card" — four fixed decks, one per promo (what 051 built).
- The Evolution pack was always 23 cards (every per-box page from Fates Collide to Fusion Strike).
- Promo numbering: unique Black Star promo numbers, except **Evolutions** (XY) and **Destined
  Rivals** (SV), whose four promos are stamped set-numbered cards.
- Worked group examples (Bulbapedia per-box pages, "Box structure"):
  - Team Up: Charizard group 9 + Zapdos group 10 + promo 1 + 3 random Supporters = 23 (4 Supporters
    with other pairings); Supporter pool = Copycat, Cynthia, Hau, Kahili, Lillie, Looker, Professor
    Kukui. https://bulbapedia.bulbagarden.net/wiki/Team_Up_Build_%26_Battle_Box_(TCG)
  - Battle Styles: Octillery group 9 + Houndoom group 9 + promo 1 + 4 Supporters = 23; pool = Hop,
    Professor's Research, Dan, Sonia, Allister, Opal.
    https://bulbapedia.bulbagarden.net/wiki/Battle_Styles_Build_%26_Battle_Box_(TCG)
  - Brilliant Stars: four groups + "six random Supporter cards" + 17 Energy.
    https://bulbapedia.bulbagarden.net/wiki/Brilliant_Stars_Build_%26_Battle_Box_(TCG)
  - Chaos Rising (ME): four full decklists; Energy count varies per deck (Delphox 11 Fire; Goodra
    6 Psychic + 5 Water). https://bulbapedia.bulbagarden.net/wiki/Chaos_Rising_Build_&_Battle_Box_(TCG)
- URL pattern for every box's lists: `…/wiki/<Expansion>_Prerelease_Kit_(TCG)` (Fates Collide →
  Ultra Prism) and `…/wiki/<Expansion>_Build_%26_Battle_Box_(TCG)` (Forbidden Light →).
- Build & Battle Stadium (Evolving Skies → Paradox Rift): two boxes + extra packs + Energy + dice in
  one product; no new rules or lists, so it is not a box here (PokéBeach: discontinued after
  Paradox Rift). https://www.pokebeach.com/2024/03/temporal-forces-set-guide-card-list-secret-rares-cut-cards-products-and-more

### 2. Play rules (Limited format) — identical in every era
- Play! Pokémon TCG Rules & Formats, May 2017: "Each player's deck must contain exactly 40 cards at
  all times. Matches are played for 4 Prize cards." "Decks may contain more than 4 copies of a single
  card… with the exception of cards which are limited to one per deck by card text." Organizers
  supply Basic Energy. https://media.pocketmonsters.net/pdf/Play!%20Pokemon%20TCG%20Rules%20&%20Formats%20-%20May%202017.pdf
- Tournament Rules Handbook, 2024-05-15, § 5.5 (Sealed, Build & Battle Draft): same 40 / 4, no copy
  limit except card text, Basic Energy from the Organizer. https://www.organizedplay.nl/pdf/tcg-tournament-rules-handbook.pdf
- ME era: "40-card decks with four Prize cards" (Delta Reign event post,
  https://pokemonblog.com/2026/09/28/pokemon-tcg-mega-evolution-delta-reign-prerelease-events-begin-oct-24/).
- Pokémon TCG Live "Build & Battle" (2026-05-21, Chaos Rising): 40-card seed deck + 4 packs, 4
  Prizes; more than 4 copies allowed except ACE SPEC and Radiant (one each).
  https://community.pokemon.com/en-us/discussion/24044/build-battle-is-coming-to-pokemon-tcg-live
- So the one rule 051 got wrong for *every* era is the copy limit: 051 enforces Standard's 4; the
  Limited format has none beyond card text (ACE SPEC, Radiant, Prism Star per name — already
  enforced by `deck-validation.mjs:104-112` for all formats). § Options 4.

### 3. Roster (release order; promos as printed; TCGdex ids in § Design → Data)
XY Prerelease Kits (3): Fates Collide (XY127 Moltres, XY128 White Kyurem, XY129 Zygarde, XY130
Tyranitar) · Steam Siege (XY144 Yanmega, XY145 Volcanion, XY146 Clawitzer, XY147 Hoopa) · Evolutions
(set-numbered 11/108 Charizard, 34/108 Gyarados, 51/108 Mewtwo, 59/108 Machamp).
SM (12): Sun & Moon (SM10 Shiinotic, SM11 Bruxish, SM12 Passimian, SM13 Oranguru) · Guardians Rising
(SM18 Alolan Sandslash, SM19 Oricorio, SM20 Mudsdale, SM21 Drampa) · Burning Shadows (SM46 Seviper,
SM47 Crabominable, SM48 Zygarde, SM49 Bewear) · Crimson Invasion (SM72 Alolan Raichu, SM73 Salazzle,
SM74 Regirock, SM75 Registeel) · Ultra Prism (SM94 Wash Rotom, SM95 Lucario, SM96 Heatran, SM97
Gumshoos) · Forbidden Light (SM115 Pheromosa, SM116 Xurkitree, SM117 Malamar, SM118 Lycanroc) ·
Celestial Storm (SM129 Kyogre, SM130 Manectric, SM131 Celesteela, SM132 Delcatty) · Lost Thunder
(SM149 Suicune, SM150 Raikou, SM151 Giratina, SM152 Tapu Lele) · Team Up (SM158 Charizard, SM159
Zapdos, SM160 Nidoqueen, SM161 Jirachi) · Unbroken Bonds (SM179 Volcanion, SM180 Stakataka, SM181
Melmetal, SM182 Persian) · Unified Minds (SM202 Amoonguss, SM203 Tapu Fini, SM204 Necrozma, SM205
Terrakion) · Cosmic Eclipse (SM218 Buzzwole, SM219 Entei, SM220 Phione, SM221 Blacephalon).
SWSH (12): Sword & Shield (SWSH006 Rillaboom, 007 Frosmoth, 008 Galarian Perrserker, 009 Cinccino) ·
Rebel Clash (022 Flapple, 023 Luxray, 024 Coalossal, 025 Garbodor) · Darkness Ablaze (035 Decidueye,
036 Arctozolt, 037 Hydreigon, 038 Kangaskhan) · Vivid Voltage (066 Charizard, 067 Donphan, 068
Snorlax, 069 Lugia) · Battle Styles (088 Cherrim, 089 Octillery, 090 Houndoom, 091 Bronzong) ·
Chilling Reign (112 Cinderace, 113 Inteleon, 114 Cresselia, 115 Passimian) · Evolving Skies (122
Flaaffy, 123 Galarian Articuno, 124 Galarian Zapdos, 125 Galarian Moltres) · Fusion Strike (168
Oricorio, 169 Pyukumuku, 170 Deoxys, 171 Latias) · Brilliant Stars (185 Moltres, 186 Lucario, 187
Liepard, 188 Bibarel — first with 17 Energy) · Astral Radiance (205 Hisuian Basculegion, 206 Wyrdeer,
207 Hisuian Samurott, 208 Magnezone) · Lost Origin (240 Finneon, 241 Gengar, 242 Comfey, 243
Machamp) · Silver Tempest (269 Sunflora, 270 Rapidash, 271 Kirlia, 272 Archeops).
SV (10): Scarlet & Violet (SVP 005 Quaquaval, 006 Pawmot, 007 Hawlucha, 008 Revavroom) · Paldea
Evolved (019 Baxcalibur, 020 Tinkaton, 021 Murkrow, 022 Pelipper) · Obsidian Flames (036 Palafin, 037
Cleffa, 038 Togekiss, 039 Mawile) · Paradox Rift (057 Chi-Yu, 058 Iron Bundle, 059 Xatu, 060
Aegislash) · Temporal Forces (089 Feraligatr, 090 Metang, 091 Koraidon, 092 Miraidon) · Twilight
Masquerade (115 Thwackey, 116 Infernape, 117 Froslass, 118 Tatsugiri) · Stellar Crown (133 Ledian,
134 Crabominable, 135 Drifblim, 136 Bouffalant) · Surging Sparks (151 Gouging Fire, 152 Chien-Pao,
153 Magneton, 154 Indeedee) · Journey Together (181 N's Darmanitan, 182 Iono's Kilowattrel, 183
Lillie's Ribombee, 184 Hop's Snorlax) · Destined Rivals (set-numbered 034/182 Ethan's Typhlosion,
049/182 Misty's Gyarados, 087/182 Team Rocket's Mimikyu, 096/182 Team Rocket's Tyranitar).
ME (4 more + 1 built): Mega Evolution (MEP 001 Meganium, 002 Inteleon, 003 Alakazam, 004 Lunatone) ·
Phantasmal Flames (014–017, built) · Perfect Order (064 Serperior, 065 Barbaracle, 066 Tyrantrum,
067 Doublade) · Chaos Rising (074 Delphox, 075 Ampharos, 076 Crobat, 077 Goodra) · Pitch Black (082
Miraidon, 083 Slowbro, 084 Dhelmise, 085 Bastiodon). Delta Reign (Nov 2026: Masquerain, Magmortar,
Enamorus, Kommo-o) has no MEP numbers or lists yet → excluded until published (§ Edge case 30).
Sources: the Bulbapedia box page (list table), each per-box page, and the promo-set pages
(SM / SWSH / SVP / MEP Black Star Promos). Total: 41 boxes to add (3 + 12 + 12 + 10 + 4).

### 4. 30th Celebration rates ("boosted") — the profile every pack uses
- The set: "30th Celebration" (Mega Evolution series, released 2026-09-16; 128 + 33 secret + 30
  Classic Collection + 8 Energy). Its packs are **5 foil cards** with a guaranteed Pikachu Rare, one
  foil Basic Energy outside the five, no Uncommons, no reverse slot — a different pack, not a boosted
  ME pack. https://www.pokebeach.com/2026/09/30th-celebration-english-set-guide-full-card-list-products-store-promotions-and-more
- No official odds exist ("boosted" is press wording: PokéBeach "friendliest pull rates of the modern
  era"). Community samples, per pack:
  | Rarity | TCGplayer 3,000 packs (PokéBeach) | 6,500 packs (SI) | 4,063 (PCEnthusiast) | 652 (tcgtalk) | 750 (pullrates) |
  |---|---|---|---|---|---|
  | Double Rare (ex) | – | 1 in 4 | – | 21.9 % | 22.7 % |
  | Illustration Rare | 1 in 5 | 1 in 5 | ~1 in 5 | 18.4 % | 17.9 % |
  | Classic Collection | 1 in 10 | 1 in 10 | ~1 in 10 | 9.8 % | 9.5 % |
  | Special Illustration Rare | 1 in 21 | 1 in 20 | 1 in 18–20 | 5.5 % | ~5 % |
  | Futuristic Rare (top tier) | 1 in 120 | 1 in 117 | ~1 in 100 | 1.2 % | ~1 in 103 |
  Sources: https://www.pokebeach.com/2026/09/30th-celebration-pull-rates-and-most-valuable-cards-worldwide-friendliest-pull-rates-of-the-modern-era ·
  https://www.si.com/collectibles/how-pokemon-30th-celebration-pull-rates-card-prices ·
  https://thepcenthusiast.com/pokemon-30th-celebration-pull-rates/ · https://tcgtalk.com/guides/30th-anniversary-pull-rates ·
  https://pullrates.com/set/30th-anniversary
- Normal ME rates for comparison (tcgprotectors 10,000 Phantasmal Flames packs, what 051 baked):
  Double Rare 20.1 %, Ultra Rare 8.06 %, IR 10.97 %, SIR 1.25 %, MHR 0.079 %.
  https://tcgprotectors.com/blogs/pokemon-blog/phantasmal-flames-pull-rates-10000-packs-analyzed-hits-or-misses
- Reading of the ask (§ Options 5): keep each era's 10-card pack anatomy and put the 30th
  Celebration *per-pack hit chances* on it: an ex-class hit in 25 % of packs, an illustration-class
  in 20 %, a special-illustration-class in 5 %, the era's top tier in 1 %.

### 5. Booster anatomy per era (English packs)
| Era | Game cards | C | U | Reverse slots | Rare slot holds | Extra |
|---|---|---|---|---|---|---|
| XY (kits: xy10–xy12) | 10 | 5 | 3 | 1 | Rare / holo / EX / BREAK / full art / secret | code card |
| SM (sm1–sm12) | 10 | 5 | 3 | 1 | Rare / holo / GX / Prism Star / full art / rainbow / gold | + 1 Basic Energy (11th card), code card |
| SWSH (swsh1–swsh8) | 10 | 5 | 3 | 1 | Rare / holo / V / VMAX / VSTAR / full art / rainbow / gold | + Energy, code card |
| SWSH from Brilliant Stars (swsh9–swsh12) | 10 | 5 | 3 | 1, **reverse or Trainer Gallery** | + Radiant (ASR →) | + Energy, code card |
| SV (sv01–sv10) | 10 | 4 | 3 | 2: #1 reverse (**or ACE SPEC**, TEF →); #2 reverse **or IR / SIR / Hyper** | holo Rare / Double rare / Ultra Rare | + Energy, code card |
| ME (me01–me05) | 10 | 4 | 3 | 2: #1 reverse; #2 reverse **or IR / SIR** | Rare / Double rare / Ultra Rare / Mega Hyper Rare | + Energy, code card |
Sources: PokéBeach 2017 "Sun & Moon booster packs reintroducing 11 cards" (5 C, 3 U, 1 reverse, 1
rare, the Energy as the 11th card) https://www.pokebeach.com/2017/01/sun-moon-booster-packs-reintroducing-11-cards-new-reverse-holo-style ;
Bulbapedia "Booster pack" (Energy "in addition to the 10 other cards" since SM)
https://bulbapedia.bulbagarden.net/wiki/Booster_pack_(TCG) ; SWSH: DigitalTQ Lost Origin / Brilliant
Stars ("10 cards, 1 energy card and a code card", one reverse, one rare; 5 commons inferred), TCGplayer
Astral Radiance / Lost Origin / Silver Tempest ("Trainer Gallery card in the Reverse-Holo slot", Radiant
in the rare slot); SV: PokéBeach 2023 "Scarlet & Violet booster pack configuration finally revealed"
(4 C, 3 U, 2 reverse, 1 holo; IR/SIR take the second reverse slot)
https://www.pokebeach.com/2023/03/scarlet-violet-booster-pack-configuration-finally-revealed-major-exciting-changes ,
TCGplayer Temporal Forces pull rates (ACE SPEC in the first reverse slot; Hyper in the second)
https://www.tcgplayer.com/content/article/Pok%C3%A9mon-TCG-Temporal-Forces-Pull-Rates/28c0ad22-00a4-428f-b22d-e7fee9ec50bc/ ;
ME: TCGplayer Phantasmal Flames / Perfect Order (IR/SIR in the second reverse slot; DR/UR in the rare
slot). The XY row reuses the SM layout (same 10-card anatomy without the Energy card; the kits' sets
predate it) — not separately sourced, pinned as the SM model.
- **Measured baseline rates the boosted profile replaces** (per pack, "any card of that rarity";
  TCGplayer Authentication Center, 8,000+ packs per set unless noted; article ids in the URL pattern
  `tcgplayer.com/content/article/<slug>/<uuid>/`): SV base DR 13.8 %, UR 6.6 %, IR 7.7 %, SIR 3.2 %,
  Hyper 1.9 % (a7702fce); Temporal Forces DR 16.8 %, UR 6.7 %, ACE SPEC 5.0 %, IR 7.7 %, SIR 1.2 %,
  Hyper 0.7 % (28c0ad22); Surging Sparks DR 16.9 %, UR 6.7 %, ACE SPEC 5.0 %, IR 7.7 %, SIR 1.15 %,
  Hyper 0.5 % (6ccfb6ab); Mega Evolution DR 20.9 %, UR 8.2 %, IR 10.9 %, SIR 1.0 %, MHR 0.08 %
  (40cbeedc); Phantasmal Flames DR 20.8 %, UR 8.1 %, IR 11.0 %, SIR 1.25 %, MHR 0.08 % (9abae60d);
  Perfect Order DR 21.0 %, UR 8.5 %, IR 11.2 %, SIR 1.2 %, MHR 0.06 % (73148119). SWSH: Astral
  Radiance V 12.8 %, VMAX/VSTAR 3.5 %, full-art V 2.1 %, full-art Trainer 1.1 %, rainbow 1.3 %, gold
  0.8 %, Trainer Gallery 12.6 % (10da749f); Lost Origin V 11.6 %, VMAX/VSTAR 4.4 %, Radiant 5.0 %,
  TG 12.3 % (of which non-V 8.3 %, V/VMAX/Trainer 3.2 %, gold-black VMAX 0.9 %) (ba20ac4d); Silver
  Tempest similar (6490d591); Evolving Skies V 1 in 9, VMAX 1 in 18, full art 1 in 36, alt-art V 1 in
  91, rainbow 1 in 118, gold 1 in 109 (6a743d7b). SM (weak data, Flipside 720-pack Ultra Prism
  review): GX ≈ 1 in 12, full art ≈ 1 in 23, secret ≈ 1 in 55, Prism Star ≈ 1 in 11
  https://flipsidegaming.com/blogs/pokemon-blog/a-review-of-rarity-in-ultra-prism . XY: none found.
- **TCGdex rarity vocabulary** (interfaces.d.ts of tcgdex/cards-database, and per-card files read
  2026-09-28): `Common`, `Uncommon`, `Rare`, `Rare Holo` / `Holo Rare`, `Ultra Rare`, `Secret Rare`,
  `Holo Rare V`, `Holo Rare VMAX`, `Holo Rare VSTAR`, `Radiant Rare`, `Amazing Rare`, `Double rare`,
  `Illustration rare`, `Special illustration rare`, `Hyper rare`, `ACE SPEC Rare`, `Mega Hyper Rare`,
  `Shiny rare`, `Shiny Ultra Rare`, `Black White Rare`, `Mega Attack Rare`, `Promo`. **TCGdex merges
  tiers**: SM regular GX and full-art GX are both `Ultra Rare` (sm12-156 vs sm12-221); rainbow, gold
  and alt-art VMAX are all `Secret Rare` (sm12-250, sm12-265, swsh7-215); SM Prism Star cards are
  `Rare` (sm5-136); SWSH non-V holos are `Rare` (holo-ness lives in `variants`, not `rarity`); Trainer
  Gallery cards are separate sets `swsh9tg`, `swsh10tg`, `swsh11tg`, `swsh12tg` with rarities `Rare`
  (non-V) and `Ultra Rare` (V/VMAX/Trainer/gold-black). Secret cards are the ones whose numeric
  localId exceeds the set's official count (`cardCount.official`). Card ids: `<setId>-<localId>`;
  SV/ME pad to 3 digits (`sv08-057`), early SM/SWSH do not (`swsh7-215`, `sm12-1`), later SWSH files
  do (`swsh10-046`) → the generator matches localIds numerically against the fetched set list.
- TCGdex set ids: XY `xy10` Fates Collide, `xy11` Steam Siege, `xy12` Evolutions, `xyp`; SM `sm1`…
  `sm12` (`sm3.5` Shining Legends, `sm7.5` Dragon Majesty, `sm115` Hidden Fates), `smp`; SWSH `swsh1`…
  `swsh12` (`swsh3.5`, `swsh4.5`, `swsh10.5`, `swsh12.5`; TG `swsh<n>tg`), `swshp`; SV `sv01`…`sv10`
  (`sv03.5`, `sv04.5`, `sv06.5`, `sv08.5`, `sv10.5b`, `sv10.5w`), `svp`, `sve`; ME `me01`…`me05`,
  `me02.5`, `mep`. (Read from the TCGdex data repo `data/<Series>/<Set>.ts`; the API was unreachable.)

## Constraints
- No build step, no new dependency, same-origin tabs, `postMessage` validated (PROJECT.md, D183).
- Set data is baked and looked up, never recalled (D186, CLAUDE.md rule 7): every card row comes
  from TCGdex through the generator; every decklist/group line names its Bulbapedia page.
- The generator needs TCGdex and Bulbapedia. This cloud sandbox cannot reach either (curl → 403
  from the network policy, 2026-09-28); WebFetch allow rules exist on main (0cf0f0a). **Data slices
  run where `node scripts/generate-build-battle-box.mjs` can fetch** (a local or Remote Control
  session, or the user runs the generator and commits its output).
- One seed = one box, bit for bit (D186): every random choice of a box — deck/group pairing, random
  Trainers, packs, pack art — comes from the one `createRng(seed)` stream in a fixed order.
- Engine and format untouched: `deckFormat: 'build-battle'` stays the one Limited format (4 Prizes,
  D187/D190/D191); a room agreed on Build & Battle accepts any box.
- Client payload: 41 sets × ~150–250 cards cannot be one eager module (me02 alone is 115 KB with
  image URLs). Per-set modules loaded on demand, ≤ 60 KB each (§ Options 2).
- Every engine/state change ships with a failing-first test; visual work is checked by the recorder
  and the user on localhost (CLAUDE.md § Code standard).
- Old-era cards may have attack/ability text the rules engine does not implement; they play as they
  do in Standard today (manual, rules-bridge "no effect"), not this design's scope (§ Edge case 28).

## Current state (read this session)
- `core/build-battle/box-catalog.mjs`: `BUILD_BATTLE_BOXES` = one box (`phantasmal-flames`, setId
  `me02`, `packCount: 4`, `packModel: ME_PACK_MODEL`, four decks `{key,name,promoId,energy,sprites}`),
  `getBuildBattleBox(key)`, `BASIC_ENERGY_LABELS`. `ME_PACK_MODEL` = 10 cards: 4 Common, 3 Uncommon,
  1 reverse, 1 reverse-or-IR/SIR (IR 0.1097, SIR 0.0125), 1 rare slot (DR 0.201, UR 0.0806, MHR
  0.0008, Rare rest).
- `pack-opening.mjs`: `openPack({cards, packModel, rng})` (slot → rarity → card, no duplicate ids,
  fallbacks Rare → whole set), `openBox({box, cards, rng})` → `{deckKey, packs}` (deck =
  `rng.int(decks.length)`), `poolFromBox({box, decks, cards, opened})` (deck rows + pack cards, Basic
  Energy dropped).
- `build-battle-session.mjs`: `Session {version:1, boxKey, seed, deckKey, packs, unboxing, deckId,
  unsavedDeck, createdAt}`; `parseSession` imports `BUILD_BATTLE_SET_CARDS` eagerly and refuses pack
  ids outside `box.setId`'s set (`:94-102`); `validatePoolDeck`, `canAddFromPool`, `parseSeed`,
  `randomSeed`.
- `build-battle.generated.mjs` (115 KB): `BUILD_BATTLE_SET_CARDS = { me02: SetCard[] }`,
  `BUILD_BATTLE_DECKS = { 'phantasmal-flames': { ceruledge: DeckRow[], … } }`. Written by
  `scripts/generate-build-battle-box.mjs` (`SET_ID`, `BOX_KEY`, `DECK_SOURCES` as decklist lines;
  `--check` in `pnpm test:live`) over `scripts/lib/decklist-lines.mjs` (`SET_MAP` of 17 set codes,
  `TRAINER_IDS`, `parseLine`, `fetchCard(id, expectedName)` throws on a name mismatch, `fetchSet`,
  `normalizeCard`, `resolveDeck`). Promo images: TCGdex has none for MEP → Limitless CDN fallback.
- `unboxing.mjs`: `TIER_BY_RARITY` (ME rarities only → tiers 1–3), `HOLO_PRINT_RARITIES = {Rare,
  Promo}`, `unboxingHoloRarity`, `packSlotKind`, `PACK_ARTS = ['charizard','gengar','heracross',
  'lopunny']` with `packArtIndexes(rng, count)` on its own stream (`seed ^ 0x9e3779b9`).
  `holo.mjs RARITY_EFFECTS` already maps the old-era TCGdex strings (Holo Rare, Ultra Rare, Rainbow
  Rare, Secret Rare, Shiny…, Radiant Rare, Amazing Rare, ACE SPEC Rare, Rare BREAK, LEGEND…).
- `box-textures.mjs`: `BOX_FACE_TEXTURES` front/left cut from the me02 render, `PROCEDURAL_FACES`,
  `packArtSrc(key)` → `src/assets/build-battle/packs/me02-<key>.webp`. Vendored: 4 pack fronts
  (~200 KB each) + 2 box faces.
- `sidebox/native-deck-builder-build-battle.js` (489 lines): `const BOX = BUILD_BATTLE_BOXES[0]`
  (`:49`), set cards/decks read from the generated module (`:118-119`), `openNewBox` (`:202-209`),
  sealed screen text names Phantasmal Flames (`:294`), headline via `boxHeadline`.
- `sidebox/native-deck-builder-unboxing.js` (1316 lines): `SET_LOGO_URL`, `KEY_ART_URL` (me02
  literals, `:84-85`), `setLogo()` prints "Mega Evolution / Phantasmal Flames" (`:179-182`),
  `proceduralBack()` bullets (`:218-224`), tray labels "40-card deck" / "Foil promo" (`:537, :551`),
  pack art by `PACK_ARTS` index (`:558`). CSS palette `--bb-*` tokens in
  `css/deck-builder-unboxing.css:13-25` (one block).
- `deck-validation.mjs`: `BUILD_BATTLE_DECK_RULES = { deckSize 40/40, maxCopiesPerCard: 4 }`; ACE
  SPEC / Radiant / Prism Star limits counted for every format (`:100-112`).
- Room format (053): `room-format.mjs` state `{format, proposal}` with format ∈ `DECK_FORMAT_VALUES`;
  accepting Build & Battle opens the box tab. No notion of a box.
- Sprites: `pokemon-sprite-catalog.generated.mjs` (1131 slugs, all gens; Alolan forms absent, e.g.
  `alolan-ninetales`); `box-catalog.test.mjs` requires every listed slug to exist.
- Recorder: `.claude/skills/fx-preview/rec/rec-unboxing.mjs` (`SEED`, `CARD_IMG` stand-in for blocked
  hosts) drives the scene for one box.
- Corpora `out/pkmn-*-cards.json` hold only engine-relevant cards (no rarity, no ids) — not a data
  source for boxes; TCGdex is (as 051).

## Options
1. **Box contents model.** A) three box kinds as data (`fixed-decks`, `evolution-pack`,
   `evolution-deck`) with one `openBox`; B) one kind by pre-expanding every group pairing into fixed
   "decks" (3 pairings × 4 promos = 12 decks per box) — no random Trainers, wrong contents; C) per-era
   modules with their own openers — three code paths to test. **Pick A**: the random Trainers and the
   pairing are what make a real box; one opener with a `kind` switch keeps 051's tests valid.
2. **Data packaging.** A) keep one eager generated module (≈ 6–8 MB for 42 sets) — kills the tab's
   load; B) one module per set (`sets/<setId>.generated.mjs`, default export) and one per box
   (`boxes/<boxKey>.generated.mjs`), loaded with `import()` when a box is chosen or a session
   restored, rows without derivable image URLs (TCGdex pattern from `tcgdex-image-url.mjs`) — ~25–45
   KB per set; C) fetch TCGdex live at box open — offline/sandbox breaks, violates D186. **Pick B.**
   Dynamic `import()` needs no build step; the catalog stays eager (names, promos, kinds).
3. **Pull rates.** A) each era's measured rates (Cosmic Eclipse, Evolving Skies, Obsidian Flames
   samples) — what 051 did for me02; B) one boosted profile, 30th Celebration per-pack chances,
   applied to every pack; C) B plus a per-box toggle back to A. **Pick B** (the user's ask, "every
   pack including Phantasmal Flames"); A's numbers are recorded in § Design → Pack models as the
   documented baseline, and the profile is one constant, so C is a one-line follow-up if wanted.
4. **Copy limit.** A) keep 051's 4-copies rule for Build & Battle; B) the Limited rule: no limit but
   card text (ACE SPEC, Radiant, Prism Star), `maxCopiesPerCard: null`. **Recommend B** — it is the
   printed rule in every era (§ Research 2) and the pool caps copies anyway (a pack pool rarely holds
   5 of anything; Basic Energy is already unlimited, D188). **User pick** — a rules change; the plan
   assumes B and slice 1 carries the change with its test; if the user keeps A, strike row 12 and the
   `maxCopiesPerCard` edit.
5. **"30th anniversary rates" reading.** A) literally the 30th Celebration pack (5 foil cards, a
   Pikachu, no reverse) for every set — breaks the 4 × 10 = 40 pool every era's box gives and puts
   Pikachu Rares in sets that have none; B) the 30th per-pack hit chances on each era's own 10-card
   anatomy, mapped by class (ex-class 25 %, illustration-class 20 %, special-illustration 5 %, top 1 %).
   **Pick B**, stated to the user; A is not what a Build & Battle box holds.
6. **Art per box.** A) vendor official pack fronts and box faces for 41 boxes (≈ 164 pack images ×
   ~80–200 KB = 13–33 MB) — too heavy and needs frames the user must supply; B) procedural pack fronts
   and box faces per era (the 052 procedural fallbacks, already built) skinned with the set's TCGdex
   logo, symbol and a key card's art, palette tokens per era; C) B by default, vendored art where a
   box has it (me02 keeps its files). **Pick C.** Adding art for a box later is a `skin` row.
7. **Random Trainers draw.** A) with replacement, third copy redrawn (matches "no more than 2 copies
   of any one card"); B) without replacement (max 1) — contradicts the source. **Pick A.**
8. **Session compatibility.** A) bump `version` to 2 and drop v1 sessions; B) keep `version: 1`,
   fields added are optional and v1 (me02) sessions still parse — `groupKeys`/`trainerIds` absent
   means a fixed-decks box. **Pick B**: nothing the user opened is lost.
9. **Box choice in the room.** A) each player opens any box (formats meet at the deal as today); B)
   the room proposal names a box so both open the same set. **Pick A** now; B is a follow-up issue
   (the format panel already exists, a `boxKey` on the proposal is small but it is netcode).
10. **XY kits.** A) in scope as the last data slice (engine knows BREAK, Mega EX, Ancient Traits;
    TCGdex has xy10/xy11/xy12); B) out. **Pick A, optional slice 8** — the user said "each
    generation"; the kits are the same product under its first name.

## Design
### Data model (`core/build-battle/box-catalog.mjs`, hand-kept, eager)
```
Era        = 'xy' | 'sm' | 'swsh' | 'sv' | 'me'
BoxKind    = 'fixed-decks' | 'evolution-pack' | 'evolution-deck'
BoxDeck    = { key, name, promoId, energy: BasicEnergyLabel|null, sprites: string[] }   // as 051
Box        = { key, name, shortName, era, setId, promoSetId, kind, packCount: 4,
               packModelKey: PackModelKey, decks: BoxDeck[4], energyCount: 0|17,
               skin: BoxSkin, sources: { box: url, packs: url } }
BoxSkin    = { setLogo: url|null, setSymbol: url|null, keyArtCardId: string|null,
               palette: 'xy'|'sm'|'swsh'|'sv'|'me', packArtCardIds: string[4],
               vendored: { box: boolean, packs: boolean } }
BUILD_BATTLE_BOXES: Box[] in release order; BUILD_BATTLE_ERAS = [{ key, name, boxKeys }];
getBuildBattleBox(key); boxesForEra(era); DEFAULT_BOX_KEY = 'phantasmal-flames'.
```
`energyCount` is 17 for `evolution-deck` boxes (Brilliant Stars → Destined Rivals) and 0 otherwise;
`decks[i].energy` is the group's Basic Energy label (the type the printed box shipped, from the
Bulbapedia page; null when the group is dual-type and the page names two — then `energyCount` splits
per the page in the box source file). `promoSetId`: `xyp` | `smp` | `swshp` | `svp` | `mep`, or the
expansion's own set id for Evolutions and Destined Rivals.

### Generated data (`core/build-battle/sets/<setId>.generated.mjs`, `boxes/<boxKey>.generated.mjs`)
- `sets/<setId>.generated.mjs`: `export default SetCard[]` sorted by localId;
  `SetCard = { id, name, supertype, localId, rarity, category, stage|null, types: string[],
  hp|null, image?: url }` — `image` only when the TCGdex pattern
  (`tcgdex-image-url.mjs` → `assets.tcgdex.net/en/<series>/<setId>/<localId>/high.webp`) is not
  reachable at generation (`--check` HEAD ≠ 200) and a Limitless URL is (as 051 slice 1 did for MEP).
  `set.name`/`releaseDate` live once per module: `export const SET = { id, name, releaseDate, series }`.
  Every row's `rarity` is TCGdex's string verbatim; the generator fails when a row has none.
  `SET.official` = TCGdex `cardCount.official` (secret detection, § Pack models). For Brilliant
  Stars → Silver Tempest the generator also fetches `<setId>tg` and appends its rows with
  `subset: 'tg'` (localId `TG01`…, never secret); every other row has no `subset`. Lines and pack
  draws match a localId numerically (`Number(localId)`), never by padded string (§ Research 5).
- `boxes/<boxKey>.generated.mjs`: `export default BoxData` where
  `BoxData = { kind, decks?: Record<deckKey, DeckRow[]>,            // fixed-decks: 40 rows each
               groups?: Record<deckKey, DeckRow[]>,                 // evolution-*: the group, promo excluded
               promos: Record<deckKey, DeckRow>,                    // the promo card row (qty 1)
               trainerPool?: DeckRow[],                             // evolution-*: qty = 1 per distinct card
               energy?: Record<deckKey, { label, qty }[]> }         // evolution-deck: the 17
   DeckRow = SetCard-shape + qty` (051's `normalizeCard` + the five extra fields).
- `core/build-battle/box-data.mjs` (pure): `loadBoxData(boxKey) -> Promise<{ set: SetCard[], setInfo,
  data: BoxData }>` = `Promise.all([import('./sets/<setId>.generated.mjs'),
  import('./boxes/<boxKey>.generated.mjs')])`, memoized per key; unknown key → rejects
  `Error('unknown box')`; a failed import rejects with the import error (row 5). Tests stub `importer`.
- `scripts/build-battle/boxes/<boxKey>.mjs` (one hand-written source per box, committed):
  `export default { key, setId, promoSetId, kind, source: { url, revision }, decks | groups,
  trainerPool, energy }` in 051's decklist-line format (`'3 Ponyta TEU 17'`, promos `'1 Charizard
  SM158'` → `smp-SM158`, set-numbered promos `'1 Charizard EVO 11'`). `SET_MAP` gains every code:
  XY `FCO xy10, STS xy11, EVO xy12, XYP xyp`; SM `SUM sm1, GRI sm2, BUS sm3, CIN sm4, UPR sm5, FLI
  sm6, CES sm7, LOT sm8, TEU sm9, UNB sm10, UNM sm11, CEC sm12, SMP smp` (+ `SLG sm3.5, DRM sm7.5,
  HIF sm11.5` for Trainer reprints); SWSH `SSH swsh1, RCL swsh2, DAA swsh3, VIV swsh4, BST swsh5,
  CRE swsh6, EVS swsh7, FST swsh8, BRS swsh9, ASR swsh10, LOR swsh11, SIT swsh12, SWSHP swshp`
  (+ `CPA swsh3.5, SHF swsh4.5, CRZ swsh12.5, PGO swsh10.5`); SV `SVI sv01, PAL sv02, OBF sv03, PAR
  sv04, TEF sv05, TWM sv06, SCR sv07, SSP sv08, JTG sv09, DRI sv10` (+ `MEW sv03.5, PAF sv04.5, SFA
  sv06.5, PRE sv08.5, BLK sv10.5b, WHT sv10.5w`, `SVP svp`); ME `MEG me01, PFL me02, POR me03, CRI
  me04, PBL me05, MEP mep`. The ids follow TCGdex's series listings (`/v2/en/series/sm` etc.); the
  generator resolves each code once with `fetchSet` and throws on a 404, so a wrong id fails loudly.
- `scripts/generate-build-battle-box.mjs` becomes a loop: `node scripts/generate-build-battle-box.mjs
  [--only <boxKey>[,…]] [--check]`; per box it fetches the set (cached per run), resolves every line
  by name (`fetchCard(id, expectedName)` as today — a renamed card aborts), writes the two modules,
  and prints `box <key>: set <n> rows, rarities {…}, groups {a: 9, b: 10, …}, pool <m>`. `--check`
  refetches and diffs, as today (`scripts/__tests__/build-battle-box-live.test.mjs`, `pnpm test:live`).
  The me02 data moves into `sets/me02.generated.mjs` + `boxes/phantasmal-flames.generated.mjs`; the
  old `build-battle.generated.mjs` is deleted and its two importers rewired.

### Pack models (`core/build-battle/pack-models.mjs`, pure)
`PackModel = { key, size: 10, slots: Slot[] }`, `Slot = { count, pools?: string[], table?: [pool,
weight][] }` as 051, where a pool is `'Common'`, `'Uncommon'`, a **filler** (`'reverse'` = Common ∪
Uncommon ∪ plain rare; `'rare'` = the era's plain rare: non-secret `Rare` / `Rare Holo` / `Holo
Rare`) or a **class** resolved per set by matchers on TCGdex fields (`rarity`, secret = numeric
`localId` > `SET.official`, `subset`): `hit`, `ultra`, `illustration`, `specialIllustration`,
`aceSpec`, `top`. The Basic Energy card outside the ten (SM →) is not simulated: Basic Energy never
enters the pool (D188) and the scene keeps 052's ten-card pocket flow (§ Options 5 note).
```
BOOSTED_RATE_PROFILE = Object.freeze({ hit: 0.25, ultra: 0.08, illustration: 0.20,
                                       specialIllustration: 0.05, aceSpec: 0.05, top: 0.01 })
// 30th Celebration per-pack chances (§ Research 4): ex-class 22–28 % → .25; IR 1 in 5 → .20;
// SIR 1 in 20 → .05; top tier (Futuristic Rare 1 in ~100–120) → .01. No 30th tier exists for
// full-art rule-box cards or ACE SPEC → their measured rates stay (Phantasmal Flames UR 8.06 %;
// Temporal Forces / Surging Sparks ACE SPEC 5.0 %).
const P = BOOSTED_RATE_PROFILE;
RARITY_CLASSES = {          // era → class → matchers { rarity, secret?, subset? } (§ Research 5)
  xy:   { hit: [{ rarity: 'Ultra Rare', secret: false }],                     // EX, full-art EX, BREAK (TCGdex merges them)
          top: [{ rarity: 'Secret Rare' }, { rarity: 'Ultra Rare', secret: true }] },
  sm:   { hit: [{ rarity: 'Ultra Rare', secret: false }],                     // GX regular + full art (merged by TCGdex)
          top: [{ rarity: 'Secret Rare' }, { rarity: 'Ultra Rare', secret: true }] },  // rainbow, gold, character rares
  swsh: { hit: [{ rarity: 'Holo Rare V', secret: false }, { rarity: 'Holo Rare VMAX', secret: false },
                { rarity: 'Holo Rare VSTAR', secret: false }, { rarity: 'Radiant Rare' }, { rarity: 'Amazing Rare' }],
          ultra: [{ rarity: 'Ultra Rare', secret: false }],                   // full-art / alt-art V, full-art Trainers
          illustration: [{ subset: 'tg', rarity: 'Rare' }],                  // Trainer Gallery non-V holos
          specialIllustration: [{ subset: 'tg', rarity: 'Ultra Rare' }],     // TG V/VMAX/Trainer + gold-black VMAX
          top: [{ rarity: 'Secret Rare' }, { rarity: 'Ultra Rare', secret: true }] },
  sv:   { hit: [{ rarity: 'Double rare' }], ultra: [{ rarity: 'Ultra Rare' }], aceSpec: [{ rarity: 'ACE SPEC Rare' }],
          illustration: [{ rarity: 'Illustration rare' }], specialIllustration: [{ rarity: 'Special illustration rare' }],
          top: [{ rarity: 'Hyper rare' }] },
  me:   { hit: [{ rarity: 'Double rare' }], ultra: [{ rarity: 'Ultra Rare' }],
          illustration: [{ rarity: 'Illustration rare' }], specialIllustration: [{ rarity: 'Special illustration rare' }],
          top: [{ rarity: 'Mega Hyper Rare' }] } };
PACK_MODELS = {             // key → era, slots (weights normalized per slot, as 051)
  xy:   { era: 'xy', slots: [C×5, U×3, [['reverse', 1]], [['hit', P.hit + P.ultra], ['top', P.top], ['rare', 1 - P.hit - P.ultra - P.top]]] },
  sm:   { era: 'sm', slots: same as xy },       // XY/SM: TCGdex cannot split regular from full-art GX/EX, so hit carries both weights
  swsh: { era: 'swsh', slots: [C×5, U×3, [['reverse', 1]],
                                [['hit', P.hit], ['ultra', P.ultra], ['top', P.top], ['rare', 1 - P.hit - P.ultra - P.top]]] },
  'swsh-tg': { era: 'swsh', slots: [C×5, U×3, [['illustration', P.illustration], ['specialIllustration', P.specialIllustration], ['reverse', 1 - P.illustration - P.specialIllustration]],
                                     rare slot as swsh] },
  sv:   { era: 'sv', slots: [C×4, U×3, [['reverse', 1]],
                              [['illustration', P.illustration], ['specialIllustration', P.specialIllustration], ['top', P.top], ['reverse', 1 - P.illustration - P.specialIllustration - P.top]],
                              [['hit', P.hit], ['ultra', P.ultra], ['rare', 1 - P.hit - P.ultra]]] },
  'sv-acespec': { era: 'sv', slots: sv with slot 3 = [['aceSpec', P.aceSpec], ['reverse', 1 - P.aceSpec]] },
  me:   { era: 'me', slots: [C×4, U×3, [['reverse', 1]],
                              [['illustration', P.illustration], ['specialIllustration', P.specialIllustration], ['reverse', 1 - P.illustration - P.specialIllustration]],
                              [['hit', P.hit], ['ultra', P.ultra], ['top', P.top], ['rare', 1 - P.hit - P.ultra - P.top]]] } };
```
`C×n` = `{ pools: ['Common'], count: n }`, `U×3` likewise; a bracketed list is `{ count: 1, table }`.
Box → model: XY kits `xy`; SM `sm`; Sword & Shield → Fusion Strike `swsh`; Brilliant Stars → Silver
Tempest `swsh-tg`; Scarlet & Violet → Paradox Rift `sv`; Temporal Forces → Destined Rivals
`sv-acespec`; ME `me` (Phantasmal Flames moves from `ME_PACK_MODEL` to this, which is the same layout
with the profile's weights). Slot placements follow § Research 5: SV Hyper rares in the second
reverse slot, ME Mega Hyper Rares in the rare slot (051), Radiant/Amazing in the rare slot, Trainer
Gallery in the reverse slot, ACE SPEC in the first reverse slot. Prism Star cards (TCGdex `Rare`)
draw as plain rares (uniform among the set's rares); their per-deck limit is validation's, unchanged.

`resolvePackModel(model, cards, setInfo) -> ResolvedPackModel`: each class pool becomes the ids of
`cards` matching any of the era's matchers (a class's cards are drawn uniformly, so VMAX vs V or
regular vs full-art GX come up in proportion to how many the set prints); a class with no card in
this set moves its weight to the slot's filler row (`'reverse'` in a reverse/art slot, `'rare'` in
the rare slot) — the other rows' rates are unchanged (row 9). Pack cards are drawn from the box
set's module only (main set + its TG subset); promo-set cards never appear in packs. `openPack`
takes the resolved model; its fallbacks are unchanged (an exhausted pool → the filler → plain rare →
whole set; never a duplicate id). Slice 1's test asserts every matcher string of an era occurs in at
least one baked set of that era once the era's data slice lands (`RARITY_CLASSES` vs the sets'
rarity tallies), so a TCGdex spelling drift fails at bake time, not at play.

### Opening a box (`pack-opening.mjs`)
`openBox({ box, data, cards, rng }) -> Opened`, `Opened = { deckKey, groupKeys: [deckKey, other]|null,
trainerIds: string[]|null, packs: string[][], artIndexes: number[] }`, draws in this order (one seed
= one box):
1. `deckKey = box.decks[rng.int(4)].key` (the promo).
2. `kind !== 'fixed-decks'`: `other = others[rng.int(3)]` (the three non-promo group keys in catalog
   order); `n = 23 - 1 - groups[deckKey].length - groups[other].length` (row lengths = card count, qty
   summed); `trainerIds`: `n` draws of `pool[rng.int(pool.length)].id`, a draw of a card already
   drawn twice is redrawn (Option 7), at most `2 * pool.length` draws total then stop (row 3).
   `groupKeys = [deckKey, other]`, else `null`, `trainerIds = null`.
3. `packCount` packs as today (resolved pack model).
4. `artIndexes = packArtIndexes(rng2, packCount)` on the `seed ^ 0x9e3779b9` stream as 052 (unchanged).
`poolFromBox({ box, data, cards, opened })`: `fixed-decks` → deck rows as today; evolution kinds →
promo row (1) + both groups' rows (qty) + one per `trainerIds` entry (merged by id) + pack cards;
Basic Energy dropped (D188). The **starting deck** the editor loads at box open
(`startingDeckRows(box, data, opened)`): fixed → the deck; `evolution-pack` → the 23 cards;
`evolution-deck` → the 23 + `data.energy[deckKey]` (17 rows, as the printed box). Same helper feeds
`buildBattleDeckName(box, deck, seed)` = `B&B <box.shortName> <deck.name> #<seed>`.

### Session (`build-battle-session.mjs`, `version: 1` kept)
`Session` gains optional `groupKeys: [string, string]|null`, `trainerIds: string[]|null`. `parseSession`
no longer imports set data: it checks shape, `boxKey` known, `deckKey` in the box, `groupKeys` (when
present) ∈ the box's deck keys and `[0] === deckKey`, `packs` = `packCount` arrays of strings; card
membership moves to `verifySessionCards(session, { set, data }) -> boolean` (every pack id in the set,
every trainer id in `data.trainerPool`), run by the controller after `loadBoxData`; false → the
session is cleared and the sealed screen shows (row 2). A v1 me02 session (no `groupKeys`) parses
and verifies as before.

### Deck rules (`deck-validation.mjs`, Option 4 = B)
`BUILD_BATTLE_DECK_RULES.maxCopiesPerCard = null`; `validateDeck` skips the per-name copy error when
`rules.maxCopiesPerCard == null`; ACE SPEC / Radiant / Prism Star limits unchanged. `validatePoolDeck`
already caps every card at its pool count. Error text and `requiredCards` unchanged.

### Builder tab (`native-deck-builder-build-battle.js`)
- Boot: `activeBox = getBuildBattleBox(session?.boxKey ?? parseBoxKey(location.search) ??
  DEFAULT_BOX_KEY)`; `parseBoxKey` reads `?box=<key>`, unknown → null. `loadBoxData(activeBox.key)`
  before the first render; while loading the panel shows the sealed box with "Loading <box.name>…" and
  a disabled Open button; a rejected load shows "Could not load <box.name>. Reload to try again." and
  the picker stays usable (row 5).
- Sealed screen: an **era row** (`#buildBattleEra`, five chips: XY · Sun & Moon · Sword & Shield ·
  Scarlet & Violet · Mega Evolution) and a **box select** (`#buildBattleBox`, the era's boxes in
  release order, `shortName`), changing either re-runs `loadBoxData` and re-renders the sealed box in
  that skin; the note reads `<packCount> <set name> packs and <contents line>` where the contents
  line is per kind: fixed → "one of 4 40-card decks"; evolution-pack → "a 23-card Evolution pack
  (1 of 4 promos)"; evolution-deck → "a 40-card Evolution deck (1 of 4 promos)"; then "Build a
  40-card deck from them; games use 4 Prizes."
- Open, Pool, Play, New box unchanged in flow; `BOX` literal replaced by `activeBox`; the headline
  (`boxHeadline`) prints `<box.name> · <deck.name> <kind === 'fixed-decks' ? 'deck' : 'promo'> · Box
  #<seed>`; the Pool tab groups as today.
- "New box" keeps the current box selected; the picker is disabled while a session exists.

### Unboxing skin (`native-deck-builder-unboxing.js`, `unboxing.mjs`, `box-textures.mjs`, CSS)
- `boxSkin(box) -> { setLogoUrl, setSymbolUrl, keyArtUrl, palette, packArts: PackArt[4], faces }`
  (pure, `unboxing.mjs`): URLs from TCGdex (`assets.tcgdex.net/en/<series>/<setId>/logo.webp`,
  `symbol.webp`, key art = `cardImage(keyArtCardId, 'high')`), `PackArt = { kind: 'vendored', src } |
  { kind: 'procedural', cardId }`, `faces = BOX_FACE_TEXTURES` for `vendored.box` boxes else `null`
  (all six faces procedural). `packArtIndexes` unchanged: indexes into `skin.packArts`.
- DOM: `setLogo()` prints `<series name> / <set name>` from `setInfo`; `proceduralBack()` bullets per
  kind (fixed: 051's three lines with the set name; evolution-pack: "23-card Evolution pack including
  1 of 4 foil promo cards", "4 <set> booster packs", "A code card for Pokémon TCG Online";
  evolution-deck: "40-card Evolution deck (23 cards + 17 Basic Energy) including 1 of 4 foil promo
  cards", packs line, "A code card for Pokémon TCG Live"); tray label "40-card deck" → "23-card
  Evolution pack" / "40-card Evolution deck" by kind; the deck window shows the promo as today.
  A procedural pack front = the 052 procedural pack back template plus the set logo and the key
  card's art under the same crimps and "⑩ ADDITIONAL GAME CARDS" band; era palettes are five
  `--bb-*` token blocks selected by `data-era` on `.bb-scene` (`xy`: blue/yellow, `sm`: orange/teal,
  `swsh`: red/blue, `sv`: scarlet/violet, `me`: the current tokens) — the fx-designer may tune hues
  in Deviations, not the layout (052 house rule).
- Tiers and foil: `TIER_BY_RARITY` becomes per-class: `hit → 1`, `ultra | illustration → 2`,
  `specialIllustration | top → 3` via `hitTierFor(card, slot, classes)`; `HOLO_PRINT_RARITIES` gains
  the eras' holo-rare strings (`'Rare Holo'`, `'Holo Rare'`) so SM/SWSH holo rares foil as 052's
  Rares do; `unboxingHoloRarity` otherwise unchanged (`holo.mjs` already maps the old strings).
- Sounds, beats, poses, the Pocket flow: unchanged.

### Recorder (`rec-unboxing.mjs`)
`BOX=<key>` env (default `phantasmal-flames`) → `PAGE_URL` gains `&box=<key>`; the pool-integrity
check reads `packCount × 10` pack cards plus, for evolution kinds, `23` (`-pack`) or `40` (`-deck`)
starting rows; PASS/FAIL lines name the box.

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | `?box=` empty / unknown / a set id instead of a key | ignored → `DEFAULT_BOX_KEY` (me02); picker shows its era | [ ] `build-battle-view.test.mjs` "parseBoxKey…" |
| 2 | stored session names a box whose data fails `verifySessionCards` (pack id not in set, trainer id not in pool) | session cleared, sealed screen, no throw | [ ] `build-battle-session.test.mjs` |
| 3 | random-Trainer draw: pool of 1 card, n = 4 | 2 copies then stop (at most `2·pool` draws), pool is 2 cards | [ ] `pack-opening.test.mjs` "the Trainer pool caps at two copies" |
| 4 | evolution box: `n = 23 − 1 − A − B` < 0 for some pairing | generator refuses to bake the box (throws naming the pairing); catalog test asserts n ≥ 0 for all 12 pairings of every baked box | [ ] `box-catalog.test.mjs` |
| 5 | `import()` of a set module rejects (offline, 404) | sealed screen shows the load error, picker usable, no session created | [ ] controller e2e by hand (route the module to 404 in Playwright) |
| 6 | box opened, then reload while `loadBoxData` is pending | scene renders only after the promise; a second Open click during load is a no-op | [ ] e2e by hand |
| 7 | same seed, same box, twice | identical deckKey, groupKeys, trainerIds, packs, artIndexes | [ ] `pack-opening.test.mjs` (fixed + evolution fixtures) |
| 8 | same seed, different box | independent contents; changing the box before Open re-draws | [ ] `pack-opening.test.mjs` |
| 9 | a class absent from a set (SM: no `illustration`) | its weight joins the slot filler; `hit`/`top` chances unchanged (25 % / 1 %) | [ ] `pack-models.test.mjs` "an absent class keeps the other rates" |
| 10 | rate profile: 4,000 packs of a baked set per model | `me`/`sv`: hit 25 % ± 2, UR 8 % ± 1.5, IR 20 % ± 2, SIR 5 % ± 1, top 1 % ± 0.5 (`sv-acespec`: ACE SPEC 5 % ± 1); `swsh`: hit 25 %, UR 8 %, top 1 %; `swsh-tg`: + TG 25 % ± 2 (20 + 5); `sm`/`xy`: `Ultra Rare` non-secret 33 % ± 2, top 1 % | [ ] `pack-models.test.mjs` per model (synthetic set until the era's data lands, then the baked set) |
| 11 | secret detection: numeric localId > `SET.official`; TG localIds (`TG01`) are never secret; a set with `official` missing | secrets only above the official count; TG rows classed by `subset`; missing `official` → generator throws at bake | [ ] `pack-models.test.mjs`; generator test |
| 12 | 5 copies of one card in a B&B deck (pool has 5) | valid (Option 4 B); `tcg` still errors at 5; ACE SPEC ×2 / Radiant ×2 / Prism Star same name ×2 still error in B&B | [ ] `deck-validation.test.mjs` |
| 13 | v1 me02 session (no `groupKeys`/`trainerIds`) after the upgrade | parses; pool and scene as before; deck name unchanged | [ ] `build-battle-session.test.mjs` "a 051 session still opens" |
| 14 | evolution-deck starting deck | editor holds 23 + 17 Basic Energy = 40 at open; counter 40 / 40; Play enabled when a Basic exists | [ ] `build-battle-view.test.mjs` `startingDeckRows`; e2e by hand |
| 15 | evolution-pack starting deck | editor holds the 23 cards; counter 23 / 40; Basic Energy tiles add freely | [ ] same |
| 16 | dual-type group (page names two Energy types) | `energy[deckKey]` carries both rows summing to 17; label null → headline omits the type | [ ] `box-catalog.test.mjs` (every `energy` sums to 17 for evolution-deck boxes, 0 rows otherwise) |
| 17 | promo id resolution: SM/SWSH promos on TCGdex (`smp-SM158`), set-numbered promos (Evolutions `xy12-11`, Destined Rivals `sv10-034`) | generator resolves by name check; the promo row's `id` is the printed card's TCGdex id; image fallback rule as § Generated data | [ ] generator `--check`; `box-catalog.test.mjs` promo ids present once |
| 18 | TCGdex renames / renumbers a card | generator throws (name check); committed modules stay the truth | [ ] `--check` live test |
| 19 | sprite slug for an old-era promo missing (Alolan forms) | `sprites: []` allowed; library shows the default; test checks only listed slugs | [ ] `box-catalog.test.mjs` |
| 20 | 41 set modules on disk | each ≤ 60 KB; none imported by the eager catalog (grep test: no static import of `sets/` outside `box-data.mjs`) | [ ] `box-data.test.mjs` |
| 21 | a `swsh-tg` box whose set module has no `subset: 'tg'` rows (TG fetch failed at bake) | generator refuses to bake the box (throws "no Trainer Gallery rows for swsh9tg"); at play an absent class falls to the filler as row 9 | [ ] generator test; `pack-models.test.mjs` |
| 22 | picker changed after a session exists | picker disabled; "New box" first | [ ] e2e by hand |
| 23 | two players, different boxes, both B&B | deal proceeds (formats equal); each pool is its own | [ ] `room.test.mjs` unchanged (format only) — reasoning |
| 24 | skin URL 404 (logo/symbol/key art) | image removed on `error` as 052 does; procedural face still readable | [ ] existing `error` handlers; e2e by hand with the host blocked |
| 25 | vendored art flag true but file missing | `<img>` error → procedural pack front behind it stays | [ ] e2e by hand |
| 26 | reduced motion / fx disabled | unchanged from 052 | [ ] existing tests |
| 27 | Trainer pool card printed in an older set (e.g. Team Up's Copycat is CES) | source line carries the set code; the row's `set.id` ≠ box set is allowed for pool and group rows, never for pack cards | [ ] `box-catalog.test.mjs` (pack cards ∈ set) |
| 28 | a pulled card's attack/ability the engine does not implement | plays as in Standard (rules-bridge no-op / manual); out of scope, tracked per set by `pnpm audit:oracle` | [ ] reasoning; ISSUES line per gap found during data slices |
| 29 | box list in the picker: 42 entries | grouped by era chip; keyboard reachable (`<select>`) | [ ] e2e by hand |
| 30 | Delta Reign (no lists yet) | not in the catalog; adding it later is one source file + regeneration | [ ] reasoning |
| 31 | rate profile applied to me02 changes `pack-opening.test.mjs` "me02 packs follow the slot model" expectations | slot membership tests unchanged; rate test updated to the profile | [ ] slice 1 |

## Test plan
Unit (`node --test`): `pack-models.test.mjs` (rows 9–11, 21; class resolution per era on the baked
sets; the 4,000-pack rate check), `pack-opening.test.mjs` (rows 3, 7, 8; evolution opener on a
synthetic box and on one baked box per era), `build-battle-session.test.mjs` (rows 2, 13),
`box-catalog.test.mjs` (rows 4, 16, 17, 19, 27; per box: 4 promos once, groups' sizes, pool ≥ 1,
kinds/eras valid, `packModelKey` known), `box-data.test.mjs` (row 20; stubbed importer),
`deck-validation.test.mjs` (row 12), `build-battle-view.test.mjs` (rows 1, 14, 15), `unboxing.test.mjs`
(tiers per class, holo for SM/SWSH holo rares, `boxSkin` URLs). Live (`pnpm test:live`): generator
`--check` per box. E2E: `rec-unboxing.mjs` with `BOX=` one box per era and kind (me01 fixed;
temporal-forces evolution-deck; team-up evolution-pack), plus the picker by hand (rows 5, 6, 22, 24,
25, 29). Two-player: unchanged room tests.

## Migration / rollout
No migration: sessions stay `version: 1` (new fields optional); library decks unchanged;
`build-battle.generated.mjs` is replaced by per-set modules in the same commit as its importers.
Revert path: revert the slices' commits; a session with `groupKeys` under the old code fails
`parseSession` (unknown field is ignored, box key `phantasmal-flames` still parses) — only sessions
of other boxes are lost, which the old code never had. Rates: `BOOSTED_RATE_PROFILE` is one constant;
restoring measured rates is a one-line change per era (baseline numbers kept in § Pack anatomy).

## Work plan — slices ≤1 session, each leaving the repo green
Each slice is built by a fresh thread from `main`; data slices (3–8) need TCGdex/Bulbapedia access
(§ Constraints) and each ends with its `--check` run recorded in Deviations.
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 Core | create `core/build-battle/pack-models.mjs` + test, `box-data.mjs` + test, `sets/me02.generated.mjs`, `boxes/phantasmal-flames.generated.mjs` (split from the existing module by a one-off script, no fetch); modify `box-catalog.mjs` (Box shape, `era`, `kind`, `skin`, `promoSetId`, `sources`; me02 only), `pack-opening.mjs` (`openBox` Opened shape, evolution kinds, `poolFromBox`, `startingDeckRows`), `build-battle-session.mjs` (`groupKeys`, `trainerIds`, `verifySessionCards`), `deck-validation.mjs` (`maxCopiesPerCard: null`), `build-battle-view.mjs` (`parseBoxKey`, `buildBattleDeckName`, contents line), the controller's imports (`loadBoxData`, `activeBox` = me02, no picker yet), `unboxing.mjs` (`hitTierFor` by class, `HOLO_PRINT_RARITIES`), delete `build-battle.generated.mjs`; tests listed in § Test plan | § Data model, § Generated data, § Pack models, § Opening a box, § Session, § Deck rules verbatim | rows 2, 3, 7–13, 20, 21, 31 with the values in the table; me02: DR 25 % ± 2, UR 8 % ± 1.5, IR 20 % ± 2, SIR 5 % ± 1, MHR 1 % ± 0.5 over 4,000 seeds | 30th Celebration samples (§ Research 4); Limited copy rule (Rules & Formats 2017 p. "Limited"; Handbook 2024 § 5.5) | `pnpm test` green; the B&B tab opens a me02 box exactly as before (recorder PASS at seed 42) |
| 2 Generator | modify `scripts/generate-build-battle-box.mjs` (loop, `--only`, per-box outputs), `scripts/lib/decklist-lines.mjs` (`SET_MAP` all codes, set-numbered promo lines, `fetchSet` cache); create `scripts/build-battle/boxes/phantasmal-flames.mjs` (from `DECK_SOURCES`), `scripts/build-battle/box-sources.mjs` (loader); modify `scripts/__tests__/build-battle-box-live.test.mjs` | `node scripts/generate-build-battle-box.mjs [--only k] [--check]`; box source shape § Generated data | regenerating me02 reproduces slice 1's modules byte for byte (`--check` clean); a source with a wrong name throws `Expected <name>, got <other>`; an evolution source with n < 0 throws naming the pairing (row 4) | TCGdex set ids from `/v2/en/series/{xy,sm,swsh,sv,me}` (verified in this slice, recorded in Deviations) | `pnpm test` + `pnpm test:live` (me02 `--check`) green |
| 3 ME data | create sources + generated modules for `mega-evolution` (me01, MEP 001–004), `perfect-order` (me03, 064–067), `chaos-rising` (me04, 074–077), `pitch-black` (me05, 082–085); catalog rows (kind `fixed-decks`, era `me`, `packModelKey: 'me'`, skins with `keyArtCardId` = each set's Mega ex SIR named in the source file, `packArtCardIds` = the 4 promos' set prints); `box-catalog.test.mjs` rows | decklists as printed on each Bulbapedia box page (URL in `sources.box`); every deck 40 rows, promo once | per box: 4 × 40, promo ids present, rarity tally equals the page's set size; pack test rows 7, 10 on me01 | Bulbapedia per-box pages (§ Research 3 ME) | `pnpm test` green; `--check` clean for the 4 boxes |
| 4 UI + skins | modify `native-deck-builder-build-battle.js` (picker, `?box=`, load states), `native-deck-builder-unboxing.js` (`boxSkin`, kind-aware labels, procedural pack front), `css/deck-builder-build-battle.css` (era chips, select), `css/deck-builder-unboxing.css` (five palette blocks by `data-era`), `box-textures.mjs` (`packArtSrc` → vendored map keyed by box), `rec-unboxing.mjs` (`BOX=`); `index.ejs` untouched (panel is built by the controller) | § Builder tab, § Unboxing skin, § Recorder verbatim; ids `#buildBattleEra`, `#buildBattleBox` | rows 1, 5, 6, 14, 15, 22, 24, 25, 29 by hand + recorder PASS for `phantasmal-flames` and `mega-evolution` at seed 42 (video + 390 px shots in `.agent/scratch/`) | — | lint clean; recorder PASS; screenshots recorded in Deviations |
| 5 SV data | sources + modules for the 10 SV boxes: kinds `evolution-deck` (17 Energy), `packModelKey: 'sv'` (Scarlet & Violet → Paradox Rift) / `'sv-acespec'` (Temporal Forces → Destined Rivals), promo ids `svp-005`… and `sv10-034`… for Destined Rivals; groups, Trainer pools and Energy from each box page; catalog rows and skins (`keyArtCardId` = the set's cover Pokémon ex SIR, named per box in its source) | `groups`, `trainerPool`, `energy` per § Generated data | rows 4, 16, 17, 27 per box; `pack-models` row 10 on sv04 and sv05; opener row 7 on `temporal-forces` | Bulbapedia per-box pages (§ Research 3 SV); rarity strings from the baked sets | `pnpm test` green; `--check` clean |
| 6 SWSH data | the 12 SWSH boxes: `evolution-pack` (SSH → FST) and `evolution-deck` (BRS → SIT); `packModelKey: 'swsh'` / `'swsh-tg'` (BRS →); promo ids `swshp-SWSH006`…; Trainer Gallery rows merged from `swsh9tg`…`swsh12tg` into the set modules with `subset: 'tg'` | as slice 5 | rows 4, 17, 27; row 10 on swsh7 (no TG) and swsh9 (TG); opener rows 7, 15 on `team-up`-style pack kind (`sword-shield`) | Bulbapedia (§ Research 3 SWSH) | same |
| 7 SM data | the 12 SM boxes: `evolution-pack`, `packModelKey: 'sm'`; promo ids `smp-SM010`…; Prism Star rows | as slice 5 | rows 4, 9 (no illustration class), 17, 27; row 10 on sm12 | Bulbapedia (§ Research 3 SM) | same |
| 8 XY kits (optional) | `fates-collide` (xy10, `xyp-XY127`…), `steam-siege` (xy11, XY144…), `evolutions` (xy12, set-numbered 11/34/51/59); `packModelKey: 'xy'`; BREAK rows | as slice 5 | rows 4, 17; row 10 on xy12 | Bulbapedia kit pages (§ Research 3 XY) | same |
| 9 Close | `.agent/areas/deck-builder.md`, `MAP.md` (sets/, boxes/, pack-models, box-data), `DECISIONS.md` (D192+: Options 1–10 picks), `ISSUES.md` (room box choice follow-up; engine gaps found), `STATE.md`, design status | — | `review.md` by a fresh agent on slices 1, 2, 4 diff | — | `pnpm test` green; findings filed |

## Acceptance
Brief (verbatim, 2026-09-28): "https://github.com/Ar1ssi/vibecodepokemontcg2/blob/claude/build-battle-boxes-plan-38pf0r/.agent/designs/054-build-and-battle-boxes-all-eras.md
One shot this implementation in the same branch." — the criteria are this design's promises.
| # | Criterion (the design's words) | Evidence |
|---|---|---|
| 1 | "every other Build & Battle Box (and the Prerelease Kits …)": 41 boxes added, 42 in the catalog, release order, five eras | |
| 2 | "each era's real contents": fixed decks (ME), 23-card Evolution packs (Fates Collide → Fusion Strike), 40-card Evolution decks (Brilliant Stars → Destined Rivals), every line from its Bulbapedia page | |
| 3 | "and pack structure": per-era pack anatomy (§ Research 5) as pack models | |
| 4 | "every pack — Phantasmal Flames included — rolling the boosted 30th Celebration pull rates" | |
| 5 | "the play rules (40 cards, 4 Prizes) are the same in every era"; copy limit = Limited rule (Option 4 B) | |
| 6 | Per-set data modules loaded on demand, ≤ 60 KB each, none eager (Option 2 B) | |
| 7 | One seed = one box, bit for bit (D186) | |
| 8 | A 051 me02 session still opens (Option 8 B) | |
| 9 | Builder tab: era chips + box select, `?box=`, load/error states (§ Builder tab) | |
| 10 | Unboxing skinned per era, kind-aware labels, procedural pack fronts; me02 keeps its vendored art (Option 6 C) | |
| 11 | Generator bakes every box from TCGdex; `--check` clean (§ Generated data) | |
| 12 | Recorder PASS for a fixed, an evolution-pack and an evolution-deck box (§ Recorder) | |

## Assumptions
- A1 (assumed) "In the same branch" = `claude/build-battle-boxes-plan-38pf0r`, where this design lives: slices commit
  and push there (Land: branch). STATE/DECISIONS/ISSUES/MAP edits are listed for the landing commit, not made here.
- A2 (assumed) Option 4 = B (the Limited copy rule). The design recommended it and left it to the user; a one-shot
  takes the recommendation. Reverting is the one-line `maxCopiesPerCard` change plus its test.
- A3 (assumed) No source says which types an Evolution deck's Basic Energy are (every Bulbapedia page, pokemon.com
  and the Pokémon Center listing only say "17 basic Energy"). Rule: the promo group gets 9 (or its share of
  40 − pack size), the other group 8; each group's share splits over the Energy types its Pokémon's attack costs
  name (TCGdex `attacks[].cost`, weighted by copies, largest remainder); a group with no typed cost gives its
  share to the other. Basic Energy is unlimited (D188), so the player can re-split freely.
- A4 (assumed) Where a page's numbers disagree with the product (a 23-card Evolution pack, a 40-card deck), the
  product wins: Trainer draws fill the pack to 23 and an Evolution deck takes 40 − pack size Basic Energy. Each
  case is commented in its box source file and listed in § Deviations.
- A5 (assumed) Rules a page states without a rule to follow are not simulated: Fates Collide's optional Shuckle
  swap, Guardians Rising's "an Item is deducted for each Oricorio [Pa'u Style]". Listed in § Deviations.
- A6 (assumed) XY kits are in scope (Option 10 A); the user asked for every era.
- A7 (assumed) New library decks are named `B&B <short name> <deck> #<seed>`; records already saved keep their name.
- A8 (assumed) Deck sprites: fixed decks 2 slugs (the promo's Pokémon + the list's other main line), Evolution
  groups 1 slug (the promo's Pokémon); an Evolution box's library deck gets both groups' slugs. A missing slug → none.

## Deviations (Builder appends here during build)
Plan-time re-pins (§2 of oneshot-feature, from reading all 42 Bulbapedia pages and the 46 TCGdex sets):
- D1 (structural) Box contents are richer than § Opening a box assumed. Group rows may carry a copy range
  (`1-2`, `0-1`, `2-3`: Fates Collide, Forbidden Light, Stellar Crown, Surging Sparks, Destined Rivals) or
  alternative prints (`SVI 189/190`: Paldea Evolved, Surging Sparks); some boxes add rows to every box (Journey
  Together § 2); the random Trainers come from one or more pools with a count each (XY and SM kits split
  Supporters and Items) and per-card `min-max` (0-1, 0-2, 1-2); Temporal Forces swaps one Basic Energy for a
  Luminous Energy when the Koraidon or Miraidon group is in. Box source and `BoxData` therefore carry
  `groups` (rows with `min`/`max`/`alts`), `common`, `trainers: [{ name, count: null|n|[lo,hi], cards }]`,
  `extras: [{ when: groupKey[], rows, replacesBasicEnergy }]`, `energyNeeds[groupKey]` (A3). Draw order after the
  other group: ranged/alternative rows of the two groups in line order → pool counts → pool draws (mins first,
  then uniform among cards still under their max, stop when none) → packs. A box without a pool holds exactly its
  fixed rows. The generator checks every pairing at both ends of every range (row 4).
- D2 (structural) Session: `groupKeys` + `evolutionPack` (card ids, one per copy, promo first) + `energy`
  (`[label, qty][]`) instead of `trainerIds`, so a stored box never re-resolves ranges; `verifySessionCards` checks
  `evolutionPack` ids against the box data. v1 sessions (no fields) are fixed-decks boxes, unchanged.
- D3 TCGdex rarity strings differ from § Research 5: SWSH holo rares are `Holo Rare` (not `Rare`); Silver Tempest's
  Trainer Gallery uses `Holo Rare`, `Holo Rare V`, `Holo Rare VMAX`, `Full Art Trainer`; every TG subset has 2
  `Secret Rare` (gold-black); Sun & Moon's 9 Basic Energy are secret-numbered `Common`s. Matchers apply to main-set
  rows unless they name `subset: 'tg'`; the TG classes list all those strings; the C/U/rare/reverse fillers take
  non-secret main-set rows and never Basic Energy.
- D4 TCGdex has no art for any Trainer Gallery card (120) or 7 SM cards (sm2-143, sm6-82/90/122/126/134/140):
  those rows carry `images` from images.pokemontcg.io (HEAD 200 at bake; the app already allows that host). MEP
  promos keep 051's Limitless URLs.
- D5 Skin: logo and symbol URLs come from the set module (`SET.logo`, `SET.symbol`, TCGdex) instead of catalog
  literals; `packArtCardIds` defaults to the box's four promos.
- D6 `artIndexes` stay derived from the seed in the scene (052); `openBox` has only the rng stream.
- D7 `aceSpec` class reveals at tier 2 (the design gave it no tier).
Build notes:
- Slice 1: me02 split from 051's module by a one-off script; hydrated rows equal 051's rows byte for byte
  (JSON order included). `packArtSrc(setId, key)` (vendored files are per set). The seed-42 box keeps 051's
  draws except pack 1 card 9, now me02-129 (the art slot's boosted SIR band; row 31). Recorder seed 42: every
  row PASS, tiers `[[…,1,3,0],[…,1,2,1],[…,1,2,0],[…,1,1,0]]`. `pnpm test`: 5092 pass, 0 fail.
  Evolution-session parse tests land with the first Evolution box (slice 5): parseSession reads the catalog.

---
Self-approval checklist (only when the user is unreachable):
- [x] Every constraint traceable into the Design section
- [x] Every edge-case row has an expected behavior (or a written strike reason)
- [x] Interfaces fully named and typed — no hand-waving
- [x] Slices each ≤1 session and independently green
- [x] Every slice row is pinned: files, signatures, test cases with expected values, card rulings
      cited (corpus row / TCGdex id) — no banned words; a builder would make zero choices
- [x] No section reads "TBD"
