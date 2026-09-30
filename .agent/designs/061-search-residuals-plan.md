# Design 061 — Trainer search/recovery residuals that need a decision (draft)

Status: approved (user, S333) — Q1 new `selectMode` prompt · Q2 add an `orderCards` prompt
(Group C becomes M: `searchDeck { destination: 'deckTop' }` asks a second
`pendingChoice { type: 'orderCards' }` over the picks; client renders a drag/number list) ·
Q3 prompt for the optional cost · Q4 leave Group E over-inclusive, file one ISSUE.
Build order: F + B → A → C → D; E is an ISSUE line only.
Built (PR 200, landed S334): Q1 and Q2 reuse existing prompt shapes instead of new pendingChoice
types: modes are a label-option pick (the attack prompts' shape), deck-top order is one pick per
position (Gothorita's shape). Same rules result, no netcode change (D199). E filed as I220.
Follows design 060 (five pinned slices, landed on `claude/parse-audit-fix`). Every card below is
still parsed wrongly after 060; each group needs a new step shape, a new prompt, or new data,
so none was pinnable for `slice-builder` without a choice.

Sources: `out/pkmn-trainer-cards.json` (set, number per card). Verification per slice:
`node --test <slice test>` → `pnpm test:changed` → `npx eslint --quiet <files>` →
`pnpm audit:trainers` (cards must lose their tag) → `--update-baseline` → full `pnpm test` before
`main`; `pnpm audit:oracle` after any executor change.

## Group A — "Choose 1:" / "Choose 1 or both:" modes (12 cards, biggest payoff)

Cards: Kieran, Klara, Serena, Tate & Liza, Ingo & Emmet, Giovanni's Scheme, Great Haul Net,
Ordinary Rod, Rescue Stretcher, Judge Whistle, Energy Recycle System, Fossil Excavation Map.
Today: the first mode's steps run unconditionally; the other mode is dropped (I190).

Plan (M, one session):
1. Parser: split on the printed bullets (`• …`) or "Choose 1: A. B." sentences; parse each mode's
   text with `parseTrainerStepsInner`; emit
   `{ type: 'chooseMode', max: 1 | 2, modes: [{ label: <mode text>, steps: [...] }] }`
   (`max: 2` for "Choose 1 or both"). Unrecognizable mode → whole card unrecognizable (as now).
2. Executor: `case 'chooseMode'` asks a `pendingChoice { type: 'selectMode', options: labels,
   min: 1, max }`; on resume it splices the chosen modes' steps into the step list after the
   current index (same mechanism `coinFlip` uses for its branches) so nested prompts work.
3. Client: authoritative `apply-view` renders `selectMode` as a button list (reuse the coin-call
   prompt chrome); legacy `trainer-execution.js` gets a `chooseMode` case with the same picker.
4. Gate: `classifyTrainer` flattens `chooseMode.modes[].steps` (and `coinFlip` branches, the
   flag from slice 5) before comparing, so a step moving into a mode is not a lost step.
5. Tests: parse for all 12; execution for Klara (both modes), Judge Whistle (one), Fossil
   Excavation Map (nested search prompt inside a mode).

Decision needed: **Q1** — a new `pendingChoice.type` ('selectMode') touches the netcode
surface (client + server + view redaction); alternative is to auto-pick when only one mode is
playable and prompt otherwise. The prompt is the correct rules behaviour.

## Group B — Old Rod: "If both are heads … If both are tails …" (2 printings)

Old Rod (Neo Revelation 64, Dragon Frontiers 78). Today: `coinFlip` has `heads`/`tails` only;
the tails branch would fire on one head. Plan (S): `coinFlip` gains optional
`outcomes: [{ headsExactly: 2, steps }, { headsExactly: 0, steps }]`; the executor picks the
matching outcome (none → no effect). Parser branch in `parseCoinFlipStep`; one test each.
No user decision: this is the printed rule and the field is additive. Will do unless vetoed.

## Group C — search N, shuffle, put them on top in any order (3 cards)

Mallow (Guardians Rising 127, 145), Ciphermaniac's Codebreaking (Prismatic Evolutions 104).
Today: the cards go to the hand. Plan (S/M): `searchDeck { destination: 'deckTop' }`; the
executor removes the picks, shuffles, then pushes them on top **in the order selected**
(first selected = top). No second "arrange" prompt exists in the engine.

Decision needed: **Q2** — accept selection order as the stacking order (cheap, one prompt), or
add a reorder prompt (`pendingChoice.type: 'orderCards'`, new client chrome, M)?

## Group D — optional cost with an "If you do," second effect (3 cards)

- Guzma & Hala (Cosmic Eclipse 229): after the Stadium search, "you may discard 2 other cards
  from your hand. If you do, you may also search for a Pokémon Tool card and a Special Energy
  card in this way."
- Red & Blue (Cosmic Eclipse 234): after the GX evolve, "you may discard 2 other cards … If you
  do, search your deck for up to 2 basic Energy cards and attach them to the Pokémon you evolved."
- Jasmine (Team Up 177): "If you go second and it's your first turn, search for 5 {M} Pokémon
  instead of 1." (a count override, no cost)

Plan (M): `{ type: 'optionalCost', cost: { type: 'discardCost', count: 2, other: true },
prompt: 'Discard 2 other cards?', then: [steps] }` — executor asks a yes/no (`selectCards` with
min 0 / max 2 over the hand, where fewer than 2 picks = decline), pays, then splices `then`.
Jasmine: `searchDeck.countIf: { goingSecondFirstTurn: 5 }` read by the executor from
`draft.turn` + the seat order. Needs `matchesSearch('Special Energy')` (Energy whose name is not
"Basic … Energy" / subtypes include Special).

Decision needed: **Q3** — prompt the player (rules-correct; a new prompt shape) or auto-accept
the cost when the hand allows it (no prompt, but discards cards the player may not want to)?

## Group E — marker filters with no card data (16+ cards)

Single Strike / Rapid Strike / Fusion Strike (Mustard, Welcoming Lantern, Chili & Cilan & Cress,
…), Future / Ancient (Techno Radar, …), Tera (Tera Orb), Team Plasma (Team Plasma Ball, Shadow
Triad, Team Magma Admin's team), Hop's (Hop's Bag), Baby (Friend Ball, Dual Ball EXP), TAG TEAM
(Tag Call), Prism Star (Lisia), Technical Machine (Traveling Salesman, TM Machine).
Today: these filters match any (Basic) Pokémon / any Supporter — a strictly larger pool.
The corpus text has no marker line (checked: 0 hits for Tera/Team Plasma/TAG TEAM/Prism Star/
Baby as a card tag; the few Single/Rapid/Fusion Strike hits are inside other cards' text).

Plan (M–L): a generated `shared/engine/rules/card-markers.generated.mjs` keyed by
`${set}-${number}` → markers[], built by a scraper over pkmncards.com (the page header lists the
tags; `scripts/scrape-pkmncards.mjs` already fetches those pages) or from TCGdex where a field
exists (Tera: `stage`/`suffix`; TAG TEAM: name; Prism Star: rarity; Baby: Neo-era stage). Then
`matchesSearch` checks `markers` for the known words; the deck builder's card objects need the
field too (`card-classify.mjs`). ~2 sessions including the scrape.

Decision needed: **Q4** — do the scrape + table (L, correct pools), or leave these as
over-inclusive pools and file one ISSUE (S)?

## Group F — exclusions (3 cards) — will do, no decision

"except for Pokémon-EX" (Brigette), "other than a Baby Pokémon" (Dual Ball EXP 139, needs
Group E for Baby), "different" (Ball Guy): `searchDeck.exclude: '<what>'` and
`searchDeck.distinctNames: true`, applied in the executor's candidate filter and selection
validation. S. Also the TM Machine follow-up from slice 1 (`pokémon tool cards?` in the
name-clause kinds). S.

## Order (after answers)

F + B (S, one session, no gate risk) → A (M) → C (S/M) → D (M) → E (L, only if Q4 = scrape).
Each lands as its own commit with the ratchet; `review.md` by a second agent before `main`
for A, C, D (executor + netcode surface).
