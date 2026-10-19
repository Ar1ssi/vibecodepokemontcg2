// Design 065 slices 10–11: the Psychic signature specs (tier S). Each spec is its Appendix S
// entry's board mapping (`.agent/designs/065-signature-move-animations.md` § Appendix S ›
// Psychic); departures from an entry are listed under the design's Deviations (slices 10–11).
//
// Design 075 user pass (slice 11): no orbiting orbs or rings, auras, halo, shock, floor or face
// rings; the wind-up is the attacker's motion and the move's own orb, dome, portal or wave
// forming. The orb, beam, blade or column is what lands; the star flares arrive quickly and
// smaller, orbs are kept small so their white core never blooms into a slab, the flash is small
// and the heat faint (the TCG Live impact replaces the dressing in a game).

/** Five spikes 72° apart: the entries' "starFlare arms 'ring'" inside the 30-tongue budget. */
const RING5 = Object.freeze([-90, -18, 54, 126, 198].map((angle) => Object.freeze({ angle, reach: 0.85 })));

/** The small contact flash the signatures keep. */
const flash = (at, tint) => ({ at, until: at + 150, layer: 'top', drawer: 'impactFlash', params: { r0: 0.2, r1: 0.6, tint } });
/** A star flare landing smaller and nearly whole, breaking up late. */
const star = (at, until, arms, tint, over = {}) => ({ at, until, layer: 'front', drawer: 'starFlare', params: { arms, size: 0.75, width: 0.3, core: 0.14, grow: 0.12, breakAt: 0.7, tint, ...over } });

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

const ORB = Object.freeze({ deep: '#5A2A9A', body: '#A65BEB', hot: '#CFABFF', core: '#FEFCFF' });
const ICE_BEAM = Object.freeze({ deep: '#0735F3', body: '#13B7FF', hot: '#CFF4FF', core: '#FEFCFF' });
const HAZE = Object.freeze({ deep: '#6A4FA8', body: '#CFABFF', hot: '#E8DAFF', core: '#FEFCFF' });
const SPLINTER = Object.freeze({ deep: '#4A4F5A', body: '#9AA3B0', hot: '#D8DEE6', core: '#FFFFFF' });

// Articuno: a purple orb glows at the breast, a dashed then solid cyan-white beam fires down
// the lane, and the defender breaks into grey splinters in a lilac haze.
export const freezingGlare = Object.freeze({
  id: 'freezing-glare',
  name: 'Freezing Glare',
  vgType: 'psychic',
  statClass: 'special',
  tier: 'S',
  family: 'beam',
  material: 'psychic',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'brace', params: { glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.35 } },
  beats: [
    { at: 0, until: 800, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.14, r1: 0.36, from: 0.2, rings: 1, tint: ORB } },
    { at: 500, until: 750, layer: 'front', drawer: 'beam', params: { kind: 'segmented', w: 0.12, gap: 0.4, tint: ICE_BEAM } },
    { at: 700, until: 1600, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.42, growIn: 0.25, retract: 0.35, tint: ICE_BEAM } },
    flash(1000, ICE_BEAM),
    { at: 1000, until: 1700, layer: 'back', drawer: 'shards', params: { count: 6, arc: 360, distance: 1.0, tint: SPLINTER } },
    { at: 1000, until: 2000, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.35, tint: HAZE } },
    { at: 1000, until: 2000, layer: 'back', drawer: 'cloud', params: { count: 4, drift: 0.5, alpha: 0.35, tint: HAZE } },
  ],
  particles: [motes(1000, 8)],
  grain: 0.1,
});

const SWAP = Object.freeze({ deep: '#D2137A', body: '#F09CEA', hot: '#FFFFFF', core: '#FFFFFF' });
const DOME = Object.freeze({ deep: '#F0CBEF', body: '#F09CEA', hot: '#FFFFFF', core: '#FFFFFF' });

// Manaphy / Magearna: a magenta swirl-orb is drawn out of the defender into the attacker under
// a pink dome, then sent back, and a pink dome closes on the defender. A status move: no hit.
export const heartSwap = Object.freeze({
  id: 'heart-swap',
  name: 'Heart Swap',
  vgType: 'psychic',
  statClass: 'status',
  tier: 'S',
  family: 'chime',
  material: 'psychic',
  durationMs: 2000,
  contactMs: 1100,
  pad: 1.7,
  attacker: { motion: 'brace', params: { glow: 0.6 } },
  defender: { motion: 'float', params: { lift: 0.15 } },
  beats: [
    { at: 300, until: 650, layer: 'front', drawer: 'coreCharge', params: { target: 'defender', lead: 0, r0: 0.14, r1: 0.32, tint: SWAP } },
    { at: 450, until: 900, layer: 'front', drawer: 'projectile', params: { from: 'defender', path: 'straight', r0: 0.26, r1: 0.36, tongues: 3, ease: 'linear', tint: SWAP } },
    { at: 850, until: 1300, layer: 'back', drawer: 'shade', params: { target: 'attacker', kind: 'dome', r: 0.85, fill: 'deep', fillAlpha: 0.35, rimAlpha: 0.8, swirl: 30, tint: DOME } },
    { at: 1050, until: 1500, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.26, r1: 0.36, tongues: 3, ease: 'linear', tint: SWAP } },
    { at: 1100, until: 1300, layer: 'front', drawer: 'glyph', params: { target: 'attacker', kind: 'heart', r: 0.6, tint: SWAP } },
    { at: 1450, until: 2000, layer: 'back', drawer: 'shade', params: { target: 'defender', kind: 'dome', r: 0.85, fill: 'deep', fillAlpha: 0.35, rimAlpha: 0.8, swirl: 30, tint: DOME } },
  ],
  particles: [motes(850, 6, { anchor: 'attacker', kind: 'twinkle', durationMs: 600 }), motes(1450, 6, { kind: 'twinkle', durationMs: 600 })],
  grain: 0.1,
});

const PORTAL = Object.freeze({ deep: '#1B0630', body: '#7B2CB8', hot: '#E040E0', core: '#FCE6FF' });
const BURST = Object.freeze({ deep: '#3050FF', body: '#E040E0', hot: '#FCE6FF', core: '#FFFFFF' });

// Hoopa: a dark violet portal swallows the attacker, a second one opens at the defender and
// lets it out, and a magenta-and-white starburst bursts on the defender.
export const hyperspaceHole = Object.freeze({
  id: 'hyperspace-hole',
  name: 'Hyperspace Hole',
  vgType: 'psychic',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'psychic',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'warp', params: {} },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.35 } },
  beats: [
    { at: 0, until: 650, layer: 'back', drawer: 'shade', params: { target: 'attacker', kind: 'disc', r: 1.0, fill: 'body', fillAlpha: 0.55, rimAlpha: 0.3, swirl: 90, tint: PORTAL } },
    { at: 350, until: 1000, layer: 'back', drawer: 'shade', params: { target: 'defender', kind: 'disc', r: 0.9, fill: 'body', fillAlpha: 0.55, rimAlpha: 0.3, swirl: 90, tint: PORTAL } },
    { at: 350, until: 1000, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.4, tint: PORTAL } },
    flash(1000, BURST),
    star(1000, 1550, RING5, BURST),
    { at: 1000, until: 1800, layer: 'back', drawer: 'shards', params: { count: 4, arc: 360, distance: 1.1, tint: BURST } },
    { at: 1000, until: 2000, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.35, tint: BURST } },
  ],
  particles: [motes(1000, 7, { durationMs: 700 })],
  grain: 0.1,
});

const WHITE_HOT = Object.freeze({ deep: '#C9B24A', body: '#E4F5A0', hot: '#FFFFFE', core: '#FFFFFF' });
const IMPACT = Object.freeze({ deep: '#8A3A10', body: '#FFF35C', hot: '#FFFBD0', core: '#FFFFFF' });
const SPD = Object.freeze({ deep: '#2A2E9A', body: '#6468F1', hot: '#B8BAFF', core: '#FFFFFF' });

// Latios: it whitens as the orb charges, flings the white-hot orb high over the lane onto the
// defender, which takes a yellow-white burst with dark orange cracks under a blue haze.
export const lusterPurge = Object.freeze({
  id: 'luster-purge',
  name: 'Luster Purge',
  vgType: 'psychic',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'psychic',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.35 } },
  beats: [
    { at: 0, until: 650, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.12, r1: 0.32, from: 0.2, tint: WHITE_HOT } },
    { at: 400, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.6, r0: 0.26, r1: 0.34, tongues: 4, tint: WHITE_HOT } },
    flash(1000, IMPACT),
    star(1000, 1500, 'cross', IMPACT),
    { at: 1000, until: 1700, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.2, tint: IMPACT } },
    { at: 1150, until: 2100, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.32, tint: SPD } },
  ],
  particles: [motes(1000, 8, { kind: 'ember', gravity: 0.3, distance: 1.2, durationMs: 700 }), motes(1300, 5, { kind: 'twinkle' })],
  grain: 0.1,
});

const MIST = Object.freeze({ deep: '#A77BFF', body: '#E9D5FF', hot: '#FFFFFF', core: '#FFFFFF' });
const STAR = Object.freeze({ deep: '#FF8A4C', body: '#FFF3A3', hot: '#FFFBE0', core: '#FFFFFF' });
const PINK_MIST = Object.freeze({ deep: '#C08AE0', body: '#F5C6F0', hot: '#FFFFFF', core: '#FFFFFF' });

// Latias: a lilac mist orb with white feathers forms at its mouth, arcs high over the lane and
// drops onto the defender in a yellow-white star that melts into a pale lilac mist.
export const mistBall = Object.freeze({
  id: 'mist-ball',
  name: 'Mist Ball',
  vgType: 'psychic',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'psychic',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'brace', params: { glow: 0.6 } },
  defender: { motion: 'float', params: { lift: 0.15 } },
  beats: [
    { at: 0, until: 400, layer: 'back', drawer: 'cloud', params: { target: 'attacker', count: 4, radius: 0.3, drift: 0.5, alpha: 0.35, tint: MIST } },
    { at: 0, until: 450, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.12, r1: 0.32, from: 0.15, tint: MIST } },
    { at: 300, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.6, r0: 0.28, r1: 0.36, tongues: 4, ease: 'linear', tint: MIST } },
    flash(1000, STAR),
    star(1000, 1400, 'cross', STAR),
    { at: 1100, until: 2100, layer: 'front', drawer: 'cloud', params: { count: 5, radius: 0.4, drift: 0.6, alpha: 0.4, tint: PINK_MIST } },
    { at: 1000, until: 1900, layer: 'back', drawer: 'spiral', params: { turns: 1.5, r0: 0.2, r1: 0.9, rpm: 90, tongues: 6, tint: MIST } },
  ],
  particles: [motes(1000, 6, { kind: 'ember', gravity: 0.3, durationMs: 600 }), motes(1200, 6, { kind: 'twinkle', gravity: 0.1, durationMs: 900 })],
  grain: 0.1,
});

const RINGS = Object.freeze({ deep: '#B0307A', body: '#FF4FB8', hot: '#7FE7FF', core: '#FFFFFF' });
const PALE = Object.freeze({ deep: '#7A5AC0', body: '#9FE0FF', hot: '#E8DAFF', core: '#FFFFFF' });

// Azelf / Mesprit / Uxie: a lilac-white light charges as it rises, the psychic wave closes
// round the defender, and a magenta-pink starburst bursts on it.
export const mysticalPower = Object.freeze({
  id: 'mystical-power',
  name: 'Mystical Power',
  vgType: 'psychic',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'psychic',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'rise', params: {} },
  defender: { motion: 'float', params: { lift: 0.15 } },
  beats: [
    { at: 0, until: 800, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.12, r1: 0.32, from: 0.2, tint: PALE } },
    // The wave closes on the defender before the star bursts inside it.
    { at: 600, until: 1600, layer: 'front', drawer: 'glyph', params: { r: 0.9, tint: RINGS } },
    flash(1000, RINGS),
    star(1000, 1550, RING5, RINGS),
    { at: 1000, until: 1900, layer: 'back', drawer: 'cloud', params: { count: 5, radius: 0.4, drift: 0.4, alpha: 0.35, tint: PALE } },
  ],
  particles: [motes(1000, 8, { kind: 'twinkle' })],
  grain: 0.1,
});

const RED_CORE = Object.freeze({ deep: '#2A0505', body: '#8B0D0D', hot: '#FF5A7A', core: '#FFFFFF' });
const LIME = Object.freeze({ deep: '#5E9A1A', body: '#A5FF5A', hot: '#E7FF57', core: '#FFFFFF' });
const GEYSER = Object.freeze({ deep: '#1F9A8A', body: '#5AE8C8', hot: '#BFF6FF', core: '#FFFFFF' });

// Necrozma: a red-black sphere with a white core swells at the chest, a lime orb flies into the
// defender, and a cyan-green column erupts from the defender's floor with rock chunks.
export const photonGeyser = Object.freeze({
  id: 'photon-geyser',
  name: 'Photon Geyser',
  vgType: 'psychic',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'psychic',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'brace', params: { glow: 0.6 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.35 } },
  beats: [
    { at: 0, until: 550, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.14, r1: 0.4, from: 0.15, rings: 1, tint: RED_CORE } },
    { at: 500, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.28, r1: 0.36, tongues: 4, ease: 'linear', tint: LIME } },
    flash(1000, LIME),
    star(1000, 1450, 'cross', LIME),
    { at: 1000, until: 1700, layer: 'back', drawer: 'shards', params: { count: 4, arc: 360, distance: 1.0, unit: 'body', tint: { deep: '#1E1B1F', body: '#4A4550', hot: '#8A8590', core: '#C8C4CC' } } },
    { at: 1100, until: 2000, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.2, w: 0.5, tint: GEYSER } },
    { at: 1000, until: 2000, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.35, tint: GEYSER } },
  ],
  particles: [motes(1000, 6, { durationMs: 900 }), motes(1500, 6, { kind: 'shard', gravity: 0.2, distance: 1.2, durationMs: 700 })],
  grain: 0.1,
});

const PRISM = Object.freeze(['#FF5FA2', '#FFD84A', '#4DFF9A', '#47E6FF', '#B98CFF']);
const PRISM_ORB = Object.freeze({ deep: '#B98CFF', body: '#E8F4FF', hot: '#FFFFFF', core: '#FFFFFF' });
const PRISM_BURST = Object.freeze({ deep: '#B98CFF', body: '#47E6FF', hot: '#E8FFFF', core: '#FFFFFF' });

// Necrozma: the prism charges a white-hot orb that flares beside it, and a five-hue column rises
// from the defender's floor and bursts in sparks.
export const prismaticLaser = Object.freeze({
  id: 'prismatic-laser',
  name: 'Prismatic Laser',
  vgType: 'psychic',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'psychic',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.35, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.35 } },
  beats: [
    { at: 0, until: 650, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.12, r1: 0.32, from: 0.15, tint: PRISM_ORB } },
    { at: 600, until: 850, layer: 'front', drawer: 'starFlare', params: { target: 'attacker', arms: RING5, size: 0.55, width: 0.3, core: 0.14, tint: PRISM_ORB } },
    flash(1000, PRISM_BURST),
    { at: 1000, until: 1900, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.2, w: 0.36, count: 3, spread: 0.5, stagger: 60, hues: PRISM } },
    star(1000, 1450, 'cross', PRISM_BURST),
    { at: 1000, until: 1900, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.35, tint: PRISM_BURST } },
    { at: 1000, until: 1900, layer: 'back', drawer: 'cloud', params: { count: 4, drift: 0.5, alpha: 0.35, tint: PRISM_ORB } },
  ],
  particles: [motes(0, 5, { anchor: 'attacker', kind: 'twinkle', durationMs: 600 }), motes(1000, 6, { kind: 'twinkle', durationMs: 900 })],
  grain: 0.1,
});

const BLADE = Object.freeze({ deep: '#4E1288', body: '#B31DB7', hot: '#FF7AF0', core: '#FFFFFF' });
const VIOLET_BURST = Object.freeze({ deep: '#4E1288', body: '#DB96FC', hot: '#F4E0FF', core: '#FFFFFF' });

// Iron Leaves: it dashes in, a long magenta psychic crescent crosses the field into the
// defender, and a violet-pink explosion engulfs it.
export const psyblade = Object.freeze({
  id: 'psyblade',
  name: 'Psyblade',
  vgType: 'psychic',
  statClass: 'physical',
  tier: 'S',
  family: 'dash',
  material: 'psychic',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'dash', params: { wind: 0.3 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.35 } },
  beats: [
    { at: 500, until: 1000, layer: 'front', drawer: 'slashArc', params: { target: 'defender', sweep: 120, radius: 1.0, count: 2, gapDeg: 30, angle: 45, thick: 0.22, tint: BLADE } },
    flash(1000, VIOLET_BURST),
    { at: 1000, until: 1500, layer: 'front', drawer: 'shards', params: { count: 5, arc: 360, distance: 1.0, tint: VIOLET_BURST } },
    { at: 1000, until: 2000, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.35, tint: VIOLET_BURST } },
    { at: 1000, until: 2000, layer: 'back', drawer: 'cloud', params: { count: 4, drift: 0.5, alpha: 0.35, tint: VIOLET_BURST } },
    { at: 1000, until: 2000, layer: 'back', drawer: 'spiral', params: { turns: 1, r0: 0.2, r1: 0.8, rpm: 120, tongues: 6, tint: BLADE } },
  ],
  particles: [motes(1100, 8, { kind: 'twinkle', durationMs: 800 })],
  grain: 0.1,
});

const BOOST = Object.freeze({ deep: '#2A0A4A', body: '#C23CFF', hot: '#3CE8FF', core: '#FFFFFF' });
const BOOST_BURST = Object.freeze({ deep: '#C23CFF', body: '#FF4FD8', hot: '#E8F8FF', core: '#FFFFFF' });

// Deoxys: a violet-white orb ringed with a cyan arc forms over it, flies straight down the
// lane, and bursts on the defender in a white-violet star inside the psychic wave.
export const psychoBoost = Object.freeze({
  id: 'psycho-boost',
  name: 'Psycho Boost',
  vgType: 'psychic',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'psychic',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.35, glow: 1 } },
  defender: { motion: 'float', params: { lift: 0.15 } },
  beats: [
    { at: 0, until: 600, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.14, r1: 0.4, from: 0.15, rings: 1, tint: BOOST } },
    { at: 0, until: 600, layer: 'back', drawer: 'cloud', params: { target: 'attacker', count: 4, radius: 0.35, drift: 0.3, alpha: 0.35, tint: BOOST } },
    { at: 500, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.3, r1: 0.4, tongues: 4, ease: 'linear', tint: BOOST } },
    flash(1000, BOOST_BURST),
    star(1000, 1550, RING5, BOOST_BURST),
    { at: 1000, until: 1600, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.35, tint: BOOST } },
    { at: 1000, until: 1700, layer: 'back', drawer: 'glyph', params: { r: 0.9, tint: BOOST_BURST } },
  ],
  particles: [motes(1000, 7, { kind: 'twinkle', durationMs: 800 })],
  grain: 0.1,
});

const STRIKE = Object.freeze({ deep: '#8A3CFF', body: '#FFD84A', hot: '#FF6FD0', core: '#FFFFFF' });
const PAD = Object.freeze({ deep: '#3A107A', body: '#8A3CFF', hot: '#C9A0FF', core: '#FFFFFF' });
const FLARE = Object.freeze({ deep: '#C04A10', body: '#FF9A2A', hot: '#FFE0A0', core: '#FFFFFF' });

// Mewtwo: its hands draw a ringed cluster over a violet pad, the cluster is thrown down the
// lane, and an orange-white flare bursts on the defender.
export const psystrike = Object.freeze({
  id: 'psystrike',
  name: 'Psystrike',
  vgType: 'psychic',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'psychic',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.8,
  attacker: { motion: 'lunge', params: { wind: 0.4, reach: 0.6, glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.35 } },
  beats: [
    { at: 0, until: 600, layer: 'back', drawer: 'glyph', params: { target: 'attacker', r: 0.9, tint: PAD } },
    { at: 200, until: 600, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.14, r1: 0.36, tint: STRIKE } },
    { at: 500, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'arc', bow: 0.5, r0: 0.34, r1: 0.44, tongues: 0, ease: 'linear', unit: 'rings', tint: STRIKE } },
    flash(1000, FLARE),
    star(1000, 1550, RING5, FLARE),
    { at: 1000, until: 1500, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.35, tint: PAD } },
  ],
  particles: [motes(1000, 6, { kind: 'twinkle', durationMs: 700 })],
  grain: 0.1,
});

export const PSYCHIC_SIGNATURE_SPECS = Object.freeze({
  'freezing-glare': freezingGlare,
  'heart-swap': heartSwap,
  'hyperspace-hole': hyperspaceHole,
  'luster-purge': lusterPurge,
  'mist-ball': mistBall,
  'mystical-power': mysticalPower,
  'photon-geyser': photonGeyser,
  'prismatic-laser': prismaticLaser,
  psyblade,
  'psycho-boost': psychoBoost,
  psystrike,
});
