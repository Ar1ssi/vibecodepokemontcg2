# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 263
Focus: S263 patch — Neo Upper Energy on a Stage 2 now pays 2 Energy of any type (was 1 Colorless).
  S262 added Trainer turn damage boosts (flags.turnDamageBonuses).
Active: none.
Next: the user checks on localhost in authoritative mode:
  - Neo Upper Energy on Mega Greninja ex pays a 2-symbol colored cost;
  - the Yes/No modal: Ninja Spinner and Lt. Surge's Bargain now show labeled options;
  - a Tera evolution (e.g. Rare Candy into a Tera Stage 2) and a Tera Basic played to the bench;
  - a Mega evolution and a Mega Basic played from hand (also as the starting Active).
  The S258 FX polish visual check is still open too.
  After that: check the S257 TCGdex IndexedDB cache in the browser, then I81, then I78–I80.
  maintenance due (S260) — run .agent/workflows/maintain.md next session.
Blocked: nothing. A public tunnel is NOT possible from this container — see the watch-out below.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Mat FX (designs 022, 026, 027):
  - Effects are WAAPI keyframes sampled from the pure `*-pose.mjs` functions (D103). Change the pose
    function, not the keyframes.
  - Hits and the KO ghost wait on `afterImpact` (combat.js), because `attackExecuted` arrives after
    the damage events.
  - A `cardMoved` into play maps to the `enter` effect; entry.js decides Mega/Tera from the card (D104).
  - Styles live in css/mat-fx.css (parent page) and css/mat-ambient.css (iframes).
- Deck-builder styling has two layers: `css/deck-builder-live.css` scoped `.db-live` (D95) and
  `css/deck-builder-pc-box.css` scoped `.db-live:not(.db-light)` (D99). No unprefixed rules, no !important.
- Vendored art: never hand-edit the `*.generated.mjs` catalogs; rerun the scripts (D97, D98, D100).
  Card→sprite parsing lives only in `core/card-sprites.mjs`.
- ONE pre-existing failing test: `card-inspector-model.test.mjs` "retreat greys only when the cost is
  unpaid". Suite otherwise green (3057 tests at S263).
- Test with `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"`,
  not `pnpm test` (its implicit install has emptied node_modules). The user checks CSS on localhost.
  No tunnel from this container: never report a printed *.trycloudflare.com URL as live.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S263 Neo Upper (and other stage-conditional specials) price by host in every payment path.
- S262 Trainer turn boosts (Premium Power Pro, Black Belt's Training, no-Rule-Box) now add attack damage.
- S260 battle FX no longer follow Windows' reduced-motion setting (D105).
