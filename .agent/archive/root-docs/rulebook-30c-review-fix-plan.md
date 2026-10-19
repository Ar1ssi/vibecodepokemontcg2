# Rulebook 30c — Review Findings Fix Plan

Companion to `rulebook-30c-implementation-plan.md` (the shipped Phase 0–5 work) and
`rulebook-30c-vs-rules-engine-gaps.md` (the original gap analysis). This plan turns the
findings of the fresh-context review of the uncommitted `feature/rulebook-30c` working tree
into concrete, testable work items, ordered by severity.

Each item carries: the files to touch, the change, and an acceptance test that **fails
before** the change. Every phase lands green before the next, one commit per phase, same
branch (`feature/rulebook-30c`).

## Conventions (same as the implementation plan)

- **Two rule paths.** **Server:** `shared/engine/reduce.mjs` + `shared/engine/**` — live when
  `SERVER_AUTHORITATIVE=1`. **Legacy:** `shared/engine/rules/ko-flow.mjs` →
  `client/src/actions/chat-buttons/chat-buttons.js` and
  `client/src/setup/rules/rules-bridge.js`. `[server]` / `[legacy]` / `[both]` tags;
  `[deck]` = `client/src/setup/deck-builder/core/deck-validation.mjs`.
- **Tests** are `node --test` on `.mjs` modules.
- **Verification.** Note: `pnpm test` cannot launch on this Windows checkout — the
  script's explicit file list exceeds the OS command-line limit ("The command line is too
  long"). Run the registered suite with the equivalent direct invocation:

  ```powershell
  $spec = Get-Content -Raw package.json | ConvertFrom-Json
  $files = $spec.scripts.test -replace '^node --test ' -split ' '
  node --test $files
  ```

  (baseline for this plan: **2068/2068, 0 fail**), or `node --test "shared/**/*.test.mjs"
  "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"` (wider, 2121 tests).
  Lint bar is the targeted
  `npx eslint --rule "linebreak-style: off" --rule "prettier/prettier: off" <changed files>`
  — `pnpm lint` repo-wide is pre-existing CRLF noise (~85k errors) and not a gate.
  Consider as a follow-up: switch the `test` script to directory/glob form so `pnpm test`
  works everywhere.

---

## Phase 1 — [blocker] Simultaneous-win semantics (30c 1.3a) — `[server]`

> ✅ SHIPPED 2026-09-20 (S200, uncommitted). 1.1 `handleKnockout` counts win ways per player;
> last-Prize + empty-board is a two-way attacker win with prizes collected. 1.2 `pass`/`takeTurn`
> hand over during `tiebreak` (entry-phase snapshot so a Checkup that *creates* the tie in the
> same command does not advance), board actions refused with `tiebreak_pending`, new
> `isGameFrozen` (ended-only) for the "Game is over." gate. 1.3 tests repaired. Deviations:
> (a) `setGameEnded`'s simultaneous branch now also sets `firstPrizeWins`, so the interim
> "first Prize wins" survives the hand-over (D62/D71); (b) the genuine-tie test constructs the
> both-empty case via a shared Checkup (both Actives Poisoned to 0 HP) rather than a self-KO,
> as that is the reachable path. Suite 2069/2069, 0 fail; lint clean on touched files.

### The defect

`reduce.mjs` `handleKnockout` (reduce.mjs:620-649) treats "attacker takes their last Prize
AND the victim's board empties on the same Knockout" as a simultaneous win and enters the
`tiebreak` phase with no winner. Per rulebook p.21 ("What happens when both players win at
the same time?" — *"if you win in both ways and your opponent wins in only one way, you
win"*), this scenario is the **attacker winning two ways** (all Prizes + opponent has no
Pokémon) while the victim wins **zero** ways — an outright attacker victory. The code's
`tiebreak.ways.victim: ['no Pokémon in play']` credits the victim with a win way that
actually belongs to the attacker.

Consequences today:

- A clean two-way attacker win drags through a bogus `tiebreak` phase; the prize
  entitlement is voided (`settlePrizeEntitlements` skips tiebreak, reduce.mjs:812) instead
  of collected.
- The turn can never advance in `tiebreak` — every `advanceTurn` call site is gated by
  `isGameConcluded` (incl. `pass`/`takeTurn`, reduce.mjs:3211) — so the game **wedges** if
  the turn player never sends `takePrizes`; the defender has no legal way to act or win.
- Cross-path divergence: the legacy path ends the same KO as an immediate attacker win
  (`ko-flow.mjs` `handleKO` → `awardPrizes` `won: total >= 6`) — and legacy matches the
  rulebook. The `[both]` item 1.3 is currently split-brained.

### 1.1 Count win ways per player, decide from the counts — `[server]`

In `handleKnockout` (reduce.mjs:620-649), replace the three-branch decision with the p.21
"ways" model:

- Compute, before deciding anything:
  - `attackerWinByPrizes` — the existing `attackerPrizes.length <= prizesOwed` check.
  - `victimWiped` — the existing post-discard victim active+bench check. This is a win
    way **for the attacker**.
  - `attackerWiped` — the same check applied to the attacker's own active+bench
    (needed for the two-ways-vs-one-way case when a self-KO emptied the attacker's board
    in the same resolution). This is a win way **for the victim**.
- Then:
  - `attackerWays = (attackerWinByPrizes ? 1 : 0) + (victimWiped ? 1 : 0)`
  - `victimWays = (attackerWiped ? 1 : 0)`
  - `attackerWays > victimWays` → `setGameEnded({ winner: attackerPlayerId, reason })`;
    reason `'all prize cards taken'` when `attackerWinByPrizes`, else
    `'no Pokémon in play'`.
  - `attackerWays === victimWays && attackerWays > 0` → `setGameEnded({ simultaneous: … })`
    (the genuine tie: both boards empty, no Prize way — the only reachable tie under this
    model).
  - `attackerWays < victimWays` → `setGameEnded({ winner: victimPlayerId, reason: 'no
    Pokémon in play' })` (attacker self-wiped without a prize win).

`setGameEnded`'s `simultaneous` shape (reduce.mjs:1062-1076), the `tiebreak` phase,
`draft.tiebreak.ways`, and the `tiebreakStarted` event all stay — they are now reachable
only from a genuine tie.

### 1.2 Fix the tiebreak phase wedge — `[server]`

Even after 1.1, a genuine tie (both boards empty) still enters `tiebreak`, where the turn
player wins with one `takePrizes` and the opponent can never act (turn gate at
reduce.mjs:1419-1453 + no turn advance). Minimal hardening, still inside D62's
"no fresh mat" scope:

- Let turns hand over during `tiebreak`: `isGameConcluded` is used for two different jobs —
  "stop start/end-of-turn hooks" and "block turn advance". Keep the former, allow the
  latter. Concretely: in the `pass`/`takeTurn` case (reduce.mjs:3201-3214) allow
  `advanceTurn` when `phase === 'tiebreak'` (a new `isGameFrozen(draft)` that returns true
  only for `'ended'`), and drop `tiebreak` from the post-attack/post-checkup advance gates
  only where a hand-over is the intended behavior (attack should not be possible in a
  tiebreak — see below).
- Gate normal play in `tiebreak`: extend the `validateLegality` phase gate
  (reduce.mjs:1455-1475) so `attack`/`moveCard`/`attachCard`/`playTrainer`/`useAbility`
  are rejected during `phase === 'tiebreak'` (reason: 'tiebreak_pending'). The phase is a
  resolution prompt, not a game continuation.
- Keep the resolution rule (`takePrizes` ends it, reduce.mjs:3234-3239) but document in
  `docs/card-types-taxonomy.md` + D62 that the interim resolution is
  "first player to take a Prize wins" from the tied position, with the fresh
  six-prize sudden-death mat as the tracked follow-up (ISSUES line, Phase 5).

### 1.3 Repair the tests that encoded the misreading

- `shared/engine/__tests__/reduce.test.mjs` — the three "simultaneous win" tests
  (reduce.test.mjs:995-1041) become:
  - "last prize + empty board on one KO is an outright attacker win (two ways)":
    `phase === 'ended'`, `winner === 'p1'`, `winReason === 'all prize cards taken'`,
    prizes actually collected (`prizes.length === 0` after settlement, no lingering
    `prizesOwed`).
  - keep one genuine-tie test (both boards emptied, e.g. via a checkup KO that also
    empties the attacker — construct directly) asserting `phase === 'tiebreak'`, no
    winner, and that `pass` hands the turn over (1.2).
- `shared/engine/__tests__/server-authoritative-parsers.test.mjs:1104-1128` — restore the
  `prizesTaken`/win assertions that were replaced with the tiebreak expectations.

**Acceptance tests (fail before):**
- attacker, 1 prize left, attacks defender's only Pokémon → after the fix:
  `winner === attacker`, `phase === 'ended'`, `winReason === 'all prize cards taken'`,
  `flags.prizesOwed === 0` after settlement. (Today: `phase === 'tiebreak'`,
  `winner === null` — fails.)
- genuine tie → `pass` from the tiebreak phase changes `turn.player`. (Today: no advance.)

**Cross-path check (1.3 is `[both]`):** after the fix, server and legacy agree on the
prize+board-empty KO (both: immediate attacker win). The legacy both-empty simultaneous
branch (`ko-flow.mjs:60-66`) is already rulebook-correct and stays.

---

## Phase 2 — [should] Prism Star → Lost Zone at the remaining server discard sites — `[server]`

> ✅ SHIPPED 2026-09-20 (S201, uncommitted). Every discard push in `effects/trainer.mjs` (4) and
> `effects/trainer-steps.mjs` (6) now routes through `discardCardToPlayerZone`; the stadium-
> overwrite `cardMoved` event's `to` is the returned zone (`lostZone` for a Prism Star Stadium).
> Deviation: the plan's `:271`/`:335`/`:1018` spreads and the `discardCard` helper were converted
> per-card, and an unlisted site — `returnPokemonToHand`'s discard branch (attached cards) — was
> included, as a Prism Star Energy attached to a Turo'd Pokémon would otherwise hit the discard
> pile. Tests: 2 new in `__tests__/trainer-steps.test.mjs` (mill + Stadium overwrite + attached
> Energy; swapWithDiscard outgoing). Suite 2071/2071, 0 fail; lint clean on touched files.

Gap #11's rule is "if a Prism Star card **would go to the discard pile**, put it in the Lost
Zone instead" — every route. The shipped work routed `reduce.mjs` + `effects/executor.mjs`,
but missed the trainer-effect engine:

- `shared/engine/effects/trainer.mjs:62` (stadium overwrite discards the old Stadium),
  `:159` (board-card discard), `:257`, `:283` (board sweeps).
- `shared/engine/effects/trainer-steps.mjs:105` (owner discard), `:271` (deck mill →
  discard), `:335` (chosen discards), `:834` (devolve/`outgoing`), `:1018` (target
  discards).

### Change

Route every push through `discardCardToPlayerZone(player, card)`
(`shared/engine/state.mjs:49`), which already returns the destination zone key and
preserves `lostZone` as a real zone. These sites don't emit per-card events, so no event
shape changes; audit any nearby code that counts `zones.discard.length` afterward (e.g.
deck-out checks read `deck`, not `discard` — safe; but a "discard N" effect that later says
"put a card from your discard into your hand" must not find the Prism Star — that is the
point of the rule).

**Acceptance tests (fail before), in `shared/engine/__tests__/trainer-steps.test.mjs`:**
- mill a `◇ Victini` from the top of the deck via a "discard 3 from your deck" step →
  it lands in `lostZone`, not `discard` (today: discard — fails).
- devolve/stadium-overwrite a Prism Star → `lostZone`.

---

## Phase 3 — [should] Ancient-Trait tagging: marker, not wording — `[both]`

> ✅ SHIPPED 2026-09-20 (S202, uncommitted). Data probe: TCGdex carries the α/Ω marker in
> `ability.name` for real Ancient Trait cards (xy5-9 Sceptile `type:"Ancient Trait"`,
> name `"Ω Barrier"`), BUT `tcgAbilityFromDetail` maps only `type === 'Ability'`, so those
> entries never become `card.ability` — i.e. the marker is present in the source data but is
> not what `parseAbility` sees. Decision: still drop both wording fallbacks (`const trait =
> ancientTraitIn(lower);`), because Ancient Traits are not Abilities and the over-tagging of
> real Abilities is the live defect; the mapper's drop is correct and `stadiumAbilityBlocked`
> has no production caller yet, so nothing depends on the trait path for real cards. **Deviation
> found while testing:** `ancientTraitIn` lowercased before checking the uppercase Ω (U+03A9), so
> the Ω marker could never match on its own — fixed to match the lowercase ω (U+03C9) as well.
> Tests: rewrote the two wording tests to assert no trait without a marker + the marker tags it;
> extended the App. 23 test with marker-less Ω/α-worded Abilities now suppressed. Suite 2071/2071,
> 0 fail; lint clean on touched files (pre-existing unused imports in the test file only).

### The defect

`shared/engine/rules/abilities.mjs:381` and `:824` tag ability steps as traits via wording
fallbacks:

- `ancientTraitIn(lower) || (triggeredByAttach ? 'alpha' : null)` — ANY "when(ever) you
  attach an Energy…" ability becomes `trait: 'alpha'`.
- `ancientTraitIn(lower) || (trainerTriggered ? 'omega' : null)` — ANY
  "opponent plays a Trainer card…" ability becomes `trait: 'omega'`.

Via `stadiumAbilityBlocked` (`stadium-effects.mjs:859-862` → `isAncientTraitAbility`),
those real Abilities become **immune to "have no Abilities" effects** — the inverse of
App. 23's intent. Only the printed α/Ω marker (or the words "Ancient Trait") identifies a
trait.

### Change

1. **Probe the data first.** Confirm TCGdex carries the α/Ω marker in the ability
   name/text for real Ancient Trait cards (e.g. *Venusaur* "α Growth" from Primal Clash,
   *Aegislash* "Ω Barrier"). If the marker is present (as the current test fixtures
   assume), drop both wording fallbacks:
   `const trait = ancientTraitIn(lower);`
   If the marker is absent in real data, keep a *narrower* fallback keyed on the two
   canonical trait texts verbatim (not the generic wording regexes), and document why.
2. Keep `ancientTraitIn`, `isAncientTraitStep`, `isAncientTraitAbility` and the
   `stadiumAbilityBlocked` skip — only the tagging inputs change.

**Acceptance tests (fail before), in `rules/__tests__/rules-extended.test.mjs`:**
- A marker-less Ability worded like Ω Barrier
  ("Prevent all effects of your opponent's Trainer cards done to this Pokémon.") is
  **suppressed** by a "have no Abilities" Stadium (today: `stadiumAbilityBlocked` returns
  false — fails).
- Same for an attach-triggered energy-acceleration Ability.
- The existing α/Ω-marker cases still pass untouched (trait survives suppression).

---

## Phase 4 — [should] `isExCard` name fallback matches plain "…ex" names — `[both]`

> ✅ SHIPPED 2026-09-20 (S203, uncommitted). `isExCard`/`isGxCard` now require a separator
> before the suffix: `/(?:^|[\s-])ex$/i` and `/(?:^|[\s-])gx$/i`. Audit: grepped all `.mjs`
> for `endsWith('ex')`-shaped expectations and for `name:` fixtures ending in "ex"/"gx"
> without a separator — none exist (only the plan's own Toxapex examples); every real fixture
> (`Cetitan ex`, `M Venusaur-EX`, `Ninetales GX`, `Mewtwo-EX`, `Groudon EX`, `Primal Kyogre EX`)
> has a space or hyphen and is unchanged. Tests: +2 (`card-classify.test.mjs` separator test +
> Toxapex 1-prize/not-Rule-Box test; `search-match.test.mjs` "without a Rule Box" includes
> Toxapex). Suite 2073/2073, 0 fail; lint clean on all three touched files.

`shared/engine/rules/card-classify.mjs:40-43` falls back to `name.endsWith('ex')`, so a
plain Pokémon whose name ends in the letters "ex" — **Toxapex** is the canonical example —
classifies as a Rule Box ex card: `prizesForKO = 2` (wrong prize count, silently changes
who wins), excluded from "without a Rule Box" searches, rule-box-gated accelerators skip
it. Inherited verbatim from the old `ko-flow.mjs` heuristic, but Phase 0's charter was to
make classification *correct*, so fix it in the canonical module.

### Change

Require a separator before the suffix:

```js
return /(?:^|[\s\-])ex$/i.test(nameOf(card));
```

`"Cetitan ex"` (space) and `"M Venusaur-EX"` / `"Mewtwo-EX"` (hyphen) still match;
`"Toxapex"` no longer does. Apply the same separator rule to `isGxCard` (line 47) for
symmetry — no known false positive exists there today, but the same shape protects future
names. Check the V-UNION/VMAX/VSTAR name regexes already require this
(`isVmaxCard`/`isVstarCard` use `(?:^|\s)` — fine).

**Acceptance tests (fail before), in `rules/__tests__/card-classify.test.mjs`:**
- `isExCard({ name: 'Toxapex' }) === false` and `prizesForKO({ name: 'Toxapex' }) === 1`
  (today: true / 2 — fails).
- `isRuleBoxPokemon({ name: 'Toxapex' }) === false`; a "without a Rule Box" search
  includes Toxapex.
- Regression trio unchanged: `'Cetitan ex'`, `'M Venusaur-EX'`, `'Pikachu ex'` still ex.

Audit before landing: grep tests for `endsWith('ex')`-shaped expectations and any fixture
names ending in "ex" without separator.

---

## Phase 5 — Tracking, bookkeeping, and the deferred backlog — `[harness]`

> ✅ SHIPPED 2026-09-20 (S204, uncommitted). (1) I22 moved from Open to Closed in `.agent/ISSUES.md`
> with the fix note: the translator (`dual-run-bridge.js:817-829`) carries `payload.kind`
> ('gx'|'vstar') and `reduce.mjs`'s `effectiveOncePerGameKind`/apply case spend only the matching
> allowance — the plan's line refs (`:820-828`) were approximate. (2) Added I61 (tiebreak
> six-prize mat), I62 (LEGEND two-cards), I63 (V-UNION full rules) as P3 Open lines. (3) Reworded
> both legacy simultaneous announcements to "Simultaneous knockout — the game is a draw
> (tiebreaker not supported in this mode)." in `chat-buttons.js` and `rules-bridge.js`; no test
> asserts the string. Suite 2073/2073, 0 fail; lint shows only the pre-existing `no-empty`
> catches/unused imports in those two files.

1. **Close I22** (`.agent/ISSUES.md:53` — "VSTARGXFunction translator reads `[instanceId]`,
   GX/VSTAR distinction lost"): fixed by `dual-run-bridge.js:820-828` (`kind` carried).
   Append the closure note.
2. **Add the plan's deliberately deferred follow-ups as Open lines** (the harness rule:
   untracked = forgotten; the "capture as a tracked TODO in the PR body" has no PR —
   this work is uncommitted):
   - V-UNION full play rules (4 pieces, set from discard, once per game per name) —
     plan 2.4 follow-on.
   - Pokémon LEGEND two-cards-played-together representation — plan 5.4 follow-on.
   - Tiebreak fresh six-prize mat (deck reconstruction + client UX) — D62 follow-on
     (Phase 1.2 above only hardens the interim resolution).
3. **Reword the legacy simultaneous announcement** —
   `chat-buttons.js:418-425` and `rules-bridge.js:345-350` announce "sudden-death
   tiebreaker" while ending the game as a draw with no tiebreaker to follow. Say what
   happens: e.g. "Simultaneous result — the game is a draw (tiebreaker not supported in
   this mode)." `[legacy]`, one-line change + no test needed (message-only).

---

## Phase 6 — Decision items (ask before coding)

> ✅ DECIDED + DONE 2026-09-20 (S205, uncommitted). Asked the user; all three chose the
> recommended path. **6.1** — keep `isExCard` unified; documented the App. 24 convention in a
> comment at `isTeamFlareHyperGearCard` (D74). **6.2** — keep Phase 1's click-resolution as the
> shipped tiebreak behavior; real six-prize mat stays deferred to I61 (D74). **6.3** — switched
> `package.json`'s `test` script to `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs"
> "server/**/*.test.mjs" "bot/**/*.test.mjs"` (D75); `pnpm test` now runs on Windows — 2126/2126
> green (the globs additionally pick up `evolution.test.mjs`, omitted by the old explicit list).
> Lint clean on the touched `card-classify.mjs`.

1. **Team Flare Hyper Gear vs modern "ex"** — `validateReferences`/`validateLegality`
   accept a modern *Pokémon ex* as an App. 24 "Pokémon-EX" target because `isExCard`
   deliberately unifies ex/EX engine-wide. In Unlimited both card families coexist, so
   the letter of App. 24 is violated. Options: (a) keep the unification and document it
   as an accepted convention (recommended — it is load-bearing in prize counts and
   Briar-style effects too), or (b) tighten to `-EX`-suffix/subtype-only for the TFHG
   gate specifically. Default: (a) + a comment in `card-classify.mjs`.
2. **Tiebreak scope (reopens part of D62)** — Phase 1 keeps the click-resolution for
   genuine ties. If a real sudden-death mat is wanted instead, promote the D62 follow-up
   into a design (`.agent/designs/`) and cut Phase 1.2's documentation accordingly.
3. **`pnpm test` portability** — the Windows command-line failure is pre-existing but
   this review could not use `pnpm test` at all. Consider switching the script to
   `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" …` (Node ≥ 22 glob support)
   as a separate maintenance commit.

---

## Suggested execution order (one green commit each)

1. Phase 1.1 + 1.3 (blocker: correct winner; tests repaired) — highest value.
2. Phase 1.2 (tiebreak hardening) — small, same file neighborhood.
3. Phase 2 (Prism Star routing completeness).
4. Phase 3 (trait tagging) — after the data probe.
5. Phase 4 (`isExCard` separator).
6. Phase 5 (ISSUES.md + message reword).
7. Phase 6 items as decided.

Run the registered suite (command above) after each phase; the plan is done when it is
**2068+green, 0 fail** with the new tests included, and the targeted lint bar is clean on
every touched file.
