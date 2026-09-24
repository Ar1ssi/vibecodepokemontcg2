# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 294
Focus: S294 merge: PRs #182 (trainer 035 + 038 fixes), #183 (attack 036 slices 1–15), #184 (ability 034)
  merged to main in that order; colliding branch ids renumbered (D124–D141, I154–I168; "(PR #n branch id X)").
Active: none.
Next: maintenance due (S290 skipped; ISSUES Open 43/40, Closed 34/30 over cap).
  036 slice 16 (regression gate `pnpm audit:attacks`, close I136) — ledger NEXTSTEPS.md.
  P2 engine backlog: I151 (reactive Tool conditions), I154 (26 server-missing Trainer steps), I164 (ability
  follow-on steps), I136. Then I165–I168, I155, I161–I163, I137, I126/I127, I121.
  User visual check of typed Tera entry/skin + Mega vortex in a real rules-mode game.
  Pending approval: designs 028 (I85), 029 (I86).
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle` (~2 min), `pnpm audit:abilities` (~2 min), `pnpm audit:trainers`
  (seconds). Legit rate changes → `--update-baseline` + commit the baseline JSON. Known `pnpm test` failure:
  card-inspector-model "retreat greys…"; coin-flip-ceremony is flaky.
- Parallel branches collide on D/I ids: take the next free id by grep of this checkout AND open branches.
  The primary checkout still holds another session's uncommitted harness edits (S288 CLAUDE.md/workflows).
- Engine: `applyCommand` clones state — read results via `findCard(res.state, id).card`; attacking ends the
  turn → assert events. computeAttackDamage returns early for 0 base damage (I152) before any bonus.
  Coin KO-prevention needs a `flipCoin` (heads) or it never applies (Focus Band, I146).
- Mat FX: canvas FX go through entry.js `playCanvasStage` (WAAPI clock); holo wrappers need TCGdex.
- Bash heredoc eats `\` → write edit scripts with the Write tool. Primary working copy is CRLF (repo LF).

## Recently shipped (≤3 one-liners; older → journal)
- S294 merge of #182/#183/#184: suite 3879/3880 (known inspector fail), oracle/abilities/trainers gates PASSED.
- S293 trainer design 038 complete (I138–I152 fixes) on #182.
- S287 attack 036 slices 8–15 (#183) and ability 034 slice 7 + I157–I160 fixes (#184).
