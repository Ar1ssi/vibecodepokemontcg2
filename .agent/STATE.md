# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 91
Focus: patch — fixed 3 bugs causing Black & White (and HGSS) era decklist imports to show
  Pokémon cards as "Unknown" type in the deck builder's import screen.
Active: done. (1) import.js:548-566 — `getOldCardType(tcgId)` no longer unconditionally
  overwrites a correct `getCardType(set, number)` result; gated behind
  `!type || type === 'Unknown'` same as the Limitless-fallback block already was. (2) added
  Black & White / HeartGold&SoulSilver short codes to `LEGACY_SET_CODE_TO_TCGDEX_ID`
  (legacy-set-ids.mjs) — were completely missing, so `cardDataToID`/`cardDataToImageURL` could
  never resolve a tcgId or image for these cards. (3) `getCardType` (find-type.js) and
  `getOldCardType` (find-old-type.js) breakpoint loops now continue the last known type past a
  set's highest recorded breakpoint instead of falling to 'Unknown' — hit every set's literal
  last card plus any secret rare beyond it. +10 tests, 1288/1288 pass. Lint clean on the diff
  (2 pre-existing errors in import.js:400 unrelated to this change, confirmed via git diff scope).
Next: user should re-import a Black & White era decklist on localhost to confirm cards now show
  correct Pokémon/Trainer/Energy types (not independently browser-verified — DOM-coupled import
  screen, static trace + unit tests on the underlying pure functions instead). Nothing else
  queued from this session. Carried over from prior sessions: I34 (turn-desync residual, 1/10
  soak failures, journal S88); S73 drag active→bench retreat live-verify, mat pickers + Grand
  Tree; maintenance due S96.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md`.
- `pnpm lint` fails repo-wide on pre-existing CRLF line endings + `no-undef` globals on `.mjs`
  files (eslint.config only targets `**/*.js`, so `.mjs` gets no `globals` and no `endOfLine:
  'auto'`) — known baseline since S1. Verify a diff's own files with a targeted `npx eslint
  <files>` and read past the CRLF noise; don't try to fix the repo-wide config in passing.
- `playtest-bot.mjs --games=N` is now a real regression gate for legacy-mode multiplayer
  desyncs, not just a bug-finder — a clean run used to be blocked on I30, now it isn't. Treat
  a new failure from it as a real finding again, not "known I30 noise."
- The `(user, ...parameters, emit)` acceptAction calling convention is easy to get wrong when
  a parameter can look like a boolean or overlap emit's position — see `parseAttackArgs`/
  `parseRetreatArgs` (sync-action-args.mjs) before adding a parameter to any legacy action.
- `client/src/setup/deck-constructor/` (legacy decklist import/type-detection, import.js/
  find-type.js/find-old-type.js) is a much older, more error-prone area than
  `deck-builder/core/` — the two "unconditional overwrite whichever ran last wins" and "no
  catch-all past the last table entry" bug classes fixed in S91 are worth re-checking if more
  "wrong card type on import" reports surface for eras still uncovered (e.g. EX/e-Card era
  short codes' getCardType tables weren't audited this session, only Black & White/HGSS).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S91 2026-09-12 patch: fixed 3 bugs behind "old-set imports show as Unknown" — see Active above.
- S90/S90b 2026-09-10 feature: design 006 — generation pills + per-generation Energy tabs in
  Browse Sets.
- S89/S89b 2026-09-10 feature+patch: 3D energy tokens for attached Energy (design 005, a
  concurrent session, merged from main).
