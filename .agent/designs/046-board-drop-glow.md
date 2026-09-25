# 046: Board glow for held Trainers + deeper drop hovers
Status: built S310 on feature/board-glow (stacked on feature/prize-fx; not pushed) — user checks visuals on localhost. Approved (user) — scope answers S310: Items + Supporters light the board; every drop hover gets the rework; soft blue breathing glow
Date: 2026-09-25 · Session: S310

## Problem
While you drag an Item or Supporter from your hand, nothing tells you where it goes: the Trainer board
(`#board`) only reacts once the pointer is over it. The drop hovers themselves are flat: `#board`
gets a plain 30% blue fill (`.highlightBox`), a Pokémon card you drop onto gets a flat 4 px ring
(`.highlight`), and the Active/Bench zones show nothing at all on a mat (the `body.mat-active` reset
wipes their ring and fill). The user wants the board to glow while a Trainer is held and the blue hover
to have depth.

Out of scope: the parent page's green Stadium hover (index.css `.highlight`), the Lost Zone rail drop
highlight, the green `.selectHighlight` pick ring, drop rules (what may land where).

## Constraints
- Each playmat iframe is its own document: rules and keyframes live in both `self-containers.css`
  (blue) and `opp-containers.css` (red), mirrored.
- `body.mat-active` resets zone plates with `!important` (1 ID + class + element); `#board` is not
  in that list. An `!important` declaration beats any animation, so a zone glow on the mat is static.
- `#board` scrolls (`overflow-y: auto`): a pseudo-element's outer glow would be clipped; the glow must
  be the element's own `box-shadow`/background.
- Memory: no whiteouts or spinning sunburst rays; reduced motion holds still.
- Server-authoritative cards carry their data on `img.card` (`supertype`, `type`, `subtypes`); legacy
  cards only know `type: 'Trainer'`.

## Current state
- `client/src/setup/image-logic/drag.js` — `dragStart` / `dragOver` add `.highlight` (cards, zones) or
  `.highlightBox` (`#board`, zone parents); `dragLeave` / `dragEnd` / `drop` remove them.
- `client/src/setup/image-logic/drop-zone.mjs` — pure `zoneOf`; tests in `__tests__/drop-zone.test.mjs`.
- `client/src/css/self-containers.css` / `opp-containers.css` — `.highlight`, `highlight-pulse`,
  `.highlightBox`, `body.mat-active` resets.
- `shared/engine/cards.mjs` — `isTrainer(card)` (no imports).

## Options
1. Which cards light the board
   - a) every Trainer — simplest, but Stadiums and Tools never land on the board. ✗
   - b) Items + Supporters: `isTrainer` minus Tool/Stadium by `type`/`trainerType`/`subtypes`, the same
     text test the engine's `isToolCard`/`isStadiumCard` use. Legacy cards (type only) fail open. ✓ (user)
2. Where the "held" state lives
   - a) CSS `:has(.dragging)` on the board document — cannot see the card's type, and the card is in
     the hand. ✗
   - b) `drag.js` adds `board-drop-ready` to the dragger's own `#board` in `dragStart`, removes it in
     `dragEnd`/`drop` (and before adding, so a lost `dragend` cannot strand it). ✓
3. Zone glow on the mat
   - a) pseudo-element overlay — `#bench` lays out its slots with flex; an extra box risks layout. ✗
   - b) `body.mat-active #active.highlight` (and `#bench`) — beats the reset on specificity, static
     layered shadow. ✓

## Design
1. `drop-zone.mjs` gains `playsOntoBoard(card)`: `isTrainer(card)` and its kind text
   (`type`, `trainerType`, `subtypes`) names neither `tool` nor `stadium`. Null → false.
2. `drag.js`: `dragStart` resolves the held card (`event.target.card`, else the legacy zone array at
   `mouseClick.cardIndex`); when it comes from the hand and `playsOntoBoard`, adds `board-drop-ready`
   to `getZone(mouseClick.cardUser, 'board').element`. `dragEnd` and `drop` clear it on both boards.
3. CSS, both sheets, with per-side custom properties (`--drop-rgb` light, `--drop-deep-rgb` deep):
   - `#board.board-drop-ready`: faint radial wash, soft inset light and a thin rim; `board-ready-breathe`
     (2.4 s) swells the outer halo and inner light.
   - `.highlightBox` (the hover): a lit well — radial core brighter toward the bottom, inset rim light
     at the top edge, inset shade, bright 2 px rim, outer halo, and a dark drop shadow under it.
     `#board.highlightBox` outranks `board-drop-ready` and stops the breathing.
   - `.highlight` (cards/zones): bevelled ring — light inner edge, coloured band, dark outer edge —
     plus lift shadow; `highlight-pulse` breathes the halo only.
   - `body.mat-active #active.highlight`, `#bench.highlight`, and their `.highlightBox`: static well
     (important), so zone hovers show on a mat.
   - Reduced motion: breathing paused.

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Item / Supporter dragged from hand | own board breathes until drop or cancel | [x] covered: playsOntoBoard Items/Supporters test + board-drop-glow-css breathe test |
| 2 | Stadium / Tool / Pokémon / Energy dragged | no board glow | [x] covered: playsOntoBoard Stadiums/Tools + Pokémon/Energy tests |
| 3 | Trainer dragged from somewhere other than the hand (board, discard viewer) | no glow | [x] reasoning: markBoardReady returns unless mouseClick.zoneId is 'hand' |
| 4 | Legacy card with only `type: 'Trainer'` | glows (fails open) | [x] covered: playsOntoBoard bare Trainer assertion |
| 5 | Redacted / unknown card data | no glow | [x] covered: playsOntoBoard unknown cards test ({instanceId}, null) |
| 6 | Drag cancelled (Esc) / dropped elsewhere | glow cleared in dragEnd/drop | [x] reasoning: clearBoardReady in dragEnd (fires on cancel) and drop |
| 7 | Pointer over the board while held | hover well replaces the breathing | [x] covered: board-drop-glow-css 'hovering the board swaps the breathing' |
| 8 | `dragend` lost (iframe swap) | next dragStart clears stale glow first | [x] reasoning: markBoardReady calls clearBoardReady on both boards first |
| 9 | Replay (1P) | dragStart returns early; no glow | [x] reasoning: dragStart's replay guard runs before markBoardReady |

## Test plan
Unit: `playsOntoBoard` — Item, Supporter, generic Trainer, legacy type-only, Stadium (type and subtypes),
Tool (`Pokémon Tool` type, trainerType), Pokémon, Energy, null, redacted `{instanceId}`.
Visual: user checks localhost (memory: no Browser pane for CSS).

## Migration / rollout
n/a — client cosmetic. Revert = revert the commit.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Delivers | Green when |
|---|---|---|
| 1 | predicate + drag hook + both sheets | unit tests + lint + suite green |

## Deviations (Builder appends here during build)
- Added `board-drop-glow-css.test.mjs` (static contracts, both sheets + the drag.js class name) beyond the
  unit plan. Reduced motion now also pauses the `.highlight` pulse, not only the board breathing.
