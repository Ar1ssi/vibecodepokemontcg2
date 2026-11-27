// Design 092 § Work plan, group electric-poison-fighting: the Max / G-Max Move specs (tier 'S') of Max Lightning, G-Max Volt Crash, G-Max Stun Shock, Max Ooze, G-Max Malodor, Max Knuckle, G-Max Chi Strike and G-Max One Blow.
// Each spec is its Appendix M entry's board mapping (.agent/designs/092-max-move-animations.md).
// References: the Sword/Shield clips (Poképédia `<Nom>_EB.mp4`); each header's hexes are sampled
// from the effect in them. The in-game build-up (a cut to the Dynamax Pokémon, then to the target)
// compresses into the ~1.1 s before contact; the eruption plays out after it. House rules hold: no
// whiteout (the game's own impact flashes at contact), no floor rings, flares kept to the card.

const sparks = (at, count, over = {}) =>
  Object.freeze({
    at,
    anchor: 'defender',
    count,
    distance: 1.1,
    direction: -90,
    spread: 360,
    size: [0.04, 0.1],
    aspect: 0.2,
    gravity: 0,
    maxDelay: 0.12,
    durationMs: 650,
    kind: 'streak',
    ...over,
  });

/** Specks drifting up off the struck card after the strike. */
const motes = (at, count, over = {}) =>
  sparks(at, count, { kind: 'mote', aspect: 1, size: [0.02, 0.05], distance: 0.8, spread: 120, maxDelay: 0.3, durationMs: 900, ...over });

/**
 * The card glow of a move in `palette` (the spec-level tint: rim and heat): its body colour as the
 * hot one, so a charging card is rimmed in the move's colour instead of washed pale.
 */
const cardGlow = (palette) => Object.freeze({ deep: palette.deep, body: palette.body, hot: palette.body, core: palette.hot });

/** The small contact flash (the TCG Live impact replaces it in a game). */
const flash = (at, tint) => ({ at, until: at + 150, layer: 'top', drawer: 'impactFlash', params: { r0: 0.2, r1: 0.6, tint } });

// ---- the storm strikes (Max Lightning, G-Max Volt Crash, G-Max Stun Shock) ----------------------

/** The storm cloud rolling in over the defender (centred about a card height above it on screen). */
const stormOver = (at, until, tint, over = {}) => ({
  at,
  until,
  layer: 'back',
  drawer: 'stormCloud',
  params: { target: 'sky', dx: 0.4, dy: 0.75, r: 0.85, puffs: 8, flashes: 3, tint, ...over },
});

/** A bolt dropping out of the sky onto the defender. */
const skyBolt = (at, until, tint, over = {}) => ({
  at,
  until,
  layer: 'front',
  drawer: 'bolt',
  params: { from: 'sky', segments: 9, jag: 0.12, branches: 2, rerollMs: 45, width: 0.07, tint, ...over },
});

/** The column of lightning the strike leaves standing on the defender. */
const boltColumn = (at, until, tint, over = {}) => ({
  at,
  until,
  layer: 'front',
  drawer: 'pillar',
  params: { from: 'below', height: 1.6, w: 0.3, count: 2, spread: 0.4, stagger: 70, tint, ...over },
});

const stormSpec = (over) =>
  Object.freeze({
    vgType: 'electric',
    statClass: 'special',
    tier: 'S',
    family: 'electric',
    material: 'electric',
    durationMs: 2400,
    contactMs: 1100,
    pad: 2.0,
    attacker: { motion: 'brace', params: { rear: 0.06, scale: 1.06, glow: 0.45 } },
    defender: { motion: 'knock', params: { strength: 0.45, heat: 0.4 } },
    ...over,
  });

// Max Lightning (Fulguromax): the Pokémon glows gold inside a sphere of electricity; a dark storm
// cloud rolls in over the target and flickers; a thin forerunner, then the strike from the cloud;
// a burst of sparks and a column of twisting bolts left standing on it; specks drift up.
// Sampled: body #E8E040 / #C5C567, hot #FEFECD, deep #796F28; the cloud #4D2829–#502A20 dark.
const LIGHTNING = Object.freeze({ deep: '#8A7A14', body: '#F2E23A', hot: '#FFF6A8', core: '#FFFDE8' });

export const maxLightning = stormSpec({
  id: 'max-lightning',
  name: 'Max Lightning',
  tint: cardGlow(LIGHTNING),
  beats: [
    { at: 0, until: 640, layer: 'front', drawer: 'coreCharge', params: { lead: 0.35, r0: 0.08, r1: 0.26, from: 0.15, rings: 1, tint: LIGHTNING } },
    { at: 620, until: 900, layer: 'front', drawer: 'pillar', params: { target: 'attacker', from: 'below', height: 0.8, w: 0.2, tint: LIGHTNING } },
    stormOver(200, 1900, LIGHTNING),
    skyBolt(780, 960, LIGHTNING, { width: 0.04, branches: 0, segments: 11 }),
    skyBolt(1060, 1500, LIGHTNING),
    flash(1100, LIGHTNING),
    { at: 1080, until: 1450, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.1, spin: 240, tint: LIGHTNING } },
    boltColumn(1150, 2100, LIGHTNING),
  ],
  particles: [sparks(1100, 10), motes(1500, 6)],
});

// G-Max Volt Crash (Foudre G-Max): Pikachu glows and fires a bolt off its tail into the sky; a
// storm cloud gathers over the target, a ring of lightning round a ball forming at its heart; the
// bolt drops; giant zigzag bolts are thrown up and out of the strike; sparks scatter.
// Sampled: zigzags #E2EE3C / #FEFFA7 / #FEFF95, outline #6D6022 / #545113; cloud #3D301F–#523E2A.
const VOLT = Object.freeze({ deep: '#5E6014', body: '#E2EE3C', hot: '#FBFFA0', core: '#FDFFE8' });

export const gMaxVoltCrash = stormSpec({
  id: 'g-max-volt-crash',
  name: 'G-Max Volt Crash',
  tint: cardGlow(VOLT),
  beats: [
    { at: 300, until: 700, layer: 'front', drawer: 'pillar', params: { target: 'attacker', from: 'below', height: 0.9, w: 0.2, tint: VOLT } },
    stormOver(150, 1900, VOLT, { flashes: 2 }),
    { at: 300, until: 1080, layer: 'front', drawer: 'coreCharge', params: { target: 'sky', dx: 0.4, dy: 0.75, r0: 0.08, r1: 0.22, from: 0.1, rings: 2, tint: VOLT } },
    skyBolt(980, 1350, VOLT, { width: 0.09 }),
    flash(1100, VOLT),
    { at: 1080, until: 1450, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 1.0, spin: 240, tint: VOLT } },
    { at: 1100, until: 1750, layer: 'front', drawer: 'fan', params: { target: 'defender', count: 7, spread: 170, direction: 0, lenMin: 0.8, lenMax: 1.4, width: 0.45, grow: 0.15, tint: VOLT } },
  ],
  particles: [sparks(1100, 10), motes(1450, 6)],
});

// G-Max Stun Shock (Choc G-Max): magenta-white spikes crackle off Toxtricity's back spines and it
// lets a magenta bolt loose; a storm cloud over the target; the bolt drops into a magenta column of
// twisting lightning; a field of magenta spikes is left standing round the card.
// Sampled: column #BB69B9 / #DBA3EC, hot #F8A3FD / #FECDFE, deep #7B1452 / #892D5E.
const TOXIC = Object.freeze({ deep: '#7A1452', body: '#D85AD0', hot: '#F8A8FC', core: '#FFE2FE' });

export const gMaxStunShock = stormSpec({
  id: 'g-max-stun-shock',
  name: 'G-Max Stun Shock',
  tint: cardGlow(TOXIC),
  beats: [
    { at: 150, until: 680, layer: 'front', drawer: 'fan', params: { count: 6, spread: 150, direction: 180, lenMin: 0.3, lenMax: 0.55, width: 0.22, grow: 0.2, flap: 10, tint: TOXIC } },
    { at: 600, until: 820, layer: 'front', drawer: 'bolt', params: { from: 'attacker', segments: 9, jag: 0.14, branches: 1, width: 0.06, tint: TOXIC } },
    stormOver(250, 1900, TOXIC),
    skyBolt(1000, 1400, TOXIC),
    flash(1100, TOXIC),
    { at: 1080, until: 1450, layer: 'front', drawer: 'shards', params: { count: 6, arc: 360, distance: 1.0, spin: 240, tint: TOXIC } },
    boltColumn(1100, 1750, TOXIC, { height: 1.6, w: 0.36, spread: 0.45 }),
    { at: 1300, until: 2300, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 0.8, w: 0.2, count: 4, spread: 1.5, stagger: 70, tint: TOXIC } },
  ],
});

// ---- the poison geysers (Max Ooze, G-Max Malodor) --------------------------------------------

/**
 * Max Ooze's frame, shared with G-Max Malodor: fumes well up round the attacker, geysers burst up
 * either side of the defender and then under it, the liquid crowns and spatters and crystal chips
 * fly, and the fumes hang over the target as it settles. The clips' pool on the ground is left
 * out: a disc on the cloth read as a sticker. `fumes` is how thick the gas is (Malodor's stench).
 */
const geyserSpec = ({ id, name, material, tint, fumes = 0.35, particles = [] }) =>
  Object.freeze({
    id,
    name,
    vgType: 'poison',
    statClass: 'special',
    tier: 'S',
    family: 'splash',
    material,
    durationMs: 2400,
    contactMs: 1100,
    pad: 2.0,
    attacker: { motion: 'rear-lurch', params: { rear: 0.1, lurch: 0.25, glow: 0.5 } },
    defender: { motion: 'knock', params: { strength: 0.4, heat: 0.35 } },
    tint: cardGlow(tint),
    beats: [
      { at: 0, until: 900, layer: 'front', drawer: 'cloud', params: { target: 'attacker', count: 6, radius: 0.4, drift: 0.5, direction: -90, alpha: fumes + 0.15, tint } },
      { at: 650, until: 1250, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.3, w: 0.3, count: 2, spread: 1.45, stagger: 120, tint } },
      { at: 1000, until: 1800, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.7, w: 0.62, tint } },
      flash(1100, tint),
      { at: 1080, until: 1450, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 0.9, spin: 200, tint } },
      { at: 1080, until: 1500, layer: 'front', drawer: 'splash', params: { count: 10, arc: 360, gravity: 0.9, len: [0.5, 1.0], tint } },
      { at: 1350, until: 2400, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.5, drift: 0.4, alpha: fumes, tint } },
    ],
    particles,
  });

const globs = (at, count, over = {}) =>
  sparks(at, count, { kind: 'glob', aspect: 1, size: [0.04, 0.08], distance: 1.2, gravity: 0.8, durationMs: 800, ...over });

// Max Ooze (Toxinomax): violet bubbles and fumes rise round the Pokémon; translucent violet geysers
// burst up either side of the target, then one under it, liquid and crystal chips spattering; the
// fumes settle over it. (The clip's iridescent pool and ring are left out: see geyserSpec.)
// Sampled: body #B867D0 / #C181CD / #D77EE1, hot #FCBFF9, deep #5D1759, rim #DF78F7, lavender #B99EEA.
const OOZE = Object.freeze({ deep: '#5A1A5E', body: '#B868D4', hot: '#F0B8F8', core: '#FCE6FF' });

export const maxOoze = geyserSpec({
  id: 'max-ooze',
  name: 'Max Ooze',
  material: 'poison',
  tint: OOZE,
  fumes: 0.3,
  particles: [
    globs(60, 8, { anchor: 'attacker', gravity: 0, distance: 0.9, spread: 50, durationMs: 900, maxDelay: 0.4 }),
    globs(1100, 10),
  ],
});

// G-Max Malodor (Pestilence G-Max): Garbodor's stench rises off it in olive-tan puffs with
// garbage bits; yellow-green geysers burst up round the target as Ooze's do, the sludge spatters,
// and the stench hangs thick over it. (Mud's tan gas: poison's own is violet.)
// Sampled: body #C3A973 / #D7CF90, olive #677029 / #4E6B24, gas #B08B63-like tan.
const MALODOR = Object.freeze({ deep: '#4E6420', body: '#C8C060', hot: '#EAE6A0', core: '#FAF8DC' });

export const gMaxMalodor = geyserSpec({
  id: 'g-max-malodor',
  name: 'G-Max Malodor',
  material: 'mud',
  tint: MALODOR,
  fumes: 0.5,
});

// ---- the fists from the sky (Max Knuckle, G-Max Chi Strike) -----------------------------------

const AURA_GOLD = Object.freeze({ deep: '#A0601A', body: '#F0C040', hot: '#FFF0A0', core: '#FFFCE8' });

/**
 * Max Knuckle's frame, shared with G-Max Chi Strike: the Pokémon powers up in a gold aura and
 * throws a punch into the sky (a glint); a giant fist falls out of it onto the target, swelling as
 * it comes; a gold blast of flame and shards and a shaft of light; dust rises off it. The clip's
 * radial crater is left out: crack strokes on the cloth read as clip art.
 */
const fistSpec = ({ id, name, fist, blast }) =>
  Object.freeze({
    id,
    name,
    vgType: 'fighting',
    statClass: 'physical',
    tier: 'S',
    family: 'burst',
    material: 'fighting',
    durationMs: 2400,
    contactMs: 1100,
    pad: 2.0,
    attacker: { motion: 'brace', params: { rear: 0.1, scale: 1.08, glow: 0.45 } },
    defender: { motion: 'knock', params: { strength: 0.55, heat: 0.45 } },
    tint: cardGlow(blast),
    beats: [
      { at: 0, until: 560, layer: 'back', drawer: 'aura', params: { target: 'attacker', hz: 3, alpha: 0.8, r0: 0.75, r1: 0.95, tint: AURA_GOLD } },
      { at: 420, until: 720, layer: 'front', drawer: 'starFlare', params: { target: 'attacker', dy: -0.2, arms: 'cross', size: 0.4, width: 0.3, core: 0.2, grow: 0.15, breakAt: 0.5, tint: AURA_GOLD } },
      { at: 600, until: 1115, layer: 'front', drawer: 'projectile', params: { from: 'sky', path: 'straight', unit: 'maxFist', r0: 0.22, r1: 0.62, ease: 'in', tongues: 0, tint: fist } },
      flash(1100, blast),
      { at: 1080, until: 1400, layer: 'front', drawer: 'fan', params: { target: 'defender', count: 6, spread: 360, lenMin: 0.4, lenMax: 0.95, width: 0.22, grow: 0.2, tint: blast } },
      { at: 1080, until: 1550, layer: 'front', drawer: 'shards', params: { count: 12, arc: 360, distance: 1.3, spin: 300, tint: blast } },
      { at: 1120, until: 1900, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 1.6, w: 0.26, tint: blast } },
      { at: 1300, until: 2300, layer: 'front', drawer: 'smoke', params: { count: 6, rise: 0.8 } },
    ],
    particles: [
      sparks(1100, 14, { kind: 'ember', aspect: 0.5, distance: 1.3, gravity: 0.6, durationMs: 800 }),
      motes(1300, 8, { spread: 140 }),
    ],
  });

// Max Knuckle (Pugilomax): a gold aura with prismatic sparks bursts round the Pokémon; a glint
// shoots into the sky; a giant fist, dark crimson rimmed in hot pink, falls onto the target with
// speed lines; an orange-gold burst of shards, a gold shaft of light, a radial orange crater.
// Sampled: fist #913B58 / #620C2C, blast #D5D562 / #D7CC29 / #C9A531, hot #FEFEC1.
const KNUCKLE_FIST = Object.freeze({ deep: '#4A0C22', body: '#9A2A50', hot: '#FF6AA8', core: '#FFD0E2' });
const KNUCKLE_BLAST = Object.freeze({ deep: '#A0501A', body: '#E8B430', hot: '#FFEE96', core: '#FFFCE2' });

export const maxKnuckle = fistSpec({ id: 'max-knuckle', name: 'Max Knuckle', fist: KNUCKLE_FIST, blast: KNUCKLE_BLAST });

// G-Max Chi Strike (Frappe G-Max): Machamp's prismatic gold aura; the glint; a giant fist falls,
// dark brown-red with a molten orange rim; a gold burst of shards and rock slabs, a gold crater,
// tan dust rolling off it.
// Sampled: fist #921701 / #6B0E09 / #481630, rim #BA6C02 / #BA6104, dust #B08B63 / #BBB86C.
// A core darker than its hot makes it a dark fist (_units.js isDarkFistPalette): lit by red-brown,
// the orange only on its molten rim.
const CHI_FIST = Object.freeze({ deep: '#22080A', body: '#5E1A0E', hot: '#F08A2A', core: '#A0402A' });
const CHI_BLAST = Object.freeze({ deep: '#8A4A16', body: '#E0A030', hot: '#FFE48A', core: '#FFF8DC' });

export const gMaxChiStrike = fistSpec({ id: 'g-max-chi-strike', name: 'G-Max Chi Strike', fist: CHI_FIST, blast: CHI_BLAST });

// ---- G-Max One Blow ------------------------------------------------------------------------

// G-Max One Blow (Coup Final G-Max): Urshifu gathers crimson energy in its fist and punches; a
// spiky gold-orange impact star bursts at the fist and a comet streaks across the field onto the
// target; a translucent crimson dome (a glass shell: bright rim, gloss, thin haze) closes over it, slashes
// flashing inside.
// Sampled: star #FDFF09 / #F5B607 / #E57004, dome #CD0004 / #D4001E / #8B0001, magenta #D90081.
const URSHIFU_RED = Object.freeze({ deep: '#5A0008', body: '#D0101E', hot: '#FF4A8A', core: '#FFC8D0' });
const DOME_RED = Object.freeze({ deep: '#69000A', body: '#D4001E', hot: '#FF3A6E', core: '#FFC8D0' });
const STAR_GOLD = Object.freeze({ deep: '#C04A08', body: '#F5B607', hot: '#FFF46A', core: '#FFFBD8' });
/** The impact star at the fist: five spikes of uneven reach, so it reads as a hit, not a 大. */
const STAR_ARMS = Object.freeze([
  Object.freeze({ angle: -80, reach: 1 }),
  Object.freeze({ angle: -10, reach: 0.7 }),
  Object.freeze({ angle: 60, reach: 0.9 }),
  Object.freeze({ angle: 135, reach: 0.65 }),
  Object.freeze({ angle: 205, reach: 0.85 }),
]);

export const gMaxOneBlow = Object.freeze({
  id: 'g-max-one-blow',
  name: 'G-Max One Blow',
  vgType: 'dark',
  statClass: 'physical',
  tier: 'S',
  family: 'burst',
  material: 'dark',
  durationMs: 2400,
  contactMs: 1100,
  pad: 2.0,
  attacker: { motion: 'rear-lurch', params: { rear: 0.16, lurch: 0.45, glow: 0.5, hold: 120 } },
  defender: { motion: 'knock', params: { strength: 0.55, heat: 0.6 } },
  tint: cardGlow(URSHIFU_RED),
  beats: [
    { at: 0, until: 620, layer: 'front', drawer: 'coreCharge', params: { lead: 0.35, r0: 0.08, r1: 0.26, from: 0.2, tint: URSHIFU_RED } },
    { at: 600, until: 900, layer: 'front', drawer: 'starFlare', params: { target: 'attacker', dx: 0.5, arms: STAR_ARMS, size: 0.55, width: 0.4, core: 0.3, grow: 0.08, breakAt: 0.55, tint: STAR_GOLD } },
    { at: 760, until: 1130, layer: 'front', drawer: 'projectile', params: { path: 'straight', r0: 0.14, r1: 0.2, tongues: 4, ease: 'in', tint: STAR_GOLD } },
    flash(1100, STAR_GOLD),
    { at: 1080, until: 1400, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, distance: 1.0, spin: 300, tint: URSHIFU_RED } },
    { at: 1120, until: 2300, layer: 'front', drawer: 'darkDome', params: { r: 0.8, grow: 0.12, arcs: 0.12, ink: 0.3, end: 'fade', tint: DOME_RED } },
    { at: 1250, until: 1900, layer: 'top', drawer: 'slashArc', params: { count: 3, sweep: 110, radius: 0.75, gapDeg: 35, angle: 35, thick: 0.16, tint: URSHIFU_RED } },
  ],
  particles: [sparks(1100, 10), motes(1400, 6, { spread: 160 })],
});

export const ELECTRIC_POISON_FIGHTING_MAX_SPECS = Object.freeze({
  'max-lightning': maxLightning,
  'g-max-volt-crash': gMaxVoltCrash,
  'g-max-stun-shock': gMaxStunShock,
  'max-ooze': maxOoze,
  'g-max-malodor': gMaxMalodor,
  'max-knuckle': maxKnuckle,
  'g-max-chi-strike': gMaxChiStrike,
  'g-max-one-blow': gMaxOneBlow,
});
