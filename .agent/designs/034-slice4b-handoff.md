# Handoff — design 034 slice 4b (on-promotion / on-KO / extra-attack)

Written S280 (2026-09-24) after slice 4a commit. Read
`.agent/designs/034-ability-behaviour-implementation.md` first, then this. Slice 4a is done and
green; 4b is the remainder of the design's slice-4 row.

## State (trust git over prose)

- Branch `feature/ability-behaviour`, worktree `%TEMP%/opencode/ability-behaviour-wt`; primary
  checkout stays on `main`. Commits: `56b8486a` design+ledger, `ff74b498` s1, `c0c85aad` s2a,
  `d5fea83c` s2b, `ed9720d4` harness, `d14cb06b` s3 handoff, `09fb0713` **slice 3**,
  `163448d` **slice 4a**.
- Baselines: `pnpm test` → **3386 pass / 1 pre-existing fail**
  (`client/src/setup/rules/__tests__/card-inspector-model.test.mjs:766` "retreat greys…", fails on
  main too); `pnpm audit:oracle` → PASSED (unchanged by 4a); lint = prettier warnings only, 0 errors.
- `out/oracle-rows.json` is an untracked generated artifact — **never commit it**.
- Slice 4a shipped: pure `rules/ability-triggers.mjs` (D119) + wired Checkup damage, mandatory
  end-of-turn discard (Great Tusk ex), opponent-evolve counters (TR Ampharos), thorns
  suppression/zone. `parseOnKoAbilities`/`parseOnPromotionAbilities`/`parseBetweenTurnsAbilities`
  are **tested readers, not yet wired**. 12 tests in `shared/engine/__tests__/ability-triggers.test.mjs`.

## 4b scope (three items, each independently green)

1. **`movedToActiveTurn` stamp + on-promotion window.** The only missing piece for
   on-promotion abilities. Stamp the promoted root at **every** bench→active move site, delete on
   active→bench, then enforce in `abilityActivationBlockReason` (a card with an
   `onPromotionAbility` step is legal only when `movedToActiveTurn === turnNumber`).
   - Stamp sites (match by function, line numbers drift): `reduce.mjs` `promoteBenchToActive`
     (~1122, the KO auto/pick promotion), `reduce.mjs` `case 'moveCard'` bench↔active apply
     (~4993), `effects/executor.mjs` switch handlers (~837 opponent, ~903 own, ~975 opponent),
     `effects/attack-steps.mjs` switch (~93), `effects/trainer-steps.mjs` promotion (~1170).
     Mirror the `playedToBenchTurn` pattern (reduce.mjs ~4987-4990).
   - Reader: `parseOnPromotionAbilities(entries, ctx)` (ability-triggers.mjs) returns the step;
     `abilityActivationBlockReason` can also detect it inline via
     `parseAbility(cardAbilityText(card)).some(s => s.type === 'onPromotionAbility')` (ability-combat
     already imports both).
   - Thread `movedToActiveTurn` from `reduce.mjs` `useAbility` ctx (beside `enteredPlayTurn` /
     `playedToBenchTurn`).
   - **ORACLE RISK**: oracle ability rows place cards directly in the Active zone with no stamp. If
     the window fails *closed* on an absent stamp, those rows break. Fail **open** when the stamp is
     absent (only reject a *stale* stamp), or stamp setup-active cards; run oracle either way.
   - Corpus: Cobalion ex Metal Road / Iron Moth Thermal Reactor / Iron Valiant ex Tachyon Bits
     ("put 2 damage counters on 1 of your opponent's Pokémon") / Latios Lustrous Assist / Weavile
     Assaulting Hunt / Yanmega ex Buzzing Boost — all "Once during your turn, when this Pokémon
     moves from your Bench to the Active Spot, …".

2. **On-KO energy moves.** Miraidon Photon Cord / Raichu Electrical Grounding / Veluza Fillet
   Memento. Reader exists (`parseOnKoAbilities`); wire in `reduce.mjs` `handleKnockout` (~863,
   after the KO event, before discard). Needs a target choice (which Benched Pokémon) → executor /
   `pendingChoice`, so treat as a mini step, not a flat damage add.

3. **`abilityExtraAttack` (Dipplin Festival Lead).** Reader exists in `ability-combat.mjs`
   (read-only). "If Festival Grounds is in play, this Pokémon may use an attack it has twice. If the
   first attack KOs your opponent's Active, you may attack again after your opponent chooses a new
   Active." Touches the `attack` gate (`attackerAttacked`) and the auto-end-turn flow (KO →
   promotion → attack-again). Highest risk; do last.

## Invariants / constraints

- D117: `ability-combat.mjs` may import `tool-combat.mjs`; `ability-triggers.mjs` may import both;
  **nothing they import may reach `special-conditions.mjs`** (addCondition imports
  `abilityStatusImmune` — keep that direction only).
- `cardAbilityText(card)` (ability-executors.mjs) is the ONLY text accessor (plural `abilities[]`,
  I128).
- Ancient Traits exempt from suppression (D72); readers skip suppressed holders.
- `abilityActivationBlockReason` (D118) is the ONE activation gate shared by `reduce.mjs`
  `validateLegality` and the picker (`collect-usable-abilities.mjs`) — put the window there, not in
  the reducer only.
- In-memory state only: absent fields = "no effect"; no migration.
- One commit per increment; each leaves `pnpm test` + `pnpm audit:oracle` green.

## Verification recipe

- Narrow: `node --test shared/engine/__tests__/ability-triggers.test.mjs
  shared/engine/__tests__/ability-gates.test.mjs`
- Full: `pnpm test` (expect the known inspector fail only); gate: `pnpm audit:oracle` (~2 min, D108).
- Corpus probes (gitignored scratch, present in this worktree):
  `.agent/scratch/ability-series-audit/rows-rich2.json` (434 rows), `wordings.mjs "Name" ...` dumps
  a card's text, `behave3.mjs`. Use `node -e` (no `rg`).

## Watch-outs

- Working-copy files are CRLF (repo LF): use the Write/Edit tools — bash rewrites can re-encode;
  heredoc eats `\`.
- Oracle baseline ratchets only for legitimate improvements (D108); a full `--update-baseline`
  silently re-ratchets stale attack families — edit the affected family counts surgically.
- Merge caveat: main holds an untracked `.agent/designs/034-*.md` copy and uncommitted S278
  STATE/journal; delete the untracked copy before merging and expect the STATE/journal conflict.
- Design-number collision 032 (code comments mean the coin-gated design).
