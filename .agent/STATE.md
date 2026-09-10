# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 89 (89b: same-session follow-up, no new session number)
Focus: feature — design 005, nine "Generation 9".."Generation 1" pills in the native deck
  builder's Browse Sets panel, each with its own Energy tab.
Active: done. Added `fetchGenerationSets`/`GENERATION_SERIES`/`GENERATIONS` to
  set-browser.mjs (client/src/setup/deck-builder/core/set-browser.mjs) — pulls every set of a
  Pokémon generation live from TCGdex's `/v2/en/series/{id}` grouping (confirmed live this
  session: TCGdex series ids match pkmncards.com/sets/'s era headers almost exactly). Refactored
  native-deck-builder-set-browser.js's single `sets`/`loaded` state into a per-category
  `categoryState` Map (`'standard'`, `'other'`, `'gen1'..'gen9'`) so pills don't re-fetch on
  revisit; added the 9 generation pill buttons (`.native-deck-builder-set-browser-series-tag--
  generation` CSS, index.css) and made the pill row wrap (was inline-flex, no wrap — now
  overflows to a second line at 11 pills). Follow-up (89b): each generation now also gets a
  synthetic "Energy" tab (`__energy_gen<N>__`, colorless.png logo, routed in `fetchSetCards`)
  aggregating every Energy card — basics, special, rarer variants — across that generation's own
  sets, mirroring the Standard view's existing `ENERGY_SET_ID` tab (D18). +10 tests total
  (generation-sets.test.mjs, now wired into package.json's `pnpm test` — it wasn't in slice 1/2,
  caught when the total didn't climb). 1268/1268 pass. See design 005 (Deviations section has the
  Energy-tab addendum) for the full generation→TCGdex-series map and exclusions (Mega Evolution
  out of Gen9; HeartGold&SoulSilver + Call of Legends out of Gen4; POP/McDonald's/Trainer-kits/
  Misc unreachable from any pill by construction — see D22).
Next: user should smoke-check on localhost:4100 (worktree server; port 4000 was already taken by
  another node process, likely the primary checkout's) — see D22-era note: open deck builder →
  Browse Sets → click a few generation pills + their Energy tabs, confirm no POP/McDonald's/
  trainer-kit clutter. Still open from S82/S88: I34 (turn-desync residual, 1/10 soak failures) —
  see journal S88 for the lead. Still open from S73: drag active→bench retreat live-verify; mat
  pickers + Grand Tree. Maintenance due S96 (S86 sweep was the last one).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `playtest-bot.mjs --games=N` is now a real regression gate for legacy-mode multiplayer
  desyncs, not just a bug-finder — a clean run used to be blocked on I30, now it isn't. Treat
  a new failure from it as a real finding again, not "known I30 noise."
- The `(user, ...parameters, emit)` acceptAction calling convention is easy to get wrong when
  a parameter can look like a boolean or overlap emit's position — see `parseAttackArgs` and
  the new `parseRetreatArgs` (sync-action-args.mjs) for the established disambiguation pattern
  before adding a parameter to any other legacy action.
- This sandbox blocks the socket.io CDN and TCGdex API by egress policy — any local 2-page
  Playwright run needs a `context.route('https://cdn.socket.io/**', ...)` shim to the server's
  own `/socket.io/socket.io.js`, `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`.
  Server runs on port 4000 by default (`node server/server.js`), not 4100.
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`, so `.mjs` gets no `globals` and no `endOfLine:
  'auto'`) — known baseline since S1, not something any one session's diff should try to fix.
  Verify a diff's own files with a targeted `npx eslint <files>` and read past the CRLF noise.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S89/89b 2026-09-10 feature: shipped design 005 (generation pills + per-generation Energy tabs
  in Browse Sets) — see Active above.
- S88b 2026-09-10 patch(security): closed the `?e2e=1` bridge exposure — gated server-side behind
  E2E_ENABLED, armed only by `PTCG_E2E=1` or non-production `NODE_ENV`.
- S88 2026-09-10 consolidate: merged every outstanding branch onto main (design 004 bot + S86
  sweep, the I31/I32/I33 fix chain, pass-button consolidation).
