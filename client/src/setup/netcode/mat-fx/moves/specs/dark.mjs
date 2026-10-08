// Design 063: Dark specs, one per move of the Dark row of the move table. Dark had no
// Appendix A entries, so this slice ran the study pass first, reading every reference itself
// (sprite N2B2 + the newest 3D video per move, Poképédia; notes in
// .agent/scratch/moves/dark/g4b-dark.md). Throat Chop has no sprite-era animation and reads
// from its Scarlet/Violet video only.
//
// Every move draws in the one dark material, near-black shadow with crimson edges start to
// payoff: the sprite games' white jaws and star outlines, Night Slash's red dots, Snarl's
// yellow sound sphere and the modern magenta all become the material's shadow and crimson.
// The sprite games' whole-scene dims and black-outs (Pursuit, Feint Attack, Dark Pulse) are
// local vignettes; Throat Chop's white-pink star flash and Dark Pulse's dark rays are a local
// impact flash. The physicals carry their weight in the card (`dash` / `lunge`, a hard knock);
// the specials knock the defender. Night Slash cuts twice: the damage pops on the first cut at
// contact, the second lands `gapMs` later with its own flash.

/** A CSS crimson streak burst flung off the defender (no gravity: shadow does not fall). */
const burst = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 8,
    distance: 1,
    direction: -90,
    spread: 360,
    size: [0.05, 0.1],
    aspect: 0.3,
    gravity: 0,
    maxDelay: 0.1,
    durationMs: 600,
    kind: 'streak',
    ...over,
  });

const spec = (over) => Object.freeze({ vgType: 'dark', material: 'dark', pad: 1.7, grain: 0.15, ...over });

// ---- physical ------------------------------------------------------------------------

export const pursuit = spec({
  id: 'pursuit',
  name: 'Pursuit',
  statClass: 'physical',
  tier: 1,
  family: 'slash',
  durationMs: 1000,
  contactMs: 520,
  // It gives chase: a short dash out of a local dusk, one cut, the star outline flying apart
  // as splinters, then dark puffs.
  attacker: { motion: 'dash', params: { wind: 0.15, reach: 0.85, overshoot: 0.1, arc: 0.25 } },
  defender: { motion: 'knock', params: { strength: 0.22, heat: 0.5 } },
  beats: [
    { at: 0, until: 950, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35 } },
    { at: 500, until: 740, layer: 'front', drawer: 'slashArc', params: { sweep: 110, radius: 0.45, angle: 30, thick: 0.22 } },
    { at: 520, until: 680, layer: 'top', drawer: 'impactFlash', params: { r0: 0.4, r1: 0.9 } },
    { at: 520, until: 820, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.3, r1: 1.1, width: 0.05 } },
    { at: 540, until: 880, layer: 'front', drawer: 'shards', params: { count: 7, distance: 0.8, spin: 180 } },
    { at: 600, until: 1000, layer: 'front', drawer: 'smoke', params: { count: 5, rise: 0.6 } },
  ],
  particles: [burst({ at: 540 })],
});

export const feintAttack = spec({
  id: 'feint-attack',
  name: 'Feint Attack',
  statClass: 'physical',
  tier: 2,
  family: 'slash',
  durationMs: 1300,
  contactMs: 720,
  // The attacker sinks into a pall of shadow and is on the defender before it shows: the
  // blow comes from the far side of the card.
  attacker: { motion: 'dash', params: { wind: 0.25, reach: 0.85, overshoot: 0.15, arc: 0.4 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.6 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.4 } },
    { at: 120, until: 680, layer: 'front', drawer: 'smoke', params: { target: 'attacker', count: 6, rise: 0.5 } },
    { at: 560, until: 1250, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
    { at: 680, until: 960, layer: 'front', drawer: 'slashArc', params: { sweep: 130, radius: 0.45, angle: -120, thick: 0.22 } },
    { at: 720, until: 880, layer: 'top', drawer: 'impactFlash', params: { r0: 0.4, r1: 0.95 } },
    { at: 720, until: 1080, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.2, width: 0.05 } },
    { at: 740, until: 1100, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.9, spin: 120 } },
  ],
  particles: [burst({ at: 740, count: 10, distance: 0.9 })],
});

export const bite = spec({
  id: 'bite',
  name: 'Bite',
  statClass: 'physical',
  tier: 2,
  family: 'slash',
  durationMs: 1250,
  contactMs: 680,
  // Two shadow jaws, over and under the card, close on it; splinters fly where they meet.
  attacker: { motion: 'lunge', params: { wind: 0.2, reach: 0.5 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.6 } },
  beats: [
    { at: 420, until: 1200, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
    { at: 500, until: 790, layer: 'front', drawer: 'slashArc', params: { sweep: 150, radius: 0.58, angle: -90, thick: 0.2 } },
    { at: 500, until: 790, layer: 'front', drawer: 'slashArc', params: { sweep: -150, radius: 0.58, angle: 90, thick: 0.2 } },
    { at: 680, until: 840, layer: 'top', drawer: 'impactFlash', params: { r0: 0.4, r1: 1.0 } },
    { at: 690, until: 1000, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.7, spin: 90 } },
    { at: 700, until: 1100, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.4, r1: 1.1, width: 0.05 } },
  ],
  particles: [burst({ at: 700, distance: 0.8 })],
});

export const nightSlash = spec({
  id: 'night-slash',
  name: 'Night Slash',
  statClass: 'physical',
  tier: 3,
  family: 'slash',
  durationMs: 1800,
  contactMs: 1000,
  // Shadow blades whirl round the attacker; it dashes through and cuts twice, the long
  // near-level cut first, then a steep one.
  attacker: { motion: 'dash', params: { wind: 0.25, reach: 0.9, overshoot: 0.3, arc: 0.45 } },
  defender: { motion: 'stagger', params: { strength: 0.42, hits: 2, gapMs: 220, heat: 0.7 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.38 } },
    { at: 0, until: 650, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 1.5, r0: 0.3, r1: 0.8, rpm: 150, tongues: 8 } },
    { at: 600, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.42 } },
    { at: 940, until: 1200, layer: 'front', drawer: 'slashArc', params: { sweep: 150, radius: 0.45, angle: 20, thick: 0.24 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.1 } },
    { at: 1000, until: 1350, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.3, width: 0.05 } },
    { at: 1010, until: 1400, layer: 'front', drawer: 'shards', params: { count: 8, distance: 1.0, spin: 180 } },
    { at: 1160, until: 1420, layer: 'front', drawer: 'slashArc', params: { sweep: 150, radius: 0.42, angle: -60, thick: 0.22 } },
    { at: 1220, until: 1360, layer: 'top', drawer: 'impactFlash', params: { r0: 0.4, r1: 0.9 } },
    { at: 1240, until: 1750, layer: 'front', drawer: 'smoke', params: { count: 6, rise: 0.8 } },
  ],
  particles: [burst({ at: 1000, count: 10, distance: 1.1 }), burst({ at: 1220, count: 8 })],
});

export const throatChop = spec({
  id: 'throat-chop',
  name: 'Throat Chop',
  statClass: 'physical',
  tier: 3,
  family: 'slash',
  durationMs: 1700,
  contactMs: 900,
  // The hand blazes crimson-black and rides ahead of the dash; a hard downward chop, a
  // spray of splinters, the defender thrown back.
  attacker: { motion: 'dash', params: { wind: 0.3, reach: 0.9, overshoot: 0.25, arc: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.8 } },
  beats: [
    { at: 0, until: 900, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.55, hz: 3 } },
    { at: 150, until: 620, layer: 'front', drawer: 'coreCharge', params: { r0: 0.1, r1: 0.3, from: 0.2 } },
    // The hand rides the leading edge: the dash runs 0.3 c -> c with the same ease-in.
    { at: 300, until: 900, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.2, r1: 0.28, tongues: 4 } },
    { at: 860, until: 1100, layer: 'front', drawer: 'slashArc', params: { sweep: 140, radius: 0.4, angle: 0, thick: 0.28 } },
    { at: 900, until: 1080, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
    { at: 900, until: 1250, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.4, width: 0.06 } },
    { at: 920, until: 1350, layer: 'front', drawer: 'shards', params: { count: 9, distance: 1.1, spin: 240 } },
    { at: 950, until: 1650, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
    { at: 1100, until: 1700, layer: 'front', drawer: 'smoke', params: { count: 6, rise: 0.9 } },
  ],
  particles: [burst({ at: 920, count: 12, distance: 1.2 }), burst({ at: 1000, kind: 'shard', count: 8, aspect: 1, size: [0.04, 0.08] })],
});

// ---- special -------------------------------------------------------------------------

export const snarl = spec({
  id: 'snarl',
  name: 'Snarl',
  statClass: 'special',
  tier: 2,
  family: 'projectile',
  durationMs: 1350,
  contactMs: 650,
  // The bark: a pulse swells at the mouth, a shock ring hits the floor and splinters burst
  // round the attacker; three pulse rings rush down the lane and pop on the defender.
  attacker: { motion: 'rear-lurch', params: { rear: 0.1, lurch: 0.3, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.25, heat: 0.6 } },
  beats: [
    { at: 0, until: 650, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 4 } },
    { at: 0, until: 500, layer: 'front', drawer: 'coreCharge', params: { r0: 0.1, r1: 0.32, from: 0.2 } },
    { at: 300, until: 700, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 3, r0: 0.3, r1: 1.4 } },
    { at: 350, until: 650, layer: 'front', drawer: 'shards', params: { target: 'attacker', count: 8, distance: 0.9, spin: 120 } },
    // The last of the three rings lands at the beat's end, 10 ms after contact.
    { at: 360, until: 660, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 70, r0: 0.16, r1: 0.24, bow: 0.15, tongues: 0 } },
    { at: 650, until: 800, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.9 } },
    { at: 650, until: 1000, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.3, r1: 1.2, width: 0.05 } },
    { at: 660, until: 1000, layer: 'front', drawer: 'shards', params: { count: 6, distance: 0.8, spin: 200 } },
    { at: 650, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.38 } },
  ],
  particles: [burst({ at: 680 })],
});

export const darkPulse = spec({
  id: 'dark-pulse',
  name: 'Dark Pulse',
  statClass: 'special',
  tier: 3,
  family: 'burst',
  durationMs: 1900,
  contactMs: 1000,
  // Rings pulse over the floor as shadow blades swirl in round a gathering pulse; it flies
  // wreathed in splinters, engulfs the defender inside crimson rings and bursts; two crimson
  // crescents linger as the shadow lifts.
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.8 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.4 } },
    { at: 0, until: 620, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 3, r0: 0.3, r1: 1.3 } },
    { at: 0, until: 620, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 1.5, r0: 0.25, r1: 0.7, rpm: 160, tongues: 8 } },
    { at: 100, until: 620, layer: 'front', drawer: 'coreCharge', params: { r0: 0.16, r1: 0.5, from: 0.25 } },
    { at: 560, until: 940, layer: 'back', drawer: 'shockRings', params: { count: 2, r0: 0.3, r1: 1.2 } },
    { at: 620, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.12, r0: 0.4, r1: 0.5, tongues: 6 } },
    { at: 820, until: 1800, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45 } },
    { at: 1000, until: 1450, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.4, r1: 1.5, width: 0.06 } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'shards', params: { count: 10, distance: 1.1, spin: 240 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
    { at: 1100, until: 1600, layer: 'front', drawer: 'slashArc', params: { count: 2, gapDeg: 180, sweep: 90, radius: 0.9, angle: 0, thick: 0.14 } },
    { at: 1350, until: 1900, layer: 'front', drawer: 'smoke', params: { count: 6, rise: 0.9 } },
  ],
  particles: [burst({ at: 1000, count: 14, distance: 1.3 }), burst({ at: 1100, kind: 'shard', count: 8, aspect: 1, size: [0.04, 0.08] })],
});

export const DARK_SPECS = Object.freeze(
  Object.fromEntries([pursuit, feintAttack, bite, nightSlash, throatChop, snarl, darkPulse].map((s) => [s.id, s]))
);
