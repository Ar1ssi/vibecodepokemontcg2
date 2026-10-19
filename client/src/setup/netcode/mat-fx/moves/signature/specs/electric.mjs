// Design 065 slice 7: the Electric signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Electric);
// departures from an entry are listed under the design's Deviations (slice 7).
//
// Design 075 user pass (slice 11): no orbiting wisps, auras, spoke fans, shock rings, floor rings
// or speed rays; the wind-up is the attacker's motion and the move's own charge or arc forming.
// The bolt, hoop or column is what lands; the flash is small, the heat faint, the white column
// tints kept off pure white, and a cross flare arrives whole (`grow` short) and smaller.

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
/** The small contact flash the signatures keep (the TCG Live impact replaces it in a game). */
const flash = (at, tint) => ({ at, until: at + 150, layer: 'top', drawer: 'impactFlash', params: { r0: 0.2, r1: 0.6, ...(tint ? { tint } : {}) } });
/** A four-point flash that lands whole on the defender and breaks up late. */
const cross = (at, until, tint) => ({ at, until, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', size: 0.4, width: 0.3, core: 0.14, grow: 0.12, breakAt: 0.7, tint } });

// Zekrom: a cyan sphere charges at the chest and flies down the lane; a bolt drops from the
// sky onto the defender as it lands.
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
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.35 } },
  tint: CYAN,
  beats: [
    { at: 0, until: 620, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.14, r1: 0.4, from: 0.2, tint: CYAN } },
    { at: 620, until: 1100, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.3, r1: 0.4, tongues: 5, tint: CYAN } },
    flash(1100, CYAN),
    { at: 1100, until: 1600, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 9, jag: 0.12, branches: 2, width: 0.1, tint: CYAN } },
  ],
  particles: [sparks(1100, 8)],
});

const ARC = Object.freeze({ deep: '#2B2FB8', body: '#3FD9FF', hot: '#DFF9FF', core: '#FFFFFF' });
const VIOLET = Object.freeze({ deep: '#2B2FB8', body: '#6A4BFF', hot: '#B9A8FF', core: '#FFFFFF' });
const HOOP = Object.freeze({ deep: '#2B2FB8', body: '#FFD84A', hot: '#DFF9FF', core: '#FFFFFF' });

// Miraidon: a violet spinning dive throws a gold-rimmed electric hoop down the lane; a
// cyan column erupts under the defender.
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
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.35 } },
  tint: VIOLET,
  beats: [
    // The arc crackles off it through the spinning dive, then the hoop is thrown.
    { at: 0, until: 500, layer: 'front', drawer: 'bolt', params: { from: 'attacker', segments: 9, jag: 0.12, branches: 1, rerollMs: 45, width: 0.07, tint: ARC } },
    { at: 600, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.42, r1: 0.5, tongues: 3, ease: 'linear', unit: 'hoop', tint: HOOP } },
    { at: 760, until: 1000, layer: 'back', drawer: 'beam', params: { kind: 'solid', w: 0.3, tint: VIOLET } },
    flash(1000, ARC),
    // The column erupting under the defender is the payoff; a sky bolt on the same line summed
    // with it into one white slab.
    { at: 1000, until: 1500, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.2, w: 0.4, tint: ARC } },
  ],
  particles: [sparks(1000, 8)],
});

const ORB = Object.freeze({ deep: '#2C8CFF', body: '#3FD9FF', hot: '#E9FBFF', core: '#FFFFFF' });

// Zekrom (fused with Kyurem): a pale fused ghost behind the card, a ringed cyan orb at the
// chest released down the lane, a bolt dropping from the sky onto the defender as it lands.
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
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.35 } },
  tint: ORB,
  beats: [
    { at: 0, until: 700, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.14, r1: 0.36, from: 0.15, tint: ORB } },
    { at: 700, until: 1100, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.3, r1: 0.36, tongues: 4, tint: ORB } },
    // The column from the sky is the bolt itself: a white pillar and a lane bolt on the same line
    // as the orb summed into one white slab.
    { at: 1000, until: 1400, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 9, jag: 0.12, branches: 2, rerollMs: 45, width: 0.08, tint: ORB } },
    flash(1100),
    cross(1100, 1500, ORB),
  ],
  particles: [sparks(1100, 8)],
});

const PF = Object.freeze({ deep: '#2D6BFF', body: '#3FE6FF', hot: '#E9FBFF', core: '#FFFFFF' });
const CLOD = Object.freeze({ deep: '#8A7650', body: '#E9D3A0', hot: '#F5EAD0', core: '#FFFFFF' });

// Zeraora: a chest ball charges with an arc crackling off it, then it dives on a lightning
// column; the impact throws beige clods out of the cracked ground.
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
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.35 } },
  tint: PF,
  beats: [
    { at: 0, until: 700, layer: 'front', drawer: 'coreCharge', params: { lead: 0.2, r0: 0.14, r1: 0.38, from: 0.15, tint: PF } },
    { at: 300, until: 700, layer: 'front', drawer: 'bolt', params: { from: 'attacker', segments: 9, jag: 0.12, branches: 1, rerollMs: 45, width: 0.07, tint: PF } },
    // It dives on the lightning column: one bolt from the sky (a pillar on the same line summed
    // with it into a white slab).
    { at: 850, until: 1300, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 9, jag: 0.12, branches: 2, rerollMs: 45, width: 0.09, tint: PF } },
    flash(1100, PF),
    { at: 1100, until: 1700, layer: 'front', drawer: 'cloud', params: { count: 4, radius: 0.3, drift: 0.6, alpha: 0.45, tint: CLOD } },
    { at: 1100, until: 1400, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 1.0 } },
    { at: 1100, until: 1500, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.4 } },
  ],
  particles: [sparks(1100, 8)],
});

const ORB_Y = Object.freeze({ deep: '#FFB43A', body: '#F5EE4A', hot: '#FFF7B0', core: '#FFFFFF' });

// Regieleki: two yellow blades close over the defender, a yellow-white orb hangs high above
// it and drops a web of curved bolts, then a four-point flash on the caged defender.
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
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.35 } },
  beats: [
    { at: 0, until: 450, layer: 'front', drawer: 'slashArc', params: { target: 'defender', count: 2, sweep: 180, radius: 0.7, gapDeg: 30, angle: 45, thick: 0.16, tint: ORB_Y } },
    { at: 350, until: 1000, layer: 'front', drawer: 'coreCharge', params: { target: 'sky', lead: 0, r0: 0.16, r1: 0.34, tint: ORB_Y } },
    { at: 450, until: 1000, layer: 'front', drawer: 'bolt', params: { from: 'sky', count: 8, branches: 0, spread: 0.9, curve: 0.4, segments: 9, jag: 0.08, width: 0.04, tint: ORB_Y } },
    flash(1000),
    cross(1000, 1400, { ...ORB_Y, body: '#3FB5FF' }),
    { at: 1000, until: 1350, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 1.0 } },
  ],
  particles: [sparks(1000, 8)],
});

const CLAP = Object.freeze({ deep: '#2C7BFF', body: '#3FD8FF', hot: '#A9F2FF', core: '#FFFFFF' });

// Raging Bolt: the crest charges to a white-blue disc and fires one cyan bolt across the lane
// as a bolt drops from the sky onto the defender; a four-point flash lands whole on it.
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
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.35 } },
  beats: [
    { at: 0, until: 960, layer: 'front', drawer: 'coreCharge', params: { lead: 0.5, r0: 0.14, r1: 0.36, from: 0.2, tint: CLAP } },
    // Lightning is instant: the lane bolt fires as the charge lets go and strikes at contact.
    { at: 960, until: 1160, layer: 'front', drawer: 'bolt', params: { from: 'attacker', segments: 9, jag: 0.1, branches: 1, rerollMs: 45, width: 0.07, tint: CLAP } },
    flash(1000, CLAP),
    cross(1000, 1400, CLAP),
    // The sky bolt follows as the lane bolt fades, so the two never read as one white line.
    { at: 1060, until: 1360, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 9, jag: 0.12, branches: 2, rerollMs: 45, width: 0.08, tint: CLAP } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'shards', params: { count: 4, arc: 360, distance: 1.0 } },
  ],
  particles: [sparks(1000, 8)],
});

const TORNADO = Object.freeze({ deep: '#2B1D4D', body: '#7B5CD0', hot: '#B89CFF', core: '#F0E8FF' });
const GOLD = Object.freeze({ deep: '#B98A00', body: '#FFE066', hot: '#FFF4B8', core: '#FFFFFF' });
const HAZE = Object.freeze({ deep: '#5A577A', body: '#8E8AB0', hot: '#C2C0D8', core: '#FFFFFF' });

// Thundurus: grey haze, then a dark violet tornado screws up round the defender with golden
// streaks at its base; a blue-white and pink four-point flash opens it and gold bolts rain.
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
  defender: { motion: 'float', params: { lift: 0.15, heat: 0.3 } },
  beats: [
    { at: 200, until: 800, layer: 'back', drawer: 'cloud', params: { target: 'defender', count: 5, radius: 0.35, drift: 0.6, alpha: 0.45, tint: HAZE } },
    { at: 300, until: 1000, layer: 'front', drawer: 'spiral', params: { target: 'defender', turns: 2.5, r0: 0.2, r1: 1.1, rpm: 90, tongues: 12, tint: TORNADO } },
    { at: 400, until: 800, layer: 'front', drawer: 'beam', params: { kind: 'segmented', w: 0.26, tint: GOLD } },
    flash(1000, { body: '#BFE6FF', hot: '#FFFFFF' }),
    cross(1000, 1400, { deep: '#5B3FA0', body: '#FF8FD1', hot: '#BFE6FF', core: '#FFFFFF' }),
    { at: 1300, until: 1800, layer: 'front', drawer: 'rain', params: { count: 8, height: 1.6, spread: 0.9, tint: GOLD } },
  ],
  particles: [sparks(500, 8, { direction: -90, spread: 140, distance: 0.8, durationMs: 700 }), sparks(1000, 8)],
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
