# State — the single source of "now". Edited only in commits that land on main. Cap: 25 lines.
<!-- Keep exactly these sections. Pointers, not lists: the backlog lives in ISSUES.md (top = next).
     Every stale line here taxes every session. History belongs to git log (commit messages are the
     journal). Contradicts git log? Trust git: rebuild from `git log -20 main`. -->

Focus: 089 VFX pass (D248/D249: attacks before their switch, riffle shuffle, Prize/heal/block/fizzle FX, tone roll-off) and Tera/Mega FX scenes (D250); unified logging (088-unified-logging, D254–D257);
  code-health pass: admin UI/CORS locked down (D251), lockfile 71 → 14 advisories, Stadium boards by card name (D252), CI on PRs and main (D253).
Active: Render: set ADMIN_PASSWORD or the admin UI stays off. Localhost checks — log export (Options → Export full log; `node tools/log.mjs summary <file>`); 089 look (12 attacks, a Prize take, a shuffle, a switching attack); Tera/Mega
  entries (both seats); the 22 restored Stadium boards (`?stadiumEnv=<key>`); deck box deal (073 rev B); 085; first custom-set publish; 088 `Client: bundle`, `KEEP_AWAKE`; I266, 074.
Next: maintain.md is due (caps over after the two merges). I283 (P1, D246); I294 (socket handlers uncaught), I295 (undo view dropped); I284 (e2e scripts), I291 (review 087, 078/079), I290 (formatting: the user's call),
  I287/I288, I282; tune 089 from the user's verdict; I264, I259, 072 coin prompts, I239, I227; ETB (057) slice 6.
Blocked: I86 needs design approval (029 30th Celebration); I87 needs the user's description; I235 needs a face-down-card design.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `audit:abilities`, `audit:trainers`,
  `audit:attacks`; GX scope: `node scripts/audit-gx-oracle.mjs` (~25 s). Live TCGdex: `pnpm test:live`. Harness caps: `pnpm harness:check`.
- FX checks: `pnpm fx:check-elements` (every element shader in Chromium, GL errors by step; GLSL3 has no gl_FragColor: `out vec4`);
  stills/videos via `.claude/skills/fx-preview/rec/rec-*.mjs` (`PORT=4100 pnpm start`; SwiftShader). One harness at a time.
- three.js is vendored; node tests import it only for mesh pools (card-mesh-flight.test): pure math stays in .mjs; bump only via
  `scripts/vendor-three.mjs` (test checks bytes). Box art: rerun `scripts/build-battle/vendor-box-art.mjs`.
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- Custom sets: local folder reload and bucket publish (D228; `--unpublish <set>`); cardback renumbers ids, so key on names (D252); run `node scripts/custom-sets/check.mjs` before
  committing a set. KO event names the root Basic (origins.knockoutStack); opacity on a preserve-3d card flattens it: fade the host (043).
