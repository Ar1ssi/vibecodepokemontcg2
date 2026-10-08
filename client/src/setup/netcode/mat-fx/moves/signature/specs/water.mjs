// Design 065 slice 6: the Water signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Water);
// departures from an entry are listed under the design's Deviations (slice 6).

/** Five spikes 72° apart: "starFlare arms 'ring'" inside the 30-tongue budget (slice 5). */
const RING5 = Object.freeze([-90, -18, 54, 126, 198].map((angle) => Object.freeze({ angle, reach: 0.85 })));

const STEAM = Object.freeze({ deep: '#2E7CE6', body: '#A8F0FF', hot: '#E8FCFF', core: '#FFFFFF' });
const MIST = Object.freeze({ deep: '#8FA3B5', body: '#C7D8E6', hot: '#EEF4FA', core: '#FFFFFF' });

// Walking Wake: a fin halo spins round the head, a thin pale steam beam leaves the mouth and
// breaks in a white steam cloud over the defender.
export const hydroSteam = Object.freeze({
  id: 'hydro-steam',
  name: 'Hydro Steam',
  vgType: 'water',
  statClass: 'special',
  tier: 'S',
  family: 'wind',
  material: 'water',
  durationMs: 2000,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 1 } },
  beats: [
    { at: 0, until: 1000, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6 } },
    { at: 0, until: 700, layer: 'front', drawer: 'ring', params: { kind: 'fins', count: 5, r0: 0.45, target: 'attacker', rpm: 90, tint: { body: '#4FD8F0', hot: '#A8F0FF', core: '#FFFFFF' } } },
    { at: 300, until: 1000, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.4, tint: STEAM } },
    { at: 900, until: 1800, layer: 'front', drawer: 'cloud', params: { count: 8, radius: 0.4, drift: 0.6, alpha: 0.5, tint: MIST } },
    { at: 1000, until: 1800, layer: 'front', drawer: 'smoke', params: { count: 6 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
    { at: 1200, until: 2000, layer: 'front', drawer: 'splash', params: { count: 8, arc: 140, direction: -90, gravity: 0.7, tint: STEAM } },
  ],
  particles: [],
});

const ORB = Object.freeze({ deep: '#0B2A6E', body: '#2E9BFF', hot: '#7FF2FF', core: '#E2F8FF' });

// Kyogre: a ring of blue orbs round the body, radial cyan sheets off it, then it dives
// through the orbs onto the defender.
export const originPulse = Object.freeze({
  id: 'origin-pulse',
  name: 'Origin Pulse',
  vgType: 'water',
  statClass: 'special',
  tier: 'S',
  family: 'wind',
  material: 'water',
  durationMs: 2000,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'dash', params: { wind: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 1 } },
  beats: [
    { at: 0, until: 800, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: ORB } },
    { at: 0, until: 800, layer: 'back', drawer: 'orbitCharge', params: { count: 8, half: 'back', r0: 0.3, r1: 0.5, tongues: 0, tilt: 0.7, tint: ORB } },
    { at: 0, until: 800, layer: 'front', drawer: 'orbitCharge', params: { count: 8, half: 'front', r0: 0.3, r1: 0.5, tongues: 0, tilt: 0.7, tint: ORB } },
    { at: 500, until: 1000, layer: 'front', drawer: 'starFlare', params: { target: 'attacker', arms: RING5, width: 0.3, tint: ORB } },
    { at: 900, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'ring', params: { kind: 'floor', count: 3, r0: 0.3, r1: 1.4, tint: ORB } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
    { at: 1000, until: 1800, layer: 'front', drawer: 'cloud', params: { count: 5, radius: 0.3, drift: 0.4, alpha: 0.5 } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 18, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.6, gravity: 0.7, maxDelay: 0.1, durationMs: 760, kind: 'droplet' },
  ],
  grain: 0.2,
});

const LANCE = Object.freeze({ deep: '#3E7BFF', body: '#E6F2FF', hot: '#FFFFFF', core: '#FFFFFF' });
const HOT_STEAM = Object.freeze({ deep: '#FF5A2A', body: '#FF9A3C', hot: '#FFE9A8', core: '#FFFFFF' });

// Volcanion: a white steam lance into the defender, a steam column under it, a steam cloud.
export const steamEruption = Object.freeze({
  id: 'steam-eruption',
  name: 'Steam Eruption',
  vgType: 'water',
  statClass: 'special',
  tier: 'S',
  family: 'splash',
  material: 'water',
  durationMs: 2000,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'rear-lurch', params: { rear: 0.04, lurch: 0.1, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 1 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: HOT_STEAM } },
    { at: 0, until: 600, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.45, tint: LANCE } },
    { at: 300, until: 1000, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.45, tint: LANCE } },
    { at: 800, until: 1800, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.6, w: 0.6, tint: LANCE } },
    { at: 800, until: 1800, layer: 'front', drawer: 'cloud', params: { count: 7, radius: 0.35, drift: 0.6, alpha: 0.5, tint: MIST } },
    { at: 1200, until: 1800, layer: 'front', drawer: 'smoke', params: { count: 5 } },
    { at: 900, until: 1600, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
    { at: 1000, until: 1400, layer: 'front', drawer: 'starFlare', params: { arms: RING5, width: 0.46, tint: HOT_STEAM } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 20, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.6, gravity: 0.7, maxDelay: 0.1, durationMs: 760, kind: 'droplet' },
  ],
  grain: 0.2,
});

const STRIKE = Object.freeze({ deep: '#2E9BFF', body: '#7FD8FF', hot: '#E2F8FF', core: '#FFFFFF' });

// Urshifu: three blue-white water strikes in a row, each a burst on the defender.
export const surgingStrikes = Object.freeze({
  id: 'surging-strikes',
  name: 'Surging Strikes',
  vgType: 'water',
  statClass: 'physical',
  tier: 'S',
  family: 'splash',
  material: 'water',
  durationMs: 2000,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'lunge', params: { wind: 0.4, strikes: 3, glow: 0.4 } },
  defender: { motion: 'stagger', params: { hits: 3, gapMs: 200, strength: 0.3, lead: 450 } },
  beats: [
    { at: 0, until: 400, layer: 'back', drawer: 'aura', params: { hz: 3, alpha: 0.5, tint: { hot: '#FFD84A' } } },
    { at: 500, until: 700, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.3, tint: STRIKE } },
    { at: 700, until: 950, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.3, tint: STRIKE } },
    { at: 950, until: 1250, layer: 'front', drawer: 'starFlare', params: { arms: RING5, width: 0.46, tint: STRIKE } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
    { at: 1100, until: 1700, layer: 'front', drawer: 'splash', params: { count: 5, arc: 140, direction: -90, gravity: 0.7 } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 14, distance: 1.1, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.6, gravity: 0.7, maxDelay: 0.1, durationMs: 760, kind: 'droplet' },
  ],
});

export const WATER_SIGNATURE_SPECS = Object.freeze({
  'hydro-steam': hydroSteam,
  'origin-pulse': originPulse,
  'steam-eruption': steamEruption,
  'surging-strikes': surgingStrikes,
});
