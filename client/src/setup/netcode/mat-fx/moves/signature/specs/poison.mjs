// Design 065 slice 9: the Poison signature spec (tier S). The spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Poison);
// departures from the entry are listed under the design's Deviations (slice 9).

const CHAIN = Object.freeze({ deep: '#5A1A55', body: '#FF00E6', hot: '#B7F3FE', core: '#FFFFFF' });
const CAGE = Object.freeze({ deep: '#5A1A55', body: '#9F4492', hot: '#D08AAC', core: '#FFE6F8' });
const BURST = Object.freeze({ deep: '#9F4492', body: '#D769DD', hot: '#FF9CF0', core: '#FFFFFF' });

// Pecharunt: a magenta ring-chain whips down the lane, winds the defender into a tall cage of
// rings, and a magenta burst flashes inside the cage before it fades to pink.
export const malignantChain = Object.freeze({
  id: 'malignant-chain',
  name: 'Malignant Chain',
  vgType: 'poison',
  statClass: 'special',
  tier: 'S',
  family: 'projectile',
  material: 'poison',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.4 } },
  beats: [
    { at: 0, until: 400, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, tint: CHAIN } },
    { at: 0, until: 600, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.55, tint: CHAIN } },
    { at: 300, until: 1700, layer: 'front', drawer: 'chain', params: { links: 12, r: 0.13, tint: CHAIN } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: BURST } },
    { at: 1000, until: 1350, layer: 'back', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: BURST } },
    { at: 1000, until: 1400, layer: 'back', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: BURST } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45, tint: CAGE } },
    { at: 1100, until: 2000, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 3, r0: 0.5, r1: 1.0, width: 0.06, tint: CAGE } },
    { at: 1350, until: 2150, layer: 'front', drawer: 'spiral', params: { turns: 2, r0: 0.3, r1: 1.0, rpm: 90, tongues: 10, tint: CAGE } },
    { at: 1300, until: 2200, layer: 'back', drawer: 'cloud', params: { count: 6, drift: 0.5, alpha: 0.4, tint: { body: '#D08AAC', hot: '#FBD3EA' } } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 20, distance: 1.1, direction: -90, spread: 360, size: [0.05, 0.1], aspect: 0.9, gravity: 0.3, maxDelay: 0.12, durationMs: 800, kind: 'glob' },
  ],
  grain: 0.14,
});

export const POISON_SIGNATURE_SPECS = Object.freeze({
  'malignant-chain': malignantChain,
});
