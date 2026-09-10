# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 80 — maintenance due (see Next).
Focus: live two-page smoke run of design 004 slices 1-4 (observe/options/act/picker).
Active: done. Ran a real 2-page legacy-mode game via `.agent/scratch/smoke-004-slice1-4.mjs`
  (pnpm install + `PORT=4100 node server/server.js`, sandbox needed a socket.io CDN→local
  route shim and `executablePath: '/opt/pw-browsers/chromium'` — neither is a product change).
  Slices 1-4 all confirmed live: observe() JSON-round-tripped every turn, options() correctly
  gated attack (unreachable turn 1 per the rules) and enumerated playBasic/retreat/pass,
  act() drove all three through the real UI with zero cmdRejected, picker() never
  false-positived on this Trainer-free fixture deck. Found a real, separate bug doing it:
  I28 (see ISSUES.md) — legacy mode's win check ends the game after player A's very first
  pass, crediting a win over B "no Pokémon in play" even though B simply hasn't had a turn
  yet. This is exactly what design 004 exists to catch; it also means no smoke run can drive
  a real multi-turn game (attack, evolve, energy attach) until I28 is fixed.
Next: fix I28 first — slice 5/6 (bot + runner) can't be meaningfully exercised past turn 1
  until legacy mode survives more than one pass(). Route I28 as its own debug/patch session
  (not design 004 — that spec explicitly excludes gameplay-file changes). Maintenance due now
  (S80) — run `.agent/workflows/maintain.md` if there's room before starting I28.
Blocked: nothing (I28 blocks *progress*, not this session's work).

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `window.__ptcg` (client/src/setup/general/e2e-api.js, installed only under `?e2e=1`) is the
  supported programmatic seam into a live game — extend it rather than writing DOM-selector
  automation. `flip-gate-test.mjs` (SERVER_AUTHORITATIVE mode) and
  `.agent/scratch/smoke-004-slice1-4.mjs` (legacy mode) are the reference two-browser harnesses.
- This sandbox blocks the socket.io CDN and TCGdex API by egress policy — any local 2-page
  Playwright run needs a `context.route('https://cdn.socket.io/**', ...)` shim to the server's
  own `/socket.io/socket.io.js`, and `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`.
  `pnpm install` is also needed fresh in this environment before `node server/server.js` works.
- I28 (new, P1): legacy mode's local win check fires "no Pokémon in play" against whichever
  side hasn't had its first turn yet, ending every legacy 2P game after turn 1. Blocks any
  multi-turn live verification (design 004 slice 5/6 included) until fixed.
- Three distinct "picker" overlays exist: `.card-picker-overlay`, `openMatPick`'s DOM-outline
  highlight, and the coin overlays — all bridged by `__ptcg.picker()`/`pick()` (design 004
  slice 4). Extend those, don't add a fourth path.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S80 2026-09-10 debug (verification only, no code shipped): live-verified design 004 slices
  1-4 end to end; found I28 (legacy mode ends every game after turn 1).
- S79 2026-09-10 feature: design 004 slice 4 — `__ptcg.picker()`/`pick()`, bridging all three
  modal kinds (card-picker, mat-pick, coin overlays) from e2e-api.js only.
- S78 2026-09-10 feature: design 004 slice 3 — `__ptcg.act(option)` write path in e2e-api.js.
