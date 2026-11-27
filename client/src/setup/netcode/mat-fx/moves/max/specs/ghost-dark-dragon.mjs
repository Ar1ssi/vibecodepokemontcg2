// Design 092 § Work plan, group ghost-dark-dragon: the Max / G-Max Move specs (tier 'S') of Max
// Phantasm, G-Max Terror, Max Darkness, G-Max Snooze, Max Wyrmwind and G-Max Depletion. Each
// header is the move's reference brief, studied from its Sword/Shield clip (Poképédia
// `<Nom>_EB.mp4`, 5 fps sheets); hexes are sampled from the effect in those frames. The clip's
// 6–11 s build-up compresses into the ~1.1 s before contact; its eruption dissipates after it.
// Pairs that share a frame go through one builder each (hauntDome, darkDomeMove, wyrmMove), so
// they stay one family with each keeping its own touch. New drawers: hauntedFurniture, darkDome,
// darkRibbons, wyrmTornado (moves/max/ghost-dark-dragon-drawers.js).
// The contact flash and its dressing on the defender are the TCG Live impact's (impact-select.mjs
// strips a spec's own there), so what lands is each move's own matter: the dome, the tornado.

/** Motes or embers rising off the attacker as it charges; `over` overrides any default. */
const charge = (at, count, kind, over = {}) =>
  Object.freeze({
    at,
    anchor: 'attacker',
    count,
    distance: 0.9,
    direction: -90,
    spread: 160,
    size: [0.03, 0.06],
    aspect: 1,
    gravity: 0,
    maxDelay: 0.35,
    durationMs: 900,
    kind,
    ...over,
  });

// ---- Ghost: Max Phantasm / G-Max Terror -------------------------------------------------

const FURNITURE = Object.freeze({ deep: '#4B0357', body: '#E52AF7', hot: '#FB9AFE', core: '#FFE3FF' });
const WISPS = Object.freeze({ deep: '#2E0B4A', body: '#9B24DF', hot: '#E52AF7', core: '#FBA2FF' });
const PHANTASM_DOME = Object.freeze({ deep: '#0C0430', body: '#F25AF2', hot: '#FF4FE8', core: '#FFC8FF' });
const PHANTASM_INK = Object.freeze({ deep: '#3B065C', body: '#DF02F6', hot: '#F801E2', core: '#FBA2FF' });
const TERROR_WORLD = Object.freeze({ deep: '#120103', body: '#DD0712', hot: '#FB5059', core: '#FFC0C0' });
const TERROR_SMOKE = Object.freeze({ deep: '#200206', body: '#A0020D', hot: '#DD0712', core: '#FB5059' });

/**
 * The haunting both ghost Max Moves open with: haunted furniture lifts off round the attacker in
 * magenta light while violet wisps seep off it, flies down the lane and piles into the defender;
 * at contact a magenta energy dome rises over it, dark inside with magenta streaks crawling on it.
 */
const hauntDome = ({ id, name, durationMs, pieces, dome, after = [] }) =>
  Object.freeze({
    id,
    name,
    vgType: 'ghost',
    statClass: 'special',
    tier: 'S',
    family: 'ghost',
    material: 'ghost',
    durationMs,
    contactMs: 1100,
    pad: 2,
    attacker: { motion: 'brace', params: { glow: 1 } },
    defender: { motion: 'knock', params: { strength: 0.45, heat: 0.4 } },
    tint: WISPS,
    beats: [
      { at: 0, until: 1100, layer: 'front', drawer: 'hauntedFurniture', params: { count: pieces, size: 0.27, float: 0.42, swarm: 0.82, r0: 0.74, r1: 0.8, tint: FURNITURE } },
      { at: 0, until: 800, layer: 'back', drawer: 'cloud', params: { target: 'attacker', count: 5, radius: 0.22, drift: 0.55, alpha: 0.4, tint: WISPS } },
      { at: 1100, until: 1100 + dome.ms, layer: 'front', drawer: 'darkDome', params: { r: 0.86, grow: dome.grow, arcs: 0.25, ink: 0.92, end: dome.end, tint: PHANTASM_DOME } },
      ...after,
    ],
    particles: [charge(150, 10, 'mote', { distance: 0.8 })],
    grain: 0.12,
  });

// Max Phantasm (Spectromax, 7.5 s). Brief: (1) teapots, chairs, cups, top hats and boots float up
// round the attacker in magenta light, violet wisp-flames round them (#9B24DF #E52AF7 #FE68FE);
// (2) they fly at the target and swarm it, lit magenta with pink-white rims (#FA93F7); (3) contact:
// a magenta flash and a dome rises over it, bright magenta shell (#E54CF6) on a violet base;
// (4) inside, a dark navy world (#050058) with magenta ink streaks (#DF02F6); (5) magenta and black
// ink splashes over the ground and thins. Board: the dome stays local; the ink is ghost smoke.
export const maxPhantasm = hauntDome({
  id: 'max-phantasm',
  name: 'Max Phantasm',
  durationMs: 2300,
  pieces: 6,
  dome: { ms: 750, grow: 0.22, end: 'fade' },
  after: [{ at: 1450, until: 2300, layer: 'back', drawer: 'cloud', params: { count: 8, radius: 0.4, drift: 0.35, alpha: 0.6, tint: PHANTASM_INK } }],
});

// G-Max Terror (Hantise G-Max, 11 s). Brief: (1)–(4) as Max Phantasm, the objects larger and
// outlined in magenta neon (#E115ED); (5) the world turns red: a crimson floor and black shadow
// figures stand round the target, red flame-eyes burning on them (#DD0712 #FB5059 on #550000);
// (6) it sinks to black with the eyes last. Board: the violet dome hands over to a crimson one
// holding the eyes (the shadow world, kept local), red-black smoke round its foot.
export const gMaxTerror = hauntDome({
  id: 'g-max-terror',
  name: 'G-Max Terror',
  durationMs: 2400,
  pieces: 7,
  dome: { ms: 450, grow: 0.35, end: 'hold' },
  after: [
    { at: 1520, until: 2400, layer: 'front', drawer: 'darkDome', params: { r: 0.9, grow: 0.08, arcs: 0.08, ink: 0.97, eyes: 4, end: 'fade', tint: TERROR_WORLD } },
    { at: 1550, until: 2400, layer: 'back', drawer: 'cloud', params: { count: 8, radius: 0.38, drift: 0.25, alpha: 0.6, tint: TERROR_SMOKE } },
  ],
});

// ---- Dark: Max Darkness / G-Max Snooze --------------------------------------------------

const DARK_ORBS = Object.freeze({ deep: '#0E0A0C', body: '#120810', hot: '#EF0B62', core: '#2A0A18' });
const DARK_RIBBONS = Object.freeze({ deep: '#5E0628', body: '#E80027', hot: '#FF5A8A', core: '#FFD0DC' });
const DARK_DOME = Object.freeze({ deep: '#020120', body: '#F0103C', hot: '#5A6CFF', core: '#F55AE8' });
const DARK_CRACKS = Object.freeze({ deep: '#0E0A0C', body: '#1A0A10', hot: '#EF0B62', core: '#FF9FC0' });
const SNOOZE_ORBS = Object.freeze({ deep: '#0E0A0C', body: '#120810', hot: '#2AD4E8', core: '#0A1E2A' });
const SNOOZE_HAIR = Object.freeze({ deep: '#04015A', body: '#7A10C0', hot: '#F541E9', core: '#FFC8FF' });
const SNOOZE_DOME = Object.freeze({ deep: '#03012E', body: '#FF10D0', hot: '#4A4CE0', core: '#FF83F6' });
const SNOOZE_DUSK = Object.freeze({ deep: '#05020F', body: '#1A0A30', hot: '#3A1A5A', core: '#5A3A7A' });

/**
 * The dark pair's shared frame: spiked black orbs gather round the attacker, ribbons of dark
 * energy streak low down the lane and wrap the target, and a dome closes over it at contact,
 * navy ink inside, its shell crawling with arcs.
 */
const darkDomeMove = ({ id, name, orbs, ribbons, dome, after, particles }) =>
  Object.freeze({
    id,
    name,
    vgType: 'dark',
    statClass: 'special',
    tier: 'S',
    family: 'ghost',
    material: 'dark',
    durationMs: 2400,
    contactMs: 1100,
    pad: 2,
    attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.35, glow: 1 } },
    defender: { motion: 'knock', params: { strength: 0.5, heat: 0.45 } },
    tint: DARK_RIBBONS,
    beats: [
      { at: 0, until: 800, layer: 'front', drawer: 'orbitCharge', params: { count: 3, r0: 0.13, r1: 0.18, tongues: 0, tilt: 0.4, unit: 'spiked', tint: orbs } },
      { at: 420, until: 1100, layer: 'front', drawer: 'darkRibbons', params: ribbons },
      { at: 1100, until: 1100 + dome.ms, layer: 'front', drawer: 'darkDome', params: dome.params },
      ...after,
    ],
    particles,
    grain: 0.14,
  });

// Max Darkness (Sinistromax, 8.1 s). Brief: (1) black spiked orbs swell round the attacker and
// crimson streaks wrap its arms (#EF0B62 #E80027); (2) crimson ribbons fly low along the ground and
// converge under the target; (3) a dome closes over it: navy-black inside (#030158), a thick
// crimson rim (#EF155D #F70A38), blue arcs crawling in it (#7150EF #71BEF6); (4) its shell cracks
// with magenta veins and bursts in a magenta blast (#E9099A #F55AE8); (5) black shards and cracked
// ground, a crimson ring fading. Board: the blast and its shards are the dome's own; the ring is
// left out (no floor rings).
export const maxDarkness = darkDomeMove({
  id: 'max-darkness',
  name: 'Max Darkness',
  orbs: DARK_ORBS,
  ribbons: { count: 5, w: 0.15, bow: 0.35, length: 0.55, wrap: 150, turns: 1.2, z: 0.14, tint: DARK_RIBBONS },
  dome: { ms: 1100, params: { r: 0.86, grow: 0.16, arcs: 0.3, veins: 0.9, ink: 0.95, end: 'burst', tint: DARK_DOME } },
  after: [{ at: 1980, until: 2400, layer: 'back', drawer: 'terrain', params: { kind: 'crack', radius: 1.2, tint: DARK_CRACKS } }],
  particles: [charge(100, 8, 'streak', { aspect: 0.3, distance: 0.7 })],
});

// G-Max Snooze (Torpeur G-Max, 6.5 s). Brief: (1) black spiked orbs crackling cyan rise round the
// attacker; (2) its hair streams out as violet ribbons striped navy and magenta (#65049F #F541E9 on
// #04015A) and lashes down the lane; (3) a dome closes over the target, a crimson then hot magenta
// shell (#FC01EA #F20298) with blue arcs (#4C6CFF) on navy (#04015A); (4) the light goes out: the
// target sinks into darkness, drowsy. Board: as Max Darkness, the hair striped by its twist; the
// dome fades instead of bursting and darkness closes in round the target.
export const gMaxSnooze = darkDomeMove({
  id: 'g-max-snooze',
  name: 'G-Max Snooze',
  orbs: SNOOZE_ORBS,
  ribbons: { count: 6, w: 0.17, bow: 0.55, length: 0.65, wrap: 120, turns: 4, z: 0.25, tint: SNOOZE_HAIR },
  dome: { ms: 950, params: { r: 0.86, grow: 0.16, arcs: 0.25, veins: 0.4, ink: 0.95, end: 'fade', tint: SNOOZE_DOME } },
  after: [{ at: 1550, until: 2400, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.55, inner: 0.45, outer: 1.4, tint: SNOOZE_DUSK } }],
  particles: [charge(100, 8, 'streak', { aspect: 0.3, distance: 0.7 })],
});

// ---- Dragon: Max Wyrmwind / G-Max Depletion ---------------------------------------------

const WYRM_WRAP = Object.freeze({ deep: '#3A0A5E', body: '#A422EC', hot: '#F459EC', core: '#FFC0FF' });
const WYRM_SHARDS = Object.freeze({ deep: '#0B3A6E', body: '#3FD8F0', hot: '#9AF0FF', core: '#D8FBFF' });
const WYRM_TORNADO = Object.freeze({ deep: '#5A0E3A', body: '#B00A5E', hot: '#E8307A', core: '#FFA0C0' });
const DEPLETION_WRAP = Object.freeze({ deep: '#3A0A5E', body: '#A735E9', hot: '#DC44F0', core: '#FFC0FF' });
const DEPLETION_TORNADO = Object.freeze({ deep: '#500000', body: '#B80610', hot: '#E82020', core: '#FF9070' });

/**
 * The dragon pair's shared frame: ribbons of dragon energy wrap the attacker in a helix, fly down
 * the lane and ring the target; cyan shards burst up off it as they close in, and a tornado of
 * spinning bands stands over it from contact, flame fins riding it and debris tumbling round its
 * foot, until it unwinds.
 */
const wyrmMove = ({ id, name, wrap, tornado }) =>
  Object.freeze({
    id,
    name,
    vgType: 'dragon',
    statClass: 'special',
    tier: 'S',
    family: 'roar',
    material: 'dragon',
    durationMs: 2400,
    contactMs: 1100,
    pad: 2.2,
    attacker: { motion: 'rear-lurch', params: { rear: 0.12, lurch: 0.4, glow: 1 } },
    defender: { motion: 'knock', params: { strength: 0.5, heat: 0.45 } },
    tint: wrap,
    beats: [
      { at: 0, until: 850, layer: 'front', drawer: 'wyrmTornado', params: { target: 'attacker', height: 0.85, r0: 0.55, r1: 0.65, bands: 4, w: 0.09, rpm: 200, tint: wrap } },
      { at: 560, until: 1100, layer: 'front', drawer: 'darkRibbons', params: { count: 4, w: 0.13, bow: 0.6, length: 0.55, wrap: 280, turns: 1.5, z: 0.3, tint: wrap } },
      { at: 1040, until: 2400, layer: 'front', drawer: 'wyrmTornado', params: tornado },
      { at: 1080, until: 1480, layer: 'front', drawer: 'shards', params: { count: 8, distance: 1, spin: 200, unit: 'facet', tint: WYRM_SHARDS } },
    ],
    particles: [charge(120, 10, 'ember', { distance: 0.9 })],
    grain: 0.12,
  });

/** The tornado's shape, shared by the pair; each passes its colours and debris. */
const FUNNEL = Object.freeze({ height: 1.3, r0: 0.5, r1: 1.0, bands: 8, w: 0.17, fins: 3 });

// Max Wyrmwind (Dracomax, 8 s). Brief: (1) the attacker glows pink and violet ribbons whirl round it
// in a helix with violet flame (#A422EC #DB37F0 #F459EC); (2) they fly off and ring the target;
// (3) cyan crystal shards burst up at it (#69F2F7); (4) a magenta-crimson tornado spins over it
// (#621A47 #9B053E #ED253E), orange flame fins riding it (#FAAC38 #FEB089), black rock at its foot;
// (5) blue crackle runs on the ground as it unwinds (#69F2F7). Board: the ground crackle stands
// as spikes round the column's foot instead of a ring on the cloth.
export const maxWyrmwind = wyrmMove({
  id: 'max-wyrmwind',
  name: 'Max Wyrmwind',
  wrap: WYRM_WRAP,
  tornado: {
    ...FUNNEL,
    rpm: 180,
    fin: ['#FAAC38', '#FFE0A0'],
    debris: 6,
    debrisColour: ['#1A0E14', '#E04080'],
    crackle: 0.9,
    crackleColour: ['#3FC8FF', '#E0FFFF'],
    tint: WYRM_TORNADO,
  },
});

// G-Max Depletion (Usure G-Max, 11.5 s). Brief: (1)–(3) as Max Wyrmwind, the attacker wrapped in
// violet flame and ribbons (#A735E9 #DC44F0); (4) the tornado is crimson-red (#600101 #9D010D
// #ED040C) with orange-yellow flame fins and white metal shards whirling in it; (5) it unwinds into
// red streaks. Board: as Max Wyrmwind in crimson; the debris is glossy metal; a red crackle.
export const gMaxDepletion = wyrmMove({
  id: 'g-max-depletion',
  name: 'G-Max Depletion',
  wrap: DEPLETION_WRAP,
  tornado: {
    ...FUNNEL,
    rpm: 200,
    fin: ['#FF8A2A', '#FFE07A'],
    debris: 8,
    debrisColour: ['#D8DCE8', '#FFFFFF'],
    metal: 1,
    crackle: 0.5,
    crackleColour: ['#FF2A40', '#FFC0C0'],
    tint: DEPLETION_TORNADO,
  },
});

export const GHOST_DARK_DRAGON_MAX_SPECS = Object.freeze({
  'max-phantasm': maxPhantasm,
  'g-max-terror': gMaxTerror,
  'max-darkness': maxDarkness,
  'g-max-snooze': gMaxSnooze,
  'max-wyrmwind': maxWyrmwind,
  'g-max-depletion': gMaxDepletion,
});
