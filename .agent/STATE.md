# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 251
Focus: audit of item/energy/ability/attack/attack-effect bugs (same class as the glow bug) + fixes.
Active: 31 fixes landed, UNCOMMITTED on main (suite 2844 tests, 2843 pass).
Next: review/commit the S251 diff; then I78–I80 (deferred). Maintenance due at S260.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- S251 uncommitted: run `git status`/`git diff` before anything else; fixes span `shared/engine/reduce.mjs`, `effects/executor.mjs|special-energy.mjs|ability.mjs|trainer.mjs|stadium.mjs|trainer-steps.mjs`, `rules/{rules-state,attack-window,attack-effects,attack-pending-effects,collect-usable-abilities,ability-executors,stadium-effects,resolve-attack-context}.mjs`, and client `move-card.js`, `chat-buttons.js`, `trainer-execution.js`, `rules-bridge.js`, `action-affordances.mjs`, `card-inspector-model.mjs`, `ability-picker.js`, `e2e-options.mjs`, `attack-preview-sources.mjs`.
- ONE pre-existing failing test: `card-inspector-model.test.mjs` "retreat greys only when the cost is unpaid" — verified failing at HEAD with the S251 diff stashed. Suite otherwise 2843/2844.
- `pnpm test` on this checkout triggers an implicit install and (before S251) emptied `node_modules`; `pnpm install` restores it. Prefer `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"`.
- Design 023: glows recomputed per turn from legality; colour only via `.has-glow` + `--glow-rgb`. The found "glow stops" cause class (bare catch wiping all glows) is still present in `hookActionAffordances` (rules-bridge.js:1949-1962) — not fixed here (no repro).
- Client legacy mode still lags the server on: GX once-per-game (I79), fossil Items (I80), simultaneous stadium KO tiebreak (I78, server-side).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S251 audit+fix: server soft-locks (unpayable discard cost), special-energy lethal KOs + evolved-host type gates, Legacy once-per-game marker erased by advanceTurn, ability consumed with no target, attack pricing (passive/stadium discounts, plural abilities, out-of-range index), stadium drop flag, ability-negation Stadium, Mega-evolve Checkup, defender attack lock, status-aware attack windows.
- S251 client parity: Trainer pickers that moved cards to the wrong zone (Kofu, attach-from-discard), Trainer replay marker on return to hand, Rare Candy same-turn Basic, trainerType-only Supporter gate, attacker special-energy damage, untyped Energy readers, on-attach search picker, played-to-bench window under authority, Asleep/Paralyzed affordances, `attackExecuting` flag.
