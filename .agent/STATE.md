# State — the single source of "now". Edited only in commits that land on main. Cap: 25 lines.
<!-- Keep exactly these sections. Pointers, not lists: the backlog lives in ISSUES.md (top = next).
     Every stale line here taxes every session. History belongs to git log (commit messages are the
     journal). Contradicts git log? Trust git: rebuild from `git log -20 main`. -->

Focus: Sampled battle SFX shipped (S337, design 064, D203/D204): TCG Live non-attack cues over the synth
  palette — fx plans, draw/shuffle/KO/enter, UI chrome, status loops, card signatures, crowd bus.
  Samples are local only: `pnpm sfx:import -- --src <extract dir>` (ffmpeg), output gitignored.
Active: design 063 (attack move scenes + jumbotron set) uncommitted on the primary folder; it overlaps
  mat-fx/index.js (soundPlanFor) with 064 — rebase on main before landing. ETB (057) slice 6 not started.
Next: user listening pass on localhost (SERVER_AUTHORITATIVE=1) for 064 mix gains; I239–I240, then I227–I229;
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
