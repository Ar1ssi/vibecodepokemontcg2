// Design 065 slice 6: the Ice signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Ice);
// departures from an entry are listed under the design's Deviations (slice 6).
//
// Design 075 style pass (slice 10): no orbiting crystals, speed rays, aura rings or table rings —
// each move winds up with its own shape forming (the frosted sphere, the lance, the lattice); Glacial
// Lance flies a crystal lance instead of a solid beam (its white core read as a slab). Contact
// dressing is a small flash and fewer splinters, puffs and flakes, and the frost sheen stays
// faint (heat <= 0.35).

/** Five spikes 72° apart: "starFlare arms 'ring'" inside the 30-tongue budget (slice 5). */
const RING5 = Object.freeze([-90, -18, 54, 126, 198].map((angle) => Object.freeze({ angle, reach: 0.85 })));
/** The six-point crystal: arms at 0, 60 … 300°. */
const SIX = Object.freeze([0, 60, 120, 180, 240, 300].map((angle) => Object.freeze({ angle, reach: 1 })));

const FROST = Object.freeze({ deep: '#2E7FD8', body: '#7FC8F2', hot: '#A8EEFF', core: '#FFFFFF' });
const MIST = Object.freeze({ deep: '#8FA8BC', body: '#C8E6F5', hot: '#EEF8FF', core: '#FFFFFF' });
/** The contact flash: small, so the move's own shape stays legible. */
const FLASH = Object.freeze({ r0: 0.2, r1: 0.5 });

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
  defender: { motion: 'freeze', params: { heat: 0.35 } },
  tint: FROST,
  beats: [
    { at: 100, until: 800, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.14, r1: 0.44, from: 0.15, tint: FROST } },
    { at: 600, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.36, r1: 0.48, tongues: 4, unit: 'facet', tint: FROST } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: FLASH },
    { at: 1000, until: 1500, layer: 'front', drawer: 'starFlare', params: { arms: SIX, width: 0.22, core: 0.14, size: 0.6, breakAt: 0.6, tint: FROST } },
    { at: 1000, until: 1800, layer: 'front', drawer: 'cloud', params: { count: 4, radius: 0.35, drift: 0.6, alpha: 0.4, tint: MIST } },
    { at: 1500, until: 2000, layer: 'front', drawer: 'shards', params: { count: 5, arc: 360, distance: 1.1 } },
    { at: 1200, until: 1800, layer: 'front', drawer: 'smoke', params: { count: 3 } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 10, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.8, gravity: 0.3, maxDelay: 0.12, durationMs: 800, kind: 'flake' },
  ],
  grain: 0.2,
});

const LANCE = Object.freeze({ deep: '#2F7FD6', body: '#6FD3FF', hot: '#CFF3FF', core: '#FFFFFF' });

// Calyrex-Ice: a crystal lance forms at the rider's flank and flies into the defender, where it
// shatters (a cross flare there stacked to a white blob); ice spires rise behind it.
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
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.35 } },
  beats: [
    // The lance: a great crystal (head + two trailing crystals) forms at the flank as the rider
    // winds up and flies whole into the card, landing at contact.
    { at: 300, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.22, r1: 0.3, bow: 0, tongues: 2, tint: LANCE } },
    { at: 1320, until: 2100, layer: 'back', drawer: 'pillar', params: { from: 'below', height: 1.2, w: 0.4, count: 2, spread: 1.2, stagger: 80, tint: LANCE } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: FLASH },
    { at: 1000, until: 1300, layer: 'front', drawer: 'shards', params: { count: 5, arc: 360, distance: 1.1 } },
    { at: 1200, until: 1800, layer: 'front', drawer: 'cloud', params: { count: 5, radius: 0.35, drift: 0.6, alpha: 0.4, tint: MIST } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 10, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.6, gravity: 0.5, maxDelay: 0.1, durationMs: 760, kind: 'shard' },
  ],
  grain: 0.2,
});

// Kyurem: a ground slam; a crystal column rises under the defender and shatters into shards
// and haze.
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
  defender: { motion: 'freeze', params: { heat: 0.35 } },
  beats: [
    { at: 200, until: 700, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.14, r1: 0.4 } },
    { at: 800, until: 1400, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.2, w: 0.5 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: FLASH },
    { at: 1200, until: 1800, layer: 'front', drawer: 'shards', params: { count: 5, arc: 360, distance: 1.1 } },
    { at: 1200, until: 1800, layer: 'front', drawer: 'cloud', params: { count: 5, radius: 0.35, drift: 0.6, alpha: 0.4, tint: MIST } },
  ],
  particles: [
    { at: 1200, anchor: 'defender', count: 10, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.6, gravity: 0.5, maxDelay: 0.1, durationMs: 760, kind: 'shard' },
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
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.35 } },
  beats: [
    { at: 0, until: 1000, layer: 'front', drawer: 'glyph', params: { kind: 'lattice', target: 'attacker', r: 0.9, tint: CAGE } },
    { at: 300, until: 1000, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.14, r1: 0.38, tint: ICE_WHITE } },
    { at: 1100, until: 1280, layer: 'top', drawer: 'impactFlash', params: FLASH },
    { at: 1100, until: 1400, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.3, core: 0.22, size: 0.8, tint: { deep: '#FF3D5A', body: '#FF9A2E', hot: '#FFE0A8', core: '#FFFFFF' } } },
    { at: 1100, until: 1500, layer: 'front', drawer: 'shards', params: { count: 5, arc: 360, distance: 1.1 } },
    { at: 1500, until: 2300, layer: 'front', drawer: 'starFlare', params: { size: 0.6, arms: SIX, width: 0.32, breakAt: 0.6, tint: ICE_WHITE } },
    { at: 1300, until: 2300, layer: 'front', drawer: 'cloud', params: { count: 5, radius: 0.35, drift: 0.6, alpha: 0.4, tint: MIST } },
  ],
  particles: [
    { at: 1100, anchor: 'defender', count: 10, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.8, gravity: 0.3, maxDelay: 0.12, durationMs: 800, kind: 'flake' },
  ],
  grain: 0.2,
});

export const ICE_SIGNATURE_SPECS = Object.freeze({
  'freeze-shock': freezeShock,
  'glacial-lance': glacialLance,
  glaciate,
  'ice-burn': iceBurn,
});
