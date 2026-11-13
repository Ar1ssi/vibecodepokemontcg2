# State — the single source of "now". Edited only in commits that land on main. Cap: 25 lines.
<!-- Keep exactly these sections. Pointers, not lists: the backlog lives in ISSUES.md (top = next).
     Every stale line here taxes every session. History belongs to git log (commit messages are the
     journal). Contradicts git log? Trust git: rebuild from `git log -20 main`. -->

Focus: code-health pass 2026-11-13: admin UI and CORS locked down (D248), lockfile refreshed (71 → 14 advisories), both red tests fixed (Stadium
  boards follow the card's name, D249; 'Dark' pays 'Darkness'), CI on PRs and main (D250), lint error-free, harness under caps. Before it: 084/085
  Stadium boards, per-type attack shaders (079), fast refresh (088).
Active: Render: the admin UI is off until ADMIN_PASSWORD is set in the dashboard. User localhost checks — the 22 Stadium boards the renumbering hid show
  again (`?stadiumEnv=<key>`), deck box deal (073 rev B), 085's Scorched Earth and Vitality, attack FX on all types (known: water spray reads icy, psychic
  rings large, Pin Missile needles small); first custom-set publish; 088: boot log reads `Client: bundle`, decide `KEEP_AWAKE`; older: I266, 074 attack UI.
Next: I283 (P1: the no-room board draws no cards, D246). Then I284 (rest of the e2e scripts), I287 (review of 087 and 078/079), I286 (formatting: the
  user's call), I282 (7 Stadiums without a board); tune 079 from the user's verdict; I264, I259, 072 coin prompts, I239, I227; ETB (057) slice 6 unstarted.
Blocked: I85 needs design approval (028 match logging, 029 30th Celebration); I87 needs the user's description; I235 needs a face-down-card design.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `audit:abilities`, `audit:trainers`,
  `audit:attacks`; GX scope: `node scripts/audit-gx-oracle.mjs` (~25 s). Live TCGdex: `pnpm test:live`. Harness caps: `pnpm harness:check`.
- FX checks: `pnpm fx:check-elements` (every element shader in Chromium, GL errors by step; GLSL3 has no gl_FragColor: `out vec4`);
  stills/videos via `.claude/skills/fx-preview/rec/rec-*.mjs` (`PORT=4100 pnpm start`; SwiftShader). One harness at a time.
- three.js is vendored; node tests import it only for mesh pools (card-mesh-flight.test): pure math stays in .mjs; bump only via
  `scripts/vendor-three.mjs` (test checks bytes). Box art: rerun `scripts/build-battle/vendor-box-art.mjs`.
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- Custom sets: local folder reload and bucket publish (D228; `--unpublish <set>`); cardback renumbers ids, so key on names (D249); run `node scripts/custom-sets/check.mjs` before
  committing a set. KO event names the root Basic (origins.knockoutStack); opacity on a preserve-3d card flattens it: fade the host (043).
