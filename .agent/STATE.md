# State — the single source of "now". Edited only in commits that land on main. Cap: 25 lines.
<!-- Keep exactly these sections. Pointers, not lists: the backlog lives in ISSUES.md (top = next).
     Every stale line here taxes every session. History belongs to git log (commit messages are the
     journal). Contradicts git log? Trust git: rebuild from `git log -20 main`. -->

Focus: three.js board landed (074-three-board, D220–D222): the iframe board is deleted, the scene draws table/zones/cards, FX fly
  the card meshes, card focus lifts the mesh, TCG Live camera preset. Merged over main's 074 attack UI (click-events/card-focus by hand).
Active: user localhost checks — 3D board H1/H2/H3 visuals (mesh flights, focus mesh + dim hole, camera checkbox; I266) and main's
  TCG Live attack UI (074-tcgl-attack-ui, D219: overlay rows, stack view, Buff/Debuff popup). Status FX (Burn/Sleep) check pending.
Next: maintenance is due (`pnpm harness:check`: DECISIONS/ISSUES over cap; 60+ commits since the last maintain) → run maintain.md.
  Then I264 (legacy relay has no board; orphaned sheets), I265 (spring dt clamp, retreat/promote pop), 069 foil on Render (I259),
  072 coin prompts, B&B run flow, I242, I239, I227; `node scripts/prune-merged-branches.mjs --yes` locally. ETB (057) slice 6 unstarted.
Blocked: I85/I86 need design approval (028/029); I87 needs the user's description; I235 needs a face-down-card design.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `audit:abilities`, `audit:trainers`,
  `audit:attacks`; GX scope: `node scripts/audit-gx-oracle.mjs` (~25 s). Live TCGdex: `pnpm test:live`. Harness caps: `pnpm harness:check`.
- FX video checks: `.claude/skills/fx-preview/rec/rec-*.mjs` (server `PORT=4100 pnpm start`; the page is the 3D board, SwiftShader
  GL args built in). Browser harnesses: `CHROMIUM_PATH=/opt/pw-browsers/chromium`, one at a time; the 2P join flakes under load.
- three.js is vendored; node tests import it only for mesh pools (card-mesh-flight.test): pure math stays in .mjs; bump only via
  `scripts/vendor-three.mjs` (test checks bytes). Box art: rerun `scripts/build-battle/vendor-box-art.mjs`.
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- KO event names the root Basic (origins.knockoutStack). Opacity on a preserve-3d card flattens it: fade the host (043).
