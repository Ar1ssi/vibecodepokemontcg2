# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 307
Focus: design 042 — TCG Live knockout (gold stars, knockback + tip, attachments fan out, all fly
  to the discard pile with a streak; the mat burst was built then cut by the user) and plain
  every discard flying from where its card was (D156). Shipped to main in S307.
Active: none. User visual check pending: KO + discards in a real game (retreat Energy, trainer
  sweep paths are unit-tested only).
Next: maintenance due (S302 handoff item 2): DECISIONS ~156 lines vs 90 cap, designs/ root
  ~50 shipped docs, ISSUES 39 open/30 closed (at cap); triage I180, I182; MAP spot-checks,
  scratch/worktrees. Backlog: I181, I167, I166, I162, I153 (contract first); user visual check:
  sprite picker (kyurem/necrozma/arceus), I137, I121, I126, I127, I44, I60. Worktrees
  `rules-engine-issues-e79707` and `i168-copy-attacks` are merged, safe to remove; `evolve-sv`
  now carries feature/ko-discard-fx. Pending approval: designs 028 (I85), 029 (I86).
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `pnpm audit:abilities`, `pnpm audit:trainers`,
  `pnpm audit:attacks` (~2 min). Known `pnpm test` failures: card-inspector-model "retreat
  greys…", live TCGdex Popplio (I182); coin-flip-ceremony is flaky.
- FX video checks: `.agent/scratch/rec-evolve.mjs` / `rec-ko.mjs` (Playwright video on the e2e
  board, worktree server `PORT=4100 pnpm start`; preview_start reuses the primary's :4000);
  ffmpeg via winget Gyan.FFmpeg. `.claude/skills/fx-preview/` for stepped frames.
- Copy attacks: spec in `rules/attack-copy.mjs`; unknown prefixes fail closed. `player.lastAttack`
  is read only at `turnNumber === currentTurn - 1` (extra turns break it).
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- KO event names the stack's root Basic; `origins.knockoutStack` picks the drawn card (design 042).

## Recently shipped (≤3 one-liners; older → journal)
- S307: design 042 TCG Live knockout + every discard flying to the pile (D156), pushed to main.
- S306: design 041 v4 tuning + evolve scene merged with main and pushed (D153–D155).
- S304 (main): design 040 transform-form sprites (86 forms + 172 PNGs; D152[deck-builder]).
