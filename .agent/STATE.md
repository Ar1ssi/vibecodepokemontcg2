# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 130
Focus: feature (design only) — design 009 TCG Live table: tilted mat, both hands half-cropped
  (own at bottom, opp at top) with the mat above them on screen, 3D deck stack, shuffle/draw/
  knockout animations on both screens.
Active: design 009 drafted + revised with user answers, pushed to main. Status: draft, awaiting
  user approval. No code written. Key finding: prod (authoritative) plays NO shuffle animation
  for anyone — shuffle-zone.js returns before the flight and socket-event-listeners.js never
  passes onAdvisoryEvent to applyView.
Next: maintenance due (S130 milestone). Then: user approves design 009 → build slice 1 on
  `feature/009-tcg-live-table` in a worktree (re-verify the design's file:line refs first; it was
  read on a checkout 55 commits behind). Open question for user: tilt-off setting? Carried: I39
  (flip-gate-test.mjs, the server-authoritative exit gate) untested; bot runs used only the
  fixture deck — real decklists via --deckA/--deckB would exercise the effect executor (I35).
Blocked: design 009 approval (user).

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` needs `pnpm install` fresh each new sandbox session (not persisted). Playwright's
  pinned browser revision (1.63.0) won't match what's pre-installed at /opt/pw-browsers — launch
  with `executablePath: '/opt/pw-browsers/chromium'`, don't `playwright install`.
- Both `cdn.socket.io` and `api.tcgdex.net` are proxy-policy-blocked (403) in the sandbox.
  `page.route()` the socket.io script to `${BASE}/socket.io/socket.io.js`; `ensureCardData()`
  times out (~5s) and falls through to the empty state.
- Test netcode changes in BOTH modes (`SERVER_AUTHORITATIVE=1` vs default); S101 shipped a
  legacy-only fix to a server-authoritative prod (D17).
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`) — verify a diff's own files with `npx eslint <files>`.
- Zones in the playmat iframes are `position: fixed`; design 009's transformed `#playfield`
  re-anchors them to itself — intended, but popups/menus must stay outside the wrapper.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S130 2026-09-14 design: design 009 (TCG Live table) drafted, pushed for approval.
- S129 2026-09-14 merge: SERVER_AUTHORITATIVE bot verification (9/9) + PR #128; branch to main.
- S128 2026-09-14 merge: brave-volta's design 008 live manual verification into the test branch.
