// Design 063: Grass specs, one per move of the Grass row of the move table, from the
// design's Appendix A Grass entries (B2W2 / Gen 5 sprites + Scarlet/Violet videos). Times are
// the entries' except where the validator's tier bands or contact band forced a re-time
// (Vine Whip, Absorb, Magical Leaf, Solar Beam, Seed Flare, Petal Dance, Energy Ball); each
// is a line under the design's § Deviations. Every hit is local to the defender: the
// references' full-screen dims and blooms (Absorb, Leaf Storm, Solar Beam) became a light
// local vignette and a defender-sized flash. Leaves are the grass material; Petal Dance draws
// its petals in its own pink (`petal`) and Energy Ball / Solar Beam use the recipe's light
// override (`solar`).

/** A CSS particle burst with the grass defaults (leaf flecks drifting, light gravity). */
const burst = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 10,
    distance: 1,
    direction: -90,
    spread: 360,
    size: [0.04, 0.08],
    aspect: 0.5,
    gravity: 0.3,
    maxDelay: 0.15,
    durationMs: 700,
    kind: 'leaf',
    ...over,
  });

const spec = (over) => Object.freeze({ vgType: 'grass', material: 'grass', pad: 1.7, grain: 0, ...over });

// ---- physical ------------------------------------------------------------------------

export const vineWhip = spec({
  id: 'vine-whip',
  name: 'Vine Whip',
  statClass: 'physical',
  tier: 1,
  family: 'slash',
  durationMs: 1000,
  contactMs: 400,
  attacker: { motion: 'lunge', params: { wind: 0.15, reach: 0.5 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.4 } },
  beats: [
    { at: 0, until: 380, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.4, hz: 2 } },
    // Two thin vine lashes crossing over the defender; the second carries the damage.
    { at: 220, until: 420, layer: 'front', drawer: 'slashArc', params: { sweep: 110, radius: 0.6, angle: -125, thick: 0.07 } },
    { at: 220, until: 340, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.6 } },
    { at: 400, until: 620, layer: 'front', drawer: 'slashArc', params: { sweep: 120, radius: 0.6, angle: -40, thick: 0.08 } },
    { at: 400, until: 540, layer: 'top', drawer: 'impactFlash', params: { r1: 0.9 } },
  ],
  particles: [burst({ at: 400, count: 10, distance: 0.8, spread: 140, gravity: 0, maxDelay: 0.2, durationMs: 550 })],
});

export const razorLeaf = spec({
  id: 'razor-leaf',
  name: 'Razor Leaf',
  statClass: 'physical',
  tier: 2,
  family: 'slash',
  durationMs: 1300,
  contactMs: 650,
  attacker: { motion: 'rear-lurch', params: { rear: 0.1, lurch: 0.3, glow: 0.7 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.5 } },
  beats: [
    { at: 0, until: 450, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 2.5 } },
    { at: 0, until: 450, layer: 'back', drawer: 'orbitCharge', params: { half: 'back', count: 6, r0: 0.08, r1: 0.12, tongues: 1, tilt: 0.45 } },
    { at: 0, until: 450, layer: 'front', drawer: 'orbitCharge', params: { half: 'front', count: 6, r0: 0.08, r1: 0.12, tongues: 1, tilt: 0.45 } },
    { at: 300, until: 660, layer: 'front', drawer: 'volley', params: { count: 8, stagger: 30, r0: 0.1, r1: 0.13, bow: 0.25, tongues: 1 } },
    { at: 650, until: 900, layer: 'front', drawer: 'slashArc', params: { count: 2, gapDeg: 70, sweep: 100, radius: 0.55, angle: -60, thick: 0.07 } },
    { at: 710, until: 960, layer: 'front', drawer: 'slashArc', params: { count: 2, gapDeg: 70, sweep: 100, radius: 0.55, angle: 120, thick: 0.07 } },
    { at: 650, until: 800, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
  ],
  particles: [burst({ at: 650, count: 10, distance: 0.9, durationMs: 650 })],
});

export const leafBlade = spec({
  id: 'leaf-blade',
  name: 'Leaf Blade',
  statClass: 'physical',
  tier: 3,
  family: 'slash',
  durationMs: 2000,
  contactMs: 950,
  attacker: { motion: 'lunge', params: { wind: 0.3, reach: 1.0 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 0.5 } },
  beats: [
    { at: 0, until: 400, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.45, hz: 2 } },
    // Three sword cuts, each a close fan of three blades (the sprite's afterimages).
    { at: 350, until: 600, layer: 'front', drawer: 'slashArc', params: { count: 3, gapDeg: 10, sweep: 110, radius: 0.65, angle: -135, thick: 0.1 } },
    { at: 650, until: 900, layer: 'front', drawer: 'slashArc', params: { count: 3, gapDeg: 10, sweep: 110, radius: 0.65, angle: -45, thick: 0.1 } },
    { at: 950, until: 1300, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.5, r1: 1.5, width: 0.05 } },
    { at: 950, until: 1800, layer: 'front', drawer: 'splash', params: { count: 12, arc: 360, gravity: 0.1, len: [0.5, 0.8], stagger: 0.02 } },
    { at: 950, until: 1200, layer: 'front', drawer: 'slashArc', params: { sweep: 150, radius: 0.5, angle: 90, thick: 0.16 } },
    { at: 950, until: 1130, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
  ],
  particles: [burst({ at: 950, count: 14, distance: 1.1, gravity: 0.4, durationMs: 800 })],
});

// ---- special -------------------------------------------------------------------------

export const absorb = spec({
  id: 'absorb',
  name: 'Absorb',
  statClass: 'special',
  tier: 1,
  family: 'projectile',
  durationMs: 1100,
  contactMs: 450,
  attacker: { motion: 'brace', params: { rear: 0.06, scale: 1.03, glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.4 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.25, outer: 1.3 } },
    // A ring tightens on the defender, then the drained motes fly back up the lane.
    { at: 0, until: 450, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.8, r1: 0.6 } },
    { at: 450, until: 850, layer: 'front', drawer: 'volley', params: { from: 'defender', count: 6, stagger: 40, r0: 0.07, r1: 0.1, bow: 0.45, tongues: 0 } },
    { at: 450, until: 590, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.8 } },
    { at: 750, until: 1100, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.55, hz: 3 } },
  ],
  particles: [burst({ at: 850, anchor: 'attacker', kind: 'mote', count: 8, distance: 0.6, gravity: 0, aspect: 1, size: [0.03, 0.06], durationMs: 600 })],
});

export const magicalLeaf = spec({
  id: 'magical-leaf',
  name: 'Magical Leaf',
  statClass: 'special',
  tier: 2,
  family: 'burst',
  durationMs: 1400,
  contactMs: 850,
  attacker: { motion: 'rear-lurch', params: { rear: 0.1, lurch: 0.3, glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.5 } },
  beats: [
    { at: 0, until: 450, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 2 } },
    { at: 0, until: 450, layer: 'front', drawer: 'splash', params: { target: 'attacker', count: 10, arc: 360, gravity: 0, len: [0.5, 0.8], stagger: 0.03 } },
    // Leaves curve in on the defender from both sides of the lane.
    { at: 400, until: 880, layer: 'front', drawer: 'volley', params: { count: 8, stagger: 30, r0: 0.1, r1: 0.13, bow: 0.5, tongues: 1 } },
    { at: 850, until: 1200, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.6, spin: 360 } },
    { at: 850, until: 1010, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
  ],
  particles: [burst({ at: 850, kind: 'mote', count: 10, distance: 0.8, gravity: 0, aspect: 1, maxDelay: 0.3, size: [0.03, 0.06], durationMs: 550 })],
});

export const leafStorm = spec({
  id: 'leaf-storm',
  name: 'Leaf Storm',
  statClass: 'special',
  tier: 3,
  family: 'wind',
  durationMs: 1900,
  contactMs: 1000,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.3, outer: 1.4 } },
    { at: 0, until: 600, layer: 'back', drawer: 'orbitCharge', params: { half: 'back', count: 6, r0: 0.1, r1: 0.14, tongues: 1 } },
    { at: 0, until: 600, layer: 'front', drawer: 'orbitCharge', params: { half: 'front', count: 6, r0: 0.1, r1: 0.14, tongues: 1 } },
    { at: 0, until: 600, layer: 'front', drawer: 'coreCharge', params: { r0: 0.1, r1: 0.3, from: 0.3 } },
    { at: 300, until: 750, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 2.5 } },
    { at: 300, until: 750, layer: 'back', drawer: 'ring', params: { target: 'attacker', count: 2, r0: 0.4, r1: 1.3 } },
    { at: 600, until: 1000, layer: 'front', drawer: 'volley', params: { count: 7, stagger: 30, r0: 0.12, r1: 0.16, bow: 0.45, tongues: 2 } },
    // The storm on the defender: spiky bursts inside a whirl of leaves.
    { at: 1000, until: 1400, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.9, spin: 360 } },
    { at: 1150, until: 1450, layer: 'front', drawer: 'shards', params: { count: 4, distance: 0.5, spin: 240 } },
    { at: 1000, until: 1750, layer: 'front', drawer: 'spiral', params: { turns: 2, r0: 0.3, r1: 1.0, rpm: 160, tongues: 14 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.1 } },
  ],
  particles: [burst({ at: 1000, count: 14, distance: 1.3, gravity: 0.2, durationMs: 800 })],
});

export const solarBeam = spec({
  id: 'solar-beam',
  name: 'Solar Beam',
  statClass: 'special',
  tier: 3,
  family: 'beam',
  material: 'solar',
  durationMs: 2200,
  contactMs: 1260,
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.35, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 0.7 } },
  beats: [
    { at: 0, until: 1000, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.55, hz: 1.5 } },
    { at: 0, until: 1000, layer: 'back', drawer: 'orbitCharge', params: { half: 'back', count: 6, r0: 0.05, r1: 0.08, tongues: 0 } },
    { at: 0, until: 1000, layer: 'front', drawer: 'orbitCharge', params: { half: 'front', count: 6, r0: 0.05, r1: 0.08, tongues: 0 } },
    { at: 200, until: 1050, layer: 'front', drawer: 'coreCharge', params: { r0: 0.08, r1: 0.28, from: 0.3 } },
    { at: 300, until: 800, layer: 'back', drawer: 'ring', params: { target: 'attacker', count: 2, r0: 0.4, r1: 1.3 } },
    // The beam reaches the defender at 1050 + 0.3 x 700 = contact.
    { at: 1050, until: 1750, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.45, growIn: 0.3, retract: 0.25 } },
    { at: 1260, until: 1600, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.5, r1: 1.6, width: 0.05 } },
    { at: 1300, until: 2100, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.3, drift: 0.4, alpha: 0.35 } },
    { at: 1260, until: 1440, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
  ],
  particles: [
    burst({ at: 1260, kind: 'mote', count: 16, distance: 1.2, gravity: 0, aspect: 1, size: [0.03, 0.07], durationMs: 750 }),
    burst({ at: 1500, kind: 'mote', count: 8, distance: 0.6, gravity: 0, aspect: 1, maxDelay: 0.3, size: [0.03, 0.06], durationMs: 600 }),
  ],
});

export const seedFlare = spec({
  id: 'seed-flare',
  name: 'Seed Flare',
  statClass: 'special',
  tier: 3,
  family: 'burst',
  durationMs: 1600,
  contactMs: 800,
  attacker: { motion: 'rear-lurch', params: { rear: 0.1, lurch: 0.25, glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.6 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5 } },
    { at: 0, until: 800, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.8, r1: 0.6 } },
    { at: 150, until: 800, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3, outer: 1.4 } },
    { at: 300, until: 800, layer: 'back', drawer: 'aura', params: { target: 'defender', alpha: 0.5, hz: 4 } },
    // The seed pod sprouts at the defender's base, then bursts.
    { at: 200, until: 800, layer: 'front', drawer: 'pillar', params: { height: 0.9, w: 0.4 } },
    { at: 800, until: 1250, layer: 'front', drawer: 'splash', params: { count: 10, arc: 360, gravity: 0.2, len: [0.6, 1.0] } },
    { at: 800, until: 1200, layer: 'front', drawer: 'shards', params: { count: 8, distance: 1.0, spin: 360 } },
    { at: 950, until: 1550, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.3, drift: 0.5, alpha: 0.35 } },
    { at: 800, until: 980, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
  ],
  particles: [
    burst({ at: 800, kind: 'mote', count: 14, distance: 1.2, gravity: 0, aspect: 1, size: [0.03, 0.07] }),
    burst({ at: 900, count: 8, distance: 0.8, gravity: 0.5 }),
  ],
});

export const petalDance = spec({
  id: 'petal-dance',
  name: 'Petal Dance',
  statClass: 'special',
  tier: 3,
  family: 'wind',
  material: 'petal',
  durationMs: 2000,
  contactMs: 900,
  attacker: { motion: 'spin', params: { turns: 1 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.5 } },
  beats: [
    { at: 0, until: 450, layer: 'front', drawer: 'splash', params: { target: 'attacker', count: 12, arc: 360, gravity: 0, len: [0.5, 0.9], stagger: 0.02 } },
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5 } },
    { at: 450, until: 900, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 1.5, r0: 0.3, r1: 0.9, rpm: 120, tongues: 8 } },
    { at: 400, until: 900, layer: 'front', drawer: 'volley', params: { count: 6, stagger: 40, r0: 0.12, r1: 0.16, bow: 0.5, tongues: 2 } },
    // Petals envelope the defender, then drift down and fade.
    { at: 900, until: 1900, layer: 'front', drawer: 'spiral', params: { turns: 2, r0: 0.3, r1: 1.0, rpm: 100, tongues: 14 } },
    { at: 1300, until: 1950, layer: 'front', drawer: 'rain', params: { count: 8, height: 1.2, spread: 1.0 } },
    { at: 900, until: 1080, layer: 'top', drawer: 'impactFlash', params: { r1: 1.1 } },
  ],
  particles: [burst({ at: 900, count: 12, distance: 1.1, aspect: 0.6, durationMs: 900 })],
});

export const energyBall = spec({
  id: 'energy-ball',
  name: 'Energy Ball',
  statClass: 'special',
  tier: 3,
  family: 'burst',
  material: 'solar',
  durationMs: 1600,
  contactMs: 800,
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.35, glow: 0.9 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.6 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 1, r0: 0.3, r1: 1.0 } },
    { at: 0, until: 520, layer: 'back', drawer: 'orbitCharge', params: { half: 'back', count: 4, r0: 0.05, r1: 0.07, tongues: 0 } },
    { at: 0, until: 520, layer: 'front', drawer: 'orbitCharge', params: { half: 'front', count: 4, r0: 0.05, r1: 0.07, tongues: 0 } },
    { at: 0, until: 520, layer: 'front', drawer: 'coreCharge', params: { r0: 0.08, r1: 0.22, from: 0.2 } },
    { at: 450, until: 800, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.22, r1: 0.3, tongues: 4 } },
    { at: 800, until: 1300, layer: 'back', drawer: 'aura', params: { target: 'defender', alpha: 0.45 } },
    { at: 800, until: 1200, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.8, spin: 300 } },
    { at: 950, until: 1500, layer: 'front', drawer: 'cloud', params: { count: 5, radius: 0.3, drift: 0.4, alpha: 0.35 } },
    { at: 800, until: 980, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
  ],
  particles: [burst({ at: 800, kind: 'mote', count: 14, distance: 1.1, gravity: 0, aspect: 1, size: [0.03, 0.07] })],
});

export const GRASS_SPECS = Object.freeze(
  Object.fromEntries(
    [vineWhip, razorLeaf, leafBlade, absorb, magicalLeaf, leafStorm, solarBeam, seedFlare, petalDance, energyBall].map((s) => [s.id, s])
  )
);
