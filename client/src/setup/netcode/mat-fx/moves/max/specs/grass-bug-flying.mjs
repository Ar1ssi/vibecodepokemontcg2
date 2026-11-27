// Design 092 § Work plan, group grass-bug-flying: the Max / G-Max Move specs (tier 'S') of Max
// Overgrowth, G-Max Vine Lash, G-Max Tartness, G-Max Sweetness, G-Max Drum Solo, Max Flutterby,
// G-Max Befuddle, Max Airstream and G-Max Wind Rage. Each spec is its Appendix M entry's board
// mapping (.agent/designs/092-max-move-animations.md); its header is the reference brief from its
// Sword/Shield clip (Poképédia <Nom>_EB.mp4, 30 fps; hexes sampled from the effect in the frames
// named). The in-game build-up (4–6 s) is compressed into the second before contact.
// House rules: no floor rings (each clip's closing ring on the ground is cut; the leaf, powder or
// wind whirl over the defender stands in for it), no whiteout (the clips' white frame is a small
// tinted flash), no light-ray fans (the plants' and apples' rays are a cross flare and the burst).
// The pairs that share a frame in the games share a builder: the plant trio, the butterflies and
// the tornado.
import { motes } from '../../signature/specs/_shared.mjs';

/** The small contact flash (the TCG Live impact replaces the move's own in a game). */
const flash = (at, tint) => ({ at, until: at + 150, layer: 'top', drawer: 'impactFlash', params: { r0: 0.2, r1: 0.6, tint } });
/** A four-point flare that lands whole on the defender and breaks up late. */
const cross = (at, until, tint, size = 0.45) => ({ at, until, layer: 'front', drawer: 'starFlare', params: { arms: 'cross', size, width: 0.3, core: 0.14, grow: 0.12, breakAt: 0.7, tint } });

// ---- the plant trio: Max Overgrowth, G-Max Tartness, G-Max Sweetness ---------------------------

const GREEN = Object.freeze({ deep: '#137447', body: '#45AE57', hot: '#A8F95F', core: '#E9FFC8' });
const LIME = Object.freeze({ deep: '#5E8A1E', body: '#C7FC63', hot: '#FEFD6E', core: '#FFFFE0' });
const MUSHROOM = Object.freeze({ deep: '#0E5A34', body: '#45AE57', hot: '#A8F95F', core: '#D8FF9A' });
const APPLE = Object.freeze({ deep: '#8C0A2E', body: '#FF1F3C', hot: '#FF7A60', core: '#FFE0D8' });
const ACID = Object.freeze({ deep: '#1E8C8C', body: '#82FFFF', hot: '#D8FFFF', core: '#F4FFFF' });
// Saturated through its hot stop: the glow kits put `hot` at the heart of every puff, and a pale
// pink there summed to a white bloom over the defender.
const NECTAR = Object.freeze({ deep: '#9A2470', body: '#E060D8', hot: '#F27FEA', core: '#FFC8F6' });
const HONEY = Object.freeze({ deep: '#A8741E', body: '#F5C542', hot: '#FFE88A', core: '#FFF8D8' });

/**
 * The plant trio's frame: energy gathers at the attacker and is shot down the lane, giant `kind`
 * props rise round the defender as it lands, the light bursts out of them at contact, and a
 * `splash` of the move's colour hangs over the defender as they sink back.
 */
const plantStorm = ({ id, name, charge, shot, props, splash, contactMs = 1000, durationMs = 2200 }) =>
  Object.freeze({
    id,
    name,
    vgType: 'grass',
    statClass: 'special',
    tier: 'S',
    family: 'burst',
    material: 'grass',
    durationMs,
    contactMs,
    pad: 1.9,
    attacker: { motion: 'brace', params: { glow: 0.8 } },
    defender: { motion: 'knock', params: { strength: 0.4, heat: 0.3 } },
    beats: [
      { at: 0, until: 650, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.12, r1: 0.34, from: 0.2, tint: charge } },
      { at: 550, until: contactMs, layer: 'front', drawer: 'projectile', params: { path: 'arc', r0: 0.18, r1: 0.26, tongues: 6, tint: shot } },
      { at: contactMs - 330, until: durationMs - 100, layer: 'front', drawer: 'prop', params: { grow: 0.2, stagger: 0.04, sink: 0.22, ...props } },
      flash(contactMs, LIME),
      // The plants blaze: light bursting out over them (a glow, never a ray fan), then the move's
      // splash hanging over the defender as they sink.
      { at: contactMs, until: contactMs + 550, layer: 'front', drawer: 'aura', params: { target: 'defender', hz: 3, alpha: 0.9, r0: 0.75, r1: 1, tint: LIME } },
      { at: contactMs, until: contactMs + 600, layer: 'front', drawer: 'cloud', params: { count: 7, radius: 0.5, drift: 0.35, direction: -90, alpha: 0.8, tint: LIME } },
      { at: contactMs + 300, until: durationMs, layer: 'front', drawer: 'aura', params: { target: 'defender', hz: 1.5, alpha: 0.75, r0: 0.7, r1: 0.95, tint: splash } },
      { at: contactMs + 300, until: durationMs, layer: 'front', drawer: 'cloud', params: { count: 8, radius: 0.45, drift: 0.5, direction: -90, alpha: 0.8, tint: splash } },
      { at: contactMs, until: contactMs + 700, layer: 'front', drawer: 'shards', params: { count: 10, arc: 300, direction: -90, distance: 1.2 } },
    ],
    particles: [motes(contactMs, 12, { kind: 'leaf', gravity: 0.4, distance: 1.3, size: [0.05, 0.1], durationMs: 900 })],
    grain: 0.1,
  });

// Max Overgrowth (Phytomax_EB, Charizard → Golisopod). 1.75–3.0 s: green rays and leaves burst at
// the attacker round a green orb (#4BA26C #72F43A #C0FF1A @2.25 s) · 3.25–4.0 s: it lands, sparks ·
// 4.25–5.0 s: giant spotted green mushroom plants and grass spring up round the target (#137447
// #45AE57 #A8F95F @4.75 s) · 5.25–5.75 s: the plants blaze lime-yellow (#C7FC63 #FEFD6E) · 6.0–6.5 s:
// leaves whirl · 7.0 s+: a cyan-green swirl on the ground (#65FFF8; cut: floor ring).
export const maxOvergrowth = plantStorm({
  id: 'max-overgrowth',
  name: 'Max Overgrowth',
  charge: GREEN,
  shot: GREEN,
  props: { kind: 'mushroom', count: 4, size: 0.62, spread: 0.85, arc: [160, 380], grass: true, tint: MUSHROOM },
  splash: GREEN,
});

// G-Max Tartness (Corrosion_G-Max_EB, Flapple → Hippowdon). 1.25–2.5 s: the honey-apple Flapple
// throws green rays, leaves and a green orb (#BCF663 #E2FD63) · 3.25–3.5 s: it lands · 4.0–4.5 s:
// two giant glossy red apples rise beside the target (#C81959 #FF1F3C #E2492D @4.5 s) · 4.75–5.25 s:
// they blaze lime-yellow · 5.5–6.25 s: a cyan acid splash (#82FFFF #95FDFF @5.75 s) and a whiteout.
export const gmaxTartness = plantStorm({
  id: 'g-max-tartness',
  name: 'G-Max Tartness',
  charge: LIME,
  shot: GREEN,
  props: { kind: 'apple', count: 3, size: 0.55, spread: 0.9, arc: [170, 370], grass: true, tint: APPLE },
  splash: ACID,
});

// G-Max Sweetness (Nectar_G-Max_EB, Appletun → Dugtrio). 0.75–2.25 s: honey and green rays at the
// attacker (#F5C542) · 2.75–3.5 s: a honey ball rolls in and bursts · 3.75–4.5 s: giant red apples
// stand round the target (#EA0039 #EE0C51 #BE4847 @4.0 s) · 4.75–5.25 s: yellow-white blaze ·
// 5.5–6.0 s: pink nectar splashes over everything (#F58EF3 #F694F1 @5.75 s).
export const gmaxSweetness = plantStorm({
  id: 'g-max-sweetness',
  name: 'G-Max Sweetness',
  charge: HONEY,
  shot: HONEY,
  props: { kind: 'apple', count: 4, size: 0.6, spread: 0.9, arc: [155, 385], grass: true, tint: APPLE },
  splash: NECTAR,
});

// ---- G-Max Vine Lash, G-Max Drum Solo -----------------------------------------------------------

const PINK = Object.freeze({ deep: '#A8307A', body: '#F97EEC', hot: '#FFB8F4', core: '#FFE8FC' });

// G-Max Vine Lash (Fouet_G-Max_EB, Venusaur). 0.75–1.75 s: two vines rise off it, their tips glowing
// pink (#C0449C #F97EEC #F893EE @1.5 s) · 2.0–2.25 s: they arch and whip down (speed lines) · 2.5–
// 4.5 s: a pink petal explosion on the target, the vines crossed over it (#DE5486 #EC6B84 #F991EB
// @3.25 s) · 4.75 s: whiteout · 5.25–6.25 s: a pink ripple and petals on the ground (cut: floor ring).
export const gmaxVineLash = Object.freeze({
  id: 'g-max-vine-lash',
  name: 'G-Max Vine Lash',
  vgType: 'grass',
  statClass: 'physical',
  tier: 'S',
  family: 'burst',
  material: 'petal',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'brace', params: { glow: 0.7 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.35 } },
  tint: PINK,
  beats: [
    // The lash lands at contact: (whipAt + 0.07) × 1700 = 1000.
    { at: 0, until: 1700, layer: 'front', drawer: 'vine', params: { whipAt: 0.518, retract: 0.3, tint: PINK } },
    flash(1000, PINK),
    // The petal explosion. It erupts 80 ms before the lash lands, so it is wide on the contact frame
    // and survives the game's impact strip (impact-select.mjs drops splash / shards dressing that
    // starts at contact): pink light round the struck card, petal trails thrown out of it, petals
    // spinning wide, then whirling as they settle.
    { at: 900, until: 1500, layer: 'front', drawer: 'aura', params: { target: 'defender', hz: 3, alpha: 0.9, r0: 0.8, r1: 1.1, tint: PINK } },
    { at: 1030, until: 1700, layer: 'front', drawer: 'cloud', params: { count: 7, radius: 0.45, drift: 0.35, direction: -90, alpha: 0.75, tint: PINK } },
    { at: 1300, until: 2150, layer: 'front', drawer: 'spiral', params: { turns: 1.5, r0: 0.25, r1: 0.95, rpm: 60, tongues: 10, tint: PINK } },
    { at: 920, until: 1300, layer: 'front', drawer: 'splash', params: { count: 14, arc: 360, direction: -90, gravity: 0.3, len: [0.75, 1.3], stagger: 0.012, tint: PINK } },
    // Last of the contact beats: the family rule reads the petal burst (a burst, not a splash).
    { at: 920, until: 1650, layer: 'front', drawer: 'shards', params: { count: 10, arc: 360, direction: -90, distance: 1.5, tint: PINK } },
  ],
  particles: [motes(920, 14, { kind: 'leaf', gravity: 0.3, distance: 1.5, size: [0.05, 0.09], durationMs: 1000 })],
  grain: 0.1,
});

const BARK = Object.freeze({ deep: '#3F271F', body: '#633D2F', hot: '#9A7A3E', core: '#C8A86E' });
const SOIL = Object.freeze({ deep: '#43340C', body: '#6B4215', hot: '#8B5E37', core: '#B08A5A' });

// G-Max Drum Solo (Percussion_G-Max_EB, Rillaboom). 0.25–1.5 s: it beats its drum in a pink haze ·
// 1.75–2.5 s: the beat shakes the field · 2.75–3.75 s: a giant root sweeps along the ground
// (#43340C #6B4215 @3.0 s) · 4.25–5.5 s: gnarled roots burst up out of the ground round the target
// with dirt clods and leaves (#3F271F #633D2F #78522D #87752E @4.75 s; leaves #0D9E00 #71B61C) ·
// 5.75 s: whiteout. The sweeping root is the ground's shudder rolling in; the roots are what lands.
// Drawn in the ground material, whose dust and clods are the dirt the roots throw up; the grass is
// the drumming's green glow, the wood, and the game's own grass impact at contact.
export const gmaxDrumSolo = Object.freeze({
  id: 'g-max-drum-solo',
  name: 'G-Max Drum Solo',
  vgType: 'grass',
  statClass: 'physical',
  tier: 'S',
  family: 'quake',
  material: 'ground',
  durationMs: 2200,
  contactMs: 1000,
  pad: 1.9,
  attacker: { motion: 'stomp', params: {} },
  defender: { motion: 'knock', params: { strength: 0.5, heat: 0.25 } },
  tint: GREEN,
  beats: [
    { at: 0, until: 800, layer: 'back', drawer: 'aura', params: { hz: 4, alpha: 0.6, tint: GREEN } },
    { at: 850, until: 2150, layer: 'front', drawer: 'prop', params: { kind: 'root', count: 5, size: 0.9, spread: 0.8, arc: [165, 375], tilt: 22, grow: 0.12, stagger: 0.02, sink: 0.25, tint: BARK } },
    flash(1000, SOIL),
    { at: 1050, until: 2100, layer: 'back', drawer: 'smoke', params: { count: 7, rise: 0.8 } },
    { at: 1000, until: 1700, layer: 'front', drawer: 'shards', params: { count: 8, arc: 280, direction: -90, distance: 1.2, tint: SOIL } },
    { at: 1000, until: 1900, layer: 'front', drawer: 'terrain', params: { kind: 'dust', radius: 1.3, amp: 0.05, tint: SOIL } },
  ],
  particles: [motes(1000, 14, { kind: 'shard', gravity: 0.9, distance: 1.3, size: [0.04, 0.08], durationMs: 900 })],
  grain: 0.15,
});

// ---- the butterflies: Max Flutterby, G-Max Befuddle -------------------------------------------

const WING_HUES = Object.freeze(['#CBFA6E', '#31E0D0', '#F5F56A']);
const SCALE_DOME = Object.freeze({ deep: '#0F3A26', body: '#9ADE6D', hot: '#CBFA6E', core: '#F2FFD0' });
const SCALES = Object.freeze({ deep: '#0B2A24', body: '#1E6B5A', hot: '#31B9B8', core: '#9FF6E6' });
const POWDER = Object.freeze({ deep: '#2A9A86', body: '#73F6C3', hot: '#C8FFF4', core: '#F0FFFC' });
const SPARKLE = Object.freeze({ deep: '#2A8A9A', body: '#89E6FF', hot: '#D8F8FF', core: '#FFFFFF' });

/**
 * The butterflies' frame: glowing butterflies swirl round the attacker and fly down the lane,
 * and a green dome of scales closes over the defender at contact, shedding scales.
 */
const butterflyStorm = ({ id, name, durationMs, extraBeats = [], particles }) =>
  Object.freeze({
    id,
    name,
    vgType: 'bug',
    statClass: 'special',
    tier: 'S',
    family: 'burst',
    material: 'bug',
    durationMs,
    contactMs: 1000,
    pad: 1.9,
    attacker: { motion: 'brace', params: { glow: 0.8 } },
    defender: { motion: 'knock', params: { strength: 0.4, heat: 0.3 } },
    beats: [
      { at: 0, until: 650, layer: 'front', drawer: 'orbitCharge', params: { count: 7, r0: 0.15, r1: 0.19, tongues: 0, tilt: 0.5, unit: 'butterfly', hues: WING_HUES } },
      { at: 300, until: 1000, layer: 'front', drawer: 'volley', params: { count: 8, stagger: 55, r0: 0.16, r1: 0.2, bow: 0.5, tongues: 0, unit: 'butterfly', hues: WING_HUES } },
      flash(1000, SCALE_DOME),
      // The dome closes over the defender from its near edge and sinks back into the cloth.
      { at: 900, until: 1950, layer: 'front', drawer: 'prop', params: { kind: 'dome', count: 1, size: 1.1, spread: 0.8, arc: [90, 90], grow: 0.16, sink: 0.3, tint: SCALE_DOME } },
      { at: 1000, until: 1600, layer: 'front', drawer: 'aura', params: { target: 'defender', hz: 2, alpha: 0.7, r0: 0.8, r1: 1.1, tint: SPARKLE } },
      ...extraBeats,
      { at: 1000, until: 1650, layer: 'front', drawer: 'shards', params: { count: 8, arc: 300, direction: -90, distance: 1.1, unit: 'hex', tint: SCALES } },
    ],
    particles,
    grain: 0.1,
  });

// Max Flutterby (Insectomax_EB, Articuno → Galvantula). 1.25–2.5 s: glowing butterflies — lime,
// teal and yellow (#9BB762 #31B9B8 @2.0 s) — burst out round the attacker and fly · 3.25–4.0 s: a
// lime orb strikes the target · 4.5 s: a green flash · 4.75–5.5 s: a green dome of dark scales
// covers it, cyan sparkles at its base (#70C476 #96DE6C, #81C3A5 #89E6FF @5.25 s).
export const maxFlutterby = butterflyStorm({
  id: 'max-flutterby',
  name: 'Max Flutterby',
  durationMs: 2100,
  particles: [motes(1000, 14, { kind: 'twinkle', distance: 1.1, durationMs: 800 })],
});

// G-Max Befuddle (Illusion_G-Max_EB, Butterfree → Roselia). 0.75–1.75 s: butterflies and yellow-cyan
// stars burst round it · 2.0–2.5 s: they fly in · 3.0–3.75 s: a lime orb, a green flash · 4.0–5.0 s:
// the scale dome (#9ADE6D #CBFA6E @4.5 s) · 5.25–6.5 s: a cyan-green powder spiral swirls over the
// target (#73F6C3 #82FFFE @6.0 s), which is left paralysed.
export const gmaxBefuddle = butterflyStorm({
  id: 'g-max-befuddle',
  name: 'G-Max Befuddle',
  durationMs: 2400,
  // The powder: glowing cyan dust rising and swirling over the defender (light, not needles).
  extraBeats: [
    { at: 1400, until: 2350, layer: 'front', drawer: 'cloud', params: { count: 9, radius: 0.32, drift: 0.7, direction: -90, alpha: 0.8, tint: POWDER } },
    { at: 1400, until: 2300, layer: 'back', drawer: 'aura', params: { target: 'defender', hz: 1.5, alpha: 0.7, r0: 0.8, r1: 1.05, tint: POWDER } },
  ],
  particles: [
    { ...motes(0, 10, { kind: 'twinkle', distance: 0.9, durationMs: 700 }), anchor: 'attacker' },
    motes(1000, 12, { kind: 'twinkle', distance: 1.1, durationMs: 900 }),
  ],
});

// ---- the tornado: Max Airstream, G-Max Wind Rage ----------------------------------------------

const SILVER = Object.freeze({ deep: '#7A84A8', body: '#C5C8DE', hot: '#F1F1FF', core: '#FFFFFF' });
/**
 * The tube's silver sheets; `deep` is the colour of its streak sheets, drawn over the scene (the
 * tornado is source-over): the clips' blue streaks (Airstream), deep crimson (Wind Rage).
 */
const SILVER_BLUE = Object.freeze({ deep: '#4A72B8', body: '#B8C2E0', hot: '#E8EEFF', core: '#FFFFFF' });
const SILVER_CRIMSON = Object.freeze({ deep: '#A8002E', body: '#C5C8DE', hot: '#F1F1FF', core: '#FFFFFF' });
/** The card rim and heat while the wind blows: silver kept off white, so it never reads as a slab. */
const GUST = Object.freeze({ deep: '#3E4C7A', body: '#6E80B8', hot: '#8EA4E0', core: '#C8D4F4' });
const DUST = Object.freeze({ deep: '#6E6660', body: '#B8B0A8', hot: '#E0D8D0', core: '#F4F0EC' });
const SKY_BLUE = Object.freeze({ deep: '#5F85BF', body: '#9CD3F7', hot: '#DFF4FF', core: '#FFFFFF' });

/**
 * The tornado's frame: a silver whirlwind spins up in front of the attacker and is blown down the
 * lane as a horizontal tornado tube of wind sheets, streaked in `tubeTint`'s deep colour, that
 * engulfs the defender, dust boiling at its foot; it unwinds from its tail. `accent` (optional): a
 * gust of light slashing through it at contact.
 */
const tornadoStorm = ({ id, name, accent = null, tubeTint = SILVER, rim = GUST }) =>
  Object.freeze({
    id,
    name,
    vgType: 'flying',
    statClass: 'special',
    tier: 'S',
    family: 'wind',
    material: 'flying',
    durationMs: 2200,
    contactMs: 1000,
    pad: 1.9,
    // It braces and blows; the whirlwind, not the card, carries the light.
    attacker: { motion: 'brace', params: { rear: 0.06, scale: 1.04, glow: 0.3 } },
    defender: { motion: 'float', params: { lift: 0.15 } },
    tint: rim,
    beats: [
      { at: 0, until: 700, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 2, r0: 0.12, r1: 0.6, rpm: 140, tongues: 10, tint: SILVER } },
      // It reaches the defender at contact: 400 + growIn × 1500 = 1000.
      { at: 400, until: 1900, layer: 'front', drawer: 'tornado', params: { w: 0.9, rpm: 300, rings: 11, growIn: 0.4, retract: 0.3, streak: true, tint: tubeTint } },
      flash(1000, SKY_BLUE),
      { at: 1100, until: 2100, layer: 'back', drawer: 'cloud', params: { count: 7, radius: 0.3, drift: 0.4, direction: -90, alpha: 0.5, tint: DUST } },
      ...(accent ? [{ at: 1000, until: 1450, layer: 'front', drawer: 'slashArc', params: { sweep: 110, radius: 0.8, count: 2, gapDeg: 40, angle: 30, thick: 0.14, tint: accent } }] : []),
      { at: 1000, until: 1800, layer: 'front', drawer: 'spiral', params: { turns: 2, r0: 0.2, r1: 1, rpm: 150, tongues: 10, tint: SILVER } },
    ],
    particles: [motes(1000, 12, { kind: 'streak', aspect: 0.4, distance: 1.3, durationMs: 700 })],
    grain: 0.1,
  });

// Max Airstream (Aéromax_EB, Charizard → Sandaconda). 1.25–2.0 s: a silver whirlwind spins up in
// front of it · 2.0–2.75 s: it is blown off as a horizontal tornado tube · 3.0–5.0 s: the tube
// engulfs the target, silver wind sheets (#98A0BE #B1B3B3 #BCC1C0 @4.5 s) with blue streaks
// (#95A2D6 #9CD3F7 @5.25 s) and boiling dust · 5.25 s: a blue gust slashes through · 5.5 s: whiteout
// · 6.25 s+: a ring of wind on the ground (cut: floor ring).
export const maxAirstream = tornadoStorm({ id: 'max-airstream', name: 'Max Airstream', accent: SKY_BLUE, tubeTint: SILVER_BLUE });

// G-Max Wind Rage (Rafale_G-Max_EB, Corviknight → Toxicroak). As Max Airstream, in Corviknight's
// colours: crimson energy rings wind round the whirlwind (#C90845 #C62577 @2.0 s), crimson slashes
// cut through the silver tube (#C5C8DE #F1F1FF @4.5 s; #E6014A @4.75 s) · 5.5 s: whiteout. The
// crimson is the tube's streak sheets, drawn over the scene: as added light it read pink.
export const gmaxWindRage = tornadoStorm({
  id: 'g-max-wind-rage',
  name: 'G-Max Wind Rage',
  tubeTint: SILVER_CRIMSON,
});

export const GRASS_BUG_FLYING_MAX_SPECS = Object.freeze({
  'max-overgrowth': maxOvergrowth,
  'g-max-tartness': gmaxTartness,
  'g-max-sweetness': gmaxSweetness,
  'g-max-vine-lash': gmaxVineLash,
  'g-max-drum-solo': gmaxDrumSolo,
  'max-flutterby': maxFlutterby,
  'g-max-befuddle': gmaxBefuddle,
  'max-airstream': maxAirstream,
  'g-max-wind-rage': gmaxWindRage,
});
