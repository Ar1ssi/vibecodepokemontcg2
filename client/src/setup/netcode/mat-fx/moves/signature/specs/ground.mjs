// Design 065 slice 8: the Ground signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Ground);
// departures from an entry are listed under the design's Deviations (slice 8).

/** Five spikes 72° apart: "starFlare arms 'ring'" inside the 30-tongue budget (slice 5). */
const RING5 = Object.freeze([-90, -18, 54, 126, 198].map((angle) => Object.freeze({ angle, reach: 0.85 })));
/** Three spikes up and out: an arrow-strike star that leaves room for the rain. */
const TRIAD = Object.freeze([-90, 30, 150].map((angle) => Object.freeze({ angle, reach: 0.9 })));

const FRONDS = Object.freeze({ deep: '#0A0A0C', body: '#1A1C14', hot: '#C8E84A', core: '#FFFBE6' });
const GOLD_LIGHT = Object.freeze({ deep: '#B07A1A', body: '#F2B233', hot: '#FFE15A', core: '#FFFBE6' });

// Zygarde: a black frond fan rises behind the attacker over a gold floor ring, then gold light
// columns and rock slabs erupt round the defender.
export const landsWrath = Object.freeze({
  id: 'lands-wrath',
  name: 'Land’s Wrath',
  vgType: 'ground',
  statClass: 'physical',
  tier: 'S',
  family: 'burst',
  material: 'ground',
  durationMs: 2200,
  contactMs: 1000,
  pad: 2,
  attacker: { motion: 'stomp', params: {} },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.5 } },
  beats: [
    { at: 0, until: 900, layer: 'front', drawer: 'fan', params: { count: 9, spread: 120, lenMin: 0.8, lenMax: 1.3, width: 0.2, flap: 8, tint: FRONDS } },
    { at: 450, until: 1000, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 3, r0: 0.3, r1: 1.3, tint: GOLD_LIGHT } },
    { at: 500, until: 1100, layer: 'back', drawer: 'terrain', params: { target: 'attacker', kind: 'dust', radius: 1.4 } },
    { at: 700, until: 1400, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.8, w: 0.5, count: 3, spread: 1.2, stagger: 60, tint: GOLD_LIGHT } },
    { at: 700, until: 1800, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.4, tint: GOLD_LIGHT } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: GOLD_LIGHT } },
    { at: 1000, until: 1600, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: { deep: '#0A0A0C', body: '#2A2622' } } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
    { at: 1400, until: 2200, layer: 'front', drawer: 'smoke', params: { count: 5 } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 20, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.6, gravity: 0.8, maxDelay: 0.12, durationMs: 760, kind: 'shard' },
  ],
  grain: 0.2,
});

const SPIRE = Object.freeze({ deep: '#C98B5A', body: '#FFD84A', hot: '#FFF6B8', core: '#FFFFFF' });
const RED_COLUMN = Object.freeze({ deep: '#C98B5A', body: '#E8282A', hot: '#FF8A1F', core: '#FFD84A' });

// Groudon: rings of gold-white spires burst up round the attacker, then round the defender, and
// one tall red column rises out of the defender's dust.
export const precipiceBlades = Object.freeze({
  id: 'precipice-blades',
  name: 'Precipice Blades',
  vgType: 'ground',
  statClass: 'physical',
  tier: 'S',
  family: 'punch',
  material: 'ground',
  durationMs: 2200,
  contactMs: 1000,
  pad: 2,
  attacker: { motion: 'lunge', params: { wind: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.5 } },
  beats: [
    { at: 300, until: 800, layer: 'front', drawer: 'pillar', params: { target: 'attacker', from: 'below', height: 1.0, w: 0.35, count: 4, spread: 1.4, stagger: 50, tint: SPIRE } },
    { at: 300, until: 1000, layer: 'back', drawer: 'terrain', params: { target: 'attacker', kind: 'dust', radius: 1.4 } },
    { at: 800, until: 1200, layer: 'back', drawer: 'pillar', params: { from: 'below', height: 1.2, w: 0.35, count: 4, spread: 1.4, stagger: 40, tint: SPIRE } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: SPIRE } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.8, w: 0.6, tint: SPIRE } },
    { at: 1000, until: 1800, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.0 } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
    { at: 1400, until: 2200, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.6, w: 0.5, tint: RED_COLUMN } },
    { at: 1500, until: 2200, layer: 'back', drawer: 'terrain', params: { kind: 'dust', radius: 1.2 } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 20, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.6, gravity: 0.8, maxDelay: 0.12, durationMs: 760, kind: 'shard' },
  ],
  grain: 0.2,
});

const SAND = Object.freeze({ deep: '#5A4A3A', body: '#D9B77A', hot: '#FFE14D', core: '#FFF4D0' });
const CLOUD_WHITE = Object.freeze({ deep: '#A8B4C2', body: '#E8EEF5', hot: '#FFFFFF', core: '#FFFFFF' });
const FIRE_ARC = Object.freeze({ deep: '#8A2A0A', body: '#FF8A1A', hot: '#FFE14D' });

// Landorus: a white cloud sweeps toward the defender, fire arcs run the ground, then a sand
// tornado turns round the defender with a yellow starburst at its base.
export const sandsearStorm = Object.freeze({
  id: 'sandsear-storm',
  name: 'Sandsear Storm',
  vgType: 'ground',
  statClass: 'special',
  tier: 'S',
  family: 'wind',
  material: 'ground',
  durationMs: 2200,
  contactMs: 1000,
  pad: 2,
  attacker: { motion: 'rear-lurch', params: { rear: 0.1, lurch: 0.3, glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 900, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 6, radius: 0.5, drift: 0.4, alpha: 0.75, direction: 0, tint: CLOUD_WHITE } },
    { at: 500, until: 1500, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.4, tint: FIRE_ARC } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: SAND } },
    { at: 1000, until: 1900, layer: 'front', drawer: 'spiral', params: { turns: 2.5, r0: 0.2, r1: 1.1, rpm: 90, tongues: 10, tint: SAND } },
    { at: 1000, until: 1900, layer: 'front', drawer: 'cloud', params: { count: 8, radius: 0.35, drift: 0.8, alpha: 0.5, tint: SAND } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
    { at: 1500, until: 1800, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: { deep: '#FF8A1A', body: '#FFE14D', hot: '#FFF6B8', core: '#FFFFFF' } } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 18, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.09], aspect: 0.6, gravity: 0.3, maxDelay: 0.15, durationMs: 900, kind: 'shard' },
  ],
  grain: 0.24,
});

const ARROWS = Object.freeze({ deep: '#2E9B3A', body: '#5FFFD7', hot: '#7DFF4A', core: '#FFFFFF' });
const LIME = Object.freeze({ deep: '#0A0A0C', body: '#2E9B3A', hot: '#7DFF4A', core: '#E9FFC4' });

// Zygarde (10%): a lime core bursts into radial cyan arrows off the attacker, then arrows rain
// from the sky onto the defender; green chips scatter at its feet.
export const thousandArrows = Object.freeze({
  id: 'thousand-arrows',
  name: 'Thousand Arrows',
  vgType: 'ground',
  statClass: 'physical',
  tier: 'S',
  family: 'projectile',
  material: 'ground',
  durationMs: 2000,
  contactMs: 1000,
  pad: 2,
  attacker: { motion: 'brace', params: { glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.5 } },
  beats: [
    { at: 0, until: 600, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.2, r1: 0.5, tint: LIME } },
    { at: 0, until: 700, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 2, r0: 0.3, r1: 1.0, tint: LIME } },
    { at: 0, until: 700, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.5, tint: LIME } },
    { at: 300, until: 800, layer: 'front', drawer: 'shards', params: { target: 'attacker', count: 10, arc: 360, distance: 1.0, spin: 0, tint: ARROWS } },
    { at: 800, until: 1800, layer: 'front', drawer: 'rain', params: { count: 12, height: 1.6, spread: 0.9, tint: ARROWS } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: ARROWS } },
    { at: 1000, until: 1350, layer: 'back', drawer: 'starFlare', params: { arms: TRIAD, width: 0.3, tint: ARROWS } },
    { at: 1350, until: 1900, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 0.9, tint: LIME } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 18, distance: 1.1, direction: -90, spread: 300, size: [0.04, 0.09], aspect: 0.6, gravity: 0.7, maxDelay: 0.15, durationMs: 760, kind: 'shard' },
  ],
  grain: 0.16,
});

const HEX_GREEN = Object.freeze({ deep: '#1E5E1E', body: '#41F058', hot: '#B8F87A', core: '#E9FFC4' });

// Zygarde (Complete): a green hex-shard burst off the attacker rolls across the field as a swarm
// and piles up on the defender in a white starburst and wave rings.
export const thousandWaves = Object.freeze({
  id: 'thousand-waves',
  name: 'Thousand Waves',
  vgType: 'ground',
  statClass: 'physical',
  tier: 'S',
  family: 'burst',
  material: 'ground',
  durationMs: 2000,
  contactMs: 1000,
  pad: 2,
  attacker: { motion: 'brace', params: { glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.5 } },
  beats: [
    { at: 0, until: 500, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, tint: HEX_GREEN } },
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: HEX_GREEN } },
    { at: 300, until: 1000, layer: 'front', drawer: 'shards', params: { target: 'attacker', count: 12, arc: 360, distance: 1.0, unit: 'hex', tint: HEX_GREEN } },
    { at: 300, until: 1000, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'floor', count: 2, r0: 0.3, r1: 1.2, tint: HEX_GREEN } },
    { at: 500, until: 1100, layer: 'back', drawer: 'terrain', params: { target: 'attacker', kind: 'wave', radius: 1.6, tint: HEX_GREEN } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: HEX_GREEN } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.3, tint: { deep: '#1E5E1E', body: '#7FF7FF', hot: '#E9FFC4', core: '#FFFFFF' } } },
    { at: 1000, until: 1800, layer: 'front', drawer: 'shards', params: { count: 10, arc: 360, distance: 1.1, unit: 'hex', tint: HEX_GREEN } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 3, r0: 0.3, r1: 1.5, tint: HEX_GREEN } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 22, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.09], aspect: 0.8, gravity: 0.6, maxDelay: 0.12, durationMs: 800, kind: 'shard' },
  ],
  grain: 0.16,
});

export const GROUND_SIGNATURE_SPECS = Object.freeze({
  'lands-wrath': landsWrath,
  'precipice-blades': precipiceBlades,
  'sandsear-storm': sandsearStorm,
  'thousand-arrows': thousandArrows,
  'thousand-waves': thousandWaves,
});
