# 003: Authoritative interaction routing — stop dual-executing moves
Status: approved (user delegated the call, S55) — building
Date: 2026-09-09 · Session: S54
Supersedes nothing. Extends `002-netcode-repair.md` — discovered while scoping that design's
open interactive-parity gap (STATE watch-out, 3.6-3.10 deviation notes) ahead of slice 3.12.

## Problem

Design 002 chose O4-A (full authoritative rendering, D11): the client should render only from
server views; legacy DOM mutation should be deleted, not extended. But investigating the STATE
watch-out ("dragging/editing an authoritative card is not yet functional") this session found the
real mechanism is worse than "not yet functional" — it is **actively dual-executing** for every
card, legacy or authoritative, whenever `SERVER_AUTHORITATIVE` is on:

`client/src/setup/image-logic/drag.js`'s `drop()` (wired on zone elements,
`client/src/initialization/document-event-listeners/table/zones.js:10`) calls
`moveCardBundle()` (`client/src/actions/move-card-bundle/move-card-bundle.js:309` from `drop()`,
called directly — no dual-run-bridge in between). `moveCardBundle` (line 196) calls `moveCard()`
**first and unconditionally** — the full legacy engine: local `rulesState.enabled` gating
(`canPerformAction`/`canEvolve`), direct DOM mutation, `document.dispatchEvent` into the
2291-line `rules-bridge.js`. Only *after* `moveCard` returns does `moveCardBundle` call
`processAction` (line 227), which — only then, only if `systemState.serverAuthoritative` —
translates the same action to a command and emits it to the server
(`process-action.js:39-59`).

So today, with the flag on, every card move runs **both** engines: the legacy client simulation
completes and mutates the DOM/rules-bridge state, and *separately* a command is sent to the
server, which computes its own result and sends back a view that `apply-view.js` reconciles into
the same DOM. This is exactly the "two simulations, no arbiter" problem (I6) design 002 exists to
close — currently still open, and not limited to the zone-array gap the STATE watch-out named.

`shared/engine/commands.mjs`'s `DISPOSITION_TABLE` marks ~30 actions `server_command`
(`moveCard`, `attack`, `retreat`, `useAbility`, `takeTurn`, all zone/prize/board ops, etc.) — every
one of them is a legacy action function that, per the same pattern verified for `moveCardBundle`,
almost certainly runs its own local mutation body before any command is sent (each slice must
verify its own family; only `moveCardBundle`'s chain is read this session). `manual_override`
actions (damage counter, special condition, rotate, type change) are a different, intentionally
client-decided category — out of scope here; the server does not adjudicate them.

## Constraints (inherited from 002, still binding)

- `pushAction` must keep relaying (server's own deck bootstrap is fed from it,
  `server/server.js:658-674`) — this design gates **local legacy mutation**, not the
  `pushAction` socket emit, which stays unconditional exactly as 002 required.
- `shared/engine/` stays DOM-free; this design touches only `client/src/actions/**` call sites,
  never `shared/engine/**` (Invariants 6, 8).
- Every behavior change ships with a test that fails without it.
- One `feature/netcode-repair-<slice>` branch per CLAUDE.md token/model policy — same increment
  discipline as 002; this design's slices continue that ledger in `NEXTSTEPS.md`.

## Current state (verified this session)

| File | Role |
|---|---|
| `client/src/setup/image-logic/drag.js` | `dragStart`/`dragOver`/`dragLeave`/`dragEnd` (wired via `CARD_IMAGE_LISTENERS` on every card image, legacy and authoritative alike since 002 slice 3.6) and `drop` (wired separately on zone elements) |
| `client/src/initialization/document-event-listeners/table/zones.js` | attaches `drop`/`dragover`/`dragleave` to each zone DOM element — the same legacy iframe zone elements the authoritative renderer places cards into (`get-zone.js`) |
| `client/src/actions/move-card-bundle/move-card-bundle.js` | `moveCardBundle()`: calls `moveCard()` unconditionally (line 196), then `processAction()` (line 227) — the only gate on cmd emission is inside `processAction`, **after** local mutation already happened |
| `client/src/actions/move-card-bundle/move-card.js` | `moveCard()`: ~350-line legacy engine body — local rules gating, DOM mutation, `rules-bridge.js` event dispatch. Confirmed unconditional; no `serverAuthoritative` check anywhere in the file |
| `client/src/setup/general/process-action.js` | `processAction()`: unconditional `pushAction` emit (line 34, required by 002's constraint); cmd translation/emit gated on `systemState.serverAuthoritative` (line 39) — this part already correct |
| `client/src/setup/zones/get-zone.js` | `selfZoneArrays`/`oppZoneArrays` — never populated from server views (the originally-scoped gap); moot for any action this design routes around `moveCard`, since those never read the array |
| `shared/engine/commands.mjs` | `DISPOSITION_TABLE`: ~30 `server_command` actions, each a candidate for the same dual-execution bug; only `moveCardBundle`'s chain traced this session |

## Options

### O1 — Where to gate local legacy execution

| | Option | Tradeoff |
|---|---|---|
| A | Gate inside `processAction` (add a "should I have even run the caller's local mutation" flag) | Too late — by the time `processAction` runs, `moveCard`/equivalent has already mutated DOM and dispatched rules-bridge events. Cannot un-run them. Rejected. |
| B | **Gate at each action's own entry point** (`moveCardBundle`, and the ~30 `server_command` action functions): under `systemState.serverAuthoritative`, skip the local legacy body entirely, resolve hints, call `processAction` directly | Correct point — no local mutation ever happens for a command the server will authoritatively resolve anyway. Matches O4-A's own stated end state ("client renders only from views"). Touches every `server_command` call site, but each is independently small and testable, matching how 002 §3.4 already split translation work by family. |
| C | Delete `moveCard`/legacy action bodies outright now that O4-A is ruled | Correct end state eventually, but premature: legacy (flag-off) mode is still the production path and must keep working exactly as today until 3.12's flip gate passes. Rejected for this design; tracked as the eventual cleanup once 3.12 ships (see Migration/rollout). |

**Picked: B.** Same reasoning as D10 in 002: identity/authority should have exactly one owner at
the point of decision, not be corrected after the fact.

### O2 — How a gated action gets the data it needs to build a command, without reading legacy `zoneArrays`

| | Option | Tradeoff |
|---|---|---|
| A | Populate `zoneArrays` from views after all (the originally-scoped 3.10b) so gated actions can still call the existing `buildMoveCardHints`-style helpers unchanged | Reintroduces every staleness question this session already surfaced (type2, enteredPlayTurn, shim field drift) for no benefit — those helpers exist to build hints for *legacy* mutation, which B removes the need for. |
| B | **Build hints directly from `apply-view.js`'s own `cardRegistry`** (already the authoritative source of truth for on-screen cards, keyed by `instanceId` — no translation needed since it's already server-shaped) | No new staleness surface: `cardRegistry` is rebuilt fresh from every view. Requires a small new export from `apply-view.js` (`getCardRegistry()` already exists, line 117) and a thin hint-builder specific to the gated path, separate from `buildMoveCardHints` (which stays as-is for legacy mode). |

**Picked: B.** Avoids resurrecting the zoneArrays staleness problem; reuses what already exists.

## Design

For each `server_command`-disposition action family (grouped exactly as 002 §3.4 split
translation work, since the same family boundaries apply):

1. At the top of the action's local-mutation body (e.g. `moveCardBundle`, before its call to
   `moveCard`), add: `if (systemState.serverAuthoritative) return emitAuthoritativeCommand(...)`.
2. `emitAuthoritativeCommand(actionName, ...args)` (new, `client/src/setup/netcode/authoritative-dispatch.js`):
   resolves the acting card(s) via `getCardRegistry()` (import from `apply-view.js` — already
   Node-importable, no new browser-only dependency), builds the same `cardHints` shape
   `dual-run-bridge.js`'s translators already expect (reuse `buildCardHint` from
   `shared/engine/zones/resolve-card-index.mjs`, already DOM-free), and calls `processAction`
   directly with those parameters — **skipping** the legacy body (`moveCard`, or the equivalent
   zone/prize/board mutation function) entirely.
3. `pushAction`'s emit inside `processAction` is untouched (still fires, still required by 002's
   constraint) — only the caller's *own* local-mutation body is skipped, never `processAction`
   itself.
4. The server's response view is the only thing that renders the result (`apply-view.js`,
   already wired since 3.6-3.10). No DOM mutation happens on the initiating client until that
   view arrives — same latency profile the dual-run-bridge path already has for the *command*
   half of what happens today (the local half currently renders instantly and then the server's
   view either confirms or, on `cmdRejected`, contradicts it — that visible instant-then-maybe-
   corrected flash goes away under this design, which is a UX improvement, not a regression).
5. Flag-off (legacy, non-`serverAuthoritative`) mode is provably unchanged: the new branch is
   `if (systemState.serverAuthoritative)`, false in production until 3.12 flips it, so every
   existing test and the flag-off manual game continues to exercise the exact code path it does
   today.

## Edge cases & failure modes — Builder ticks every row

| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Action fired with `serverAuthoritative` true but no card found in `cardRegistry` (stale click, card removed by a concurrent server update) | No command sent; local no-op; optionally a logged warning | [x] covered: `authoritative-dispatch.test.mjs` "Row 1: ..." (5 tests) — hint builders return null for absent/invalid ids and fail closed as a unit |
| 2 | Server rejects the command (`cmdRejected`) after local mutation was skipped | Board never changed locally; next view (or none) is the only visible state — no rollback needed since nothing was locally applied | [x] covered (S56): gate returns true only after `processAction` ran; no local mutation precedes it, so `cmdRejected` needs no rollback — "dispatches a locally-initiated move and skips the legacy body" |
| 3 | Two rapid drags before the first view returns | Second command builds hints from whatever `cardRegistry` holds *now* (last-applied view), same as legacy's existing race handling via `clientSeq` | [x] covered (S56): each dispatch rebuilds hints from the live registry at call time; identity, not index, so a stale second drag resolves against the last-applied view |
| 4 | `manual_override` actions (damage counter, rotate, type change) | Explicitly untouched by this design — continue running their existing local-only body regardless of `serverAuthoritative` | [ ] out of scope by design (manual_override untouched) |
| 5 | 1-player / solo mode | `systemState.serverAuthoritative` structurally cannot be true outside 2P (existing guard, `socket-event-listeners.js`); gated branch never taken | [x] covered (S56): gate reads `systemState.serverAuthoritative`, which the existing 2P guard keeps false in solo — "flag off never dispatches" |
| 6 | Spectator | Never initiates a drag/command (existing `notSpectator` guard in `process-action.js`/`drop()`); unaffected | [x] covered (S56): spectator guard is inside `processAction`, which the gated path calls unchanged |
| 7 | Undo requested after a server-only move | `undo` is itself `server_command` (3.4e) — commandLog replay is already the sole mechanism; no legacy `exportActionData` entry was created for the skipped local body, so this needs explicit verification that `exportActionData`/`commandLog` still agree (see also row 8) | [x] covered (S61): local replay explicitly skipped under the flag (was a silent no-op, now an explicit gate); server's commandLog-minus-tail replay is the sole undo mechanism end to end — see Deviations, Slice 6 |
| 8 | `exportActionData`/spectator log entries, currently appended unconditionally in `processAction` (lines 71-86) regardless of this design | Confirm these still capture gated actions correctly (they read `parameters`, not anything from the skipped local body) — likely unaffected, verify per family | [x] covered (S56): `exportActionData` likewise appended inside `processAction`; the gated path passes an equivalent parameter list |
| 9 | A `server_command` family whose local body does something `processAction` alone can't replicate (e.g. an animation trigger, a chat message via `moveCardMessage`) | Decide per family whether that side effect must move into the gated path or is acceptably lost/deferred to the server's advisory `events` (Invariant 4) — likely several per-family judgment calls, not a single global answer | [x] resolved for this family (S56): `moveCardMessage` is skipped; the server's advisory `events` stream replaces it (see Deviations) |
| 10 | `attack`/`useAbility`/`stadium-effect` families — these likely have far more local pre-computation than `moveCardBundle` (damage math, trainer effect resolution via `trainer-execution.js`) | Each family's slice must trace its own chain before gating it — do not assume `moveCardBundle`'s shape generalizes | [ ] slices 2-5 |
## Test plan

- **Unit** — `authoritative-dispatch.js`: hint-building from a stubbed `cardRegistry`, missing-card
  no-op (row 1). Per-family: a test proving the legacy local-mutation function is **not called**
  when `serverAuthoritative` is true (spy/stub), and **is** called unchanged when false.
- **Integration** — extend `server/game/__tests__/replay-harness.test.mjs`-style round-trips to
  confirm a gated action still produces the same server-side result as today's dual-run path.
- **E2E** — this design is a *precondition* for 002's slice 3.12, not a replacement for it:
  002's flip-gate two-browser game is the real end-to-end proof once this design's slices land.
- **Manual** — one flag-on two-browser drag/evolve/attach sequence per family, confirming no
  visible legacy-engine side effect (no local rules-bridge message, no premature DOM mutation)
  before the server's view arrives.

## Migration / rollout

Flag-gated exactly like 002 (`systemState.serverAuthoritative`, itself downstream of
`SERVER_AUTHORITATIVE`, currently off in production per D8). Zero production exposure until 002's
3.12 flips the flag. Once this design's slices are green and 3.12 passes, the now-dead legacy
`moveCard`/equivalent bodies become deletable — tracked as a follow-up cleanup (Option O1-C),
not part of this design's slices, so the flag-off path keeps its exact current behavior as the
safety net throughout.

Revert path: each slice is one commit; `git revert` removes the gate, restoring unconditional
local execution for that family. No data migration.

## Work plan — slices ≤1 session, each leaving the repo green

| Slice | Delivers | Green when |
|---|---|---|
| 0 | **done (S55)** `authoritative-dispatch.js` primitive: `getCardRegistry`-based hint builder + `emitAuthoritativeCommand`, unit tested against a stub registry | Row 1; no production call site wired yet |
| 1 | **done (S56)** `moveCardBundle` gated for locally-initiated moves (move/attach/evolve) | Rows 2-3, 5-9 covered; identity now captured at the DOM event (`readCardInstanceId`), not from the legacy index — see Deviations |
| 2 | **done (S57)** Zone-op family gated (`shuffleIntoDeck`, `moveToDeckTop`, etc. — 002 §3.4a's list) | Row 10 traced for this family; simplest — none of the 14 carry a cardHint, so no DOM-identity capture needed, unlike slice 1 |
| 3 | **done (S58)** Prize & board family gated (002 §3.4b's list) | Row 10 traced for this family |
| 4 | **done (S59)** Setup & turn family gated (`takeTurn`; the rest are already `server_lifecycle`/`client_local`, no legacy body to gate) | Row 10 traced |
| 5 | **done (S60)** `attack`/`retreat`/`stadium-effect`/`useAbility` gated; `VSTARGXFunction` deliberately not gated (dead local path, I23) | Row 10 traced for this family |
| 6 | **done (S61)** `undo` re-verified against the gated paths (row 7); found and fixed a real dual-execution/no-op bug in the local replay | Full suite green; `undo` after a gated action produces the same replay result as before |
| — | **Exit** — hand back to 002: slice 3.12's flip-gate E2E is the proof this design is complete | 002's own exit test |

### Slice 2 (S57)

- **No DOM-identity capture needed, unlike slice 1.** None of the 14 zone-op legacy
  functions ever attached a cardHint (design's own O2/§Design note, confirmed against
  every `dual-run-bridge.js` translator case for this family): position-addressed ops
  (`shuffleIntoDeck`, `moveToDeckTop`, `switchWithDeckTop`) send `{ from: zoneId, index }`
  and the server resolves against its own zone array; whole-zone ops need no addressing;
  shuffle order is always server-rolled. So `dispatchAuthoritativeZoneOp` is a single
  generic gate — `[oInitiator, ...commandArgs]` forwarded straight to
  `emitAuthoritativeCommand` — reused unmodified across all 14 call sites, instead of the
  per-family hint-building slice 1 needed.
- **Row 9 for this family: local chat messages and `shuffleZone`'s flight animation are
  skipped**, same accepted-loss precedent as slice 1's `moveCardMessage` — the server's
  advisory `events` stream is the intended replacement; not built here (out of scope,
  same as I19's reveal-event gap).
- **Internal call chains re-verified, not just top-level entry points.** Several of these
  functions call each other locally as part of their own legacy body (e.g.
  `shuffleIntoDeck` calls `shuffleZone(..., emit=false)`, `shuffleAll`/`shuffleBottom`
  call `shuffleZone(..., emit=false)`). Because the gate requires `emit === true`, an
  internal `emit=false` sub-call is never gated even after its caller is — but this is
  moot: once the caller's own gate fires, it returns immediately and never reaches its
  internal calls at all. No double-gating, no dead code path exercised.
- **Not unit-testable in place**, same limitation as slice 1: `deck-actions.js`,
  `prizes-actions.js`, `shuffle-zone.js`, `general.js`, `hand-actions.js` all import
  `state.js` (browser-only `io()`/`document` module scope). The gate decision itself
  (`dispatchAuthoritativeZoneOp`) is fully unit tested; each call site is a 6-line `if`
  verified by code reading, not `node --test`.

### Slice 3 (S58)

- **Same shape as slice 2, no new primitive.** `takePrizes`/`takePrizesByIndex`
  (`prizes-actions.js`) and `discardBoard`/`handBoard`/`shuffleBoard`/`lostZoneBoard`
  (`board-actions.js`) confirmed against `dual-run-bridge.js`: none attach a cardHint.
  Prize ops address by count/indices the server re-validates against its own zone; board
  ops all translate to `{ type, payload: {} }`, so the legacy `message` chat-toggle param
  is passed through as `commandArgs` for parity but has no server-side effect (matches
  002's own 3.4b deviation note). Reused `dispatchAuthoritativeZoneOp` unmodified.
- **Row 9:** `appendMessage` chat lines skipped under the gate for all 6, same accepted
  loss as slices 1-2.
- **Not run against `pnpm test` this session** (forbidden by standing instruction) — only
  `node -c` on both touched files. Two slices (2 and 3) are now unverified against the
  suite; next session must run it before building slice 4.

## Deviations (Builder appends here during build)

### Slice 0 (S55)

- **Fail-open on untranslatable actions.** The design said `emitAuthoritativeCommand` "calls
  `processAction` directly", with no stated behavior when `translateActionToCmd` returns null
  for the action/parameters pair. Dispatching anyway would emit a `pushAction` relay with no
  server command behind it *and* skip the legacy body — the player's move would vanish. So
  `emitAuthoritativeCommand` pre-checks the translation and returns `false` without emitting;
  a `false` return is the gated call site's signal to fall through to its legacy body, which
  degrades that case to exactly today's dual-run behavior instead of losing the action. Slices
  1-5 must honor that contract at every gate they add.
- **One deliberate non-catch.** `translateActionToCmd` *throws* (does not return null) in
  dev-like environments for an action with no `DISPOSITION_TABLE` entry — its own edge case 14.
  That throw is not caught here: a missing classification is a build-time bug and must stay
  loud. Covered by a test asserting it propagates.
- **Injection over import, twice.** `processAction` and `systemState` are injected
  (`setAuthoritativeDispatchContext`), not imported, because `process-action.js` pulls in
  `state.js`'s browser-only module scope — the same landmine that forced the same seam in
  `apply-view.js`. `getCardRegistry` and `translateActionToCmd` *are* statically imported;
  both modules are already Node-importable and must stay that way.
- **No production call site wired**, exactly as the slice specified. The seam is unused until
  slice 1 wires it in `socket-event-listeners.js` alongside the existing
  `setDefaultNetcodeContext` seeding.

### Slice 1 (S56)

- **A legacy index cannot be resolved to a server instanceId — identity must be captured at the
  DOM event, not inside the action.** The design's O2-B said the gate "resolves the acting
  card(s) via `getCardRegistry()`", but never said *from what*. `moveCardBundle` receives only a
  zone index, and every producer of that index (`findZoneCardIndex`, `client/src/setup/image-logic/zone-card-lookup.js`)
  searches the **legacy zone array**, which is empty under authoritative rendering — so the index
  is `-1`/garbage exactly when the gate needs it. The registry is keyed by `instanceId` and has
  no index order, so it cannot bridge the gap either. Resolution: `apply-view.js` already stamps
  `dataset.instanceId` on every card image and play-container it renders, so identity is read
  straight off the interaction's own DOM target (`readCardInstanceId`), stored in
  `mouseClick.cardInstanceId` by `identifyCard`, and passed to `moveCardBundle` as a new trailing
  `authoritativeIds` argument. **Every remaining slice (2-5) needs the same treatment** — none of
  them can gate on an index alone.
- **Gate scope: locally-initiated actions only.** The gate fires for `user === 'self'`, `emit`
  true, and no incoming relay `cardHints`. Two paths deliberately stay on the legacy body:
  acting on the opponent's zone (`user === 'opp'`, which relays via `requestAction`), and a
  relayed mirror-apply from `acceptAction`. The mirror path still dual-executes under the flag —
  that is real and filed as **I21**, but suppressing it is one relay-layer decision covering
  every action family, not a `moveCardBundle`-shaped one, and it must be closed before 002's
  3.12 flip.
- **Rows 7 and 8 need no code.** `selfActionData`/`selfCounter`/`exportActionData` are all
  appended inside `processAction`, from `parameters` alone — the gated path calls the same
  `processAction` with an equivalent parameter list, so undo's action log and the spectator
  export capture a gated move exactly as they capture a dual-run one.
- **Row 9 for this family: `moveCardMessage` is skipped.** Under the gate the chat line
  announcing the move is not emitted locally; the server's advisory `events` stream is the
  intended replacement (Invariant 4). Accepted rather than duplicated into the gated path — a
  locally-generated message would describe a move the server has not yet adjudicated.
- **Not unit-testable in place.** `move-card-bundle.js` imports `state.js` and cannot load under
  `node --test`, so the whole gate decision lives in `dispatchAuthoritativeMoveCardBundle` and is
  tested there; the call site is a 4-line `if`. Same limitation and same mitigation as slices
  3.10/3.11 in design 002.


### Slice 5 (S60)

- **The family splits two ways, not five.** `attack`, `retreat` and `stadium-effect` carry
  **no card identity at all** in their command payloads — `attack` sends `{ attackIndex }`,
  `retreat` sends `{}` (or server-resolved `discardEnergyIds`), `stadium-effect` sends `{}` —
  because the server resolves the acting Pokemon from its own `active` zone
  (`reduce.mjs` cases `attack`/`retreat`, `executeStadium`). Only `useAbility` addresses a
  specific card. So the edge-case-10 worry (trainer-execution coupling forcing per-function
  hint building) did not materialise: the local pre-computation is large, but none of it
  reaches the wire.
- **New generic gate: `dispatchAuthoritativeAction`.** Slices 2-4's
  `dispatchAuthoritativeZoneOp` prepends `oInitiator` onto `commandArgs`, which this family's
  call sites do **not** do (`processAction(user, emit, 'attack', [attackIndex, rngBundle])`).
  Rather than special-case the prefix, the forwarding core was extracted as
  `dispatchAuthoritativeAction(action, { user, emit, commandArgs })`, and
  `dispatchAuthoritativeZoneOp` now delegates to it with the prefix applied. No behavior change
  for slices 2-4.
- **`useAbility` needed slice 1's DOM-identity treatment, as the STATE watch-out predicted.**
  Its legacy hint is `buildCardHint(zone.array[resolved])` — built from the legacy zone array,
  empty under authoritative rendering, so the hint would be null and the gate would fail open
  forever. Identity now comes from `mouseClick.cardInstanceId` (already captured by slice 1's
  `readCardInstanceId` in `click-events.js`), passed as a new trailing `authoritativeId`
  argument from both call sites (`keybinds.js` 'w' key, `active-bench-buttons.js`
  ability-counter button) and resolved against the registry by
  `dispatchAuthoritativeUseAbility`. The emitted parameter list keeps the legacy
  `[oInitiator, zoneId, index, hint]` shape, which the existing `dual-run-bridge.js` translator
  already consumes via its "parameters[0] is a user string" branch — no translator change.
- **`VSTARGXFunction` deliberately left ungated.** Nothing in the client calls it and no
  `GXButton`/`VSTARButton` element exists in the markup — the legacy body would throw on
  `button.classList` if a local caller ever reached it; today it is reachable only through the
  `acceptAction` relay, which this design does not gate (I21). Gating a dead local path buys no
  behavior and hides the deadness. Filed as **I23**; the separate `[type]` vs `[instanceId]`
  translator mismatch found while tracing it is **I22** (pre-existing, not introduced here).
- **Row 9 for this family — the largest accepted losses so far.** Under the gate, `attack`
  skips its local rules-engine body entirely: status coins (sleep/confusion), damage math,
  KO/prize flow, `discardBoard`, and the local `endTurnWithBanner`/`takeTurn` turn end. The
  server's `attack` reducer performs damage, KO handling and its own
  `resolveCheckup`/`advanceTurn`, so the *game* still advances; what is lost is the local
  rules-bridge chat/banner narration and any legacy-only attack effect the server's executor
  does not yet implement. Same for `retreat` (server pays the cost and swaps) and
  `stadium-effect` (server's resumable `executeStadium`, including its own pendingChoice pick,
  replaces the local picker). This is the intended O4-A end state, but it is also the first
  family where the server's fidelity — not just its authority — is load-bearing: 002's slice
  3.12 flip-gate two-browser game is the check that must catch any gap.
- **Not unit-testable in place**, same as slices 1-4: `chat-buttons.js`, `use-ability.js`,
  `keybinds.js` and `active-bench-buttons.js` all reach `state.js` (browser-only module scope).
  Both gate decisions are unit tested in `authoritative-dispatch.test.mjs` (17 new tests);
  each call site is a small `if`.

### Slice 5 correction (S65) — `pass` was missed

- Slice 5 claimed the `attack`/`retreat`/`stadium-effect`/`useAbility` family was fully gated,
  but **`pass` is in that same family** (`DISPOSITION_TABLE.pass`: `server_command`,
  `commandType: 'pass'`, `slice: 5`) and was never gated. Under the flag it kept running its
  entire legacy body — `resetAbilityCounters`, `appendMessage`, `discardBoard`, and
  `endTurnWithBanner`'s local turn advance — *and* sent a `pass` command, i.e. exactly the
  dual-execution this design exists to remove, on the single most frequently used action in a
  game. Found by 002's 3.12 flip gate, not by the slice's own review.
- Fixed the same way as its siblings: `dispatchAuthoritativeAction('pass', { user, emit,
  commandArgs: [rngBundle] })` at the top of `pass`, after the existing `user === 'opp'` relay
  early-return. `commandArgs` matches the function's own `processAction` call verbatim; the
  translator (`dual-run-bridge.js` case `'pass'`) ignores parameters and returns
  `{ type: 'pass', payload: {} }`, so no translator change was needed.
- Row 9 for `pass`: the local `appendMessage` chat line and `endTurnWithBanner`'s narration are
  skipped, same accepted loss as slices 1-5.

### Slice 6 (S61)

- **Row 7's original claim ("commandLog replay is already the sole mechanism") was true
  server-side but not client-side.** `undo.js`'s local `undoAsync` replay calls `acceptAction`
  for every past entry with `user: 'self'`, which `acceptAction` always maps to `emit: true` —
  so each replayed gated action (`moveCardBundle`, zone-ops, `attack`, etc.) re-enters its own
  slice 1-5 gate exactly as if it were a fresh local action. Under `serverAuthoritative` this
  fired `emitAuthoritativeCommand` → `processAction('self', true, ...)` for every entry, but
  `processAction`'s own `!systemState.isUndoInProgress` guard is false throughout the replay
  (`undo()` sets it true first), so those calls silently no-op — no local mutation (skipped by
  the gate) and no command sent (swallowed by the guard). The replay accomplished nothing;
  correctness only held because the pre-existing trailing `processAction(user, emit, 'undo',
  [filteredActionData])` call (after `isUndoInProgress` clears) sends the real server command.
- **Fix: skip the local replay outright**, per O1-B, instead of leaving correctness dependent
  on that guard interaction. `isAuthoritativeDispatchActive() && user === 'self' && emit`,
  checked right after the existing opp-relay early-return in `undoAsync`, resolves immediately
  without replaying. No new dispatch primitive: the real server dispatch already happens via
  the untouched trailing `processAction` call in `undo()`, so calling `emitAuthoritativeCommand`
  here too would have double-invoked `processAction` for `'undo'`.
- **Not unit-testable in place**, same limitation as every other call site in this design:
  `undo.js` reaches `state.js`. Reuses `isAuthoritativeDispatchActive`, already covered by
  slice 0's tests — no new test file.
