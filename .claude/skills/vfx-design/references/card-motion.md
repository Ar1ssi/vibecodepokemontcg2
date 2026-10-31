# Card motion — the attacker and the target as rigid bodies with weight

On a card board the card *is* the body. In the reference the creature rears, lunges, spins or
plants its feet and the target flinches; the card does the same with the vocabulary of a stiff
object that has mass. This is the user's standing choice: **a rigid card with weight** — tilt,
lift, lunge, recoil, shake and settle, never bend, squash or stretch.

## Why the body matters more than the particles

A viewer reads weight from *timing of the body*, not from the effect drawn on it. A perfect fireball
on a card that did not draw back first lands on nothing; a plain lunge with a proper wind-up, a
contact hold and a sprung recoil reads as a hit with no particles at all. Do the body first, then
dress it.

## Vocabulary (poses are pure functions of the scene clock)

Lane space: `along` is toward the other card (card heights), `across` is the lane's left normal,
`lift` is screen-up so it reads the same from both seats. Attacker pose `{ along, across, scale,
tilt, glow }`; target pose `{ along, across, scaleAlong, scaleAcross, wobble, heat, lift, cold }`.
`scaleAlong`/`scaleAcross` exist for the *perspective* of a card that leans, not for squash: keep
them within ±4 % and move together with `tilt`.

| Phase | Attacker | Target | Ease |
|---|---|---|---|
| **Anticipation** (0 → ~55 % of contact) | draws back along −`along` (rear), rises a little (`scale` 1.03–1.05, nearer the camera), tilts back 3–6°, glow gathers at its lane edge | still | ease-out of the pullback (it decelerates into the held pose) |
| **Hold** (optional, 0–150 ms) | holds the wound pose | still | — |
| **Drive** (~55 % → contact) | thrusts forward fast: for a contact move it reaches toward the target (up to lane − 0.9 heights), for a ranged move it lurches 0.1–0.3 and stops | still | ease-in then linear; small overshoot at contact |
| **Contact** (hit stop 40–80 ms) | frozen at full extension | frozen for the first frame, then displaced *along the attack vector* | hold |
| **Recoil** | springs home with a damped spring (≈1.5 swings, e⁻³), glow fades | knocked 0.2–0.45 heights along the attack, tilts into the hit, wobbles, springs home | damped spring |
| **Settle** (to ~1.3–1.6 × contact) | at rest; any residual glow gone | at rest; residual tint (heat / cold) fades | — |

## Timing tables

Times as fractions of `contactMs` (c) so a spec can be retimed without re-tuning; absolute hints
for a 1000–1600 ms scene.

| Tier | Wind-up rear (heights) | Wind-up ends | Drive | Hit stop | Target knock (heights) | Knock settle | Attacker home |
|---|---|---|---|---|---|---|---|
| 1 (light, quick) | 0.06–0.08 | 0.55 c | 0.55 c → c | 40 ms | 0.15–0.2 | 350–450 ms | 1.3 c |
| 2 | 0.10–0.12 | 0.56 c | 0.56 c → c | 60 ms | 0.25–0.3 | 450–520 ms | 1.4 c |
| 3 (heavy, big) | 0.14–0.20 | 0.58 c | 0.58 c → c | 80 ms | 0.35–0.45 | 520–650 ms | 1.5–1.6 c |

Mass cues: a heavier attacker winds up slower and shorter, travels less, and settles with a bigger,
slower spring; a light one is quick, travels far, and settles small. Multi-hit moves (`stagger`)
re-knock the target on each hit with decreasing amplitude, never resetting to rest between hits.

## Physics rules (the ones that get broken)

1. **Never squash or stretch.** A card is a stiff object. Depth comes from `scale` (toward the
   camera) and `tilt` (into the lane), ≤ 1.05 and ≤ 6°.
2. **Knock along the attack vector.** The target moves away from the attacker, not up the
   screen, not toward the camera. On the far seat the vector is mirrored through lane space.
3. **Hit stop before anything springs.** The contact flash, the damage read and the sound
   transient land inside the hold; the recoil and knock begin as it ends.
4. **Overshoot belongs to the strike, not the wind-up.** The pullback eases *out* into a held
   pose; the thrust eases *in* and overshoots a few percent at contact.
5. **One spring.** `cos(π · 1.5 · t) · e^(−3 t)` from the displaced pose back to rest. Two
   different springs on the same body (one for `along`, another for `tilt`) look like jelly.
6. **No idle.** Cards do not bob, breathe or hover when nothing is happening; the rest pose is
   exactly the board's rest pose, and the scene returns to it (frame 7 = frame 1).
7. **A lifted card has a shadow.** Lift without a shadow on the cloth reads as scale, not height.
8. **Cosmetic only.** State is already applied; the poses never gate input, and a backstop timer
   returns the card to rest if the scene is cut.

## Mapping the reference body animation to card poses

| Reference (creature) | Card preset | Notes |
|---|---|---|
| Rears back / crouches / braces | `brace` (ranged) or `rear-lurch` (lunging ranged) | the default for special moves |
| Leaps or charges into the target | `lunge` (reach to the target, spring back) | contact moves; reach caps at lane − 0.9 |
| Dashes through / past | `dash` (fast travel, trails) | Aqua Jet, Flame Charge |
| Spins | `spin` (1–2 turns, tilt in perspective) | Rapid Spin, Aqua Tail wind-up |
| Stomps / plants / quakes | `stomp` (down then up; cloth shake) | Earthquake, Stomp |
| Vanishes and reappears | `warp` | Phantom Force, Aerial Ace |
| Rises / flies up | `rise` (lift + shadow) | Fly, Bounce, Sky Attack |
| Target flinches | `knock` (along the attack, wobble, heat tint) | the default |
| Target takes repeated hits | `stagger` (decreasing re-knocks) | Fury Swipes, Bullet Seed |
| Target lifted (psychic, wind) | `float` (lift, then drop) | Psychic, Gust |
| Target pulled down / trapped | `sink` (down with jitter) | Whirlpool, Sand Tomb |
| Target frozen | `freeze` (cold tint, tremble late) | Ice Beam, Blizzard |

## Checking card motion in the frames

- **Frame 2** (anticipation peak): the attacker is visibly behind its rest spot, tilted back,
  glow at its lane edge. If frame 2 equals frame 1, there is no wind-up.
- **Frame 4** (contact): the attacker is at full extension; the target has not yet moved.
- **Frame 5** (+120 ms): the target is displaced *away from the attacker*, tilted into the hit;
  the attacker has started home.
- **Frame 7** (settle): both at rest; no tint, no lift, no glow.
- Far seat: the same frames mirrored — the knock still goes away from the attacker.

## Secondary body dressing (dim, supporting, never primary)

- Charge glow: a rim on the attacker in the move's tint, not a whiteout; it gathers during the
  wind-up and is spent at the drive.
- Heat / cold tint on the struck card: a coloured veil or rim at ≤ 0.35 that fades through the
  settle; a *light* heat sheen reads as a white slab on light card art, so keep its core tinted.
- Shadow under a lifted or knocked card; the cloth takes a light pool from the charge glow.
- Trails on a dash are the attacker's silhouette echoed and dimmed, not a new shape.
