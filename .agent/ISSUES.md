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
- I1 2026-09-07 P2 [rules] Turn start auto-draw: both players draw a card when turn is started (ref: ISSUES.txt)
- I2 2026-09-07 P2 [rules] End Turn button logic: +Turn needs rework to end active player's turn (ref: ISSUES.txt)
- I3 2026-09-07 P2 [rules] Garland Ray energy discard parsing fail on multiplier attacks (ref: ISSUES.txt)
- I4 2026-09-07 P2 [rules] Prize card selection on KO fails (ref: ISSUES.txt)
- I6 2026-09-07 P2 [netcode] Multiplayer desyncs are architectural: two client simulations, no arbiter — 54 of last 200 commits are sync/replay/RNG patches (refs: design 001)
- I5 2026-09-07 P2 [rules] Deck inspection allowed during rules mode (ref: ISSUES.txt)
    Root cause is data, not UI: both clients hold the full opponent deck. Design 001 closes it by redacting the view server-side — don't fix separately.


## Closed (append-only history; grep it, never load it wholesale)
