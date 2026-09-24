# Handoff — design 034 slices 5b / 6 / 7 (ability behaviour)

Written S281 (2026-09-24) on branch `feature/ability-behaviour`, after slice 5a. Read
`.agent/designs/034-ability-behaviour-implementation.md` first, then this. Slices 1-5a are done
and green; this branch also carries an **uncommitted slice-5b work-in-progress** (see below).

## State (trust git over prose)

- Branch `feature/ability-behaviour`, worktree `%TEMP%/opencode/ability-behaviour-wt`; primary
  checkout stays on `main`. The branch is **local-only** (no upstream) as of S281.
- Commits through slice 5a: `ff74b498` s1, `d5fea83c` s2b, `09fb0713` s3, `163448db` s4a,
  `c4858f77`/`762bd31e`/`f45abfac` **slice 4b**, `40e5c357` 4b cleanup, `c6392bb8` **slice 5a**,
  `066ee1f6` harness.
- Baselines: `pnpm test` → **3399 pass / 1 pre-existing fail**
  (`client/src/setup/rules/__tests__/card-inspector-model.test.mjs:766` "retreat greys…", fails on
  main too); `pnpm audit:oracle` → PASSED (unchanged by 4b/5a); lint = prettier warnings only.
- `out/oracle-rows.json` is an untracked generated artifact — **never commit it**.

## Slice 5a shipped (c6392bb8)

Six ability step types gained `EXTRA_STEP_HANDLERS` in `effects/trainer-steps.mjs`:
`moveDamageBetweenAbility` (own↔own counters; parser emits `toSelf`), `recoverStatusAbility`
(Blissey Busybody Nurse), `selfDamageAbility` (Dodrio/Feraligatr, marks `damageCountersPlaced`),
`turnDamageBonusAbility` (pushes `flags.turnDamageBonuses` with `attackerInstanceId`;
`turnDamageBonusTotal` now scopes by it), `selfBenchPlacementAbility` (Luxray/Klinklang;
`condition: morePrizes|opponentStage2`, plus `swapActive`), `returnSelfToHandAbility`.

## Slice 5b-1 DONE (S282, branch `claude/exciting-meitner-pt47ts`)

The WIP below was verified and corrected: parse site #6 (not #51) catches most move-Energy texts,
so both now spread `parseMoveEnergyShape` (D123); the handler was rewritten (self/active/bench/
between, target tags, forced single move auto-resolves). `atkMill` does have a handler. Farfetch'd
is a Tool *search-attach*, fixed via `what: 'Pokémon Tool'`. Only the reveal-hand item remains.

## (historical) Slice 5b WIP as handed off by S281

Implemented but **NOT yet verified green** (run the suite + oracle before committing):

1. **Generic `moveEnergyAbility`** handler (`effects/trainer-steps.mjs`): destination fixed by
   `step.target` (`'self'`|`'active'`|`'bench'`), filter by `basic`/`energyType`, `upTo`/any-amount.
   Parser (`rules/abilities.mjs`) now emits `target` and reads the "to your Active Pokémon" wording
   (Dewgong Wash Out / Armarouge Fire Off) and "any amount … to this Pokémon" (Cobalion ex Metal
   Road). Tests added in `__tests__/ability-execution.test.mjs` (Bubble Gathering, Wash Out).
2. **`ABILITY_PREAMBLE` widened** (`rules/attack-steps.mjs`): accepts `you must` (mandatory
   when-played, Gyarados Untamed One) and "from your hand onto your Bench during your turn"
   (Durant ex / Chien-Pao). `parseAbilityEffectSteps` now yields `atkMill` for those. **Verify
   `atkMill` has an `ATTACK_STEP_HANDLERS` entry** before relying on execution.

## 5b remaining

- Opponent-disrupt **reveal-hand** wordings (Zubat Revealing Echo, Mandibuzz Look for Prey,
  Thievul Rob-'n'-Run, Hawlucha Flying Entry): Zubat parses to a `holderZone: active` with **no
  steps** — the templates have no reveal-hand block. Needs an `opponentDisruptAbility` handler
  (reveal / discard-random / shuffle-hand-to-bottom) or a template block.
- **Tool-return parse fix** (Farfetch'd Impromptu Carrier; Shopping Center "put a Pokémon Tool
  attached to 1 of their Pokémon into their hand"): the `returnTool` switch case in
  `effects/executor.mjs:1226` exists but is Stadium-only and has no ability parse path.

## Slice 6 (executor batch B, one-offs)

Per the design's work-plan row: transform, win-game, self-attach-as-energy, stadium-manip,
energy-swap, discard-bench, deck-place, draw-variable, discard-for-draw, coin-control,
play-extra-supporter, turn-not-end, attack-copy ability, setup/prize placement. Each is a new
`EXTRA_STEP_HANDLERS` entry + parser step; several already have read-only parsers. `attackCopyAbility`
should reuse `rules/attack-copy.mjs` at attack time.

## Slice 7 (regression gate — the capstone)

- Promote the scratch probe + behave scripts to `scripts/audit-ability-behaviour.mjs` with a
  committed per-class baseline (ratchet, like `scripts/audit-oracle.mjs`, D108) and a
  `pnpm audit:abilities` script. Scratch sources live in
  `.agent/scratch/ability-series-audit/` (`rows-rich2.json` 434 rows, `wordings.mjs`, `behave*.mjs`).
- Update `EXECUTED_ABILITY_FAMILIES` only after the gate observes the family (D108).
- Close I128/I129/I130 and annotate the audit reports.

## Invariants / constraints

- D117: `ability-combat.mjs` may import `tool-combat.mjs`; `ability-triggers.mjs` may import both;
  **nothing they import may reach `special-conditions.mjs`** (addCondition imports
  `abilityStatusImmune` — keep that direction only).
- `cardAbilityText(card)` (ability-executors.mjs) is the ONLY text accessor (plural `abilities[]`,
  I128). Ancient Traits exempt from suppression (D72).
- `abilityActivationBlockReason` (D118) is the ONE activation gate shared by `reduce.mjs`
  `validateLegality` and the picker (`collect-usable-abilities.mjs`).
- In-memory state only: absent fields = "no effect"; no migration.
- One commit per increment; each leaves `pnpm test` + `pnpm audit:oracle` green.
- New ability executables register in `EXTRA_STEP_HANDLERS` (`effects/trainer-steps.mjs`) — local
  style; there is no `effects/ability-steps.mjs` despite the design's wording.

## Verification recipe

- Narrow: `node --test shared/engine/__tests__/ability-execution.test.mjs`
- Full: `pnpm test` (expect the known inspector fail only); gate: `pnpm audit:oracle` (~2 min, D108).
- Lint: `pnpm lint` needs local `node_modules` (absent in this worktree) — prettier warnings only.
- Corpus: `node -e` probes over `.agent/scratch/ability-series-audit/rows-rich2.json` (gitignored
  scratch, present in this worktree; `node -e` has Windows quoting pitfalls — write a temp `.mjs`).

## Watch-outs

- Working-copy files are CRLF (repo LF): use the Write/Edit tools — bash rewrites re-encode, and
  PowerShell `Add-Content`/here-strings corrupt non-ASCII (`é`, `’`) into `U+FFFD`, silently
  breaking parser regexes that match `pok[eé]mon`.
- Oracle baseline ratchets only for legitimate improvements (D108); edit affected family counts
  surgically — a full `--update-baseline` silently re-ratchets stale attack families.
- Merge caveat: main holds an untracked `.agent/designs/034-*.md` copy and uncommitted S278
  STATE/journal; delete the untracked copy before merging and expect the STATE/journal conflict.
- Design-number collision 032 (code comments mean the coin-gated design).
