# 078: VFX Essential techniques as stackable FX modifiers

Source: github.com/excifroge/VFX-Essential-Shader (MIT, Unity URP HLSL). Nothing ports as code; its idea does:
independent modules (dissolve, UV distortion, a second texture layer, mask, rim) stacked on any base shader, each
off until enabled. Our GPU canvas styles (075 § Styles) are mutually exclusive ids; this adds the stackable layer.

## Contract (landed with this doc)
- `ctx.fxMod = { dissolve?, distort?, detail? }` on the GPU canvas recorder (`board3d/fx/gpu-canvas.mjs` FX_MODS),
  written to paint texels 17–20; shader stages in `gpu-canvas-shader.mjs`. Order: distort → paint → style →
  detail → dissolve. Each module is off while its first param is 0; with no `fxMod` output is unchanged (parity).
  - dissolve `{ amount 0–1, width 0.12, gain 1.5, scale 3, edge [r,g,b] 0–255 }` — noise eats the paint; the hole
    rims burn in `edge` (default: the paint colour) × (1 + gain), so they bloom.
  - distort `{ strength (lane heights) 0, speed 1, scale 3, angle° 0 }` — flowing noise warps where the paint is
    read (gradient t, pattern, card art), never the outline.
  - detail `{ amount 0–1, speed 1, scale 4, angle° −90 }` — scrolling noise multiplied over the result.
- `moves/materials/_mods.js`: `withFxMod(ctx, mod, draw)` (merge over the caller, restore after),
  `mergeFxMods`, `dissolveTail(progress, from = 0.7)`.
- Ownership: a **drawer** (`move-drawers.js`) owns a beat's `dissolve.amount` (exit timing); a **kit**
  (`materials/<type>.js`) owns `distort` and `detail` and may set `dissolve.edge` / `width` / `gain`. Both go
  through `withFxMod`, never assign `ctx.fxMod` directly.
- Canvas2D fallback ignores `fxMod`; a kit must still look right there (the alpha fade stays the fallback).

## Depth (round 2 — user: "Thunderbolt and Psychic look like clip art; make them significantly more 3D")
Root cause: every beat drew on a sheet 0.25–4 px above the cloth (fx-stage LAYER_Z), so the tilted camera saw decals.
Primitives (gpu-canvas.mjs, landed):
- `ctx.fxLift = { z, arc, from: [x,y], to: [x,y], stand 0–1, at: [x,y] }` — heights in lane units, read in the transform
  current when set. `arc` peaks mid-segment (beams/projectiles rise off the attacker, land on the defender); `stand`
  tilts a shape upright about the screen-horizontal line through `at` (faces the camera; above-`at` rises). Lanes run
  near→far, so a sheet stood about the lane axis would be edge-on: lift lane things with `arc`, stand defender-side
  bursts/rings with `stand`. Set it like fxStyle (assign, then null after).
- Cast pass: `begin({ cast })`; scene-move-player replays front + top beats into it each frame (CAST): solid paint →
  soft shadow, additive → light pool in its colour, offset by lift height. Lifted pieces get offset shadows for free.
- `fxMod.volume = { amount, spec 0.6, rim 0.5, light 120°, bump 0.35, bumpScale 4, radius 0.15, ambient 0.35 }` —
  radial = sphere, stroke = tube, axis gradient = tube of `radius` units, else bumped sheet; Lambert + blooming glint +
  Fresnel rim. Owned by kits.
Reference look: Scarlet/Violet ("EV") videos, `.agent/designs/refs/063-move-refs.json` `modern.url` (Poképédia mp4);
frames via `ffmpeg -i <mp4> -vf fps=6 out%02d.png`. Study notes in `refs/063-study/notes/`.

## Work plan (parallel fx-designer agents, disjoint files)
| # | Owner files | Work |
|---|---|---|
| 1 | `moves/move-drawers.js` | Dissolve exits for projectile/beam/burst beats in their tails (in place of or with the alpha fade) |
| 2 | materials: fire, dragon, electric, fighting, steel, normal, stellar | distort (heat haze on flame bodies), detail, edge colours |
| 3 | materials: water, ice, psychic, fairy, ghost, dark, poison | distort (caustic/psychic warp), detail, edge colours |
| 4 | materials: grass, bug, rock, ground, flying | distort (wind/dust), detail, edge colours |
| 5 | board3d card mesh material + KO scene | Card dissolve on KO (burning edge), rim (Fresnel) glow on the charged attacker card |

Not ported: soft particles / intersection edges (impact stage has no depth texture in its programs), camera
distance fade (fixed camera), Shuriken custom vertex streams (our beats drive params from progress instead).

## Deviations (agents append here)
