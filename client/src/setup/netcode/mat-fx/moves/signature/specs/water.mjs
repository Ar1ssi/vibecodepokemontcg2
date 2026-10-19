// Design 065 slice 6: the Water signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Water);
// departures from an entry are listed under the design's Deviations (slice 6).
//
// Design 075 style pass (slice 10): no orbiting orbs, fin halo, aura rings or table rings — each
// move winds up with the attacker's rim glow and its own shape forming (steam gathering at the mouth, Kyogre's pulse flaring); contact
// dressing is a small flash and fewer splashes, puffs and drops, and the struck card's sheen
// stays faint (heat <= 0.35).

/** Five spikes 72° apart: "starFlare arms 'ring'" inside the 30-tongue budget (slice 5). */
const RING5 = Object.freeze([-90, -18, 54, 126, 198].map((angle) => Object.freeze({ angle, reach: 0.85 })));

const STEAM = Object.freeze({ deep: '#2E7CE6', body: '#A8F0FF', hot: '#E8FCFF', core: '#FFFFFF' });
const MIST = Object.freeze({ deep: '#8FA3B5', body: '#C7D8E6', hot: '#EEF4FA', core: '#FFFFFF' });
/** The contact flash: small, so the move's own shape stays legible. */
const FLASH = Object.freeze({ r0: 0.2, r1: 0.5 });

// Walking Wake: steam gathers at the mouth, a pale stream of steam leaves it (a train of
// translucent drops: a solid steam beam stacked to a white slab) and breaks in a steam cloud
// over the defender.
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
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.35 } },
  beats: [
    { at: 0, until: 400, layer: 'front', drawer: 'coreCharge', params: { r0: 0.08, r1: 0.22, from: 0.1, tint: STEAM } },
    { at: 300, until: 1000, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.3, tint: STEAM } },
    { at: 900, until: 1800, layer: 'front', drawer: 'cloud', params: { count: 7, radius: 0.5, drift: 0.6, alpha: 0.5, tint: MIST } },
    { at: 1000, until: 1800, layer: 'front', drawer: 'smoke', params: { count: 3 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: FLASH },
    { at: 1200, until: 2000, layer: 'front', drawer: 'splash', params: { count: 5, arc: 140, direction: -90, gravity: 0.7, tint: STEAM } },
  ],
  particles: [],
});

const ORB = Object.freeze({ deep: '#0B2A6E', body: '#2E9BFF', hot: '#7FF2FF', core: '#E2F8FF' });

// Kyogre: radial cyan sheets flare off the body (the pulse), blue orbs of water stream from it
// down the lane, then it dives onto the defender.
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
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.35 } },
  beats: [
    { at: 200, until: 900, layer: 'front', drawer: 'starFlare', params: { size: 0.6, target: 'attacker', arms: RING5, width: 0.3, tint: ORB } },
    // Landing at 760 … 1000: flight = 400 - 4 x 60 = 160 ms; the last orb lands at contact.
    { at: 600, until: 1000, layer: 'front', drawer: 'volley', params: { count: 5, stagger: 60, r0: 0.12, r1: 0.16, bow: 0.3, tongues: 0, tint: ORB } },
    { at: 900, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: FLASH },
    { at: 1000, until: 1800, layer: 'front', drawer: 'cloud', params: { count: 4, radius: 0.3, drift: 0.4, alpha: 0.4 } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 10, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.6, gravity: 0.7, maxDelay: 0.1, durationMs: 760, kind: 'droplet' },
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
  defender: { motion: 'knock', params: { strength: 0.4, heat: 0.35 } },
  beats: [
    { at: 0, until: 600, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.14, r1: 0.34, tint: LANCE } },
    { at: 300, until: 1000, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.3, tint: LANCE } },
    { at: 800, until: 1800, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.2, w: 0.5, tint: LANCE } },
    { at: 800, until: 1800, layer: 'front', drawer: 'cloud', params: { count: 4, radius: 0.35, drift: 0.6, alpha: 0.4, tint: MIST } },
    { at: 1200, until: 1800, layer: 'front', drawer: 'smoke', params: { count: 3 } },
    { at: 900, until: 1600, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: FLASH },
    { at: 1000, until: 1400, layer: 'front', drawer: 'starFlare', params: { size: 0.6, arms: RING5, width: 0.46, tint: HOT_STEAM } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 10, distance: 1.2, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.6, gravity: 0.7, maxDelay: 0.1, durationMs: 760, kind: 'droplet' },
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
  attacker: { motion: 'lunge', params: { wind: 0.4, strikes: 3, glow: 0.6 } },
  defender: { motion: 'stagger', params: { hits: 3, gapMs: 200, strength: 0.3, lead: 450 } },
  beats: [
    { at: 500, until: 700, layer: 'front', drawer: 'starFlare', params: { size: 0.6, arms: 'cross', width: 0.3, tint: STRIKE } },
    { at: 700, until: 950, layer: 'front', drawer: 'starFlare', params: { size: 0.6, arms: 'cross', width: 0.3, tint: STRIKE } },
    { at: 950, until: 1250, layer: 'front', drawer: 'starFlare', params: { size: 0.6, arms: RING5, width: 0.46, tint: STRIKE } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: FLASH },
    { at: 1100, until: 1700, layer: 'front', drawer: 'splash', params: { count: 4, arc: 140, direction: -90, gravity: 0.7 } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 9, distance: 1.1, direction: -90, spread: 300, size: [0.04, 0.1], aspect: 0.6, gravity: 0.7, maxDelay: 0.1, durationMs: 760, kind: 'droplet' },
  ],
});

export const WATER_SIGNATURE_SPECS = Object.freeze({
  'hydro-steam': hydroSteam,
  'origin-pulse': originPulse,
  'steam-eruption': steamEruption,
  'surging-strikes': surgingStrikes,
});
