# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 233
Focus: feature — server-authoritative battle-log narration (design 021, closed I71).
Active: none.
Next: none.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Concurrent writers S230/S233 vs S231/S232 collided on `.agent` (single-writer assumption broken). Both
  landed on main: GX once-per-game single-sourced on `player.oncePerGame` via shared `oncePerGameUsed`
  (commit 25e18c4, closed I75–I77; the old `flags.{gxUsed,vstarUsed}` mirror is gone) and the battle log
  (commit 38e97ff, design 021/I71). Remaining GX gaps: the attack panel can't grey a spent GX (I64) and
  the GX/VSTAR button markup is dead (I23).
- Battle-log mapper (S233/D91): `client/src/setup/netcode/server-battle-log.mjs` is now the single
  server-event→text map (it composes `attack-announcements.mjs`), wired as `onAdvisoryEvent` in
  socket-event-listeners.js. A narratable event needs an absolute `playerId` (or `player` for
  `turnStarted`) plus a registry-resolvable name/id; the server contracts are the additive
  `trainerPlayed` event (from `executeTrainer`, Tools excluded) and `cardAttached` emitted only for
  non-Pokémon attaches (evolves use `pokemonEvolved`). Don't reintroduce a second text handler.
- Ability-step executor contract (S229): `parseAbility`'s `discardCostAbility` now emits `energyOnly` /
  `basicOnly` / `energyTypes` — the fields `shared/engine/effects/executor.mjs`'s discard-cost branch
  reads (it silently matched EVERY hand card before). `moveDamageAbility` is registered in
  `EXTRA_STEP_HANDLERS` (reuses `damageCounters`) so it raises a mat-pick PendingChoice. A new step
  type needs BOTH parser-output fields and a handler, or the server path no-ops silently.
- Mega prize split (D89): `prizesForKO` gives **3** to `isModernMegaCard` ("Mega X ex", 2025+),
  **2** to `isLegacyMegaCard` ("M X-EX"/"Primal X-EX", Gen 6). `isModernMegaCard` checks the legacy
  name form FIRST so a `stage: "MEGA"`-derived subtype token can't mis-flag a legacy Mega. Mega
  turn-end (`evolution.mjs`/D33) reads the same two predicates — don't reintroduce `isMegaCard`.
- KO promotion (S226/D88): `handleKnockout` no longer auto-promotes. It marks `player.promotionPending`;
  `settlePromotionChoices` at the command tail auto-promotes a lone Bench Pokémon or raises a
  PendingChoice (`source:'promote'`, `resumeToken.effectType:'promote'`) that the mat picker renders.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S233 feature: authoritative battle-log narration (design 021/I71) — pure event→text mapper + server
  `trainerPlayed`, `cardAttached` non-Pokémon gate; 23 tests, full suite 2635/2635. UNCOMMITTED, primary.
- S232 fix(rules): GX once-per-game single-sourced on `player.oncePerGame`, shared `oncePerGameUsed`,
  flags mirror removed, +3 tests (commit 25e18c4 on main).
- S229 fix(rules): Mega Greninja ex Mortal Shuriken — discard cost restricted to Basic {W} Energy (parser
  emits `energyOnly`/`basicOnly`/`energyTypes`) + damage-counter mat-pick handler wired; 2601/2601.
