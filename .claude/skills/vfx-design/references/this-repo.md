# This repository — where the general skill lands in the code

The general skill (SKILL.md and the other references) is engine-neutral. This file maps it onto the
Pokémon TCG simulator: the pipeline an attack effect runs through, where each constant lives, how
to render the seven frames, and the house rules and past corrections that are binding here. Read
it once per task; the agent `fx-designer` loads this skill and `fx-preview`.

## Pipeline (an attack, from spec to pixels)

```
specs/<type>.mjs  (beats: at/until/layer/drawer/params; attacker/defender motion; contactMs)
   → scene-move-player.js  (scene clock; card motion poses → mesh drives; FX frames; CAST pass)
      → move-drawers.js  (DRAWERS: projectile, beam, burst, splash, pillar, slashArc, cloud, spiral,
                          volley, aura, rain, shards, bolt, ring, glyph, fan, shade, chain, grip,
                          impactFlash, starFlare, coreCharge, orbitCharge, shockRings, speedRays,
                          vignette, smoke, terrain …; each wrapped: lifted(), burning(), elementable())
         → materials/<type>.js   canvas kit: palette, body/tongue/projectile/glow/sigil (Canvas2D + GPU canvas styles, 078 fxMod/volume)
         → elements/<type>.js    element kit (079): overrides kit methods / whole beats while `ctx.fxElements.live`
            → emit(ctx, kind, params)  → board3d/fx/elements/<kind>.js  (instanced GLSL kinds)
   → board3d/fx/fx-layer.js  (HalfFloat target · occluder depth prepass of the cards · kinds + GPU canvas
                              · impacts (068 TCG Live prefabs) · UnrealBloomPass BLOOM · composite over the board)
```

- **Canvas2D fallback and node tests** draw the canvas kit only; every element path is optional
  (`elementsLive(ctx)` false → base kit). A kit's look must still hold there.
- **Impacts at contact** are TCG Live's own prefabs (design 068, `impact/`); the move's own
  `impactFlash` beats are dropped in-game (`withoutImpactBeats`). Design against that: the
  contact frame already has the game's flash; yours is the element's matter leaving the point.
- **Scene clock**: WAAPI animation on the canvas; poses are pure functions of ms (card-motion.mjs,
  move-poses.mjs) and are unit-tested under `node --test`. GL lives in `.js`, maths in `.mjs`.

## Where the constants live

| What | Where |
|---|---|
| Per-type palette (deep/body/hot/core/white), smoke, shade, particle class | `moves/materials/<type>.js` `PALETTE` |
| Element sizes relative to the canvas kit (`*_SCALE`), textures per kit | `moves/elements/<type>.js` |
| Shared element beats (impact flash, slash, aura) and their textures | `moves/elements/_shared-beats.js` |
| Kit routing by material key, palette borrowing (dragon → fire, poison → water + gas…) | `moves/elements/index.js` `ELEMENT_KITS` |
| Bloom | `board3d/fx/fx-layer.js` `BLOOM = { strength 0.2, radius 0.3, threshold 2.4 }` — only HDR > 2.4 blooms; the story behind it is in techniques § HDR |
| Heights and stand angles (lane units; camera looks almost straight down so nothing stands past 0.5) | `moves/beat-lift.mjs` `LIFT` — read its header before changing a stand |
| Shared GLSL: noise/fbm, billboard + lean, dissolve, fire ramp, board refraction, blend settings | `board3d/fx/elements/element-glsl.mjs` |
| Kind capacities | sprite 512 · bolt 1024 · debris 256 · waterDrop 256 · waterBeam 128 · flameJet 128 · smoke 128 · fireball 64 · plasma 64 · lens 32 |
| Sprite params | `texture, at{x,y,z}, size, aspect, rotation°, colour rgb 0–1 (HDR ok), alpha, frame, blend 'add'/'over', channel 'r'/'a'/'rgba', alignDeg, dissolve` (`sprite.mjs normalizeSprite`) |
| Card motion presets | `moves/card-motion.mjs` attacker: brace, lunge, dash, rear-lurch, warp, rise, stomp, spin, none · defender: knock, stagger, float, sink, freeze |
| Combat timing (lunge, hit flash, shake, recoil, damage pop) | `mat-fx/combat-pose.mjs` |
| FX queue budget (2500 ms) and holds | `fx-queue.mjs`, `fx-holds.mjs` |
| Sound: attack scene → sample fields; cues; procedural fallback | `moves/attack-sound.mjs`, `sfx-cues.mjs` + `sample-bank.js`, `fx-audio` |
| TCG Live attack textures (135 files) | `client/src/assets/fx/attack/textures/` — masks mostly in R; `TEX_VFX_Dot_Glow` is a *hard-edged* disc, use `TEX_VFX_Gradient_Radial(_Small)` for glows; flipbooks carry `_AxB` in the name |

Textures worth knowing by element: water `T_VFX_Water_Beam` (caustic mask), `T_VFX_Caustic_Noodly`,
`T_VFX_Water_Drop_Blurred` (a vertical streak-drop: bright head, dim tail — align it along its
flight or it reads as a grey dot), `T_VFX_Water_Splash_2x2` (sparse splatter dots only),
`TEX_VFX_Splash_Water_1x4` (the splash **crown** flipbook: chunky splash → scattered drops),
`T_VFX_Attack_Water_Bubbles`, `T_VFX _water_drop_hit_3x3` (sic, with the space); fire
`TEX_VFX_Fire_Flame_Pointy`, `TEX_VFX_Flame_2x2`, `TEX_VFX_M_Flame_Trail`, `T_VFX_Fire_Scorch_1x2`;
electric `FX_T_Lightning_*`, `T_VFX_Lighting_Bolt_1x2`, `TEX_VFX_ElectricCrack_SubUV_2x4`; impact
`TEX_VFX_Impact_Flash`, `TEX_VFX_Impact_Ring`, `TEX_VFX_ImpactSpikes_White/Black`; smoke/clouds
`TEX_VFX_RenderClouds*`, `TEX_VFX_Cloud_Round*`; shards `TEX_VFX_Diamond_Shard`, `TEX_VFX_Flake_Sharp`;
leaves `T_VFX_Leaves_2x2`; fairy `T_VFX_Fairy_Petal_Soft_2x2`, `T_VFX_Fairy_LightRay_Fade`; dark
`T_VFX_Dark_*`; dragon `T_VFX_Dragon_*`; fighting `T_VFX_Fighting_*`; slashes `TEX_VFX_Swipe_2x2`,
`TEX_VFX_M_Line_Set_1x4`. Look at a texture before trusting its name.

## Rendering the seven frames here

Worktree server first (the primary's :4000 may run other code):
```bash
PORT=4100 pnpm start          # prints "e2e bridge: ARMED" and "server-authoritative"
```
- **The seven frames, frozen clock** (the way to judge a beat here):
  `MOVE=hydro-pump CARD_IMG=client/src/assets/custom-sets/customhb/009/high.webp CHROMIUM=/opt/pw-browsers/chromium node .claude/skills/fx-preview/rec/seven-frames.mjs`
  → `.agent/scratch/vfx-frames/<move>/{1-rest…7-settle}.png` + `meta.json` (beat ms, crop, errors).
  `SIDE=opp` renders the far seat, `IMPACT=1` adds the TCG Live impact at contact (slow),
  `SIGNATURE=<id>` for signature specs, `SEED`. Then
  `.claude/skills/fx-preview/rec/seven-sheet.sh .agent/scratch/vfx-frames/<move> ours <reference-row.png>`
  → `compare.png` (reference above, ours below). SwiftShader draws about one frame a second, so a
  real-time recording (`rec-move`) of a 1.6 s scene holds two states; never score from it.
- **Reference row**: fetch the Scarlet/Violet clip (PokéAPI French name → Poképédia
  `<Nom>_EV.mp4`, hashed path; `parity/fetch-sv.mjs` does every move, or copy its ten lines for
  one), `ffprobe` its fps, `ffmpeg -ss <s> -i clip.mp4 -frames:v 1` at the seven beats, label with
  `drawtext`, `tile=7x1`. Sample palette hexes from the effect itself in those frames.
- **One move, real scene, video** (pacing and sound only): `MOVE=<id> CHROMIUM=… node .claude/skills/fx-preview/rec/rec-move.mjs`
  → `.agent/scratch/moves/<move>/<move>.webm` + `rects.json` (`moveAt` = video ms of the scene
  start). Prints frame-time median/p95/max (SwiftShader numbers).
- **Side-by-side with Scarlet/Violet**: `.claude/skills/fx-preview/parity/` — `fetch-sv.mjs`
  (PokéAPI French name → Poképédia `<Nom>_EV.mp4`), `render-ours.mjs`, `batch.sh <name> <ids…>`
  stacks reference over ours into `review/<name>.png`. Outputs under `.agent/scratch/075/parity/`.
- **Every element shader compiles and draws**: `pnpm fx:check-elements [kind…]` (SwiftShader; GL
  errors attributed per step). Run after any `board3d/fx/elements/*.js` change.
- **Impact prefabs and the lab**: `rec/rec-attack-impact.mjs`, `rec/rec-attack-hit.mjs`,
  `/src/dev/attack-fx-lab.html` (time slider).
- Both seats: the opponent's board is turned 180°; `SIDE=opp` renders it. Judge the far seat too.
- Frozen frames: `window.__fxBoard.pauseAll()` / `stepTo(ms)` freeze WAAPI; the 3D scene clock is a
  WAAPI animation on the canvas, so it freezes with them. `rec-move` records at real speed instead;
  cut the frames from the video by time.

Tests: `node --test client/src/setup/netcode/mat-fx/` for poses and kits (materials.test.mjs pins
palettes and drawer behaviour: a palette change may need its expectation moved, with the reason in
the commit), `pnpm test:changed` before commit. Visual-only changes need no new test; pose maths does.

## House rules — binding, each a past correction

1. **One palette, start to payoff.** No whiteouts, no board-wide white blooms, no spinning
   sunburst / god-ray fans, no mid-effect backdrop or colour change. Flares stay local to the card.
   The user cut the KO mat burst and the evolve caption, flash and ribbons as "cartoonish".
2. **One clock (D103/D118).** WAAPI keyframes from pure pose functions; canvas layers redraw from
   the animation's `currentTime`; never a free-running rAF.
3. **Cosmetic only.** State is applied before the effect; nothing gates input; overlays remove
   themselves with a backstop; `body.fx-off .fx-overlay` hides them; the queue budget is 2500 ms,
   longer scenes declare a hold.
4. **Sound before sight (design 024).** Every effect with a hold has a voice; the dispatcher sounds
   first. Attack hits use the sampled bank (064) by tier/contact/type.
5. **Both seats.** The opponent's iframe/board is turned 180°; art turns with it; mat CSS lives
   twice (`self-containers.css`, `opp-containers.css`) and stays mirrored.
6. **3D and layering.** Opacity on the host, never on a `preserve-3d` card; a 3D wrapper cannot
   clip; `body.mat-active` resets zone plates with `!important`.
7. **Colour from data.** `fx-colors.mjs` (`fxRgbForCard`, `brighten`, `rgbCss`), `teraPaletteFor`;
   shared CSS values in custom properties.
8. **Motion settings.** `motionReduced()` reads only `localStorage['ptcg-reduce-motion']` (D105);
   reduced motion holds still; elements still draw (they carry the attack's information); bloom may drop.
9. **Hidden info.** Face-down and redacted cards animate as sleeves until the server reveals.
10. **Sequence, never stack.** Board animations go through the FX queue one after another; a
    scene's plan returns a hold that lasts until it ends.

## Past corrections — the user's verdicts, verbatim or near

- "look like clip art" (Thunderbolt, Psychic, most of the vector kits, 2026-10-25): cause was
  every beat drawn 0.25–4 px above the cloth as a gradient-filled path. Fix was lift/stand/cast
  (078) and then real GLSL kinds with TCG Live textures (079). Still open at the last check: water
  spray reads icy · psychic rings large · Pin Missile needles small · impact centres can blow out ·
  leaf orientation unconfirmed.
- "remove the colored explosion thing" — the KO mat-wide burst; gold stars stayed.
- Evolve: whiteout, sky-blue reveal and turning god rays rejected as off-style; caption, flash and
  ribbons cut; palette light blue/cyan, no purple; spread halved; flip through the hand-over.
- Charge rings on the floor around the **attacker** read as clip art → dropped everywhere; floor
  rings only under the defender on quake moves. Lattice grids (Ice Burn, Nihil Light) → dropped.
- The light heat sheen on the struck card showed as a white slab on light materials → toned
  globally; keep its core tinted and ≤ 0.35.
- "White blob at contact" on many moves (aqua-jet, air-cutter, aura-sphere…) → tone the attacker /
  contact white; the game's own impact prefab supplies the flash.
- Bloom at threshold 1.0 / strength 0.9 bloomed every additive overlap white → 2.4 / 0.2.
- Steel's beam motes drawn as polished metal balls read black → light spheres (steel *energy* is
  light; metal only for solid props).
- `TEX_VFX_Dot_Glow` is a hard-edged disc, not a glow → `TEX_VFX_Gradient_Radial`.
- A flat billboard cut the cards and cloth with a hard line → lean toward the camera by half its size.
- Fire jets stacked white at their hub → roots fade; the fire ramp's HDR boost covers only t > 0.94.
- Hydro Pump / Scald / Surf / Water Gun as chains of stacked rings (pulse-train) → one solid
  (widening) beam that churns.
- Dragon palette shifted to violet; electric halo to the move's gold (it bloomed white-cyan in the
  pale-blue edge colour).
- Scarlet/Violet parity pass (075-parity-ledger.md): ~270 verdicts, one line each; grep a move's id
  before touching it.

## Rubric adaptation for this board

- Subject height = **card height** (`lane.h` = 1). The camera looks almost straight down (12° tilt,
  35.6° fov; the `tcgl` preset is 0°/20°): foreshortening is severe, so "stood upright" means
  0.4–0.5, never 1.0 (see `beat-lift.mjs` header). Scale verdicts are judged on this camera.
- The contact frame carries the TCG Live impact prefab plus your element matter; score the two
  together — your matter leaves the point, the prefab flashes.
- Frame 7 must equal frame 1: no residue on the mesh (drives released), no overlay left, the
  struck card's heat/cold veil gone.
- Far seat is a real frame, not a mirror of the near one: `SIDE=opp`.
- A kind that uses the board copy (water, lens) is checked with the copy present *and* with
  `uHasBoard` 0 (the tint fallback).

## Report additions for this repo

Besides the skill's report template: the `rec-move` output paths and `rects.json` `moveAt`, the
`pnpm fx:check-elements` result if a kind changed, `node --test` summary lines for touched kits,
and the exact `MOVE=` ids and seats the user should play on localhost. Never edit `.agent/`
harness files from this skill; put lasting findings in the commit message or the design doc.
