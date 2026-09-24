# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 287
Focus: design 034 (ability behaviour), slice 7 (regression gate). 7a (S284) `pnpm audit:abilities`
  (D126); 7b (S285) passive probes (D127). S286 fixed I136: `passiveCostDiscount` needs one
  sentence saying an attack's cost goes down → runs/partial/dead/consumed/unconsumed/unparsed =
  1811/584/148/1106/578/1 (60 rows re-ratcheted consumed→unconsumed, bogus reads only).
Active: I137 committed (S287). Next: I138, then 7c, then I139, then the unconsumed backlog.
Next: I137/I138 (probe-found wrong reads), I139 (cost-discount conditions/scope ignored). 7c:
  EXECUTED_ABILITY_FAMILIES from the gate, ADD then close I128/I129/I130, annotate reports; 578
  unconsumed passives are the enforcement backlog (`--rows`, behaviour=unconsumed). Issue-number
  collision with feature/trainer-behaviour (I131-I135) — renumber at merge. I132: oracle-gate
  undercounts ability damage-counter effects. Slice-6 gaps: Manectric bench option, Unown S prize
  peek, Heat Metal/Overheater, I131. Oracle baseline stale-low for ~11 attack families.
  Move-energy gaps: Plasma filter; compound move+switch. Slice-4: extra attack skips
  resolveCheckup. Slice-3 gaps: Special Energy play lock on attachCard; inspector `listAbilities`
  lacks suppression ctx; addCondition immunity can't see suppression. Slice 2: "for each" scaling
  returns 0; client `listAttacks` lacks ability-cost/borrowed options. Maintenance due (S270,
  still not run). I126/I127, I121-I125, I113.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Design 034 lives on remote branch `claude/exciting-meitner-pt47ts`; merge to main then sync the
  primary folder. Main checkout still holds an untracked copy of `.agent/designs/034-*.md` —
  delete it before merging and expect main's uncommitted S278 STATE/journal to conflict.
- Two gates after engine ability changes: `pnpm audit:oracle` (~2 min, D108) and
  `pnpm audit:abilities` (~2 min, D126/D127); `--rows` writes per-row JSON under out/ for diffing.
  Re-ratchet only legit improvements. `pnpm test` baseline: 3479, 1 pre-existing fail
  (card-inspector-model "retreat greys…").
- Ability reads go through `cardAbilityText` (I128); D117 import direction: nothing
  ability-combat imports may reach special-conditions. Coin flips go through `flipCoin(rng)`.
- Reducer-only ability outcomes (self-KO, win) are events settled by `settleAbilityOutcomes`;
  hand-activated abilities are legal only from the hand and have no client button yet (I131).
- New ability executables register in `EXTRA_STEP_HANDLERS` (trainer-steps.mjs); the scratch
  ability-series-audit seeds are gone — the repo gate is now the source of truth.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S286 I136 fix: damage/retreat "less" wordings no longer discount attack costs (P1 free attacks).
- S285 design 034 slice 7b: passive behaviour probes, consumed/unconsumed classes (D127); found I136-I138.
- S284 design 034 slice 7a: `pnpm audit:abilities` behaviour gate + baseline (D126, I132 filed).
