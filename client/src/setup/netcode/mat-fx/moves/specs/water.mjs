// Design 063: Water specs, one per move of the Water row of the move table, from the
// design's Appendix A Water entries (B2W2 sprites + Scarlet/Violet videos). Times are the
// entries' except where the validator's bands or a card-motion preset's settle forced a
// re-time; each such change is a line under the design's § Deviations. Every hit is local
// to the defender: the references' full-screen backdrops (Waterfall, Whirlpool, Hydro
// Cannon, Surf) became a defender vignette or table rings.
//
// Design 075 style pass (slice 10): no charge rings, aura rings, shock rings or table rings (the
// attacker's own rim glow is the charge) — the water
// itself carries each move (the jet, the wave, the drops, the falls); contact dressing is a
// small flash and fewer splashes and drops (the TCG Live prefab replaces them in play), and the
// struck card's sheen stays faint (heat <= 0.35). Hydro Cannon fires a ball of water instead
// of a solid beam and Surf rolls a wide train of water down the lane: the beam column's white
// core read as a slab.

const GRAIN = 0.12;
/** The contact flash: small, so the water's own shape stays legible. */
const FLASH = Object.freeze({ r0: 0.2, r1: 0.5 });

/** A CSS particle burst with the water defaults (round drops under heavy gravity). */
const burst = (over) =>
  Object.freeze({
    at: 0,
    anchor: 'defender',
    count: 12,
    distance: 1,
    direction: -90,
    spread: 300,
    size: [0.035, 0.075],
    aspect: 1,
    gravity: 1,
    maxDelay: 0.1,
    durationMs: 700,
    kind: 'droplet',
    ...over,
  });

const spec = (over) => Object.freeze({ vgType: 'water', material: 'water', pad: 1.7, grain: GRAIN, ...over });

// ---- physical ------------------------------------------------------------------------

export const aquaJet = spec({
  id: 'aqua-jet',
  name: 'Aqua Jet',
  statClass: 'physical',
  tier: 1,
  family: 'splash',
  durationMs: 1000,
  contactMs: 450,
  attacker: { motion: 'dash', params: { wind: 0.15, reach: 0.9, overshoot: 0.2, arc: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.3 } },
  beats: [
    // A wake of water thrown off behind the attacker as it dashes.
    { at: 150, until: 450, layer: 'back', drawer: 'splash', params: { target: 'attacker', count: 5, arc: 120, len: [0.4, 0.7], gravity: 0.7 } },
    { at: 450, until: 800, layer: 'front', drawer: 'pillar', params: { height: 0.9, w: 0.45 } },
    { at: 450, until: 800, layer: 'front', drawer: 'splash', params: { count: 8, arc: 300, len: [0.35, 0.6], gravity: 0.7 } },
    { at: 450, until: 600, layer: 'top', drawer: 'impactFlash', params: FLASH },
  ],
  particles: [burst({ at: 450, count: 8, distance: 0.9, durationMs: 650 })],
});

export const waterfall = spec({
  id: 'waterfall',
  name: 'Waterfall',
  statClass: 'physical',
  tier: 2,
  family: 'splash',
  durationMs: 1300,
  contactMs: 550,
  attacker: { motion: 'lunge', params: { wind: 0.2, reach: 1.0 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.3 } },
  beats: [
    // The geyser sits behind the attacker's ghost, so it must out-grow the card (1 h tall,
    // ~0.72 h wide) to be seen: the entry's 0.6 card column was fully hidden.
    { at: 0, until: 400, layer: 'back', drawer: 'pillar', params: { target: 'attacker', height: 1.5, w: 0.85 } },
    { at: 250, until: 1150, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35 } },
    // The falls crash down onto the card from above it.
    { at: 550, until: 1000, layer: 'front', drawer: 'pillar', params: { from: 'above', height: 1.4, w: 0.55 } },
    { at: 550, until: 900, layer: 'front', drawer: 'splash', params: { count: 8, arc: 120, len: [0.5, 0.9], gravity: 0.8 } },
    { at: 650, until: 1100, layer: 'front', drawer: 'rain', params: { count: 6, height: 1.2, spread: 0.8 } },
    { at: 550, until: 720, layer: 'top', drawer: 'impactFlash', params: FLASH },
  ],
  particles: [burst({ at: 550, count: 9, spread: 160 })],
});

export const liquidation = spec({
  id: 'liquidation',
  name: 'Liquidation',
  statClass: 'physical',
  tier: 2,
  family: 'splash',
  durationMs: 1400,
  contactMs: 850,
  attacker: { motion: 'lunge', params: { wind: 0.25, reach: 1.0, glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.3 } },
  beats: [
    // Water gathers round the attacker as it winds up, then crashes over the card in a column.
    { at: 300, until: 800, layer: 'back', drawer: 'splash', params: { target: 'attacker', count: 6, arc: 360, len: [0.3, 0.5], gravity: 0.2 } },
    { at: 850, until: 1250, layer: 'front', drawer: 'pillar', params: { height: 1.1, w: 0.5 } },
    { at: 850, until: 1250, layer: 'front', drawer: 'splash', params: { count: 8, arc: 360, len: [0.4, 0.8], gravity: 0.4 } },
    { at: 950, until: 1350, layer: 'front', drawer: 'rain', params: { count: 6, height: 1.0, spread: 1.0 } },
    { at: 850, until: 1020, layer: 'top', drawer: 'impactFlash', params: FLASH },
  ],
  particles: [burst({ at: 850, count: 9, spread: 360, distance: 0.9, gravity: 0.8 })],
});

export const waveCrash = spec({
  id: 'wave-crash',
  name: 'Wave Crash',
  statClass: 'physical',
  tier: 3,
  family: 'splash',
  durationMs: 2200,
  contactMs: 1290,
  attacker: { motion: 'dash', params: { wind: 0.25, reach: 0.9, overshoot: 0.3, arc: 0.4 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.35 } },
  beats: [
    // The attacker charges, throwing a wake of water off behind it.
    { at: 500, until: 1150, layer: 'back', drawer: 'splash', params: { target: 'attacker', count: 6, arc: 140, len: [0.5, 0.9], gravity: 0.6 } },
    { at: 900, until: 1250, layer: 'back', drawer: 'cloud', params: { target: 'attacker', count: 4, radius: 0.45, drift: 0.5, alpha: 0.35 } },
    { at: 1290, until: 1700, layer: 'front', drawer: 'splash', params: { count: 10, arc: 360, len: [0.6, 1.2], gravity: 0.6 } },
    { at: 1390, until: 2150, layer: 'front', drawer: 'cloud', params: { count: 5, radius: 0.5, drift: 0.5, direction: 90, alpha: 0.3 } },
    { at: 1290, until: 1480, layer: 'top', drawer: 'impactFlash', params: FLASH },
  ],
  particles: [burst({ at: 1290, count: 12, distance: 1.3, spread: 360, durationMs: 800 })],
});

export const aquaTail = spec({
  id: 'aqua-tail',
  name: 'Aqua Tail',
  statClass: 'physical',
  tier: 3,
  family: 'slash',
  durationMs: 1800,
  contactMs: 1000,
  attacker: { motion: 'lunge', params: { wind: 0.3, reach: 1.0 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.3 } },
  beats: [
    // Water swirls up round the attacker as the tail winds back.
    { at: 300, until: 850, layer: 'back', drawer: 'splash', params: { target: 'attacker', count: 4, arc: 160, len: [0.4, 0.7], gravity: 0.5 } },
    // The tail's water arc sweeps in ahead of the hit so the crescent reads before contact
    // (settled ~0.45 into the beat); the splash follows the cut, so the family stays the slash.
    { at: 820, until: 1300, layer: 'front', drawer: 'slashArc', params: { sweep: 120, radius: 0.6, angle: 30, thick: 0.24 } },
    { at: 1010, until: 1350, layer: 'front', drawer: 'splash', params: { count: 8, arc: 100, len: [0.5, 0.9], gravity: 0.8 } },
    { at: 1100, until: 1750, layer: 'front', drawer: 'cloud', params: { count: 4, radius: 0.45, drift: 0.5, direction: 0, alpha: 0.3 } },
    { at: 1000, until: 1170, layer: 'top', drawer: 'impactFlash', params: FLASH },
  ],
  particles: [burst({ at: 1000, count: 9, spread: 140 })],
});

// ---- special -------------------------------------------------------------------------

export const waterGun = spec({
  id: 'water-gun',
  name: 'Water Gun',
  statClass: 'special',
  tier: 1,
  family: 'splash',
  durationMs: 1000,
  contactMs: 450,
  attacker: { motion: 'brace', params: { rear: 0.08, scale: 1.03, glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.3 } },
  beats: [
    { at: 150, until: 800, layer: 'front', drawer: 'beam', params: { kind: 'pulse-train', w: 0.2, gap: 0.22, speed: 3, growIn: 0.4 } },
    { at: 450, until: 950, layer: 'front', drawer: 'cloud', params: { count: 3, radius: 0.3, drift: 0.4, alpha: 0.3 } },
    { at: 450, until: 750, layer: 'front', drawer: 'splash', params: { count: 6, arc: 120, len: [0.35, 0.6], gravity: 0.7 } },
    { at: 450, until: 600, layer: 'top', drawer: 'impactFlash', params: FLASH },
  ],
  particles: [burst({ at: 450, count: 7, distance: 0.7, spread: 160, size: [0.03, 0.06], durationMs: 600 })],
});

export const bubble = spec({
  id: 'bubble',
  name: 'Bubble',
  statClass: 'special',
  tier: 1,
  family: 'projectile',
  durationMs: 1100,
  contactMs: 600,
  attacker: { motion: 'brace', params: { rear: 0.06, scale: 1.03, glow: 0.4 } },
  defender: { motion: 'knock', params: { strength: 0.2, heat: 0.3 } },
  beats: [
    { at: 0, until: 350, layer: 'front', drawer: 'coreCharge', params: { r0: 0.08, r1: 0.2, from: 0.1 } },
    { at: 150, until: 620, layer: 'front', drawer: 'volley', params: { count: 8, stagger: 30, r0: 0.1, r1: 0.16, bow: 0.35, tongues: 0 } },
    { at: 650, until: 1050, layer: 'front', drawer: 'cloud', params: { count: 3, radius: 0.2, drift: 0.4, alpha: 0.35 } },
    { at: 600, until: 760, layer: 'top', drawer: 'impactFlash', params: FLASH },
  ],
  particles: [
    burst({ at: 600, count: 6, distance: 0.6, spread: 360, gravity: 0, size: [0.05, 0.1], durationMs: 500 }),
    burst({ at: 750, count: 4, distance: 0.8, spread: 60, gravity: 0, size: [0.03, 0.06], maxDelay: 0.3, durationMs: 600 }),
  ],
});

export const whirlpool = spec({
  id: 'whirlpool',
  name: 'Whirlpool',
  statClass: 'special',
  tier: 1,
  family: 'splash',
  durationMs: 1100,
  contactMs: 650,
  attacker: { motion: 'brace', params: { rear: 0.08, scale: 1.03, glow: 0.6 } },
  defender: { motion: 'sink', params: { heat: 0.3 } },
  beats: [
    // The whirl itself winds up: a spinning water mass leaves the attacker and the whirlpool
    // forms round the card.
    { at: 150, until: 550, layer: 'front', drawer: 'projectile', params: { path: 'spiral', r0: 0.14, r1: 0.22, tongues: 3 } },
    { at: 300, until: 1000, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35 } },
    { at: 350, until: 900, layer: 'front', drawer: 'spiral', params: { turns: 3, r0: 0.25, r1: 0.75, rpm: 200, tongues: 12 } },
    { at: 650, until: 900, layer: 'front', drawer: 'splash', params: { count: 5, arc: 120, len: [0.35, 0.6], gravity: 0.7 } },
    { at: 650, until: 800, layer: 'top', drawer: 'impactFlash', params: FLASH },
  ],
  particles: [burst({ at: 650, count: 7, direction: -90, spread: 70, gravity: 0, size: [0.03, 0.07], maxDelay: 0.25 })],
});

export const octazooka = spec({
  id: 'octazooka',
  name: 'Octazooka',
  statClass: 'special',
  tier: 2,
  family: 'splash',
  durationMs: 1200,
  contactMs: 700,
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.3 } },
  beats: [
    { at: 350, until: 700, layer: 'front', drawer: 'volley', params: { count: 8, stagger: 35, r0: 0.1, r1: 0.15, bow: 0.15, tongues: 2 } },
    { at: 700, until: 1050, layer: 'front', drawer: 'splash', params: { count: 8, arc: 360, len: [0.45, 0.8], gravity: 0.6 } },
    { at: 800, until: 1200, layer: 'front', drawer: 'cloud', params: { count: 4, radius: 0.35, drift: 0.5, alpha: 0.3 } },
    { at: 700, until: 860, layer: 'top', drawer: 'impactFlash', params: FLASH },
  ],
  particles: [burst({ at: 700, count: 8, distance: 0.9, spread: 360, gravity: 0.9 })],
});

export const scald = spec({
  id: 'scald',
  name: 'Scald',
  statClass: 'special',
  tier: 2,
  family: 'splash',
  durationMs: 1200,
  contactMs: 480,
  attacker: { motion: 'rear-lurch', params: { rear: 0.1, lurch: 0.25, glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.35 } },
  beats: [
    { at: 180, until: 800, layer: 'front', drawer: 'beam', params: { kind: 'pulse-train', w: 0.26, gap: 0.24, speed: 3, growIn: 0.4 } },
    { at: 480, until: 780, layer: 'front', drawer: 'splash', params: { count: 6, arc: 120, len: [0.4, 0.7], gravity: 0.5 } },
    { at: 630, until: 1200, layer: 'front', drawer: 'cloud', params: { count: 5, radius: 0.4, drift: 0.6, alpha: 0.35 } },
    { at: 480, until: 650, layer: 'top', drawer: 'impactFlash', params: FLASH },
  ],
  particles: [
    burst({ at: 480, kind: 'streak', count: 6, distance: 0.8, spread: 120, aspect: 0.25, gravity: 0.3, size: [0.04, 0.09] }),
    burst({ at: 880, kind: 'streak', count: 4, distance: 0.4, spread: 360, aspect: 0.3, gravity: 0, maxDelay: 0.4, size: [0.03, 0.06] }),
  ],
});

export const waterPledge = spec({
  id: 'water-pledge',
  name: 'Water Pledge',
  statClass: 'special',
  tier: 3,
  family: 'splash',
  durationMs: 1600,
  contactMs: 620,
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.3 } },
  beats: [
    { at: 200, until: 620, layer: 'front', drawer: 'volley', params: { count: 6, stagger: 50, r0: 0.1, r1: 0.14, bow: 0.25, tongues: 2 } },
    // The pledge: a column of water rises under the card.
    { at: 620, until: 1300, layer: 'front', drawer: 'pillar', params: { height: 1.4, w: 0.6 } },
    { at: 620, until: 1000, layer: 'front', drawer: 'splash', params: { count: 7, arc: 100, len: [0.5, 0.9], gravity: 0.7 } },
    { at: 1250, until: 1600, layer: 'front', drawer: 'cloud', params: { count: 4, radius: 0.4, drift: 0.4, direction: 90, alpha: 0.3 } },
    { at: 620, until: 780, layer: 'top', drawer: 'impactFlash', params: FLASH },
  ],
  particles: [burst({ at: 720, kind: 'streak', count: 6, distance: 1.4, spread: 50, aspect: 0.3, gravity: 0, size: [0.04, 0.08] })],
});

export const hydroCannon = spec({
  id: 'hydro-cannon',
  name: 'Hydro Cannon',
  statClass: 'special',
  tier: 3,
  family: 'splash',
  durationMs: 1700,
  contactMs: 900,
  attacker: { motion: 'rear-lurch', params: { rear: 0.16, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 0.35 } },
  beats: [
    // A great ball of water swells at the attacker and is fired whole, sheets of water
    // streaming off it, landing at contact.
    { at: 0, until: 560, layer: 'front', drawer: 'coreCharge', params: { r0: 0.15, r1: 0.36, from: 0.2 } },
    { at: 560, until: 900, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.34, r1: 0.4, bow: 0, tongues: 6 } },
    { at: 560, until: 1410, layer: 'back', drawer: 'beam', params: { kind: 'widening', w: 0.45, growIn: 0.4, retract: 0.3 } },
    { at: 900, until: 1300, layer: 'front', drawer: 'splash', params: { count: 9, arc: 360, len: [0.6, 1.1], gravity: 0.6 } },
    { at: 1000, until: 1650, layer: 'front', drawer: 'cloud', params: { count: 5, radius: 0.45, drift: 0.5, direction: 90, alpha: 0.3 } },
    { at: 900, until: 1100, layer: 'top', drawer: 'impactFlash', params: FLASH },
  ],
  particles: [
    burst({ at: 900, count: 10, distance: 1.2, spread: 360 }),
    burst({ at: 1100, kind: 'streak', count: 4, distance: 0.5, spread: 90, aspect: 0.3, gravity: 0, size: [0.03, 0.07] }),
  ],
});

export const hydroPump = spec({
  id: 'hydro-pump',
  name: 'Hydro Pump',
  statClass: 'special',
  tier: 3,
  family: 'splash',
  durationMs: 1600,
  contactMs: 650,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.35, glow: 0.9 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.35 } },
  beats: [
    { at: 150, until: 450, layer: 'front', drawer: 'coreCharge', params: { r0: 0.12, r1: 0.3, from: 0.1 } },
    // The jet: a dense train of water (clear, glossy-edged drops that cover the card under
    // them) round a thin bright core, so it reads as one pressurised stream.
    { at: 350, until: 1150, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.1, growIn: 0.35 } },
    { at: 350, until: 1150, layer: 'front', drawer: 'beam', params: { kind: 'widening', w: 0.32, growIn: 0.35 } },
    { at: 650, until: 1000, layer: 'front', drawer: 'splash', params: { count: 7, arc: 140, len: [0.5, 1.0], gravity: 0.6 } },
    { at: 750, until: 1300, layer: 'front', drawer: 'cloud', params: { count: 4, radius: 0.4, drift: 0.6, alpha: 0.3 } },
    { at: 650, until: 850, layer: 'top', drawer: 'impactFlash', params: FLASH },
  ],
  particles: [
    burst({ at: 650, count: 9, distance: 1.1, spread: 200 }),
    burst({ at: 850, kind: 'streak', count: 5, distance: 0.5, spread: 360, aspect: 0.3, gravity: 0, maxDelay: 0.3, size: [0.03, 0.07] }),
  ],
});

export const surf = spec({
  id: 'surf',
  name: 'Surf',
  statClass: 'special',
  tier: 3,
  family: 'splash',
  durationMs: 1800,
  contactMs: 800,
  attacker: { motion: 'lunge', params: { wind: 0.25, reach: 1.0 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 0.35 } },
  beats: [
    // A wave rises behind the attacker and rolls down the lane as a broad train of water
    // (glossy drops that cover what they cross), breaking over the card.
    { at: 0, until: 700, layer: 'back', drawer: 'pillar', params: { target: 'attacker', height: 1.5, w: 1.0 } },
    { at: 300, until: 850, layer: 'front', drawer: 'beam', params: { kind: 'pulse-train', w: 0.5, gap: 0.2, speed: 2.5, growIn: 0.4, retract: 0.2 } },
    { at: 800, until: 1200, layer: 'front', drawer: 'splash', params: { count: 10, arc: 360, len: [0.6, 1.2], gravity: 0.7 } },
    { at: 900, until: 1500, layer: 'front', drawer: 'cloud', params: { count: 5, radius: 0.45, drift: 0.5, direction: 90, alpha: 0.3 } },
    { at: 800, until: 980, layer: 'top', drawer: 'impactFlash', params: FLASH },
  ],
  particles: [
    burst({ at: 800, count: 10, distance: 1.3, spread: 360 }),
    burst({ at: 1000, count: 5, distance: 0.6, spread: 360, maxDelay: 0.3 }),
  ],
});

export const WATER_SPECS = Object.freeze(
  Object.fromEntries(
    [aquaJet, waterfall, liquidation, waveCrash, aquaTail, waterGun, bubble, whirlpool, octazooka, scald, waterPledge, hydroCannon, hydroPump, surf].map(
      (s) => [s.id, s]
    )
  )
);
