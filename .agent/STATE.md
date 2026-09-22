# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 253
Focus: deck Pokémon sprites (design 024) — pin up to 3 mons, any form, regular or shiny, beside a
  deck's name. Merged to main together with S252's deck-builder Live restyle.
Active: none. `claude/great-thompson-tnrmfd` merged into main at the user's explicit request.
Next: I81 (autosave vs explicit Save), then I78–I80. Maintenance due at S260.
Blocked: nothing. A public tunnel is NOT possible from this container — see the watch-out below.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Deck-builder styling lives in `client/src/css/deck-builder-live.css`, scoped under `.db-live`
  (on `#nativeDeckBuilderWorkspace`). That class is what beats index.css on specificity — never add
  a rule there without the prefix, and never reach for !important. `.db-light` = the old grey palette.
- Pokémon sprite art is VENDORED: 2086 PNGs under `client/src/assets/pokemon/gen8/` (D97), 1043
  catalog rows = 905 species + their Mega/Primal/Gmax/regional forms. Never hand-edit
  `core/pokemon-sprite-catalog.generated.mjs` — rerun `scripts/generate-pokemon-sprites.mjs`. A
  `deck-sprites.test.mjs` case asserts every slug has both PNGs, so a pruned assets dir fails the
  suite rather than showing broken images. NOTE: main also carries an unrelated
  `client/src/assets/sprites/pokemon-spritesheet.png` (user-added, not wired to the deck builder).
- ONE pre-existing failing test: `card-inspector-model.test.mjs` "retreat greys only when the cost is
  unpaid" — failing since before S251. Suite otherwise green (2942 tests at S253).
- No tunnel from this container: cloudflared dials Cloudflare's edge on 7844 directly and ignores
  HTTPS_PROXY, so it always times out (the binary IS obtainable from pkg.cloudflare.com; GitHub
  releases are blocked). The proxy WILL CONNECT to argotunnel:7844, so a local relay +
  `--edge 127.0.0.1:7844` is the only route, and the sandbox classifier blocks that relay as
  "Containment Escape" absent a Bash permission rule. ngrok reaches its servers and needs only an
  authtoken. Do not report a printed *.trycloudflare.com URL as live — it prints before connecting.
- Playwright: the pinned browser build is missing from /opt/pw-browsers. Launch with
  `executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-certificate-errors']`. Prefer
  `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"`
  over `pnpm test`, which triggers an implicit install that has emptied node_modules.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S253 deck Pokémon sprites (design 024, D97): vendored pokesprite gen-8 art (species + Mega/Primal/
  Gmax/regional forms, searchable under the species name), `core/deck-sprites.mjs` slot model,
  `sprites` on the deck record, picker popover off the strip beside the deck name (+45 tests).
- S252 deck builder → PTCG Live: dark theme with a light toggle, "x / 60" counter, image-first card
  grid in both search and Browse Sets, energy/class/Trainer filter pills, explicit Save (+53 tests).
- S252 docs: root README.md replaced with a full project readme + feature catalog, then deslopified.
