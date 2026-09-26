# State — the single source of "now". Edited only in commits that land on main. Cap: 25 lines.
<!-- Keep exactly these sections. Pointers, not lists: the backlog lives in ISSUES.md (top = next).
     Every stale line here taxes every session. History belongs to git log (commit messages are the
     journal). Contradicts git log? Trust git: rebuild from `git log -20 main`. -->

Focus: card-classification fixes (Ultra Beast, Pokémon-GX, Energy-named Items) — shipped to main.
Active: none.
Next: top of ISSUES.md (I180 first). User visual check pending: designs 042–046 FX on localhost.
  Maintenance: DECISIONS and designs/ root over cap (maintain.md).
Blocked: I85/I86 need design approval (028/029); I87 needs the user's description.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `audit:abilities`, `audit:trainers`,
  `audit:attacks` (~2 min each). Live TCGdex checks: `pnpm test:live`.
- FX video checks: `.agent/scratch/rec-*.mjs` (Playwright video on the e2e board, worktree server
  `PORT=4100 pnpm start`; preview_start reuses the primary's :4000). Stepped frames: fx-preview skill.
- Copy attacks: spec in `rules/attack-copy.mjs`; unknown prefixes fail closed. `player.lastAttack`
  is read only at `turnNumber === currentTurn - 1` (extra turns break it).
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- KO event names the root Basic (origins.knockoutStack). Opacity on a preserve-3d card flattens it: fade the host (043).
