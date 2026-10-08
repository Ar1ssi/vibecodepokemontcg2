// Design 065 slice 5: the Fire signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Fire);
// departures from an entry are listed under the design's Deviations (slice 5).

/** Five spikes 72° apart: the entries' "starFlare arms 'ring'" inside the 30-tongue budget. */
const RING5 = Object.freeze([-90, -18, 54, 126, 198].map((angle) => Object.freeze({ angle, reach: 0.85 })));

const BLUE_FIRE = Object.freeze({ deep: '#0B1B6E', body: '#1E5BD6', hot: '#4FD8FF', core: '#E8FBFF' });

// Reshiram: a cyan-white beam from the mouth; a blue core ringed by magenta spikes; blue haze.
export const blueFlare = Object.freeze({
  id: 'blue-flare',
  name: 'Blue Flare',
  vgType: 'fire',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'fire',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 1 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: BLUE_FIRE } },
    { at: 0, until: 620, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.56, tint: BLUE_FIRE } },
    { at: 600, until: 1900, layer: 'front', drawer: 'beam', params: { kind: 'widening', w: 0.8, tint: BLUE_FIRE } },
    { at: 900, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45, tint: BLUE_FIRE } },
    { at: 1000, until: 1320, layer: 'back', drawer: 'speedRays', params: { count: 28, tint: BLUE_FIRE } },
    {
      at: 1000,
      until: 1500,
      layer: 'front',
      drawer: 'starFlare',
      params: { arms: RING5, tint: { deep: '#0B1B6E', body: '#E23DBF', hot: '#4FD8FF', core: '#E8FBFF' } },
    },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: BLUE_FIRE } },
    { at: 1300, until: 2200, layer: 'back', drawer: 'aura', params: { target: 'defender', hz: 2, alpha: 0.5, tint: BLUE_FIRE } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 22, distance: 1.3, direction: -90, spread: 300, size: [0.05, 0.12], aspect: 0.4, gravity: 0.5, maxDelay: 0.12, durationMs: 800, kind: 'flake' },
  ],
  grain: 0.24,
});

// Reshiram / Kyurem-White: a golden orb over the attacker drops onto the defender, which
// stands in one fire column with a flat ring at its base.
export const fusionFlare = Object.freeze({
  id: 'fusion-flare',
  name: 'Fusion Flare',
  vgType: 'fire',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'fire',
  durationMs: 2400,
  contactMs: 1000,
  pad: 2,
  attacker: { motion: 'rise', params: {}, echo: { alpha: 0.35, offset: 0.5, fadeMs: 500 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 1 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.5 } },
    {
      at: 0,
      until: 520,
      layer: 'front',
      drawer: 'coreCharge',
      params: { target: 'sky-attacker', r0: 0.3, r1: 0.75, rings: 2, tint: { body: '#FF9A1F', hot: '#FFE35A', core: '#FFF8DC' } },
    },
    {
      at: 500,
      until: 1000,
      layer: 'front',
      drawer: 'projectile',
      params: { path: 'arc', from: 'sky-attacker', ease: 'linear', bow: 0.6, r0: 0.5, r1: 0.8, tongues: 9, tint: { body: '#FF9A1F', hot: '#FFE35A', core: '#FFF8DC' } },
    },
    { at: 900, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
    { at: 900, until: 1800, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.5, tint: { body: '#FFE35A', hot: '#FFF8DC' } } },
    { at: 1000, until: 1900, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.8, w: 0.9 } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'starFlare', params: { arms: RING5 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
    { at: 1400, until: 2400, layer: 'front', drawer: 'smoke', params: { count: 6 } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 22, distance: 1.3, direction: -90, spread: 300, size: [0.05, 0.13], aspect: 0.3, gravity: 0.6, maxDelay: 0.12, durationMs: 760, kind: 'ember' },
  ],
  grain: 0.28,
});

// Heatran: a ground fire wave, three magma columns round the defender with rock mounds, and
// a golden spiral rising from the centre while the defender is lifted.
export const magmaStorm = Object.freeze({
  id: 'magma-storm',
  name: 'Magma Storm',
  vgType: 'fire',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'fire',
  durationMs: 2400,
  contactMs: 1000,
  pad: 2,
  attacker: { motion: 'brace', params: { glow: 0.6 } },
  defender: { motion: 'float', params: { lift: 0.15, heat: 1 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6 } },
    { at: 500, until: 1100, layer: 'front', drawer: 'beam', params: { kind: 'widening', w: 0.5 } },
    { at: 500, until: 2000, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.4 } },
    { at: 600, until: 1300, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.8, w: 0.6 } },
    { at: 650, until: 1300, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.5, w: 0.45, count: 2, spread: 1.4, stagger: 150 } },
    { at: 900, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
    {
      at: 800,
      until: 2100,
      layer: 'front',
      drawer: 'spiral',
      params: { turns: 2.5, r0: 0.2, r1: 1.1, rpm: 90, tongues: 8, tint: { body: '#FFB52E', hot: '#FFF2B8', core: '#FFFFFF' } },
    },
    { at: 1000, until: 1800, layer: 'front', drawer: 'splash', params: { count: 4, arc: 140, direction: -90, gravity: 0.5 } },
    { at: 1000, until: 2200, layer: 'front', drawer: 'shards', params: { mode: 'cluster', count: 6, distance: 0.5, tint: { deep: '#6B5548', body: '#C2301A' } } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 20, distance: 1.4, direction: -90, spread: 120, size: [0.05, 0.12], aspect: 0.3, gravity: 0.4, maxDelay: 0.2, durationMs: 900, kind: 'ember' },
  ],
  grain: 0.28,
});

const RAINBOW = Object.freeze(['#F050D0', '#4FE3FF', '#FFD84A', '#FF4A2A', '#3B7BFF']);
const MAGENTA = Object.freeze({ deep: '#3B7BFF', body: '#F050D0', hot: '#FF9BE6', core: '#FFFFFF' });

// Ho-Oh: a magenta-white orb at the chest streaks out with Ho-Oh's dash and bursts into a
// multicoloured flame fountain on the defender.
export const sacredFire = Object.freeze({
  id: 'sacred-fire',
  name: 'Sacred Fire',
  vgType: 'fire',
  statClass: 'physical',
  tier: 'S',
  family: 'dash',
  material: 'fire',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'dash', params: {} },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 1 } },
  beats: [
    { at: 0, until: 720, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, tint: MAGENTA } },
    { at: 400, until: 900, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.4, r1: 0.8, target: 'attacker', tint: { body: '#4FE3FF', hot: '#E6FFFF' } } },
    { at: 700, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.34, r1: 0.5, tongues: 9, tint: MAGENTA } },
    { at: 1000, until: 1900, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.3, w: 0.6, count: 3, spread: 1.0, stagger: 60, hues: RAINBOW } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: { body: '#FFD84A', hot: '#FFFFFF' } } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
    { at: 1900, until: 2200, layer: 'back', drawer: 'aura', params: { target: 'defender', hz: 3, alpha: 0.5, tint: MAGENTA } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 22, distance: 1.3, direction: -90, spread: 300, size: [0.05, 0.13], aspect: 0.3, gravity: 0.6, maxDelay: 0.12, durationMs: 760, kind: 'ember' },
  ],
  grain: 0.24,
});

const SEARING_PURPLE = Object.freeze({ deep: '#9A3BC8', body: '#E83A1E', hot: '#FF8A1F', core: '#FFE14D' });

// Victini: a flame column round Victini, a blast across the lane, then repeated pillars at
// the defender's feet.
export const searingShot = Object.freeze({
  id: 'searing-shot',
  name: 'Searing Shot',
  vgType: 'fire',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'fire',
  durationMs: 2400,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 1 } },
  beats: [
    { at: 0, until: 800, layer: 'back', drawer: 'aura', params: { hz: 3, alpha: 0.6 } },
    { at: 0, until: 820, layer: 'front', drawer: 'pillar', params: { target: 'attacker', from: 'below', height: 1.5, w: 0.9, tint: SEARING_PURPLE } },
    { at: 800, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.5, r1: 0.9, tongues: 9 } },
    { at: 1000, until: 2400, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
    { at: 1000, until: 1400, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.5 } },
    { at: 1000, until: 2000, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.6, w: 0.6, tint: { body: '#FF8A1F', hot: '#FFE14D', core: '#FFF6C8' } } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'starFlare', params: { arms: RING5, width: 0.46 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
    {
      at: 1400,
      until: 2400,
      layer: 'front',
      drawer: 'pillar',
      params: { from: 'below', height: 1.0, w: 0.5, count: 2, spread: 1.4, stagger: 160, tint: { body: '#FF8A1F', hot: '#FFE14D', core: '#FFF6C8' } },
    },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 15, distance: 1.3, direction: -90, spread: 300, size: [0.05, 0.13], aspect: 0.3, gravity: 0.6, maxDelay: 0.12, durationMs: 760, kind: 'ember' },
    { at: 1600, anchor: 'defender', count: 12, distance: 1.1, direction: -90, spread: 120, size: [0.04, 0.1], aspect: 0.3, gravity: 0.3, maxDelay: 0.2, durationMs: 760, kind: 'ember' },
  ],
  grain: 0.28,
});

const WING_TINT = Object.freeze({ deep: '#E0301F', body: '#FF8A1A', hot: '#FF8CC8', core: '#FFE55C' });

// Victini: flame V-wings fan out behind it, a lance streaks the lane, a pillar erupts.
export const vCreate = Object.freeze({
  id: 'v-create',
  name: 'V-create',
  vgType: 'fire',
  statClass: 'physical',
  tier: 'S',
  family: 'dash',
  material: 'fire',
  durationMs: 2400,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'dash', params: {} },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 1 } },
  beats: [
    { at: 0, until: 800, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.2, r1: 0.55, tint: { body: '#FF8A1A', hot: '#FFE55C', core: '#FFFFFF' } } },
    { at: 0, until: 900, layer: 'front', drawer: 'fan', params: { count: 4, spread: 36, direction: 125, lenMin: 0.9, lenMax: 1.4, width: 0.32, flap: 12, tint: WING_TINT } },
    { at: 0, until: 900, layer: 'front', drawer: 'fan', params: { count: 4, spread: 36, direction: -125, lenMin: 0.9, lenMax: 1.4, width: 0.32, flap: 12, tint: WING_TINT } },
    { at: 300, until: 1000, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.3, r1: 1.0, target: 'attacker', tint: { body: '#5FE8FF', hot: '#FFFFFF' } } },
    { at: 700, until: 1000, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.3, tint: { body: '#FF8A1A', hot: '#FFE55C', core: '#FFFFFF' } } },
    { at: 800, until: 1400, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
    { at: 1000, until: 1400, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 2, r0: 0.3, r1: 1.5 } },
    { at: 1000, until: 2000, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.8, w: 0.8 } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'starFlare', params: { arms: RING5, width: 0.46 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 22, distance: 1.3, direction: -90, spread: 300, size: [0.05, 0.13], aspect: 0.3, gravity: 0.6, maxDelay: 0.12, durationMs: 760, kind: 'ember' },
  ],
  grain: 0.28,
});

export const FIRE_SIGNATURE_SPECS = Object.freeze({
  'blue-flare': blueFlare,
  'fusion-flare': fusionFlare,
  'magma-storm': magmaStorm,
  'sacred-fire': sacredFire,
  'searing-shot': searingShot,
  'v-create': vCreate,
});
