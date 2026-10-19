# NEXTSTEPS — in-flight increment ledgers ONLY (feature.md §2 step 4).
# Cap ~60 lines. A finished ledger moves to .agent/archive/NEXTSTEPS-history.md in the session
# that finishes it.

# Parked — S264 batch leftovers (tracked as issues, not increments)
#5 "basic prompt gone" → I87 · #6 match logging → I85 (design 028) · #4 30th anniversary → I86 (design 029).

# 075 scene attack FX — HANDOFF (branch claude/eager-euler-mu7f5b; NOT on main)
State: every move (225 specs) plays inside the three.js board. All 18 material kits have GPU styles. The
user's Fire Blast verdicts apply to every spec: no orbit opening, no ray or ring lines, the signature shape
stays legible, small contact. Each spec was compared with its Poképédia Scarlet/Violet video.
Verdicts: .agent/designs/075-parity-ledger.md (119 ok · 89 tweaked · 7 reworked · 4 partial · 4 n/a).
Full pnpm test 7746 tests, 7736 pass, 0 fail (10 skipped). Last commits: `git log --oneline -40 | grep "parity"`.
Next (in order):
1. User look check on localhost (any attack). Their taste calls go first; Fire Blast was the reference.
2. Open items from the ledger: the 4 partial (Hex / Night Shade eyes and Ancient Power / Rock Slide stone
   counts, all pinned by 063 tests, so changing them needs the user's say); Zap Cannon's small orb;
   Hyperspace Fury and High Horsepower have no portal / horseshoe shape.
3. A visual re-check of the reworked moves. Renders: .claude/skills/fx-preview/parity/README.md
   (delete ours/<id>-*.png, then render-ours.mjs with ONLY=<ids>).
4. Landing: review.md by another agent, then the full END (DECISIONS D223+ for scene FX, spec tint and
   styledKit; MAP for fx/, card-glow, parity tooling; STATE rewrite; ISSUES for the view-harness 3A
   flake and the gpu-canvas stroke-spoke limit), then "push to main" per CLAUDE.md.
Gotchas: the dev server for renders is `PORT=4100 pnpm start`; SwiftShader makes the TCG Live impact slow
(the render script skips it unless IMPACT=1); scratch/ is gitignored (videos and stills are not in git).
