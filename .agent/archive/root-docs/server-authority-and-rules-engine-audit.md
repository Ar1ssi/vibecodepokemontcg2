# Server Authority & Rules Engine Audit Findings (Sweeps A & B)

## Executive Summary

This document structures the findings from two systematic security and correctness sweeps of the server-authoritative multiplayer pipeline and rules engine:
1. **Sweep B (Proven Server Authority Vulnerabilities)**: Bugs reachable via `socket.on('cmd') → handleCommand → applyCommand` that allow off-turn execution, unauthorized win conditions, state corruption, or soft-locks under `SERVER_AUTHORITATIVE=1`.
2. **Sweep A (Rules Engine Code-Read & Divergence Audit)**: Logic errors, type bugs, specification violations, and client-server state desync sources in the core rules engine.

---

## Baseline Test Suite Status

* **Test Suite Output**: `pnpm test`
* **Total Tests**: 1626
* **Passing**: 1625
* **Pre-existing Failures**: 1 (`shared/engine/__tests__/trainer-execution.test.mjs:467` — *Trainer drop: a Trainer without synced effect text is rejected, not played blind*, matching `.agent/STATE.md`).

---

## Sweep B: Proven Server Authority Vulnerabilities

All vulnerabilities in Sweep B are proven exploitable via standard network socket commands (`socket.on('cmd')`).

### B-1: Off-Turn Instant Win via `takePrizes`
* **ID**: `B-1`
* **Severity**: Critical
* **Symptom**: A player can issue `takePrizes{count:6}` to instantly claim all 6 Prize cards and win the game without knocking out any Pokémon, even on turn 3 and on the opponent's turn.
* **Evidence**:
  * [`shared/engine/reduce.mjs:800-805`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L800-L805): Legality check only verifies `count <= player.prizes.length`.
  * [`shared/engine/reduce.mjs:1595-1618`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L1595-L1618): `apply` executes prize taking and calls `setGameEnded`.
  * [`shared/engine/reduce.mjs:619-635`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L619-L635): Turn allowlist omits `takePrizes`, allowing off-turn execution.

### B-1c: Off-Turn Instant Win via `takePrizesByIndex`
* **ID**: `B-1c`
* **Severity**: Critical
* **Symptom**: A player can issue `takePrizesByIndex{indices:[0..5]}` to immediately harvest all prizes and end the game out-of-turn.
* **Evidence**:
  * [`shared/engine/reduce.mjs:807-816`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L807-L816)
  * [`shared/engine/reduce.mjs:1620-1648`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L1620-L1648)

### B-2: Arbitrary Off-Turn Damage Counter Mutation
* **ID**: `B-2`
* **Severity**: High
* **Symptom**: Active player or opponent can set arbitrary damage on the opponent's Active Pokémon off-turn.
* **Evidence**:
  * [`shared/engine/reduce.mjs:1228-1237`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L1228-L1237)
  * `validateReferences` (lines 352-378) filters by zone membership only, never enforcing turn ownership or causal validity.

### B-2b: Free Unlimited Off-Turn Healing
* **ID**: `B-2b`
* **Severity**: High
* **Symptom**: `removeDamageCounter` can be invoked off-turn to provide free, unlimited healing on any friendly or opposing card.
* **Evidence**: [`shared/engine/reduce.mjs:1240-1252`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L1240-L1252)

### B-2c: Off-Turn Paralyze Lockout via `addSpecialCondition`
* **ID**: `B-2c`
* **Severity**: High
* **Symptom**: `addSpecialCondition` can be sent off-turn to inflict Paralyzed on the opponent's Active Pokémon, locking them out of retreating and attacking during their upcoming turn.
* **Evidence**: [`shared/engine/reduce.mjs:1255-1265`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L1255-L1265)

### B-3: Off-Turn Active Promotion
* **ID**: `B-3`
* **Severity**: Medium
* **Symptom**: The `promote` action is accepted on the opponent's turn, forcing active Pokémon switches out of phase.
* **Evidence**: [`shared/engine/reduce.mjs:786-797`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L786-L797)

### B-4: Unenforced Retreat Energy Cost
* **ID**: `B-4`
* **Severity**: High
* **Symptom**: `discardEnergyIds` provided by the client is verified for existence and attachment but is never counted against the card's printed retreat cost. A retreat cost of 3 can be successfully executed by paying only 1 energy.
* **Evidence**:
  * [`shared/engine/reduce.mjs:420-431`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L420-L431)
  * [`shared/engine/reduce.mjs:1487-1512`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L1487-L1512) (the swap at `:1531` executes regardless of energy count).

### B-5: Invalid Promotion of Attached Energy & Game Soft-Lock
* **ID**: `B-5`
* **Severity**: High
* **Symptom**: Invoking `retreat` with the `benchInstanceId` set to an attached Energy card promotes the Energy card to the Active slot. The Active zone ends up with 0 unattached Pokémon, but the game state does not trigger game-over, creating a soft-lock/desync.
* **Evidence**:
  * [`shared/engine/reduce.mjs:414-419`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L414-L419) (checks container membership only, not Pokémon card type).
  * [`shared/engine/reduce.mjs:1531-1543`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L1531-L1543)

### B-6: Type Coercion Bug Rendering Retreat Cost Checks Unreachable
* **ID**: `B-6`
* **Severity**: High
* **Symptom**: Under `SERVER_AUTHORITATIVE=1`, retreat is always free. `card-stats.js:58` forwards `retreatCost` only when `Array.isArray(...)`. However, `parseRetreatCost` (`rules-state.mjs:495`) returns a `Number`. `createCard` (`cards.mjs:35`) then normalises numbers to `[]`. As a result, the server never receives retreat costs, making "Not enough energy to retreat" (`reduce.mjs:780`) unreachable in live play.
* **Evidence**:
  * [`client/src/setup/netcode/card-stats.js:58`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/card-stats.js#L58)
  * [`shared/engine/rules-state.mjs:495`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/rules-state.mjs#L495)
  * [`shared/engine/cards.mjs:35`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/cards.mjs#L35)
  * Masked by unit tests (`card-stats.test.mjs:17`, `card-stats-command.test.mjs:40`) that manually hand-feed array structures.

---

## Sweep A: Rules Engine & Client Model Audit

Findings identified via static code review of the rules engine (`shared/engine/`) and client state handlers.

### A-1: Special Condition Overwriting & Checkup Chain Collision
* **ID**: `A-1`
* **Severity**: High
* **Symptom**: `specialCondition` is represented as a single string variable. According to official Pokémon TCG rules, Poisoned and Burned co-exist with each other and with Asleep/Confused/Paralyzed. In `reduce.mjs:1257`, `addSpecialCondition` overwrites existing conditions. Furthermore, `resolveCheckup` (`reduce.mjs:174-241`) uses an `else if` chain, meaning only one condition processes during checkup. Adding Asleep to a Poisoned Pokémon silently wipes the Poison.
* **Evidence**:
  * [`shared/engine/reduce.mjs:1257`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L1257)
  * [`shared/engine/reduce.mjs:174-241`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L174-L241)

### A-2: Client-Server Status Condition Model Contradiction
* **ID**: `A-2`
* **Severity**: Medium
* **Symptom**: Client model contradicts both TCG rules and the server. `status.mjs:31,43-48` enforces "At most ONE of {poisoned, burned}", whereas Poisoned + Burned is legal in standard rules. Using two distinct status models across client and server causes state desynchronization.
* **Evidence**: [`client/src/components/status.mjs:31,43-48`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/components/status.mjs#L31)

### A-3: Asleep-Retreat Rule Divergence (Client vs Server)
* **ID**: `A-3`
* **Severity**: Medium
* **Symptom**: Client `statusAllowsRetreat` (`status.mjs:74-79`) blocks retreat only for Paralyzed, commenting "TCG allows retreating while asleep" (which violates official rules). Server `reduce.mjs:754-759` correctly rejects retreat while Asleep. This causes the client to display legal retreat actions that the server rejects, creating an `I43`-class move rejection loop.
* **Evidence**:
  * [`client/src/components/status.mjs:74-79`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/components/status.mjs#L74-L79)
  * [`shared/engine/reduce.mjs:754-759`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L754-L759)
  * Live call sites: `chat-buttons.js:2318`, `e2e-options.mjs:308`.

### A-4: `computeAttackDamage` String Multiplication NaN State Poisoning
* **ID**: `A-4`
* **Severity**: High
* **Symptom**: `const base = attack.damage ?? 0` in `attack-engine.mjs:12` lacks numeric parsing/validation. `card-stats.js:41-43` notes that printed damage arrives as strings like `'10'` or `'30+'`. Multiplying `'30+' * 2` produces `NaN`, setting `defender.damage = NaN`. Consequently, `damage >= koHp` never evaluates to `true` (making the Pokémon invulnerable to KOs) and `NaN` poisons the state hash.
* **Evidence**:
  * [`shared/engine/attack-engine.mjs:12`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/attack-engine.mjs#L12)
  * [`client/src/setup/netcode/card-stats.js:41-43`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/client/src/setup/netcode/card-stats.js#L41-L43)

### A-5: Ignored Dual-Type Weakness Multipliers
* **ID**: `A-5`
* **Severity**: Medium
* **Symptom**: `attack-engine.mjs:14-24` checks only the primary attacker type (`attacker.types[0]`). If an attacking Pokémon is dual-typed (e.g. Water/Lightning), weakness evaluation fails to apply if the defending Pokémon is weak to its secondary type.
* **Evidence**: [`shared/engine/attack-engine.mjs:14-24`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/attack-engine.mjs#L14-L24)

### A-6: Unreachable Dead Branch in `canPerformAction` (`viewDeck`)
* **ID**: `A-6`
* **Severity**: Low
* **Symptom**: In `rules-state.mjs:679-684`, both conditional branches for `viewDeck` return `allowed: false`, rendering the first block unreachable dead code.
* **Evidence**: [`shared/engine/rules-state.mjs:679-684`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/rules-state.mjs#L679-L684)

### A-7: Out-of-Turn Deck Manipulation via Missing Turn Allowlist Commands
* **ID**: `A-7`
* **Severity**: High
* **Symptom**: The turn allowlist in `reduce.mjs:619-635` omits deck manipulation commands: `revealCards`, `hideCards`, `revealShortcut`, `hideShortcut`, `shuffleIntoDeck`, `moveToDeckTop`, and `switchWithDeckTop`. Players can emit these commands on the opponent's turn to modify or inspect deck ordering.
* **Evidence**: [`shared/engine/reduce.mjs:619-635`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L619-L635)

### A-8: Negative Index Bounds Bypass in Zone Operations
* **ID**: `A-8`
* **Severity**: Medium
* **Symptom**: Zone modification operations check `payload.index >= zone.length` but lack a lower bound check (`payload.index >= 0`). Passing `index: -1` passes verification and causes `splice(-1, 1)` to alter the last item in the target zone.
* **Evidence**: [`shared/engine/reduce.mjs:516-534`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L516-L534)

### A-9: Client-Controlled Command Deduplication Vulnerability
* **ID**: `A-9`
* **Severity**: Medium
* **Symptom**: `room.mjs:229-241` skips deduplication completely if `clientSeq` is missing or non-numeric. Furthermore, it responds to stale sequence numbers with `success: true` without re-verifying current state viability.
* **Evidence**: [`server/game/room.mjs:229-241`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/server/game/room.mjs#L229-L241)

### A-10: Vestigial Name-Keyed Ability Tracking
* **ID**: `A-10`
* **Severity**: Low
* **Symptom**: `reduce.mjs:851` reads `abilitiesUsed?.[card.name]` alongside `instanceId` key after the `I48` refactor. Harmless provided no system writes by `card.name`, but represents residual debt.
* **Evidence**: [`shared/engine/reduce.mjs:851`](file:///c:/Users/SMG26/.gemini/antigravity/scratch/vibecodepokemontcg2/shared/engine/reduce.mjs#L851)

---

## Action Plan & Remediation Matrix

| Category | Finding IDs | Priority | Target Subsystem | Remediation Approach |
|---|---|---|---|---|
| **Turn Gating & Allowlist** | B-1, B-1c, B-2, B-2b, B-2c, B-3, A-7 | P1 | `shared/engine/reduce.mjs` | Restrict `takePrizes`, damage/condition modifiers, `promote`, and deck ops in turn allowlist (`validateLegality`). |
| **Retreat & Cost Parsing** | B-4, B-5, B-6 | P1 | `cards.mjs`, `card-stats.js`, `reduce.mjs` | Standardize `retreatCost` representation as array across client/server; validate `discardEnergyIds` count against retreat cost; validate promoted card is a Pokémon. |
| **Status Engine Parity** | A-1, A-2, A-3 | P2 | `reduce.mjs`, `status.mjs` | Refactor `specialCondition` to bitmask/set supporting simultaneous Poisoned+Burned; align client retreat permissions with server rules. |
| **Attack & Type Calculations** | A-4, A-5 | P2 | `attack-engine.mjs`, `card-stats.js` | Add `parseInt`/numeric sanitization to damage values before arithmetic; iterate all attacker types for weakness calculations. |
| **Zone & Dedupe Protection** | A-8, A-9, A-10, A-6 | P3 | `reduce.mjs`, `room.mjs`, `rules-state.mjs` | Enforce `index >= 0` on zone splices; enforce mandatory numeric `clientSeq`; prune vestigial name checks and dead branches. |
