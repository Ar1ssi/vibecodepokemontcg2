import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAWER_PARAMS,
  FAMILIES,
  MAX_NODES,
  PARTICLE_BUDGET,
  S_CONTACT,
  TIER_BAND,
  TONGUE_BUDGET,
  checkParams,
  deriveFamily,
  tonguesAt,
  validateSpec,
  withDefaults,
} from '../move-spec.mjs';
import { fireBlast } from '../specs/fire.mjs';
import { kitchenSink } from '../specs/__fixtures__/kitchen-sink.mjs';

const clone = (value) => structuredClone(value);
const has = (errors, text) => errors.some((message) => message.includes(text));

// ---- checkParams / withDefaults -------------------------------------------------

test('every drawer has a table, and its defaults are valid params', () => {
  assert.equal(Object.keys(DRAWER_PARAMS).length, 23);
  for (const drawer of Object.keys(DRAWER_PARAMS)) {
    assert.deepEqual(checkParams(drawer, {}), [], drawer);
    assert.deepEqual(checkParams(drawer, withDefaults(drawer, {})), [], `${drawer} defaults`);
  }
});

test('withDefaults fills missing keys and keeps given ones', () => {
  const p = withDefaults('projectile', { r0: 0.4 });
  assert.equal(p.r0, 0.4);
  assert.equal(p.path, 'arc');
  assert.equal(p.tongues, 9);
  assert.deepEqual(withDefaults('nope', { a: 1 }), {});
});

const violation = (entry) => {
  const [kind] = entry;
  if (kind === 'num' || kind === 'int') return entry[2] + 1;
  if (kind === 'enum') return '__not-a-value__';
  if (kind === 'pair') return [entry[2] + 1, entry[2] + 2];
  if (kind === 'target') return 'both';
  if (kind === 'arms') return 'nope';
  return 'not a number';
};

test('every parameter of every drawer rejects an out-of-range or wrong-typed value', () => {
  for (const [drawer, schema] of Object.entries(DRAWER_PARAMS)) {
    for (const [key, entry] of Object.entries(schema)) {
      const errors = checkParams(drawer, { [key]: violation(entry) });
      assert.equal(errors.length, 1, `${drawer}.${key}`);
      assert.ok(errors[0].includes(`'${key}'`), `${drawer}.${key}: ${errors[0]}`);
    }
  }
});

test('an int param rejects a fractional value and a num param accepts its bounds', () => {
  assert.equal(checkParams('orbitCharge', { count: 2.5 }).length, 1);
  assert.deepEqual(checkParams('orbitCharge', { r0: 0.05 }), []);
  assert.deepEqual(checkParams('orbitCharge', { r0: 0.4 }), []);
  assert.equal(checkParams('orbitCharge', { r0: 0.41 }).length, 1);
});

test('checkParams rejects an unknown drawer and an unknown key', () => {
  assert.deepEqual(checkParams('nope', {}), ["unknown drawer 'nope'"]);
  assert.deepEqual(checkParams('smoke', { colour: 'red' }), ["smoke: unknown param 'colour'"]);
});

test('degree params accept any finite angle but not NaN', () => {
  assert.deepEqual(checkParams('splash', { direction: -540 }), []);
  assert.equal(checkParams('splash', { direction: Number.NaN }).length, 1);
});

// ---- tonguesAt --------------------------------------------------------------------

test('tonguesAt follows the cost table', () => {
  assert.equal(tonguesAt('orbitCharge', { count: 5, tongues: 4 }), 20);
  assert.equal(tonguesAt('orbitCharge', { count: 5, tongues: 4, half: 'back' }), 12);
  assert.equal(tonguesAt('projectile', {}), 9);
  assert.equal(tonguesAt('starFlare', {}), 25);
  assert.equal(tonguesAt('starFlare', { arms: 'ring' }), 40);
  assert.equal(tonguesAt('beam', { kind: 'helix' }), 2);
  assert.equal(tonguesAt('beam', { kind: 'solid' }), 1);
  assert.equal(tonguesAt('beam', { kind: 'segmented' }), 6);
  assert.equal(tonguesAt('volley', {}), 9);
  assert.equal(tonguesAt('bolt', { branches: 3 }), 4);
  assert.equal(tonguesAt('pillar', {}), 3);
  assert.equal(tonguesAt('vignette', {}), 0);
  assert.equal(tonguesAt('coreCharge', {}), 0);
});

// ---- validateSpec -----------------------------------------------------------------

test('the Fire Blast spec is valid', () => {
  assert.deepEqual(validateSpec(fireBlast), []);
});

test('the kitchen sink fails only the tongue cost rule; its first twelve beats are valid', () => {
  const errors = validateSpec(kitchenSink);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].startsWith('cost:') && errors[0].includes(`exceeds ${TONGUE_BUDGET}`), errors[0]);
  assert.deepEqual(validateSpec({ ...kitchenSink, beats: kitchenSink.beats.slice(0, 12) }), []);
});

test('missing and unknown fields', () => {
  const spec = clone(fireBlast);
  delete spec.material;
  spec.surprise = 1;
  const errors = validateSpec(spec);
  assert.ok(has(errors, "missing field 'material'"));
  assert.ok(has(errors, "unknown field 'surprise'"));
  assert.deepEqual(validateSpec(null), ['spec must be an object']);
});

test('id, name and enums', () => {
  const spec = { ...clone(fireBlast), id: 'Fire_Blast', name: ' ', vgType: 'plasma', statClass: 'mixed', tier: 4, family: 'zap', material: 'gold' };
  const errors = validateSpec(spec);
  for (const text of ['not kebab-case', 'name must be', "unknown vgType 'plasma'", "unknown statClass 'mixed'", 'tier must be', "unknown family 'zap'", "unknown material 'gold'"]) {
    assert.ok(has(errors, text), text);
  }
});

test('durationMs must sit in its tier band and contact in its ratio band', () => {
  const tooLong = validateSpec({ ...clone(fireBlast), durationMs: 2300 });
  assert.ok(has(tooLong, 'outside tier 3 band'));
  assert.ok(has(validateSpec({ ...clone(fireBlast), durationMs: 'long' }), 'durationMs must be a finite number'));
  assert.ok(has(validateSpec({ ...clone(fireBlast), contactMs: 0 }), 'contactMs must be a positive number'));
  assert.ok(has(validateSpec({ ...clone(fireBlast), contactMs: 600 }), 'contactMs/durationMs'));
  assert.ok(has(validateSpec({ ...clone(fireBlast), contactMs: 1300 }), 'contactMs/durationMs'));
  assert.deepEqual(TIER_BAND[3], [1600, 2200]);
});

test('tier 1 may put contact up to 70 % of the scene, other tiers only 62 %', () => {
  const tier1 = { ...clone(fireBlast), tier: 1, durationMs: 1000, contactMs: 700, family: 'burst' };
  tier1.beats = tier1.beats.filter((b) => b.until <= 1000).map((b) => ({ ...b }));
  tier1.beats.push({ at: 700, until: 950, layer: 'front', drawer: 'starFlare', params: {} });
  tier1.particles = [];
  assert.ok(!has(validateSpec(tier1), 'contactMs/durationMs'));
  assert.ok(has(validateSpec({ ...tier1, tier: 2, durationMs: 1000 }), 'outside tier 2 band'));
  assert.ok(has(validateSpec({ ...tier1, contactMs: 720 }), 'contactMs/durationMs'));
});

test('pad and grain ranges', () => {
  assert.ok(has(validateSpec({ ...clone(fireBlast), pad: 1 }), 'pad must be'));
  assert.ok(has(validateSpec({ ...clone(fireBlast), pad: 3 }), 'pad must be'));
  assert.ok(has(validateSpec({ ...clone(fireBlast), grain: 2 }), 'grain must be'));
  assert.deepEqual(validateSpec({ ...clone(fireBlast), pad: 2.2, grain: 0 }), []);
});

test('card motions: shape, unknown motion and bad params', () => {
  assert.ok(has(validateSpec({ ...clone(fireBlast), attacker: 'lurch' }), 'attacker: must be'));
  assert.ok(has(validateSpec({ ...clone(fireBlast), defender: { motion: 'wobble', params: {} } }), "defender: unknown motion 'wobble'"));
  assert.ok(has(validateSpec({ ...clone(fireBlast), attacker: { motion: 'rear-lurch', params: { rear: 5 } } }), "param 'rear'"));
  assert.ok(has(validateSpec({ ...clone(fireBlast), defender: { motion: 'stagger', params: { hits: 1 } } }), "param 'hits'"));
});

test('beats: shape, times, layer, drawer and drawer params', () => {
  const withBeat = (beat) => ({ ...clone(fireBlast), beats: [...clone(fireBlast).beats, beat] });
  const good = { at: 100, until: 300, layer: 'back', drawer: 'smoke', params: {} };
  assert.ok(has(validateSpec({ ...clone(fireBlast), beats: [] }), 'beats must be a non-empty array'));
  assert.ok(has(validateSpec(withBeat('x')), 'must be an object'));
  assert.ok(has(validateSpec(withBeat({ ...good, extra: 1 })), "unknown field 'extra'"));
  assert.ok(has(validateSpec(withBeat({ ...good, at: 'a' })), 'at and until must be finite numbers'));
  assert.ok(has(validateSpec(withBeat({ ...good, at: -5 })), 'at must be >= 0'));
  assert.ok(has(validateSpec(withBeat({ ...good, until: 100 })), 'until must be after at'));
  assert.ok(has(validateSpec(withBeat({ ...good, until: 2000 })), 'until exceeds durationMs'));
  assert.ok(has(validateSpec(withBeat({ ...good, layer: 'middle' })), "unknown layer 'middle'"));
  assert.ok(has(validateSpec(withBeat({ ...good, drawer: 'sparkle' })), "unknown drawer 'sparkle'"));
  assert.ok(has(validateSpec(withBeat({ ...good, params: { count: 99 } })), "param 'count'"));
});

test('particle bursts: shape, missing keys, count cap, timing', () => {
  const burst = clone(fireBlast.particles[0]);
  const withBurst = (b) => ({ ...clone(fireBlast), particles: [b] });
  assert.ok(has(validateSpec({ ...clone(fireBlast), particles: 'x' }), 'particles must be an array'));
  assert.ok(has(validateSpec(withBurst('x')), 'must be an object'));
  const noKind = { ...burst };
  delete noKind.kind;
  assert.ok(has(validateSpec(withBurst(noKind)), "missing 'kind'"));
  assert.ok(has(validateSpec(withBurst({ ...burst, count: 25 })), "param 'count'"));
  assert.ok(has(validateSpec(withBurst({ ...burst, kind: 'plasma' })), "param 'kind'"));
  assert.ok(has(validateSpec(withBurst({ ...burst, at: 3000 })), 'at exceeds durationMs'));
});

test('cost rule: tongues, bursts, particles and DOM nodes', () => {
  const crowded = { ...clone(fireBlast), beats: [...clone(fireBlast).beats, { at: 1000, until: 1500, layer: 'front', drawer: 'splash', params: { count: 16 } }] };
  assert.ok(has(validateSpec(crowded), `exceeds ${TONGUE_BUDGET}`));
  const burst = (count) => ({ ...clone(fireBlast.particles[0]), count });
  assert.ok(has(validateSpec({ ...clone(fireBlast), particles: [burst(10), burst(10), burst(5)] }), 'exceeds 2'));
  assert.ok(has(validateSpec({ ...clone(fireBlast), particles: [burst(24), burst(10)] }), `exceeds ${PARTICLE_BUDGET}`));
  const dashing = { ...clone(fireBlast), attacker: { motion: 'dash', params: {} }, family: 'burst' };
  assert.deepEqual(validateSpec({ ...dashing, particles: [burst(24)] }), []);
  assert.ok(has(validateSpec({ ...dashing, particles: [burst(24), burst(4)] }), `exceeds ${MAX_NODES}`));
});

// ---- family rule ------------------------------------------------------------------

const beatAtContact = (drawer, over = {}) => ({
  ...clone(fireBlast),
  beats: [{ at: 900, until: 1100, layer: 'front', drawer, params: {} }],
  particles: [],
  ...over,
});

test('the family follows the front beat active at contact (latest start wins, ties go to the last listed)', () => {
  assert.equal(deriveFamily(fireBlast), 'burst');
  assert.equal(deriveFamily(beatAtContact('slashArc')), 'slash');
  assert.equal(deriveFamily(beatAtContact('beam')), 'beam');
  for (const drawer of ['projectile', 'volley', 'rain']) assert.equal(deriveFamily(beatAtContact(drawer)), 'projectile');
  for (const drawer of ['starFlare', 'shards', 'impactFlash']) assert.equal(deriveFamily(beatAtContact(drawer)), 'burst');
  assert.equal(deriveFamily(beatAtContact('splash')), 'splash');
  for (const drawer of ['terrain', 'pillar']) assert.equal(deriveFamily(beatAtContact(drawer)), 'quake');
  for (const drawer of ['spiral', 'cloud']) assert.equal(deriveFamily(beatAtContact(drawer)), 'wind');
  assert.equal(deriveFamily(beatAtContact('bolt')), 'electric');
  for (const drawer of ['glyph', 'aura', 'ring']) assert.equal(deriveFamily(beatAtContact(drawer)), 'chime');
  const later = {
    ...beatAtContact('beam'),
    beats: [
      { at: 800, until: 1200, layer: 'front', drawer: 'beam', params: {} },
      { at: 900, until: 1200, layer: 'front', drawer: 'projectile', params: {} },
      { at: 900, until: 1200, layer: 'front', drawer: 'ring', params: {} },
    ],
  };
  assert.equal(deriveFamily(later), 'chime');
});

test('a spec with no mapped front beat at contact is charge-only', () => {
  assert.equal(deriveFamily(beatAtContact('smoke')), 'charge');
  assert.equal(deriveFamily({ ...beatAtContact('beam'), beats: [{ at: 0, until: 500, layer: 'front', drawer: 'beam', params: {} }] }), 'charge');
  assert.equal(deriveFamily({ ...beatAtContact('beam'), beats: [{ at: 900, until: 1100, layer: 'back', drawer: 'beam', params: {} }] }), 'charge');
});

test('type overrides', () => {
  assert.equal(deriveFamily(beatAtContact('slashArc', { vgType: 'electric' })), 'electric');
  assert.equal(deriveFamily(beatAtContact('glyph', { vgType: 'ghost' })), 'ghost');
  assert.equal(deriveFamily(beatAtContact('glyph', { vgType: 'dark' })), 'ghost');
  assert.equal(deriveFamily(beatAtContact('glyph', { vgType: 'psychic' })), 'chime');
  assert.equal(deriveFamily(beatAtContact('starFlare', { vgType: 'water' })), 'splash');
  assert.equal(deriveFamily(beatAtContact('beam', { vgType: 'water' })), 'beam');
  assert.equal(deriveFamily(beatAtContact('starFlare', { vgType: 'dragon', tier: 3 })), 'roar');
  assert.equal(deriveFamily(beatAtContact('beam', { vgType: 'dragon', tier: 3 })), 'roar');
  assert.equal(deriveFamily(beatAtContact('beam', { vgType: 'dragon', tier: 2 })), 'beam');
  assert.equal(
    deriveFamily(beatAtContact('starFlare', { statClass: 'physical', attacker: { motion: 'dash', params: {} } })),
    'dash'
  );
  assert.equal(
    deriveFamily(beatAtContact('starFlare', { statClass: 'physical', attacker: { motion: 'lunge', params: {} } })),
    'punch'
  );
  assert.equal(deriveFamily(beatAtContact('starFlare', { statClass: 'special', attacker: { motion: 'dash', params: {} } })), 'burst');
});

test('validateSpec rejects a family that does not follow the rule', () => {
  const errors = validateSpec({ ...clone(fireBlast), family: 'beam' });
  assert.ok(has(errors, "family 'beam' does not follow the family rule (expected 'burst')"));
  assert.ok(FAMILIES.includes(deriveFamily(fireBlast)));
});

// Design 065 slice 1: the signature tier 'S'.
const tierS = (durationMs, contactMs) => {
  const spec = { ...clone(fireBlast), tier: 'S', durationMs, contactMs };
  spec.beats = spec.beats.map((b) => ({ ...b, until: Math.min(b.until, durationMs) })).filter((b) => b.at < b.until);
  spec.particles = (spec.particles ?? []).filter((p) => p.at < durationMs);
  return { ...spec, family: deriveFamily(spec) };
};

test('tier S: 1800–2600 ms, contact 900–1200 and within the ratio band', () => {
  assert.deepEqual(TIER_BAND.S, [1800, 2600]);
  assert.deepEqual(S_CONTACT, [900, 1200]);
  assert.deepEqual(validateSpec(tierS(1800, 900)), []);
  assert.deepEqual(validateSpec(tierS(1900, 1000)), []);
  assert.ok(has(validateSpec({ ...tierS(1900, 1000), durationMs: 2700 }), 'outside tier S band'));
  assert.ok(has(validateSpec({ ...tierS(1900, 1000), durationMs: 1700 }), 'outside tier S band'));
  assert.ok(has(validateSpec({ ...tierS(1900, 1000), durationMs: 2600, contactMs: 1300 }), 'outside tier S contact'));
  assert.ok(has(validateSpec({ ...tierS(1900, 1000), contactMs: 850 }), 'outside tier S contact'));
  // In the contact window but outside the 0.38–0.62 ratio.
  assert.ok(has(validateSpec({ ...tierS(1900, 1000), durationMs: 2600, contactMs: 950 }), 'contactMs/durationMs'));
  assert.ok(has(validateSpec({ ...tierS(1900, 1000), tier: 4 }), 'tier must be'));
});

test("statClass 'status' and vgType 'normal' only with tier S", () => {
  assert.ok(!has(validateSpec({ ...tierS(1900, 1000), statClass: 'status' }), 'statClass'));
  assert.ok(!has(validateSpec({ ...tierS(1900, 1000), vgType: 'normal' }), 'vgType'));
  assert.ok(has(validateSpec({ ...clone(fireBlast), statClass: 'status' }), "unknown statClass 'status'"));
  assert.ok(has(validateSpec({ ...clone(fireBlast), vgType: 'normal' }), "unknown vgType 'normal'"));
});

test('the Dragon roar rule also holds for tier S', () => {
  assert.equal(deriveFamily(beatAtContact('beam', { vgType: 'dragon', tier: 'S' })), 'roar');
  assert.equal(deriveFamily(beatAtContact('starFlare', { vgType: 'dragon', tier: 'S' })), 'roar');
});

test('design 065: every drawer accepts a beat tint and hues', () => {
  for (const drawer of Object.keys(DRAWER_PARAMS)) {
    assert.deepEqual(checkParams(drawer, { tint: { body: '#123456', hot: '#ABCDEF' } }), [], drawer);
    assert.deepEqual(checkParams(drawer, { hues: ['#ff0000', '#00ff00'] }), [], drawer);
    assert.equal(withDefaults(drawer, {}).tint, null, drawer);
    assert.equal(withDefaults(drawer, {}).hues, null, drawer);
  }
  assert.equal(checkParams('beam', { tint: { body: '#12345' } }).length, 1);
  assert.equal(checkParams('beam', { tint: { glow: '#123456' } }).length, 1);
  assert.equal(checkParams('beam', { tint: '#123456' }).length, 1);
  assert.equal(checkParams('beam', { hues: [] }).length, 1);
  assert.equal(checkParams('beam', { hues: Array(7).fill('#ffffff') }).length, 1);
  assert.equal(checkParams('beam', { hues: ['red'] }).length, 1);
});
