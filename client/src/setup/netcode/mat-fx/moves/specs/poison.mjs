// Design 063: Poison specs, one per move of the Poison row of the move table. The study pass
// left no Poison entries, so this slice read all nine itself (sprite N2B2 + the Scarlet/Violet
// video per move, Poképédia; Cross Poison and Sludge Bomb from Pokémon Central's Gen 5 strips;
// notes in .agent/scratch/moves/poison/g5c-poison.md).
//
// Every move draws in the one poison material, violet venom start to payoff: Acid's yellow,
// Poison Tail's mustard cloud and Cross Poison's orange sparks all become violet globs and
// fumes. Two cues every sprite shares carry the type: the struck card turns violet (the CSS
// heat sheen) and hollow bubbles rise out of a pool of venom on it (the material's `glyph`
// sigil), always after contact so the family follows the hit.

/** Lilac globs flung off the defender, falling (the recipe's "gravity high"). */
const globs = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 10,
    distance: 0.9,
    direction: -90,
    spread: 200,
    size: [0.04, 0.08],
    aspect: 1,
    gravity: 1.1,
    maxDelay: 0.12,
    durationMs: 760,
    kind: 'glob',
    ...over,
  });

const spec = (over) => Object.freeze({ vgType: 'poison', material: 'poison', pad: 1.7, grain: 0.15, ...over });

// ---- physical ------------------------------------------------------------------------

export const poisonSting = spec({
  id: 'poison-sting',
  name: 'Poison Sting',
  statClass: 'physical',
  tier: 1,
  family: 'projectile',
  durationMs: 1000,
  contactMs: 500,
  // A short jab and one venom dart straight down the lane; barbs splinter off the hit and
  // bubbles rise from the stung card.
  attacker: { motion: 'lunge', params: { wind: 0.15, reach: 0.5 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.55 } },
  beats: [
    { at: 0, until: 400, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.3, hz: 3 } },
    // Linear so the dart is at the card's edge at contact and still in flight (the family's beat).
    { at: 300, until: 540, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.07, r1: 0.09, tongues: 2, ease: 'linear' } },
    { at: 360, until: 980, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
    { at: 500, until: 660, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.8 } },
    { at: 520, until: 820, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.7, spin: 0 } },
    { at: 540, until: 1000, layer: 'front', drawer: 'glyph', params: { r: 0.7 } },
  ],
  particles: [globs({ at: 520, count: 8, distance: 0.7, spread: 160, durationMs: 700 })],
});

export const poisonTail = spec({
  id: 'poison-tail',
  name: 'Poison Tail',
  statClass: 'physical',
  tier: 2,
  family: 'slash',
  durationMs: 1350,
  contactMs: 650,
  // The tail swings in as one fat crescent of venom; it splashes off the card, a toxic cloud
  // puffs up, and the card turns violet with bubbles rising.
  attacker: { motion: 'lunge', params: { wind: 0.25, reach: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 1 } },
  beats: [
    { at: 0, until: 560, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.35, hz: 2.5 } },
    { at: 450, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.38 } },
    // The crescent leads the flash so its sweep reads before the hit.
    { at: 480, until: 800, layer: 'front', drawer: 'slashArc', params: { sweep: 150, radius: 0.6, angle: 30, thick: 0.26 } },
    { at: 650, until: 820, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
    { at: 670, until: 1000, layer: 'front', drawer: 'splash', params: { count: 8, arc: 160, gravity: 0.8, len: [0.4, 0.8] } },
    { at: 700, until: 1250, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.42, drift: 0.25, alpha: 0.45 } },
    { at: 760, until: 1340, layer: 'front', drawer: 'glyph', params: { r: 0.8 } },
  ],
  particles: [globs({ at: 670, count: 12 })],
});

export const poisonJab = spec({
  id: 'poison-jab',
  name: 'Poison Jab',
  statClass: 'physical',
  tier: 3,
  family: 'punch',
  durationMs: 1700,
  contactMs: 860,
  // Venom coats the attacker; it jabs and three venom darts land as three blows, barbs
  // splintering off each, then the card turns violet with bubbles and fumes.
  attacker: { motion: 'lunge', params: { wind: 0.25, reach: 0.75 } },
  defender: { motion: 'stagger', params: { strength: 0.42, hits: 3, gapMs: 110, heat: 1 } },
  beats: [
    { at: 0, until: 760, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.4, hz: 3 } },
    { at: 0, until: 640, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 5, radius: 0.3, drift: 0.12, alpha: 0.4 } },
    { at: 640, until: 1600, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.42 } },
    // Three darts 110 ms apart: the first lands at contact, the last on the last blow (1080).
    { at: 600, until: 1080, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 110, r0: 0.08, r1: 0.12, bow: 0.3, tongues: 2 } },
    { at: 860, until: 1030, layer: 'top', drawer: 'impactFlash', params: { r0: 0.4, r1: 0.9 } },
    { at: 860, until: 1160, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.8, spin: 0 } },
    { at: 870, until: 1200, layer: 'front', drawer: 'splash', params: { count: 8, arc: 360, gravity: 0.9, len: [0.4, 0.8] } },
    { at: 970, until: 1140, layer: 'top', drawer: 'impactFlash', params: { r0: 0.4, r1: 0.9 } },
    { at: 1080, until: 1260, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
    { at: 1080, until: 1380, layer: 'front', drawer: 'shards', params: { count: 8, distance: 1.0, spin: 0 } },
    { at: 1150, until: 1700, layer: 'front', drawer: 'glyph', params: { r: 0.85 } },
    { at: 1250, until: 1700, layer: 'front', drawer: 'smoke', params: { count: 5, rise: 0.8 } },
  ],
  particles: [globs({ at: 880, count: 8, distance: 0.8 }), globs({ at: 1090, count: 12, distance: 1.1, spread: 360 })],
});

export const crossPoison = spec({
  id: 'cross-poison',
  name: 'Cross Poison',
  statClass: 'physical',
  tier: 3,
  family: 'slash',
  durationMs: 1800,
  contactMs: 950,
  // The attacker rushes in and two venom blades scissor across the card in opposite
  // directions, their tips passing each other at contact (the cross); rings, barbs and a
  // violet cloud burst out of the cut, then bubbles and fumes.
  attacker: { motion: 'dash', params: { wind: 0.25, reach: 0.85, overshoot: 0.2, arc: 0.35 } },
  defender: { motion: 'knock', params: { strength: 0.42, heat: 1 } },
  beats: [
    { at: 0, until: 800, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.4, hz: 3 } },
    { at: 650, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    // Two mirrored blades scissor up from under the card and lock into an X across it (near
    // diameters, crossing just above the centre at ~75°): settled by 0.45 of the beat (950,
    // the flash), held to 0.6 (1020), then they fade. Sweeping the top of one circle instead
    // laid both on one chord: a single streak, no X.
    { at: 730, until: 1210, layer: 'front', drawer: 'slashArc', params: { sweep: 300, radius: 0.5, angle: -105, thick: 0.22 } },
    { at: 730, until: 1210, layer: 'front', drawer: 'slashArc', params: { sweep: -300, radius: 0.5, angle: 285, thick: 0.22 } },
    { at: 950, until: 1130, layer: 'top', drawer: 'impactFlash', params: { r1: 1.1 } },
    { at: 950, until: 1300, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.2, width: 0.05 } },
    { at: 960, until: 1320, layer: 'front', drawer: 'shards', params: { count: 8, distance: 1.0, spin: 180 } },
    { at: 1000, until: 1600, layer: 'front', drawer: 'cloud', params: { count: 7, radius: 0.4, drift: 0.2, alpha: 0.45 } },
    { at: 1080, until: 1750, layer: 'front', drawer: 'glyph', params: { r: 0.85 } },
    { at: 1300, until: 1800, layer: 'front', drawer: 'smoke', params: { count: 5, rise: 0.8 } },
  ],
  particles: [globs({ at: 970, count: 14, distance: 1.1, spread: 360 }), globs({ at: 1200, count: 6, distance: 0.5, spread: 360, maxDelay: 0.3 })],
});

// ---- special -------------------------------------------------------------------------

export const acid = spec({
  id: 'acid',
  name: 'Acid',
  statClass: 'special',
  tier: 1,
  family: 'splash',
  durationMs: 1050,
  contactMs: 560,
  // A glob of acid swells at the mouth and a chain of three is spat in an arc; the last lands
  // at contact, the acid splatters, and bubbles rise off the card.
  attacker: { motion: 'brace', params: { rear: 0.08, scale: 1.05, glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.5 } },
  beats: [
    { at: 0, until: 360, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.35, hz: 3 } },
    { at: 0, until: 320, layer: 'front', drawer: 'coreCharge', params: { r0: 0.06, r1: 0.16, from: 0.2 } },
    // Landing at 440, 500 and 560 (the last one is the hit).
    { at: 220, until: 560, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 60, r0: 0.08, r1: 0.11, bow: 0.45, tongues: 1 } },
    { at: 400, until: 1000, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
    { at: 560, until: 720, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.85 } },
    { at: 560, until: 860, layer: 'front', drawer: 'splash', params: { count: 8, arc: 150, gravity: 0.9, len: [0.35, 0.7] } },
    { at: 640, until: 1050, layer: 'front', drawer: 'glyph', params: { r: 0.7 } },
  ],
  particles: [globs({ at: 570, count: 10, distance: 0.7, spread: 160, durationMs: 700 })],
});

export const sludge = spec({
  id: 'sludge',
  name: 'Sludge',
  statClass: 'special',
  tier: 2,
  family: 'splash',
  durationMs: 1350,
  contactMs: 700,
  // A glob of sludge swells at the mouth and is lobbed in a high arc, dripping; it splats on
  // the card, which turns violet as bubbles rise and fumes drift off.
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 1 } },
  beats: [
    { at: 0, until: 480, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.28 } },
    { at: 0, until: 440, layer: 'front', drawer: 'coreCharge', params: { r0: 0.08, r1: 0.24, from: 0.2 } },
    { at: 380, until: 700, layer: 'back', drawer: 'shockRings', params: { count: 1, r0: 0.3, r1: 0.9 } },
    { at: 400, until: 700, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.45, r0: 0.22, r1: 0.3, tongues: 3 } },
    { at: 560, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.42 } },
    { at: 700, until: 870, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
    { at: 700, until: 1050, layer: 'front', drawer: 'splash', params: { count: 10, arc: 360, gravity: 0.9, len: [0.45, 0.85] } },
    { at: 800, until: 1350, layer: 'front', drawer: 'glyph', params: { r: 0.85 } },
    { at: 950, until: 1350, layer: 'front', drawer: 'smoke', params: { count: 4, rise: 0.7 } },
  ],
  particles: [globs({ at: 710, count: 14, distance: 1.0, spread: 360 })],
});

export const venoshock = spec({
  id: 'venoshock',
  name: 'Venoshock',
  statClass: 'special',
  tier: 2,
  family: 'splash',
  durationMs: 1400,
  contactMs: 680,
  // Bubbles circle the attacker as a glob gathers and is hurled; it splashes on the card, a
  // pool of venom spreads under it and a fountain of venom and bubbles rises out of the pool.
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.35, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 1 } },
  beats: [
    { at: 0, until: 460, layer: 'back', drawer: 'orbitCharge', params: { count: 4, half: 'back', r0: 0.06, r1: 0.1, tongues: 0 } },
    { at: 0, until: 460, layer: 'front', drawer: 'orbitCharge', params: { count: 4, half: 'front', r0: 0.06, r1: 0.1, tongues: 0 } },
    { at: 80, until: 480, layer: 'front', drawer: 'coreCharge', params: { r0: 0.1, r1: 0.26, from: 0.25 } },
    { at: 440, until: 680, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.24, r1: 0.28, tongues: 3 } },
    { at: 540, until: 1350, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    { at: 680, until: 850, layer: 'top', drawer: 'impactFlash', params: { r1: 1.1 } },
    { at: 680, until: 1000, layer: 'front', drawer: 'splash', params: { count: 8, arc: 200, gravity: 0.8, len: [0.4, 0.75] } },
    { at: 700, until: 1050, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.4, r1: 1.3 } },
    { at: 760, until: 1400, layer: 'front', drawer: 'glyph', params: { r: 0.95 } },
    { at: 820, until: 1350, layer: 'front', drawer: 'pillar', params: { height: 1.3, w: 0.4 } },
  ],
  particles: [
    globs({ at: 700, count: 12, distance: 1.0, spread: 360 }),
    globs({ at: 900, count: 8, distance: 0.9, spread: 60, gravity: 0.9 }),
  ],
});

export const sludgeBomb = spec({
  id: 'sludge-bomb',
  name: 'Sludge Bomb',
  statClass: 'special',
  tier: 3,
  family: 'splash',
  durationMs: 2000,
  contactMs: 1050,
  // Drips orbit in and a big glob of sludge swells at the mouth; it is lobbed high with two
  // rings, bursts over the card in a wide splatter, and a violet cloud swells round the
  // poisoned card with bubbles rising and fumes drifting off.
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.38, heat: 1 } },
  beats: [
    { at: 0, until: 680, layer: 'back', drawer: 'orbitCharge', params: { count: 5, half: 'back', r0: 0.06, r1: 0.1, tongues: 1 } },
    { at: 0, until: 680, layer: 'front', drawer: 'orbitCharge', params: { count: 5, half: 'front', r0: 0.06, r1: 0.1, tongues: 1 } },
    { at: 0, until: 720, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.32 } },
    { at: 100, until: 700, layer: 'front', drawer: 'coreCharge', params: { r0: 0.12, r1: 0.38, from: 0.2 } },
    { at: 620, until: 1000, layer: 'back', drawer: 'shockRings', params: { count: 2 } },
    { at: 660, until: 1050, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.4, r0: 0.36, r1: 0.42, tongues: 3 } },
    { at: 860, until: 1900, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.5 } },
    { at: 1050, until: 1230, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
    { at: 1050, until: 1450, layer: 'front', drawer: 'splash', params: { count: 14, arc: 360, gravity: 0.9, len: [0.55, 1.0] } },
    { at: 1050, until: 1450, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.4, r1: 1.5, width: 0.06 } },
    { at: 1150, until: 1900, layer: 'front', drawer: 'cloud', params: { count: 8, radius: 0.45, drift: 0.3, alpha: 0.5 } },
    { at: 1200, until: 2000, layer: 'front', drawer: 'glyph', params: { r: 1.0 } },
    { at: 1450, until: 2000, layer: 'front', drawer: 'smoke', params: { count: 6, rise: 0.9 } },
  ],
  particles: [
    globs({ at: 1060, count: 16, distance: 1.3, spread: 360 }),
    globs({ at: 1250, count: 8, distance: 0.6, spread: 360, maxDelay: 0.3 }),
  ],
});

export const sludgeWave = spec({
  id: 'sludge-wave',
  name: 'Sludge Wave',
  statClass: 'special',
  tier: 3,
  family: 'splash',
  durationMs: 2000,
  contactMs: 1000,
  pad: 2.0,
  // Sludge wells up in the attacker (a violet aura and rim); a wave rolls out over the floor
  // and a widening flood of venom runs down the lane, crashing over the card at contact; the
  // flood ebbs, a toxic cloud lingers and bubbles rise.
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.35, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 1 } },
  beats: [
    { at: 0, until: 620, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 2 } },
    { at: 300, until: 1000, layer: 'back', drawer: 'terrain', params: { target: 'attacker', kind: 'wave', radius: 1.4 } },
    // The flood's head reaches the defender at contact: 520 + 0.4 x 1200.
    { at: 520, until: 1720, layer: 'front', drawer: 'beam', params: { kind: 'widening', w: 0.8, growIn: 0.4, retract: 0.25 } },
    { at: 800, until: 1900, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.5 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.4 } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'splash', params: { count: 14, arc: 360, gravity: 0.8, len: [0.6, 1.1] } },
    { at: 1000, until: 1400, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.5, r1: 1.6 } },
    { at: 1200, until: 1900, layer: 'front', drawer: 'cloud', params: { count: 8, radius: 0.45, drift: 0.4, alpha: 0.45 } },
    { at: 1300, until: 2000, layer: 'front', drawer: 'glyph', params: { r: 0.95 } },
  ],
  particles: [
    globs({ at: 1010, count: 16, distance: 1.3, spread: 360 }),
    globs({ at: 1400, count: 8, distance: 0.7, spread: 120, maxDelay: 0.3 }),
  ],
});

export const POISON_SPECS = Object.freeze(
  Object.fromEntries(
    [poisonSting, poisonTail, poisonJab, crossPoison, acid, sludge, venoshock, sludgeBomb, sludgeWave].map((s) => [s.id, s])
  )
);
