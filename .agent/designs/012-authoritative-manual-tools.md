# 012: Manual board tools under server authority
Status: shipped — scope "fix 1-6" from the S171 netcode gap diagnosis; item 6 shape chosen by user
Date: 2026-09-17 · Session: S171

## Problem
Under SERVER_AUTHORITATIVE 2P, six manual tools are dropped or broken:
1. rotate / change type / remove ability marker never reach the server.
2. "play random card face down" has no server command at all.
3. manual damage counters and special conditions on server-drawn Pokémon send nothing.
4. counters/conditions on the opponent's Pokémon are routed through the opponent's client (off-turn → rejected).
5. Restart wipes only the local board; the server keeps the old game.
6. Looking at the top/bottom N deck cards shows a stale client copy of the deck.

## Constraints
- D12: a server_command action gates its legacy body and addresses cards by server instanceId from
  apply-view's `cardRegistry`, never legacy `zoneArrays` (empty under authority — verified live S171:
  legacy hand 0 vs view 7, legacy deck 14 stale).
- D36: legacy renderer never writes server-drawn zone DOM.
- Invariant 5 / view.mjs: never leak hidden info (deck contents, opponent hand, face-down cards).
- Relay mirror of any `server_command`/`manual_override` action is suppressed (isMirrorSuppressedAction),
  so a missing server path loses the action on both screens.
- Legacy mode must keep its current behavior (fail open when not authoritative or card not server-drawn).

## Current state
- `client/src/actions/keybinds/keybinds.js` — card keybinds read `mouseClick.card.image.*`; `mouseClick.card`
  resolves through legacy arrays, so it is undefined for server cards (TypeError on digit/0/y/r keys).
- `.../card-context-menu/active-bench-buttons.js`, `hand-buttons.js` — context-menu buttons call legacy actions by index.
- `client/src/setup/netcode/dual-run-bridge.js` — legacy action → command; no case for rotateCard,
  changeType, removeAbilityCounter, playRandomCardFaceDown (default branch warns, returns null).
- `client/src/setup/netcode/authoritative-dispatch.js` — `emitAuthoritativeCommand(action, params)` →
  translate check → `processAction('self', true, …)` (pushAction relay + emitCmd).
- `client/src/setup/general/process-action.js` — only `user === 'self'` emits a command; 'opp' uses requestAction.
- `shared/engine/reduce.mjs` — reducers exist for counters/conditions/removeAbilityCounter/changeType/rotateCard;
  cross-player targeting allowed in public zones (validateReferences); rules mode gates counters to the turn player.
- `shared/engine/view.mjs` — deck always `{count}`; board cards always public.
- `client/src/actions/general/restart.js` — resets both sides locally, never emits.
- `server/server.js` — pushAction `reset` with `parameters[0] === false` → `resetGameOnPlayerRequest` (emits `gameReset`).
- `client/src/actions/zones/deck-actions.js` `viewDeck` — moves legacy deck cards into legacy `viewCards`.

## Options
- **Where to gate (1,3,4):** A) inside each legacy action (reads `mouseClick` global) · B) one authoritative
  card-key/menu module at the UI entry that plans a command from the registry record and emits it as `self`.
  Pick **B**: legacy actions are index-addressed and their `user` param would still route 'opp' via requestAction;
  the UI entry already has `mouseClick.cardInstanceId`, and the planner can be pure and unit-tested.
- **Random face down (2):** A) client picks index and sends moveCard + hide · B) server command picks with seeded RNG.
  Pick **B**: a client-chosen "random" card is not random, and face-down state must be server-owned to redact it.
- **Face-down redaction:** A) new zone · B) `card.faceDown` flag, redacted in board for everyone until `revealed`.
  Pick **B**; flag cleared by the reducer whenever the card is no longer on the board (end-of-command sweep).
- **Restart (5):** A) new server command · B) reuse the player-requested reset (`reset` pushAction, clean=false).
  Pick **B**: the server path already resets both seats and notifies both clients.
- **Deck look (6):** user picked peek-in-place: socket request `peekDeck` answered to the requester only (no state
  change, no commandLog entry); client shows cards in the card picker; picked cards move deck→hand via `moveCard`.
  Opponent's deck: allowed only when rules are off; view-only (server moveCard forbids other players' zones).

## Design
### Client: `client/src/setup/netcode/manual-card-commands.mjs` (pure)
`planCardKeyCommand({ key, alt, zoneId, card })` → `{ action, params } | { handled: true } | null`
- `card` = registry view data `{ instanceId, damage, conditions?, specialCondition?, abilityUsed, rotation }`.
- digit 1-9, zone active/bench: damage 0 → `addDamageCounter [{instanceId, amount: n*10}]`;
  else new = damage ± n*10 (alt subtracts); new ≤ 0 → `updateDamageCounter [{instanceId, amount: 0}]`, else amount new.
- `0` with damage > 0 → `updateDamageCounter amount 0`.
- `y` on active: no condition → `addSpecialCondition Poisoned`; alt → `removeSpecialCondition` (all);
  else cycle rotation condition P→B→Pa→C→A→P using `addSpecialCondition` (server stacks Poison/Burn, replaces rotation).
  Cycle order is legacy's; server conditions list read via `listConditions`-shaped `card.conditions`.
- `r` (stadium/active/bench): `rotateCard [{instanceId, rotation: (rotation+90)%360}]`; alt-r (active/bench): toggle 0↔90.
- alt-e / alt-t / alt-p: `changeType [{instanceId, type: 'Energy'|'Trainer'|'Pokémon'}]`.
- `w` with abilityUsed → `removeAbilityCounter [{instanceId}]` (without it the existing useAbility gate runs).
`planMenuCommand(button, card)` for context-menu buttons: damageCounter → add 10; specialCondition → add Poisoned;
abilityCounter (used) → removeAbilityCounter; changeTo* → changeType.

### Client adapter: `client/src/setup/netcode/manual-card-dispatch.js`
`dispatchServerCardKey(event)` / `dispatchServerCardMenu(button)`: active only when
`isAuthoritativeDispatchActive()` and `mouseClick.cardInstanceId` resolves in `getCardRegistry()`; calls
`emitAuthoritativeCommand(action, params)` (always as `self`, so opp targets go straight to the server).
Returns true when it consumed the input; keybinds.js / buttons return early. Keys it doesn't plan fall through.

### Translator (`dual-run-bridge.js`) new cases
rotateCard `{instanceId, rotation}` · changeType `{instanceId, type}` · removeAbilityCounter `{instanceId}` ·
playRandomCardFaceDown `{}`. Object-form params only (instanceId must be integer; else null).

### Server: playRandomCardFaceDown
Schema: empty payload object. Legality: turn-player-only in rules mode; hand must be non-empty (reference check →
`stale_view`). Apply: `idx = floor(rng.next() * hand.length)`, splice, `card.faceDown = true`, `card.revealed = false`,
push to board; event `cardPlayedFaceDown {instanceId, playerId}`.
End-of-command sweep: every card not in a board zone loses `faceDown`.
view.mjs: board cards with `faceDown && !revealed` → `redactCard` for owner, opponent and spectator.
Client: hand-buttons `randomHandButton` under authority → `emitAuthoritativeCommand('playRandomCardFaceDown', [{}])`.

### Restart
`restartGame('self')` under `serverAuthoritative && isTwoPlayer`: `reset('self')` (emits the server reset) +
local `reset('opp', true, true, true, false)` + announcement; server `gameReset` fires `game-restarted` on both.

### Deck peek
Server `GameRoom.peekDeck(socketId, { side: 'you'|'them', count, fromTop })` →
`{ ok: true, cards: [sanitized] } | { ok: false, reason }`. Rules: count integer 1..deck length (clamped to length);
`them` refused when `state.rulesEnabled`; unknown socket refused. Top = deck[0..]; bottom = last N, deepest last.
server.js `socket.on('peekDeck', (data, ack))` → ack result (no broadcast).
Client `viewDeck` under authority (self initiator): `socket.emit('peekDeck', …, ack)` with 5s timeout → chat
announcement (emitted) → `openCardPicker` multi, upTo, pickOnly: confirm → `emitCmd moveCard {instanceId, from:'deck', to:'hand'}`
per pick, in order. `them` → browse mode (view only). Failure → announcement with reason.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | no selected card / instanceId not in registry | adapter returns false; legacy path unchanged | [x] planner "no card, a redacted card..." + selectedServerCard gate |
| 2 | malformed params to translator (missing/non-integer instanceId) | translator returns null, nothing emitted | [x] "manual board tools drop legacy index-addressed or incomplete parameters" |
| 3 | damage decrement below 0 / exactly 0 | updateDamageCounter amount 0 | [x] "a digit adjusts existing damage...", "0 clears damage" |
| 4 | same key pressed twice quickly | each plans from last applied view; server applies in order; worst case one stale step, corrected by next view | [x] reasoning + live probe: 3,y,y,r in sequence landed 30 damage, Burned, 90deg, identical on both clients |
| 5 | peek socket ack never arrives | 5s timeout → announcement, no picker | [x] socket.timeout(5000) in deck-peek.js; refusal path proved live (opponent deck refused and announced) |
| 6 | picked peek card already left deck (stale) | server rejects moveCard stale_view; cmdRejected announcement | [x] reducer moveCard reference check; live: an off-turn take was rejected and announced |
| 7 | random face down with empty hand | rejected stale_view, nothing moves | [x] "playRandomCardFaceDown with an empty hand is rejected" |
| 8 | face-down card leaves board then returns | flag swept on leave; returns face up | [x] "a face-down card that leaves the board comes back face up" |
| 9 | opponent / spectator view of face-down card | redacted to instanceId | [x] "a face-down board card is hidden from its owner..." + live probe |
| 10 | peek opponent deck in rules mode | refused with reason | [x] "deckPeekFor shows the opponent's deck only when rules are off", room.peekDeck test, live probe |
| 11 | peek count > deck / count ≤ 0 / deck empty | clamp; ≤0 refused; empty deck refused | [x] "deckPeekFor clamps to the deck and refuses empty decks, bad counts and non-players" |
| 12 | counters on opponent Pokémon during own turn (rules mode) | command sent by acting player, accepted | [x] "the turn player can put damage and a condition on the opponent's Active" + live probe |
| 13 | legacy mode (flag off) | all new branches inert | [x] every entry gated on isAuthoritativeDispatchActive/serverAuthoritative; full suite green |
| 14 | undo replay of playRandomCardFaceDown | seeded RNG → same card on replay | [x] "picks the same card for the same seed (undo replay stays in step)" |

## Test plan
Unit: planner (manual-card-commands.test.mjs), translator cases (dual-run-bridge.test.mjs), reducer + view
(manual-tools.test.mjs), room.peekDeck (room.test.mjs). Live: scratch Playwright probe under SERVER_AUTHORITATIVE=1
drives keybind dispatch, random face down, restart and peek on two real clients.

## Migration / rollout
No persisted data. New `faceDown` card field is optional. Revert = revert the branch.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | translator cases + server playRandomCardFaceDown + faceDown redaction | unit tests pass |
| 2 | planner + adapter + keybind/menu wiring (items 1,3,4) + random-facedown button | unit + live probe |
| 3 | restart + deck peek (server + client) | unit + live probe |

## Deviations
- Restart sends only the server reset (no local reset of the opponent side): the opponent side is server-drawn, so the fresh view repaints it.
- Legacy 0-9/y/r handlers stay in place for legacy mode; the new dispatch returns before them.
- changeType on an opponent's card changes type only — the server refuses moves of another player's card, so the legacy move-to-board half is skipped there.
- Peeked cards can be taken into hand only (legacy allowed any destination); reordering the deck from the look is not supported.
- Restart reuses the player-requested Reset, so chat shows "<player> reset" before "Game restarted.".
- "Play a random card face down" from the opponent's hand menu is refused with a message: the server only lets a player play from their own hand.
