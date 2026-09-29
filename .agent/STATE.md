# State — the single source of "now". Edited only in commits that land on main. Cap: 25 lines.
<!-- Keep exactly these sections. Pointers, not lists: the backlog lives in ISSUES.md (top = next).
     Every stale line here taxes every session. History belongs to git log (commit messages are the
     journal). Contradicts git log? Trust git: rebuild from `git log -20 main`. -->

Focus: Ancient/Future tags (design 058) on main: per-printing tag table + paradoxTagOf feed Sada's
  Vitality, Techno Radar, Reboot Pod, Awakening Drum, Booster Capsules, Iron Crown/Thorns ex (D196).
Active: none. ETB (design 057, D195) slice 6 (rec-etb recorder + shared recorder lib) not started.
Next: user look on localhost: deck builder Special filter Ancient/Future pills; /build-and-battle and
  /deck-builder?etb=phantasmal-flames-etb (057 taste calls); then 057 slice 6; design 056 (3D box, I209);
  then top of ISSUES.md. audit:trainers red on main since the fossil commit (I213).
  Maintenance: DECISIONS/designs root over cap; ISSUES open over 40 (maintain.md).
Blocked: I85/I86 need design approval (028/029); I87 needs the user's description.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `audit:abilities`, `audit:trainers`,
  `audit:attacks`; GX scope: `node scripts/audit-gx-oracle.mjs` (~25 s). Live TCGdex: `pnpm test:live`.
- FX video checks: `.claude/skills/fx-preview/rec/rec-*.mjs` (worktree server `PORT=4100 pnpm start`;
  preview_start reuses the primary's :4000). rec-unboxing runs WebGL on SwiftShader (`BOX=<key>`).
- three.js is vendored, never imported in node tests: pure math lives in pack3d.mjs; bump only via
  `scripts/vendor-three.mjs` (test checks bytes). Box art: rerun `scripts/build-battle/vendor-box-art.mjs`.
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- KO event names the root Basic (origins.knockoutStack). Opacity on a preserve-3d card flattens it: fade the host (043).
