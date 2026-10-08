// Design 065 slice 9: the Fairy signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Fairy);
// departures from an entry are listed under the design's Deviations (slice 9).

/** Five spikes 72° apart: the entries' "starFlare arms 'ring'" inside the 30-tongue budget. */
const RING5 = Object.freeze([-90, -18, 54, 126, 198].map((angle) => Object.freeze({ angle, reach: 0.85 })));

const twinkles = (at, count, over = {}) =>
  Object.freeze({
    at,
    anchor: 'defender',
    count,
    distance: 1.2,
    direction: -90,
    spread: 360,
    size: [0.04, 0.09],
    aspect: 0.8,
    gravity: 0.2,
    maxDelay: 0.15,
    durationMs: 900,
    kind: 'twinkle',
    ...over,
  });

const PINK = Object.freeze({ deep: '#AE8FDA', body: '#FD9EFC', hot: '#FEBCFD', core: '#FDF3FF' });
const VIOLET = Object.freeze({ deep: '#3A1A8A', body: '#7A3CFF', hot: '#FEBCFD', core: '#FDF3FF' });

// Magearna: a pink-violet dome opens round a glowing pink sphere, a pink-white beam fires down
// the lane, and the defender bursts in violet inside pink petals.
export const fleurCannon = Object.freeze({
  id: 'fleur-cannon',
  name: 'Fleur Cannon',
  vgType: 'fairy',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'fairy',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'brace', params: { glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 1000, layer: 'back', drawer: 'shade', params: { target: 'attacker', kind: 'dome', r: 0.85, fill: 'deep', fillAlpha: 0.3, rimAlpha: 0.8, swirl: 30, tint: PINK } },
    { at: 0, until: 1000, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 2, r0: 0.3, r1: 0.9, tint: PINK } },
    { at: 0, until: 700, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.56, rings: 1, tint: PINK } },
    { at: 300, until: 900, layer: 'back', drawer: 'orbitCharge', params: { count: 4, half: 'back', r0: 0.16, r1: 0.24, tongues: 3, tint: PINK } },
    { at: 300, until: 900, layer: 'front', drawer: 'orbitCharge', params: { count: 4, half: 'front', r0: 0.16, r1: 0.24, tongues: 3, tint: PINK } },
    { at: 600, until: 1400, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.5, tint: PINK } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: VIOLET } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'starFlare', params: { arms: RING5, width: 0.46, tint: VIOLET } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.4, tint: PINK } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45, tint: PINK } },
    { at: 1100, until: 2200, layer: 'back', drawer: 'glyph', params: { r: 0.9, tint: PINK } },
  ],
  particles: [twinkles(1000, 22)],
  grain: 0.1,
});

const BOLT_GOLD = Object.freeze({ deep: '#FF8B5B', body: '#FFE14D', hot: '#FFF6B8', core: '#FFFFFF' });
const DOME = Object.freeze({ deep: '#ACF9FC', body: '#FFA5C0', hot: '#FFFFFF', core: '#FFFFFF' });
const PAD = Object.freeze({ deep: '#8A3F80', body: '#D887CC', hot: '#FFA5C0', core: '#FFFFFF' });

// Tapu Koko / Lele / Bulu / Fini: the attacker rises and swoops, a yellow bolt strikes the
// defender from above, and a cyan-and-pink dome seals it over a pink-violet pad.
export const naturesMadness = Object.freeze({
  id: 'natures-madness',
  name: 'Nature’s Madness',
  vgType: 'fairy',
  statClass: 'special',
  tier: 'S',
  family: 'electric',
  material: 'fairy',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.4 } },
  beats: [
    { at: 0, until: 450, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.5, tint: { body: '#7CFF9A', hot: '#E8FFD0' } } },
    { at: 500, until: 1100, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 9, jag: 0.12, branches: 2, rerollMs: 45, width: 0.12, tint: BOLT_GOLD } },
    { at: 600, until: 2200, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.4, r1: 1.0, tint: PAD } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: BOLT_GOLD } },
    { at: 1000, until: 1450, layer: 'back', drawer: 'starFlare', params: { arms: RING5, width: 0.46, tint: DOME } },
    { at: 1000, until: 1700, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.4, tint: DOME } },
    { at: 1000, until: 2000, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45, tint: PAD } },
    { at: 1050, until: 2200, layer: 'front', drawer: 'shade', params: { kind: 'sphere', r: 0.95, fill: 'deep', fillAlpha: 0.3, rimAlpha: 0.75, swirl: 40, tint: DOME } },
    { at: 1200, until: 2200, layer: 'back', drawer: 'glyph', params: { r: 0.9, tint: DOME } },
  ],
  particles: [twinkles(1000, 12), twinkles(1500, 10, { kind: 'mote', gravity: 0 })],
  grain: 0.1,
});

const HEART = Object.freeze({ deep: '#FF2DAA', body: '#FBBEAF', hot: '#FFF1F6', core: '#FFFFFF' });
const STORM = Object.freeze({ deep: '#FF2DAA', body: '#FFF1F6', hot: '#FBBEAF', core: '#FFFFFF' });
const LIME = Object.freeze({ deep: '#8FAF1A', body: '#E8FF5A', hot: '#FFD84A', core: '#FFFFFF' });

// Enamorus: it rises behind a large pink heart shield, a pink-white tornado spins round the
// defender, and a yellow-green star bursts on it.
export const springtideStorm = Object.freeze({
  id: 'springtide-storm',
  name: 'Springtide Storm',
  vgType: 'fairy',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'fairy',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.4 } },
  beats: [
    { at: 0, until: 450, layer: 'back', drawer: 'orbitCharge', params: { count: 3, half: 'back', r0: 0.16, r1: 0.24, tongues: 3, tint: HEART } },
    { at: 0, until: 450, layer: 'front', drawer: 'orbitCharge', params: { count: 3, half: 'front', r0: 0.16, r1: 0.24, tongues: 3, tint: HEART } },
    { at: 300, until: 1200, layer: 'front', drawer: 'glyph', params: { target: 'attacker', kind: 'heart', r: 1.0, tint: HEART } },
    { at: 300, until: 1100, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: HEART } },
    { at: 200, until: 1000, layer: 'front', drawer: 'spiral', params: { turns: 2.5, r0: 0.2, r1: 1.1, rpm: 90, tongues: 10, tint: STORM } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: LIME } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'starFlare', params: { arms: RING5, width: 0.46, tint: LIME } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.4, tint: STORM } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45, tint: HEART } },
    { at: 1000, until: 1900, layer: 'back', drawer: 'cloud', params: { count: 6, radius: 0.35, drift: 0.5, alpha: 0.5, tint: STORM } },
  ],
  particles: [twinkles(1000, 14), twinkles(1300, 8, { kind: 'mote', gravity: 0 })],
  grain: 0.1,
});

export const FAIRY_SIGNATURE_SPECS = Object.freeze({
  'fleur-cannon': fleurCannon,
  'natures-madness': naturesMadness,
  'springtide-storm': springtideStorm,
});
