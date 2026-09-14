# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 132
Focus: patch — Fire Type custom mat; double-click an attached card shows its energies/tools as
  further carousel slides (read-only), reachable by scrolling/swiping.
Active: pushed to main (c56756e), 3 commits ahead of a8e6b11. Mat: art copied into
  client/src/assets/playmats/custom/fire-type-{edge-to-edge,full-size-edge-to-edge}.png, two
  entries in mats-catalog.mjs (one-player + two-player), mirroring the existing custom Kyogre
  entries — auto-picked-up in the Customize > Mat picker, no other code touched.
  Double-click: click-events.js doubleClick() branches on mouseClick.card.attachedCards.length for
  active/bench — if attached, opens a read-only openCarouselViewer (card-picker.js; same PTCG-Live
  carousel the discard-pile viewer uses) instead of the plain openCardPreview zoom. Candidates =
  [...attachedCards, mainCard] with initialIndex = attachedCards.length — card-picker.js's
  computeSlideLayout puts higher-index slides to the LEFT (`virtualIndex - slideIndex`), so
  attachments must sit at lower indices than the focused main card to land on its right. Energy
  slides read the full card art from dataset.energyCardSrc (attach-card.js stashes it there and
  swaps the board <img> to the round token icon) instead of the live icon src; the board element
  itself is never touched, so it's back to the icon on close automatically. No drag-out
  mid-preview by agreed tradeoff — close first to move a card. openAttachedCardsPanel
  (full-view.js) is untouched, still right-click-menu-only. No-attachment and hand cards keep the
  plain zoom. node --test deck-builder core 36/36 green throughout; DOM-coupled click path has no
  headless coverage in this repo (MAP.md note) — user verified each iteration on localhost.
Next: none pending.
Blocked: none.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `node_modules` needs `pnpm install` fresh each new sandbox session (not persisted). Playwright's
  pinned browser revision (1.63.0) won't match what's pre-installed at /opt/pw-browsers — launch
  with `executablePath: '/opt/pw-browsers/chromium'`, don't `playwright install`.
- Test netcode changes in BOTH modes (`SERVER_AUTHORITATIVE=1` vs default); S101 shipped a
  legacy-only fix to a server-authoritative prod (D17).
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`) — verify a diff's own files with `npx eslint <files>`.
- card-picker.js's carousel indexes slides RIGHT-TO-LEFT (`virtualIndex - slideIndex`, positive =
  left) — counterintuitive; any new caller must order candidates accordingly (S132).
- Catch-up replay sets `systemState.isCatchingUp`; `syncReplaying` is never set anywhere. Gate
  animations on `isCatchingUp`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S132 2026-09-15 patch: Fire Type custom mat; double-click attached card opens read-only
  carousel of its energies/tools (full art, correct side). Pushed c56756e.
- S131 2026-09-14 review+patch: design 009 build fixed + merged to main (collapse, hand, tilt sign,
  replay gate, deck stack, mat sizing).
- S130 2026-09-14 feature: design 009 slices 1-6 built, unverified, uncommitted.
