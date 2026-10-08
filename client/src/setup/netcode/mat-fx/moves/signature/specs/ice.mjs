// Design 065 slice 6: the Ice signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Ice);
// departures from an entry are listed under the design's Deviations (slice 6).

/** Five spikes 72° apart: "starFlare arms 'ring'" inside the 30-tongue budget (slice 5). */
const RING5 = Object.freeze([-90, -18, 54, 126, 198].map((angle) => Object.freeze({ angle, reach: 0.85 })));
/** The six-point crystal: arms at 0, 60 … 300°. */
const SIX = Object.freeze([0, 60, 120, 180, 240, 300].map((angle) => Object.freeze({ angle, reach: 1 })));

const FROST = Object.freeze({ deep: '#2E7FD8', body: '#7FC8F2', hot: '#A8EEFF', core: '#FFFFFF' });
const MIST = Object.freeze({ deep: '#8FA8BC', body: '#C8E6F5', hot: '#EEF8FF', core: '#FFFFFF' });

// Kyurem-Black: a frosted sphere built at the chest flies down the lane and bursts into a
// six-point crystal that encases the defender.
export const freezeShock = Object.freeze({
  id: 'freeze-shock',
  name: 'Freeze Shock',
  vgType: 'ice',
  statClass: 'physical',
  tier: 'S',
  family: 'wind',
  material: 'ice',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'freeze', params: { heat: 0.8 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: { body: '#36D6F0', hot: '#FFE35A' } } },
    { at: 0, until: 600, layer: 'back', drawer: 'orbitCharge', params: { count: 5, half: 'back' } },
    { at: 0, until: 600, layer: 'front', drawer: 'orbitCharge', params: { count: 5, half: 'front' } },
    { at: 300, until: 800, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.56, tint: FROST } },
    { at: 600, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.4, r1: 0.6, tongues: 4, unit: 'facet', tint: FROST } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
    { at: 1000, until: 1500, layer: 'front', drawer: 'starFlare', params: { arms: SIX, width: 0.46, breakAt: 0.75, tint: FROST } },
    { at: 1000, until: 1200, layer: 'back', drawer: 'speedRays', params: { count: 16 } },
    { at: 1000, until: 1800, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.35, drift: 0.6, alpha: 0.5, tint: MIST } },
    { at: 1500, until: 2000, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1 } },
    { at: 1200, until: 1800, layer: 'front', drawer: 'smoke', params: { count: 6 } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 16, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.8, gravity: 0.3, maxDelay: 0.12, durationMs: 800, kind: 'flake' },
  ],
  grain: 0.2,
});

const LANCE = Object.freeze({ deep: '#2F7FD6', body: '#6FD3FF', hot: '#CFF3FF', core: '#FFFFFF' });

// Calyrex-Ice: a crystal lance spikes from the rider's flank and lunges into the defender;
// ice spires behind it, a shard burst across its space.
export const glacialLance = Object.freeze({
  id: 'glacial-lance',
  name: 'Glacial Lance',
  vgType: 'ice',
  statClass: 'physical',
  tier: 'S',
  family: 'dash',
  material: 'ice',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'dash', params: { wind: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.5 } },
  beats: [
    { at: 0, until: 300, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6 } },
    { at: 0, until: 300, layer: 'front', drawer: 'orbitCharge', params: { count: 4, half: 'front' } },
    { at: 0, until: 450, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.4, tint: LANCE } },
    { at: 400, until: 1000, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.3, tint: LANCE } },
    { at: 1320, until: 2100, layer: 'back', drawer: 'pillar', params: { from: 'below', height: 2.0, w: 0.4, count: 2, spread: 1.2, stagger: 80, tint: LANCE } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
    { at: 1000, until: 1300, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: LANCE } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1 } },
    { at: 1000, until: 1200, layer: 'back', drawer: 'speedRays', params: { count: 16 } },
    { at: 1000, until: 1400, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.1 } },
    { at: 1200, until: 1800, layer: 'front', drawer: 'cloud', params: { count: 8, radius: 0.35, drift: 0.6, alpha: 0.5, tint: MIST } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 16, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.6, gravity: 0.5, maxDelay: 0.1, durationMs: 760, kind: 'shard' },
  ],
  grain: 0.2,
});

// Kyurem: a ground slam rolls an ice field to the defender; a crystal column rises under it
// and shatters into shards and haze; a violet speed-drop glow.
export const glaciate = Object.freeze({
  id: 'glaciate',
  name: 'Glaciate',
  vgType: 'ice',
  statClass: 'special',
  tier: 'S',
  family: 'quake',
  material: 'ice',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'stomp', params: {} },
  defender: { motion: 'freeze', params: { heat: 0.8 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6 } },
    { at: 0, until: 500, layer: 'back', drawer: 'orbitCharge', params: { count: 5, half: 'back' } },
    { at: 300, until: 700, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5 } },
    { at: 500, until: 1300, layer: 'back', drawer: 'terrain', params: { kind: 'wave', radius: 1.4 } },
    { at: 800, until: 1400, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.6, w: 0.9 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
    { at: 1000, until: 1400, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.3 } },
    { at: 1200, until: 1800, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1 } },
    { at: 1200, until: 1800, layer: 'front', drawer: 'cloud', params: { count: 8, radius: 0.35, drift: 0.6, alpha: 0.5, tint: MIST } },
    { at: 1500, until: 2000, layer: 'back', drawer: 'aura', params: { target: 'defender', hz: 2, alpha: 0.4, tint: { deep: '#3A2A9E', body: '#7C5CFF', hot: '#B9A8FF' } } },
  ],
  particles: [
    { at: 1200, anchor: 'defender', count: 16, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.6, gravity: 0.5, maxDelay: 0.1, durationMs: 760, kind: 'shard' },
  ],
  grain: 0.2,
});

const CAGE = Object.freeze({ deep: '#8A1028', body: '#FF3D5A', hot: '#FF8A9A', core: '#FFD0D8' });
const ICE_WHITE = Object.freeze({ deep: '#4FC3FF', body: '#CFF4FF', hot: '#FFFFFF', core: '#FFFFFF' });

// Kyurem-White: a red wire lattice on the attacker as it lunges, a white-cyan and orange burst
// on the defender that opens into a pale ice crystal flower.
export const iceBurn = Object.freeze({
  id: 'ice-burn',
  name: 'Ice Burn',
  vgType: 'ice',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'ice',
  durationMs: 2400,
  contactMs: 1100,
  pad: 1.9,
  attacker: { motion: 'lunge', params: { wind: 0.4, glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 1 } },
  beats: [
    { at: 0, until: 800, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: CAGE } },
    { at: 0, until: 1000, layer: 'front', drawer: 'glyph', params: { kind: 'lattice', target: 'attacker', r: 0.9, tint: CAGE } },
    { at: 0, until: 800, layer: 'back', drawer: 'orbitCharge', params: { count: 5, half: 'back' } },
    { at: 300, until: 1000, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, tint: ICE_WHITE } },
    { at: 800, until: 1100, layer: 'front', drawer: 'orbitCharge', params: { count: 6, half: 'front', r0: 0.2, r1: 0.3 } },
    { at: 1100, until: 1280, layer: 'top', drawer: 'impactFlash', params: {} },
    { at: 1100, until: 1400, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: { deep: '#FF3D5A', body: '#FF9A2E', hot: '#FFE0A8', core: '#FFFFFF' } } },
    { at: 1100, until: 1300, layer: 'back', drawer: 'speedRays', params: { count: 16 } },
    { at: 1100, until: 1500, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1 } },
    { at: 1100, until: 1500, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.1 } },
    { at: 1500, until: 2300, layer: 'front', drawer: 'starFlare', params: { arms: SIX, width: 0.32, breakAt: 0.6, tint: ICE_WHITE } },
    { at: 1300, until: 2300, layer: 'front', drawer: 'cloud', params: { count: 8, radius: 0.35, drift: 0.6, alpha: 0.5, tint: MIST } },
  ],
  particles: [
    { at: 1100, anchor: 'defender', count: 16, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.8, gravity: 0.3, maxDelay: 0.12, durationMs: 800, kind: 'flake' },
  ],
  grain: 0.2,
});

export const ICE_SIGNATURE_SPECS = Object.freeze({
  'freeze-shock': freezeShock,
  'glacial-lance': glacialLance,
  glaciate,
  'ice-burn': iceBurn,
});
