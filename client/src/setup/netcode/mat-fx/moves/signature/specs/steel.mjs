// Design 065 slice 12: the Steel signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Steel);
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

const CROWN = Object.freeze({ deep: '#A8301A', body: '#FF5A2E', hot: '#FFB13B', core: '#FFF27A' });
const BLAST = Object.freeze({ deep: '#FFB13B', body: '#FFF27A', hot: '#FFFFFF', core: '#FFFFFF' });
const AMBER = Object.freeze({ deep: '#A8501A', body: '#FFB13B', hot: '#FFD98A', core: '#FFFFFF' });
const FLECK = Object.freeze({ deep: '#1E8AA8', body: '#3FE0FF', hot: '#C8F8FF', core: '#FFFFFF' });

// Zamazenta: a crown-shield of orange-red blades fans from its back, it charges down the lane
// and smashes into the defender in a yellow-white explosion with cyan flecks.
export const behemothBash = Object.freeze({
  id: 'behemoth-bash',
  name: 'Behemoth Bash',
  vgType: 'steel',
  statClass: 'physical',
  tier: 'S',
  family: 'punch',
  material: 'steel',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'lunge', params: { wind: 0.4, glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.6 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: CROWN } },
    { at: 0, until: 950, layer: 'front', drawer: 'fan', params: { count: 6, spread: 120, direction: 180, lenMin: 0.4, lenMax: 1.0, width: 0.26, spin: 30, tint: CROWN } },
    { at: 0, until: 400, layer: 'back', drawer: 'orbitCharge', params: { count: 6, half: 'back', r0: 0.18, r1: 0.26, tongues: 2, tint: CROWN } },
    { at: 300, until: 700, layer: 'back', drawer: 'shockRings', params: { count: 2, delay: 0.3, tint: AMBER } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: BLAST } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: BLAST } },
    { at: 1000, until: 1200, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: BLAST } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 1.1, tint: CROWN } },
    { at: 1000, until: 1400, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.1, tint: BLAST } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'pillar', params: { from: 'below', height: 1.8, w: 0.7, tint: BLAST } },
    { at: 1000, until: 2000, layer: 'back', drawer: 'cloud', params: { count: 8, radius: 0.35, drift: 0.6, alpha: 0.5, tint: AMBER } },
    { at: 1400, until: 2200, layer: 'back', drawer: 'aura', params: { target: 'defender', hz: 3, alpha: 0.5, tint: { body: '#FF7A2E', hot: '#FFB13B' } } },
  ],
  particles: [motes(1000, 14, { kind: 'streak', aspect: 0.4, distance: 1.3, durationMs: 600 })],
  grain: 0.1,
});

const SWORD = Object.freeze({ deep: '#C8A84A', body: '#FFF4C2', hot: '#FFFFFF', core: '#FFFFFF' });
const WING = Object.freeze({ deep: '#2F8CFF', body: '#7FD8FF', hot: '#E0F6FF', core: '#FFFFFF' });
const VIOLET = Object.freeze({ deep: '#5A2AA8', body: '#B26BFF', hot: '#5BE0FF', core: '#FFFFFF' });
const BLADE_BURST = Object.freeze({ deep: '#C86A1E', body: '#FFB13B', hot: '#FFD04A', core: '#FFFFFF' });

// Zacian: it holds a white-gold sword out down the lane, leaps in a violet light-storm and ends
// in a yellow-orange blade explosion on the defender.
export const behemothBlade = Object.freeze({
  id: 'behemoth-blade',
  name: 'Behemoth Blade',
  vgType: 'steel',
  statClass: 'physical',
  tier: 'S',
  family: 'punch',
  material: 'steel',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'lunge', params: { wind: 0.4, glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.5 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'aura', params: { hz: 3, alpha: 0.6, tint: WING } },
    { at: 0, until: 600, layer: 'front', drawer: 'orbitCharge', params: { count: 6, half: 'front', r0: 0.2, r1: 0.3, tongues: 2, tint: WING } },
    { at: 300, until: 1000, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.3, growIn: 0.3, retract: 0.15, tint: SWORD } },
    { at: 400, until: 1000, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.45, tint: WING } },
    { at: 600, until: 1000, layer: 'back', drawer: 'shockRings', params: { count: 2, delay: 0.3, tint: WING } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: VIOLET } },
    { at: 1000, until: 1300, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: VIOLET } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: VIOLET } },
    { at: 1000, until: 1400, layer: 'back', drawer: 'beam', params: { kind: 'solid', w: 0.4, tint: VIOLET } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: { deep: '#5BE0FF', body: '#FF7AD9', hot: '#FFFFFF', core: '#FFFFFF' } } },
    { at: 1100, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.3, tint: { body: '#5BE0FF', hot: '#E0FAFF' } } },
    { at: 1300, until: 1500, layer: 'top', drawer: 'impactFlash', params: { r0: 0.5, r1: 1.1 } },
    { at: 1300, until: 1800, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.8, w: 0.7, tint: BLADE_BURST } },
    { at: 1300, until: 2000, layer: 'back', drawer: 'cloud', params: { count: 8, radius: 0.4, drift: 0.4, alpha: 0.5, tint: BLADE_BURST } },
    { at: 1400, until: 2200, layer: 'back', drawer: 'aura', params: { target: 'defender', hz: 3, alpha: 0.5, tint: { body: '#FF9A2E', hot: '#FFD04A' } } },
  ],
  particles: [motes(1000, 12, { kind: 'streak', aspect: 0.4, distance: 1.3, durationMs: 600 }), motes(1300, 10, { kind: 'ember', gravity: 0.3, durationMs: 700 })],
  grain: 0.1,
});

const STAR = Object.freeze({ deep: '#C8A01E', body: '#FFE066', hot: '#FFF8D0', core: '#FFFFFF' });
const MAGENTA = Object.freeze({ deep: '#8A1048', body: '#FF2E88', hot: '#FFC0E0', core: '#FFFFFF' });
const ORB_CYAN = Object.freeze({ deep: '#1E8AA8', body: '#5BE0FF', hot: '#E0FAFF', core: '#FFFFFF' });
const GLINT = Object.freeze({ deep: '#5A2AA8', body: '#B26BFF', hot: '#E8D8FF', core: '#FFFFFF' });

// Jirachi: a gold star-flare charges on the attacker, then a field of magenta light columns
// falls from above onto the defender with cyan ground orbs and a cyan-white wave.
export const doomDesire = Object.freeze({
  id: 'doom-desire',
  name: 'Doom Desire',
  vgType: 'steel',
  statClass: 'special',
  tier: 'S',
  family: 'quake',
  material: 'steel',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 500, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, rings: 1, tint: STAR } },
    { at: 0, until: 550, layer: 'front', drawer: 'starFlare', params: { target: 'attacker', arms: 'cross', width: 0.3, tint: STAR } },
    { at: 300, until: 700, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.3, r1: 0.8, tint: ORB_CYAN } },
    { at: 400, until: 1000, layer: 'front', drawer: 'orbitCharge', params: { count: 6, half: 'front', r0: 0.2, r1: 0.3, tongues: 0, unit: 'spiked', tint: GLINT } },
    { at: 700, until: 1000, layer: 'front', drawer: 'pillar', params: { from: 'above', height: 1.8, w: 0.6, tint: MAGENTA } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: MAGENTA } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: STAR } },
    { at: 1000, until: 1300, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: MAGENTA } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'pillar', params: { from: 'above', height: 1.8, w: 0.4, count: 3, spread: 0.9, stagger: 100, tint: MAGENTA } },
    { at: 1300, until: 1800, layer: 'back', drawer: 'pillar', params: { from: 'below', height: 1.6, w: 0.7, tint: ORB_CYAN } },
    { at: 1300, until: 1800, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: ORB_CYAN } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.2, tint: ORB_CYAN } },
    { at: 1000, until: 2000, layer: 'back', drawer: 'cloud', params: { count: 8, radius: 0.4, drift: 0.4, alpha: 0.5, tint: GLINT } },
  ],
  particles: [motes(1000, 10, { kind: 'twinkle', durationMs: 700 }), motes(1300, 10, { durationMs: 700 })],
  grain: 0.1,
});

const STEEL = Object.freeze({ deep: '#5A6678', body: '#9AA7B8', hot: '#D5DEEA', core: '#FFFFFF' });
const SPARK = Object.freeze({ deep: '#C86A1E', body: '#FFB347', hot: '#FFE8C0', core: '#FFFFFF' });
const SAND = Object.freeze({ deep: '#8A7A50', body: '#E8D7A8', hot: '#F8F0DA', core: '#FFFFFF' });

// Melmetal: two hex-plated steel fists punch the defender one after the other, each landing with
// sparks, the second with a sand puff and a white ground shockwave ring.
export const doubleIronBash = Object.freeze({
  id: 'double-iron-bash',
  name: 'Double Iron Bash',
  vgType: 'steel',
  statClass: 'physical',
  tier: 'S',
  family: 'punch',
  material: 'steel',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'lunge', params: { wind: 0.4, strikes: 2, glow: 0.4 } },
  defender: { motion: 'stagger', params: { hits: 2, gapMs: 250, strength: 0.45, lead: 500 } },
  beats: [
    { at: 0, until: 400, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.4, tint: STEEL } },
    { at: 0, until: 500, layer: 'front', drawer: 'orbitCharge', params: { count: 2, half: 'both', r0: 0.16, r1: 0.24, tongues: 0, unit: 'fist', tint: STEEL } },
    { at: 500, until: 680, layer: 'top', drawer: 'impactFlash', params: { r0: 0.4, r1: 1.0 } },
    { at: 500, until: 700, layer: 'back', drawer: 'speedRays', params: { count: 10, tint: SPARK } },
    { at: 500, until: 900, layer: 'front', drawer: 'shards', params: { count: 4, arc: 90, distance: 0.6, unit: 'hex', tint: STEEL } },
    { at: 1000, until: 1200, layer: 'top', drawer: 'impactFlash', params: {} },
    { at: 1000, until: 1300, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.4, tint: STEEL } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.3, tint: { body: '#FFFFFF', hot: '#FFFFFF', deep: '#D5DEEA' } } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: SPARK } },
    { at: 1000, until: 1700, layer: 'back', drawer: 'smoke', params: { count: 6, tint: SAND } },
  ],
  particles: [motes(1000, 14, { kind: 'streak', aspect: 0.4, distance: 1.2, durationMs: 600 })],
  grain: 0.1,
});

const SUN = Object.freeze({ deep: '#FF8A1F', body: '#FFD23F', hot: '#FFF3A0', core: '#FFFFFF' });
const HALO = Object.freeze({ deep: '#C8901E', body: '#FFD23F', hot: '#FFF3A0', core: '#FFFFFF' });

// Solgaleo: it leaps high, builds a spiked gold sun at its chest that flies down the lane with
// rainbow streaks, and bursts into a yellow-white starburst with rings on the defender.
export const sunsteelStrike = Object.freeze({
  id: 'sunsteel-strike',
  name: 'Sunsteel Strike',
  vgType: 'steel',
  statClass: 'physical',
  tier: 'S',
  family: 'burst',
  material: 'steel',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.6 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: SUN } },
    { at: 0, until: 700, layer: 'back', drawer: 'orbitCharge', params: { count: 5, half: 'back', r0: 0.18, r1: 0.3, tongues: 2, tint: SUN } },
    { at: 300, until: 650, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.2, r1: 0.55, tint: SUN } },
    { at: 300, until: 900, layer: 'back', drawer: 'shockRings', params: { count: 2, delay: 0.3, tint: HALO } },
    { at: 600, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.5, r1: 0.7, tongues: 6, ease: 'linear', unit: 'spiked', tint: SUN } },
    { at: 700, until: 1000, layer: 'back', drawer: 'beam', params: { kind: 'solid', w: 0.3, tint: { deep: '#3A8A2E', body: '#7EE06A', hot: '#D0FFC0' } } },
    { at: 750, until: 1050, layer: 'back', drawer: 'beam', params: { kind: 'solid', w: 0.2, tint: { deep: '#8A1A4A', body: '#E0338A', hot: '#FFC0E0' } } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: SUN } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: SUN } },
    { at: 1000, until: 1200, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: { deep: '#FF8A1F', body: '#3FE0FF', hot: '#E0FAFF' } } },
    { at: 1000, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 3, r0: 0.3, r1: 1.4, tint: SUN } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: SUN } },
    { at: 1100, until: 1800, layer: 'back', drawer: 'cloud', params: { count: 6, radius: 0.4, drift: 0.4, alpha: 0.5, tint: { body: '#FFB347', hot: '#FFE0A0' } } },
  ],
  particles: [motes(1000, 14, { kind: 'ember', gravity: 0.3, distance: 1.3, durationMs: 700 })],
  grain: 0.1,
});

const HORN = Object.freeze({ deep: '#2AB6E6', body: '#3FE0FF', hot: '#E9FFFF', core: '#FFFFFF' });
const BLADE = Object.freeze({ deep: '#2AB6E6', body: '#7FE9FF', hot: '#E9FFFF', core: '#FFFFFF' });

// Iron Crown: it rears and lights its cyan horn-blades, throws three bent cyan blades down the
// lane, and they strike the defender in a starburst of cyan and orange rays.
export const tachyonCutter = Object.freeze({
  id: 'tachyon-cutter',
  name: 'Tachyon Cutter',
  vgType: 'steel',
  statClass: 'special',
  tier: 'S',
  family: 'slash',
  material: 'steel',
  durationMs: 2000,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, glow: 0.7 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.3 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: HORN } },
    { at: 400, until: 1000, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 90, r0: 0.26, r1: 0.34, bow: 0.3, tongues: 2, unit: 'crescent', tint: BLADE } },
    { at: 1000, until: 1200, layer: 'top', drawer: 'impactFlash', params: {} },
    { at: 1000, until: 1300, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: { deep: '#FFA94D', body: '#3FE0FF', hot: '#FFE0C0' } } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'slashArc', params: { sweep: 120, radius: 0.9, count: 2, gapDeg: 30, angle: 45, thick: 0.2, tint: BLADE } },
    { at: 1000, until: 1400, layer: 'back', drawer: 'shards', params: { count: 6, arc: 150, distance: 0.9, tint: BLADE } },
  ],
  particles: [motes(1000, 12, { kind: 'streak', aspect: 0.4, distance: 1.2, durationMs: 600 })],
  grain: 0.1,
});

export const STEEL_SIGNATURE_SPECS = Object.freeze({
  'behemoth-bash': behemothBash,
  'behemoth-blade': behemothBlade,
  'doom-desire': doomDesire,
  'double-iron-bash': doubleIronBash,
  'sunsteel-strike': sunsteelStrike,
  'tachyon-cutter': tachyonCutter,
});
