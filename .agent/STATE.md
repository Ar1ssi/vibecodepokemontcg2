# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 283
Focus: design 034 (ability behaviour). S283 shipped slice 6 (executor batch B) in 4 commits
  (6a-6d): all 14 one-off families from the design's slice-6 row now execute, with 49 tests in
  `shared/engine/__tests__/ability-one-offs.test.mjs`. Along the way: trainer "Your turn ends."
  is now enforced server-side, the legacy Pokémon Power "can't be used if Asleep…" clause is a
  use gate instead of a misparsed status (D125), and Energy-as-Pokémon cards use `asEnergy` (D124).
Active: slice 6 complete on `claude/exciting-meitner-pt47ts` (3c7266db). Next: slice 7, the
  regression gate (`scripts/audit-ability-behaviour.mjs` + baseline, `pnpm audit:abilities`).
Next: design 034 slice 7 — also ADD then close I128/I129/I130 (referenced by the design, never
  filed in ISSUES.md). Slice-6 gaps: Manectric bench option, Unown S prize peek, Heat Metal/
  Overheater, I131. Oracle baseline stale-low for ~11 attack families (pre-existing). Move-energy
  gaps: Plasma Energy filter; compound move+switch texts run only the move half. Slice-4: extra
  attack skips resolveCheckup — confirm live. Slice-3 gaps: Special Energy play lock on
  attachCard; inspector `listAbilities` lacks suppression ctx; addCondition immunity can't see
  suppression. Slice 2: "for each" scaling returns 0; client `listAttacks` lacks ability-cost and
  borrowed-attack options. Maintenance due (S270, still not run). I126/I127, I121-I125, I113.
  Design-number collision 032. Pending: designs 028 (I85), 029 (I86), #5 description (I87), I84.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Design 034 lives on remote branch `claude/exciting-meitner-pt47ts`; merge to main then sync the
  primary folder. Main checkout still holds an untracked copy of `.agent/designs/034-*.md` —
  delete it before merging and expect main's uncommitted S278 STATE/journal to conflict.
- `pnpm audit:oracle` (~2 min, D108) after engine ability changes; diff rows with `--rows` against
  the previous commit before re-ratcheting, and edit only the affected families. `pnpm test`
  baseline: 3464 pass, 1 pre-existing fail (card-inspector-model "retreat greys…").
- Ability reads go through `cardAbilityText` (I128); D117 import direction: nothing
  ability-combat imports may reach special-conditions (it now imports evolved-pokemon/evolution —
  checked acyclic). Coin flips go through `flipCoin(rng)` so Contrary's forced tails apply.
- Reducer-only ability outcomes (self-KO, win) are events settled by `settleAbilityOutcomes`
  after useAbility and ability resumes; hand-activated abilities are legal only from the hand
  (`isHandActivatedAbility`) and have no client button yet (I131).
- New ability executables register in `EXTRA_STEP_HANDLERS` (trainer-steps.mjs).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S283 design 034 slice 6: 14 one-off ability families (6a-6d, D124/D125, I131 filed).
- S282 design 034 slice 5b: move-Energy shape (D123), when-played must/Bench, Tool search, reveal-hand.
- S281 design 034 slice 5a: six ability step executables in `EXTRA_STEP_HANDLERS` (c6392bb8).
