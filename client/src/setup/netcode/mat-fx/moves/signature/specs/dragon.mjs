// Design 065 slice 13: the Dragon signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Dragon);
// departures from an entry are listed under the design's Deviations (slice 13).

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

// Zygarde's palette (Core Enforcer's EB reference; Nihil Light borrows it, unverified).
const ZY_GREEN = Object.freeze({ deep: '#2E8A3C', body: '#B8FF8A', hot: '#F2E94A', core: '#FFFFFF' });
const ZY_CYAN = Object.freeze({ deep: '#1E8A9A', body: '#5FE6F5', hot: '#E0FFFF', core: '#FFFFFF' });
const ZY_WHITE = Object.freeze({ deep: '#B8FF8A', body: '#E8FFD8', hot: '#FFFFFF', core: '#FFFFFF' });
const ZY_YELLOW = Object.freeze({ deep: '#A89A1E', body: '#F2E94A', hot: '#FFF9C0', core: '#FFFFFF' });

// Zygarde: a white-green orb charges over it as it rises, then one Z-shaped green-white bolt
// zigzags down the lane into the defender behind a widening beam.
export const coreEnforcer = Object.freeze({
  id: 'core-enforcer',
  name: 'Core Enforcer',
  vgType: 'dragon',
  statClass: 'special',
  tier: 'S',
  family: 'roar',
  material: 'dragon',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.8,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 520, layer: 'front', drawer: 'coreCharge', params: { lead: 0, r0: 0.18, r1: 0.56, rings: 1, tint: ZY_WHITE } },
    { at: 0, until: 520, layer: 'front', drawer: 'orbitCharge', params: { count: 5, half: 'front', r0: 0.14, r1: 0.2, tongues: 3, tint: ZY_GREEN } },
    { at: 520, until: 900, layer: 'back', drawer: 'shockRings', params: { target: 'attacker', count: 2, tint: ZY_CYAN } },
    { at: 600, until: 1100, layer: 'back', drawer: 'beam', params: { kind: 'widening', w: 0.5, tint: ZY_GREEN } },
    { at: 800, until: 1500, layer: 'front', drawer: 'bolt', params: { from: 'attacker', segments: 3, jag: 0.3, branches: 0, rerollMs: 45, width: 0.18, tint: ZY_WHITE } },
    { at: 1000, until: 1200, layer: 'top', drawer: 'impactFlash', params: { tint: ZY_WHITE } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: ZY_YELLOW } },
    { at: 1100, until: 1600, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.3, tint: ZY_GREEN } },
  ],
  particles: [motes(1100, 12, { kind: 'streak', aspect: 0.4, durationMs: 700 })],
  grain: 0.1,
});

const MAGENTA = Object.freeze({ deep: '#C828C8', body: '#FF3CF0', hot: '#FFD2F5', core: '#FFFFFF' });
const LILAC = Object.freeze({ deep: '#7A3CC8', body: '#BE78FF', hot: '#FFD2F5', core: '#FFFFFF' });
const PINK_WHITE = Object.freeze({ deep: '#FF3CF0', body: '#FFD2F5', hot: '#FFFFFF', core: '#FFFFFF' });

// Regidrago: magenta orbs cluster round it and fire white-pink rays outward, then its white-lit
// head lunges down the lane into one white burst and a pink cloud.
export const dragonEnergy = Object.freeze({
  id: 'dragon-energy',
  name: 'Dragon Energy',
  vgType: 'dragon',
  statClass: 'special',
  tier: 'S',
  family: 'roar',
  material: 'dragon',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.8,
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.35, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: MAGENTA } },
    { at: 0, until: 600, layer: 'back', drawer: 'orbitCharge', params: { count: 6, half: 'back', r0: 0.14, r1: 0.2, tongues: 0, tint: MAGENTA } },
    { at: 0, until: 600, layer: 'front', drawer: 'orbitCharge', params: { count: 6, half: 'front', r0: 0.14, r1: 0.2, tongues: 0, tint: LILAC } },
    { at: 200, until: 700, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.45, rings: 1, tint: PINK_WHITE } },
    { at: 600, until: 1000, layer: 'front', drawer: 'fan', params: { target: 'attacker', count: 10, spread: 360, lenMin: 0.7, lenMax: 1.2, width: 0.1, grow: 0.3, tint: PINK_WHITE } },
    { at: 700, until: 1000, layer: 'back', drawer: 'speedRays', params: { count: 20, tint: MAGENTA } },
    { at: 1100, until: 1300, layer: 'top', drawer: 'impactFlash', params: { tint: PINK_WHITE } },
    { at: 1100, until: 1450, layer: 'front', drawer: 'starFlare', params: { arms: RING5, width: 0.4, tint: PINK_WHITE } },
    { at: 1150, until: 2100, layer: 'back', drawer: 'cloud', params: { count: 8, drift: 0.3, alpha: 0.5, tint: MAGENTA } },
  ],
  particles: [motes(1100, 12, { kind: 'twinkle', durationMs: 800 })],
  grain: 0.1,
});

const CANNON = Object.freeze({ deep: '#5A1FA6', body: '#FF2BD6', hot: '#FFC0F0', core: '#FFFFFF' });
const CANNON_RED = Object.freeze({ deep: '#5A1FA6', body: '#FF3B6B', hot: '#FFC0D0', core: '#FFFFFF' });
const LIGHTNING = Object.freeze({ deep: '#7FF7FF', body: '#E0FFFF', hot: '#FFFFFF', core: '#FFFFFF' });

// Eternatus: a magenta orb with rings and white lightning swells at its mouth, then one
// white-pink blast crosses the lane and bursts on the defender.
export const dynamaxCannon = Object.freeze({
  id: 'dynamax-cannon',
  name: 'Dynamax Cannon',
  vgType: 'dragon',
  statClass: 'special',
  tier: 'S',
  family: 'roar',
  material: 'dragon',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.8,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.6 } },
  beats: [
    { at: 0, until: 800, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, rings: 2, tint: CANNON } },
    { at: 300, until: 800, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: CANNON_RED } },
    { at: 500, until: 800, layer: 'back', drawer: 'shockRings', params: { target: 'attacker', count: 3, tint: CANNON } },
    { at: 700, until: 1100, layer: 'front', drawer: 'bolt', params: { from: 'attacker', segments: 5, jag: 0.12, branches: 2, rerollMs: 45, tint: LIGHTNING } },
    { at: 800, until: 1200, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.6, tint: CANNON } },
    { at: 1100, until: 1300, layer: 'top', drawer: 'impactFlash', params: { r1: 1.5, tint: CANNON } },
    { at: 1100, until: 1800, layer: 'back', drawer: 'cloud', params: { count: 8, drift: 0.3, alpha: 0.5, tint: CANNON } },
    { at: 1100, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.2, tint: CANNON } },
  ],
  particles: [motes(1100, 12, { kind: 'streak', aspect: 0.4, durationMs: 700 })],
  grain: 0.1,
});

const VORTEX = Object.freeze({ deep: '#6A1FD0', body: '#C81EFF', hot: '#FF2E7A', core: '#FFFFFF' });
const BLADE = Object.freeze({ deep: '#14101C', body: '#3A3446', hot: '#C8C8D8', core: '#FFFFFF' });
const PINK_BEAM = Object.freeze({ deep: '#C81EFF', body: '#FF2E7A', hot: '#FFC0D8', core: '#FFFFFF' });
const WHITE_CYAN = Object.freeze({ deep: '#5FD8FF', body: '#E0F8FF', hot: '#FFFFFF', core: '#FFFFFF' });

// Eternatus: a dark four-bladed star turns over a red-pink core inside a magenta vortex, then
// pink beams rain and a white column drives down onto the defender.
export const eternabeam = Object.freeze({
  id: 'eternabeam',
  name: 'Eternabeam',
  vgType: 'dragon',
  statClass: 'special',
  tier: 'S',
  family: 'quake',
  material: 'dragon',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.9,
  attacker: { motion: 'spin', params: { turns: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.6 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'spiral', params: { target: 'attacker', turns: 2.5, r0: 0.2, r1: 1.1, rpm: 90, tongues: 10, tint: VORTEX } },
    { at: 0, until: 900, layer: 'front', drawer: 'coreCharge', params: { lead: 0, r0: 0.14, r1: 0.3, tint: PINK_BEAM } },
    { at: 100, until: 900, layer: 'front', drawer: 'fan', params: { target: 'attacker', count: 4, spread: 360, lenMin: 0.9, lenMax: 1.2, width: 0.3, grow: 0.3, spin: 90, tint: BLADE } },
    { at: 700, until: 1100, layer: 'back', drawer: 'rain', params: { count: 6, height: 1.6, spread: 0.9, tint: PINK_BEAM } },
    { at: 850, until: 1400, layer: 'front', drawer: 'pillar', params: { from: 'above', height: 2.0, w: 0.5, tint: WHITE_CYAN } },
    { at: 1100, until: 1300, layer: 'top', drawer: 'impactFlash', params: { tint: PINK_BEAM } },
    { at: 1100, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.5, tint: VORTEX } },
    { at: 1100, until: 1500, layer: 'back', drawer: 'speedRays', params: { count: 28, tint: PINK_BEAM } },
    { at: 1300, until: 2000, layer: 'back', drawer: 'smoke', params: { count: 5, tint: VORTEX } },
  ],
  particles: [motes(1100, 14, { kind: 'shard', gravity: 0.3, durationMs: 800 })],
  grain: 0.15,
});

// Mega Zygarde (placeholder, from memory — no reference exists): a light lattice forms round
// it and releases into one beam with a zigzag bolt at the defender.
export const nihilLight = Object.freeze({
  id: 'nihil-light',
  name: 'Nihil Light',
  vgType: 'dragon',
  statClass: 'special',
  tier: 'S',
  family: 'electric',
  material: 'dragon',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.8,
  attacker: { motion: 'brace', params: { glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 700, layer: 'front', drawer: 'glyph', params: { target: 'attacker', kind: 'lattice', r: 1.0, tint: ZY_GREEN } },
    { at: 0, until: 520, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.56, rings: 1, tint: ZY_WHITE } },
    { at: 0, until: 520, layer: 'front', drawer: 'orbitCharge', params: { count: 5, half: 'front', r0: 0.14, r1: 0.2, tongues: 3, tint: ZY_GREEN } },
    { at: 520, until: 900, layer: 'back', drawer: 'shockRings', params: { target: 'attacker', count: 2, tint: ZY_CYAN } },
    { at: 600, until: 1100, layer: 'back', drawer: 'beam', params: { kind: 'solid', w: 0.5, tint: ZY_WHITE } },
    { at: 800, until: 1500, layer: 'front', drawer: 'bolt', params: { from: 'attacker', segments: 3, jag: 0.3, branches: 0, rerollMs: 45, width: 0.16, tint: ZY_GREEN } },
    { at: 1000, until: 1200, layer: 'top', drawer: 'impactFlash', params: { tint: ZY_WHITE } },
  ],
  particles: [motes(1100, 12, { kind: 'twinkle', durationMs: 700 })],
  grain: 0.1,
});

const TIME = Object.freeze({ deep: '#7A2BD6', body: '#E14CFF', hot: '#52E6FF', core: '#FFFFFF' });
const TIME_BEAM = Object.freeze({ deep: '#7A2BD6', body: '#52E6FF', hot: '#E0FAFF', core: '#FFFFFF' });
const SKY_BLUE = Object.freeze({ deep: '#14205C', body: '#2E4FE0', hot: '#52E6FF', core: '#FFFFFF' });
const HEX_BLUE = Object.freeze({ deep: '#1E2E8A', body: '#2E4FE0', hot: '#52E6FF', core: '#E0FAFF' });

// Dialga: a magenta-blue time orb charges over its head under a deep-blue aura, then one
// white-cyan, violet-edged beam widens down the lane and bursts into blue hexagon plates.
export const roarOfTime = Object.freeze({
  id: 'roar-of-time',
  name: 'Roar of Time',
  vgType: 'dragon',
  statClass: 'special',
  tier: 'S',
  family: 'roar',
  material: 'dragon',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.8,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 500, layer: 'front', drawer: 'orbitCharge', params: { count: 5, half: 'front', r0: 0.14, r1: 0.2, tongues: 3, tint: TIME } },
    { at: 0, until: 700, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, rings: 1, tint: TIME } },
    { at: 300, until: 900, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: SKY_BLUE } },
    { at: 700, until: 1200, layer: 'back', drawer: 'beam', params: { kind: 'widening', w: 0.8, tint: TIME_BEAM } },
    { at: 1000, until: 1200, layer: 'top', drawer: 'impactFlash', params: { tint: TIME_BEAM } },
    { at: 1000, until: 1350, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.42, tint: TIME_BEAM } },
    { at: 1050, until: 1650, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, unit: 'hex', tint: HEX_BLUE } },
    { at: 1100, until: 1600, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.5, tint: TIME_BEAM } },
  ],
  particles: [motes(1100, 12, { kind: 'shard', gravity: 0.3, durationMs: 800 })],
  grain: 0.1,
});

const RIFT_GOLD = Object.freeze({ deep: '#9A3CF0', body: '#FFC46B', hot: '#FF7FD9', core: '#FFFFFF' });
const RIFT_DARK = Object.freeze({ deep: '#14101C', body: '#2A1E3C', hot: '#5A3C80', core: '#9A3CF0' });
const RIFT_LINE = Object.freeze({ deep: '#8FF6FF', body: '#E8FFFF', hot: '#FFFFFF', core: '#FFFFFF' });
const RIFT_PINK = Object.freeze({ deep: '#9A3CF0', body: '#FF7FD9', hot: '#FFD0F0', core: '#FFFFFF' });
const GLASS = Object.freeze({ deep: '#5A1FA6', body: '#9A3CF0', hot: '#D8B8FF', core: '#FFFFFF' });

// Palkia: a gold-pink vortex spins round it while a dark rift smears behind the defender, then
// thin white rift lines cross the lane and a pink crescent slash shatters violet glass.
export const spacialRend = Object.freeze({
  id: 'spacial-rend',
  name: 'Spacial Rend',
  vgType: 'dragon',
  statClass: 'special',
  tier: 'S',
  family: 'roar',
  material: 'dragon',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.9,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'cloud', params: { count: 6, radius: 0.4, drift: 0.3, alpha: 0.6, tint: RIFT_DARK } },
    { at: 0, until: 1000, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 2.5, r0: 0.2, r1: 1.1, rpm: 180, tongues: 10, tint: RIFT_GOLD } },
    { at: 0, until: 1000, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.8, r0: 0.8, r1: 1.2, tint: RIFT_GOLD } },
    { at: 300, until: 1000, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.3, r1: 1.3, tint: RIFT_GOLD } },
    { at: 800, until: 1150, layer: 'front', drawer: 'beam', params: { kind: 'segmented', w: 0.5, tint: RIFT_LINE } },
    { at: 900, until: 1100, layer: 'back', drawer: 'cloud', params: { count: 8, radius: 0.3, drift: 0.3, alpha: 0.5, tint: RIFT_DARK } },
    { at: 950, until: 1350, layer: 'top', drawer: 'slashArc', params: { sweep: 120, radius: 1.1, count: 2, gapDeg: 30, thick: 0.3, tint: RIFT_PINK } },
    { at: 1100, until: 1250, layer: 'front', drawer: 'impactFlash', params: { r1: 1.0, tint: RIFT_PINK } },
    { at: 1100, until: 1600, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: GLASS } },
    { at: 1100, until: 1500, layer: 'back', drawer: 'speedRays', params: { count: 28, tint: RIFT_PINK } },
  ],
  particles: [motes(1100, 14, { kind: 'shard', gravity: 0.3, durationMs: 800 })],
  grain: 0.15,
});

export const DRAGON_SIGNATURE_SPECS = Object.freeze({
  'core-enforcer': coreEnforcer,
  'dragon-energy': dragonEnergy,
  'dynamax-cannon': dynamaxCannon,
  eternabeam,
  'nihil-light': nihilLight,
  'roar-of-time': roarOfTime,
  'spacial-rend': spacialRend,
});
