# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 206
Focus: PRs #171 (once-per-game GX attack/VSTAR Power), #172 (stadium inspector Use panel) and
  #173 (rulebook-30c Phases 0–6 + review fixes) are MERGED to `main` (6fab9c2, 34c509a, 813474a).
  171 was reconciled with 173, not taken wholesale: kept 173's `oncePerGame` state, optional
  `kind` + subtype inference, and flags mirror; kept 171's attack-command GX gate (`isGxAttack`),
  spend-on-resolve (also target-choice resume, never Confusion fizzle), view projection, and
  `instanceId`-optional shape/refs. Dedupe: D76 (card-classify, was `D-cardclassify`), D77
  (stadium inspector, was a second D61), merged D61 text; I64 (attack panel, was a second I61).
Active: worktree `C:\Users\SMG26\AppData\Local\Temp\opencode\merge-171-173` on `merge/prs-171-173`
  @ 813474a + the S206 harness commit, pushed to `main`.
Next: overdue maintenance (carried since S200): run `.agent/workflows/maintain.md` — DECISIONS is
  ~140 active lines vs its 50-line cap (archive superseded/expired), journal is ~2270 lines.
  Also owed: browser e2e for the stadium inspector Use panel (PR #172's open edge rows); I64
  (attack panel does not grey a spent GX attack); I62/I63 (V-UNION / LEGEND play rules).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm test` = D75 globs, 2145/2145 green on merged main. Lint bar: `npx eslint --rule
  'linebreak-style: off' --rule 'prettier/prettier: off' <files>`; pre-existing errors only
  (card-search `URL`/`fetch`, evolution `fetch`/no-empty, ko-flow `rulesState`/`defenderBoard`,
  rules-bridge/chat-buttons no-empty+unused, rules-extended unused imports, reduce.test
  `getZone`/`findCard`, card-inspector `document`/`requestAnimationFrame`). `pnpm lint` NOT usable.
- Once-per-game lives on game-scoped `player.oncePerGame` (survives `advanceTurn`; `flags` only
  mirrors it). `useVStarGX.kind` is OPTIONAL (inferred from `isVstarCard`/`isGxCard`; unclassifiable
  senders spend both); `instanceId` optional. GX attacks are gated in the `attack` case by
  `isGxAttack` and spent on resolve only — not on a Confusion fizzle, yes on target-choice resume.
- `dual-run-bridge.js` maps legacy `VSTARGXFunction [type]` → `kind` and omits `instanceId`
  (I22 closed); command shape + `validateReferences` accept that omission.
- Card classification: ONLY `card-classify.mjs` predicates (`isRuleBoxPokemon` = sole rule-box
  definition; ex/GX name suffixes need a separator, D73; TFHG accepts a modern ex by design, D74).
- Prism Star discards route through `discardCardToPlayerZone` (D65); Ancient Traits are
  marker-only (D72). Stadium usability decisions live in `stadiumActivationStatus` (D77).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S206 merge: PRs #171/#172/#173 on `main`; 171+173 once-per-game reconciled; 2145/2145, lint delta nil.
- S205 review-fix Phase 6: TFHG/tiebreak kept + documented (D74), `pnpm test` → globs (D75); 2126/2126.
- S193 feature: Stadium double-click → inspector Use panel (`stadiumActivationStatus`, D77); 2012/2012.
