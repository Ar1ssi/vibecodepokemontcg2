# Deck Builder — Multiple Saved Decks ("My Decks")
    
    ## What this adds
    The Deck tab's Deck Builder now has a **My Decks** bar:
    - **+ New Deck** — creates a named deck in your browser's local storage.
    - **Click a deck chip** — opens it in the editor for P1 (or P2 in solo mode);
      any card you add or remove is autosaved into that deck instantly.
    - **✎ / ✕ buttons** on each chip — rename or delete the deck (with confirm).
    - Up to 60 decks are kept per browser profile.
    
    ## Files changed
    - `client/index.ejs` — My Decks bar markup (between header and P1/P2 target bar).
    - `client/src/css/index.css` — styles for bar, chips, and dark mode.
    - `client/src/initialization/document-event-listeners/sidebox/native-deck-builder.js` — library wiring (open/save/switch/clear hooks).
    - `client/package.json` — added `"type": "module"`.
    - `package.json` — `pnpm test` includes the new test file.
    
    ## Files added
    - `client/src/initialization/document-event-listeners/sidebox/native-deck-builder-library.js` — UI controller for the My Decks bar.
    - `client/src/setup/deck-builder/core/deck-library.mjs` — pure library logic (create/rename/delete/save/list, persistence, shape repair).
    - `client/src/setup/deck-builder/__tests__/deck-library.test.mjs` — 13 unit tests.
    
    ## Verification
    - 92/92 unit tests pass (79 existing + 13 new): `pnpm test`
    - Server boots; page and all modules serve correctly over HTTP.
    - jsdom DOM smoke test (12 checks) exercises the real module: create → open →
      autosave → reload persistence → reopen → rename → delete.
    
    ## Design notes
    - Decks persist in localStorage (`ptcg-sim.deck-library.v1`).
    - "Which deck is open for editing" is session-only state — reload detaches the
      editor from any saved deck so a stale binding can never overwrite a saved deck.
    - Clearing the editor detaches from the saved deck (never wipes the saved copy).
    - Switching P1/P2 saves the outgoing deck first, so decks never cross-contaminate.

# Rules mode — Trainer card effects: discard cost + sequential play flow

## What this adds
When a Trainer card with a **discard cost** is played (e.g. **Ultra Ball** —
"discard 2 other cards from your hand"), the rules engine now guides the
play step by step instead of opening the search immediately:
1. **Discard-cost picker** — a multi-select menu of your hand cards opens;
   select exactly the required number and click **Confirm** (or Cancel).
   Confirm stays disabled until the right number of cards is selected.
2. **Only after the cost is paid** do the selected cards move to discard
   and the deck get unlocked, and the **filtered search picker** opens
   (previously the picker appeared before the cost was paid).
3. Cancelling announces "cost not paid — effect canceled" and the effect
   stops; if your hand can't cover the cost, the engine announces it and
   asks you to play the card manually.

The cost parsing is general (any "discard N other cards" wording), and
Trainer cards **without** a cost behave exactly as before.

## Files changed
- `client/src/setup/rules/rules-bridge.js` — `openChoicePicker` gained
  multi-select (`multiSelect`/`requiredCount`/`onConfirm`/`onCancel` +
  toggle-select items and a Confirm button; single-select callers unchanged);
  the Trainer branch of `hookTrainerPlay` now runs cost picker → discard →
  search picker in sequence.
- `client/src/css/index.css` — `.choice-picker-item.selected` and
  `.choice-picker-confirm` styles (+ light-mode overrides).

## Verification
- 156/156 unit tests pass (includes Ultra Ball discard-cost ordering +
  generalized "discard N" cases in `trainer-effects.test.mjs`): `pnpm test`
- `node --check` on the edited JS passes. Lint/format not run in the
  sandbox; the picker flow is DOM-heavy and not visually verified in-browser.

# Rules mode — Trainer effects: "draw N" auto-play + generic deck-search pickers

## What this adds
Extends the guided Trainer play flow (above) to more effect types:
1. **Bare "Draw N cards"** (standalone draw steps, e.g. "Then, draw 3 cards.")
   are now recognized by the effect parser and **auto-executed** when the
   Trainer card is played — deterministic, no menu needed.
2. **Generic deck-search picker** — "search your deck for …" effects are not
   limited to searching for a Pokémon into the hand. Any parsed destination
   (hand or bench) opens the filtered choice picker; multi-card searches
   ("search for 2 Pokémon") use the multi-select + Confirm pattern from the
   discard-cost picker.
3. Branch order in the parser keeps special cases working:
   discard-hand-then-draw and shuffle-hand-then-draw still parse as their
   combined steps, and "search… then draw" still runs the interactive search
   before the (auto) draw — all guarded by regression tests.

## Files changed
- `client/src/setup/rules/trainer-effects.mjs` — new bare-`draw` parser branch
  (placed after `searchDeck` so search-then-draw keeps its picker) + a
  `draw` case in `describeStep` (singular/plural).
- `client/src/setup/rules/rules-bridge.js` — `autoExecuteTrainer` handles the
  `draw` step (draws N cards, keeps the Nest-Ball single-Basic auto-bench
  special case); `hookTrainerPlay`'s search-step hoist is broadened (any
  `searchDeck` step except the Nest-Ball auto-bench) and `runSearchPicker`
  branches on the step's `destination`, reusing `openChoicePicker`'s existing
  single- vs multi-select paths (`matchesSearch` and the picker are already
  destination-agnostic).
- `client/src/setup/rules/__tests__/trainer-effects.test.mjs` — 7 new tests:
  bare draw (2 cards, 1 card, "Then, draw 3"), search-then-draw regression,
  discard/shuffle-draw regression guards, and `describeStep` draw wording.

## Verification
- 163/163 unit tests pass (156 prior + 7 new in `trainer-effects.test.mjs`):
  `pnpm test` (run via sandbox node; identical file list).
- `node --check` on both edited files passes.
- Lint/format **not run** in the sandbox (no npm/pnpm) — not claimed to pass.
  The picker/auto-draw flow is DOM-heavy and was not visually verified in-browser.

# Rules mode — Mulligan auto-reshuffle/redraw + bonus draw

## What this adds
When a player's opening hand has **no Basic Pokémon**, the rules engine now
auto-executes the full mulligan procedure:
- Shuffles the offending hand back into the deck and redraws 7 cards.
- In 2P, each client independently handles its own mulligan (no cross-relay).
- The non-mulligating player receives a **bonus 1-card draw** per opponent mulligan
  (1P local; 2P via `rulesSocket` event).

## Files changed
- `client/src/setup/rules/rules-state.mjs` — `mulligansResolved` flag,
  `markMulligansResolved()`, reset in `startGame()`.
- `client/src/setup/rules/rules-bridge.js` — mulligan execution block
  (reshuffle/redraw + bonus draw dispatch), `mulliganBonus` socket handler.
- `client/src/setup/rules/__tests__/mulligan.test.mjs` — 3 new flag-lifecycle tests.

## Verification
- 204/204 unit tests pass (201 prior + 3 new): sandbox node `--test`.
- `node --check rules-bridge.js` passes.

# Taxonomy audit — final ⚠️ sweep (doc-only)

Full audit of every `⚠️` in `docs/card-types-taxonomy.md`. After this pass the
only remaining `⚠️` is the legend's own definition of the symbol:

- **A1 prize note (stale)** — claimed the ex "2 extra prizes" and GX "lose the
  match" rules were ❌. They are implemented: `koOutcome()` + `handleKO()` in
  `ko-flow.mjs` (ex → 3 prizes, GX → immediate match loss), covered by tests in
  `rules-extended.test.mjs`. Note reworded ⚠️ → plain note.
- **D intro (stale)** — claimed every non-Phase-1 attack family "remains ❌ in
  the live path"; the per-row table below it is fully ✅. Reworded.

No code changes in this pass. Full suite re-verified: 204/204 pass.
- Lint/format **not run** in the sandbox (no npm/pnpm).
