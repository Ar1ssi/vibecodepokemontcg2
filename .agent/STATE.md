# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 279
Focus: design 034 slices 1-2 on branch `feature/ability-behaviour` (worktree
  %TEMP%/opencode/ability-behaviour-wt). Slice 1: `cardAbilityText` single plural-aware accessor,
  I130 legacy "reduced by N" now HP units (`reduceHp`), parseThorns legacy wording + zone flag,
  typed-basic HP-cap + or-split fix. Slice 2: new `rules/ability-combat.mjs` readers + matrix
  tests, computeAttackDamage ability options (bonus/reduction before+after WR/prevention/weakness
  override), wired at all 3 reduce attack sites, `effectiveHp` (sideCards), handleKnockout prizes,
  retreat cost, attack-cost ignore + Wild Growth multiplier.
Active: slice 2 done. Next: slice 3 (suppression predicate, `abilityActivationBlockReason`,
  picker parity, play/status/evolve/retreat locks, summon/first-turn/extra-attack gates).
Next: continue design 034 slices 3-7 (ledger in NEXTSTEPS.md + design Deviations). Slice 2 gaps:
  "for each" scaling abilities return 0; client `listAttacks` lacks ability-cost options (server
  `attackCostPayable` has them). Maintenance due (S270, still not run). I126/I127, I121-I125,
  I113 oracle blind to damage amounts. Design-number collision 032 (code comments mean the
  coin-gated one). Pending: designs 028 (I85), 029 (I86), #5 description (I87), I84 legacy.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Design 034 is on `feature/ability-behaviour`; merge to main then sync the primary folder. Main
  checkout still holds the untracked copy of `.agent/designs/034-*.md` — delete it before merging
  (the branch tracks the file) and expect main's uncommitted S278 STATE/journal to conflict.
- `pnpm audit:oracle` (~2 min, D108) after engine attack/ability changes; legit rate changes →
  `--update-baseline` + commit scripts/oracle-baseline.json. `pnpm test` baseline: 3351 pass, 1
  pre-existing fail (card-inspector-model "retreat greys…"); lint is prettier-warning noise only.
- Working-copy files are CRLF (repo LF); use the Write/Edit tools for edits — bash rewrites can
  re-encode. Editing via bash heredoc eats `\`.
- Ability reads must go through `cardAbilityText` (plural `abilities[]`, I128); ability-combat may
  import tool-combat but tool-combat/stadium-effects must not import ability-combat (cycle).
- Pre-existing `pnpm test` failures (env/CRLF): card-inspector-model "retreat greys…" plus six
  client suites when run on some machines; not yours.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S279 design 034 slice 1: `cardAbilityText` accessor; I130 HP reduction; parseThorns legacy; typed-basic HP cap.
- S279 design 034 slice 2: `ability-combat.mjs` + computeAttackDamage options wired (damage/HP/prize/retreat/cost).
- S277 team-wide retreat-cost: `teamNoRetreatCostForActive` (D116) zeroes the Active's cost from a Benched Skyliner-style holder.
