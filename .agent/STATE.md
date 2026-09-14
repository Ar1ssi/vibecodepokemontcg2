# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 128
Focus: merge — fold brave-volta's follow-up (796aa79, design 008 live manual verification)
  into claude/cpu-testing-live-render-anr7fy. This branch is the test server going forward.
Active: done. Docs-only merge (NEXTSTEPS.md + .agent). brave-volta ran design 008's manual
  checklist against a real two-browser session: 15/16 pass — single-click gating, attack zones,
  Retreat/Pass, overlay-click and Escape close, double-click plain preview, #rulesAttackWindow
  gone. Their run predates main's playmat/zone geometry rework, so the geometry-sensitive checks
  are not yet verified on this merged tree. Their new issue renumbered I44 -> I45 (I44 was taken).
Next: re-run design 008's geometry-sensitive checks on THIS tree (merged playmat geometry) before
  trusting it as the test server. I45 needs a session to trace SERVER_AUTHORITATIVE on vs off.
  Session 130 is a maintenance-due milestone — run `.agent/workflows/maintain.md` if idle then.
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
- S128 2026-09-14 merge: brave-volta's design 008 live manual verification into the test branch.
- S127 2026-09-14 merge: main (39 commits) + brave-volta (design 008) into the test-server branch.
- S126 2026-09-14 feature: design 008 slice 6 (final) — deleted the Attack Window panel + CSS.
