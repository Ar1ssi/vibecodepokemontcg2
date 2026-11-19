# 090: Remove the legacy client rules layer
Status: approved (user) — building
Date: 2026-11-19

## Problem
About 12 k lines of client code (`chat-buttons.js`, `rules-bridge.js`, `trainer-execution.js` and
helpers) re-implement the rules the server engine owns. They run only when the client is in no
room, a state whose board draws nothing (I283), and whenever an authority gate fails open. Most of
the client-side rule bugs fixed in the 2026-11 deslop pass lived there. The user reversed D246 on
2026-11-19: "the legacy client isn't necessary anymore … remove all of it".

## Constraints
- The server always runs the rules (D245). Solo is a server room with one socket on both seats (D221).
- Under authority the legacy renderer never writes DOM for zones apply-view draws (D36).
- Card text and rulings are never recalled; this design changes no rule, it deletes duplicates.
- Out of scope (design 087 slice 5, still open): the relayed lifecycle actions (`loadDeckData`,
  `setup`, `setupPrizes`, `drawOpeningHand`, `readyUp`, `reset`, `restartGame`, `exchangeData`,
  `lookAtCards`), `requestAction`, `pushAction` mirroring, and therefore `move-card.js`,
  `move-card-bundle.js` and the zone-op bodies those replays still run on the hidden mirror.

## Current state
Inventory of 2026-11-19 (session scratch; summarised here):
- `chat-buttons.js` (5,414 lines): `attack` (gate :652, legacy body ~664-2536), `retreat` (:2554),
  `pass` (:4328), `stadiumEffect` (:4761, helpers ~4351-4750) each send a server command first and
  fall through to a legacy body. Thirteen ability executors (~2790-4315) and helpers (~88-629) have
  no gate; five are wired to sidebox buttons (index.ejs ~137-139, sidebox p1/p2 `chat-buttons.js`).
- `trainer-execution.js` (2,839 lines): one call site, `rules-bridge.js` `processBoardCard`.
- `rules-bridge.js` (3,529 lines): KEEP `initializeRulesEngine`, `buildRulesToggle`,
  `forceRulesEnabledForMultiplayer`, the turn HUD, glows, the opening ceremony under server turn
  order, starting-Active prompts and the pass hook. LEGACY: local coin flip (~1345-1462), energy
  attach effects (~1720-1905), trainer play hooks (~3291-3323), ability steps (`runAbilitySteps`),
  KO watcher, checkup/turn-end damage, deck-out, turn-start draw, win sweep, end screen no-room arm.
- Every dispatch gate fails OPEN to the legacy body for an untranslatable action or an
  unregistered card (`authoritative-dispatch.js` ~162-181, ~304-310; D12).
- Game-state export/import, the replay viewer and `/import?key=` share links replay the client
  action log through the legacy bodies (`bottom-buttons.js` ~153-200, ~313-345, ~394;
  `load-import-data.js`; server `storeGameState`, `/import`, the `KeyValuePairs` table).
- With no room: `front-end.js` boots everything; deck load and Set Up run on the hidden mirror and
  nothing draws. The Solo tab joins a solo room; the Multiplayer tab leaves it.

## Options
1. No-room page — (a) auto-join Solo at load; (b) lobby only, no board. **Pick (a)** (user,
   2026-11-19): there is always a working board, and it is the board the Solo tab already gives.
2. Game-state export/import, replay viewer, share links — (a) remove; (b) keep and delete less;
   (c) remove now, rebuild on server views later. **Pick (a)** (user, 2026-11-19). The full-log
   export (design 088, `tools/log.mjs`) stays and is the supported record of a game.
3. Gate miss (untranslatable action / unregistered card) — (a) keep failing open; (b) fail closed:
   refuse, log, tell the player. **Pick (b) for attack, retreat, pass, Stadium and abilities**: the
   body they opened onto no longer exists. Zone ops keep D12's fail-open in a room, because their
   bodies stay (out of scope above); with no room they refuse like everything else.
4. Stored share data — (a) drop the table; (b) leave `db.sqlite` on disk untouched and remove only
   the code. **Pick (b)**: no data is deleted, so a revert restores the feature with its data.

## Design
- **Solo at load.** After the socket connects and the page is ready, the client joins its solo room
  exactly as the Solo tab does (`joinSoloRoom`), unless the URL names a room to join or the page is
  the builder window. Leaving a multiplayer room returns to solo (already true via the p1 tab).
  While the player browses the Multiplayer lobby there is no room: every gated action refuses with
  one chat line ("Join a room or open Solo to play.").
- **Gates.** With no room every gated action refuses (one helper in `authoritative-dispatch.js`
  decides "in a room"). In a room, attack / retreat / pass / Stadium / ability entry points refuse
  on a gate miss and never run a local body; zone ops keep D12's fail-open onto their kept bodies.
- **Entry points stay, bodies go.** `attack`, `retreat`, `pass`, `stadiumEffect` keep their
  exports and callers; each becomes: gate → send command → return. Ability buttons in the sidebox
  are removed with their executors (the card inspector and board menus already send `useAbility`).
- **Deleted outright:** `trainer-execution.js`; `ability-picker.js`; the legacy flows of
  `rules-bridge.js` listed above; the local-replay arm of `undo.js`; `debug-menu.js`'s
  `forceRulesActiveTurn`; shared modules imported by nothing in `shared/engine/reduce`,
  `shared/engine/effects` or `server/` once the client stops importing them (`status.mjs`,
  `mulligan.mjs`, `rules-turnorder.mjs`, `search-reveal.mjs` — verify each before deleting);
  tests that cover only deleted code; `scripts/audit-all-trainers.mjs`'s mirror of the
  `runTrainerSteps` step list.
- **Export/replay removed:** the export-state / import-state / replay controls and their handlers,
  `load-import-data.js`, the `storeGameState` socket handler, `/import` and its template variable.
  The `sqlite3` code that only served them goes; the dependency stays in package.json until a
  follow-up confirms nothing else needs it. `db.sqlite` is not touched.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Page load, socket not yet connected | solo join waits for connect; no action is possible before the join ack | [ ] |
| 2 | URL joins a multiplayer room / spectator link / builder window | no solo auto-join | [ ] |
| 3 | Solo join refused or server unreachable | the board stays empty with a visible message; actions refuse | [ ] |
| 4 | Player in the Multiplayer lobby clicks Attack / Set Up | one refusal line; no local state changes | [ ] |
| 5 | Gate miss in a room (unregistered card, untranslatable action) | refusal + log line `dispatch.refused`; no local mutation | [ ] |
| 6 | Relayed mirror of a server_command action arrives | still suppressed (accept-action.js); no body runs | [ ] |
| 7 | Old `/import?key=` link opened | normal page (404 for the key is acceptable); no crash | [ ] |
| 8 | Reconnect mid-game | unchanged: views redraw the board | [ ] |
| 9 | Spectator | unchanged | [ ] |

## Test plan
Unit: gate refusals (authoritative-dispatch), solo-at-load decision (pure helper), chat-button entry
points send exactly one command and mutate nothing. Browser: `scripts/e2e/solo-authority-test.mjs`,
`opening-coin-choice-test.mjs`, `board3d-boot-test.mjs`, `board3d-drag-test.mjs`,
`room-format-test.mjs` must still pass; the other harnesses must fail no check they pass on the
commit before this design (baseline logs taken 2026-11-19). Engine untouched: no `pnpm audit:*`.

## Migration / rollout
No data migration. Revert: `git revert` the slice commits; saved game states remain in `db.sqlite`.

## Work plan
| Slice | Files | Change | Tests | Green when |
|---|---|---|---|---|
| A | client/src/actions/chat-buttons/, sidebox p1/p2 `chat-buttons.js`, `initialize-p1-page.js`, `initialize-p2-page.js`, client/index.ejs (ability buttons), e2e-api.js references | entry points become gate → command; legacy bodies, ability executors and their buttons deleted | entry points send one command, refuse with no room | lint clean; chat-buttons tests pass |
| B | client/src/setup/rules/ (rules-bridge.js, trainer-execution.js, debug-menu.js, card-inspector.mjs fallback), client/src/actions/ability-picker.js, shared legacy-only modules, scripts/audit-all-trainers.mjs | legacy flows deleted; opening ceremony, HUD, glows, pass hook kept | rules tests pass; deleted-code tests removed | lint clean; rules tests pass |
| C | bottom-buttons.js, load-import-data/, server/server.js, client/index.ejs (import data), socket listeners for export acks | export/import/replay/share removed | server tests pass | lint clean; server tests pass |
| D | header-buttons.js, room-buttons.js, solo-room.js, socket-event-listeners.js, front-end.js, authoritative-dispatch.js and the per-file gates in client/src/actions/, undo.js | solo at load; gates fail closed | gate refusal tests; solo-at-load helper test | lint clean; netcode tests pass |

## Deviations
