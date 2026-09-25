# State — the single source of "now". Edited only in commits that land on main. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to git log (commit messages are the journal). Contradicts git log? Trust git:
     rebuild from `git log -20 main`. -->

Focus: design 046 — board glow while an Item/Supporter is held + deeper drop hovers (D160), on
  feature/board-glow (board-glow worktree), stacked on feature/prize-fx (design 045, D159). NOT pushed.
Active: none. Awaiting the user's localhost look + "push" (both branches; board-glow contains prize-fx).
  User visual check pending: 042 KO/discards, 043 opp Trainer, 044 draws, 045 prizes, 046 drop hovers.
Next: on "push", fast-forward main to feature/board-glow (includes prize-fx), sync primary, remove the prize-fx and board-glow worktrees. Remove worktree evolve-sv (merged; its out/ holds untracked videos, ask before --force). Maintenance
  due (S302 item 2): DECISIONS ~158 lines vs 90 cap, designs/ root ~52 shipped docs, ISSUES at cap; triage
  I180; MAP spot-checks. Backlog: I181, I167, I166, I162, I153; user visual check: sprite picker,
  I137, I121, I126, I127, I44, I60. Pending approval: designs 028 (I85), 029 (I86).
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `pnpm audit:abilities`, `pnpm audit:trainers`,
  `pnpm audit:attacks` (~2 min). `pnpm test` is fully green; live
  TCGdex checks run via `pnpm test:live`.
- FX video checks: `.agent/scratch/rec-evolve.mjs` / `rec-ko.mjs` / `rec-opp-play.mjs` / `rec-draw.mjs` / `rec-prize.mjs` (Playwright video on the e2e
  board, worktree server `PORT=4100 pnpm start`; preview_start reuses the primary's :4000);
  ffmpeg via winget Gyan.FFmpeg. `.claude/skills/fx-preview/` for stepped frames.
- Copy attacks: spec in `rules/attack-copy.mjs`; unknown prefixes fail closed. `player.lastAttack`
  is read only at `turnNumber === currentTurn - 1` (extra turns break it).
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- KO event names the root Basic (origins.knockoutStack). Opacity on a preserve-3d card flattens it: fade the host (043).
