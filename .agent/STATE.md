# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 125
Focus: feature — design 008 (TCG Live attack preview), slice 5
Active: done. Ability zones (D5) + bench overlay wiring (D6) built. New `benchCardHasAbility()`
  (`collect-usable-abilities.mjs`) drives the D6 bench-click gate in `click-events.js`;
  `attack-preview.js` renders an ability zone on both active overlays (shifts the attack band down
  per D5) and bench-only overlays (D6), usable ones invoking `runAbilitySteps` without closing the
  overlay (R12). Also registered two slice 1/4 test files that were never added to `pnpm test`'s
  list (`attack-preview-gate.test.mjs`, `resolve-attack-context.test.mjs`). Commit 8d29497.
Next: slice 6 (final) — delete the Attack Window panel + its CSS, integration + edge-case sweep,
  per `NEXTSTEPS.md`. Run `pnpm test`/`pnpm lint` first (not run since slice 3, per user
  instruction) before starting — this is the last chance to catch a regression before the panel
  (rules mode's only fallback) is deleted.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `shared/engine/rules/__tests__/card-identity-live.test.mjs` (3 tests) hits TCGdex over the
  network and FAILS in sandboxed sessions ("Host not in allowlist"). Baseline is 1334/1337 here;
  don't chase those three.
- Test netcode changes in BOTH modes: `SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js`
  plus a plain legacy server; S101 shipped a legacy-only fix to a server-authoritative prod (D17).
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`). Verify a diff's own files with targeted
  `npx eslint <files>` and read past the CRLF noise; don't fix the repo-wide config in passing.
- Card-preview geometry is subtler than it looks: `previewSizeForSource` sizes the pop host from
  the SOURCE rect's aspect, and the plain-image face uses `object-fit: contain` while the holo
  face uses `cover`. Anything positioned as a % of the card face will misalign (design 008 R4).
- Before deleting `buildAttackWindow` (slice 6), re-read Component 5's own note (R11): its
  "no attacks resolved" `console.warn` + visible hint is a real data-plumbing diagnostic and must
  land in the overlay's empty state (already done — `attack-preview.js`'s `emptyStateEl`, slice 3)
  before the panel goes, not after.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S125 2026-09-14 feature: design 008 slice 5 — ability zones + bench overlay wiring.
- S124 2026-09-14 feature: design 008 slice 4 — click-events.js gating + sidebox attack routing.
- S123 2026-09-14 review: design 008 reviewed; decisions D1–D4 + findings R1–R9 recorded.
