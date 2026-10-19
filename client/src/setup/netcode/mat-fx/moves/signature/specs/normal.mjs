// Design 065 slice 15: the Normal signature specs (tier S). Each spec is its Appendix S entry's
// board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S › Normal);
// departures from an entry are listed under the design's Deviations (slice 15).
//
// Design 075 user pass (slice 11): no orbiting orbs, crescents or facets, no halo, floor or
// shock rings, no speed rays, no swirl round the attacker. The wind-up is the attacker's motion
// and the move's own shape forming (the orb over Arceus, the crescents round Silvally's fist,
// the cannon charge); the glove, orb, notes, beam or crystals are what land, the flares arrive
// quickly and smaller, the flash is small and the heat faint. Relic Song keeps one ring: the
// song's own sound wave.

const motes = (at, count, over = {}) =>
  Object.freeze({
    at,
    anchor: 'defender',
    count,
    distance: 1.1,
    direction: -90,
    spread: 360,
    size: [0.03, 0.07],
    aspect: 1,
    gravity: 0,
    maxDelay: 0.2,
    durationMs: 800,
    kind: 'mote',
    ...over,
  });

const RING5 = Object.freeze([-90, -18, 54, 126, 198].map((angle) => Object.freeze({ angle, reach: 0.85 })));

/** The small contact flash the signatures keep (the TCG Live impact replaces it in a game). */
const flash = (at, tint) => ({ at, until: at + 150, layer: 'top', drawer: 'impactFlash', params: { r0: 0.2, r1: 0.6, tint } });
/** A star flare landing smaller and nearly whole, breaking up late. */
const star = (at, until, arms, tint) => ({ at, until, layer: 'front', drawer: 'starFlare', params: { arms, size: 0.4, width: 0.3, core: 0.14, grow: 0.12, breakAt: 0.7, tint } });

const GLOVE = Object.freeze({ deep: '#E8552B', body: '#FFFFFF', hot: '#FFF5B0', core: '#FFFFFF' });
const BURST = Object.freeze({ deep: '#E8552B', body: '#F2C230', hot: '#FFF5B0', core: '#FFFFFF' });

// Regigigas: a white five-fingered glove comes down from above and closes over the defender,
// then a yellow radial burst fires out of it.
export const crushGrip = Object.freeze({
  id: 'crush-grip',
  name: 'Crush Grip',
  vgType: 'normal',
  statClass: 'physical',
  tier: 'S',
  family: 'punch',
  material: 'normal',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.8,
  attacker: { motion: 'lunge', params: { wind: 0.36, reach: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.35 } },
  beats: [
    { at: 300, until: 1200, layer: 'top', drawer: 'grip', params: { size: 1.5, tint: GLOVE } },
    { at: 900, until: 1400, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35, tint: BURST } },
    flash(1100, BURST),
    { at: 1100, until: 1450, layer: 'front', drawer: 'shards', params: { count: 5, arc: 360, distance: 0.9, tint: BURST } },
    star(1150, 1550, 'cross', BURST),
  ],
  particles: [motes(1100, 8, { kind: 'streak', aspect: 0.4, durationMs: 700 })],
  grain: 0.12,
});

const ORB = Object.freeze({ deep: '#FF7A1A', body: '#FFB347', hot: '#FFE066', core: '#FFFFFF' });

// Arceus: a white-gold orb charges over its head, then drops onto the defender in a fiery
// four-point burst.
export const judgment = Object.freeze({
  id: 'judgment',
  name: 'Judgment',
  vgType: 'normal',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'normal',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.9,
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.35 } },
  beats: [
    { at: 150, until: 750, layer: 'front', drawer: 'coreCharge', params: { target: 'sky-attacker', r0: 0.16, r1: 0.42, from: 0.15, tint: ORB } },
    { at: 700, until: 1100, layer: 'front', drawer: 'projectile', params: { path: 'arc', from: 'sky-attacker', ease: 'linear', bow: 0.5, r0: 0.38, r1: 0.46, tongues: 4, tint: ORB } },
    { at: 900, until: 1500, layer: 'back', drawer: 'pillar', params: { from: 'above', height: 1.2, w: 0.3, count: 2, spread: 0.8, stagger: 100, tint: ORB } },
    { at: 1000, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35, tint: ORB } },
    flash(1100, ORB),
    star(1100, 1550, 'cross', ORB),
    { at: 1150, until: 1550, layer: 'front', drawer: 'shards', params: { count: 4, arc: 360, distance: 1.0, tint: ORB } },
    { at: 1400, until: 2200, layer: 'back', drawer: 'smoke', params: { count: 2, tint: ORB } },
  ],
  particles: [motes(1100, 8, { kind: 'ember', gravity: 0.2 })],
  grain: 0.12,
});

const SILVALLY = Object.freeze({ deep: '#3A2A10', body: '#FFB020', hot: '#FFE066', core: '#FFFFFF' });
const SLASH = Object.freeze({ deep: '#C8500E', body: '#FF9A1F', hot: '#FFD060', core: '#FFF2C8' });

// Silvally: two yellow crescent slashes sweep round its glowing fist, then three vertical
// yellow-white bursts strike the defender one after another.
export const multiAttack = Object.freeze({
  id: 'multi-attack',
  name: 'Multi-Attack',
  vgType: 'normal',
  statClass: 'physical',
  tier: 'S',
  family: 'punch',
  material: 'normal',
  durationMs: 2200,
  contactMs: 1050,
  pad: 1.8,
  attacker: { motion: 'lunge', params: { wind: 0.3, reach: 0.6, strikes: 3 } },
  defender: { motion: 'stagger', params: { hits: 3, strength: 0.45, gapMs: 220, lead: 440, heat: 0.35 } },
  tint: SILVALLY,
  beats: [
    { at: 0, until: 500, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.12, r1: 0.32, from: 0.15, tint: SLASH } },
    // The crescents sweep round the fist as it winds up: the move's own blades, not an orbit.
    { at: 300, until: 700, layer: 'front', drawer: 'slashArc', params: { target: 'attacker', count: 2, sweep: 140, radius: 0.45, gapDeg: 180, angle: 30, thick: 0.12, tint: SLASH } },
    { at: 580, until: 1300, layer: 'back', drawer: 'pillar', params: { from: 'below', height: 1.2, w: 0.3, count: 3, spread: 0.8, stagger: 220, tint: SLASH } },
    flash(1050, SLASH),
    { at: 1050, until: 1400, layer: 'front', drawer: 'shards', params: { count: 5, arc: 360, distance: 1.0, tint: SILVALLY } },
    { at: 1050, until: 1500, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35, tint: SILVALLY } },
    { at: 1350, until: 2000, layer: 'back', drawer: 'smoke', params: { count: 2, tint: SILVALLY } },
  ],
  particles: [motes(1050, 8, { kind: 'streak', aspect: 0.4, durationMs: 700 })],
  grain: 0.12,
});

const PASTEL = Object.freeze(['#FFB3E6', '#B3E8FF', '#C7F5A8', '#FFF3A8', '#B07CFF']);
const RING_PINK = Object.freeze({ deep: '#B07CFF', body: '#FF7ADF', hot: '#FFB3E6', core: '#FFFFFF' });

// Meloetta: music notes rise off it as it dances, then the notes fly across and a pink-violet
// ring (the song's sound wave) opens out at the defender.
export const relicSong = Object.freeze({
  id: 'relic-song',
  name: 'Relic Song',
  vgType: 'normal',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'normal',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.8,
  attacker: { motion: 'spin', params: { turns: 1 } },
  defender: { motion: 'stagger', params: { hits: 2, strength: 0.35, gapMs: 180, heat: 0.3 } },
  beats: [
    { at: 650, until: 1100, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 90, r0: 0.16, r1: 0.22, bow: 0.3, tongues: 0, hues: PASTEL } },
    flash(1100, RING_PINK),
    star(1100, 1450, RING5, RING_PINK),
    { at: 1100, until: 1700, layer: 'back', drawer: 'ring', params: { kind: 'face', count: 1, r0: 0.3, r1: 1.3, width: 0.05, tint: RING_PINK } },
    { at: 1100, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.3, tint: RING_PINK } },
  ],
  particles: [
    motes(100, 10, { anchor: 'attacker', kind: 'note', spread: 120, size: [0.22, 0.32], distance: 1.0, maxDelay: 0.5, durationMs: 1200 }),
    motes(1100, 10, { kind: 'note', spread: 200, size: [0.22, 0.32], distance: 1.1, maxDelay: 0.3, durationMs: 1000 }),
  ],
  grain: 0.12,
});

const TECHNO = Object.freeze({ deep: '#1A0E2E', body: '#A34BFF', hot: '#E9B8FF', core: '#FFFFFF' });
const SPARK = Object.freeze({ deep: '#1A0E2E', body: '#66E6FF', hot: '#C8FF6B', core: '#FFFFFF' });
const SMOKE = Object.freeze({ deep: '#1A0E2E', body: '#E9B8FF', hot: '#FFFFFF', core: '#FFFFFF' });

// Genesect: its cannon charges a violet-white ball, then fires a violet-white beam into the
// defender, which disappears into pale smoke with cyan sparks.
export const technoBlast = Object.freeze({
  id: 'techno-blast',
  name: 'Techno Blast',
  vgType: 'normal',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'normal',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.8,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.6 } },
  beats: [
    { at: 0, until: 1000, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.12, r1: 0.36, from: 0.25, tint: TECHNO } },
    { at: 800, until: 1100, layer: 'front', drawer: 'beam', params: { kind: 'widening', w: 0.5, tint: TECHNO } },
    { at: 1000, until: 1400, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.55, tint: TECHNO } },
    flash(1100, SMOKE),
    star(1100, 1500, 'cross', TECHNO),
    { at: 1100, until: 1600, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35, tint: TECHNO } },
    { at: 1150, until: 1550, layer: 'front', drawer: 'shards', params: { count: 4, arc: 360, distance: 0.9, tint: SPARK } },
    { at: 1200, until: 2100, layer: 'back', drawer: 'cloud', params: { count: 5, drift: 0.3, alpha: 0.45, tint: SMOKE } },
  ],
  particles: [motes(1100, 8, { kind: 'streak', aspect: 0.4, durationMs: 700 })],
  grain: 0.12,
});

const STAR_SHELL = Object.freeze({ deep: '#0F2A55', body: '#2FB8FF', hot: '#5FF2E0', core: '#E6FFFF' });

// Terapagos: starlight gathers on its shell, a cyan light pillar rises under it, faceted
// crystals fly down a beam of it, and cyan crystal shards burst on the defender.
export const teraStarstorm = Object.freeze({
  id: 'tera-starstorm',
  name: 'Tera Starstorm',
  vgType: 'normal',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'stellar',
  durationMs: 2200,
  contactMs: 1100,
  pad: 1.9,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.5 } },
  beats: [
    { at: 100, until: 850, layer: 'front', drawer: 'coreCharge', params: { lead: 0.3, r0: 0.1, r1: 0.28, from: 0.1 } },
    { at: 600, until: 1300, layer: 'back', drawer: 'pillar', params: { target: 'attacker', from: 'below', height: 1.2, w: 0.45 } },
    { at: 850, until: 1150, layer: 'back', drawer: 'beam', params: { kind: 'solid', w: 0.26, tint: { body: '#5FF2E0', hot: '#7CFFB2' } } },
    // The crystals fly whole down the starlight and land as the shards burst off the defender.
    { at: 800, until: 1100, layer: 'front', drawer: 'volley', params: { count: 3, stagger: 60, r0: 0.1, r1: 0.14, bow: 0.25, tongues: 0, unit: 'facet' } },
    { at: 800, until: 1700, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.35, tint: STAR_SHELL } },
    flash(1100, STAR_SHELL),
    // The crystals are the move: faceted shards burst whole off the defender.
    { at: 1100, until: 1450, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 1.0, unit: 'facet' } },
  ],
  particles: [motes(1100, 10, { kind: 'twinkle', size: [0.05, 0.1] })],
  grain: 0,
});

export const NORMAL_SIGNATURE_SPECS = Object.freeze({
  'crush-grip': crushGrip,
  judgment,
  'multi-attack': multiAttack,
  'relic-song': relicSong,
  'techno-blast': technoBlast,
  'tera-starstorm': teraStarstorm,
});
