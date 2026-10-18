import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SPECS } from '../../moves/specs/index.mjs';
import { fireBlast } from '../../moves/specs/fire.mjs';
import { SIGNATURE_SPECS } from '../../moves/signature/specs/index.mjs';
import { IMPACT_TYPES, IMPACT_TYPES_BY_VG, impactSizeFor, impactTypeFor, impactVariant, isImpactBeat, withoutImpactBeats } from '../impact-select.mjs';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'assets', 'fx', 'attack');

test('damage picks the size by the game’s thresholds (edge 3)', () => {
  assert.deepEqual([0, 10, 49, 50, 150, 151, 330].map(impactSizeFor), ['Small', 'Small', 'Small', 'Medium', 'Medium', 'Large', 'Large']);
  assert.equal(impactSizeFor(undefined), 'Small');
  assert.equal(impactSizeFor('120'), 'Medium');
  assert.equal(impactVariant(60, false), 'Medium');
  assert.equal(impactVariant(60, true), 'Medium_C');
  assert.equal(impactVariant(200, true), 'Large_C');
});

test('the move’s type picks the prefab; the printed type breaks a tie (edge 2)', () => {
  const card = (type) => ({ types: [type] });
  // No move scene: the game's rule, the attacker's printed type.
  assert.equal(impactTypeFor(card('Fire')), 'fire');
  assert.equal(impactTypeFor(card('Darkness')), 'darkness');
  assert.equal(impactTypeFor(card('Lightning'), null), 'lightning');
  // A Fire Charizard playing a Flying move keeps the wind's palette.
  assert.equal(impactTypeFor(card('Fire'), 'flying'), 'colorless');
  assert.equal(impactTypeFor(card('Water'), 'ice'), 'water');
  // Poison has been printed Grass, Psychic and Darkness: the card says which.
  assert.equal(impactTypeFor(card('Psychic'), 'poison'), 'psychic');
  assert.equal(impactTypeFor(card('Grass'), 'poison'), 'grass');
  assert.equal(impactTypeFor(card('Fire'), 'poison'), 'darkness');
  assert.equal(impactTypeFor(card('Psychic'), 'fairy'), 'psychic');
  assert.equal(impactTypeFor(card('Colorless'), 'dragon'), 'colorless');
  assert.equal(impactTypeFor(card('Dragon'), 'dragon'), 'dragon');
  // Unknown anything is colorless.
  assert.equal(impactTypeFor(null), 'colorless');
  assert.equal(impactTypeFor({}), 'colorless');
  assert.equal(impactTypeFor(card('Shadow')), 'colorless');
  assert.equal(impactTypeFor(card('Fire'), 'cosmic'), 'fire');
  assert.equal(impactTypeFor(card('Shadow'), 'cosmic'), 'colorless');
});

test('every impact type has a committed asset file, and every move type maps to one', () => {
  for (const type of IMPACT_TYPES) assert.ok(fs.existsSync(path.join(ASSETS, `${type}.json`)), type);
  for (const [vgType, types] of Object.entries(IMPACT_TYPES_BY_VG)) {
    assert.ok(types.length > 0 && types.every((type) => IMPACT_TYPES.includes(type)), vgType);
  }
  const vgTypes = new Set([...Object.values(SPECS), ...Object.values(SIGNATURE_SPECS)].map((spec) => spec.vgType));
  for (const vgType of vgTypes) assert.ok(Object.hasOwn(IMPACT_TYPES_BY_VG, vgType), `move type ${vgType} has no impact type`);
});

test('an impact beat is contact dressing on the defender, never the move itself', () => {
  const beat = (drawer, at, params = {}) => ({ at, until: at + 200, layer: 'front', drawer, params });
  assert.ok(isImpactBeat(beat('impactFlash', 1000), 1000));
  assert.ok(isImpactBeat(beat('smoke', 1300), 1000));
  assert.ok(isImpactBeat(beat('ring', 1000, { target: 'defender' }), 1000));
  assert.ok(isImpactBeat(beat('shards', 999.5), 1000));
  // Before the contact it belongs to the charge or the travel.
  assert.ok(!isImpactBeat(beat('shockRings', 560), 1000));
  assert.ok(!isImpactBeat(beat('ring', 400), 1000));
  // On the attacker it is not the hit.
  assert.ok(!isImpactBeat(beat('ring', 1000, { target: 'attacker' }), 1000));
  assert.ok(!isImpactBeat(beat('splash', 1000, { target: 'attacker' }), 1000));
  // The move's own payoff stays.
  for (const drawer of ['starFlare', 'pillar', 'terrain', 'bolt', 'slashArc', 'cloud', 'vignette', 'speedRays', 'glyph']) {
    assert.ok(!isImpactBeat(beat(drawer, 1000), 1000), drawer);
  }
  assert.ok(!isImpactBeat(null, 1000));
});

test('withoutImpactBeats drops Fire Blast’s smoke and embers and keeps its flare', () => {
  const lean = withoutImpactBeats(fireBlast);
  const drawers = lean.beats.map((beat) => beat.drawer);
  assert.deepEqual(drawers, ['projectile', 'vignette', 'starFlare']);
  assert.deepEqual(lean.particles, []);
  assert.equal(lean.contactMs, fireBlast.contactMs);
  assert.equal(lean.id, fireBlast.id);
  // The spec itself is untouched, and the lean copy is made once.
  assert.equal(fireBlast.beats.length, 4);
  assert.equal(fireBlast.particles.length, 1);
  assert.equal(withoutImpactBeats(fireBlast), lean);
  assert.equal(withoutImpactBeats(null), null);
  assert.deepEqual(withoutImpactBeats({ id: 'x' }), { id: 'x' });
});

test('across every shipped move the charge and travel beats all survive', () => {
  let dropped = 0;
  for (const spec of [...Object.values(SPECS), ...Object.values(SIGNATURE_SPECS)]) {
    const lean = withoutImpactBeats(spec);
    const before = spec.beats.filter((beat) => beat.at < spec.contactMs - 1);
    const after = lean.beats.filter((beat) => beat.at < spec.contactMs - 1);
    assert.deepEqual(after, before, spec.id);
    assert.ok(lean.beats.length > 0, `${spec.id} keeps a scene`);
    dropped += spec.beats.length - lean.beats.length;
  }
  assert.ok(dropped > 400, `${dropped} impact beats replaced`);
});
