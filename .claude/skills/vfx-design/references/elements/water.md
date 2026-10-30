# Water — how it reads

**Identity:** heavy, translucent, saturated blue matter that obeys gravity: it arcs, sheets, drips
and splashes, foaming white only where it moves fastest and tears.

## Physical truth
Water is a transparent body with a refractive index: it bends what is behind it, shows a bright
specular glint and a Fresnel-lit rim, and is *darker and more saturated* where it is thick. It is
white only as foam (air mixed in) at the places it tears: the head of a jet, the crest of a wave,
the edge of a splash. It has mass: a stream bends down over distance, drops fall in arcs, a splash
goes up and comes down. It never has corners.

## Shape language
- A stream or beam: a continuous *tube*, even in width (jet) or tapering (spray), with a round cap
  and a breaking head; its surface boils at two scales; it bends under gravity over long reach.
- Drops: spheres with a glint up-left, a darker rim, and a tail if moving fast.
- Splash: a crown or fan of fingers that rise and fall; foam at the tips; droplets thrown off.
- Sheets and waves: thick, translucent, with a lit edge and a foam crest; they curl.
- Mist: white-grey, soft, rising slowly after a splash — the tertiary layer.
- Edges are soft where the water tears (foam) and glassy where it is smooth; never crystalline.

## Value & light (matter, drawn over)
Lit side → body → shadow side, with a Fresnel rim and a small glint. Its interior is the *scene
refracted and tinted blue*, darker where thick. Foam is tinted white (`#F0F8F8` at ≤ 0.75 alpha),
present only at the head, the crest, the tearing edges and the contact burst. The brightest point
is the glint, then the contact splash; the body never exceeds 1.0. Water covers what is under it:
over a bright card it tints blue instead of adding to white.

## Palette (sampled, Scarlet/Violet)
- deep `#1878D0` · body `#2EC4F0` · hot `#88D8F8` · foam `#F0F8F8` (Hydro Pump frames 2.0–2.5 s;
  the body is a *saturated turquoise*, brighter than the study note's `#48A8E8` average because the
  beam is lit from inside by its white streaks — sample the beam, not the splash haze)
- Hydro Cannon `#1860D8 #5898E8 #A8D8F8`; Aqua Jet `#3898C8 #88C8F8 #A8D8E8`; Wave Crash deep
  `#2850E0`.
- **Saturation is the water read.** The same hue at low saturation (pale cyan-white) is ice. Hold
  the body saturated and let only foam and glints go pale.
- Accent: none for plain water. Scald adds white-grey **steam** and warm `#F8E8D8` sparks;
  Liquidation adds yellow/coral impact stars `#F0E890 #E87060`.
- **Drift to avoid: toward cyan-white.** The sprite-era Water Gun palette (`#D8F8F8 #68F8F8`) is
  pale because it is a 16-colour sprite; the 3D reference is deep saturated blue with white only
  at the head. Gain on the body, a white splash fill, or mixing a thin stream toward the hot stop
  all land on *ice*.

## Motion signature
- Charge (150–300 ms): a cyan glow and a few droplets gather at the source; the attacker rears.
- Travel: a jet reaches the target in one or two frames and then *holds and churns* for 300–800 ms,
  flow scrolling toward the head; a thrown drop or wave crosses the lane in 200–300 ms in an arc
  that *bends down*.
- Contact: a white-blue radial splash burst (crown of fingers, 0.5–1.0 heights) that rises then
  falls; droplets hang and fall; a tinted (not white) flash for one frame.
- Dissipation (longest): water sheets cascade off the target and drip; droplets land; mist rises
  and thins. The stream withdraws from the root toward the head, or breaks into drops.
- Nothing stays still; even a held beam churns.

## What sells it
- Refraction of the scene through a tube normal, with a blue tint and a darker core (techniques §
  Fake volume, § Refraction); a glossy stripe and a Fresnel rim.
- Caustic texture scrolling along the beam; white streaks only in the top 30 % of the noise.
- Foam as a soft band where the surface tears (edges, head), not a white fill; froth at the head
  that *stands up* at contact as a splash flipbook, tinted pale blue.
- Drops as lit spheres with gravity (closed-form arcs), velocity-stretched when fast.
- Droplets thrown off the flanks of a projectile; a mist sprite layer that rises after.
- A shadow of the stream on the cloth (cast pass) and a light pool from the glint.

## Card motion & sound
Jets: `brace` / `rear-lurch` with a cool rim; the target `knock` with a cool veil. Waves and
tackles: `dash` or `lunge`. Sound: a sustained rush under the beam, a splash transient at contact,
a drip tail; Scald adds a hiss.

## Not its neighbour
- vs **Ice**: ice is faceted, hard-edged, grows in jumps, glints blue-cold, and its debris are
  shards that fall and shatter; water is round, continuous, soft-foamed, and its debris are drops
  that splash. If a splash has a straight edge or a star shape, it is ice. If a stream is pale
  cyan-white end to end, it is ice. Check the *edges* first, then the palette.
- vs **Flying (wind)**: wind is thin white ribbons without body or refraction; water has thickness.
- vs **Poison**: poison is opaque, glossy, violet, and bubbles; water is translucent blue.
- vs **Psychic**: psychic bends the scene too, but in violet, in rings and lenses that swell; water
  bends it in a stream that flows.

## Reference cues (SV)
- Hydro Pump: a bright cyan-to-white continuous beam, thick, with concentric water texture; a
  white-blue radial splash at contact with yellow-white spark flashes interleaved; large droplets
  hang and fall.
- Water Gun: small and quick; white-cyan glow at the mouth; a short spray of streaks; a white-cyan
  splash sphere on the target; water clings and drips.
- Surf: a curling cyan-white wave with foam churning at its crest; a massive radial splash; water
  cascades off in sheets.
- Aqua Jet: the attacker wrapped in a translucent water shell with thin white speed lines; splash
  puff and 3–4 thin white arcs on contact.
- Waterfall: a frothy geyser erupts under the attacker; a churning column bursts up under the
  target, spray fanning sideways.

## Failure signatures seen here → fix
- **"Water spray reads icy"** (fixed 2026-10-30 with this skill's loop, three rounds; user check
  pending). What the frames showed: a near-white beam (the caustic texture was mixed toward white
  and half the surface was foam at `streak > 0.5`), pale halos on both cards, a head splash that was
  invisible (the `Water_Splash_2x2` texture is sparse splatter dots, not a crown) and droplets that
  read as grey dots (`Water_Drop_Blurred` is a vertical streak-drop with a dim tail, drawn square).
  Fix: palette to the SV-sampled saturated body; the caustic as a mask between deep and body; foam
  only above the top ~15 % of the streak noise and tinted; the crown flipbook
  (`TEX_VFX_Splash_Water_1x4`) upright at the head with splatter over it; head droplets as real
  `waterDrop` spheres rising and falling; flank streak-drops aligned to their flight. Still open
  after round 3: the attacker's charge is the shared card-wide rim (design 078), a pale box that
  reads frosty next to SV's small orb at the mouth.
- **"Too thick, no foam, wants clarity/shine"** (pass 2, 2026-10-30, three rounds). The frames
  showed an opaque pipe: Hydro Pump stacks a thin `solid` beam inside its `widening` one and both
  drew as full tubes at ~0.98 alpha, the refracted board was only 45 % of the colour, the stripe was
  a soft band and the foam a faint tint. Fix: output alpha 0.55 down the middle rising to 0.9 at the
  grazing sides (Fresnel opacity), foam covering fully; refraction 16 px with a body-colour
  in-scatter term so the clear middle stays blue over the dark cloth (pale glass over black is ice);
  the thin inner beam drawn as a half-alpha white-streak core (`CORE_MAX_W`) that leaves the head
  to the wide beam; foam as three kinds — the beam texture's white cell web, flow-stretched streaks
  warped by the ripple and broken into lengths, and a wide blobby froth band on the outer ~30 % of
  each side; shine as a narrow stripe broken by the streaks, a far-side reflection stripe, a
  pow-4 rim and sparkle points, all added as light after coverage; crown and splatter sprites
  `blend: 'over'` in tinted white (three additive copies summed to a white sheet). Beam scale
  1.7 → 1.45. Still open: the attacker rim box (078); the head splash is far smaller than SV's,
  bounded by the rule against whiteouts over the struck card; Water Gun's narrow stream carries one
  continuous highlight line that edges toward a glass rod — break the stripe harder when the beam
  is under ~0.2 card heights.
- Hydro Pump as a chain of stacked rings → one solid widening beam that churns.
- Aqua Tail's contact blades reading as ice → a water crescent (a curved tube) and a splash, no
  shards.
- Light heat sheen reading as a white slab on the struck card → tint the sheen's core blue and
  keep it ≤ 0.35.
