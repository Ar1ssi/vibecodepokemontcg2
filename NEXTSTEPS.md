# Netcode repair — increment ledger

Branch: `feature/netcode-repair`. Full plan: `.agent/designs/002-netcode-repair.md`.
One commit per slice; each commit leaves `pnpm test` green. `/clear` between slices.

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 0.1 | done | 8a79f12 | `SERVER_AUTHORITATIVE` defaults off; `render.yaml` explicit |
| 0.2 | done | 843f13b | `resolveRenderTargets` guard in `apply-view.js`; stadium-wipe repro fixed |
| 1.1 | done | f8f22a2 | Peer-log reconnect catch-up + O2-C fallback |
| 1.2 | done | 3a41122 | Counter-ordered `requestAction` queue |
| 1.3 | done | 57865a0 | Dead-scaffolding deletion; kept requestSyncLogBundle/syncLogBundle (live) |
| 2.1 | done | fc12f49 | Sweep grace + `roomInfo` decoupling |
| 2.2 | done | 4bd8c43 | `clientSeq` clearing, protocol version, `emitCmd` surfacing |
| 3.1 | done (uncommitted) | — | **3A** `instanceMap` round-trip; index fallbacks deleted |
| 3.2 | done (uncommitted) | — | **3A** Disposition map classifies all 59 actions (classify only, no impl) |
| 3.3 | done (uncommitted) | — | **3A** Condition normalisation rejects unknowns |
| 3.4a | done (uncommitted) | — | **3A** Zone-op translations |
| 3.4b | done (uncommitted) | — | **3A** Prize & board translations |
| 3.4c | done (uncommitted) | — | **3A** Setup & turn translations |
| 3.4d | done (uncommitted) | — | **3A** Reveal/look family: all 8 already `replaced_by_redaction`/`announcement_only` in DISPOSITION_TABLE, relay-only by design, no translator case needed |
| 3.4e | done (uncommitted) | — | **3A** `undo` per D6. Fixed I16 first: added a logged `loadDeck` command so deck bootstrap is in `commandLog`; `undo` = commandLog-minus-tail replay from a fresh seeded state |
| 3.5 | done (uncommitted) | — | **3A exit** Replay harness green (1089/1089) against real recorded 2P traffic. Fixed I18 (dead `setup` wiring) and I17 (deal-order desync) along the way |
| — | done | — | **O4 GATE** — ruled A (full authoritative rendering), D11. Unblocks 3B. |
| 3.6 | done (uncommitted) | — | **3B** Shared `buildCardImage` factory (legacy `Card` + authoritative renderer); real `getZone`/`cardListeners` wired via `setDefaultNetcodeContext`, injected only in `socket-event-listeners.js`. Zone-array parity for drag-completing-a-move still open (3.7-3.10) |
| 3.7 | done (uncommitted) | — | **3B** Counters and status overlays (display-only reconciliation) |
| 3.8 | done (uncommitted) | — | **3B** Covers, hand sort, intra-zone order (#10), attachment class (#11) |
| 3.9 | done (uncommitted) | — | **3B** Reveal/look overlays — mechanism already generic, no code; row 23 test; filed I19 |
| 3.10 | done (uncommitted) | — | **3B** Room-change reset + context re-seed |
| 3.11 | done (uncommitted) | — | **3C** Desync detection routed into the 1.1 peer-log path |
| — | closed | — | **3C** Precondition for 3.12 (S54): drag/drop dual-executing legacy `moveCard` + emitting a server cmd — closed by design 003 slices 1-6 (S55-S61), verified against the real suite S62 |
| — | closed | — | **3C** Second precondition for 3.12 (S63): `zoneArrays` never populated from server views (I15), so 3.11's heartbeat/e2e hash tooling had no real per-client state — closed by I24 (S64): both now read a new `apply-view.js` view cache instead; deck excluded from the comparison as owner-secret (O4-A/I5) |
| 3.12 | **passing** | — | **3C** Flip gate: `flip-gate-test.mjs` plays a full 2-browser game flag-on to a real KO win. ALL PASS (4 consecutive runs) after closing I26. Flag not flipped — that call is the user's (D8) |

## Design 003 — authoritative interaction routing (precondition for 3.12)

Full plan: `.agent/designs/003-authoritative-interaction-routing.md`. Approved S55.

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 003-0 | done (uncommitted) | — | `client/src/setup/netcode/authoritative-dispatch.js` primitive + 20 unit tests. Row 1 covered. Fail-open contract: `emitAuthoritativeCommand` returns false (no emit) when translation yields null, so the gated call site falls through to its legacy body instead of losing the action |
| 003-1 | done (uncommitted) | — | `moveCardBundle` gated for locally-initiated moves. `readCardInstanceId` + `dispatchAuthoritativeMoveCardBundle`; `mouseClick.cardInstanceId` in `identifyCard`, instanceIds passed from `drop()`; `setAuthoritativeDispatchContext` seeded in `seedNetcodeContext`. Rows 2-3, 5-9 covered. **Legacy indices are unusable under authoritative rendering — slices 2-5 each need their own DOM-side identity capture.** Relay mirror still dual-executes: I21 |
| 003-2 | done (uncommitted) | — | Zone-op family gated (all 14 funcs): `dispatchAuthoritativeZoneOp`, no card-identity capture needed (family addresses by zone/position, server-resolved) |
| 003-3 | done (uncommitted) | — | **3A** Prize & board family gated (`takePrizes`, `takePrizesByIndex`, `discardBoard`, `handBoard`, `shuffleBoard`, `lostZoneBoard`) — none carry a cardHint, reused `dispatchAuthoritativeZoneOp` unmodified |
| 003-4 | done (uncommitted) | — | Setup & turn family gated: `takeTurn` only (rest of 002 §3.4c already `server_lifecycle`/`client_local`, confirmed) — reused `dispatchAuthoritativeZoneOp` unmodified |
| 003-5 | done (uncommitted) | — | `attack`/`retreat`/`stadium-effect` gated via new generic `dispatchAuthoritativeAction` (no oInitiator prefix, unlike the zone-op gate); `useAbility` gated via `dispatchAuthoritativeUseAbility` with `mouseClick.cardInstanceId` identity capture. `VSTARGXFunction` left ungated — dead local path (I23), translator mismatch (I22) |
| 003-6 | done (uncommitted) | — | `undo` re-verified against the gated paths (row 7) — found and fixed a real bug: local replay was a silent no-op under the flag (see S61) |


Phases 0–2 are done (flag off; they changed only the path already in production).

Phase 3 was re-scoped in S39 after Phase 2 landed. It now splits three ways:

- **3A (3.1–3.5)** — make the server provably right. No renderer, no DOM, zero production
  exposure. Slice 3.5 (replay recorded 2P traffic through `GameRoom`, assert `hashState`
  agreement) is the exit test and the evidence the O4 gate needs.
- **O4 gate** — decide the end state: full authoritative rendering (A), server-as-arbiter only
  (B), or B now with A behind its own gate (C). OPEN. Rule on it with 3.5's evidence in hand,
  record as D11. **Do not start 3B first.**
- **3B (3.6–3.10)** — renderer parity, only if O4-A or O4-C. This is the migration's real cost
  centre: the authoritative renderer today emits a bare `<img>` with no listeners, no counter
  overlays and no covers, so wiring it in as-is would replace a working interactive board with a
  dead picture of one.
- **3C (3.11–3.12)** — desync detection, then the flip.

Verify each slice with `pnpm test` + `pnpm test:2p`. Manual two-browser games only matter from
3.6 onward — before that the renderer is inert by design.

## S68 — I19 closed

Closed I19 (reveal/hide family had no server-side driver). See `.agent/ISSUES.md` closed entry
for the fix. Flag not flipped (D8) — still the user's call. No slice/gate status changed by this
session; this closes the last of the 3 known flip-time gaps S67 named (I25, I27, I19 — all now
closed).

## S67 — I27 closed

Closed I27 (client coin flip vs server starter disagreement). See `.agent/ISSUES.md` closed
entry for the fix. Flag not flipped — still the user's call (D8). No slice/gate status changed
by this session.

## S65 — 3.12 flip gate built and run; flag NOT flipped (I26)

Built `flip-gate-test.mjs` (`pnpm test:flip`): two real browsers, `SERVER_AUTHORITATIVE=1`,
played to a genuine win condition. It runs a full 15-turn game deterministically (3 identical
consecutive runs). Two production gaps had to be closed before it could get that far, and one
it found is a hard blocker.

**Fixed — `pass` was never gated (design 003 slice-5 miss).** `pass` is `server_command` in
`DISPOSITION_TABLE`, same slice-5 family as `attack`/`retreat`/`stadium-effect`, but slice 5
gated those three and `useAbility` and left `pass` out. Under the flag it still ran its whole
legacy body (`discardBoard`, `endTurnWithBanner`) *and* sent a command — exactly the
dual-execution design 003 exists to remove. Gated it with the same
`dispatchAuthoritativeAction` call the rest of the family uses
(`chat-buttons.js`, `commandArgs: [rngBundle]`, matching its own legacy `processAction`).

**Fixed — nothing applied `view.turn`.** Views have always carried
`turn.player`/`isYourTurn`/`number`/`phase`, and `applyView` read exactly one of those fields
(`phase !== 'ended'`, for the end modal). Nothing ever wrote `rulesState`. With every legacy
turn-advance body now skipped, `rulesState.turnPlayer` stayed frozen at whatever the local coin
flip produced while the server advanced its own turn — so the client's *next* command came back
`"It's not your turn."` and the game could not progress past turn 2. New `reconcileTurnState`
(`apply-view.js`) syncs turnPlayer/turnNumber/phase from the view; spectators and turn-less
views are left alone (a spectator view reports `isYourTurn:false` for both sides, so there is no
honest self/opp mapping). It deliberately does **not** dispatch `rules-turn-began` —
`rules-bridge.js` hangs legacy knockout/deck-out adjudication off that event, which the server
now owns; the stale-banner consequence is **I25**.

**I26 closed — the gate now passes.** New `cardStats` command carries the printed data the deck
row cannot: `hp`, `attacks`, `types`, `weakness`, `resistance`, `retreatCost`, `stage` — exactly
the fields the server's own reducers read. It addresses cards by `syncInstance` across *every*
zone and updates them in place, never rebuilding one, so it is safe to arrive mid-game (TCGdex
enrichment is async and can resolve long after `setup` has dealt). Schema in `commands.mjs`,
apply case in `reduce.mjs`, payload builder + emitter in
`client/src/setup/netcode/card-stats.js`, wired from `build-deck.js` once `ensureCardData`
settles. Two bugs surfaced while wiring it, both caught by the gate rather than by reading:
- the send hung off `Promise.all(...).then(...)`, so a *rejected* enrichment skipped it
  entirely — now `.catch(() => {}).then(...)`, sending whatever resolved (the e2e fixture stamps
  its own stats and never enriches at all);
- it read `deck.array` at send time, which by then holds only the 7 undealt cards — setup has
  already moved 13 of 20 into hand and prizes. The card list is now snapshotted at build time,
  so the cards actually in play are the ones that get stats.

**Found, not fixed — I27, turn order is decided twice.** The browsers run their own
`rulesCoinCallOverlay` coin flip, but `server.js:737` calls the `setup` command with
`payload: {}`, so `setupGame` never receives the `firstPlayerId` its signature accepts and falls
through to `starter = activeRng.next() < 0.5 ? ...`. The two disagree about half the time, and
until the first view lands the client that guessed wrong believes it is its own turn and has its
first action rejected. Self-healing once `reconcileTurnState` applies a view, but wrong until
then — same class as I17, same fix shape (feed the flip result to `setup`, or take the starter
from the server). This is what made the gate look flaky before it was diagnosed; the gate now
pulls a view up front (`window.__ptcg.requestView()`, existing `emitRequestView` plumbing) and
waits for `turnState().fromServer` before deciding who acts.

**What I26 was.** `loadDeck` (`reduce.mjs`) builds every server card from the 7-field deck row
`[quantity, name, type, imageURL, number, set, tcgId]`, and nothing server-side ever set `hp` or
`attacks`, so `createCard`'s defaults (`hp: null`, `attacks: []`) stood for every card in every
game. reduce.mjs's KO check (`koHp > 0 && defender.damage >= koHp`) could therefore never be
true: knockouts never fired, no prizes were ever taken, every attack dealt a flat 10 through the
`{name:'Attack', damage:10}` fallback, and weakness/resistance/retreat cost never applied. The
gate showed it directly — damage accumulating 10→20→30→40→50→**60** on a 60 HP Pokémon with
both clients agreeing at every step and nothing happening, the game running on to a deck-out win
at 7 attacks.

**Verified:** 1192/1192 `pnpm test` (12 new tests: 3 `reconcileTurnState`, 5 `cardStats`
reducer/schema, 4 payload builder). `pnpm test:2p` ALL PASS against a flag-off server (legacy
path provably untouched — every change is flag-gated, view-only, or additive). `pnpm test:flip`
**ALL PASS**, 4 consecutive runs: cross-client board agreement after every one of the 6 attacks,
zero `cmdRejected` on either client, KO at exactly 6 attacks, win reason `no Pokémon in play`.
Lint: zero non-prettier errors in any file touched.

**The flag is still off — flipping it is the user's call (D8).** 3.12's exit test now passes, so
the flip is available. Three known gaps ship with it if flipped as-is: **I25** (turn banner and
badges go stale), **I27** (client coin flip vs server starter disagree until the first view),
**I19** (reveal/hide unreachable server-side).

## S64 — I24 closed; 3.12 unblocked

Gave the 3.11 desync heartbeat and the e2e API a real live zone source instead of legacy
`zoneArrays` (never populated under authoritative dispatch, I15). New `lastAppliedView` cache in
`apply-view.js`, set at the end of every accepted `applyView` call and cleared by
`resetRenderState`, exposed via `hasAuthoritativeView`/`getAuthoritativeZoneArray`/
`getAuthoritativeStadiumArray`. Chose this over populating `cardRegistry`-derived arrays because
`cardRegistry` is a `Map` (insertion-ordered), not the view's own order — `hashCardList` joins in
array order, so an order mismatch would itself cause false-positive hashes; the raw last-applied
view has no such risk, since it's literally the array the server sent.

Wired in `sync-check.js` (new `viewBackedGetZone`, used by the heartbeat in
`socket-event-listeners.js` — safe unconditionally, since that heartbeat is itself gated on
`serverAuthoritative`) and `e2e-api.js` (new `liveZoneArray`, prefers the view cache once
populated, falls back to legacy `getZone` before that or in legacy mode — zero behavior change
there, so `replay-harness.test.mjs`'s frozen fixture is unaffected).

Found a second, deeper gap while wiring this: `deck` is redacted to `{ count }` even for its own
owner (design O4-A / I5) — a client can never produce a real per-card deck hash, so even with
`zoneArrays` fixed, comparing deck would be a permanent false positive on every heartbeat.
Excluded `deck` from the 3.11 comparison specifically: client's `PLAYER_ZONES` drops it, and a
new `excludeOwnerSecretZones` (`server/game/sync-check.mjs`) drops it from the server's
`hashStateZones` output before `findFirstDivergentZone` compares. Left `hashState`/
`hashBoardSnapshot` themselves untouched — the replay-harness and legacy dual-run recording still
need full deck fidelity from those (I17-style desync bugs live there).

**Verified:** 1180/1180 `pnpm test` (9 new tests). `pnpm test:2p` ALL PASS (flag off). Lint clean
on every touched file. Server boots clean with `SERVER_AUTHORITATIVE=1` (manual alt-port check).
3.12 itself not started — this only unblocks it.

## S63 — I21 closed; 3.12 blocked on a new finding (I24)

Closed I21: `accept-action.js` now skips the legacy mirror body for a relayed opponent action
(`user === 'opp'`) whenever `systemState.serverAuthoritative` is on and the action's
`DISPOSITION_TABLE` entry is `server_command`/`manual_override` — those are exactly the
actions the server's own view already renders, so running the legacy body too was a double
render. Added `isMirrorSuppressedAction` to `authoritative-dispatch.js` (reused, not
duplicated, since it already imports `DISPOSITION_TABLE` and is the one module every other
relay-gate decision lives in). Every other disposition (`server_lifecycle`,
`replaced_by_protocol/redaction`, `ui_local`, ...) is untouched — the server view carries no
equivalent for those, so they must keep running locally for the mirror to reflect them at all.

Then started 3.12 itself (full two-browser game, flag on, per-turn hash equality, zero
`cmdRejected`) and hit a second, deeper precondition: `two-player-sync-test.mjs` and the
existing `window.__ptcg.boardHash`/`zone()` e2e helpers both read state through
`getZone(...).array` — the legacy per-player `zoneArrays`. Traced whether `apply-view.js`
populates those from a server view: it does not, and says so in its own comment
(`apply-view.js:247-250`), and 3.7/3.8/3.10's own deviation notes (design 002) all confirm the
gap is still open despite those slices being the design's stated place to close it. The 3.11
desync heartbeat (`sync-check.js`'s `computeSyncCheckZones`) has the exact same dependency —
so under full authoritative rendering, that heartbeat would report every zone diverged, not
just render being blind. There is currently no non-broken way for a client to compute a real
state hash under the flag, which is exactly what 3.12's exit test needs. Filed as **I24**
rather than build a flip-gate test on top of a hash source known to be wrong — a green result
from that test would prove nothing. Did not touch `sync-check.js`/`e2e-api.js` beyond reading
them: closing I24 (populating `zoneArrays` from views, or giving sync-check/e2e tooling a
`cardRegistry`-based hash instead) is real design-scope work, not a fix-in-passing.

**Verified:** I21 fix — 1175/1175 `pnpm test` (4 new tests in
`authoritative-dispatch.test.mjs`), `pnpm test:2p` green (flag off), lint clean on all 3 touched
files. I24 is a finding, not a code change — nothing to verify beyond the trace above. 3.12
itself not started (blocked). Everything uncommitted, no branch, per standing instruction.

## S62 — full suite verification (design 003 slices 2-6)

Ran `pnpm test` and `pnpm test:2p` for first time since S56 — slices 2-6 had accumulated as
`node -c`-only, per standing instruction against running the suite those sessions.

**Verified:** 1171/1171 `pnpm test` (0 fail). `pnpm test:2p` ALL PASS (flag off). No issues found —
every slice 2-6 claim (dispatch gating, `undo` fix, fail-open contract) holds against the real
suite. Nothing changed in product code this session. Everything still uncommitted, no branch, per
standing instruction.

## S60 — design 003 slice 5 done

Gated the attack/retreat/stadium/ability family. Traced first: `attack`, `retreat` and
`stadium-effect` carry **no card identity** on the wire (`reduce.mjs` resolves the acting
Pokemon from the server's own `active` zone), so they need no registry lookup — but their
call sites also do **not** prefix `oInitiator` onto their `processAction` parameters the way
slices 2-4's zone-ops do. Extracted the forwarding core as `dispatchAuthoritativeAction`
(verbatim `commandArgs`) and made `dispatchAuthoritativeZoneOp` delegate to it with the prefix
applied — no behavior change for slices 2-4.

`useAbility` did need slice 1's treatment, as the STATE watch-out predicted: its legacy hint
is built from the legacy zone array (empty under authoritative rendering), so
`dispatchAuthoritativeUseAbility` resolves `mouseClick.cardInstanceId` against the registry
instead, and both call sites (`keybinds.js` 'w', `active-bench-buttons.js` ability button)
now pass it as a trailing `authoritativeId` argument. The emitted parameter list keeps the
legacy `[oInitiator, zoneId, index, hint]` shape the existing translator already handles.

`VSTARGXFunction` deliberately **not** gated: no client caller and no `GXButton`/`VSTARButton`
element exists, so its local body is unreachable (and would throw if reached) — filed I23,
plus I22 for its pre-existing `[type]`-vs-`[instanceId]` translator mismatch.

Row 9 note: this family's accepted losses are the biggest yet — local status coins, damage
math, KO narration, `discardBoard` and the local turn-end banner are all skipped for `attack`;
the server reducer does perform damage/KO/checkup/advanceTurn, so the game advances, but the
server's *fidelity* (not just its authority) is now load-bearing. 002's 3.12 flip gate is the
check for that.

**Verified:** `node -c` on all 6 touched/new-content files only — `pnpm test`/lint forbidden
this session per standing instruction. **Not run against the suite.** Four slices (2, 3, 4, 5)
are now unverified against `pnpm test`. 17 new unit tests added to
`authoritative-dispatch.test.mjs` (already in `package.json`'s explicit test list). Everything
uncommitted, no branch, per standing instruction.

## S59 — design 003 slice 4 done

Gated `takeTurn` (`client/src/actions/general/take-turn.js`): only action in 002 §3.4c's
setup/turn family classified `server_command` in `DISPOSITION_TABLE` — `setup`,
`setupPrizes`, `drawOpeningHand`, `readyUp`, `reset`, `restartGame` are `server_lifecycle`
and `changeCardBack`/`changePlaymat` are `client_local`, per 002's own 3.4c note, so none of
those need a gate. Confirmed against `dual-run-bridge.js`: the `takeTurn` translator case
returns `{ type: 'takeTurn', payload: {} }` — no cardHint, same shape as slices 2-3. Reused
`dispatchAuthoritativeZoneOp` unmodified, gated at the top of `takeTurn` (before the
`discardBoard`/`moveCard`/counter-reset local body), one 8-line `if` block.

**Verified:** `node -c` on `take-turn.js` only — `pnpm test`/lint forbidden this session
per standing instruction. Not run against the suite. Three slices now unverified against
`pnpm test` (2, 3, 4) since S56 — next session must run it before slice 5. No new test
file — no new dispatch logic, same reuse pattern as slices 2-3, already covered by slice
2's 24 tests. Everything uncommitted, no branch, per standing instruction.

## S58 — design 003 slice 3 done

Gated the prize & board family (002 §3.4b's list): `takePrizes`, `takePrizesByIndex`
(`client/src/actions/zones/prizes-actions.js`) and `discardBoard`/`handBoard`/
`shuffleBoard`/`lostZoneBoard` (`client/src/actions/general/board-actions.js`) — 6 call
sites total. Same shape as slice 2: none of these legacy functions attach a cardHint
(`dual-run-bridge.js` confirmed — `takePrizes`/`takePrizesByIndex` pass count/indices the
server re-validates against its own prizes zone; the board-ops translators all return a
bare `{ type, payload: {} }`, ignoring the legacy `message` chat-toggle param entirely).
So no new dispatch function was needed — reused slice 2's `dispatchAuthoritativeZoneOp`
unmodified, one 8-line gate call per site, `commandArgs` matching each function's own
`processAction` call verbatim.

Row 9 for this family: local `appendMessage` chat lines are skipped under the gate, same
accepted-loss precedent as slices 1-2 (server's advisory `events` stream is the intended
replacement).

**Verified:** `node -c` on both touched files only — `pnpm test`/lint forbidden this
session per standing instruction. **Not run against the suite** — next session must run
`pnpm test` before continuing (this is now two slices deep unverified: S57's zone-op
family and this session's prize/board family). No new test file added — no new dispatch
logic to unit-test; the two call sites reuse `dispatchAuthoritativeZoneOp`, already
covered by slice 2's 24 tests. Everything uncommitted, no branch, per standing instruction.

## S57 — design 003 slice 2 done

Built `dispatchAuthoritativeZoneOp` in `authoritative-dispatch.js`: gates all 14 zone-op
legacy functions (`shuffleIntoDeck`, `moveToDeckTop`, `switchWithDeckTop`,
`shufflePrizesToDeckBottom`, `shuffleZone`, `shuffleAll`, `shuffleBottom`, `discardAll`,
`lostZoneAll`, `handAll`, `leaveAll`, `discardAndDraw`, `shuffleAndDraw`,
`shuffleBottomAndDraw`). Unlike slice 1's `moveCardBundle`, none of these attach a
cardHint — `dual-run-bridge.js`'s translators for this family already address by zone id
or position and let the server resolve against its own zone array (shuffle order is
never client-supplied; server rolls its own via `activeRng`). So the gate needs no DOM
identity capture at all: it forwards `[oInitiator, ...commandArgs]`, exactly the array
each legacy function already builds for its own `processAction` call — one call site
diff per function, no new client-side parsing.

Row 9 (side effects `processAction` can't replicate) for this family: local chat lines
(`appendMessage`) and `shuffleZone`'s `playShuffleFlight` animation are both skipped
under the gate, same accepted-loss decision slice 1 made for `moveCardMessage` — the
server's advisory `events` stream is the intended replacement, and the animation is a
local-render-only flourish the authoritative renderer doesn't reproduce for the mirror
side today either (3.6-3.10).

**Verified:** syntax-checked all 6 touched/new files (`node -c`) — no `pnpm test`/lint
per this session's standing instruction. 24 new unit tests for
`dispatchAuthoritativeZoneOp` (dispatch, flag-off, mirror-not-gated, opp-not-gated,
untranslatable-falls-through — one representative action per case, not all 14, since the
gate logic is identical across the family). Not run against the suite this session;
next session with tests enabled should run `pnpm test` before continuing. Everything
uncommitted, no branch, per standing instruction.

## S55 — design 003 approved, slice 0 done

User delegated the 003 design gate ("choose for me"); approved as drafted, no changes. Built
slice 0: `client/src/setup/netcode/authoritative-dispatch.js`, the primitive every later 003
slice gates on. `buildAuthoritativeCardHint`/`buildAuthoritativeCardHints` resolve server
`instanceId`s straight out of `apply-view.js`'s `cardRegistry` into the `{ moving, target }`
hint shape `dual-run-bridge.js`'s translators already consume — no `zoneArrays`, no
`syncInstance` translation (registry records are already server-shaped, so
`resolveHintInstanceId` takes the `.instanceId` branch). Both fail closed: a card absent from
the registry yields null, and a bundle whose target is missing is null as a whole, so no command
can ever address one resolved card and one guessed one. `emitAuthoritativeCommand` hands the
action to an injected `processAction` — injected, not imported, because `process-action.js`
reaches `state.js`'s browser-only module scope (same seam and same reason as
`setDefaultNetcodeContext`).

Found while building: the design left unspecified what happens when `translateActionToCmd`
returns null for a gated action. Dispatching anyway would emit a `pushAction` relay with no
command behind it *and* skip the legacy body — the player's move would silently vanish. So
`emitAuthoritativeCommand` pre-checks the translation and returns `false` without emitting;
`false` is the gated call site's contract to fall through to its legacy body, degrading that
case to exactly today's behavior. Slices 1-6 must honor that. One deliberate exception:
`translateActionToCmd` *throws* for an action with no `DISPOSITION_TABLE` entry (its edge case
14) — not caught here, since a missing classification is a build-time bug, not a runtime
fallback.

**Verified:** 1142/1142 `pnpm test` (20 new tests, 1 new test file, registered in the
`package.json` explicit test list). `pnpm test:2p` green (ALL PASS, flag off). Lint clean on
both new files. Everything uncommitted, no branch, per standing instruction.

**No production call site wired**, exactly as slice 0 specified — the seam is unused until
slice 003-1 seeds it in `socket-event-listeners.js`. Nothing in the shipped behavior changed
this session; the module is inert until then.

## S53 — slice 3.11 done

Built desync detection per the design: server's `hashState`/`hashBoardSnapshot` only ever
produced one joined string, so a new `hashZoneMap` (`shared/engine/zones/zone-hash.mjs`) and
`hashStateZones` (`shared/engine/state.mjs`) return the same fingerprint as a `{zoneId: hash}`
map, letting a comparison name the *specific* zone that diverged. Client heartbeat
(`startSyncCheckHeartbeat`/`stopSyncCheckHeartbeat`, `SYNC_CHECK_INTERVAL_MS = 30000`,
re-arming the 30s interval finding #4 named dead) computes its own per-zone hashes via
`computeSyncCheckZones` (new `client/src/setup/netcode/sync-check.js`) from the real `getZone`
already wired since 3.6, and emits `syncCheck` — gated on `serverAuthoritative`, two-player,
not-spectator, and `socket.connected` so it never queues stale hashes across a disconnect.
Server's `socket.on('syncCheck', ...)` (new, alongside `cmd`/`resolveChoice`/`requestView`
inside the `SERVER_AUTHORITATIVE` block) looks up the sender's `playerId` via
`gameRoom.socketToPlayer`, computes `hashStateZones(gameRoom.state, playerId)`, and calls a new
pure `findFirstDivergentZone` (`server/game/sync-check.mjs`) — emits `desync` naming the zone on
mismatch. Client's `desync` handler routes into the existing slice-1.1 `requestPeerLogCatchup()`
— no second recovery mechanism — gated by a new pure `shouldTriggerDesyncRecovery` (row 24: skip
if `systemState.isCatchingUp` or a peer-log request is already pending).

**Verified:** 1122/1122 `pnpm test` (17 new tests across 4 files, 2 new files). `pnpm test:2p`
green (flag off). Server boots clean with `SERVER_AUTHORITATIVE=1` (manual alt-port check — no
import/wiring errors). Lint clean on all 10 touched/new files. Everything uncommitted, no
branch, per standing instruction.

**Not tested at unit level:** the `socket.on('syncCheck', ...)` handler in `server.js` and the
heartbeat/`desync` wiring in `socket-event-listeners.js` — same class of landmine as the rest of
this design (module-scope `main()`/`io()`/`document`, no test harness in this repo). All
comparison, hashing, and recovery-gating logic that *can* be pure was extracted and is unit
tested; the wiring itself was verified by reading the guard and by the manual authoritative-mode
boot.

## S52 — slice 3.10 done

Built `resetNetcodeForRoomChange()` in `socket-event-listeners.js`: calls `resetRenderState()`,
then immediately re-invokes `setDefaultNetcodeContext(...)` (factored out as `seedNetcodeContext`,
reused by `initializeSocketEventListeners`'s original inline call) so the apply-view.js:67-71 trap
(reset nulls the context; skipping the re-seed breaks choice resolution) never trips — then
`resetClientSeq(0)`. Wired at every room-boundary the design named plus one it didn't: `joinGame`
(new room start, right after the protocol-mismatch early-return) and the `leaveRoomButton` click
handler in `room-buttons.js` (design's "leaveRoom handler" — the client-side teardown that resets
`systemState`, not the `socket.on('leaveRoom')` peer-left announcement at
`socket-event-listeners.js:344`, which only appends a chat message for the other player leaving).
Found in passing: `header-buttons.js`'s `p1Button` click handler duplicates the exact same
room-teardown sequence (`cleanActionData`, `reset`, `removeSyncIntervals`, deck repopulation) as a
second, independent "leave room" entry point — wired the same fix there for parity; not naming it
would leave that path desyncing the renderer registry same as the untreated button would have.

**Verified:** 1105/1105 `pnpm test` (no new unit test — see below). `pnpm test:2p` green (flag
off). Lint clean on all three touched files. Everything uncommitted, no branch, per standing
instruction.

**Not tested at unit level:** `socket-event-listeners.js`/`room-buttons.js`/`header-buttons.js` all
import `state.js`, which runs `io()`/touches `document` at module scope — same landmine documented
for `process-action.js` (edge rows 7, 11, 12): unimportable outside a browser, no DOM/socket test
harness in this repo. Verified by reading the guard and by `test:2p`'s live-browser round trip
(join → play → leave → rejoin implicitly exercised by the fixture's join step, though not a
full leave-then-rejoin scenario). The underlying reset-then-reseed primitive
(`resetRenderState()` + `setDefaultNetcodeContext()`) is unit-covered by the existing
`apply-view.test.mjs` "Finding 5: choice resolver uses setDefaultNetcodeContext fallback" test.

## S51 — slice 3.9 done (no production code)

Investigated reveal/look overlays per 3.4d's classification: all 8 legacy actions are
`replaced_by_redaction`/`announcement_only`, so `view.mjs` already carries the
`card.revealed` branch (full data vs `{instanceId}` stub) for prizes/hand. Traced
`createOrUpdateCardElement`'s `isRedacted` check (apply-view.js:215) — it already renders
card-back vs real art purely from whichever fields the view sent, generically for every
zone, so no reveal-specific rendering code was needed. Added `apply-view.test.mjs` "Row 23"
proving the transition across successive views (redacted → revealed → redacted, same
registry entry, one node).

Found in passing: nothing in `shared/engine` ever sets `card.revealed = true` — the
mechanism this slice verifies is currently unreachable, a consequence of 3.4d's existing
relay-only classification, not a new bug. Filed I19 rather than building the missing
command unprompted (out of this slice's scope, real product-behavior call).

**Verified:** 29/29 `apply-view.test.mjs` (1 new test, Row 23). 1105/1105 `pnpm test`.
`pnpm test:2p` green (flag off). Lint clean on touched file. Everything uncommitted, no
branch, per standing instruction.

## S50 — slice 3.8 done

Built `client/src/setup/image-logic/cover-listener-table.js` (`COVER_IMAGE_LISTENERS`,
extracted from `Cover`, mirroring `card-listener-table.js`) and refactored `Cover` onto
the shared `buildCardImage` factory. In `apply-view.js`: `reconcileZoneCover` builds/
updates/removes the deck/discard/lostZone `elementCover` top-card preview per side per
view (deck is count-gated back-skin only — `view.mjs` never sends deck card data, by
design); `resolveCardBackSrc` picks the side's actual chosen skin
(`cardBackSrc`/`p1OppCardBackSrc`/`p2OppCardBackSrc`) instead of a single hardcoded
default, fixing that gap for redacted-card backs too. Fixed #10 (intra-zone order) and
#11 (attached-card class) in `placeCardInZone` — both were one-line: unconditional
`appendChild` reconciles order for free (it moves an existing child to the end), and the
play-zone top-level branch needed `classList.remove('attached-card')` alongside the
leaves-play-zones branch that already had it. Added a `sortZoneCards` render-order hook
(new `hand-sort-context.js`, reusing the existing `sortCardsByDeckList`) so authoritative
hand/discard/lostZone rendering can honor the same deck-list-order behavior legacy forces
in 2P — wired in `socket-event-listeners.js` alongside `getZone`/`cardListeners`/
`coverListeners`, absent (all current tests) leaves rendering order unchanged.

**Verified:** 28/28 `apply-view.test.mjs` (7 new tests). 1104/1104 `pnpm test`. `pnpm
test:2p` green (flag off). Lint clean on all touched files. Everything uncommitted, no
branch, per standing instruction.

## S49 — slice 3.7 done

Built display-only counter/status overlay reconciliation in `apply-view.js`:
`reconcileDamageOverlay`/`reconcileSpecialConditionOverlay`, called per-card after
`placeCardInZone`. Creates/positions/removes the `damage-counter`/status-marker sibling
`<div>`s from `cardData.damage`/`cardData.specialCondition` on every view, reusing
`img.damageCounter`/`img.specialCondition` as the storage slot (same field legacy
`addDamageCounter`/`addSpecialCondition` use) and the shared style helpers
(`damage-counter-style.mjs`, `special-condition-style-apply.js`) so tier/status classes
stay identical to legacy. Position math replicates the legacy absolute-positioning scheme
(`targetRect`/`zoneRect` offsets). Registry cleanup now also strips these overlays, since
they're zone-element siblings, not children of the removed image/container.
**Not closed here:** click-to-edit interactivity (typing into the counter, right-click "add
counter") on an authoritative card — that still routes through legacy functions in
`client/src/actions/counters/*.js`, which need populated `zoneArrays` (same open gap noted
in 3.6). See design doc's 3.7 deviation note.

**Verified:** 24/24 `apply-view.test.mjs` (3 new tests, Row 21). 1097/1097 `pnpm test`.
`pnpm test:2p` green (flag off). Lint clean on touched files. Everything uncommitted, no
branch, per standing instruction.

## S48 — O4 gate ruled A; slice 3.6 done

User ruled O4-A (full authoritative rendering) at the gate, evidence in hand from 3.5. Recorded
D11. Built slice 3.6: `client/src/setup/image-logic/build-card-image.js` (pure `<img>` factory,
no game-state imports) used by both legacy `Card.buildImage` and `apply-view.js`'s
`createOrUpdateCardElement`; `client/src/setup/image-logic/card-listener-table.js`
(`CARD_IMAGE_LISTENERS`) is the one interaction table both consume — legacy directly, the
authoritative renderer only via injection (`setDefaultNetcodeContext({ cardListeners })`,
wired for real in `socket-event-listeners.js`), since `apply-view.js` itself must stay
Node-importable and `click-events.js`/`drag.js` pull in `state.js`'s browser-only module-scope
`io()`/`document` calls. Real `getZone` wired the same way, `window.__getZone` deleted (dead).
Full functional zone-array parity (a drag actually completing a move on an authoritative card)
is **not** closed here — see the design doc's 3.6 deviation note; that's 3.7-3.10's job.

**Verified:** 18/18 new+existing `apply-view.test.mjs` tests green (Row 20 structural coverage +
getZone wiring/adapter/test-seam tests). 1094/1094 `pnpm test` green. `pnpm test:2p` green (flag
off, confirms the new production-wiring imports load fine in a real browser). Lint clean on all
touched files. Everything uncommitted, no branch, per standing instruction.

## S47 — slice 3.5 done, two structural bugs found and fixed

Built `server/game/__tests__/replay-harness.test.mjs` + a real recorder
(`record-legacy-2p-fixture.mjs`) that plays a genuine 2-browser game against a live server
(started with `SERVER_AUTHORITATIVE=1`) and dumps `{action, parameters, clientBoardHash}` per
self-initiated step (`server/game/__tests__/fixtures/legacy-2p-recorded.json`). Replaying that
fixture through a fresh `GameRoom` via the real `translateActionToCmd` bridge surfaced two
structural bugs (both closed, see ISSUES.md):

- **I18:** nothing ever called the `setup` command server-side — decks loaded but hands/prizes
  were never dealt. Fixed: `server.js` now calls it once both players' decks are *actually*
  loaded (`allDecksLoaded`, not just both players present).
- **I17:** the client's legacy hand was dealt by its own local shuffle; the server's
  authoritative hand was dealt by `setupGame`'s own `activeRng` — two independent RNG streams,
  so a card the browser showed in hand was often still in the server's `deck` zone
  (`stale_view` on `moveCard`). Fixed by making the server the sole shuffle authority end to
  end: it emits each player its own syncInstance deal order (`dealOrder` event) once both decks
  are loaded, and the client's `setupPrizes()` waits for and uses it instead of rolling a local
  shuffle (`client/src/setup/netcode/deal-order.js` holds the wait/resolve plumbing). Gated on
  `systemState.serverAuthoritative` — zero behavior change while the flag is off (D8).

  A loosen-the-`from`-check approach was tried first and reverted — it broke an existing named
  invariant test (Edge Case 3: stale_view detection) and didn't even fix the real problem (the
  client and server would still have dealt genuinely different cards). The deal-order fix is the
  one that stuck.

**Verified:** `replay-harness.test.mjs` green against 3 fresh live-browser recordings in a row.
1089/1089 `pnpm test` green (harness now added to the list). Everything in this session is still
uncommitted, no branch, per standing instruction.

3A is now genuinely provably right on real recorded traffic. Ready for the O4 gate.

## S61 — design 003 slice 6 done

Re-verified `undo` (`client/src/actions/general/undo.js`) against every gate built in
slices 1-5. Traced the actual call chain instead of assuming row 7's original claim held:
`undoAsync`'s local replay calls `acceptAction(user, action, params, false, isReplay)` for
each past entry; `acceptAction` computes `emit = user === 'self' ? true : ...`, so every
replayed gated action (`moveCardBundle`, zone-ops, etc.) re-enters its own slice-1-5 gate
with `user: 'self', emit: true` — exactly the condition that gate treats as a fresh
locally-initiated action. Under `serverAuthoritative` this fires `emitAuthoritativeCommand`,
which calls `processAction('self', true, action, parameters)` — but `processAction`'s own
guard (`!systemState.isUndoInProgress`) is false for the whole replay (`undo()` sets it true
before calling `undoAsync`), so every one of those calls silently no-ops: no local mutation
(skipped by the gate), no command sent (swallowed by the guard). The local replay loop under
the flag was doing nothing at all — correctness only survived because the pre-existing
trailing `processAction(user, emit, 'undo', [filteredActionData])` call in `undo()` (which
fires after `isUndoInProgress` is cleared) sends the real `undo` command, and the server's
own commandLog-minus-tail replay (002 3.4e) is what actually reconstructs the board.

Fixed per O1-B rather than leave it load-bearing on that guard interaction: added an explicit
check (`isAuthoritativeDispatchActive() && user === 'self' && emit`) right after the existing
opp-relay early-return, resolving immediately and skipping the whole local replay loop when
true. No new dispatch primitive needed — reused the existing exported
`isAuthoritativeDispatchActive` — since the real server dispatch already happens via the
untouched trailing `processAction` call, calling `emitAuthoritativeCommand` here too would
have double-invoked `processAction` for 'undo' once `isUndoInProgress` clears.

**Verified:** `node -c client/src/actions/general/undo.js` only — `pnpm test`/lint forbidden
this session per standing instruction. **Not run against the suite.** Slices 2-6 are now all
unverified against `pnpm test` since S56 — next session must run it before closing I21 or
touching 002's 3.12 flip gate. No new test file (no new dispatch primitive — the fix reuses
`isAuthoritativeDispatchActive`, already covered by slice 0's tests; the call site itself is
one 4-line `if`, same untestable-in-place limitation as every other gated call site in this
design). Everything uncommitted, no branch, per standing instruction.
