# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 280
Focus: design 034 on branch `feature/ability-behaviour` (worktree
  %TEMP%/opencode/ability-behaviour-wt). Slice 3 committed (09fb0713): suppression predicate +
  one `abilityActivationBlockReason` shared by reduce/picker, play locks, status immunity, evolve
  permission/lock, summon, retreat/counter locks, first-turn attack (D118). Slice 4a (uncommitted):
  new pure `rules/ability-triggers.mjs` (D119) + wired Checkup damage (Froslass/Magmortar/Pecharunt/
  TR Tyranitar/Trevenant), mandatory end-of-turn discard (Great Tusk ex), opponent-evolve counters
  (TR Ampharos), thorns suppression/zone gate.
Active: slice 4a committed (163448d). Next: slice 4b — read `.agent/designs/034-slice4b-handoff.md`
  (`movedToActiveTurn` stamp at every switch site + on-promotion activation window, on-KO energy
  moves, `abilityExtraAttack`).
Next: design 034 slices 4b/5/6/7 (ledger in NEXTSTEPS.md + design Deviations). Slice-4 gaps:
  on-promotion window + `movedToActiveTurn` stamp; on-KO energy choice; optional end-of-turn
  abilities. Slice-3 gaps: Special Energy play lock on attachCard; inspector `listAbilities` lacks
  suppression ctx; immunity in addCondition can't see suppression; `abilityExtraAttack` read-only.
  Slice 2 gaps: "for each" scaling returns 0; client `listAttacks` lacks ability-cost options.
  Maintenance due (S270, still not run). I126/I127, I121-I125, I113 oracle blind to damage amounts.
  Design-number collision 032 (code comments mean the coin-gated one). Pending: designs 028 (I85),
  029 (I86), #5 description (I87), I84 legacy.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Design 034 is on `feature/ability-behaviour`; merge to main then sync the primary folder. Main
  checkout still holds the untracked copy of `.agent/designs/034-*.md` — delete it before merging
  (the branch tracks the file) and expect main's uncommitted S278 STATE/journal to conflict.
- `pnpm audit:oracle` (~2 min, D108) after engine attack/ability changes; legit rate changes →
  update the baseline deliberately. `pnpm test` baseline now: 3386 pass, 1 pre-existing fail
  (card-inspector-model "retreat greys…"); lint is prettier-warning noise only.
- Working-copy files are CRLF (repo LF); use the Write/Edit tools for edits — bash rewrites can
  re-encode. Editing via bash heredoc eats `\`.
- Ability reads must go through `cardAbilityText` (plural `abilities[]`, I128); ability-combat may
  import tool-combat, and ability-triggers may import both (D119), but nothing they import may
  reach special-conditions (addCondition imports abilityStatusImmune — keep that direction only).
- Pre-existing `pnpm test` failures (env/CRLF): card-inspector-model "retreat greys…" plus six
  client suites when run on some machines; not yours.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S280 design 034 slice 4a: `ability-triggers.mjs` + Checkup/end-of-turn/opponent-evolve/thorns hooks (D119).
- S280 design 034 slice 3: ability gates/suppression/locks + picker parity (09fb0713, D118).
- S279 design 034 slices 1-2: `cardAbilityText`; `ability-combat.mjs` + computeAttackDamage options.
