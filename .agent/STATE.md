# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 102
Focus: Air Balloon wrongly discounting attack cost instead of only retreat cost.
Active: done. `passiveCostDiscount` (shared/engine/rules/ability-executors.mjs) matched any card
  text containing "cost"/"energy" + "less", so Air Balloon's retreat-cost text ("Retreat Cost ...
  is {C}{C} less") also tripped the generic attack-cost discount path (combinedPassiveCostDiscount
  → attack-window.mjs), on top of its correct reduction via combinedToolRetreatCost (tool-combat.mjs,
  retreat.mjs) — double-dipping. Fix: passiveCostDiscount returns 0 whenever the text mentions
  "retreat". Added regression test; pnpm test 1299/1299. PR: github.com/Ar1ssi/vibecodepokemontcg2/pull/107
Next: maintenance due (carried from S100/S101) — run maintain.md if next session has room. User to
  live-verify Dawn's UI flow (3 sequential single-card pickers, one shuffle). Still open:
  live-verify I37 in a real 2P game (check sync log for zero hint_mismatch). Grand Tree stray
  "evolved X into Y" chat line on rejected evolve (cosmetic). I34 turn-desync residual (1/10
  soak). Prod netcode mode: a Render log reading "Netcode mode: legacy" contradicts render.yaml's
  SERVER_AUTHORITATIVE='1' — user to confirm the dashboard env var.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Cost-discount parsers keyed on loose text matching (`/(cost|energy)/` + "less") are prone to
  cross-matching other "cost" effects (S102: retreat cost vs attack cost). Any new generic text
  parser near passiveCostDiscount/parseRetreatCostModifier needs an explicit exclusion for the
  other cost family, not just a positive match.
- Room exit/entry must dispatch document 'room-changed' (S101). Any new path that leaves or
  enters a room (kick, timeout, lobby redirect) must dispatch it too, or the rules session leaks
  into the next room. rules-bridge's resetRulesSession is closure-scoped — the event is the seam.
- joinGame setup is serialized on pushActionQueue (S99). Anything else that resets opponent state
  asynchronously while the server may be pushing to this socket must do the same.
- matchesSearch (shared/engine/rules/search-match.mjs) has exact stage-1/stage-2 branches (S100);
  verify new "Stage N Pokémon" search text with unit tests, not by eyeballing the picker.
- Live checks: user checks CSS/visuals on localhost (memory `feedback_css_preview.md`); drive
  netcode/rules checks via Playwright + `?e2e=1`. Hidden sidebox buttons: click via
  `page.evaluate(() => el.click())`, not `page.click`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S102 2026-09-11 fix(tools): Air Balloon no longer discounts attack cost — passiveCostDiscount
  excludes any text mentioning "retreat". PR #107.
- S101 2026-09-11 fix(netcode/rules): room change resets the rules session; server answers a
  peer-log request itself when the requester is alone (no false desync warning).
- S100 2026-09-11 patch(fix): Dawn's combined Basic/Stage1/Stage2 search — 3 sequential
  single-card searches, one shuffle at the end; matchesSearch gained exact stage filters.
