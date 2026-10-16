# State — the single source of "now". Edited only in commits that land on main. Cap: 25 lines.
<!-- Keep exactly these sections. Pointers, not lists: the backlog lives in ISSUES.md (top = next).
     Every stale line here taxes every session. History belongs to git log (commit messages are the
     journal). Contradicts git log? Trust git: rebuild from `git log -20 main`. -->

Focus: Code-health cleanup (design 073, I249–I253): batches 1–3 and 6 step 1 landed (junk deleted, e2e in scripts/e2e/, test stub,
  caps + `pnpm harness:check`, server authority default + shadow mode gone, D216). Batches 4 (reduce.mjs split, I250) and 5 (catalogs
  as JSON, I252) are built in worktrees under independent review; land each on a green review. Legacy twins (I251) retire later.
Active: Card focus (067) on main, awaiting user localhost check (flight ease `--focus-flight-ease`, list reveal, HUD/Stack). Status FX
  awaiting check (Burn/Sleep up-direction). ETB (057) slice 6 not started.
Next: land batches 4/5; user runs `node scripts/prune-merged-branches.mjs --yes` locally (209 merged branches; the cloud proxy refuses
  ref deletes). User passes on localhost (authority is now the default): 069 foil (FOIL_TEXTURE_URL on Render; I259 wash), 072 opening coin prompts, 069 hover preview / multi-target
  hits / public lobby, Special Energy tokens, B&B run flow (#211–#218), 3D coins + deck customization preview (#219), 067 feel, 064 mix
  gains; I242 (Bench/opponent focus, attack-ui sprites); I239, then I227; WotC Gyms/attach-Trainers/Baby flip, D201 holo art, deck reveals, 057 taste calls.
Blocked: I85/I86 need design approval (028/029); I87 needs the user's description; I235 needs a face-down-card design.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle`, `audit:abilities`, `audit:trainers`,
  `audit:attacks`; GX scope: `node scripts/audit-gx-oracle.mjs` (~25 s). Live TCGdex: `pnpm test:live`. Harness caps: `pnpm harness:check`.
- FX video checks: `.claude/skills/fx-preview/rec/rec-*.mjs` (worktree server `PORT=4100 pnpm start`;
  preview_start reuses the primary's :4000). rec-unboxing runs WebGL on SwiftShader (`BOX=<key>`).
- three.js is vendored, never imported in node tests: pure math lives in pack3d.mjs; bump only via
  `scripts/vendor-three.mjs` (test checks bytes). Box art: rerun `scripts/build-battle/vendor-box-art.mjs`.
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF.
- KO event names the root Basic (origins.knockoutStack). Opacity on a preserve-3d card flattens it: fade the host (043).
