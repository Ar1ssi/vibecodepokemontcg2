# Card-era audit and fix process

How to audit every card effect of one printing era (a block of sets), turn the findings into
fixes, and land them using parallel agents without losing correctness. Written after the
2026-10-01 WotC Gen 1/2 run (Base Set → Neo Destiny, Southern Islands, Legendary Collection).
That run is the worked example throughout; its records are on branch
`claude/friendly-davinci-oy3ko5`: design `.agent/designs/062-wotc-audit-fixes.md`, the audit
report `.agent/designs/refs/062-wotc-card-audit-2026-10-01.md`, and issues I224–I232.

For the parsers and audit scripts themselves, see `docs/card-parsing-and-audit-guide.md`. This
document covers the process around them.

## 0. Ground rules that held up

- **Card text is looked up, never recalled.** Sources in order: `out/pkmn-*-cards.json` corpora
  (pkmncards scrapes), then TCGdex. Every test cites its row (`<name> [<set> <number>]`) or its
  TCGdex id. Rulings beyond the printed text need a cited URL; if none is found, the case is
  reported as a gap and not implemented.
- **The engine sees TCGdex, not pkmncards.** Trainer text arrives as TCGdex `effect`, and
  TCGdex leaves most old Trainers untyped (162 of 176 WotC Trainers had no `trainerType`). Old
  Powers are typed `Pokemon Power`, `Poke-POWER` and `Poke-BODY`. Check what TCGdex actually
  delivers before trusting a parser fix (§5, lesson 1).
- **Rewrite old wording to modern wording the engine already handles** (D202). When a WotC
  sentence means exactly what a modern sentence the parser already handles means, rewrite it
  rather than add a template. One code path, one behaviour, pinned by an equivalence test.
- **Don't ship approximations.** If a family needs a ruling you can't source, or a mechanism
  the engine lacks (a face-down card in play, a damage-time coin flip), leave it untouched and
  file it. Don't fix half a family.

## 1. Audit (read-only)

1. **Build the era corpus.** `node scripts/scrape-pkmncards.mjs --query="set:bs,ju,fo,b2,ro,g1,g2,n1,n2,n3" --out=…`
   then a second query for the rest. pkmncards caps a `set:` list at 10 codes. Merge the results
   into `out/pkmn-<era>-cards.json` and commit it, because every later citation points at it.
2. **Snapshot what TCGdex delivers** for the card kinds whose metadata matters. For Trainers,
   fetch each set (`/v2/en/sets/<id>`) and keep `{id, name, trainerType, effect}` per Trainer in
   `out/tcgdex-<era>-trainers.json`. This is the input the engine actually gets.
3. **Run every gate against the era corpus:** `audit:attacks`, `audit:abilities`, `audit:oracle`,
   `audit:trainers`, plus `scripts/audit-all-trainers.mjs` / `-special-energy` / `-stadiums`.
   Swap the corpus files in an audit worktree, never on the primary folder.
4. **Probe what the audits can't see.** Small reducer scripts: run one attack, then have the
   opponent hit back for 40 and try to retreat (catches protection and lock markers). Use one
   Power with a full prompt trace. Run passive Powers on a board with and without the Power
   text. Play every Trainer untyped, as TCGdex delivers it. Validate each probe on a modern card
   that already works before trusting a "broken" result.
5. **Write the report**: headline counts per area, then findings F1…Fn (cause with
   `path:line`, a repro, affected cards), then appendices listing every row. File one
   ISSUES.md line per finding. A report is not a fix list until each finding has a cause.

## 2. Triage into tranches

Sort the findings by **what the fix needs**, not by severity alone:

| Kind | Example from 062 | Who builds it |
|---|---|---|
| Old wording ≡ a modern wording that already works | Withdraw → modern "prevent all damage … by attacks"; Rain Dance → "from your hand" | `slice-builder` (pinned) |
| Missing metadata the printed text implies | Untyped Stadium/Tool derived from "This card stays in play…" | `slice-builder` (pinned) |
| Dropped clause in an existing parser | "Discard … in order to" costs; Super Potion's heal amount | `slice-builder` (pinned) |
| New mechanism or a rules interpretation | Attach-Trainers lifecycle, Baby Rule, presence-scoped locks, Toxic Gas | Judgment agent per group |
| Needs a ruling or engine capability that doesn't exist | Mirror Move replay, face-down Secret Plan | File it; don't build |

**Tranche 1** is the first three rows. Pin each slice by an **equivalence test**:
1. Find the modern wording and confirm *today's* parser reads it (run `parseAttackSteps` /
   `parseAbility` / `parseTrainerEffect` on it in a scratch script).
2. Prototype the rewrite in a scratch copy, confirm old parse deep-equals modern parse, then
   revert. The prototype becomes the slice's contract, word for word.
3. Count how many corpus printings each rewrite covers, using the regex over the corpus.

Write the design (`.agent/designs/TEMPLATE.md`): Options with rejected alternatives, an edge-case
table, and a work plan whose rows name files, signatures and `input → expected` test cases with
cited sources. A row a low-effort builder would need to make a choice in is not pinned yet.

## 3. Build in parallel

- **Pinned slices → `slice-builder` agents**, one per slice, `isolation: "worktree"`, launched
  in one message. Brief = design path + row + files, never pasted file bodies. They return gaps
  instead of guessing. In 062 they returned three gaps:
  - an `EXP.ALL` dot breaking a `[^.]+?` regex;
  - a corpus typo (`..` after a stripped reminder);
  - an audit heuristic misreading "take … attached to … and attach it to" as a deck attach.
- **Judgment groups → general agents**, one per engine area, so file overlap stays small. 062's
  follow-up groups:
  - attach-Trainers + legacy client;
  - passive/dead Trainers + Gyms;
  - attacks;
  - Powers;
  - Baby Rule.

  Each designs, builds, tests and commits on its own worktree branch, and returns a per-card
  status table plus the alternatives it rejected.
- **Worktrees start from `origin/main`**, not from your feature branch. Push the feature branch
  first and make every brief start with
  `git fetch origin <branch> && git merge --ff-only origin/<branch>`.
- **Agents never edit `.agent/`** (STATE, ISSUES, DECISIONS, MAP). They report and you record.
  Tell each agent which hot files another agent is touching (`reduce.mjs`, `trainer-steps.mjs`)
  so its edits stay local.
- **Rate limits are not failures.** An agent cut off mid-run keeps its worktree. Check
  `git -C <worktree> log/status`, then `SendMessage` it to resume with its context.

## 4. Merge, verify, review

1. **Merge each agent as it reports.** A slice-builder doesn't commit, so use `git add -A` in its
   worktree, `git diff --cached > slice.patch`, then `git apply --3way` on the branch. A judgment
   agent commits, so `git merge` its branch.
   - Conflicts were almost always two independent additions at the same spot: keep both sides.
   - Damage pipelines need ordering, not a pick. In 062 the order is Defender's reduction, then
     the WotC Power modifiers, then Strikes Back read before the KO check.
2. **Re-run after every merge**: the merged agents' test files, then the full `pnpm test`. After
   the last merge, run all four audits. A slice's own green run says nothing about the merged
   tree.
3. **An audit failure after a correct fix is usually the audit's text heuristic.**
   `scripts/lib/attack-behaviour.mjs` MECH regexes misread "take … and attach it to" (an
   in-play move) and "if X is on your Bench" (a condition). Narrow the regex with a comment
   naming the card; don't refresh a baseline to silence a real loss.
4. **Independent review is mandatory for engine diffs**: an agent that wrote none of the code
   runs `.agent/workflows/review.md`, once after tranche 1 and once over all merged groups.
   Brief it on cross-group interactions nobody tested. Reviews in 062 caught:
   - Super Potion healing 4 HP instead of 40 (pre-existing);
   - Max Revive played and wasted with no Energy in hand;
   - Energy Charge usable from the Bench;
   - WotC damage Powers applied twice on the Active;
   - Thought Wave Machine ignoring Brock's Protection;
   - Psychic Control playing Breeder through Prehistoric Power.
5. **Fix review findings with tests that fail first**, then re-run the suite and the audits.

## 5. Lessons (check these on the next era)

1. **Check the data path end to end before celebrating parser fixes.** TCGdex types old Powers
   `Pokemon Power` / `Poke-POWER` / `Poke-BODY`, and `tcgAbilityFromDetail` kept only `Ability`
   and `Ancient Trait`. Every Power fix passed its tests but would never have run in a live game.
   Write at least one test that goes TCGdex-shaped detail → enrichment → `cardStats` → reducer.
2. **Old text names the card instead of saying "this Pokémon".** Check every self-condition
   reader (`requiresActiveSpot`, damage reduction "to Kabuto") for name-based wording, not just
   the parser.
3. **A rewrite touches modern cards too.** Diff every corpus parse before and after (all
   `out/pkmn-*-cards.json`). Each modern change is either intended and listed under the design's
   Deviations (Red Card now shuffles), harmless and listed, or a bug.
4. **Costs need a play-time check as well as a step.** A cost step that can't be paid stops the
   effect but still uses up the card. Mirror each cost in `trainerPlayBlockReason`: hand count,
   Energy in hand, attached Energy.
5. **Amounts: "damage counters" × 10 = HP.** `healAmount` takes HP.
6. **Hidden information**: private looks go only into the chooser's choice options, events carry
   counts, and prompts never name hidden cards.
7. **Long audits share one machine.** `audit:oracle` takes ~10 min alone and longer while
   parallel agents run theirs. Give it a long timeout and don't count a killed run as a pass.

## 6. Record and close

- **Design doc:** Deviations section updated by you after each merge; status set when shipped.
- **ISSUES.md:**
  - close each fixed line, with the fix;
  - file what remains (one line each, with the exact reason it's undone);
  - file each pre-existing bug found along the way.
- **DECISIONS.md:** one line per lasting choice (e.g. D202: rewrite to modern wording, derive
  missing metadata where card data enters).
- **MAP.md** for new modules. Commit subjects follow `feature 062 slice X: <outcome>`. The
  harness files change in the commit that lands on `main`.

## 7. The 2026-10-01 WotC run in numbers

| Area | Before | After |
|---|---|---|
| Attacks with effect text (818) | 119 no effect, 39 partial | 64 no effect, 27 partial on the corpus audit; ~105 printings fixed |
| Trainers (125 unique) | 13 unrecognized, 21 passive-only, ~20 attachables discarded | all 13 work; 7 attach-Trainers + 8 Stadiums + 7 Tools stay in play; open: Lt. Surge's Secret Plan |
| Pokémon Powers (173 rows) | 10 dead, 25 partial, 90 unenforced | Rain Dance / Energy Trans family, Toxic Gas, Hay Fever, Prehistoric Power, Retreat Aid, Strikes Back, damage-modifier bodies; 73 still unconsumed |
| Rules | Baby Rule absent | Baby Rule + Baby → Basic evolution |
