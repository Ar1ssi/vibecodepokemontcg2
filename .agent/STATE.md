# State — the single source of "now". Edited only in commits that land on main. Cap: 25 lines.
<!-- Keep exactly these sections. Pointers, not lists: the backlog lives in ISSUES.md (top = next).
     Every stale line here taxes every session. History belongs to git log (commit messages are the
     journal). Contradicts git log? Trust git: rebuild from `git log -20 main`. -->

Focus: custom sets landed (075-custom-sets, D223/D224): cardback's "Download for ptcg-sim" zip → client/src/assets/custom-sets/<setId>/,
  served as TCGdex records by the proxy; Custom pill in Browse Sets; decklist codes; demo set `customdemo`. Cardback (Ar1ssi/cardback)
  gained printed-term capitals + Claude "Suggest wording" (ANTHROPIC_API_KEY) and the set export/import.
Active: user localhost checks — Custom pill shows DEMO, add Alakazam ex / Hyper Ball to a deck, play: Hyper Ball search + Spoon Bend
  coin flip run in rules mode; 3D board H1/H2/H3 visuals (I266) and TCG Live attack UI (074, D219) still unchecked; status FX pending.
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
- Custom sets: a new/edited set needs a server restart (loaded at boot) and `node scripts/custom-sets/check.mjs`; browser records
  cache 60 s. KO event names the root Basic (origins.knockoutStack); opacity on a preserve-3d card flattens it: fade the host (043).
