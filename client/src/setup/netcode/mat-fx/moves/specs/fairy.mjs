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
//
// Design 075 user pass (slice 11): no auras, orbiting twinkles, halo rings or shock rings round
// the attacker; each move winds up with the attacker's motion and its own light forming. The
// moon, the kiss, the star and the crescents are what land; the contact flash is small and the
// heat faint (the TCG Live impact replaces the dressing in a game). Disarming Voice keeps its
// sound rings: the move is the sound wave.

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

/** The contact flash every fairy move keeps: small, so the star or moon reads through it. */
const flash = (at, r1 = 0.5) => ({ at, until: at + 140, layer: 'top', drawer: 'impactFlash', params: { r0: 0.2, r1 } });

/** One blow of Play Rough's flurry at `at`: a small flash, a whoosh line and a few sparkle shards. */
const scuffle = (at, angle, { last = false } = {}) => [
  { at: at - 20, until: at + 160, layer: 'front', drawer: 'slashArc', params: { sweep: 100, radius: 0.55, angle, thick: 0.1 } },
  { at, until: at + 300, layer: 'front', drawer: 'shards', params: { count: last ? 4 : 3, distance: 0.7, spin: 300 } },
  flash(at, last ? 0.6 : 0.5),
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
  // Pink light gathers on the attacker as it powers up; it dashes in, a fairy star glints on
  // the defender just ahead of the blow, and the blow bursts in sparkles and pink bokeh.
  attacker: { motion: 'dash', params: { wind: 0.2, reach: 0.85, overshoot: 0.15, arc: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.3 } },
  beats: [
    { at: 100, until: 650, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 4, radius: 0.2, drift: 0.3, alpha: 0.35 } },
    { at: 520, until: 860, layer: 'front', drawer: 'glyph', params: { r: 0.45 } },
    flash(760),
    { at: 760, until: 1100, layer: 'front', drawer: 'shards', params: { count: 5, distance: 0.9, spin: 240 } },
    { at: 800, until: 1350, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
    { at: 850, until: 1400, layer: 'front', drawer: 'cloud', params: { count: 4, radius: 0.25, drift: 0.4, alpha: 0.35 } },
  ],
  particles: [twinkles({ at: 780, count: 8, distance: 1.0 })],
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
  defender: { motion: 'stagger', params: { strength: 0.42, hits: 4, gapMs: 110, heat: 0.3 } },
  beats: [
    { at: 600, until: 1550, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.28 } },
    { at: 650, until: 1600, layer: 'front', drawer: 'cloud', params: { count: 7, radius: 0.48, drift: 0.2, alpha: 0.55, tint: { deep: '#C8C2CC', body: '#F2EEF4', hot: '#FFFFFF', core: '#FFFFFF' } } },
    ...scuffle(720, -40),
    ...scuffle(830, 140),
    ...scuffle(940, 20),
    ...scuffle(1050, 200, { last: true }),
  ],
  particles: [
    twinkles({ at: 740, kind: 'star', count: 6, distance: 1.1, size: [0.06, 0.11] }),
    twinkles({ at: 1050, count: 8, distance: 1.0, maxDelay: 0.3 }),
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
  // The move is the sound: rings leave the attacker and twinkles ride them down the lane; one
  // ring opens off the defender as they land.
  attacker: { motion: 'brace', params: { rear: 0.06, scale: 1.05, glow: 0.7 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.25 } },
  beats: [
    { at: 60, until: 560, layer: 'back', drawer: 'shockRings', params: { count: 3, delay: 0.25, r0: 0.25, r1: 1.2, squash: 0.8 } },
    // Four twinkles 50 ms apart: flight = 380 - 3 x 50 = 230 ms, so the last lands at contact.
    { at: 200, until: 580, layer: 'front', drawer: 'volley', params: { count: 4, stagger: 50, r0: 0.08, r1: 0.12, bow: 0.3, tongues: 0 } },
    flash(580),
    { at: 580, until: 880, layer: 'front', drawer: 'shards', params: { count: 4, distance: 0.7, spin: 200 } },
    { at: 580, until: 960, layer: 'front', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.3, r1: 1.1, width: 0.04 } },
  ],
  particles: [twinkles({ at: 600, count: 7 })],
});

export const fairyWind = spec({
  id: 'fairy-wind',
  name: 'Fairy Wind',
  statClass: 'special',
  tier: 1,
  family: 'wind',
  durationMs: 1100,
  contactMs: 600,
  // A pink light gathers at the attacker; a sparkle gust pours down the lane and winds into a
  // vortex round the defender, leaving a pink haze.
  attacker: { motion: 'brace', params: { rear: 0.06, scale: 1.04, glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.25 } },
  beats: [
    { at: 0, until: 480, layer: 'front', drawer: 'coreCharge', params: { lead: 0.3, r0: 0.06, r1: 0.14, from: 0.25 } },
    // The gust's head lands at contact: 480 + 0.25 x 480 = 600.
    // The gust in the deeper pinks, so its passes do not sum to a white column.
    { at: 500, until: 1000, layer: 'front', drawer: 'spiral', params: { turns: 2, r0: 0.25, r1: 0.85, rpm: 200, tongues: 8, tint: { body: '#D85A92', hot: '#F48FB1' } } },
    { at: 380, until: 600, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 40, r0: 0.08, r1: 0.12, bow: 0.5, tongues: 2, tint: { body: '#D85A92', hot: '#F48FB1' } } },
    flash(600),
    { at: 620, until: 1100, layer: 'front', drawer: 'cloud', params: { count: 4, radius: 0.3, drift: 0.3, alpha: 0.35 } },
  ],
  particles: [twinkles({ at: 650, count: 7, maxDelay: 0.3 })],
});

export const drainingKiss = spec({
  id: 'draining-kiss',
  name: 'Draining Kiss',
  statClass: 'special',
  tier: 2,
  family: 'chime',
  durationMs: 1400,
  contactMs: 600,
  // A twinkle gathers and is blown down the lane as a kiss; a heart stamps on the defender,
  // motes drain back up the lane into the attacker and twinkle there as it is restored.
  attacker: { motion: 'rear-lurch', params: { rear: 0.08, lurch: 0.25, glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.28, heat: 0.3 } },
  beats: [
    { at: 0, until: 400, layer: 'front', drawer: 'coreCharge', params: { lead: 0.4, r0: 0.08, r1: 0.18, from: 0.2 } },
    { at: 360, until: 600, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.25, r0: 0.14, r1: 0.18, tongues: 2, ease: 'linear' } },
    flash(600),
    { at: 600, until: 880, layer: 'front', drawer: 'shards', params: { count: 4, distance: 0.7, spin: 200 } },
    // The kiss lands as a heart (it starts last at contact, so it is the family).
    { at: 600, until: 1000, layer: 'front', drawer: 'glyph', params: { kind: 'heart', r: 0.45 } },
    { at: 700, until: 1150, layer: 'front', drawer: 'volley', params: { from: 'defender', count: 5, stagger: 50, r0: 0.07, r1: 0.1, bow: 0.4, tongues: 0, tint: { deep: '#2E8A4C', body: '#7CE89A', hot: '#D8FFE0', core: '#F4FFF6' } } },
  ],
  particles: [twinkles({ at: 620, count: 6 }), twinkles({ at: 1150, anchor: 'attacker', count: 6, distance: 0.7, maxDelay: 0.3 })],
});

export const dazzlingGleam = spec({
  id: 'dazzling-gleam',
  name: 'Dazzling Gleam',
  statClass: 'special',
  tier: 2,
  family: 'chime',
  durationMs: 1400,
  contactMs: 760,
  // A fairy star turns over a light gathering on the attacker while bokeh drifts off it; it
  // releases a spray of twinkles that lands on the defender, where the star stamps.
  attacker: { motion: 'rear-lurch', params: { rear: 0.1, lurch: 0.3, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.3 } },
  beats: [
    { at: 0, until: 620, layer: 'front', drawer: 'coreCharge', params: { lead: 0.3, r0: 0.1, r1: 0.26, from: 0.2 } },
    { at: 80, until: 640, layer: 'back', drawer: 'aura', params: { target: 'attacker', hz: 2, alpha: 0.7, r0: 0.7, r1: 0.9, tint: { deep: '#C2457E', body: '#FF9AD0', hot: '#FFE0F2', core: '#FFFFFF' } } },
    { at: 300, until: 900, layer: 'back', drawer: 'cloud', params: { target: 'attacker', count: 4, radius: 0.18, drift: 0.6, alpha: 0.4 } },
    // Five twinkles 40 ms apart: flight = 320 - 4 x 40 = 160 ms, so the first lands at contact.
    { at: 600, until: 920, layer: 'front', drawer: 'volley', params: { count: 5, stagger: 40, r0: 0.08, r1: 0.12, bow: 0.4, tongues: 1 } },
    flash(760),
    { at: 760, until: 1100, layer: 'front', drawer: 'shards', params: { count: 5, distance: 0.9, spin: 240 } },
    // The star stamps as the spray lands (it starts last at contact, so it is the family).
    { at: 760, until: 1200, layer: 'front', drawer: 'glyph', params: { r: 0.6 } },
    { at: 800, until: 1350, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.28 } },
  ],
  particles: [twinkles({ at: 780, count: 8, distance: 1.0 }), twinkles({ at: 1000, count: 5, distance: 0.8, maxDelay: 0.3 })],
});

export const moonblast = spec({
  id: 'moonblast',
  name: 'Moonblast',
  statClass: 'special',
  tier: 3,
  family: 'burst',
  durationMs: 2000,
  contactMs: 1100,
  // In a local night, moonlight falls on the attacker and the moon swells at its edge; it is
  // sent down the lane and lands on the defender as two crescents, sparkle shards and the fairy
  // star, and a pink haze lingers.
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.38, heat: 0.35 } },
  beats: [
    { at: 0, until: 950, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.36 } },
    { at: 100, until: 700, layer: 'front', drawer: 'pillar', params: { target: 'attacker', from: 'above', height: 1.3, w: 0.26 } },
    { at: 400, until: 950, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.08, r1: 0.2, from: 0.2 } },
    { at: 900, until: 1100, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.26, r1: 0.3, tongues: 3 } },
    { at: 1000, until: 1950, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.34 } },
    { at: 1050, until: 1500, layer: 'front', drawer: 'glyph', params: { r: 0.7 } },
    flash(1100),
    // Two crescents sweep round the defender, opposite each other.
    { at: 1100, until: 1450, layer: 'front', drawer: 'slashArc', params: { sweep: 160, radius: 0.75, count: 2, gapDeg: 180, angle: -30, thick: 0.14 } },
    { at: 1100, until: 1500, layer: 'front', drawer: 'shards', params: { count: 6, distance: 1.0, spin: 240 } },
    { at: 1250, until: 1950, layer: 'front', drawer: 'cloud', params: { count: 4, radius: 0.35, drift: 0.3, alpha: 0.35 } },
  ],
  particles: [twinkles({ at: 1100, count: 8, distance: 1.2 }), twinkles({ at: 1400, count: 6, distance: 1.0, maxDelay: 0.3 })],
});

export const FAIRY_SPECS = Object.freeze(
  Object.fromEntries([spiritBreak, playRough, disarmingVoice, fairyWind, drainingKiss, dazzlingGleam, moonblast].map((s) => [s.id, s]))
);
