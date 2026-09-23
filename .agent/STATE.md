# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 269
Focus: S269 closed I113 (design 032, oracle execution gate) on branch `feature/i113-oracle-gate`; merged locally into main (NOT pushed).
  S267/S268 work also still unpushed on local main.
Active: none.
Next: I118 (server attack gaps: reveal-hand, immunity, damage-prevention, next-turn-bonus, copy-attack, …) needs a design.
  Push main when the user says so.
  Still pending: designs 028 (I85), 029 (I86), #5 description (I87), I84 legacy (untested by policy).
  maintenance due (S260); ISSUES Open still over cap.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Attack/ability execution gate: `pnpm audit:oracle` (~2 min, D108). Run after engine attack/ability changes; legit
  rate changes → `--update-baseline`, commit scripts/oracle-baseline.json. `--rows` dumps out/oracle-rows.json.
- Editing via bash heredoc eats `\` → `\`: write edit scripts with the Write tool / String.raw.
  Working-copy files are CRLF (repo LF); keep eol when scripting edits.
- useAbility now rejects passive/trigger texts in rules mode (isActivatedAbility, ability-executors.mjs).
- Mat FX / deck-builder CSS layering / vendored `*.generated.mjs`: see D95, D99, D103, D104, D97-D100.
- ONE pre-existing failing test: card-inspector-model "retreat greys only when the cost is unpaid". Test with
  `pnpm test` (globs now include scripts/**/*.test.mjs).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S269 I113: oracle execution gate (scripts/audit-oracle.mjs), records dealt damage, ratchet baseline.
- S268 I112: EXECUTED_ATTACK_FAMILIES synced to oracle; 10 client-only families filed as I118.
- S267 design 030 attack steps (switch/gust/move-energy/discard/attach/bench/mill/KO/Lost Zone/heal…), shuffleInPlace fix.
