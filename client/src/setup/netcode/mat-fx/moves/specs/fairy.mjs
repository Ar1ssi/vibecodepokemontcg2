// Design 063: Fairy specs, one per move of the Fairy row of the move table. Fairy had no
// Appendix A entries, so this slice ran the study pass first, reading every reference itself.
// Every Fairy move is Gen 6+, so none has a sprite-era animation: each entry reads the newest
// 3D video only (Poképédia <move>_EV.mp4; notes in .agent/scratch/moves/fairy/g8b-fairy.md).
//
// Every move draws in the one fairy material, pink with a gold accent start to payoff: the
// references' blue gem light (Dazzling Gleam), green heal orbs and rings (Draining Kiss), cyan
// moon sparkles (Moonblast) and white fight cloud (Play Rough) all become the material's pink
// and gold. The references' whole-scene effects (Spirit Break's burst, rays and violet tint,
// Disarming Voice's pink sky, Moonblast's night) are local vignettes; their starbursts and
// radial sparkle lines are sparkle shards and the fairy star (`glyph`). The physicals carry
// their weight in the card (`dash`); Play Rough is a flurry of four blows inside a churning
// cloud. The sound and kiss moves land on a ring, so they sound the chime.

/** A CSS twinkle burst (four-point sparkles in the material's pink) drifting off the defender. */
const twinkles = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 10,
    distance: 0.9,
    direction: -90,
    spread: 360,
    size: [0.05, 0.1],
    aspect: 1,
    gravity: 0,
    maxDelay: 0.2,
    durationMs: 700,
    kind: 'twinkle',
    ...over,
  });

const spec = (over) => Object.freeze({ vgType: 'fairy', material: 'fairy', pad: 1.7, grain: 0, ...over });

/** One blow of Play Rough's flurry at `at`: a flash, a whoosh line and a few sparkle shards. */
const scuffle = (at, angle, { flash = 0.8, shards = 4 } = {}) => [
  { at: at - 20, until: at + 160, layer: 'front', drawer: 'slashArc', params: { sweep: 100, radius: 0.55, angle, thick: 0.1 } },
  { at, until: at + 300, layer: 'front', drawer: 'shards', params: { count: shards, distance: 0.75, spin: 300 } },
  { at, until: at + 140, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: flash } },
];

// ---- physical ------------------------------------------------------------------------

export const spiritBreak = spec({
  id: 'spirit-break',
  name: 'Spirit Break',
  statClass: 'physical',
  tier: 2,
  family: 'dash',
  durationMs: 1400,
  contactMs: 760,
  // A pink halo closes round the attacker as it powers up; it dashes in, a fairy star glints
  // on the defender just ahead of the blow, and the blow bursts in sparkles and pink bokeh.
  attacker: { motion: 'dash', params: { wind: 0.2, reach: 0.85, overshoot: 0.15, arc: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 650, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 3 } },
    { at: 0, until: 600, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.8, r1: 0.6, width: 0.04 } },
    { at: 100, until: 650, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 5, radius: 0.2, drift: 0.3, alpha: 0.4 } },
    { at: 520, until: 820, layer: 'front', drawer: 'glyph', params: { r: 0.45 } },
    { at: 760, until: 920, layer: 'top', drawer: 'impactFlash', params: { r0: 0.35, r1: 1.1 } },
    { at: 760, until: 1100, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.3, width: 0.05 } },
    { at: 760, until: 1150, layer: 'front', drawer: 'shards', params: { count: 8, distance: 1.0, spin: 240 } },
    { at: 800, until: 1350, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35 } },
    { at: 850, until: 1400, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.25, drift: 0.4, alpha: 0.4 } },
  ],
  particles: [twinkles({ at: 780, count: 12, distance: 1.0 })],
});

export const playRough = spec({
  id: 'play-rough',
  name: 'Play Rough',
  statClass: 'physical',
  tier: 3,
  family: 'dash',
  durationMs: 1700,
  contactMs: 720,
  // The attacker bounds in and a pink fight cloud billows over the defender; four blows land
  // inside it, 110 ms apart, each a flash, a whoosh and sparkles; gold stars fly out of it.
  attacker: { motion: 'dash', params: { wind: 0.25, reach: 0.85, overshoot: 0.2, arc: 0.35 } },
  defender: { motion: 'stagger', params: { strength: 0.42, hits: 4, gapMs: 110, heat: 0.5 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.45, hz: 4 } },
    { at: 600, until: 1550, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
    { at: 650, until: 1600, layer: 'front', drawer: 'cloud', params: { count: 7, radius: 0.42, drift: 0.15, alpha: 0.3 } },
    ...scuffle(720, -40),
    ...scuffle(830, 140),
    ...scuffle(940, 20),
    ...scuffle(1050, 200, { flash: 1.1, shards: 6 }),
  ],
  particles: [
    twinkles({ at: 740, kind: 'star', count: 10, distance: 1.2, size: [0.06, 0.11] }),
    twinkles({ at: 1050, count: 12, distance: 1.1, maxDelay: 0.3 }),
  ],
});

// ---- special -------------------------------------------------------------------------

export const disarmingVoice = spec({
  id: 'disarming-voice',
  name: 'Disarming Voice',
  statClass: 'special',
  tier: 1,
  family: 'chime',
  durationMs: 1100,
  contactMs: 580,
  // Sound rings leave the attacker and twinkles ride them down the lane; the rings close on
  // the defender and burst there in sparkles and a ring.
  attacker: { motion: 'brace', params: { rear: 0.06, scale: 1.05, glow: 0.7 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.3 } },
  beats: [
    { at: 0, until: 450, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 4 } },
    { at: 60, until: 560, layer: 'back', drawer: 'shockRings', params: { count: 3, delay: 0.25, r0: 0.25, r1: 1.2, squash: 0.8 } },
    // Four twinkles 50 ms apart: flight = 380 - 3 x 50 = 230 ms, so the last lands at contact.
    { at: 200, until: 580, layer: 'front', drawer: 'volley', params: { count: 4, stagger: 50, r0: 0.08, r1: 0.12, bow: 0.3, tongues: 0 } },
    { at: 380, until: 580, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.8, r1: 0.6, width: 0.04 } },
    { at: 580, until: 740, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.85 } },
    { at: 580, until: 900, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.8, spin: 200 } },
    { at: 580, until: 1000, layer: 'front', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.2, width: 0.05 } },
  ],
  particles: [twinkles({ at: 600 })],
});

export const fairyWind = spec({
  id: 'fairy-wind',
  name: 'Fairy Wind',
  statClass: 'special',
  tier: 1,
  family: 'wind',
  durationMs: 1100,
  contactMs: 600,
  // Pink wisps swirl round the attacker; a sparkle gust pours down the lane and winds into a
  // vortex round the defender, leaving a pink haze.
  attacker: { motion: 'brace', params: { rear: 0.06, scale: 1.04, glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.3 } },
  beats: [
    { at: 0, until: 450, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.45, hz: 3 } },
    { at: 0, until: 450, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 1.5, r0: 0.25, r1: 0.7, rpm: 160, tongues: 6 } },
    // The gust's head lands at contact: 480 + 0.25 x 480 = 600.
    { at: 480, until: 960, layer: 'front', drawer: 'beam', params: { kind: 'widening', w: 0.45, growIn: 0.25, retract: 0.3 } },
    { at: 500, until: 1000, layer: 'front', drawer: 'spiral', params: { turns: 2, r0: 0.25, r1: 0.85, rpm: 200, tongues: 8 } },
    { at: 600, until: 760, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.85 } },
    { at: 620, until: 1100, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.3, drift: 0.3, alpha: 0.4 } },
  ],
  particles: [twinkles({ at: 650, maxDelay: 0.3 })],
});

export const drainingKiss = spec({
  id: 'draining-kiss',
  name: 'Draining Kiss',
  statClass: 'special',
  tier: 2,
  family: 'chime',
  durationMs: 1400,
  contactMs: 600,
  // A twinkle gathers and is blown down the lane as a kiss; it bursts on the defender, motes
  // drain back up the lane into the attacker, and a ring closes round it as it is restored.
  attacker: { motion: 'rear-lurch', params: { rear: 0.08, lurch: 0.25, glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.28, heat: 0.5 } },
  beats: [
    { at: 0, until: 420, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.45, hz: 3 } },
    { at: 0, until: 400, layer: 'front', drawer: 'coreCharge', params: { lead: 0.4, r0: 0.08, r1: 0.2, from: 0.2 } },
    { at: 360, until: 600, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.25, r0: 0.14, r1: 0.18, tongues: 2, ease: 'linear' } },
    { at: 600, until: 760, layer: 'top', drawer: 'impactFlash', params: { r0: 0.35, r1: 1.0 } },
    { at: 600, until: 900, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.8, spin: 200 } },
    { at: 600, until: 1000, layer: 'front', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.2, width: 0.05 } },
    { at: 700, until: 1150, layer: 'front', drawer: 'volley', params: { from: 'defender', count: 5, stagger: 50, r0: 0.07, r1: 0.1, bow: 0.4, tongues: 0 } },
    { at: 1000, until: 1400, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.55, hz: 3 } },
    { at: 1050, until: 1400, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.8, r1: 0.6, width: 0.04 } },
  ],
  particles: [twinkles({ at: 620, count: 8 }), twinkles({ at: 1150, anchor: 'attacker', count: 8, distance: 0.7, maxDelay: 0.3 })],
});

export const dazzlingGleam = spec({
  id: 'dazzling-gleam',
  name: 'Dazzling Gleam',
  statClass: 'special',
  tier: 2,
  family: 'chime',
  durationMs: 1400,
  contactMs: 760,
  // A fairy star turns over a light gathering on the attacker while bokeh drifts off it; two
  // rings release a spray of twinkles that lands on the defender, where the star stamps.
  attacker: { motion: 'rear-lurch', params: { rear: 0.1, lurch: 0.3, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.6 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 2.5 } },
    { at: 0, until: 620, layer: 'front', drawer: 'coreCharge', params: { lead: 0.3, r0: 0.1, r1: 0.3, from: 0.2 } },
    { at: 80, until: 640, layer: 'front', drawer: 'glyph', params: { target: 'attacker', r: 0.55 } },
    { at: 300, until: 900, layer: 'back', drawer: 'cloud', params: { target: 'attacker', count: 6, radius: 0.18, drift: 0.6, alpha: 0.45 } },
    { at: 560, until: 880, layer: 'back', drawer: 'shockRings', params: { count: 2, r0: 0.3, r1: 1.1 } },
    // Five twinkles 40 ms apart: flight = 320 - 4 x 40 = 160 ms, so the first lands at contact.
    { at: 600, until: 920, layer: 'front', drawer: 'volley', params: { count: 5, stagger: 40, r0: 0.08, r1: 0.12, bow: 0.4, tongues: 1 } },
    { at: 700, until: 1150, layer: 'front', drawer: 'glyph', params: { r: 0.6 } },
    { at: 760, until: 920, layer: 'top', drawer: 'impactFlash', params: { r1: 1.15 } },
    { at: 760, until: 1150, layer: 'front', drawer: 'shards', params: { count: 8, distance: 1.0, spin: 240 } },
    { at: 760, until: 1150, layer: 'front', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.3, width: 0.05 } },
    { at: 800, until: 1350, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
  ],
  particles: [twinkles({ at: 780, count: 12, distance: 1.1 }), twinkles({ at: 1000, count: 8, distance: 0.8, maxDelay: 0.3 })],
});

export const moonblast = spec({
  id: 'moonblast',
  name: 'Moonblast',
  statClass: 'special',
  tier: 3,
  family: 'burst',
  durationMs: 2000,
  contactMs: 1100,
  // In a local night, moonlight falls on the attacker and twinkles circle it; the moon swells
  // at its edge and two rings send it down the lane; it bursts on the defender in crescents,
  // sparkle shards and the fairy star, and a pink haze lingers.
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.38, heat: 0.7 } },
  beats: [
    { at: 0, until: 950, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.42 } },
    { at: 100, until: 700, layer: 'front', drawer: 'pillar', params: { target: 'attacker', from: 'above', height: 1.3, w: 0.3 } },
    { at: 300, until: 950, layer: 'back', drawer: 'orbitCharge', params: { half: 'back', count: 5, r0: 0.06, r1: 0.1, tongues: 1 } },
    { at: 300, until: 950, layer: 'front', drawer: 'orbitCharge', params: { half: 'front', count: 5, r0: 0.06, r1: 0.1, tongues: 1 } },
    { at: 350, until: 900, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 2, r0: 0.4, r1: 1.0 } },
    { at: 500, until: 950, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.1, r1: 0.32, from: 0.2 } },
    { at: 880, until: 1200, layer: 'back', drawer: 'shockRings', params: { count: 2, r0: 0.3, r1: 1.2 } },
    { at: 900, until: 1100, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.3, r1: 0.36, tongues: 4 } },
    { at: 1000, until: 1950, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
    { at: 1050, until: 1500, layer: 'front', drawer: 'glyph', params: { r: 0.7 } },
    { at: 1100, until: 1280, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
    { at: 1100, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.35, r1: 1.5, width: 0.06 } },
    // Two crescents sweep round the defender, opposite each other.
    { at: 1100, until: 1450, layer: 'front', drawer: 'slashArc', params: { sweep: 160, radius: 0.75, count: 2, gapDeg: 180, angle: -30, thick: 0.14 } },
    { at: 1100, until: 1600, layer: 'front', drawer: 'shards', params: { count: 10, distance: 1.2, spin: 240 } },
    { at: 1250, until: 1950, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.35, drift: 0.3, alpha: 0.4 } },
  ],
  particles: [twinkles({ at: 1100, count: 14, distance: 1.3 }), twinkles({ at: 1400, count: 10, distance: 1.0, maxDelay: 0.3 })],
});

export const FAIRY_SPECS = Object.freeze(
  Object.fromEntries([spiritBreak, playRough, disarmingVoice, fairyWind, drainingKiss, dazzlingGleam, moonblast].map((s) => [s.id, s]))
);
