// Design 063: Fire specs. Fire Blast is the acceptance reference: the look test the user
// approved (three takes, the third accepted), expressed as a MoveSpec. It is not a cell of
// the move table (the user's table names Blast Burn / Overheat / Flamethrower for the
// special tier-3 Fire cell); it stays as the reference every other special burst copies.
// Reference: B2W2 Fire Blast (five orbs, a flame cluster, the 大 flare) paced like the
// Scarlet / Violet video (fireball at the mouth, rings, white core, embers).

export const fireBlast = Object.freeze({
  id: 'fire-blast',
  name: 'Fire Blast',
  vgType: 'fire',
  statClass: 'special',
  tier: 3,
  family: 'burst',
  material: 'fire',
  durationMs: 1900,
  contactMs: 1000,
  pad: 1.7,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.3, heat: 1 } },
  beats: [
    { at: 0, until: 620, layer: 'back', drawer: 'orbitCharge', params: { count: 5, half: 'back' } },
    { at: 0, until: 620, layer: 'front', drawer: 'coreCharge', params: {} },
    { at: 0, until: 620, layer: 'front', drawer: 'orbitCharge', params: { count: 5, half: 'front' } },
    { at: 560, until: 940, layer: 'back', drawer: 'shockRings', params: { count: 2 } },
    { at: 620, until: 1000, layer: 'front', drawer: 'projectile', params: { r0: 0.34, r1: 0.56, bow: 0.2, tongues: 9 } },
    { at: 820, until: 1850, layer: 'back', drawer: 'vignette', params: { target: 'defender' } },
    { at: 1000, until: 1320, layer: 'back', drawer: 'speedRays', params: { count: 28 } },
    { at: 1000, until: 1750, layer: 'front', drawer: 'starFlare', params: { arms: 'dai' } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: {} },
    { at: 1300, until: 1900, layer: 'front', drawer: 'smoke', params: { count: 6 } },
  ],
  particles: [
    {
      at: 1000,
      anchor: 'defender',
      count: 22,
      distance: 1.3,
      direction: -90,
      spread: 300,
      size: [0.05, 0.13],
      aspect: 0.3,
      gravity: 0.6,
      maxDelay: 0.12,
      durationMs: 760,
      kind: 'ember',
    },
  ],
  grain: 0.28,
});

export const FIRE_SPECS = Object.freeze({ 'fire-blast': fireBlast });
