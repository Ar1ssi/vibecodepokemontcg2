# State — the single source of "now". Edited only in commits that land on main. Cap: 25 lines.
<!-- Keep exactly these sections. Pointers, not lists: the backlog lives in ISSUES.md (top = next).
     Every stale line here taxes every session. History belongs to git log (commit messages are the
     journal). Contradicts git log? Trust git: rebuild from `git log -20 main`. -->

Focus: custom sets (075, D223/D224) now reach the Render site (076, D228): cardback "Publish to site" → scripts/custom-sets/publish.mjs
  (rclone, r2:ptcg-foil/custom-sets: blobs/<sha256> + index.json) → the site polls every 10 s, R2 copies overlay git sets; local
  "Send to ptcg-sim" folder reload stays D227. CUSTOM_SETS_URL defaults to FOIL_TEXTURE_URL/custom-sets (no dashboard step).
Active: user — first real publish (`pnpm custom-sets:publish -- customhb`, ~93 MB) then check the Render deck builder; restart cardback
  (start-site.bat) for the button. Older localhost checks: Custom pill/DEMO play, 3D board H1-H3 (I266), TCG Live attack UI (074).
Next: maintenance is due (`pnpm harness:check`: DECISIONS/ISSUES over cap; 70+ commits since the last maintain) → run maintain.md.
  Then I264 (legacy relay has no board), 069 foil on Render (I259), 072 coin prompts, B&B run flow,
  I242, I239, I227; `node scripts/prune-merged-branches.mjs --yes` locally. ETB (057) slice 6 unstarted.
Blocked: I85/I86 need design approval (028/029); I87 needs the user's description; I235 needs a face-down-card design.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `audit:abilities`, `audit:trainers`,
  `audit:attacks`; GX scope: `node scripts/audit-gx-oracle.mjs` (~25 s). Live TCGdex: `pnpm test:live`. Harness caps: `pnpm harness:check`.
- FX video checks: `.claude/skills/fx-preview/rec/rec-*.mjs` (server `PORT=4100 pnpm start`; the page is the 3D board, SwiftShader
  GL args built in). Browser harnesses: `CHROMIUM_PATH=/opt/pw-browsers/chromium`, one at a time; the 2P join flakes under load.
- three.js is vendored; node tests import it only for mesh pools (card-mesh-flight.test): pure math stays in .mjs; bump only via
  `scripts/vendor-three.mjs` (test checks bytes). Box art: rerun `scripts/build-battle/vendor-box-art.mjs`.
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- Custom sets: local folder reload (D227) and bucket publish to Render (D228; `--unpublish <set>` takes one off; a 404 index keeps
  loaded sets); still run `node scripts/custom-sets/check.mjs` before committing a set. KO event names the root Basic (origins.knockoutStack); opacity on a preserve-3d card flattens it: fade the host (043).
