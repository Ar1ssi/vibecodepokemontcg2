# Handoff: evolved-holder Ability readers (`claude/parse-holes-next`)

Written 2026-09-28. Continues `.agent/designs/parse-holes-handoff.md` (on branch
`claude/card-parsing-issues-9aedd6`). This branch starts at that branch's head `0c892e3d`, so it
carries the audit-gate hardening `4e030a4d`. Merged to `main` with PR #190 as PR #194 (`385483b`).

**Update (branch `claude/pr-194-handoff-check-oekv67`): items 2–5 below are done; see
"Items 2–5: done" at the end.** Everything above that section is history.

## Base decision (from the user)

Local `main` has another agent's parse-hole work (`37c9b917`, 37 commits ahead of
`origin/main`). The user said to keep working on this branch. That work will be overwritten,
because this branch and other agents cover most of it. So do not rebase onto local `main`, and do
not cherry-pick from it.

## Done: item 1, evolved holders (commit `a984c801`)

The server stacks an Evolution under its Basic root. Readers that walked roots read the Basic's
text, not the top card's Ability.

- `shared/engine/rules/ability-combat.mjs`:
  - `sideInPlay`, `opponentInPlay`, the `isAbilitySuppressed` sources and the
    `abilityCounterMoveLock` sources now return `evolvedView` per root.
  - Identity checks use `sameCard` / `containsCard`, which match by instanceId because a view is
    a copy.
- `shared/engine/rules/ability-triggers.mjs`:
  - `inPlayEntries` entries carry `view`.
  - The parsers read text, name and target filters from the view.
  - `holder` and targets stay the root, so writes land on the root.
  - Energy-attach triggers read each holder's view.
- `shared/engine/rules/tool-conditions.mjs`: `holderView` now returns `evolvedView`. It used to
  return the bare top card, which has no Energy or damage attached to its id.
- `shared/engine/rules/tool-combat.mjs`: the Rescue Board HP check reads the holder's HP.
- `shared/engine/rules/evolved-pokemon.mjs`: `stackEvolutions` returns `[]` for a root without an
  instanceId. Before, `undefined === undefined` matched every unattached card.
- Probe and gate:
  - `ability-passive-probe.mjs`: the `noRetreatForActive` probe now calls the reader the same way
    reduce.mjs does (evolved views plus the Active zone).
  - `stackDrops(reads, text)`: skips stage-worded Abilities ("Basic" not followed by "Energy",
    "can evolve"). The stacked holder is a Stage 1, so these can differ for real.

Fixed in play:
- An evolved Gothitelle's Item lock.
- A benched evolved Serperior ex's Regal Cheer.
- Evolved Froslass and Tyranitar Checkup damage.
- On-KO, end-of-turn and energy-attach triggers on evolved holders.
- An evolved Metang's Levitate.

Tests (each fails without the fix):
- `shared/engine/rules/__tests__/ability-combat.test.mjs`: "evolved holders" ×3
- `shared/engine/__tests__/ability-triggers.test.mjs`: "evolved holders" ×2
- `scripts/lib/ability-passive-probe.test.mjs`: stack tests

Verified on `a984c801`:
- `pnpm test`: 4490 pass, 0 fail.
- `audit:abilities`: stack-* flags went from 398 rows to 0. The baseline was ratcheted with
  `--update-baseline`. Remaining flags: typography 246, clause 127.
- `audit:attacks`, `audit:trainers`, `audit:oracle` and the GX oracle all PASSED.

**Open:** this is an engine change, so it needs `review.md` by a second agent before `main`.
Two review spawns failed: one session exited, and one hit an auto-mode classifier error. Run
the review first.

## Next, in order

1. **Review `a984c801`**. Check:
   - that no view (copy) is written to
   - any identity `===` / `includes` left in the touched files
   - reduce.mjs callers of `holderView`, `inPlayEntries` and `sideInPlay` results
2. **Mabosstiff Intimidating Howl / Shinx Big Roar** (TCGdex / corpus: Paldean Fates 063,
   Paldea Evolved 068). `parseAbility` (`abilities.mjs` §3 "Switch / bring in", about line 600)
   emits `switchAbility` with `target: 'self'`. The target is `'opponent'` only when the text
   says "opponent's benched". "switch out your opponent's Active Pokémon to the Bench" (a gust
   where the opponent chooses) matches the switch branch through `isBenchActiveSwitchText`.
   Fix: detect `switch out your opponent's active`. Emit an opponent switch where the opponent
   chooses, and keep the "If this Pokémon is in the Active Spot" gate for Shinx. Check how the
   Hatterene / Mawile "If you do, switch out your opponent's Active" executor works and reuse it.
3. **Houndoom Fire Breath** (Undaunted 82, Dark Houndoom TRR 37, Blaziken PL 3):
   - `statusAbility` has `target: 'attacker'`, so the Burn lands on its own side. "the Defending
     Pokémon" / "1 of the Defending Pokémon" means the opponent's Active.
   - The "can't be used if … affected by a Special Condition" sentence also parses as a spurious
     `effectPreventAbility`.
4. **Crawdaunt Unruly Claw** (Primal Clash 92). "you may discard an Energy attached to your
   opponent's Active Pokémon" parses as `discardCostAbility` (a discard from your own hand, as a
   cost) plus `whenPlayedAbility`. The effect never runs. It should be a when-evolved discard of
   an opponent's Energy.
5. **Type-word drift** (BW/DP TCGdex spelling, "attach a Fire Energy card"): normalize at the
   attack and ability parser entry points. `ea389d92` is the precedent.
6. **The rest of the backlog**: `pnpm audit:abilities --rows` and `pnpm audit:attacks --rows`
   write `out/*-behaviour-rows.json`.
7. After each fix, run the gates with `--update-baseline` and check that the flags vanish.

## Notes

- `.agent/scratch/parse-holes-next/` (gitignored) holds these probes:
  - `stack-lock.mjs`, `serperior.mjs`, `retreat.mjs`
  - the edit scripts
  - the gate outputs `abil*.txt`
- The primary working copy is CRLF. The node edit scripts keep CRLF. The Bash heredoc mangles `\`.
- `gh` is authenticated as Ar1ssi.

## Items 2–5: done (branch `claude/pr-194-handoff-check-oekv67`)

Written 2026-09-28. Item 1's review was not run: the user asked to open the PR without it.

- **2. Gust Abilities** (`abilities.mjs` §3): a stand-alone "you may switch out your opponent's
  Active Pokémon to the Bench" emits `switchOpponentOut` (the opponent picks). Covers Mabosstiff
  Intimidating Howl, Shinx Big Roar (the Active Spot gate is `requiresActiveSpot`) and Iron Bundle
  Hyper Blower. Iron Bundle's "If you do, discard this Pokémon and all attached cards" is a
  `selfLeavesAbility` after the gust. It no longer parses a spurious `opponentDisruptAbility`.
- **3. Fire Breath**: "the Defending Pokémon" / "1 of the Defending Pokémon" is now
  `target: 'opponent'`. This fixed 29 old Poké-Powers (Hypno, Drapion, Articuno, Vileplume …).
  §27 reads `statusText`, so a "This power can't be used if …" restriction no longer adds an
  `effectPreventAbility`. That step was dropped from 292 rows.
- **4. Unruly Claw**: Crawdaunt and Lycanroc-GX Twilight Eyes emit
  `discardEnergyFromOpponent { scope: 'Active' }`. The new `Active` scope is in `trainer-steps.mjs`.
- **5. Type words**: `symbolizeTypeWords` (`rules/attack-text.mjs`) runs in `normalizeAttackText`,
  in the ability `normalizeText` and at the `parseAttackDamage` entry. It converts a type word only
  in a cost run or before Energy/Pokémon/type/less/more/Weakness/Resistance, or after "type is" /
  "attack for". Names and Double Colorless / Double Dragon / Dark Metal Energy keep their words.
  The damage type-gated bonus reader now accepts `{w} pokémon`.
  - Corpus parses: unchanged.
  - Typography flags: Abilities 252 → 0, attacks 171 → 0.
  - New gate: `typography-parity.test.mjs`, type-words case.

Verified:
- `pnpm test`: 4808 pass, 0 fail.
- `audit:abilities`, `audit:attacks`, `audit:trainers`, `audit:oracle` and the GX oracle all
  PASSED. The Ability and attack baselines were ratcheted.
- GX oracle: no-effect went 238 → 201, and no family regressed.

### Next

1. **Review** this branch's engine diff (`review.md`) before building more on it.
2. **13 masked "If you do," Poké-Powers.** Their cost half never parsed. They are listed in the
   `KNOWN_GAPS` of `scripts/lib/ability-if-you-do-coverage.test.mjs`: Poliwrath Strange Spiral,
   Beedrill Final Sting, Electrode Buzzap, …
3. **Krookodile Black Eyes** (Emerging Powers 62): a coin-gated opponent-Active Energy discard. It
   parses as `opponentDisruptAbility`. Reuse `scope: 'Active'` inside a `coinFlip`.
4. **Feraligatr Major Tsunami** (Expedition 12/47): the opponent switches, then this Pokémon
   switches ("Either way"). It parses as the player's own switch only.
5. **Venusaur Solar Power** (Wizards Promo 13) and **Ditto Transform** (Fossil 18) are cures or
   copies. They are still parsed as a `statusAbility`.
6. `clause` flags: 98 rows left (`pnpm audit:abilities --rows`).
