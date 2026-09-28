# State — the single source of "now". Edited only in commits that land on main. Cap: 25 lines.
<!-- Keep exactly these sections. Pointers, not lists: the backlog lives in ISSUES.md (top = next).
     Every stale line here taxes every session. History belongs to git log (commit messages are the
     journal). Contradicts git log? Trust git: rebuild from `git log -20 main`. -->

Focus: PRs #190–#194 landed together (S327): design 049 copy/borrow attacks (#192), parse-hole
  sweep + audit gates for locks/typography/ability clauses/evolved stacks (#193, #190/#194:
  evolved Abilities read the top card), coin ceremony (#191). #189 superseded by #192, not merged.
Active: none.
Next: `.agent/designs/parse-holes-next-handoff.md` items 2–5 (type-word drift flags 12 gate rows);
  then top of ISSUES.md (I196 first).
  User visual check pending: designs 042–046 FX on localhost.
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
