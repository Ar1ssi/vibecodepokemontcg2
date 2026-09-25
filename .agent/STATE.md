# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 308
Focus: TCG Live FX from user clips. Design 043 opponent Trainer/Stadium preview (D157) on
  feature/opp-play-fx; design 044 draws (opening spread, turn-draw preview, opponent sleeve flights,
  engine ids + turnStarted before the draw; D158) on feature/draw-fx, stacked on it. Neither pushed.
Active: none. Awaiting the user's look + "push". User visual check pending: 042 KO/discards, 043
  opponent Trainer, 044 draws in a real game (videos out/opp-play.webm, out/draw-scene.webm).
Next: on "push", merge feature/draw-fx (contains 043) to main (then sync primary, remove evolve-sv —
  its out/ holds untracked videos, ask before --force). Maintenance due (S302 item 2): DECISIONS ~157 lines vs
  90 cap, designs/ root ~50 shipped docs, ISSUES at cap; triage I180, I182; MAP spot-checks. Backlog:
  I181, I167, I166, I162, I153; user visual check: sprite picker, I137, I121, I126, I127, I44, I60.
  Worktrees `rules-engine-issues-e79707`, `i168-copy-attacks` merged, safe to remove. Pending
  approval: designs 028 (I85), 029 (I86).
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `pnpm audit:abilities`, `pnpm audit:trainers`,
  `pnpm audit:attacks` (~2 min). Known `pnpm test` failures: card-inspector-model "retreat
  greys…", live TCGdex Popplio (I182); coin-flip-ceremony is flaky.
- FX video checks: `.agent/scratch/rec-evolve.mjs` / `rec-ko.mjs` / `rec-opp-play.mjs` / `rec-draw.mjs` (Playwright video on the e2e
  board, worktree server `PORT=4100 pnpm start`; preview_start reuses the primary's :4000);
  ffmpeg via winget Gyan.FFmpeg. `.claude/skills/fx-preview/` for stepped frames.
- Copy attacks: spec in `rules/attack-copy.mjs`; unknown prefixes fail closed. `player.lastAttack`
  is read only at `turnNumber === currentTurn - 1` (extra turns break it).
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- KO event names the root Basic (origins.knockoutStack). Opacity on a preserve-3d card flattens it: fade the host (043).

## Recently shipped (≤3 one-liners; older → journal)
- S308 (branch): design 044 TCG Live draws (D158), feature/draw-fx, not pushed.
- S308 (branch): design 043 opponent Trainer/Stadium TCG Live preview (D157), not pushed.
- S307: design 042 TCG Live knockout + every discard flying to the pile (D156), pushed to main.
