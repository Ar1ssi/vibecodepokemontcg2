import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_MOVES, MOVE_TABLE, VG_TYPES } from '../move-table.mjs';
import { moveFor } from '../move-select.mjs';
import { validateSpec } from '../move-spec.mjs';
import { REFERENCE_SPEC_IDS, SPECS } from '../specs/index.mjs';
import { fireBlast } from '../specs/fire.mjs';
import { WATER_SPECS } from '../specs/water.mjs';
import { GRASS_SPECS } from '../specs/grass.mjs';
import { ELECTRIC_SPECS } from '../specs/electric.mjs';
import { FIGHTING_SPECS } from '../specs/fighting.mjs';
import { PSYCHIC_SPECS } from '../specs/psychic.mjs';
import { DARK_SPECS } from '../specs/dark.mjs';
import { STEEL_SPECS } from '../specs/steel.mjs';
import { DRAGON_SPECS } from '../specs/dragon.mjs';
import { FAIRY_SPECS } from '../specs/fairy.mjs';
import { GHOST_SPECS } from '../specs/ghost.mjs';
import { POISON_SPECS } from '../specs/poison.mjs';
import { GROUND_SPECS } from '../specs/ground.mjs';
import { ROCK_SPECS } from '../specs/rock.mjs';
import { FLYING_SPECS } from '../specs/flying.mjs';
import { ICE_SPECS } from '../specs/ice.mjs';
import { BUG_SPECS } from '../specs/bug.mjs';
import { attackerEndMs, defenderPose } from '../card-motion.mjs';
import { slashPose } from '../move-poses.mjs';

const charizardEx = { name: 'Charizard ex', types: ['Fire'], stage: 'Stage 2', subtypes: ['Stage 2', 'ex'] };
const FIRE_SPECIAL_AND_PHYSICAL_3 = [...MOVE_TABLE.fire.special[2], ...MOVE_TABLE.fire.physical[2]];

/**
 * A spec's two `slashArc` blades sweep toward each other and, at contact, form an X on the
 * card: they cut each other near the card's centre, away from their ends, at a wide angle (two
 * chords near one point of a circle read as a single streak, which is what this guards against).
 */
const assertBladesCrossAtContact = (spec) => {
  const blades = spec.beats.filter((beat) => beat.drawer === 'slashArc');
  assert.equal(blades.length, 2, `${spec.id}: two blades`);
  assert.equal(Math.sign(blades[0].params.sweep), -Math.sign(blades[1].params.sweep), `${spec.id}: they sweep toward each other`);
  const bladeAt = (beat) => {
    const s = (spec.contactMs - beat.at) / (beat.until - beat.at);
    const [t] = slashPose(s, 100, beat.params);
    const a = (t.angleDeg * Math.PI) / 180;
    return { x: t.x, y: t.y, dx: Math.cos(a) * t.length, dy: Math.sin(a) * t.length, deg: t.angleDeg };
  };
  const [p, q] = blades.map(bladeAt);
  const det = p.dx * q.dy - p.dy * q.dx;
  assert.ok(Math.abs(det) > 1e-6, `${spec.id}: the blades are not parallel`);
  const along = ((q.x - p.x) * q.dy - (q.y - p.y) * q.dx) / det;
  const alongQ = ((q.x - p.x) * p.dy - (q.y - p.y) * p.dx) / det;
  assert.ok(along > 0.2 && along < 0.8 && alongQ > 0.2 && alongQ < 0.8, `${spec.id}: they cross mid-blade`);
  const meet = Math.hypot(p.x + along * p.dx, p.y + along * p.dy);
  assert.ok(meet < 20, `${spec.id}: they cross near the card centre (${meet.toFixed(1)} of 100)`);
  const spread = Math.abs((((p.deg - q.deg) % 180) + 180) % 180);
  assert.ok(Math.min(spread, 180 - spread) >= 60, `${spec.id}: an X, not a streak`);
};

/** A beam beat's head reaches the card `growIn` of the way into the beat. */
const beamHeadMs = (beat) => beat.at + beat.params.growIn * (beat.until - beat.at);

/** When a volley's first body lands: the flight is the beat less the staggers. */
const firstLandingMs = (beat) => beat.at + (beat.until - beat.at - (beat.params.count - 1) * beat.params.stagger);

test('every shipped spec is valid and filed under its own id', () => {
  for (const [id, spec] of Object.entries(SPECS)) {
    assert.equal(spec.id, id);
    assert.deepEqual(validateSpec(spec), [], id);
  }
});

test('every spec is a table move or a named reference, and a shipped type has every table move', () => {
  for (const id of Object.keys(SPECS)) {
    assert.ok(ALL_MOVES.includes(id) || REFERENCE_SPEC_IDS.includes(id), `${id} is not in the move table`);
  }
  for (const type of VG_TYPES) {
    const tableMoves = Object.values(MOVE_TABLE[type])
      .flat(2)
      .filter(Boolean);
    const shipped = tableMoves.some((move) => Object.hasOwn(SPECS, move));
    if (!shipped) continue;
    for (const move of tableMoves) assert.ok(Object.hasOwn(SPECS, move), `${type}: ${move} has no spec`);
  }
});

test('every shipped spec lets both cards settle before the scene ends (no snap when the ghosts go)', () => {
  for (const [id, spec] of Object.entries(SPECS)) {
    const opts = { contactMs: spec.contactMs, durationMs: spec.durationMs, laneH: 2.4 };
    assert.ok(attackerEndMs(spec.attacker.motion, opts) <= spec.durationMs, `${id}: attacker still moving`);
    const end = defenderPose(spec.defender.motion, spec.durationMs - 1, { ...opts, params: spec.defender.params });
    assert.ok(Math.abs(end.along) < 0.012 && Math.abs(end.across) < 0.012, `${id}: defender along ${end.along}`);
    assert.ok(Math.abs(end.wobble) < 0.5 && end.heat < 0.08, `${id}: defender wobble ${end.wobble} heat ${end.heat}`);
  }
});

test('the Water row ships whole: water material, soft grain, a local host, a hit at contact', () => {
  const waterMoves = Object.values(MOVE_TABLE.water).flat(2).filter(Boolean);
  assert.equal(waterMoves.length, 14);
  for (const move of waterMoves) {
    const spec = WATER_SPECS[move];
    assert.ok(spec, `${move} has a water spec`);
    assert.equal(spec.vgType, 'water');
    assert.equal(spec.material, 'water');
    assert.equal(spec.grain, 0.12);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash');
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top`);
    assert.equal(flash.at, spec.contactMs, `${move}: flash at contact`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
  }
  for (const [move, statClass] of [['aqua-tail', 'physical'], ['surf', 'special']]) {
    assert.equal(WATER_SPECS[move].statClass, statClass);
  }
});

test('the Grass row ships whole: leaf materials, no grain, a local hit at contact, no sunburst', () => {
  const grassMoves = Object.values(MOVE_TABLE.grass).flat(2).filter(Boolean);
  assert.equal(grassMoves.length, 10);
  for (const move of grassMoves) {
    const spec = GRASS_SPECS[move];
    assert.ok(spec, `${move} has a grass spec`);
    assert.equal(spec.vgType, 'grass');
    assert.ok(['grass', 'petal', 'solar'].includes(spec.material), `${move}: material ${spec.material}`);
    assert.equal(spec.grain, 0);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash' && beat.at === spec.contactMs);
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top at contact`);
    assert.equal(flash.params.target ?? 'defender', 'defender', `${move}: contact flash on the defender`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
  }
  assert.equal(GRASS_SPECS['petal-dance'].material, 'petal');
  assert.equal(GRASS_SPECS['petal-dance'].attacker.motion, 'spin');
  assert.equal(GRASS_SPECS['solar-beam'].material, 'solar');
  assert.equal(GRASS_SPECS['energy-ball'].material, 'solar');
  assert.equal(GRASS_SPECS.absorb.beats.find((beat) => beat.drawer === 'volley').params.from, 'defender');
});

test('the Electric row ships whole: electric material and family, no grain, a local hit at contact, no sunburst', () => {
  const electricMoves = Object.values(MOVE_TABLE.electric).flat(2).filter(Boolean);
  assert.equal(electricMoves.length, 8);
  for (const move of electricMoves) {
    const spec = ELECTRIC_SPECS[move];
    assert.ok(spec, `${move} has an electric spec`);
    assert.equal(spec.vgType, 'electric');
    assert.equal(spec.material, 'electric');
    assert.equal(spec.family, 'electric');
    assert.equal(spec.grain, 0);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash' && beat.at === spec.contactMs);
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top at contact`);
    assert.equal(flash.params.target ?? 'defender', 'defender', `${move}: contact flash on the defender`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
    assert.ok(spec.particles.every((burst) => burst.gravity === 0), `${move}: sparks do not fall`);
  }
  for (const move of ['nuzzle', 'thunder-fang', 'wild-charge']) assert.equal(ELECTRIC_SPECS[move].attacker.motion, 'dash', move);
  const strikes = ELECTRIC_SPECS.thunder.beats.filter((beat) => beat.drawer === 'bolt');
  assert.ok(strikes.length >= 2 && strikes.every((beat) => beat.params.from === 'sky'), 'Thunder strikes from above');
  assert.equal(ELECTRIC_SPECS['electro-shot'].beats.find((beat) => beat.drawer === 'beam').params.kind, 'segmented');
});

test('the Fighting row ships whole: fighting / aura materials, no grain, a local hit at contact, no sunburst', () => {
  const fightingMoves = Object.values(MOVE_TABLE.fighting).flat(2).filter(Boolean);
  assert.equal(fightingMoves.length, 10);
  for (const move of fightingMoves) {
    const spec = FIGHTING_SPECS[move];
    assert.ok(spec, `${move} has a fighting spec`);
    assert.equal(spec.vgType, 'fighting');
    assert.equal(spec.material, spec.statClass === 'special' ? 'aura' : 'fighting', `${move}: material`);
    assert.equal(spec.grain, 0);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash' && beat.at === spec.contactMs);
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top at contact`);
    assert.equal(flash.params.target ?? 'defender', 'defender', `${move}: contact flash on the defender`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
    assert.ok(spec.particles.every((burst) => burst.gravity === 0 && burst.anchor === 'defender'), `${move}: streaks fly off the hit`);
    if (spec.statClass === 'physical') {
      assert.ok(['dash', 'lunge'].includes(spec.attacker.motion), `${move}: the weight is in the card`);
      const p = spec.defender.params;
      assert.ok(p.strength >= 0.25 || spec.tier === 1, `${move}: a heavy knock`);
    }
  }
  for (const [move, hits] of [['arm-thrust', 3], ['triple-kick', 3], ['close-combat', 6]]) {
    const defender = FIGHTING_SPECS[move].defender;
    assert.equal(defender.motion, 'stagger', move);
    assert.equal(defender.params.hits, hits, move);
    const blows = FIGHTING_SPECS[move].beats.filter((beat) => beat.drawer === 'impactFlash').map((beat) => beat.at);
    const last = FIGHTING_SPECS[move].contactMs + (hits - 1) * defender.params.gapMs;
    assert.ok(blows.includes(last), `${move}: a flash lands on the last blow at ${last}`);
  }
  assert.equal(FIGHTING_SPECS['close-combat'].beats.filter((beat) => beat.drawer === 'glyph').length, 1, 'the barrage');
  assert.equal(FIGHTING_SPECS['karate-chop'].family, 'slash');
});

test('the Psychic row ships whole: psychic material, no grain, a local hit at contact, no sunburst', () => {
  const psychicMoves = Object.values(MOVE_TABLE.psychic).flat(2).filter(Boolean);
  assert.equal(psychicMoves.length, 6);
  for (const move of psychicMoves) {
    const spec = PSYCHIC_SPECS[move];
    assert.ok(spec, `${move} has a psychic spec`);
    assert.equal(spec.vgType, 'psychic');
    assert.equal(spec.material, 'psychic');
    assert.equal(spec.grain, 0);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash' && beat.at === spec.contactMs);
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top at contact`);
    assert.equal(flash.params.target ?? 'defender', 'defender', `${move}: contact flash on the defender`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
    assert.ok(spec.particles.every((burst) => burst.gravity === 0 && burst.anchor === 'defender'), `${move}: motes drift off the hit`);
    assert.ok(spec.beats.some((beat) => beat.drawer === 'glyph' || beat.drawer === 'spiral'), `${move}: the psychic wave`);
  }
  for (const move of ['confusion', 'psychic']) assert.equal(PSYCHIC_SPECS[move].defender.motion, 'float', `${move} lifts the defender`);
  for (const move of ['confusion', 'psychic', 'future-sight']) assert.equal(PSYCHIC_SPECS[move].family, 'chime', move);
  assert.equal(PSYCHIC_SPECS['zen-headbutt'].attacker.motion, 'dash');
  assert.equal(PSYCHIC_SPECS['psycho-cut'].family, 'slash');
  const beam = PSYCHIC_SPECS.psybeam.beats.find((beat) => beat.drawer === 'beam');
  assert.equal(beam.params.kind, 'segmented');
  assert.equal(beam.at + beam.params.growIn * (beam.until - beam.at), PSYCHIC_SPECS.psybeam.contactMs, 'the beam head lands at contact');
});

test('the Dark row ships whole: dark material, light grain, a local hit at contact, no sunburst', () => {
  const darkMoves = Object.values(MOVE_TABLE.dark).flat(2).filter(Boolean);
  assert.equal(darkMoves.length, 7);
  for (const move of darkMoves) {
    const spec = DARK_SPECS[move];
    assert.ok(spec, `${move} has a dark spec`);
    assert.equal(spec.vgType, 'dark');
    assert.equal(spec.material, 'dark');
    assert.equal(spec.grain, 0.15);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash' && beat.at === spec.contactMs);
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top at contact`);
    assert.equal(flash.params.target ?? 'defender', 'defender', `${move}: contact flash on the defender`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
    assert.ok(spec.particles.every((burst) => burst.gravity === 0 && burst.anchor === 'defender'), `${move}: streaks fly off the hit`);
    if (spec.statClass === 'physical') {
      assert.equal(spec.family, 'slash', `${move}: a physical dark move is a cut`);
      assert.ok(['dash', 'lunge'].includes(spec.attacker.motion), `${move}: the weight is in the card`);
    }
  }
  const nightSlash = DARK_SPECS['night-slash'];
  assert.equal(nightSlash.defender.motion, 'stagger');
  assert.equal(nightSlash.defender.params.hits, 2);
  const cuts = nightSlash.beats.filter((beat) => beat.drawer === 'slashArc');
  assert.equal(cuts.length, 2, 'Night Slash cuts twice');
  const second = nightSlash.contactMs + nightSlash.defender.params.gapMs;
  assert.ok(nightSlash.beats.some((beat) => beat.drawer === 'impactFlash' && beat.at === second), 'a flash on the second cut');
  const jaws = DARK_SPECS.bite.beats.filter((beat) => beat.drawer === 'slashArc');
  assert.deepEqual(jaws.map((beat) => beat.params.angle), [-90, 90], 'Bite closes an upper and a lower jaw');
  assert.equal(DARK_SPECS.snarl.family, 'projectile');
  assert.equal(DARK_SPECS['dark-pulse'].family, 'burst');
});

test('the Steel row ships whole: steel material, no grain, a local hit at contact, no sunburst', () => {
  const steelMoves = Object.values(MOVE_TABLE.steel).flat(2).filter(Boolean);
  assert.equal(steelMoves.length, 8);
  for (const move of steelMoves) {
    const spec = STEEL_SPECS[move];
    assert.ok(spec, `${move} has a steel spec`);
    assert.equal(spec.vgType, 'steel');
    assert.equal(spec.material, 'steel');
    assert.equal(spec.grain, 0);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash' && beat.at === spec.contactMs);
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top at contact`);
    assert.equal(flash.params.target ?? 'defender', 'defender', `${move}: contact flash on the defender`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
    assert.ok(spec.beats.some((beat) => beat.drawer === 'shards' && beat.at >= spec.contactMs), `${move}: steel splinters off the hit`);
    assert.ok(spec.particles.every((burst) => burst.anchor === 'defender'), `${move}: sparks fly off the hit`);
    if (spec.statClass === 'physical') {
      assert.ok(['dash', 'lunge'].includes(spec.attacker.motion), `${move}: the weight is in the card`);
    }
  }
  const bullet = STEEL_SPECS['bullet-punch'];
  assert.equal(bullet.defender.motion, 'stagger');
  const last = bullet.contactMs + (bullet.defender.params.hits - 1) * bullet.defender.params.gapMs;
  const blows = bullet.beats.filter((beat) => beat.drawer === 'impactFlash').map((beat) => beat.at);
  assert.equal(blows.length, bullet.defender.params.hits, 'one flash per bullet');
  assert.equal(Math.max(...blows), last, 'the last flash on the last blow');
  const bullets = bullet.beats.find((beat) => beat.drawer === 'volley');
  assert.equal(bullets.params.count, bullet.defender.params.hits);
  assert.equal(bullets.until, last, 'the last bullet lands on the last blow');
  const flight = bullets.until - bullets.at - (bullets.params.count - 1) * bullets.params.stagger;
  assert.equal(bullets.at + flight, bullet.contactMs, 'the first bullet lands at contact');
  assert.equal(STEEL_SPECS['metal-claw'].beats.filter((beat) => beat.drawer === 'slashArc').length, 2, 'Metal Claw rakes twice');
  assert.equal(STEEL_SPECS['smart-strike'].beats.filter((beat) => beat.drawer === 'glyph').length, 1, 'the lock-on reticle');
  for (const move of ['flash-cannon', 'steel-beam']) {
    const spec = STEEL_SPECS[move];
    assert.equal(spec.family, 'beam', move);
    const beam = spec.beats.find((beat) => beat.drawer === 'beam');
    assert.equal(beam.params.kind, 'solid', move);
    assert.equal(beam.at + beam.params.growIn * (beam.until - beam.at), spec.contactMs, `${move}: the beam head lands at contact`);
  }
  const width = (move) => STEEL_SPECS[move].beats.find((beat) => beat.drawer === 'beam').params.w;
  assert.ok(width('steel-beam') > width('flash-cannon'), 'Steel Beam is the wide beam');
});

test('the Dragon row ships whole: dragon material, the recipe grain, a local hit at contact, no sunburst', () => {
  const dragonMoves = Object.values(MOVE_TABLE.dragon).flat(2).filter(Boolean);
  assert.equal(dragonMoves.length, 7);
  for (const move of dragonMoves) {
    const spec = DRAGON_SPECS[move];
    assert.ok(spec, `${move} has a dragon spec`);
    assert.equal(spec.vgType, 'dragon');
    assert.equal(spec.material, 'dragon');
    assert.equal(spec.grain, 0.25);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash' && beat.at === spec.contactMs);
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top at contact`);
    assert.equal(flash.params.target ?? 'defender', 'defender', `${move}: contact flash on the defender`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
    assert.ok(spec.particles.every((burst) => burst.anchor === 'defender'), `${move}: embers fly off the hit`);
    if (spec.statClass === 'physical') assert.equal(spec.attacker.motion, 'dash', `${move}: the weight is in the card`);
    if (spec.tier === 3) assert.equal(spec.family, 'roar', `${move}: a tier-3 dragon move roars`);
  }
  for (const [move, hits] of [['dual-chop', 2], ['outrage', 4], ['draco-meteor', 4]]) {
    const spec = DRAGON_SPECS[move];
    assert.equal(spec.defender.motion, 'stagger', move);
    assert.equal(spec.defender.params.hits, hits, move);
    const flashes = spec.beats.filter((beat) => beat.drawer === 'impactFlash').map((beat) => beat.at);
    for (let hit = 0; hit < hits; hit += 1) {
      const at = spec.contactMs + hit * spec.defender.params.gapMs;
      assert.ok(flashes.includes(at), `${move}: a flash on blow ${hit + 1} at ${at}`);
    }
  }
  const meteors = DRAGON_SPECS['draco-meteor'].beats.find((beat) => beat.drawer === 'volley');
  assert.equal(meteors.params.from, 'sky', 'Draco Meteor falls from the sky');
  assert.equal(meteors.params.count, DRAGON_SPECS['draco-meteor'].defender.params.hits, 'one blow per meteor');
  const flight = meteors.until - meteors.at - (meteors.params.count - 1) * meteors.params.stagger;
  assert.equal(meteors.at + flight, DRAGON_SPECS['draco-meteor'].contactMs, 'the first meteor lands at contact');
  assert.equal(meteors.params.stagger, DRAGON_SPECS['draco-meteor'].defender.params.gapMs, 'each meteor lands a blow');
  assert.ok(DRAGON_SPECS['draco-meteor'].beats.some((beat) => beat.drawer === 'terrain' && beat.params.kind === 'crack'), 'the floor cracks');
  const breath = DRAGON_SPECS['dragon-breath'];
  const stream = breath.beats.find((beat) => beat.drawer === 'beam');
  assert.equal(stream.params.kind, 'widening');
  assert.equal(stream.at + stream.params.growIn * (stream.until - stream.at), breath.contactMs, 'the breath lands at contact');
  const pulse = DRAGON_SPECS['dragon-pulse'];
  const chain = pulse.beats.find((beat) => beat.drawer === 'volley');
  assert.ok(chain.params.count >= 4, 'Dragon Pulse is a chain of orbs');
  const head = chain.until - chain.at - (chain.params.count - 1) * chain.params.stagger;
  assert.equal(chain.at + head, pulse.contactMs, 'the head of the chain lands at contact');
  assert.equal(DRAGON_SPECS.twister.family, 'wind');
  assert.ok(DRAGON_SPECS.twister.beats.some((beat) => beat.drawer === 'spiral' && (beat.params.target ?? 'defender') === 'defender'));
  assert.equal(DRAGON_SPECS['dual-chop'].beats.filter((beat) => beat.drawer === 'slashArc').length, 2, 'Dual Chop chops twice');
  assert.equal(DRAGON_SPECS['dragon-claw'].beats.filter((beat) => beat.drawer === 'slashArc').length, 4, 'two pairs of claws');
});

test('the Fairy row ships whole: fairy material, no grain, a local hit at contact, no sunburst, pink twinkles', () => {
  const fairyMoves = Object.values(MOVE_TABLE.fairy).flat(2).filter(Boolean);
  assert.equal(fairyMoves.length, 7);
  for (const move of fairyMoves) {
    const spec = FAIRY_SPECS[move];
    assert.ok(spec, `${move} has a fairy spec`);
    assert.equal(spec.vgType, 'fairy');
    assert.equal(spec.material, 'fairy');
    assert.equal(spec.grain, 0);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash' && beat.at === spec.contactMs);
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top at contact`);
    assert.equal(flash.params.target ?? 'defender', 'defender', `${move}: contact flash on the defender`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'smoke'), `${move}: fairy leaves no smoke`);
    assert.ok(spec.particles.every((burst) => burst.gravity === 0 && ['twinkle', 'star'].includes(burst.kind)), `${move}: sparkles drift`);
    assert.ok(spec.particles.some((burst) => burst.kind === 'twinkle' && burst.anchor === 'defender'), `${move}: twinkles off the hit`);
    if (spec.statClass === 'physical') assert.equal(spec.attacker.motion, 'dash', `${move}: the weight is in the card`);
  }
  const rough = FAIRY_SPECS['play-rough'];
  assert.equal(rough.defender.motion, 'stagger');
  assert.equal(rough.defender.params.hits, 4);
  const flashes = rough.beats.filter((beat) => beat.drawer === 'impactFlash').map((beat) => beat.at);
  for (let hit = 0; hit < 4; hit += 1) {
    const at = rough.contactMs + hit * rough.defender.params.gapMs;
    assert.ok(flashes.includes(at), `Play Rough: a flash on blow ${hit + 1} at ${at}`);
  }
  assert.ok(rough.particles.some((burst) => burst.kind === 'star'), 'Play Rough throws gold stars');
  assert.ok(rough.beats.some((beat) => beat.drawer === 'cloud' && beat.layer === 'front' && beat.at < rough.contactMs), 'the fight cloud');
  for (const move of ['disarming-voice', 'draining-kiss', 'dazzling-gleam']) assert.equal(FAIRY_SPECS[move].family, 'chime', move);
  assert.equal(FAIRY_SPECS['fairy-wind'].family, 'wind');
  const gust = FAIRY_SPECS['fairy-wind'].beats.find((beat) => beat.drawer === 'beam');
  assert.equal(gust.at + gust.params.growIn * (gust.until - gust.at), FAIRY_SPECS['fairy-wind'].contactMs, 'the gust lands at contact');
  const voice = FAIRY_SPECS['disarming-voice'].beats.find((beat) => beat.drawer === 'volley');
  assert.equal(voice.until, FAIRY_SPECS['disarming-voice'].contactMs, 'the last twinkle lands at contact');
  const drain = FAIRY_SPECS['draining-kiss'].beats.find((beat) => beat.drawer === 'volley');
  assert.equal(drain.params.from, 'defender', 'Draining Kiss drains back up the lane');
  assert.ok(drain.at > FAIRY_SPECS['draining-kiss'].contactMs);
  const gleam = FAIRY_SPECS['dazzling-gleam'];
  const spray = gleam.beats.find((beat) => beat.drawer === 'volley');
  const flight = spray.until - spray.at - (spray.params.count - 1) * spray.params.stagger;
  assert.equal(spray.at + flight, gleam.contactMs, 'the first twinkle of the spray lands at contact');
  const moon = FAIRY_SPECS.moonblast;
  assert.equal(moon.family, 'burst');
  assert.equal(moon.beats.find((beat) => beat.drawer === 'projectile').until, moon.contactMs, 'the moon lands at contact');
  assert.equal(moon.beats.find((beat) => beat.drawer === 'pillar').params.from, 'above', 'moonlight falls on the attacker');
  for (const id of ['spirit-break', 'dazzling-gleam', 'moonblast']) {
    assert.ok(FAIRY_SPECS[id].beats.some((beat) => beat.drawer === 'glyph' && (beat.params.target ?? 'defender') === 'defender'), `${id}: the fairy star`);
  }
});

test('the Ghost row ships whole: ghost material, the recipe grain, a local hit at contact, no sunburst, violet motes', () => {
  const ghostMoves = Object.values(MOVE_TABLE.ghost).flat(2).filter(Boolean);
  assert.equal(ghostMoves.length, 9);
  for (const move of ghostMoves) {
    const spec = GHOST_SPECS[move];
    assert.ok(spec, `${move} has a ghost spec`);
    assert.equal(spec.vgType, 'ghost');
    assert.equal(spec.material, 'ghost');
    assert.equal(spec.grain, 0.2);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash' && beat.at === spec.contactMs);
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top at contact`);
    assert.equal(flash.params.target ?? 'defender', 'defender', `${move}: contact flash on the defender`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
    assert.ok(spec.particles.every((burst) => burst.gravity === 0 && burst.kind === 'mote'), `${move}: motes float`);
    assert.ok(spec.particles.some((burst) => burst.anchor === 'defender' && burst.at >= spec.contactMs), `${move}: motes off the hit`);
    if (spec.statClass === 'physical') assert.ok(['dash', 'lunge'].includes(spec.attacker.motion), `${move}: the weight is in the card`);
  }
  for (const id of ['astonish', 'phantom-force', 'night-shade', 'hex']) {
    const spec = GHOST_SPECS[id];
    assert.equal(spec.family, 'ghost', `${id}: a curse sounds the ghost voice`);
    const eyes = spec.beats.find((beat) => beat.drawer === 'glyph');
    assert.ok(eyes && (eyes.params.target ?? 'defender') === 'defender', `${id}: slit eyes on the defender`);
    assert.ok(eyes.at < spec.contactMs && spec.contactMs < eyes.until, `${id}: the eyes are open at contact`);
  }
  const claws = GHOST_SPECS['shadow-claw'].beats.filter((beat) => beat.drawer === 'slashArc');
  assert.equal(claws.length, 3, 'Shadow Claw rakes three claws');
  assert.equal(GHOST_SPECS['shadow-claw'].family, 'slash');
  assert.equal(GHOST_SPECS.lick.family, 'slash');
  assert.equal(GHOST_SPECS['shadow-punch'].family, 'punch');
  const fist = GHOST_SPECS['shadow-punch'].beats.find((beat) => beat.drawer === 'projectile');
  assert.equal(fist.until, GHOST_SPECS['shadow-punch'].contactMs, 'the shadow fist lands at contact');
  const vanish = GHOST_SPECS['phantom-force'].beats.find((beat) => beat.drawer === 'cloud' && beat.layer === 'front');
  assert.equal(vanish.params.target, 'attacker', 'Phantom Force sinks into its own shadow');
  assert.ok(vanish.until < GHOST_SPECS['phantom-force'].contactMs);
  const wind = GHOST_SPECS['ominous-wind'];
  assert.equal(wind.family, 'wind');
  const bands = wind.beats.find((beat) => beat.drawer === 'beam');
  assert.equal(bands.at + bands.params.growIn * (bands.until - bands.at), wind.contactMs, 'the wind lands at contact');
  const ball = GHOST_SPECS['shadow-ball'];
  assert.equal(ball.family, 'burst');
  assert.equal(ball.beats.find((beat) => beat.drawer === 'projectile').until, ball.contactMs, 'the shadow ball lands at contact');
  assert.equal(GHOST_SPECS['night-shade'].attacker.motion, 'brace', 'Night Shade is cast, not thrown');
  assert.equal(GHOST_SPECS['night-shade'].defender.params.heat, 1, 'night falls on the struck card');
});

test('the Poison row ships whole: poison material, the recipe grain, a local hit at contact, no sunburst, falling globs, a poisoned card', () => {
  const poisonMoves = Object.values(MOVE_TABLE.poison).flat(2).filter(Boolean);
  assert.equal(poisonMoves.length, 9);
  for (const move of poisonMoves) {
    const spec = POISON_SPECS[move];
    assert.ok(spec, `${move} has a poison spec`);
    assert.equal(spec.vgType, 'poison');
    assert.equal(spec.material, 'poison');
    assert.equal(spec.grain, 0.15);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash' && beat.at === spec.contactMs);
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top at contact`);
    assert.equal(flash.params.target ?? 'defender', 'defender', `${move}: contact flash on the defender`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
    assert.ok(spec.particles.every((burst) => burst.kind === 'glob' && burst.gravity >= 0.8), `${move}: globs fall`);
    assert.ok(spec.particles.some((burst) => burst.anchor === 'defender' && burst.at >= spec.contactMs), `${move}: globs off the hit`);
    const pool = spec.beats.find((beat) => beat.drawer === 'glyph');
    assert.ok(pool && (pool.params.target ?? 'defender') === 'defender', `${move}: bubbles rise off the defender`);
    assert.ok(pool.at > spec.contactMs, `${move}: the pool follows the hit (the family stays the hit's)`);
    assert.ok(spec.defender.params.heat >= 0.5, `${move}: the struck card turns violet`);
    if (spec.statClass === 'physical') assert.ok(['dash', 'lunge'].includes(spec.attacker.motion), `${move}: the weight is in the card`);
  }
  assert.equal(POISON_SPECS['poison-sting'].family, 'projectile');
  const dart = POISON_SPECS['poison-sting'].beats.find((beat) => beat.drawer === 'projectile');
  assert.ok(dart.at < POISON_SPECS['poison-sting'].contactMs && POISON_SPECS['poison-sting'].contactMs < dart.until, 'the dart is in flight at contact');
  assert.equal(POISON_SPECS['poison-tail'].family, 'slash');

  const jab = POISON_SPECS['poison-jab'];
  assert.equal(jab.family, 'punch');
  assert.equal(jab.defender.motion, 'stagger');
  const hits = jab.defender.params.hits;
  const flashes = jab.beats.filter((beat) => beat.drawer === 'impactFlash').map((beat) => beat.at);
  for (let hit = 0; hit < hits; hit += 1) {
    const at = jab.contactMs + hit * jab.defender.params.gapMs;
    assert.ok(flashes.includes(at), `Poison Jab: a flash on blow ${hit + 1} at ${at}`);
  }
  const darts = jab.beats.find((beat) => beat.drawer === 'volley');
  assert.equal(darts.params.count, hits, 'one dart per blow');
  assert.equal(darts.params.stagger, jab.defender.params.gapMs);
  const flight = darts.until - darts.at - (darts.params.count - 1) * darts.params.stagger;
  assert.equal(darts.at + flight, jab.contactMs, 'the first dart lands at contact');

  const cross = POISON_SPECS['cross-poison'];
  assert.equal(cross.family, 'slash');
  assertBladesCrossAtContact(cross);

  const acid = POISON_SPECS.acid;
  assert.equal(acid.family, 'splash');
  assert.equal(acid.beats.find((beat) => beat.drawer === 'volley').until, acid.contactMs, 'the last acid glob lands at contact');
  for (const id of ['sludge', 'sludge-bomb']) {
    const spec = POISON_SPECS[id];
    assert.equal(spec.family, 'splash', id);
    const lob = spec.beats.find((beat) => beat.drawer === 'projectile');
    assert.equal(lob.params.path, 'arc', `${id}: lobbed`);
    assert.equal(lob.until, spec.contactMs, `${id}: the glob lands at contact`);
  }
  const veno = POISON_SPECS.venoshock;
  assert.equal(veno.family, 'splash');
  assert.ok(veno.beats.some((beat) => beat.drawer === 'pillar' && beat.at > veno.contactMs), 'the venom fountain rises after the hit');
  const wave = POISON_SPECS['sludge-wave'];
  assert.equal(wave.family, 'splash');
  const flood = wave.beats.find((beat) => beat.drawer === 'beam');
  assert.equal(flood.params.kind, 'widening');
  assert.equal(flood.at + flood.params.growIn * (flood.until - flood.at), wave.contactMs, 'the flood lands at contact');
  assert.ok(wave.beats.some((beat) => beat.drawer === 'terrain' && beat.params.kind === 'wave'), 'the wave rolls over the floor');
});

test('the Ground row ships whole: earth for the quakes, mud for the throws, the recipe grain, a local hit at contact, no sunburst', () => {
  const groundMoves = Object.values(MOVE_TABLE.ground).flat(2).filter(Boolean);
  assert.equal(new Set(groundMoves).size, 9, 'Mud-Slap sits in two cells');
  const MUD = ['sand-tomb', 'mud-slap', 'mud-shot', 'mud-bomb'];
  for (const move of groundMoves) {
    const spec = GROUND_SPECS[move];
    assert.ok(spec, `${move} has a ground spec`);
    assert.equal(spec.vgType, 'ground');
    assert.equal(spec.material, MUD.includes(move) ? 'mud' : 'ground', `${move}: material`);
    assert.equal(spec.grain, 0.2);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash' && beat.at === spec.contactMs);
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top at contact`);
    assert.equal(flash.params.target ?? 'defender', 'defender', `${move}: contact flash on the defender`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
    assert.ok(spec.particles.some((burst) => burst.anchor === 'defender' && burst.at >= spec.contactMs), `${move}: debris off the hit`);
    const kind = spec.material === 'mud' && move !== 'sand-tomb' ? 'glob' : 'shard';
    assert.ok(spec.particles.every((burst) => burst.kind === kind && burst.gravity > 0), `${move}: ${kind}s fall`);
  }

  for (const id of ['bulldoze', 'stomping-tantrum', 'earthquake']) {
    const spec = GROUND_SPECS[id];
    assert.equal(spec.attacker.motion, 'stomp', `${id}: the attacker stomps`);
    assert.equal(spec.defender.motion, 'sink', `${id}: the struck card is pressed into the floor`);
  }
  for (const id of ['bulldoze', 'stomping-tantrum', 'earthquake', 'earth-power']) {
    const spec = GROUND_SPECS[id];
    assert.equal(spec.family, 'quake', `${id}: the table quakes`);
    const quake = spec.beats.find((beat) => beat.drawer === 'terrain' && beat.params.kind === 'quake');
    assert.equal(quake?.at, spec.contactMs, `${id}: the quake starts at contact`);
    const crack = spec.beats.find((beat) => beat.drawer === 'terrain' && beat.params.kind === 'crack');
    assert.ok(crack && crack.layer === 'back' && (crack.params.target ?? 'defender') === 'defender', `${id}: the ground cracks under the card`);
    assert.ok(crack.at <= spec.contactMs && spec.contactMs < crack.until, `${id}: cracked at contact`);
  }
  for (const id of ['earthquake', 'earth-power']) {
    const spires = GROUND_SPECS[id].beats.find((beat) => beat.drawer === 'pillar');
    assert.equal(spires.layer, 'back', `${id}: the spires rise behind the card, never hiding it`);
    assert.equal(spires.at, GROUND_SPECS[id].contactMs);
  }

  const power = GROUND_SPECS['earth-power'];
  const fissure = power.beats.find((beat) => beat.drawer === 'glyph');
  assert.ok(fissure.at < power.contactMs && power.contactMs < fissure.until, 'Earth Power: the ground glows before and through the eruption');
  const horse = GROUND_SPECS['high-horsepower'];
  assert.equal(horse.attacker.motion, 'dash');
  assert.equal(horse.family, 'dash');
  assert.ok(horse.beats.find((beat) => beat.drawer === 'glyph').at > horse.contactMs, 'the hoofprint follows the hit');
  for (const spec of [power, horse]) {
    assert.equal(spec.beats.find((beat) => beat.drawer === 'glyph').layer, 'back', `${spec.id}: the glowing ground stays behind the card`);
  }

  const tomb = GROUND_SPECS['sand-tomb'];
  assert.equal(tomb.family, 'wind');
  const vortex = tomb.beats.find((beat) => beat.drawer === 'spiral');
  assert.equal(vortex.layer, 'back', 'the sand swirls round behind the card');
  assert.ok(vortex.at <= tomb.contactMs && tomb.contactMs < vortex.until, 'the sand swirls through contact');
  const slap = GROUND_SPECS['mud-slap'];
  assert.equal(slap.family, 'splash');
  assert.equal(slap.beats.find((beat) => beat.drawer === 'volley').until, slap.contactMs, 'the last glob lands at contact');
  const shot = GROUND_SPECS['mud-shot'];
  assert.equal(shot.family, 'splash');
  const stream = shot.beats.find((beat) => beat.drawer === 'beam');
  assert.equal(stream.at + stream.params.growIn * (stream.until - stream.at), shot.contactMs, 'the stream hits at contact');
  const bomb = GROUND_SPECS['mud-bomb'];
  assert.equal(bomb.family, 'splash');
  const lob = bomb.beats.find((beat) => beat.drawer === 'projectile');
  assert.equal(lob.params.path, 'arc', 'Mud Bomb is lobbed');
  assert.equal(lob.until, bomb.contactMs, 'the bomb lands at contact');
});

test('the Rock row ships whole: stone for the throws and quakes, ancient and gem for the specials, a local hit at contact, no sunburst', () => {
  const rockMoves = Object.values(MOVE_TABLE.rock).flat(2).filter(Boolean);
  assert.equal(rockMoves.length, 10);
  const MATERIAL = { 'ancient-power': 'ancient', 'power-gem': 'gem' };
  for (const move of rockMoves) {
    const spec = ROCK_SPECS[move];
    assert.ok(spec, `${move} has a rock spec`);
    assert.equal(spec.vgType, 'rock');
    assert.equal(spec.material, MATERIAL[move] ?? 'rock', `${move}: material`);
    assert.equal(spec.grain, spec.material === 'gem' ? 0 : 0.1, `${move}: grain`);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash' && beat.at === spec.contactMs);
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top at contact`);
    assert.equal(flash.params.target ?? 'defender', 'defender', `${move}: contact flash on the defender`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
    assert.ok(spec.particles.some((burst) => burst.anchor === 'defender' && burst.at >= spec.contactMs), `${move}: debris off the hit`);
    for (const burst of spec.particles.filter((b) => b.kind === 'shard')) assert.ok(burst.gravity > 0, `${move}: chips fall`);
  }
  assert.equal(ROCK_SPECS['ancient-power'].statClass, 'special');
  assert.equal(ROCK_SPECS['power-gem'].statClass, 'special');

  // Multi-hit throws: one stone per blow, 'stagger' spacing = the volley's, the first lands at contact.
  for (const id of ['rock-throw', 'rock-blast', 'rock-slide', 'ancient-power']) {
    const spec = ROCK_SPECS[id];
    assert.equal(spec.defender.motion, 'stagger', `${id}: one blow per stone`);
    const stones = spec.beats.find((beat) => beat.drawer === 'volley');
    assert.equal(stones.params.count, spec.defender.params.hits, `${id}: a stone per blow`);
    assert.equal(stones.params.stagger, spec.defender.params.gapMs, `${id}: stones land on the blows`);
    const flight = stones.until - stones.at - (stones.params.count - 1) * stones.params.stagger;
    assert.equal(stones.at + flight, spec.contactMs, `${id}: the first stone lands at contact`);
  }
  for (const id of ['rock-throw', 'rock-slide']) {
    assert.equal(ROCK_SPECS[id].beats.find((beat) => beat.drawer === 'volley').params.from, 'sky', `${id}: the rocks fall from above`);
  }

  for (const id of ['smack-down', 'stone-edge']) {
    const spec = ROCK_SPECS[id];
    assert.equal(spec.family, 'quake', `${id}: the slam shakes the table`);
    const quake = spec.beats.find((beat) => beat.drawer === 'terrain' && beat.params.kind === 'quake');
    assert.equal(quake?.at, spec.contactMs, `${id}: the quake starts at contact`);
  }
  assert.equal(ROCK_SPECS['smack-down'].defender.motion, 'sink', 'Smack Down slams the card down');
  const thrown = ROCK_SPECS['smack-down'].beats.find((beat) => beat.drawer === 'projectile');
  assert.equal(thrown.params.path, 'straight');
  assert.equal(thrown.until, ROCK_SPECS['smack-down'].contactMs, 'the stone strikes at contact');

  for (const id of ['rock-tomb', 'stone-edge']) {
    const spec = ROCK_SPECS[id];
    const wall = spec.beats.find((beat) => beat.drawer === 'pillar');
    assert.equal(wall?.layer, 'back', `${id}: the stone rises behind the card, never hiding it`);
    assert.equal(wall.at, spec.contactMs);
  }
  assert.equal(ROCK_SPECS['stone-edge'].attacker.motion, 'stomp');
  assert.ok(ROCK_SPECS['stone-edge'].beats.some((beat) => beat.drawer === 'terrain' && beat.params.kind === 'crack' && beat.at < 1000), 'Stone Edge: the floor cracks before the spires');

  const smash = ROCK_SPECS['head-smash'];
  assert.equal(smash.attacker.motion, 'dash');
  assert.equal(smash.family, 'dash');
  assert.ok(smash.defender.params.strength >= 0.45, 'Head Smash hits heavy');

  const wrecker = ROCK_SPECS['rock-wrecker'];
  const boulder = wrecker.beats.find((beat) => beat.drawer === 'projectile');
  assert.equal(boulder.params.path, 'straight');
  assert.ok(boulder.params.r1 >= 0.45, 'Rock Wrecker hurls one great boulder (recipe r 0.5 h)');
  assert.equal(boulder.until, wrecker.contactMs, 'the boulder lands at contact');
  const core = wrecker.beats.find((beat) => beat.drawer === 'coreCharge');
  assert.ok(Math.abs(core.params.r1 - boulder.params.r0) < 0.05, 'the boulder leaves at the size it was packed to');

  const gem = ROCK_SPECS['power-gem'];
  assert.equal(gem.family, 'beam');
  const stream = gem.beats.find((beat) => beat.drawer === 'beam');
  assert.equal(stream.params.kind, 'pulse-train', 'a stream of crystals');
  assert.equal(stream.at + stream.params.growIn * (stream.until - stream.at), gem.contactMs, 'the stream hits at contact');
  assert.ok(gem.beats.filter((beat) => beat.drawer === 'slashArc').every((beat) => beat.at > gem.contactMs), 'the crescents follow the hit');
});

test('the Flying row ships whole: flying material, no grain, a navy vignette before the wind, a local hit at contact, no sunburst', () => {
  const flyingMoves = Object.values(MOVE_TABLE.flying).flat(2).filter(Boolean);
  assert.equal(flyingMoves.length, 8);
  for (const move of flyingMoves) {
    const spec = FLYING_SPECS[move];
    assert.ok(spec, `${move} has a flying spec`);
    assert.equal(spec.vgType, 'flying');
    assert.equal(spec.material, 'flying');
    assert.equal(spec.grain, 0, `${move}: wind is not pitted by grain`);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash' && beat.at === spec.contactMs);
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top at contact`);
    assert.equal(flash.params.target ?? 'defender', 'defender', `${move}: contact flash on the defender`);
    const shade = spec.beats.find((beat) => beat.drawer === 'vignette');
    assert.equal(shade?.layer, 'back', `${move}: a local vignette`);
    assert.ok(shade.at < spec.contactMs && shade.until > spec.contactMs, `${move}: pale wind reads against the vignette`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
    assert.ok(spec.particles.some((burst) => burst.anchor === 'defender' && burst.at >= spec.contactMs), `${move}: debris off the hit`);
    for (const burst of spec.particles.filter((b) => b.kind === 'feather')) assert.ok(burst.gravity <= 0.3, `${move}: feathers drift, they do not drop`);
  }
  for (const id of ['peck', 'aerial-ace', 'wing-attack', 'brave-bird']) assert.equal(FLYING_SPECS[id].statClass, 'physical');
  for (const id of ['gust', 'air-cutter', 'hurricane', 'aeroblast']) assert.equal(FLYING_SPECS[id].statClass, 'special');

  const peck = FLYING_SPECS.peck;
  assert.equal(peck.attacker.motion, 'lunge', 'Peck is one jab');
  assert.equal(peck.family, 'punch');

  const ace = FLYING_SPECS['aerial-ace'];
  assert.equal(ace.attacker.motion, 'dash');
  const cuts = ace.beats.filter((beat) => beat.drawer === 'slashArc');
  assert.equal(cuts.length, 1, 'Aerial Ace is one cut');
  assert.equal(cuts[0].at, ace.contactMs);
  assert.ok(cuts[0].params.sweep < 0, 'the cut races up from lower left to upper right');

  const wing = FLYING_SPECS['wing-attack'];
  assert.equal(wing.defender.motion, 'stagger');
  const strokes = wing.beats.filter((beat) => beat.drawer === 'slashArc').map((beat) => beat.at);
  assert.equal(strokes.length, wing.defender.params.hits, 'a wing stroke per blow');
  assert.deepEqual(strokes, [wing.contactMs, wing.contactMs + wing.defender.params.gapMs], 'the strokes land on the blows');

  const bird = FLYING_SPECS['brave-bird'];
  assert.equal(bird.attacker.motion, 'dash');
  assert.equal(bird.family, 'dash');
  assert.ok(bird.defender.params.strength >= 0.45, 'Brave Bird hits heavy');
  assert.equal(bird.beats.find((beat) => beat.drawer === 'projectile').until, bird.contactMs, 'the head of wind lands at contact');

  // Wind specials lift the struck card; Gust and Hurricane are whirls that wrap it.
  for (const id of ['gust', 'hurricane']) {
    const spec = FLYING_SPECS[id];
    assert.equal(spec.family, 'wind');
    assert.equal(spec.attacker.motion, 'rise', `${id}: the attacker rises on its wings`);
    assert.equal(spec.defender.motion, 'float', `${id}: the wind lifts the card`);
    const wraps = spec.beats.filter((beat) => beat.drawer === 'spiral' && (beat.params.target ?? 'defender') === 'defender');
    assert.deepEqual(wraps.map((beat) => beat.layer).sort(), ['back', 'front'], `${id}: the whirl passes behind and in front of the card`);
    const volley = spec.beats.find((beat) => beat.drawer === 'volley');
    assert.ok(volley.until <= spec.contactMs, `${id}: the gusts arrive by contact`);
  }
  assert.ok(FLYING_SPECS.hurricane.defender.params.lift > FLYING_SPECS.gust.defender.params.lift, 'Hurricane lifts harder than Gust');
  assert.equal(FLYING_SPECS.hurricane.beats.find((beat) => beat.drawer === 'pillar').layer, 'back', 'the funnel stands behind the card');

  const cutter = FLYING_SPECS['air-cutter'];
  assert.equal(cutter.family, 'slash');
  const crescents = cutter.beats.find((beat) => beat.drawer === 'volley');
  assert.equal(crescents.params.count, 3);
  assert.equal(crescents.until, cutter.contactMs, 'the last crescent lands at contact');

  const aero = FLYING_SPECS.aeroblast;
  assert.equal(aero.family, 'beam');
  const coil = aero.beats.find((beat) => beat.drawer === 'beam');
  assert.equal(coil.params.kind, 'helix', 'a coil of air');
  assert.equal(coil.at + coil.params.growIn * (coil.until - coil.at), aero.contactMs, 'the coil hits at contact');
});

test('the Ice row ships whole: ice crystals (aurora for Aurora Beam), a navy vignette before the ice, a frosted card at contact, no sunburst', () => {
  const iceMoves = Object.values(MOVE_TABLE.ice).flat(2).filter(Boolean);
  assert.equal(iceMoves.length, 9);
  for (const move of iceMoves) {
    const spec = ICE_SPECS[move];
    assert.ok(spec, `${move} has an ice spec`);
    assert.equal(spec.vgType, 'ice');
    assert.equal(spec.material, move === 'aurora-beam' ? 'aurora' : 'ice', `${move}: material`);
    assert.equal(spec.grain, spec.material === 'ice' ? 0.1 : 0, `${move}: grain`);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash' && beat.at === spec.contactMs);
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top at contact`);
    assert.equal(flash.params.target ?? 'defender', 'defender', `${move}: contact flash on the defender`);
    const shade = spec.beats.find((beat) => beat.drawer === 'vignette');
    assert.equal(shade?.layer, 'back', `${move}: a local vignette`);
    assert.ok(shade.at < spec.contactMs && shade.until > spec.contactMs, `${move}: pale ice reads against the vignette`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
    assert.ok(spec.particles.some((burst) => burst.anchor === 'defender' && burst.at >= spec.contactMs), `${move}: frost off the hit`);
    for (const burst of spec.particles.filter((b) => b.kind === 'shard')) assert.ok(burst.gravity > 0, `${move}: splinters fall`);
    // Physical ice hits with weight; special ice freezes the card in place.
    if (spec.statClass === 'physical') assert.ok(['knock', 'sink'].includes(spec.defender.motion), `${move}: the card takes the blow`);
    else assert.equal(spec.defender.motion, 'freeze', `${move}: the card freezes`);
  }
  for (const id of ['ice-shard', 'avalanche', 'ice-hammer', 'ice-spinner']) assert.equal(ICE_SPECS[id].statClass, 'physical');
  for (const id of ['powder-snow', 'aurora-beam', 'icy-wind', 'ice-beam', 'blizzard']) assert.equal(ICE_SPECS[id].statClass, 'special');

  // Thrown or falling ice: the last body lands at contact.
  for (const id of ['ice-shard', 'avalanche', 'icy-wind', 'blizzard']) {
    const volley = ICE_SPECS[id].beats.find((beat) => beat.drawer === 'volley');
    assert.equal(volley.until, ICE_SPECS[id].contactMs, `${id}: the last body lands at contact`);
  }
  assert.equal(ICE_SPECS.avalanche.beats.find((beat) => beat.drawer === 'volley').params.from, 'sky', 'Avalanche falls from above');
  assert.equal(ICE_SPECS.avalanche.defender.motion, 'sink', 'Avalanche presses the card down');

  for (const id of ['avalanche', 'ice-hammer']) {
    const spec = ICE_SPECS[id];
    assert.equal(spec.family, 'quake', `${id}: the blow shakes the table`);
    assert.equal(spec.attacker.motion, 'stomp');
    const quake = spec.beats.find((beat) => beat.drawer === 'terrain' && beat.params.kind === 'quake');
    assert.equal(quake?.at, spec.contactMs, `${id}: the quake starts at contact`);
  }
  const hammer = ICE_SPECS['ice-hammer'];
  const icicles = hammer.beats.find((beat) => beat.drawer === 'volley');
  assert.equal(icicles.params.from, 'sky', 'the hammer comes down from above');
  assert.ok(icicles.params.r1 >= 0.25, 'great icicles, not chips');
  const fall = icicles.until - icicles.at - (icicles.params.count - 1) * icicles.params.stagger;
  assert.equal(icicles.at + fall, hammer.contactMs, 'the first icicle lands at contact');
  assert.ok(hammer.defender.params.strength >= 0.45, 'Ice Hammer hits heavy');

  const spinner = ICE_SPECS['ice-spinner'];
  assert.equal(spinner.attacker.motion, 'spin');
  assert.equal(spinner.beats.find((beat) => beat.drawer === 'projectile').until, spinner.contactMs, 'the disc lands at contact');

  // Streams and lances: the head reaches the card at contact and carries the family.
  for (const [id, kind] of [['powder-snow', 'pulse-train'], ['aurora-beam', 'pulse-train'], ['ice-beam', 'solid']]) {
    const spec = ICE_SPECS[id];
    const beam = spec.beats.find((beat) => beat.drawer === 'beam');
    assert.equal(beam.params.kind, kind, `${id}: beam kind`);
    assert.equal(beam.at + beam.params.growIn * (beam.until - beam.at), spec.contactMs, `${id}: the head reaches the card at contact`);
  }
  assert.equal(ICE_SPECS['aurora-beam'].family, 'beam');
  assert.equal(ICE_SPECS['ice-beam'].family, 'beam');

  // Wind and storm: crystals whirl round the card behind and in front of it.
  for (const id of ['icy-wind', 'blizzard']) {
    const spec = ICE_SPECS[id];
    assert.equal(spec.family, 'wind');
    const wraps = spec.beats.filter((beat) => beat.drawer === 'spiral' && (beat.params.target ?? 'defender') === 'defender');
    assert.deepEqual(wraps.map((beat) => beat.layer).sort(), ['back', 'front'], `${id}: the whirl passes behind and in front of the card`);
  }
  assert.ok(ICE_SPECS.blizzard.beats.some((beat) => beat.drawer === 'rain'), 'Blizzard brings hail');
});

test('the Bug row ships whole: bug needles (buzz for Bug Buzz, silver for Silver Wind), no grain, a local vignette, a local hit at contact, no sunburst', () => {
  const bugMoves = Object.values(MOVE_TABLE.bug).flat(2).filter(Boolean);
  assert.equal(bugMoves.length, 12);
  const MATERIAL = { 'bug-buzz': 'buzz', 'silver-wind': 'silver' };
  for (const move of bugMoves) {
    const spec = BUG_SPECS[move];
    assert.ok(spec, `${move} has a bug spec`);
    assert.equal(spec.vgType, 'bug');
    assert.equal(spec.material, MATERIAL[move] ?? 'bug', `${move}: material`);
    assert.equal(spec.grain, 0, `${move}: no grain`);
    assert.ok(spec.pad <= 2.2, `${move}: pad ${spec.pad}`);
    const flash = spec.beats.find((beat) => beat.drawer === 'impactFlash' && beat.at === spec.contactMs);
    assert.equal(flash?.layer, 'top', `${move}: impact flash on top at contact`);
    assert.equal(flash.params.target ?? 'defender', 'defender', `${move}: contact flash on the defender`);
    const shade = spec.beats.find((beat) => beat.drawer === 'vignette');
    assert.equal(shade?.layer, 'back', `${move}: a local vignette`);
    assert.ok(shade.at < spec.contactMs && shade.until > spec.contactMs, `${move}: the yellow-green reads against the vignette`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'starFlare' && beat.drawer !== 'speedRays'), `${move}: no sunburst`);
    assert.ok(spec.beats.every((beat) => beat.drawer !== 'smoke'), `${move}: bug leaves no smoke`);
    assert.ok(spec.particles.some((burst) => burst.anchor === 'defender' && burst.at >= spec.contactMs), `${move}: chips off the hit`);
    for (const burst of spec.particles) {
      if (burst.kind === 'shard') assert.ok(burst.gravity > 0, `${move}: chips fall`);
      else assert.ok(burst.gravity <= 0.1, `${move}: sparkles and powder drift`);
    }
    if (spec.statClass === 'physical') assert.ok(['dash', 'lunge'].includes(spec.attacker.motion), `${move}: the weight is in the card`);
  }
  for (const id of ['fell-stinger', 'fury-cutter', 'pin-missile', 'twineedle', 'x-scissor', 'lunge', 'megahorn']) {
    assert.equal(BUG_SPECS[id].statClass, 'physical', id);
  }
  for (const id of ['infestation', 'struggle-bug', 'silver-wind', 'signal-beam', 'bug-buzz']) assert.equal(BUG_SPECS[id].statClass, 'special', id);

  const stinger = BUG_SPECS['fell-stinger'];
  assert.equal(stinger.family, 'projectile');
  const sting = stinger.beats.find((beat) => beat.drawer === 'projectile');
  assert.ok(sting.at < stinger.contactMs && stinger.contactMs < sting.until, 'the stinger is in flight at contact');

  const cutter = BUG_SPECS['fury-cutter'];
  assert.equal(cutter.family, 'slash');
  assert.equal(cutter.beats.filter((beat) => beat.drawer === 'slashArc').length, 1, 'Fury Cutter is one cut');

  // Multi-hit needles: one needle per blow, 'stagger' spacing = the volley's, the first lands at
  // contact and a flash marks every blow.
  for (const [id, hits] of [['pin-missile', 3], ['twineedle', 2]]) {
    const spec = BUG_SPECS[id];
    assert.equal(spec.family, 'projectile', id);
    assert.equal(spec.defender.motion, 'stagger', `${id}: one blow per needle`);
    assert.equal(spec.defender.params.hits, hits, id);
    const needles = spec.beats.find((beat) => beat.drawer === 'volley');
    assert.equal(needles.params.count, hits, `${id}: a needle per blow`);
    assert.equal(needles.params.stagger, spec.defender.params.gapMs, `${id}: needles land on the blows`);
    assert.equal(firstLandingMs(needles), spec.contactMs, `${id}: the first needle lands at contact`);
    const flashes = spec.beats.filter((beat) => beat.drawer === 'impactFlash').map((beat) => beat.at);
    for (let hit = 0; hit < hits; hit += 1) {
      const at = spec.contactMs + hit * spec.defender.params.gapMs;
      assert.ok(flashes.includes(at), `${id}: a flash on blow ${hit + 1} at ${at}`);
    }
  }

  const scissor = BUG_SPECS['x-scissor'];
  assert.equal(scissor.family, 'slash');
  assert.equal(scissor.attacker.motion, 'dash');
  assertBladesCrossAtContact(scissor);

  for (const id of ['lunge', 'megahorn']) {
    const spec = BUG_SPECS[id];
    assert.equal(spec.attacker.motion, 'dash', `${id}: the attacker charges`);
    assert.equal(spec.family, 'dash', id);
    assert.equal(spec.beats.find((beat) => beat.drawer === 'projectile').until, spec.contactMs, `${id}: it lands at contact`);
  }
  assert.equal(BUG_SPECS.lunge.beats.find((beat) => beat.drawer === 'projectile').params.path, 'arc', 'Lunge leaps');
  const horn = BUG_SPECS.megahorn.beats.find((beat) => beat.drawer === 'projectile');
  assert.equal(horn.params.path, 'straight', 'the horn drives straight in');
  assert.ok(horn.params.r1 >= 0.3, 'a great horn, not a pin');
  assert.ok(BUG_SPECS.megahorn.defender.params.strength >= 0.45, 'Megahorn hits heavy');
  assert.ok(BUG_SPECS.megahorn.beats.some((beat) => beat.drawer === 'ring' && beat.params.kind === 'floor' && beat.at === BUG_SPECS.megahorn.contactMs), 'a floor ring, not the red backdrop');

  // Streams: the head reaches the card at contact.
  for (const [id, kind] of [['silver-wind', 'helix'], ['signal-beam', 'segmented'], ['bug-buzz', 'pulse-train']]) {
    const spec = BUG_SPECS[id];
    const stream = spec.beats.find((beat) => beat.drawer === 'beam');
    assert.equal(stream.params.kind, kind, `${id}: beam kind`);
    assert.equal(beamHeadMs(stream), spec.contactMs, `${id}: the head reaches the card at contact`);
  }
  assert.equal(BUG_SPECS['signal-beam'].family, 'beam');
  assert.equal(BUG_SPECS['bug-buzz'].family, 'beam');

  const swarm = BUG_SPECS.infestation;
  assert.equal(swarm.family, 'wind');
  const motes = swarm.beats.find((beat) => beat.drawer === 'volley');
  assert.equal(motes.params.tongues, 0, 'the swarm is wing motes, not needles');
  assert.equal(motes.until, swarm.contactMs, 'the last of the swarm reaches the card at contact');
  const wraps = swarm.beats.filter((beat) => beat.drawer === 'spiral' && (beat.params.target ?? 'defender') === 'defender');
  assert.deepEqual(wraps.map((beat) => beat.layer).sort(), ['back', 'front'], 'the swarm boils behind and in front of the card');

  const struggle = BUG_SPECS['struggle-bug'];
  assert.equal(struggle.family, 'burst');
  assert.equal(struggle.beats.find((beat) => beat.drawer === 'volley').until, struggle.contactMs, 'the last needle lands at contact');

  const wind = BUG_SPECS['silver-wind'];
  assert.equal(wind.family, 'wind');
  assert.equal(wind.attacker.motion, 'rise', 'the attacker rises on its wings');
  assert.equal(wind.defender.motion, 'float', 'the wind lifts the card');
  assert.ok(wind.particles.every((burst) => burst.kind === 'mote'), 'silver powder');
});

test('Fire Blast is the accepted look test: 1900 ms, contact at 1000 ms, 10 beats, one ember burst', () => {
  assert.equal(fireBlast.durationMs, 1900);
  assert.equal(fireBlast.contactMs, 1000);
  assert.equal(fireBlast.beats.length, 10);
  assert.equal(fireBlast.particles.length, 1);
  assert.equal(fireBlast.particles[0].count, 22);
  assert.equal(fireBlast.particles[0].kind, 'ember');
  assert.equal(fireBlast.grain, 0.28);
  assert.equal(fireBlast.family, 'burst');
  assert.equal(fireBlast.tier, 3);
  const at = (drawer) => fireBlast.beats.filter((beat) => beat.drawer === drawer).map((beat) => [beat.at, beat.until]);
  assert.deepEqual(at('orbitCharge'), [[0, 620], [0, 620]]);
  assert.deepEqual(at('shockRings'), [[560, 940]]);
  assert.deepEqual(at('projectile'), [[620, 1000]]);
  assert.deepEqual(at('vignette'), [[820, 1850]]);
  assert.deepEqual(at('speedRays'), [[1000, 1320]]);
  assert.deepEqual(at('starFlare'), [[1000, 1750]]);
  assert.deepEqual(at('impactFlash'), [[1000, 1180]]);
  assert.deepEqual(at('smoke'), [[1300, 1900]]);
});

test('with no specs every attack plays the generic lunge (moveFor yields null)', () => {
  const opts = { instanceId: 101, attackName: 'Fire Blast', damage: 180 };
  assert.equal(moveFor(charizardEx, opts, {}), null);
  assert.equal(moveFor(charizardEx, opts, SPECS), null, 'no Fire table move has a spec yet');
});

test('moveFor plays the Fire Blast spec once its cell points at it', () => {
  const pointed = Object.fromEntries(FIRE_SPECIAL_AND_PHYSICAL_3.map((move) => [move, fireBlast]));
  const pick = moveFor(charizardEx, { instanceId: 101, attackName: 'Fire Blast', damage: 180 }, pointed);
  assert.equal(pick.vgType, 'fire');
  assert.equal(pick.tier, 3);
  assert.equal(pick.score, fireBlast);
  assert.equal(pick.family, 'burst');
});

test('a zero-damage attack picks no move even when its spec exists', () => {
  const pointed = Object.fromEntries(FIRE_SPECIAL_AND_PHYSICAL_3.map((move) => [move, fireBlast]));
  assert.equal(moveFor(charizardEx, { instanceId: 101, attackName: 'Rest', damage: 0 }, pointed), null);
});
