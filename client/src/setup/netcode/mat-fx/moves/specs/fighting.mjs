// Design 063: Fighting specs, one per move of the Fighting row of the move table. Fighting had
// no Appendix A entries, so this slice ran the study pass first: Arm Thrust, Karate Chop, Low
// Sweep, Triple Kick and Close Combat from the study notes (refs/063-study/notes/
// g5-fighting-poison.md), Meteor Assault, Superpower, Vacuum Wave, Aura Sphere and Focus Blast
// read from their Poképédia references this slice (B2W2 sprites + Scarlet/Violet videos;
// Meteor Assault is Sword/Shield video only, Karate Chop has no animation anywhere).
//
// There are no fists or feet: per § Pinned contracts D a blow is an impact flash, rings, a fan
// of shock streaks and card weight (dash / lunge with a heavy knock). Multi-hit moves use the
// defender's `stagger`: contact is the first blow, the rest follow `gapMs` apart and the last
// springs the card home. The physical moves draw in the fighting material; the three ki
// specials draw in `aura` (the recipe's blue-white sphere) so each keeps one palette. Every
// full-screen effect in the references (Close Combat's black-out and speed-line backdrop,
// Superpower's sunburst, Aura Sphere's yellow and Focus Blast's red backdrops, Meteor
// Assault's whiteouts) became a local vignette and a defender-sized flash.

/** A CSS shock-streak burst with the fighting defaults (short white streaks, no gravity). */
const burst = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 10,
    distance: 1,
    direction: -90,
    spread: 360,
    size: [0.05, 0.1],
    aspect: 0.25,
    gravity: 0,
    maxDelay: 0.1,
    durationMs: 550,
    kind: 'streak',
    ...over,
  });

const spec = (over) => Object.freeze({ vgType: 'fighting', material: 'fighting', pad: 1.7, grain: 0, ...over });

/** One blow on the defender at `at`: an impact ring, a fan of shock streaks, a flash on top. */
const blow = (at, { ring = 0.9, streaks = 5, reach = 0.5, flash = 0.8 } = {}) => [
  { at, until: at + 240, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.3, r1: ring, width: 0.05 } },
  { at, until: at + 260, layer: 'front', drawer: 'shards', params: { count: streaks, arc: 360, distance: reach, spin: 0 } },
  { at, until: at + 140, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: flash } },
];

/** Charge motes spiralling in round a card: the two halves of one orbit. */
const orbit = (at, until, params) => [
  { at, until, layer: 'back', drawer: 'orbitCharge', params: { half: 'back', ...params } },
  { at, until, layer: 'front', drawer: 'orbitCharge', params: { half: 'front', ...params } },
];

// ---- physical ------------------------------------------------------------------------

export const armThrust = spec({
  id: 'arm-thrust',
  name: 'Arm Thrust',
  statClass: 'physical',
  tier: 1,
  family: 'punch',
  durationMs: 1100,
  contactMs: 420,
  // A short shove in; the open-palm slaps land on the defender one after another.
  attacker: { motion: 'lunge', params: { wind: 0.12, reach: 0.45 } },
  defender: { motion: 'stagger', params: { strength: 0.25, hits: 3, gapMs: 90, heat: 0.4 } },
  beats: [
    { at: 0, until: 420, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.4, hz: 3 } },
    ...blow(420, { ring: 0.8, streaks: 4, reach: 0.45, flash: 0.7 }),
    ...blow(510, { ring: 0.8, streaks: 4, reach: 0.45, flash: 0.7 }),
    ...blow(600, { ring: 1.1, streaks: 8, reach: 0.65, flash: 1.0 }),
  ],
  particles: [burst({ at: 600, count: 10, distance: 0.8, durationMs: 500 })],
});

export const karateChop = spec({
  id: 'karate-chop',
  name: 'Karate Chop',
  statClass: 'physical',
  tier: 2,
  family: 'slash',
  durationMs: 1250,
  contactMs: 560,
  // A hop in and one hard chop down across the defender, top-right to bottom-left.
  attacker: { motion: 'dash', params: { wind: 0.2, reach: 0.8, overshoot: 0, arc: 0.2 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.4 } },
  beats: [
    { at: 0, until: 420, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.4, hz: 3 } },
    { at: 430, until: 680, layer: 'front', drawer: 'slashArc', params: { sweep: 150, radius: 0.6, angle: 35, thick: 0.16 } },
    { at: 560, until: 860, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.3, r1: 1.1, width: 0.05 } },
    { at: 570, until: 880, layer: 'front', drawer: 'shards', params: { count: 8, arc: 110, direction: 125, distance: 0.75, spin: 0 } },
    { at: 560, until: 740, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
    { at: 700, until: 1250, layer: 'front', drawer: 'smoke', params: { count: 4, rise: 0.6 } },
  ],
  particles: [burst({ at: 560, count: 10, direction: 125, spread: 120, distance: 0.9 })],
});

export const lowSweep = spec({
  id: 'low-sweep',
  name: 'Low Sweep',
  statClass: 'physical',
  tier: 2,
  family: 'dash',
  durationMs: 1300,
  contactMs: 600,
  // A crouch, then the sweep hooks across the defender's base and kicks dust up off the floor.
  attacker: { motion: 'dash', params: { wind: 0.25, reach: 0.8, overshoot: 0, arc: 0.25 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 0.4 } },
  beats: [
    { at: 0, until: 360, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.4, hz: 3 } },
    { at: 440, until: 680, layer: 'front', drawer: 'slashArc', params: { sweep: 150, radius: 0.5, angle: 90, thick: 0.15 } },
    { at: 600, until: 1000, layer: 'back', drawer: 'terrain', params: { kind: 'dust', radius: 1.0 } },
    { at: 600, until: 900, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 1, r0: 0.4, r1: 1.3 } },
    { at: 600, until: 950, layer: 'front', drawer: 'shards', params: { count: 8, arc: 140, direction: -90, distance: 0.8, spin: 0 } },
    { at: 600, until: 760, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
  ],
  particles: [burst({ at: 600, count: 10, spread: 150, distance: 0.9 })],
});

export const tripleKick = spec({
  id: 'triple-kick',
  name: 'Triple Kick',
  statClass: 'physical',
  tier: 2,
  family: 'dash',
  durationMs: 1500,
  contactMs: 580,
  attacker: { motion: 'dash', params: { wind: 0.2, reach: 0.75, overshoot: 0.05, arc: 0.3 } },
  // Three kicks 200 ms apart; the third is the biggest and springs the card home.
  defender: { motion: 'stagger', params: { strength: 0.4, hits: 3, gapMs: 200, heat: 0.4 } },
  beats: [
    { at: 0, until: 400, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.4, hz: 3 } },
    ...blow(580, { ring: 0.9, streaks: 6, reach: 0.5, flash: 0.8 }),
    ...blow(780, { ring: 0.9, streaks: 6, reach: 0.5, flash: 0.8 }),
    ...blow(980, { ring: 1.3, streaks: 10, reach: 0.8, flash: 1.1 }),
  ],
  particles: [burst({ at: 980, count: 12, distance: 1.0 })],
});

export const closeCombat = spec({
  id: 'close-combat',
  name: 'Close Combat',
  statClass: 'physical',
  tier: 3,
  family: 'dash',
  durationMs: 1900,
  contactMs: 900,
  attacker: { motion: 'dash', params: { wind: 0.3, reach: 1.0, overshoot: 0.1, arc: 0.3 } },
  // The barrage: six blows 80 ms apart from contact, the last the heavy one.
  defender: { motion: 'stagger', params: { strength: 0.45, hits: 6, gapMs: 80, heat: 0.5 } },
  beats: [
    // The sprite's black-out, kept local and dark round the defender.
    { at: 0, until: 1650, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.42 } },
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 3 } },
    // Eight impact stamps at jittered spots over the defender (the fighting sigil).
    { at: 700, until: 1350, layer: 'front', drawer: 'glyph', params: { r: 0.9 } },
    { at: 900, until: 1400, layer: 'front', drawer: 'shards', params: { count: 12, arc: 360, distance: 1.0, spin: 0 } },
    { at: 900, until: 1060, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
    // The last blow lands at 900 + 5 x 80.
    { at: 1300, until: 1650, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.4, r1: 1.5, width: 0.06 } },
    { at: 1300, until: 1700, layer: 'front', drawer: 'shards', params: { count: 10, arc: 360, distance: 1.2, spin: 0 } },
    { at: 1300, until: 1480, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
    { at: 1400, until: 1900, layer: 'front', drawer: 'smoke', params: { count: 5, rise: 0.8 } },
  ],
  particles: [burst({ at: 900, count: 12, distance: 1.1 }), burst({ at: 1300, count: 10, distance: 1.3 })],
});

export const meteorAssault = spec({
  id: 'meteor-assault',
  name: 'Meteor Assault',
  statClass: 'physical',
  tier: 3,
  family: 'dash',
  durationMs: 2000,
  contactMs: 1000,
  // The gathering glow, a ram in with the bow-shock ringing off the start, a scorching blast.
  attacker: { motion: 'dash', params: { wind: 0.3, reach: 1.0, overshoot: 0.2, arc: 0.35 } },
  defender: { motion: 'knock', params: { strength: 0.5, heat: 0.7 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.6, hz: 3 } },
    { at: 0, until: 700, layer: 'front', drawer: 'coreCharge', params: { r0: 0.12, r1: 0.4, from: 0.2 } },
    { at: 600, until: 1000, layer: 'back', drawer: 'shockRings', params: { count: 3, delay: 0.25, r0: 0.4, r1: 1.4, squash: 0.5 } },
    { at: 800, until: 1800, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35 } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.3 } },
    { at: 1000, until: 1450, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.7 } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'shards', params: { count: 14, arc: 360, distance: 1.3, spin: 0 } },
    { at: 1100, until: 1700, layer: 'front', drawer: 'shards', params: { count: 8, arc: 140, direction: -90, distance: 1.2, spin: 0 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
    { at: 1300, until: 2000, layer: 'front', drawer: 'smoke', params: { count: 6 } },
  ],
  particles: [burst({ at: 1000, count: 14, distance: 1.3 }), burst({ at: 1200, count: 8, spread: 140, distance: 1.1, durationMs: 700 })],
});

export const superpower = spec({
  id: 'superpower',
  name: 'Superpower',
  statClass: 'physical',
  tier: 3,
  family: 'dash',
  durationMs: 2000,
  contactMs: 1000,
  // Power wells up round the attacker (floor rings, rising heat), then one heavy charge in.
  attacker: { motion: 'dash', params: { wind: 0.3, reach: 1.0, overshoot: 0.15, arc: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.5, heat: 0.6 } },
  beats: [
    { at: 0, until: 800, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.65, hz: 2.5 } },
    { at: 0, until: 800, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 2, r0: 0.8, r1: 0.6 } },
    { at: 100, until: 850, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 7, radius: 0.3, drift: 0.7, alpha: 0.55 } },
    { at: 900, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35 } },
    { at: 1000, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.4, r1: 1.6, width: 0.06 } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'shards', params: { count: 14, arc: 360, distance: 1.3, spin: 0 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
    { at: 1250, until: 2000, layer: 'front', drawer: 'smoke', params: { count: 6 } },
  ],
  particles: [
    burst({ at: 1000, count: 14, distance: 1.3 }),
    burst({ at: 1150, kind: 'mote', count: 8, aspect: 1, size: [0.03, 0.06], spread: 140, maxDelay: 0.3, durationMs: 700 }),
  ],
});

// ---- special (aura) ------------------------------------------------------------------

const kiSpec = (over) => spec({ material: 'aura', ...over });

export const vacuumWave = kiSpec({
  id: 'vacuum-wave',
  name: 'Vacuum Wave',
  statClass: 'special',
  tier: 1,
  family: 'burst',
  durationMs: 1000,
  contactMs: 450,
  // A swing of the arm throws one small swirling ki ball; it bursts in a bubble round the foe.
  attacker: { motion: 'brace', params: { rear: 0.06, scale: 1.04, glow: 0.7 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.5 } },
  beats: [
    { at: 0, until: 300, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.45, hz: 4 } },
    { at: 150, until: 450, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.12, r1: 0.18, tongues: 2 } },
    { at: 450, until: 800, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.5, r1: 1.1, width: 0.05 } },
    { at: 450, until: 750, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 0.5, spin: 0 } },
    { at: 450, until: 590, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.9 } },
  ],
  particles: [burst({ at: 500, kind: 'mote', count: 8, aspect: 1, size: [0.03, 0.06], spread: 160, distance: 0.7, maxDelay: 0.3, durationMs: 600 })],
});

export const auraSphere = kiSpec({
  id: 'aura-sphere',
  name: 'Aura Sphere',
  statClass: 'special',
  tier: 2,
  family: 'burst',
  durationMs: 1500,
  contactMs: 900,
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.35, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 3 } },
    // The blue swirl winding round the white core at the attacker's palms.
    { at: 100, until: 620, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 2, r0: 0.25, r1: 0.75, rpm: 150, tongues: 8 } },
    { at: 100, until: 620, layer: 'front', drawer: 'coreCharge', params: { r0: 0.12, r1: 0.4, from: 0.15 } },
    { at: 560, until: 860, layer: 'back', drawer: 'shockRings', params: { count: 2, r0: 0.3, r1: 1.1 } },
    { at: 560, until: 910, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.36, r1: 0.42, tongues: 4 } },
    { at: 900, until: 1250, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.3, width: 0.05 } },
    { at: 900, until: 1250, layer: 'front', drawer: 'shards', params: { count: 10, arc: 360, distance: 1.0, spin: 0 } },
    { at: 900, until: 1080, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
  ],
  particles: [
    burst({ at: 900, count: 12, distance: 1.1 }),
    burst({ at: 1000, kind: 'mote', count: 8, aspect: 1, size: [0.03, 0.06], spread: 140, maxDelay: 0.3, durationMs: 650 }),
  ],
});

export const focusBlast = kiSpec({
  id: 'focus-blast',
  name: 'Focus Blast',
  statClass: 'special',
  tier: 3,
  family: 'burst',
  durationMs: 2100,
  contactMs: 1200,
  attacker: { motion: 'rear-lurch', params: { rear: 0.16, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.6 } },
  beats: [
    { at: 0, until: 900, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.6, hz: 2.5 } },
    // Motes spiral in and the ki gathers into one big sphere, which leaves slowly and closes fast.
    ...orbit(0, 880, { count: 6, r0: 0.07, r1: 0.11, tongues: 1, tilt: 0.5 }),
    { at: 250, until: 900, layer: 'front', drawer: 'coreCharge', params: { r0: 0.15, r1: 0.55, from: 0.1 } },
    { at: 850, until: 1200, layer: 'back', drawer: 'shockRings', params: { count: 2, r0: 0.4, r1: 1.4 } },
    { at: 880, until: 1210, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.5, r1: 0.6, tongues: 5 } },
    // The navy vignette stands in for the sprite's red backdrop.
    { at: 1000, until: 1900, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
    { at: 1200, until: 1750, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.4, r1: 1.8, width: 0.06 } },
    { at: 1200, until: 1600, layer: 'front', drawer: 'shards', params: { count: 14, arc: 360, distance: 1.3, spin: 0 } },
    { at: 1300, until: 1800, layer: 'front', drawer: 'shards', params: { count: 8, arc: 140, direction: -90, distance: 1.1, spin: 0 } },
    { at: 1200, until: 1380, layer: 'top', drawer: 'impactFlash', params: { r1: 1.4 } },
  ],
  particles: [
    burst({ at: 1200, count: 14, distance: 1.3 }),
    burst({ at: 1400, kind: 'mote', count: 10, aspect: 1, size: [0.03, 0.06], spread: 140, maxDelay: 0.3, durationMs: 700 }),
  ],
});

export const FIGHTING_SPECS = Object.freeze(
  Object.fromEntries(
    [armThrust, karateChop, lowSweep, tripleKick, closeCombat, meteorAssault, superpower, vacuumWave, auraSphere, focusBlast].map(
      (s) => [s.id, s]
    )
  )
);
