# 085 — Scorched Earth and Forest of Vitality rework

Status: building — 2026-11-03, branch `feature/085-scorched-vitality`.

## Brief (the user, verbatim)
"Scorched earth looks terrible. Just very procedural and empty. Same with forest of vitality. Have a
fresh hostile reviewer critique them and give you a plan to fix them."

## Review (fresh hostile reviewer, 2026-11-03; renders at 1920×1080, both presets, vs the card art)
Both boards score 1–2 out of 5 on volume/value, element identity and reference parity.

Scorched Earth (PRC 138, Ryo Ueda): the card is ~70% near-black basalt (#302a27–#3a302b) with
striated gold-orange lava (core #fbd381, edges #e53e19) as the one bright thing; the board is
mid-value mauve everywhere, the river is muddy crust under the whole card block (open lava only in
the far-left margin and under the chat panel), one stone tile repeats everywhere with painted rims,
the volcano is a flat stamp with straight streams and an orange ball, lava lights only a few px, no
depth.

Forest of Vitality (MEG 117, Ayumi Odashima): the hero crown is ~40 near-identical spheres (a
cauliflower) instead of the card's stacked horizontal shelves (#1d7657) with yellow-green underlit
lips; the trunk reads as a flat brown star in tilt12; ~60% of the view is one flat lime lawn
(#7cb95b); the vitality glow (the card's brightest element) is missing; bushes are evenly spread
polka dots; the broadleaves read as discs; no warm-to-cool distance; the flower ring is confetti.

## Plan (the reviewer's, ranked; built in this order)
Scorched Earth
- S1 Dark rock lit by the lava: base `vec3(0.075,0.058,0.05)`, warm fill `vec3(0.10,0.07,0.06)`, no
  slate tint; painted rims only near heat; broad static radiance within ~150 px of lava (lit faces
  toward #9b5b3e, bank sides toward #e0582a).
- S2 The river as a diagonal flow in the left margin (a layout path from the volcano's foot down
  the left margin), 1.4–2 card widths wide, never under the card block (`uCrust` and the crust band
  go); path clears every footprint (tested).
- S3 The card's lava: orange to gold body (never white), crimson only at the banks, streaks
  stretched ~1:8 along the flow, a few dark crust rafts; quiet by the cards.
- S4 Big landforms instead of one tile: big plates 260–420 px, mid stones and pebbles only near
  heat, broader ridges; lava cracks and painted cracks off the cards.
- S5 The volcano as a mountain: bigger and lower (height 0.7 r, crater 0.14 r), a lumpy outline,
  two winding forking rivulets (none toward the cards), a smaller crater glow, dark smoke lit
  orange underneath; crater still in view (tests).
- S6 Depth: the far margin toward #5a2e22, the near margin toward #1e1816.

Forest of Vitality
- V1 The crown as three stacked underlit shelves (7–11 flattened lumps each, body #1d7657, top
  #2f9a7a, sun side #5cb39a), lit from below by a yellow-green glow (#c8cf3c).
- V2 The trunk from above: less flare, lit lower trunk in a pool of glow.
- V3 The vitality glow as a lit volume where both cameras look: the pool moved to the table side of
  the trunk, a low mist (#d6d84a core to #9fbf3a edge, alpha ≤ 0.35, never within ~160 px of a card),
  3–5 soft parallel light columns at the trunks.
- V4 Thickets, not dots: bushes in dense continuous masses (6–12 pieces, tighter spacing, bigger
  steps), taller further out, underlit.
- V5 Real secondary trees: 3–5 umbrella trees 85–120u in the left and top-left margins, two-tier
  underlit shelves.
- V6 The glade's light: centre #6aa857, static canopy-shadow patches, cool far edge (#84bdbe),
  flower ring removed.

## Constraints
Calm card field (no detail, glints or motion over/beside cards), nothing raised over a card on
screen (stadium-screen tests), procedural only, GLSL ES 3.00 names, reduced motion freezes uTime,
no characters, no whiteouts or ray fans, landmarks where both presets see them (chat panel covers
the right ~24%).

## Acceptance
| # | Criterion | Evidence |
|---|---|---|
| A1 | S1–S6 built, Scorched Earth reads dark basalt + bright lava in both presets | 0a7eff1c; stills `.agent/scratch/085a/` (rock ~#33231a, lava flow down the left in both presets) |
| A2 | V1–V6 built, Vitality reads shelf crown + vitality glow + thickets in both presets | this branch; stills `.agent/scratch/085b/` |
| A3 | Every board test green; new layout logic tested (river path, mist off cards) | stadium tests 380/380; `lavaPath`, shelves, mist, light-column screen tests |

## Deviations
- S2: the river's course comes from the layout (`lavaPath`): from the volcano's foot down the strip
  left of the cards to the near margin, each point as far toward the cards as their footprints allow
  (bank 34 px off every card), bowing a little toward the margin; it never runs under the card block.
- S5: the volcano is bigger (up to 320 px) but lower (height 0.7 r); its crater keeps in both frames
  through `VOLCANO_CRATER_INSET` (measured with the board cameras). Its channels: two braided, each
  forking at a narrow angle (wide forks read as spider legs).
- S4/S1 found a second cause of the "vein net": a dry crack's lava table sat 4 px under its floor, so
  every crack in the field glowed red; dry cracks' table now lies 12 px under.
- V1: each shelf is one broad plate, three lumps round it and a scalloped rim, every lump shrunk to
  stay clear of the cards rather than dropped (small round pads read as a cauliflower).
- V3: the light columns are wider than their trunks (a narrow one hid inside the great trunk).
- V5: where a mat's cards run near the table's edges the big broadleaves find no room; the groves
  fall back to design 084's smaller ones there (tested: three or more on every profile).
- Not done: V4's per-bush crease (the kit's bush asset has no crease option; the underlight carries
  the thickets' depth instead).

## Landing edits (for the commit that lands this branch on main)
- DECISIONS: `[mat-fx]` design 085 (Scorched Earth's river is a layout path off the cards; Vitality's
  crown is three shelves, the kit's underlight, mist and light columns).
- ISSUES: reopen I277: Magma Basin's corner falls run beside the moat in tcgl and do not read as falls
  (the 084 follow-up's test only checks they are in frame and near-vertical).
- STATE: Active line names 085 for the user's localhost check.
