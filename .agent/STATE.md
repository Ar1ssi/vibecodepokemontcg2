# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 223
Focus: Special-energy triggers (I69) — authoritative/server parity in the shared engine.
Active: none.
Next: none.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Special-energy triggers now execute in BOTH engines. Authoritative: `shared/engine/effects/special-energy.mjs`
  (`runSpecialEnergyTriggers`), wired in `reduce.mjs` at attachCard (attach+evolve), resolveAttackEffectPhase
  (damaged), handleKnockout (KO + attached Recycle), resolveCheckup (endTurn, both players), moveCard→discard,
  and `trainer-steps.discardCard`; search/switch suspend on a `specialEnergy` PendingChoice resumed in resolveChoice.
  Legacy: rules-bridge / move-card / chat-buttons (I68/I69).
- `draft.__attackEffectPhase` is set in `resolveAttackEffectPhase` and deleted in the `applyCommand` tail
  (cloneGameState spreads unknown fields, so it MUST be cleared every command).
- Legacy Energy once-per-game guard: `toolPrizeCountAdjust(..., { skipSpecialEnergy })` +
  `victimPlayer.flags.legacyPrizeReductionUsed` (authoritative only; client gap = I70).
- Client rules files use `catch {}` (pre-existing `no-empty` eslint errors, style not introduced here).
- Coin catalog is 939 entries; rewrite via `node scripts/normalize-coin-catalog.mjs` (`--check` guards).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S223 feat(rules): authoritative special-energy trigger execution (attach/evolve/damaged/KO/endTurn/discard) + Legacy guard; 11 tests (I69).
- S222 feat(rules): wired special-energy on-evolve/on-damaged/end-turn triggers + Retro devolve; Legacy prize test.
- S221 feat(rules): wired special-energy on-attach/on-KO/on-discard triggers into move-card, rules-bridge, KO watcher (I68).
