# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 284
Focus: design 034 (ability behaviour), slice 7 (regression gate). S284 shipped piece 7a:
  `pnpm audit:abilities` classes all 4228 printed abilities runs/partial/dead/passive/unparsed
  (1811/584/148/1684/1) from the engine's own step plan (`resolveAbilitySteps`) + the oracle run,
  ratcheted per family vs `scripts/ability-behaviour-baseline.json` (D126).
Active: 7a committed on `claude/exciting-meitner-pt47ts`. Next: 7b passive "behave" probes.
Next: design 034 slice 7b (call ability-combat/-triggers readers per passive row → consumed/
  unconsumed class in the same gate), then 7c: EXECUTED_ABILITY_FAMILIES from the gate, ADD then
  close I128/I129/I130, annotate reports. I132: oracle-gate undercounts ability damage-counter
  effects. Slice-6 gaps: Manectric bench option, Unown S prize peek, Heat Metal/Overheater, I131.
  Oracle baseline stale-low for ~11 attack families. Move-energy gaps: Plasma Energy filter;
  compound move+switch runs only the move half. Slice-4: extra attack skips resolveCheckup.
  Slice-3 gaps: Special Energy play lock on attachCard; inspector `listAbilities` lacks
  suppression ctx; addCondition immunity can't see suppression. Slice 2: "for each" scaling
  returns 0; client `listAttacks` lacks ability-cost/borrowed options. Maintenance due (S270,
  still not run). I126/I127, I121-I125, I113. Design-number collision 032. Pending: designs 028
  (I85), 029 (I86), #5 description (I87), I84.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Design 034 lives on remote branch `claude/exciting-meitner-pt47ts`; merge to main then sync the
  primary folder. Main checkout still holds an untracked copy of `.agent/designs/034-*.md` —
  delete it before merging and expect main's uncommitted S278 STATE/journal to conflict.
- Two gates after engine ability changes: `pnpm audit:oracle` (~2 min, D108) and
  `pnpm audit:abilities` (~80 s, D126); `--rows` writes per-row JSON under out/ for diffing.
  Re-ratchet only legit improvements. `pnpm test` baseline: 3472, 1 pre-existing fail
  (card-inspector-model "retreat greys…").
- Ability reads go through `cardAbilityText` (I128); D117 import direction: nothing
  ability-combat imports may reach special-conditions. Coin flips go through `flipCoin(rng)`.
- Reducer-only ability outcomes (self-KO, win) are events settled by `settleAbilityOutcomes`;
  hand-activated abilities are legal only from the hand and have no client button yet (I131).
- New ability executables register in `EXTRA_STEP_HANDLERS` (trainer-steps.mjs); the scratch
  ability-series-audit seeds are gone — the repo gate is now the source of truth.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S284 design 034 slice 7a: `pnpm audit:abilities` behaviour gate + baseline (D126, I132 filed).
- S283 design 034 slice 6: 14 one-off ability families (6a-6d, D124/D125, I131 filed).
- S282 design 034 slice 5b: move-Energy shape (D123), when-played must/Bench, Tool search, reveal-hand.
