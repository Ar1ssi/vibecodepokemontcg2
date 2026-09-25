# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 308
Focus: design 043 — TCG Live opponent Trainer/Stadium play (sleeve drops off their hand, flips face
  up, big preview over the mat held 1.2 s = twice the clip, lands in its slot or on the pile; D157).
  Built on feature/opp-play-fx in the evolve-sv worktree; NOT pushed.
Active: none. Awaiting the user's look + "push". User visual check pending: design 042 KO/discards
  and design 043 opponent Trainer in a real game.
Next: push feature/opp-play-fx when the user says so (then sync primary, remove evolve-sv — its out/
  holds untracked videos, ask before --force). Maintenance due (S302 item 2): DECISIONS ~157 lines vs
  90 cap, designs/ root ~50 shipped docs, ISSUES at cap; triage I180, I182; MAP spot-checks. Backlog:
  I181, I167, I166, I162, I153; user visual check: sprite picker, I137, I121, I126, I127, I44, I60.
  Worktrees `rules-engine-issues-e79707`, `i168-copy-attacks` merged, safe to remove. Pending
  approval: designs 028 (I85), 029 (I86).
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `pnpm audit:abilities`, `pnpm audit:trainers`,
  `pnpm audit:attacks` (~2 min). Known `pnpm test` failures: card-inspector-model "retreat
  greys…", live TCGdex Popplio (I182); coin-flip-ceremony is flaky.
- FX video checks: `.agent/scratch/rec-evolve.mjs` / `rec-ko.mjs` / `rec-opp-play.mjs` (Playwright video on the e2e
  board, worktree server `PORT=4100 pnpm start`; preview_start reuses the primary's :4000);
  ffmpeg via winget Gyan.FFmpeg. `.claude/skills/fx-preview/` for stepped frames.
- Copy attacks: spec in `rules/attack-copy.mjs`; unknown prefixes fail closed. `player.lastAttack`
  is read only at `turnNumber === currentTurn - 1` (extra turns break it).
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- KO event names the root Basic (origins.knockoutStack). Opacity on a preserve-3d card flattens it: fade the host (043).

## Recently shipped (≤3 one-liners; older → journal)
- S308 (branch): design 043 opponent Trainer/Stadium TCG Live preview (D157), not pushed.
- S307: design 042 TCG Live knockout + every discard flying to the pile (D156), pushed to main.
- S306: design 041 v4 tuning + evolve scene merged with main and pushed (D153–D155).
