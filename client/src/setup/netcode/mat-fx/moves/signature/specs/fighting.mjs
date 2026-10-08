// Design 065 slice 9: the Fighting signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Fighting);
// departures from an entry are listed under the design's Deviations (slice 9).

/** A CSS burst on the defender, in the spec material's particle colour. */
const burst = (at, count, kind, over = {}) =>
  Object.freeze({
    at,
    anchor: 'defender',
    count,
    distance: 1.2,
    direction: -90,
    spread: 300,
    size: [0.04, 0.09],
    aspect: 0.6,
    gravity: 0.6,
    maxDelay: 0.12,
    durationMs: 760,
    kind,
    ...over,
  });

const FLAME_RING = Object.freeze({ deep: '#FF7A1A', body: '#F4C93E', hot: '#FFC85E', core: '#FFFFBE' });
const CREST = Object.freeze({ deep: '#5A2A8A', body: '#D85EFF', hot: '#F2E6FF', core: '#FFFFFF' });

// Koraidon: its violet-white crest loops, it leaps down the lane behind a gold-orange flame ring
// that rolls into the defender and bursts in gold-white with rock chunks.
export const collisionCourse = Object.freeze({
  id: 'collision-course',
  name: 'Collision Course',
  vgType: 'fighting',
  statClass: 'physical',
  tier: 'S',
  family: 'dash',
  material: 'fighting',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'dash', params: { wind: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.6 } },
  beats: [
    { at: 0, until: 700, layer: 'back', drawer: 'orbitCharge', params: { count: 3, half: 'back', r0: 0.16, r1: 0.24, tongues: 3, tint: CREST } },
    { at: 0, until: 700, layer: 'front', drawer: 'orbitCharge', params: { count: 3, half: 'front', r0: 0.16, r1: 0.24, tongues: 3, tint: CREST } },
    { at: 450, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', ease: 'linear', r0: 0.45, r1: 0.7, tongues: 8, unit: 'wheel', tint: FLAME_RING } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: FLAME_RING } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, unit: 'body' } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 2, r0: 0.3, r1: 1.4, tint: FLAME_RING } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'speedRays', params: { count: 12, tint: FLAME_RING } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
    { at: 1100, until: 1900, layer: 'front', drawer: 'pillar', params: { count: 2, spread: 1.0, height: 1.4, w: 0.4, stagger: 120, tint: FLAME_RING } },
    { at: 1400, until: 2200, layer: 'front', drawer: 'smoke', params: { count: 4 } },
  ],
  particles: [burst(1000, 20, 'ember')],
  grain: 0.14,
});

const CYAN_BLADE = Object.freeze({ deep: '#0B5E7A', body: '#3CE8FF', hot: '#C8FBFF', core: '#FFFFFF' });
const MAGENTA_BLADE = Object.freeze({ deep: '#7A0B63', body: '#FF4FD8', hot: '#FFC8F3', core: '#FFF5FF' });
const STAR_GOLD = Object.freeze({ deep: '#FF8A2A', body: '#FFD84A', hot: '#FFF3B0', core: '#FFF5FF' });

// Cobalion / Terrakion / Virizion / Keldeo: a leaping dash, a cyan blade streak and a crossed
// magenta streak over the defender, then a yellow-orange star knocks it back.
export const sacredSword = Object.freeze({
  id: 'sacred-sword',
  name: 'Sacred Sword',
  vgType: 'fighting',
  statClass: 'physical',
  tier: 'S',
  family: 'dash',
  material: 'fighting',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'dash', params: { wind: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.5 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { hz: 3, alpha: 0.5, tint: { body: '#8FD7B5', hot: '#FFF5FF' } } },
    { at: 300, until: 800, layer: 'front', drawer: 'shards', params: { target: 'attacker', count: 6, arc: 90, distance: 0.8, tint: { body: '#8FD7B5', hot: '#FFF5FF' } } },
    { at: 300, until: 800, layer: 'front', drawer: 'slashArc', params: { sweep: 120, radius: 0.9, count: 2, gapDeg: 30, angle: 45, thick: 0.2, tint: CYAN_BLADE } },
    { at: 600, until: 1000, layer: 'front', drawer: 'slashArc', params: { sweep: 120, radius: 0.9, count: 2, gapDeg: 30, angle: -45, thick: 0.2, tint: MAGENTA_BLADE } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: STAR_GOLD } },
    { at: 1000, until: 1450, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: STAR_GOLD } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: STAR_GOLD } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'speedRays', params: { count: 12, tint: STAR_GOLD } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
  ],
  particles: [burst(1000, 20, 'streak', { aspect: 0.2, gravity: 0, durationMs: 650, spread: 360 })],
  grain: 0.12,
});

const WHITE_GOLD = Object.freeze({ deep: '#FF8A2A', body: '#FFD84A', hot: '#FFF6C8', core: '#FFFFFF' });

// Keldeo: a white-gold sparkle at the chest inside a rainbow ring, a white flare crosses the
// lane, and a yellow-white star with orange streaks lands on the defender.
export const secretSword = Object.freeze({
  id: 'secret-sword',
  name: 'Secret Sword',
  vgType: 'fighting',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'fighting',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'brace', params: { glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 0, until: 500, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.6, tint: WHITE_GOLD } },
    { at: 0, until: 800, layer: 'back', drawer: 'ring', params: { target: 'attacker', kind: 'face', count: 3, r0: 0.4, r1: 1.0, width: 0.08, hues: ['#5ADCFF', '#FF4FD8', '#FFD84A'] } },
    { at: 200, until: 720, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.18, r1: 0.5, rings: 1, tint: WHITE_GOLD } },
    { at: 700, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', ease: 'linear', r0: 0.3, r1: 0.5, tongues: 4, tint: WHITE_GOLD } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: WHITE_GOLD } },
    { at: 1000, until: 1450, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: WHITE_GOLD } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, tint: WHITE_GOLD } },
    { at: 1000, until: 1500, layer: 'back', drawer: 'speedRays', params: { count: 10, tint: { deep: '#B04A10', body: '#FF8A2A', hot: '#FFD84A', core: '#FFFFFF' } } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45 } },
  ],
  particles: [burst(1000, 22, 'streak', { aspect: 0.2, gravity: 0, durationMs: 650, spread: 360 })],
  grain: 0.12,
});

const KICK_RED = Object.freeze({ deep: '#7A0A05', body: '#FF2A1A', hot: '#FF8A2A', core: '#FFF176' });
const SHOCK = Object.freeze({ deep: '#FF8A2A', body: '#FFD84A', hot: '#FFF176', core: '#FFFFFF' });

// Galarian Zapdos: a red flame kick down the lane, a yellow shock streak and star on the
// defender, then a yellow flame column with white dust.
export const thunderousKick = Object.freeze({
  id: 'thunderous-kick',
  name: 'Thunderous Kick',
  vgType: 'fighting',
  statClass: 'physical',
  tier: 'S',
  family: 'dash',
  material: 'fighting',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'dash', params: { wind: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.7 } },
  beats: [
    { at: 300, until: 1000, layer: 'back', drawer: 'aura', params: { hz: 3, alpha: 1, r0: 0.8, r1: 1.2, tint: KICK_RED } },
    { at: 450, until: 1000, layer: 'front', drawer: 'speedRays', params: { target: 'attacker', count: 14, inner: 0.4, outer: 1.2, tint: KICK_RED } },
    { at: 400, until: 1000, layer: 'back', drawer: 'vignette', params: { target: 'attacker', maxAlpha: 0.35, tint: KICK_RED } },
    { at: 1000, until: 1180, layer: 'top', drawer: 'impactFlash', params: { tint: SHOCK } },
    { at: 1000, until: 1300, layer: 'front', drawer: 'bolt', params: { from: 'attacker', segments: 9, jag: 0.12, branches: 2, rerollMs: 45, tint: SHOCK } },
    { at: 1000, until: 1450, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', width: 0.46, tint: SHOCK } },
    { at: 1000, until: 1500, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 1.1, tint: SHOCK } },
    { at: 1000, until: 1600, layer: 'back', drawer: 'speedRays', params: { count: 12, tint: SHOCK } },
    { at: 1000, until: 1800, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.45, tint: SHOCK } },
    { at: 1450, until: 2100, layer: 'front', drawer: 'pillar', params: { height: 1.6, w: 0.6, tint: SHOCK } },
    { at: 1500, until: 2200, layer: 'front', drawer: 'smoke', params: { count: 4 } },
  ],
  particles: [burst(1000, 20, 'ember')],
  grain: 0.14,
});

export const FIGHTING_SIGNATURE_SPECS = Object.freeze({
  'collision-course': collisionCourse,
  'sacred-sword': sacredSword,
  'secret-sword': secretSword,
  'thunderous-kick': thunderousKick,
});
