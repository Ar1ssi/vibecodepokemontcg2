// Design 063: Electric specs, one per move of the Electric row of the move table, from the
// design's Appendix A Electric entries (B2W2 sprites + Scarlet/Violet videos; Nuzzle and
// Electro Shot are video-only, Shock Wave has no reference). Times are the entries' except
// where the validator's tier bands or contact band forced a re-time (Thunder Fang, Shock
// Wave); each is a line under the design's § Deviations. Sparks are the electric material:
// `shards` throw jag sparks, `bolt` strikes in the material's lightning passes. Every hit is
// local to the defender: Thunder's yellow sky became a storm-slate vignette round the
// defender, and Zap Cannon's full-screen sunburst became floor rings and sparks.

/** A CSS spark burst with the electric defaults (thin white-yellow streaks, no gravity). */
const burst = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 10,
    distance: 1,
    direction: -90,
    spread: 360,
    size: [0.04, 0.09],
    aspect: 0.2,
    gravity: 0,
    maxDelay: 0.12,
    durationMs: 600,
    kind: 'streak',
    ...over,
  });

const spec = (over) => Object.freeze({ vgType: 'electric', material: 'electric', family: 'electric', pad: 1.7, grain: 0, ...over });

/** Crackling sparks circling a card: the two halves of one orbit (behind / over the ghost). */
const orbit = (at, until, params) => [
  { at, until, layer: 'back', drawer: 'orbitCharge', params: { half: 'back', ...params } },
  { at, until, layer: 'front', drawer: 'orbitCharge', params: { half: 'front', ...params } },
];

// ---- physical ------------------------------------------------------------------------

export const nuzzle = spec({
  id: 'nuzzle',
  name: 'Nuzzle',
  statClass: 'physical',
  tier: 1,
  durationMs: 950,
  contactMs: 400,
  // A hop, a quick dart in and straight back: an affectionate rub, not a strike.
  attacker: { motion: 'dash', params: { wind: 0.12, reach: 0.7, overshoot: 0, arc: 0.2 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.5 } },
  beats: [
    { at: 0, until: 400, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.45, hz: 4 } },
    // The white-blue ring tightening on the defender before the rub lands.
    { at: 200, until: 400, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.8, r1: 0.6, width: 0.04 } },
    { at: 400, until: 700, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.4, r1: 1.0, width: 0.04 } },
    { at: 400, until: 800, layer: 'front', drawer: 'shards', params: { count: 6, arc: 120, direction: -90, distance: 0.5, spin: 120 } },
    { at: 450, until: 800, layer: 'back', drawer: 'aura', params: { target: 'defender', alpha: 0.45, hz: 4 } },
    { at: 400, until: 540, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.8 } },
  ],
  particles: [burst({ at: 450, count: 8, distance: 0.9, spread: 120, maxDelay: 0.3, durationMs: 650 })],
});

export const thunderFang = spec({
  id: 'thunder-fang',
  name: 'Thunder Fang',
  statClass: 'physical',
  tier: 2,
  durationMs: 1200,
  contactMs: 600,
  attacker: { motion: 'dash', params: { wind: 0.2, reach: 0.85, overshoot: 0.1, arc: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.5 } },
  beats: [
    // The charge builds at the mouth, then the fang spark rides the dash in.
    { at: 0, until: 450, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.55, hz: 3 } },
    { at: 0, until: 450, layer: 'front', drawer: 'coreCharge', params: { r0: 0.1, r1: 0.26, from: 0.2 } },
    { at: 450, until: 600, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.16, r1: 0.22, tongues: 3 } },
    { at: 600, until: 900, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 0.6, spin: 240 } },
    { at: 700, until: 1000, layer: 'front', drawer: 'shards', params: { count: 6, arc: 140, direction: -90, distance: 0.8, spin: 180 } },
    { at: 700, until: 1100, layer: 'back', drawer: 'aura', params: { target: 'defender', alpha: 0.45, hz: 3 } },
    { at: 600, until: 780, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
  ],
  particles: [
    burst({ at: 600, count: 12, distance: 1.0 }),
    burst({ at: 750, count: 8, distance: 0.9, spread: 110, maxDelay: 0.3, durationMs: 650 }),
  ],
});

export const wildCharge = spec({
  id: 'wild-charge',
  name: 'Wild Charge',
  statClass: 'physical',
  tier: 3,
  durationMs: 1600,
  contactMs: 750,
  attacker: { motion: 'dash', params: { wind: 0.3, reach: 1.0, overshoot: 0.1, arc: 0.4 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.5 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.6, hz: 4 } },
    // Three crackling sparks round the body while it crouches and charges.
    ...orbit(300, 700, { count: 3, r0: 0.1, r1: 0.14, tongues: 2, tilt: 0.5 }),
    // The lightning trail the charge leaves behind it, still lit at contact.
    { at: 600, until: 820, layer: 'front', drawer: 'bolt', params: { segments: 8, jag: 0.1, branches: 1, width: 0.08 } },
    { at: 750, until: 1050, layer: 'front', drawer: 'shards', params: { count: 12, arc: 360, distance: 1.0, spin: 240 } },
    { at: 850, until: 1400, layer: 'front', drawer: 'shards', params: { count: 8, arc: 140, direction: -90, distance: 1.2, spin: 180 } },
    { at: 850, until: 1450, layer: 'back', drawer: 'aura', params: { target: 'defender', alpha: 0.5, hz: 3 } },
    { at: 750, until: 930, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
  ],
  particles: [
    burst({ at: 750, count: 12, distance: 1.2 }),
    burst({ at: 950, count: 8, distance: 1.0, spread: 120, maxDelay: 0.3, durationMs: 700 }),
  ],
});

// ---- special -------------------------------------------------------------------------

export const thunderShock = spec({
  id: 'thunder-shock',
  name: 'Thunder Shock',
  statClass: 'special',
  tier: 1,
  durationMs: 1000,
  contactMs: 450,
  attacker: { motion: 'brace', params: { rear: 0.06, scale: 1.03, glow: 0.7 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.5 } },
  beats: [
    { at: 0, until: 300, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 4 } },
    { at: 150, until: 450, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.1, r1: 0.14, tongues: 3 } },
    { at: 450, until: 700, layer: 'front', drawer: 'shards', params: { count: 4, arc: 120, direction: -90, distance: 0.3, spin: 120 } },
    { at: 550, until: 800, layer: 'front', drawer: 'shards', params: { count: 2, arc: 100, direction: -90, distance: 0.4, spin: 90 } },
    { at: 450, until: 590, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.8 } },
  ],
  particles: [burst({ at: 450, count: 6, distance: 0.6, spread: 160, durationMs: 500 })],
});

export const shockWave = spec({
  id: 'shock-wave',
  name: 'Shock Wave',
  statClass: 'special',
  tier: 2,
  durationMs: 1200,
  contactMs: 500,
  attacker: { motion: 'rear-lurch', params: { rear: 0.08, lurch: 0.25, glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.5 } },
  beats: [
    { at: 0, until: 400, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.55, hz: 3 } },
    // No projectile: rings roll off the attacker and wash over the defender (it never misses).
    { at: 150, until: 650, layer: 'back', drawer: 'shockRings', params: { count: 3, delay: 0.25, r0: 0.3, r1: 1.8, squash: 0.6 } },
    { at: 500, until: 850, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.2, width: 0.05 } },
    { at: 500, until: 850, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 0.6, spin: 200 } },
    { at: 600, until: 1000, layer: 'back', drawer: 'aura', params: { target: 'defender', alpha: 0.45, hz: 4 } },
    { at: 500, until: 660, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
  ],
  particles: [
    burst({ at: 500, count: 10, distance: 0.9 }),
    burst({ at: 650, kind: 'mote', count: 8, distance: 0.8, spread: 120, aspect: 1, size: [0.03, 0.06], maxDelay: 0.3, durationMs: 700 }),
  ],
});

export const electroShot = spec({
  id: 'electro-shot',
  name: 'Electro Shot',
  statClass: 'special',
  tier: 3,
  durationMs: 2100,
  contactMs: 1200,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 0.5 } },
  beats: [
    { at: 0, until: 900, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.6, hz: 2.5 } },
    // The lattice: sparks wheeling in on a tightening orbit, then compressing to a core.
    ...orbit(200, 1000, { count: 6, r0: 0.08, r1: 0.12, tongues: 2, tilt: 0.55 }),
    { at: 600, until: 1000, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.4, r1: 1.2, width: 0.05 } },
    { at: 700, until: 1150, layer: 'front', drawer: 'coreCharge', params: { r0: 0.12, r1: 0.4, from: 0.2 } },
    // The segmented beam reaches the defender at 960 + 0.4 x 600 = contact.
    { at: 960, until: 1560, layer: 'front', drawer: 'beam', params: { kind: 'segmented', w: 0.45, growIn: 0.4, retract: 0.25 } },
    // The lightning inside the beam: on a short lane the dashes alone read as chevrons.
    { at: 1150, until: 1550, layer: 'front', drawer: 'bolt', params: { segments: 8, jag: 0.08, branches: 2, width: 0.1 } },
    { at: 1200, until: 1600, layer: 'front', drawer: 'shards', params: { count: 12, arc: 360, distance: 1.2, spin: 240 } },
    { at: 1300, until: 1800, layer: 'front', drawer: 'shards', params: { count: 8, arc: 140, direction: -90, distance: 1.0, spin: 180 } },
    { at: 1300, until: 2000, layer: 'back', drawer: 'aura', params: { target: 'defender', alpha: 0.5, hz: 3 } },
    { at: 1200, until: 1380, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
  ],
  particles: [
    burst({ at: 1200, count: 16, distance: 1.3 }),
    burst({ at: 1450, count: 10, distance: 1.0, spread: 120, maxDelay: 0.3, durationMs: 700 }),
  ],
});

export const thunder = spec({
  id: 'thunder',
  name: 'Thunder',
  statClass: 'special',
  tier: 3,
  durationMs: 2000,
  contactMs: 900,
  attacker: { motion: 'rear-lurch', params: { rear: 0.1, lurch: 0.15, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 0.5 } },
  beats: [
    // The storm gathers round the defender (the sprite's yellow sky, kept local and dark).
    { at: 0, until: 1500, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4, outer: 1.6 } },
    { at: 300, until: 900, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 3 } },
    ...orbit(400, 900, { count: 2, r0: 0.08, r1: 0.12, tongues: 2 }),
    // A forerunner flicker, then the strike from above: a main bolt and a thinner second strand.
    { at: 640, until: 860, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 10, jag: 0.1, branches: 1, width: 0.06 } },
    { at: 880, until: 1350, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 8, jag: 0.1, branches: 3, width: 0.1 } },
    { at: 900, until: 1250, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 12, jag: 0.1, branches: 2, width: 0.07, rerollMs: 60 } },
    { at: 900, until: 1300, layer: 'front', drawer: 'shards', params: { count: 12, arc: 360, distance: 1.3, spin: 240 } },
    { at: 1000, until: 1800, layer: 'front', drawer: 'shards', params: { count: 8, arc: 140, direction: -90, distance: 1.2, spin: 180 } },
    { at: 1000, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.6 } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'aura', params: { target: 'defender', alpha: 0.5, hz: 3 } },
    { at: 900, until: 1080, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
  ],
  particles: [
    burst({ at: 900, count: 14, distance: 1.3 }),
    burst({ at: 1150, count: 10, distance: 1.0, spread: 120, maxDelay: 0.3, durationMs: 700 }),
  ],
});

export const zapCannon = spec({
  id: 'zap-cannon',
  name: 'Zap Cannon',
  statClass: 'special',
  tier: 3,
  durationMs: 1800,
  contactMs: 800,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.5 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.6, hz: 3 } },
    ...orbit(300, 650, { count: 4, r0: 0.08, r1: 0.12, tongues: 2 }),
    { at: 300, until: 650, layer: 'front', drawer: 'coreCharge', params: { r0: 0.14, r1: 0.45, from: 0.2 } },
    // The big orb leaves slowly and closes fast.
    { at: 550, until: 800, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.4, r1: 0.5, tongues: 3 } },
    { at: 800, until: 1200, layer: 'front', drawer: 'shards', params: { count: 12, arc: 360, distance: 1.3, spin: 240 } },
    { at: 900, until: 1500, layer: 'front', drawer: 'shards', params: { count: 10, arc: 140, direction: -90, distance: 1.2, spin: 180 } },
    { at: 900, until: 1400, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 3, r0: 0.3, r1: 1.6 } },
    { at: 900, until: 1600, layer: 'back', drawer: 'aura', params: { target: 'defender', alpha: 0.5, hz: 3 } },
    { at: 800, until: 980, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
  ],
  particles: [
    burst({ at: 800, count: 16, distance: 1.3 }),
    burst({ at: 1000, count: 10, distance: 1.0, spread: 120, maxDelay: 0.3, durationMs: 700 }),
  ],
});

export const ELECTRIC_SPECS = Object.freeze(
  Object.fromEntries([nuzzle, thunderFang, wildCharge, thunderShock, shockWave, electroShot, thunder, zapCannon].map((s) => [s.id, s]))
);
