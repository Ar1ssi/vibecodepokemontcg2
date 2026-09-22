# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 255
Focus: PC Box (3DS) restyle of the deck builder + Solo drawer, per-card deck-list sprites (design 025),
  and Gen 9 fan sprites (D100). All built on `claude/deck-builder-redesign-e68157` in a worktree. Not committed.
Active: none. Waiting for the user to check it on localhost and approve committing.
Next: commit design 025 (per-slice or one commit) and merge on user OK; then I81 (autosave vs explicit
  Save), then I78–I80. Maintenance due at S260.
Blocked: nothing. A public tunnel is NOT possible from this container — see the watch-out below.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Deck-builder styling has two layers:
  - `css/deck-builder-live.css`, scoped `.db-live` (D95).
  - `css/deck-builder-pc-box.css`, scoped `.db-live:not(.db-light)`. It beats Live without !important, and the light theme opts out (D99).
  Never add an unprefixed rule, and never use !important. The Solo drawer PC Box block is at the END of index.css.
- Vendored art (never hand-edit the `*.generated.mjs` catalogs; rerun the scripts):
  - Pokémon: `client/src/assets/pokemon/gen8/` (D97). Gen 9 fan art is `gen9/regular/`, has no shiny, and its catalog is hand-kept (D100).
  - Items: `client/src/assets/items/`, from `scripts/generate-item-sprites.mjs` (D98).
  - Wallpapers: `assets/box-wallpapers/`.
  - Rodin font: `assets/fonts/`.
  Card→sprite parsing lives only in `core/card-sprites.mjs`. Sprite cap is 2, auto-filled from the deck.
- ONE pre-existing failing test: `card-inspector-model.test.mjs` "retreat greys only when the cost is
  unpaid" — failing since before S251. Suite otherwise green (2980 tests at S255).
- No tunnel from this container: cloudflared ignores HTTPS_PROXY and times out on 7844. A local relay +
  `--edge 127.0.0.1:7844` is the only route, and the sandbox blocks the relay. ngrok needs only an authtoken.
  Never report a printed *.trycloudflare.com URL as live.
- Test with `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"`,
  not `pnpm test` (its implicit install has emptied node_modules). The user checks CSS on localhost themselves.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S255 (uncommitted) Gen 9 fan sprites: all 120 species plus 22 forms, with card-name form parsing (D100, +6 tests).
- S254 (uncommitted) design 025:
  - PC Box look for the builder and Solo drawer, with per-deck Gen V wallpapers switched by ◀ ▶ and the Rodin font.
  - Exactly 2 deck sprites, auto-filled from the deck.
  - A sprite beside each deck row: Pokémon forms plus pokesprite items (+33 tests).
- S253 deck Pokémon sprites (design 024, D97): vendored gen-8 art + forms, and a picker beside the deck name.
