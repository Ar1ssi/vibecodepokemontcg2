// Design 065 slice 12: the Flying signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Flying);
// departures from an entry are listed under the design's Deviations (slice 12).

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

const CYAN = Object.freeze({ deep: '#1E63E0', body: '#26E0FF', hot: '#A8F3FF', core: '#FFFFFF' });
const VORTEX = Object.freeze({ deep: '#0E1F5C', body: '#1E63E0', hot: '#26E0FF', core: '#A8F3FF' });
const WHITE = Object.freeze({ deep: '#A8F3FF', body: '#E8FCFF', hot: '#FFFFFF', core: '#FFFFFF' });

// Lugia: a cyan ring-orb grows at the wing, crosses the lane and wraps the defender in a looping
// cyan vortex that flashes white at its core.
export const aeroblast = Object.freeze({
  id: 'aeroblast',
  name: 'Aeroblast',
  vgType: 'flying',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'flying',
  durationMs: 2000,
  contactMs: 1050,
  pad: 1.8,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'float', params: { lift: 0.15 } },
  beats: [
    { at: 0, until: 500, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.16, r1: 0.45, rings: 1, tint: CYAN } },
    { at: 100, until: 500, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.2, r1: 0.6, tint: CYAN } },
    { at: 0, until: 500, layer: 'front', drawer: 'orbitCharge', params: { count: 4, half: 'front', r0: 0.14, r1: 0.2, tongues: 3, tint: CYAN } },
    { at: 450, until: 1050, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.42, r1: 0.6, tongues: 4, ease: 'linear', unit: 'rings', tint: CYAN } },
    { at: 600, until: 800, layer: 'top', drawer: 'impactFlash', params: { target: 'attacker', r0: 0.4, r1: 0.9, tint: WHITE } },
    { at: 1000, until: 1700, layer: 'front', drawer: 'spiral', params: { turns: 2.5, r0: 0.2, r1: 1.1, rpm: 90, tongues: 10, tint: VORTEX } },
    { at: 1050, until: 1350, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.4, tint: WHITE } },
    { at: 1050, until: 1230, layer: 'top', drawer: 'impactFlash', params: { tint: WHITE } },
    { at: 1050, until: 1450, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.1, tint: WHITE } },
    { at: 1050, until: 1900, layer: 'back', drawer: 'cloud', params: { count: 6, radius: 0.35, drift: 0.6, alpha: 0.4, tint: CYAN } },
  ],
  particles: [motes(1050, 12, { kind: 'streak', aspect: 0.4, durationMs: 700 })],
  grain: 0.1,
});

const HELIX = Object.freeze({ deep: '#6B8FB3', body: '#9CCFEF', hot: '#DDEFFF', core: '#FFFFFF' });
const MIST = Object.freeze({ deep: '#9CCFEF', body: '#C8E6F5', hot: '#FFFFFF', core: '#FFFFFF' });

// Tornadus: ground streaks and a wind lead-in, then a grey-white helix tornado rises over the
// defender and its base collapses into a pale ice-mist disc with shimmering rings.
export const bleakwindStorm = Object.freeze({
  id: 'bleakwind-storm',
  name: 'Bleakwind Storm',
  vgType: 'flying',
  statClass: 'special',
  tier: 'S',
  family: 'wind',
  material: 'flying',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'float', params: { lift: 0.15 } },
  beats: [
    { at: 150, until: 600, layer: 'back', drawer: 'beam', params: { kind: 'segmented', w: 0.3, tint: HELIX } },
    { at: 300, until: 900, layer: 'back', drawer: 'cloud', params: { count: 6, radius: 0.35, drift: 0.6, alpha: 0.4, tint: MIST } },
    { at: 1000, until: 1250, layer: 'top', drawer: 'impactFlash', params: { tint: MIST } },
    { at: 1000, until: 2000, layer: 'front', drawer: 'spiral', params: { turns: 2.5, r0: 0.2, r1: 1.1, rpm: 90, tongues: 14, tint: HELIX } },
    { at: 1100, until: 1800, layer: 'back', drawer: 'beam', params: { kind: 'helix', w: 0.3, turns: 3, tint: HELIX } },
    { at: 1700, until: 2200, layer: 'back', drawer: 'cloud', params: { count: 8, radius: 0.35, drift: 0.6, alpha: 0.5, tint: MIST } },
    { at: 1800, until: 2200, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.3, tint: MIST } },
  ],
  particles: [motes(1000, 14, { kind: 'flake', gravity: 0.1, durationMs: 1000 })],
  grain: 0.15,
});

const GOLD = Object.freeze({ deep: '#B89A1E', body: '#F4E84A', hot: '#FFF9C0', core: '#FFFFFF' });
const LIME = Object.freeze({ deep: '#5E8A1E', body: '#B8F04A', hot: '#E8FFB0', core: '#FFFFFF' });
const SPHERE = Object.freeze({ deep: '#1E7A3C', body: '#3CC86A', hot: '#B8F04A', core: '#FFFFFF' });
const BURST = Object.freeze({ deep: '#2AA6A6', body: '#5FF0F0', hot: '#E0FFFF', core: '#FFFFFF' });

// Rayquaza: it rises with gold chain-rings round it, a green-yellow sphere falls from the sky
// onto the defender and bursts into a green-white leaf-and-rock explosion.
export const dragonAscent = Object.freeze({
  id: 'dragon-ascent',
  name: 'Dragon Ascent',
  vgType: 'flying',
  statClass: 'physical',
  tier: 'S',
  family: 'burst',
  material: 'flying',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.4 } },
  beats: [
    { at: 0, until: 370, layer: 'back', drawer: 'orbitCharge', params: { count: 5, half: 'back', r0: 0.16, r1: 0.24, tongues: 2, tint: GOLD } },
    { at: 0, until: 700, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.5, tint: SPHERE } },
    { at: 370, until: 1000, layer: 'front', drawer: 'orbitCharge', params: { count: 6, half: 'both', r0: 0.2, r1: 0.35, tongues: 0, unit: 'rings', tint: GOLD } },
    { at: 550, until: 1000, layer: 'front', drawer: 'projectile', params: { from: 'sky', path: 'straight', r0: 0.4, r1: 0.55, tongues: 3, ease: 'in', tint: SPHERE } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: LIME } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: BURST } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: LIME } },
    { at: 1000, until: 1400, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.1, tint: LIME } },
    { at: 1000, until: 1200, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: LIME } },
    { at: 1200, until: 2000, layer: 'back', drawer: 'smoke', params: { count: 6, tint: SPHERE } },
  ],
  particles: [motes(1000, 14, { kind: 'leaf', gravity: 0.4, distance: 1.3, durationMs: 900 })],
  grain: 0.1,
});

const DARK_WING = Object.freeze({ deep: '#120608', body: '#7A0F26', hot: '#D91E4B', core: '#FF9A3C' });
const CRIMSON = Object.freeze({ deep: '#7A0F26', body: '#D91E4B', hot: '#FF2E6E', core: '#FFD0DC' });
const DRAIN = Object.freeze({ deep: '#1E7A50', body: '#6BE8A0', hot: '#D8FFE8', core: '#FFFFFF' });
const SMOKE = Object.freeze({ deep: '#120608', body: '#2A1014', hot: '#5A2028', core: '#7A0F26' });

// Yveltal: it rears with dark wings, a crimson sphere fires a red beam, a crimson column erupts
// under the defender, and a teal-green drain orb returns to the attacker.
export const oblivionWing = Object.freeze({
  id: 'oblivion-wing',
  name: 'Oblivion Wing',
  vgType: 'flying',
  statClass: 'special',
  tier: 'S',
  family: 'splash',
  material: 'flying',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 800, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: DARK_WING } },
    { at: 0, until: 900, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.45, tint: SMOKE } },
    { at: 300, until: 800, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, tint: CRIMSON } },
    { at: 550, until: 1100, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.75, tint: CRIMSON } },
    { at: 800, until: 1000, layer: 'back', drawer: 'rain', params: { count: 8, height: 1.6, spread: 0.9, tint: { body: '#F0E6E8', hot: '#FFFFFF' } } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: CRIMSON } },
    { at: 1000, until: 1650, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 2.2, w: 0.9, tint: CRIMSON } },
    { at: 1000, until: 1400, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.3, tint: CRIMSON } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'splash', params: { count: 10, arc: 140, direction: -90, gravity: 0.5, tint: CRIMSON } },
    { at: 1200, until: 1800, layer: 'back', drawer: 'smoke', params: { count: 6, tint: SMOKE } },
    { at: 1200, until: 1800, layer: 'front', drawer: 'projectile', params: { from: 'defender', path: 'straight', r0: 0.36, r1: 0.48, tongues: 3, ease: 'linear', tint: DRAIN } },
    { at: 1400, until: 2000, layer: 'back', drawer: 'aura', params: { target: 'defender', hz: 2, alpha: 0.6, tint: DRAIN } },
  ],
  particles: [motes(1250, 10, { kind: 'twinkle', durationMs: 700 })],
  grain: 0.15,
});

export const FLYING_SIGNATURE_SPECS = Object.freeze({
  aeroblast,
  'bleakwind-storm': bleakwindStorm,
  'dragon-ascent': dragonAscent,
  'oblivion-wing': oblivionWing,
});
