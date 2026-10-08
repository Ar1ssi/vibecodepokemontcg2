# 066: TCG Live evolution and devolution VFX
Status: approved (user request 2026-10-08: "copy the evolution effects from tcg live") · building
Date: 2026-10-08 · Session: S-066 (worktree `feature/tcgl-evolution-fx`)

## Problem
Regular evolutions play design 041's Scarlet/Violet scene (3.5 s, canvas nebula + card flip).
Devolutions play a 1.15 s ring burst. The user wants the effects TCG Live plays instead,
extracted from the game, like the KO/draw/play scenes (042–044) and the SFX (064).

## Source extract (facts, read this session)
- Game code (decompiled, `E:\TCGLive_Extract\Code\TPCI.RainierClient`):
  - `FXManager.cs:150` maps `EvolutionType.Evolve` → prefab `cards_evolution/card_evolution`,
    `Devolve` → `cards_evolution/card_devolution`.
  - `CardOwnerVFXTriggerer.cs:133-162`: the evolve prefab spawns when the new card's move onto
    the slot ENDS (`MovementVFXTiming.MovementEnded` + `PlacementFlags.Evolve`), parented to the
    card, despawned after 8 s. Cards with a `PlayVFXForEvolution` status effect play a custom
    prefab instead (Tera uses `Card_Evolution_Tera`); we keep our Mega/Tera signature entries.
  - `EvolveOperation.cs`: sound `evolveCard` starts first; opponent evolving from hand first
    reveals the card (`evoOp_revealDuration`, default 1 s); damage/attachments transfer after
    `evoOp_evoFXduration` (default 1 s). Devolve: `CreateDevolveFXOnPreviousCard` spawns the
    devolve prefab on the card that stays in the slot.
  - Evolve sound is already imported: `sfx_rain_evolve_card.wav` → cue `evolve-card` (064).
- Unity bundle `cards_evolution` (+ deps in `_shared`), dumped with UnityPy:
  - `E:\TCGLive_Extract\vfx_dump\evolution\cards_evolution.json` — full hierarchy, every
    ParticleSystem module, renderer, material (textures, colors, floats).
  - `Card_Evolution.spec.md`, `Card_Devolution.spec.md` (+ Tera/Bench/mesh prefabs) — readable spec.
  - `textures/*.png` (47, incl. `_shared` deps), `meshes/*.obj` (16: helix whorls, spiral,
    light beam, hemisphere, flash fan, cylinder, oval ring).
  - Tools: `E:\TCGLive_Extract\tools\dump_vfx.py <cache> <out> cards_evolution`,
    `summarize.py <json> <prefab>`, `timeline.py <json> <prefab>` (run with
    `E:\TCGLive_Extract\tools\venv\Scripts\python.exe -I`).
  - Scale: the card in prefab space ≈ 10 × 13 units (`Square_Pop` size3D 10×13 is the card pop).

### Card_Evolution timeline (s; delay · life · count)
Charge 0–1.0: `intro flash` 0·0.3 card-size dissolve flash · `Square intro dissolve` 0·1.0 card
silhouette dissolving in (diamond swirl) · `Glow soft core` 0·1.26 radial glow, orange → cyan →
white · `Smokes` 0·0.8 wispy cloud · `Wispy rad glow` 0.1·1.15 ×2 · `Evolution Helix` 0.1·0.8–1.0
five prismatic helix whorl meshes + three `starry spiral` trails · `rays rad` 0.2·1.0 ×2 radial
streak discs, rainbow-cycling color · `Rays prismatic set/thin/big softy` 0.2–0.3·0.2–0.6 prismatic
light-beam meshes (rate bursts in the first ~16 % of the system) · `round debris lerp` 0.2·~0.4
14 star sparks converging.
Pop 0.95–1.0: `Square_Pop` 0.95·0.08 card-size white→cyan pop · `RefractionRing` 1.0·0.35
spectrum ring · `shockwave` 1.0·0.25 hemisphere · `sparks disc outro` 1.0·0.3 · `Rays` 1.0·0.5–0.7
light shafts · `Rays_2` 1.0·0.3 flash fan · `sparkles (1)` + `Spectrum_Motes` 1.0·0.4–1.0 ×22 each ·
`Square outro dissolve` 1.0·2.0 card glow dissolving away. Everything is done by ~3.0 s.

### Card_Devolution timeline
`aura mesh intro`/`aura mesh` 0·0.5–0.6 card aura flare · `devolution glow card` 0·0.4 ·
`Smokes` ×3 · `Glow soft core` 0·0.6 · four `starry spiral` oval-ring galaxy beams 0·0.65–0.7 ·
`sparks shoot clusters` 0.05 (15 + 30) · `sparks shoot` 0.2 ×30 · `Square_Pop` 0.35·0.08 ·
`Spectrum_Motes` 0.4 ×32 · `shards` 0.4 ×13 flakes · `outro dissolve` 0.4·0.7 ripple card dissolve.

## Constraints
- D103/D118/D119: WAAPI keyframes from pure pose fns; canvas layers read the WAAPI clock via
  `playCanvasStage` (`mat-fx/canvas-stage.js`) so stepped-clock capture drives every layer.
- Cosmetic only: board already applied; nothing gates input; self-removing `fx-overlay`
  layers + backstop timers; `body.fx-off .fx-overlay` hides it; fx-queue budget 2500 ms.
- Opp board is rotated 180° (`frameTurnOf`); card art layers turn with it.
- Mega/Tera evolutions keep `playSignatureEntry` (D118–D122) unchanged.
- Sound: unchanged — `evolve-scene` and `evolve` cues already map to `evolve-card` (sfx-cues.mjs).
- Never gate on prefers-reduced-motion beyond what the dispatcher already does (user memory).
- This replaces design 041's scene (D153): delete the SV scene code it supersedes, no dead code.

## Design
- Assets: the textures the two prefabs use, copied from the dump into
  `client/src/assets/fx/evolution/` (WebP or PNG, only the ones the build draws). Builder
  records the list and the conversion command in Deviations.
- `mat-fx/evolve-scene.mjs` (pure): TCG Live timeline as data (emitters with delay/life/count,
  size and color-over-life keys from the dump, in card-height units) + pose fns + seeded scene.
- `mat-fx/evolve-scene.js` (DOM): `playEvolveScene({rect, turn, ...})` draws the evolve prefab
  over the evolved card; new `playDevolveScene` (same module or `devolve-scene.*`) for devolve.
- `lifecycle.js`: `evolve` keeps the signature branch, else plays the TCG Live evolve;
  `devolve` plays the TCG Live devolve. Holds in `fx-holds.mjs` sized to the new timelines.
- Builder (fx-designer) owns rendering choices (canvas vs DOM/CSS, mesh approximations of
  helix/beam/hemisphere) and records them in Deviations.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | no rect for card | effect returns 0, nothing drawn | [ ] |
| 2 | texture fails to load | that layer skips; scene still completes and removes itself | [ ] |
| 3 | t outside [0,1] / NaN | poses clamp | [ ] |
| 4 | two evolutions in one batch | each plays on its own card; paced by hold | [ ] |
| 5 | opp-side card | layers turned 180° with the frame | [ ] |
| 6 | Mega/Tera evolution | signature entry unchanged | [ ] |
| 7 | fx off mid-scene | `body.fx-off .fx-overlay` hides every layer | [ ] |
| 8 | no WAAPI / no 2D context | end frame applied; host removed by backstop | [ ] |

## Test plan
Unit tests for the pure timeline/pose module (ranges, ordering, determinism, clamp) and holds.
Visual: stepped-clock capture (`.agent/scratch/evolve/capture-evolve.mjs` method), self + opp +
bench, contact sheet + video; the user checks on localhost.

## Migration / rollout
n/a: client cosmetic only; revert = revert the commit (041 scene returns with it).

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | evolve: assets, pure timeline module, DOM driver, wiring, holds, tests | unit tests + lint green; capture frames show charge → pop → outro |
| 2 | devolve: same for Card_Devolution | same |

## Deviations (Builder appends here during build)
