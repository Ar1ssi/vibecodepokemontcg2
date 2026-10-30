# Sound coupling — the hit you hear is the hit you see

A visual contact frame with no transient on it reads as soft; a transient 80 ms off the frame reads
as a bug. Sound is designed with the beats, not added after.

## Three layers, three jobs

| Layer | Carries | Starts | Shape |
|---|---|---|---|
| **Anticipation / whoosh** | that something is coming; the element's texture (a rush for water, a crackle for electric, a roar for fire) | with the wind-up, swells to contact | rising, ends *at* the transient |
| **Transient / impact** | the hit itself; the tier | *on the contact frame*, offset by the sample's own attack time | short, loud, element-coloured (splash, crack, thud, snap) |
| **Tail / dissipation** | how it dies; matches the dissipation visuals | from contact, decays with the effect | long, quiet, element texture (drips, sizzle, arcs) |

A tier-1 move may have only a transient and a short tail; a tier-3 move has all three and a longer
whoosh. Never add a fourth layer for "more impact": stack transients and you get a click.

## Alignment rules

1. **The transient lands on the contact frame.** Measure the sample's attack (ms from file start to
   peak) and start it that much *earlier*. ±1 frame (≈16 ms) is the tolerance.
2. **Sound before sight.** Audio latency is larger than render latency; schedule sound a few ms
   ahead, never behind. If the system sounds an effect before its scene starts, the scene's
   contact time is the anchor the sound planner reads.
3. **One voice per hold.** Every scene that holds the queue has a sound; a silent hold is a bug.
   Every held scene's sound ends with (or before) its hold.
4. **Hit stop is the transient's room.** The 40–80 ms freeze at contact is where the ear attends;
   nothing else plays there.
5. **Element texture, not generic hits.** Water lands as a splash with a drip tail; electric as a
   snap and a crackle; fire as a whump and a sizzle; rock as a thud and a rattle; psychic as a
   bloom and a shimmer; a slash is a swish and a crack.

## Tier → intensity

Map the move's tier to the sample set's intensity, not to volume alone: tier 1 small/short,
tier 2 medium, tier 3 large with a sub layer. Multi-hit moves repeat the transient per hit with
decreasing level, in time with each re-knock.

## Checking it

- Place the contact frame's scene time next to the transient's scheduled time; they match within a
  frame.
- Play the recording with sound (or read the scheduled cue list) and watch frame 4: the hit is
  heard at frame 4, not 5.
- Reduced motion keeps the sound; the sound must still make sense over a stilled scene (a single
  transient, no whoosh to nowhere).
