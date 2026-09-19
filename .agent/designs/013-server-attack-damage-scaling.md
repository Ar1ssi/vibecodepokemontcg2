# 013: Server-side attack damage scaling, coin flips and bench damage
Status: approved (user)
Date: 2026-09-18 · Session: S173

## Problem
Under `SERVER_AUTHORITATIVE`, every attack deals its printed number only. `reduce.mjs`'s
`attack` case calls `computeAttackDamage` (weakness/resistance/flat) and nothing else, so
"for each" scaling, coin-flip bonuses, single-target bench damage and bench spread are all
silently dropped. Live example (S173 sync log): Toucannon `me05-094` Feather Rondo
("60+", "does 20 more damage for each Benched Pokémon (both yours and your opponent's)")
dealt a flat 60 with 7 benched Pokémon on the table — should be 200.

## Constraints
- Pure engine: `shared/engine/**` stays DOM-free and Node-importable; tests run under
  `node --test` with stub cards, no jsdom (PROJECT.md).
- `applyCommand(state, command, rng)` must stay pure and total; RNG must come from the
  injected `rng` (`activeRng`) so replay/catch-up stays deterministic (design 001/002).
- Prize cards move only via a server-granted entitlement — bench KOs must route through
  `handleKnockout`, never a direct prize move (D43/D46).
- No build step; client code is native ESM served as-is.
- Legacy client path (`chat-buttons.js`) keeps its own implementation: under server authority
  its whole attack body is gated off by `dispatchAuthoritativeAction`, so the two never both run.

## Current state
- `shared/engine/reduce.mjs:1536` `case 'attack'` — confusion coin, then
  `computeAttackDamage(attackerView, defenderView, attack)` at :1612, `damageUpdated`,
  KO via `handleKnockout`, `drawCount` attack draw, `attackExecuted`, checkup, turn advance.
  Imports only `drawCount` from `damage-parser.mjs` (:24).
- `shared/engine/rules/damage-parser.mjs` — `parseAttackDamage(attack, attacker, defender, ctx)`
  returns `{ base, total, components, notes, bench, heal, selfDamage, resolved }`; ctx fields are
  optional and an absent one yields an honest "resolve the printed count" note instead of 0.
  `allBenchDamage(text)` = per-Pokémon spread damage; `planBenchTarget(n)` = null / 0 / -1.
- `shared/engine/rules/attack-engine.mjs` — `computeAttackDamage` (weakness/resistance only;
  `parseInt('60+') === 60`).
- `client/src/actions/chat-buttons/chat-buttons.js:861` — the legacy client builds a ~30-field ctx
  from the DOM and applies bench (:1541) and spread (:1606) damage. Server-off path only.
- `client/src/setup/netcode/card-stats.js` — ships `attacks[].text` to the server, so the text the
  parser needs is already on the authoritative card (verified live: `me05-094` text present).
- `shared/engine/reduce.mjs:60` `handleKnockout` — handles a benched victim (`wasBench`), grants
  `flags.prizesOwed`, auto-promotes, checks the win condition.
- Server events are advisory: `client/src/setup/netcode/advisory-animations.mjs` maps a few event
  types to animations; nothing renders an attack result as chat. Under server authority the
  attacker therefore currently sees no damage/coin text at all.

## Options
1. Where does the scaling live?
   A. Inline in `reduce.mjs`'s attack case — no new file, but the case is already ~150 lines and
      the ctx build is ~40 more, untestable apart from a full command run.
   B. New pure module `shared/engine/rules/attack-damage-context.mjs` exporting
      `buildServerAttackContext(...)` — one extra file, ctx unit-testable in isolation.
   **Pick B**: the ctx is the part most likely to grow (one field per new "for each" family) and
   the part most worth testing directly.
2. Single-target bench damage targeting.
   A. Auto-pick the first benched Pokémon (mirrors `planBenchTarget`) — small, sometimes the wrong
      Pokémon; the player corrects with the manual damage tools (design 012).
   B. New `pendingChoice` kind + client picker — correct, but a second slice of plumbing.
   **Pick A** (user's call, 2026-09-18). B filed as an ISSUES line.
3. Coin flips.
   A. Out of scope. B. Server rolls with `activeRng` and reports the result.
   **Pick B** (user's call): `/flip a coin/` → one roll, `/flip (\d+) coins?/` + "for each heads"
   → N rolls, results fed to `ctx.coin` / `ctx.headsCount` and emitted as an event.
4. Making the result visible.
   A. Reuse the animation hook only — damage renders from the view, but the *why* (scaling notes,
      coin result, which benched Pokémon got hit) never reaches the player.
   B. New pure `client/src/setup/netcode/attack-announcements.mjs` mapping the new events to chat
      lines, wired next to `handleAdvisoryEvent` in `socket-event-listeners.js`.
   **Pick B**: without it a 200-damage Feather Rondo looks like an unexplained number, and the
   coin flip the server just made is invisible to both players.
5. `parsed.heal` / printed damage prevention.
   Out of scope — neither is part of the reported defect and heal needs `healTarget` plumbing.
   Filed as an ISSUES line.

## Design
### New: `shared/engine/rules/attack-damage-context.mjs`
```js
// Pure. No draft mutation, no RNG.
export function buildServerAttackContext(state, {
  attackerPlayerId, defenderPlayerId, attacker, defender, attackerView, defenderView,
  coin = null, headsCount = undefined,
}) → ctx   // the object handed to parseAttackDamage
```
Fields (each omitted when it cannot be computed honestly, never faked as 0):
`energyCount` (Energy attached to the attacker), `ownEnergyCount` / `opponentEnergyCount`
(Energy on that side's Pokémon / on the defender), `opponentPrizes`, `turnCount`
(`state.turn.number`), `attackerHp` / `defenderHp` (from the evolved views),
`attackerDamage` / `defenderDamage`, `ownHandCount` / `opponentHandCount`,
`ownBenchCount` / `opponentBenchCount` (Pokémon only, `!attachedTo`),
`stage2BenchCount`, `stage2InPlayCount`, `ownPokemonInPlayCount`, `damagedOwnPokemonCount`,
`retreatCostColorless` (defender's retreat cost), `coin`, `headsCount`.
Helper `benchPokemon(player)` / `inPlayPokemon(player)` are module-local.

### `reduce.mjs` `case 'attack'` — new order
1. existing legality/confusion handling (unchanged)
2. `flipsFor(attack, activeRng)` (module-local helper) → `{ coin, headsCount, flips }`;
   push `attackCoinFlipped { playerId, attackName, coin, headsCount, flips }` when it rolled.
3. `ctx = buildServerAttackContext(...)`; `parsed = parseAttackDamage(attack, attackerView,
   defenderView, ctx)`.
4. `effectiveAttack = parsed.total !== parsed.base ? { ...attack, damage: parsed.total } : attack`;
   `computeAttackDamage(attackerView, defenderView, effectiveAttack)` as today. Emit
   `attackDamageScaled { playerId, attackName, base: parsed.base, total: parsed.total,
   notes: parsed.notes }` when `parsed.notes.length > 0`.
5. active damage + KO: unchanged code path.
6. `parsed.selfDamage > 0` → add to the attacker, `damageUpdated`, KO via `handleKnockout`
   (attacker's own KO gives the *defender* the prize entitlement).
7. single-target bench: `parsed.bench > 0` → `planBenchTarget(benchCount)`; `null` → emit
   `attackBenchFizzled`; otherwise first benched Pokémon → damage, `damageUpdated`,
   `benchDamaged { playerId: victimOwner, instanceId, attackName, dealt, auto: plan === -1 }`,
   KO via `handleKnockout`.
8. spread: `allBenchDamage(attack.text)` → same per-target loop over a snapshot of the bench taken
   before the loop (a KO mutates the array), skipping cards already removed.
9. existing `drawCount`, `attackExecuted`, checkup/turn advance (unchanged).

`attackExecuted` gains `total`/`benchDealt` fields; existing consumers read `damage` and are
unaffected (additive only).

### New: `client/src/setup/netcode/attack-announcements.mjs` (pure) + `.js` wiring
`attackAnnouncementLines(event, selfPlayerId) → string[]` for `attackCoinFlipped`,
`attackDamageScaled`, `benchDamaged`, `attackBenchFizzled`; every other type → `[]`.
`socket-event-listeners.js` calls `handleAttackAnnouncement(event, selfPlayerId)` (thin DOM caller
that `appendMessage`s each line) from the same `onAdvisoryEvent` hook as the animations.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | attack has no text / no scaling | `parsed.total === base`; damage identical to today; no `attackDamageScaled` event | [ ] |
| 2 | `attack.damage` is `''`/null/`'60+'` | `parseAttackDamage` base comes from the numeric field only; `computeAttackDamage` still `parseInt`s; never NaN | [ ] |
| 3 | 0 benched Pokémon on the defending side | scaling counts 0 (not unresolved); `parsed.bench`/spread emit `attackBenchFizzled`, no damage | [ ] |
| 4 | repeated invocation (same command twice) | second attack blocked by `flags.attackerAttacked` in `canPerformAction` — unchanged | [ ] |
| 5 | card stats never arrived (`attacks: []`) | fallback `{ name:'Attack', damage:10 }`, no text → no scaling, no crash | [ ] |
| 6 | KO mid-loop during spread | bench snapshot taken before the loop; cards removed by a KO are skipped via `findCard` | [ ] |
| 7 | spread KOs several benched Pokémon | one `handleKnockout` per victim; `flags.prizesOwed` accumulates; win check fires once all are gone | [ ] |
| 8 | bench damage on a defender with no active (already KO'd this attack) | bench damage still applies; promotion is handled by `handleKnockout` | [ ] |
| 9 | coin-flip attack under catch-up replay | flips come from `activeRng` with the command's cursor, so replay reproduces them | [ ] |
| 10 | "flip N coins for each heads" with N absent/garbage | no `headsCount`; parser leaves an unresolved note, base damage only | [ ] |
| 11 | self-damage KOs the attacker | `handleKnockout` with victim = attacker, attackerPlayerId = opponent; turn still ends | [ ] |
| 12 | announcement event for the opponent's attack | lines render on both boards, phrased by side | [ ] |

## Test plan
- Unit (`node --test`, added to `package.json`):
  `shared/engine/rules/__tests__/attack-damage-context.test.mjs` — ctx field math, omissions.
  `shared/engine/__tests__/attack-scaling.test.mjs` — `applyCommand` attack: Feather Rondo
  60 → 200 with 3+4 bench; spread damage + bench KO + `prizesOwed`; coin heads/tails via a seeded
  rng; no-text attack unchanged; empty bench fizzle; self-damage KO.
  `client/src/setup/netcode/__tests__/attack-announcements.test.mjs` — line text per event/side.
- Manual: live 2P probe under `SERVER_AUTHORITATIVE=1` with a Toucannon board, confirming the
  damage number and the chat lines.

## Migration / rollout
No schema change: new event types are additive and ignored by older clients; no persisted state.
Revert path = `git revert` of the slice commits (pure code change, no data touched).

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | `attack-damage-context.mjs` + ctx unit tests | ctx tests pass; no behavior change yet |
| 2 | `reduce.mjs` attack: scaling, coin flips, self-damage, bench + spread, new events | attack-scaling tests pass; full suite green |
| 3 | client announcements module + wiring | announcement tests pass; live 2P check recorded |

## Deviations (Builder appends here during build)
