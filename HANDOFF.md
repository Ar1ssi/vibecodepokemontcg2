# HANDOFF — design 036 attack behaviour (stopped after slice 6)

Written 2026-09-24 (S284) when the user stopped the session mid-verification. This branch has all
the work; read this file first, then the design. The harness in the primary checkout was updated
for this stop, so nothing here is unrecorded.

**Update S287 (2026-09-24):** the PENDING re-review below is DONE (no blocker; two pre-existing
follow-ups recorded in the design Deviations) and slice 7 (A5 discard-scaling "or" groups) is
committed. Next: slice 8 (A6 heal wordings) per the design work plan.

## Where you are

- Branch `feature/attack-behaviour` (this branch), base `main` `7baf0c9e`. Worktree used:
  `C:\Users\SMG26\AppData\Local\Temp\opencode\attack-behaviour-wt`.
- Slices 1–5: commits `7d3e9dd4..fe9cefc9`. Slice 6: `aa5f2845`. Nothing merged.
- Spec: `.agent/designs/036-attack-behaviour-implementation.md` in the primary checkout
  `C:\Users\SMG26\Downloads\vibecodepokemontcg2-main` (design file is untracked and lives only
  there). Audit corpus: `.agent/scratch/attack-full-audit/` (gitignored, primary only).
- Harness already updated at the stop: STATE (Active/Next/watch-outs), journal (`S284 cont.`),
  design Status + Deviations + edge row 16, DECISIONS D120, I136 parenthetical.

## Slice 6 — what was built (A4 conditional-KO templates)

- `rules/attack-steps.mjs`: templates for "If your opponent's Active Pokémon is a Basic Pokémon,
  it is Knocked Out." / "…has any Special Energy attached…" / "…has N HP or less remaining…" /
  "Both Active Pokémon are Knocked Out." / the three least-HP Bring Down wordings / "Knock Out 1
  of your opponent's Radiant Pokémon."
- `effects/attack-steps.mjs`: `atkKnockOut` gained `scope:'both'` and the `specialEnergy` /
  `maxRemainingHp` conditions; `atkKnockOutChoose` gained `leastHp` (both sides, attacker
  excluded, player picks on a tie) and `ruleBox` (the `defenderRuleBox` vocabulary; only
  `radiant` is emitted today). Remaining HP now counts Tools/Special Energy/Stadium via
  `stadium-effects.effectiveHp`.
- `rules/attack-conditions.mjs`: "You can use this attack only if <clause>" now gates the attack
  (Beedrill Destiny Stinger's damage counters; the other 28 use-only-if wordings have no readable
  clause yet and stay ungated).
- `reduce.mjs`: `settleKnockOutWins` — one win evaluation per Knock Out, or once per batch
  (`handleKnockout`'s `deferWin`, used by `resolveDamageCounterKnockouts`). The previous review
  found that a two-KO command (the new both-Actives wording) evaluated wins per KO and the second
  `setGameEnded` overwrote the first, so a genuine simultaneous win never reached the tiebreak.
- Tests: `shared/engine/__tests__/attack-conditional-ko.test.mjs` (11 cases, incl. the
  last-Prize and double-wipe tiebreaks). `scripts/oracle-baseline.json`:
  `attack:conditional-ko` observed 19 → 20.

## Verification run (all green before the stop)

- `node --test shared/engine/__tests__/attack-conditional-ko.test.mjs` → 11/11.
- Full `pnpm test` → 3399/3400, only the pre-existing
  `client/src/setup/rules/__tests__/card-inspector-model.test.mjs` failure.
- `pnpm audit:oracle` → PASSED (0 failures, 11 known warnings); `--update-baseline` committed.
- `behave.mjs` F3 (Haxorus Axe Blast) and F4 (Annihilape Destined Fight) now Knock Out
  (previously dealt 0 / did nothing).
- `npx eslint <changed files>` → 0 errors (CRLF prettier warnings only).

## PENDING — start here

1. **Focused re-review of `settleKnockOutWins`** (the previous review's blocker fix; the session
   stopped before the re-review ran). Questions to answer with fresh eyes:
   - Is the generic `ways[pid] = byPrizes(pid) + wiped(opponent)` equivalent to the old per-KO
     block for every direct `handleKnockout` caller (attack damage, recoil, thorns, checkup)?
     The added `owed > 0` guard exists because synthetic zero-prize boards otherwise "win".
   - Can the batch evaluation double-fire (runAttackSteps then the applyCommand tail) or overwrite
     a conclusion reached earlier in the command?
   - Promotion interaction: `handleKnockout` marks `promotionPending` while `deferWin` holds the
     game open; `settlePromotionChoices` skips when the batch then ends the game.
   - If you find a bug, fix + test + update the design Deviations/STATE/journal.
2. Then slice 7 (A5 discard-scaling "or" groups — Dragon Burst) per the design work plan; resume
   kit `.agent/scratch/036-slices-5-16-handoff.md` (its "TASK NOW" was updated to slice 6 at the
   slice-5 stop — treat this file as newer).

## Known leftovers from slice 6's first review (recorded, not silently dropped)

- `remainingHp` (effects/attack-steps.mjs) duplicates `cardEffectiveHp` (reduce.mjs) in formula;
  both call `stadium-effects.effectiveHp`. Left as-is (a dedup would move a helper across modules).
- Damage-counter-threshold KOs ("has 3 or more damage counters on it, that Pokémon is Knocked
  Out" — Gengar Creep Show, Kingambit Strike Down) and the name-based wordings (Ultra Beast,
  Team Plasma, named-both actives) are still unparsed; they were outside A4's stated sub-wordings.
- `ruleBox` on `atkKnockOutChoose` carries the full `defenderRuleBox` vocabulary; only `radiant`
  has a consumer today.

## Environment gotchas

- The worktree's `node_modules` periodically goes partial (jsdom / @eslint/js missing → six client
  test files error). `pnpm install --force --prefer-offline` restores it; re-run the suite after.
- `gh` is not authenticated, but `git push` works via the Windows credential manager.
- `behave.mjs` lives in the primary's gitignored scratch; copy
  `.agent/scratch/attack-full-audit/` into the worktree's `.agent/scratch/` to run it against this
  branch's engine, then delete the copy.
- Bash heredoc eats `\`; the working copy is CRLF (repo LF). Run tests from the worktree.
