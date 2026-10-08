// Design 063: Steel specs, one per move of the Steel row of the move table. Steel had no
// Appendix A entries, so this slice ran the study pass first, reading every reference itself
// (sprite N2B2 / Pokémon Central IT5 + the Scarlet/Violet video per move, Poképédia; notes in
// .agent/scratch/moves/steel/g7c-steel.md). Smart Strike and Steel Beam have no sprite-era
// animation and read from their Scarlet/Violet videos only.
//
// Every move draws in the one steel material, white-blue steel start to payoff: the sprite
// games' olive smoke, Flash Cannon's magenta and yellow pulses, Smart Strike's red reticle and
// Steel Beam's violet crackle and orange blast all become the material's steel, its cool blue
// edge and white. Deviation from the steel recipe: its white `speedRays` at contact are not
// drawn (no row ships a sunburst); contact is a flash, a ring and a burst of steel splinters.
// The sprite games' whole-scene dims (Flash Cannon) are local vignettes. The physicals carry
// their weight in the card (`dash` / `lunge`, a hard knock); Bullet Punch is a flurry: four
// steel bullets land one blow each, the damage pops on the first and the last is the biggest.

/** A CSS spark burst flung off the defender (white streaks, no gravity). */
const spark = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 10,
    distance: 1,
    direction: -90,
    spread: 360,
    size: [0.05, 0.1],
    aspect: 0.2,
    gravity: 0,
    maxDelay: 0.1,
    durationMs: 550,
    kind: 'streak',
    ...over,
  });

const spec = (over) => Object.freeze({ vgType: 'steel', material: 'steel', pad: 1.7, grain: 0, ...over });

/** One blow on the defender at `at`: an impact ring, a burst of steel splinters, a flash on top. */
const blow = (at, { ring = 0.8, splinters = 4, reach = 0.45, flash = 0.7 } = {}) => [
  { at, until: at + 240, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.3, r1: ring, width: 0.045 } },
  { at, until: at + 260, layer: 'front', drawer: 'shards', params: { count: splinters, distance: reach, spin: 120 } },
  { at, until: at + 140, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: flash } },
];

/** Steel glints converging on a card: the two halves of one orbit. */
const glints = (at, until, params) => [
  { at, until, layer: 'back', drawer: 'orbitCharge', params: { half: 'back', ...params } },
  { at, until, layer: 'front', drawer: 'orbitCharge', params: { half: 'front', ...params } },
];

// ---- physical ------------------------------------------------------------------------

export const bulletPunch = spec({
  id: 'bullet-punch',
  name: 'Bullet Punch',
  statClass: 'physical',
  tier: 1,
  family: 'punch',
  durationMs: 1100,
  contactMs: 420,
  // A quick jab in behind four steel bullets; each lands a blow, 70 ms apart, the last biggest.
  attacker: { motion: 'lunge', params: { wind: 0.1, reach: 0.55 } },
  defender: { motion: 'stagger', params: { strength: 0.3, hits: 4, gapMs: 70, heat: 0.4 } },
  beats: [
    { at: 0, until: 420, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.35, hz: 4 } },
    // The bullets land at 420, 490, 560 and 630: flight = 350 - 3 x 70 = 140 ms each.
    { at: 280, until: 630, layer: 'front', drawer: 'volley', params: { count: 4, stagger: 70, r0: 0.08, r1: 0.12, bow: 0.15, tongues: 1 } },
    ...blow(420),
    ...blow(490),
    ...blow(560),
    ...blow(630, { ring: 1.1, splinters: 8, reach: 0.7, flash: 1.05 }),
  ],
  particles: [spark({ at: 630, distance: 0.8, durationMs: 500 })],
});

export const metalClaw = spec({
  id: 'metal-claw',
  name: 'Metal Claw',
  statClass: 'physical',
  tier: 1,
  family: 'slash',
  durationMs: 1000,
  contactMs: 520,
  // The claws gleam blue-white, then rake twice across the defender's shoulder, outer and inner.
  attacker: { motion: 'lunge', params: { wind: 0.18, reach: 0.5 } },
  defender: { motion: 'knock', params: { strength: 0.22, heat: 0.4 } },
  beats: [
    { at: 240, until: 500, layer: 'front', drawer: 'coreCharge', params: { r0: 0.06, r1: 0.14, from: 0.2 } },
    { at: 440, until: 700, layer: 'front', drawer: 'slashArc', params: { sweep: 130, radius: 0.62, angle: -45, thick: 0.2 } },
    { at: 480, until: 740, layer: 'front', drawer: 'slashArc', params: { sweep: 130, radius: 0.4, angle: -45, thick: 0.18 } },
    { at: 520, until: 680, layer: 'top', drawer: 'impactFlash', params: { r0: 0.35, r1: 0.9 } },
    { at: 520, until: 800, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.3, r1: 1.0, width: 0.045 } },
    { at: 530, until: 820, layer: 'front', drawer: 'shards', params: { count: 6, arc: 120, direction: 135, distance: 0.7, spin: 120 } },
  ],
  particles: [spark({ at: 540, count: 8, distance: 0.8 })],
});

export const smartStrike = spec({
  id: 'smart-strike',
  name: 'Smart Strike',
  statClass: 'physical',
  tier: 2,
  family: 'dash',
  durationMs: 1350,
  contactMs: 720,
  // A reticle turns and locks onto the defender while a glint gathers at the leading edge;
  // the attacker charges in behind a steel spear-point that never misses.
  attacker: { motion: 'dash', params: { wind: 0.2, reach: 0.9, overshoot: 0.2, arc: 0.2 } },
  defender: { motion: 'knock', params: { strength: 0.38, heat: 0.6 } },
  beats: [
    { at: 0, until: 760, layer: 'back', drawer: 'glyph', params: { r: 0.75 } },
    { at: 120, until: 520, layer: 'front', drawer: 'coreCharge', params: { r0: 0.06, r1: 0.2, from: 0.15 } },
    // The point rides the leading edge: the dash runs 0.3 c -> c with the same ease-in.
    { at: 216, until: 720, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.16, r1: 0.22, tongues: 3 } },
    { at: 720, until: 880, layer: 'top', drawer: 'impactFlash', params: { r1: 1.15 } },
    { at: 720, until: 1020, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.3, width: 0.05 } },
    { at: 720, until: 1080, layer: 'front', drawer: 'shards', params: { count: 9, distance: 1.0, spin: 240 } },
    { at: 680, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
  ],
  particles: [spark({ at: 730, count: 12, distance: 1.1 })],
});

export const steelWing = spec({
  id: 'steel-wing',
  name: 'Steel Wing',
  statClass: 'physical',
  tier: 2,
  family: 'slash',
  durationMs: 1350,
  contactMs: 700,
  // Steel feathers wheel round the attacker; it swoops in and clips the defender with a wing,
  // feathers scattering off the cut.
  attacker: { motion: 'dash', params: { wind: 0.25, reach: 0.85, overshoot: 0.3, arc: 0.55 } },
  defender: { motion: 'knock', params: { strength: 0.32, heat: 0.5 } },
  beats: [
    { at: 0, until: 600, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 1.5, r0: 0.35, r1: 0.8, rpm: 120, tongues: 6 } },
    { at: 560, until: 840, layer: 'front', drawer: 'slashArc', params: { sweep: 150, radius: 0.55, angle: 0, thick: 0.2 } },
    { at: 700, until: 860, layer: 'top', drawer: 'impactFlash', params: { r0: 0.35, r1: 1.0 } },
    { at: 700, until: 980, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.3, r1: 1.1, width: 0.05 } },
    { at: 710, until: 1100, layer: 'front', drawer: 'shards', params: { count: 8, distance: 0.9, spin: 240 } },
  ],
  particles: [
    spark({ at: 700, count: 8, distance: 0.9 }),
    spark({ at: 720, kind: 'feather', count: 8, distance: 1.1, size: [0.05, 0.12], aspect: 0.35, gravity: 0.35, durationMs: 900 }),
  ],
});

export const ironTail = spec({
  id: 'iron-tail',
  name: 'Iron Tail',
  statClass: 'physical',
  tier: 3,
  family: 'slash',
  durationMs: 1800,
  contactMs: 1000,
  // Glints run over the attacker as it hardens; it charges in and one wide crescent swipe
  // throws the defender back in a burst of splinters and pale dust.
  attacker: { motion: 'dash', params: { wind: 0.3, reach: 0.9, overshoot: 0.25, arc: 0.45 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.7 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 3 } },
    ...glints(0, 600, { count: 4, r0: 0.05, r1: 0.08, tongues: 0 }),
    { at: 880, until: 1150, layer: 'front', drawer: 'slashArc', params: { sweep: 170, radius: 0.7, angle: 10, thick: 0.26 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
    { at: 1000, until: 1350, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.4, width: 0.06 } },
    { at: 1010, until: 1450, layer: 'front', drawer: 'shards', params: { count: 10, distance: 1.1, spin: 300 } },
    { at: 1050, until: 1750, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.35, drift: 0.4, alpha: 0.35 } },
    { at: 950, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35 } },
  ],
  particles: [
    spark({ at: 1000, count: 12, distance: 1.2 }),
    spark({ at: 1060, kind: 'shard', count: 8, aspect: 1, size: [0.04, 0.08] }),
  ],
});

export const ironHead = spec({
  id: 'iron-head',
  name: 'Iron Head',
  statClass: 'physical',
  tier: 3,
  family: 'dash',
  durationMs: 1750,
  contactMs: 940,
  // Glints gather on the leading edge; the attacker rams in head first behind a steel point
  // and the hit throws steel fragments and a pale haze off the defender.
  attacker: { motion: 'dash', params: { wind: 0.3, reach: 0.9, overshoot: 0.2, arc: 0.25 } },
  defender: { motion: 'knock', params: { strength: 0.5, heat: 0.8 } },
  beats: [
    ...glints(0, 640, { count: 4, r0: 0.05, r1: 0.08, tongues: 0 }),
    { at: 100, until: 620, layer: 'front', drawer: 'coreCharge', params: { lead: 0.3, r0: 0.1, r1: 0.26, from: 0.2 } },
    // The head rides the leading edge: the dash runs 0.3 c -> c.
    { at: 282, until: 940, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.26, r1: 0.34, tongues: 3 } },
    { at: 940, until: 1120, layer: 'top', drawer: 'impactFlash', params: { r1: 1.35 } },
    { at: 940, until: 1300, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.5, width: 0.06 } },
    { at: 940, until: 1400, layer: 'front', drawer: 'shards', params: { count: 12, distance: 1.2, spin: 360 } },
    { at: 1100, until: 1700, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.3, drift: 0.7, alpha: 0.3 } },
    { at: 900, until: 1650, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.38 } },
  ],
  particles: [
    spark({ at: 940, count: 14, distance: 1.3 }),
    spark({ at: 1000, kind: 'shard', count: 8, aspect: 1, size: [0.04, 0.08] }),
  ],
});

// ---- special -------------------------------------------------------------------------

export const flashCannon = spec({
  id: 'flash-cannon',
  name: 'Flash Cannon',
  statClass: 'special',
  tier: 2,
  family: 'beam',
  durationMs: 1350,
  contactMs: 740,
  pad: 2.2,
  // Steel beads stream in round a dimmed attacker and gather into a bright orb at the mouth;
  // shock rings release it as a narrow white-blue beam that bursts on the defender.
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.35, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.7 } },
  beats: [
    { at: 0, until: 680, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.38 } },
    ...glints(0, 600, { count: 5, r0: 0.05, r1: 0.09, tongues: 1 }),
    { at: 80, until: 620, layer: 'front', drawer: 'coreCharge', params: { lead: 0.45, r0: 0.1, r1: 0.32, from: 0.2 } },
    { at: 560, until: 900, layer: 'back', drawer: 'shockRings', params: { count: 2, r0: 0.25, r1: 1.1 } },
    // The beam head lands at contact: 620 + 0.25 x 480 = 740.
    { at: 620, until: 1100, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.24, growIn: 0.25, retract: 0.3 } },
    { at: 740, until: 890, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
    { at: 740, until: 1100, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.3, r1: 1.3, width: 0.05 } },
    { at: 750, until: 1150, layer: 'front', drawer: 'shards', params: { count: 8, distance: 1.0, spin: 240 } },
    { at: 700, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
  ],
  particles: [spark({ at: 750, count: 12, distance: 1.2 })],
});

export const steelBeam = spec({
  id: 'steel-beam',
  name: 'Steel Beam',
  statClass: 'special',
  tier: 3,
  family: 'beam',
  durationMs: 2000,
  contactMs: 1080,
  pad: 2.2,
  // The attacker's steel flares as sparks and floor rings gather to an orb; three shock rings
  // fire a wide beam that holds on the defender in a splash of splinters, then a closing blast.
  attacker: { motion: 'rear-lurch', params: { rear: 0.16, lurch: 0.45, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.42, heat: 0.9 } },
  beats: [
    { at: 0, until: 900, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.42 } },
    { at: 0, until: 900, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.55, hz: 4 } },
    { at: 0, until: 860, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 3, r0: 0.3, r1: 1.3 } },
    ...glints(0, 820, { count: 6, r0: 0.05, r1: 0.1, tongues: 1 }),
    { at: 150, until: 880, layer: 'front', drawer: 'coreCharge', params: { lead: 0.45, r0: 0.12, r1: 0.36, from: 0.25 } },
    { at: 840, until: 1200, layer: 'back', drawer: 'shockRings', params: { count: 3, delay: 0.25, r0: 0.3, r1: 1.4 } },
    // The beam head lands at contact: 900 + 0.2 x 900 = 1080.
    { at: 900, until: 1800, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.42, growIn: 0.2, retract: 0.25 } },
    { at: 1080, until: 1260, layer: 'top', drawer: 'impactFlash', params: { r1: 1.4 } },
    { at: 1080, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.35, r1: 1.5, width: 0.06 } },
    { at: 1090, until: 1500, layer: 'front', drawer: 'shards', params: { count: 10, distance: 1.1, spin: 300 } },
    { at: 1300, until: 1700, layer: 'front', drawer: 'shards', params: { count: 8, distance: 0.9, spin: 200 } },
    { at: 1500, until: 1680, layer: 'top', drawer: 'impactFlash', params: { r0: 0.5, r1: 1.2 } },
    { at: 1500, until: 1950, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.4, drift: 0.5, alpha: 0.35 } },
    { at: 1000, until: 1950, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
  ],
  particles: [
    spark({ at: 1090, count: 14, distance: 1.4 }),
    spark({ at: 1510, kind: 'shard', count: 10, aspect: 1, size: [0.04, 0.09] }),
  ],
});

export const STEEL_SPECS = Object.freeze(
  Object.fromEntries(
    [bulletPunch, metalClaw, smartStrike, steelWing, ironTail, ironHead, flashCannon, steelBeam].map((s) => [s.id, s])
  )
);
