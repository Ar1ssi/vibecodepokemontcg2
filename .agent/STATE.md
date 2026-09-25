# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 309
Focus: design 045 — TCG Live prize flights (fan on the 042 arc, picked prize flips into the 044 draw
  scene, opponent prizes arc to hand; D159). Built on feature/prize-fx (prize-fx worktree); NOT pushed.
Active: none. Awaiting the user's look + "push". User visual check pending: 042 KO/discards, 043
  opponent Trainer, 044 draws, 045 prizes in a real game (video out/prize-flight.webm).
Next: push feature/prize-fx on the user's word (then sync primary, remove prize-fx). Remove worktree evolve-sv (merged; its out/ holds untracked videos, ask before --force). Maintenance
  due (S302 item 2): DECISIONS ~158 lines vs 90 cap, designs/ root ~52 shipped docs, ISSUES at cap; triage
  I180, I182; MAP spot-checks. Backlog: I181, I167, I166, I162, I153; user visual check: sprite picker,
  I137, I121, I126, I127, I44, I60. Worktrees `rules-engine-issues-e79707`, `i168-copy-attacks` merged, safe
  to remove. Pending approval: designs 028 (I85), 029 (I86).
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `pnpm audit:abilities`, `pnpm audit:trainers`,
  `pnpm audit:attacks` (~2 min). Known `pnpm test` failures: card-inspector-model "retreat
  greys…", live TCGdex Popplio (I182); coin-flip-ceremony is flaky.
- FX video checks: `.agent/scratch/rec-evolve.mjs` / `rec-ko.mjs` / `rec-opp-play.mjs` / `rec-draw.mjs` / `rec-prize.mjs` (Playwright video on the e2e
  board, worktree server `PORT=4100 pnpm start`; preview_start reuses the primary's :4000);
  ffmpeg via winget Gyan.FFmpeg. `.claude/skills/fx-preview/` for stepped frames.
- Copy attacks: spec in `rules/attack-copy.mjs`; unknown prefixes fail closed. `player.lastAttack`
  is read only at `turnNumber === currentTurn - 1` (extra turns break it).
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- KO event names the root Basic (origins.knockoutStack). Opacity on a preserve-3d card flattens it: fade the host (043).

## Recently shipped (≤3 one-liners; older → journal)
- S309 (branch): design 045 TCG Live prize flights (D159), feature/prize-fx, not pushed.
- S308: design 044 TCG Live draws (D158) + design 043 opponent Trainer preview (D157), pushed to main.
