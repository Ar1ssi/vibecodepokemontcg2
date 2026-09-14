# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 132
Focus: patch — add user-supplied Groudon art as a selectable mat; double-click an attached card
  now shows its energies/tools beside it, draggable.
Active: done, uncommitted. Mat: copied art into client/src/assets/playmats/custom/groudon-{edge-
  to-edge,full-size-edge-to-edge}.jpg; added two entries to mats-catalog.mjs mirroring the
  existing custom Kyogre entries (one-player + two-player, fit: cover, overlay: true) — picks up
  automatically in the Customize > Mat picker, no other code touched.
  Mat art corrected mid-session (user caught a duplicate-of-Kyogre mistake): now the actual
  fire-type wallpaper PNG, ids/titles renamed to "Fire Type".
  Double-click: click-events.js doubleClick() branches on mouseClick.card.attachedCards.length for
  active/bench — if attached, opens a read-only openCarouselViewer (card-picker.js, same PTCG-Live
  carousel the discard-pile viewer uses) with candidates = [card, ...card.attachedCards], so the
  zoom itself is unchanged and scrolling right pages through the attached energies/tools, left
  returns to the main card. No drag-out mid-preview (close first) — user confirmed this tradeoff
  over building a second real-draggable mechanism. openAttachedCardsPanel (full-view.js) is back
  to right-click-menu-only, untouched. No-attachment and hand cards keep the plain zoom.
  First cut (right-click-panel reuse) was rejected by the user before push and redone per above.
Next: user to eyeball the Fire Type mat and the double-click carousel on localhost (this session
  does not drive the Browser pane for CSS/visual checks, per standing preference). If liked,
  commit (one commit ded94f5 already made both mat+attach changes together, superseded by the
  carousel redesign — squash or amend before push per user's call) and push to main.
Blocked: none — awaiting user's localhost check before push.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` needs `pnpm install` fresh each new sandbox session (not persisted). Playwright's
  pinned browser revision (1.63.0) won't match what's pre-installed at /opt/pw-browsers — launch
  with `executablePath: '/opt/pw-browsers/chromium'`, don't `playwright install`.
- Test netcode changes in BOTH modes (`SERVER_AUTHORITATIVE=1` vs default); S101 shipped a
  legacy-only fix to a server-authoritative prod (D17).
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`) — verify a diff's own files with `npx eslint <files>`.
- Never put `perspective`/`transform`/`filter` on an iframe's `<html>`: the root is ~8px tall and
  becomes the containing block of every `position: fixed` zone, so the board collapses (S131). The
  tilt lives on `#playfield`, whose fixed children now resolve against it (intended).
- Catch-up replay sets `systemState.isCatchingUp`; `syncReplaying` is never set anywhere. Gate
  animations on `isCatchingUp`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S131 2026-09-14 review+patch: design 009 build fixed + merged to main (collapse, hand, tilt sign,
  replay gate, deck stack, mat sizing).
- S130 2026-09-14 feature: design 009 slices 1-6 built, unverified, uncommitted.
- S129 2026-09-14 merge: SERVER_AUTHORITATIVE bot verification (9/9) + PR #128; branch to main.
