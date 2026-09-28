# State — the single source of "now". Edited only in commits that land on main. Cap: 25 lines.
<!-- Keep exactly these sections. Pointers, not lists: the backlog lives in ISSUES.md (top = next).
     Every stale line here taxes every session. History belongs to git log (commit messages are the
     journal). Contradicts git log? Trust git: rebuild from `git log -20 main`. -->

Focus: Build & Battle mode (design 051) built on branch claude/build-battle-gamemode-plan-cl70k6:
  /build-and-battle tab, seeded box/packs, 40-card 4-Prize format end to end (D185–D189).
Active: design 052 (B&B unboxing scene) drafted, awaiting user approval.
Next: design 052 approval; merge the B&B branch (051 review I202–I207 fixed); then
  `.agent/designs/parse-holes-next-handoff.md` items 2–5; then top of ISSUES.md.
  User visual check pending: designs 042–046 FX; B&B row 29 prize fan + memory-only banner.
  Maintenance: DECISIONS/designs root over cap; ISSUES open over 40 (maintain.md).
Blocked: I85/I86 need design approval (028/029); I87 needs the user's description.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `audit:abilities`, `audit:trainers`,
  `audit:attacks`; GX scope: `node scripts/audit-gx-oracle.mjs` (~25 s). Live TCGdex: `pnpm test:live`.
- FX video checks: `.claude/skills/fx-preview/rec/rec-*.mjs` (Playwright video on the e2e board, worktree server
  `PORT=4100 pnpm start`; preview_start reuses the primary's :4000). Stepped frames: fx-preview skill.
- Copy attacks: spec in `rules/attack-copy.mjs`; unknown prefixes fail closed. `player.lastAttack`
  is read only at `turnNumber === currentTurn - 1`; extra turns (design 048) shift turn numbers.
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- KO event names the root Basic (origins.knockoutStack). Opacity on a preserve-3d card flattens it: fade the host (043).
