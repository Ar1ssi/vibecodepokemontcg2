// Design 065 slice 14: the Ghost signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Ghost);
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

const STEED = Object.freeze({ deep: '#1A0A2E', body: '#7A3CFF', hot: '#C9A8FF', core: '#FFFFFF' });
const GROUND_FLAME = Object.freeze({ deep: '#7A3CFF', body: '#E43BE0', hot: '#FFC0F5', core: '#FFFFFF' });
const ASTRAL_DOME = Object.freeze({ deep: '#1A0A2E', body: '#7A3CFF', hot: '#E43BE0', core: '#C9A8FF' });
const ASTRAL_BURST = Object.freeze({ deep: '#7A3CFF', body: '#7FF7FF', hot: '#E8FFFF', core: '#FFFFFF' });

// Calyrex (Shadow Rider): a violet steed rears among magenta ground flames and purple spires,
// then a black-violet dome rises over the defender and a white-cyan burst breaks inside it.
export const astralBarrage = Object.freeze({
  id: 'astral-barrage',
  name: 'Astral Barrage',
  vgType: 'ghost',
  statClass: 'special',
  tier: 'S',
  family: 'ghost',
  material: 'ghost',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.8,
  attacker: { motion: 'brace', params: { glow: 1 } },
  defender: { motion: 'stagger', params: { hits: 2, strength: 0.4, gapMs: 180 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.7, tint: STEED } },
    { at: 0, until: 500, layer: 'back', drawer: 'orbitCharge', params: { count: 4, half: 'back', r0: 0.12, r1: 0.18, tongues: 3, tint: STEED } },
    { at: 300, until: 900, layer: 'back', drawer: 'pillar', params: { target: 'attacker', from: 'below', height: 1.4, w: 0.35, count: 3, spread: 0.7, stagger: 80, tint: STEED } },
    { at: 300, until: 900, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 2, r0: 0.3, r1: 1.2, tint: GROUND_FLAME } },
    { at: 600, until: 1000, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.4, tint: GROUND_FLAME } },
    { at: 700, until: 1050, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.3, r1: 0.42, tongues: 5, ease: 'in', tint: STEED } },
    { at: 850, until: 1750, layer: 'front', drawer: 'shade', params: { kind: 'dome', r: 1.05, fill: 'deep', fillAlpha: 0.9, rimAlpha: 0.9, swirl: 40, tint: ASTRAL_DOME } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.55, tint: STEED } },
    { at: 1100, until: 1300, layer: 'top', drawer: 'impactFlash', params: { r1: 1.1, tint: ASTRAL_BURST } },
    { at: 1100, until: 1600, layer: 'top', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.4, tint: GROUND_FLAME } },
    { at: 1300, until: 2100, layer: 'front', drawer: 'cloud', params: { count: 8, drift: 0.3, alpha: 0.6, tint: GROUND_FLAME } },
  ],
  particles: [motes(1100, 14, { kind: 'twinkle', durationMs: 800 })],
  grain: 0.12,
});

const MOON = Object.freeze({ deep: '#5FE6F5', body: '#E8F7FF', hot: '#FFFFFF', core: '#FFFFFF' });
const MOON_CYAN = Object.freeze({ deep: '#0B1733', body: '#5FE6F5', hot: '#E8F7FF', core: '#FFFFFF' });
const WING = Object.freeze({ deep: '#0B1733', body: '#7A4FFF', hot: '#C9B8FF', core: '#FFFFFF' });
const CREST = Object.freeze({ deep: '#7A4FFF', body: '#FFD86B', hot: '#FFF3C0', core: '#FFFFFF' });

// Lunala: violet wings spread round a white-blue orb at its chest under a moon crest, then a
// cyan-white beam crosses the lane and bursts on the defender.
export const moongeistBeam = Object.freeze({
  id: 'moongeist-beam',
  name: 'Moongeist Beam',
  vgType: 'ghost',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'ghost',
  durationMs: 2300,
  contactMs: 1150,
  pad: 1.8,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 800, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.7, tint: WING } },
    { at: 0, until: 800, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, rings: 1, tint: MOON } },
    { at: 200, until: 800, layer: 'back', drawer: 'orbitCharge', params: { count: 5, half: 'back', r0: 0.16, r1: 0.22, tongues: 0, unit: 'crescent', tint: CREST } },
    { at: 500, until: 900, layer: 'back', drawer: 'shockRings', params: { target: 'attacker', count: 2, tint: MOON_CYAN } },
    { at: 700, until: 1200, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.6, tint: MOON } },
    { at: 1150, until: 1350, layer: 'top', drawer: 'impactFlash', params: { tint: MOON } },
    { at: 1050, until: 1400, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.4, tint: MOON_CYAN } },
    { at: 1150, until: 1500, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.42, tint: MOON } },
    { at: 1150, until: 1900, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: MOON_CYAN } },
  ],
  particles: [motes(1150, 12, { kind: 'twinkle', durationMs: 800 })],
  grain: 0.1,
});

const POOL = Object.freeze({ deep: '#0E0A14', body: '#2A1640', hot: '#6B2BD9', core: '#B56BFF' });
const GIRA = Object.freeze({ deep: '#0E0A14', body: '#6B2BD9', hot: '#B56BFF', core: '#FFFFFF' });
const GIRA_FLASH = Object.freeze({ deep: '#6B2BD9', body: '#5FF2FF', hot: '#FFFFFF', core: '#FFFFFF' });

// Giratina: it sinks into a dark shadow pool spreading over the floor, then dives from the
// upper left into the defender with a cyan-white burst and violet shards.
export const shadowForce = Object.freeze({
  id: 'shadow-force',
  name: 'Shadow Force',
  vgType: 'ghost',
  statClass: 'physical',
  tier: 'S',
  family: 'dash',
  material: 'ghost',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.8,
  attacker: { motion: 'dash', params: { wind: 0.3, reach: 1.0, overshoot: 0.1, arc: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.5 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.7, tint: GIRA } },
    { at: 0, until: 900, layer: 'back', drawer: 'shade', params: { target: 'attacker', kind: 'disc', r: 1.2, fill: 'deep', fillAlpha: 0.95, rimAlpha: 0.8, swirl: 40, tint: POOL } },
    { at: 0, until: 800, layer: 'back', drawer: 'cloud', params: { target: 'attacker', count: 8, drift: 0.3, alpha: 0.6, tint: POOL } },
    { at: 300, until: 900, layer: 'back', drawer: 'terrain', params: { target: 'attacker', kind: 'crack', radius: 1.4, tint: GIRA } },
    { at: 700, until: 1300, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.55, tint: POOL } },
    { at: 1000, until: 1250, layer: 'top', drawer: 'slashArc', params: { sweep: 120, radius: 1.0, count: 2, gapDeg: 30, angle: 45, thick: 0.25, tint: GIRA } },
    { at: 1100, until: 1300, layer: 'top', drawer: 'impactFlash', params: { tint: GIRA_FLASH } },
    { at: 1100, until: 1500, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: GIRA } },
    { at: 1100, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.3, tint: GIRA_FLASH } },
  ],
  particles: [motes(1100, 12, { kind: 'shard', gravity: 0.3, durationMs: 800 })],
  grain: 0.15,
});

const TEAL = Object.freeze({ deep: '#1E6A5A', body: '#3FD0B0', hot: '#C0FFF0', core: '#FFFFFF' });
const THIEF_POOL = Object.freeze({ deep: '#0C0614', body: '#2E0B4A', hot: '#C98BFF', core: '#FFFFFF' });
const THIEF_FLAME = Object.freeze({ deep: '#2E0B4A', body: '#E040E8', hot: '#FFC0F8', core: '#FFFFFF' });
const GIANT = Object.freeze({ deep: '#0C0614', body: '#2E0B4A', hot: '#C98BFF', core: '#FFD23F' });
const STAR_WHITE = Object.freeze({ deep: '#C98BFF', body: '#FFFFFF', hot: '#FFFFFF', core: '#FFFFFF' });

// Marshadow: a teal copy dashes in and leaves a violet pool, then a tall shadow giant with two
// yellow eyes rises behind the defender and white stars strike it.
export const spectralThief = Object.freeze({
  id: 'spectral-thief',
  name: 'Spectral Thief',
  vgType: 'ghost',
  statClass: 'physical',
  tier: 'S',
  family: 'quake',
  material: 'ghost',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.9,
  attacker: { motion: 'dash', params: { wind: 0.2, reach: 0.8, overshoot: 0, arc: 0.2 } },
  defender: { motion: 'stagger', params: { hits: 2, strength: 0.4, gapMs: 180 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.7, tint: TEAL } },
    { at: 200, until: 900, layer: 'back', drawer: 'terrain', params: { target: 'attacker', kind: 'crack', radius: 1.4, tint: THIEF_POOL } },
    { at: 400, until: 1000, layer: 'back', drawer: 'cloud', params: { target: 'attacker', count: 6, drift: 0.3, alpha: 0.5, tint: THIEF_POOL } },
    { at: 500, until: 1800, layer: 'back', drawer: 'shade', params: { kind: 'giant', r: 1.0, fill: 'deep', fillAlpha: 0.95, rimAlpha: 0.7, swirl: 20, eyes: true, tint: GIANT } },
    { at: 800, until: 1100, layer: 'back', drawer: 'pillar', params: { target: 'attacker', from: 'below', height: 1.6, w: 0.5, tint: THIEF_FLAME } },
    { at: 1000, until: 1300, layer: 'back', drawer: 'cloud', params: { count: 8, drift: 0.3, alpha: 0.6, tint: THIEF_POOL } },
    { at: 1100, until: 1500, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.55, tint: THIEF_POOL } },
    { at: 1050, until: 1300, layer: 'top', drawer: 'impactFlash', params: { tint: STAR_WHITE } },
    { at: 1050, until: 1400, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 0.9, unit: 'spiked', tint: STAR_WHITE } },
    { at: 1100, until: 1600, layer: 'front', drawer: 'pillar', params: { from: 'above', height: 1.8, w: 0.6, tint: THIEF_FLAME } },
  ],
  particles: [motes(1050, 12, { kind: 'twinkle', durationMs: 800 })],
  grain: 0.15,
});

export const GHOST_SIGNATURE_SPECS = Object.freeze({
  'astral-barrage': astralBarrage,
  'moongeist-beam': moongeistBeam,
  'shadow-force': shadowForce,
  'spectral-thief': spectralThief,
});
