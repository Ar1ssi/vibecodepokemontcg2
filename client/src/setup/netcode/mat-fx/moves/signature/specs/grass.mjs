// Design 065 slice 5: the Grass signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Grass);
// departures from an entry are listed under the design's Deviations (slice 5).

const IVY_CYAN = Object.freeze({ body: '#7FFFD4', hot: '#C6FFE3', core: '#FFFFFF' });

// Ogerpon: the club wrapped in a spinning ivy ball with pale-cyan rings slams down into a
// cyan-yellow shard burst and a ground ring. Material follows the mask (signatureMaterial).
export const ivyCudgel = Object.freeze({
  id: 'ivy-cudgel',
  name: 'Ivy Cudgel',
  vgType: 'grass',
  statClass: 'physical',
  tier: 'S',
  family: 'punch',
  material: 'grass',
  durationMs: 2000,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'lunge', params: { wind: 0.3, glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.5 } },
  beats: [
    { at: 0, until: 300, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.5 } },
    { at: 300, until: 800, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.4, r1: 0.8, target: 'attacker', tint: IVY_CYAN } },
    { at: 300, until: 1000, layer: 'back', drawer: 'orbitCharge', params: { count: 6, half: 'back', r0: 0.25, r1: 0.45 } },
    { at: 300, until: 1000, layer: 'front', drawer: 'orbitCharge', params: { count: 6, half: 'front', r0: 0.25, r1: 0.45 } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.4, tint: IVY_CYAN } },
    { at: 1300, until: 2000, layer: 'front', drawer: 'smoke', params: { count: 4 } },
    { at: 1000, until: 1600, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.0, hues: ['#7FFFD4', '#FFE14D'] } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.3, tint: { body: '#7FFFD4', hot: '#FFE14D', core: '#FFFFFF' } } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 18, distance: 1.1, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.6, gravity: 0.7, maxDelay: 0.1, durationMs: 760, kind: 'shard' },
  ],
});

const VORTEX = Object.freeze({ body: '#3FE8FF', hot: '#FFF8B0', core: '#FFFFFF' });
const BLADE = Object.freeze({ deep: '#7CFF5B', body: '#FFF8B0', hot: '#FFFFFF', core: '#FFFFFF' });

// Shaymin: a seed vortex round the attacker, three white crescent blades across the lane, a
// rainbow shard burst on the defender.
export const seedFlare = Object.freeze({
  id: 'seed-flare',
  name: 'Seed Flare',
  vgType: 'grass',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'grass',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'brace', params: { glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 400, layer: 'back', drawer: 'aura', params: { hz: 3, alpha: 0.5 } },
    { at: 0, until: 500, layer: 'back', drawer: 'orbitCharge', params: { count: 6, half: 'back', r0: 0.25, r1: 0.45, tongues: 3 } },
    { at: 0, until: 500, layer: 'front', drawer: 'orbitCharge', params: { count: 6, half: 'front', r0: 0.25, r1: 0.45, tongues: 3 } },
    { at: 0, until: 900, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 1.5, r0: 0.2, r1: 0.7, rpm: 120, tint: VORTEX } },
    { at: 500, until: 1000, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 90, r0: 0.26, r1: 0.34, bow: 0.3, unit: 'crescent', tint: BLADE } },
    { at: 1000, until: 2000, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
    { at: 1000, until: 1320, layer: 'back', drawer: 'speedRays', params: { count: 28, tint: { body: '#E9FF5E', hot: '#FFF8B0' } } },
    { at: 1400, until: 2200, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.5, tint: VORTEX } },
    { at: 1000, until: 1800, layer: 'front', drawer: 'slashArc', params: { sweep: 120, radius: 0.7, count: 2, gapDeg: 30, angle: 45, tint: BLADE } },
    { at: 1000, until: 1800, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.2, hues: ['#7CFF5B', '#E9FF5E', '#3FE8FF', '#FF4FD8'] } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.3, tint: { body: '#E9FF5E', hot: '#FFF8B0', core: '#FFFFFF' } } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 20, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.6, gravity: 0.5, maxDelay: 0.12, durationMs: 800, kind: 'shard' },
  ],
});

export const GRASS_SIGNATURE_SPECS = Object.freeze({
  'ivy-cudgel': ivyCudgel,
  'seed-flare': seedFlare,
});
