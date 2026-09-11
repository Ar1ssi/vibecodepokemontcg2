# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 104 (drafted as S91 on this branch — renumbered on merge; main's own journal had
  already reused S91 twice by the time this branch caught up, see journal for both)
Focus: merged this branch's patch — 3 bugs behind "old-set decklist imports show as Unknown, not
  Pokémon" — onto main's current tip (which had moved through S91-S103 since this branch started).
Active: done for this branch's patch: (1) import.js:548-566 — `getOldCardType(tcgId)` no longer
  unconditionally overwrites a correct `getCardType(set, number)` result; gated behind
  `!type || type === 'Unknown'`. (2) added Black & White / HeartGold&SoulSilver short codes to
  `LEGACY_SET_CODE_TO_TCGDEX_ID` (legacy-set-ids.mjs) — were completely missing. (3)
  `getCardType`/`getOldCardType` breakpoint loops (find-type.js, find-old-type.js) now continue
  the last known type past a set's highest recorded breakpoint instead of 'Unknown'. +10 tests.
  Everything else in this STATE (I40/I42/S103 netcode fixes, S91 Grand Tree investigation, the
  cherry-picked section-2 fixes) is prior work from other sessions merged in unchanged — not
  re-verified here beyond `pnpm test` passing post-merge.
Next: user should re-import a Black & White era decklist on localhost to confirm cards now show
  correct types (not independently browser-verified this session — DOM-coupled import screen).
  Carried over: I41 (legacy rejoin, no opening hand, 1 sample, untriaged); I39 flip-gate-test
  fails on current main (pre-existing); I37 live 2P check; I34 turn-desync residual; Grand Tree
  cosmetic chat line. Maintenance due (carried from S100, still not done as of S103).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Test netcode changes in BOTH modes: `SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js`
  plus a plain legacy server; S101 shipped a legacy-only fix to a server-authoritative prod (D17).
- Sync-check must hash what the owner's view shows (hashOwnerViewZones), never raw state, and
  skips the compare on a stateVersion mismatch (I42) — don't drop either guard.
- Room exit/entry must dispatch document 'room-changed' (S101) — Leave/reset/resetDealOrder all
  hang off it (rules-bridge.js's resetRulesSession, S103).
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`). Verify a diff's own files with targeted
  `npx eslint <files>` and read past the CRLF noise; don't fix the repo-wide config in passing.
- `client/src/setup/deck-constructor/` (legacy decklist import/type-detection) is older and more
  error-prone than `deck-builder/core/` — S104 fixed an "overwrite whichever ran last wins" bug
  and a "no catch-all past the last breakpoint" bug there; EX/e-Card era short codes' getCardType
  tables weren't audited, only Black & White/HGSS — worth re-checking on the next report.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S104 2026-09-12 patch: fixed 3 bugs behind "old-set imports show as Unknown" — see Active above.
- S103 2026-09-11 fix(netcode): resetDealOrder wired to room-changed (I40); syncCheck skips the
  compare on a stale stateVersion instead of false-reporting a desync (I42).
- S91 (main) 2026-09-11 chore(merge): cherry-picked section-2 fixes (TCGdex enrichment, Colorless
  attack-cost rule correction) onto main.
