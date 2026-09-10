# Issues — the tracked backlog: bugs, debt, deferred work. One line each, newest first.
# If "we should fix that later" isn't a line here, it will be forgotten. Journal `flag:` lines are
# the informal inbox; maintain.md promotes the ones that matter into this file and drops the rest.
# Scan Open before designing or when picking what to work on; FIXING an issue is routed like any
# other request (patch/debug/feature) — this file only tracks, it never carries the work itself.
# Format: `I<n> <YYYY-MM-DD> P<1|2|3> [scope] symptom or task — evidence/repro (refs: D<n>, design, S<n>)`
#   P1 broken for users now · P2 wrong or risky, schedule it · P3 debt/idea, fix when passing.
#   Next <n> = highest number anywhere in this file + 1. One line; at most one indented detail
#   line. Needs more? Stub a design in .agent/designs/ and reference it — don't bloat this file.
# Close = move the line under Closed and append ` → closed <YYYY-MM-DD> S<n>: <fix or wontfix + why>`.
# Caps: Open ≤40 (over → merge duplicates, close the stale, demote to P3 or drop) ·
# Closed ≤100 (maintain.md deletes the oldest lines; git history keeps everything forever).

## Open (newest first — scan this section only)
- I28 2026-09-10 P1 [rules] Legacy mode's local win check ends the game after turn 1, every
  game: `evaluateWinCondition`'s `checkWinConditions` (shared/engine/rules/ko-flow.mjs:86-93)
  treats "0 active + 0 bench" as an instant loss for *either* side the moment a turn ends
  (chat-buttons.js:415 `endTurnWithBanner` → `endTurn`), but the side that hasn't had its own
  first turn yet legitimately has 0 Pokémon in play — Basic placement is an ordinary turn-1
  action in this client (no separate "setup" placement phase precedes it). So player A's very
  first `pass` reports "you win (no Pokémon in play)" against B, who simply hasn't moved yet.
  Found live via design 004's slice 1-4 smoke run (`.agent/scratch/smoke-004-slice1-4.mjs`) —
  exactly the class of rule hole the design's playtest bot exists to catch. Needs a live check
  before fixing (does normal 2-player human play never hit this because both players place
  during a real "setup" UI step this harness skipped, or is this reachable by any legacy 2P
  game today?) (refs: design 004, S79).
- I24 2026-09-10 P1 [netcode] Legacy (non-authoritative) `moveCardBundle` mirror desync: a `deck`→`bench` move (Piloswine #7, room test1) reached the receiver with no `cardHints` attached, so `needsHintVerification` never triggers (move-card-bundle.js:125-129) and the move applies via raw relay `index` against the receiver's own zone array unchecked (move-card-bundle.js:118,209-227) — grabbing the wrong card. Every later hint-verified move touching that slot then aborts on `hint_mismatch` (move-card-bundle.js:141-159) with no resync (I12), permanently diverging `bench`; ended with Mamoswine ex #23 invisible to ARISSI after a bench→active→bench abort pair. Repro: `ptcg-sync-log_combined_test1_1788985695598.json` seq 108-159 (ARISSI client) (refs: I12, S70).
  Hypothesized cause found and patched UNVERIFIED (no live test done): `openChoicePicker`'s `confirmPicker` (card-picker.js:652-667) already auto-moves every picked card when `zoneFrom`/`destination` are set (rules-bridge.js:1277-1278), but `runSearchStep`'s multi-select `onConfirm` (trainer-execution.js, was ~443-449) *also* called `moveCardBundle` per pick — double-move raced the picker's own splice, and the second call's stale index made `buildMoveCardHints` find no card, dropping the hint. Removed the duplicate manual move. Added a `console.warn` at move-card-bundle.js:20 (buildMoveCardHints null-card path) to catch any remaining case live. Same double-move pattern likely also exists in Grand Tree's evolve pickers (chat-buttons.js:4014-4024/4089-4099) and the attach-energy single-pick path (trainer-execution.js:469-488) — not touched, needs a live repro before patching those.
- I23 2026-09-09 P2 [netcode] `VSTARGXFunction` has no UI caller and no DOM element: nothing in client markup or JS defines `GXButton`/`VSTARButton`, so the legacy body would throw on `button.classList` if it were ever reached locally; the action is reachable only via the `acceptAction` relay. Left ungated by design 003 slice 5 (a gate on a dead local path adds risk without behavior). Either restore the buttons or delete the action (refs: design 003, S60).
- I22 2026-09-09 P2 [netcode] `VSTARGXFunction` translator/legacy parameter mismatch: `VSTAR-GX.js` sends `[type]` ('GX'|'VSTAR') but `dual-run-bridge.js`'s case reads `[instanceId]`, so `payload.instanceId` is always 0 and the GX/VSTAR distinction is lost — the server's `useVStarGX` reducer sets both `vstarUsed` and `gxUsed` regardless. Pre-existing, not introduced by design 003 (refs: design 003, S60).
- I20 2026-09-09 P3 [netcode] type2/enteredPlayTurn (evolution-timing, dual-type tracking in
    move-card.js) have no server-side equivalent (grep of shared/engine: zero hits) — purely
    legacy rules-bridge.js-local fields. Design 003 routes gated actions around moveCard entirely
    so this can't cause cmdRejected/desync (server enforces real legality independently), but the
    *legacy* fallback path (flag off, or any ungated action) still depends on rules-bridge.js,
    which stays out of scope until that module's own migration (refs: design 003, MAP.md's
    "migration's cost centre" note, S54)
- I15 2026-09-09 P2 [netcode] Authoritative renderer has no interaction or overlay parity: createOrUpdateCardElement emits a bare <img class="card-image"> while legacy Card.buildImage attaches seven listeners (click/dblclick/drag x4/contextmenu), damage counters are sibling <div>s (damage-counter.js:182-203) and Cover is a separate image — wiring getZone in as-is yields a non-interactive board (refs: design 002 Phase 3B, S39)
- I10 2026-09-09 P1 [netcode] Stadium is wiped from both boards on any successful server command: applyView's reconcileStadium clears #stadium when view.stadium is null, and #stadium is the only zone its DOM fallback can reach (apply-view.js:259-281) — repro: play a Stadium, then draw (refs: design 002, S32)
- I11 2026-09-09 P1 [netcode] Client syncInstance (0-based per player) is sent as the server's instanceId (1-based global), so every authoritative card command targets the wrong card or the wrong player's card (build-deck.js:13-19 vs shadow.mjs:29-68; dual-run-bridge.js:205-208) (refs: design 002, S32)
- I12 2026-09-09 P1 [netcode] Reconnect recovery is dead in both modes: slice 8 deleted the replay stack but left the emitters — no client listener exists for resyncActions/catchUpActions/requestBoardSnapshot, and requestView returns a view the renderer cannot paint (socket-event-listeners.js:211) (refs: design 002, S32)
- I13 2026-09-09 P2 [netcode] applyView renders nothing in production: zones live in iframes, window.__getZone is never assigned, and only tests inject options.getZone — so the renderer has never run against the real DOM (apply-view.js:91-111) (refs: design 002, S32)
- I14 2026-09-09 P2 [netcode] SERVER_AUTHORITATIVE defaults on (server.js:21-23) though design 001 slice 8's flip was never completed: 14 of 58 actions translate, IDs do not match, renderer is blind (refs: design 002, I11, I13, S32)
- I1 2026-09-07 P2 [rules] Turn start auto-draw: both players draw a card when turn is started (ref: ISSUES.txt)
- I2 2026-09-07 P2 [rules] End Turn button logic: +Turn needs rework to end active player's turn (ref: ISSUES.txt)
- I3 2026-09-07 P2 [rules] Garland Ray energy discard parsing fail on multiplier attacks (ref: ISSUES.txt)
- I4 2026-09-07 P2 [rules] Prize card selection on KO fails (ref: ISSUES.txt)
- I6 2026-09-07 P2 [netcode] Multiplayer desyncs are architectural: two client simulations, no arbiter — 54 of last 200 commits are sync/replay/RNG patches (refs: design 001)
- I5 2026-09-07 P2 [rules] Deck inspection allowed during rules mode (ref: ISSUES.txt)
    Root cause is data, not UI: both clients hold the full opponent deck. Design 001 closes it by redacting the view server-side — don't fix separately.


## Closed (append-only history; grep it, never load it wholesale)
- I19 2026-09-09 P3 [netcode] Reveal/hide family (revealCards/hideCards/revealShortcut/hideShortcut)
    has no server-side driver: shared/engine never sets card.revealed=true, so view.mjs's
    revealed-branch rendering is correct but unreachable (refs: design 002 §3.4d, S51) → closed
    2026-09-10 S68: all 4 reclassified 'server_command' in DISPOSITION_TABLE. New COMMAND_SCHEMAS
    entries (position-addressed by zoneId/index, same pattern as takePrizesByIndex — no cardHint
    needed) and reduce.mjs cases flip `card.revealed` on the sender's OWN zone only
    (`draft.players[playerId]` is always the sender's own state; no cross-player targeting was
    added, since view.mjs's redaction is symmetric — flipping the flag once unhides the card in
    both players' views). `revealShortcut`/`hideShortcut` bounds-check the index (`stale_view` if
    out of range); `revealCards`/`hideCards` flip every card in the given zone. dual-run-bridge.js
    gained 4 translator cases; `client/src/actions/general/reveal-and-hide.js`'s 4 functions gated
    with `dispatchAuthoritativeAction` (`user === 'self' && emit` — matches `attack`/`retreat`'s
    no-identity gate shape) right before their legacy body, same accepted-loss precedent as prior
    slices (local chat message skipped when gated). Opponent-triggered reveal (legacy's
    `mouseClick.cardUser === 'opp'` case) intentionally NOT wired to a command — gate requires
    `user === 'self'`, so that path still falls through to the old direct-socket-emit body,
    unchanged from before this fix (same broken/no-op-under-authoritative-rendering state as
    today, not regressed further). **Verified:** 1208/1208 `pnpm test` (16 new tests: 5 in
    dual-run-bridge.test.mjs, 6 in server/game/__tests__/zone-op-commands.test.mjs including a
    `viewFor` cross-player redaction check and an own-zone-only security check). `pnpm test:2p`
    ALL PASS (flag off, live server). Lint clean (0 errors) on every touched file.
- I27 2026-09-09 P2 [netcode] Client coin flip and server turn order are decided independently, so they disagree ~50% of the time: the browsers run their own `rulesCoinCallOverlay` flip, while `server.js:737` invokes the `setup` command with `payload: {}` and `setupGame` (`setup.mjs:136-141`) therefore falls through to `starter = activeRng.next() < 0.5 ? ...`, never receiving the `firstPlayerId` its own signature accepts. Until the first view lands, the client whose flip disagreed believes it is its own turn and its first action is rejected `"It's not your turn."` — self-healing once `reconcileTurnState` (S65) applies a view, but wrong until then. Same class as I17 (client shuffle vs server shuffle) and the same fix shape: pass the coin-flip winner as `setup`'s `firstPlayerId`, or take the starter from the server. Found as flip-gate flakiness; the gate now waits on `turnState().fromServer` to work around it (refs: I17, design 002 3.12, S65). → closed 2026-09-09 S67: same fix shape as I17 — feed the client the server's already-known answer instead of guessing. `server.js`'s post-`setup` broadcast now includes `starter` ('self'/'opp', relative to each recipient) alongside `order` on the `dealOrder` event; `deal-order.js` caches it (`getDealOrderStarter()`), available before the coin-flip UI ever runs since `setupPrizes()` already awaits `dealOrder` earlier in the sequence. `rules-bridge.js`'s `runTurnOrderCoinFlip` overrides its local `decideTurnOrder()` guess with the authoritative starter when in 2P + `serverAuthoritative`; the peer-mirror handler (`turnOrderCoinFlip` rulesEvent) now trusts the sender's broadcast `turnPlayer` (inverted to its own perspective) instead of independently recomputing from call+result, since a recompute couldn't see the sender's override. Flip animation stays cosmetic-only; visual call/result may not narratively match the forced winner when overridden (accepted, same class of cosmetic loss as I17/I24's `deck`-exclusion tradeoffs). **Verified:** 1197/1197 `pnpm test` (4 new tests in `deal-order.test.mjs`). Lint: zero non-prettier errors on all 5 touched files. Not verified against a live two-browser run this session — no code path changed outside the flag-gated `serverAuthoritative` branch, and `flip-gate-test.mjs` already exercises this via its `turnState().fromServer` wait (refs: I17, design 002 3.12, S65). I25 2026-09-09 P2 [netcode] Turn/HUD banner is not refreshed under authoritative rendering: `reconcileTurnState` (S65) syncs `rulesState` from the view but deliberately does not dispatch `rules-turn-began`, because `rules-bridge.js` hangs legacy knockout/deck-out adjudication (`checkKnockouts`, `checkDeckOut`) plus banner `refresh`/`updateBadges` off that one event — firing it would re-introduce the local adjudication design 003 exists to remove. The banner and badges therefore go stale under the flag. Needs a refresh signal that carries no adjudication (refs: design 002 3.12, S65). → closed 2026-09-09 S66: new display-only `rules-turn-view-applied` CustomEvent, dispatched from `reconcileTurnState` (`apply-view.js`) whenever it applies a view's turn state. Wired as an extra listener alongside `rules-turn-began` on the HUD's `refresh()` and status-badge `updateBadges()` in `rules-bridge.js` — `checkDeckOut`/`checkKnockouts` (adjudication) deliberately left off it. 1193/1193 `pnpm test` (1 new test; also fixed 2 pre-existing tests whose mock documents lacked `dispatchEvent`). Lint clean on all touched files.
- I26 2026-09-09 P1 [netcode] Server card model has no `hp` or `attacks`, so knockouts can never fire under `SERVER_AUTHORITATIVE=1`: `loadDeck` (reduce.mjs:2054-2089) builds every server card from the 7-field deck row `[quantity, name, type, imageURL, number, set, tcgId]`, and nothing else ever sets those fields — `createCard` defaults `hp: null`, `attacks: []`. Consequences: reduce.mjs's KO check `koHp > 0 && defender.damage >= koHp` is always false (no KO, no prizes, deck-out is the only reachable win); every attack deals a flat 10 via the `{ name: 'Attack', damage: 10 }` fallback regardless of the printed attack; weakness/resistance/retreat cost never apply. Not a fixture artifact — real decks take the identical path, and client-side TCGdex enrichment is async so the fix has a timing question, not just a plumbing one. **Blocks 002's 3.12 flip.** Repro: `flip-gate-test.mjs` tests 8 and 9 (refs: design 002 3.12, design 003 slice 5 row 9, S65). → closed 2026-09-09 S65: new `cardStats` command (`commands.mjs` schema, `reduce.mjs` apply case) carries hp/attacks/types/weakness/resistance/retreatCost/stage, addressed by syncInstance across every zone and applied in place so it is safe mid-game. Client sends its own deck's stats from `build-deck.js` once `ensureCardData` settles (`client/src/setup/netcode/card-stats.js`); the card list is snapshotted at build time because setup deals 13 of 20 cards out of `deck.array` before the send fires. Flip gate now ALL PASS: KO fires at exactly 6 attacks, win reason "no Pokémon in play" instead of deck-out.
- I24 2026-09-09 P1 [netcode] `zoneArrays` (`get-zone.js`) never populated from server views,
    so the 3.11 desync heartbeat and e2e API's `boardHash`/`zone` (both read `getZone(...).array`)
    would report constant false-positive desyncs / no real hash under full authoritative
    rendering, blocking 002's 3.12 flip-gate exit test → closed 2026-09-09 S64: gave both
    consumers a `apply-view.js`-cache-backed source instead of touching legacy `zoneArrays`.
    New `lastAppliedView` cache in `apply-view.js` (set at the end of every accepted `applyView`,
    cleared by `resetRenderState`) exposed via `hasAuthoritativeView`/`getAuthoritativeZoneArray`/
    `getAuthoritativeStadiumArray` — order-correct by construction since it's literally the array
    the server sent, unlike `cardRegistry` (a `Map`, insertion-ordered, not view-ordered). Wired:
    `sync-check.js`'s new `viewBackedGetZone` (used by the heartbeat in
    `socket-event-listeners.js`, which only ever runs under the flag) and `e2e-api.js`'s new
    `liveZoneArray` (prefers the view cache once populated, falls back to legacy `getZone` before
    that / in legacy mode — zero behavior change there). Found a second, deeper gap while wiring
    this: `deck` is redacted to `{ count }` even for its own owner (design O4-A / I5), so a
    client can never produce a real per-card deck hash — even with `zoneArrays` fixed, comparing
    deck would be a permanent false positive. Excluded `deck` from the 3.11 comparison
    specifically (not from `hashState`/`hashBoardSnapshot` generally, which the replay-harness
    and legacy dual-run recording still need full deck fidelity from): client's
    `PLAYER_ZONES` drops it, server's new `excludeOwnerSecretZones` (`sync-check.mjs`) drops it
    from `hashStateZones`'s output before `findFirstDivergentZone` compares. **Verified:**
    1180/1180 `pnpm test` (9 new tests: apply-view cache lifecycle, `viewBackedGetZone`, deck
    exclusion client+server), `pnpm test:2p` ALL PASS (flag off), lint clean on every touched
    file, server boots clean with `SERVER_AUTHORITATIVE=1` (manual alt-port check). 3.12 itself
    still not started — this only unblocks it (refs: I15, design 002 §3.7/3.8/3.10 deviations,
    O4-A, I5, S63).
- I21 2026-09-09 P2 [netcode] Relayed opponent actions still dual-execute: `acceptAction` replays
    every `pushAction` through the legacy body (moveCardBundle mirror path etc.) even under
    `serverAuthoritative`, so the peer's move renders twice — once by the legacy mirror, once by
    the server view. Design 003 slice 1 gates only locally-initiated actions; suppressing the
    mirror is one relay-layer decision that applies to all families, not a per-family gate
    → closed 2026-09-09 S63: `accept-action.js` now checks `DISPOSITION_TABLE` (via new
    `isMirrorSuppressedAction` in `authoritative-dispatch.js`) and skips the legacy body for any
    `server_command`/`manual_override` action relayed as `user === 'opp'` while
    `systemState.serverAuthoritative` is on — every other disposition (server_lifecycle,
    replaced_by_protocol/redaction, ui_local, ...) still runs locally, since the server view
    carries no equivalent for those. 4 new unit tests. 1175/1175 `pnpm test`, `pnpm test:2p`
    green (flag off), lint clean.
- I17 2026-09-09 P1 [netcode] Client's local legacy shuffle and the server's own authoritative
    shuffle (setupGame via activeRng, shared/engine/setup.mjs:60) were two independent RNG
    streams: a card the browser showed in hand could still be in the server's `deck` zone, so a
    client-initiated moveCard referencing it was rejected `stale_view` → closed 2026-09-09 S47:
    server never trusts a client shuffle (D10) — instead, once both decks are actually loaded
    (fixed a second latent bug here too: the old guard fired on the FIRST loadDeck, dealing an
    empty hand for whoever hadn't loaded yet), the server runs 'setup' and emits each player its
    own syncInstance deal order ('dealOrder' event, server.js); client's setupPrizes()
    (actions/general/setup.js) waits for and uses it in server-authoritative 2P instead of a
    local shuffle. New client/src/setup/netcode/deal-order.js holds the wait/resolve plumbing.
    Verified: replay-harness.test.mjs green against 3 fresh live-browser recordings (hand-order
    difference remaining was a pre-existing cosmetic client sort, see canonicalizeHash in the
    test — unrelated, already tracked as I15/design row 10). 1089/1089 pnpm test green.
- I18 2026-09-09 P1 [netcode] No code path ever called the 'setup' command server-side: server.js
    only invoked handleCommand for 'loadDeck', and translateActionToCmd correctly returns null for
    setupPrizes/drawOpeningHand/readyUp (server_lifecycle) — but nothing else ran the equivalent
    server-side deal, so GameRoom state never dealt hands/prizes at all → closed 2026-09-09 S47:
    server.js now calls handleCommand('setup', ...) once both players' decks are loaded (mirrors
    the existing loadDeck interception).
- I16 2026-09-09 P2 [netcode] D6's "undo = commandLog replay minus tail" premise was broken: deck
    load mutated gameRoom.state.zones.deck outside commandLog → closed 2026-09-09 S46: added a
    real `loadDeck` command (shared/engine/reduce.mjs, commands.mjs) so deck bootstrap is logged;
    server.js routes exchangeData/loadDeckData through gameRoom.handleCommand('loadDeck', ...)
    instead of calling initializePlayerDeck directly; `undo` implemented as commandLog-minus-tail
    replay from a fresh seeded state.
