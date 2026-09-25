# S302 handoff — design 039 / I168 copy-attack residuals (`feature/i168-copy-attacks`)

**Landed (S303, 2026-09-25):** fast-forwarded into `main` as `8f387bdf` (2 commits, no conflicts).
The branch record below is kept for detail — treat "not pushed" and next-item 1 as historical.
Verified on the tip before landing: suite 4178/4179 (known inspector fail), all four gates PASSED.

Branch is main (`1d2fb8ae`) + 1 commit `6076be12`, **not pushed and not merged** (user chose one
commit at the end; no push requested). Revert = drop the branch / revert `6076be12`.

Suite 4179: 4178 pass, only the known `card-inspector-model` "retreat greys…" failure (I179).
Lint clean on touched files. `audit:attacks` (baseline unmoved), `audit:oracle`,
`audit:abilities`, `audit:trainers` all PASSED.

## Shipped this session

| Commit | What landed |
|---|---|
| 6076be12 | Design 039: 17 residual copy-attack wordings + `player.lastAttack`; I168 closed, I181 filed |

- New: `shared/engine/__tests__/attack-copy-residuals.test.mjs` (16 execution tests);
  `.agent/designs/archive/039-copy-attack-residuals.md` (shipped design).
- `shared/engine/rules/attack-copy.mjs`: prefix peel (single coin / inline `If …` / `You can use
  this attack only if …`), 9 new templates, apostrophe + space-before-punctuation normalization.
- `shared/engine/reduce.mjs`: `copySourceCards` adds `ownInPlay`, `ownEvolutionStack`
  (`priorEvolutionCards`), `ownDeckTop`, `oppDiscard`; `copyAttackCandidates` filters
  `tera`/`darkName`/`excludeSelf`/`noRuleBox`; `lastTurnAttackCandidates`; `offerCopiedAttack`
  condition gate, Slowking discard (via `discardCardToPlayerZone`), `auto` single-candidate;
  `flipAndResolveAttack` records `player.lastAttack`.
- `shared/engine/rules/attack-conditions.mjs`: `you have no cards in your hand` (eq 0) and
  `your opponent has exactly N prize cards remaining` clauses.

Fixed wordings: Clefable/Clefairy/Clefable ex old "copies that attack" prints, Mew Star Mimicry,
Togetic Super Metronome, Mew Re-creation, Smeargle Trace, Dark Hypno Dark Link, Team Rocket's
Mimikyu (Tera-only), Thievul Skill Thief, Nihilego Nightcap, Incineroar Secret Attack, Charizard
Recall, Slowking Seek Inspiration, Mimikyu Copycat, Sudowoodo Watch and Learn.

## Decisions made

- **D150** copy spec extension (sources/filters/condition/auto, fail closed); **D151**
  `player.lastAttack` scoped to `turnNumber === currentTurn - 1`.
- **Misty's Psyduck ESP deferred** to I181: it already executes its 1-head draw / 2-head damage
  (`audit:attacks` ok), so the parser fails closed on multi-coin gates instead of hijacking it.
- **`auto: true`** for Mimikyu/Sudowoodo (no printed "choose"): one candidate resolves without a
  one-option prompt.
- **Hostile review** (7 findings): 1 real bug fixed (Slowking's discard now routes Prism Star →
  Lost Zone), dead duplicate template + unused `defenderView` removed, 3 missing tests added
  (empty deck, copy-wording last attack, view leak).

## Next sessions (priority order)

1. **Land the branch**: push + merge `feature/i168-copy-attacks` to main (1 commit, clean
   fast-forward), then sync the primary folder.
2. **Maintenance due (S300 cadence)**: `DECISIONS.md` 152 lines / ~32 KB vs 90-line / 20 KB cap;
   `designs/` root holds ~50 shipped docs; triage I180 (legacy-overlay zones); MAP spot-checks,
   flags, scratch/worktrees, metrics.
3. **I181 copy deferrals** — Misty's Psyduck (multi-branch coin model), Shiftry ex (opponent-hand
   pick), Alakazam Star (discard-from-hand then copy), Togetic δ (no marker in card data),
   Smeargle Sketch (per-turn in-play history).
4. **I167** attack markers, **I166** attack effects, **I162** ability backlog
   (`pnpm audit:abilities --rows`).
5. **I153** per-viewer event filtering (needs a contract first), then I137, I121, I126 (partial),
   I127, I44, I60.
6. **User actions**: visual check of typed Tera entry/skin + Mega vortex; approve designs 028
   (I85) / 029 (I86); I87 needs the repro description.

## Verification / landmines

- `node --test shared/engine/__tests__/attack-copy*.test.mjs shared/engine/rules/__tests__/attack-conditions.test.mjs`
  · `pnpm test` (~55 s) · lint touched files `npx eslint --quiet <files>` · four gates ~2 min each.
- Copy parser fails closed: an unknown prefix/condition returns null, so the attack keeps its own
  steps. `copyAttackCandidates` also uses `parseCopyAttack` to skip copy-of-copy; adding a template
  can silently remove a candidate elsewhere — re-scan the corpus after parser changes.
- `lastAttack` is invisible to `viewFor`/`hashState` (zones/flags only); it is written once per
  attack in `flipAndResolveAttack` (a Glimwood re-flip resumes in the effect phase, not there).
- `applyCommand` clones state — read results via the returned `state`; attacking ends the turn.
- Bash heredoc eats `\` and mangles é → use Edit/Write. Primary working copy is CRLF.
