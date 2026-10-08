// Design 065 slice 14: the Dark signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Dark);
// departures from an entry are listed under the design's Deviations (slice 14).

const motes = (at, count, over = {}) =>
  Object.freeze({
    at,
    anchor: 'defender',
    count,
    distance: 1.1,
    direction: -90,
    spread: 360,
    size: [0.03, 0.07],
    aspect: 1,
    gravity: 0,
    maxDelay: 0.2,
    durationMs: 800,
    kind: 'mote',
    ...over,
  });

const RING5 = Object.freeze([-90, -18, 54, 126, 198].map((angle) => Object.freeze({ angle, reach: 0.85 })));

const VOID = Object.freeze({ deep: '#1A1028', body: '#5B2BD6', hot: '#FF3DA0', core: '#B43CFF' });
const VOID_VIOLET = Object.freeze({ deep: '#1A1028', body: '#B43CFF', hot: '#FF3DA0', core: '#FFFFFF' });
const SLEEP = Object.freeze({ deep: '#5B2BD6', body: '#6FD7FF', hot: '#E0F8FF', core: '#FFFFFF' });

// Darkrai: a violet-black void sphere with magenta cracks drops onto the defender's ground and
// opens into a dark dome; the defender sinks asleep under drifting Z motes. A status move.
export const darkVoid = Object.freeze({
  id: 'dark-void',
  name: 'Dark Void',
  vgType: 'dark',
  statClass: 'status',
  tier: 'S',
  family: 'ghost',
  material: 'dark',
  durationMs: 2000,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'brace', params: { glow: 0.8 } },
  defender: { motion: 'sink', params: { heat: 0 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: VOID_VIOLET } },
    { at: 0, until: 650, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.4, rings: 1, tint: VOID } },
    { at: 400, until: 1000, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.4, tint: VOID_VIOLET } },
    { at: 600, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.4, r0: 0.34, r1: 0.42, tongues: 3, ease: 'in', tint: VOID } },
    { at: 950, until: 1800, layer: 'front', drawer: 'shade', params: { kind: 'dome', r: 1.05, fill: 'deep', fillAlpha: 0.85, rimAlpha: 0.9, swirl: 40, tint: VOID } },
    { at: 1000, until: 1150, layer: 'top', drawer: 'impactFlash', params: { r1: 1.0, tint: VOID_VIOLET } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'cloud', params: { count: 8, drift: 0.3, alpha: 0.5, tint: VOID } },
    { at: 1100, until: 1600, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45, tint: VOID } },
    { at: 1400, until: 2000, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.4, tint: SLEEP } },
  ],
  particles: [
    motes(1200, 6, { kind: 'zzz', direction: -90, spread: 40, size: [0.12, 0.2], distance: 1.0, maxDelay: 0.4, durationMs: 700 }),
  ],
  grain: 0.12,
});

const WRATH = Object.freeze({ deep: '#9B1B7A', body: '#E0175A', hot: '#FF4D8B', core: '#FFFFFF' });
const WRATH_DARK = Object.freeze({ deep: '#2A0F24', body: '#6A2CC0', hot: '#E0175A', core: '#FF4D8B' });

// Galarian Moltres: a crimson-pink flame bird dives in a loop through a red-magenta fireball
// round it, then strikes the defender's ground circle.
export const fieryWrath = Object.freeze({
  id: 'fiery-wrath',
  name: 'Fiery Wrath',
  vgType: 'dark',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'dark',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.9,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.7 } },
  beats: [
    { at: 0, until: 500, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, tint: WRATH } },
    { at: 0, until: 500, layer: 'back', drawer: 'orbitCharge', params: { count: 4, half: 'back', r0: 0.14, r1: 0.2, tongues: 3, tint: WRATH } },
    { at: 300, until: 1100, layer: 'back', drawer: 'aura', params: { hz: 3, alpha: 0.8, r1: 1.2, tint: WRATH } },
    { at: 400, until: 1100, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.2, r0: 0.34, r1: 0.5, tongues: 7, tint: WRATH } },
    { at: 600, until: 1200, layer: 'back', drawer: 'spiral', params: { target: 'attacker', turns: 2.5, r0: 0.2, r1: 1.1, rpm: 180, tongues: 10, tint: WRATH } },
    { at: 1100, until: 1300, layer: 'top', drawer: 'impactFlash', params: { tint: WRATH } },
    { at: 1100, until: 1400, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: WRATH } },
    { at: 1100, until: 1500, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 1.0, tint: WRATH } },
    { at: 1100, until: 1700, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.4, tint: WRATH } },
    { at: 1100, until: 1800, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45, tint: WRATH_DARK } },
    { at: 1400, until: 2200, layer: 'back', drawer: 'smoke', params: { count: 4, tint: WRATH_DARK } },
  ],
  particles: [motes(1100, 14, { kind: 'ember', gravity: 0.2, durationMs: 800 })],
  grain: 0.12,
});

const HOOPA = Object.freeze({ deep: '#7A2AB8', body: '#E0189A', hot: '#FF4FD8', core: '#FFFFFF' });
const HAND = Object.freeze({ deep: '#3A4460', body: '#9AA8C8', hot: '#F5C542', core: '#FFFFFF' });
const PORTAL = Object.freeze({ deep: '#0B0716', body: '#F5C542', hot: '#FFE9A0', core: '#FFFFFF' });

// Hoopa (Unbound): grey-blue fists with gold cuffs swarm round it and strike the defender one
// after another, each hit a magenta shard burst under gold-rimmed portal rings.
export const hyperspaceFury = Object.freeze({
  id: 'hyperspace-fury',
  name: 'Hyperspace Fury',
  vgType: 'dark',
  statClass: 'physical',
  tier: 'S',
  family: 'punch',
  material: 'dark',
  durationMs: 2200,
  contactMs: 1050,
  pad: 1.8,
  attacker: { motion: 'lunge', params: { wind: 0.1, reach: 0.4, strikes: 3 } },
  defender: { motion: 'stagger', params: { hits: 3, strength: 0.45, gapMs: 220, lead: 440 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: HOOPA } },
    { at: 0, until: 700, layer: 'front', drawer: 'orbitCharge', params: { count: 6, half: 'both', r0: 0.16, r1: 0.22, tongues: 0, unit: 'fist', tint: HAND } },
    { at: 250, until: 900, layer: 'back', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, tint: HOOPA } },
    { at: 500, until: 1100, layer: 'back', drawer: 'spiral', params: { target: 'attacker', turns: 2, r0: 0.2, r1: 1.0, rpm: 180, tongues: 8, tint: HOOPA } },
    { at: 500, until: 1100, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.3, r1: 1.3, tint: PORTAL } },
    { at: 450, until: 1050, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 200, r0: 0.16, r1: 0.22, bow: 0.2, tongues: 0, unit: 'fist', tint: HAND } },
    { at: 600, until: 1000, layer: 'front', drawer: 'shards', params: { count: 5, arc: 240, distance: 0.8, tint: HOOPA } },
    { at: 950, until: 1450, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.3, r1: 1.4, tint: PORTAL } },
    { at: 1050, until: 1250, layer: 'top', drawer: 'impactFlash', params: { tint: HOOPA } },
    { at: 1050, until: 1400, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: HOOPA } },
    { at: 1050, until: 1500, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45, tint: PORTAL } },
  ],
  particles: [motes(1050, 12, { kind: 'shard', gravity: 0.3, durationMs: 800 })],
  grain: 0.12,
});

const FINS = Object.freeze({ deep: '#9B2AE0', body: '#E0142E', hot: '#FF7A3A', core: '#FFFFFF' });
const PIT = Object.freeze({ deep: '#0E0A0C', body: '#3A0A14', hot: '#E0142E', core: '#FF2A7A' });
const RUIN = Object.freeze({ deep: '#0E0A0C', body: '#E0142E', hot: '#FF2A7A', core: '#FFFFFF' });
const SPIKES = Object.freeze({ deep: '#0E0A0C', body: '#1E1418', hot: '#E0142E', core: '#FF2A7A' });

// Chi-Yu: its red fins flutter as it sinks into a black pit with crimson fractures, then a dark
// spike field and crimson columns rise under the defender.
export const ruination = Object.freeze({
  id: 'ruination',
  name: 'Ruination',
  vgType: 'dark',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'dark',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.8,
  attacker: { motion: 'stomp', params: {} },
  defender: { motion: 'sink', params: { heat: 0.6 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: FINS } },
    { at: 300, until: 1000, layer: 'back', drawer: 'shade', params: { target: 'attacker', kind: 'disc', r: 1.0, fill: 'deep', fillAlpha: 0.95, rimAlpha: 0.9, swirl: 30, tint: PIT } },
    { at: 400, until: 1000, layer: 'front', drawer: 'orbitCharge', params: { count: 5, half: 'front', r0: 0.14, r1: 0.2, tongues: 3, tint: FINS } },
    { at: 700, until: 1300, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.4, tint: RUIN } },
    { at: 800, until: 1300, layer: 'back', drawer: 'pillar', params: { from: 'below', height: 1.8, w: 0.6, count: 2, spread: 0.6, stagger: 100, tint: RUIN } },
    { at: 900, until: 1200, layer: 'back', drawer: 'cloud', params: { count: 6, drift: 0.3, alpha: 0.5, tint: PIT } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45, tint: RUIN } },
    { at: 1050, until: 1900, layer: 'front', drawer: 'shards', params: { count: 7, distance: 0.9, mode: 'cluster', tint: SPIKES } },
    { at: 1100, until: 1300, layer: 'top', drawer: 'impactFlash', params: { tint: RUIN } },
    { at: 1100, until: 1500, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 0.8, tint: RUIN } },
  ],
  particles: [motes(1100, 12, { kind: 'shard', gravity: 0.3, durationMs: 800 })],
  grain: 0.15,
});

const URSHIFU = Object.freeze({ deep: '#1A0A10', body: '#E8142F', hot: '#FF3D6E', core: '#FFFFFF' });
const WHITE_RING = Object.freeze({ deep: '#E8142F', body: '#FFFFFF', hot: '#FFFFFF', core: '#FFFFFF' });
const STARBURST = Object.freeze({ deep: '#E8142F', body: '#FFF08A', hot: '#FFFFFF', core: '#FFFFFF' });

// Urshifu (Single Strike): a crimson-and-white ring of arcs spins round it, then it dashes in
// to a yellow starburst and a crimson crescent of slashes sweeps over the defender.
export const wickedBlow = Object.freeze({
  id: 'wicked-blow',
  name: 'Wicked Blow',
  vgType: 'dark',
  statClass: 'physical',
  tier: 'S',
  family: 'dash',
  material: 'dark',
  durationMs: 2300,
  contactMs: 1150,
  pad: 1.8,
  attacker: { motion: 'dash', params: { wind: 0.3, reach: 1.0, overshoot: 0.1, arc: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.6 } },
  beats: [
    { at: 0, until: 400, layer: 'back', drawer: 'aura', params: { hz: 3, alpha: 0.8, tint: WHITE_RING } },
    { at: 267, until: 1000, layer: 'front', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.3, r1: 1.3, rpm: 180, width: 0.08, tint: WHITE_RING } },
    { at: 267, until: 1000, layer: 'back', drawer: 'spiral', params: { target: 'attacker', turns: 2, r0: 0.2, r1: 0.9, rpm: 180, tongues: 10, tint: URSHIFU } },
    { at: 1000, until: 1250, layer: 'back', drawer: 'beam', params: { kind: 'solid', w: 0.3, tint: URSHIFU } },
    { at: 1150, until: 1350, layer: 'top', drawer: 'impactFlash', params: { tint: STARBURST } },
    { at: 1150, until: 1450, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.42, tint: STARBURST } },
    { at: 1150, until: 1500, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 0.9, tint: URSHIFU } },
    { at: 1150, until: 1500, layer: 'back', drawer: 'speedRays', params: { count: 24, tint: URSHIFU } },
    { at: 1200, until: 1700, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.4, tint: WHITE_RING } },
    { at: 1250, until: 2100, layer: 'top', drawer: 'slashArc', params: { sweep: 120, radius: 1.0, count: 3, gapDeg: 30, angle: 45, thick: 0.25, tint: URSHIFU } },
  ],
  particles: [motes(1150, 12, { kind: 'streak', aspect: 0.4, durationMs: 700 })],
  grain: 0.15,
});

export const DARK_SIGNATURE_SPECS = Object.freeze({
  'dark-void': darkVoid,
  'fiery-wrath': fieryWrath,
  'hyperspace-fury': hyperspaceFury,
  ruination,
  'wicked-blow': wickedBlow,
});
