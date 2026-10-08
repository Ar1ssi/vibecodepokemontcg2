// Design 065 slices 10–11: the Psychic signature specs (tier S). Each spec is its Appendix S
// entry's board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S ›
// Psychic); departures from an entry are listed under the design's Deviations (slice 10).

/** Five spikes 72° apart: the entries' "starFlare arms 'ring'" inside the 30-tongue budget. */
const RING5 = Object.freeze([-90, -18, 54, 126, 198].map((angle) => Object.freeze({ angle, reach: 0.85 })));

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

const ORB = Object.freeze({ deep: '#5A2A9A', body: '#A65BEB', hot: '#CFABFF', core: '#FEFCFF' });
const ICE_BEAM = Object.freeze({ deep: '#0735F3', body: '#13B7FF', hot: '#CFF4FF', core: '#FEFCFF' });
const HAZE = Object.freeze({ deep: '#6A4FA8', body: '#CFABFF', hot: '#E8DAFF', core: '#FEFCFF' });
const SPLINTER = Object.freeze({ deep: '#4A4F5A', body: '#9AA3B0', hot: '#D8DEE6', core: '#FFFFFF' });

// Articuno: a purple orb glows at the breast, a dashed then solid cyan-white beam fires down
// the lane, and the defender breaks into grey splinters in a lilac haze.
export const freezingGlare = Object.freeze({
  id: 'freezing-glare',
  name: 'Freezing Glare',
  vgType: 'psychic',
  statClass: 'special',
  tier: 'S',
  family: 'beam',
  material: 'psychic',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'brace', params: { glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.4 } },
  beats: [
    { at: 0, until: 800, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, rings: 1, tint: ORB } },
    { at: 0, until: 700, layer: 'back', drawer: 'orbitCharge', params: { count: 3, half: 'back', r0: 0.16, r1: 0.24, tongues: 3, tint: ORB } },
    { at: 500, until: 750, layer: 'front', drawer: 'beam', params: { kind: 'segmented', w: 0.12, gap: 0.4, tint: ICE_BEAM } },
    { at: 700, until: 1600, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.5, growIn: 0.25, retract: 0.35, tint: ICE_BEAM } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: ICE_BEAM } },
    { at: 1000, until: 1700, layer: 'back', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: SPLINTER } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.4, tint: HAZE } },
    { at: 1000, until: 2000, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45, tint: HAZE } },
    { at: 1000, until: 2000, layer: 'back', drawer: 'cloud', params: { count: 6, drift: 0.5, alpha: 0.4, tint: HAZE } },
  ],
  particles: [motes(1000, 12)],
  grain: 0.1,
});

const SWAP = Object.freeze({ deep: '#D2137A', body: '#F09CEA', hot: '#FFFFFF', core: '#FFFFFF' });
const DOME = Object.freeze({ deep: '#F0CBEF', body: '#F09CEA', hot: '#FFFFFF', core: '#FFFFFF' });

// Manaphy / Magearna: a magenta swirl-orb is drawn out of the defender into the attacker under
// a pink dome, then sent back, and a pink dome closes on the defender. A status move: no hit.
export const heartSwap = Object.freeze({
  id: 'heart-swap',
  name: 'Heart Swap',
  vgType: 'psychic',
  statClass: 'status',
  tier: 'S',
  family: 'chime',
  material: 'psychic',
  durationMs: 2000,
  contactMs: 1100,
  pad: 1.7,
  attacker: { motion: 'brace', params: { glow: 0.6 } },
  defender: { motion: 'float', params: { lift: 0.15 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { target: 'attacker', hz: 2, alpha: 0.45, tint: SWAP } },
    { at: 300, until: 650, layer: 'front', drawer: 'coreCharge', params: { target: 'defender', lead: 0, r0: 0.18, r1: 0.4, tint: SWAP } },
    { at: 450, until: 900, layer: 'front', drawer: 'projectile', params: { from: 'defender', path: 'straight', r0: 0.3, r1: 0.5, tongues: 3, ease: 'linear', tint: SWAP } },
    { at: 850, until: 1300, layer: 'back', drawer: 'shade', params: { target: 'attacker', kind: 'dome', r: 0.85, fill: 'deep', fillAlpha: 0.35, rimAlpha: 0.8, swirl: 30, tint: DOME } },
    { at: 1050, until: 1500, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.3, r1: 0.5, tongues: 3, ease: 'linear', tint: SWAP } },
    { at: 1100, until: 1300, layer: 'front', drawer: 'glyph', params: { target: 'attacker', kind: 'heart', r: 0.6, tint: SWAP } },
    { at: 1450, until: 2000, layer: 'back', drawer: 'shade', params: { target: 'defender', kind: 'dome', r: 0.85, fill: 'deep', fillAlpha: 0.35, rimAlpha: 0.8, swirl: 30, tint: DOME } },
    { at: 1450, until: 1900, layer: 'back', drawer: 'aura', params: { target: 'defender', hz: 2, alpha: 0.6, tint: SWAP } },
  ],
  particles: [motes(850, 8, { anchor: 'attacker', kind: 'twinkle', durationMs: 600 }), motes(1450, 10, { kind: 'twinkle', durationMs: 600 })],
  grain: 0.1,
});

const PORTAL = Object.freeze({ deep: '#1B0630', body: '#7B2CB8', hot: '#E040E0', core: '#FCE6FF' });
const BURST = Object.freeze({ deep: '#3050FF', body: '#E040E0', hot: '#FCE6FF', core: '#FFFFFF' });

// Hoopa: a dark violet portal swallows the attacker, a second one opens at the defender and
// lets it out, and a magenta-and-white starburst bursts on the defender.
export const hyperspaceHole = Object.freeze({
  id: 'hyperspace-hole',
  name: 'Hyperspace Hole',
  vgType: 'psychic',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'psychic',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'warp', params: {} },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.4 } },
  beats: [
    { at: 0, until: 650, layer: 'back', drawer: 'shade', params: { target: 'attacker', kind: 'disc', r: 1.0, fill: 'deep', fillAlpha: 0.95, rimAlpha: 0.9, swirl: 60, tint: PORTAL } },
    { at: 0, until: 650, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 2, r0: 0.3, r1: 1.0, rpm: 120, tint: PORTAL } },
    { at: 350, until: 1000, layer: 'back', drawer: 'shade', params: { target: 'defender', kind: 'disc', r: 0.9, fill: 'deep', fillAlpha: 0.9, rimAlpha: 0.9, swirl: 60, tint: PORTAL } },
    { at: 350, until: 1000, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.4, tint: PORTAL } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: BURST } },
    { at: 1000, until: 1550, layer: 'front', drawer: 'starFlare', params: { arms: RING5, width: 0.46, tint: BURST } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.4, tint: BURST } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'shards', params: { count: 5, arc: 360, distance: 1.2, tint: BURST } },
    { at: 1000, until: 2000, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.4, tint: BURST } },
  ],
  particles: [motes(1000, 10, { durationMs: 700 })],
  grain: 0.1,
});

const RAINBOW = Object.freeze(['#FF5A5A', '#FFF35C', '#7CFF6A', '#5AA8FF']);
const WHITE_HOT = Object.freeze({ deep: '#C9B24A', body: '#E4F5A0', hot: '#FFFFFE', core: '#FFFFFF' });
const IMPACT = Object.freeze({ deep: '#8A3A10', body: '#FFF35C', hot: '#FFFBD0', core: '#FFFFFF' });
const SPD = Object.freeze({ deep: '#2A2E9A', body: '#6468F1', hot: '#B8BAFF', core: '#FFFFFF' });

// Latios: it whitens inside a rainbow halo, flings a white-hot orb high over the lane onto the
// defender, which takes a yellow-white burst with dark orange cracks under a blue haze.
export const lusterPurge = Object.freeze({
  id: 'luster-purge',
  name: 'Luster Purge',
  vgType: 'psychic',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'psychic',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.6 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { target: 'attacker', hz: 2, alpha: 0.7, tint: WHITE_HOT } },
    { at: 0, until: 650, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, tint: WHITE_HOT } },
    { at: 100, until: 800, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 3, r0: 0.3, r1: 1.2, width: 0.08, hues: RAINBOW } },
    { at: 200, until: 700, layer: 'back', drawer: 'shockRings', params: { count: 2, delay: 0.3, tint: WHITE_HOT } },
    { at: 400, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.6, r0: 0.34, r1: 0.5, tongues: 6, tint: WHITE_HOT } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: IMPACT } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: IMPACT } },
    { at: 1000, until: 1700, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.2, tint: IMPACT } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 3, r0: 0.3, r1: 1.5, tint: IMPACT } },
    { at: 1200, until: 2100, layer: 'back', drawer: 'aura', params: { target: 'defender', hz: 2, alpha: 0.6, tint: SPD } },
  ],
  particles: [motes(1000, 12, { kind: 'ember', gravity: 0.3, distance: 1.3, durationMs: 700 }), motes(1300, 8, { kind: 'twinkle' })],
  grain: 0.1,
});

const MIST = Object.freeze({ deep: '#A77BFF', body: '#E9D5FF', hot: '#FFFFFF', core: '#FFFFFF' });
const STAR = Object.freeze({ deep: '#FF8A4C', body: '#FFF3A3', hot: '#FFFBE0', core: '#FFFFFF' });
const PINK_MIST = Object.freeze({ deep: '#C08AE0', body: '#F5C6F0', hot: '#FFFFFF', core: '#FFFFFF' });

// Latias: a lilac mist orb with white feathers forms at its mouth, arcs high over the lane and
// drops onto the defender in a yellow-white star that melts into a pale lilac mist.
export const mistBall = Object.freeze({
  id: 'mist-ball',
  name: 'Mist Ball',
  vgType: 'psychic',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'psychic',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'brace', params: { glow: 0.6 } },
  defender: { motion: 'float', params: { lift: 0.15 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { target: 'attacker', hz: 2, alpha: 0.5, tint: MIST } },
    { at: 0, until: 400, layer: 'back', drawer: 'cloud', params: { target: 'attacker', count: 6, radius: 0.3, drift: 0.5, alpha: 0.4, tint: MIST } },
    { at: 0, until: 450, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, tint: MIST } },
    { at: 300, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.6, r0: 0.34, r1: 0.5, tongues: 6, ease: 'linear', tint: MIST } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: STAR } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.4, tint: STAR } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.4, tint: MIST } },
    { at: 1100, until: 2100, layer: 'front', drawer: 'cloud', params: { count: 8, radius: 0.4, drift: 0.6, alpha: 0.5, tint: PINK_MIST } },
    { at: 1000, until: 1900, layer: 'back', drawer: 'spiral', params: { turns: 1.5, r0: 0.2, r1: 0.9, rpm: 90, tongues: 8, tint: MIST } },
  ],
  particles: [motes(1000, 8, { kind: 'ember', gravity: 0.3, durationMs: 600 }), motes(1200, 10, { kind: 'twinkle', gravity: 0.1, durationMs: 900 })],
  grain: 0.1,
});

const RINGS = Object.freeze({ deep: '#B0307A', body: '#FF4FB8', hot: '#7FE7FF', core: '#FFFFFF' });
const PALE = Object.freeze({ deep: '#7A5AC0', body: '#9FE0FF', hot: '#E8DAFF', core: '#FFFFFF' });

// Azelf / Mesprit / Uxie: a lilac-white aura blooms as it rises, pink-and-cyan rings close
// round the defender, and a magenta-pink starburst bursts on it.
export const mysticalPower = Object.freeze({
  id: 'mystical-power',
  name: 'Mystical Power',
  vgType: 'psychic',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'psychic',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'float', params: { lift: 0.15 } },
  beats: [
    { at: 0, until: 800, layer: 'back', drawer: 'aura', params: { target: 'attacker', hz: 2, alpha: 0.6, tint: PALE } },
    { at: 0, until: 600, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, tint: PALE } },
    { at: 0, until: 600, layer: 'back', drawer: 'orbitCharge', params: { count: 4, half: 'back', r0: 0.16, r1: 0.24, tongues: 3, tint: PALE } },
    { at: 400, until: 900, layer: 'back', drawer: 'shockRings', params: { count: 2, delay: 0.3, tint: PALE } },
    { at: 600, until: 1050, layer: 'front', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.5, r1: 1.0, width: 0.08, rpm: 120, hues: ['#FF4FB8', '#7FE7FF', '#FF4FB8'] } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: RINGS } },
    { at: 1000, until: 1550, layer: 'front', drawer: 'starFlare', params: { arms: RING5, width: 0.46, tint: RINGS } },
    { at: 1000, until: 1700, layer: 'back', drawer: 'glyph', params: { r: 0.9, tint: RINGS } },
    { at: 1000, until: 1900, layer: 'back', drawer: 'cloud', params: { count: 8, radius: 0.4, drift: 0.4, alpha: 0.4, tint: PALE } },
  ],
  particles: [motes(1000, 12, { kind: 'twinkle' })],
  grain: 0.1,
});

export const PSYCHIC_SIGNATURE_SPECS = Object.freeze({
  'freezing-glare': freezingGlare,
  'heart-swap': heartSwap,
  'hyperspace-hole': hyperspaceHole,
  'luster-purge': lusterPurge,
  'mist-ball': mistBall,
  'mystical-power': mysticalPower,
});
