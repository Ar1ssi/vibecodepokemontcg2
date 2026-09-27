# Handoff: parse holes and audit gate hardening (`claude/card-parsing-issues-9aedd6`)

Written 2026-09-28. The branch is main (`d163b53e`) plus the audit-hardening commit `4e030a4d` and
this handoff. It is opened as a PR and **not merged**. It changes no engine code: only the audit
gates, their tests, the baselines, the guide and MAP.

Verified on `4e030a4d`:
- Full `pnpm test`: 4484 pass, 0 fail.
- `audit:attacks`, `audit:abilities`, `audit:oracle`, the GX oracle and `audit:trainers` all PASSED.
- The oracle and GX oracle baselines were ratcheted up only (GX attacks executed 485 → 501, because
  markers and play locks are now visible).

## Why this work happened

The user reported three cards that do not work in play, and then a fourth. All four read `ok` in the audits.

| Card | Cause (verified by an engine run) |
|---|---|
| Keldeo ex Gale Thrust (TCGdex sv10.5w-030) | The damage-parser `evalCondition` has no "moved from your Bench" clause. It deals base 30 with the condition true. `attack-conditions.mjs` knows "moved from **the** Bench" only. `ctx.attackerMovedToActiveThisTurn` is already built but never read by the bonus path. |
| Samurott Torrential Whirlpool (sv10.5w-023) | `parseAbility` (`abilities.mjs` switch branch, around line 600) is a keyword bag. It emits one `switchAbility` and drops "If you do, switch out your opponent's Active". |
| Budew Itchy Pollen (sv08.5-004) | `atkOppPlayLock` matches only the GX wording "Your opponent can't play … during their next turn". The SV wording "During your opponent's next turn, they can't play …" parses to nothing, so `playLocks` is never written. **The reported 0 damage did not reproduce.** The engine deals 10 with TCGdex data. Ask the user what the opponent's Active was (Grass resistance?). |
| Serperior ex Regal Cheer (sv10.5b-003) | `ability-combat.mjs:108` `sideInPlay()` / `opponentInPlay()` return root cards. An evolved Pokémon's root is its Basic, so team-scoped and opponent-scoped passive readers read the Basic's text. It works from the Active only because reduce passes the attacker's evolved view. The same code path breaks an evolved Gothitelle's Item lock (verified), and also prevention, reduction, suppression, Prize, HP and retreat reads. |

## Why the audits missed them (fixed in `4e030a4d`)

1. The verdict never checked the damage amount. "Dealt damage" counted as the effect.
2. The engine's "resolve the printed condition" note was captured but never read.
3. One fixed board: most conditions are never true on it, so "not understood" looked the same as "not met".
4. The snapshot was per card only. Player-level locks were invisible.
5. Abilities had no sentence cross-check, and the ability baseline ratcheted family shares, not rows.
6. The corpus is pkmncards text. The game reads TCGdex text: curly apostrophes (SM era) and type
   words (BW/DP era, e.g. "attach a Fire Energy card"). Both were confirmed on live TCGdex cards.
7. Every probe board placed the ability holder as a Basic, never as an evolution stack.
8. Fixes were written for one exact wording, sometimes in only one of two condition parsers.

## What the gates check now

Full details are in `docs/card-parsing-and-audit-guide.md` §8 "Busy is not right".

- **Attacks** (`scripts/lib/attack-behaviour.mjs`):
  - `unresolved-damage` notes
  - `bonus-not-applied`: condition-true replay, `scripts/lib/condition-replay.mjs` `CONDITION_SETUPS`
  - lock mechanics
  - `typography` drift: `scripts/lib/text-variants.mjs`
- **Abilities** (`scripts/lib/ability-behaviour.mjs` `rowFlags`):
  - `clause:<mech>`
  - `typography:<variant>:<parser>`
  - `stack-<zone>:<reader>`: `ability-passive-probe.mjs` stacked boards
  - These flags are ratcheted per row by name (`flagged` in the baseline, `checkFlagGate`).
- `executed-families.mjs`: the `when-played` claim was withdrawn (17/39 rows after the clause check, D136 rule).

## Backlog the gates now name

Run `pnpm audit:attacks --rows` and `pnpm audit:abilities --rows`. The rows are written to
`out/*-behaviour-rows.json` (untracked).

- **Attacks:** 696 of 3528 are `partial`.
  - unresolved-damage: 415
  - bonus-not-applied: 68
  - typography: 142
  - locks: 22
- **Abilities:** 2649 unique.
  - stack: 398
  - typography: 147
  - clause: 117
- **Real bugs seen while tuning the clause check (not fixed):**
  - Mabosstiff Intimidating Howl and Shinx Big Roar switch your own Active, not the opponent's.
  - Houndoom Fire Breath's Burn lands on its own side.
  - Crawdaunt Unruly Claw pays its hand cost and skips the effect.
- **Candidate sibling holes:**
  - 10 attacks use the "moved from your Bench / was on your Bench and became" wording: Rapid
    Strike Urshifu VMAX, Mega Lopunny ex, Dragapult V, Golisopod(-GX), Mawile VSTAR,
    Raichu & Alolan Raichu-GX, Revavroom ex, Scizor-EX, Keldeo ex.
  - The Samurott-style dropped opponent switch also appears on Hatterene, Metagross, Vanilluxe and
    Mawile VSTAR Star Rondo.
  - The SV-wording Item lock also appears on Banette ex, Noivern ex, Scream Tail ex and Pikachu V-UNION.

## Next, in order

1. **Engine:** `sideInPlay` / `opponentInPlay` should return `evolvedView(zoneCards, root)` for
   each root (`evolved-pokemon.mjs`). This one fix should clear most of the 398 `stack-*` flags.
   Callers compare identity against `ctx.sideActive`/`sideBench` (`holderZone`), so keep the root
   for position checks. This is an engine change, so it needs `review.md` by a second agent before main.
2. Route the damage-parser conditional bonus through `attack-conditions.mjs`
   `parseConditionClause` / `attackConditionMet` (one condition vocabulary). 40 of the 256
   unresolved bonus conditions are known there already. Add "your Bench" to the moved-to-Active
   clause.
3. Parse the "If you do," follow-up in `parseAbility`'s switch branch (the opponent-switch half),
   and the SV lock wording in `attack-steps.mjs` (`atkOppPlayLock`).
4. Fix the typography drift: normalize type words and curly quotes at the parser entry points
   (the `ea389d92` special-Energy fix is the precedent).
5. After each fix, run the gates with `--update-baseline` and check that the flags vanish.

## Notes

- `.agent/scratch/parse-holes/` (gitignored) has the probes: `probe3.mjs`, `directed.mjs`,
  `serperior.mjs`, `stack-lock.mjs`, `sweep.mjs`, and `FINDINGS.md`.
- The ability gate now takes about 2.5 min (two extra probe boards).
- The user's global CLAUDE.md says `gh` is not authenticated. It is (`gh auth status`: Ar1ssi, keyring).
