# 001: Server-authoritative netcode

Status: approved
Date: 2026-09-07 · Session: S2

<!-- Per user instruction (S2), this design omits the template's Options section: it records only
     the chosen approach, not the alternatives weighed. Rejected alternatives are in the S1 chat
     transcript and PR #69 discussion if a future session needs to relitigate a pick. -->

## How to use this document

You are probably here to build one slice. Do not read this end to end.

| If you are… | Read |
|---|---|
| Building any slice | Glossary → Invariants → Hazards → your slice's procedure in Work plan |
| Building slice 1 | + Shared engine |
| Building slices 2–3 | + State model, Command vocabulary, Protocol |
| Building slice 4 | + Migration Phase 1 |
| Building slices 5–6 | + Pending choices, Randomness, Worked example B |
| Building slice 7 | + View redaction, Client changes, Worked example A |
| Reviewing a diff | Invariants, then the Edge case table |
| Deciding whether to reopen a choice | Decisions, then PR #69 for what was rejected |

Every slice ends by ticking the edge-case rows it covered (`[x] covered: <test name>`) and appending
anything you changed to `## Deviations`.

## Glossary

Terms are used precisely throughout. Misreading one produces wrong code.

| Term | Meaning |
|---|---|
| **Command** | A client's *request* to do something: `{ type, payload }`. Not yet a fact. May be rejected. |
| **Event** | A server statement that something *did* happen, e.g. `cardMoved`. **Advisory** — for animation only, never a source of state. |
| **View** | The authoritative, per-player, redacted picture of the game. The only thing a client renders from. |
| **`stateVersion`** | Monotonic counter on `GameState`, incremented once per successfully applied command. Clients discard any view whose version they've already passed. |
| **`instanceId`** | Server-minted integer identifying one physical card for the life of a game. Stable across zone moves. Replaces `syncInstance`. |
| **PendingChoice** | A suspended effect waiting on one player's input. While set, the game rejects all other commands. |
| **Authority** | The right to decide what is true. After this design, the server has all of it; the client has none. |
| **Shadow mode** | Phase 1 rollout: the server simulates alongside the clients and only *compares*, never corrects. |
| **`user` ('self'/'opp')** | Legacy client concept: point-of-view relative. See Hazard 1 — this is the single most dangerous term in the codebase. |
| **Sandbox / rules-off** | `rulesState.enabled === false`. Players may move anything anywhere. Must keep working; see Hazard 6. |

## Problem

Multiplayer runs two independent simulations of the same game and hopes they agree. They routinely
don't: 54 of the last 200 commits touch sync/desync/replay/RNG, spanning setup order, hand ordering,
index drift, and duplicated rules side effects — and each fix adds another reconciliation layer
rather than removing the cause. Desyncs are unfixable in this architecture because divergence is the
default state and detection is best-effort. Hidden information is also fully replicated to both
clients, so "the deck is private" is a UI convention, not a fact.

## Constraints

Pulled from code by reading it this session, not from memory. S1 bootstrapped PROJECT.md in
parallel with this work; S2 added the scale constraints there and corrected its jsdom claim.

- **No bundler.** `render.yaml` builds with `pnpm install --frozen-lockfile` and starts
  `node server/server.js`; `client/index.ejs:20` loads `src/front-end.js` as a native ES module and
  `server/server.js:183` serves `client/` statically. Shared code must be loadable by both the
  browser (via URL) and Node (via fs path) with no build step and no bare specifiers.
- **Single Node process, free tier.** One `web` service in `render.yaml`; no Redis, no horizontal
  scaling. Game state lives in process memory.
- **Small scale, mostly private use.** A handful of concurrent games at most, players known to each
  other. Losing in-progress games on a server restart is acceptable (confirmed S2). This is a
  standing licence to prefer the simple mechanism: no durable game log, no clustering, no auth,
  no rate limiting, no anti-cheat hardening. View redaction is kept because it fixes a real
  gameplay bug, not because an adversary is assumed.
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
59-entry table in `client/src/setup/general/accept-action.js:71` onto its **mirror** copy of the
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
`rules-bridge.js:507`, `rules-bridge.js:846-851`. (3) Choice points resolve in UI callbacks, so the
two clients resolve them at different times and in different orders. (4) Recovery paths
(`fullReplay`, snapshot) can themselves diverge. (5) Silently dropped actions on counter mismatch
(`socket-event-listeners.js:274`) leave both sides "in sync" with a move missing.

### Hazards — read before touching anything

These are the traps that will cost you a day each if you meet them by surprise.

**H1 · `'self'` and `'opp'` are point-of-view, not identity.** Throughout the client, `user` is
relative to whoever is looking. The *same* physical player is `'self'` on their own screen and
`'opp'` on the other. `systemState.initiator` is worse still — it's derived from a CSS class
(`global-variables.js:44`, `selfContainer.classList.contains('self')`), so it reflects which half of
the *screen* a mat is drawn on. None of this can cross the wire to a server.

> **Rule:** `GameState` uses absolute `playerId` only. Convert at the boundary and nowhere else.
> Inbound: `playerId = socketToPlayer[socket.id]`. Outbound: `viewFor()` emits
> `{ you, them }`, and the renderer maps those onto its local `self`/`opp` containers.
> If you find yourself writing `'self'` inside `shared/engine/`, you have made a mistake.

**H2 · Card identity is currently a DOM node.** `Card.image` is an `HTMLImageElement`, and the
attachment graph hangs off it (`image.relative` → parent element, `image.attached`). Counters live
only on the DOM too — `zone-hash.mjs:1-12` documents that damage, special condition, and
ability-used were invisible to hashing precisely because they were DOM-only. The pure model must
carry `damage`, `specialCondition`, `abilityUsed`, and `attachedTo` as real fields.

**H3 · The `emit` flag is a re-entrancy guard, not a networking detail.** `acceptAction` sets
`emit = user === 'self' || isStateImport` (`accept-action.js:164`). It exists to stop a relayed
action from being relayed back. On the server this concept disappears entirely — do not port it.
Its presence in ported code is a smell that you copied a client control-flow assumption.

**H4 · `attachedCards` and `viewCards` are not game zones.** `get-zone.js:6-30` lists ten zones per
player, but `SYNC_HASH_ZONES` (`zone-hash.mjs:56`) has only eight — `attachedCards` and `viewCards`
are excluded because they are UI scratch buffers (the attached-card popup and the deck-search
window). They are **not** part of `GameState`. Their replacement is `PendingChoice.options` plus
client-local rendering. Putting them in `GameState` will produce phantom cards.

**H5 · `stadium` is neutral, not owned.** `get-zone.js:32` keeps it in `neutralZoneArrays`, outside
both players. Model it as a single top-level `state.stadium`, not per-player.

**H6 · Rules mode is a toggle, and sandbox must survive.** `rulesState.enabled` can be `false`
(`rules-state.mjs:598` returns `{ allowed: true }` immediately). This is a *tabletop simulator* —
people drag cards around freely and fix mistakes by hand. Server authority must not become server
*rules-enforcement* when the user asked for sandbox. Validation is two-layer:

> **Always enforced** (both modes): the card exists, it is where the command claims, it belongs to
> the acting player, the game is not waiting on someone else's choice.
> **Enforced only when `rulesState.enabled`**: turn order, legality, costs, once-per-turn limits.

Manual counter and status commands stay in the vocabulary for the same reason.

**H7 · Two "pure" modules touch browser globals.** `rules-state.mjs` calls `localStorage`
(lines 740, 745) and `fetch` (line 139). Node 18+ has `fetch`, but `localStorage` will throw on
import in Node. Slice 1 must guard these before the server can import the module — see the slice 1
procedure.

## Design

### Decisions

Each line becomes a DECISIONS.md entry at close.

| # | Decision | Why |
|---|---|---|
| 1 | The server simulates; clients render and hold no game state | Divergence becomes structurally impossible — the client has no state to diverge *with* |
| 2 | No client prediction or rollback | Turn-based game; a 50–200 ms round trip per click is imperceptible, so exactly one simulation exists in the system |
| 3 | Shared engine lives in `shared/`, served at `/shared` | Loads under both the browser and Node loaders with no build step, no bare specifiers, no new dependency |
| 4 | Server sends a full redacted view snapshot per update | Idempotent and order-independent: drop, duplicate, or reorder messages and the client still converges |
| 5 | Events are advisory, for animation only | The client never derives state from events, so missing or late events degrade to a snap, never to a desync |
| 6 | Effect choices suspend server-side as a `PendingChoice` | Serializes choice resolution across both clients by construction; `planAbilitySteps()` supplies the resume point |
| 7 | Card identity is a server-minted `instanceId` | Both clients receive the same ids by construction, retiring `syncInstance` and the hint machinery built to compensate for it |
| 8 | One seeded PRNG per game, server-side, recorded | `(seed, commandLog)` replays a game exactly — the regression net this architecture currently cannot have |
| 9 | Game state is in-memory only; a restart ends live games | Accepted by the user at this scale; buys us no persistence layer, no crash-recovery path, no rehydration bugs |
| 10 | No optimistic animation in v1 — an in-flight affordance instead | One round trip is imperceptible on a private server; a pending style on the card communicates responsiveness for a fraction of the complexity |

### Invariants — a diff that breaks one of these is wrong

1. **The client never mutates game state.** After slice 7, no client file writes to a zone array.
2. **Every write goes through `applyCommand`.** No other function mutates `GameState`.
3. **`applyCommand` is pure and total.** No `throw`, no I/O, no `Date.now()`, no `Math.random()`.
   It returns a *new* state and never mutates its input.
4. **Events carry no authority.** Deleting the entire `events` array from a payload must leave the
   client correct, only less animated. This is testable — do it in a test.
5. **`viewFor` leaks nothing.** Assert on the *serialized* payload, not on what the UI renders.
6. **All randomness comes from the injected `rng`.** `Math.random` is banned in `shared/engine/`.
7. **`stateVersion` only increases, and only on successful application.** Rejections do not bump it.
8. **`shared/engine/` imports nothing from `client/` or `server/`,** and references no DOM global.

Invariants 6 and 8 are cheap to enforce mechanically; slice 2 adds a test that greps `shared/engine/`
for `document.`, `window.`, `localStorage`, `Math.random`, and `from '../../client`. Do that rather
than trusting review.

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

Shared modules import each other with **relative** paths, which resolve correctly under both
loaders. Only the entry points differ: the browser uses a root-absolute URL (`/shared/...`), Node
uses a filesystem-relative path (`../shared/...`). Dependency direction is `client → shared` and
`server → shared`, never `server → client`.

### State model

```js
GameState = {
  gameId, stateVersion,              // stateVersion increments on every applied command
  seed, rngCursor,                   // deterministic replay: (seed, commandLog) → state
  rulesEnabled,                      // false = sandbox; see H6
  players: { [playerId]: {           // playerId is absolute — never 'self'/'opp' (H1)
    username, deckList,
    zones: { deck:[], hand:[], prizes:[], active:[], bench:[], discard:[], lostZone:[], board:[] },
    flags: { ... }                   // from rulesState.flags
  }},
  stadium: Card | null,              // neutral, not per-player (H5)
  turn: { player, number, phase },   // phase: 'setup' | 'main' | 'attack' | 'ended'
  pendingChoice: PendingChoice | null,
  commandLog: Command[],
}

Card = { instanceId, name, set, number, id, src, type,
         damage, specialCondition, abilityUsed, attachedTo }  // attachedTo = instanceId | null
```

The eight zones are exactly `SYNC_HASH_ZONES` minus `stadium` (which is top-level). `attachedCards`
and `viewCards` are deliberately absent — see H4.

Attachment is a parent `instanceId` on the child, replacing the `image.relative` pointer graph. A
Pokémon's attached energy and tools are found by scanning for `attachedTo === thatInstanceId`; they
live in the same zone array as their parent so that moving a zone moves the stack.

### Command vocabulary

The 59 legacy dispatch entries in `accept-action.js:71` are the starting vocabulary. They do not
map one-to-one; slice 3 must place each one. Dispositions:

| Disposition | Legacy actions | Notes |
|---|---|---|
| **Server command** — gameplay, validated, changes state | `moveCardBundle`, `draw`, `attack`, `pass`, `retreat`, `takeTurn`, `useAbility`, `stadium-effect`, `VSTARGXFunction`, `takePrizes`, `takePrizesByIndex`, `shufflePrizesToDeckBottom`, `shuffleZone`, `shuffleIntoDeck`, `moveToDeckTop`, `switchWithDeckTop`, `shuffleAll`, `shuffleBottom`, `discardAll`, `lostZoneAll`, `handAll`, `leaveAll`, `discardAndDraw`, `shuffleAndDraw`, `shuffleBottomAndDraw`, `discardBoard`, `handBoard`, `shuffleBoard`, `lostZoneBoard`, `playRandomCardFaceDown` | `moveCardBundle` is the workhorse; port it first |
| **Server command — manual override** | `addDamageCounter`, `updateDamageCounter`, `removeDamageCounter`, `addSpecialCondition`, `updateSpecialCondition`, `removeSpecialCondition`, `removeAbilityCounter`, `changeType`, `rotateCard` | Kept as commands, not derived, because sandbox play needs hand-fixing (H6). Rules mode may additionally set them as effect consequences |
| **Server lifecycle** | `setup`, `setupPrizes`, `drawOpeningHand`, `readyUp`, `reset`, `restartGame` | Become server-driven sequences; the client sends only `readyUp`. Kills the setup-race bug class outright |
| **Replaced by the protocol** | `exchangeData`, `loadDeckData` | Decks register server-side at join; the server mints `instanceId`s and never ships the opponent's list |
| **Replaced by redaction** | `viewDeck`, `revealCards`, `hideCards`, `revealShortcut`, `hideShortcut`, `lookShortcut`, `stopLookingShortcut` | Visibility becomes a server-owned `revealed` flag per card in the view. `viewDeck` disappears — the data is not sent (closes ISSUES.txt 10) |
| **Announcement only** | `lookAtCards`, `stopLookingAtCards` | Emit a chat event ("opponent is looking at their discard"); no state change |
| **Client-local, never sent** | `changeCardBack`, `changePlaymat` | Pure cosmetics, per-client preference |
| **Needs a decision in slice 3** | `undo` | Server authority makes real undo *easier*: rewind by replaying `commandLog` minus the tail against the recorded `seed`. Cheap and correct, but out of the critical path — decide then, don't block on it |

Command envelope:

```js
Command = {
  type: string,          // from the vocabulary above
  payload: object,       // named fields — NOT the legacy positional array
  clientSeq: number,     // per-player, monotonic; used for dedupe (edge case 4)
}
```

Use named payload fields. The legacy positional `parameters` array is the direct cause of the
argument-order bugs that `sync-action-args.mjs` exists to paper over; do not carry it forward.

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

Validation order inside `applyCommand` — cheapest and most certain first:

1. **Shape.** Known `type`, payload matches schema. Fail → `bad_command`.
2. **Turn gate.** Is a `pendingChoice` outstanding, and is this player the one it's waiting on?
   Fail → `waiting_for_choice`.
3. **Reference.** Every `instanceId` exists, sits in the zone the payload claims, and belongs to the
   acting player. Fail → `stale_view`. This is the check that makes a stale client self-heal.
4. **Legality.** `canPerformAction()` — **skipped when `rulesEnabled === false`** (H6).
   Fail → the reason string it returns.
5. **Apply.** Mutate a draft, emit events, bump `stateVersion`, append to `commandLog`.

### View redaction

`viewFor(state, playerId)` is where hidden information stops being a UI convention:

| Zone | Owner sees | Opponent sees | Spectator sees |
|---|---|---|---|
| hand | full cards | `{ instanceId }[]` only | count |
| deck | count | count | count |
| prizes | `{ instanceId }[]`, faces only when revealed | same | same |
| active / bench / discard / lostZone / board / stadium | full | full | full |

Opponent-hand entries keep their `instanceId` but carry no `name`/`src`, so the renderer can still
animate a specific card back from hand to bench without knowing what it is.

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
it; every other command is rejected with `reason: 'waiting_for_choice'`.

The executor loop, in shape:

```
runEffect(state, effectId, fromStep, rng):
  plan = planAbilitySteps(parsedSteps)        // already exists, already pure
  for i = fromStep .. plan.length-1:
    step = plan[i]
    if step needs input:
      return { state, pendingChoice: { …, resumeToken: { effectId, stepIndex: i } } }
    state = applyStep(state, step, rng)       // re-resolve targets from live state (edge case 10)
  return { state, pendingChoice: null }
```

`resolveChoice` validates the selection against `options`/`min`/`max`, records it, and re-enters
`runEffect` at `resumeToken.stepIndex`. Because the loop is re-entrant and targets are re-resolved
each step, a card removed by an earlier step cannot produce a dangling reference.

### Randomness

One seeded `mulberry32` PRNG per game, seeded at creation and recorded. All shuffles, coin flips,
random discards, and prize assignment draw from it server-side. The `rng` argument is injectable so
shadow mode can feed client-supplied values instead (see Migration).

```js
createRng(seed) → { next(): float, int(n): int, shuffle(array): array, cursor: int }
```

`rngCursor` is stored on `GameState` so a replay from `(seed, commandLog)` consumes the identical
sequence. Never call the PRNG outside `applyCommand` — an out-of-band call desynchronises the
cursor and silently breaks replay.

### Reconnection

`requestView` returns the current view. There is no log to catch up, no gap to detect, no snapshot
negotiation. The reconnect path and the first-load path are the same code.

### Client changes

`applyView(view, events)` replaces the mutation layer:

1. Diff previous view against new by `instanceId`.
2. Play animations for `events` that have a matching element; skip silently otherwise.
3. Reconcile the DOM to the new view — create, move, remove, update counters.
4. Render `pendingChoice` as a picker; picking emits `resolveChoice`.

UI handlers stop mutating zone arrays and instead emit `cmd`. The rules engine stays imported
client-side only for *affordance hints* (grey out an illegal button before the round trip); the
server re-validates everything and the client's opinion is never authoritative.

**In-flight affordance.** The instant a command is emitted, the originating element gets a
`.cmd-pending` class (subtle lift and reduced opacity) and input on it is ignored. The class clears
when the next `view` lands or `cmdRejected` arrives. The card does not move until the server says
where it went, so there is no speculative position to reconcile and no snap-back. This is the whole
of the responsiveness story in v1; see Deferred for the case that would justify more.

### Worked example A — play a Basic Pokémon from hand to bench

The simple path, end to end. Player A (`playerId: "p1"`) drags Pikipek (`instanceId: 42`).

1. **Client A** — drop handler stops calling `moveCardBundle`. It emits:
   ```js
   socket.emit('cmd', { gameId, clientSeq: 17, type: 'moveCard',
                        payload: { instanceId: 42, from: 'hand', to: 'bench' } });
   ```
   and adds `.cmd-pending` to the card element.
2. **Server** — `GameRoom` resolves `socket.id → "p1"` (H1), then calls
   `applyCommand(state, cmd, rng)`.
3. **Validate** — shape ok; no `pendingChoice`; card 42 exists in `p1.zones.hand`; `canPerformAction({ action: 'moveCard', … })` allows it because it is p1's turn and Basics may be benched.
4. **Apply** — splice 42 out of `hand`, push into `bench`, `stateVersion: 88 → 89`, append to
   `commandLog`, emit `events: [{ type: 'cardMoved', instanceId: 42, from: 'hand', to: 'bench' }]`.
5. **Broadcast** — the room sends *two different payloads*:
   - to **A**: `view.you.bench` includes the full Pikipek; `view.you.hand` is one shorter.
   - to **B**: `view.them.bench` includes the full Pikipek (bench is public); `view.them.hand` lost
     one anonymous `{ instanceId }` entry.
6. **Render** — both clients run `applyView`. Each sees card 42 move between zones, finds its
   existing element in the `instanceId → element` map, and animates it. Client A clears
   `.cmd-pending`.

If B's socket dropped at step 5, B reconnects, sends `requestView`, and receives the same
`stateVersion: 89` view. No catch-up, no replay, no hash comparison.

### Worked example B — Ultra Ball, the hard path

Ultra Ball is the canonical multi-choice effect: *discard 2 cards from your hand, then search your
deck for a Pokémon, reveal it, put it into your hand, then shuffle.* Three interaction points and a
shuffle, all of which desync today.

1. **A** emits `cmd { type: 'playTrainer', payload: { instanceId: 7 } }`.
2. **Server** validates, moves card 7 to discard, parses the effect with `parseTrainerEffect()`
   (pure, already exists), plans it, and enters `runEffect` at step 0.
3. **Step 0 needs input.** Server returns:
   ```js
   pendingChoice: { choiceId: 'c1', player: 'p1', prompt: 'Discard 2 cards',
                    options: [ …p1's hand… ], min: 2, max: 2, cancellable: false,
                    resumeToken: { effectId: 'e9', stepIndex: 0 } }
   ```
   The view goes to both players. **B receives the choice too** — but with `player: 'p1'`, so B's
   client renders "Opponent is discarding 2 cards" rather than a picker. B's commands are now
   rejected with `waiting_for_choice`. This is the serialization that today's UI pickers lack.
4. **A** emits `resolveChoice { choiceId: 'c1', selection: [15, 23] }`. Server validates the
   selection is exactly 2 and both ids are in `options`, discards them, re-enters at step 1.
5. **Step 1 needs input** — the deck search. Server sends a choice whose `options` are p1's **deck
   contents filtered to Pokémon**. This is the only moment deck data crosses the wire, it goes to
   p1 only, and it is scoped to what the card entitles them to. B's view still shows `deck: count`.
6. **A** picks card 31. Server moves it to hand and emits a `revealed` event so B learns the
   identity — because Ultra Ball says *reveal it*, and the server decides what is revealed.
7. **Step 2 is the shuffle** — no input needed. Server calls `rng.shuffle(p1.zones.deck)`,
   advancing `rngCursor`. There is exactly one shuffle, on one machine, so there is nothing to
   relay and nothing to disagree about.
8. `pendingChoice` clears, `stateVersion` bumps, both clients render.

Compare with today: two clients each parse the card, each open pickers, each shuffle, and then try
to agree afterwards via relayed indices.

## Edge cases & failure modes — the completeness contract; Builder ticks every row

| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Empty deck: draw with 0 cards | Command rejected `deck_empty`; deck-out loss checked at turn start per rules | [x] covered: shared/engine/__tests__/reduce.test.mjs |
| 2 | Malformed command (unknown `type`, missing `payload`) | `cmdRejected` `bad_command`; state untouched, `stateVersion` unchanged | [x] covered: shared/engine/__tests__/commands.test.mjs, reduce.test.mjs |
| 3 | `instanceId` not in claimed zone (stale client view) | `cmdRejected` `stale_view`; server re-sends current view; client self-heals | [x] covered: shared/engine/__tests__/reduce.test.mjs |
| 4 | Same command sent twice (double-click, retry) | `clientSeq` dedupe per player; second is a no-op returning the same `stateVersion` | [x] covered: server/game/__tests__/room.test.mjs |
| 5 | Both players send a command in the same tick | Server applies in arrival order; the non-turn player's command fails `canPerformAction` | [ ] |
| 6 | Client disconnects mid-choice | Choice stays pending; game blocks; on `requestView` the choice is re-sent verbatim | [ ] |
| 7 | Server crash / restart | In-memory game lost by design (decision 9). Both clients get `gameEnded` `server_restart` and return to the room screen cleanly — no half-dead board, no silent hang | [ ] |
| 8 | `view` arrives out of order / duplicated | `stateVersion <= lastRendered` ignored; snapshot semantics make this safe | [ ] |
| 9 | Bench full (5) / max prizes / hand size 0 | Rejected with a specific reason; boundary tests at 0, 1, max, max+1 | [x] covered: shared/engine/__tests__/reduce.test.mjs (bench full) |
| 10 | Attachment target removed by a prior command in the same effect | Executor re-resolves targets from live state each step; unresolvable step is skipped and announced | [ ] |
| 11 | Choice resolved by the wrong player | Rejected `not_your_choice`; no state change | [ ] |
| 12 | Choice `selection` violates `min`/`max` or contains ids not in `options` | Rejected `invalid_selection`; choice remains pending | [ ] |
| 13 | Spectator sends a command | Rejected `spectator_readonly` | [x] covered: server/game/__tests__/room.test.mjs |
| 14 | Third player joins a full room | Existing `roomReject` preserved | [ ] |
| 15 | Effect loops (recursive ability chains) | Step budget per command (e.g. 200); exceeding aborts the effect, logs, announces — no infinite server loop | [ ] |
| 16 | TCGdex `fetch` for card data fails/times out | Card DB preloaded and cached server-side at game start; a failed lookup degrades to decklist data, never blocks a command | [ ] |
| 17 | Legacy client connects to new server (or vice versa) | Protocol version in `joinGame`; mismatch → explicit "reload the page" message, not a silent desync | [ ] |
| 18 | Solo (single-player) mode | Runs the same engine in-process client-side; must not regress | [ ] |
| 19 | Sandbox mode (`rulesEnabled === false`) | Reference checks still enforced, legality skipped; free movement works and both clients stay identical (H6) | [x] covered: shared/engine/__tests__/reduce.test.mjs |
| 20 | Duplicate card names in one zone | `instanceId` disambiguates; no name-based lookup anywhere in the engine (H2) | [x] covered: shared/engine/__tests__/state.test.mjs |

## Test plan

- **Unit (node:test, no jsdom).** `applyCommand` per command type: legality, boundaries, rejection
  reasons. `viewFor` redaction — assert opponent hand/deck faces are *absent from the serialized
  payload*, not merely unrendered. RNG determinism: same seed → same sequence.
- **Invariant guards.** A test that greps `shared/engine/` for DOM globals, `Math.random`, and
  imports from `client/`. A test that strips `events` from every payload in an integration run and
  asserts the final state still matches (proves invariant 4).
- **Property/replay.** `(seed, commandLog) → state` replayed twice yields an identical
  `hashState()`. Recorded real games become CI fixtures.
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

**Out of scope.** Durable game log, crash recovery, clustering, auth, rate limiting, anti-cheat
hardening — all ruled out by the scale constraint. Do not add them back without a new decision.

**Deferred, with a trigger.** Optimistic animation — moving the card locally the moment you release
it, while the command is in flight, then reconciling against the authoritative view. It only becomes
worth its complexity (double-animation, snap-back on rejection, animations racing an inbound view)
if the in-flight affordance measurably feels sluggish in real play. The trigger is a measured
command→view round trip consistently above ~150 ms between the actual players. Below that, don't
build it. Note it is purely visual either way: it never touches client state, so it stays compatible
with decision 1.

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

### Slice 1 — procedure

Pure file movement plus one server line. **No behavior change.** If any test output differs, you
have done more than the slice asks.

1. `mkdir -p shared/engine/{rules,zones}`.
2. `git mv client/src/setup/rules/*.mjs shared/engine/rules/` — all 26 move. The three `.js` files
   (`rules-bridge.js`, `trainer-execution.js`, `mat-coin.js`) **stay**; they are DOM glue.
3. `git mv client/src/setup/zones/*.mjs shared/engine/zones/` — six move. `get-zone.js` and
   `board-hash.js` **stay**; both need the DOM.
4. `git mv` the corresponding `__tests__` directories alongside their modules.
5. **Fix H7 before anything imports these in Node.** In `rules-state.mjs`, wrap the `localStorage`
   calls (lines ~740, ~745) in `typeof localStorage !== 'undefined'`, and confirm the `fetch` at
   line ~139 is only reached lazily, not at import time. Node 18+ provides `fetch`; `localStorage`
   it does not.
6. Rewrite import specifiers. Inside `shared/`, relative imports between moved files are unchanged —
   they moved together. Only *client* files that referenced the moved modules need editing, to
   `/shared/engine/rules/<x>.mjs`. Find them with
   `grep -rn "setup/rules/.*\.mjs\|setup/zones/.*\.mjs" client/src`.
7. Update the test paths in `package.json`'s `test` script to the new locations.
8. In `server/server.js`, beside the existing static mount (line ~183):
   `app.use('/shared', express.static(path.join(__dirname, '../shared')));`
9. **Verify:** `pnpm test` → 797 passing, unchanged. Then load the app, open devtools Network, and
   confirm `/shared/engine/rules/*.mjs` return 200 with a JavaScript MIME type. Play one solo game
   and one two-player game; both must behave exactly as before.

Trap: the browser resolves `/shared/...` from the origin root, so this breaks if the app is ever
served from a sub-path. It isn't today; note it if that changes.

### Slice 2 — procedure

Pure data modelling, wired to nothing. Everything here is unit-testable with no server and no DOM.

1. `cards.mjs` — the pure `Card` factory and `mintInstanceId(state)`. No `image` field. Include
   `damage`, `specialCondition`, `abilityUsed`, `attachedTo` as first-class (H2).
2. `state.mjs` — `createGameState({ gameId, seed, players, rulesEnabled })`, zone accessors, and
   `hashState()` built on the existing `hashBoardSnapshot()` from `zones/zone-hash.mjs`.
   Eight zones per player, `stadium` top-level (H4, H5).
3. `rng.mjs` — `createRng(seed)` with `next`, `int`, `shuffle`, and an exposed `cursor`.
4. `view.mjs` — `viewFor(state, playerId)` per the redaction table, returning `{ you, them, … }`
   with absolute ids mapped to those two labels (H1).
5. Add the invariant-guard test described under Invariants.
6. **Verify:** new unit tests only; the existing 797 must be untouched. Redaction tests must assert
   against `JSON.stringify(view)`, not against object access.

### Slice 3 — procedure

1. `commands.mjs` — the schema table: for each `type`, its payload fields and their types. Start
   with `moveCard`, `draw`, `attachCard`, and the manual counter commands. Named fields only.
2. `reduce.mjs` — `applyCommand` with the five-step validation order above. Implement it as
   validate-then-apply against a cloned draft so invariant 3 (no input mutation) holds trivially.
3. `server/game/room.mjs` — `GameRoom` holding one `GameState`, the `socket.id → playerId` map
   (H1), and `clientSeq` dedupe per player. Constructed only when `SERVER_AUTHORITATIVE` is set,
   so the legacy path is bit-for-bit unaffected.
4. Place every one of the 59 legacy actions into the disposition table; decide `undo` here.
5. **Verify:** unit tests per command including every rejection reason. Run the full legacy suite
   and a real two-player game with the flag **off** to prove nothing moved.

### Slice 4 — procedure

The cheap validation step. Do not skip it: it is what tells you the port is right before anyone
depends on it.

1. In the relay handlers, when shadow mode is on, feed each observed `pushAction`/`requestAction`
   into a `GameRoom` for that room, translating the legacy positional `parameters` into command
   payloads.
2. Configure the `rng` source to *consume* relayed values (shuffle indices, coin faces) rather than
   generate — the clients are still the source of randomness in this phase.
3. On each `syncCheck`, compare the client's `boardHash` against `hashState()` for the same player.
   Log mismatches with the command that preceded them, to a file under `server/`.
4. **Verify:** play several full games with shadow on. Produce a mismatch report grouped by command
   type. Every mismatch is either a port bug (fix it) or a known client bug (record it in
   ISSUES.md). Do not start slice 5 while structural mismatches remain.

### Slices 5–8 — sequencing notes

- **5** is mostly transcription from `chat-buttons.js`, but leave the UI pickers behind: any step
  needing input becomes a `PendingChoice` stub returning `not_implemented` until slice 6.
- **6** is the hardest slice and the one to split if it overruns — trainers first, then abilities,
  then stadiums, each independently green.
- **7** is where the client stops simulating. Build `applyView` against recorded views from slice 5's
  integration tests before wiring real sockets; it is far easier to debug a renderer with fixed input.
- **8** deletes. Follow feature.md phase 6: anything that cannot be removed cleanly becomes its own
  ISSUES.md line rather than being left in place silently.

## Deviations (Builder appends here during build)

- **Slice 1**: Moved `client/src/setup/shared/legacy-set-ids.mjs` and its test to `shared/engine/rules/legacy-set-ids.mjs`. `rules-state.mjs` was importing this table via `../shared/legacy-set-ids.mjs`; relocating it into `shared/engine/rules/` ensures `shared/engine/` maintains zero imports from `client/`, upholding Invariant 8.
- **Slice 2**: Replaced legacy `rng = Math.random` default parameter in `shared/engine/rules/status.mjs` with deterministic `() => 0.5` fallback, ensuring Invariant 6 (no `Math.random` in `shared/engine/`) is strictly enforced mechanically without regressions to existing callers.
- **Slice 3**: Defined `undo` architectural disposition as deterministic rewind via replaying `commandLog` minus tail from initial `seed`. Full catalog of all 59 legacy actions exported in `shared/engine/commands.mjs:DISPOSITION_TABLE`.
