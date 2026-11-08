# 086 · Homebrew Build & Battle

Status: approved (self) — the user said to decide and correct later. Built in one session.

## Goal
A builder-tab mode at `/homebrew-battle`: 30 booster packs of the Homebrew set (`customhb`), a pool made
of what the packs held plus unlimited Basic Energy, a Standard deck (60 cards, 6 Prizes, `format: 'tcg'`)
built from it. Every pack holds ≥1 Trainer and ≥1 Energy; the other cards vary.

## Out of scope
Run/match tracking (Build & Battle's 5-match run), a collection across boxes, other custom sets, a box
catalog entry (`BUILD_BATTLE_BOXES` stays real products only), the 3D tabletop unboxing.

## Decisions (user may correct)
1. **A flow of the Build & Battle tab, not a mode of its own.** `resolveBuildBattleFlow('/homebrew-battle')
   = 'homebrew'`; the page, Pool tab, pool validation and Play block are Build & Battle's. The deck
   format is the only thing it overrides (`isHomebrew` in native-deck-builder.js → `tcg`).
   Alternative, a standalone page, would copy the deck pane, library and Play wiring.
2. **Packs: 10 cards = Energy, 3 Common, 3 Uncommon, Trainer, reverse, rare.** Built in
   `homebrew-pack.mjs` and fed to `openPack` (resolved model). Common/Uncommon/reverse also draw Trainers,
   so counts vary. Energy slot: 60 % Special Energy (kept in the pool), 40 % Basic Energy (shown in the
   reveal, never pooled: the Pool tab already holds unlimited Basic Energy). Rare slot reuses
   `BOOSTED_RATE_PROFILE.hit` (Double rare) and `.aceSpec`. Hit classes read the SV era's rarity names.
   Every rarity in the set is reachable: the `Secret Rare` Double Colorless print is a Special Energy
   (Energy slot), the nine `Hyper rare` cards are Basic Energy (Energy slot, never a hit flare).
3. **Skin: 151 Mew booster front + the 151 Ultra-Premium Collection exterior, nothing else.** The scene is
   the Elite Trainer Box scene (lift-off lid) with a new `presentation` option and `skin.lidArt`: the lid
   is the cut-out front panel of the vendored render, sides plain, no plate/logo/slashes, no promo, no
   props (a prop with a zero count is not in the tray). With no promo there is no pouch, so the box
   unwraps itself once the lid is up. Art: `scripts/build-battle/vendor-homebrew-skin.mjs` (Bulbapedia
   Archives `File:151 Booster.png`, `File:151 Ultra-Premium Collection.jpg`).
4. **Session** `ptcg-sim.homebrew-battle.v1`: seed, 30 packs (card ids), scene progress, bound deck id or
   unsaved edits. Deck "Homebrew B&B #<seed>" is created at Open; saving an unsaved deck under that
   name binds it.

## Edge cases
| Case | Evidence |
|---|---|
| set.json fails to load / malformed | `a set that fails to load says so…`; `hydrate…` throws |
| set cannot fill Trainer/Energy slot | `the set can fill every guaranteed slot…` |
| every pack has Trainer + Energy | `30 packs of 10 cards…, for 200 seeds` |
| same seed = same box | `one seed is one box…`; `Open stores a 30-pack box seeded from ?seed=` |
| corrupt / foreign stored session | `parse refuses anything it cannot trust` |
| storage throws or absent | `storage that throws or is missing…` |
| set changed under a saved box | `a box whose cards the set no longer has is put away…` |
| My Decks full | `at the deck limit the box deck opens unsaved…`; `saving the unsaved deck under the box name…` |
| deck uses a card/copies the pool lacks | `the pool limits the deck…` |
| reload on the lifted lid | `a lifted lid with no promo unwraps itself…` |
| second tab opens/clears a box | `another tab clearing the box…`; `another tab opening a newer box is adopted…` |
| restart | `Start over asks first…` |

## Known limits
Lid art keeps the photo's perspective (front panel cropped as shot). 30 packs fan in the tray; the spread
uses the scene's carousel for more than four packs. Visuals are unreviewed by the user.

## Harness lines to land with the merge to main
- MAP: `client/src/setup/deck-builder/core/homebrew-battle/ — Homebrew Build & Battle (design 086): homebrew-pack.mjs (set hydrate, pack model with guaranteed Trainer+Energy, openHomebrewBox, pool), homebrew-session.mjs, homebrew-look.mjs (UPC exterior + 151 booster skin); DOM sidebox/native-deck-builder-homebrew-battle.js; route /homebrew-battle`
- DECISIONS: `D<next> [deck-builder] Homebrew Build & Battle is the 'homebrew' flow of the Build & Battle tab (/homebrew-battle): customhb packs, Standard 60-card/6-Prize deck, ETB scene skinned as the 151 Ultra-Premium exterior (design 086)`
