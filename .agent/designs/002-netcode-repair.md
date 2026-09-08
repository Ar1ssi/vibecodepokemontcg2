# 002: Netcode repair — retire the unearned flip, then earn it

Status: approved (user delegated the picks to the session, 2026-09-09 S32) — O1-A, O2-B/C, O3-C
Date: 2026-09-09 · Session: S32
Supersedes nothing. Completes the unfinished tail of `001-server-authoritative-netcode.md` slice 8.

## How to use this document

| If you are… | Read |
|---|---|
| Deciding whether to approve | Problem → Verification results → Options → Work plan |
| Building Phase 0 | Problem → Design §0 → Work plan slices 0.1–0.2 |
| Building Phase 1 or 2 | Design §1/§2 + the edge-case rows named in your slice |
| Building Phase 3 | Verification results N1 → Design §3 in full → Options O3 |
| Reviewing a diff | Verification results, then the edge-case table |

---

## Problem

`SERVER_AUTHORITATIVE` defaults to **on** (`server/server.js:21-23`) and `render.yaml` sets no
env var, so production runs the authoritative netcode path. Design 001 slice 8 recorded this as
"Phase 3 flip … complete". It was not. Three of the four things a flip requires were never done:

1. The authoritative renderer cannot see the board it is supposed to render (N1b below).
2. Client and server use **different, non-overlapping card-ID spaces**, so authoritative card
   commands address the wrong card or none (N1).
3. 14 of 58 legacy actions translate to commands; the other 44 never reach the server.

The result is not "two renderers fighting". It is one working renderer (legacy relay) plus a blind
second one that is inert everywhere except `#stadium`, where it is **destructive**. Meanwhile the
recovery stack the legacy path relied on was deleted in slice 8 and never replaced, so neither
path can recover from a reconnect.

## Constraints

- **Branch discipline.** This spec has 16 acceptance criteria and spans client, server and shared
  engine, so CLAUDE.md § Token/model policy applies: build it as increments on **one**
  `feature/netcode-repair` branch, one commit per slice, each green before the next, with the
  increment ledger in `NEXTSTEPS.md` so any session can resume. Do not build it in one session.
  Every slice must also be independently revertible (`git revert <slice commit>`), and no slice may
  delete code it has not first proven dead.
- `pnpm lint` fails repo-wide on CRLF; lint only changed files with
  `npx eslint --rule "prettier/prettier: off" <files>` (STATE watch-out).
- `shared/engine/` must stay DOM-free and import relatively (Invariants 6, 8;
  `shared/engine/__tests__/invariants.test.mjs`).
- `pushAction` must keep relaying setup actions — the **server's own deck initialization** is fed
  from it (`server/server.js:658-674`). Dropping the relay in authoritative mode empties the
  server's game state. This is why the STATE watch-out exists; it is stronger than STATE records.
- Every behavior change ships with a test that fails without it (CLAUDE.md § Code standard).

---

## Verification results

Every line below was read this session. `✔` = the source report is right; `✘` = wrong;
`N` = missed by the source report.

### ✘ Corrected: the two renderers do not both write the board

`applyView` resolves zones through `resolveZone` (`client/src/setup/netcode/apply-view.js:91-111`),
which tries `options.getZone`, then `window.__getZone`, then `document.getElementById(zoneId)`.

- `options.getZone` is supplied **only by tests** (`apply-view.test.mjs`, 14 call sites).
- `window.__getZone` **is never assigned anywhere in the repo** — the only two references to it are
  the read sites in `apply-view.js:99-100`.
- The real zones live inside two iframes: `getZone` reads `selfContainerDocument` /
  `oppContainerDocument` (`client/src/setup/zones/get-zone.js:35-46`,
  `client/src/initialization/global-variables/containers.js`). The top-level document contains
  exactly one zone id: `#stadium` (`client/index.ejs:54`).

So in production `resolveZone` returns `{ element: null }` for every zone, `placeCardInZone`
returns at its `if (!zone.element …) return` guard (`apply-view.js:207`), and **nothing is
rendered**. There are no duplicate cards on the board, and the cleanup loop at `apply-view.js:628`
is not "unable to remove legacy nodes" — there are no authoritative nodes in the tree to reconcile
against. The report's root-cause narrative, and therefore its suggested fix order, does not hold.

This also explains its closing note: the tests are green because **every** `applyView` test injects
`getZone: mockGetZone`. The renderer has never been executed against the real DOM.

### ✔ Confirmed, and worse than reported: the stadium is actively destroyed

`#stadium` is the one zone in the top-level document, so it is the one zone `resolveZone`'s
fallback finds. `reconcileStadium` (`apply-view.js:259-281`) runs on **every** applied view, and
when `view.stadium` is null it executes `stadiumElement.innerHTML = ''`.

The server's `view.stadium` is null in practice — nothing ever puts a card there, since moving a
card to the stadium is one of the untranslated actions. Legacy renders the played Stadium into that
same `#stadium` element via `getZone(user,'stadium')`. So:

> **Repro:** P1 plays a Stadium (legacy renders it). Either player then draws a card or passes —
> `draw`/`pass` carry no instanceId, so they are the commands that actually succeed server-side —
> the server broadcasts a view, `applyView` applies it, and the Stadium vanishes from both boards.

This is a real, user-visible desync with a deterministic repro, and it is the *only* board
corruption the authoritative path currently causes.

### N1 — MISSED, and the deepest bug: the ID spaces do not overlap

| | Minted by | Values |
|---|---|---|
| Client `card.syncInstance` | `client/src/setup/deck-constructor/build-deck.js:13-19` | **0-based, restarts per player**: 0,1,2,… |
| Server `card.instanceId` | `mintInstanceId(state)` via `initializePlayerDeck` (`server/game/shadow.mjs:29-68`, `shared/engine/cards.mjs:12-18`) | **1-based, global across both players**: 1,2,…N, N+1,… |

`dual-run-bridge.js:205-208` sends `cardHints.moving.syncInstance` **as the `instanceId` field**.
The server looks up by `instanceId` (`shared/engine/reduce.mjs:269,284,310,348`) and the view
carries only `instanceId` (`shared/engine/view.mjs:16`).

Consequence: for p1 every command is off by exactly one card; for p2 every command addresses **p1's
cards** (p2's syncInstance 0..59 vs p2's instanceIds 61..120). `findCard` searches globally, so
reference-integrity validation passes and the command is then rejected on ownership — or, in the
rules-off sandbox, silently applied to the wrong player's card.

The source report's finding #2 saw the *symptom* (the `Number(index)` fallback) but not this: the
fallback is irrelevant, because **the non-fallback path is equally wrong**. Making `syncInstance`
mandatory and deleting the index fallback — its recommended fix #2 — would change nothing.

### N1b — MISSED: detached-node accumulation

`createOrUpdateCardElement` runs before `placeCardInZone` and unconditionally creates an `<img>`
and inserts a `cardRegistry` record (`apply-view.js:143-190`). `placeCardInZone` then bails on the
null zone. The cleanup loop only removes nodes that have a `parentNode` (`apply-view.js:630-634`),
so it deletes the registry entry but the element was never attached and the record is re-created on
the next view. Steady-state cost is one detached `<img>` per card per game plus registry churn on
every broadcast — not fatal, but it is the mechanism that makes "the renderer did nothing"
invisible in profiling.

### N2 — MISSED: reconnect recovery is dead in *both* modes

Slice 8 deleted `catch-up-actions.js`, `resync-actions.js`, `request-board-snapshot.js`,
`apply-board-snapshot.js`, `sync-replay.mjs`. The emitters were not deleted with them:

- `socket-event-listeners.js:211` still emits `resyncActions` on reconnect. **No client
  `socket.on('resyncActions')` exists** (verified against the full listener list). The server
  relays it into the void.
- The server still relays `catchUpActions`, `requestBoardSnapshot`, `applyBoardSnapshot` and
  `syncCheck` (`server/server.js:601-625`) with no listener on either end.
- In authoritative mode the replacement is `emitRequestView` — which returns a view the renderer
  cannot paint (see above).

So a player who reloads or briefly disconnects has **no recovery path at all**. This is the most
likely explanation for a desync that "snaps" and never heals, and neither the source report nor
MAP.md records it.

### ✔ Confirmed as reported

| # | Finding | Evidence |
|---|---|---|
| 1 | 14/58 actions translate; `default: return null` | `dual-run-bridge.js:406-408`; 58 keys in `accept-action.js` |
| 2a | Unrecognised special condition silently becomes `'Poisoned'` | `dual-run-bridge.js:25` |
| 2b | Positional index used as instanceId in 3 places | `dual-run-bridge.js:85-87, 167-169, 306-307` |
| 3 | `resetRenderState()` never called in production | only test call sites; the `room-buttons.js` leave path does not call it |
| 4 | `emitSyncCheck` / `triggerSyncCheck` are `() => {}` | `socket-event-listeners.js:66,68` |
| 5 | 5-minute sweep drops a live room when both sockets are absent | `server.js:260-268` + `room.mjs:151-160` → `userReconnected` then hits the `!roomInfo.has` branch → `server_restart` (`server.js:522-529`) |
| 6 | `requestAction` logs `stale_counter` and applies anyway | `socket-event-listeners.js:324-343` |
| 7 | `protocolVersion` never sent | `cmd-emitter.js:172-178` builds the envelope without it |
| 8 | Client hardcodes `'2.0.0'` instead of importing `PROTOCOL_VERSION` | `socket-event-listeners.js:86` |
| 9 | `emitCmd` result discarded, `bad_command` invisible | `process-action.js:39-46` |
| 10 | Intra-zone order never reconciled | `apply-view.js:248` appends only when the parent differs |
| 11 | `attached-card` class not removed on the play-zone branch | `apply-view.js:247` sits in the non-play-zone branch only |
| 12 | `clientSeqByPlayer` survives `removeSocket` | `room.mjs:151-160`; `addPlayer` clears only when `prevSocketId` exists (`room.mjs:81-85`) |
| 13 | Shadow and GameRoom are fed from different streams | `server.js:645-655` (shadow ← pushAction) vs `server.js:733` (room ← cmd) |

Corrections to two of these: **#4** — the 30s heartbeat is installed only in *non*-authoritative
mode (`socket-event-listeners.js:132`), so in production today it does not run at all; the stubs
are dead in both modes but for different reasons. **#3** — `resetRenderState()` also nulls
`defaultNetcodeContext` (`apply-view.js:67-71`), so calling it on room change without re-invoking
`setDefaultNetcodeContext` breaks choice resolution. It is *not* the "near one-liner" the report
claims.

### Where the flag actually leaves us

Turning `SERVER_AUTHORITATIVE` on today costs: the stadium wipe (real), a detached-node drip,
`cmdRejected` chat spam on every rejected command, and one wasted socket round-trip per action.
It does **not** cause card duplication, and it does not currently double-render the board. Honest
framing: the flag is cheap to turn off and doing so removes one real bug, but it is **not by itself
the fix for a general desync** — findings N2, #5 and #6 are mode-independent.

---

## Options

The user delegated these three calls to the session (2026-09-09, S32) rather than ruling on them.
They are therefore **decided, not proposed** — each is recorded in `DECISIONS.md` as D8–D10, and
each is listed under "Decided for you" at task close so it can still be vetoed. The reasoning that
produced each pick is left in place below so a later session can relitigate it against evidence
rather than re-deriving it.

### O1 — What to do about the flag, now

| | Option | Tradeoff |
|---|---|---|
| A | **Set `SERVER_AUTHORITATIVE=0` in `render.yaml` and flip the code default to off** | Production runs exactly the path S31 shipped and `test:2p` exercises. Kills the stadium wipe and the wasted round-trip immediately. Loses server-side deck mirroring and `/debug/shadow-report`, both currently useless — shadow is fed from a different stream than the room (#13). One-line revert. |
| B | Leave the flag on, patch forward | Keeps the migration "live", but every Phase-3 slice then ships to production half-finished. The flip has already been recorded as done once on exactly this basis. |
| C | Keep the flag on, disable only `reconcileStadium` | Smaller diff, but leaves an inert renderer, wasted traffic and `cmdRejected` spam in production, and preserves the fiction that the flip happened. |

**Decided: A** (D8). A flag whose code has not earned it should be off. The flip is a *result*, gated on
slice 3.6's exit test — not a default. Reverting is `value: "0"` → delete the line.

### O2 — What to do about reconnect recovery (N2)

| | Option | Tradeoff |
|---|---|---|
| A | Restore the deleted legacy replay stack | Un-deletes ~5 files the design deliberately removed; re-introduces the recovery loops `sync-replay.mjs` existed to suppress. |
| B | **Minimal opponent-log catch-up**: on reconnect, ask the peer for its `exportActionData` tail past our `oppCounter` and replay it through `acceptAction` | Small, uses the action log that already exists and is already maintained (`process-action.js:60-73`); no snapshot machinery, no hash comparison. Bounded: if the tail exceeds a cap, fall through to C. |
| C | Make the failure loud and manual: detect the gap, tell both players the game desynced, offer "reload and rejoin" | Zero recovery, but zero silent corruption. Correct floor for cases B cannot cover. |

**Decided: B, with C as its mandatory failure branch** (D9). B is genuinely reversible (one new listener, one new
emitter) and reuses maintained state. C must ship *with* B — a recovery mechanism with no failure
branch is how the original stack grew into the thing slice 8 deleted.

### O3 — How to unify the ID spaces (N1) — the Phase 3 keystone

| | Option | Tradeoff |
|---|---|---|
| A | Make the client mint server-shaped ids | Requires the client to know both players' deck sizes before either deck loads. Ordering-dependent and fragile. |
| B | Make the server mint client-shaped ids (per-player 0-based) | Cheapest diff, but breaks `findCard`'s global lookup: p1's card 5 and p2's card 5 become indistinguishable. Rejected — it trades a detectable bug for a silent one. |
| C | **Server keeps minting; it returns a `syncInstance → instanceId` map to each player at deck init, and `dual-run-bridge` translates through it** | One new server→client message and one lookup table on the client. The server stays sole authority over identity; the client keeps its own DOM identity unchanged; the translation becomes explicit and testable rather than an accidental type pun. Fails loudly (drop the command, surface it) when a hint is not in the map. |

**Decided: C** (D10). It is the only option where identity has exactly one owner, and it turns the
currently-implicit assumption ("these two integers are the same integer") into a data structure
that can be asserted on.

---

## Design

### §0 — Stop the bleeding

**0.1 Flag off.** In `server/server.js:21-23`, invert the default so an unset env means *off*:
`SERVER_AUTHORITATIVE = process.env.SERVER_AUTHORITATIVE === '1' || … === 'true'`. Add
`SERVER_AUTHORITATIVE: "0"` to `render.yaml` `envVars` as belt-and-braces, so the intent is
readable at the deploy boundary and not only in code.

**0.2 A blind renderer must not write.** Add to `apply-view.js` an explicit render-target
resolution step that runs *before* any mutation:

```
function resolveRenderTargets(view, options) -> { ok: boolean, reason?: string }
```

It probes one zone per side through `resolveZone`. If any probe returns a null `element`,
`applyView` returns `{ applied: false, reason: 'no_render_target' }` **without** touching
`lastRenderedVersion`, without calling `createOrUpdateCardElement`, and — critically — without
calling `reconcileStadium`. This single guard would have prevented the stadium wipe, the
detached-node drip, and the version-counter advance that makes a later correct view look
out-of-order.

Invariant to state in the file header and assert in a test: **a renderer that cannot see the whole
board writes to no part of it.**

### §1 — Make the shipping path whole

**1.1 Reconnect catch-up (O2-B/C).** New pair:
`socket.emit('requestPeerLog', { roomId, fromCounter })` on reconnect; the peer replies
`socket.emit('peerLog', { roomId, toSocketId, actions })` with `exportActionData` entries after
`fromCounter`, capped at `PEER_LOG_MAX = 200`. The receiver replays through the existing
`pushActionQueue` chain so ordering with live traffic is preserved. Over cap, or peer unreachable
within 5s → announce the O2-C message and stop. The server relays both events (add them to the
`events` array at `server/server.js:601`).

**1.2 Ordering gate (#6).** Delete the `moveCardBundle` and `isCounterOrStatusAction` exemptions at
`socket-event-listeners.js:317-328`. Replace "log and apply anyway" with: queue the action against
its counter, apply in counter order, and if a gap persists past `STALE_ACTION_TIMEOUT = 2000ms`,
trigger the 1.1 catch-up. The exemption exists because `moveCardBundle` is the primary mutation
path and dropping it was worse than misapplying it — the queue removes that dilemma.

**1.3 Delete the dead scaffolding.** Remove the `emitSyncCheck`/`triggerSyncCheck` stubs and their
three call sites, the never-armed 30s interval, and the server relay entries for `syncCheck`,
`resyncActions`, `catchUpActions`, `requestBoardSnapshot`, `applyBoardSnapshot`,
`requestSyncLogBundle`/`syncLogBundle` — **only after** grepping each for a live listener. Real
desync *detection* returns in 3.5 built on `hashState`; a stub that pretends to detect is worse
than none.

### §2 — Server lifecycle (mode-independent)

**2.1 Sweep (#5).** Give `GameRoom` a `lastActivityAt` touched by `handleCommand`, `addPlayer`, and
the pushAction ingest. The sweep deletes a room only when *both* socket maps are empty **and**
`Date.now() - lastActivityAt > ROOM_GRACE_MS` (30 min). Never delete `roomInfo` from the
authoritative branch — `roomInfo` has its own username-keyed lifecycle, and deleting it is what
converts a brief double-disconnect into `server_restart`.

**2.2 `clientSeqByPlayer` (#12).** Clear it in `removeSocket` alongside the socket maps.

**2.3 Protocol version (#7, #8).** `cmd-emitter.js` includes `protocolVersion: PROTOCOL_VERSION` in
the envelope; `socket-event-listeners.js:86` imports the constant instead of hardcoding `'2.0.0'`.
On mismatch the client must not fall through into a half-joined state — it already returns before
`systemState.isTwoPlayer = true` — so add the matching **server-side seat release**, otherwise the
player stays seated server-side while parked in the lobby.

**2.4 Surface `emitCmd` failures (#9).** `process-action.js` awaits the result and routes
`{success:false}` to `appendMessage` + `logSync`. No `.catch(() => {})`.

### §3 — Earn the flip (gated; do not start before Phases 0–2 are green)

**3.1 ID map (O3-C).** After `initializePlayerDeck`, the server emits to that player only:
`socket.emit('instanceMap', { roomId, map: { [syncInstance]: instanceId } })`. The client stores it
in a module-scoped `Map` in `dual-run-bridge.js` with `setInstanceMap` /
`resolveInstanceId(syncInstance)`. Every translator resolves through it. **Delete all three
positional-index fallbacks** — an unresolvable hint returns `null` (command not sent) and logs,
rather than guessing.

**3.2 Wire the renderer.** Pass `getZone` into the renderer via
`setDefaultNetcodeContext({ getZone })` rather than the `window.__getZone` global that nothing
sets; keep `options.getZone` as the test seam. Then the §0.2 guard starts passing and the renderer
goes live — which is also when findings #10 and #11 (intra-zone order, `attached-card` class)
become real and must be fixed in the same slice.

**3.3 Translation completeness.** Replace `default: return null` with an explicit disposition map
over all 58 `accept-action` keys: `'command' | 'relay-only' | 'ui-local'`. A key absent from the map
throws in development and logs in production. `shared/engine/commands.mjs:DISPOSITION_TABLE` already
catalogues the legacy actions (slice 3 deviation) — drive the check from it so the two cannot drift.

**3.4 `normalizeSpecialCondition`** returns `null` for unrecognised input instead of `'Poisoned'`;
callers reject rather than mislabel.

**3.5 Room-change reset and real desync detection.** Call `resetRenderState()` **and then**
re-invoke `setDefaultNetcodeContext(...)` in the `leaveRoom` click handler and on `joinGame`; also
`resetClientSeq(0)`. Note the trap in `apply-view.js:67-71`. Then implement `emitSyncCheck` to send
`hashState`-comparable zone hashes; the server compares against `hashState(gameRoom.state)` and
emits a `desync` event naming the first divergent zone. Only now is the heartbeat worth re-arming.

**3.6 Flip gate.** The flip is not a code change; it is passing this: a two-browser Playwright game
(`two-player-sync-test.mjs` extended) that plays to a win condition with the flag on, asserting
per-turn hash equality and zero `cmdRejected`. Only then does `render.yaml` change back.

---

## Edge cases & failure modes — Builder ticks every row

| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | `applyView` with no resolvable zones | returns `no_render_target`; no DOM write; `lastRenderedVersion` unchanged | [x] apply-view.test.mjs §0.2 guard tests |
| 2 | `applyView` with `view.stadium === null` while renderer inactive | `#stadium` untouched | [x] apply-view.test.mjs stadium-wipe repro |
| 3 | `resolveInstanceId` called with an unmapped `syncInstance` | returns `null`; command not emitted; logged | [ ] |
| 4 | `instanceMap` arrives after the first action | action is dropped with a surfaced message, not sent with a guessed id | [ ] |
| 5 | Both players disconnect simultaneously; sweep fires | room survives `ROOM_GRACE_MS`; reconnect resumes | [ ] |
| 6 | Peer log requested past the 200-action cap | falls through to the O2-C "reload and rejoin" announcement | [x] covered: `peer-log-catchup.test.mjs` "caps at PEER_LOG_MAX"; `peerLog` handler's `capped` branch |
| 7 | Peer never answers `requestPeerLog` | 5s timeout → O2-C announcement; no silent partial state | [x] `peerLogTimeout` in `requestPeerLogCatchup` (socket-event-listeners.js) — no test harness for socket timers, verified by reading the guard |
| 8 | Out-of-order `requestAction` arrives, gap closes within 2s | queued, then applied in counter order | [ ] |
| 9 | Out-of-order `requestAction`, gap never closes | 1.1 catch-up triggered once, not per action | [ ] |
| 10 | Reload → new room in the same tab | `resetRenderState` + context re-seed + `resetClientSeq`; first view applies | [ ] |
| 11 | Protocol mismatch on join | client stays in lobby **and** server releases the seat | [ ] |
| 12 | `emitCmd` returns `bad_command` | user-visible message; `logSync` entry | [ ] |
| 13 | Unrecognised special condition string | command rejected; no `'Poisoned'` substitution | [ ] |
| 14 | New action added to `accept-action` without a disposition | throws in dev, logs in prod — cannot silently no-op | [ ] |
| 15 | Spectator during any of the above | read-only; never emits `cmd` or peer-log replies | [ ] |
| 16 | Solo (1P) mode | untouched by every slice — `isTwoPlayer` guards all new paths | [ ] |

## Test plan

- **Unit** — `apply-view`: add a **non-injected** case that exercises the real `resolveZone`
  fallback and asserts `no_render_target`. This is the test class that was entirely missing and
  that let the flip ship. `dual-run-bridge`: map hit, map miss, map absent, condition rejection,
  disposition exhaustiveness against `DISPOSITION_TABLE`. `room.mjs`: sweep grace, `clientSeq`
  clearing.
- **Integration** — `server/game/__tests__/`: reconnect catch-up over the peer log including cap and
  timeout; sweep with both sockets absent; `instanceMap` round-trip producing a command that
  `findCard` resolves to the *correct owner's* card.
- **E2E** — `two-player-sync-test.mjs` gains (a) a Stadium-then-draw scenario asserting the Stadium
  survives, (b) a mid-game reload asserting recovery, (c) the 3.6 flip gate.
- **Manual** — one two-browser game per phase, flag off, ending in a win.

## Migration / rollout

Phases 0–2 ship with the flag **off**; they change only the path already in production, so each is
verifiable by `pnpm test` + `pnpm test:2p` + one manual two-browser game.

Revert paths. Each slice is one commit on `feature/netcode-repair`, so the primary undo is
`git revert <slice commit>`. The per-slice notes below are the *operational* undo — the change you
can make without a deploy when a revert would be slower than a config flip:

- 0.1 → restore the `!== '0' && !== 'false'` default; delete the `render.yaml` env line.
- 0.2 → delete `resolveRenderTargets` and its call; the guard is additive.
- 1.1 → remove the two listeners and two emitters; the server relay entries are inert without them.
- 1.2 → the queue is a new module; restoring the old exemption block is a paste of the current
  `socket-event-listeners.js:317-343`, preserved verbatim at the top of the new module's file
  comment for exactly this reason.
- 2.1 → `ROOM_GRACE_MS = 0` restores current behavior without a code revert.
- 3.x → the flag is off; nothing in Phase 3 reaches users until 3.6 passes.

Data: none of this touches SQLite. No migration.

## Work plan — slices ≤1 session, each leaving the repo green

| Slice | Delivers | Green when |
|---|---|---|
| 0.1 | Flag defaults off; `render.yaml` explicit | `pnpm test`; server boots with `SERVER_AUTHORITATIVE` unset and logs legacy mode |
| 0.2 | `resolveRenderTargets` guard + non-injected renderer test | New test fails without the guard; stadium-wipe repro no longer reproduces |
| 1.1 | Peer-log reconnect catch-up + O2-C fallback | Rows 6–7; manual reload recovers |
| 1.2 | Counter-ordered `requestAction` queue | Rows 8–9; `test:2p` green |
| 1.3 | Dead-scaffolding deletion | Full suite green; grep proves each removed event had no listener |
| 2.1 | Sweep grace + `roomInfo` decoupling | Row 5 |
| 2.2 | `clientSeq` clearing, protocol version, `emitCmd` surfacing | Rows 11–12 |
| 3.1 | `instanceMap` round-trip; index fallbacks deleted | Rows 3–4, ownership-correct integration test |
| 3.2 | Renderer wired to iframes; findings #10, #11 fixed | §0.2 guard passes; board renders from views |
| 3.3 | Disposition-map exhaustiveness over all 58 actions | Row 14 |
| 3.4 | Condition normalisation rejects unknowns | Row 13 |
| 3.5 | Room-change reset + `hashState` desync detection | Row 10; divergence test names the first bad zone |
| 3.6 | **Flip gate**: full two-browser game, flag on | Exit test passes; only then does `render.yaml` flip |

Phases 0–2 are seven slices of small, reversible work against the path that is actually in
production. Phase 3 is the real migration tail and should be re-scoped after Phase 2 lands.

## Deviations (Builder appends here during build)

- 0.2: `dual-run-sync.test.mjs`'s `applyView` calls previously had no injected zone
  resolver, so they were unknowingly exercising the blind-renderer bug (returned
  `applied: true` while rendering nothing). Not in the original slice scope, but the
  guard correctly turned it into a failing assertion (`false !== true`), so it needed a
  fix, not a design change: added minimal `StubElement`/`StubDocument`/`makeGetZone`
  helpers local to that test file so the integration assertion stays meaningful.
- 1.1: extracted the peer-log request/response/replay logic into a new pure module
  `client/src/setup/netcode/peer-log-catchup.js` (no DOM/socket globals), following the
  existing `cmd-emitter.js` pattern — `socket-event-listeners.js` alone can't be unit
  tested without heavy DOM mocking. Also refactored the `pushAction` handler's inline
  apply-and-log body into a shared `applyPeerAction` so live traffic and catch-up replay
  run identical code, per the design's "replays through the existing pushActionQueue
  chain" requirement. Both are implementation detail, not scope changes.
