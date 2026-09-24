# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 281
Focus: design 034 on branch `feature/ability-behaviour` (worktree
  %TEMP%/opencode/ability-behaviour-wt). Slices 1-3 + 4a committed earlier. Slice 4b (done,
  c4858f77 / 762bd31e / f45abfac): (1) on-promotion window — one post-command
  `stampActivePromotions` diffs pre/post Active zones (covers every bench→active site), clears
  the stamp on the way out, and `abilityActivationBlockReason` rejects only a *stale*
  `movedToActiveTurn` (fails open when absent) D120; (2) on-KO energy moves — `parseOnKoAbilities`
  grew energyType/targetKind/selfSource, `captureOnKoEnergyMoves` records the victim's Energy onto
  `draft.__koEnergyMoves` before discard, `settleKoEnergyMoves` tail auto-moves or raises a
  `koEnergy` PendingChoice D121; (3) `extraAttackAvailable` + per-turn `flags.attacksThisTurn` —
  Dipplin/Ω Barrage second attack keeps the turn open D122. Slice 5a (c6392bb8): six ability step
  handlers in `EXTRA_STEP_HANDLERS` — `moveDamageBetweenAbility` (own↔own counters, `toSelf`),
  `recoverStatusAbility`, `selfDamageAbility`, `turnDamageBonusAbility` (+`attackerInstanceId`
  scope), `selfBenchPlacementAbility` (morePrizes/opponentStage2 conditions), `returnSelfToHandAbility`.
Active: slice 5a committed (c6392bb8). Next: slice 5b (remaining batch A — generic move-energy
  wording, when-played "must"/Bench templates, opponent-disrupt reveal wordings, tool-return parse
  fix), then slices 6/7.
Next: design 034 slices 5b/6/7 (ledger in NEXTSTEPS.md). Slice-5a gaps: hand-activated placement
  abilities can't pass `validateReferences` for useAbility (active/bench only) — handler tested via
  executeSteps; `swapActive` variant untested. Slice-4 note: extra-attack skips resolveCheckup
  between the two attacks — confirm on a live game. Slice-3 gaps: Special Energy play lock on
  attachCard; inspector `listAbilities` lacks suppression ctx; immunity in addCondition can't see
  suppression. Slice 2 gaps: "for each" scaling returns 0; client `listAttacks` lacks ability-cost
  options. Maintenance due (S270, still not run). I126/I127, I121-I125, I113 oracle blind to damage
  amounts. Design-number collision 032 (code comments mean the coin-gated one). Pending: designs
  028 (I85), 029 (I86), #5 description (I87), I84 legacy.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Design 034 is on `feature/ability-behaviour`; merge to main then sync the primary folder. Main
  checkout still holds the untracked copy of `.agent/designs/034-*.md` — delete it before merging
  (the branch tracks the file) and expect main's uncommitted S278 STATE/journal to conflict.
- `pnpm audit:oracle` (~2 min, D108) after engine attack/ability changes; legit rate changes →
  update the baseline deliberately. `pnpm test` baseline now: 3399 pass, 1 pre-existing fail
  (card-inspector-model "retreat greys…"); lint is prettier-warning noise only.
- Working-copy files are CRLF (repo LF); use the Write/Edit tools for edits — bash rewrites can
  re-encode. Editing via bash heredoc eats `\`.
- Ability reads must go through `cardAbilityText` (plural `abilities[]`, I128); ability-combat may
  import tool-combat, ability-triggers may import both (D119), but nothing they import may reach
  special-conditions (addCondition imports abilityStatusImmune — keep that direction only).
- New design-034 state lives on `draft.__koEnergyMoves` (tail-settled, not flags) and per-turn
  `flags.attacksThisTurn`; `movedToActiveTurn` is stamped by the single post-command diff, never at
  individual switch sites. Ability executables are registered in `EXTRA_STEP_HANDLERS`
  (trainer-steps.mjs), which `isExecutableStepType` picks up automatically.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S281 design 034 slice 5a: six ability step executables in `EXTRA_STEP_HANDLERS` (c6392bb8).
- S281 design 034 slice 4b: on-promotion window (D120), on-KO energy moves (D121), extra attack (D122).
- S280 design 034 slice 4a: `ability-triggers.mjs` + Checkup/end-of-turn/opponent-evolve/thorns hooks (D119).
