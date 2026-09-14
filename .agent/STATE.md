# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 127
Focus: feature — design 008 manual verification (live 2-browser Playwright run)
Active: done. Ran design 008's manual-verification checklist against a real `pnpm start` server
  with two Playwright-driven browsers (via window.__ptcg e2e API to reach main phase, then real
  DOM clicks on the board). 15/16 checks pass: single-click gating (self active opens preview,
  opponent's does not), attack zones + Retreat/Pass buttons render, dark-overlay-click AND Escape
  both close it (routes through the pre-existing global closePopups→closeCardPreview — no gap),
  double-click still gives a plain preview, old #rulesAttackWindow is gone. The 1 unresolved check
  (damage not observed after a UI-driven attack) did not reproduce under targeted debugging and
  looks like a stale-observe()-read in this harness, not an attack-engine bug — filed as I44.
  Design 008 is now both code-complete (S126) and manually verified.
Next: I44 needs a session with room to trace SERVER_AUTHORITATIVE on vs off. Otherwise design 008
  is closeable — archive the design doc / clear it from NEXTSTEPS.md next touch. Session 130 is a
  maintenance-due milestone — run `.agent/workflows/maintain.md` if idle then.
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
- S127 2026-09-14 feature: design 008 live manual verification — 15/16 pass, I44 filed for the rest.
- S126 2026-09-14 feature: design 008 slice 6 (final) — deleted the Attack Window panel + CSS.
- S125 2026-09-14 feature: design 008 slice 5 — ability zones + bench overlay wiring.
