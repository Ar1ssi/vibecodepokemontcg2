# State — the single source of "now". Edited only in commits that land on main. Cap: 25 lines.
<!-- Keep exactly these sections. Pointers, not lists: the backlog lives in ISSUES.md (top = next).
     Every stale line here taxes every session. History belongs to git log (commit messages are the
     journal). Contradicts git log? Trust git: rebuild from `git log -20 main`. -->

Focus: WotC Gen 1/2 card audit fixed on main (S336, design 062, D202): untyped Stadiums/Tools, Trainer
  costs, attach-Trainers, dead/passive Trainers & Gyms, ~105 attack printings, Rain Dance/Toxic Gas/damage
  Powers, Baby Rule. Process: docs/card-era-audit-and-fix-process.md. Residue: I227–I229, I234–I241.
Active: none. ETB (design 057) slice 6 not started. Old Powers/Poké-Bodies now load in live games (I233 closed).
Next: I239–I240 (Power interactions now live), then I227–I229 residue; user look on localhost (SERVER_AUTHORITATIVE=1):
  WotC Gyms/attach-Trainers/Baby flip, holo art windows (D201), deck reveals, 057 taste calls.
  Maintenance due: DECISIONS/designs root over cap; ISSUES open over 40 (maintain.md).
Blocked: I85/I86 need design approval (028/029); I87 needs the user's description; I235 needs a face-down-card design.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `audit:abilities`, `audit:trainers`,
  `audit:attacks`; GX scope: `node scripts/audit-gx-oracle.mjs` (~25 s). Live TCGdex: `pnpm test:live`.
- FX video checks: `.claude/skills/fx-preview/rec/rec-*.mjs` (worktree server `PORT=4100 pnpm start`;
  preview_start reuses the primary's :4000). rec-unboxing runs WebGL on SwiftShader (`BOX=<key>`).
- three.js is vendored, never imported in node tests: pure math lives in pack3d.mjs; bump only via
  `scripts/vendor-three.mjs` (test checks bytes). Box art: rerun `scripts/build-battle/vendor-box-art.mjs`.
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- KO event names the root Basic (origins.knockoutStack). Opacity on a preserve-3d card flattens it: fade the host (043).
