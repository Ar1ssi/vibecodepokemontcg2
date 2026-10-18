// Design 063: Fire specs. Fire Blast is the acceptance reference: the look test the user
// approved (three takes, the third accepted), expressed as a MoveSpec. It is not a cell of
// the move table (the user's table names Blast Burn / Overheat / Flamethrower for the
// special tier-3 Fire cell); it stays as the reference every other special burst copies.
// Design 075 user pass: no orbit charge or speed rays; the 大 itself flies and lands whole,
// and the contact dressing is kept small (no flash, a faint heat sheen) so the shape stays legible.

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
  defender: { motion: 'knock', params: { strength: 0.3, heat: 0.35 } },
  beats: [
    // The 大 ignites at the attacker and flies whole; at contact a held flare of the same size
    // takes over on the defender and breaks up late, so the shape reads the whole way.
    { at: 160, until: 1000, layer: 'front', drawer: 'projectile', params: { flare: 'dai', size: 0.8, flareWidth: 0.28, flareCore: 0.14, bow: 0.12 } },
    { at: 820, until: 1850, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.3 } },
    { at: 1000, until: 1700, layer: 'front', drawer: 'starFlare', params: { arms: 'dai', size: 0.8, width: 0.28, core: 0.14, grow: 0, breakAt: 0.72 } },
    { at: 1350, until: 1850, layer: 'front', drawer: 'smoke', params: { count: 3 } },
  ],
  particles: [
    {
      at: 1000,
      anchor: 'defender',
      count: 10,
      distance: 0.9,
      direction: -90,
      spread: 300,
      size: [0.05, 0.11],
      aspect: 0.3,
      gravity: 0.6,
      maxDelay: 0.12,
      durationMs: 640,
      kind: 'ember',
    },
  ],
  grain: 0.28,
});

export const FIRE_SPECS = Object.freeze({ 'fire-blast': fireBlast });
