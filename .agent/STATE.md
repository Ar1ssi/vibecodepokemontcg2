# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 306
Focus: design 041 — Scarlet/Violet evolution scene for regular (non-Mega/Tera) evolutions, now
  light-blue nebula → beads/bokeh → 3D edge-on flip through white → 300 ms glow hover → gentle
  settle, 3.5 s (v4, D154). Shipped to main in S306.
Active: none.
Next: maintenance due (S302 handoff item 2): DECISIONS ~155 lines vs 90 cap, designs/ root
  ~50 shipped docs, ISSUES 39 open/30 closed (at cap); triage I180, I182; MAP spot-checks,
  scratch/worktrees (remove `evolve-sv` once confirmed merged). Backlog: I181, I167, I166, I162,
  I153 (contract first), I137, I121, I126, I127, I44, I60. Worktrees `rules-engine-issues-e79707`
  (orphan draft 039-transform-form-sprites → renumber + approval) and `i168-copy-attacks` are
  merged, safe to remove. Pending approval: designs 028 (I85), 029 (I86).
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `pnpm audit:abilities`, `pnpm audit:trainers`,
  `pnpm audit:attacks` (~2 min). Known `pnpm test` failures: card-inspector-model "retreat
  greys…", live TCGdex Popplio (I182); coin-flip-ceremony is flaky.
- FX visual checks: `.claude/skills/fx-preview/` (stepped frames) or `.agent/scratch/rec-evolve.mjs`
  (real-time Playwright video of the evolve scene on the active slot); ffmpeg is on the machine
  (winget Gyan.FFmpeg). Preview server on :4000 is the primary checkout — run a worktree on its own PORT.
- Copy attacks: spec in `rules/attack-copy.mjs`; unknown prefixes fail closed. `player.lastAttack`
  is read only at `turnNumber === currentTurn - 1` (extra turns break it).
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- `opponentHandSetAside` (Tickling Machine heads) parses but has no executor — tracked in I137.

## Recently shipped (≤3 one-liners; older → journal)
- S306: design 041 v4 tuning + S304/S305 scene committed and pushed to main (D152–D154).
- S305: design 041 v3 — no whiteout/sky/god rays; reveal stays in the nebula.
- S304: design 041 SV evolution scene (D152/D153) — built + captured.
