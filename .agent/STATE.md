# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 269
Focus: S269 closed I118 (design 031 shipped) on branch `feature/i118-attack-gaps` (worktree .claude/worktrees/i118),
  NOT merged or pushed. S267/S268 work also still unpushed on local main.
Active: none.
Next: merge feature/i118-attack-gaps into main and push when the user says so.
  I120 (75 coin-gated sentences with no effect), I119 (10 unparsed printings), I113 oracle gate (damage amounts).
  Still pending: designs 028 (I85), 029 (I86), #5 description (I87), I84 legacy (untested by policy).
  maintenance due (S260); ISSUES Open still over cap.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Attack/ability green metrics lie: verify execution with `.agent/scratch/cov/oracle.mjs` (state diff, ~3 min),
  then `family-exec.mjs` / `family-signal.mjs` (event + parser coverage per family). Oracle cannot see damage amounts.
- Editing via bash heredoc eats `\` → write edit scripts with the Write tool / String.raw.
  Working-copy files are CRLF (repo LF); keep eol when scripting edits.
- Timed attack effects are `card.attackMarkers` (D108); copy attacks resolve before coins, tokens carry `copiedAttack` (D109).
- Mat FX / deck-builder CSS layering / vendored `*.generated.mjs`: see D95, D99, D103, D104, D97-D100.
- ONE pre-existing failing test: card-inspector-model "retreat greys only when the cost is unpaid". Test with
  `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S269 I118 / design 031: markers, HP-cap, reveal-hand, shuffle-cost, copy attacks run on the server.
- S268 I112: EXECUTED_ATTACK_FAMILIES synced to oracle; 10 client-only families filed as I118.
- S267 design 030 attack steps (switch/gust/move-energy/discard/attach/bench/mill/KO/Lost Zone/heal…), shuffleInPlace fix.
