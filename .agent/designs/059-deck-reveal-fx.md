# 059: Deck reveals play the Trainer reveal
Status: approved (self — one-shot)
Date: 2026-09-29 · Session: S-keen-wright (one-shot, branch claude/keen-wright-7i2dps)

## Problem
Brief, verbatim:

> The current reveal animation that plays when a card is played for trainers/supporters/stadiums,
> wire the reveal animation to occur when they reveal cards from their deck through
> trainers/stadiums/abilities/attacks, having the card fly out from the deck and into the reveal
> spot, then into the users hand. One shot this feature.

Today a card searched or looked at from the deck and revealed into the hand plays nothing under
server authority: the advisory planner maps `cardsRevealed` and `cardMoved deck→hand` to no plan,
so the card just appears in the hand.

## Acceptance
| # | Criterion (the brief's words) | Evidence |
|---|---|---|
| 1 | "the reveal animation … occur[s] when they reveal cards from their deck through trainers" | engine: Ultra Ball (30th Celebration 128) + Great Ball (Paldea Evolved 183) emit the art-stamped reveal; planner: `reveal` plan for both seats; video |
| 2 | "… through stadiums" | engine: Town Store (Obsidian Flames 196) |
| 3 | "… through abilities" | engine: Aromatisse Scent Collection (Perfect Order 036) |
| 4 | "… through attacks" | engine: Jirachi Charge Energy (Paradox Rift 126) |
| 5 | "having the card fly out from the deck" | pose: starts on the deck cover at the deck's turn, sleeve up; video frame |
| 6 | "and into the reveal spot" | pose: holds face up, upright, on the Trainer preview's rect (mat centre); video frame |
| 7 | "then into the user's hand" | pose: ends on the revealer's hand card (face down for the opponent's hand); video frame |

## Assumptions
- (assumed) "The reveal animation" is design 043's Trainer preview (`opp-play.mjs`): drop and flip,
  grow to the preview in the middle of the mat, hold, shrink into a destination. It is the Trainer
  presentation that already travels start → reveal spot → destination; your own Trainer's
  `presentCard` fades out in place and has no destination phase.
- (assumed) Hold at the reveal spot: 1200 ms for the opponent's reveals (043's preview hold, the
  user's "twice as long") and 600 ms for your own (044's single-draw preview hold): you picked
  the card yourself.
- (assumed) A reveal is printed text: "reveal" or older "show … to your opponent". Searches without
  it (Pidgeot ex Quick Search, Computer Search, Cassiopeia, Explorer's Guidance) stay hidden: no
  scene, and the engine stops naming those hand picks in `cardsRevealed` (design 038's rule
  "emit at the source what is public"; today the log leaks them and the scene would display them).
- (assumed) Only revealed cards that end in the revealer's hand fly. Bench picks keep `enter`;
  revealed cards shuffled back (Random Receiver's misses) or discarded are not flown.
- (assumed) Several cards one player reveals in one server update play as one spread (044's layout:
  up to 4 a row, 10 slots; cards past 10 are shown in the hand without a flight).
- (assumed) Server-authoritative path only (production, D17). The Trainer reveal itself exists only
  there; the legacy relay mode keeps its 044 draw scene for deck → hand moves.
- (assumed) Effects off or reduced motion: no scene (like the Trainer preview), the cards show at
  once; the reveal's sound follows the dispatcher's rule (off with effects off, on under reduced motion).
- (assumed) A reveal whose move into the hand lands in a later update (Riley, Rival: the opponent
  picks among the revealed cards) plays no scene; the picker shows those cards.
- (assumed) Work lands on the session's designated branch `claude/keen-wright-7i2dps` in the
  primary checkout (it replaces `feature/<slug>` + worktree); `Land:` not given → branch.

## Constraints
- D103[mat-fx]: WAAPI keyframes sampled from pure pose functions; pose math DOM-free and unit-tested.
- Cosmetic only on the client: the view is applied before plans run; overlays remove themselves
  (backstops); hidden hand cards are always shown again (landing, then a backstop timer).
- Hidden info never reaches the opponent (I141/I153, design 038): events go unfiltered to both
  sockets, so a card's name or art may ride an event only when the rules make it public.
- Both seats animate from the same server event (design 009); `'self'`/`'opp'` never cross the wire.
- The opponent's board iframe is turned 180° (`frameTurnOf`); previews are upright.
- FX queue budget 2500 ms; an effect returns its own hold. Memory: no whiteouts or sunburst rays.
- Engine changes ship with tests that fail without them; `pnpm audit:*` gates after effect changes.

## Current state
- Engine reveal sites (deck → hand): executor `searchDeck/searchAbility/search` (emits `cardMoved`
  per pick, then `cardsRevealed` for every pick: `step.reveal || pickedCards.length > 0`);
  trainer-steps `lookAtDeckEnd` (per taken card `cardMoved` + `cardsRevealed`, unconditional),
  `searchDeckSequence`, `searchOrRecover`, `revealUntilCard`, `revealTopEnergy`,
  `opponentChoosesFromTop`; attack search (`finishAttackTail` → `buildAttackSearchChoice` →
  `resolveChoice` `effectType:'attack'`) emits `cardMoved deck→hand` and no reveal at all.
- Parser flags: `searchAbility` carries `reveal: lower.includes('reveal')`; trainer `searchDeck`
  carries `reveal: true` in some `parseSearchDeckParams` branches only (corpus scan: 51 revealing
  trainers — Arven, Crispin, Lady — parse without it); stadium steps carry none.
- `cardsRevealed` entries are `{instanceId, name}`; the opponent's hand is redacted to
  `{instanceId}` (view.mjs), so the opponent's client has no art for a revealed card.
- Client: `advisory-animations.mjs` has no plan for `cardsRevealed`; `advisory-animations.js`
  queues plans (fx-queue.mjs), hides drawn cards at queue time (`holdDrawnCards`) and plays them.
- `opp-play.mjs oppPlayTrack` + `opp-play.js playOppTrainer` = the Trainer reveal (fixed 1200 ms
  hold, lands face up). `draw-scene.mjs drawSpreadRects` lays out 1..10 preview slots (1 card =
  the same rect as `oppPreviewRect`); `draw-scene.js` has the hand-slot lookup.

## Options
1. Who decides "revealed". A: the client infers it from `cardsRevealed`. B: the engine emits
   `cardsRevealed` for a hand pick only when the effect's printed text reveals it. **Pick B**: A
   would put every Quick Search card on the opponent's screen; design 038 already chose to emit
   what is public at the source.
2. Where the engine reads the printed text. A: stamp a `reveal` flag on every deck-take step at parse
   time (parsers, nested coin branches, stadium options). B: at emission, the parser's boolean when it
   set one, else the effect's text (`effectTextFor`: Trainer/Stadium text; the ability's own text
   threaded through the executor `context`). **Pick B**: one rule at the few emission sites, nested
   and resumed steps inherit it through `effectType`/`context`; A touches every parser branch.
3. The opponent's card art. A: mark revealed hand cards `revealed` so the view shows them. B: stamp
   `src` onto public `cardsRevealed` entries at the command tail. **Pick B**: A keeps the card face up
   in their hand after the reveal (wrong by the rules); B is one pure pass, no view change.
4. Which cards fly. A: every public `cardsRevealed` card. B: cards the same batch both moves
   `deck → hand` (`cardMoved`) and reveals, grouped per player. **Pick B**: the brief's path is deck →
   spot → hand; hand reveals (Lavender Town) and prizes are not deck reveals.
5. The motion. A: the 044 draw track with a longer hold. B: 043's `oppPlayTrack`, generalised with
   `holdMs` and `toFaceDown`, one per spread slot. **Pick B**: the brief asks for the Trainer reveal
   itself; 043's track already takes a start, a preview and a destination.

## Design
Engine — new pure `shared/engine/rules/reveal-picks.mjs`:
- `textRevealsPicks(text) → boolean`: `/\breveal/i` or `/\bshow\b[^.]*?\bto (?:your|their|his or
  her) opponent\b/i`.
- `effectTextFor({effectType, sourceCard, context}) → string`: `context.effectText` when a string;
  `effectType === 'ability'` → the source card's ability texts joined (+ `abilityText`); otherwise
  `sourceCard.text || sourceCard.effect || sourceCard.cardText || ''`.
- `stepRevealsPicks(step, effectText) → boolean`: `step.reveal` when boolean, else `textRevealsPicks`.
- `stampRevealedArt(events, srcOf) → void`: each `cardsRevealed` without `peek` and without
  `revealedTo` gets `src: srcOf(instanceId)` on entries that lack one and resolve to a truthy src.
Emission gates (a hand pick is named only when `revealsPicks`; bench picks stay public):
executor `searchDeck` resume; handler ctx gains `revealsPicks`; `lookAtDeckEnd` (oneEach, takeUpTo,
single), `searchDeckSequence`, `searchOrRecover` (deck mode). `ability.mjs` threads
`effectText: text` into the executor context; `abilities.mjs` search `reveal` uses
`textRevealsPicks`. Attack search: `buildAttackSearchChoice(…, reveal)` stores `reveal` on the token
(`finishAttackTail` passes `textRevealsPicks(attack text)`; the next stage passes `token.reveal`);
`resolveChoice` pushes `cardsRevealed` for the hand picks when `token.reveal`. `applyCommand` tail:
`stampRevealedArt(events, (id) => findCard(draft, id)?.card?.src)`.

Client planner — `advisory-animations.mjs`:
- `deckRevealRuns(events) → Map<event, {instanceId, src?, name?}[]>`: per player, the instance ids
  of `cardMoved {from:'deck', to:'hand'}` in the batch; each public `cardsRevealed` (no `peek`,
  `revealedTo`, `hand`) contributes its entries that player moved deck → hand. The player's first
  contributing event maps to the whole group (deduped, event order); the others map to `[]`.
- `advisoryAnimationPlan(event, selfPlayerId, coinRun, {dealShuffle, revealRun})`: a
  `cardsRevealed` with a non-empty `revealRun` → `{kind:'reveal', user, cards: revealRun}`.
- `advisory-animations.js`: `handleBeforeApply` computes the runs; the queued plan hides its cards in
  the hand (`holdRevealedCards`, 9 s backstop) when effects are on and motion is not reduced;
  `runPlan` → `playRevealPlan`: sound `deck-reveal`, then `playDeckReveal`, whose return is the hold.

Client scene:
- `opp-play.mjs`: `previewPlayMs(holdMs)`, `PREVIEW_GROW_MS` 520, `PREVIEW_PLACE_MS` 300;
  `oppPlayTrack({…, holdMs = OPP_PLAY_HOLD_MS, toFaceDown = false})` — `toFaceDown` turns the card
  back to the sleeve (flip 0 → 180) while it is placed. Defaults leave 043 unchanged.
- New pure `mat-fx/deck-reveal.mjs`: `SELF_REVEAL_HOLD_MS` 600, `REVEAL_IN_STAGGER_MS` 85,
  `REVEAL_OUT_STAGGER_MS` 110, `revealHoldFor(user)`, `deckRevealTimes(count, holdMs) → {start(i),
  holdOf(i), total}` (cards arrive staggered, hold together, drop staggered), `deckRevealHold(count,
  holdMs)` = total − PREVIEW_PLACE_MS, `revealShineFrames(durationMs)`.
- New DOM `mat-fx/deck-reveal.js`: `playDeckReveal(user, cards, show) → hold ms`: slots
  `drawSpreadRects(n ≤ 10)` on the mat centre; per card `oppPlayTrack` from the deck cover
  (`pileOf(user,'deck')`) via its slot to its hand card (`handSpotOf`), `toFaceDown` for a redacted
  hand card, delayed `start(i)`; flip card built by `opp-play.js spawnFlipCard` (043's DOM and CSS);
  the real card shows when its overlay lands.
- `fx-audio.mjs`: `deck-reveal` voice (a swoosh off the deck, a chime as the card reaches the spot).

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | `cardsRevealed` with no deck → hand move in the batch (hand reveal, prizes, bench search) | no plan | [ ] |
| 2 | malformed entries (no instanceId, bare ids, non-array `cards`) | bare ids read as ids; the rest ignored | [ ] |
| 3 | 1 card / 7 cards / 12 cards | big preview / 4+3 spread / first 10 fly, 2 shown in hand at once | [ ] |
| 4 | one card per event (lookAtDeckEnd, Drayton) | one scene with every card, no duplicates | [ ] |
| 5 | no deck cover rect / no hand card rect / opponent card without `src` | starts above the spot face down / fades at the spot / shown without a flight | [ ] |
| 6 | overlay aborted, hand re-rendered, queue cleared | real cards shown by the landing or the backstop | [ ] |
| 7 | hidden search to hand (Quick Search, Cassiopeia, Explorer's Guidance) | no `cardsRevealed` for the hand picks, no scene | [ ] |
| 8 | `peek` / `revealedTo` reveals | never stamped with art, never planned | [ ] |
| 9 | both seats | owner and opponent each play it from the same event; the opponent's card lands sleeve up, turned like their board | [ ] |
| 10 | reconnect, catch-up, hidden tab | no scene, cards shown | [ ] |
| 11 | effects off / reduced motion | no scene, cards not hidden; sound per the dispatcher rule | [ ] |
| 12 | older "show it to your opponent" printings (Pokémon Collector) | counts as a reveal | [ ] |
| 13 | Nest Ball (bench search) | its public `cardsRevealed` unchanged; no reveal scene | [ ] |
| 14 | attack search with reveal (Jirachi), staged attack search | `cardsRevealed` per resolved stage → scene | [ ] |
| 15 | Trainer preview and reveal in one batch (Gutsy Pickaxe) | preview first, reveal starts on its hold | [ ] |
| 16 | spectator | no plan | [ ] |
| 17 | revealed card no longer in the hand after the diff | skipped | [ ] |

## Test plan
Unit: `reveal-picks.test.mjs` (text rule, step flag wins, effect text sources, art stamp);
`deck-reveal-events.test.mjs` (engine, real card texts: each source type reveals with art, hidden
searches do not, bench unchanged); advisory planner (runs, grouping, plan for both seats);
engine → planner integration (Ultra Ball events planned for owner and opponent); `opp-play`
(holdMs, toFaceDown, defaults unchanged); `deck-reveal.test.mjs` (timing, hold, shine);
`fx-audio` (voice). Gates: `pnpm test`, `pnpm audit:oracle`, `audit:trainers`, `audit:abilities`,
`audit:attacks`. E2E: Playwright on the e2e board drives the real `applyView` + advisory hooks for
both seats; frames at deck / spot / hand and a video (`.agent/scratch/deck-reveal/`).

## Migration / rollout
n/a — additive event fields (`src` on public reveal entries), fewer events for hidden searches,
one new plan kind. Revert = revert the commits; no data touched.

## Work plan
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 | create `shared/engine/rules/reveal-picks.mjs` + `rules/__tests__/reveal-picks.test.mjs`, `__tests__/deck-reveal-events.test.mjs`; modify `effects/executor.mjs`, `effects/trainer-steps.mjs`, `effects/ability.mjs`, `rules/abilities.mjs`, `reduce.mjs` | as in Design § Engine | Ultra Ball pick → `cardMoved deck→hand` + `cardsRevealed [{instanceId, name, src}]`; Cassiopeia pick → no `cardsRevealed`; Great Ball take → reveal with src; Explorer's Guidance take → none; Town Store → reveal with src; Aromatisse → reveal with src; Pidgeot ex Quick Search → none; Jirachi Charge Energy → reveal with src; Nest Ball → bench reveal kept; peek event → no src | corpus rows: Ultra Ball 30th Celebration 128, Cassiopeia Shrouded Fable 094, Great Ball Paldea Evolved 183, Explorer's Guidance Prismatic Evolutions 107, Town Store Obsidian Flames 196, Aromatisse Perfect Order 036, Pidgeot ex Paldean Fates 221, Jirachi Paradox Rift 126, Nest Ball Paldean Fates 084, Pokémon Collector HeartGold & SoulSilver 97 ("show them to your opponent"), Radio Tower Neo Destiny 95 (peek) | new tests fail on main, pass; `pnpm test:changed` green |
| 2 | modify `client/src/setup/netcode/advisory-animations.mjs` + its test | `deckRevealRuns(events)`; plan `{kind:'reveal', user, cards}` | batch [cardMoved A, cardMoved B, cardsRevealed A,B] → leader → [A,B]; per-card reveals → first gets all, rest []; hand reveal → none; peek → none; opp viewer → user 'opp'; engine Ultra Ball events → reveal plan with src for both seats | — | tests green |
| 3 | modify `mat-fx/opp-play.mjs` + test; create `mat-fx/deck-reveal.mjs` + test; modify `mat-fx/fx-audio.mjs` + test | as in Design § Client scene | holdMs 600 → total 1420; toFaceDown → flip 180 at end, 0 at hold; defaults = 043 values; times(1,600) total 1420 hold 1120; times(2,1200) start(1) 85, total 2215; shine offsets inside (0,1) | — | tests green |
| 4 | create `mat-fx/deck-reveal.js`, `.claude/skills/fx-preview/rec/rec-deck-reveal.mjs`; modify `mat-fx/opp-play.js` (`spawnFlipCard`, export `boardFrameRects`), `mat-fx/draw-scene.js` (export `handSpotOf`), `advisory-animations.js` | `playDeckReveal(user, cards, show) → number`; held card `{image, wrapper?, redacted, faceSrc}` | e2e: self and opp scenes on the e2e board — overlay at the deck at t≈0, face up centred at the hold, landed on the hand card, real card visible after | — | suite green; frames checked |

## Deviations (Builder appends here during build)

---
Self-approval checklist:
- [x] Every constraint traceable into the Design section
- [x] Every edge-case row has an expected behavior
- [x] Interfaces fully named and typed
- [x] Slices each ≤1 session and independently green
- [x] Every slice row is pinned (card rulings cited by corpus row)
- [x] No section reads "TBD"
