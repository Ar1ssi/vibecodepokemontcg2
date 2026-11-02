// Design 083: the ambient drift over every Stadium board (stadium-env-drift.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { BOARD_DRIFT, DRIFT_FRAGMENT, DRIFT_KINDS, DRIFT_VERTEX, MAX_EMITTERS, createDrift, driftArea } from '../stadium-env-drift.mjs';
import { ENVIRONMENT_KEYS } from '../stadium-environment-layout.mjs';

const kit = {
  three,
  material: (vertexShader, fragmentShader, extra = {}, own = {}) => new three.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { ...own }, ...extra }),
  seeded: (count) => {
    const geometry = new three.BufferGeometry();
    geometry.setAttribute('position', new three.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aSeed', new three.BufferAttribute(new Float32Array(count * 4), 4));
    return geometry;
  },
};

test('every board has a drift row, every row a known kind, a sane count and screen colours', () => {
  assert.deepEqual(Object.keys(BOARD_DRIFT).sort(), [...ENVIRONMENT_KEYS].sort());
  for (const [board, specs] of Object.entries(BOARD_DRIFT)) {
    for (const spec of specs) {
      assert.ok(DRIFT_KINDS[spec.kind], `${board}: ${spec.kind}`);
      assert.ok(spec.count > 0 && spec.count <= 200, `${board}: count ${spec.count}`);
      assert.ok(spec.colours.length >= 1 && spec.colours.length <= 4, `${board}: colours`);
      for (const hex of spec.colours) assert.match(hex, /^#[0-9a-f]{6}$/i, `${board}: ${hex}`);
    }
  }
  const moving = Object.values(BOARD_DRIFT).filter((specs) => specs.length > 0).length;
  assert.ok(moving >= 22, `most boards drift (${moving})`);
});

test('createDrift: one point cloud and material per drift, glowing kinds added; none without specs', () => {
  assert.deepEqual(createDrift(kit, []).objects, []);
  assert.deepEqual(createDrift(kit).materials, []);
  const drift = createDrift(kit, [
    { kind: 'leaf', count: 10, colours: ['#7cc443'] },
    { kind: 'firefly', count: 5, colours: ['#d8ff6a', '#8cffb0'] },
    { kind: 'snow', count: 0, colours: ['#ffffff'] },
  ]);
  assert.equal(drift.objects.length, 2, 'a drift of none is left out');
  assert.equal(drift.objects[0].geometry.getAttribute('aSeed').count, 10);
  assert.equal(drift.materials[0].blending, three.NormalBlending);
  assert.equal(drift.materials[1].blending, three.AdditiveBlending);
  assert.equal(drift.materials[1].uniforms.uDriftColourCount.value, 2);
  assert.equal(drift.materials[0].depthWrite, false);
  assert.equal(drift.objects[0].renderOrder, 3);
});

test('createDrift: an unknown kind or a bad colour throws', () => {
  assert.throws(() => createDrift(kit, [{ kind: 'bats', count: 5, colours: ['#ffffff'] }]), /unknown Stadium drift kind: bats/);
  assert.throws(() => createDrift(kit, [{ kind: 'leaf', count: 5, colours: ['green'] }]), /not a #rrggbb colour/);
});

test('setEmitters: only emitting drifts take them, valid discs only, at most MAX_EMITTERS', () => {
  const drift = createDrift(kit, [
    { kind: 'leaf', count: 4, colours: ['#7cc443'], emitters: true },
    { kind: 'mote', count: 4, colours: ['#ffffff'] },
  ]);
  const discs = Array.from({ length: MAX_EMITTERS + 5 }, (_, i) => ({ x: i, y: 2 * i, r: 30, z: 120 }));
  drift.setEmitters([{ x: NaN, y: 0, r: 1, z: 1 }, null, ...discs]);
  const leaf = drift.materials[0].uniforms;
  assert.equal(leaf.uEmitterCount.value, MAX_EMITTERS);
  assert.deepEqual(leaf.uEmitters.value[0].toArray(), [0, 0, 30, 120]);
  assert.deepEqual(leaf.uEmitters.value[3].toArray(), [3, 6, 30, 120]);
  assert.equal(drift.materials[1].uniforms.uEmitterCount.value, 0, 'a drift without emitters keeps the scene');
  drift.setEmitters(undefined);
  assert.equal(leaf.uEmitterCount.value, 0, 'no list: back to the whole scene');
});

test('the shaders hide a particle over a card or the opponent\'s hand by the ground point it covers on screen', () => {
  assert.match(DRIFT_VERTEX, /covered = uEye\.xy \+ \(world\.xy - uEye\.xy\) \* \(uEye\.z \/ max\(uEye\.z - world\.z, 1\.0\)\);/);
  assert.match(DRIFT_VERTEX, /float clear = smoothstep\(30\.0, 90\.0, blockGap\(covered\)\) \* smoothstep\(20\.0, 70\.0, avoidGap\(covered\)\);/);
  assert.match(DRIFT_VERTEX, /return length\(max\(max\(uFootprintBox\.xy - p, p - uFootprintBox\.zw\), 0\.0\)\);/);
  assert.match(DRIFT_VERTEX, /revealBurned\(pos\) \* exitKeep\(pos\)/);
  assert.match(DRIFT_FRAGMENT, /gl_FragColor = vec4\(tone, alpha\);/);
});

test('setAvoid: the opponent\'s hand as a box (x0, y0, x1, y1) for every drift; none without one', () => {
  const drift = createDrift(kit, [{ kind: 'leaf', count: 3, colours: ['#7cc443'] }, { kind: 'mote', count: 3, colours: ['#ffffff'] }]);
  drift.setAvoid({ x: -500, y: 900, w: 1000, h: 170 });
  for (const material of drift.materials) assert.deepEqual(material.uniforms.uDriftAvoid.value.toArray(), [-500, 900, 500, 1070]);
  drift.setAvoid({ x: 0, y: 0, w: 0, h: 10 });
  for (const material of drift.materials) assert.deepEqual(material.uniforms.uDriftAvoid.value.toArray(), [0, 0, 0, 0]);
  drift.setAvoid(null);
  for (const material of drift.materials) assert.deepEqual(material.uniforms.uDriftAvoid.value.toArray(), [0, 0, 0, 0]);
});

test('driftArea: the table grown 12% each way, clipped to the scene; setArea hands it to every drift', () => {
  const table = { x: -500, y: 0, w: 1000, h: 600 };
  const scene = { x: -560, y: -200, w: 1300, h: 1200 };
  const area = driftArea(table, scene);
  for (const [key, value] of Object.entries({ x: -560, y: -72, w: 1180, h: 744 })) assert.ok(Math.abs(area[key] - value) < 1e-9, `${key} ${area[key]}`);
  assert.equal(driftArea(null, scene), null);
  assert.equal(driftArea({ x: 0, y: 0, w: 0, h: 10 }, scene), null);
  const drift = createDrift(kit, [{ kind: 'mote', count: 3, colours: ['#ffffff'] }, { kind: 'snow', count: 3, colours: ['#ffffff'] }]);
  drift.setArea({ x: 1, y: 2, w: 3, h: 4 });
  for (const material of drift.materials) assert.deepEqual(material.uniforms.uDriftArea.value.toArray(), [1, 2, 3, 4]);
  drift.setArea(null);
  for (const material of drift.materials) assert.deepEqual(material.uniforms.uDriftArea.value.toArray(), [0, 0, 0, 0], 'none: the whole scene');
});
