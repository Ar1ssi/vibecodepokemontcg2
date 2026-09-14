# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 130
Focus: feature (design 009, building ahead of formal approval per user instruction) — TCG Live
  table: tilted mat, cropped hands, 3D deck stack, shuffle/draw/knockout animations on both
  screens. All 6 slices done this session, uncommitted, no worktree/branch (explicit instruction).
Active: slice 6 done (knockout ghost animation). New pure
  `client/src/setup/image-logic/knockout-pose.mjs` (`knockoutPose(t, {fromRect, toRect})` — flash
  in place then drift/fade to the discard rect) + DOM `knockout-flight.js`
  (`captureKnockoutGhost`/`playKnockoutGhost`, same overlay pattern as `shuffle-flight.js`).
  Extracted `visualRectOf` out of `shuffle-flight.js` into `iframe-rect.mjs` (shared). Legacy:
  wired into `rules-bridge.js`'s `checkKnockouts` for BOTH player values, gated by
  `shouldAnimateMirror`. Authoritative: `apply-view.js` gained `options.onBeforeApply(events,
  localPlayerId)` called BEFORE the DOM diff (so a KO'd card's registry entry still exists);
  `socket-event-listeners.js` wires `advisory-animations.js`'s new `handleBeforeApply` to it,
  which captures ghosts into a pending map keyed by instanceId for `handleAdvisoryEvent`'s new
  `'knockout'` branch to play. `advisoryAnimationPlan` gained a `pokemonKnockedOut` case. Deleted
  the unused `tcgl-knockout` CSS (no JS ever applied it); added `.card-knockout-ghost` CSS.
Next: **design 009 has no slices left to build.** Full verification is owed before calling it
  done: `pnpm test` (expect new `knockout-pose.test.mjs` + revised `advisory-animations.test.mjs`
  on top of slice 5's baseline — a stale slice-5 test asserting `pokemonKnockedOut -> null` was
  updated, since that event now plans a real knockout animation), `pnpm test:2p` (legacy), an
  authoritative 2P run (`SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js`), and a manual
  localhost look across all 6 slices (tilt feel, deck stack, mirror animations, KO ghost timing) —
  none run yet, "no node/pnpm/lint" instruction still standing this whole session.
Blocked: none this session (user told this session to build ahead of design 009's formal
  approval). Full verification (pnpm test/test:2p, authoritative run, localhost look) still owed.

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
- S130 2026-09-14 feature: design 009 slice 6 built (knockout ghost animation, both modes) —
  uncommitted, unverified, per user instruction. All 6 slices of design 009 now built.
- S130 2026-09-14 feature: design 009 slice 5 built (authoritative shuffle/draw advisory
  animations wired) — uncommitted, unverified, per user instruction.
- S129 2026-09-14 merge: SERVER_AUTHORITATIVE bot verification (9/9) + PR #128; branch to main.
