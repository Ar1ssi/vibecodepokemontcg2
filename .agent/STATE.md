# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 280
Focus: design 034 slice 3 on branch `feature/ability-behaviour` (worktree
  %TEMP%/opencode/ability-behaviour-wt). Suppression predicate wired into useAbility + all
  slice-2 readers + locks; one `abilityActivationBlockReason` shared by reduce + picker; play
  locks; status immunity in `addCondition`; evolve permission/lock; summon restriction; retreat
  lock; Patrat counter lock; Meloetta first-turn attack. Parser fixes: named-condition immunity,
  "each play" substring, evolve-lock double-parse, Spearow permission. Oracle baseline
  re-ratcheted for 3 families (D118).
Active: slice 3 done, uncommitted in the worktree. Next: commit it, then slice 4
  (`ability-triggers.mjs` + checkup/end-of-turn/on-damage/on-promotion/on-KO hooks; the
  `movedToActiveTurn` stamp lands there).
Next: continue design 034 slices 4-7 (ledger in NEXTSTEPS.md + design Deviations). Slice-3 gaps:
  Special Energy play lock on attachCard; inspector `listAbilities` lacks suppression ctx;
  immunity inside addCondition can't see suppression; `abilityExtraAttack` read-only. Slice 2
  gaps: "for each" scaling returns 0; client `listAttacks` lacks ability-cost options.
  Maintenance due (S270, still not run). I126/I127, I121-I125, I113 oracle blind to damage
  amounts. Design-number collision 032 (code comments mean the coin-gated one). Pending: designs
  028 (I85), 029 (I86), #5 description (I87), I84 legacy.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Design 034 is on `feature/ability-behaviour`; merge to main then sync the primary folder. Main
  checkout still holds the untracked copy of `.agent/designs/034-*.md` — delete it before merging
  (the branch tracks the file) and expect main's uncommitted S278 STATE/journal to conflict.
- `pnpm audit:oracle` (~2 min, D108) after engine attack/ability changes; legit rate changes →
  update the baseline deliberately (slice 3 changed only the 3 affected family counts, not a
  full `--update-baseline`, because the committed baseline is stale for many attack families —
  a full refresh would silently re-ratchet them). `pnpm test` baseline: 3374 pass, 1 pre-existing
  fail (card-inspector-model "retreat greys…"); lint is prettier-warning noise only.
- Working-copy files are CRLF (repo LF); use the Write/Edit tools for edits — bash rewrites can
  re-encode. Editing via bash heredoc eats `\`.
- Ability reads must go through `cardAbilityText` (plural `abilities[]`, I128); ability-combat may
  import tool-combat, but nothing ability-combat imports may reach special-conditions (addCondition
  imports abilityStatusImmune — keep that direction only).
- Pre-existing `pnpm test` failures (env/CRLF): card-inspector-model "retreat greys…" plus six
  client suites when run on some machines; not yours.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S280 design 034 slice 3: ability gates/suppression/locks + picker parity (D118).
- S279 design 034 slices 1-2: `cardAbilityText`; `ability-combat.mjs` + computeAttackDamage options.
- S277 team-wide retreat-cost: `teamNoRetreatCostForActive` (D116) zeroes the Active's cost from a Benched Skyliner-style holder.
