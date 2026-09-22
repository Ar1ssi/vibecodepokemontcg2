# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 252
Focus: deck builder restyled toward PTCG Live (theme, counter, card grid, filters) + an explicit Save button.
Active: 5 commits on `claude/great-thompson-tnrmfd`, pushed. Suite 2897, 2896 pass.
Next: user review of the Live restyle (tunnel was live this session); then I81, I78–I80. Maintenance due at S260.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Deck-builder styling now lives in `client/src/css/deck-builder-live.css`, scoped under `.db-live`
  (on `#nativeDeckBuilderWorkspace`). That class is what beats index.css on specificity — never add
  a rule there without the prefix, and never reach for !important. `.db-light` = the old grey palette.
- ONE pre-existing failing test: `card-inspector-model.test.mjs` "retreat greys only when the cost is
  unpaid" — failing since before S251. Suite otherwise green.
- Deck-builder cards autosave on every `render()` and the sleeve/coin/mat pickers commit on change,
  so the Save button only does real work with no deck loaded (I81 tracks the decision).
- Playwright: the pinned browser build is missing from /opt/pw-browsers. Launch with
  `executablePath: '/opt/pw-browsers/chromium', args: ['--ignore-certificate-errors']` — without the
  flag the socket.io CDN fails TLS behind the agent proxy and `io is not defined` breaks page boot.
- `pnpm test` triggers an implicit install that has emptied `node_modules` before; prefer
  `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S252 deck builder → PTCG Live: dark theme with a light toggle, "x / 60" counter, image-first card
  grid in both search and Browse Sets, energy/class/Trainer filter pills, explicit Save (+53 tests).
  Fixed in passing: `getActiveDeckName` returned nothing (panel always read "Untitled Deck"); the
  sleeve gallery rendered under the search grid at boot.
- S251 audit+fix: 31 server/client fixes across items, energy, abilities, attacks and attack effects.
- S250 debug/patch: lethal ability damage counters, Items attached as Tools, Items to Bench, Tarragon.
