// Design 065 slice 8: the Rock signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Rock);
// departures from an entry are listed under the design's Deviations (slice 8).

const DIAMOND = Object.freeze({ deep: '#2E7CE6', body: '#F9C5F0', hot: '#7FF7FF', core: '#FFFFFF' });
const SPARK_GOLD = Object.freeze({ deep: '#F9C5F0', body: '#FFE14D', hot: '#FFF6B8', core: '#FFFFFF' });

// Diancie: a halo of pink-white diamonds orbits the attacker, flies down the lane and bursts on
// the defender, then a yellow star and a sparkle shower.
export const diamondStorm = Object.freeze({
  id: 'diamond-storm',
  name: 'Diamond Storm',
  vgType: 'rock',
  statClass: 'physical',
  tier: 'S',
  family: 'burst',
  material: 'rock',
  durationMs: 2000,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'brace', params: { glow: 0.5 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.5 } },
  beats: [
    { at: 0, until: 450, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.45, tint: DIAMOND } },
    { at: 0, until: 700, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.5, tint: DIAMOND } },
    { at: 300, until: 1000, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.4, r1: 0.9, tint: DIAMOND } },
    { at: 250, until: 850, layer: 'back', drawer: 'orbitCharge', params: { count: 8, half: 'back', r0: 0.1, r1: 0.14, tongues: 0, unit: 'facet', tint: DIAMOND } },
    { at: 250, until: 850, layer: 'front', drawer: 'orbitCharge', params: { count: 8, half: 'front', r0: 0.1, r1: 0.14, tongues: 0, unit: 'facet', tint: DIAMOND } },
    { at: 650, until: 1000, layer: 'front', drawer: 'volley', params: { count: 6, stagger: 50, r0: 0.12, r1: 0.18, bow: 0.3, tongues: 0, unit: 'facet', tint: DIAMOND } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: DIAMOND } },
    { at: 1000, until: 1350, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.3, tint: DIAMOND } },
    { at: 1000, until: 1340, layer: 'front', drawer: 'shards', params: { count: 10, arc: 360, distance: 1.1, unit: 'facet', tint: DIAMOND } },
    { at: 1350, until: 1700, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.3, tint: SPARK_GOLD } },
    { at: 1350, until: 1950, layer: 'front', drawer: 'rain', params: { count: 10, height: 1.4, spread: 0.9, tint: DIAMOND } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 22, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.09], aspect: 0.8, gravity: 0.4, maxDelay: 0.12, durationMs: 800, kind: 'twinkle' },
  ],
  grain: 0.12,
});

const BLADE_GOLD = Object.freeze({ deep: '#FF8A1F', body: '#FFD84A', hot: '#FFF3B0', core: '#FFFFFF' });
const SPARKS = Object.freeze({ deep: '#3A3F55', body: '#FF8A1F', hot: '#FFD84A', core: '#FFF3B0' });

// Iron Boulder: gold ring plates flip out round the attacker, it lunges, and a huge gold
// crescent blade cleaves the defender in a shower of orange sparks.
export const mightyCleave = Object.freeze({
  id: 'mighty-cleave',
  name: 'Mighty Cleave',
  vgType: 'rock',
  statClass: 'physical',
  tier: 'S',
  family: 'punch',
  material: 'rock',
  durationMs: 2000,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'lunge', params: { wind: 0.3, glow: 0.5 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.5 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { hz: 3, alpha: 0.5, tint: BLADE_GOLD } },
    { at: 200, until: 1000, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 2, r0: 0.4, r1: 0.9, tint: BLADE_GOLD } },
    { at: 750, until: 1250, layer: 'front', drawer: 'slashArc', params: { sweep: 150, radius: 1.2, count: 2, gapDeg: 30, angle: 45, thick: 0.3, tint: BLADE_GOLD } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: BLADE_GOLD } },
    { at: 1000, until: 1300, layer: 'back', drawer: 'starFlare', params: { arms: 'cross', width: 0.3, tint: BLADE_GOLD } },
    { at: 1000, until: 1400, layer: 'back', drawer: 'speedRays', params: { count: 16, tint: BLADE_GOLD } },
    { at: 1000, until: 1800, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.0, tint: SPARKS } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
    { at: 1300, until: 2000, layer: 'front', drawer: 'smoke', params: { count: 4 } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 22, distance: 1.3, direction: -90, spread: 300, size: [0.04, 0.09], aspect: 0.4, gravity: 0.8, maxDelay: 0.12, durationMs: 760, kind: 'ember' },
  ],
  grain: 0.12,
});

export const ROCK_SIGNATURE_SPECS = Object.freeze({
  'diamond-storm': diamondStorm,
  'mighty-cleave': mightyCleave,
});
