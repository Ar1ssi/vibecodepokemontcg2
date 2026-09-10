# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 89
Focus: feature — 3D Energy tokens for attached Energy cards (design 005), + 3 rounds of
  user-driven fixes after live review (S89b).
Active: done. `getEnergyTokenFront` (energy-token-assets.mjs) maps card type → one of 11
  user-supplied type-symbol PNGs (`client/src/assets/energy/tokens/`, colored circle +
  black glyph, cropped+alpha-masked from a reference sheet — not the earlier 151MT coin
  photos, superseded per D22). `attach-card.js` renders them as small non-overlapping discs
  along the bottom edge of the target card (not the old full-height side-cascade), with
  z-index `100 + layer` so they sit ON the card face; `reset-image.js` restores the original
  src/size and drops the class on any detach/re-attach path. `.play-container img
  .energy-token-3d` (energy-token.css) had to out-specificity the generic
  `.play-container img` card-shadow rule (self/opp-containers.css) that was otherwise
  winning and showing a barely-rounded rectangle instead of a circle — root-caused by
  DOM-injecting the real attach-card code into the live selfContainer iframe and diffing
  computed styles, not by screenshot-guessing. Double-click zoom (full-view.js) now also
  hides attached-card siblings, not just the Pokémon, so small tokens don't poke out from
  behind the enlarged popup. `pnpm test` 1258/1258 green.
Next: nothing queued.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.
- `playtest-bot.mjs --games=N` is now a real regression gate for legacy-mode multiplayer
  desyncs, not just a bug-finder — a clean run used to be blocked on I30, now it isn't. Treat
  a new failure from it as a real finding again, not "known I30 noise."
- The `(user, ...parameters, emit)` acceptAction calling convention is easy to get wrong when
  a parameter can look like a boolean or overlap emit's position — see `parseAttackArgs` and
  `parseRetreatArgs` (sync-action-args.mjs) for the established disambiguation pattern before
  adding a parameter to any other legacy action.
- This sandbox blocks the socket.io CDN and TCGdex API by egress policy — any local 2-page
  Playwright run needs a `context.route('https://cdn.socket.io/**', ...)` shim to the server's
  own `/socket.io/socket.io.js`, `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`.
  Server runs on port 4000 by default (`node server/server.js`), not 4100.
- `turnState().fromServer` is meaningless in legacy mode (SERVER_AUTHORITATIVE unset, this
  repo's default) — it only ever becomes true under flip-gate-test.mjs's authoritative mode.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S89/S89b 2026-09-10 feature+patch: 3D energy tokens for attached Energy (design 005) — see
  Active above.
- S88 2026-09-10 debug: I32 (retreat), I31 (Trainer divergence), I33 (harness reporting) all
  root-caused and closed; all branches consolidated onto `main`.
- S85 2026-09-10 patch: closed I30 (legacy retreat desync).
