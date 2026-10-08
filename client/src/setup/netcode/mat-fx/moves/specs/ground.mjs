// Design 063: Ground specs, one per move of the Ground row of the move table. The study pass
// left entries for Sand Tomb and Mud-Slap only (refs/063-study/notes/g6-ground-rock.md); this
// slice read the other seven itself (sprite N2B2 + the Scarlet/Violet video per move,
// Poképédia; Stomping Tantrum and High Horsepower have no sprite-era animation, Mud Bomb's
// modern clip is USUL; notes in .agent/scratch/moves/ground/g6c-ground.md).
//
// Two materials, one palette family. Earth (`ground`) carries the quakes: the attacker's
// card stomps (`stomp`), the struck card is pressed into the floor (`sink`), cracks open under
// it, clods fly and the table shakes (a front `terrain` quake at contact, so the family is
// `quake`). Mud (`mud`, the same browns, darker and wet) carries the thrown moves: globs,
// streams and splatter, and Sand Tomb's swirling sand. The sprite games' full-screen shakes
// become the scene's local quake; Earth Power's whiteout and Mud-Slap's gold dizzy stars are
// dropped (house rules: no whiteouts, one palette).

/** Clods kicked off the struck card, falling back (the recipe's shard particle). */
const clods = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 12,
    distance: 1.0,
    direction: -90,
    spread: 160,
    size: [0.04, 0.08],
    aspect: 0.6,
    gravity: 1.0,
    maxDelay: 0.12,
    durationMs: 760,
    kind: 'shard',
    ...over,
  });

/** Mud globs flung off the struck card, falling. */
const globs = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 10,
    distance: 0.9,
    direction: -90,
    spread: 180,
    size: [0.04, 0.08],
    aspect: 1,
    gravity: 1.0,
    maxDelay: 0.12,
    durationMs: 720,
    kind: 'glob',
    ...over,
  });

const spec = (over) => Object.freeze({ vgType: 'ground', material: 'ground', pad: 1.7, grain: 0.2, ...over });

// ---- physical ------------------------------------------------------------------------

export const sandTomb = spec({
  id: 'sand-tomb',
  name: 'Sand Tomb',
  statClass: 'physical',
  tier: 1,
  family: 'wind',
  material: 'mud',
  durationMs: 1000,
  contactMs: 450,
  // A vortex of sand swirls up round the card (behind it) while sand clumps rise in front;
  // the card is pressed into the sand at contact. Neither reference has an impact beat (the
  // damage is the vortex itself), so contact is the board's choice, mid-swirl.
  attacker: { motion: 'brace', params: { rear: 0.06, scale: 1.03, glow: 0.5 } },
  defender: { motion: 'sink', params: { heat: 0.4 } },
  beats: [
    { at: 0, until: 900, layer: 'back', drawer: 'spiral', params: { turns: 1.5, r0: 0.35, r1: 1.0, rpm: 200, tongues: 10 } },
    { at: 250, until: 950, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
    { at: 100, until: 850, layer: 'front', drawer: 'cloud', params: { count: 7, radius: 0.25, drift: 0.7, alpha: 0.4 } },
    { at: 450, until: 610, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.8 } },
  ],
  particles: [clods({ at: 460, count: 12, size: [0.02, 0.04], distance: 0.9, spread: 120, gravity: 0.5, durationMs: 500 })],
});

export const mudSlap = spec({
  id: 'mud-slap',
  name: 'Mud-Slap',
  // The move sits in both the physical and the special tier-1 cells; the games class it special.
  statClass: 'special',
  tier: 1,
  family: 'splash',
  material: 'mud',
  durationMs: 1000,
  contactMs: 450,
  // Mud swells at the mouth and a stream of four globs is flung down the lane; the last one
  // lands at contact and the mud splatters over the card, which comes away spattered brown.
  attacker: { motion: 'brace', params: { rear: 0.1, scale: 1.05, glow: 0.5 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.5 } },
  beats: [
    { at: 0, until: 300, layer: 'front', drawer: 'coreCharge', params: { r0: 0.06, r1: 0.16, from: 0.2 } },
    // Landing at 300, 350, 400 and 450 (the last one is the hit).
    { at: 150, until: 450, layer: 'front', drawer: 'volley', params: { count: 4, stagger: 50, r0: 0.1, r1: 0.13, bow: 0.25, tongues: 1 } },
    { at: 300, until: 1000, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
    { at: 450, until: 610, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.85 } },
    { at: 450, until: 800, layer: 'front', drawer: 'splash', params: { count: 8, arc: 160, gravity: 0.9, len: [0.3, 0.6] } },
  ],
  particles: [globs({ at: 460, count: 10, distance: 0.7, spread: 160 })],
});

export const bulldoze = spec({
  id: 'bulldoze',
  name: 'Bulldoze',
  statClass: 'physical',
  tier: 2,
  family: 'quake',
  durationMs: 1400,
  contactMs: 700,
  // The attacker gathers its weight and stomps: a shock ring spreads from its feet, the
  // ground rolls and cracks under the foe, clods jump off it and the table shakes; dust rolls
  // after. (The sprite is a screen shake; the 3D clip a dust wave and a floor ring.)
  attacker: { motion: 'stomp', params: {} },
  defender: { motion: 'sink', params: { heat: 0.5 } },
  beats: [
    { at: 0, until: 560, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.35, hz: 2 } },
    { at: 620, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35 } },
    { at: 700, until: 1100, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 2, r0: 0.3, r1: 1.3 } },
    { at: 700, until: 1300, layer: 'back', drawer: 'terrain', params: { kind: 'wave', radius: 1.4 } },
    { at: 700, until: 1250, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.2 } },
    { at: 700, until: 870, layer: 'top', drawer: 'impactFlash', params: { r0: 0.4, r1: 1.0 } },
    { at: 700, until: 1100, layer: 'front', drawer: 'shards', params: { count: 8, arc: 160, distance: 0.9, spin: 360 } },
    { at: 700, until: 1050, layer: 'front', drawer: 'terrain', params: { kind: 'quake', amp: 0.03 } },
    { at: 900, until: 1400, layer: 'front', drawer: 'smoke', params: { count: 5, rise: 0.6 } },
  ],
  particles: [clods({ at: 710, count: 12, spread: 150 })],
});

export const stompingTantrum = spec({
  id: 'stomping-tantrum',
  name: 'Stomping Tantrum',
  statClass: 'physical',
  tier: 2,
  family: 'quake',
  durationMs: 1400,
  contactMs: 720,
  // Dust flies as the attacker stamps, small rings at its feet, then the big stomp: a ring
  // spreads, the ground cracks under the foe with a ring of its own, clods fly, the table shakes.
  attacker: { motion: 'stomp', params: {} },
  defender: { motion: 'sink', params: { heat: 0.5 } },
  beats: [
    { at: 0, until: 620, layer: 'back', drawer: 'terrain', params: { target: 'attacker', kind: 'dust', radius: 1.0 } },
    { at: 120, until: 330, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 1, r0: 0.3, r1: 0.9, width: 0.04 } },
    { at: 360, until: 570, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 1, r0: 0.3, r1: 0.9, width: 0.04 } },
    { at: 600, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35 } },
    { at: 720, until: 1100, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 2, r0: 0.3, r1: 1.4 } },
    { at: 720, until: 1100, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.4, r1: 1.3 } },
    { at: 720, until: 1300, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.3 } },
    { at: 720, until: 890, layer: 'top', drawer: 'impactFlash', params: { r0: 0.4, r1: 1.0 } },
    { at: 720, until: 1150, layer: 'front', drawer: 'shards', params: { count: 10, arc: 200, distance: 1.0, spin: 450 } },
    { at: 720, until: 1060, layer: 'front', drawer: 'terrain', params: { kind: 'quake', amp: 0.04 } },
    { at: 950, until: 1400, layer: 'front', drawer: 'smoke', params: { count: 5, rise: 0.7 } },
  ],
  particles: [clods({ at: 730, count: 14, spread: 200 })],
});

export const earthquake = spec({
  id: 'earthquake',
  name: 'Earthquake',
  statClass: 'physical',
  tier: 3,
  family: 'quake',
  durationMs: 2000,
  contactMs: 1100,
  pad: 2.2,
  // The attacker gathers itself, rears and slams the floor: a ring spreads from its feet, the
  // ground splits wide under the foe, spires of earth burst up behind it and clods are flung
  // round its base while the table shakes hard; dust hangs after.
  attacker: { motion: 'stomp', params: {} },
  defender: { motion: 'sink', params: { heat: 0.6 } },
  beats: [
    { at: 0, until: 880, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.4, hz: 1.5 } },
    { at: 900, until: 1900, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    { at: 1100, until: 1500, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 2, r0: 0.3, r1: 1.5 } },
    { at: 1100, until: 1550, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 3, r0: 0.4, r1: 1.6 } },
    { at: 1100, until: 1800, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.6 } },
    // Behind the struck card, so the spires frame it instead of hiding it.
    { at: 1100, until: 1650, layer: 'back', drawer: 'pillar', params: { height: 2.1, w: 0.7 } },
    { at: 1100, until: 1280, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
    { at: 1100, until: 1500, layer: 'front', drawer: 'shards', params: { count: 10, arc: 180, distance: 1.2, spin: 360 } },
    { at: 1100, until: 1700, layer: 'front', drawer: 'terrain', params: { kind: 'quake', amp: 0.05 } },
    { at: 1400, until: 2000, layer: 'front', drawer: 'smoke', params: { count: 6, rise: 0.9 } },
  ],
  particles: [
    clods({ at: 1110, count: 16, distance: 1.3, spread: 180 }),
    clods({ at: 1300, count: 8, distance: 0.6, spread: 360, maxDelay: 0.3 }),
  ],
});

export const highHorsepower = spec({
  id: 'high-horsepower',
  name: 'High Horsepower',
  statClass: 'physical',
  tier: 3,
  family: 'dash',
  durationMs: 1800,
  contactMs: 950,
  // The attacker rears, lit by its own power, and charges, kicking dust; the hoof lands on the
  // card at contact, a ring of impact spreads, earth is flung off the hit and the ground under
  // the card glows and splits like a hoofprint; dust settles.
  attacker: { motion: 'dash', params: { wind: 0.3, reach: 0.85, overshoot: 0.25, arc: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.6 } },
  beats: [
    { at: 0, until: 800, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 3 } },
    { at: 280, until: 950, layer: 'back', drawer: 'terrain', params: { target: 'attacker', kind: 'dust', radius: 1.0 } },
    { at: 700, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
    { at: 950, until: 1350, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.3, width: 0.05 } },
    { at: 950, until: 1130, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
    { at: 950, until: 1350, layer: 'front', drawer: 'shards', params: { count: 10, arc: 220, distance: 1.2, spin: 540 } },
    // Behind the card: the hoofprint glows round its feet instead of crossing its face.
    { at: 1000, until: 1750, layer: 'back', drawer: 'glyph', params: { r: 1.1 } },
    { at: 1250, until: 1800, layer: 'front', drawer: 'smoke', params: { count: 5, rise: 0.8 } },
  ],
  particles: [clods({ at: 960, count: 14, distance: 1.2, spread: 220 })],
});

// ---- special -------------------------------------------------------------------------

export const mudShot = spec({
  id: 'mud-shot',
  name: 'Mud Shot',
  statClass: 'special',
  tier: 2,
  family: 'splash',
  material: 'mud',
  durationMs: 1350,
  contactMs: 680,
  // Mud gathers at the mouth and is shot down the lane as one stream; its head hits the card
  // at contact and splatters, the stream runs on a moment and then drains away.
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.7 } },
  beats: [
    { at: 0, until: 420, layer: 'front', drawer: 'coreCharge', params: { r0: 0.08, r1: 0.22, from: 0.2 } },
    // The head reaches the defender at 400 + 0.35 x 800 = 680.
    { at: 400, until: 1200, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.35, growIn: 0.35, retract: 0.2 } },
    { at: 500, until: 1250, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35 } },
    { at: 680, until: 850, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
    { at: 680, until: 1050, layer: 'front', drawer: 'splash', params: { count: 10, arc: 200, gravity: 0.9, len: [0.35, 0.7] } },
  ],
  particles: [globs({ at: 690, count: 12, spread: 200 })],
});

export const mudBomb = spec({
  id: 'mud-bomb',
  name: 'Mud Bomb',
  statClass: 'special',
  tier: 2,
  family: 'splash',
  material: 'mud',
  durationMs: 1400,
  contactMs: 700,
  // A ball of mud swells at the mouth and is lobbed high; it bursts on the card in a ring of
  // splatter, and a cloud of grey-brown dust hangs over the card as the mud falls.
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.32, heat: 0.8 } },
  beats: [
    { at: 0, until: 460, layer: 'front', drawer: 'coreCharge', params: { r0: 0.1, r1: 0.28, from: 0.2 } },
    { at: 380, until: 700, layer: 'back', drawer: 'shockRings', params: { count: 1, r0: 0.3, r1: 0.9 } },
    { at: 400, until: 700, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.5, r0: 0.26, r1: 0.32, tongues: 3 } },
    { at: 560, until: 1350, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.42 } },
    { at: 700, until: 870, layer: 'top', drawer: 'impactFlash', params: { r1: 1.15 } },
    { at: 700, until: 1050, layer: 'front', drawer: 'splash', params: { count: 12, arc: 360, gravity: 0.9, len: [0.45, 0.9] } },
    { at: 750, until: 1400, layer: 'front', drawer: 'cloud', params: { count: 7, radius: 0.42, drift: 0.3, alpha: 0.45 } },
    { at: 900, until: 1400, layer: 'front', drawer: 'smoke', params: { count: 4, rise: 0.7 } },
  ],
  particles: [globs({ at: 710, count: 14, distance: 1.1, spread: 360 }), globs({ at: 900, count: 6, distance: 0.5, spread: 360, maxDelay: 0.3 })],
});

export const earthPower = spec({
  id: 'earth-power',
  name: 'Earth Power',
  statClass: 'special',
  tier: 3,
  family: 'quake',
  durationMs: 2000,
  contactMs: 1050,
  // Power wells up round the attacker and drives into the ground: cracks run under the foe and
  // the split ground glows, brighter and brighter, until it erupts at contact (spires of earth
  // behind the card, rock flung off it, the table shaking); dust rises as it settles.
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.25, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 0.9 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.45, hz: 2 } },
    { at: 300, until: 1500, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.3 } },
    { at: 600, until: 1900, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    // The glow builds under the card from 350 and is still lit when it erupts; behind the
    // card, so the seams glow out round its feet instead of crossing its face.
    { at: 350, until: 1500, layer: 'back', drawer: 'glyph', params: { r: 1.2 } },
    { at: 1050, until: 1650, layer: 'back', drawer: 'pillar', params: { height: 2.3, w: 0.7 } },
    { at: 1050, until: 1230, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
    { at: 1050, until: 1500, layer: 'front', drawer: 'shards', params: { count: 10, arc: 200, distance: 1.3, spin: 540 } },
    { at: 1050, until: 1600, layer: 'front', drawer: 'terrain', params: { kind: 'quake', amp: 0.04 } },
    { at: 1300, until: 2000, layer: 'front', drawer: 'smoke', params: { count: 6, rise: 1.0 } },
  ],
  particles: [
    clods({ at: 1060, count: 16, distance: 1.3, spread: 200, gravity: 0.9 }),
    clods({ at: 1250, count: 8, distance: 0.7, spread: 360, maxDelay: 0.3 }),
  ],
});

export const GROUND_SPECS = Object.freeze(
  Object.fromEntries(
    [sandTomb, mudSlap, bulldoze, stompingTantrum, earthquake, highHorsepower, mudShot, mudBomb, earthPower].map((s) => [s.id, s])
  )
);
