# Issues — the tracked backlog: bugs, debt, deferred work. One line each, newest first.
# If "we should fix that later" isn't a line here, it will be forgotten. Journal `flag:` lines are
# the informal inbox; maintain.md promotes the ones that matter into this file and drops the rest.
# FIXING an issue is routed like any other request (patch/debug/feature) — this file only tracks.
# Read by GREP, not wholesale: `grep -n "\[rules\]" .agent/ISSUES.md` or `grep -n "I128"`.
# Format: `I<n> <YYYY-MM-DD> P<1|2|3> [scope] symptom — evidence/repro (refs: D<n>, design, S<n>)`
#   ONE line, ≤300 chars. Needs more? Put it in a design or scratch file and reference it.
#   P1 broken for users now · P2 wrong or risky, schedule it · P3 debt/idea, fix when passing.
#   Next <n> = highest I number here or in the archive + 1 (next: I138).
# Close = move the line under Closed and append ` → closed <YYYY-MM-DD> S<n>: <fix or wontfix + why>`.
# Caps: Open ≤40 · Closed ≤30 (maintain.md moves older Closed lines to .agent/archive/).
# Full pre-2026-09-24 wording + all older Closed history: .agent/archive/ISSUES-full-2026-09-24.md

## Open (newest first)
- I136 2026-09-24 P2 [rules] Attack behaviour audit: 972 no-effect + 541 partial of 10,966 unique attacks; design 036 slices 1–6 built, 7–16 open — lists in .agent/scratch/attack-full-audit/ (refs: S280, S282, S284)
- I135 2026-09-24 P3 [rules] Trainer passive/trigger long tail (passive Items/Supporters, tool on-damage/on-KO, triggered Stadiums, play conditions) — design 035 slices 8–11 (refs: S279, trainer-series-audit/report.md)
- I134 2026-09-24 P2 [rules] 28 Trainer step kinds had no server executor (legacy-only) — design 035 slices 5–7 built on `feature/trainer-behaviour`; close at slice 12 (refs: S279, S283)
- I133 2026-09-24 P2 [rules] Conditional Tool modifiers over-apply (Power Weight, Bravery Charm, Big Air Balloon, Hunting Gloves, Heavy Boots…) — design 035 slices 3–4 / D117[rules] (refs: S279)
- I132 2026-09-24 P2 [rules] Fossil Items look at bottom 7 with a hardcoded "Darkness Pokémon" pick — design 035 slice 2 (refs: S279)
- I131 2026-09-24 P2 [rules] Tool KO prize counts wrong: `parsePrizeModify` grabs the first number (Hero's Medal −100 etc.) — design 035 slice 1 (refs: S279)
- I130 2026-09-24 P2 [rules] Legacy "damage is reduced by N" parsed as N counters ×10 → 16 SW/XY cards prevent all damage; coin reduce/prevent ignores flip; old thorns wording unread — probe ability-series-audit/behave3.mjs (refs: S278)
- I129 2026-09-24 P3 [rules] Ability audit: 122 activated abilities do nothing, 158 partial, ~30 passive families lack a server hook — ability-series-audit/report*.md (refs: S278)
- I128 2026-09-24 P2 [rules] Conditional prevention/reduction abilities over-apply: tool-combat.mjs `textOf` reads only `card.ability`, never `abilities[]` (Bellibolt, Dewgong, Bronzong) — probe behave2.mjs (refs: S278)
- I127 2026-09-23 P3 [rules] Card-inspector retreat tile ignores bench abilities: `retreatGateFor` passes `zoneCards: []` (refs: S277)
- I126 2026-09-23 P3 [rules] Energy-conditional team retreat abilities (Metal Bridge, Thunderclap Zone, Aqua Tube, Dark Cloak) not applied by `teamNoRetreatCostForActive` (refs: S277)
- I121 2026-09-23 P3 [rules] Design 032 leftovers (merged I121–I125): Bowed Whip "that Pokémon" gate; Blast Burn cost-conditioned "does nothing"; ungated named self-discards; Lightning Sphere discard; "Lt." breaks sentence split — `node .agent/scratch/i118/gateprobe2.mjs` (refs: S271)
- I87 2026-09-23 P2 [netcode] "basic prompt gone in most recent match" not reproduced; waiting on the user's description (refs: S264, design 028)
- I86 2026-09-23 P2 [feature] 30th Celebration + Classic Collection support — design 029 awaiting user approval (refs: S264)
- I85 2026-09-23 P1 [feature] Match logging (user: IMPORTANT) — design 028 awaiting user approval (refs: S264)
- I84 2026-09-23 P3 [legacy] Legacy/solo client paths unverified or unenforced (merged I20, I41, I45, I70, I84): chat-buttons ability executors (Dynamotor…), special-energy client triggers + Legacy Energy guard, type2/enteredPlayTurn, 2-room rejoin hand, stale damage read. Policy: legacy untested (refs: archive)
- I81 2026-09-22 P3 [deck-builder] Autosave makes the explicit Save button a no-op when a deck is loaded — decide autosave vs dirty-indicator (refs: S252)
- I80 2026-09-22 P3 [board-ui] Legacy Fossil Items can't reach the Bench: trainer-execution.js moves without the server's Basic-Pokémon transform, move-card.js guard refuses (refs: S251)
- I79 2026-09-22 P3 [rules] Legacy mode enforces no GX once-per-game (`rulesState` has no gxUsed store) (refs: S251; contrast reduce.mjs)
- I78 2026-09-22 P3 [rules] Between-turns Stadium damage resolves a double KO as a win: `applyBetweenTurnsStadiumDamage` breaks after the first KO — collect all, then evaluate once (cf. D120[rules] `settleKnockOutWins`) (refs: S251)
- I73 2026-09-21 P3 [netcode] Battle logs diverge between players (merged I73, I74): reconnect catch-up skips appends while `isCatchingUp`; "Clear battle log" clears only the local client (refs: S230)
- I72 2026-09-21 P3 [board-ui] Dead `#rulesBattleLog` + 9 `.battle-log-*` CSS rules (index.css, and tracked css/index.css.bak) — delete (refs: S230)
- I67 2026-09-20 P3 [deck-builder] Tracked 65 KB backup `deck-builder/core/coins.mjs.bak-urls` — delete (refs: S219)
- I65 2026-09-20 P3 [rules] Stadium attack GRANTS evaluated against the Basic root, not the top evolution — pass `topPokemonCard` to `stadiumGrantedAttacks` (server + client) (refs: D78, S207)
- I64 2026-09-19 P3 [rules] Attack panel shows a spent GX attack as usable; thread oncePerGame into `listAttacks` opts (refs: design 018)
- I63 2026-09-20 P3 [rules] V-UNION play rules unimplemented (assemble from discard, one Pokémon, once per name) (refs: S198)
- I62 2026-09-20 P3 [rules] Pokémon LEGEND two-halves-as-one play rule not modelled (refs: S198)
- I61 2026-09-20 P3 [rules] Tiebreak has no fresh six-prize sudden-death mat (click-resolution only) (refs: D71, D74)
- I60 2026-09-19 P3 [rules] `useVStarGX` legality never resolves the card, so a positional VSTAR power would fire from the Bench; no corpus case yet (refs: design 015)
- I56 2026-09-18 P2 [netcode] Keybinds reading `mouseClick.card.image` throw on server-drawn cards (`c`, `z`/alt-z, `e`/`q`, move keys) (refs: design 012)
- I55 2026-09-18 P3 [netcode] Under server authority a peeked deck card can only go to hand; `changeType` on opponent's card doesn't move it (refs: design 012)
- I44 2026-09-14 P3 [rules] Attack inheritance never inherits: `mergeInheritedAttacks` has no caller passing prior attacks (refs: design 008 R8)
- I34 2026-09-10 P1 [netcode] Legacy-mode turn ownership deadlock / turn counter drift (1/10 bot games, seed 2026) — audit acceptAction targets for `canPerformAction`-on-mirror (refs: I29, I33, S87)
- I23 2026-09-09 P2 [netcode] `VSTARGXFunction` + `#GXButton/#VSTARButton` reconcile are dead (no DOM element) — restore buttons or delete action + reconcile (refs: design 003, S232)
- I15 2026-09-09 P2 [netcode] Authoritative renderer interaction/overlay parity with legacy `Card.buildImage` unverified — re-check listeners/counters/cover (refs: design 002 3B)
- I12 2026-09-09 P1 [netcode] Reconnect recovery end-to-end unverified since slice 8 (emitters now gone; D9 catch-up) — test a real disconnect under server authority (refs: design 002)
- I10 2026-09-09 P1 [netcode] Stadium wiped on any server command when view.stadium null (`reconcileStadium`) — re-verify; may be fixed by D93/D115 work (refs: design 002)
- I1 2026-09-07 P2 [rules] Legacy ISSUES.txt items unverified: turn-start auto-draw both players (I1), +Turn/End Turn rework (I2), Garland Ray discard parse on multipliers (I3) (merged I1–I3)

## Closed (newest first; older history in the archive)
- I59 I58 I54 I53 I47 I4 2026-09-24 housekeeping: already carried "→ closed" text in Open; moved (details in archive). S286
- I43 2026-09-11 P2 [netcode] Client per-turn rules flags never synced from the view → closed 2026-09-24 S286: fixed S89 (`reconcileTurnState` merges flags); was never moved.
- I39 2026-09-11 P2 [netcode] flip-gate-test red after hands dealt → closed 2026-09-24 S286: same failure as I47, fixed S214.
- I14 2026-09-09 P2 [netcode] SERVER_AUTHORITATIVE defaulted on → closed 2026-09-24 S286: server.js default is OFF (env opt-in), prod set in render.yaml (D17).
- I13 2026-09-09 P2 [netcode] applyView renders nothing in production → closed 2026-09-24 S286: production getZone injected via setDefaultNetcodeContext in socket-event-listeners.js (design 002 slice 3.6); authoritative renderer is the prod path (D11, D106).
- I11 2026-09-09 P1 [netcode] syncInstance sent as instanceId → closed 2026-09-24 S286: translation map (D10).
- I6 I5 2026-09-07 P2 desync architecture / deck inspection → closed 2026-09-24 S286: closed by D11 (authoritative views, server-side redaction).
