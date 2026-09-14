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
  Double-click: click-events.js doubleClick() now branches on mouseClick.card.attachedCards.length
  for active/bench — if attached, calls the existing openAttachedCardsPanel (full-view.js; was
  right-click-only "View attached cards") instead of openCardPreview's zoom, since the zoom hides
  attachments. No-attachment cards and hand cards unchanged. Reuses existing drag/attach
  mechanism verbatim (right-click panel already supported dragging attached cards out).
Next: user to eyeball the Groudon mat and double-click behavior on localhost (this session does
  not drive the Browser pane for CSS/visual checks, per standing preference). If liked, commit.
Blocked: none.

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
