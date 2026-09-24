# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 287
Focus: S287 feature: dragged card swings with the pointer like TCG Live, no resize (design 038, D124);
  built in parallel as "S282/D123" on claude/determined-gauss-4aymvd, renumbered at the merge with main.
Active: none.
Next: 036 slice 6 review follow-up (HANDOFF.md on `feature/attack-behaviour`, `attack-behaviour-wt`): re-review
  `settleKnockOutWins`, close slice 6, then slices 7–16 (kit .agent/scratch/036-slices-5-16-handoff.md).
  035 slice 11 (play conditions) then 12 in `trainer-behaviour-wt` (ledger NEXTSTEPS.md).
  Then I128, I130, I129, I126/I127, I121. User visual check of typed Tera entry/skin + Mega vortex in a real game,
  and of the drag swing with real card art (Chromium-only so far).
  Pending approval: designs 028 (I85), 029 (I86), 034 (I128).
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5)
- Parallel programs share one harness: trainer (`trainer-behaviour-wt`) and attack (`attack-behaviour-wt`)
  worktrees have stale .agent copies — the primary/main harness is live. Parallel sessions collided on
  S278–S281 and D117–D120: cite D ids with scope (`D119[rules]`); take the next free id by grep.
- Gate: `pnpm audit:oracle` (~2 min, D108) after attack/ability engine changes; legit rate changes →
  `--update-baseline`, commit scripts/oracle-baseline.json. Known `pnpm test` failure: card-inspector-model.
- Engine: `applyCommand` clones state — read results via `findCard(res.state, id).card`; attacking ends the
  turn → assert events; rng stub `{next, shuffle}`. Trainer contracts: `effects/stadium-trigger-apply.mjs`
  (call before `clearConditions`); Chaos Gym coin lives in the playTrainer apply path.
- Mat FX: canvas FX go through entry.js `playCanvasStage` (WAAPI clock); board cards live in playmat iframes;
  `.card` is preserve-3d → layer with translateZ. Holo wrappers need TCGdex (emulate via buildHoloCard).
- Bash heredoc eats `\` → write edit scripts with the Write tool. Primary working copy is CRLF (repo LF).

## Recently shipped (≤3 one-liners; older → journal)
- S287 Dragged card = opaque body-level avatar rolling into horizontal motion (≤14°, springy settle); native DnD
  untouched; cancelled drags fly home; FX-off → native ghost.
- S286 harness slim: hook + compaction; see journal.
- S285 trainer 035 slice 10b: coin/condition Stadiums + shared switch hook; suite 3432/3433, oracle PASSED.
