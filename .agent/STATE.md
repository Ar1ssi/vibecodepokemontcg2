# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 287
Focus: I141 — the measured ability backlog after design 034 (complete S287). Current
  runs/partial/dead/consumed/unconsumed/unparsed = 1635/257/102/1128/1105/1 (activation per the
  server gate, D130).
Active: I141 when-played pass (D129), gate honesty (D130), on-damage status hook committed.
Next: I141 clusters — trigger readers for attach/KO/other on-damage texts, then the
  activated partials (`--rows`, unexecutable). Issue-number collision with feature/trainer-behaviour (I131-I135) — renumber at
  merge. I140 retreat wordings. Slice-6 gaps: Manectric bench option, Unown S prize peek, Heat
  Metal/Overheater, I131. Move-energy gaps: Plasma filter; compound move+switch. Slice-4: extra
  attack skips resolveCheckup. Slice-3 gaps: Special Energy play lock on attachCard; inspector
  `listAbilities` lacks suppression ctx. Client `listAttacks` prices cost discounts without a
  board. Maintenance due (S270, still not run). I126/I127, I121-I125, I113.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Design 034 lives on remote branch `claude/exciting-meitner-pt47ts`; merge to main then sync the
  primary folder. Main checkout still holds an untracked copy of `.agent/designs/034-*.md` —
  delete it before merging and expect main's uncommitted S278 STATE/journal to conflict.
- Two gates after engine ability changes: `pnpm audit:oracle` (~2 min, D108) and
  `pnpm audit:abilities` (~2 min, D126/D127); `--rows` writes per-row JSON under out/ for diffing.
  Re-ratchet only legit improvements. `pnpm test` baseline: 3494, 1 pre-existing fail
  (card-inspector-model "retreat greys…").
- Ability reads go through `cardAbilityText` (I128); D117 import direction: nothing
  ability-combat imports may reach special-conditions. Coin flips go through `flipCoin(rng)`.
- Reducer-only ability outcomes (self-KO, win) are events settled by `settleAbilityOutcomes`;
  hand-activated abilities are legal only from the hand and have no client button yet (I131).
- New ability executables register in `EXTRA_STEP_HANDLERS` (trainer-steps.mjs); the scratch
  ability-series-audit seeds are gone — the repo gate is now the source of truth.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S287 design 034 slice 7c + I137/I138/I139; I141 when-played pass (D129), gate honesty (D130).
- S286 I136 fix: damage/retreat "less" wordings no longer discount attack costs (P1 free attacks).
- S285 design 034 slice 7b: passive behaviour probes, consumed/unconsumed classes (D127); found I136-I138.
