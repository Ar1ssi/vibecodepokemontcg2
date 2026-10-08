// Design 063: Flying specs, one per move of the Flying row of the move table. Peck, Aerial Ace,
// Wing Attack, Brave Bird, Gust and Air Cutter follow the study notes
// (refs/063-study/notes/g7-flying-dragon-steel.md); the notes stop before Hurricane and
// Aeroblast, so this slice read those two itself (sprite N2B2 + the Scarlet/Violet video,
// Poképédia; notes in .agent/scratch/moves/flying/g7b-flying.md).
//
// Wind is pale and fast: crescent wind blades with a bright outer edge, whirls that wrap the
// struck card, feathers knocked loose by a wing. Pale air only reads against something darker,
// so every move gathers a navy vignette round the defender before its wind arrives. The sprite
// games' backdrops (Aerial Ace's black-then-red diagonal band, Brave Bird's streaked sky,
// Hurricane's blue sky, Aeroblast's black void and cyan vortex) and Brave Bird's red silhouette
// become local vignettes (house rules: no backdrop change, one palette).

/** Feathers knocked loose by the hit, drifting down slowly. */
const feathers = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 10,
    distance: 0.9,
    direction: -90,
    spread: 160,
    size: [0.05, 0.1],
    aspect: 0.35,
    gravity: 0.25,
    maxDelay: 0.12,
    durationMs: 900,
    kind: 'feather',
    ...over,
  });

/** Bright glints of cut air flung off the hit, no fall. */
const glints = (over) =>
  feathers({ count: 10, distance: 1.0, spread: 360, size: [0.03, 0.07], aspect: 0.25, gravity: 0, durationMs: 600, kind: 'streak', ...over });

const spec = (over) => Object.freeze({ vgType: 'flying', material: 'flying', pad: 1.7, grain: 0, ...over });

// ---- physical ------------------------------------------------------------------------

export const peck = spec({
  id: 'peck',
  name: 'Peck',
  statClass: 'physical',
  tier: 1,
  family: 'punch',
  durationMs: 1000,
  contactMs: 450,
  // One short jab, no travel: the attacker rears and stabs; a small ring pops on the card and a
  // few feathers tumble off the strike.
  attacker: { motion: 'lunge', params: { wind: 0.15, reach: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.35 } },
  beats: [
    { at: 300, until: 900, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
    { at: 450, until: 700, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.2, r1: 0.8, width: 0.04 } },
    { at: 450, until: 600, layer: 'top', drawer: 'impactFlash', params: { r0: 0.25, r1: 0.7 } },
    // Last at contact: the jab knocks feathers loose (a punch-family hit).
    { at: 450, until: 750, layer: 'front', drawer: 'shards', params: { count: 5, arc: 200, distance: 0.6, spin: 300 } },
  ],
  particles: [feathers({ at: 460, count: 6, distance: 0.7, durationMs: 700 })],
});

export const aerialAce = spec({
  id: 'aerial-ace',
  name: 'Aerial Ace',
  statClass: 'physical',
  tier: 2,
  family: 'slash',
  durationMs: 1300,
  contactMs: 620,
  // The card darkens; the attacker vanishes in a burst of speed and one cut races up through
  // the card from lower left to upper right, flinging wind blades up and away. (The sprite's
  // telegraph line is dropped: slashArc draws a sweeping chord, so a held line would swing.)
  attacker: { motion: 'dash', params: { wind: 0.2, reach: 1.0, overshoot: 0.35, arc: 0.4 } },
  defender: { motion: 'knock', params: { strength: 0.32, heat: 0.5 } },
  beats: [
    { at: 150, until: 1150, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.38 } },
    { at: 150, until: 600, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 4, radius: 0.25, drift: 0.3, alpha: 0.3 } },
    { at: 620, until: 900, layer: 'front', drawer: 'slashArc', params: { sweep: -160, radius: 0.8, angle: 45, thick: 0.18 } },
    { at: 620, until: 780, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
    { at: 650, until: 1100, layer: 'front', drawer: 'splash', params: { count: 6, arc: 70, direction: -45, gravity: 0.2, len: [0.4, 0.8] } },
  ],
  particles: [glints({ at: 630, direction: -45, spread: 120, maxDelay: 0.15 })],
});

export const wingAttack = spec({
  id: 'wing-attack',
  name: 'Wing Attack',
  statClass: 'physical',
  tier: 2,
  family: 'slash',
  durationMs: 1350,
  contactMs: 600,
  // The attacker beats its wings and lunges; two tall wing strokes come down across the card,
  // right then left, the second the harder; a ring of wind blades bursts off it and feathers
  // tumble down.
  attacker: { motion: 'lunge', params: { wind: 0.18, reach: 0.75 } },
  defender: { motion: 'stagger', params: { strength: 0.34, hits: 2, gapMs: 200, heat: 0.45 } },
  beats: [
    { at: 0, until: 520, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 4, radius: 0.25, drift: 0.25, alpha: 0.3 } },
    { at: 350, until: 1250, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.34 } },
    { at: 600, until: 850, layer: 'front', drawer: 'slashArc', params: { sweep: 130, radius: 0.6, angle: 0, thick: 0.16 } },
    { at: 600, until: 760, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.85 } },
    { at: 800, until: 1050, layer: 'front', drawer: 'slashArc', params: { sweep: -130, radius: 0.6, angle: 180, thick: 0.16 } },
    { at: 800, until: 960, layer: 'top', drawer: 'impactFlash', params: { r0: 0.35, r1: 1.0 } },
    { at: 820, until: 1300, layer: 'front', drawer: 'splash', params: { count: 8, arc: 360, gravity: 0, len: [0.3, 0.6] } },
    { at: 820, until: 1300, layer: 'front', drawer: 'shards', params: { count: 6, arc: 160, distance: 0.9, spin: 240 } },
  ],
  particles: [feathers({ at: 810, direction: -100, spread: 140, distance: 1.0 })],
});

export const braveBird = spec({
  id: 'brave-bird',
  name: 'Brave Bird',
  statClass: 'physical',
  tier: 3,
  family: 'dash',
  durationMs: 1900,
  contactMs: 1000,
  // Wind wraps the attacker as it gathers itself; rings flash off it as it launches, and it
  // dives down the lane behind a bright head of wind; it slams in: a ring off the card,
  // feathers bursting everywhere, the card knocked hard; curls of wind linger round it.
  attacker: { motion: 'dash', params: { wind: 0.3, reach: 1.1, overshoot: 0.2, arc: 0.35 } },
  defender: { motion: 'knock', params: { strength: 0.5, heat: 0.6 } },
  beats: [
    { at: 0, until: 900, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 3 } },
    { at: 0, until: 850, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 2, r0: 0.35, r1: 0.9, rpm: 180, tongues: 10 } },
    { at: 700, until: 1000, layer: 'back', drawer: 'shockRings', params: { count: 2, r0: 0.3, r1: 1.0 } },
    // The head of wind the attacker dives behind (a bare orb: a pinwheel here reads as a
    // thrown blade); it reaches the card at contact.
    { at: 700, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.22, r1: 0.38, bow: 0, tongues: 0 } },
    { at: 850, until: 1800, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.4 } },
    { at: 1000, until: 1400, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.4, width: 0.05 } },
    // Last at contact: the dive's burst of feathers (a dash-family hit).
    { at: 1000, until: 1450, layer: 'front', drawer: 'shards', params: { count: 10, distance: 1.3, spin: 540 } },
    { at: 1100, until: 1800, layer: 'front', drawer: 'spiral', params: { turns: 1.5, r0: 0.4, r1: 1.0, rpm: 120, tongues: 10 } },
  ],
  particles: [feathers({ at: 1010, count: 14, distance: 1.4, spread: 360, durationMs: 1000 }), glints({ at: 1020, count: 8, distance: 1.1 })],
});

// ---- special -------------------------------------------------------------------------

export const gust = spec({
  id: 'gust',
  name: 'Gust',
  statClass: 'special',
  tier: 1,
  family: 'wind',
  durationMs: 1000,
  contactMs: 480,
  // The attacker lifts on a wing beat; three small gusts cross the lane and a low whirl of wind
  // wraps the card from behind and in front, lifting it a little.
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'float', params: { lift: 0.12, heat: 0.2 } },
  beats: [
    { at: 0, until: 450, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 5, radius: 0.25, drift: 0.2, alpha: 0.3 } },
    // Landing at 380, 430 and 480: flight = 330 - 2 x 50 = 230 ms; the last gust lands at contact.
    { at: 150, until: 480, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 50, r0: 0.12, r1: 0.16, bow: 0.25, tongues: 2 } },
    { at: 300, until: 950, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.28 } },
    { at: 380, until: 950, layer: 'back', drawer: 'spiral', params: { turns: 1.5, r0: 0.3, r1: 0.9, rpm: 220, tongues: 8 } },
    { at: 420, until: 950, layer: 'front', drawer: 'spiral', params: { turns: 1.5, r0: 0.35, r1: 0.95, rpm: 220, tongues: 8 } },
    { at: 480, until: 620, layer: 'top', drawer: 'impactFlash', params: { r0: 0.25, r1: 0.7 } },
  ],
  particles: [feathers({ at: 490, count: 8, distance: 0.8, spread: 120, gravity: 0.15, durationMs: 800 })],
});

export const airCutter = spec({
  id: 'air-cutter',
  name: 'Air Cutter',
  statClass: 'special',
  tier: 2,
  family: 'slash',
  durationMs: 1300,
  contactMs: 620,
  // Wind swirls round the attacker; it flings three spinning crescents down the lane; they
  // whirl round and through the card as two cuts cross it, and glints of cut air scatter.
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 0.7 } },
  defender: { motion: 'knock', params: { strength: 0.28, heat: 0.5 } },
  beats: [
    { at: 0, until: 420, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 1.5, r0: 0.3, r1: 0.75, rpm: 200, tongues: 8 } },
    // Landing at 500, 560 and 620: flight = 320 - 2 x 60 = 200 ms; the last crescent lands at contact.
    { at: 300, until: 620, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 60, r0: 0.16, r1: 0.2, bow: 0.35, tongues: 3 } },
    { at: 400, until: 1200, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35 } },
    { at: 620, until: 1150, layer: 'front', drawer: 'spiral', params: { turns: 1, r0: 0.3, r1: 0.8, rpm: 240, tongues: 6 } },
    // Listed after the whirl so the cuts carry the family (ties go to the last listed).
    { at: 620, until: 860, layer: 'front', drawer: 'slashArc', params: { count: 2, sweep: 100, radius: 0.7, gapDeg: 90, angle: 45, thick: 0.1 } },
    { at: 620, until: 780, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
  ],
  particles: [glints({ at: 630, count: 12, distance: 0.9 })],
});

export const hurricane = spec({
  id: 'hurricane',
  name: 'Hurricane',
  statClass: 'special',
  tier: 3,
  family: 'wind',
  // The updraft stands 1.6 h above the card's base.
  pad: 1.9,
  durationMs: 2000,
  contactMs: 1000,
  // The attacker rises on beating wings, rings of wind spreading under it; gusts cross the
  // lane, and a whirlwind spins up round the card from its feet (a funnel behind it, blades
  // wrapping in front), lifting it and holding it while air and grit rise through the funnel;
  // the wind dies and the card drops.
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'float', params: { lift: 0.22, heat: 0.4 } },
  beats: [
    { at: 0, until: 800, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 2, r0: 0.4, r1: 1.2, width: 0.04 } },
    { at: 0, until: 850, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 1.5, r0: 0.35, r1: 0.85, rpm: 160, tongues: 8 } },
    // Landing at 760, 830 and 900: flight = 340 - 2 x 70 = 200 ms.
    { at: 560, until: 900, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 70, r0: 0.14, r1: 0.18, bow: 0.3, tongues: 2 } },
    { at: 650, until: 1850, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    { at: 700, until: 1800, layer: 'back', drawer: 'spiral', params: { turns: 2.5, r0: 0.3, r1: 1.1, rpm: 200, tongues: 12 } },
    // Behind the card: thin updraft streaks frame it instead of hiding it (a wide pillar of
    // wind blades reads as one scythe).
    { at: 760, until: 1750, layer: 'back', drawer: 'pillar', params: { height: 1.6, w: 0.3 } },
    { at: 1000, until: 1800, layer: 'front', drawer: 'spiral', params: { turns: 2, r0: 0.35, r1: 1.0, rpm: 220, tongues: 10 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
    { at: 1050, until: 1850, layer: 'front', drawer: 'cloud', params: { count: 7, radius: 0.3, drift: 0.8, alpha: 0.35 } },
  ],
  particles: [
    glints({ at: 1010, count: 10, distance: 1.1 }),
    feathers({ at: 1100, count: 12, distance: 1.3, direction: -90, spread: 180, size: [0.03, 0.05], aspect: 1, gravity: 0, maxDelay: 0.3, durationMs: 1100, kind: 'mote' }),
  ],
});

export const aeroblast = spec({
  id: 'aeroblast',
  name: 'Aeroblast',
  statClass: 'special',
  tier: 3,
  family: 'beam',
  durationMs: 1900,
  contactMs: 960,
  // Wind orbs circle the attacker as a swirling orb builds at its front; rings flash out as it
  // fires a coil of air that corkscrews down the lane into the card; the coil wraps the card,
  // rings spreading off it, and slivers of wind are flung away.
  attacker: { motion: 'rear-lurch', params: { rear: 0.16, lurch: 0.35, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.42, heat: 0.6 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'orbitCharge', params: { count: 4, half: 'back', r0: 0.1, r1: 0.14, tongues: 0, tilt: 0.5 } },
    { at: 0, until: 720, layer: 'front', drawer: 'coreCharge', params: { r0: 0.08, r1: 0.3, from: 0.2 } },
    { at: 0, until: 700, layer: 'front', drawer: 'orbitCharge', params: { count: 4, half: 'front', r0: 0.1, r1: 0.14, tongues: 0, tilt: 0.5 } },
    { at: 640, until: 960, layer: 'back', drawer: 'shockRings', params: { count: 2, r0: 0.3, r1: 1.1 } },
    // The coil's head reaches the card at 720 + 0.4 x 600 = 960.
    { at: 720, until: 1320, layer: 'front', drawer: 'beam', params: { kind: 'helix', w: 0.4, turns: 3, growIn: 0.4, retract: 0.25 } },
    { at: 880, until: 1750, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    { at: 960, until: 1140, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
    { at: 960, until: 1450, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.4, r1: 1.1, width: 0.04 } },
    { at: 1000, until: 1600, layer: 'front', drawer: 'spiral', params: { turns: 2, r0: 0.35, r1: 1.0, rpm: 200, tongues: 10 } },
    { at: 1100, until: 1700, layer: 'front', drawer: 'splash', params: { count: 6, arc: 360, gravity: 0.1, len: [0.4, 0.8] } },
  ],
  particles: [glints({ at: 980, count: 12, distance: 1.2 })],
});

export const FLYING_SPECS = Object.freeze(
  Object.fromEntries([peck, aerialAce, wingAttack, braveBird, gust, airCutter, hurricane, aeroblast].map((s) => [s.id, s]))
);
