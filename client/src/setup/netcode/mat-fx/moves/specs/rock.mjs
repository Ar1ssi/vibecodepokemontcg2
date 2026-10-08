// Design 063: Rock specs, one per move of the Rock row of the move table. The study pass left
// no Rock entries (refs/063-study/notes/g6-ground-rock.md covers Ground only); this slice read
// all ten itself (sprite N2B2 + the Scarlet/Violet video per move, Poképédia; Ancient Power's
// sprite is Pokémon Central's Gen V APNG; notes in .agent/scratch/moves/rock/g6c-rock.md).
//
// Stone is solid and heavy: grey stones with a lit facet and a dark outline, thrown, dropped
// from above or bursting up out of the floor; chips fly off every hit and fall, stone dust
// hangs after. Two variants keep their moves' signature without leaving the family: Ancient
// Power's stones ride a violet aura (`ancient`), Power Gem's crystals are light (`gem`). The
// sprite games' full-screen backdrops (Smack Down's blue streaks, Head Smash's orange burst,
// Rock Wrecker's red-yellow speed lines) and Head Smash's whiteout become local vignettes and
// flashes (house rules: no whiteouts, no sunbursts, one palette).

/** Stone chips knocked off the struck card, falling. */
const chips = (over) =>
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
    durationMs: 700,
    kind: 'shard',
    ...over,
  });

const spec = (over) => Object.freeze({ vgType: 'rock', material: 'rock', pad: 1.7, grain: 0.1, ...over });

// ---- physical ------------------------------------------------------------------------

export const smackDown = spec({
  id: 'smack-down',
  name: 'Smack Down',
  statClass: 'physical',
  tier: 1,
  family: 'quake',
  durationMs: 1000,
  contactMs: 520,
  // A stone forms in the hand and is flung straight down the lane; it strikes and slams the
  // card down into the floor: a dust ring round its feet, chips flying, the table jolting.
  attacker: { motion: 'brace', params: { rear: 0.1, scale: 1.05, glow: 0.4 } },
  defender: { motion: 'sink', params: { heat: 0.4 } },
  beats: [
    { at: 0, until: 300, layer: 'front', drawer: 'coreCharge', params: { r0: 0.06, r1: 0.16, from: 0.2 } },
    { at: 260, until: 520, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.14, r1: 0.18, tongues: 2 } },
    { at: 420, until: 950, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.32 } },
    { at: 520, until: 820, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.2 } },
    { at: 520, until: 900, layer: 'back', drawer: 'terrain', params: { kind: 'dust', radius: 1.0 } },
    { at: 520, until: 680, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.9 } },
    { at: 520, until: 800, layer: 'front', drawer: 'shards', params: { count: 6, arc: 160, distance: 0.8, spin: 300 } },
    // Last at contact: the slam is a quake (the family follows it).
    { at: 520, until: 780, layer: 'front', drawer: 'terrain', params: { kind: 'quake', amp: 0.025 } },
    { at: 600, until: 1000, layer: 'front', drawer: 'smoke', params: { count: 4, rise: 0.5 } },
  ],
  particles: [chips({ at: 530, count: 10, distance: 0.8, durationMs: 560 })],
});

export const rockThrow = spec({
  id: 'rock-throw',
  name: 'Rock Throw',
  statClass: 'physical',
  tier: 1,
  family: 'burst',
  durationMs: 1100,
  contactMs: 450,
  // Three rocks drop onto the card from above, 70 ms apart; each lands a blow and breaks into
  // chips that scatter and fall; dust after.
  attacker: { motion: 'brace', params: { rear: 0.08, scale: 1.05, glow: 0.3 } },
  defender: { motion: 'stagger', params: { strength: 0.28, hits: 3, gapMs: 70, heat: 0.35 } },
  beats: [
    { at: 0, until: 400, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.3, hz: 2 } },
    // Landing at 450, 520 and 590: flight = 420 - 2 x 70 = 280 ms.
    { at: 170, until: 590, layer: 'front', drawer: 'volley', params: { from: 'sky', count: 3, stagger: 70, r0: 0.16, r1: 0.2, bow: 0.15, tongues: 1 } },
    { at: 350, until: 1000, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
    { at: 450, until: 610, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.9 } },
    { at: 450, until: 750, layer: 'front', drawer: 'shards', params: { count: 6, arc: 200, distance: 0.8, spin: 300 } },
    { at: 520, until: 650, layer: 'top', drawer: 'impactFlash', params: { r0: 0.25, r1: 0.6 } },
    { at: 590, until: 740, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.75 } },
    { at: 590, until: 900, layer: 'front', drawer: 'shards', params: { count: 6, arc: 200, distance: 0.9, spin: 300 } },
    { at: 700, until: 1100, layer: 'front', drawer: 'smoke', params: { count: 4, rise: 0.5 } },
  ],
  particles: [chips({ at: 600, count: 12, distance: 0.9, spread: 200 })],
});

export const rockBlast = spec({
  id: 'rock-blast',
  name: 'Rock Blast',
  statClass: 'physical',
  tier: 1,
  family: 'burst',
  durationMs: 1100,
  contactMs: 420,
  // A stone forms in the hand; three are fired down the lane one after another, each bursting
  // on the card in a puff of dust and chips, the last biggest.
  attacker: { motion: 'brace', params: { rear: 0.12, scale: 1.04, glow: 0.3 } },
  defender: { motion: 'stagger', params: { strength: 0.3, hits: 3, gapMs: 90, heat: 0.35 } },
  beats: [
    { at: 0, until: 380, layer: 'front', drawer: 'coreCharge', params: { r0: 0.06, r1: 0.14, from: 0.2 } },
    // Landing at 420, 510 and 600: flight = 460 - 2 x 90 = 280 ms.
    { at: 140, until: 600, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 90, r0: 0.12, r1: 0.16, bow: 0.2, tongues: 2 } },
    { at: 300, until: 1000, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
    { at: 420, until: 580, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.8 } },
    { at: 420, until: 700, layer: 'front', drawer: 'shards', params: { count: 5, distance: 0.7, spin: 300 } },
    { at: 510, until: 670, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.8 } },
    { at: 510, until: 790, layer: 'front', drawer: 'shards', params: { count: 5, distance: 0.7, spin: 300 } },
    { at: 600, until: 780, layer: 'top', drawer: 'impactFlash', params: { r0: 0.35, r1: 1.0 } },
    { at: 600, until: 900, layer: 'front', drawer: 'shards', params: { count: 8, distance: 1.0, spin: 400 } },
    // The sprite's dust puff at each burst.
    { at: 440, until: 1050, layer: 'front', drawer: 'cloud', params: { count: 5, radius: 0.3, drift: 0.2, alpha: 0.35 } },
    { at: 650, until: 1100, layer: 'front', drawer: 'smoke', params: { count: 4, rise: 0.5 } },
  ],
  particles: [chips({ at: 610, count: 12, distance: 1.0, spread: 220 })],
});

export const rockSlide = spec({
  id: 'rock-slide',
  name: 'Rock Slide',
  statClass: 'physical',
  tier: 2,
  family: 'burst',
  durationMs: 1400,
  contactMs: 700,
  // The attacker gathers itself; a slide of four rocks tumbles onto the card from above,
  // 70 ms apart, cracking the floor and throwing up dust and chips; dust settles.
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.25, glow: 0.6 } },
  defender: { motion: 'stagger', params: { strength: 0.4, hits: 4, gapMs: 70, heat: 0.5 } },
  beats: [
    { at: 0, until: 560, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.35, hz: 2 } },
    // Landing at 700, 770, 840 and 910: flight = 510 - 3 x 70 = 300 ms.
    { at: 400, until: 910, layer: 'front', drawer: 'volley', params: { from: 'sky', count: 4, stagger: 70, r0: 0.15, r1: 0.22, bow: 0.25, tongues: 1 } },
    { at: 560, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.38 } },
    { at: 700, until: 1250, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.1 } },
    { at: 700, until: 1300, layer: 'back', drawer: 'terrain', params: { kind: 'dust', radius: 1.2 } },
    { at: 700, until: 870, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
    { at: 700, until: 1050, layer: 'front', drawer: 'shards', params: { count: 8, arc: 220, distance: 1.0, spin: 400 } },
    { at: 840, until: 980, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.7 } },
    { at: 840, until: 1150, layer: 'front', drawer: 'shards', params: { count: 6, arc: 220, distance: 0.8, spin: 400 } },
    { at: 950, until: 1400, layer: 'front', drawer: 'smoke', params: { count: 5, rise: 0.6 } },
  ],
  particles: [chips({ at: 710, count: 14, spread: 200 }), chips({ at: 900, count: 8, distance: 0.6, spread: 360, maxDelay: 0.3 })],
});

export const rockTomb = spec({
  id: 'rock-tomb',
  name: 'Rock Tomb',
  statClass: 'physical',
  tier: 2,
  family: 'burst',
  durationMs: 1400,
  contactMs: 680,
  // Three rocks are hurled in high arcs and land on and round the card; slabs of stone heave
  // up behind it, walling it in, and it is pressed into the floor in a ring of dust.
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 0.5 } },
  defender: { motion: 'sink', params: { heat: 0.5 } },
  beats: [
    { at: 0, until: 520, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.3, hz: 2 } },
    // Landing at 680, 760 and 840: flight = 480 - 2 x 80 = 320 ms.
    { at: 360, until: 840, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 80, r0: 0.15, r1: 0.2, bow: 0.45, tongues: 1 } },
    { at: 540, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.38 } },
    // Behind the struck card: the tomb walls it in without hiding it.
    { at: 680, until: 1350, layer: 'back', drawer: 'pillar', params: { height: 1.5, w: 0.9 } },
    { at: 680, until: 1200, layer: 'back', drawer: 'terrain', params: { kind: 'dust', radius: 1.1 } },
    { at: 680, until: 1060, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.4, r1: 1.2 } },
    { at: 680, until: 850, layer: 'top', drawer: 'impactFlash', params: { r0: 0.35, r1: 0.95 } },
    { at: 680, until: 1000, layer: 'front', drawer: 'shards', params: { count: 6, arc: 180, distance: 0.8, spin: 300 } },
    { at: 840, until: 1150, layer: 'front', drawer: 'shards', params: { count: 6, arc: 180, distance: 0.8, spin: 300 } },
    { at: 950, until: 1400, layer: 'front', drawer: 'smoke', params: { count: 5, rise: 0.5 } },
  ],
  particles: [chips({ at: 690, count: 12, spread: 180 }), chips({ at: 850, count: 8, distance: 0.6, spread: 360, maxDelay: 0.3 })],
});

export const headSmash = spec({
  id: 'head-smash',
  name: 'Head Smash',
  statClass: 'physical',
  tier: 3,
  family: 'dash',
  durationMs: 1900,
  contactMs: 1000,
  // Power gathers round the attacker until it launches; it rams the card head first: a ring
  // of impact, the floor cracking, stone flung everywhere, the table jolting; dust after.
  // (The sprite's orange sunburst and the 3D clip's whiteout are dropped.)
  attacker: { motion: 'dash', params: { wind: 0.3, reach: 1.0, overshoot: 0.15, arc: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.5, heat: 0.7 } },
  beats: [
    { at: 0, until: 900, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.55, hz: 3 } },
    { at: 700, until: 1000, layer: 'back', drawer: 'shockRings', params: { count: 2, r0: 0.3, r1: 1.0 } },
    { at: 700, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.4 } },
    { at: 1000, until: 1400, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.4, width: 0.05 } },
    { at: 1000, until: 1550, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.3 } },
    { at: 1000, until: 1350, layer: 'front', drawer: 'terrain', params: { kind: 'quake', amp: 0.04 } },
    // Last at contact: the ram's burst of stone (a dash family hit).
    { at: 1000, until: 1450, layer: 'front', drawer: 'shards', params: { count: 12, distance: 1.3, spin: 540 } },
    { at: 1250, until: 1900, layer: 'front', drawer: 'smoke', params: { count: 6, rise: 0.9 } },
  ],
  particles: [chips({ at: 1010, count: 14, distance: 1.4, spread: 360 }), chips({ at: 1200, count: 8, distance: 0.6, spread: 360, maxDelay: 0.3 })],
});

export const stoneEdge = spec({
  id: 'stone-edge',
  name: 'Stone Edge',
  statClass: 'physical',
  tier: 3,
  family: 'quake',
  durationMs: 1900,
  contactMs: 1000,
  // The attacker gathers itself and stamps; cracks run out under the card and dust rises
  // round its feet, then sharp stone spires burst up behind it, stone shoots skyward off the
  // hit and the table shakes; dust hangs after.
  attacker: { motion: 'stomp', params: {} },
  defender: { motion: 'knock', params: { strength: 0.42, heat: 0.6 } },
  beats: [
    { at: 0, until: 800, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.4, hz: 2 } },
    { at: 450, until: 1550, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.2 } },
    { at: 600, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.42 } },
    { at: 650, until: 1100, layer: 'back', drawer: 'terrain', params: { kind: 'dust', radius: 1.0 } },
    // Behind the struck card, so the spires frame it instead of hiding it.
    { at: 1000, until: 1600, layer: 'back', drawer: 'pillar', params: { height: 2.0, w: 0.55 } },
    { at: 1000, until: 1400, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.4, r1: 1.4 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'shards', params: { count: 12, arc: 120, distance: 1.4, spin: 300 } },
    // Last at contact: the eruption is a quake.
    { at: 1000, until: 1350, layer: 'front', drawer: 'terrain', params: { kind: 'quake', amp: 0.035 } },
    { at: 1300, until: 1900, layer: 'front', drawer: 'smoke', params: { count: 5, rise: 0.9 } },
  ],
  particles: [chips({ at: 1010, count: 16, distance: 1.5, spread: 120 }), chips({ at: 1250, count: 8, distance: 0.6, spread: 360, maxDelay: 0.3 })],
});

export const rockWrecker = spec({
  id: 'rock-wrecker',
  name: 'Rock Wrecker',
  statClass: 'physical',
  tier: 3,
  family: 'burst',
  durationMs: 2100,
  contactMs: 1150,
  // Stones circle the attacker and pack into one great boulder at its front; it is hurled
  // straight down the lane and smashes into the card: the floor cracks, a ring spreads, stone
  // flies, the table shakes, and a cloud of stone dust rolls over the card.
  attacker: { motion: 'rear-lurch', params: { rear: 0.18, lurch: 0.4, glow: 0.7 } },
  defender: { motion: 'knock', params: { strength: 0.5, heat: 0.8 } },
  beats: [
    { at: 0, until: 800, layer: 'back', drawer: 'orbitCharge', params: { count: 5, half: 'back', r0: 0.1, r1: 0.14, tongues: 0 } },
    { at: 0, until: 800, layer: 'front', drawer: 'coreCharge', params: { r0: 0.14, r1: 0.5, from: 0.25 } },
    { at: 0, until: 800, layer: 'front', drawer: 'orbitCharge', params: { count: 5, half: 'front', r0: 0.1, r1: 0.14, tongues: 0 } },
    { at: 760, until: 1100, layer: 'back', drawer: 'shockRings', params: { count: 2 } },
    { at: 800, until: 1150, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.48, r1: 0.5, bow: 0, tongues: 3 } },
    { at: 950, until: 2000, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    { at: 1150, until: 1330, layer: 'top', drawer: 'impactFlash', params: { r1: 1.4 } },
    { at: 1150, until: 1700, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.4 } },
    { at: 1150, until: 1550, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.4, r1: 1.5 } },
    { at: 1150, until: 1600, layer: 'front', drawer: 'terrain', params: { kind: 'quake', amp: 0.04 } },
    { at: 1150, until: 1550, layer: 'front', drawer: 'shards', params: { count: 12, distance: 1.3, spin: 540 } },
    { at: 1200, until: 2000, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.45, drift: 0.3, alpha: 0.4 } },
    { at: 1350, until: 2100, layer: 'front', drawer: 'smoke', params: { count: 7, rise: 1.0 } },
  ],
  particles: [chips({ at: 1160, count: 16, distance: 1.4, spread: 360 }), chips({ at: 1400, count: 8, distance: 0.6, spread: 360, maxDelay: 0.3 })],
});

// ---- special -------------------------------------------------------------------------

export const ancientPower = spec({
  id: 'ancient-power',
  name: 'Ancient Power',
  statClass: 'special',
  tier: 2,
  family: 'burst',
  material: 'ancient',
  durationMs: 1450,
  contactMs: 760,
  // A violet aura wells up round the attacker and stones rise to circle it, each wrapped in
  // the aura; they are flung in high arcs onto the card one after another, bursting, a violet
  // ring spreading off the hit, motes of the aura drifting up after.
  attacker: { motion: 'rear-lurch', params: { rear: 0.1, lurch: 0.25, glow: 0.8 } },
  defender: { motion: 'stagger', params: { strength: 0.35, hits: 3, gapMs: 90, heat: 0.6 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.45, hz: 1.5 } },
    { at: 0, until: 560, layer: 'back', drawer: 'orbitCharge', params: { count: 5, half: 'back', r0: 0.1, r1: 0.13, tongues: 0, tilt: 0.5 } },
    { at: 0, until: 560, layer: 'front', drawer: 'orbitCharge', params: { count: 5, half: 'front', r0: 0.1, r1: 0.13, tongues: 0, tilt: 0.5 } },
    // Landing at 760, 850 and 940 (one blow each): flight = 480 - 2 x 90 = 300 ms.
    { at: 460, until: 940, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 90, r0: 0.12, r1: 0.14, bow: 0.5, tongues: 1 } },
    { at: 560, until: 1350, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.38 } },
    { at: 760, until: 920, layer: 'top', drawer: 'impactFlash', params: { r0: 0.4, r1: 1.0 } },
    { at: 760, until: 1150, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.2, width: 0.05 } },
    { at: 760, until: 1100, layer: 'front', drawer: 'shards', params: { count: 8, distance: 0.9, spin: 300 } },
    { at: 940, until: 1250, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.8, spin: 300 } },
    { at: 1000, until: 1450, layer: 'front', drawer: 'smoke', params: { count: 4, rise: 0.6 } },
  ],
  particles: [
    chips({ at: 770, count: 12, distance: 0.9, spread: 360, gravity: 0.8 }),
    chips({ at: 900, count: 10, distance: 0.7, spread: 120, size: [0.03, 0.05], aspect: 1, gravity: 0, durationMs: 900, kind: 'mote' }),
  ],
});

export const powerGem = spec({
  id: 'power-gem',
  name: 'Power Gem',
  statClass: 'special',
  tier: 3,
  family: 'beam',
  material: 'gem',
  // Light, not matter: the grain pass would pit the crystals.
  grain: 0,
  durationMs: 1800,
  contactMs: 960,
  // Gems of light circle the attacker as a glow gathers at its front; rings flash out as they
  // fire, a stream of crystals racing down the lane into the card, which shines; crescents of
  // crystal light sweep round it as sparkles scatter.
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.3, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.8 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'orbitCharge', params: { count: 4, half: 'back', r0: 0.1, r1: 0.14, tongues: 0 } },
    { at: 0, until: 720, layer: 'front', drawer: 'coreCharge', params: { r0: 0.08, r1: 0.22, from: 0.3 } },
    { at: 0, until: 700, layer: 'front', drawer: 'orbitCharge', params: { count: 4, half: 'front', r0: 0.1, r1: 0.14, tongues: 0 } },
    { at: 640, until: 960, layer: 'back', drawer: 'shockRings', params: { count: 2, r0: 0.3, r1: 1.1 } },
    // The stream's head reaches the card at 720 + 0.4 x 600 = 960.
    { at: 720, until: 1320, layer: 'front', drawer: 'beam', params: { kind: 'pulse-train', w: 0.3, gap: 0.35, speed: 3, growIn: 0.4, retract: 0.25 } },
    { at: 880, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
    { at: 960, until: 1120, layer: 'top', drawer: 'impactFlash', params: { r1: 1.15 } },
    // Short sweeps (a chord of ~55 degrees) so they read as crescents, not lines across the card;
    // after contact, so the hit stays the beam's.
    { at: 1000, until: 1400, layer: 'front', drawer: 'slashArc', params: { count: 2, sweep: 100, radius: 0.65, gapDeg: 180, angle: 0, thick: 0.08 } },
    { at: 1250, until: 1650, layer: 'front', drawer: 'slashArc', params: { count: 2, sweep: 100, radius: 0.8, gapDeg: 180, angle: 90, thick: 0.07 } },
  ],
  particles: [
    chips({ at: 970, count: 14, distance: 1.0, spread: 360, size: [0.04, 0.08], aspect: 1, gravity: 0, durationMs: 800, kind: 'twinkle' }),
    chips({ at: 1000, count: 8, distance: 0.8, spread: 360, gravity: 0.6 }),
  ],
});

export const ROCK_SPECS = Object.freeze(
  Object.fromEntries(
    [smackDown, rockThrow, rockBlast, rockSlide, rockTomb, headSmash, stoneEdge, rockWrecker, ancientPower, powerGem].map((s) => [s.id, s])
  )
);
