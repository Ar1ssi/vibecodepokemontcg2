# State — the single source of "now". Edited only in commits that land on main. Cap: 25 lines.
<!-- Keep exactly these sections. Pointers, not lists: the backlog lives in ISSUES.md (top = next).
     Every stale line here taxes every session. History belongs to git log (commit messages are the
     journal). Contradicts git log? Trust git: rebuild from `git log -20 main`. -->

Focus: Card focus (design 067, D208/D209): clicking your own Active opens TCG Live's 3D popup — CSS-3D
  flight to the game's camera pose, hand drops, 013 panels on the card. Sampled battle SFX (064) and the
  TCG Live attack-bar sprites (scripts/attack-ui, rerun against the extract) are on main too.
Active: Card focus (067) on main, awaiting user localhost check (flight ease `--focus-flight-ease`, list
  reveal, HUD/Stack). Status FX awaiting check (Burn/Sleep up-direction). ETB (057) slice 6 not started.
Next: user passes on localhost (SERVER_AUTHORITATIVE=1): 067 feel, 064 mix gains; I242–I243 (Bench/opponent
  focus, remaining attack-ui sprites); I239–I240, then I227–I229; WotC Gyms/attach-Trainers/Baby flip,
  holo art windows (D201), deck reveals, 057 taste calls.
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
