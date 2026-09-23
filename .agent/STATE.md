# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 266
Focus: S266 fixed I82+ patch-sized gaps on branch `audit/attack-ability-coverage` (worktree
  ../vibe-audit-coverage, unpushed, not merged). 15 issues closed (incl. I114 audit-script cwd).
Active: none — waiting on the user: design approval for step-driven attack effects.
Next: design 030 "step-driven attack effects" covering I102–I111 (switch/gust, move-energy, discard-opponent,
  attach from discard/hand, draw-until, deck→Bench, search-attach, mill, shuffle-self, misc) + I115;
  then I89/I95 (unhandled ability step types) and I112/I113 (oracle as execution gate, fix EXECUTED lists).
  Merge this branch to main when the user approves. Still pending from S264: designs 028 (I85), 029 (I86),
  #5 description (I87). maintenance due (S260); ISSUES Open still over cap.
Blocked: attack-effects design needs user approval (feature workflow). #5 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Attack/ability green metrics lie: verify execution with `.agent/scratch/cov/oracle.mjs` (state diff).
  The server attack phase (reduce.mjs attack case) runs fixed text helpers, not steps.
- Editing via bash heredoc eats `\` → `\`: write edit scripts with the Write tool / String.raw.
  Working-copy files are CRLF (repo LF); keep eol when scripting edits.
- useAbility now rejects passive/trigger texts in rules mode (isActivatedAbility, ability-executors.mjs).
- Mat FX / deck-builder CSS layering / vendored `*.generated.mjs`: see D95, D99, D103, D104, D97-D100.
- ONE pre-existing failing test: card-inspector-model "retreat greys only when the cost is unpaid". Test with
  `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S266 (branch, unmerged) status abilities, passive gate, {R} discard costs, self-bench recoil, hand/search attach, attach-bonus, coin gates, draw costs.
- S265 audit only: 28 attack/ability execution gaps filed (I88–I115).
- S264 (on main) Dynamotor, Sinister Surge, Adrena-Brain, Acerola's Premonition resolve server-side.
