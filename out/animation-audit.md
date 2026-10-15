# Board animation audit (read-only)

Scope: board animations (mat FX, playmat iframe motion, board CSS/canvas effects) and the board actions that drive them.
Not audited in depth: deck builder (unboxing, coin picker, ETB, set browser, pc-box CSS keyframes). Out of scope for this list.

Method: (1) read the effect registry `client/src/setup/netcode/mat-fx/index.js` and `EVENT_FX` / `SOUND_ONLY_FX` in `client/src/setup/netcode/advisory-animations.mjs`; (2) ran `advisoryAnimationPlan` on each board-relevant event type (probe: a throwaway Node script that imports `advisoryAnimationPlan`, not committed); (3) read the emitters in `shared/engine/` for the events that were unclear; (4) checked each module's header and asset references for TCG Live sourcing; (5) checked design docs for how each scene was sourced.

Limit: the TCG Live extract (`E:\TCGLive_Extract`) is not in this container, so "replaced" below means "the code loads TCG Live assets or cites an extracted prefab", not "checked against the full prefab list". I did not run the app, so no visual check.

---

## 1. Already replaced by TCG Live (sourced from extract/prefabs)

| Board moment | Code | Source |
|---|---|---|
| Evolution | `mat-fx/evolve-scene.mjs`, `tcgl-fx.mjs`, `tcgl-canvas.js` | Card_Evolution prefab (design 066) |
| Devolution | `mat-fx/devolve-scene.mjs` | Card_Devolution prefab (066) |
| Attack hit impact (type prefabs) | `mat-fx/impact/*`, called from `combat.js:261-300` (`playImpactPrefab`) | attack-impact prefabs (068); falls back to hand-built `strikeTarget` when no prefab |
| Status apply pop / clear sparkle / held-condition loop | `mat-fx/status.js`, `status-fx.mjs`, `status-loop.mjs` (`status-fx-life-${k}` built at `status-loop.mjs:103`) | Status_Apply prefab + converted textures (design 064 / status-fx import) |
| Battle SFX | `mat-fx/sfx-cues.mjs`, `sample-bank.js` | extracted samples (064) |
| Damage counters, Poison/Burn badges, coin | `css/damage-counter.css`, `css/status-marker.css` | TCG Live PNG/WebP assets |
| Attack-list UI sprites | `scripts/attack-ui`, `assets/attack-ui` | TCG Live AttackOverlay sprites |
| Active card focus popup | `rules/card-focus*.mjs` (design 067) | TCG Live popup layout and camera pose |

Modelled on TCG Live but with no extract/asset reference in the code (per design docs, 042–044 were extracted; I could not confirm the numbers here):
- KO scene `mat-fx/ko-scene.mjs` (042), wrapped by `image-logic/knockout-flight.js`
- Discard flight `mat-fx/card-flight.mjs` (042)
- Draw `mat-fx/draw-scene.mjs` (044), batched by `image-logic/draw-flight.js`
- Opponent Trainer preview `mat-fx/opp-play.mjs` (043), reused by deck reveal (059) and prize fan `prize-fan.mjs` (045)

## 2. Not replaced: hand-built (no TCG Live asset or prefab)

| Board moment | Code | Notes |
|---|---|---|
| Plain Pokémon entering play | `mat-fx/entry.js:322-333` (`enter`) | Returns with no effect unless the card is a Mega/Tera signature. Only the DOM slide from `playmat-anim.mjs` runs. |
| Mega entry | `entry.js`, `mega-orb.mjs`, `mega-vortex.mjs` (027/034–036) | Hand-built canvas and 3D. |
| Tera entry and skin | `entry.js`, `tera-crystal.mjs`, `tera-skin.mjs/.js` (037) | Hand-built crystal. |
| Your own Trainer play and Stadium play | `mat-fx/lifecycle.js:218-237` → `presentCard` (design 022 `fx-card-present`) | Opponent gets the TCG Live preview (043); your own side still gets the older hand-built zoom. **Inconsistent.** |
| Energy attach snap | `lifecycle.js` `attach` (022) | Energy only. Tool attach is silent by design (see §3). |
| Retreat / switch slide, promote | `lifecycle.js` (022) | Hand-built. |
| Turn banner, ability tag, attack-name banner, game-over confetti | `mat-fx/banner.js`, `flow.js` (022, 024, 026) | No TCG Live asset. |
| Prize claim burst | `mat-fx/prize.js` (024) | Halo + sparks, hand-built. |
| Attack lunge / generic attack | `combat.js` `playLunge` (fallback path, `combat.js:428-480`) | Used whenever no move spec or signature plays. |
| Move specs (per-type attack scenes) | `mat-fx/moves/*` (063), `signature/*` (065), `canvas-stage.js` | Procedural from a user table (`move-table.mjs`). No TCG asset in `move-player.js`. |
| Damage number, flash, slash, sparks | `combat.js` `strikeTarget`, `damage-hit.mjs` | Fallback when no impact prefab. |
| Card select/deselect motion | `image-logic/card-pop.mjs` | "1:1 port of poke-151" (third-party Svelte site). Not TCG Live. Still used by `card-focus.mjs`, `draw-flight.js`, `full-view.js`, `close-popups.js`, `prize-take-prompt.js`. |
| Deck shuffle ghost | `image-logic/shuffle-flight.js` (design 009) | Old ghost overlay, no TCG counterpart. Still runs for `zoneShuffled` / `zoneShuffledIntoDeck`. |
| Coin flip ceremony | `setup/rules/coin-flip-ceremony.js` | No extract or asset reference found. Unverified. |
| Generic card motion in every playmat iframe | `setup/playmat-anim.mjs` (injected by `client/index.ejs:1148-1160`) | "TCG Live style" slide/fade via MutationObserver, hand-written. Applies to any card image entering hand/active/bench/board/stadium/prizes/discard/lostZone. Overlaps the draw and discard flights. Overlap unverified. |

## 3. Board actions with NO animation

Verified with the probe and emitter reads. "Sound-only" means the dispatcher plays a sound and no visual.

| Board action | Event | Result |
|---|---|---|
| Tool attach | `cardMoved` → board (tool) | None (silent by design, design 022/024 item 7). Sound only. |
| Manual Special Condition set/clear | `specialConditionUpdated` (`reduce.mjs:9280-9310`, `3327-3334`) | No pop. The persistent loop reconciles, so the condition appears without its one-shot effect. |
| Switch-type swaps (Ninja Trick, Switch-type trainers, switch-forcing attacks) | `cardSwitched` (`reduce.mjs:1224`, `attack-steps.mjs:258`, `executor.mjs:1308/1401/1505`, `trainer-steps.mjs:2441/3494/4475`) | No slide. Only retreat (`cardRetreated`) and some `pokemonSwapped` get one. |
| Cards to Lost Zone | `cardsLostZoned` / `cardMoved` to `lostZone` | No mat FX. `playmat-anim` gives a generic discard-style class in the iframe. Partial. |
| Put back on top of deck / move to deck | `cardsMovedToDeck`, `cardsPutInDeck`, `cardMoved` to deck | None. |
| Shuffle a zone into deck (bottom etc.) | `zoneMovedToDeckBottom` | None. (`zoneShuffledIntoDeck` does shuffle.) |
| Reveal outside deck→hand | `cardsRevealed` (no run), `zoneRevealed`, `prizesRevealed`, `cardHidden` | None. Design 059 covers deck→hand only. |
| Prize set / reset / redraw / shuffle to deck bottom | `prizesSet` (sound-only), `prizesReset`, `prizesRedrawn`, `prizesShuffledToDeckBottom` | None visually. |
| Damage prevented (shields, abilities, Special Energy) | `damagePrevented` (`reduce.mjs:427-522`) | None. Not in `EVENT_FX`. |
| Attack fizzles / prevented / lock | `attackConditionFailed`, `attackPrevented`, `attackConfusedFizzle`, `attackLockApplied` | None. |
| Attack marker added | `attackMarkerAdded` | Sound only. |
| Play lock, retreat blocked | `playLockApplied`, `retreatBlocked` | Sound only. |
| Deferred knockout | `deferredKnockOut` | Sound only. |
| GX attack used, VSTAR Power used | `gxAttackUsed`, `vstarUsed` | **Sound only (crowd cheer), no visual.** |
| Deck search shuffle (not a deal) | `deckShuffled` | Sound only. |
| Rotate card, change type, card stats, change card back / playmat | `cardRotated`, `typeChanged`, `cardStatsApplied`, `changeCardBack`, `changePlaymat` | No FX plan. Any visual is CSS-only and not checked. |
| Plain Pokémon enter (non-signature) | `cardMoved` → bench/active | No mat FX. DOM slide only. |
| Turn end | `turnEnds` | None (the turn-start banner covers the change). |
| Peek / look at cards | `cardsLookedAt`, `viewDeck`, `lookShortcut` | None. Probably intended (private). |

Not gaps (checked): damage counters manual add/remove/update emit `damageUpdated`, which plays `damage`. Attack coin flips use `coinFlipped` / `attackCoinFlipped` and need a face to play the ceremony. The probe passed no face, so this is not verified as a gap.

## 4. Old or outdated

1. `client/src/css/index.css.bak` is tracked in git. Delete it (ISSUES I72 says the same).
2. `image-logic/card-pop.mjs` is the poke-151 port. It is not TCG Live and is still wired into five callers. Candidate for replacement.
3. `image-logic/shuffle-flight.js` is the design 009 ghost. No TCG Live counterpart. Candidate for replacement.
4. `image-logic/knockout-flight.js` header still describes the design 009 ghost. It now wraps `ko-scene.js` (042). Stale header only.
5. `setup/playmat-anim.mjs` is hand-written and overlaps the newer draw and discard flights. Candidate to retire or narrow to zones with no mat FX (deck→hand general moves, lost zone).
6. Your own Trainer and Stadium play (`lifecycle.js` `presentCard`, design 022) is older than the opponent's TCG Live preview (043). Candidate to upgrade to the 043 scene.
7. Mega/Tera entries (027/034–037) are hand-built. If the extract has Mega or Tera prefabs, these are the biggest port candidates. Not checked (extract not present).
8. `status-fx-life-N` keyframes are NOT dead. They are built from `status-loop.mjs:103`. My first keyframe scan flagged them because of a grep truncated by `head -8`.

## 5. Not checked

- Deck builder CSS (unboxing 22 keyframes, deck-builder-live 18, self/opp-containers 21/16, index.css 65). Only board-relevant parts were read.
- Fidelity of the TCG-modelled scenes (042–044, 045, 059) against the extract.
- Whether `playmat-anim` and the draw/discard flights double-animate the same card.
- Whether the rotate and type-change CSS has transitions.
- Visual confirmation of all of the above (app not run).
