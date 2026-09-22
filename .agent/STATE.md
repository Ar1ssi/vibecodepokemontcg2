# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 264
Focus: S264 12-item batch on branch `feature/batch-s264` (worktree ../vibe-batch-s264), NOT merged.
  C1 abilities (#2 #3 #8 #12), C2 FX (#1 #7), C3 board UI (#9 #10 #11) committed; ledger in NEXTSTEPS.md.
Active: waiting on the user — approve design 028 (logging, I85) and 029 (30th set, I86); describe #5 (I87).
Next: after approval, build 028 slice 1 then 029 slice 1 on the same branch.
  User checks on localhost (authoritative): holo on double-click (hand/bench/active), Mega entry
  (out/s264-mega-entry-strip.png), End Turn, View Board, no card blink; then decide merge to main.
  maintenance due (S260) — run .agent/workflows/maintain.md next session.
Blocked: #5 needs the user's description (no match logs exist). A public tunnel is NOT possible.

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
  unpaid". Suite otherwise green (3072 tests at S264).
- Test with `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"`,
  not `pnpm test` (its implicit install has emptied node_modules). The user checks CSS on localhost.
  No tunnel from this container: never report a printed *.trycloudflare.com URL as live.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S264 (branch only) Dynamotor, Sinister Surge, Adrena-Brain, Acerola's Premonition resolve server-side.
- S264 (branch only) auth-mode previews keep their foil; Mega entry reworked; End Turn/View Board; no blink (D106).
- S263 Neo Upper (and other stage-conditional specials) price by host in every payment path.
