// Design 089 D7: the card motions are spread over the specs, a hit is answered by its element,
// heavy moves hold at contact, and every material leaves its own aftermath.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACKER_MOTIONS, DEFENDER_MOTIONS, TRAVELLING_MOTIONS, attackerPose, defenderPose } from '../card-motion.mjs';
import { HIT_STOP_FRAME_MS, HIT_STOP_MS, hitStopFor, sceneTimeAt } from '../hit-stop.mjs';
import { PINNED_MOTION_IDS, REACTION_BY_MATERIAL, variedAttacker, variedDefender, withVariedMotion } from '../motion-variety.mjs';
import { MATERIAL_KEYS, validateSpec } from '../move-spec.mjs';
import { SPECS } from '../specs/index.mjs';
import { FIRE_SPECS } from '../specs/fire.mjs';
import { WATER_SPECS } from '../specs/water.mjs';
import { SIGNATURE_SPECS } from '../signature/specs/index.mjs';

const share = (table, read) => {
  const counts = new Map();
  const specs = Object.values(table);
  for (const spec of specs) counts.set(read(spec), (counts.get(read(spec)) || 0) + 1);
  return { counts, top: Math.max(...counts.values()) / specs.length };
};

test('no one card motion carries the moves any more', () => {
  const attackers = share(SPECS, (spec) => spec.attacker.motion);
  const defenders = share(SPECS, (spec) => spec.defender.motion);
  // As written, 54 of 144 attackers reared and lurched (38 %) and 109 defenders took one knock (76 %).
  assert.ok(attackers.top <= 0.25, `the most used attacker motion has ${(attackers.top * 100).toFixed(0)} %`);
  assert.ok(defenders.top <= 0.25, `the most used defender motion has ${(defenders.top * 100).toFixed(0)} %`);
  assert.ok(attackers.counts.size >= 10, `${attackers.counts.size} attacker motions in use`);
  assert.ok(defenders.counts.size >= 12, `${defenders.counts.size} defender motions in use`);
  const signature = share(SIGNATURE_SPECS, (spec) => spec.defender.motion);
  assert.ok(signature.top <= 0.25, `signatures: ${(signature.top * 100).toFixed(0)} %`);
});

test('every played spec is still a valid spec, and its family follows its motion', () => {
  for (const [id, spec] of [...Object.entries(SPECS), ...Object.entries(SIGNATURE_SPECS)]) {
    assert.deepEqual(validateSpec(spec), [], id);
  }
});

test('the accepted Fire Blast plays exactly as written; the files themselves are untouched', () => {
  assert.deepEqual(PINNED_MOTION_IDS, ['fire-blast']);
  assert.equal(SPECS['fire-blast'], FIRE_SPECS['fire-blast']);
  // A Water move that was written with a knock still says so in its file, and plays the drench.
  const written = Object.values(WATER_SPECS).find((spec) => spec.defender.motion === 'knock');
  assert.ok(written, 'a Water spec written with a knock');
  assert.equal(SPECS[written.id].defender.motion, 'drench');
  assert.deepEqual(SPECS[written.id].defender.params, written.defender.params);
});

test('a knock becomes its material’s reaction with the knock’s own params; other reactions stay', () => {
  const spec = { id: 'x', material: 'electric', defender: { motion: 'knock', params: { strength: 0.2, heat: 0.4 } } };
  assert.deepEqual(variedDefender(spec), { motion: 'jolt', params: { strength: 0.2, heat: 0.4 } });
  const staggered = { id: 'x', material: 'electric', defender: { motion: 'stagger', params: { hits: 3 } } };
  assert.equal(variedDefender(staggered), staggered.defender);
  const blow = { id: 'x', material: 'fighting', defender: { motion: 'knock', params: {} } };
  assert.equal(variedDefender(blow), blow.defender, 'a blow keeps the knock');
  for (const [material, motion] of Object.entries(REACTION_BY_MATERIAL)) {
    assert.ok(MATERIAL_KEYS.includes(material), `${material} is a material`);
    assert.ok(Object.hasOwn(DEFENDER_MOTIONS, motion), `${motion} is a defender motion`);
  }
});

test('an attacker keeps its intent: a card that stayed home stays home, one that travelled travels', () => {
  const home = new Set(['rear-lurch', 'hop', 'coil', 'channel']);
  for (const tier of [1, 2, 3]) {
    for (const statClass of ['physical', 'special']) {
      for (let n = 0; n < 40; n += 1) {
        const base = { id: `spec-${n}`, tier, statClass };
        const stay = variedAttacker({ ...base, attacker: { motion: 'rear-lurch', params: { glow: 0.5 } } });
        assert.ok(home.has(stay.motion), stay.motion);
        if (stay.motion !== 'rear-lurch') assert.deepEqual(stay.params, { glow: 0.5 });
        const run = variedAttacker({ ...base, attacker: { motion: 'dash', params: { reach: 0.7 } } });
        assert.ok(TRAVELLING_MOTIONS.includes(run.motion), run.motion);
        assert.equal(run.params.reach, 0.7);
        const hit = variedAttacker({ ...base, attacker: { motion: 'lunge', params: { reach: 0.8 } } });
        assert.ok(['lunge', 'slam'].includes(hit.motion), hit.motion);
        if (tier === 1) assert.equal(hit.motion, 'lunge', 'a light blow does not come down from above');
      }
    }
  }
});

test('authored timing is left alone: a held wind-up, an echo, a flurry of strikes', () => {
  const held = { id: 'a', tier: 3, statClass: 'special', attacker: { motion: 'rear-lurch', params: { hold: 200 } } };
  assert.equal(variedAttacker(held), held.attacker);
  for (let n = 0; n < 20; n += 1) {
    const echoed = { id: `e${n}`, tier: 3, statClass: 'physical', attacker: { motion: 'dash', params: {}, echo: { alpha: 0.4 } } };
    assert.equal(variedAttacker(echoed), echoed.attacker);
    const flurry = { id: `f${n}`, tier: 3, statClass: 'physical', attacker: { motion: 'lunge', params: { strikes: 3 } } };
    assert.equal(variedAttacker(flurry), flurry.attacker);
  }
  assert.equal(withVariedMotion(null), null);
});

test('the new motions carry the card where they say', () => {
  const scene = { contactMs: 1000, durationMs: 1900, laneH: 2.4, params: {} };
  // Home motions never reach the defender; travelling ones are on it at contact.
  for (const name of ['hop', 'coil', 'channel']) {
    let furthest = 0;
    for (let ms = 0; ms <= 1900; ms += 10) furthest = Math.max(furthest, attackerPose(name, ms, scene).along);
    assert.ok(furthest < 0.5, `${name} reaches ${furthest}`);
  }
  for (const name of ['slam', 'sweep']) {
    assert.ok(Object.hasOwn(ATTACKER_MOTIONS, name));
    assert.ok(attackerPose(name, 999, scene).along > 0.8, `${name} at contact`);
  }
  assert.ok(attackerPose('slam', 500, scene).scale > 1.1, 'a slam rears up before it falls');
  assert.ok(Math.abs(attackerPose('sweep', 600, scene).across) > 0.1, 'a sweep comes in on a curve');
  assert.ok(attackerPose('channel', 700, scene).glow > 0.8, 'a caster glows as it gathers');
});

test('each reaction has its own signature', () => {
  const scene = { contactMs: 1000, durationMs: 1900, params: { strength: 0.3, heat: 1 } };
  const at = (name, ms) => defenderPose(name, ms, scene);
  const peak = (name, key) => Math.max(...Array.from({ length: 65 }, (_, i) => Math.abs(at(name, 1000 + i * 10)[key])));
  assert.ok(peak('jolt', 'across') > 0.025 && peak('jolt', 'along') < 0.15, 'a jolt buzzes in place');
  assert.ok(peak('drench', 'along') > peak('knock', 'along'), 'water carries the card further than a knock');
  assert.ok(at('crush', 1070).scaleAlong < 0.85, 'a crush presses the card flat');
  assert.ok(peak('whirl', 'lift') > 0.1 && peak('whirl', 'wobble') > 15, 'wind lifts and turns it');
  assert.ok(at('wither', 1320).scaleAlong < 0.95, 'a withered card droops');
  assert.ok(peak('warp-hit', 'lift') > 0.05, 'a psychic hit floats the card');
  assert.ok(at('dread', 1300).scaleAlong < 0.95 && at('dread', 1300).along > 0.1, 'dread shrinks back');
  assert.ok(peak('clang', 'along') < peak('knock', 'along'), 'a clang is a short knock');
  assert.ok(at('scorch', 1300).scaleAlong > 1.02, 'heat swells the card');
});

test('a reaction is over before a short scene ends', () => {
  const short = { contactMs: 600, durationMs: 1000, params: { strength: 0.3, heat: 1 } };
  for (const name of new Set(Object.values(REACTION_BY_MATERIAL))) {
    const end = defenderPose(name, 999, short);
    assert.ok(Math.abs(end.along) < 0.012 && Math.abs(end.across) < 0.012, `${name} along ${end.along}`);
    assert.ok(Math.abs(end.wobble) < 0.5 && Math.abs(end.lift) < 0.005, `${name} wobble ${end.wobble} lift ${end.lift}`);
    assert.ok(Math.abs(end.scaleAlong - 1) < 0.01 && Math.abs(end.scaleAcross - 1) < 0.01, `${name} scale`);
  }
});

test('hit-stop: only heavy moves hold, on the contact frame, and the scene runs on behind', () => {
  assert.equal(hitStopFor({ tier: 1 }), 0);
  assert.equal(hitStopFor({ tier: 2 }), 0);
  assert.equal(hitStopFor({ tier: 3 }), HIT_STOP_MS[3]);
  assert.equal(hitStopFor({ tier: 'S' }), HIT_STOP_MS.S);
  assert.equal(hitStopFor(null), 0);
  const frame = 1000 + HIT_STOP_FRAME_MS;
  assert.equal(sceneTimeAt(400, 1000, 70), 400);
  assert.equal(sceneTimeAt(1000, 1000, 70), 1000, 'contact itself is not held: the hit has not drawn yet');
  assert.equal(sceneTimeAt(frame + 30, 1000, 70), frame, 'held one frame into the hit');
  assert.equal(sceneTimeAt(frame + 70, 1000, 70), frame);
  assert.equal(sceneTimeAt(1170, 1000, 70), 1100, 'running on, 70 ms behind');
  assert.equal(sceneTimeAt(1500, 1000, 0), 1500, 'no hold');
});
