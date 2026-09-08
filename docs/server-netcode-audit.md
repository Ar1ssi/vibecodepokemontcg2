# Server-Side Netcode Rework Audit Findings

A thorough architectural and code-level sweep of the server-side netcode rework (Slices 1–7 across [`server/`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server), [`shared/engine/`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine), and the client netcode bridge in [`client/src/setup/netcode/`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode)) was performed.

While the core pure state models and unit test coverage are broad (912 passing tests), the sweep uncovered **7 Critical**, **5 High**, and **4 Medium** issues. These include private deck information leaks, two game-freezing deadlocks, card identity collisions, and broken parameter bridges that will block Phase 3 rollout.

---

### Critical Issues (Must Fix Before Phase 3 / Flip)

#### 1. Information Leak of Secret Deck Options in Broadcast Socket Payload (Invariant 5 Violation) — [RESOLVED]
* **Location**: [`server/server.js:644-653`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L644-L653), [`server/server.js:683-692`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L683-L692), [`server/server.js:695-715`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L695-L715)
* **Root Cause**: [`viewFor(state, playerId)`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/view.mjs#L121-L128) correctly redacts secret deck search options inside `view.pendingChoice`. However, in [`server/server.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js), socket broadcast payloads attached the raw, unredacted `pendingChoice: result.pendingChoice` (and `gameRoom.state.pendingChoice` in `requestView`) directly at the top level to **all** sockets (both players and spectators).
* **Impact**: When Player 1 searches their deck (e.g. Ultra Ball), Player 2 and all spectators receive the raw `pendingChoice.options` array containing Player 1's secret deck cards over the wire, violating Invariant 5.
* **Fix**: Replaced top-level `pendingChoice` with `broadcast.view?.pendingChoice || null` in socket broadcast loops and `view?.pendingChoice || null` in `requestView`. Opponents and spectators receive redacted choices without `.options`. Verified by `server/game/__tests__/broadcast-redaction.test.mjs`.

#### 2. Opponent Pending Choice Deadlock via Blanket Turn Player Check — [RESOLVED]
* **Location**: [`shared/engine/reduce.mjs:426-428`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L426-L428)
* **Root Cause**: In [`validateLegality`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L414):
  ```javascript
  // Turn player validation
  if (state.turn?.player && state.turn.player !== playerId) {
    return { allowed: false, reason: "It's not your turn." };
  }
  ```
  This check unconditionally executed for **all** commands when `rulesEnabled === true`, including `resolveChoice`.
* **Impact**: When an effect requires the opponent to make a choice during the active player's turn (e.g. Repel / `switchOpponentOut`, defending player discards, etc.), the pending choice recipient is `opponent.playerId`. When the opponent emits `resolveChoice`, [`validateLegality`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L414) rejected it with `"It's not your turn."`. The active player could not resolve it due to Edge Case 11 (`not_your_choice`), permanently deadlocking the game.
* **Fix**: Removed the redundant blanket turn check at lines 426-428. Turn-based player actions remain strictly protected by lines 445-449, while non-turn responses like `resolveChoice` can execute for the prompted player (with Step 2 in `applyCommand` enforcing `state.pendingChoice.player === playerId`). Verified by `shared/engine/__tests__/edge-cases-slice6.test.mjs`.

#### 3. Non-Unique `instanceId` Minting Across Players Corrupting Card Resolution & DOM — [RESOLVED]
* **Location**: [`server/game/shadow.mjs:28-66`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/shadow.mjs#L28-L66), [`server/server.js:583`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L583)
* **Root Cause**: [`initializePlayerDeck`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/shadow.mjs#L28) reset `syncInstance = 0` and set `instanceId: syncInstance` for each player. When called on `gameRoom.state`, Player 1 and Player 2 were both given identical `instanceId`s `[0..59]`.
* **Impact**:
  1. [`findCard(state, instanceId)`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/state.mjs#L131) iterates Player 1 first. Any command from Player 2 targeting their own card resolved to Player 1's card, triggering `cardRef.playerId !== playerId` in [`validateReferences`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L252) and rejecting Player 2's moves with `stale_view`.
  2. The client DOM reconciler [`apply-view.js:11, 99`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/apply-view.js#L11) stores cards in a single `cardRegistry = new Map<instanceId, record>()`, causing Player 1's and Player 2's DOM card elements to overwrite each other.
* **Fix**: Imported and utilized [`mintInstanceId(state)`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/cards.mjs#L12) in [`initializePlayerDeck`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/shadow.mjs#L28), ensuring all card instances are monotonically unique across the entire `GameState` while maintaining `syncInstance` for client sequencing. Verified by `server/game/__tests__/shadow.test.mjs`.

#### 4. Parameter Offset Bug in `exchangeData` Leaving Decks Empty on Authoritative Server — [RESOLVED]
* **Location**: [`server/server.js:578-584`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L578-L584)
* **Root Cause**: In [`server.js:580`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L580):
  ```javascript
  const deckData =
    data.action === 'exchangeData'
      ? data.parameters?.[2]
      : data.parameters?.[1];
  ```
  In [`client/src/setup/deck-constructor/exchange-data.js:64-71`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/deck-constructor/exchange-data.js#L64-L71), `parameters` are `[username, deckData, cardBack, ...]`. Index 1 is `deckData`, while index 2 is `cardBack` (a string URL).
* **Impact**: `Array.isArray(data.parameters[2])` evaluates to `false`. [`initializePlayerDeck`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/shadow.mjs#L28) is never called for `exchangeData`. Players' decks on the authoritative server remain completely empty `[]`, causing immediate 0-card opening hands and deck-out losses.
* **Fix**: Implemented and exported [`extractDeckData(action, parameters)`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/shadow.mjs) which properly extracts `parameters[1]` for `exchangeData` and `parameters[0]` (with legacy `parameters[1]` fallback) for `loadDeckData`. Used in both [`server/server.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js) and `shadow.mjs`. Verified by `server/game/__tests__/exchange-data-params.test.mjs`.

#### 5. Missing Socket/Room Context in `applyView` Choice Resolver Breaking Modal Confirm — [RESOLVED]
* **Location**: [`client/src/setup/netcode/apply-view.js:394-440`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/apply-view.js#L394-L440), [`client/src/initialization/socket-event-listeners/socket-event-listeners.js:72-80, 248-256`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/initialization/socket-event-listeners/socket-event-listeners.js#L72-L80)
* **Root Cause**: In [`apply-view.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/apply-view.js), clicking "Confirm" checks `else if (options.socket && options.roomId) emitResolveChoice(...)`. But in [`socket-event-listeners.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/initialization/socket-event-listeners/socket-event-listeners.js), `applyView(data.view, data.events || [])` was called without `options`.
* **Impact**: Clicking "Confirm" in the choice modal removes the modal DOM but emits no socket event to the server. The server remains blocked forever on `pendingChoice`.
* **Fix**:
  1. Updated `socket-event-listeners.js` to pass `{ socket, roomId: systemState.roomId }` into `applyView` in `socket.on('view')`.
  2. Registered default netcode context in `socket-event-listeners.js` initialization via `setDefaultNetcodeContext`.
  3. Exported `setDefaultNetcodeContext` and `getDefaultNetcodeContext` in `apply-view.js`, with an asynchronous fallback `resolveNetcodeContext` that resolves defaults and dynamically queries browser state. Verified by `client/src/setup/netcode/__tests__/apply-view.test.mjs`.

#### 6. Client Sequence Number (`clientSeq`) Reset on Page Refresh Causing Silently Dropped Commands — [RESOLVED]
* **Location**: [`client/src/setup/netcode/cmd-emitter.js:7`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/cmd-emitter.js#L7), [`server/game/room.mjs:151-163`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/room.mjs#L151-L163), [`server/server.js:636-716`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L636-L716), [`client/src/initialization/socket-event-listeners/socket-event-listeners.js:248`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/initialization/socket-event-listeners/socket-event-listeners.js#L248)
* **Root Cause**: `clientSeq` in [`cmd-emitter.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/cmd-emitter.js) is an in-memory counter reset to 0 on browser reload. The server's [`GameRoom`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/room.mjs#L15) retains `lastSeenClientSeq` (e.g., 20).
* **Impact**: After a page refresh, the user's first 20 commands have `cmd.clientSeq <= lastSeq`. The server treats all of them as duplicates (`dedupe: true`) and discards them without applying them.
* **Fix**:
  1. Updated `GameRoom.prototype.addPlayer` in [`server/game/room.mjs`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/room.mjs) to reset `clientSeqByPlayer` and clean up previous socket mappings when a new socket registers for an existing player (e.g. after a page reload or reconnect).
  2. Added `getClientSeq` and `resetClientSeq` methods to `GameRoom`.
  3. Included recipient-tailored `lastClientSeq` in command broadcast payloads, dedupe responses, and `requestView` responses across [`server/server.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js) and `room.mjs`.
  4. Implemented and exported `seedClientSeq(serverSeq)` in [`client/src/setup/netcode/cmd-emitter.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/cmd-emitter.js) to advance client-side sequence tracking from server responses without regression.
  5. Wired `socket.on('view')` in [`client/src/initialization/socket-event-listeners/socket-event-listeners.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/initialization/socket-event-listeners/socket-event-listeners.js) to seed sequence tracking upon receiving authoritative view snapshots. Verified by `server/game/__tests__/client-seq-resync.test.mjs`, `server/game/__tests__/room.test.mjs`, and `client/src/setup/netcode/__tests__/cmd-emitter.test.mjs`.

#### 7. Identity Swap & Seat Hijacking Vulnerability on Reconnect — [RESOLVED]
* **Location**: [`server/server.js:404-450`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L404-L450), [`server/server.js:470-520`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L470-L520), [`server/server.js:292-317`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L292-L317), [`server/game/room.mjs:60-95`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/room.mjs#L60-L95)
* **Root Cause**: In `socket.on('joinGame')`, player ID allocation was computed strictly from active connected sockets (`const existingPids = [...gameRoom.playerToSocket.keys()]`), causing a reconnecting player to be assigned `p1` if Player 1 had dropped. Furthermore, unintended socket drop removed users from `room.players`, leaving the room open for 3rd-party players to hijack Player 1's seat and permanently lock them out.
* **Impact**: Disconnected players had their identities and game state swapped with their opponent upon reconnect, or had their seat completely stolen by a new visitor.
* **Fix**:
  1. Implemented `getPlayerIdByUsername(username)` and `getNextAvailablePlayerId()` on `GameRoom` and `ShadowSession`.
  2. Guarded `GameRoom.prototype.addPlayer` against username mismatch on existing player seats (preventing seat hijacking at the engine authority level).
  3. Updated `joinGame` and `userReconnected` to match `username` against `gameRoom.state.players` before allocating a seat; unauthorized 3rd-party players attempting to join a full 2-player game are rejected with `roomReject` (spectator joins remain allowed).
  4. Preserved seated players in `room.players` on unintended disconnections in `disconnectHandler` (clearing only on explicit `leaveRoom` or when empty rooms expire via `cleanUpEmptyRooms`). Verified by `server/game/__tests__/identity-reconnect.test.mjs`.

---

### High Severity Issues

#### 8. Parameter Offset Scrambling in `dual-run-bridge.js` for Damage and Status Commands — [RESOLVED]
* **Location**: [`client/src/setup/netcode/dual-run-bridge.js:110-163`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/dual-run-bridge.js#L110-L163)
* **Root Cause**: [`dual-run-bridge.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/dual-run-bridge.js#L112) assumed `parameters` starts with `user`, destructuring `const [, , index, amount] = parameters`. However, [`processAction`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/general/process-action.js) passes `[zoneId, resolvedIndex, amount, hint]`.
  - In `updateDamageCounter`: `instanceId` received `damageAmount` and `amount` received the `hint` object (`NaN` -> 0).
  - In `addSpecialCondition`: `instanceId` received `condition` (`NaN` -> 0) and `condition` received `hint` (`"[object Object]"`), which [`COMMAND_SCHEMAS`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/commands.mjs#L135) rejects as an invalid special condition.
  - In `retreat`: [`dual-run-bridge.js:87`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/dual-run-bridge.js#L87) emitted `{ targetBenchInstanceId }`, while the schema and [`reduce.mjs`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L322) expect `{ benchInstanceId }`. Retreat clicks always fell back to retreating into the first benched Pokémon.
* **Fix**:
  1. Implemented `unpackTargetAndAmount` and `unpackTargetAndCondition` in [`dual-run-bridge.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/dual-run-bridge.js) supporting both legacy positional formats (`[zoneId, resolved, amount/condition, hint]`), prefixed user formats, and direct command payload shapes while extracting `instanceId` from `hint.syncInstance` / `hint.instanceId` / index.
  2. Implemented `normalizeSpecialCondition` to map legacy codes (`'P'`, `'B'`, `'A'`, `'PA'`, `'C'`) and aliases to canonical engine condition strings, properly mapping empty/zero conditions to `null`.
  3. Added `updateSpecialCondition` translation support.
  4. Updated `retreat` to emit `{ benchInstanceId }` when a target is provided, and empty `{}` when omitted (preserving auto-fallback to first benched Pokémon).
  5. Updated `useAbility` to parse `[oInitiator, zoneId, resolved, hint]` legacy arrays alongside direct `[instanceId, abilityIndex]`. Verified by `client/src/setup/netcode/__tests__/dual-run-bridge.test.mjs`.

#### 9. Bench Knockouts Do Not Discard Victim and Auto-Promote Illegally — [RESOLVED]
* **Location**: [`shared/engine/reduce.mjs:41-80`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L41-L80), [`shared/engine/reduce.mjs:1030-1037, 1109-1116`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L1030-L1037)
* **Root Cause**: [`handleKnockout`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L26) searched for `victim` only in `draft.players[victimPlayerId].zones.active`. Furthermore, it unconditionally executed the bench auto-promotion block regardless of whether the victim was active or benched.
* **Impact**: If a benched Pokémon was knocked out by bench snipe damage, it was never removed from `bench` or moved to `discard`. In addition, a benched Pokémon was auto-promoted into `active`, resulting in the defending player having two active Pokémon simultaneously.
* **Fix**:
  1. Updated `handleKnockout` in [`shared/engine/reduce.mjs`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs) to determine whether the victim was in `active` or `bench` (with a fallback via `findCard`).
  2. Discarded the victim and any cards attached to it (`c.instanceId === victim.instanceId || c.attachedTo === victim.instanceId`) from its respective zone into `victimDiscard`, resetting damage, special conditions, and attachments.
  3. Guarded auto-promotion with `if (wasActive)` so auto-promotion only triggers when the active Pokémon is knocked out, leaving the defending player's active spot untouched on bench knockouts.
  4. Derived `defenderPlayerId` from `targetRef?.playerId` in the `attack` command reducer so attacks targeting benched Pokémon pass the correct owner ID to `handleKnockout`. Verified by `shared/engine/__tests__/attack-ko.test.mjs`.

#### 10. Missing Initiator Attribution in `PendingChoice.resumeToken` — [RESOLVED]
* **Location**: [`shared/engine/effects/executor.mjs:156-164`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/effects/executor.mjs#L156-L164), [`shared/engine/reduce.mjs:1330-1368`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L1330-L1368), [`shared/engine/effects/trainer.mjs:37-85`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/effects/trainer.mjs#L37-L85), [`shared/engine/effects/ability.mjs:24-61`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/effects/ability.mjs#L24-L61), [`shared/engine/effects/stadium.mjs:22-59`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/effects/stadium.mjs#L22-L59)
* **Root Cause**: `resumeToken` recorded `effectType`, `sourceInstanceId`, and `steps`, but omitted `initiatorPlayerId`. When `resolveChoice` resumed, [`reduce.mjs:1342`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L1342) passed `playerId` (the player resolving the choice) to [`executeTrainer`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/effects/trainer.mjs#L37).
* **Impact**: If Player 2 answered a choice caused by Player 1's trainer (such as Repel prompting Player 2 to choose a bench replacement), subsequent effect steps and card cleanup from `board` to `discard` executed against Player 2's zones instead of Player 1's, leaving Player 1's trainer stuck in `board`.
* **Fix**:
  1. Updated `createPendingChoice` in [`shared/engine/effects/executor.mjs`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/effects/executor.mjs) and all step choice definitions (`discardCost`, `searchDeck`, `switchActive`, `switchOpponent`, `recursion`, `heal`, `attachFromDiscard`) to include `initiatorPlayerId: playerId` in `resumeToken`.
  2. Updated `resolveChoice` in [`shared/engine/reduce.mjs`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs) to extract `initiatorPlayerId = token.initiatorPlayerId || resumeCardOwnerId || playerId` and pass it to `executeTrainer`, `executeAbility`, and `executeStadium`.
  3. Updated `executeTrainer`, `executeAbility`, and `executeStadium` to respect `resumeToken.initiatorPlayerId` as `actingPlayerId`.
  4. Added fallback search in `executeTrainer` to ensure trainer cards on board are accurately located and moved to the initiator's discard zone upon effect completion. Verified by `shared/engine/__tests__/pending-choice.test.mjs`.

#### 11. Missing Deduplication Handling in Socket `resolveChoice` — [RESOLVED]
* **Location**: [`server/server.js:726-735`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L726-L735), [`server/game/room.mjs:328-335`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/room.mjs#L328-L335)
* **Root Cause**: In `socket.on('resolveChoice')`, deduplication responses were previously unhandled or hardcoded `pendingChoice: null`. In addition, `GameRoom.prototype.resolveChoice` defaulted `clientSeq` to `null` if omitted as a separate 3rd argument, failing to extract `payload.clientSeq`.
* **Fix**:
  1. Updated `GameRoom.prototype.resolveChoice` in [`server/game/room.mjs`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/room.mjs) to extract `clientSeq` from either the 3rd argument or `payload.clientSeq`.
  2. Updated `result.dedupe` handling in both `socket.on('cmd')` and `socket.on('resolveChoice')` in [`server/server.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js) to preserve `pendingChoice: result.view?.pendingChoice || null` instead of clearing it to `null`.
  3. Added comprehensive unit and socket tests in [`server/game/__tests__/resolve-choice-dedupe.test.mjs`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/__tests__/resolve-choice-dedupe.test.mjs) verifying deduplication across both `GameRoom` and Socket.IO handler layers.

#### 12. Missing `gameEnded` Socket Notification & Client Win/Loss Handling — [RESOLVED]
* **Location**: [`server/server.js:619-629`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L619-L629), [`client/src/setup/netcode/apply-view.js:378-463`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/apply-view.js#L378-L463)
* **Root Cause**: When a player takes all prizes or a deck-out occurs, [`setGameEnded`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L223) pushes an event to `events`. However, the server never emits the specified `gameEnded` socket event, and [`applyView`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/apply-view.js#L378) has no handling for `view.turn.phase === 'ended'`.
* **Impact**: Players receive no end-game announcement, and further actions fail with a raw `"Game is over."` rejection.
* **Fix**:
  1. Exposed authoritative `winner` and `winReason` in [`shared/engine/state.mjs`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/state.mjs) and [`shared/engine/view.mjs`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/view.mjs) so all client view snapshots reliably reflect game completion state.
  2. Implemented `GameRoom.prototype.getGameEndedPayload(playerId)` in [`server/game/room.mjs`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/room.mjs) generating tailored `gameEnded` payloads (`{ winner, reason, message }`) for winners, losers, and spectators.
  3. Updated [`server/server.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js) to emit `gameEnded` notifications to all room sockets in `broadcastGameResult` on game-ending commands or choices, on command deduplication, and in `requestView` responses.
  4. Implemented `reconcileGameEnded` in [`client/src/setup/netcode/apply-view.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/apply-view.js) to mount a styled modal (`#netcodeEndModal`) displaying Victory or Defeat, synchronize existing `#rulesEndScreen` markup, and dispatch `rules-game-ended` events with cleanup when active games continue.
  5. Enhanced `socket.on('gameEnded')` in [`client/src/initialization/socket-event-listeners/socket-event-listeners.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/initialization/socket-event-listeners/socket-event-listeners.js) to display end-game announcements and synchronize `#rulesEndScreen`. Verified by `server/game/__tests__/game-ended-notification.test.mjs` and `client/src/setup/netcode/__tests__/apply-view.test.mjs`.

---

### Medium Severity Issues

#### 13. Paralysis Cured Prematurely Between Turns
* **Location**: [`shared/engine/reduce.mjs:131-134`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L131-L134)
* **Root Cause**: In [`resolveCheckup`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L100), Paralysis is cleared for both players at the end of every turn. Under official PTCG rules, Paralysis is only cured at the end of the paralyzed player's turn. Because checkup runs when the attacker finishes their attack, the defender's paralysis is cleared before their turn even starts.

#### 14. Overwritten Stadium Cards Erased Without Discarding
* **Location**: [`shared/engine/effects/trainer.mjs:92-93`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/effects/trainer.mjs#L92-L93)
* **Root Cause**: When a new Stadium is played, `draft.stadium = played` replaces the previous stadium. The existing stadium card is never moved to its owner's `discard` zone.

#### 15. Bench Limit (Edge Case 9) Bypassed by Deck-to-Bench Searches
* **Location**: [`shared/engine/effects/executor.mjs:183-187`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/effects/executor.mjs#L183-L187)
* **Root Cause**: In `searchDeck` when `dest === 'bench'`, cards are pushed to `bench` without verifying `bench.length < 5`, allowing searches like Nest Ball to overfill the bench past the 5-card maximum.

#### 16. Asleep Attacker Infinite Attack Reroll Exploit
* **Location**: [`shared/engine/reduce.mjs:509-512`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L509-L512), [`shared/engine/reduce.mjs:1064-1074`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L1064-L1074)
* **Root Cause**: [`validateLegality`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L499) checks `Paralyzed` for `attack`, but not `Asleep`. When an asleep Pokémon attacks, it flips a coin to wake up; on tails, it executes `break;` before marking `attackerAttacked = true` or ending the turn, allowing the player to repeatedly click Attack until they roll heads.

---

### Suggested Action Plan

Before proceeding to Slice 8 (Phase 3 flip & deletion pass):
1. [x] Patch the **redaction leak** in [`server/server.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js) so `broadcast.view.pendingChoice` is the sole choice payload emitted.
2. [x] Fix the **turn-player check** in [`shared/engine/reduce.mjs:426`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L426) to allow `resolveChoice` from the non-turn player.
3. [x] Update [`initializePlayerDeck`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/shadow.mjs#L28) to use [`mintInstanceId`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/cards.mjs#L12).
4. [x] Fix parameter offset from index 2 to index 1 for `exchangeData` in [`server.js:583`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L583).
5. [x] Provide default `socket` and `roomId` fallbacks in [`client/src/setup/netcode/apply-view.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/apply-view.js).
6. [x] Synchronize client sequence (`clientSeq`) tracking on reconnect/refresh and in view snapshots (Finding 6).
7. [x] Resolve identity preservation and seat hijacking on reconnect via `state.players` matching and seat reservation (Finding 7).
8. [x] Fix parameter unpacking in [`client/src/setup/netcode/dual-run-bridge.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/dual-run-bridge.js).
9. [x] Fix bench knockout discarding and illegal auto-promotion in [`handleKnockout`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L26) (Finding 9).
10. [x] Preserve initiator attribution in `PendingChoice.resumeToken` and route choice resumption to initiator (Finding 10).
11. [x] Implement robust deduplication handling for socket `resolveChoice` and `GameRoom.prototype.resolveChoice` with active choice preservation (Finding 11).
12. [x] Implement `gameEnded` socket notification broadcast and client win/loss reconciliation (Finding 12).