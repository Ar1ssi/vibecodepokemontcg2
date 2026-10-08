// Design 063: Bug specs, one per move of the Bug row of the move table. The study pass left no
// Bug entries (refs/063-study/notes/g1-grass-bug.md stops after Grass), so this slice read all
// twelve itself (sprite N2B2 + the newest 3D video per move, Poképédia; X-Scissor from Pokémon
// Central's Gen 5 strip, Twineedle from Colosseum only; Fell Stinger, Lunge and Infestation have
// no sprite-era animation); notes in .agent/scratch/moves/bug/g1b-bug.md.
//
// Bug is yellow-green chitin: needles with dark tips (pins, stingers, the horn), beating wing
// discs, chips of shell. Every move keeps that one palette start to payoff: Pin Missile's gold
// star rings, X-Scissor's red blades and Signal Beam's pink-and-blue signal all become bug
// yellow-green (their 3D versions are green already). Two moves get a variant material: Bug Buzz
// fires sound discs (`buzz`), Silver Wind blows silver powder (`silver`). The sprite games'
// darkened screens, Silver Wind's screen-wide smear and Megahorn's red ring backdrop become local
// vignettes and a floor ring (house rules: no backdrop change, no sunburst, one palette).

/** Chips of chitin knocked off the hit; they fall. */
const chips = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 10,
    distance: 0.9,
    direction: -90,
    spread: 300,
    size: [0.04, 0.08],
    aspect: 0.6,
    gravity: 0.5,
    maxDelay: 0.1,
    durationMs: 700,
    kind: 'shard',
    ...over,
  });

/** Four-point sparkles in the bug yellow-green, drifting off the hit. */
const twinkles = (over) =>
  chips({ count: 10, distance: 1.0, spread: 360, size: [0.05, 0.09], aspect: 1, gravity: 0, maxDelay: 0.2, durationMs: 800, kind: 'twinkle', ...over });

const spec = (over) => Object.freeze({ vgType: 'bug', material: 'bug', pad: 1.7, grain: 0, ...over });

// ---- physical ------------------------------------------------------------------------

export const fellStinger = spec({
  id: 'fell-stinger',
  name: 'Fell Stinger',
  statClass: 'physical',
  tier: 1,
  family: 'projectile',
  durationMs: 1000,
  contactMs: 520,
  // The attacker glows and jabs; one stinger shoots straight down the lane (still in flight at
  // contact); a green bubble ring swells round the stung card and chips fly off it.
  attacker: { motion: 'lunge', params: { wind: 0.15, reach: 0.55, glow: 0.7 } },
  defender: { motion: 'knock', params: { strength: 0.22, heat: 0.5 } },
  beats: [
    // Linear so the stinger is at the card's edge at contact and still in flight (the family's beat).
    { at: 300, until: 560, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.11, r1: 0.13, tongues: 1, ease: 'linear' } },
    { at: 360, until: 960, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
    { at: 520, until: 680, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.8 } },
    { at: 520, until: 860, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.0, width: 0.05 } },
    { at: 540, until: 820, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.7, spin: 120 } },
  ],
  particles: [chips({ at: 530, count: 8, distance: 0.8, spread: 200 })],
});

export const furyCutter = spec({
  id: 'fury-cutter',
  name: 'Fury Cutter',
  statClass: 'physical',
  tier: 1,
  family: 'slash',
  durationMs: 1000,
  contactMs: 520,
  // The light dims round the card; the attacker lunges and one bright cut crosses it on a
  // diagonal, tip leading; chips and sparkles fly off the cut.
  attacker: { motion: 'lunge', params: { wind: 0.2, reach: 0.6, glow: 0.7 } },
  defender: { motion: 'knock', params: { strength: 0.22, heat: 0.5 } },
  beats: [
    { at: 150, until: 950, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.38 } },
    // The cut leads the flash so its sweep reads before the hit (95 % drawn at contact).
    { at: 400, until: 720, layer: 'front', drawer: 'slashArc', params: { sweep: 150, radius: 0.6, angle: 30, thick: 0.16 } },
    { at: 520, until: 680, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.85 } },
    { at: 540, until: 800, layer: 'front', drawer: 'shards', params: { count: 5, distance: 0.6, spin: 200 } },
  ],
  particles: [twinkles({ at: 530, count: 10, distance: 0.9 })],
});

export const pinMissile = spec({
  id: 'pin-missile',
  name: 'Pin Missile',
  statClass: 'physical',
  tier: 1,
  family: 'projectile',
  durationMs: 1100,
  contactMs: 500,
  // Three pins shot down the lane in a quick file, each striking a blow: a flash and a ring
  // where they land, chips and sparkles off the last.
  attacker: { motion: 'lunge', params: { wind: 0.15, reach: 0.3, glow: 0.6 } },
  defender: { motion: 'stagger', params: { strength: 0.26, hits: 3, gapMs: 60, heat: 0.5 } },
  beats: [
    { at: 300, until: 1050, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.32 } },
    // Landing at 500, 560 and 620: flight = 300 - 2 x 60 = 180 ms; one pin per blow.
    { at: 320, until: 620, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 60, r0: 0.1, r1: 0.12, bow: 0.12, tongues: 1 } },
    { at: 500, until: 640, layer: 'top', drawer: 'impactFlash', params: { r0: 0.25, r1: 0.7 } },
    { at: 510, until: 760, layer: 'front', drawer: 'shards', params: { count: 5, distance: 0.6, spin: 180 } },
    { at: 560, until: 700, layer: 'top', drawer: 'impactFlash', params: { r0: 0.25, r1: 0.75 } },
    { at: 620, until: 780, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.9 } },
    { at: 620, until: 920, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.2, r1: 0.9, width: 0.05 } },
  ],
  particles: [chips({ at: 510, count: 8, distance: 0.7, spread: 200 }), twinkles({ at: 630, count: 8, distance: 0.9 })],
});

export const twineedle = spec({
  id: 'twineedle',
  name: 'Twineedle',
  statClass: 'physical',
  tier: 1,
  family: 'projectile',
  durationMs: 1050,
  contactMs: 480,
  // Two stingers circle the attacker, then fly down the lane one after the other; each lands a
  // blow with a green-white burst and a ring.
  attacker: { motion: 'lunge', params: { wind: 0.15, reach: 0.35, glow: 0.7 } },
  defender: { motion: 'stagger', params: { strength: 0.28, hits: 2, gapMs: 90, heat: 0.55 } },
  beats: [
    { at: 0, until: 360, layer: 'front', drawer: 'orbitCharge', params: { count: 2, r0: 0.08, r1: 0.1, tongues: 1, tilt: 0.5 } },
    { at: 280, until: 1000, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.32 } },
    // Landing at 480 and 570: flight = 270 - 90 = 180 ms; one stinger per blow.
    { at: 300, until: 570, layer: 'front', drawer: 'volley', params: { count: 2, stagger: 90, r0: 0.1, r1: 0.13, bow: 0.2, tongues: 2 } },
    { at: 480, until: 640, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
    { at: 480, until: 760, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.25, r1: 0.9, width: 0.05 } },
    { at: 490, until: 760, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.7, spin: 180 } },
    { at: 570, until: 740, layer: 'top', drawer: 'impactFlash', params: { r1: 1.1 } },
    { at: 570, until: 850, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.25, r1: 1.0, width: 0.05 } },
  ],
  particles: [chips({ at: 490, count: 8, distance: 0.7, spread: 200 }), chips({ at: 580, count: 8, distance: 0.9 })],
});

export const xScissor = spec({
  id: 'x-scissor',
  name: 'X-Scissor',
  statClass: 'physical',
  tier: 2,
  family: 'slash',
  durationMs: 1400,
  contactMs: 700,
  // The attacker rushes in and two blades scissor across the card in opposite directions,
  // locking into an X at contact (Cross Poison's geometry); a ring and chips burst out of the
  // cut and sparkles spread from it.
  attacker: { motion: 'dash', params: { wind: 0.2, reach: 0.8, overshoot: 0.2, arc: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.36, heat: 0.6 } },
  beats: [
    { at: 0, until: 560, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.35, hz: 3, r0: 0.55, r1: 0.65 } },
    { at: 420, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
    // Settled into the X by 0.45 of the beat (700, the flash), held to 0.6, then they fade.
    { at: 480, until: 960, layer: 'front', drawer: 'slashArc', params: { sweep: 300, radius: 0.5, angle: -105, thick: 0.2 } },
    { at: 480, until: 960, layer: 'front', drawer: 'slashArc', params: { sweep: -300, radius: 0.5, angle: 285, thick: 0.2 } },
    { at: 700, until: 880, layer: 'top', drawer: 'impactFlash', params: { r1: 1.1 } },
    { at: 700, until: 1000, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.1, width: 0.05 } },
    { at: 720, until: 1060, layer: 'front', drawer: 'shards', params: { count: 8, distance: 1.0, spin: 180 } },
  ],
  particles: [twinkles({ at: 720, count: 12, distance: 1.1 }), chips({ at: 760, count: 8 })],
});

export const lunge = spec({
  id: 'lunge',
  name: 'Lunge',
  statClass: 'physical',
  tier: 2,
  family: 'dash',
  durationMs: 1400,
  contactMs: 700,
  // Rings whirl round the attacker as a beating ball of green light gathers at its front; the
  // attacker leaps down the lane behind the ball, which arcs in and bursts on the card in a
  // spray of chips.
  attacker: { motion: 'dash', params: { wind: 0.25, reach: 0.85, overshoot: 0.25, arc: 0.5 } },
  defender: { motion: 'knock', params: { strength: 0.38, heat: 0.6 } },
  beats: [
    { at: 0, until: 560, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.45, r1: 0.85, width: 0.04 } },
    { at: 150, until: 480, layer: 'front', drawer: 'coreCharge', params: { r0: 0.1, r1: 0.3, from: 0.2 } },
    // The ball (a wing disc at 0 tongues) leaves at the size it was packed to, arcs in and lands
    // at contact.
    { at: 420, until: 700, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.35, r0: 0.3, r1: 0.34, tongues: 0 } },
    { at: 450, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
    { at: 700, until: 880, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
    { at: 700, until: 1000, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.2, width: 0.05 } },
    // Last at contact: the ball bursts (a dash-family hit).
    { at: 700, until: 1060, layer: 'front', drawer: 'shards', params: { count: 10, distance: 1.1, spin: 240 } },
  ],
  particles: [chips({ at: 710, count: 12, distance: 1.1 }), twinkles({ at: 760, count: 8 })],
});

export const megahorn = spec({
  id: 'megahorn',
  name: 'Megahorn',
  statClass: 'physical',
  tier: 3,
  family: 'dash',
  durationMs: 1800,
  contactMs: 1000,
  // Power gathers at the attacker's front and a ring glints off it; it charges, a great horn
  // leading it down the lane tip first; the horn strikes at contact, chips burst off the card
  // and a ring spreads on the floor under it.
  attacker: { motion: 'dash', params: { wind: 0.3, reach: 0.9, overshoot: 0.3, arc: 0.25 } },
  defender: { motion: 'knock', params: { strength: 0.48, heat: 0.75 } },
  beats: [
    { at: 0, until: 620, layer: 'front', drawer: 'coreCharge', params: { r0: 0.08, r1: 0.26, from: 0.25 } },
    { at: 300, until: 700, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 1, r0: 0.3, r1: 0.9, width: 0.04 } },
    { at: 600, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    // The horn: one great needle (0.8 card long) leading the charge, its tip striking at contact.
    { at: 560, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.3, r1: 0.34, tongues: 2 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.35 } },
    { at: 1000, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.35, r1: 1.4, width: 0.06 } },
    // Last at contact: the horn's blow bursts into chips (a dash-family hit).
    { at: 1000, until: 1450, layer: 'front', drawer: 'shards', params: { count: 12, distance: 1.3, spin: 300 } },
  ],
  particles: [chips({ at: 1010, count: 14, distance: 1.3 }), twinkles({ at: 1100, count: 8 })],
});

// ---- special -------------------------------------------------------------------------

export const infestation = spec({
  id: 'infestation',
  name: 'Infestation',
  statClass: 'special',
  tier: 1,
  family: 'wind',
  durationMs: 1050,
  contactMs: 480,
  // A swarm of beating wing motes streams down the lane on wavering paths, the last reaching the
  // card at contact; the swarm boils round it, stingers darting behind and in front of it.
  attacker: { motion: 'brace', params: { rear: 0.08, scale: 1.04, glow: 0.5 } },
  defender: { motion: 'knock', params: { strength: 0.18, heat: 0.4 } },
  beats: [
    // Landing at 330 ... 480: flight = 320 - 5 x 30 = 170 ms; the last mote lands at contact.
    { at: 160, until: 480, layer: 'front', drawer: 'volley', params: { count: 6, stagger: 30, r0: 0.06, r1: 0.08, bow: 0.5, tongues: 0 } },
    { at: 300, until: 1000, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.32 } },
    { at: 480, until: 620, layer: 'top', drawer: 'impactFlash', params: { r0: 0.25, r1: 0.7 } },
    { at: 480, until: 1000, layer: 'back', drawer: 'spiral', params: { turns: 1.5, r0: 0.35, r1: 0.8, rpm: 220, tongues: 7 } },
    // Last at contact: the swarm whirls round the card (a wind-family hit).
    { at: 480, until: 1000, layer: 'front', drawer: 'spiral', params: { turns: 1.5, r0: 0.3, r1: 0.75, rpm: 240, tongues: 7 } },
  ],
  particles: [twinkles({ at: 490, count: 10, distance: 0.8, size: [0.03, 0.06], kind: 'mote' })],
});

export const struggleBug = spec({
  id: 'struggle-bug',
  name: 'Struggle Bug',
  statClass: 'special',
  tier: 2,
  family: 'burst',
  durationMs: 1350,
  contactMs: 700,
  // The attacker shakes and buzzes, chips flying off it; a fan of needles sweeps down the lane
  // on wide curves, the last landing at contact; sparkles pop on the card.
  attacker: { motion: 'rear-lurch', params: { rear: 0.1, lurch: 0.25, glow: 0.7 } },
  defender: { motion: 'knock', params: { strength: 0.28, heat: 0.5 } },
  beats: [
    { at: 0, until: 520, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.4, hz: 6, r0: 0.55, r1: 0.62 } },
    { at: 250, until: 560, layer: 'front', drawer: 'shards', params: { target: 'attacker', count: 6, distance: 0.6, spin: 180 } },
    // Landing at 550, 600, 650 and 700: flight = 320 - 3 x 50 = 170 ms; the last lands at contact.
    { at: 380, until: 700, layer: 'front', drawer: 'volley', params: { count: 4, stagger: 50, r0: 0.07, r1: 0.09, bow: 0.5, tongues: 1 } },
    { at: 450, until: 1250, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.38 } },
    { at: 700, until: 860, layer: 'top', drawer: 'impactFlash', params: { r1: 0.95 } },
    { at: 700, until: 1000, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.3, r1: 0.9, width: 0.05 } },
    // Last at contact: the sparkles pop (a burst-family hit).
    { at: 700, until: 1000, layer: 'front', drawer: 'shards', params: { count: 7, distance: 0.8, spin: 240 } },
  ],
  particles: [chips({ at: 300, anchor: 'attacker', count: 6, distance: 0.6, gravity: 0.6 }), twinkles({ at: 710, count: 12 })],
});

export const silverWind = spec({
  id: 'silver-wind',
  name: 'Silver Wind',
  statClass: 'special',
  tier: 2,
  family: 'wind',
  material: 'silver',
  durationMs: 1400,
  contactMs: 700,
  // The attacker rises on its wings in a puff of silver powder; a twisting stream of powder
  // scales blows down the lane into the card; a gust swirls behind it, the powder mist rolls
  // over it and lifts it, and scales drift down.
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'float', params: { lift: 0.12, heat: 0.4 } },
  beats: [
    { at: 0, until: 480, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 5, radius: 0.25, drift: 0.2, alpha: 0.35 } },
    // The stream's head reaches the card 40 % into the beat: 420 + 0.4 x 700 = 700.
    { at: 420, until: 1120, layer: 'front', drawer: 'beam', params: { kind: 'helix', w: 0.35, turns: 2.5, growIn: 0.4, retract: 0.25 } },
    { at: 450, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
    { at: 650, until: 1250, layer: 'back', drawer: 'spiral', params: { turns: 1.5, r0: 0.3, r1: 0.95, rpm: 160, tongues: 7 } },
    { at: 700, until: 860, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
    // Last at contact: the powder mist rolls over the card (a wind-family hit).
    { at: 700, until: 1300, layer: 'front', drawer: 'cloud', params: { count: 7, radius: 0.35, drift: 0.3, alpha: 0.4 } },
  ],
  particles: [
    twinkles({ at: 710, count: 12, distance: 1.0, gravity: 0.1, durationMs: 1000, kind: 'mote' }),
    twinkles({ at: 950, count: 8, distance: 0.7, gravity: 0.1, maxDelay: 0.3, kind: 'mote' }),
  ],
});

export const signalBeam = spec({
  id: 'signal-beam',
  name: 'Signal Beam',
  statClass: 'special',
  tier: 2,
  family: 'beam',
  durationMs: 1350,
  contactMs: 700,
  // Rings pulse at the attacker's front as a wing disc of light builds there; a signal of
  // bright dashes fires down the lane into the card; rings spread round it and confetti chips
  // and sparkles fly off it.
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.6 } },
  beats: [
    { at: 0, until: 450, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.2, r1: 0.7, width: 0.04 } },
    { at: 0, until: 460, layer: 'front', drawer: 'coreCharge', params: { r0: 0.06, r1: 0.2, from: 0.2 } },
    // The signal's head reaches the card 40 % into the beat: 420 + 0.4 x 700 = 700.
    { at: 420, until: 1120, layer: 'front', drawer: 'beam', params: { kind: 'segmented', w: 0.3, growIn: 0.4, retract: 0.25 } },
    { at: 500, until: 1250, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
    { at: 700, until: 860, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
    { at: 700, until: 1150, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.25, r1: 1.0, width: 0.04 } },
    // After contact, so the signal carries the family.
    { at: 760, until: 1150, layer: 'front', drawer: 'shards', params: { count: 8, distance: 0.9, spin: 360 } },
  ],
  particles: [twinkles({ at: 710, count: 12 }), chips({ at: 780, count: 8 })],
});

export const bugBuzz = spec({
  id: 'bug-buzz',
  name: 'Bug Buzz',
  statClass: 'special',
  tier: 3,
  family: 'beam',
  material: 'buzz',
  durationMs: 1900,
  contactMs: 1000,
  // The wings beat and sound rings pulse off the attacker as a sound disc swells at its front;
  // rings flash off it as a train of sound discs fires down the lane into the card; rings spread
  // round it, the sound throbs about it and chips fly off it.
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.35, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.38, heat: 0.8 } },
  beats: [
    { at: 0, until: 720, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 3, r0: 0.3, r1: 1.1, width: 0.05 } },
    { at: 200, until: 720, layer: 'front', drawer: 'coreCharge', params: { r0: 0.08, r1: 0.26, from: 0.2 } },
    { at: 600, until: 950, layer: 'back', drawer: 'shockRings', params: { count: 2, r0: 0.3, r1: 1.1 } },
    // The train's head reaches the card 40 % into the beat: 760 + 0.4 x 600 = 1000.
    { at: 760, until: 1360, layer: 'front', drawer: 'beam', params: { kind: 'pulse-train', w: 0.5, gap: 0.32, speed: 2.2, growIn: 0.4, retract: 0.25 } },
    { at: 800, until: 1800, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.42 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
    { at: 1000, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.3, r1: 1.3, width: 0.05 } },
    // Just after contact, so the train carries the family: chips fly off the card.
    { at: 1030, until: 1500, layer: 'front', drawer: 'shards', params: { count: 10, distance: 1.2, spin: 300 } },
  ],
  particles: [twinkles({ at: 1030, count: 14, distance: 1.2 }), chips({ at: 1040, count: 10, distance: 1.1 })],
});

export const BUG_SPECS = Object.freeze(
  Object.fromEntries(
    [fellStinger, furyCutter, pinMissile, twineedle, xScissor, lunge, megahorn, infestation, struggleBug, silverWind, signalBeam, bugBuzz].map((s) => [s.id, s])
  )
);
