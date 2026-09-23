# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 267
Focus: S267 shipped design 030 (step-driven attack effects) + I89/I95/I115/I116/I117 on branch
  `audit/attack-ability-coverage`; merged locally into main folder (NOT pushed to GitHub).
Active: none.
Next: I112/I113 tooling — re-sync EXECUTED_*_FAMILIES lists to oracle results, promote oracle to a gate.
  Push main when the user says so. Still pending: designs 028 (I85), 029 (I86), #5 description (I87),
  I84 legacy (untested by policy). maintenance due (S260); ISSUES Open still over cap.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Attack/ability green metrics lie: verify execution with `.agent/scratch/cov/oracle.mjs` (state diff).
  Attack phase now runs parseAttackSteps (rules/attack-steps.mjs) via ATTACK_STEP_HANDLERS; resume effectType attackSteps.
- Editing via bash heredoc eats `\` → `\`: write edit scripts with the Write tool / String.raw.
  Working-copy files are CRLF (repo LF); keep eol when scripting edits.
- useAbility now rejects passive/trigger texts in rules mode (isActivatedAbility, ability-executors.mjs).
- Mat FX / deck-builder CSS layering / vendored `*.generated.mjs`: see D95, D99, D103, D104, D97-D100.
- ONE pre-existing failing test: card-inspector-model "retreat greys only when the cost is unpaid". Test with
  `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S267 design 030 attack steps (switch/gust/move-energy/discard/attach/bench/mill/KO/Lost Zone/heal…), shuffleInPlace fix.
- S266 status abilities, passive gate, {R} discard costs, self-bench recoil, hand/search attach, coin gates.
- S265 audit only: 28 attack/ability execution gaps filed (I88–I115).
