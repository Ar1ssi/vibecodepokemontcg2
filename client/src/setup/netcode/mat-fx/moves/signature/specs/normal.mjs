// Design 065 slice 15: the Normal signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Normal);
// departures from an entry are listed under the design's Deviations (slice 15).

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

const GLOVE = Object.freeze({ deep: '#E8552B', body: '#FFFFFF', hot: '#FFF5B0', core: '#FFFFFF' });
const BURST = Object.freeze({ deep: '#E8552B', body: '#F2C230', hot: '#FFF5B0', core: '#FFFFFF' });

// Regigigas: a white five-fingered glove comes down from above and closes over the defender,
// then a yellow radial burst fires out of it.
export const crushGrip = Object.freeze({
  id: 'crush-grip',
  name: 'Crush Grip',
  vgType: 'normal',
  statClass: 'physical',
  tier: 'S',
  family: 'punch',
  material: 'normal',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.8,
  attacker: { motion: 'lunge', params: { wind: 0.36, reach: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.6 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: BURST } },
    { at: 300, until: 1200, layer: 'top', drawer: 'grip', params: { size: 1.5, tint: GLOVE } },
    { at: 900, until: 1400, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4, tint: BURST } },
    { at: 1100, until: 1300, layer: 'top', drawer: 'impactFlash', params: { tint: BURST } },
    { at: 1100, until: 1500, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: BURST } },
    { at: 1100, until: 1500, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.0, tint: BURST } },
    { at: 1150, until: 1450, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.2, tint: BURST } },
    { at: 1150, until: 1500, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.4, tint: BURST } },
  ],
  particles: [motes(1100, 12, { kind: 'streak', aspect: 0.4, durationMs: 700 })],
  grain: 0.12,
});

const ORB = Object.freeze({ deep: '#FF7A1A', body: '#FFB347', hot: '#FFE066', core: '#FFFFFF' });
const GOLD_RING = Object.freeze({ deep: '#1A1200', body: '#FFE066', hot: '#FFF3A6', core: '#FFFFFF' });

// Arceus: a golden ring of light turns round it, a white-gold orb charges over its head, then
// the orb drops onto the defender in a fiery radial burst.
export const judgment = Object.freeze({
  id: 'judgment',
  name: 'Judgment',
  vgType: 'normal',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'normal',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.9,
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.8 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: GOLD_RING } },
    { at: 0, until: 500, layer: 'back', drawer: 'orbitCharge', params: { count: 6, half: 'back', r0: 0.12, r1: 0.18, tongues: 0, tint: GOLD_RING } },
    { at: 200, until: 900, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.4, r1: 1.2, width: 0.08, rpm: 120, tint: GOLD_RING } },
    { at: 300, until: 1000, layer: 'front', drawer: 'orbitCharge', params: { count: 6, half: 'front', r0: 0.12, r1: 0.18, tongues: 0, tint: GOLD_RING } },
    { at: 300, until: 900, layer: 'back', drawer: 'shockRings', params: { count: 2, tint: GOLD_RING } },
    { at: 450, until: 750, layer: 'front', drawer: 'coreCharge', params: { target: 'sky-attacker', r0: 0.25, r1: 0.6, rings: 1, tint: ORB } },
    { at: 700, until: 1100, layer: 'front', drawer: 'projectile', params: { path: 'arc', from: 'sky-attacker', ease: 'linear', bow: 0.5, r0: 0.5, r1: 0.7, tongues: 5, tint: ORB } },
    { at: 1000, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45, tint: ORB } },
    { at: 1100, until: 1300, layer: 'top', drawer: 'impactFlash', params: { tint: ORB } },
    { at: 1100, until: 1400, layer: 'back', drawer: 'speedRays', params: { count: 28, tint: GOLD_RING } },
    { at: 1100, until: 1500, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.42, tint: ORB } },
    { at: 1150, until: 1600, layer: 'front', drawer: 'shards', params: { count: 5, arc: 360, distance: 1.1, tint: ORB } },
    { at: 1150, until: 1600, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.4, tint: GOLD_RING } },
    { at: 1400, until: 2200, layer: 'back', drawer: 'smoke', params: { count: 4, tint: ORB } },
  ],
  particles: [motes(1100, 14, { kind: 'ember', gravity: 0.2 })],
  grain: 0.12,
});

const SILVALLY = Object.freeze({ deep: '#3A2A10', body: '#FFB020', hot: '#FFE066', core: '#FFFFFF' });
const SLASH = Object.freeze({ deep: '#FF7A1A', body: '#FFE066', hot: '#FFFFFF', core: '#FFFFFF' });

// Silvally: yellow crescent slashes sweep round its glowing fist, then three vertical
// yellow-white bursts strike the defender one after another.
export const multiAttack = Object.freeze({
  id: 'multi-attack',
  name: 'Multi-Attack',
  vgType: 'normal',
  statClass: 'physical',
  tier: 'S',
  family: 'punch',
  material: 'normal',
  durationMs: 2200,
  contactMs: 1050,
  pad: 1.8,
  attacker: { motion: 'lunge', params: { wind: 0.3, reach: 0.6, strikes: 3 } },
  defender: { motion: 'stagger', params: { hits: 3, strength: 0.45, gapMs: 220, lead: 440 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.7, tint: SLASH } },
    { at: 0, until: 500, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.45, tint: SLASH } },
    { at: 300, until: 1000, layer: 'front', drawer: 'orbitCharge', params: { count: 4, half: 'both', r0: 0.26, r1: 0.34, tongues: 0, unit: 'crescent', tint: SLASH } },
    { at: 400, until: 1050, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.3, r1: 1.3, width: 0.08, rpm: 120, tint: SLASH } },
    { at: 580, until: 1300, layer: 'back', drawer: 'pillar', params: { from: 'below', height: 1.6, w: 0.35, count: 3, spread: 0.8, stagger: 220, tint: SLASH } },
    { at: 600, until: 1000, layer: 'front', drawer: 'shards', params: { count: 5, arc: 240, distance: 0.8, tint: SILVALLY } },
    { at: 1050, until: 1250, layer: 'top', drawer: 'impactFlash', params: { tint: SLASH } },
    { at: 1050, until: 1350, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: SILVALLY } },
    { at: 1050, until: 1400, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: SILVALLY } },
    { at: 1050, until: 1500, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4, tint: SILVALLY } },
    { at: 1350, until: 2000, layer: 'back', drawer: 'smoke', params: { count: 4, tint: SILVALLY } },
  ],
  particles: [motes(1050, 12, { kind: 'streak', aspect: 0.4, durationMs: 700 })],
  grain: 0.12,
});

const PASTEL = Object.freeze(['#FFB3E6', '#B3E8FF', '#C7F5A8', '#FFF3A8', '#B07CFF']);
const SONG = Object.freeze({ deep: '#B07CFF', body: '#FFB3E6', hot: '#FFF3A8', core: '#FFFFFF' });
const RING_PINK = Object.freeze({ deep: '#B07CFF', body: '#FF7ADF', hot: '#FFB3E6', core: '#FFFFFF' });

// Meloetta: music notes rise round it inside spinning pastel rings, then the notes fly across
// and a pink-violet ring bursts out at the defender.
export const relicSong = Object.freeze({
  id: 'relic-song',
  name: 'Relic Song',
  vgType: 'normal',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'normal',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.8,
  attacker: { motion: 'spin', params: { turns: 1 } },
  defender: { motion: 'stagger', params: { hits: 2, strength: 0.35, gapMs: 180 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: SONG } },
    { at: 0, until: 600, layer: 'back', drawer: 'orbitCharge', params: { count: 5, half: 'back', r0: 0.12, r1: 0.16, tongues: 0, hues: PASTEL } },
    { at: 300, until: 1000, layer: 'back', drawer: 'spiral', params: { target: 'attacker', turns: 2, r0: 0.2, r1: 1.1, rpm: 120, tongues: 8, tint: SONG } },
    { at: 300, until: 1050, layer: 'front', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 3, r0: 0.4, r1: 1.3, width: 0.08, rpm: 120, hues: ['#B3E8FF', '#FFB3E6', '#C7F5A8'] } },
    { at: 650, until: 1100, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 90, r0: 0.2, r1: 0.28, bow: 0.3, tongues: 0, hues: PASTEL } },
    { at: 1100, until: 1300, layer: 'top', drawer: 'impactFlash', params: { tint: RING_PINK } },
    { at: 1100, until: 1400, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: SONG } },
    { at: 1100, until: 1400, layer: 'front', drawer: 'starFlare', params: { arms: RING5, width: 0.36, tint: RING_PINK } },
    { at: 1100, until: 1700, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.4, width: 0.08, tint: RING_PINK } },
    { at: 1100, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35, tint: RING_PINK } },
  ],
  particles: [
    motes(100, 10, { anchor: 'attacker', kind: 'note', spread: 120, size: [0.22, 0.32], distance: 1.0, maxDelay: 0.5, durationMs: 1200 }),
    motes(1100, 10, { kind: 'note', spread: 200, size: [0.22, 0.32], distance: 1.1, maxDelay: 0.3, durationMs: 1000 }),
  ],
  grain: 0.12,
});

const TECHNO = Object.freeze({ deep: '#1A0E2E', body: '#A34BFF', hot: '#E9B8FF', core: '#FFFFFF' });
const SPARK = Object.freeze({ deep: '#1A0E2E', body: '#66E6FF', hot: '#C8FF6B', core: '#FFFFFF' });
const SMOKE = Object.freeze({ deep: '#1A0E2E', body: '#E9B8FF', hot: '#FFFFFF', core: '#FFFFFF' });

// Genesect: its cannon charges a violet-white ball, then fires a violet-white beam with cyan
// sparks into the defender, which disappears into white smoke.
export const technoBlast = Object.freeze({
  id: 'techno-blast',
  name: 'Techno Blast',
  vgType: 'normal',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'normal',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.8,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.6 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: TECHNO } },
    { at: 0, until: 600, layer: 'back', drawer: 'orbitCharge', params: { count: 4, half: 'back', r0: 0.12, r1: 0.18, tongues: 2, tint: SPARK } },
    { at: 300, until: 900, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.3, r1: 1.2, width: 0.08, tint: SPARK } },
    { at: 500, until: 1100, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, rings: 1, tint: TECHNO } },
    { at: 800, until: 1100, layer: 'front', drawer: 'beam', params: { kind: 'widening', w: 0.6, tint: TECHNO } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.7, tint: TECHNO } },
    { at: 1100, until: 1300, layer: 'top', drawer: 'impactFlash', params: { tint: SMOKE } },
    { at: 1100, until: 1400, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: SPARK } },
    { at: 1100, until: 1450, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.42, tint: TECHNO } },
    { at: 1100, until: 1600, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4, tint: TECHNO } },
    { at: 1150, until: 1600, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 0.9, tint: SPARK } },
    { at: 1200, until: 2100, layer: 'back', drawer: 'cloud', params: { count: 8, drift: 0.3, alpha: 0.6, tint: SMOKE } },
  ],
  particles: [motes(1100, 14, { kind: 'streak', aspect: 0.4, durationMs: 700 })],
  grain: 0.12,
});

const STAR_SHELL = Object.freeze({ deep: '#0F2A55', body: '#2FB8FF', hot: '#5FF2E0', core: '#E6FFFF' });
const STAR_GOLD = Object.freeze({ deep: '#0F2A55', body: '#FFE07A', hot: '#FFF5C8', core: '#FFFFFF' });
const STAR_RINGS = Object.freeze(['#E6FFFF', '#5FF2E0', '#FFE07A']);

// Terapagos: its shell spins in a star-trail spiral, a cyan light pillar rises under it ringed
// by tilted white-cyan halos, and cyan crystal shards burst on the defender.
export const teraStarstorm = Object.freeze({
  id: 'tera-starstorm',
  name: 'Tera Starstorm',
  vgType: 'normal',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'stellar',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.9,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: STAR_SHELL } },
    { at: 0, until: 500, layer: 'back', drawer: 'orbitCharge', params: { count: 6, half: 'back', r0: 0.1, r1: 0.14, tongues: 0, unit: 'facet' } },
    { at: 200, until: 750, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 2, r0: 0.2, r1: 0.9, rpm: 180, tongues: 8, tint: { body: '#7CFFB2', hot: '#E6FFFF' } } },
    { at: 400, until: 850, layer: 'front', drawer: 'coreCharge', params: { lead: 0, r0: 0.2, r1: 0.45 } },
    { at: 600, until: 1300, layer: 'back', drawer: 'pillar', params: { target: 'attacker', from: 'below', height: 1.8, w: 0.5 } },
    { at: 700, until: 1300, layer: 'front', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 3, r0: 0.4, r1: 1.0, width: 0.08, rpm: 150, hues: STAR_RINGS } },
    { at: 850, until: 1150, layer: 'back', drawer: 'beam', params: { kind: 'solid', w: 0.3, tint: { body: '#5FF2E0', hot: '#7CFFB2' } } },
    { at: 800, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.45, tint: STAR_SHELL } },
    { at: 1100, until: 1300, layer: 'top', drawer: 'impactFlash', params: { tint: STAR_SHELL } },
    { at: 1100, until: 1350, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: STAR_GOLD } },
    { at: 1100, until: 1400, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, unit: 'facet' } },
    { at: 1100, until: 1700, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.3, r1: 1.4, width: 0.08, hues: STAR_RINGS } },
    { at: 1300, until: 1700, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 0.9 } },
  ],
  particles: [motes(1100, 16, { kind: 'twinkle', size: [0.05, 0.1] })],
  grain: 0,
});

export const NORMAL_SIGNATURE_SPECS = Object.freeze({
  'crush-grip': crushGrip,
  judgment,
  'multi-attack': multiAttack,
  'relic-song': relicSong,
  'techno-blast': technoBlast,
  'tera-starstorm': teraStarstorm,
});
