# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 129
Focus: merge — verify the test branch under SERVER_AUTHORITATIVE, fold in main's PR #128, and
  promote claude/cpu-testing-live-render-anr7fy to main.
Active: done. Ran a real SERVER_AUTHORITATIVE=1 server with two bots: 9 games, all PASS (5
  heuristic + 3 coverage + 1 smoke), zero pageerror/cmdRejected, board-hash and secret-count
  parity every game. Confirmed the clients are genuinely server-driven (isAuthoritative true,
  fromServer true, 8/7 opening hands, server-picked first player) rather than falling back to
  legacy. Then merged main's PR #128 (mat position when the right drawer is closed) — code
  auto-merged, only .agent docs conflicted.
Next: I39 (flip-gate-test.mjs, the named server-authoritative exit gate) is still untested and
  open. Bot runs so far used only the fixture deck — real decklists via --deckA/--deckB would
  exercise the effect executor (I35). Session 130 is a maintenance-due milestone.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` needs `pnpm install` fresh each new sandbox session (not persisted). Playwright's
  pinned browser revision (1.63.0) won't match what's pre-installed at /opt/pw-browsers — launch
  with `executablePath: '/opt/pw-browsers/chromium'`, don't `playwright install`.
- Both `cdn.socket.io` and `api.tcgdex.net` are proxy-policy-blocked (403) here. For a live
  browser session, `page.route()` the socket.io script to `${BASE}/socket.io/socket.io.js` (the
  server vendors it); `ensureCardData()` just times out (~5s) and falls through to the empty state
  — `loadFixtureDeck()` cards carry their own attacks so most UI checks still work, but D4's
  unpayable-zone styling and ability zones need a fixture with multi-attack/ability cards to
  spot-check live (both passed code review in S123-126, not yet exercised on real card data).
- Test netcode changes in BOTH modes (`SERVER_AUTHORITATIVE=1` vs default); S101 shipped a
  legacy-only fix to a server-authoritative prod (D17).
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`) — verify a diff's own files with `npx eslint <files>`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S129 2026-09-14 merge: SERVER_AUTHORITATIVE bot verification (9/9) + PR #128; branch to main.
- S128 2026-09-14 merge: brave-volta's design 008 live manual verification into the test branch.
- S127 2026-09-14 merge: main (39 commits) + brave-volta (design 008) into the test-server branch.
