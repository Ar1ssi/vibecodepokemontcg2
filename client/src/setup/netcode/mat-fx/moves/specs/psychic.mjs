// Design 063: Psychic specs, one per move of the Psychic row of the move table. Psychic had
// no Appendix A entries, so this slice ran the study pass first: Zen Headbutt, Psycho Cut,
// Confusion and Psybeam from the study notes (refs/063-study/notes/g8-psychic-fairy.md);
// Psychic and Future Sight read from their Poképédia references this slice (Psyko_N2B2.gif
// + Psyko_EV.mp4, Prescience_N2B2.gif + Prescience_EV.mp4).
//
// Every move draws in the one psychic material, so each keeps its violet palette start to
// payoff: the sprite games' colour-cycling rings (Psybeam) and the modern green foresight
// rings (Future Sight) stay violet. The sprite games' full-screen effects (Zen Headbutt's and
// Confusion's near-black dims, Psychic's full-screen wave pattern, the modern pink tints,
// domes and Future Sight's white star bloom) became a local violet vignette and the `glyph`
// beat, the psychic wave: wavy rings rippling round a lens on the card. The telekinetic
// specials (Confusion, Psychic) lift the defender with `float` instead of knocking it; the
// energy hits (Psybeam, Future Sight) and the two physicals knock it.
//
// Timing moved from the notes into the bands: Psycho Cut's contact 780 of 1250 is 0.62+, so
// it lands at 760; Psybeam's contact 450 of 1350 is under 0.38, so the charge stretches to
// 360 ms and the beam's head lands at 520 of 1300; Zen Headbutt's 850 of 1400 moves to 820
// so the dash settles inside the scene.

/** A CSS mote burst with the psychic defaults (soft round motes drifting off, no gravity). */
const burst = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 10,
    distance: 0.9,
    direction: -90,
    spread: 360,
    size: [0.03, 0.06],
    aspect: 1,
    gravity: 0,
    maxDelay: 0.25,
    durationMs: 650,
    kind: 'mote',
    ...over,
  });

const spec = (over) => Object.freeze({ vgType: 'psychic', material: 'psychic', pad: 1.7, grain: 0, ...over });

// ---- physical ------------------------------------------------------------------------

export const zenHeadbutt = spec({
  id: 'zen-headbutt',
  name: 'Zen Headbutt',
  statClass: 'physical',
  tier: 2,
  family: 'dash',
  durationMs: 1400,
  contactMs: 820,
  // A halo and a small orb gather on the attacker; it charges head-first behind the orb.
  attacker: { motion: 'dash', params: { wind: 0.2, reach: 0.85, overshoot: 0.1, arc: 0.25 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.32 } },
    { at: 0, until: 560, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.45, hz: 2.5 } },
    { at: 100, until: 600, layer: 'front', drawer: 'glyph', params: { target: 'attacker', r: 0.6 } },
    { at: 150, until: 520, layer: 'front', drawer: 'coreCharge', params: { r0: 0.08, r1: 0.22, from: 0.1 } },
    // The orb rides the leading edge: the dash runs 0.3 c -> c with the same ease-in.
    { at: 250, until: 820, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.2, r1: 0.26, tongues: 3 } },
    { at: 820, until: 1150, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.2, width: 0.05 } },
    { at: 820, until: 1120, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 0.9, spin: 90 } },
    { at: 820, until: 980, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
    { at: 850, until: 1350, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3 } },
  ],
  particles: [burst({ at: 880 })],
});

export const psychoCut = spec({
  id: 'psycho-cut',
  name: 'Psycho Cut',
  statClass: 'physical',
  tier: 2,
  family: 'slash',
  durationMs: 1250,
  contactMs: 760,
  // Plum mist and a ring disc at the chest; one lilac blade flies in and slices through.
  attacker: { motion: 'lunge', params: { wind: 0.15, reach: 0.35 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.5 } },
  beats: [
    { at: 0, until: 520, layer: 'back', drawer: 'cloud', params: { target: 'attacker', count: 6, radius: 0.3, drift: 0.15, alpha: 0.4 } },
    { at: 60, until: 560, layer: 'front', drawer: 'glyph', params: { target: 'attacker', r: 0.55 } },
    { at: 300, until: 540, layer: 'front', drawer: 'coreCharge', params: { lead: 0.3, r0: 0.1, r1: 0.28, from: 0.2 } },
    { at: 500, until: 760, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.25, r0: 0.22, r1: 0.3, tongues: 4, ease: 'linear' } },
    // The blade sweeps through bottom-left to top-right as the crescent arrives.
    { at: 720, until: 980, layer: 'front', drawer: 'slashArc', params: { sweep: 140, radius: 0.65, angle: 60, thick: 0.16 } },
    { at: 760, until: 920, layer: 'top', drawer: 'impactFlash', params: { r0: 0.4, r1: 0.9 } },
    { at: 780, until: 1200, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.4, r1: 1.2, width: 0.05 } },
  ],
  particles: [burst({ at: 800, count: 8, distance: 0.8, durationMs: 600 })],
});

// ---- special -------------------------------------------------------------------------

export const confusion = spec({
  id: 'confusion',
  name: 'Confusion',
  statClass: 'special',
  tier: 1,
  family: 'chime',
  durationMs: 1000,
  contactMs: 600,
  // The attacker glows; nothing crosses the lane: the wave closes on the defender and lifts it.
  attacker: { motion: 'brace', params: { rear: 0.06, scale: 1.04, glow: 0.8 } },
  defender: { motion: 'float', params: { lift: 0.15, heat: 0.25 } },
  beats: [
    { at: 0, until: 360, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 3 } },
    { at: 300, until: 950, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.38 } },
    { at: 320, until: 900, layer: 'back', drawer: 'aura', params: { target: 'defender', alpha: 0.45, hz: 2 } },
    { at: 350, until: 920, layer: 'front', drawer: 'glyph', params: { r: 0.75 } },
    { at: 600, until: 950, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.5, r1: 1.3, width: 0.05 } },
    { at: 600, until: 760, layer: 'top', drawer: 'impactFlash', params: { r0: 0.3, r1: 0.9 } },
  ],
  particles: [burst({ at: 620, count: 8, distance: 0.7, maxDelay: 0.3, durationMs: 600 })],
});

export const psybeam = spec({
  id: 'psybeam',
  name: 'Psybeam',
  statClass: 'special',
  tier: 2,
  family: 'beam',
  durationMs: 1300,
  contactMs: 520,
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.25, heat: 0.6 } },
  beats: [
    { at: 0, until: 400, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.45, hz: 3 } },
    { at: 0, until: 360, layer: 'front', drawer: 'glyph', params: { target: 'attacker', r: 0.6 } },
    { at: 0, until: 380, layer: 'front', drawer: 'coreCharge', params: { r0: 0.08, r1: 0.24, from: 0.2 } },
    { at: 300, until: 600, layer: 'back', drawer: 'shockRings', params: { count: 2, r0: 0.3, r1: 1.0 } },
    // Ribbon dashes down the lane; the head lands at 360 + 0.25 x 640 = 520. Not a
    // pulse-train of lenses: on a 1.2 h lane six additive lenses stack into a white column.
    { at: 360, until: 1000, layer: 'front', drawer: 'beam', params: { kind: 'segmented', w: 0.4, growIn: 0.25, retract: 0.3 } },
    { at: 520, until: 1250, layer: 'back', drawer: 'aura', params: { target: 'defender', alpha: 0.45, hz: 2 } },
    { at: 520, until: 680, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0 } },
    // The tail runs into the defender and the last rings burst off it.
    { at: 1000, until: 1300, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.1, width: 0.05 } },
  ],
  particles: [burst({ at: 1000, durationMs: 600 })],
});

export const psychic = spec({
  id: 'psychic',
  name: 'Psychic',
  statClass: 'special',
  tier: 3,
  family: 'chime',
  durationMs: 1900,
  contactMs: 1000,
  // Ribbons swirl round the attacker; the wave takes hold of the defender, lifts it and
  // wrings it, then lets go in a ring of motes.
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 1 } },
  defender: { motion: 'float', params: { lift: 0.18, heat: 0.5 } },
  beats: [
    { at: 0, until: 900, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.5, hz: 2.5 } },
    { at: 100, until: 900, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 2, r0: 0.3, r1: 0.85, rpm: 120, tongues: 8 } },
    { at: 560, until: 900, layer: 'back', drawer: 'shockRings', params: { count: 2, r0: 0.3, r1: 1.1 } },
    // The sprite's dim and full-screen wave, kept local to the defender.
    { at: 600, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.42 } },
    { at: 650, until: 1600, layer: 'front', drawer: 'glyph', params: { r: 1.1 } },
    { at: 750, until: 1300, layer: 'front', drawer: 'spiral', params: { turns: 1.5, r0: 0.35, r1: 1.0, rpm: 90, tongues: 10 } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.4, r1: 1.5, width: 0.05 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { r1: 1.2 } },
    { at: 1300, until: 1850, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.5, r1: 1.3, width: 0.04 } },
  ],
  particles: [
    burst({ at: 1000, count: 14, distance: 1.2, durationMs: 700 }),
    burst({ at: 1150, kind: 'star', count: 8, size: [0.04, 0.08], distance: 1.0, maxDelay: 0.3, durationMs: 700 }),
  ],
});

export const futureSight = spec({
  id: 'future-sight',
  name: 'Future Sight',
  statClass: 'special',
  tier: 3,
  family: 'chime',
  durationMs: 2000,
  contactMs: 1100,
  // The attacker foresees (a wave round it); nothing travels: the blow arrives from the
  // future as a vortex closing on the defender and bursts there.
  attacker: { motion: 'brace', params: { rear: 0.08, scale: 1.06, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.6 } },
  beats: [
    { at: 0, until: 850, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.35 } },
    { at: 0, until: 800, layer: 'back', drawer: 'aura', params: { target: 'attacker', alpha: 0.55, hz: 2 } },
    { at: 0, until: 850, layer: 'front', drawer: 'glyph', params: { target: 'attacker', r: 0.85 } },
    { at: 600, until: 1750, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } },
    { at: 650, until: 1150, layer: 'front', drawer: 'glyph', params: { r: 0.9 } },
    { at: 750, until: 1200, layer: 'front', drawer: 'spiral', params: { turns: 2, r0: 0.2, r1: 1.0, rpm: 180, tongues: 10 } },
    { at: 1100, until: 1500, layer: 'front', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.4, r1: 1.6, width: 0.06 } },
    { at: 1100, until: 1280, layer: 'top', drawer: 'impactFlash', params: { r1: 1.3 } },
    { at: 1150, until: 1800, layer: 'back', drawer: 'aura', params: { target: 'defender', alpha: 0.4, hz: 1.5 } },
  ],
  particles: [
    burst({ at: 1100, kind: 'star', count: 12, size: [0.04, 0.08], distance: 1.2, durationMs: 700 }),
    burst({ at: 1250, count: 10, maxDelay: 0.3 }),
  ],
});

export const PSYCHIC_SPECS = Object.freeze(
  Object.fromEntries([zenHeadbutt, psychoCut, confusion, psybeam, psychic, futureSight].map((s) => [s.id, s]))
);
