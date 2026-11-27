// Design 092 § Work plan, group water-ice: the Max / G-Max Move specs (tier 'S') of Max Geyser,
// G-Max Cannonade, G-Max Foam Burst, G-Max Stonesurge, G-Max Hydrosnipe, G-Max Rapid Flow,
// Max Hailstorm and G-Max Resonance. Each spec is its Appendix M entry's board mapping
// (.agent/designs/092-max-move-animations.md); every header below is the move's reference brief
// from its Sword/Shield clip (Poképédia `<Nom>_EB.mp4`), palettes sampled from the effect.
//
// The house rules bind (vfx-design § Hard rules): the clip's whiteout and full-screen tints are
// dropped, no floor rings round the attacker, the contact flash stays small (TCG Live's impact
// prefab replaces it in a game), one palette from charge to payoff. Water is thrown streams that
// fall (splash, rain), never rigid columns (a water pillar read as a glass tube); ice is facets
// and stones that grow, stand and shatter.

/** The contact flash every spec keeps (dropped in a game for the TCG Live impact). */
const flash = (at, tint) => ({ at, until: at + 150, layer: 'top', drawer: 'impactFlash', params: { r0: 0.2, r1: 0.55, ...(tint ? { tint } : {}) } });

/** Light and bubbles gathering round the attacker as its water orb charges. */
const charging = (at = 100) =>
  Object.freeze({ at, anchor: 'attacker', count: 14, distance: 0.6, direction: -90, spread: 360, size: [0.07, 0.13], aspect: 1, gravity: 0, maxDelay: 0.35, durationMs: 800, kind: 'mote' });

/** A burst of water drops thrown off the defender, falling. */
const droplets = (at, over = {}) =>
  Object.freeze({
    at,
    anchor: 'defender',
    count: 12,
    distance: 1.3,
    direction: -90,
    spread: 220,
    size: [0.04, 0.1],
    aspect: 0.6,
    gravity: 0.9,
    maxDelay: 0.12,
    durationMs: 820,
    kind: 'droplet',
    ...over,
  });

// ---- the geyser frame: Max Geyser, G-Max Foam Burst and G-Max Stonesurge share it in the game ----

/**
 * The shared geyser: a water orb swells at the attacker's mouth in its own cool light; a
 * pressurised torrent (a bright core in a widening stream) lands on the defender at contact
 * (1000 ms); the geyser erupts out of the card as a crown of water 2-3 card heights tall (the
 * splashCrown drawer: no rigid column, which on this kit reads as a glass tube, ice), throwing
 * drops; the water rains back down on the card as mist hangs. The crown starts 20 ms before
 * contact, so the game's impact prefab never strips it (it replaces contact dressing only). `tint`
 * colours the water; `extra` adds the move's own touch (bubbles, stones); `jet` / `crown` / `rain`
 * trim the spray when a touch needs the tongue budget.
 */
/** The orb's own cool light: the clear water drop takes its colour from what it bends. */
const ORB_LIGHT = Object.freeze({ deep: '#2A9AD8', body: '#A8F0FF', hot: '#E2FAFF', core: '#F4FDFF' });

const geyserBeats = (tint, { extra = [], rain = 6, crown = {} } = {}) => [
  { at: 100, until: 700, layer: 'front', drawer: 'cloud', params: { target: 'attacker', dx: 0.42, count: 4, radius: 0.3, drift: 0.04, alpha: 0.8, tint: ORB_LIGHT } },
  { at: 0, until: 700, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.14, r1: 0.44, from: 0.05, tint } },
  // growIn 0.4 of 1000 ms: the torrent's head lands on the defender at 1000; its bright core
  // retracts first, as the geyser takes over.
  { at: 600, until: 1250, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.1, growIn: 0.4, retract: 0.3, tint } },
  { at: 600, until: 1600, layer: 'front', drawer: 'beam', params: { kind: 'widening', w: 0.5, growIn: 0.4, retract: 0.25, tint } },
  { at: 980, until: 2150, layer: 'front', drawer: 'splashCrown', params: { height: 2.5, width: 1.25, copies: 3, spread: 20, drops: 6, ...crown, tint } },
  flash(1000, tint),
  { at: 1150, until: 2250, layer: 'front', drawer: 'cloud', params: { count: 5, radius: 0.5, drift: 0.4, direction: -90, alpha: 0.45 } },
  { at: 1450, until: 2250, layer: 'front', drawer: 'rain', params: { count: rain, height: 1.6, spread: 1.2, tint } },
  ...extra,
];

const GEYSER = Object.freeze({ deep: '#0E4A86', body: '#2A9AD8', hot: '#8FDDF2', core: '#DDF6FF' });

// Max Geyser (Hydromax_EB.mp4, 9.5 s): a cyan orb swells at the mouth as bubbles and speed lines
// stream in (1.8–3.0 s) · a broad torrent blasts across to the target (3.3–4.6) · a giant geyser
// erupts under it, foam spikes and rocks flung up (4.8–6.3) · whiteout · a cyan pool ripples and
// bubbles at its feet (7.8–9). Water #3CA4B4 / #2E8FD0, deep #0B3359, foam #B3E5E7 (frames 3.6–8.0 s).
export const maxGeyser = Object.freeze({
  id: 'max-geyser',
  name: 'Max Geyser',
  vgType: 'water',
  statClass: 'special',
  tier: 'S',
  family: 'splash',
  material: 'water',
  durationMs: 2300,
  contactMs: 1000,
  pad: 2,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.35, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.35 } },
  tint: GEYSER,
  beats: geyserBeats(GEYSER),
  particles: [charging(), droplets(1000)],
  grain: 0.2,
});

const FOAM = Object.freeze({ deep: '#123F8C', body: '#3F86E9', hot: '#A8D8FA', core: '#E6F6FF' });

// G-Max Foam Burst (Bulles_G-Max_EB.mp4): Kingler's claw gathers a water orb wrapped in bubbles,
// bubbles stream everywhere (2.4–3.2 s) · the torrent fires, bubbles riding it (3.4–4.2) · the
// geyser erupts at the target (4.4–5.4) · whiteout. Water #3F86E9, deep #0B3359, foam #C3FCFF.
// Its own touch: bubbles — a train of clear bubbles riding the torrent, more rising off the geyser.
export const gmaxFoamBurst = Object.freeze({
  id: 'g-max-foam-burst',
  name: 'G-Max Foam Burst',
  vgType: 'water',
  statClass: 'physical',
  tier: 'S',
  family: 'splash',
  material: 'water',
  durationMs: 2300,
  contactMs: 1000,
  pad: 2,
  attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.3, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.35 } },
  tint: FOAM,
  beats: geyserBeats(FOAM, {
    crown: { drops: 9 },
    extra: [{ at: 380, until: 1000, layer: 'front', drawer: 'volley', params: { count: 8, stagger: 45, r0: 0.06, r1: 0.11, bow: 0.55, tongues: 0, tint: FOAM } }],
  }),
  particles: [droplets(1000), droplets(1200, { count: 8, kind: 'mote', gravity: 0, direction: -90, spread: 140, distance: 1.1, durationMs: 1000 })],
  grain: 0.2,
});

const SURGE = Object.freeze({ deep: '#0A4A66', body: '#2FA8D6', hot: '#8FE3F2', core: '#E2FAFF' });
const STONE = Object.freeze({ deep: '#2E2620', body: '#76665A', hot: '#B8AA9A', core: '#D8CFC4' });

// G-Max Stonesurge (Récif_G-Max_EB.mp4): Drednaw gathers a water orb (2.4–3.2 s) · a torrent full
// of tumbling rocks (3.6–4.8) · the geyser bursts at the target, rocks flung out (5.0–6.0) ·
// whiteout · a teal pool ringed by sharp stones that stay (the Stealth Rock it leaves, 6.6–8.6).
// Water #71D7EE / #387192, deep #284667, stone grey-brown. Its own touch: the stones, flung out of
// the geyser and left standing round the card.
export const gmaxStonesurge = Object.freeze({
  id: 'g-max-stonesurge',
  name: 'G-Max Stonesurge',
  vgType: 'water',
  statClass: 'physical',
  tier: 'S',
  family: 'splash',
  material: 'water',
  durationMs: 2400,
  contactMs: 1000,
  pad: 2,
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.5, heat: 0.35 } },
  tint: SURGE,
  beats: geyserBeats(SURGE, {
    rain: 5,
    extra: [{ at: 1000, until: 2400, layer: 'front', drawer: 'surgeStones', params: { from: 'erupt', count: 8, distance: 0.95, height: 0.75, size: [0.06, 0.11], tint: STONE } }],
  }),
  particles: [charging(), droplets(1000)],
  grain: 0.25,
});

const CANNON = Object.freeze({ deep: '#0A2E6C', body: '#2A78D0', hot: '#9CD0F5', core: '#DFF3FF' });

// G-Max Cannonade (Canonnade_G-Max_EB.mp4): Blastoise's shell cannons fire volley after volley of
// cyan jets (1.5–3.0 s), the hexagonal battery blazes (3.0–4.0) · the jets converge on the target,
// a huge white-blue splash crowns it (4.5–6.0) · whiteout · the ground floods, a rippling pool
// (7–9). Jets #206BBE, deep #002A77, foam #D8F3FC. A barrage, not one torrent.
export const gmaxCannonade = Object.freeze({
  id: 'g-max-cannonade',
  name: 'G-Max Cannonade',
  vgType: 'water',
  statClass: 'special',
  tier: 'S',
  family: 'splash',
  material: 'water',
  durationMs: 2300,
  contactMs: 1050,
  pad: 2,
  attacker: { motion: 'brace', params: { rear: 0.1, scale: 1.05, glow: 1 } },
  defender: { motion: 'stagger', params: { strength: 0.35, hits: 4, gapMs: 90, heat: 0.35, lead: 350 } },
  tint: CANNON,
  beats: [
    // Six shots, 70 ms apart, each crossing the lane in 300 ms; the last lands at contact.
    { at: 400, until: 1050, layer: 'front', drawer: 'volley', params: { count: 6, stagger: 70, r0: 0.1, r1: 0.16, bow: 0.35, tongues: 3, tint: CANNON } },
    flash(1050, CANNON),
    // The converging jets throw up one great crown, the width of the reference's splash.
    { at: 1030, until: 2200, layer: 'front', drawer: 'splashCrown', params: { height: 2.7, width: 1.5, copies: 3, spread: 26, drops: 8, tint: CANNON } },
    { at: 1250, until: 2300, layer: 'front', drawer: 'cloud', params: { count: 5, radius: 0.5, drift: 0.4, direction: -90, alpha: 0.3 } },
    { at: 1550, until: 2300, layer: 'front', drawer: 'rain', params: { count: 8, height: 1.4, spread: 1.2, tint: CANNON } },
  ],
  particles: [droplets(1050, { count: 14 })],
  grain: 0.2,
});

const LANCE = Object.freeze({ deep: '#1F3A6E', body: '#5FB0E6', hot: '#C3F5F7', core: '#F0FDFF' });

// G-Max Hydrosnipe (Gâchette_G-Max_EB.mp4): Inteleon levels a finger, a glint flares at its tip
// (2.0–2.6 s) · a fin-shaped lance of water shoots out, a thin tracer line behind it (3.0–4.2) ·
// a tall narrow column of white-blue spray blasts up round the target (4.4–5.6) · whiteout.
// Lance #86BAE0, spray #C3F5F7, deep #1F2644. One fast shot and a tracer, then a narrow tall spray.
export const gmaxHydrosnipe = Object.freeze({
  id: 'g-max-hydrosnipe',
  name: 'G-Max Hydrosnipe',
  vgType: 'water',
  statClass: 'special',
  tier: 'S',
  family: 'splash',
  material: 'water',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'brace', params: { rear: 0.06, scale: 1.03, glow: 0.8 } },
  defender: { motion: 'knock', params: { strength: 0.55, heat: 0.35 } },
  tint: LANCE,
  beats: [
    { at: 150, until: 820, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.05, r1: 0.12, from: 0.3, tint: LANCE } },
    // The lance: a narrow stream fired fast down the lane; its head breaks into a foam crown on the
    // defender while it holds, then it retracts. (No wider than 0.12 h it would draw as a bare core.)
    { at: 800, until: 1350, layer: 'front', drawer: 'beam', params: { kind: 'solid', w: 0.16, growIn: 0.32, retract: 0.4, tint: LANCE } },
    { at: 800, until: 1000, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.1, r1: 0.14, bow: 0, tongues: 3, ease: 'in', tint: LANCE } },
    flash(1000, LANCE),
    // The shot blasts a tall, narrow column of spray up round the target.
    { at: 975, until: 2050, layer: 'front', drawer: 'splashCrown', params: { height: 2.9, width: 0.8, copies: 3, spread: 7, drops: 7, tint: LANCE } },
    { at: 1250, until: 2200, layer: 'front', drawer: 'cloud', params: { count: 4, radius: 0.4, drift: 0.5, direction: -90, alpha: 0.3 } },
  ],
  particles: [
    { at: 480, anchor: 'attacker', count: 3, distance: 0.12, direction: -90, spread: 360, size: [0.1, 0.16], aspect: 1, gravity: 0, maxDelay: 0.2, durationMs: 520, kind: 'twinkle' },
    droplets(1000, { spread: 120, distance: 1.5 }),
  ],
  grain: 0.2,
});

const CHI = Object.freeze({ deep: '#0E3A66', body: '#4FA8E8', hot: '#A6E6FF', core: '#E8FAFF' });

/**
 * One crescent blade of the flurry (Rapid Flow): a lit band of chi swept round the defender
 * (chiCrescent: a hot leading edge over a shadowed inner side), fading clean instead of burning.
 */
const cut = (at, angle, over = {}) => ({
  at,
  until: at + 280,
  layer: 'front',
  drawer: 'chiCrescent',
  params: { sweep: 150, radius: 0.85, count: 1, angle, thick: 0.2, tint: CHI, ...over },
});

// G-Max Rapid Flow (Multicoup_G-Max_EB.mp4): blue chi and bubbles gather in Urshifu's fist
// (1.5–2.3 s) · a sheet of water streams across, crossed blades of light with four-point glints
// (2.6–3.6) · a flurry of cyan crescent slashes rains on the target from every side (4.0–5.6) ·
// whiteout. Slashes #96CDF4 / #9AE0FF, chi #5F9BD0, deep #093859. Many quick hits, not one.
// The blades are light, not water (they glow over the dark), so they draw in the aura energy kit.
export const gmaxRapidFlow = Object.freeze({
  id: 'g-max-rapid-flow',
  name: 'G-Max Rapid Flow',
  vgType: 'water',
  statClass: 'physical',
  tier: 'S',
  family: 'slash',
  material: 'aura',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'lunge', params: { wind: 0.3, reach: 0.9, strikes: 3, glow: 0.8 } },
  defender: { motion: 'stagger', params: { strength: 0.3, hits: 6, gapMs: 90, heat: 0.35, lead: 520 } },
  tint: CHI,
  beats: [
    { at: 0, until: 520, layer: 'front', drawer: 'coreCharge', params: { lead: 0.35, r0: 0.08, r1: 0.24, from: 0.05, rings: 2, tint: CHI } },
    cut(480, 30),
    cut(580, 210, { radius: 0.75 }),
    cut(680, 120, { count: 2, gapDeg: 40 }),
    cut(790, 300, { radius: 0.95 }),
    cut(890, 60, { radius: 0.8 }),
    flash(1000, CHI),
    { at: 990, until: 1330, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', size: 0.42, width: 0.24, core: 0.12, grow: 0.1, breakAt: 0.6, tint: CHI } },
    cut(1000, -30, { count: 2, gapDeg: 30, radius: 1.0 }),
    { at: 1150, until: 1750, layer: 'front', drawer: 'splash', params: { count: 6, arc: 200, direction: -90, len: [0.5, 0.9], gravity: 0.7, tint: CHI } },
  ],
  particles: [droplets(1000, { count: 10 }), droplets(1150, { count: 6, kind: 'twinkle', gravity: 0, distance: 0.9, durationMs: 700 })],
  grain: 0.15,
});

const STORM = Object.freeze({ deep: '#46587A', body: '#A8B6CC', hot: '#DCE6F2', core: '#F2F6FA' });
const HAIL = Object.freeze({ deep: '#3D74C4', body: '#8EC8F4', hot: '#DDF2FF', core: '#F4FAFF' });

// Max Hailstorm (Cryomax_EB.mp4, 7.5 s): a grey-blue storm cloud boils up over the field (2.2–3.4 s)
// · hail and ice chunks rain down round the target (3.6–5.2) · a pink cold flash, then a giant
// frosted ice block locks the target in (5.6–6.4) · it shatters in a whiteout (6.6). Cloud #A8B2CC,
// ice #B3E0E7 / #A9C8FE, deep #7591B9. Ice, not water: hard facets that grow in jumps and shatter.
export const maxHailstorm = Object.freeze({
  id: 'max-hailstorm',
  name: 'Max Hailstorm',
  vgType: 'ice',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'ice',
  durationMs: 2400,
  contactMs: 1050,
  pad: 2,
  attacker: { motion: 'channel', params: { pulse: 0.07, glow: 1 } },
  defender: { motion: 'freeze', params: { heat: 0.35 } },
  tint: HAIL,
  beats: [
    // The storm cloud hangs just beyond the defender, away from the attacker (lane terms): a sky
    // anchor sits above the defender on screen, which on the far seat is the attacker's own card.
    { at: 0, until: 1550, layer: 'front', drawer: 'cloud', params: { target: 'defender', dx: 1.15, count: 8, radius: 0.65, drift: 0.15, direction: 0, alpha: 0.65, tint: STORM } },
    { at: 450, until: 1100, layer: 'front', drawer: 'rain', params: { count: 12, height: 1.6, spread: 1.3, tint: HAIL } },
    { at: 500, until: 1150, layer: 'front', drawer: 'surgeStones', params: { from: 'sky', count: 5, distance: 0.7, height: 1.4, size: [0.07, 0.12], gloss: 0.6, smooth: 0.15, tint: HAIL } },
    flash(1050, HAIL),
    { at: 1000, until: 1950, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.1, w: 0.42, count: 3, spread: 0.6, stagger: 60, tint: HAIL } },
    { at: 1050, until: 1950, layer: 'front', drawer: 'shards', params: { count: 6, mode: 'cluster', tint: HAIL } },
    { at: 1850, until: 2400, layer: 'front', drawer: 'shards', params: { count: 9, arc: 360, distance: 1.2, spin: 360, tint: HAIL } },
    { at: 1850, until: 2400, layer: 'front', drawer: 'smoke', params: { count: 4, rise: 0.6 } },
  ],
  particles: [
    { at: 300, anchor: 'defender', count: 10, distance: 1.4, direction: 90, spread: 60, size: [0.03, 0.07], aspect: 0.8, gravity: 0.6, maxDelay: 0.4, durationMs: 1100, kind: 'flake' },
    { at: 1850, anchor: 'defender', count: 12, distance: 1.3, direction: -90, spread: 360, size: [0.04, 0.1], aspect: 0.6, gravity: 0.6, maxDelay: 0.08, durationMs: 700, kind: 'shard' },
  ],
  grain: 0.2,
});

const AURORA = Object.freeze({ deep: '#3E5FB0', body: '#9FD8F5', hot: '#DDF4FF', core: '#F4FBFF' });
/** Ice (elements/ice.md): a pale blue body, its colour in the facets; the glints carry the white. */
const BOULDER = Object.freeze({ deep: '#2F7FD6', body: '#86D4FF', hot: '#CFF3FF', core: '#F2FBFF' });
/** Aurora curtain hues, sampled from the veil (#73BDF7 / #A2E1FF) with its green and lilac. */
const VEIL = Object.freeze(['#7FE6D8', '#8FC8FF', '#B8A8FF', '#8FF0B8']);

// G-Max Resonance (Résonance_G-Max_EB.mp4): Lapras sings, a stave of music lines and diamond
// glints round it (1.5–2.5 s) · the sky clouds over, frosted ice boulders crash round the target
// (3.0–5.0) · they break in a blue-white blast (5.0–5.8) · whiteout · a ring of shimmering aurora
// light rises round the field (the Aurora Veil it leaves, 6.5–8.3). Boulders #66ACDD / #D6E4FA,
// aurora #73BDF7 / #A2E1FF with green and lilac. A song, ice boulders, then aurora curtains.
export const gmaxResonance = Object.freeze({
  id: 'g-max-resonance',
  name: 'G-Max Resonance',
  vgType: 'ice',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'aurora',
  durationMs: 2500,
  contactMs: 1050,
  pad: 2,
  attacker: { motion: 'channel', params: { pulse: 0.05, glow: 1 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 0.35 } },
  tint: AURORA,
  beats: [
    // Each falls in 0.3 of the beat, a ninth of it after the last: the fourth lands on contact.
    { at: 500, until: 1350, layer: 'front', drawer: 'surgeStones', params: { from: 'sky', count: 4, distance: 0.75, height: 1.5, size: [0.16, 0.24], gloss: 0.55, smooth: 0.15, frost: 1, tint: BOULDER } },
    flash(1050, AURORA),
    { at: 1050, until: 1650, layer: 'front', drawer: 'cloud', params: { count: 4, radius: 0.4, drift: 0.5, direction: -90, alpha: 0.3, tint: BOULDER } },
    { at: 1050, until: 1600, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, spin: 300, tint: BOULDER } },
    { at: 1250, until: 2500, layer: 'back', drawer: 'auroraVeil', params: { half: 'back', count: 8, r: 1.1, height: 1.6, w: 0.34, tint: AURORA, hues: VEIL } },
    { at: 1250, until: 2500, layer: 'front', drawer: 'auroraVeil', params: { half: 'front', count: 8, r: 1.1, height: 1.6, w: 0.34, tint: AURORA, hues: VEIL } },
  ],
  particles: [
    { at: 100, anchor: 'attacker', count: 8, distance: 1.0, direction: -90, spread: 120, size: [0.22, 0.3], aspect: 1, gravity: 0, maxDelay: 0.45, durationMs: 1150, kind: 'note' },
    { at: 1050, anchor: 'defender', count: 10, distance: 1.2, direction: -90, spread: 360, size: [0.03, 0.07], aspect: 0.8, gravity: 0.3, maxDelay: 0.12, durationMs: 900, kind: 'twinkle' },
  ],
  grain: 0.2,
});

export const WATER_ICE_MAX_SPECS = Object.freeze({
  'max-geyser': maxGeyser,
  'g-max-cannonade': gmaxCannonade,
  'g-max-foam-burst': gmaxFoamBurst,
  'g-max-stonesurge': gmaxStonesurge,
  'g-max-hydrosnipe': gmaxHydrosnipe,
  'g-max-rapid-flow': gmaxRapidFlow,
  'max-hailstorm': maxHailstorm,
  'g-max-resonance': gmaxResonance,
});
