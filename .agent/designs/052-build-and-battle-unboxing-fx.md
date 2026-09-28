# 052: Build & Battle unboxing scene (box, deck, packs, card reveals)
Status: approved (user, 2026-09-28: "start working on design 52") · slices 1–3 built · depends on design 051 slices 1–4
Date: 2026-09-28 · Session: S328

## Problem
Design 051 opens a Build & Battle Box with a click and flips ten cards per pack. The user wants the
mode to feel like physically unboxing one (reference: YouTube "Opening 4 Phantasmal Flames
Prerelease Kits", DSnMLTsV-no — not viewable from this environment; the beats below are the
standard unboxing: shrink-wrap off, lid up, wrapped deck with the promo showing, four packs, each
pack torn and its cards revealed one at a time with the rare at the back, foil catching the light).
This design replaces 051's step 3 ("Reveal") with a full scene in the house FX style (041–046).

## Constraints
- Runs in the builder tab (`/build-and-battle`, design 051), not on the board: no FX queue, no
  holds, no opponent mirror (`fx-queue.mjs`, `fx-holds.mjs`, `frameTurnOf` do not apply).
- House rules (`.claude/agents/fx-designer.md`): one clock — WAAPI keyframes sampled from pure,
  DOM-free pose functions (`sampleKeyframes` / `animateFrames` in `image-logic/mat-fx.mjs:108`);
  flares stay inside the card's bounds, no whiteouts, no sunbursts, no backdrop colour change;
  opacity animates on a host, never on a `preserve-3d` element; `motionReduced()` reads only
  `localStorage['ptcg-reduce-motion']`; `body.fx-off` / `fxDisabled()` kills the scene and its sound;
  sound is synthesized (no audio assets, design 024): voices via `voicesFor(effect, plan)` in
  `mat-fx/fx-audio.mjs`, played by `playFxSound(plan)` in `fx-audio.js`.
- Foil: `buildHoloCard(imageUrl, rarity)` + `resolveHoloEffect(card)` (`core/holo.mjs:77,252`) and
  `client/src/css/holo/*.css` keyed on `data-rarity`. TCGdex strings map: "Double rare" → double
  rare, "Ultra Rare" → ultra rare, "Illustration rare" / "Special illustration rare" → their
  families, "Mega Hyper Rare" → hyper rare. "Rare", "Promo", "Common", "Uncommon" map to nothing
  today; the reverse slot needs a rarity ending in "reverse holo" (`reverse-holo.css:18`).
- Vendored product art is existing practice (sleeves 368 KB, playmats 57 MB, coins under
  `client/src/assets/`), so box-face textures may ship as assets; there is no photogrammetry
  toolchain and no WebGL/three.js in the app (a mesh renderer would be a new dependency, D-line
  required, and the page has no build step). A box is a cuboid, so six flat face textures on a CSS
  3D cuboid are the whole "3D model". Card faces are TCGdex images already in the baked set (051).
- Cosmetic only: the pool is fixed at box open (051 § Session); the scene never changes what the
  player receives, and every beat is skippable. State machine = `session.unboxing` (below), so a
  reload resumes at the last completed beat.
- fx-preview captures only the board (`.claude/skills/fx-preview/SKILL.md`); this design adds a
  builder-tab recorder.

## Current state (after design 051, this session's reads)
- 051 § Builder-tab controller step 3: `button.bb-pack` rows flip ten `.bb-pack-card` with a 60 ms
  stagger, CSS only; `session.openedPacks` counts opened packs. That step is superseded here.
- `image-logic/mat-fx.mjs` exports `motionReduced`, `fxDisabled`, `soundDisabled`, `fxVolume`,
  `spawnOverlay({rect, className})`, `runPose`, `sampleKeyframes(poseFn, toFrame, samples)`,
  `animateFrames(el, frames, {duration, delay, easing})`, `removeWhen`, `spawnParticles(host,
  particles, {...})`; `mat-fx/particles.mjs` `burstParticles({count, distance, direction, spread,
  size, aspect, gravity, maxDelay, orient, seed})` (max 24); `mat-fx/fx-colors.mjs`
  `fxRgbForCard`, `brighten`, `rgbCss`.
- `mat-fx/fx-audio.mjs`: `STATIC_VOICES` table (effect → voice specs `{type, wave, freq, freqTo?,
  dur, gain, delay?, attack?, filter?}`), `voicesFor(effect, plan)`; `fx-audio.js` `playFxSound(plan)`.
- `core/holo.mjs`: `resolveHoloEffect(card)` (rarity string → CSS family, energy reverse special
  case), `buildHoloCard(imageUrl, rarityValue)` builds `.card > .card__translater > .card__rotator >
  (img, shine, glitter, glare, glare2)`; `startHoloAnimation()` :437 attaches pointer tilt;
  `css/holo/base.css:114-131` perspective + `--rotate-x/--rotate-y`.
- `image-logic/drag-tilt.mjs`: `createDragTilt`, `stepDragTilt(state, point, dtMs, params)`,
  `dragAvatarTransform`, `DRAG_TILT` (roll 14°, pitch 6°, spring 360/30).
- Existing two-face flips: `css/mat-fx.css:428-473` (opponent Trainer, `backface-visibility`),
  `css/index.css:2043-2074` (card preview flip).
- Recorders: `.claude/skills/fx-preview/rec/rec-*.mjs` write `out/<effect>.webm` from the e2e board.

## Options
1. **Where the scene lives.** A: a mat-fx scene module under `netcode/mat-fx/` — wrong home, that
   dispatcher is board-only. B: `deck-builder/core/build-battle/unboxing.mjs` (pure poses + timeline)
   with a DOM twin `sidebox/native-deck-builder-unboxing.js`, importing the shared primitives from
   `image-logic/mat-fx.mjs` and the voice player. **Pick B.**
2. **Box and pack art.** A: a real 3D scan (photogrammetry from the video frames) — not feasible:
   it needs 30–80 sharp overlapping photos and a reconstruction tool, and the result is a mesh the
   app cannot draw without WebGL. B: procedural CSS faces reproducing the real layout (§ Box
   reference) from palette tokens, gradients, the TCGdex set logo and one card's full-art image
   as the key art. C: **box unwrap** — six flat textures cut from the references and vendored under
   `client/src/assets/build-battle/box/<face>.webp`, each perspective-corrected by a `matrix3d`
   computed from four hand-picked corner points (`faceMatrix3d`, pure, tested), mapped on the CSS
   cuboid; procedural fallback per face where no sharp source exists. **Pick C for the front and
   left faces** (the official render `refs/052-box-render.webp` is sharp and near-frontal) **and
   B for right, back, top and bottom** (the video frames are motion-blurred; the back is mostly
   text, which types cleanly). The user can swap any face to C later by photographing it squarely.
   Packs are C too: the four official pack fronts (`refs/052-pack-{charizard,gengar,heracross,
   lopunny}.webp`, Mega Charizard X / Mega Gengar / Mega Heracross / Mega Lopunny) ship as
   `client/src/assets/build-battle/packs/me02-<key>.webp` (≤ 250 KB each); each of the box's four
   packs gets one art chosen from the seed (§ Pure poses `packArtIndexes`), so a box can hold
   duplicates as real boxes do. Pack backs are procedural silver foil with the set logo.
3. **Opening interaction.** A: click everything. B: tear-by-drag (pointer down on the wrap / pack
   top edge, drag ≥ 40 % of its width) with click fallback (a press with < 6 px movement tears too).
   C: drag only. **Pick B**: the drag sells the physicality; the fallback keeps mobile and keyboard
   users (Enter/Space on the focused element) unblocked.
4. **Card reveal order and pacing.** A: all ten flip at once. B: one at a time, top card lifts off
   the stack, flips, settles into a fan; the reverse slot gets a shine sweep, the hit slots (IR/SIR
   and the rare-slot card when it is Double rare or better) get a slower lift and a local flare; a
   "Reveal all" button auto-advances with `REVEAL_STAGGER_MS`. **Pick B.** The pack model (051) already
   emits cards in slot order, so the rare-slot card is last with zero extra work.
5. **Foil during reveal.** A: static images. B: `buildHoloCard` per revealed card with the rarity
   mapped by `unboxingHoloRarity(card, slot)`; pointer tilt via `startHoloAnimation` on the fanned
   cards. **Pick B**, with these pins: reverse slots → `'Reverse Holo'`; TCGdex `'Rare'` → `'Rare
   Holo'` (ME-era Rares are holo prints; TCGdex me02 Rare records carry `variants.holo: true`);
   `'Promo'` → `'Rare Holo'` (pokemon.com: "foil promo cards"); Common/Uncommon in normal slots →
   no foil.
6. **Sound.** A: silent. B: six new synthesized voices in `STATIC_VOICES` (tear, lid, unwrap, flip,
   hit chime per tier, done), played with `playFxSound({ effect })`, gated by `soundDisabled()`.
   **Pick B.** Pitch of the hit chime rises with the tier.
7. **Where the revealed cards go.** A: fly each card into the Pool grid. B: the fan collapses into the
   pack row (scale to 0.2, fade on the host) and the Pool tab crossfades in. **Pick B**; A is a
   follow-up if wanted.
8. **Verification tooling.** A: hand-check only. B: `rec/rec-unboxing.mjs` in the fx-preview skill
   folder: Playwright opens `/build-and-battle?seed=42`, drives the beats, records
   `out/unboxing.webm` and frame strips at each beat's start/peak/settle. **Pick B**, plus SKILL.md
   gains a "builder tab" paragraph.

## Design
### Beats and timing (pure constants, `core/build-battle/unboxing.mjs`)
```
WRAP_TEAR_MS 320 · LID_OPEN_MS 520 · TRAY_RISE_MS 380 · TRAY_STAGGER_MS 70
DECK_UNWRAP_MS 300 · PROMO_LIFT_MS 620 · PROMO_HOLD_MS 900
PACK_TEAR_MS 260 · PACK_SPILL_MS 340
CARD_LIFT_MS 220 · CARD_FLIP_MS 320 · CARD_SETTLE_MS 260 · REVEAL_STAGGER_MS 90
HIT_LIFT_MS 520 · HIT_FLARE_MS 700 · HIT_HOLD_MS 600
FAN_COLLAPSE_MS 380 · SCENE_BACKSTOP_MS 4000
```
Easing: lift/settle `cubic-bezier(.2,.8,.2,1)`, flip `cubic-bezier(.4,0,.2,1)`, lid `cubic-bezier(.3,1.2,.4,1)` (slight overshoot). `motionReduced()` → every duration 0, beats still fire their
state changes and sounds; `fxDisabled()` → durations 0 and no sound.

### State machine (`session.unboxing`, persisted by 051's `saveSession`)
`Unboxing = { stage: 'sealed'|'opened'|'deckShown'|'packs'|'done', packsTorn: boolean[4],
revealed: number[4] }` (`revealed[i]` = cards revealed in pack i, 0..10). `createUnboxing()`,
`advanceUnboxing(u, event) -> u'` (pure reducer; events: `tearWrap`, `openLid`, `unwrapDeck`,
`tearPack(i)`, `revealCard(i)`, `revealAll(i)`, `finish`); illegal events return the same object.
`stage === 'done'` iff all four packs have `revealed === 10`. 051's `openedPacks` becomes
`packsTorn.filter(Boolean).length` (051 slice 2 is amended: the session field is `unboxing`).

### Pure poses (`unboxing.mjs`, unit-tested, no DOM)
- `lidPose(t) -> { rotateXDeg, translateYPx }` — hinge at the back edge: 0 → −112° with the
  overshoot easing folded in; `t` ∈ [0,1].
- `wrapTearPose(t) -> { clipPath }` — a diagonal wipe `polygon(...)` from the top-right corner.
- `trayRisePose(t, index) -> { translateYPx, opacity }` — 24 px rise, `index` delays via
  `TRAY_STAGGER_MS` (deck, pack 1–4, code card, tip sheet = indices 0–6).
- `promoLiftPose(t) -> { translateYPx, rotateXDeg, rotateYDeg, scale }` — lifts 40 px, tilts
  −8°/+6° then settles to 0 (the holo tilt takes over on pointer).
- `packTearProgress(dxPx, packWidthPx) -> 0..1` and `packTornAt(progress) -> boolean` (≥ 0.4).
- `packSpillPose(t, cardIndex) -> { translateXPx, translateYPx, rotateZDeg }` — ten cards rise
  out of the torn top (pack mouth) by 55 % of the pack height, then settle into a slightly offset
  stack beside the pack (2 px per card, max 8° fan).
- `cardRevealPose(t, { tier }) -> { translateYPx, rotateYDeg, scale, flare }` — lift (tier 0: 18 px,
  tier ≥ 1: 34 px), `rotateYDeg` 0 → 180 across the flip window, `flare` 0..1 only for tier ≥ 2
  (peaks at 0.55, drives a radial highlight clipped to the card).
- `fanSlot(index, count, widthPx) -> { xPx, rotateZDeg }` — revealed cards fan across the row.
- `hitTierFor(card, slot) -> 0|1|2|3`: 0 Common/Uncommon/Rare in normal slots; 1 reverse slot or
  Double rare; 2 Ultra Rare / Illustration rare; 3 Special illustration rare / Mega Hyper Rare.
- `unboxingHoloRarity(card, slot) -> string|null` per Options 5.
- `unboxingVoiceFor(event, tier) -> effect name` (table under Sound).
- `PACK_ARTS = ['charizard', 'gengar', 'heracross', 'lopunny']`;
  `packArtIndexes(seed, count = 4) -> number[]` — `createRng(seed ^ 0x9e3779b9)` and `int(4)` per
  pack: a separate stream, so the art never shifts the card pool that `openBox(seed)` produced
  (051 slice 2 is already landed and must stay bit-identical).
- `packTearEdge(seed, packIndex, teeth = 12) -> string` — the jagged `clip-path: polygon(...)` of
  the torn top strip (tooth heights 2–5 % of the pack height, seeded so a reload shows the same tear).
- `faceMatrix3d(srcQuad, dstWidthPx, dstHeightPx) -> string` — the CSS `matrix3d(...)` that maps
  the four source corners of a face in a reference image (`[{x,y}×4]`, clockwise from top-left,
  in image pixels) onto the `dstWidth × dstHeight` face rectangle (standard 8-DOF homography
  solved by Gaussian elimination, no dependency). The corner points per vendored face are constants
  in `box-textures.mjs` next to the asset paths; the DOM twin applies the matrix to an `<img>`
  inside an `overflow: hidden` face.
- `unboxingTimeline(unboxing) -> Beat[]` — `Beat = { at, durationMs, kind, packIndex?, cardIndex? }`
  for `revealAll` (the DOM twin just plays the list).

### DOM twin (`sidebox/native-deck-builder-unboxing.js`)
Mounted into `#buildBattleBoxPanel` (051) as `#bbUnboxing`. Structure:
```
#bbUnboxing.bb-scene[data-stage]
  .bb-box (perspective host)  .bb-box__body (3D cuboid: front/top/left/right/back faces)
    .bb-box__wrap (sheen, clip-path)   .bb-box__lid (hinged top face)
  .bb-tray  .bb-deck (card-back stack + .bb-deck__window showing the promo) .bb-pack×4 .bb-prop×2
  .bb-promo (buildHoloCard host, hidden until unwrapDeck)
  .bb-reveal (per torn pack: .bb-stack (face-down cards) + .bb-fan (revealed holo cards))
  .bb-controls (Reveal all · Skip scene · Build your deck)
```
- Every beat: `advanceUnboxing` → `saveSession` → play the pose with `sampleKeyframes` +
  `animateFrames` (host gets `will-change: transform`) → remove `will-change` on settle;
  `SCENE_BACKSTOP_MS` timer forces the settled state if an animation never resolves.
- Tear input: `pointerdown` on `.bb-box__wrap` / `.bb-pack__top` → `setPointerCapture`, track
  `dx`, update `--bb-tear` (0..1) live; at `packTornAt` fire the beat; `pointerup` with progress
  < 0.4 springs back over 160 ms; a press with < 6 px movement counts as a click → beat.
  Keyboard: the same elements are `button`s; Enter/Space → beat.
- Reveal: click/tap the stack (or drag its top card ≥ 24 px) → `revealCard(i)`: the top face-down
  card lifts, flips (`backface-visibility: hidden`, front = card back until 50 %), becomes a
  `buildHoloCard` node at the flip midpoint (face never visible before then), settles into
  `fanSlot`. Tier ≥ 2: `HIT_*` timings, a flare layer (`.bb-flare`, radial gradient in
  `rgbCss(brighten(fxRgbForCard(card)))`, `mask` = card bounds) and 16 `burstParticles` confined to
  the card rect. "Reveal all" plays `unboxingTimeline`. Fanned cards get `startHoloAnimation` tilt.
- Stage `done`: `.bb-fan` collapses (`FAN_COLLAPSE_MS`, opacity on the host), "Build your deck"
  switches to the Pool tab (051 step 4). "Skip scene" → `finish` (states jump, one `unbox-done`
  voice). Reload at any stage re-mounts in the settled state for `session.unboxing`.
- Sounds through `playFxSound({ effect })` from `mat-fx/fx-audio.js`, one call per beat, before the
  animation starts (house rule "sound before sight").

### Sound (`mat-fx/fx-audio.mjs` `STATIC_VOICES` additions; each ≤ 3 voices)
| effect | voices |
|---|---|
| `unbox-tear` | noise burst, bandpass 1.8 kHz, 180 ms, gain .35 |
| `unbox-lid` | triangle 140→90 Hz 220 ms gain .3 + noise 90 ms gain .15 delay 60 |
| `unbox-unwrap` | noise highpass 3 kHz 140 ms gain .25 |
| `unbox-flip` | square 900 Hz 40 ms gain .12 |
| `unbox-hit-1` / `-2` / `-3` | sine arpeggio 523/659/784 Hz (tier 1), +1 octave and a 4th note (tier 2), tier 3 adds a 1.2 s sawtooth swell at 262 Hz gain .18 |
| `unbox-done` | triangle 392→523 Hz 260 ms gain .25 |

### Pack reference (official fronts `refs/052-pack-*.webp`)
Portrait, W : H = 1 : 1.8, crimped seal strips top and bottom (7 % of the height each, a
serrated `repeating-linear-gradient` texture in the vendored image already), a black "6+" badge
top-right, the Pokémon TCG wordmark, the Mega key art, the "Mega Evolution / Phantasmal Flames"
logos, and a red bottom band "⑩ ADDITIONAL GAME CARDS" with the Poké Ball emblem. The foil shows
two soft vertical highlights near the left and right edges; the DOM twin adds a `.bb-pack__foil`
layer (same two highlights, drifting 4 px with the fixed-light holo drift) over the image. Tear
geometry: `.bb-pack__top` is the top crimp strip; a tear separates it along `packTearEdge`, the
strip slides right and fades on its host, and the cards emerge from the open mouth
(`packSpillPose`). Pack back: procedural silver (`linear-gradient(180deg, #d9dbe0, #9aa0aa,
#d9dbe0)`) with the same crimps and the set logo centred.

### Box reference (user frames `.agent/designs/refs/052-box-{front,left,right,back,top}.webp`)
Proportions W : H : D = 1 : 1.45 : 0.65 (front from the official render `refs/052-box-render.webp`,
depth from the top frame). Faces:
- **Front** (portrait): top strip — red rounded plate with the Pokémon TCG wordmark (text, app
  font, `--bb-red` plate, yellow letters) at the left; a magenta slashed banner carrying a black
  "PLAY LEVEL 2" pill with two filled Poké Balls and one empty ring; a black "6+" badge in the
  top-right corner. Middle two thirds — the key art: Mega Charizard X (black body, blue flames)
  over diagonal slashes of magenta, lime, yellow and black. Rendered as `me02-125` (Special
  Illustration Rare Mega Charizard X ex, `assets.tcgdex.net/en/me/me02/125/high.webp`) with
  `object-fit: cover` positioned on the dragon, under a `linear-gradient(115deg, …)` slash overlay
  at 55 % opacity in `--bb-magenta` / `--bb-lime` / `--bb-yellow` / `--bb-black`. Lower third —
  the "MEGA EVOLUTION" gold pill and the "PHANTASMAL FLAMES" logotype = the TCGdex set logo
  (`assets.tcgdex.net/en/me/me02/logo.webp`, verified 200). Bottom band — black, the Play! Pokémon
  mark (red/white circle glyph drawn in CSS) and "BUILD & BATTLE" in white extended caps, a red
  Poké Ball emblem clipped at the right edge.
- **Left / Right**: the key art's slashes wrap around (black base, magenta/lime/yellow/blue
  diagonal streaks continuing the front's angle, no characters); the same top strip and bottom
  band colours continue as thin bands.
- **Back**: black with a faint diamond/geometric texture (`repeating-linear-gradient` pair at
  ±45°, 4 % white); top: Play! mark + "BUILD & BATTLE"; two thin gold rules framing "Inside,
  you'll find:" and three bullets (40-card ready-to-play deck including 1 of 4 unique foil promo
  cards · 4 Phantasmal Flames booster packs · a code card for Pokémon TCG Live); a red band with
  "WWW.POKEMON.COM"; small legal text as unreadable grey lines (never real legal copy); the
  Poké Ball corner emblem; "Gotta catch 'em all!" at the foot.
- **Top / Bottom**: black textured with a wide gold band (`linear-gradient(90deg, #d9a92c,
  #f6d65a, #d9a92c)`) carrying the Pokémon TCG wordmark plate.
- **Shrink-wrap**: a glossy layer over all faces (`--bb-wrap`), two diagonal highlight streaks,
  a seam line down the back, removed by `wrapTearPose`.
- Palette tokens: `--bb-black: #0b0b10`, `--bb-magenta: #ff2fa3`, `--bb-lime: #7fe000`,
  `--bb-yellow: #ffd400`, `--bb-blue: #2f7bff`, `--bb-red: #d62828`, `--bb-gold: #e0b431`,
  `--bb-wrap: rgba(255,255,255,.26)`. The wordmarks are typeset, never traced logos; the fx-designer
  may tune hues in Deviations, not the layout.

### CSS (`client/src/css/deck-builder-unboxing.css`, scoped `.db-live.build-battle-window`)
Tokens from Options 2; cuboid faces via `transform-style: preserve-3d` on `.bb-box__body` only (its
host `.bb-box` carries opacity/perspective); `.bb-pack__top` crimp with
`repeating-linear-gradient(90deg, ...)`; card flip faces `backface-visibility: hidden`; `.bb-flare`
`pointer-events: none`, `mix-blend-mode: screen`, clipped by the card's `border-radius`;
`@media (prefers-reduced-motion: reduce)` as a CSS fallback (the JS gate stays the localStorage flag,
house rule 8). Phone width: box scales to the viewport width, packs wrap two per row, fan wraps.

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | reduced motion flag set | every beat completes instantly, sounds still play, holo tilt still works | [x] `instant()` in the DOM twin; browser run with the flag |
| 2 | `body.fx-off` / `fxDisabled()` | instant beats, no sound, no flare, no particles | [x] `playHitFlare` returns early; browser run: 0 flare/particle nodes |
| 3 | illegal event (reveal before tear, tear twice, finish mid-pack) | reducer returns the same object; DOM does nothing | [x] unboxing.test row 3; DOM: `dispatch` returns null and the beat stops |
| 4 | reload at each stage (sealed/opened/deckShown/packs with 3 of 10 revealed/done) | remounts settled at that stage; the 3 revealed cards are in the fan, 7 on the stack | [x] state round trip, unboxing.test row 4; remount: browser reload mid-pack |
| 5 | drag released at 39 % / 40 % / click with 5 px / 7 px movement | springs back / tears / tears / nothing (treated as a short drag) | [x] unboxing.test row 5 (`tearReleaseOutcome`) |
| 6 | double-click on the stack | one reveal per completed flip; a second click during `CARD_FLIP_MS` queues at most one | [x] `requestReveal` lanes; browser: 1 + 3 fast clicks → 3 revealed |
| 7 | Reveal all pressed mid-reveal | continues from the current index; no duplicate cards | [x] unboxing.test row 7 |
| 8 | WAAPI missing (old browser) | `animateFrames` degrades (existing behavior): states still settle via the backstop | [x] reasoning: `animateFrames` applies the last frame; state saved before each pose |
| 9 | animation never finishes (tab hidden) | `SCENE_BACKSTOP_MS` settles the state | [x] `withBackstop` around every beat |
| 10b | `packArtIndexes(42)` twice / different seeds / `openBox(42)` before and after adding art | identical arrays / arrays differ somewhere across 100 seeds / the card pool is byte-identical to slice 2's | [x] unboxing.test row 10b |
| 10a | `faceMatrix3d` on a rectangle / a skewed quad / a degenerate quad (two equal corners) | identity-like matrix / corners land within 0.5 px of the target / throws, and the face falls back to the procedural layout | [x] unboxing.test row 10a; `mountTexture` keeps the CSS face on a throw |
| 10 | card image 404 / logo 404 / key art 404 / face texture 404 | card shows the card back with the name; box shows the palette and typeset titles without the logo or key art | [x] browser run with TCGdex routed to 404 |
| 11 | tier mapping across all 130 me02 cards + promos | every `unboxingHoloRarity` result is a family `holo/*.css` styles (or null); reverse slot always ends in "reverse holo"; Rare/Promo → rare holo | [x] unboxing.test row 11 |
| 12 | hit flare never leaves the card rect | flare + particles are children of the card host with `overflow: hidden` | [x] `.bb-flyer__front` clips `.bb-flare` / `.bb-sparks` |
| 13 | pool integrity | revealed ids == `session.packs[i]` in order; the scene reads, never writes, `packs` | [x] rec-unboxing pass 1: fan ids per pack, `packs` unchanged at the end (seeds 42, 18) |
| 14 | face shown before the flip midpoint | never: the holo node is created at 50 % of `CARD_FLIP_MS` | [x] rec-unboxing probe: at every face insert the front still faces away (37 reveals × 2 seeds); video |
| 15 | keyboard-only user | Tab reaches wrap, lid, deck, packs, stack; Enter/Space fires each beat | [x] all are buttons; browser run driven by Enter only |
| 16 | phone width (390 px) | no horizontal scroll; box, tray, fan wrap | [x] `@media (max-width: 520px)`; rec-unboxing pass 3: scrollWidth 390 (visual: the builder's deck pane covers the Box tab at 390 px, slice 3 note) |
| 17 | "Skip scene" from sealed | jumps to done, Pool tab available, one `unbox-done` sound | [x] reducer + voice, unboxing.test row 17; browser: Pool tab shown after skip |
| 18 | sound context locked (no gesture yet) | `playFxSound` no-ops until the first gesture (existing `bindGestureUnlock`) | [x] reasoning: every beat starts from a gesture |

## Test plan
Unit (`core/build-battle/__tests__/unboxing.test.mjs`): reducer transitions (rows 3, 4, 7, 17), pose
endpoints and monotonicity (`lidPose(0)` = 0°, `lidPose(1)` = −112°, flip crosses 90° at 0.5,
`flare` peaks at 0.55 and is 0 for tier < 2), `packTearProgress` thresholds (row 5), `hitTierFor` and
`unboxingHoloRarity` over the baked me02 rows + promos (row 11), `unboxingTimeline` lengths, voice
table completeness (`voicesFor('unbox-hit-3')` returns ≥ 2 voices). CSS test as
`fx-kill-switch-css.test.mjs` does: `.fx-off` and reduced-motion fallbacks present.
Video: `.claude/skills/fx-preview/rec/rec-unboxing.mjs` → `out/unboxing.webm` + strips
`.agent/scratch/unboxing/<beat>-{start,peak,settle}.png` for tear, lid, promo, pack tear, tier-0
flip, tier-3 flip, collapse; compared against the reference designs' look (041–046) by the
fx-designer, then the user on localhost (visual-only work is exempt from tests, CLAUDE.md).

## Migration / rollout
Replaces 051 step 3 before 051 ships (the CSS-only flip is never built) or, if 051 shipped first,
the flip markup is deleted in slice 2 here. `session.unboxing` is new; a 051 session without it
mounts at `done`. Revert path: revert the commits; sessions keep working (the field is ignored).

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 Pure + sound | create `core/build-battle/unboxing.mjs`, `box-textures.mjs` (asset paths + corner constants, cut with the reference frames open), `__tests__/unboxing.test.mjs`; modify `mat-fx/fx-audio.mjs` (+7 voices), `mat-fx/__tests__/fx-audio*.test.mjs`, `build-battle-session.mjs` (`unboxing` field replaces `openedPacks`) | § Beats, § State machine, § Pure poses, § Sound verbatim | rows 3–5, 7, 11, 17; pose endpoints listed in § Test plan | pokemon.com "foil promo"; TCGdex me02 `variants.holo` | `node --test` on the new tests + `pnpm test:changed` |
| 2 DOM + CSS (fx-designer) | create `sidebox/native-deck-builder-unboxing.js`, `css/deck-builder-unboxing.css`, `client/src/assets/build-battle/box/{front,left}.webp` (cut from `refs/052-box-render.webp`, ≤ 250 KB each), `client/src/assets/build-battle/packs/me02-{charizard,gengar,heracross,lopunny}.webp` (from `refs/052-pack-*.webp`, ≤ 250 KB each); modify `native-deck-builder-build-battle.js` (mount, remove the 051 flip), `index.ejs` (`#bbUnboxing` root), `css/__tests__/fx-kill-switch-css.test.mjs` (+ the new sheet) | § DOM twin structure and ids, § CSS tokens | rows 1, 2, 6, 8–10, 12, 15, 16, 18 | — | lint clean; kill-switch test green |
| 3 Verify | create `.claude/skills/fx-preview/rec/rec-unboxing.mjs`; modify `fx-preview/SKILL.md` (builder-tab section) | recorder opens `/build-and-battle?seed=42&e2e=1`, drives beats via DOM clicks, writes `out/unboxing.webm` + strips | rows 4, 13, 14 by video; strips at the seven beats listed | — | video + strips recorded and reviewed; user check on localhost |

## Deviations (Builder appends here during build)
Slice 1 (2026-09-28):
- `Unboxing` gains `wrapTorn: boolean`: five stages cannot hold three pre-pack beats. `tearWrap`
  sets it inside `sealed`; `openLid` needs it and moves to `opened`; the first `tearPack` moves
  `deckShown` → `packs`.
- `finish` is refused while a torn pack still has face-down cards (row 3 "finish mid-pack"); it
  is legal from every other stage (row 17). Slice 2's "Skip scene" plays `revealAll` on that pack
  first, then `finish`.
- `unboxingTimeline(u, { packIndex?, tiers? })`: the beats need the tier of each card, which the
  state does not carry. A hit starts the next card only after it settles; a `collapse` beat closes
  the last pack.
- Extra pure exports the DOM twin needs: `cardRevealPhases(tier)` (lift/flip/settle split; the
  flip uses a symmetric ease so 90° falls exactly at the flip-window midpoint, which is where the
  test plan's "crosses 90° at 0.5" is checked), `tearReleaseOutcome`, `packSlotKind`
  (reverse vs normal draw from the pack model), `parseUnboxing`, `finishedUnboxing`,
  `tornPackCount`, `homography`, `cubicBezier`.
- Sound table wins over "each ≤ 3 voices": `unbox-hit-2` is 4 notes, `unbox-hit-3` adds the swell.
- `box-textures.mjs` stores each asset's `cropInRender` (render pixels) and the `quad` relative
  to that crop; slice 2 cuts `front.webp` at 212,40 812×1336 and `left.webp` at 0,28 246×1348.
- The 051 flip controller (`native-deck-builder-build-battle.js`) now drives the reducer
  (`tearWrap`…`tearPack`/`revealAll` per opened pack) so the session keeps one progress record
  until slice 2 replaces the flip. A 051 session without `unboxing` parses as `done`.

Slice 2 (2026-09-28):
- `#bbUnboxing` is created by the Box-tab controller inside `#buildBattleBoxPanel`, not in
  `index.ejs`: the panel re-renders between the "Open box" screen and the scene, which would wipe a
  static root. The 051 flip (`revealPacks`, `.bb-pack-card`, "Open all") is deleted.
- Box geometry is fixed at 200 × 290 × 130 px (`BOX_PROPORTIONS`), so the face matrices are computed
  once; phone width scales the host (0.8) instead of recomputing them. The lid is the top face on a
  back-edge hinge group; CSS y points down, so the pose's −112° is applied as `rotateX(+112°)`.
  Inner rim walls and a tray floor fill the opening once the lid is up.
- Tray items are 2D (deck, promo, packs, code card, tip sheet in a wrapping row beside the box); a
  torn pack spills into its own reveal row (torn pack + stack + ten-slot fan), newest packs stay
  until the scene is done. Tearing another pack waits while a reveal is in flight.
- Fan slots are fixed at ten per pack (`fanSlot(k, 10, w)`), so cards never re-spread while
  "Reveal all" has several in flight; a ResizeObserver re-lays the fan on width changes.
- The scene hands over to the Pool tab after the collapse (and after "Skip scene"), with a 240 ms
  fade on the Pool panel. Box-face photos are cached across re-renders so the CSS face never flashes.
- Pack art is vendored at 440 px wide (≈ 80 KB each; the refs are 780 px).

Slice 3 (2026-09-28):
- The recorder runs three passes: real-speed video with PASS/FAIL checks (rows 4, 13, 14, plus the
  foil family of every fanned card against `unboxingHoloRarity`), frozen strips, and a 390 px shot.
  Strips pause only the animations a beat started and seek them; chained phases (promo lift, fan
  collapse) are timed from their own animation's start, since a paused first phase never hands on.
- Seed 42's best card is tier 2 (Ultra Rare), so the tier-3 strip comes from `SEED=18` (tiers
  per pack printed by the recorder); `flip-hit-t<tier>` names the tier shot.
- `CARD_IMG` stands in for TCGdex and the Limitless promo host where they are blocked (the cloud
  sandbox): foil, flare and pacing were checked on a stand-in face, never on real card art.
- Findings for a later slice (not fixed here): the card face is added on a wall-clock timer while
  the flip runs on the animation clock, so under load the node lands up to ~380 ms of flight early
  (hidden by `backface-visibility`, so row 14 holds); at 390 px the builder's deck pane covers the
  Box tab (the builder window has no phone layout); the shrink-wrap reads faintly and `.bb-hint`
  is yellow on white.

Fullscreen rework (2026-09-28, user ask in the project thread):
- The opening plays on a fullscreen stage: `#bbUnboxingStage.bb-stage` is appended to the builder
  workspace (not `document.body`, so the `.db-live` tokens and scene CSS still apply) and
  `.bb-unboxing-active` hides every other workspace child. The box is centred and scaled up
  while sealed; from the first torn pack it steps back beside the tray. Resolves slice 3's
  "deck pane covers the Box tab at 390 px".
- Packs open one after the other: `tearPack` takes only `nextPackToTear(u)` (the first untorn
  pack, and only once no torn pack has face-down cards). The next pack pulses; only the latest
  torn pack keeps a reveal row, and it collapses as the next pack tears. Stored sessions torn
  out of order still parse and resume.
- "Build your deck" shows only at `done`. When the scene ends (collapse or Skip) the stage
  fades out, the header and both panes stagger back in (`.bb-ui-enter`), and the Pool tab opens
  with the box deck already in the deck pane (it was loaded at box open, 051 step 2). A
  finished box boots on the Pool tab and shows its settled scene inline in the Box tab.
- rec-unboxing opens packs in order and checks the stage (UI hidden, pack 2 refused before and
  during pack 1) and the hand-back (stage gone, UI visible, deck 40 / 40, 40 pack cards left).

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] Every slice row is pinned: files, signatures, test cases with expected values, card rulings
      cited (corpus row / TCGdex id) — no banned words; a builder would make zero choices
- [ ] No section reads "TBD"
