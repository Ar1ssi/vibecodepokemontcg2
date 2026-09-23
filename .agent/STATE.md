# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 268
Focus: S268 closed I112 on branch `fix/i112-attack-family-list`; merged locally into main (NOT pushed).
  S267 design 030 work also still unpushed on local main.
Active: I118 / design 031 on feature/i118-attack-gaps (worktree .claude/worktrees/i118). Slices 1-2 committed; next slice 3 (deferred KO, retaliate, hp-cap damage).
Next: I118 (server attack gaps: reveal-hand, immunity, damage-prevention, next-turn-bonus, copy-attack, …) needs a design.
  I113 oracle gate (record damage amounts so damage-scaling families are verifiable). Push main when the user says so.
  Still pending: designs 028 (I85), 029 (I86), #5 description (I87), I84 legacy (untested by policy).
  maintenance due (S260); ISSUES Open still over cap.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Attack/ability green metrics lie: verify execution with `.agent/scratch/cov/oracle.mjs` (state diff, ~3 min),
  then `family-exec.mjs` for per-family rates. Oracle cannot see damage amounts or player-level flags.
- Editing via bash heredoc eats `\` → `\`: write edit scripts with the Write tool / String.raw.
  Working-copy files are CRLF (repo LF); keep eol when scripting edits.
- useAbility now rejects passive/trigger texts in rules mode (isActivatedAbility, ability-executors.mjs).
- Mat FX / deck-builder CSS layering / vendored `*.generated.mjs`: see D95, D99, D103, D104, D97-D100.
- ONE pre-existing failing test: card-inspector-model "retreat greys only when the cost is unpaid". Test with
  `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S268 I112: EXECUTED_ATTACK_FAMILIES synced to oracle; 10 client-only families filed as I118.
- S267 design 030 attack steps (switch/gust/move-energy/discard/attach/bench/mill/KO/Lost Zone/heal…), shuffleInPlace fix.
- S266 status abilities, passive gate, {R} discard costs, self-bench recoil, hand/search attach, coin gates.
