# Rules Compendium conformance audit — 2026-10-18

Source: https://compendium.pokegym.net/ (all-rulings-by-category, 2,632 rulings, fetched 2026-10-18).
Engine: `shared/engine/` at branch `claude/admiring-newton-c0au64` (= main 8b9fe9f). Read-only audit by 3 agents:
A = Meta + Gameplay + Trainers, B = Attacks + Errata, C = Abilities + Energy. Team Battle (10) out of scope (2-player sim).
Every verdict carries `path:line` and/or a probe run (`applyCommand` on a hand-built board). The orchestrator re-ran the
S1 probes of every auditor (A p08/p01/p25, B p1b/p5/p9, C p1/p13b/p13c/p14b/p19): all reproduce.
Probe scripts lived in the session scratchpad and are not committed; each finding names the board to rebuild as a test.

## Coverage
| Auditor | Rulings | Verified | MATCH | Non-match (MISMATCH/PARTIAL/NOT-IMPL) | Superseded | Triaged only / X |
|---|---:|---:|---:|---:|---:|---:|
| A Meta/Gameplay/Trainers | 878 | 288 | 149 | 133 | 6 | rest |
| B Attacks/Errata | 839 | 219 | 113 | 103 | 3 | rest |
| C Abilities/Energy | 905 (811 unique) | 190 | 76 | 111 | 3 | rest |
| **Total** | **2,622** | **697 (~27%)** | **338** | **347** | **12** | |

Verification focused on every general-rule ruling (most checked) and counter-intuitive card rulings. ~1,900
card-specific rulings were triaged only. The non-match count counts rulings, and many rulings share one root cause.
So the 347 non-match rulings collapse into the ~15 clusters below.

## Root-cause clusters (fix order = severity × reach)
| # | Cluster | Sev | Rulings / evidence | Where |
|---|---|---|---|---|
| 1 | **Evolution into VMAX / VSTAR / BREAK (from Stage 2) / LV.X refused**: `normalizeStage` returns null for TCGdex stage strings `VMAX`, `VSTAR`, `LEVEL-UP`, and the client forwards the raw stage | S1 | GP#37, #38, T#551 (A p08) | reduce/legality.mjs:1045-1056, rules/evolution.mjs:327, client card-stats.js:81 |
| 2 | **Optional timed Abilities read as permanent passives**: Stance/Dummy Doll/Sonic Slip (9 printings) always immune; Zamazenta VSTAR always −100; Ludicolo always +100; end-of-turn Abilities (Precious Gift, Sunny Bloom) usable mid-turn | S1 | C F1–F4 | rules/ability-executors.mjs:400-406, ability-combat.mjs:507,524-580, ability-triggers.mjs:363-383 |
| 3 | **"Can't use more than 1 X Ability each turn" not enforced** (18 printings incl. Pidgeot ex) | S1 | C F5 | effects/ability.mjs:96, legality.mjs:1504 |
| 4 | **Bench counter placement blocked by Tera / bench shields**: Dragapult ex Phantom Dive does 0 to benched Tera ex or behind Manaphy | S1 | B#1 | reduce/attack-damage.mjs:72-80,113-131 |
| 5 | **Attack costs paid before damage** (choose Energy → damage → discard): Raging Bolt ex vs Bastiodon 0 vs 210; DTE discarded early | S1 | B#2, B#30 | reduce/attack-effect.mjs, attack-steps.mjs |
| 6 | **Poison/Burn counter count fixed at 1/2**: ~40 "N counters instead of 1" cards, Virbank City Gym | S1 | B#3, A (GP#121) | reduce/turn.mjs:389-392 |
| 7 | **No-target / no-effect plays allowed**: 39/47 Trainer cases (Archie's, Single Strike Mustard draw 5 with no target), Abilities used for no effect, Evosoda/Devolution Spray | S2 (S1 draw-5) | A, C F19/F28 | rules/trainer-play-conditions.mjs:58-156 |
| 8 | **Client-only effects never run on the server**: Bench-size Stadiums (Sky Field, Area Zero, Collapsed), Retreat increase Stadiums/Gravity Gemstone, Berries, Leftovers, Bursting Balloon, Battle Cage, Risky Ruins, Festival Grounds, Training Center, Black Market, Virbank. `out/trainer-simulator-audit.json` wrongly marks them "works" | S2 | A | legality.mjs:760, stadium-effects.mjs:1254,1780,1897,1987 |
| 9 | **Evolution handling gaps**: attack-driven evolution goes to hand (Ascension, Evo-Powder…); evolving keeps can't-attack/retreat locks; LV.X counts as Basic | S2 | B#4, B#5, A (GP#20) | rules/attack-steps.mjs:1440-1447, reduce/attach.mjs:283-291, cards.mjs:183-193 |
| 10 | **Leaving play moves only the Basic**: Lost City, Rescue Scarf, Rescue Energy, Splash Energy discard the Evolution cards | S2 | A (T#335, #515), C F14 | reduce/knockout.mjs:448-463 |
| 11 | **KO / promotion timing**: KO resolved mid-attack; promoted Pokémon counts as "moved this turn"; promotion before Prizes; deferred KO before end-of-turn Abilities | S2/S3 | B#6, B#7, B#27, A (GP#61-63) | knockout.mjs:567,656-666,884-899; attack-effect.mjs:921; reduce.mjs:442 |
| 12 | **Ability bookkeeping**: used-marker survives leaving play; switched-off locks still lock; Stadium locks block Abilities used from hand; "attach from hand" triggers only on manual attach | S2 | C F6–F9 | effects/ability.mjs:91, ability-combat.mjs:1327-1345, legality.mjs:1515-1525, attach.mjs:106-127 |
| 13 | **Damage-modifier scope**: Bench damage skips attacker modifiers and errata'd W/R; "ignore effects on Defending" also drops attacker-side reductions; Weakness change needs a printed Weakness; self-damage has no W/R | S2/S3 | B#9, #11, #12, #18, #19 | rules/attack-engine.mjs:144-150,172,199,322 |
| 14 | **Retreat**: direct retreat may overpay; cost increases ignored; "{C}{C} less" read as 1; "no Retreat Cost" raised by Big Net | S2 | A, C F15 | legality.mjs:1321, retreat.mjs:60-92, stadium-effects.mjs:1780 |
| 15 | **Energy typing**: typed Special Energy matches typed searches off-board; Rainbow/Aurora/Luminous skipped by typed discards; one DCE doesn't cover "discard 2 Energy" | S2/S3 | C F12, F13, B#29 | rules/energy-effects.mjs:285-288 |
| 16 | **Setup**: Prizes dealt before mulligans; mulligan cap 10 lets a game start with no Basic; bonus draws forced | S2/S3 | A (GP#131-135) | setup.mjs:92-150,188 |
| 17 | **Not implemented**: "If X was used last turn, can't use" gate, Yoga Loop extra turn, Thumping Snore, on-KO Abilities (Entrusted Wishes, Lost Out, +1 Prize), opponent-side attach punishers (Gnawing Curse…), Spectral Breach, Dark Aura, Field Runner, Lt. Surge's Strategy, Prize-less Poké Doll/Robo Substitute, Cheryl, Energy Search Pro | S2 | B#8, #14; C F10, F11, F16, F25; A | — |
| 18 | **Smaller rules**: Smokescreen vs Confusion flip order (2026 ruling); "up to"/any-card searches allow 0; Prizes-taken = start − remaining; extra Prize at base 0; Will forces Confusion flip; actions allowed between double attacks; misc errata (Brick Smash, PlusPower, Shield/Double Rainbow Energy timing) | S2/S3 | B#10, #13, #21-24, A, B E1-E7 | see reports |

## Stale audit artefacts (mislead future sessions)
- `out/trainer-simulator-audit.json` marks client-only Stadiums/Tools "works" (cluster 8).
- `out/attack-simulator-audit.md`: 19 copy-attack rows marked "announce-only" now work. Attack evolution and modified Poison are marked "works" but don't.

## Already filed
I44 (LEGEND/V-UNION, tiebreak), I239 (Pokémon Power vs Ability lock), I162/I227 (Fainting Spell, WotC backlog). Every other finding is new.

---

## Auditor A — Meta (21), Gameplay (163), Trainers (694)
Probes p01-bench.mjs … p42-abilC.mjs (helpers h.mjs, counts tallyA.mjs), each driving `applyCommand` on a hand-built board with text from out/pkmn-trainer-cards.json. Orchestrator re-ran p08, p01, p25 — all reproduce; p08 cross-checked against client/src/setup/netcode/card-stats.js:81 (client forwards the raw TCGdex stage) and rules/evolution.mjs:327 (`normalizeStage` has no VMAX/VSTAR/LEVEL-UP case).

| Category | Rulings | G | C | X | Verified | MATCH | MISMATCH | PARTIAL | NOT-IMPL | SUPERSEDED | Left |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Meta | 21 | 21 | 0 | 0 | 12 | 7 | 2 | 3 | 0 | 0 | 9 cross-checked to B/C |
| Gameplay | 163 | 86 | 32 | 45 | 80 G + 9 C | 65 G + 4 C | 9 G | 1 G + 1 C | 3 G (I44) + 2 C | 2 | 6 G to B; 23 C triaged |
| Trainers | 694 | 77 | 578 | 39 | 187 (56 G) | 73 | 77 | 4 | 31 | 1 | 21 G + ~486 C triaged |
Trainer G/C/X split is approximate (keyword rules + manual overrides).

### Findings
| Ruling | Compendium | Engine | Evidence | Sev | Known |
|---|---|---|---|---|---|
| GP#38, GP#37, T#551 | BREAK/VMAX/VSTAR/LV.X evolve normally | TCGdex stage strings VMAX, VSTAR, BREAK-from-Stage-2, LEVEL-UP refused ("not an Evolution Pokémon") | reduce/legality.mjs:1045-1056; rules/evolution.mjs:327; p08 | S1 | – |
| GP#20 | LV.X is not a Basic | `isBasicPokemon` true for LEVEL-UP: hand→Bench allowed, counts for mulligan | cards.mjs:183-193; p09 | S2 | – |
| Meta#2, T#4, T#8, ~40 card rulings, GP#103 | Can't play a card with no valid target/effect; cost isn't an effect | 39/47 no-effect plays allowed; Archie's / Single Strike Mustard draw 5 with no target | trainer-play-conditions.mjs:58-156; p24, p25 | S2 (S1 draw cases) | – |
| Meta#6, T#50-55, #566-568, #119 | Sky Field/Area Zero raise, Collapsed Stadium lowers Bench limit | Reducer always 5 (limit logic is client-only) | legality.mjs:760; trainer-steps.mjs:63; stadium-effects.mjs:1254; p01 | S2 | – |
| GP#96, GP#92 | Can't overpay Retreat | Direct retreat accepts 3 Energy for cost 1, Energy on free retreat | legality.mjs:1321; retreat.mjs:186-198; p04 | S2 | – |
| Meta#19, T#233, T#254, GP#95 | Retreat increases apply | Galar Mine, Mount Lanakila, Calamitous Wasteland, Aqua's Secret Base, Gravity Gemstone do nothing; "{C}{C} less" read as −1 | stadium-effects.mjs:1780-1795; p06, p18 | S2 | – |
| T#154, T#312, T#600 | Cost-discarded cards can't be retrieved by the same card | Offered for retrieval | p41 | S2 | – |
| GP#133 | Mulligan until a Basic; Prizes after | Prizes dealt first; 10-mulligan cap; game can start without a Basic (93/300 seeds, one-Basic deck) | setup.mjs:92-150; p11 | S2 | – |
| GP#121, T#294, T#320, T#670 | Poison can place >1 counter; Virbank +2 | Always 10; Virbank no-op | turn.mjs:390; stadium-effects.mjs:1987; p02, p33 | S2 | – |
| T#562-564, #346, #323, #96-98 | Sitrus/Lum Berry, Leftovers, Bursting Balloon | Never trigger | p37, p40 | S2 | – |
| T#61-67, #521, #396, #518, #653, #692, #77, #691 | Battle Cage, Risky Ruins, Festival Grounds, Sky Pillar, Training Center, Wondrous Labyrinth, Black Market | No-op in reducer (some client-only) | stadium-effects.mjs:1897; p33-p35, p20 | S2 | – |
| T#335, T#515 | Lost City / Rescue Scarf move the whole chain | Only the Basic moves | knockout.mjs:448,454; p29 | S2 | – |
| T#328, T#522-529 | Poké Doll / Robo Substitute give no Prize | 1 Prize | fossil.mjs:65-87; p30 | S2 | – |
| T#343 | Lt. Surge's Strategy: 3 Supporters | 2nd refused | legality.mjs:1415; p38 | S2 | – |
| T#117 | Cheryl heals all Evolution Pokémon | Heals one | p26 | S2 | – |
| T#179 | Energy Search Pro: one of each type | 1 total | p26 | S2 | – |
| T#578 | Snorlax Doll placed at setup | Can't place; later play no-op | p30 | S3 | – |
| GP#61-63; C#131, #598 | Prizes, then promotion; next turn's player first | Promotion first; current player first | reduce.mjs:442-444; knockout.mjs:884-899; p39 | S3 | – |
| GP#131, #134, #135 | Mulligan draws optional, after setup | Forced, before Active placed | setup.mjs:188; p11 | S3 | – |
| Meta#1; T#127, #541, #597, #94 | "Up to" ≥1; any-card search takes a card | min 0 | executor.mjs:977; p14, p15, p26 | S3 | – |
| T#216 | Flower Shop Lady 3+3 mandatory | "up to 3" total | p26 | S3 | – |
| T#690 | Will doesn't affect Confusion flip | Forces it (30/30 heads) | reduce.mjs:274; p28 | S3 | – |
| T#309, #619-633, #651 | TM not discarded under Jamming Tower/Tool Jammer | Discarded | turn.mjs:149; p32 | S3 | – |
| T#191 | Eviolite reduces self-damage | Not reduced | p36 | S3 | – |
| T#184/#236, #407/#681 | Gapejaw Bog/Old Cemetery fire on effect bench/attach | Hand/manual only | stadium-triggers.mjs:96-122; p33, p34 | S3 | – |
| T#445 | PLHQ taxes 0-cost attacks | Not taxed | p35 | S3 | – |
| T#115 | Chaotic Swell discards the new Stadium | Stays | p33 | S3 | – |
| T#510, C#625, #597 | Can't search when all 4 copies known | Allowed | p42 | S3 | – |
| C#683 | Tachyon Bits decides win (2 conditions beat 1) | Tiebreak (on-promotion abilities unwired) | p42 | S3 | – |
| GP#85 | Unown [V] ≠ Unown V | Same name (masked by VSTAR bug) | pokemonNamesMatch; p07 | S3 PARTIAL | – |
| T#196, T#150, C#706 | Evosoda/Devolution Spray refused on bad target | Played for no effect | p42 | S3 PARTIAL | – |
| GP#151, #152 | Tiebreak = new game | Same board, first Prize wins | reduce/shared.mjs:144-163 | S3 PARTIAL | I44 |
| GP#72, #80, #144 | LEGEND/V-UNION assembly | Not modeled | cards.mjs:197-199 | S3 | I44 |
| Meta#11 | Optional vs mandatory per card text | Mostly right; Cheryl wrong | p26 | S3 PARTIAL | – |

### MATCH (groups)
Meta 8, 10, 13, 15, 16, 17, 20. Gameplay: deck rules #2, #3, #9, #13, #14, #17, #18, #20-22, #24-27, #29 (deck-validation.mjs:82-173); Bench #1; reveal #32; evolution #41, #42, #45-49; hand #53; KO/Prizes #60, #65, #67-69; LEGEND/V-UNION setup #76-79, #81, #83, #132, #133, #142, #143; VSTAR/V #87-89; retreat #97-100; search #104; Special Conditions #110-113, #118, #119, #122-128; mulligan net bonus #130; wins #149, #150, #155, #156, #160-163; Thorton #86. Trainers: general #2, #5-7, #9-12, #14, #17, #18, #313, #168/#724; fossils #19, #20, #39, #40, #528, #665; no-target refusals that work #75, #131, #263, #426, #441, #602, #618, #656, #209; Rare Candy #491, #493, #495-497, #503, #504, #506; Evosoda #194, Wally #675, Carmine #108; choices #21, #105, #185, #248, #455, #142, #27, #125, #581, #132; scoop #544, #58, #476; PlusPower #430, #432, #428; Switch/VS Seeker #605, #606, #674; Stadiums #410, #534, #644, #229, #338, #339; Focus Sash #217; Supporters #344, #321, #322, #477. C's items MATCH: #9, #10, #95, #167, #170, #171, #372, #403, #724, #728.

### SUPERSEDED / X
SUPERSEDED GP#40, GP#64, T#213. X: tournament/penalties GP#4-8, #10, #12, #23, #28, #54, #57-59, #153, #157-159; physical GP#15, #16, #19, #30, #31, #33-35, #90, #91, #106-109; procedure GP#50-52, #55, #66, #101, #102, #105, #114-116, #129, #136; not in pool GP#36; format/translation T#89, #169, #174, #175, #189, #212, #239, #287, #345, #349, #362, #365, #387, #469, #473, #489, #543, #561, #628.
Unverified G (Trainers): #1, #3, #13, #15, #16, #95, #139, #193, #218, #291, #332, #355, #387, #443, #447, #450, #452, #465, #466, #509, #598, #677, #549.

### Cross-checks raised
B: Meta 3, 7, 12, 14, 18, 21; GP#117, #120, #146, #148, #71; Poison-counter attack text; PLHQ/Dimension Valley on TM attacks. C: Meta 4, 5, 9; Splash Energy evolved-chain (knockout.mjs:454); Double Turbo −20 not applied (p33 control); ability memory through Ninja Boy/Thorton/BREAK; on-promotion abilities unwired; Festival Grounds.
Repo: out/trainer-simulator-audit.json (2026-09-06) marks Battle Cage, Risky Ruins, Festival Grounds, Energy Search Pro, Gravity Gemstone "works" — not the reducer's behavior.

---

## Auditor B — Attacks (752) + Errata (87)
Card pool: TCGdex dump tcgdex/all2.json (out/ corpora miss 316 of 517 attack titles). Probes b/p1.mjs…p18.mjs (print `observed | expected`).
Ruling numbers = file order (#1–#752 attacks, E#1–E#87 errata; b/attacks.c, b/errata.c). Orchestrator re-ran p1b, p5, p9 — all reproduce.

| | Attacks | Errata |
|---|---|---|
| G / C / X | 526 / 199 / 27 | 7 / 72 / 8 |
| Verified | 205 | 14 |
| MATCH | 107 | 6 |
| MISMATCH / PARTIAL / NOT-IMPL | 95 | 8 |
| SUPERSEDED | 3 | 0 |
| UNVERIFIED | 520 | 65 |

### Findings
| # | Ruling(s) | Compendium | Engine | Evidence | Sev |
|---|---|---|---|---|---|
| 1 | #135 (2023-03-30), #6 | Placing counters isn't damage; Tera/bench shields don't stop it | Bench counters prevented by Tera and Wave Veil | p1b: Phantom Dive 0 vs 60; attack-damage.mjs:72-80,113-131 | S1 |
| 2 | #57, #439 (2026-07-16), #411; likely #377, #407, #273, #703, #440 | Choose Energy → damage → discard/return | Cost paid before damage | p5: I1 0 vs 210, I2 0 vs 200, I3 120 vs 100 | S1 |
| 3 | #457 (2026-06-04), #561/#562, #657, #470, #471, #678, #431 | "N counters instead of 1" Poison/Burn | Always 10/20 | p9 M1 10 vs 160; turn.mjs:389-392 | S1 |
| 4 | #31, #44, #215, #224, #225, #423, #445, #627-629 | Attack evolves the Pokémon | Modern wording → search to hand (18/19 wordings) | p13; rules/attack-steps.mjs:1440-1447 | S2 |
| 5 | #7 | Can't-attack/retreat effects end on evolving | Survive evolution | p2 F1-F3; attach.mjs:283-291 | S2 |
| 6 | #45, #275, #276, #357, #441, #688 | Promotion on opponent's turn isn't "this turn" | Promotion stamped with new turn | p7 K3 120 vs 30; knockout.mjs:567,573-577,656-666 | S2 |
| 7 | #534, #450, #158 | KO check only after all attack effects | KO resolved as damage lands | p4 H1, p12 P1; attack-effect.mjs:921; attack-damage.mjs:469 | S2 |
| 8 | #52, #53, #36, #97, #749, #751 (+#261…) | "If X used last turn, can't use" gate; Yoga Loop extra turn | Gate absent; extra turn missing | p3 G1, G2 | S2 |
| 9 | #442, #458, #643, #694, #116 | No printed Weakness → new Weakness ×2 | Override needs printed Weakness; Ticking Terror unparsed | p1 A 50 vs 100; attack-engine.mjs:199 | S2 |
| 10 | #550, #608, #618 (2026) | Smokescreen flip before Confusion flip | Confusion first | p2 F4; attack.mjs:1070 vs 1106 | S2 |
| 11 | #582, #584 | Ignoring defender effects keeps attacker-side reductions | Both dropped | p17 160 vs 130/140; attack-engine.mjs:172,322 | S2 |
| 12 | #419/#593, #232 | Attacker "N less/more" applies to Bench damage | Bench path ignores attacker markers | p1 C, p10 N4; attack-engine.mjs:144-150 | S2 |
| 13 | (C flag) double attacks | No main-phase actions between | Energy attach accepted between Ω Barrage attacks | p18 U2 | S2 |
| 14 | #686, #687 | Thumping Snore 2-flip sleep | Not implemented | p9 M3 | S2 |
| 15 | #254/#402, #379/#403 | Copy can't pick a condition-failing attack | Offered, then fizzles | p3 G5 | S3 |
| 16 | #731, #728 | Watch and Learn copying W&L copies the copy | Copies original | p3 G4; attack.mjs:621-640 | S3 |
| 17 | #350 | Jet Shoot +40 not added after W/R → 0 | Added | p1 B; attack-engine.mjs:263-264 | S3 |
| 18 | #11, #662 | Self-damage uses own W/R | No W/R | p1b E | S3 |
| 19 | #177 / E#20 | Double Thread W/R on Bench | Not applied | p10 N2 | S3 |
| 20 | #96, #346 | No switch → no status | Status applied to current Active | p8 L1 | S3 |
| 21 | #55, #432, #579, #73 | "Any card" search takes ≥1 | min 0 | p6 J1/J5 | S3 |
| 22 | #51 Bail Out | Must take 2 | Does nothing | p6 J4 | S3 |
| 23 | #340, #531, #532, #47, #650, #697 | Prizes taken = actually taken | Start − remaining | formats.mjs:88-90 | S3 |
| 24 | #29 | Extra Prize needs a base Prize | Added at base 0 | knockout.mjs:388-400 | S3 |
| 25 | #125/#413 | Bench damage counts for Counter | Only Active recorded | p7 K6; attack-effect.mjs:829 | S3 |
| 26 | #41, #575/#680, #563 | Attack effects before defender triggers | Handheld Fan/Rocky Helmet first | p4 H3/H4; attack-effect.mjs:913-1060 | S3 |
| 27 | #171 | End-of-turn effects, then deferred KO | KO first | turn.mjs:338 vs 463 | S3 |
| 28 | #48 | Victory Star rewinds Assist's copy coin | Not offered | attack.mjs:258-271,633-639 | S3 |
| 29 | #714, #146 | One DCE satisfies "discard 2 Energy" | Needs 2 cards | p15 R3 | S3 |
| 30 | #89, #90 | Damage, then Stadium discard (Calamity Storm) | Discard before damage | p4 H2, p5 I4 | S3 |
| E1 | E#4 Brick Smash | Weakness applies | Printed misprint followed | p11 E4 | S3 |
| E2 | E#33 Ghost Head | Can't KO Banette | Does nothing | p11 | S3 |
| E3 | E#29 Fainting Spell | Attacker KO'd on heads | Never triggers | p11 (I162/I227) | S3 |
| E4 | E#55 PlusPower | Before W/R | After W/R | attack-engine.mjs:269-274 | S3 |
| E5 | E#19 Double Rainbow | −10 before W/R | After | special-energy-parse.mjs:1207 | S3 |
| E6 | E#74 Shield Energy | −10 after W/R | Before | special-energy-parse.mjs:1216-1222 | S3 |
| E7 | E#1 Feebas Ascension | Flip, then evolve | Flip missing; evolve missing (#4) | p13 | S3 |

### MATCH (groups)
GX/VSTAR via copy (#2, #282, #401, #710, #727) · copy ignores cost (#121, #460, #131, #264, #283, #311, #330, #436, #461, #594) · W/R order (#5, #605, #349, #302, #304) · basics (#8–#14, #189) · effect lifetimes (#85, #435, #601, #112, #151, #469, #503, #602, #617, #612, #613, #616) · ignore-effects keeps W/R (#18, #271, #236, #251, #585, #99, #359, #476, #586, #587, #630) · new Active (#26, #654, #180, #181, #291, #322, #345, #387, #704) · chooser (#103, #488, #499, #500, #604, #681) · win (#40, #388; simultaneous win/tie) · KO order outcome (#312, #752) · bench-full searches (#91, #655) · Evolution Pokémon (#100, #633) · Energy units vs cards (#294, #392, #393, #146, #147) · no stacking (#195, #196, #400, #545) · self-counter overkill (#37, #716, #255, #524, #637) · drain (#288, #361, #362) · flip-before-cost (#344, #552) · failed attack spends nothing (#415, #718, #729) · effects after damage (#459, #708) · KO w/o Prize counts (#525, #526, #530, #722) · skip between turns (#702) · Tera vs own attacks (#164, #193, #444) · Active counters not damage (#6, #353, #373) · errata E#37, E#85, E#16, E#56, E#71, E#64.
C's flags: +N needs base MATCH; counters≠damage MATCH Active / MISMATCH Bench; Confusion self-damage counters MATCH; Confusion per double attack MATCH; W/R not effects MATCH.

### SUPERSEDED / X
SUPERSEDED #609, #610, #611. X: #3, #64, #228, #258–260, #300, #305–310, #341, #342, #356, #366, #556, #649, #651, #663, #669, #670, #695, #696, #701, #746; E#7, E#17, E#21, E#22, E#34, E#50, E#51, E#73.

### Cross-checks raised
A: Neutralization Zone didn't prevent ex damage (p5 I4 control 100 vs 0) · Battle Cage vs counters · Eviolite on self-damage · old Trainer "up to" printings · Juniper/Sycamore/Research · old Rare Candy/Potion/Great Ball/Quick Ball errata · Steven's Advice/Mt. Moon thresholds. C: Ancient Bulwark scope; Sticky "excluding any Ariados" vs replaceSelfName. General: out/attack-simulator-audit.md is stale (copy-attack rows now work; attack evolution & modified Poison wrongly marked "works").

---

## Auditor C — Abilities (777) + Energy (128)
Probes: probes/ (helper h.mjs); triage: triage-C.json. Orchestrator re-ran p1, p13b, p13c, p14b, p19 — all reproduce.

### Header
| | abilities | energy |
|---|---:|---:|
| Rulings | 777 | 128 |
| Unique after de-dup | 686 | 125 |
| G / C / X | 142 / 618 / 17 | 34 / 89 / 5 |
| Verified (incl. dups) | 155 (78 G, 77 C) | 35 (22 G, 13 C) |
| MISMATCH / PARTIAL / NOT-IMPL / MATCH / SUPERSEDED | 66 / 2 / 26 / 61 / 0 | 11 / 1 / 5 / 15 / 3 |
| UNVERIFIED / X | 605 / 17 | 88 / 5 |

### Findings
| # | Ruling(s) | Compendium | Engine | Evidence | Sev | Known |
|---|---|---|---|---|---|---|
| F1 | Dummy Doll #191-193, Sonic Slip #635-636, Stance #656-659 | Optional on-play/evolve protection lasting until end of opponent's next turn | Permanent immunity whether used or not; 9 printings (Espathra PAR197, Garchomp BRS109, Mimikyu V TG16, Crobat UNB66, Pupitar LOT116, Lucario SM54, Greninja XY24…) | ability-executors.mjs:400-406; ability-combat.mjs:564-580; p13b, p14 | S1 | new |
| F2 | Shield Star #590 | −100 only during opponent's next turn after use | Always −100 | ability-combat.mjs:524-547; p13c | S1 | new |
| F3 | Enthusiastic Dance #232 | +100 this turn after use | Always +100 for Basic attackers | ability-combat.mjs:507; p14b | S1 | new |
| F4 | Precious Gift #504-507, Sunny Bloom #674 | Used at end of turn, after attack and Prizes | Usable mid-turn; not offered at end of turn | ability-triggers.mjs:363-383; ability-combat.mjs:1355-1450; p19 | S1 | new |
| F5 | #150, #183, #251 | "Can't use more than 1 X Ability each turn" is a name-level limit | Not enforced (18 printings, incl. Pidgeot ex) | effects/ability.mjs:96; legality.mjs:1504; p1 | S1 | new |
| F6 | #112, #263, #478 | A Pokémon back in play is new; Ability usable again | Marker survives leaving play; stale stamp in hand | effects/ability.mjs:91,96; turn.mjs:520-527; p2, p2b | S2 | new |
| F7 | #50, #54, #210-212, #321, #51 | First lock in effect wins; a switched-off lock doesn't lock | A suppressed suppressor still suppresses | ability-combat.mjs:1327-1345; p6, p6b | S2 | new |
| F8 | #204 (#454, #763) | In-play locks don't stop Abilities used from hand | Stadium lock blocks hand-activated Abilities | legality.mjs:1515-1525; p15 | S2 | new |
| F9 | #202, #358, #430 | Ability/Trainer/attack attaches from hand also trigger "attach from hand" | Only manual attachCard triggers | attach.mjs:106-127,266; p5 | S2 | new |
| F10 | #114-116, #201, #203, #332-335 | Opponent-side attach punishers | Not implemented (Gengar ex Gnawing Curse etc.) | ability-triggers.mjs:259-321; p4 | S2 | new |
| F11 | #233-234, #362-363, #194, #324, #132-133, #769-770, #306, #395 | On-KO search/return; attacker +1 Prize; Lost Out | Not implemented | ability-triggers.mjs:520-560; ability-combat.mjs:946-953; p18, p23, p23b | S2 (Lost Out S3) | new |
| F12 | E1, E40, E109 | Special Energy has its type only while attached | Typed Special Energy matches typed searches in deck/discard | energy-effects.mjs:285-288; p8 | S2 | new |
| F13 | E10, E82, E86; E81 partial | Rainbow/Aurora/Luminous count for typed discards | Ignored | p9 | S2 | new |
| F14 | E99-E100, E116, #194 | Whole evolution line returns to hand | Only root Basic returns | knockout.mjs:453-463; p21 | S2 | new |
| F15 | #55, #274 | "No Retreat Cost" can't be increased; Field Runner | Rescue Board + Big Net = 1; Field Runner missing | retreat.mjs:60-92; p11, p11b | S2 | new |
| F16 | #641-645, E16/E21/E36/E79/E93 | Spectral Breach: Special Energy provides {C} only | Not implemented | p16; energy-effects.mjs:379-386 | S2 | new |
| F17 | #28 | α Growth gives 1 extra attachment | Offers 2 extra | attach.mjs:128-150; p24 | S2 | new |
| F18 | #647 | Phantump: not on your first turn | Allowed turn 1 | p20 | S2 | new |
| F19 | #407, #712, #714, #651, #538, #406, #287 | No Ability for no effect; failed attempt not spent | Allowed and spent | p3 | S3 | new |
| F20 | #309 | Pokémon Power is not an Ability | Suppressed by "no Abilities" locks | ability-combat.mjs:1313-1345; p7 | S3 | I239 |
| F21 | #213 | Rule Box = BW onward, includes BREAK | Pre-BW ex/LEGEND are Rule Box; BREAK isn't | card-classify.mjs:57-60,199-216 (D73/D74) | S3 | partly by design |
| F22 | #281 | Flaming Fighter doesn't stack | Stacks | p12 | S3 | new |
| F23 | #7 | Abnormal Outbreak: only player going second | First player allowed turn 1 | p20 | S3 | new |
| F24 | #669, #366, #483 | Ignored/set cost can't be increased | Stadium increase after ignoreAll | legality.mjs:588-598 | S3 | new |
| F25 | #151-152 | Dark Aura: attached Energy is {D} | Not implemented | p16 | S3 | new |
| F26 | E95 | Recycle Energy discarded for Retreat → hand | Goes to discard | p21 | S3 | new |
| F27 | #85 PARTIAL | Promotion trigger used immediately | Usable any time that turn | ability-combat.mjs:1435-1447 | S3 | new |
| F28 | #373 PARTIAL | Can't use with opponent's Bench full | Legal, spent with no effect | p25 | S3 | new |

Shared cause: F1–F4 — passive combat readers treat optional timed Abilities as always on; one activation marker with a turn window fixes all four.

### MATCH
#2/#113/#408/#663 Ability resolves fully first (reduce.mjs:154-172) · #3/#8/#73/#315/#346/#357/#432/#571/#710 once-per-turn per Pokémon (effects/ability.mjs:93-96) · #196/#288/#433/#583 Bench round trip doesn't reset (turn.mjs:520-527) · #5/#649 Bench Abilities (legality.mjs:396-407) · #6/#53 Ancient Traits not Abilities · #222/#727 Abilities under Special Conditions; Poké-Power stop clauses (p4, p15) · #515/#639 no Abilities after attack (legality.mjs:697-716) · #761 in play only · #162/#348/#424 played-to-Bench triggers locked (p15) · #48/#462 Ability attach is extra (p4) · #482 "up to" needs ≥1 (p17) · #143/#554 Ability before KO check (p22) · #377 Wild Growth/Jungle Totem (p16) · #414/#668/E43 zero cost not increased; printed 0 is (p11) · #404/#434/#436 checkup add-ons stack (p12) · #579/#581 Shadowy Concealment (p18) · #64/#65 Block vs Switch (p26) · #163/#655 discard empty hand (p26) · #653 extra turn not first turn · #499/#178/#715/#637 discard-then-draw on empty deck (p3) · #620/#289 tails/failed search spends Ability · #277/#278 cost modifiers on granted attacks · #664 Basic {W} excludes Wash · E6/E9 one attachment, Bench OK · E12/#638 moving ≠ attaching · E14/E85/E88 Aurora/Rainbow untyped off-board · E15 Aurora discard · E87 Rainbow counter · E41/E117/E118/#188/E104 typed Special Energy limits · E55/#220 not Basic · E126 V Guard no stack.

### SUPERSEDED / X
SUPERSEDED: E5, E7, E83 (WotC energy-type rulings). X: #1, #43, #92, #340, #654, #72, #195, #308, #518, #589, #652, #62, #713; E4, E19, E89, E97, E125. Not in pool: Drawareness, Poisonous Nest.

### Unverified G
Abilities: 4, 9, 10, 11, 19, 20, 21, 52, 58, 63, 87, 95, 97, 98, 101, 111, 153, 157, 168, 170, 171, 223, 224, 262, 286, 299, 319, 322, 341, 391, 403, 409, 454, 457, 463, 465, 479, 480, 481, 501, 529, 534, 558, 559, 575, 597, 598, 600, 617, 625, 634, 670, 678, 683, 685, 705, 706, 711, 724, 728, 741, 754, 755, 757. Energy: E2, E3, E8, E17, E23, E26, E44, E58, E65, E102, E103, E124 (most routed to A/B as cross-checks).

---

