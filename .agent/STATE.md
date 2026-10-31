# State — the single source of "now". Edited only in commits that land on main. Cap: 25 lines.
<!-- Keep exactly these sections. Pointers, not lists: the backlog lives in ISSUES.md (top = next).
     Every stale line here taxes every session. History belongs to git log (commit messages are the
     journal). Contradicts git log? Trust git: rebuild from `git log -20 main`. -->

Focus: attack FX are per-type element shaders (079-element-shaders, D229–D231): every material has an element kit (fireballs, flame jets,
  bolts, plasma, refracting water, psychic lens, smoke, 3-D debris, TCG Live sprites); 078 modifiers/lift/cast under them. Custom sets
  reach Render (076-remote-custom-sets, D228) via cardback "Publish to site".
Active: user localhost checks — Stadium board polish (080, all 25 boards, branch claude/elegant-volta-r2cv6e); attack FX on all
  types (known: water spray reads icy, psychic rings large, Pin Missile needles small, impact centres can blow out, leaf orientation
  unconfirmed); first custom-set publish + Render check; older: 3D board H1-H3 (I266), TCG Live attack UI (074). No review on 078/079.
Next: maintenance is due (`pnpm harness:check`: caps over, 250+ commits since the last maintain) → maintain.md. Then tune 079 from the
  user's verdict; I264, I259, 072 coin prompts, B&B run flow, I242, I239, I227; prune merged branches; ETB (057) slice 6 unstarted.
Blocked: I85/I86 need design approval (028/029); I87 needs the user's description; I235 needs a face-down-card design.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `audit:abilities`, `audit:trainers`,
  `audit:attacks`; GX scope: `node scripts/audit-gx-oracle.mjs` (~25 s). Live TCGdex: `pnpm test:live`. Harness caps: `pnpm harness:check`.
- FX checks: `pnpm fx:check-elements` (every element shader in Chromium, GL errors by step; GLSL3 has no gl_FragColor: `out vec4`);
  stills/videos via `.claude/skills/fx-preview/rec/rec-*.mjs` (`PORT=4100 pnpm start`; SwiftShader). One harness at a time.
- three.js is vendored; node tests import it only for mesh pools (card-mesh-flight.test): pure math stays in .mjs; bump only via
  `scripts/vendor-three.mjs` (test checks bytes). Box art: rerun `scripts/build-battle/vendor-box-art.mjs`.
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- Custom sets: local folder reload (D227) and bucket publish (D228; `--unpublish <set>`); run `node scripts/custom-sets/check.mjs` before
  committing a set. KO event names the root Basic (origins.knockoutStack); opacity on a preserve-3d card flattens it: fade the host (043).
