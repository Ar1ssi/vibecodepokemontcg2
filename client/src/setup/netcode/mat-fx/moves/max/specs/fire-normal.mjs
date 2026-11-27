// Design 092 § Work plan, group fire-normal: the Max / G-Max Move specs (tier 'S') of Max Flare,
// G-Max Wildfire, G-Max Centiferno, G-Max Fireball, Max Strike, G-Max Cuddle, G-Max Replenish and
// G-Max Gold Rush. Each spec is its Appendix M entry's board mapping
// (.agent/designs/092-max-move-animations.md); its header is the reference brief from the move's
// Sword/Shield clip (Poképédia `<Nom>_EB.mp4`), hexes sampled from the effect in those frames.
// The game's 5–9 s build-up compresses to the ~1.1 s before contact; the eruption dissipates after.
//
// In a game the TCG Live impact lands at contact and replaces the generic contact dressing
// (impact-select.mjs `withoutImpactBeats`: splash, shards, smoke, rings and particle bursts on the
// defender from contact on). So what makes each move itself after contact is drawn with what it
// keeps — the eruption is a star flare's boiling core and jets over a lava column, the field fire
// pillars, the coins a volley — and a burst of the move's own matter (coins, berries, lava embers)
// leaves just before the contact frame. House rules: no whiteout (the clip's white flash is the
// impact's), no rings round the attacker, one palette start to payoff.
import { motes } from '../../signature/specs/_shared.mjs';

const CONTACT = 1100;
/** A burst of the move's own matter leaves this much before contact, so the impact keeps it. */
const MATTER_AT = CONTACT - 15;

/** The small contact flash (the TCG Live impact replaces it in a game). */
const flash = (at, tint) => ({ at, until: at + 150, layer: 'top', drawer: 'impactFlash', params: { r0: 0.2, r1: 0.6, tint } });

// ---- Fire: the Dynamax sun ----------------------------------------------------------------
// Max Flare, Wildfire and Centiferno share the game's fire frame: the attacker's own charge and a
// fire stream, a sun swelling over the target until it engulfs it, and at contact a boiling lava
// mass bursting up round the target in a column of flame. Each G-Max keeps its signature over it.

/** The fire stream from the attacker to the target. */
const stream = (at, until, tint) => ({ at, until, layer: 'front', drawer: 'beam', params: { kind: 'widening', w: 0.4, growIn: 0.4, retract: 0.35, tint } });

/** The sun's rim licking up off it, screen degrees. */
const SUN_ARMS = Object.freeze([Object.freeze({ angle: -90, reach: 0.35 })]);

/**
 * The sun swelling on the target: a boiling fireball over its centre, bright from the start and
 * still growing at contact, where it breaks up into the eruption.
 */
const sun = (at, tint, core = 0.5) => ({
  at,
  until: CONTACT + 60,
  layer: 'front',
  drawer: 'starFlare',
  params: { arms: SUN_ARMS, size: 1, width: 0.3, core, grow: 0.5, breakAt: 0.9, tint },
});

/** Upward jets of the eruption, screen degrees. */
const ERUPTION_ARMS = Object.freeze([
  Object.freeze({ angle: -90, reach: 1.1 }),
  Object.freeze({ angle: -62, reach: 0.8 }),
  Object.freeze({ angle: -118, reach: 0.8 }),
]);

/**
 * The eruption: a lava column, then the boiling mass with its jets (last: the burst family). Both
 * ignite a beat before contact, so the contact frame holds the sun bursting into them.
 */
const eruption = (tint, { w = 0.9, height = 1.6, until = CONTACT + 1000 } = {}) => [
  { at: CONTACT - 20, until, layer: 'front', drawer: 'pillar', params: { from: 'below', height, w, tint } },
  { at: CONTACT - 20, until: CONTACT + 800, layer: 'front', drawer: 'starFlare', params: { arms: ERUPTION_ARMS, size: 1, width: 0.42, core: 0.5, grow: 0.06, breakAt: 0.5, tint } },
];

/** Lava embers thrown off the eruption, falling back. */
const embers = (count, over = {}) =>
  motes(MATTER_AT, count, { kind: 'ember', distance: 1.4, spread: 150, size: [0.05, 0.12], aspect: 0.3, gravity: 0.6, maxDelay: 0.15, durationMs: 900, ...over });

/** The target's surroundings dim under the fire. */
const dim = (at = 900, until = 1900) => ({ at, until, layer: 'back', drawer: 'vignette', params: { maxAlpha: 0.4 } });

const SUN = Object.freeze({ deep: '#A52B00', body: '#F5A21E', hot: '#FFE14A', core: '#FFF6C8' });

// Max Flare (Pyromax) — 6.0 s clip, contact at 3.7 s.
// Sparks crackle off the attacker's chest into a white-hot fire core; a fire stream pours out; a
// sun swells over the target, its rim licking, until it engulfs it; at contact a column of
// boiling lava blobs erupts round the target and cools red as it falls.
// Sampled: sun #A52B00 #FAC62C #FFED4A; eruption #762607 #F3C847 #FFE555.
export const maxFlare = Object.freeze({
  id: 'max-flare',
  name: 'Max Flare',
  vgType: 'fire',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'fire',
  durationMs: 2400,
  contactMs: CONTACT,
  pad: 2,
  attacker: { motion: 'channel', params: { pulse: 0.07, glow: 0.55 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 0.4 } },
  tint: SUN,
  beats: [
    { at: 0, until: 650, layer: 'back', drawer: 'aura', params: { hz: 2, alpha: 0.35, tint: SUN } },
    { at: 0, until: 680, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.08, r1: 0.28, from: 0.15, tint: SUN } },
    stream(540, 900, SUN),
    sun(640, SUN),
    dim(),
    flash(CONTACT, SUN),
    ...eruption(SUN),
  ],
  particles: [embers(20)],
  grain: 0.28,
});

const WINGS = Object.freeze({ deep: '#5D0000', body: '#E0301F', hot: '#F8B400', core: '#FFF2B0' });
const WILDFIRE = Object.freeze({ deep: '#5A0000', body: '#E46B00', hot: '#FEC911', core: '#FFF4C8' });
/** The phoenix over the target: 0.85 h above its centre on screen. */
const PHOENIX = Object.freeze({ target: 'sky', dx: 0.5, dy: 0.85 });

// G-Max Wildfire (Fournaise G-Max) — 9.0 s clip, contact at 2.7 s.
// Charizard's flame wings flare and a fire stream pours out; a phoenix of fire spreads its wings
// over the target; at contact a lava column erupts; then fire spreads across the field round the
// target (the move's lasting burn). Sampled: wings #5D0000 #AB1C02 #F8D700; field #5A0000 #E46B00 #FEC911.
export const gMaxWildfire = Object.freeze({
  id: 'g-max-wildfire',
  name: 'G-Max Wildfire',
  vgType: 'fire',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'fire',
  durationMs: 2400,
  contactMs: CONTACT,
  pad: 2,
  attacker: { motion: 'brace', params: { rear: 0.1, scale: 1.06, glow: 0.55 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 0.45 } },
  tint: WILDFIRE,
  beats: [
    { at: 0, until: 850, layer: 'front', drawer: 'fan', params: { count: 4, spread: 36, direction: 125, lenMin: 0.8, lenMax: 1.3, width: 0.3, flap: 14, tint: WINGS } },
    { at: 0, until: 850, layer: 'front', drawer: 'fan', params: { count: 4, spread: 36, direction: -125, lenMin: 0.8, lenMax: 1.3, width: 0.3, flap: 14, tint: WINGS } },
    { at: 0, until: 650, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.08, r1: 0.26, from: 0.2, tint: WILDFIRE } },
    stream(540, 860, WILDFIRE),
    { at: 700, until: CONTACT, layer: 'front', drawer: 'coreCharge', params: { ...PHOENIX, r0: 0.16, r1: 0.3, from: 0, tint: WILDFIRE } },
    { at: 700, until: CONTACT, layer: 'front', drawer: 'fan', params: { ...PHOENIX, count: 4, spread: 40, direction: 90, lenMin: 0.9, lenMax: 1.5, width: 0.34, grow: 0.45, flap: 10, tint: WINGS } },
    { at: 700, until: CONTACT, layer: 'front', drawer: 'fan', params: { ...PHOENIX, count: 4, spread: 40, direction: -90, lenMin: 0.9, lenMax: 1.5, width: 0.34, grow: 0.45, flap: 10, tint: WINGS } },
    dim(),
    flash(CONTACT, WILDFIRE),
    ...eruption(WILDFIRE),
    // The field catches fire round the target.
    { at: 1350, until: 2400, layer: 'front', drawer: 'pillar', params: { from: 'below', height: 0.8, w: 0.35, count: 3, spread: 1.8, stagger: 150, tint: WILDFIRE } },
  ],
  particles: [embers(18)],
  grain: 0.28,
});

const COIL = Object.freeze({ deep: '#B8552A', body: '#F2A030', hot: '#FFE070', core: '#FFF6D0' });
const CENTIFERNO = Object.freeze({ deep: '#6D0000', body: '#F09000', hot: '#FFD814', core: '#FFF4C8' });

// G-Max Centiferno (Combustion G-Max) — 7.5 s clip, contact at 3.2 s.
// Centiskorch's long body coils into golden fire loops; a fire stream; a sun swells over the target;
// a lava column erupts; spiralling fire coils round the target trap it (the move's lasting vortex).
// Sampled: coil #AA4F3C #E17D3E #FFB161; spiral rings #6D0000 #F0C000 #FFD814.
export const gMaxCentiferno = Object.freeze({
  id: 'g-max-centiferno',
  name: 'G-Max Centiferno',
  vgType: 'fire',
  statClass: 'special',
  tier: 'S',
  family: 'burst',
  material: 'fire',
  durationMs: 2400,
  contactMs: CONTACT,
  pad: 2,
  attacker: { motion: 'coil', params: { turn: 18, glow: 0.55 } },
  defender: { motion: 'knock', params: { strength: 0.35, heat: 0.45 } },
  tint: CENTIFERNO,
  beats: [
    { at: 0, until: 850, layer: 'front', drawer: 'spiral', params: { target: 'attacker', turns: 1.2, r0: 0.35, r1: 0.9, rpm: 120, tongues: 14, tint: COIL } },
    stream(600, 880, CENTIFERNO),
    sun(680, CENTIFERNO, 0.48),
    dim(),
    flash(CONTACT, CENTIFERNO),
    ...eruption(CENTIFERNO, { until: CONTACT + 900 }),
    { at: 1200, until: 2400, layer: 'front', drawer: 'spiral', params: { turns: 2.5, r0: 0.3, r1: 1.05, rpm: 100, tongues: 10, tint: CENTIFERNO } },
  ],
  particles: [embers(18)],
  grain: 0.28,
});

// The ball burns orange with a hot yellow rim and an orange-gold heart, never a white one: as
// light over a bright card, a red ball summed into a faint haze.
const BALL = Object.freeze({ deep: '#8A2A0A', body: '#E8641C', hot: '#FFA83C', core: '#FFD880' });
// The comet behind it is darker, so the two never sum to white at the ball's heart.
const TAIL = Object.freeze({ deep: '#5A1008', body: '#B03018', hot: '#E06A28', core: '#F8A050' });
const BLAST = Object.freeze({ deep: '#8A2A0A', body: '#F08A1E', hot: '#FFD24A', core: '#FFF4C8' });
/** The explosion's jets: sideways sprays and two climbing ones, screen degrees. */
const BLAST_ARMS = Object.freeze([
  Object.freeze({ angle: 0, reach: 1 }),
  Object.freeze({ angle: 180, reach: 1 }),
  Object.freeze({ angle: -60, reach: 0.75 }),
  Object.freeze({ angle: -120, reach: 0.75 }),
]);

// G-Max Fireball (Pyroball G-Max) — 11.5 s clip (ability text first), contact at 8.75 s.
// Cinderace juggles an ember that swells into a giant fireball and kicks it; the red-orange ball
// with a white-hot flaming rim and long orange streaks flies at the target (here a ball about a
// card height across with flames licking off its rim and a short tail); it bursts into a
// gold-white explosion that throws sparks out sideways and leaves embers falling.
// Sampled: ball #9C4537 #D75252 #F78C34 #FDA83C; blast #E0967D #FFC892.
export const gMaxFireball = Object.freeze({
  id: 'g-max-fireball',
  name: 'G-Max Fireball',
  vgType: 'fire',
  statClass: 'physical',
  tier: 'S',
  family: 'burst',
  material: 'fire',
  durationMs: 2300,
  contactMs: CONTACT,
  pad: 1.9,
  attacker: { motion: 'hop', params: { height: 0.18, glow: 0.5 } },
  defender: { motion: 'knock', params: { strength: 0.5, heat: 0.4 } },
  tint: BLAST,
  beats: [
    { at: 0, until: 700, layer: 'front', drawer: 'coreCharge', params: { lead: 0.42, r0: 0.05, r1: 0.22, from: 0.1, tint: BALL } },
    // The tail: a small comet on the same flight, its flame jets streaming a little past the ball.
    { at: 680, until: CONTACT - 20, layer: 'front', drawer: 'projectile', params: { path: 'straight', ease: 'in', r0: 0.16, r1: 0.18, tongues: 0, tint: TAIL } },
    // The ball: a fire body flown unstretched (a flare), about a card height across, flames licking
    // round its rim; it ignites small and grows on the way. It lands as the explosion ignites.
    { at: 680, until: CONTACT - 20, layer: 'front', drawer: 'projectile', params: { path: 'straight', ease: 'in', r0: 0.3, r1: 0.3, tongues: 0, flare: 'cross', size: 0.45, flareWidth: 0.2, flareCore: 0.7, tint: BALL } },
    dim(1000, 1800),
    flash(CONTACT, BLAST),
    { at: CONTACT - 20, until: 1800, layer: 'front', drawer: 'starFlare', params: { arms: BLAST_ARMS, size: 1, width: 0.36, core: 0.45, grow: 0.06, breakAt: 0.45, tint: BLAST } },
  ],
  particles: [embers(22, { direction: 0, spread: 360, gravity: 0.4 })],
  grain: 0.28,
});

// ---- Normal: the Dynamax strike --------------------------------------------------------------
// Max Strike, G-Max Cuddle and G-Max Replenish are one frame in the game (Gold Rush shares its
// charge): prismatic sparks crackle up round the attacker; the ground cracks under the target;
// violet light spikes erupt along the cracks; a giant crescent of yellow and cyan light sweeps over
// the target and bursts. Sampled: sparks #B8B842 #63A6AC; spikes #835AA8 #916EBB #B27EC3; sweep
// yellow #D1D13B, cyan #74DCE4 #3FDAEB.

const SPIKE = Object.freeze({ deep: '#3B2A6E', body: '#8A5CC8', hot: '#C8A8FF', core: '#F0E8FF' });
// Each crescent keeps its own colour to its core: two hued crescents sharing one pale core summed
// into one cream smear.
const SWEEP_YELLOW = Object.freeze({ deep: '#604400', body: '#C89800', hot: '#D8AC08', core: '#E0B818' });
const SWEEP_CYAN = Object.freeze({ deep: '#08506A', body: '#109CC0', hot: '#30B8E0', core: '#58C8E8' });
const GOLD = Object.freeze({ deep: '#C8860A', body: '#F2C230', hot: '#FFE98A', core: '#FFFBE8' });

/** The sparks crackling up off the attacker as it Dynamax-charges (its own rim lights with them). */
const chargeSparks = () =>
  motes(60, 12, { anchor: 'attacker', kind: 'streak', direction: -90, spread: 90, distance: 1.1, size: [0.05, 0.11], aspect: 0.25, maxDelay: 0.35, durationMs: 800 });

/**
 * A crescent of light sweeping 240° round the target at 1.1 h: the blade (the arc's chord, drawn
 * long) runs about two card heights across the card as it turns, as the game's screen-wide sweep.
 */
const crescent = (at, angle, tint) => ({
  at,
  until: at + 540,
  layer: 'front',
  drawer: 'slashArc',
  params: { count: 1, sweep: 240, radius: 1.1, angle, thick: 0.3, tint },
});

/**
 * The strike frame shared by Max Strike, G-Max Cuddle and G-Max Replenish: the violet spikes
 * erupting round the target, and the yellow then cyan crescents sweeping over it (front and last:
 * the slash family), still fading through the impact. The game's ground cracks are left out: on
 * this near-overhead board a crack is a flat stroke on the cloth, a decal.
 */
const strikeFrame = () => [
  { at: 640, until: 1250, layer: 'front', drawer: 'shards', params: { mode: 'cluster', count: 9, tint: SPIKE } },
  flash(CONTACT, GOLD),
  crescent(860, -135, SWEEP_YELLOW),
  crescent(930, -70, SWEEP_CYAN),
];

/** A spec of the strike frame: everything but its own name, motions and closing beats. */
const strikeSpec = ({ id, name, attacker, defender, after = [], particles = [], durationMs = 2200 }) => {
  const charge = { beats: [], particle: chargeSparks() };
  return Object.freeze({
    id,
    name,
    vgType: 'normal',
    statClass: 'physical',
    tier: 'S',
    family: 'slash',
    material: 'normal',
    durationMs,
    contactMs: CONTACT,
    pad: 1.9,
    attacker,
    defender,
    tint: GOLD,
    beats: [...charge.beats, ...strikeFrame(), ...after],
    particles: [charge.particle, ...particles],
    grain: 0.12,
  });
};

// Max Strike (Normalomax) — 6.5 s clip, contact at 4.95 s.
export const maxStrike = strikeSpec({
  id: 'max-strike',
  name: 'Max Strike',
  attacker: { motion: 'channel', params: { pulse: 0.08, glow: 0.35 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.3 } },
});

// G-Max Cuddle (Câlin G-Max) — 7.0 s clip, contact at 4.7 s: the same frame in the game (no hearts,
// no other light): only Eevee is its own, bounding in with it (a hop, not a stand).
export const gMaxCuddle = strikeSpec({
  id: 'g-max-cuddle',
  name: 'G-Max Cuddle',
  attacker: { motion: 'hop', params: { height: 0.16, glow: 0.35 } },
  defender: { motion: 'knock', params: { strength: 0.4, heat: 0.3 } },
});

// G-Max Replenish (Récolte G-Max) — 16 s clip, contact at 4.95 s: the strike frame, then the hit
// throws up cream dust (the normal hit's own dust settles round the card here) and yellow berries
// bounce out across the field (the move restores berries). Sampled: berries #BCB305 #F3E063.
const BERRY = Object.freeze({ deep: '#3F7A24', body: '#D8C020', hot: '#F3E063', core: '#FFF9C8' });
export const gMaxReplenish = strikeSpec({
  id: 'g-max-replenish',
  name: 'G-Max Replenish',
  attacker: { motion: 'channel', params: { pulse: 0.06, glow: 0.35 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.3 } },
  durationMs: 2400,
  after: [{ at: CONTACT - 20, until: 2200, layer: 'top', drawer: 'shards', params: { count: 7, arc: 360, direction: -90, distance: 1.3, spin: 90, unit: 'berry', tint: BERRY } }],
  particles: [motes(MATTER_AT, 14, { kind: 'berry', direction: -90, spread: 170, distance: 1.3, size: [0.2, 0.3], aspect: 1, gravity: 1, maxDelay: 0.12, durationMs: 1500 })],
});

// G-Max Gold Rush (Pactole G-Max) — 13.5 s clip, contact at 4.7 s.
// Meowth's Dynamax sparks; glowing orange-pink cracks radiate under the target (left out: a crack
// is a decal on this board); a giant gold coin comes down on it and bursts into gold, coins flying;
// coins then rain onto the field.
// Sampled: coin #EBCE65 #FFF57C; cracks #C06158 #F2B68F; coins #F5C342 #FFDF44.
export const gMaxGoldRush = Object.freeze({
  id: 'g-max-gold-rush',
  name: 'G-Max Gold Rush',
  vgType: 'normal',
  statClass: 'physical',
  tier: 'S',
  family: 'burst',
  material: 'normal',
  durationMs: 2400,
  contactMs: CONTACT,
  pad: 1.9,
  attacker: { motion: 'channel', params: { pulse: 0.08, glow: 0.35 } },
  defender: { motion: 'knock', params: { strength: 0.45, heat: 0.3 } },
  tint: GOLD,
  beats: [
    flash(CONTACT, GOLD),
    { at: 600, until: CONTACT - 40, layer: 'front', drawer: 'projectile', params: { from: 'sky', path: 'straight', ease: 'in', r0: 0.42, r1: 0.5, tongues: 0, unit: 'coin', tint: GOLD } },
    { at: CONTACT - 60, until: 1700, layer: 'front', drawer: 'shards', params: { count: 8, arc: 360, direction: -90, distance: 1.4, spin: 540, unit: 'coin', tint: GOLD } },
    { at: 1150, until: 2300, layer: 'front', drawer: 'volley', params: { from: 'sky', count: 6, stagger: 140, r0: 0.1, r1: 0.12, bow: 0.3, tongues: 0, unit: 'coin', tint: GOLD } },
  ],
  particles: [
    { ...chargeSparks(), count: 8 },
    motes(MATTER_AT, 18, { kind: 'coin', direction: -90, spread: 220, distance: 1.5, size: [0.16, 0.26], aspect: 0.6, gravity: 1.2, maxDelay: 0.05, durationMs: 1450 }),
  ],
  grain: 0.12,
});

export const FIRE_NORMAL_MAX_SPECS = Object.freeze({
  'max-flare': maxFlare,
  'g-max-wildfire': gMaxWildfire,
  'g-max-centiferno': gMaxCentiferno,
  'g-max-fireball': gMaxFireball,
  'max-strike': maxStrike,
  'g-max-cuddle': gMaxCuddle,
  'g-max-replenish': gMaxReplenish,
  'g-max-gold-rush': gMaxGoldRush,
});
