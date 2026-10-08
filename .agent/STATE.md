# State — the single source of "now". Edited only in commits that land on main. Cap: 25 lines.
<!-- Keep exactly these sections. Pointers, not lists: the backlog lives in ISSUES.md (top = next).
     Every stale line here taxes every session. History belongs to git log (commit messages are the
     journal). Contradicts git log? Trust git: rebuild from `git log -20 main`. -->

Focus: Sampled battle SFX (design 064, D203/D204/D206): TCG Live cues over the synth palette — fx plans,
  draw/shuffle/KO/enter, UI, status loops, signatures, crowd, and attack hits aligned to the 063/065 move
  contact (Addendum A). Samples committed in client/src/assets/sfx; regenerate with `pnpm sfx:import`.
Active: TCG Live status FX (retuned to the Unity prefab dump, E:/TCGLive_Extract/vfx_dump) on main; awaiting
  user localhost check (Burn/Sleep up-direction). ETB (057) slice 6 not started.
Next: user listening pass on localhost (SERVER_AUTHORITATIVE=1) for 064 mix gains (attack hit vs synth damage thud); I239–I240, then I227–I229;
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
