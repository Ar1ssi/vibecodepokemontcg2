# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 258
Focus: mat FX polish (design 026, D103). Merged to main (fast-forward, 9e0dad29).
Active: none.
Next: the user checks the effects on localhost in authoritative mode. Check a hit, a KO, each status,
  an evolve, an energy attach, a trainer, the turn banner, an ability, and a win.
  After that: check the S257 TCGdex IndexedDB cache in the browser, then I81, then I78–I80.
  Maintenance due at S260.
Blocked: nothing. A public tunnel is NOT possible from this container — see the watch-out below.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Mat FX (designs 022 and 026):
  - Effects are WAAPI keyframes sampled from the pure `*-pose.mjs` functions (D103). Change the pose
    function, not the keyframes.
  - Hits and the KO ghost wait on `afterImpact` (combat.js), because `attackExecuted` arrives after
    the damage events.
  - Styles live in css/mat-fx.css (parent page) and css/mat-ambient.css (iframes).
- Deck-builder styling has two layers:
  - `css/deck-builder-live.css`, scoped `.db-live` (D95).
  - `css/deck-builder-pc-box.css`, scoped `.db-live:not(.db-light)` (D99).
  Never add an unprefixed rule, and never use !important.
- Vendored art: never hand-edit the `*.generated.mjs` catalogs; rerun the scripts (D97, D98, D100).
  Card→sprite parsing lives only in `core/card-sprites.mjs`.
- ONE pre-existing failing test: `card-inspector-model.test.mjs` "retreat greys only when the cost is
  unpaid". Suite otherwise green (3025 tests at S258).
- Test with `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"`,
  not `pnpm test` (its implicit install has emptied node_modules). The user checks CSS on localhost.
  No tunnel from this container: never report a printed *.trycloudflare.com URL as live.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S258 mat FX polish (on main):
  - Impact-timed hits with type-coloured sparks.
  - A wind-up lunge and KO shards.
  - Status particles and an evolution silhouette.
  - Banner, ability-tag, trainer-present and confetti rework (+27 tests).
- S257 persistent TCGdex JSON cache in IndexedDB (D102).
- S255–S256 fan sprites for Gen 9 and the Z-A Megas (D100, D101), and the PC Box restyle (design 025).
