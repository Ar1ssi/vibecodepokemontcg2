# 021: Server-authoritative battle-log narration
Status: shipped
Date: 2026-09-21 · Session: S233

## Problem
Under `SERVER_AUTHORITATIVE=1` (the Render deploy, render.yaml:12/29) the multiplayer battle log is
near-silent (I71). Gated call sites return before their legacy announcements, the peer mirror is
suppressed, and the only server-event→text map (`client/src/setup/netcode/attack-announcements.mjs`)
covers 4 attack event types. Trainer plays, abilities, evolves, attaches, retreats/switches,
KOs/promotions, prizes, draws/discards/shuffles/looks, status, coins and GX/VSTAR reach the board
but produce no log line on either client.

## Constraints
- Client mapper is pure and Node-importable (`node --test`, no jsdom) — testable in isolation (PROJECT.md).
- The server view's `events` array is advisory: both players receive the same events (`room.mjs:328`,
  `server.js:982`), so lines are derived client-side and phrased by each client's own absolute
  `localPlayerId` — the design-013 precedent ("one source, no double-announcing", `attack-announcements.js`).
- New event fields/types are additive; old clients must ignore them (no protocol bump needed).
- Legacy (flag-off) path must be unchanged: this only adds a consumer of events that legacy never emits.
- No build step; native ESM.
- Snapshot/reconnect views send `events: []` (`server.js:1040,1090,1136`), so no replay double-log; the
  existing `append-message.js` guard (undo/catch-up/replay) still governs all lines.

## Current state
- `client/src/setup/netcode/attack-announcements.mjs` — pure `attackAnnouncementLines(event, selfPlayerId, resolveName)`;
  handles `attackCoinFlipped`/`attackDamageScaled`/`benchDamaged`/`attackBenchFizzled`, else `[]`. Tested.
- `client/src/setup/netcode/attack-announcements.js` — DOM caller; resolves names from `getCardRegistry()`,
  appends via `appendMessage('', line, 'announcement', false)`. Wired in `socket-event-listeners.js:483-486`
  as `handleAttackAnnouncement` inside `onAdvisoryEvent`.
- `client/src/setup/netcode/advisory-animations.js` — separate animation caller in the same hook (no text).
- `shared/engine/reduce.mjs` `applyCommand` pushes narration-bearing events: `turnStarted` (:1323),
  `cardRetreated` (:1250), `cardSwitched` (executor), `pokemonEvolved` (:3473), `cardAttached` (:3514),
  `pokemonKnockedOut` (:714), `pokemonPromoted` (:814), `prizesTaken` (:1023,:1135,:3883,:3921),
  `abilityUsed` (ability.mjs:73), `statusApplied`/`statusCleared` (:942, executor), `gxAttackUsed` (:3087,:4222),
  `vstarUsed` (:4017), `cardsDrawn`/`cardsDiscarded`/`cardsRevealed`/`cardsLookedAt`, `zoneShuffled`/`deckShuffled`,
  `coinFlipped` (executor.mjs:1051,1081). Names are not on most of these; the moved cards remain in the
  view (and thus the registry) except if sent to a zone not rendered.
- `shared/engine/effects/trainer.mjs` `executeTrainer` moves the played card hand→board (:196) or hand→stadium
  (:182) with no "played" event; Tools attach via `cardAttached` (:223); Items/Supporters emit only their
  step events.
- `shared/engine/reduce.mjs` `attachCard` (:3397-3519) pushes `pokemonEvolved` for Pokémon **and**
  `cardAttached` unconditionally (:3514) — evolving would double-narrate. `cardAttached` has no other consumer
  (grep: only its emission), so gating it is safe.

## Options
1. Where the narration lives.
   A. Client pure module mapping server events → strings (design-013 pattern). B. Server emits rendered strings.
   **Pick A** — perspective (`selfPlayerId`) and card names (registry) are client-side; server strings would
   need per-player fan-out and still lack registry names.
2. Event coverage.
   A. Core action narration (approved scope). B. Full card-specific effect parity. **Pick A** — B needs the
   legacy engine's bespoke text and is unbounded; file the residue separately if wanted.
3. Evolve/attach double-narration.
   A. Gate `cardAttached` server-side to non-Pokémon attaches. B. Client de-dupes within the event batch.
   **Pick A** — one line, no per-batch state, and the event has no other consumer.
4. Trainer-play signal.
   A. New additive `trainerPlayed` event from `executeTrainer`. B. Infer from `cardMoved`/`cardsDiscarded`.
   **Pick A** — no event exists for the board push (:196); inference would mislabel effect discards.
5. Wiring/entry point.
   A. One new caller `server-battle-log.js` composing `attack-announcements.mjs`; delete the old caller.
   B. Two handlers in the hook. **Pick A** — one append path, one ordering, no overlap risk.
6. Spectators (`selfPlayerId == null`).
   A. No lines (consistent with attack lines today). B. Third-person lines. **Pick A** — out of scope.

## Design
### New: `client/src/setup/netcode/server-battle-log.mjs` (pure)
```js
export function serverBattleLogLines(event, selfPlayerId, resolveName) → string[]
```
- Returns `[]` for: non-object event, `playerId == null` (except types that use a different key — none do),
  or `selfPlayerId == null`.
- `resolveName(instanceId) → string|null` (optional); a null/unknown name degrades to a generic noun.
- Attack types (`ATTACK_EVENT_TYPES`) delegate wholesale to `attackAnnouncementLines` (imported) and never
  fall through to the core switch.
- Perspective helper: `sideLabel = event.playerId === selfPlayerId ? 'You' : 'Your opponent'` / possessive.

Event → line (core switch):
| type | line (self / opponent) |
|---|---|
| `turnStarted` | `Turn {number} — {your / your opponent's} turn.` |
| `trainerPlayed` | `{You / Your opponent} played {name}{ (Stadium) when event.stadium}.` |
| `abilityUsed` | `✦ {You / Your opponent} used {name}'s ability.` |
| `pokemonEvolved` | `✨ {name} evolved onto {targetName}.` |
| `pokemonDevolved` | `⬇ {targetName} devolved — {name} returned.` |
| `cardAttached` | `⚡ {You / Your opponent} attached {name} to {targetName}.` |
| `cardRetreated` | `🔄 {activeName} retreated — {promotedName} promoted to the Active Spot.` |
| `cardSwitched` | `🔄 {activeName} switched with {benchName}.` |
| `pokemonKnockedOut` | `💀 {Your / Your opponent's} {name} was Knocked Out.` |
| `pokemonPromoted` | `⬆️ {name} was promoted to the Active Spot.` |
| `prizeTaken`/`prizesTaken` | `🏆 {You / Your opponent} took {count} prize card{s}.` |
| `cardsDrawn` | `{You / Your opponent} drew {count} card{s}.` |
| `cardsDiscarded` | `{You / Your opponent} discarded {name}.` / `… {n} cards.` (names from `cards[]`) |
| `zoneShuffled`/`deckShuffled` | `🔀 {You / Your opponent} shuffled {their deck / zoneId}.` |
| `cardsLookedAt` | `👀 {You / Your opponent} looked at {count} card{s}.` |
| `cardsRevealed` | `👀 {You / Your opponent} revealed {names}.` |
| `statusApplied` | `☠️ {name} is now {condition}.` |
| `statusCleared` | `☠️ {name} recovered from {condition}.` |
| `coinFlipped` | `🪙 {You / Your opponent}: {Heads / Tails}.` (multi-flip uses `heads` count when present) |
| `gxAttackUsed` | `💥 {You / Your opponent} used the GX attack {attackName}.` |
| `vstarUsed` | `💥 {You / Your opponent} used a VSTAR Power.` |

### New: `client/src/setup/netcode/server-battle-log.js` (DOM caller)
`handleServerBattleLog(event, selfPlayerId)` — resolves names via `getCardRegistry().get(id)?.card?.name`,
calls `serverBattleLogLines`, `appendMessage('', line, 'announcement', false)` per line. Replaces
`attack-announcements.js` (deleted; its `resolveCardName` moves here).

### `client/src/initialization/socket-event-listeners/socket-event-listeners.js`
Import `handleServerBattleLog`; in `onAdvisoryEvent` (:483-486) callback `handleAdvisoryEvent(ev, id)` then
`handleServerBattleLog(ev, id)` (drop `handleAttackAnnouncement`).

### Server events (additive)
- `shared/engine/effects/trainer.mjs`: after the initial-play block (:174-198), when the card is **not** a
  Tool (`isToolCard(card)` is false), push
  `{ type: 'trainerPlayed', playerId, instanceId: card.instanceId, name: card.name, stadium: isStadium(played) }`.
- `shared/engine/reduce.mjs`: wrap the `cardAttached` push (:3514) in `if (!isPokemon(cardRef.card))` so a
  Pokémon evolution emits only `pokemonEvolved`.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | event is null / non-object | `[]`; no throw | [x] covered: server-battle-log.test "malformed… say nothing" |
| 2 | `playerId` missing | `[]` (never guess an actor) | [x] covered: "malformed…" + "turnStarted" |
| 3 | `selfPlayerId` null (spectator) | `[]`, consistent with attack lines | [x] covered: "malformed…" |
| 4 | `instanceId` not in registry | generic noun ("a Pokémon" / "a card"), line still emitted | [x] covered: "unknown names fall back to generic nouns" |
| 5 | `resolveName` not provided | same generic noun | [x] covered: "unknown names fall back…" (no-resolver case) |
| 6 | attack-type event with no lines | `[]`, does NOT fall through to core | [x] covered: "attack events delegate to attackAnnouncementLines" |
| 7 | evolve (Pokémon) | one line, no `cardAttached` line | [x] covered: battle-log-events "evolving a Pokémon…" |
| 8 | trainer Played is a Tool | no `trainerPlayed`; `cardAttached` line only | [x] covered: battle-log-events "a played Tool…" |
| 9 | `cardsDiscarded` with 0 / missing `cards` | count-based line or `[]`; never "undefined" | [x] covered: server-battle-log.test "discards…" |
| 10 | `prizesTaken` count 1 vs >1 | singular/plural correct | [x] covered: "promotion and prizes…" |
| 11 | reconnect/snapshot view | `events: []` → no re-log; catch-up guard also suppresses | [x] reasoning: `server.js:1040,1090,1136` send `events: []`; append-message guard suppresses catch-up |
| 12 | both clients receive the same event | each phrases by its own `localPlayerId` | [x] covered: all mapper tests run p1 + p2 perspectives |

## Test plan
- Unit: new `client/src/setup/netcode/__tests__/server-battle-log.test.mjs` — every row of the table, both
  perspectives, generic-name fallback, malformed/missing-identity/no-self cases, attack delegation.
  Existing `attack-announcements.test.mjs` stays green.
- Integration (headless, no browser): new `shared/engine/__tests__/battle-log-events.test.mjs` — build a
  state (mirrors `trainer-execution.test.mjs`), run real commands (`playTrainer`, `attachCard`,
  `playTrainer` tool, `retreat`, attack KO, prizes, `pass`), collect `applyCommand(...).events`, feed each
  through `serverBattleLogLines(ev, 'p1'|'p2', nameFromState)` and assert the expected lines. Catches event
  payload drift that mocks would miss.
- Full `pnpm test` green.
- Manual: live 2P under `SERVER_AUTHORITATIVE=1` — **not runnable in this environment** (`node_modules`
  lacks `socket.io`/`express`, so the server cannot boot). The headless integration above is the substitute;
  this will be stated plainly at close.

## Migration / rollout
n/a: additive events + a new client consumer; no persisted state, no schema. Revert path = `git revert`
of the slice commits.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Delivers | Green when |
|---|---|---|
| 1 | `server-battle-log.mjs` + unit tests | unit tests pass; no wiring yet |
| 2 | server events (`trainerPlayed`, gated `cardAttached`) + headless integration test | integration + full suite green |
| 3 | DOM caller + hook wiring + delete `attack-announcements.js` | full suite green; production hook calls one handler |

## Deviations (Builder appends here during build)
- Built in the primary checkout, not a worktree: the S230 audit's ISSUES/journal/STATE edits and this
  design are uncommitted in the primary, so a worktree branched from HEAD would omit them and copying
  the worktree harness files back risked clobbering S230. No commit was made (the user did not request one).
- Live 2P/browser verification not possible here: `node_modules` is missing `socket.io`/`express`
  (server cannot boot) and `pnpm test` attempts a dependency install that fails with EPERM. Substituted
  the headless `applyCommand → events → mapper` integration test; the full `node --test` suite is green.
- `cardsDrawn` deliberately gets no emoji prefix and may add a line where a legacy opening message
  already fires under authority; accepted as low-impact.
- A Tool played with no valid target emits neither `trainerPlayed` nor `cardAttached` (so no line);
  obscure, accepted.
- `pnpm lint` could not run (`eslint` package present but no bin); lint is pre-existing red on CRLF anyway.
