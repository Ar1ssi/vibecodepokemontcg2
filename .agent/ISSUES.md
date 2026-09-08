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
