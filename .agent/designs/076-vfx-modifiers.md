# 076: VFX Essential techniques as stackable FX modifiers

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
