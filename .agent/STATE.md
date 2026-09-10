# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 86
Focus: maintenance sweep (overdue since S80).
Active: done. Archived shipped design 004 to `designs/archive/`. Fixed stale line/test counts
  in MAP.md, fixed DECISIONS.md's D3 (jsdom claim, wrong since S2), deleted 2 scratch files now
  superseded by `playtest-bot.mjs`, filed I31 (executor.mjs trainer-effect coverage gap,
  flagged repeatedly since S75 but never tracked). All budgets within cap (see Done checklist).
Next: nothing queued — design 004 (playtest bot) is fully shipped. Candidates: I31 (executor.mjs
  coverage gap), S73's still-open live-verify (drag active→bench retreat, mat pickers + Grand
  Tree). `playtest-bot.mjs --games=N` is now a standing regression gate. Maintenance due S90.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `window.__ptcg` (client/src/setup/general/e2e-api.js, `?e2e=1` only) is the supported
  programmatic seam into a live game; `playtest-bot.mjs` (root) is now the permanent two-browser
  soak harness (legacy mode default) — prefer it over writing a new ad-hoc smoke script.
- This sandbox blocks the socket.io CDN and TCGdex API by egress policy — any local 2-page
  Playwright run needs a `context.route('https://cdn.socket.io/**', ...)` shim to the server's
  own `/socket.io/socket.io.js`, `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`.
  Server runs on port 4000 by default (`node server/server.js`), not 4100.
- When a two-browser harness reports a "desync"/"wedge", check the harness's own polling logic
  first (which page it re-checks, how long it waits) before assuming an engine bug — I29 turned
  out to be exactly this.
- I31 (new, P3): `shared/engine/effects/executor.mjs` covers only ~23 of 40+ parsed trainer-
  effect kinds; an unimplemented one silently no-ops rather than erroring — no coverage gate
  exists yet.
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S86 2026-09-10 maintain: harness sweep — see Active above.
- S85 2026-09-10 patch: closed I30 (legacy retreat desync, found by the new playtest bot).
- S84 2026-09-10 feature: shipped design 004 slice 6 (`playtest-bot.mjs`), the design's final
  slice — design 004 (CPU playtest bot) is now fully shipped.
