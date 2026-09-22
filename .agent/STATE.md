# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 253
Focus: deck Pokémon sprites — pin up to 3 mons (regular or shiny) beside a deck's name (design 024).
Active: 8 commits on `claude/great-thompson-tnrmfd`, pushed. Suite 2942, 2941 pass.
Next: user review of the Live restyle + sprites; then I81, I78–I80. Maintenance due at S260.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Deck-builder styling lives in `client/src/css/deck-builder-live.css`, scoped under `.db-live`
  (on `#nativeDeckBuilderWorkspace`). That class is what beats index.css on specificity — never add
  a rule there without the prefix, and never reach for !important. `.db-light` = the old grey palette.
- Pokémon sprite art is VENDORED (1810 PNGs under `client/src/assets/pokemon/gen8/`, D97). Never
  hand-edit `core/pokemon-sprite-catalog.generated.mjs` — rerun `scripts/generate-pokemon-sprites.mjs`.
  A `deck-sprites.test.mjs` case asserts every catalog slug has both PNGs, so a pruned assets dir
  fails the suite rather than showing broken images.
- ONE pre-existing failing test: `card-inspector-model.test.mjs` "retreat greys only when the cost is
  unpaid" — failing since before S251. Suite otherwise green.
- Deck-builder cards autosave on every `render()` and the sleeve/coin/mat pickers commit on change,
  so the Save button only does real work with no deck loaded (I81 tracks the decision). Sprites use
  the same `chosenCosmetics` mirror, so they follow whatever that decision lands on.
- Playwright: the pinned browser build is missing from /opt/pw-browsers. Launch with
  `executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-certificate-errors']` — without the
  flag the socket.io CDN fails TLS behind the agent proxy and `io is not defined` breaks page boot.
  `pnpm test` triggers an implicit install that has emptied `node_modules`; prefer
  `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S253 deck Pokémon sprites (design 024, D97): vendored pokesprite gen-8 art + generated 905-entry
  catalog, `core/deck-sprites.mjs` slot model, `sprites` on the deck record, and a picker popover off
  the strip beside the deck name — shown in both the editor header and the My Decks chips (+45 tests).
- S252 deck builder → PTCG Live: dark theme with a light toggle, "x / 60" counter, image-first card
  grid in both search and Browse Sets, energy/class/Trainer filter pills, explicit Save (+53 tests).
- S251 audit+fix: 31 server/client fixes across items, energy, abilities, attacks and attack effects.
