// Design 063: Dragon specs, one per move of the Dragon row of the move table. Dragon had no
// Appendix A entries, so this slice ran the study pass first, reading every reference itself
// (sprite N2B2 / Pokémon Central IT5 + the newest 3D video per move, Poképédia; notes in
// .agent/scratch/moves/dragon/g7d-dragon.md).
//
// Every move draws in the one dragon material, violet flame with an ember core start to
// payoff: the sprite games' white chops, pink power-up streaks, Outrage's flame wall, Dragon
// Breath's magenta stream, Dragon Pulse's pale orbs and Draco Meteor's grey and crimson rocks
// all become the material's violet and ember. The sprite games' whole-scene effects (Outrage's
// black-out and flame wall, Dragon Pulse's dark, Draco Meteor's night sky) are local vignettes
// and auras; the modern ray streaks and white-outs are a local impact flash. Draco Meteor's
// meteors fall from the sky (`volley` from 'sky', the recipe's signature) and crack the floor
// on landing. The physicals carry their weight in the card (`dash`, a hard knock); Dual Chop
// lands two chops and Outrage a flurry of four blows (`stagger`), each with its own flash.

/** A CSS ember burst flung off the defender (orange streaks that fall). */
const ember = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 10,
    distance: 1,
    direction: -90,
    spread: 300,
    size: [0.05, 0.11],
    aspect: 0.3,
    gravity: 0.4,
    maxDelay: 0.12,
    durationMs: 700,
    kind: 'ember',
    ...over,
  });

const spec = (over) => Object.freeze({ vgType: 'dragon', material: 'dragon', pad: 1.7, grain: 0.25, ...over });

/** One blow on the defender at `at`: an impact ring, a burst of dragon scales, a flash on top. */
const blow = (at, { ring = 0.9, scales = 4, reach = 0.6, flash = 0.8 } = {}) => [
  { at, until: at + 240, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.3, r1: ring, width: 0.045 } },
  { at, until: at + 260, layer: 'front', drawer: 'shards', params: { count: scales, distance: reach, spin: 200 } },
  { at, until: at + 140, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: flash } },
];

// ---- physical ------------------------------------------------------------------------

export const dualChop = spec({
  id: 'dual-chop',
  name: 'Dual Chop',
  statClass: 'physical',
  tier: 2,
  family: 'slash',
  durationMs: 1500,
  contactMs: 700,
  // The edge of the hand flares as the attacker dashes in; a chop down across the defender,
  // then a second, crossing it, 140 ms later; embers fall off each.
  attacker: { motion: 'dash', params: { wind: 0.2, reach: 0.9, overshoot: 0.2, arc: 0.3 } },
  defender: { motion: 'stagger', params: { strength: 0.32, hits: 2, gapMs: 140, heat: 0.6 } },
  beats: [
    { at: 0, until: 640, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.45, hz: 3 } },
    { at: 120, until: 560, layer: 'front', drawer: 'coreCharge', params: { r0: 0.06, r1: 0.16, from: 0.2 } },
    { at: 640, until: 880, layer: 'front', drawer: 'slashArc', params: { sweep: 130, radius: 0.55, angle: -40, thick: 0.22 } },
    { at: 700, until: 860, layer: 'top', drawer: 'impactFlash', params: { r0: 0.35, r1: 1.0 } },
    { at: 700, until: 1000, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.3, r1: 1.1, width: 0.05 } },
    { at: 710, until: 1050, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.8, spin: 200 } },
    // The second chop is mostly through when its blow lands at 840 (contact + gapMs).
    { at: 780, until: 1020, layer: 'front', drawer: 'slashArc', params: { sweep: 130, radius: 0.5, angle: 140, thick: 0.22 } },
    { at: 840, until: 980, layer: 'top', drawer: 'impactFlash', params: { r0: 0.35, r1: 0.95 } },
    { at: 850, until: 1200, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.8, spin: 200 } },
    { at: 650, until: 1450, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.32 } },
    { at: 900, until: 1450, layer: 'front', drawer: 'smoke', params: { count: 5, rise: 0.7 } },
  ],
  particles: [ember({ at: 700, count: 8, distance: 0.9, gravity: 0.5 }), ember({ at: 840, count: 8, distance: 0.9, gravity: 0.5 })],
});

export const dragonClaw = spec({
  id: 'dragon-claw',
  name: 'Dragon Claw',
  statClass: 'physical',
  tier: 2,
  family: 'slash',
  durationMs: 1400,
  contactMs: 740,
  // Violet flame streaks rise off the attacker as it powers up; it dashes in and rakes the
  // defender twice, a pair of claws from the upper left, then a pair from the upper right.
  attacker: { motion: 'dash', params: { wind: 0.25, reach: 0.85, overshoot: 0.25, arc: 0.35 } },
  defender: { motion: 'knock', params: { strength: 0.34, heat: 0.6 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.55, hz: 4 } },
    {
      at: 0,
      until: 620,
      layer: 'front',
      drawer: 'splash',
      params: { target: 'attacker', count: 6, arc: 70, direction: -90, gravity: 0, len: [0.5, 0.9], stagger: 0.08 },
    },
    { at: 680, until: 920, layer: 'front', drawer: 'slashArc', params: { sweep: 120, radius: 0.6, angle: -135, thick: 0.16 } },
    { at: 700, until: 940, layer: 'front', drawer: 'slashArc', params: { sweep: 120, radius: 0.42, angle: -135, thick: 0.14 } },
    { at: 740, until: 900, layer: 'top', drawer: 'impactFlash', params: { r0: 0.35, r1: 1.05 } },
    { at: 740, until: 1040, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.3, r1: 1.15, width: 0.05 } },
    { at: 750, until: 1100, layer: 'front', drawer: 'shards', params: { count: 8, distance: 1.0, spin: 240 } },
    { at: 800, until: 1040, layer: 'front', drawer: 'slashArc', params: { sweep: 120, radius: 0.6, angle: -45, thick: 0.16 } },
    { at: 820, until: 1060, layer: 'front', drawer: 'slashArc', params: { sweep: 120, radius: 0.42, angle: -45, thick: 0.14 } },
    { at: 700, until: 1350, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35 } },
  ],
  particles: [ember({ at: 750, count: 10, distance: 1.0 })],
});

export const outrage = spec({
  id: 'outrage',
  name: 'Outrage',
  statClass: 'physical',
  tier: 3,
  family: 'roar',
  durationMs: 2000,
  contactMs: 1000,
  // The attacker rages in a local dusk: a violet flame vortex churns round it, scales fly off
  // it and rings pound the floor; it charges and hammers the defender with four blows, 100 ms
  // apart, the last the biggest.
  attacker: { motion: 'dash', params: { wind: 0.3, reach: 0.9, overshoot: 0.3, arc: 0.45 } },
  defender: { motion: 'stagger', params: { strength: 0.45, hits: 4, gapMs: 100, heat: 0.8 } },
  beats: [
    { at: 0, until: 750, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.42 } },
    { at: 0, until: 650, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.6, hz: 5 } },
    { at: 0, until: 650, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 3, r0: 0.3, r1: 1.3 } },
    { at: 0, until: 600, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 1.5, r0: 0.3, r1: 0.85, rpm: 200, tongues: 10 } },
    { at: 300, until: 650, layer: 'front', drawer: 'shards', params: { target: 'attacker', count: 6, distance: 0.6, spin: 300 } },
    ...blow(1000),
    ...blow(1100),
    ...blow(1200),
    ...blow(1300, { ring: 1.3, scales: 8, reach: 1.0, flash: 1.25 }),
    { at: 950, until: 1900, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    { at: 1350, until: 1950, layer: 'front', drawer: 'smoke', params: { count: 6, rise: 0.9 } },
  ],
  particles: [ember({ at: 1000, count: 10, distance: 1.1 }), ember({ at: 1300, count: 12, distance: 1.3 })],
});

// ---- special -------------------------------------------------------------------------

export const twister = spec({
  id: 'twister',
  name: 'Twister',
  statClass: 'special',
  tier: 1,
  family: 'wind',
  durationMs: 1100,
  contactMs: 600,
  // Dust kicks up at the defender's feet and a violet whirlwind spins up round it; at its
  // height a flash, a floor ring and debris thrown off the funnel.
  attacker: { motion: 'brace', params: { rear: 0.06, scale: 1.04, glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.22, heat: 0.4 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.4, hz: 3 } },
    { at: 0, until: 500, layer: 'back', drawer: 'terrain', params: { kind: 'dust', radius: 0.9 } },
    { at: 120, until: 950, layer: 'front', drawer: 'spiral', params: { turns: 2.5, r0: 0.2, r1: 0.8, rpm: 180, tongues: 10 } },
    { at: 600, until: 760, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.9 } },
    { at: 600, until: 900, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.1 } },
    { at: 620, until: 950, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.8, spin: 300 } },
    { at: 650, until: 1100, layer: 'front', drawer: 'smoke', params: { count: 4, rise: 0.6 } },
  ],
  particles: [ember({ at: 620, count: 8, distance: 0.9, gravity: 0.2 })],
});

export const dragonBreath = spec({
  id: 'dragon-breath',
  name: 'Dragon Breath',
  statClass: 'special',
  tier: 2,
  family: 'beam',
  durationMs: 1400,
  contactMs: 700,
  // An orb gathers at the mouth; a ring releases a widening stream of violet flame that pours
  // down the lane and engulfs the defender in breath, scales and sparkles.
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.35, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.8 } },
  beats: [
    { at: 0, until: 560, layer: 'front', drawer: 'coreCharge', params: { lead: 0.45, r0: 0.08, r1: 0.28, from: 0.2 } },
    { at: 480, until: 800, layer: 'back', drawer: 'shockRings', params: { count: 1, r0: 0.25, r1: 0.9 } },
    // The stream's head lands at contact: 520 + 0.25 x 720 = 700.
    { at: 520, until: 1240, layer: 'front', drawer: 'beam', params: { kind: 'widening', w: 0.55, growIn: 0.25, retract: 0.3 } },
    { at: 700, until: 860, layer: 'top', drawer: 'impactFlash', params: { r1: 1.15 } },
    { at: 700, until: 1050, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.2, width: 0.05 } },
    { at: 720, until: 1150, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.35, drift: 0.4, alpha: 0.45 } },
    { at: 730, until: 1100, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.9, spin: 200 } },
    { at: 650, until: 1350, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
  ],
  particles: [
    ember({ at: 710, count: 12, distance: 1.1, gravity: 0.3 }),
    ember({ at: 900, kind: 'mote', count: 8, distance: 0.8, gravity: 0, size: [0.03, 0.06], aspect: 1, maxDelay: 0.3 }),
  ],
});

export const dragonPulse = spec({
  id: 'dragon-pulse',
  name: 'Dragon Pulse',
  statClass: 'special',
  tier: 3,
  family: 'roar',
  durationMs: 1950,
  contactMs: 1000,
  pad: 2.2,
  // In a local dark, small orbs circle a dragon orb swelling at the mouth; three shock rings
  // release it as a chain of five orbs that streams down the lane and bursts on the defender
  // in rings and scales. The chain is a staggered volley, not `beam 'pulse-train'`: on a lane
  // ~1.2 h long the pulse train's six orbs wrap onto each other and read as one white bar.
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.45, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.38, heat: 0.9 } },
  beats: [
    { at: 0, until: 900, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.42 } },
    { at: 0, until: 820, layer: 'back', drawer: 'orbitCharge', params: { half: 'back', count: 4, r0: 0.08, r1: 0.14, tongues: 2 } },
    { at: 0, until: 820, layer: 'front', drawer: 'orbitCharge', params: { half: 'front', count: 4, r0: 0.08, r1: 0.14, tongues: 2 } },
    { at: 100, until: 840, layer: 'front', drawer: 'coreCharge', params: { lead: 0.45, r0: 0.14, r1: 0.46, from: 0.2 } },
    { at: 780, until: 1150, layer: 'back', drawer: 'shockRings', params: { count: 3, delay: 0.25, r0: 0.3, r1: 1.3 } },
    // Five orbs, 80 ms apart: flight = 500 - 4 x 80 = 180 ms, so the head lands at 1000 and
    // the chain keeps pouring in until 1320.
    {
      at: 820,
      until: 1320,
      layer: 'front',
      drawer: 'volley',
      params: { count: 5, stagger: 80, r0: 0.14, r1: 0.2, bow: 0.08, tongues: 2 },
    },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
    { at: 1000, until: 1450, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.35, r1: 1.5, width: 0.06 } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'shards', params: { count: 10, distance: 1.1, spin: 240 } },
    { at: 950, until: 1900, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    { at: 1450, until: 1950, layer: 'front', drawer: 'smoke', params: { count: 6, rise: 0.9 } },
  ],
  particles: [ember({ at: 1010, count: 12, distance: 1.2, gravity: 0.3 }), ember({ at: 1250, count: 10, distance: 1.3, gravity: 0.3 })],
});

export const dracoMeteor = spec({
  id: 'draco-meteor',
  name: 'Draco Meteor',
  statClass: 'special',
  tier: 3,
  family: 'roar',
  durationMs: 2100,
  contactMs: 1100,
  pad: 2.0,
  // An orb gathers on the attacker and shoots skyward as a column of violet flame; four
  // meteors fall onto the defender from above, 110 ms apart, cracking the floor; the last
  // bursts in scales and a violet cloud.
  attacker: { motion: 'rear-lurch', params: { rear: 0.16, lurch: 0.3, glow: 1 } },
  defender: { motion: 'stagger', params: { strength: 0.45, hits: 4, gapMs: 110, heat: 0.9 } },
  beats: [
    { at: 0, until: 900, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.42 } },
    { at: 0, until: 600, layer: 'front', drawer: 'coreCharge', params: { lead: 0, r0: 0.12, r1: 0.4, from: 0.15 } },
    { at: 460, until: 900, layer: 'front', drawer: 'pillar', params: { target: 'attacker', from: 'below', height: 2.0, w: 0.4 } },
    // Four meteors, 110 ms apart: flight = 670 - 3 x 110 = 340 ms, so the first lands at 1100.
    {
      at: 760,
      until: 1430,
      layer: 'front',
      drawer: 'volley',
      params: { from: 'sky', count: 4, stagger: 110, r0: 0.16, r1: 0.26, bow: 0.2, tongues: 4 },
    },
    { at: 1100, until: 1280, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
    { at: 1100, until: 1700, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.3 } },
    { at: 1100, until: 1550, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 3, r0: 0.3, r1: 1.6 } },
    { at: 1100, until: 1450, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.9, spin: 240 } },
    { at: 1210, until: 1350, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.9 } },
    { at: 1320, until: 1460, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.9 } },
    { at: 1430, until: 1610, layer: 'top', drawer: 'impactFlash', params: { r1: 1.35 } },
    { at: 1430, until: 1900, layer: 'front', drawer: 'shards', params: { count: 10, distance: 1.2, spin: 300 } },
    { at: 1450, until: 2000, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.4, drift: 0.4, alpha: 0.4 } },
    { at: 1150, until: 2050, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.5 } },
    { at: 1500, until: 2100, layer: 'front', drawer: 'smoke', params: { count: 7, rise: 1.0 } },
  ],
  particles: [ember({ at: 1100, count: 12, distance: 1.2, gravity: 0.6 }), ember({ at: 1430, count: 12, distance: 1.4, gravity: 0.6 })],
});

export const DRAGON_SPECS = Object.freeze(
  Object.fromEntries([dualChop, dragonClaw, outrage, twister, dragonBreath, dragonPulse, dracoMeteor].map((s) => [s.id, s]))
);
