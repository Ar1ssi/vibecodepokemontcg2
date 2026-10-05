# 063: Gen 5 (Black & White era) audit fixes
Status: approved (self — one-shot)
Date: 2026-10-05 · Session: S337

## Problem
User, verbatim: "One shot the fixes then push to main" — the fixes for the Gen 5 card-effect audit
(`.agent/designs/refs/063-bw-card-audit-2026-10-01.md`, findings F1–F10, ISSUES I242–I253).
Live BW games misplay: TCGdex type words kill passive Abilities (Dark Cloak), Team Plasma is never
recognised, ACE SPEC is unenforced, staple Trainers misplay (Pokémon Catcher, Rocky Helmet, N),
and ~45 attacks, ~30 Abilities and ~25 Trainers/Tools/Stadiums do nothing or the wrong thing.

## Acceptance
| # | Criterion (the brief's words: "the fixes" = every audit finding) | Evidence |
|---|---|---|
| A1 | F1/I242: BW TCGdex wording (type words, U+FFFD, "oppoent's", ",the") reads like the pkmncards wording in a live game | |
| A2 | F2/I243: Team Plasma cards (by TCGdex id) are recognised by every attack, Ability, Trainer, Tool and Stadium reader that names them | |
| A3 | F3/I244: the 13 BW ACE SPEC cards are ACE SPEC (deck limit, Spiritomb lock) | |
| A4 | F4/I245: the 18 no-effect attacks run their printed effect | |
| A5 | F5/I246: the 28 partial attacks run their whole effect | |
| A6 | F6/I247: the 25 unenforced passive Abilities are enforced | |
| A7 | F7/I248: Plasma Steel only shields {M} Pokémon; Silver Bangle only boosts against Pokémon-EX and not on an EX holder | |
| A8 | F8/I249: the 6 half-run activated Abilities run fully | |
| A9 | F9/I250: Pokémon Catcher flips, Rocky Helmet/Rock Guard fire, N shuffles, Aspertia +20 HP, Virbank +20 poison on the server, Battle City has no invented discard | |
| A10 | F9/I252: the Trainer/Tool parse and holder-gate rows of Appendix B work | |
| A11 | F9/I253: a second Tool can't be attached through playTrainer | |
| A12 | F10/I251: bwp-BW78 Raichu evolves only from its printed Basic | |
| A13 | Gates: full `pnpm test`, `audit:oracle`, `audit:abilities`, `audit:attacks`, `audit:trainers` green; the BW TCGdex-text corpus re-run shows the fixes | |

## Assumptions
- (assumed) "the fixes" covers every finding of the audit report; a row is cut only when it needs a
  ruling nobody can source or an engine capability that does not exist (process doc §0).
- (assumed) Audit numbers renumbered I233–I244 → I242–I253 (main used I233–I241 meanwhile).
- (assumed) F10's "4 promos with no retreat field" is not a bug: pkmncards prints retreat 0 on
  bw11-RC23 Emolga, bwp-BW51 Crobat, bwp-BW76 Electrode, bwp-BW91 Jolteon (card pages, 2026-10-05).
- (assumed) Text normalization happens where card data enters (server `cardStats`, client
  enrichment), per D202, not in each reader; modern TCGdex already prints `{X}`, so it is a no-op
  there (checked sv01-086 Gardevoir ex).

## Constraints
- D202: rewrite old wording to the wording the parsers already read; derive missing metadata at
  data entry. D200: printed markers come from the generated table, never from names.
- Card text looked up, never recalled: pkmncards corpus `out/pkmn-bw-*.json`, TCGdex snapshot.
- Engine/rules changes ship with a test that fails without them; at least one test per group goes
  TCGdex-shaped detail → `cardStats` → reducer (process doc §5 lesson 1).
- No approximations; unsourced rulings are filed, not guessed.

## Current state (read this session)
- Live data path: TCGdex detail → client `ensureCardData` (`rules-state.mjs` ~470-505) →
  `buildCardStatsPayload` (`client/src/setup/netcode/card-stats.js`) → server `cardStats`
  (`reduce.mjs:10818`) which copies hp/attacks/abilities/text/trainerType and derives a WotC
  trainerType (D202). Server cards carry `id/set/number/src` from `loadDeck` (`reduce.mjs:10758`)
  but Pokémon get no `subtypes`.
- `symbolizeTypeWords` (`attack-text.mjs:70`) turns "Darkness Energy"/"ColorlessColorless" into
  `{D}`/`{C}{C}`; only `damage-parser.mjs:370` and `normalizeAttackText` call it.
- `hasCardMarker` (`card-markers.mjs:47`) answers by subtypes or TCGdex id; only
  `search-match.mjs:92` uses it for Team Plasma.
- `isAceSpecCard` (`card-classify.mjs:143`) reads subtypes/rarity; BW ACE SPEC have rarity "Rare".

## Options
1. Type words: (a) symbolize at data entry (server `cardStats` + client enrichment) — one path,
   matches the corpus every gate already tests; (b) symbolize inside every reader — dozens of call
   sites, easy to miss one. Pick (a) (D202).
2. Team Plasma: (a) one helper `isTeamPlasmaCard(card)` over `hasCardMarker`, called by every
   reader; (b) copy markers into `subtypes` at entry — but readers also match names or split
   subtypes on spaces, so they still need edits, and subtypes double as a stage fallback. Pick (a).
3. ACE SPEC: (a) add an `ACE SPEC` marker to the D200 generator (pkmncards `is:ace-spec`, 46
   printings) and read it in `isAceSpecCard`; (b) a hand list of 13 ids — drifts. Pick (a).
4. Build: three judgment groups by engine area (attacks / Abilities / Trainers-Tools-Stadiums),
   each an agent in its own worktree, after slice 1 lands the shared helpers (process doc §3).

## Design
### Slice 1 · Data entry (inline)
- `shared/engine/rules/tcgdex-text.mjs` (new): `normalizeTcgdexText(text)` — non-strings returned
  unchanged; `Pok�+mon` → `Pokémon`; `\boppoent's\b` → `opponent's`; `,` directly followed by a
  letter → `, `; then `symbolizeTypeWords`. Idempotent.
- `reduce.mjs` `cardStats`: normalize `attacks[].text`/`effect`, `abilities[].text`, `text`.
- `rules-state.mjs` enrichment: same normalization on ability text, mapped attacks and
  `effect`/`text`, so the legacy client and the payload agree.
- `card-markers.mjs`: `isTeamPlasmaCard(card)` = `hasCardMarker(card, 'Team Plasma')` or name
  "Plasma Energy" (bw8-127/bw9-106/bw10-91 are in the table; the name covers id-less cards).
- `MARKERS` + generator gain `ACE SPEC: 'is:ace-spec'`; regenerate the table (only ACE SPEC lines
  may change); `isAceSpecCard` also reads the marker; `playableCategories`
  (`ability-combat.mjs:1468`) pushes `ACE SPEC` when `isAceSpecCard`.
- Raichu bwp-BW78 `evolveFrom`: TCGdex errata only if pkmncards prints it; else file.
### Slices 2–4 · Agent groups (each owns its files; they report, I merge)
- G-ATK (attack parse/executors/conditions): Appendix A rows + Team Plasma attack readers
  (`attack-damage-context.mjs` `ruleBoxKinds`, `effects/attack-steps.mjs` `rootHasTag`, Haxorus KO,
  Teampact, Golurk Iron Fist, Raiden Knuckle, Transfer Junk, Solar Transporter).
- G-ABL (Abilities): F6 list, Plasma Steel filter, F8 list, Team Plasma Ability readers (Power
  Connect, Dark Shade, Freeze Zone, Drifting Balloon). KO hooks may touch `reduce.mjs`/`ko-flow.mjs`.
- G-TRN (Trainers/Tools/Stadiums): I250, I252, I253, Silver Bangle/Mirror, Reversal Trigger,
  Frozen City, Team Plasma Badge, G Booster/G Scope, Victory Piece, Crystal Wall, Hooligans,
  Cedric Juniper; Revive and First Ticket only with a cited ruling / existing capability.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Text field missing / non-string | normalizer returns it unchanged | [ ] |
| 2 | Already-symbol text (modern TCGdex, pkmncards) | unchanged (idempotent) | [ ] |
| 3 | Names that contain type words (Dark Patch, Fire Crystal, "Water Gun attack") | unchanged | [ ] |
| 4 | Card with no id (tests, e2e) | Team Plasma only via subtypes or "Plasma Energy" name | [ ] |
| 5 | cardStats arrives mid-game | normalization in place, never rebuilds zones | [ ] |
| 6 | Hidden info (Hooligans random pick, N) | opponent's hand choice random, not revealed to the chooser | [ ] |
| 7 | Card variants across eras (Rocky Helmet modern vs BW wording, N reprints) | both wordings work | [ ] |
| 8 | Modern cards (all corpora) | parse unchanged unless listed under Deviations | [ ] |

## Test plan
Unit tests per slice beside the touched module (`__tests__/`), each failing without the fix and
citing its source row/id. One TCGdex-shaped → `cardStats` → reducer test per group. Gates: full
`pnpm test`, `audit:oracle`, `audit:abilities`, `audit:attacks`, `audit:trainers` (baselines
refreshed for improvements only), plus the BW TCGdex-text corpus re-run (`out/tcgdex-bw-pokemon-corpus.json`).

## Migration / rollout
n/a: no stored data changes; reverting the commits restores the old behaviour.

## Work plan
| Slice | Files | Signatures & data | Test cases | Rulings (source) | Green when |
|---|---|---|---|---|---|
| 0 | this design, NEXTSTEPS.md | — | — | — | committed |
| 1 | `rules/tcgdex-text.mjs` (new), `reduce.mjs` cardStats, `rules/rules-state.mjs`, `rules/card-markers.mjs`, `rules/card-classify.mjs`, `rules/card-markers.generated.mjs`, `scripts/generate-card-markers.mjs`, `rules/ability-combat.mjs` (playableCategories) | `normalizeTcgdexText(text: any): any`; `isTeamPlasmaCard(card): boolean` | Dark Cloak bw5-63 TCGdex text via cardStats → free retreat with {D}; Stickiness bw7-45 → +1; Claydol bw6-64 text → `atkGust`; Computer Search bw7-137 → isAceSpecCard true; Spiritomb bw11-87 blocks it; Snorlax bw8-101 → isTeamPlasmaCard | TCGdex snapshot; pkmncards `is:ace-spec` | `pnpm test:changed` green |
| 2 | attack modules (G-ATK) | per Appendix A row | each Appendix A row with its condition true, both outcomes for coins | `out/pkmn-bw-cards.json` rows, TCGdex ids | agent tests + `audit:attacks` |
| 3 | Ability modules (G-ABL) | per F6/F7/F8 row | each row with and without its text | same | agent tests + `audit:abilities` |
| 4 | Trainer/Tool/Stadium modules (G-TRN) | per Appendix B row | each broken/partial Appendix B row | same | agent tests + `audit:trainers` |
| 5 | merge, baselines, harness | — | full suite + 4 gates + BW TCGdex corpus | — | all green, review done |

## Deviations (Builder appends here during build)
