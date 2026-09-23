# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->


Session: 274
Focus: S274 patch: duplicate hand stacks drew holo cards at 2/3 size, stacked vertically (CSS specificity). Pushed to main.
  S273 fixed the opponent-played Stadium being invisible.
Active: none.
Next: maintenance due (S270, still not run).
  I121-I125 (design 032 leftovers); I113 oracle still cannot see damage amounts for immunity/prevention.
  Design numbers collide: 032-oracle-execution-gate.md and 032-coin-gated-attack-sentences.md (code comments mean the latter).
  Still pending: designs 028 (I85), 029 (I86), #5 description (I87), I84 legacy (untested by policy).
  ISSUES Open still over cap.
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Attack/ability execution gate: `pnpm audit:oracle` (~2 min, D108). Run after engine attack/ability changes; legit
  rate changes → `--update-baseline`, commit scripts/oracle-baseline.json. Later-turn markers are ORACLE_BLIND_FAMILIES.
- Editing via bash heredoc eats `\` → write edit scripts with the Write tool / String.raw.
  Working-copy files are CRLF (repo LF); keep eol when scripting edits.
- Timed attack effects are `card.attackMarkers` (D109, attackLock D113); copy attacks resolve before coins, tokens carry `copiedAttack` (D110).
  BLOCKS regexes are wrapped by `gatedBlock` (adds capture group 1): no backreferences in them.
- Mat FX / deck-builder CSS layering / vendored `*.generated.mjs`: see D95, D99, D103, D104, D97-D100.
- ONE pre-existing failing test: card-inspector-model "retreat greys only when the cost is unpaid". Test with
  `pnpm test` (globs include scripts/**/*.test.mjs).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S274 hand stacks: stack child rules scoped under #hand so late-hydrated holo wrappers size correctly.
- S273 Stadium facing: opponent's Stadium flips via `.stadium-opp-facing` (img `rotate`), never an inline transform on #stadium (D115).
