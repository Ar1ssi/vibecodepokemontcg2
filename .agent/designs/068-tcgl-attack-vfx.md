# 068: TCG Live attack impact VFX — WebGL particle player
Status: draft
Date: 2026-10-12 · Session: S-068 (worktree `feature/tcgl-attack-vfx`, one-shot)

## Problem
The user's request, verbatim (2026-10-12):

> The attack animations look very low quality, the shaders seem incredibly flat and like clip art. Im
> wondering how we can make them seem more like the actual pokemon games. Would a dump of pokemon
> scarlet help?

Then, after the TCG Live `attack_*` bundles were dumped and three options were laid out:

> Go one shot 1 implemenation.

Option 1 as it was offered, verbatim:

> 1. **WebGL particle player (recommended).** Data-driven player for Unity ParticleSystem modules plus
>    ~5 GLSL shader families. Reads dumped specs, so all 66 prefabs come from one engine. Replaces
>    current impact beats; current charge and travel beats stay. Reuses Unity curve maths from
>    `tcgl-fx.mjs` (D207). Large: multi-session, `feature.md` route, design first.

Context the option rests on (same message): 11 types × `Small/Medium/Large`, plus `_C` variants for
Bench targets = 66 prefabs; size rule from `FXManager.cs:1391` (damage > 150 Large, ≥ 50 Medium, else
Small); shaders are compiled, so GLSL is rewritten from the material parameters.

## Acceptance
| # | Criterion (the brief's words) | Evidence |
|---|---|---|
| A1 | "Data-driven player for Unity ParticleSystem modules" | |
| A2 | "plus ~5 GLSL shader families" | |
| A3 | "Reads dumped specs, so all 66 prefabs come from one engine" | |
| A4 | "Replaces current impact beats" | |
| A5 | "current charge and travel beats stay" | |
| A6 | "Reuses Unity curve maths from `tcgl-fx.mjs` (D207)" | |
| A7 | Size rule: "damage > 150 Large, ≥ 50 Medium, else Small"; "`_C` variants for Bench targets" | |
| A8 | "make them seem more like the actual pokemon games" (not "flat", not "clip art") | user check on localhost — FX work is not self-graded |

## Assumptions
(filled during recon and design; every gap decided without asking is a row here)
