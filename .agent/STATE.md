# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 265
Focus: S265 read-only attack/ability coverage audit (worktree ../vibe-audit-coverage, branch
  `audit/attack-ability-coverage`, harness files only, uncommitted). Report:
  .agent/scratch/attack-ability-coverage-audit.md; 28 confirmed gaps filed as I88–I115.
Active: none — waiting on the user to pick which gaps to fix first.
Next: user decides the fix order. Recommended: I88 (statusAbility poisons own Active) + I94 (useAbility
  passive gate), then I99/I100 (regex fixes), then I113 (oracle as gate) before I89–I91/I102–I107.
  Still pending from S264: approve design 028 (I85) and 029 (I86); describe #5 (I87); localhost checks
  (holo double-click, Mega entry, End Turn, View Board, no blink).
  maintenance due (S260) — also ISSUES Open is ~77, over the 40 cap: run .agent/workflows/maintain.md.
Blocked: #5 needs the user's description (no match logs exist). A public tunnel is NOT possible.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Attack/ability pipeline green metrics lie: `executeSteps` `default:` no-ops and `executeAbility` still
  marks the ability used; the server attack phase (reduce.mjs:3032-3830) only runs a fixed set of text
  helpers. Verify execution with `.agent/scratch/cov/oracle.mjs` (state diff), not the audit scripts.
- Mat FX (designs 022, 026, 027): effects are WAAPI keyframes from pure `*-pose.mjs` (D103); hits wait on
  `afterImpact`; entry.js decides Mega/Tera (D104); styles in css/mat-fx.css + css/mat-ambient.css.
- Deck-builder styling has two layers: `css/deck-builder-live.css` scoped `.db-live` (D95) and
  `css/deck-builder-pc-box.css` scoped `.db-live:not(.db-light)` (D99). No unprefixed rules, no !important.
- Vendored art: never hand-edit the `*.generated.mjs` catalogs; rerun the scripts (D97, D98, D100).
- ONE pre-existing failing test: `card-inspector-model.test.mjs` "retreat greys only when the cost is
  unpaid". Test with `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs"
  "bot/**/*.test.mjs"`, not `pnpm test`. The user checks CSS on localhost; no tunnel from this container.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S265 audit only: 28 attack/ability execution gaps filed (I88–I115); no code changed.
- S264 (on main) Dynamotor, Sinister Surge, Adrena-Brain, Acerola's Premonition resolve server-side.
- S264 (on main) auth-mode previews keep their foil; Mega entry reworked; End Turn/View Board; no blink (D106).
