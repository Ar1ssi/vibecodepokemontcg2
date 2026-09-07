# 001: Server-authoritative netcode

Status: draft
Date: 2026-09-07 · Session: S1

## Problem

Multiplayer runs two independent simulations of the same game and hopes they agree. They routinely
don't: 54 of the last 200 commits touch sync/desync/replay/RNG, spanning setup order, hand ordering,
index drift, and duplicated rules side effects — and each fix adds another reconciliation layer
rather than removing the cause. Desyncs are unfixable in this architecture because divergence is the default state and
detection is best-effort. Hidden information is also fully replicated to both clients, so "the deck
is private" is a UI convention, not a fact.

## Constraints

Pulled from code this session (PROJECT.md is unfilled — bootstrap has not run).

- **No bundler.** `render.yaml` builds with `pnpm install --frozen-lockfile` and starts
  `node server/server.js`; `client/index.ejs:20` loads `src/front-end.js` as a native ES module and
  `server/server.js:183` serves `client/` statically. Shared code must be loadable by both the
  browser (via URL) and Node (via fs path) with no build step and no bare specifiers.
- **Single Node process, free tier.** One `web` service in `render.yaml`; no Redis, no horizontal
  scaling. Game state lives in process memory.
- **Socket.IO 4.7.4 both ends** — server dep and the CDN tag in `index.ejs:19` must stay in step.
- **Existing pure tests must keep passing.** `package.json` runs `node --test` over 41 `.mjs` test
  files with no jsdom; the pure engine modules are already headless.
- **Solo play must keep working.** `systemState.isTwoPlayer` gates multiplayer; single-player uses
  the same action layer and must not regress.
- **Spectators and export/import are existing features** (`spectatorActionData`, `storeGameState`
  → SQLite, `/import?key=`) and must survive the migration.
- No new runtime dependency without a DECISIONS.md line.

## Current state

**Transport.** `server/server.js` (414 lines) is a pure relay: `emitToRoom()` does
`socket.broadcast.to(data.roomId).emit(...)`. It holds `roomInfo` (usernames per room) and a SQLite
table for exported games. It stores **no game state and validates no game logic**.

**Simulation.** Both clients simulate. A local move mutates the board immediately, then
`processAction()` (`client/src/setup/general/process-action.js`) appends to `selfActionData`,
increments `selfCounter`, and emits `pushAction`. The peer's `socket.on('pushAction')` checks
`counter === oppCounter + 1` and calls `acceptAction('opp', ...)`, which dispatches through a
~60-entry table in `client/src/setup/general/accept-action.js:71` onto its **mirror** copy of the
board. Same handler functions, different `user` argument, `emit=false`.

**Reconciliation stack** (all client-side, all reactive):

| Mechanism | File | What it does |
|---|---|---|
| Action counters | `process-action.js`, `socket-event-listeners.js` | Gap detection; stale actions silently dropped |
| Board hash `syncCheck` | `setup/zones/zone-hash.mjs`, `board-hash.js` | Fingerprint compare per action + 30s heartbeat |
| catchUp / fullReplay | `setup/general/catch-up-actions.js`, `resync-actions.js` | Replay peer's log onto a diverged board |
| Replay dedupe | `setup/general/sync-replay.mjs` | Stops the recovery system looping on itself |
| Board snapshot | `setup/zones/board-snapshot.mjs`, `apply-board-snapshot.js` | Hard overwrite of the mirror; ships hidden zones |
| Card hints | `setup/zones/resolve-card-index.mjs` | Repairs index drift after zone reorder |
| RNG bundles | `setup/general/sync-action-args.mjs` | Relays coin faces / shuffle indices when the caller remembers to |
| Deterministic sort | `setup/zones/hand-sort.mjs` | Forces hand order agreement in 2P |
| Sync logger | `setup/general/sync-logger.mjs` | Diagnostics only |

**Portability.** ~8,900 lines of `client/src/setup/rules/*.mjs` are pure and already tested under
plain Node: parsers (`trainer-effects.mjs`, `damage-parser.mjs`, `abilities.mjs`), math
(`attack-engine.mjs`), and the legality gate
`canPerformAction({ user, action, zoneId, targetZoneId, initiator }) → { allowed, reason }`
(`rules-state.mjs:597`). `planAbilitySteps()` (`ability-step-plan.mjs:53`) already turns parsed
effects into an ordered `{ action, step, executor, stepIndex }[]` plan — the seam a resumable
server executor needs.

**Non-portable.** `client/src/actions/**` (~10,582 lines, ~85% DOM-coupled) performs every state
mutation via DOM manipulation. `chat-buttons.js` (4,330 lines) is the attack/retreat/pass monolith;
`rules-bridge.js` (2,291 lines) orchestrates rules through `document.dispatchEvent`;
`trainer-execution.js` (1,465 lines) resolves effects by opening **synchronous UI pickers**. Card
identity is an `HTMLImageElement`: `Card.image` carries the attachment graph (`image.relative`,
`image.attached`) and counter overlays (`card.js`).

**Root causes, ranked.** (1) Two simulations, no arbiter. (2) `Math.random()` called locally in
paths that never record the result — `trainer-execution.js:1412`, `reveal-and-hide.js:462`,
`rules-bridge.js:507`, `rules-bridge.js:846-851`. (3) Choice points resolve in UI callbacks, so the two clients resolve them
at different times and in different orders. (4) Recovery paths (`fullReplay`, snapshot) can
themselves diverge. (5) Silently dropped actions on counter mismatch
(`socket-event-listeners.js:272`) leave both sides "in sync" with a move missing.

## Options

### A. Authority model

- **A1 — Deterministic lockstep; server orders commands, clients simulate.** Keeps the existing
  simulation code; the server becomes a sequencer. Cheapest to reach, but correctness still rests on
  bit-identical determinism across two browsers, which is precisely what has failed ~20 times. Any
  new `Math.random()` or map-iteration-order difference reintroduces the bug class.
- **A2 — Server-authoritative simulation, clients render.** One simulation. Divergence becomes
  structurally impossible because the client has no state to diverge *with*. Costs a rewrite of the
  action layer and a choice protocol.
- **A3 — A2 plus client-side prediction and rollback.** Hides round-trip latency. Reintroduces a
  second speculative simulation and rollback bugs.

**Pick: A2.** This is a turn-based card game — a 50–200 ms round trip per click is imperceptible,
so the entire reason prediction exists does not apply. A2 is the only option that removes the bug
class rather than tightening the tolerance on it, and skipping prediction (A3) keeps exactly one
simulation in the system. Optimistic *animation* (visual only, discarded on response) is deferred;
see Rollout.

### B. Where shared engine code lives

- **B1 — `shared/` directory served at `/shared`.** Browser imports `/shared/engine/x.mjs`
  (absolute URL, native ESM); Node imports `../shared/engine/x.mjs` (fs path). Internal imports
  between shared modules stay relative and resolve correctly under both loaders. One line of
  `express.static` on the server; no package.json, no bundler, no dependency.
- **B2 — Server imports from `client/src/setup/rules/`.** Zero client churn, but permanently
  encodes "the server's engine lives in the client" and guarantees future confusion about which
  direction dependencies flow.
- **B3 — Add a bundler and a real workspace package.** Cleanest import ergonomics; adds a build
  step to a repo that deliberately has none, plus a new dependency.

**Pick: B1.** It satisfies the no-build-step constraint exactly, keeps the dependency direction
honest (`client → shared`, `server → shared`, never `server → client`), and the client-side import
rewrite is mechanical and greppable.

### C. What the server sends

- **C1 — Deltas/patches only.** Least bandwidth; ordering and gap bugs return through the back door,
  which is the failure mode we are eliminating.
- **C2 — Full per-player view snapshot per update.** Idempotent and order-independent: a client can
  drop, duplicate, or reorder messages and still converge. A board is small (~60–120 cards of thin
  JSON, single-digit KB); at a few updates per turn this is irrelevant on any modern link.
- **C3 — C2, plus an advisory event list for animation.** Snapshot is truth; events describe the
  transition so the UI can animate rather than snap.

**Pick: C3**, with the cardinal rule that **the client never derives state from events**. If events
are missing, late, or duplicated, the client snaps to the snapshot and is still correct. This is
what makes the design robust rather than merely relocated.

### D. Effect choice points

- **D1 — Server enumerates legal options; client picks.** Server suspends the effect on a
  `PendingChoice`, sends the option list to the deciding player, and resumes on `resolveChoice`.
  Requires converting synchronous executors into a resumable state machine.
- **D2 — Client resolves the choice and reports it.** Much less rewriting; hands legality back to
  the client, which reopens both cheating and the "two clients resolved differently" desync.

**Pick: D1.** D2 preserves the exact defect being removed. `planAbilitySteps()` already produces the
ordered step list, so the executor has a natural resume point (`stepIndex`).

### E. Card identity

- **E1 — Server-assigned integer `instanceId`, unique per game.** Identity independent of zone
  position, DOM, and deck contents; the client keeps a `Map<instanceId, HTMLElement>`.
- **E2 — Keep `syncInstance`.** Already exists, but is assigned at client deck-build time, so the
  two clients mint it independently — a shared-identity scheme that isn't actually shared.

**Pick: E1.** The server mints identity when it builds the decks, so both clients receive the same
ids by construction. Retire `syncInstance` and the hint machinery built to compensate for it.

## Design

### Topology

```
Browser (renderer)                    Node (authority)
  intent  ──── command ──────────────▶ validate → apply → mutate GameState
                                          │
  render ◀─── {view, events, ver} ─────────┘  (one redacted view per player, + spectators)
```

The client holds **no game state**. It holds the last `view` it rendered and a
`Map<instanceId, HTMLElement>` for animation continuity.

### Shared engine — `shared/engine/`

Pure, DOM-free, importable from both runtimes. Moved from `client/src/setup/rules/*.mjs` and
`client/src/setup/zones/*.mjs` essentially unchanged (~9,400 lines):

```
shared/engine/
  state.mjs         GameState factory, zone accessors, invariants
  cards.mjs         pure Card model (no HTMLImageElement), instanceId minting
  commands.mjs      command schema + validation table
  reduce.mjs        applyCommand(state, command, rng) → { state, events, pendingChoice }
  effects/          step executors: trainer, ability, attack, stadium (resumable)
  rng.mjs           seeded PRNG (mulberry32), injectable source
  view.mjs          viewFor(state, playerId) → redacted view
  rules/            existing pure modules, moved verbatim
  zones/            zone-hash, hand-sort, card-state (DOM fallbacks dropped)
```

Server: `import { applyCommand } from '../shared/engine/reduce.mjs'`.
Client: `import { describeCard } from '/shared/engine/cards.mjs'`.
Server adds `app.use('/shared', express.static(sharedDir))`.

### State model

```js
GameState = {
  gameId, stateVersion,              // stateVersion increments on every applied command
  seed, rngCursor,                   // deterministic replay: (seed, commandLog) → state
  players: { [playerId]: {
    username, deckList,
    zones: { deck:[], hand:[], prizes:[], active:[], bench:[], discard:[], lostZone:[], board:[] },
    flags: { ... }                   // from rulesState.flags
  }},
  stadium: Card | null,
  turn: { player, number, phase },   // phase: 'setup' | 'main' | 'attack' | 'ended'
  pendingChoice: PendingChoice | null,
  commandLog: Command[],
}

Card = { instanceId, name, set, number, id, src, type,
         damage, specialCondition, abilityUsed, attachedTo }  // attachedTo = instanceId | null
```

Attachment is a parent `instanceId` on the child, replacing the `image.relative` pointer graph.

### Protocol

Client → server:

| Event | Payload | Notes |
|---|---|---|
| `cmd` | `{ gameId, clientSeq, type, payload }` | `type` from the command vocabulary |
| `resolveChoice` | `{ gameId, choiceId, selection: instanceId[] }` | Answers a `PendingChoice` |
| `requestView` | `{ gameId }` | Idempotent resync (reconnect, tab focus) |

Server → client:

| Event | Payload | Notes |
|---|---|---|
| `view` | `{ gameId, stateVersion, view, events, pendingChoice }` | Authoritative. Client ignores `stateVersion <= lastRendered` |
| `cmdRejected` | `{ clientSeq, reason }` | Client shows the reason and re-renders current view |
| `gameEnded` | `{ winner, reason }` | |

`applyCommand` is the single write path:

```js
applyCommand(state, command, rng) → { state, events, pendingChoice, error? }
```

Pure and total: never throws, returns `error` for illegal commands, and never mutates its input.
Validation reuses `canPerformAction()` unchanged, plus referential checks (does `instanceId` exist,
is it in the claimed zone, does it belong to the acting player).

### View redaction

`viewFor(state, playerId)` is where hidden information stops being a UI convention:

| Zone | Owner sees | Opponent sees | Spectator sees |
|---|---|---|---|
| hand | full cards | `{ instanceId }[]` only | count |
| deck | count | count | count |
| prizes | `{ instanceId }[]`, faces only when revealed | same | same |
| active / bench / discard / lostZone / board / stadium | full | full | full |

Deck contents reach a player only inside a `PendingChoice` payload, and only for the search they are
entitled to. This closes ISSUES.txt item 10 ("can still look through deck with rules mode on") by
removing the data rather than hiding the button.

### Pending choices

```js
PendingChoice = { choiceId, player, prompt, source,
                  options: [{ instanceId, name, src }],
                  min, max, cancellable, resumeToken }
```

`resumeToken` carries `{ effectId, stepIndex }` from `planAbilitySteps()`. The executor runs steps
until one needs input, returns the choice, and the game blocks. Only the named player may resolve
it; every other command is rejected with `reason: 'waiting_for_choice'`. This serializes effect
resolution across both clients by construction.

### Randomness

One seeded `mulberry32` PRNG per game, seeded at creation and recorded. All shuffles, coin flips,
random discards, and prize assignment draw from it server-side. `(seed, commandLog)` replays a game
exactly — which becomes the regression-test mechanism and the debugging tool. The `rng` argument is
injectable so shadow mode can feed client-supplied values instead (see Rollout).

### Reconnection

Trivial: `requestView` returns the current view. There is no log to catch up, no gap to detect, no
snapshot negotiation. The reconnect path and the first-load path are the same code.

### Client changes

`applyView(view, events)` replaces the mutation layer:

1. Diff previous view against new by `instanceId`.
2. Play animations for `events` that have a matching element; skip silently otherwise.
3. Reconcile the DOM to the new view — create, move, remove, update counters.
4. Render `pendingChoice` as a picker; picking emits `resolveChoice`.

UI handlers stop mutating zone arrays and instead emit `cmd`. The rules engine stays imported
client-side only for *affordance hints* (grey out an illegal button before the round trip); the
server re-validates everything and the client's opinion is never authoritative.

## Edge cases & failure modes

| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Empty deck: draw with 0 cards | Command rejected `deck_empty`; deck-out loss checked at turn start per rules | [ ] |
| 2 | Malformed command (unknown `type`, missing `payload`) | `cmdRejected` `bad_command`; state untouched, `stateVersion` unchanged | [ ] |
| 3 | `instanceId` not in claimed zone (stale client view) | `cmdRejected` `stale_view`; server re-sends current view; client self-heals | [ ] |
| 4 | Same command sent twice (double-click, retry) | `clientSeq` dedupe per player; second is a no-op returning the same `stateVersion` | [ ] |
| 5 | Both players send a command in the same tick | Server applies in arrival order; the non-turn player's command fails `canPerformAction` | [ ] |
| 6 | Client disconnects mid-choice | Choice stays pending; game blocks; on `requestView` the choice is re-sent verbatim | [ ] |
| 7 | Server crash | In-memory game lost. v1: game over, both clients see `gameEnded` `server_restart`. Durable log deferred — see Migration | [ ] |
| 8 | `view` arrives out of order / duplicated | `stateVersion <= lastRendered` ignored; snapshot semantics make this safe | [ ] |
| 9 | Bench full (5) / max prizes / hand size 0 | Rejected with a specific reason; boundary tests at 0, 1, max, max+1 | [ ] |
| 10 | Attachment target removed by a prior command in the same effect | Executor re-resolves targets from live state each step; unresolvable step is skipped and announced | [ ] |
| 11 | Choice resolved by the wrong player | Rejected `not_your_choice`; no state change | [ ] |
| 12 | Choice `selection` violates `min`/`max` or contains ids not in `options` | Rejected `invalid_selection`; choice remains pending | [ ] |
| 13 | Spectator sends a command | Rejected `spectator_readonly` | [ ] |
| 14 | Third player joins a full room | Existing `roomReject` preserved | [ ] |
| 15 | Effect loops (recursive ability chains) | Step budget per command (e.g. 200); exceeding aborts the effect, logs, announces — no infinite server loop | [ ] |
| 16 | TCGdex `fetch` for card data fails/times out | Card DB preloaded and cached server-side at game start; a failed lookup degrades to decklist data, never blocks a command | [ ] |
| 17 | Legacy client connects to new server (or vice versa) | Protocol version in `joinGame`; mismatch → explicit "reload the page" message, not a silent desync | [ ] |
| 18 | Solo (single-player) mode | Runs the same engine in-process client-side; must not regress | [ ] |

## Test plan

- **Unit (node:test, no jsdom).** `applyCommand` per command type: legality, boundaries, rejection
  reasons. `viewFor` redaction — assert opponent hand/deck faces are *absent from the serialized
  payload*, not merely unrendered. RNG determinism: same seed → same sequence.
- **Property/replay.** `(seed, commandLog) → state` replayed twice yields an identical
  `hashState()`. Recorded real games become CI fixtures; this is the regression net that the current
  architecture cannot have.
- **Integration.** Scripted two-player games driven directly against the engine (no browser):
  full setup → mulligan → turn order → attack → KO → prize → win. Assert both player views agree on
  every public zone at every step.
- **E2E.** Extend `two-player-sync-test.mjs` (Playwright, already present) to drive two real browsers
  through a full game and assert converged boards plus zero `cmdRejected` of type `stale_view`.
- **Shadow-mode telemetry.** During rollout, server-vs-client hash mismatch rate per command type —
  the go/no-go signal for flipping the flag.
- **Manual.** Two browsers, one game, deliberately: reload mid-turn, background a tab for 60s,
  kill the network for 30s. Expect seamless recovery via `requestView`.

## Migration / rollout

Flag: `SERVER_AUTHORITATIVE` (env on server, echoed to the client in `joinGame`).

**Phase 1 — passive shadow (no client protocol change).** The server subscribes to the existing
`pushAction` / `requestAction` relay traffic and builds its own `GameState` from it, taking RNG from
the relayed values via the injectable `rng` source. It compares its state hash against the
`syncCheck` `boardHash` clients already emit, using the *same* `zone-hash.mjs` now shared by both
sides. Mismatches are logged with the offending command. This validates the port against real games
at zero user risk and with no client changes — the existing anti-desync telemetry becomes the
migration test harness.

**Phase 2 — dual-run.** New clients send `cmd` alongside legacy `pushAction`; the server applies
commands authoritatively but clients still render from their local simulation. Mismatch rate is
monitored per command type until it reaches ~0.

**Phase 3 — flip.** Client renders from `view`. Legacy relay events stay wired but unused.

**Phase 4 — delete.** Remove the reconciliation stack: `catch-up-actions.js`, `resync-actions.js`,
`sync-replay.mjs`, `request-board-snapshot.js`, `apply-board-snapshot.js`, `board-hash.js`, the
counter guards in `socket-event-listeners.js`, hint plumbing in `resolve-card-index.mjs`, and
`rules-local-effects.mjs` — roughly 2,000 lines of band-aid. `sync-logger` stays until Phase 4 is
proven, then goes.

**Revert path.** Phases 1–3 are flag-gated and revert by flipping `SERVER_AUTHORITATIVE=0`; no
persisted data changes shape, since live game state is in-memory only. Phase 4 is the point of no
return and happens only after Phase 3 has been stable in production.

**Data.** No migration. The SQLite export/import store keeps its current schema; the export writer
is repointed at the server view. Spectators become read-only `view` subscribers, which is simpler
than today's `spectatorActionData` designation dance.

**Deferred.** Durable game log for crash recovery (edge case 7), and optimistic animation. Both are
additive once authority is in one place.

## Work plan — slices ≤1 session, each leaving the repo green

| Slice | Delivers | Green when |
|---|---|---|
| 1 | `shared/` created and served; pure `rules/*.mjs` + `zones/*.mjs` moved there; client imports rewritten; `express.static('/shared')` | Existing 41 test files pass unchanged; app loads and plays in browser |
| 2 | Pure `Card`/`GameState`/`view.mjs`/`rng.mjs`; `hashState()`; no wiring | New unit tests for state, redaction, RNG determinism |
| 3 | `commands.mjs` vocabulary + `applyCommand` for moves, draws, attachments; server `GameRoom` skeleton behind flag | Command unit tests; legacy path untouched and still passing |
| 4 | Shadow mode (Phase 1): server ingests relay traffic, compares hashes, logs mismatches | Two-player E2E runs with shadow on; mismatch report produced |
| 5 | `applyCommand` for attack / retreat / pass / KO / prizes; deterministic setup, mulligan, turn order | Scripted integration game reaches a win condition server-side |
| 6 | `PendingChoice` protocol + resumable trainer/ability/stadium executors | Integration tests for search, discard-pick, switch effects |
| 7 | Client `applyView` renderer + `cmd` emitters; Phase 2 dual-run | Two browsers play a full game with flag on; boards converge |
| 8 | Phase 3 flip, then Phase 4 deletion pass | Full suite + lint + build green; E2E green; reconciliation stack gone |

Slices 1–4 are additive and reversible; the architecture is not committed until slice 7.

## Deviations (Builder appends here during build)
