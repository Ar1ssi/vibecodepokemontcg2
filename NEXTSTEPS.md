# NEXTSTEPS — in-flight increment ledgers ONLY (CLAUDE.md § Token / model policy).
# Cap ~60 lines. A finished ledger moves to .agent/archive/NEXTSTEPS-history.md in the session
# that finishes it. Design 036 (attack behaviour) keeps its ledger in HANDOFF.md on
# `feature/attack-behaviour` + `.agent/scratch/036-slices-5-16-handoff.md`.

# Active work — design 035: Trainer behaviour implementation (branch `feature/trainer-behaviour`)

Worktree: `C:\Users\SMG26\AppData\Local\Temp\opencode\trainer-behaviour-wt` (S280). Full plan:
`.agent/designs/035-trainer-behaviour-implementation.md`. One commit per slice; suite green between.

| Slice | Status | Notes |
|---|---|---|
| 1 | done (S280) | I131 prize-clause parser (`parsePrizeModify`) + 16-row corpus table; `trainer-tool-modifiers.test.mjs` (10 cases) |
| 2 | done (S280) | I132 `benchLookPick` vocabulary + `benchPickMatches`; fossils bench their own card; Grimsley unchanged |
| 3 | done (S280) | I133a `tool-conditions.mjs` + gated HP/retreat; `-100 HP`; Heavy Boots/Rescue Board retreat fixes |
| 4 | done (S280) | I133b gated bonus/prevention/reduction/prize; Hop's A3; Panic Mask/Full Face Guard/Defiance; flags threaded |
| 5 | done (S283) | I134a auto/simple steps: 11 handlers + `trainer-steps-missing.test.mjs` (15 cases); Karen `what` field; "draw a card" trailing draw parsed |
| 6 | done (S283) | I134b choice-driven steps: 16 handlers + 16 tests (31 in file); `take`/`restTo` parser fields; suite 3390/3391 |
| 7 | done (S283) | I134c `tool-attacks.mjs` + `attackViewFor` grant; end-of-turn tool sweep; `prizeCards` view; oracle PASSED |
| 8 | done (S283) | I135a possessive turn-bonus wording (+styles, per-Prize) + `drawUntil` descriptors/bonusWhen; 12 new tests; suite 3402/3403 |
| 9 | done (S283) | I135b tool on-damage/on-KO (`attachedToolOnKoEffects`, Beast Bringer attacker-side, Focus Band coin); `tool-on-ko.test.mjs` (12); oracle PASSED |
| 10 | done (S285) | I135c 10a (S283) + 10b (S285: Minefield coin counters, Wela/Slumbering checkup coins, Mirage retreat coin, Chaos Gym Trainer coin, Vermilion attack coin, shared switch hook `effects/stadium-trigger-apply.mjs` at executor/special-energy/Erika sites); `stadium-triggers.test.mjs` (18); suite 3432/3433; oracle PASSED. **11 next**: play conditions |
| 11 | pending | I135d play conditions (lostZone, stadium, basic Active, KO'd last turn, last card, hand gate, exactly-N prizes) |
| 12 | pending | Tooling: refresh corpus, server-coverage column, `audit-trainer-behaviour.mjs` gate, close I131–I135 |

Known gaps left by slices 1–4 (not in the audit's A5): Counter Gain / Karate Belt's attack-cost
discount is still ungated on trailing prizes; Beast Bringer's prize clause needs the slice 9
attacker-side hook; legacy client (chat-buttons.js) passes no defender-trailing flags, so
Defiance Vest/Band gate out there (server-authoritative path is correct).

Resume kit for slices 5–12: `.agent/scratch/035-slices-5-12-handoff.md` (worktree + primary) —
per-step legacy semantics, server handler contract, model gotchas, oracle/lint commands.

# Parked — S264 batch leftovers (tracked as issues, not increments)
#5 "basic prompt gone" → I87 · #6 match logging → I85 (design 028) · #4 30th anniversary → I86 (design 029).
