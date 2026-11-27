// Design 092 § Work plan, group psychic-fairy: the Max / G-Max Move specs (tier 'S') of Max Mindstorm,
// G-Max Gravitas, Max Starfall, G-Max Finale and G-Max Smite. Each spec is its Appendix M entry's
// board mapping (.agent/designs/092-max-move-animations.md); its header is the reference brief
// from its Sword/Shield clip (Poképédia `<Nom>_EB.mp4`, 30 fps), hexes sampled from the effect.
//
// In the games the psychic pair and the fairy trio each share one frame. The psychic pair: a coil of
// hoops comes down onto the target and erupts as an iridescent column (`psychicMax`). The fairy
// trio: stars fall, shafts of light strike round the target and a burst of light ends it (`fairyMax`).
// Psychic keeps to falling hoops, lens fields and a column rising out of the card (it bends and
// rings); fairy to stars, shafts from the sky and soft light (it glitters): never each other's.
// House rules: the in-game whiteout and camera moves are dropped; shafts stay tinted (their core is
// the palette's core, never white); no ray fans; the flash is small (TCG Live's impact replaces it).
// Order inside a spec matters where two front beats start at contact: the family rule takes the
// later one (the lens for psychic, the landing star for fairy), so the shafts come first.
import { RING5, motes } from '../../signature/specs/_shared.mjs';

const DURATION = 2400;
const CONTACT = 1100;

/** The small contact flash (dropped in a game, where the TCG Live impact plays). */
const flash = (tint) => ({ at: CONTACT, until: CONTACT + 150, layer: 'top', drawer: 'impactFlash', params: { r0: 0.2, r1: 0.6, tint } });

// ---- psychic: Max Mindstorm, G-Max Gravitas ----

/** Psychic motes thrown up the column. */
const columnMotes = () => motes(CONTACT, 10, { direction: -90, spread: 70, distance: 1.4, durationMs: 900 });

/**
 * The psychic Max frame: a lens charges at the attacker; the hoop coil hangs over the defender and
 * lands on it at contact; an iridescent column of shafts rises out of it; the psychic wave (a lens
 * field) ripples over it until `waveUntil`. `after` adds the move's own finish (Gravitas's dome).
 */
const psychicMax = ({ id, name, orb, coil, coilHues = null, column, wave, waveUntil = DURATION, after = [] }) =>
  Object.freeze({
    id,
    name,
    vgType: 'psychic',
    statClass: 'special',
    tier: 'S',
    family: 'chime',
    material: 'psychic',
    durationMs: DURATION,
    contactMs: CONTACT,
    pad: 2,
    attacker: { motion: 'brace', params: { glow: 0.9 } },
    defender: { motion: 'knock', params: { strength: 0.35, heat: 0.3 } },
    tint: coil,
    beats: [
      { at: 0, until: 550, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.12, r1: 0.3, from: 0.2, tint: orb } },
      {
        at: 300,
        until: 1500,
        layer: 'front',
        drawer: 'hoopCoil',
        params: { count: 5, r: 0.62, height: 1.15, gap: 0.2, land: 0.667, spread: 1.7, spin: 420, tint: coil, ...(coilHues ? { hues: coilHues } : {}) },
      },
      flash(coil),
      // The column bursts out of the card and stands over it; the lens (a GPU field, drawn over the
      // canvas whatever its order) bends the card under it. Both start on contact: the family rule
      // takes the later in order, the lens, a psychic chime.
      { at: CONTACT, until: 1750, layer: 'front', drawer: 'skyColumn', params: { from: 'below', count: 6, spread: 0.75, stagger: 15, w: 0.16, height: 1.9, hues: column } },
      { at: CONTACT, until: waveUntil, layer: 'front', drawer: 'glyph', params: { r: 0.85, tint: wave } },
      ...after,
    ],
    particles: [columnMotes()],
  });

const MIND_ORB = Object.freeze({ deep: '#740071', body: '#C82FC8', hot: '#F59CF2', core: '#FFE1FF' });
const MIND_COIL = Object.freeze({ deep: '#740071', body: '#F03EEC', hot: '#FC9CF6', core: '#FFE1FF' });
const MIND_COLUMN = Object.freeze(['#65FBFB', '#FCFA7B', '#F474FC', '#B660E4']);
const MIND_WAVE = Object.freeze({ deep: '#862C5A', body: '#E2749B', hot: '#FD81BA', core: '#FFE1F0' });

// Max Mindstorm (Psychomax_EB.mp4): 1.6–2.4 s a spring of magenta hoops spirals out over the attacker;
// 2.4–3.4 s the coil hangs over the target and comes down onto it, a rainbow ring lighting at its feet;
// 3.6–4.6 s an iridescent column of streaks (cyan, yellow, magenta) erupts; 4.8 s whiteout; 5.0–6.0 s an
// iridescent ripple ring fades on the ground. Hoops #740071 #F03EEC #FC9CF6; column #65FBFB #FCFA7B
// #F474FC; ring #E2749B #FD81BA.
export const maxMindstorm = psychicMax({
  id: 'max-mindstorm',
  name: 'Max Mindstorm',
  orb: MIND_ORB,
  coil: MIND_COIL,
  column: MIND_COLUMN,
  wave: MIND_WAVE,
});

const GRAV_ORB = Object.freeze({ deep: '#1F6E8A', body: '#3FD8E8', hot: '#BFF6FF', core: '#F2FFFF' });
const GRAV_COIL = Object.freeze({ deep: '#5A1F7A', body: '#E769FE', hot: '#F7B8FF', core: '#FFF2FF' });
const GRAV_HUES = Object.freeze(['#62FFFC', '#E769FE']);
const GRAV_COLUMN = Object.freeze(['#62FFFC', '#B8F25A', '#DE5AF7']);
const GRAV_WAVE = Object.freeze({ deep: '#1F6E8A', body: '#62D8F0', hot: '#B8FFFC', core: '#F2FFFF' });
const GRAV_DOME = Object.freeze({ deep: '#5FD8E6', body: '#62E8F2', hot: '#9CF8F2', core: '#E8FFFE' });

// G-Max Gravitas (Ondes_G-Max_EB.mp4): 1.8–2.6 s cyan and magenta hoops spiral out of Orbeetle; 2.6–3.6 s
// they come down over the target, a rainbow ring at its feet; 3.8–4.8 s an iridescent column (cyan,
// yellow-green, magenta); 5.0 s whiteout; 5.3–6.3 s a glassy cyan gravity dome presses down over the
// target and a rainbow ripple spreads. Hoops #62FFFC #E769FE; dome #2FC6D6 #84FCEC #DFFFFF.
export const gmaxGravitas = psychicMax({
  id: 'g-max-gravitas',
  name: 'G-Max Gravitas',
  orb: GRAV_ORB,
  coil: GRAV_COIL,
  coilHues: GRAV_HUES,
  column: GRAV_COLUMN,
  wave: GRAV_WAVE,
  waveUntil: 1600,
  after: [
    // Seen from above, the dome pressed over the card is a glass sphere round it, hugging the card:
    // cyan light inside it, the glass shell (its body and lit rim) over that light.
    { at: 1450, until: DURATION, layer: 'front', drawer: 'cloud', params: { count: 3, radius: 0.5, drift: 0.1, alpha: 0.6, tint: GRAV_DOME } },
    { at: 1450, until: DURATION, layer: 'front', drawer: 'shade', params: { kind: 'sphere', r: 0.72, fill: 'hot', fillAlpha: 0.3, rimAlpha: 1, swirl: 60, tint: GRAV_DOME } },
  ],
});

// ---- fairy: Max Starfall, G-Max Finale, G-Max Smite ----

const twinkles = (at, count, over = {}) =>
  Object.freeze({
    at,
    anchor: 'defender',
    count,
    distance: 1.2,
    direction: -90,
    spread: 360,
    size: [0.04, 0.09],
    aspect: 0.8,
    gravity: 0.2,
    maxDelay: 0.15,
    durationMs: 900,
    kind: 'twinkle',
    ...over,
  });

/** A four-point glint at the attacker: the star the move calls down. */
const glint = (tint) => ({
  at: 0,
  until: 450,
  layer: 'front',
  drawer: 'starFlare',
  params: { target: 'attacker', arms: 'cross', size: 0.4, width: 0.24, core: 0.12, grow: 0.3, breakAt: 0.75, tint },
});
/** A star of light landing whole on the defender at contact and breaking up late. */
const landingStar = (tint, arms = RING5) => ({
  at: CONTACT,
  until: 1600,
  layer: 'front',
  drawer: 'starFlare',
  params: { arms, size: 0.42, width: 0.3, core: 0.14, grow: 0, breakAt: 0.7, tint },
});

/** The falling stars' rim and glint, under their lime bodies (hues). */
const STAR_RIM = Object.freeze({ deep: '#4E7A12', core: '#FFFFE0' });
const LIME_STARS = Object.freeze(['#B5E838', '#E8F25A', '#8EDB3A']);

/**
 * The fairy Max frame: a glint at the attacker calls the move; `stars` (or none) fall from the sky
 * onto the defender; shafts of light strike round it from the sky into contact; at contact the
 * central shaft strikes the card and `landing` lands on it (a five-point star of light by default);
 * the burst of light (a cloud over the card and a haze round it) lingers. `extra` adds the move's
 * own beats (Finale's whirl, Smite's arcs).
 */
const fairyMax = ({ id, name, spark, stars = null, shafts, column, burst, landing, extra = [], particles }) =>
  Object.freeze({
    id,
    name,
    vgType: 'fairy',
    statClass: 'special',
    tier: 'S',
    family: 'burst',
    material: 'fairy',
    durationMs: DURATION,
    contactMs: CONTACT,
    pad: 2,
    attacker: { motion: 'brace', params: { glow: 0.8 } },
    defender: { motion: 'knock', params: { strength: 0.35, heat: 0.3 } },
    tint: burst,
    beats: [
      glint(spark),
      ...(stars
        ? [{ at: 250, until: CONTACT, layer: 'front', drawer: 'volley', params: { from: 'sky', unit: 'star', count: 5, stagger: 110, r0: 0.1, r1: 0.14, bow: 0.5, tongues: 0, tint: STAR_RIM, hues: stars } }]
        : []),
      { at: 550, until: 1250, layer: 'front', drawer: 'skyColumn', params: { count: 4, spread: 1.6, stagger: 110, w: 0.08, height: 2, tint: shafts } },
      ...extra,
      flash(column),
      { at: CONTACT, until: 1800, layer: 'front', drawer: 'skyColumn', params: { count: 1, w: 0.3, height: 2.2, tint: column } },
      landing,
      { at: 1200, until: DURATION, layer: 'front', drawer: 'cloud', params: { count: 6, radius: 0.5, drift: 0.5, alpha: 0.8, tint: burst } },
      { at: CONTACT, until: 2100, layer: 'back', drawer: 'vignette', params: { target: 'defender', maxAlpha: 0.42, tint: burst } },
    ],
    particles,
    grain: 0.1,
  });

const FALL_SPARK = Object.freeze({ deep: '#8F8A2E', body: '#E8F25A', hot: '#FFFFC8', core: '#FFFFF0' });
const FALL_SHAFTS = Object.freeze({ deep: '#7A4FB8', body: '#C9A8FF', hot: '#F3D4F0', core: '#FFF1FB' });
const FALL_COLUMN = Object.freeze({ deep: '#AF0078', body: '#F27ADB', hot: '#FFC8F2', core: '#FFF1FB' });
const FALL_STAR = Object.freeze({ deep: '#8F8A2E', body: '#E8F25A', hot: '#FFFFC8', core: '#FFFFF0' });
const FALL_BURST = Object.freeze({ deep: '#AF0078', body: '#FE22E4', hot: '#FD7EFB', core: '#FFE1FB' });

// Max Starfall (Enchantomax_EB.mp4): 2.0–3.0 s star glints in a night sky, chunky lime stars streak
// down; 3.2–3.6 s they land round the target; 3.6–4.6 s thin pale lilac light pillars rain round it;
// 4.6–5.6 s they converge into one pink-white column on it, neon star outlines (yellow, cyan) flash;
// 5.8 s whiteout; 6.0–7.0 s a hot pink burst cloud with a ring of sparkles fades. Stars #B5E838
// #78AD35; pillars #C9A8FF #F3D4F0; burst #AF0078 #FE22E4 #FD7EFB.
export const maxStarfall = fairyMax({
  id: 'max-starfall',
  name: 'Max Starfall',
  spark: FALL_SPARK,
  stars: LIME_STARS,
  shafts: FALL_SHAFTS,
  column: FALL_COLUMN,
  burst: FALL_BURST,
  landing: landingStar(FALL_STAR),
  particles: [twinkles(CONTACT, 10), twinkles(1400, 6, { kind: 'mote', gravity: 0 })],
});

const CREAM_SPARK = Object.freeze({ deep: '#C9A15A', body: '#FFE2A8', hot: '#FFF3D6', core: '#FFFBF0' });
const CREAM_SHAFTS = Object.freeze({ deep: '#C98A4A', body: '#FFD9A0', hot: '#FFF0D2', core: '#FFFAF0' });
const CREAM_SWIRL = Object.freeze({ deep: '#C98A4A', body: '#FFE2A8', hot: '#FFF3D6', core: '#FFFBF0' });
const PASTELS = Object.freeze(['#FFC2DA', '#BFF6FF', '#FFF4A8', '#D9B8FF']);
const CREAM_COLUMN = Object.freeze({ deep: '#B8487A', body: '#FFB8D6', hot: '#FFE6F0', core: '#FFF8FB' });
const CREAM_STAR = Object.freeze({ deep: '#B8487A', body: '#FFB8D6', hot: '#FFE6F0', core: '#FFF8FB' });
const CREAM_BURST = Object.freeze({ deep: '#75337A', body: '#F452C6', hot: '#FFB0E6', core: '#FFE8F7' });

// G-Max Finale (Cure_G-Max_EB.mp4): 1.8–2.6 s sparkle rings and glints in a dark sky, cream dollops
// fly; 2.8–4.0 s cream light pillars rain round the target with lime star confetti; 4.0–5.2 s a cyclone
// of cream ribbons edged in pastel rainbow whirls round it; 5.3 s whiteout; 5.6–6.6 s a pink cream burst
// and pink streaks spread on the ground. Cream #FFE2A8 #FFF3D6; pastels #FFC2DA #BFF6FF #FFF4A8;
// burst #75337A #F452C6.
export const gmaxFinale = fairyMax({
  id: 'g-max-finale',
  name: 'G-Max Finale',
  spark: CREAM_SPARK,
  shafts: CREAM_SHAFTS,
  column: CREAM_COLUMN,
  burst: CREAM_BURST,
  landing: landingStar(CREAM_STAR, 'cross'),
  extra: [
    // The whirl: pastel-edged cream rings stand round the card spinning fast, then ripple out wide.
    {
      at: 650,
      until: 1700,
      layer: 'front',
      drawer: 'hoopCoil',
      params: { count: 4, r: 0.58, squash: 0.32, gap: 0.2, height: 0.3, land: 0.43, spread: 2.1, width: 0.045, spin: 900, tint: CREAM_SWIRL, hues: PASTELS },
    },
  ],
  particles: [twinkles(500, 8, { direction: 90, spread: 120, gravity: 0.6, distance: 0.9 }), twinkles(CONTACT, 10)],
});

const SMITE_SPARK = Object.freeze({ deep: '#8F8A2E', body: '#E8F25A', hot: '#FFFFC8', core: '#FFFFF0' });
const SMITE_SHAFTS = Object.freeze({ deep: '#1F4E9A', body: '#3FB7F0', hot: '#9CF6FF', core: '#E8FDFF' });
const SMITE_ARC = Object.freeze({ deep: '#1F4E9A', body: '#62CFFA', hot: '#C8FBFF', core: '#F2FEFF' });
const SMITE_COLUMN = Object.freeze({ deep: '#1F4E9A', body: '#4FC8F5', hot: '#B0F8FF', core: '#EEFDFF' });
const SMITE_STAR = Object.freeze({ deep: '#2E8FB8', body: '#6EFEF9', hot: '#D2FFFD', core: '#F4FFFF' });
const SMITE_BURST = Object.freeze({ deep: '#5A2A9A', body: '#E271F7', hot: '#F3B8FF', core: '#FFF0FF' });

// G-Max Smite (Sentence_G-Max_EB.mp4): 1.8–2.6 s glints in a dark sky, lime stars stream down; 2.6–3.0 s
// they land round the target; 3.0–4.0 s cyan light columns crackling with cyan arcs strike round it;
// 4.0–5.0 s one cyan column on the target, neon star outlines; 5.0 s whiteout; 5.3–6.6 s a cyan-magenta
// ripple ring with cyan arcs on the ground. Columns #1F4E9A #3FB7F0 #6EFEF9; arcs #88F9FF; ring
// #896ED2 #E271F7.
export const gmaxSmite = fairyMax({
  id: 'g-max-smite',
  name: 'G-Max Smite',
  spark: SMITE_SPARK,
  stars: LIME_STARS,
  shafts: SMITE_SHAFTS,
  column: SMITE_COLUMN,
  burst: SMITE_BURST,
  landing: landingStar(SMITE_STAR),
  extra: [
    // Arcs crackle down the shafts as they strike.
    { at: 700, until: CONTACT, layer: 'front', drawer: 'bolt', params: { from: 'sky', segments: 8, jag: 0.15, branches: 1, rerollMs: 45, width: 0.05, count: 3, spread: 1.2, tint: SMITE_ARC } },
  ],
  particles: [twinkles(CONTACT, 10), twinkles(1400, 6, { kind: 'streak', aspect: 0.2, gravity: 0 })],
});

export const PSYCHIC_FAIRY_MAX_SPECS = Object.freeze({
  'max-mindstorm': maxMindstorm,
  'g-max-gravitas': gmaxGravitas,
  'max-starfall': maxStarfall,
  'g-max-finale': gmaxFinale,
  'g-max-smite': gmaxSmite,
});
