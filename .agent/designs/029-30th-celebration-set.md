# 029: Support the 30th anniversary set (30th Celebration + Classic Collection)
Status: draft — waiting on user approval
Date: 2026-09-23 · Session: S264

## Problem
The 30th anniversary set released 2026-09-16 cannot be browsed in the deck builder, and its
PTCGL code does not resolve on deck import, so its cards cannot be played.

## Constraints
- Card data from TCGdex or the repo's scrape scripts, never model memory.
- Never hand-edit `*.generated.mjs`; regenerate through scripts (D97, D98, D100).
- Legality must come from a source, not a guess.

## Current state (read S264)
- TCGdex `/v2/en/sets` lists `30th` "30th Celebration" (158 cards, 128 official, serie `me`,
  released 2026-09-16, abbreviation.official `30C`, `legal: {standard: false, expanded: true}`)
  and `30th-c` "30th Classic Collection" (30 reprints, 0 official, same `30C` abbreviation).
- `client/src/setup/deck-builder/core/set-browser.mjs` — hand-kept `LEGAL_SET_REGISTRY` (2026-27
  Standard, source Bulbapedia) + a short `{series, setId}` tail; drives the set browser tabs.
- `shared/engine/rules/legacy-set-ids.mjs` — `MODERN_SET_CODE_TO_TCGDEX_ID` (PTCGL code → TCGdex
  id, e.g. `PBL: 'me05'`); comment says keep in sync with `scripts/generate-starter-decks.mjs`
  `SET_MAP`.
- `client/src/setup/deck-builder/core/deck-validation.mjs` — Standard/Expanded validation.
- `scripts/scrape-pkmncards*.mjs` → `out/pkmn-*-cards.json` corpus used by the ability/attack audits.

## Options
1. **Legality.** TCGdex marks both sets and their cards (e.g. `30th-157`, `30th-c-001`)
   `standard: false, expanded: true`; the cards carry no `regulationMark`, and
   `deck-validation.mjs` has no regulation-mark path.
   A: follow TCGdex — Expanded only; sourced.
   B: Standard-legal on the user's ruling — unsourced in the repo, so it would need that ruling
   recorded in DECISIONS.md.
   **Pick A** unless the user rules otherwise.
2. **`30C` code collision** (both sets share it). A: map `30C` → `30th` and resolve Classic
   Collection by name. B: map `30C` → `30th`, and on a name mismatch retry `30th-c` with the same
   number. **Pick B** — number collisions are real (both have #001–#030).
3. **Set browser placement.** A: its own tab in the Mega Evolution series. B: an "other" category
   like `151`. **Pick A for 30th, B for 30th-c** (reprints, no official numbering).

## Design
- `legacy-set-ids.mjs`: `'30C': '30th'`, plus a `SET_CODE_FALLBACKS = { '30C': ['30th-c'] }` read by
  `buildSetCardId` callers on a name mismatch. Mirror `30C` in `generate-starter-decks.mjs`
  `SET_MAP` (script, not the generated file).
- `set-browser.mjs`: registry entries `{series:'me', setId:'30th', name:'30th Celebration'}` and
  `{series:'me', setId:'30th-c', name:'30th Classic Collection', category:'other'}`.
- Legality per option 1: the set is listed for browsing and Expanded validation; Standard
  validation rejects its cards (tests pin both).
- Corpus: run `scripts/scrape-pkmncards.mjs` (and trainers/special-energy) for the new set so
  the ability/attack audits include it; then rerun the audit scripts and file any unsupported
  effects in ISSUES.md (not fixed in this design).

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Deck line `30C 157` (Mewtwo ex) | resolves to `30th-157` | [ ] |
| 2 | Deck line `30C 1` naming a Classic Collection card | falls back to `30th-c-001` | [ ] |
| 3 | Unknown number `30C 999` | same unresolved path as any bad line | [ ] |
| 4 | TCGdex down during browse | existing cachedFetchJson/IndexedDB behavior; tab shows error state | [ ] |
| 5 | 30th card in a Standard deck | rejected with the existing not-legal message | [ ] |

## Test plan
Unit: set-code mapping + fallback, registry contains both sets, validation for 30th cards
(Standard rejects / Expanded accepts). Manual: browse the set tab, import a list with `30C` lines.

## Migration / rollout
Additive data only. Revert: remove the registry entries and the code mapping.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | Code mapping + fallback + registry entries + tests | tests green |
| 2 | Legality rule + tests; scrape + audit run, gaps filed in ISSUES.md | tests green |

## Deviations (Builder appends here during build)
