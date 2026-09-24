# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 282
Focus: design 034 (ability behaviour), slices 1-5a done earlier (see journal S279-S281). S282
  verified + fixed the S281 slice-5b WIP: `parseMoveEnergyShape` (D123) gives every move-Energy
  Ability a printed destination (self/active/bench/between, target tags); `moveEnergyAbility`
  handler honours it and auto-moves a forced single Energy; widened when-played preamble now runs
  Durant ex / Gyarados "must" / Mawile via templates; Farfetch'd Tool search reads `Pokémon Tool`
  (ability search parser, `matchesSearch`, `searchAttachStep`).
Active: slice 5b-1 committed on `claude/exciting-meitner-pt47ts`. Next: 5b-2 opponent-disrupt
  reveal-hand wordings (Zubat Revealing Echo, Mandibuzz, Thievul, Hawlucha — no template block),
  then slices 6/7 (`.agent/designs/034-slice5-7-handoff.md`, ledger in NEXTSTEPS.md).
Next: design 034 5b-2/6/7. Move-energy gaps: Plasma Energy filter unread; compound move+switch
  texts (Iron Leaves, Articuno-GX, Tapu Koko-GX, Croconaw) run only the move half. Slice-5a gaps:
  hand-activated placement abilities blocked by `validateReferences`; `swapActive` untested.
  Slice-4: extra attack skips resolveCheckup — confirm live. Slice-3 gaps: Special Energy play
  lock on attachCard; inspector `listAbilities` lacks suppression ctx; addCondition immunity can't
  see suppression. Slice 2: "for each" scaling returns 0; client `listAttacks` lacks ability-cost
  options. Maintenance due (S270, still not run). I126/I127, I121-I125, I113. Design-number
  collision 032. Pending: designs 028 (I85), 029 (I86), #5 description (I87), I84 legacy.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Design 034 is on remote branch `claude/exciting-meitner-pt47ts` (from `ability-behaviour-s5b-7-handoff`,
  the pushed copy of local `feature/ability-behaviour`); merge to main then sync the primary folder. Main
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
- S282 design 034 slice 5b-1: move-Energy shape reader + handler (D123), when-played must/Bench, Tool search.
- S281 design 034 slice 5a: six ability step executables in `EXTRA_STEP_HANDLERS` (c6392bb8).
- S281 design 034 slice 4b: on-promotion window (D120), on-KO energy moves (D121), extra attack (D122).
