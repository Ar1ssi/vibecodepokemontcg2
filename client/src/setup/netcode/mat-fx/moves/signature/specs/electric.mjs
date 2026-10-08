// Design 065 slice 7: the Electric signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Electric);
// departures from an entry are listed under the design's Deviations (slice 7).

/** A CSS spark burst on the defender (thin streaks in the electric particle colour). */
const sparks = (at, count, over = {}) =>
  Object.freeze({
    at,
    anchor: 'defender',
    count,
    distance: 1.1,
    direction: -90,
    spread: 360,
    size: [0.04, 0.1],
    aspect: 0.2,
    gravity: 0,
    maxDelay: 0.12,
    durationMs: 650,
    kind: 'streak',
    ...over,
  });

const CYAN = Object.freeze({ deep: '#1A7FA8', body: '#3FE0FF', hot: '#C9F7FF', core: '#FFFFFF' });
const WISP = Object.freeze({ deep: '#0F2B33', body: '#1F4A4F', hot: '#3FE0FF', core: '#C9F7FF' });

// Zekrom: a cyan sphere wrapped in dark wisps at the chest flies down the lane; a bolt drops
// from the sky onto the defender inside local speed rays.
export const boltStrike = Object.freeze({
  id: 'bolt-strike',
  name: 'Bolt Strike',
  vgType: 'electric',
  statClass: 'physical',
  tier: 'S',
  family: 'electric',
  material: 'electric',
  durationMs: 2400,
  contactMs: 1100,
  pad: 1.9,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 1 } },
  beats: [
    { at: 0, until: 620, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.56, tint: CYAN } },
    { at: 0, until: 620, layer: 'back', drawer: 'orbitCharge', params: { count: 5, half: 'back', tint: WISP } },
    { at: 0, until: 620, layer: 'front', drawer: 'orbitCharge', params: { count: 5, half: 'front', tint: WISP } },
    { at: 560, until: 900, layer: 'back', drawer: 'shockRings', params: { count: 1, delay: 0.3, tint: CYAN } },
    { at: 620, until: 1100, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.3, r1: 0.5, tongues: 6, tint: CYAN } },
    { at: 1100, until: 1280, layer: 'top', drawer: 'impactFlash', params: { tint: CYAN } },
    { at: 1100, until: 1600, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 9, jag: 0.12, branches: 2, width: 0.16, tint: CYAN } },
    { at: 1130, until: 1350, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: CYAN } },
    { at: 1500, until: 1900, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: CYAN } },
  ],
  particles: [sparks(1100, 14)],
});

const ARC = Object.freeze({ deep: '#2B2FB8', body: '#3FD9FF', hot: '#DFF9FF', core: '#FFFFFF' });
const VIOLET = Object.freeze({ deep: '#2B2FB8', body: '#6A4BFF', hot: '#B9A8FF', core: '#FFFFFF' });
const HOOP = Object.freeze({ deep: '#2B2FB8', body: '#FFD84A', hot: '#DFF9FF', core: '#FFFFFF' });

// Miraidon: a violet spinning dive throws a gold-rimmed electric hoop down the lane; a
// white-cyan column erupts under the defender.
export const electroDrift = Object.freeze({
  id: 'electro-drift',
  name: 'Electro Drift',
  vgType: 'electric',
  statClass: 'special',
  tier: 'S',
  family: 'electric',
  material: 'electric',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'spin', params: { turns: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 1 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { hz: 3, alpha: 0.6, tint: VIOLET } },
    { at: 0, until: 500, layer: 'front', drawer: 'bolt', params: { from: 'attacker', segments: 9, jag: 0.12, branches: 2, rerollMs: 45, tint: ARC } },
    { at: 600, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.45, r1: 0.55, tongues: 3, ease: 'linear', unit: 'hoop', tint: HOOP } },
    { at: 760, until: 1000, layer: 'back', drawer: 'beam', params: { kind: 'solid', w: 0.4, tint: VIOLET } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: ARC } },
    { at: 1000, until: 1250, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: ARC } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.6, w: 0.6, tint: ARC } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 9, jag: 0.12, branches: 2, rerollMs: 45, tint: ARC } },
    { at: 1000, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.2, tint: { body: '#FFD84A', hot: '#FFF2B0' } } },
    { at: 1200, until: 1900, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: VIOLET } },
  ],
  particles: [sparks(1000, 14)],
});

const ORB = Object.freeze({ deep: '#2C8CFF', body: '#3FD9FF', hot: '#E9FBFF', core: '#FFFFFF' });

// Zekrom (fused with Kyurem): a pale fused ghost behind the card, a ringed cyan orb at the
// chest released down the lane, a white column dropping from the sky onto the defender.
export const fusionBolt = Object.freeze({
  id: 'fusion-bolt',
  name: 'Fusion Bolt',
  vgType: 'electric',
  statClass: 'physical',
  tier: 'S',
  family: 'electric',
  material: 'electric',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.9,
  attacker: { motion: 'brace', params: { glow: 1 }, echo: { alpha: 0.35, offset: 0.5, fadeMs: 400 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 1 } },
  beats: [
    { at: 0, until: 400, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: ORB } },
    { at: 0, until: 1000, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.56, rings: 1, tint: ORB } },
    { at: 400, until: 1000, layer: 'front', drawer: 'bolt', params: { from: 'attacker', segments: 9, jag: 0.12, branches: 2, rerollMs: 45, tint: ORB } },
    { at: 700, until: 1100, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.34, r1: 0.56, tongues: 4, tint: ORB } },
    { at: 700, until: 1400, layer: 'front', drawer: 'pillar', params: { from: 'above', height: 1.8, w: 0.6, tint: { deep: '#2C8CFF', body: '#E9FBFF', hot: '#FFFFFF', core: '#FFFFFF' } } },
    { at: 900, until: 1400, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 9, jag: 0.12, branches: 2, rerollMs: 45, tint: ORB } },
    { at: 1000, until: 1300, layer: 'back', drawer: 'shockRings', params: { count: 2, delay: 0.3, target: 'defender', tint: ORB } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: ORB } },
    { at: 1100, until: 1280, layer: 'top', drawer: 'impactFlash', params: {} },
    { at: 1100, until: 1300, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: ORB } },
    { at: 1100, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.3, tint: ORB } },
  ],
  particles: [sparks(1100, 14)],
});

const PF = Object.freeze({ deep: '#2D6BFF', body: '#3FE6FF', hot: '#E9FBFF', core: '#FFFFFF' });
const SPOKE = Object.freeze({ deep: '#B98A00', body: '#FFF27A', hot: '#FFFFFF', core: '#FFFFFF' });
const CLOD = Object.freeze({ deep: '#8A7650', body: '#E9D3A0', hot: '#F5EAD0', core: '#FFFFFF' });

// Zeraora: white-yellow spokes and a chest ball charge the card, then it dives on a lightning
// column; the impact throws beige clods out of a cyan-white blast.
export const plasmaFists = Object.freeze({
  id: 'plasma-fists',
  name: 'Plasma Fists',
  vgType: 'electric',
  statClass: 'physical',
  tier: 'S',
  family: 'electric',
  material: 'electric',
  durationMs: 2400,
  contactMs: 1100,
  pad: 1.9,
  attacker: { motion: 'lunge', params: { wind: 0.3, reach: 0.9, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 1 } },
  beats: [
    { at: 0, until: 700, layer: 'front', drawer: 'coreCharge', params: { lead: 0.2, r0: 0.18, r1: 0.5, tint: PF } },
    { at: 0, until: 700, layer: 'front', drawer: 'fan', params: { target: 'attacker', count: 12, spread: 360, lenMin: 0.6, lenMax: 1.1, width: 0.1, grow: 0.3, tint: SPOKE } },
    { at: 300, until: 700, layer: 'front', drawer: 'bolt', params: { from: 'attacker', segments: 9, jag: 0.12, branches: 2, rerollMs: 45, tint: PF } },
    { at: 700, until: 1000, layer: 'back', drawer: 'shockRings', params: { count: 2, delay: 0.3, tint: PF } },
    { at: 800, until: 1100, layer: 'front', drawer: 'pillar', params: { from: 'above', height: 1.8, w: 0.6, tint: PF } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 9, jag: 0.12, branches: 2, rerollMs: 45, tint: PF } },
    { at: 1100, until: 1280, layer: 'top', drawer: 'impactFlash', params: { tint: PF } },
    { at: 1100, until: 1500, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.6, w: 0.6, tint: PF } },
    { at: 1100, until: 1300, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: PF } },
    { at: 1100, until: 1700, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.35, drift: 0.6, alpha: 0.5, tint: CLOD } },
    { at: 1100, until: 1400, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1 } },
    { at: 1100, until: 1500, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.4 } },
  ],
  particles: [sparks(1100, 14)],
});

const ORB_Y = Object.freeze({ deep: '#FFB43A', body: '#F5EE4A', hot: '#FFF7B0', core: '#FFFFFF' });

// Regieleki: two yellow blades close over the defender, a yellow-white orb hangs high above
// it and drops a web of curved bolts, then a ground starburst.
export const thunderCage = Object.freeze({
  id: 'thunder-cage',
  name: 'Thunder Cage',
  vgType: 'electric',
  statClass: 'special',
  tier: 'S',
  family: 'electric',
  material: 'electric',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'brace', params: { glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 1 } },
  beats: [
    { at: 0, until: 450, layer: 'front', drawer: 'slashArc', params: { target: 'defender', count: 2, sweep: 180, radius: 0.7, gapDeg: 30, angle: 45, thick: 0.2, tint: ORB_Y } },
    { at: 350, until: 1000, layer: 'front', drawer: 'coreCharge', params: { target: 'sky', lead: 0, r0: 0.2, r1: 0.45, rings: 1, tint: ORB_Y } },
    { at: 450, until: 1000, layer: 'front', drawer: 'bolt', params: { from: 'sky', count: 10, branches: 0, spread: 0.9, curve: 0.4, segments: 9, jag: 0.08, width: 0.05, tint: ORB_Y } },
    { at: 900, until: 1100, layer: 'top', drawer: 'impactFlash', params: { target: 'defender', r0: 0.3, r1: 0.7, tint: ORB_Y } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
    { at: 1000, until: 1300, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: { ...ORB_Y, body: '#3FB5FF' } } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1 } },
    { at: 1000, until: 1200, layer: 'back', drawer: 'speedRays', params: { count: 16 } },
  ],
  particles: [sparks(1000, 14)],
});

const CLAP = Object.freeze({ deep: '#2C7BFF', body: '#3FD8FF', hot: '#A9F2FF', core: '#FFFFFF' });

// Raging Bolt: the crest charges to a white-blue disc and fires one cyan bolt across the lane;
// a four-point flash and a bolt from the sky on the defender.
export const thunderclap = Object.freeze({
  id: 'thunderclap',
  name: 'Thunderclap',
  vgType: 'electric',
  statClass: 'special',
  tier: 'S',
  family: 'electric',
  material: 'electric',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'brace', params: { glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 1 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { hz: 3, alpha: 0.6, tint: CLAP } },
    { at: 0, until: 700, layer: 'front', drawer: 'coreCharge', params: { lead: 0.5, r0: 0.2, r1: 0.5, rings: 1, tint: { ...CLAP, body: '#E8FBFF' } } },
    { at: 700, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.3, r1: 0.3, tongues: 3, ease: 'linear', tint: CLAP } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: CLAP } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: CLAP } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 1.1 } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 9, jag: 0.12, branches: 2, rerollMs: 45, tint: CLAP } },
    { at: 1000, until: 1200, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: CLAP } },
  ],
  particles: [sparks(1000, 14)],
});

const TORNADO = Object.freeze({ deep: '#2B1D4D', body: '#7B5CD0', hot: '#B89CFF', core: '#F0E8FF' });
const GOLD = Object.freeze({ deep: '#B98A00', body: '#FFE066', hot: '#FFF4B8', core: '#FFFFFF' });
const HAZE = Object.freeze({ deep: '#5A577A', body: '#8E8AB0', hot: '#C2C0D8', core: '#FFFFFF' });

// Thundurus: grey haze, then a dark violet tornado screws up round the defender with golden
// streaks at its base; crossing blue-white and pink light flashes it open.
export const wildboltStorm = Object.freeze({
  id: 'wildbolt-storm',
  name: 'Wildbolt Storm',
  vgType: 'electric',
  statClass: 'special',
  tier: 'S',
  family: 'electric',
  material: 'electric',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'float', params: { lift: 0.15, heat: 0.5 } },
  beats: [
    { at: 200, until: 800, layer: 'back', drawer: 'cloud', params: { target: 'defender', count: 8, radius: 0.35, drift: 0.6, alpha: 0.5, tint: HAZE } },
    { at: 300, until: 1000, layer: 'front', drawer: 'spiral', params: { target: 'defender', turns: 2.5, r0: 0.2, r1: 1.1, rpm: 90, tongues: 16, tint: TORNADO } },
    { at: 400, until: 800, layer: 'front', drawer: 'beam', params: { kind: 'segmented', w: 0.3, tint: GOLD } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: { body: '#BFE6FF', hot: '#FFFFFF' } } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: { deep: '#5B3FA0', body: '#FF8FD1', hot: '#BFE6FF', core: '#FFFFFF' } } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.4, tint: { deep: '#5B3FA0', body: '#BFE6FF', hot: '#FFFFFF', core: '#FFFFFF' } } },
    { at: 1000, until: 1200, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: GOLD } },
    { at: 1100, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.3, tint: GOLD } },
    { at: 1300, until: 1800, layer: 'front', drawer: 'rain', params: { count: 10, height: 1.6, spread: 0.9, tint: GOLD } },
  ],
  particles: [sparks(500, 14, { direction: -90, spread: 140, distance: 0.8, durationMs: 700 }), sparks(1000, 12)],
});

export const ELECTRIC_SIGNATURE_SPECS = Object.freeze({
  'bolt-strike': boltStrike,
  'electro-drift': electroDrift,
  'fusion-bolt': fusionBolt,
  'plasma-fists': plasmaFists,
  'thunder-cage': thunderCage,
  thunderclap,
  'wildbolt-storm': wildboltStorm,
});
