// Design 063: Electric specs, one per move of the Electric row of the move table, from the
// design's Appendix A Electric entries (B2W2 sprites + Scarlet/Violet videos; Nuzzle and
// Electro Shot are video-only, Shock Wave has no reference). Times are the entries' except
// where the validator's tier bands or contact band forced a re-time (Thunder Fang, Shock
// Wave); each is a line under the design's § Deviations. Sparks are the electric material:
// `shards` throw jag sparks, `bolt` strikes in the material's lightning passes. Every hit is
// local to the defender: Thunder's yellow sky became a storm-slate vignette round the
// defender, and Zap Cannon's full-screen sunburst became jag sparks.
//
// Design 075 user pass (slice 11): no orbiting sparks, auras or floor rings; each move winds up
// with the attacker's own motion and its spark forming (`coreCharge`), the bolt or spark is what
// lands, and the contact dressing is small (a little flash, a few jag sparks, a faint heat) — the
// TCG Live impact replaces it in a game. Shock Wave keeps its rings: the move is the shockwave.

/** A CSS spark burst with the electric defaults (thin white-yellow streaks, no gravity). */
const burst = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 10,
    distance: 1,
    direction: -90,
    spread: 360,
    size: [0.04, 0.09],
    aspect: 0.2,
    gravity: 0,
    maxDelay: 0.12,
    durationMs: 600,
    kind: 'streak',
    ...over,
  });

const spec = (over) => Object.freeze({ vgType: 'electric', material: 'electric', family: 'electric', pad: 1.7, grain: 0, ...over });

/** The contact flash every electric move keeps: small, so the spark or bolt reads through it. */
const flash = (at) => ({ at, until: at + 140, layer: 'top', drawer: 'impactFlash', params: { r0: 0.2, r1: 0.5 } });

// ---- physical ------------------------------------------------------------------------

export const nuzzle = spec({
  id: 'nuzzle',
  name: 'Nuzzle',
  statClass: 'physical',
  tier: 1,
  durationMs: 950,
  contactMs: 400,
  // A hop, a quick dart in and straight back: an affectionate rub, not a strike. The cheek
  // spark builds as it hops and crackles off the defender at the rub.
  attacker: { motion: 'dash', params: { wind: 0.12, reach: 0.7, overshoot: 0, arc: 0.2 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.3 } },
  beats: [
    { at: 0, until: 380, layer: 'front', drawer: 'coreCharge', params: { lead: 0.2, r0: 0.05, r1: 0.12, from: 0.3 } },
    { at: 400, until: 760, layer: 'front', drawer: 'shards', params: { count: 4, arc: 120, direction: -90, distance: 0.45, spin: 120 } },
    flash(400),
  ],
  particles: [burst({ at: 420, count: 5, distance: 0.7, spread: 120, maxDelay: 0.25, durationMs: 600 })],
});

export const thunderFang = spec({
  id: 'thunder-fang',
  name: 'Thunder Fang',
  statClass: 'physical',
  tier: 2,
  durationMs: 1200,
  contactMs: 600,
  attacker: { motion: 'dash', params: { wind: 0.2, reach: 0.85, overshoot: 0.1, arc: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.3 } },
  beats: [
    // The charge builds at the mouth, then the fang spark rides the dash in and the jaws close.
    { at: 0, until: 450, layer: 'front', drawer: 'coreCharge', params: { r0: 0.08, r1: 0.22, from: 0.25 } },
    { at: 450, until: 600, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.16, r1: 0.2, tongues: 3 } },
    // Two crackling arcs, upper and lower jaw, snapping shut on the defender.
    { at: 560, until: 820, layer: 'front', drawer: 'slashArc', params: { count: 2, sweep: 100, radius: 0.45, gapDeg: 180, angle: 0, thick: 0.12 } },
    { at: 600, until: 900, layer: 'front', drawer: 'shards', params: { count: 5, arc: 360, distance: 0.6, spin: 240 } },
    flash(600),
  ],
  particles: [burst({ at: 600, count: 8, distance: 0.9 })],
});

export const wildCharge = spec({
  id: 'wild-charge',
  name: 'Wild Charge',
  statClass: 'physical',
  tier: 3,
  durationMs: 1600,
  contactMs: 750,
  attacker: { motion: 'dash', params: { wind: 0.3, reach: 1.0, overshoot: 0.1, arc: 0.4 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.35 } },
  beats: [
    // The body cloaks itself in a crackling sheath while it crouches and charges.
    { at: 0, until: 700, layer: 'back', drawer: 'coreCharge', params: { lead: 0, r0: 0.2, r1: 0.42, from: 0.15 } },
    // The lightning trail the charge leaves behind it, still lit at contact.
    { at: 600, until: 820, layer: 'front', drawer: 'bolt', params: { segments: 8, jag: 0.1, branches: 1, width: 0.08 } },
    { at: 750, until: 1050, layer: 'front', drawer: 'shards', params: { count: 7, arc: 360, distance: 0.9, spin: 240 } },
    flash(750),
  ],
  particles: [burst({ at: 750, count: 10, distance: 1.1 })],
});

// ---- special -------------------------------------------------------------------------

export const thunderShock = spec({
  id: 'thunder-shock',
  name: 'Thunder Shock',
  statClass: 'special',
  tier: 1,
  durationMs: 1000,
  contactMs: 450,
  attacker: { motion: 'brace', params: { rear: 0.06, scale: 1.03, glow: 0.7 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.3 } },
  beats: [
    // The spark flies trailing its jags and lands as a crackle of jag sparks.
    { at: 150, until: 450, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.1, r1: 0.14, tongues: 3 } },
    { at: 450, until: 720, layer: 'front', drawer: 'shards', params: { count: 4, arc: 120, direction: -90, distance: 0.35, spin: 120 } },
    flash(450),
  ],
  particles: [burst({ at: 450, count: 5, distance: 0.6, spread: 160, durationMs: 500 })],
});

export const shockWave = spec({
  id: 'shock-wave',
  name: 'Shock Wave',
  statClass: 'special',
  tier: 2,
  durationMs: 1200,
  contactMs: 500,
  attacker: { motion: 'rear-lurch', params: { rear: 0.08, lurch: 0.25, glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.3 } },
  beats: [
    // No projectile: the move is the shockwave. Rings roll off the attacker and wash over the
    // defender (it never misses).
    { at: 150, until: 650, layer: 'back', drawer: 'aura', params: { target: 'attacker', hz: 3, alpha: 0.8, r0: 0.8, r1: 1.1, tint: { deep: '#6A9A1E', body: '#C8F04A', hot: '#F5FF9A', core: '#FCFFE0' } } },
    { at: 500, until: 820, layer: 'front', drawer: 'shards', params: { count: 5, arc: 360, distance: 0.6, spin: 200 } },
    flash(500),
  ],
  particles: [burst({ at: 500, count: 8, distance: 0.9 })],
});

export const electroShot = spec({
  id: 'electro-shot',
  name: 'Electro Shot',
  statClass: 'special',
  tier: 3,
  durationMs: 2100,
  contactMs: 1200,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 0.35 } },
  tint: { deep: '#1F3FB8', body: '#5FA8FF', hot: '#D8ECFF', core: '#F2F8FF' },
  beats: [
    // The shot charges at the muzzle through the whole wind-up, then fires.
    { at: 0, until: 1150, layer: 'front', drawer: 'coreCharge', params: { r0: 0.08, r1: 0.34, from: 0.15, tint: { deep: '#1F3FB8', body: '#5FA8FF', hot: '#D8ECFF', core: '#F2F8FF' } } },
    // The segmented beam reaches the defender at 960 + 0.4 x 600 = contact.
    { at: 960, until: 1560, layer: 'front', drawer: 'beam', params: { kind: 'segmented', w: 0.32, growIn: 0.4, retract: 0.25, tint: { deep: '#1F3FB8', body: '#5FA8FF', hot: '#D8ECFF', core: '#F2F8FF' } } },
    // The lightning inside the beam: on a short lane the dashes alone read as chevrons.
    { at: 1150, until: 1550, layer: 'front', drawer: 'bolt', params: { segments: 8, jag: 0.08, branches: 1, width: 0.08, tint: { deep: '#1F3FB8', body: '#5FA8FF', hot: '#D8ECFF', core: '#F2F8FF' } } },
    { at: 1200, until: 1550, layer: 'front', drawer: 'shards', params: { count: 7, arc: 360, distance: 1.0, spin: 240 } },
    flash(1200),
  ],
  particles: [burst({ at: 1200, count: 10, distance: 1.2 })],
});

export const thunder = spec({
  id: 'thunder',
  name: 'Thunder',
  statClass: 'special',
  tier: 3,
  durationMs: 2000,
  contactMs: 900,
  attacker: { motion: 'rear-lurch', params: { rear: 0.1, lurch: 0.15, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 0.35 } },
  beats: [
    // The storm gathers round the defender (the sprite's yellow sky, kept local and dark).
    { at: 0, until: 1500, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.38, outer: 1.6 } },
    // A forerunner flicker, then the strike from above: one bolt, so its zigzag reads (a second
    // strand on the same line stacked into a white column).
    { at: 640, until: 860, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 10, jag: 0.1, branches: 1, width: 0.05 } },
    { at: 880, until: 1350, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 8, jag: 0.12, branches: 2, width: 0.08 } },
    { at: 900, until: 1250, layer: 'front', drawer: 'shards', params: { count: 7, arc: 360, distance: 1.0, spin: 240 } },
    flash(900),
  ],
  particles: [burst({ at: 900, count: 10, distance: 1.2 })],
});

export const zapCannon = spec({
  id: 'zap-cannon',
  name: 'Zap Cannon',
  statClass: 'special',
  tier: 3,
  durationMs: 1800,
  contactMs: 800,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.35 } },
  beats: [
    // The cannon ball forms at the attacker, leaves slowly and closes fast.
    { at: 0, until: 560, layer: 'front', drawer: 'coreCharge', params: { r0: 0.12, r1: 0.3, from: 0.25 } },
    { at: 550, until: 800, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.3, r1: 0.36, tongues: 3 } },
    // It bursts in jag sparks off the defender.
    { at: 800, until: 1150, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, spin: 240 } },
    flash(800),
  ],
  particles: [burst({ at: 800, count: 10, distance: 1.2 })],
});

export const ELECTRIC_SPECS = Object.freeze(
  Object.fromEntries([nuzzle, thunderFang, wildCharge, thunderShock, shockWave, electroShot, thunder, zapCannon].map((s) => [s.id, s]))
);
