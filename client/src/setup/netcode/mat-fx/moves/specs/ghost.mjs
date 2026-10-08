// Design 063: Ghost specs, one per move of the Ghost row of the move table. Lick, Astonish and
// Shadow Punch read from the study pass's Haiku notes (refs/063-study/notes/g4-ghost-dark.md);
// this slice studied the other six itself (sprite N2B2 + the newest 3D video per move,
// Poképédia; notes in .agent/scratch/moves/ghost/g4c-ghost.md). Phantom Force has no
// sprite-era animation and reads from its Scarlet/Violet video only; Night Shade's sprite is
// Pokémon Central's Gen 5 strip.
//
// Every move draws in the one ghost material, violet light on shadow start to payoff: Lick's
// pink tongue, Astonish's yellow startle mark, Shadow Punch's cyan fist and Shadow Ball's
// crimson core all become the material's violet wisps and shadow balls. The sprite games'
// whole-scene dims and tints (Night Shade, Ominous Wind, Phantom Force) are local vignettes;
// the struck card is shadowed, not lit (the CSS heat sheen multiplies violet-black), which is
// Night Shade's and Shadow Ball's darkened foe. The curses (Astonish, Phantom Force, Night
// Shade, Hex) open the glyph's slit eyes on the defender and sound the ghost voice.

/** Violet motes drifting up off the defender (no gravity: a ghost's motes float). */
const motes = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 10,
    distance: 1,
    direction: -90,
    spread: 220,
    size: [0.04, 0.08],
    aspect: 1,
    gravity: 0,
    maxDelay: 0.15,
    durationMs: 800,
    kind: 'mote',
    ...over,
  });

const spec = (over) => Object.freeze({ vgType: 'ghost', material: 'ghost', pad: 1.7, grain: 0.2, ...over });

// ---- physical ------------------------------------------------------------------------

export const lick = spec({
  id: 'lick',
  name: 'Lick',
  statClass: 'physical',
  tier: 1,
  family: 'slash',
  durationMs: 950,
  contactMs: 450,
  // A shadowed lean in and one fat wisp licked up the card's face, a few streaks drifting off.
  attacker: { motion: 'lunge', params: { wind: 0.15, reach: 0.5 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.5 } },
  beats: [
    { at: 0, until: 450, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.35, hz: 3 } },
    { at: 300, until: 940, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
    // The lick leads the flash so it reads before the hit: its tip is two thirds up at contact.
    { at: 260, until: 580, layer: 'front', drawer: 'slashArc', params: { sweep: -140, radius: 0.38, angle: 0, thick: 0.3 } },
    { at: 450, until: 620, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.75 } },
    { at: 560, until: 940, layer: 'front', drawer: 'smoke', params: { count: 3, rise: 0.6 } },
  ],
  particles: [motes({ at: 470, count: 8, distance: 0.8, spread: 120 })],
});

export const astonish = spec({
  id: 'astonish',
  name: 'Astonish',
  statClass: 'physical',
  tier: 1,
  family: 'ghost',
  durationMs: 950,
  contactMs: 450,
  // It ducks into its own shadow and pops back out at the foe ("boo"): a shock ring off the
  // attacker, and a pair of slit eyes snaps open on the startled defender.
  attacker: { motion: 'lunge', params: { wind: 0.3, reach: 0.45 } },
  defender: { motion: 'knock', params: { strength: 0.22, heat: 0.5 } },
  beats: [
    { at: 0, until: 400, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 5, radius: 0.4, drift: 0.1, direction: 90, alpha: 0.65 } },
    { at: 320, until: 640, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 1, r0: 0.4, r1: 1.2, width: 0.05 } },
    { at: 300, until: 900, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.32 } },
    { at: 380, until: 860, layer: 'front', drawer: 'glyph', params: { r: 0.75 } },
    { at: 450, until: 600, layer: 'top', drawer: 'impactFlash', params: { r0: 0.4, r1: 0.9 } },
  ],
  particles: [motes({ at: 460, count: 8, distance: 0.9, spread: 140 })],
});

export const shadowPunch = spec({
  id: 'shadow-punch',
  name: 'Shadow Punch',
  statClass: 'physical',
  tier: 2,
  family: 'punch',
  durationMs: 1300,
  contactMs: 620,
  // The attacker darkens to a silhouette and jabs; a shadow fist shoots down the lane, rings
  // ripple where it lands, splinters fly, and a haze of shadow lingers on the defender.
  attacker: { motion: 'lunge', params: { wind: 0.2, reach: 0.4 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.8 } },
  beats: [
    { at: 0, until: 620, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.35, hz: 2.5 } },
    { at: 0, until: 520, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 4, radius: 0.35, drift: 0.15, alpha: 0.4 } },
    { at: 420, until: 620, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.18, r1: 0.3, tongues: 4 } },
    { at: 560, until: 1250, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
    { at: 620, until: 800, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
    { at: 620, until: 960, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.1, width: 0.05 } },
    { at: 620, until: 980, layer: 'front', drawer: 'shards', params: { count: 8, distance: 0.9, spin: 200 } },
    { at: 720, until: 1280, layer: 'front', drawer: 'cloud', params: { count: 5, radius: 0.3, drift: 0.3, alpha: 0.4 } },
  ],
  particles: [motes({ at: 640 })],
});

export const shadowClaw = spec({
  id: 'shadow-claw',
  name: 'Shadow Claw',
  statClass: 'physical',
  tier: 3,
  family: 'slash',
  durationMs: 1700,
  contactMs: 900,
  // Shadow gathers on the claw; the attacker rushes in and rakes three shadow claws down the
  // card over a pool of shadow; splinters and violet motes scatter and black smoke rises.
  attacker: { motion: 'dash', params: { wind: 0.25, reach: 0.85, overshoot: 0.2, arc: 0.35 } },
  defender: { motion: 'knock', params: { strength: 0.42, heat: 0.8 } },
  beats: [
    { at: 0, until: 820, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.35, hz: 3 } },
    { at: 600, until: 1600, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    { at: 700, until: 1500, layer: 'back', drawer: 'cloud', params: { count: 6, radius: 0.45, drift: 0.05, direction: 90, alpha: 0.6 } },
    // The rakes lead the flash so the three claws read before the hit whitens the card.
    { at: 760, until: 1080, layer: 'front', drawer: 'slashArc', params: { sweep: 120, radius: 0.62, angle: -45, thick: 0.24 } },
    { at: 780, until: 1100, layer: 'front', drawer: 'slashArc', params: { sweep: 120, radius: 0.48, angle: -45, thick: 0.22 } },
    { at: 800, until: 1120, layer: 'front', drawer: 'slashArc', params: { sweep: 120, radius: 0.34, angle: -45, thick: 0.2 } },
    { at: 900, until: 1080, layer: 'top', drawer: 'impactFlash', params: { r0: 0.4, r1: 0.95 } },
    { at: 900, until: 1250, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.4, r1: 1.4 } },
    { at: 920, until: 1320, layer: 'front', drawer: 'shards', params: { count: 9, distance: 1.1, spin: 220 } },
    { at: 1100, until: 1650, layer: 'front', drawer: 'smoke', params: { count: 6, rise: 0.9 } },
  ],
  particles: [motes({ at: 920, count: 12, distance: 1.2, spread: 360 })],
});

export const phantomForce = spec({
  id: 'phantom-force',
  name: 'Phantom Force',
  statClass: 'physical',
  tier: 3,
  family: 'ghost',
  durationMs: 2000,
  contactMs: 1080,
  // It sinks into a pool of its own shadow while slit eyes open on the defender, then strikes
  // out of nowhere: wisps erupt up the defender, a floor ring spreads, splinters fly.
  attacker: { motion: 'dash', params: { wind: 0.4, reach: 0.9, overshoot: 0.3, arc: 0.5 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 1 } },
  beats: [
    { at: 0, until: 760, layer: 'back', drawer: 'cloud', params: { target: 'attacker', count: 6, radius: 0.5, drift: 0.05, direction: 90, alpha: 0.7 } },
    { at: 80, until: 640, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 6, radius: 0.5, drift: 0.2, direction: 90, alpha: 0.8 } },
    { at: 0, until: 800, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.4 } },
    { at: 600, until: 1250, layer: 'front', drawer: 'glyph', params: { r: 0.85 } },
    { at: 950, until: 1900, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.5 } },
    { at: 1080, until: 1260, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
    { at: 1080, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.4, r1: 1.6 } },
    { at: 1100, until: 1750, layer: 'front', drawer: 'pillar', params: { height: 1.6, w: 0.6 } },
    { at: 1100, until: 1500, layer: 'front', drawer: 'shards', params: { count: 8, distance: 1.1, spin: 240 } },
    { at: 1400, until: 2000, layer: 'front', drawer: 'smoke', params: { count: 6, rise: 0.9 } },
  ],
  particles: [
    motes({ at: 120, anchor: 'attacker', count: 6, distance: 0.6, durationMs: 700 }),
    motes({ at: 1100, count: 14, distance: 1.3, spread: 360 }),
  ],
});

// ---- special -------------------------------------------------------------------------

export const nightShade = spec({
  id: 'night-shade',
  name: 'Night Shade',
  statClass: 'special',
  tier: 1,
  family: 'ghost',
  durationMs: 1100,
  contactMs: 560,
  // Wisps swirl up round the attacker out of a rippling pool and it glows pale; night falls on
  // the defender: slit eyes open in the dark, rings pulse, and the card itself is shadowed.
  attacker: { motion: 'brace', params: { rear: 0.08, scale: 1.06, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 1 } },
  beats: [
    { at: 0, until: 560, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 2, r0: 0.3, r1: 1.2 } },
    { at: 0, until: 600, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 1.5, r0: 0.3, r1: 0.75, rpm: 140, tongues: 8 } },
    { at: 0, until: 620, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.35 } },
    { at: 420, until: 1080, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.5 } },
    { at: 460, until: 1000, layer: 'front', drawer: 'glyph', params: { r: 0.75 } },
    { at: 560, until: 900, layer: 'front', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.1, width: 0.05 } },
    { at: 560, until: 720, layer: 'top', drawer: 'impactFlash', params: { r0: 0.4, r1: 0.9 } },
  ],
  particles: [motes({ at: 580, count: 8 })],
});

export const hex = spec({
  id: 'hex',
  name: 'Hex',
  statClass: 'special',
  tier: 2,
  family: 'ghost',
  durationMs: 1350,
  contactMs: 700,
  // Two wisps lash round the shadowed attacker; a shadow cloud gathers behind the defender,
  // slit eyes open over it and the curse lands in pulsing rings, leaving smoke.
  attacker: { motion: 'rear-lurch', params: { rear: 0.1, lurch: 0.25, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.25, heat: 1 } },
  beats: [
    { at: 0, until: 650, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.35, hz: 3 } },
    { at: 120, until: 560, layer: 'front', drawer: 'slashArc', params: { target: 'attacker', count: 2, gapDeg: 180, sweep: 110, radius: 0.65, angle: 0, thick: 0.12 } },
    { at: 200, until: 1250, layer: 'back', drawer: 'cloud', params: { count: 7, radius: 0.45, drift: 0.15, alpha: 0.6 } },
    { at: 380, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.5 } },
    { at: 520, until: 1150, layer: 'front', drawer: 'glyph', params: { r: 0.9 } },
    { at: 700, until: 1050, layer: 'front', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.3, r1: 1.2, width: 0.05 } },
    { at: 700, until: 860, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
    { at: 760, until: 1320, layer: 'front', drawer: 'smoke', params: { count: 5, rise: 0.7 } },
  ],
  particles: [motes({ at: 720 })],
});

export const ominousWind = spec({
  id: 'ominous-wind',
  name: 'Ominous Wind',
  statClass: 'special',
  tier: 2,
  family: 'wind',
  durationMs: 1400,
  contactMs: 760,
  // Wisps whirl up round the attacker, the wind streams down the lane in broken bands, and a
  // second whirl wraps the defender inside a local violet dusk.
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.28, heat: 0.8 } },
  beats: [
    { at: 0, until: 700, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 1.5, r0: 0.3, r1: 0.8, rpm: 160, tongues: 8 } },
    { at: 0, until: 700, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.3 } },
    // The bands' head reaches the defender at contact: 520 + 0.3 x 800.
    { at: 520, until: 1320, layer: 'front', drawer: 'beam', params: { kind: 'segmented', w: 0.5, growIn: 0.3, retract: 0.3 } },
    { at: 600, until: 1350, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    { at: 700, until: 1300, layer: 'front', drawer: 'spiral', params: { turns: 2, r0: 0.25, r1: 0.95, rpm: 180, tongues: 8 } },
    { at: 760, until: 920, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
  ],
  particles: [motes({ at: 780, count: 12, spread: 360 })],
});

export const shadowBall = spec({
  id: 'shadow-ball',
  name: 'Shadow Ball',
  statClass: 'special',
  tier: 3,
  family: 'burst',
  durationMs: 1950,
  contactMs: 1050,
  // Shadow motes orbit in and a shadow ball swells at the mouth; it is hurled with two rings,
  // bursts on the defender in violet rings and splinters, and the shadow drifts off as smoke.
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 1 } },
  beats: [
    { at: 0, until: 680, layer: 'back', drawer: 'orbitCharge', params: { count: 5, half: 'back', r0: 0.08, r1: 0.14, tongues: 2 } },
    { at: 0, until: 680, layer: 'front', drawer: 'orbitCharge', params: { count: 5, half: 'front', r0: 0.08, r1: 0.14, tongues: 2 } },
    { at: 0, until: 700, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.35 } },
    { at: 100, until: 700, layer: 'front', drawer: 'coreCharge', params: { r0: 0.12, r1: 0.36, from: 0.2 } },
    { at: 620, until: 1000, layer: 'back', drawer: 'shockRings', params: { count: 2 } },
    { at: 660, until: 1050, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.12, r0: 0.34, r1: 0.4, tongues: 4 } },
    { at: 860, until: 1850, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.5 } },
    { at: 1050, until: 1230, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
    { at: 1050, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.4, r1: 1.5, width: 0.06 } },
    { at: 1050, until: 1500, layer: 'front', drawer: 'shards', params: { count: 10, distance: 1.2, spin: 240 } },
    { at: 1350, until: 1950, layer: 'front', drawer: 'smoke', params: { count: 6, rise: 0.9 } },
  ],
  particles: [
    motes({ at: 1060, count: 14, distance: 1.4, spread: 360 }),
    motes({ at: 1150, count: 8, distance: 0.7, direction: 90, spread: 160 }),
  ],
});

export const GHOST_SPECS = Object.freeze(
  Object.fromEntries(
    [lick, astonish, shadowPunch, shadowClaw, phantomForce, nightShade, hex, ominousWind, shadowBall].map((s) => [s.id, s])
  )
);
