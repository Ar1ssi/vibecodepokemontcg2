# 010: Holofoil realism — fixed light, ink-protected foil, TCG Live-style gold
Status: approved (user) — scope + both taste calls answered in chat S136
Date: 2026-09-15 · Session: S136

## Problem
Holo cards read "cheap/fake" next to TCG Live (user clips: gold Water Energy PAL 279, Mega
Darkrai ex 120/084). Causes found in S136 analysis: the cursor acts as a light source (radial
blob follows it); on board/hand the only motion is a horizontal glare sweep; an unmasked white
`glare2` overlay blows out hyper/SIR cards; foil covers text; glitter parallax is dead
(`--card-scale` undefined); hyper glare is a multiply vignette; rainbow is candy stripes.

## Constraints
- User: pointer must NOT act as a light source. Board/hand: slow subtle 2-axis drift. Previews and
  picker: mouse still tilts the card; the light stays fixed, so foil changes only with card angle.
- Keep simey's DOM + CSS var names (`--pointer-*`, `--background-*`, `--rotate-*`) so the nine
  variant CSS files keep working; `--pointer-*` now means "light position", not cursor.
- D31 (spring physics 1:1 with simey) is superseded for lighting only; rotation springs unchanged.
- S123: board cards never tilt visibly (`tilt:false`).
- A mask image that fails to load (CORS) renders as transparent black and hides the layer — so the
  ink mask may only use hosts verified to send CORS headers.
- No new dependency.

## Current state
- `client/src/setup/deck-builder/core/holo.mjs` — rarity→effect map, `buildHoloCard`, springs,
  `startHoloAnimation` (interactive: cursor → glare/background/rotate; auto: cosine sweep x, y=50).
- `client/src/setup/deck-constructor/hydrate-holo.js` — wraps mat/hand cards, starts `auto`.
- Callers of interactive mode: `full-view.js:43,138`, `card-picker.js:239,1331`; auto:
  `close-popups.js:122`, `hydrate-holo.js:113`.
- `client/src/css/holo/base.css` — shared layers; `--foil:none; --mask:none`.
- `hyper-rare.css` and `ex-special-illustration-rare.css` — identical gold/SIR treatment.
- `ex-full-art.css` (ultra rare) — overrides `--mask:none` on the shine element.
- Verified 2026-09-15: assets.tcgdex.net + images.pokemontcg.io send `ACAO: *`; Limitless
  DigitalOcean (both hosts) echo the request origin; ptcgsim.online sends `*`.

## Options
1. Light source. A: fixed virtual light, highlight position derived from card angle (pick —
   matches TCG Live and the user's rule). B: keep cursor-follow with less gain (still a cursor light).
2. Board idle. A: 2-axis Lissajous drift, ~9 s / 13 s, small amplitude (pick — user choice).
   B: static.
3. Text protection. A: luminance mask from the card image itself (pick — works on every layout,
   CORS verified). B: per-layout `--clip` polygons (old-layout only; modern full arts put text on art).
4. Unknown image host. A: skip mask, keep foil unmasked (pick — never hides the foil). B: mask anyway.
5. Drift sync. A: all board cards share one light phase (pick — one table, one light). B: random phase.

## Design
holo.mjs
- `MAX_ROTATE_X = 50/3.5`, `MAX_ROTATE_Y = 25` (simey interact range).
- `LIGHT = { originX: 38, originY: 28, gainX: 30, gainY: 30, panX: 13, panY: 17 }`.
- `computeLightVars({ tiltX, tiltY })` pure; inputs normalized to [-1,1] (non-finite → 0, clamped).
  Returns `{ pointerX, pointerY, backgroundX, backgroundY, fromCenter, fromLeft, fromTop, tiltAmount }`:
  pointerX = clamp(originX − tiltX·gainX), pointerY = clamp(originY + tiltY·gainY),
  backgroundX = 50 − tiltX·panX, backgroundY = 50 + tiltY·panY,
  fromCenter = computePointerFromCenter(pointerX, pointerY), fromLeft/Top = pointer/100,
  tiltAmount = clamp(hypot(tiltX, tiltY)/√2, 0, 1).
- `DRIFT = { amplitude: 0.35, periodXMs: 9000, periodYMs: 13000 }`; `driftTilt(nowMs)` pure →
  `{ tiltX: A·sin(2πt/Px), tiltY: A·sin(2πt/Py + 1.3) }`. `prefers-reduced-motion` → amplitude 0.
- `startHoloAnimation(card, { auto, phaseOffset, tilt })` keeps its signature.
  Interactive: pointer → rotate spring only (when `tilt`); light tilt = rotate spring current ÷ MAX.
  Auto: light tilt = drift; visible rotation = tilt ? drift·MAX : 0.
  `--tilt-amount` = visible tilt only (0 on board). Glare spring + `--card-opacity` writes removed
  (layers are always lit — fixed light). `adjust` removed (no longer used).
- `foilMaskUrl(src, pageOrigin)` pure → src or null: allowed for same-origin, `data:`, `blob:`, and
  the verified hosts; null for empty/unparseable, unknown hosts, or src containing `"` `\` or
  whitespace/control characters (unsafe inside `url("")`).
- `buildHoloCard` sets `--card-ink-mask: url("<src>")` + `data-ink-mask` when `foilMaskUrl` allows.

base.css
- `.card { --card-ink-mask: linear-gradient(#fff,#fff); --mask: var(--card-ink-mask); --card-scale: 1 }`.
  (White gradient = fully visible, so layers stay intact when no ink mask exists.)
- `.card__shine, .card__glitter, .card__glare` get `mask-image: var(--card-ink-mask)`,
  `mask-mode: luminance; mask-size: cover; mask-position: center; mask-repeat: no-repeat`.
- Default sparkle for every rarity without its own glitter: two iri texture layers sized in % of the
  card, shifting opposite ways with the light, cross-fading via `--pointer-from-left`, color-dodge.
- `.card__translater` darkens with `--tilt-amount` (brightness 1 → 0.85) — angle shading.

hyper-rare.css + ex-special-illustration-rare.css (same rewrite)
- Shine: one element, two background layers blended soft-light: a broad diagonal sheen band and a
  low-frequency rainbow region with neutral 50% gray elsewhere; both pan with `--background-*`.
  Element `mix-blend-mode: soft-light`, no filter chain. `:before/:after` removed.
- Glitter: `--shift` in % (no `--card-scale` dependency), % tile size, color-dodge (not plus-lighter).
- Glare: soft white highlight at the light position, soft-light blend (no multiply vignette).
- `glare2` rule deleted (stays `display:none` from base).

ex-full-art.css: ultra-rare shine `mask-image` uses `var(--card-ink-mask)` (it overrides `--mask`).

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | empty/undefined image src | no ink mask, foil unmasked | [x] covered: foilMaskUrl rejects empty and non-string |
| 2 | src with quote/backslash/whitespace | no ink mask (no CSS injection) | [x] covered: foilMaskUrl rejects characters unsafe inside url() |
| 3 | unknown host | no ink mask | [x] covered: foilMaskUrl rejects hosts without verified CORS |
| 4 | tilt beyond ±1 / NaN | clamped / treated as 0 | [x] covered: computeLightVars clamps out-of-range and non-finite tilt |
| 5 | pointer moves, tilt:false | light never moves | [x] covered: interactive pointer movement never moves the light when tilt is off |
| 6 | pointer moves, tilt on | light = f(rotation), not cursor | [x] covered: interactive light follows card rotation, not cursor position |
| 7 | auto mode over time | light moves on both axes, no visible rotation | [x] covered: auto drift moves the light on both axes without rotating the card |
| 8 | prefers-reduced-motion | drift frozen at origin | [x] covered: reduced motion freezes the board drift |
| 9 | restart same card (close-popups) | old loop stopped, new one runs | existing stop-before-start path; [x] covered: restarting replaces the previous loop |
| 10 | image fails to load | mask renders transparent → layers hidden | accepted: card image itself is broken too; nothing to shine on |
| 11 | CSS regressions (glare2 wash, undefined var) | contract | [x] covered: holo-css.test.mjs |

## Test plan
Unit: `holo.test.mjs` (light math, drift, interaction, mask URL, buildHoloCard var) +
`holo-css.test.mjs` (static CSS contracts). Manual: user checks localhost (recorded preference).

## Migration / rollout
n/a: client-only visual change. Revert path: `git revert` of the feature commit(s).

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | holo.mjs light model + ink-mask URL + tests | holo.test.mjs + full suite green |
| 2 | CSS rewrite (base, hyper, SIR, ultra) + CSS contract tests | full suite green |

## Deviations (Builder appends here during build)
- `--card-scale` is not defined in base.css after all: hyper/SIR `--shift` moved to `%`, so nothing
  references it without a fallback (enforced by holo-css.test.mjs).
- `pnpm test` is an explicit file list and never included holo.test.mjs — added it and
  holo-css.test.mjs to package.json. Spring tests kept.
- Default sparkle also skips `double rare` (it has its own glitter layer).
- Highlight direction flipped (pointerX = originX + tiltX·gainX, pointerY = originY − tiltY·gainY):
  following the tilt put the highlight on the cursor's side, so previews still read as a cursor
  light. It now slides away from the tilted-up side, like a real fixed-light reflection.
- User feedback round 2 (dark edges / too subtle / clipping):
  - Every glare radial now ends transparent/neutral: with --card-opacity pinned at 1 the old
    black end stops became a permanent edge vignette (contract-tested).
  - Stronger: gold/SIR shine overlay (was soft-light), glitter + default sparkle opacity up,
    DRIFT amplitude 0.35 → 0.6, ink mask stacked twice (`mask-composite: add`) to lift midtones,
    angle shading 0.15 → 0.08.
  - Preview front face, picker holo slides, and trigger slot/holo are `overflow: visible` so the
    perspective-tilted card isn't clipped (the card rounds its own corners). The has-trigger
    carousel wrap still clips by design (hides off-screen slides).
- The unsafe-URL check is a char-code test, not a control-char regex (a regex escape was written
  out as a literal NUL byte and made git treat holo.mjs as binary).
