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

#### 5. Missing Socket/Room Context in `applyView` Choice Resolver Breaking Modal Confirm
* **Location**: [`client/src/setup/netcode/apply-view.js:353-364`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/apply-view.js#L353-L364), [`client/src/initialization/socket-event-listeners/socket-event-listeners.js:252-256`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/initialization/socket-event-listeners/socket-event-listeners.js#L252-L256)
* **Root Cause**: In [`apply-view.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/apply-view.js#L357), clicking "Confirm" checks `else if (options.socket && options.roomId) emitResolveChoice(...)`. But in [`socket-event-listeners.js:254`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/initialization/socket-event-listeners/socket-event-listeners.js#L254), `applyView(data.view, data.events || [])` is called without `options`.
* **Impact**: Clicking "Confirm" in the choice modal removes the modal DOM but emits no socket event to the server. The server remains blocked forever on `pendingChoice`.
* **Fix**: Import `socket` and `systemState` in [`apply-view.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/apply-view.js) as default fallbacks when `options` are omitted, or pass them from [`socket-event-listeners.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/initialization/socket-event-listeners/socket-event-listeners.js).

#### 6. Client Sequence Number (`clientSeq`) Reset on Page Refresh Causing Silently Dropped Commands
* **Location**: [`client/src/setup/netcode/cmd-emitter.js:7`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/cmd-emitter.js#L7), [`server/game/room.mjs:151-163`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/room.mjs#L151-L163)
* **Root Cause**: `clientSeq` in [`cmd-emitter.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/cmd-emitter.js) is an in-memory counter reset to 0 on browser reload. The server's [`GameRoom`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/room.mjs#L15) retains `lastSeenClientSeq` (e.g., 20).
* **Impact**: After a page refresh, the user's first 20 commands have `cmd.clientSeq <= lastSeq`. The server treats all of them as duplicates (`dedupe: true`) and discards them without applying them.
* **Fix**: Include the player's `lastClientSeq` in the `view` / `requestView` response so the client can seed `clientSeq = Math.max(clientSeq, serverLastSeq)`, or reset `clientSeqByPlayer` when a new socket registers in [`addPlayer`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/room.mjs#L60).

#### 7. Identity Swap & Seat Hijacking Vulnerability on Reconnect
* **Location**: [`server/server.js:404-407`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L404-L407), [`server/server.js:291-305`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L291-L305)
* **Root Cause**: In `socket.on('joinGame')`, the next player ID is computed strictly from active sockets:
  ```javascript
  const existingPids = [...gameRoom.playerToSocket.keys()];
  const nextPid = existingPids.includes('p1') ? 'p2' : 'p1';
  ```
  Unlike `userReconnected`, `joinGame` does not check if `username` already exists in `gameRoom.state.players`.
* **Impact**: If Player 1 temporarily drops and Player 2 reconnects via `joinGame`, Player 2 is assigned `p1` (stealing Player 1's cards and board). Furthermore, when Player 1 drops, `room.players.delete(username)` runs, allowing a third player to join as a player, take over Player 1's seat, and permanently lock Player 1 out.
* **Fix**: Match `username` against `gameRoom.state.players` in `joinGame` before allocating a new `nextPid`.

---

### High Severity Issues

#### 8. Parameter Offset Scrambling in `dual-run-bridge.js` for Damage and Status Commands
* **Location**: [`client/src/setup/netcode/dual-run-bridge.js:110-163`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/dual-run-bridge.js#L110-L163)
* **Root Cause**: [`dual-run-bridge.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/dual-run-bridge.js#L112) assumes `parameters` starts with `user`, destructuring `const [, , index, amount] = parameters`. However, [`processAction`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/general/process-action.js) passes `[zoneId, resolvedIndex, amount, hint]`.
  - In `updateDamageCounter`: `instanceId` receives `damageAmount` and `amount` receives the `hint` object (`NaN` -> 0).
  - In `addSpecialCondition`: `instanceId` receives `condition` (`NaN` -> 0) and `condition` receives `hint` (`"[object Object]"`), which [`COMMAND_SCHEMAS`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/commands.mjs#L135) rejects as an invalid special condition.
  - In `retreat`: [`dual-run-bridge.js:87`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/dual-run-bridge.js#L87) emits `{ targetBenchInstanceId }`, while the schema and [`reduce.mjs`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L322) expect `{ benchInstanceId }`. Retreat clicks always fall back to retreating into the first benched Pokémon.

#### 9. Bench Knockouts Do Not Discard Victim and Auto-Promote Illegally
* **Location**: [`shared/engine/reduce.mjs:41-79`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L41-L79)
* **Root Cause**: [`handleKnockout`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L26) searches for `victim` only in `draft.players[victimPlayerId].zones.active`.
* **Impact**: If a benched Pokémon is knocked out by bench snipe damage, it is never removed from `bench` or moved to `discard`. Furthermore, line 65 unconditionally auto-promotes a benched Pokémon to active, resulting in the defending player having two active Pokémon simultaneously.

#### 10. Missing Initiator Attribution in `PendingChoice.resumeToken`
* **Location**: [`shared/engine/effects/executor.mjs:156-164`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/effects/executor.mjs#L156-L164), [`shared/engine/reduce.mjs:1319-1327`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L1319-L1327)
* **Root Cause**: `resumeToken` records `effectType`, `sourceInstanceId`, and `steps`, but omits `initiatorPlayerId`. When `resolveChoice` resumes, [`reduce.mjs:1322`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L1322) passes `playerId` (the player resolving the choice) to [`executeTrainer`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/effects/trainer.mjs#L37).
* **Impact**: If Player 2 answers a choice caused by Player 1's trainer, subsequent effect steps and card cleanup from `board` to `discard` execute against Player 2's zones instead of Player 1's, leaving Player 1's trainer stuck in `board`.

#### 11. Missing Deduplication Handling in Socket `resolveChoice`
* **Location**: [`server/server.js:646-664`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L646-L664)
* **Root Cause**: `socket.on('cmd')` handles `else if (result.dedupe)` by echoing the current view back to the socket. In `socket.on('resolveChoice')`, there is no check for `result.dedupe`. When `result.dedupe === true`, `result.broadcasts` is `undefined`, sending no response back to the client.

#### 12. Missing `gameEnded` Socket Notification & Client Win/Loss Handling
* **Location**: [`server/server.js:619-629`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/server.js#L619-L629), [`client/src/setup/netcode/apply-view.js:378-463`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/apply-view.js#L378-L463)
* **Root Cause**: When a player takes all prizes or a deck-out occurs, [`setGameEnded`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L223) pushes an event to `events`. However, the server never emits the specified `gameEnded` socket event, and [`applyView`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/apply-view.js#L378) has no handling for `view.turn.phase === 'ended'`.
* **Impact**: Players receive no end-game announcement, and further actions fail with a raw `"Game is over."` rejection.

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
5. [ ] Provide default `socket` and `roomId` fallbacks in [`client/src/setup/netcode/apply-view.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/apply-view.js).
6. [ ] Fix parameter unpacking in [`client/src/setup/netcode/dual-run-bridge.js`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/dual-run-bridge.js).