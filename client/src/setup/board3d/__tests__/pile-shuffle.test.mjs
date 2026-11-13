// Design 089 D8: a pile's riffle shuffle, played by its own card layers (pile-mesh.js `shuffle`).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';

import { createPileMeshes } from '../pile-mesh.js';
import { SHUFFLE_BEATS, SHUFFLE_MS, SHUFFLE_TAP_MS, shuffleCardCount } from '../shuffle-math.mjs';

const POSE = { x: 300, y: -120, yawDeg: 0, widthPx: 90 };

function makePiles({ reduced = false } = {}) {
  const clock = { t: 0, now() { return this.t; } };
  const group = new three.Group();
  const piles = createPileMeshes({
    group,
    three,
    textures: { acquire: () => new Promise(() => {}), release() {} },
    clock,
    motionReduced: () => reduced,
  });
  piles.setPile('self', 'deck', { count: 40, layers: 5, topSrc: null }, POSE, { thicknessPx: 12 });
  const stack = () => group.children[0];
  return { piles, clock, stack };
}

test('a shuffle spreads the pile’s cards into two packets, then leaves the pile as it was', () => {
  const { piles, clock, stack } = makePiles();
  assert.equal(piles.meshCount(), 5);
  assert.equal(piles.shuffle('self', 'deck'), SHUFFLE_MS);
  assert.equal(piles.meshCount(), shuffleCardCount(40), 'the shuffle plays with its own number of cards');

  clock.t = SHUFFLE_MS * SHUFFLE_BEATS.cutEnd;
  assert.equal(piles.update(clock.t), true, 'a shuffling pile asks for frames');
  const xs = stack().children.map((mesh) => mesh.position.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 80, `packets apart: ${xs.map(Math.round)}`);
  // The pile sits right of the table's middle (x 300): the riffle has drifted left, toward it.
  assert.ok((Math.min(...xs) + Math.max(...xs)) / 2 < -20, `drifted inward: ${xs.map(Math.round)}`);
  assert.ok(stack().children.every((mesh) => mesh.position.z >= 0), 'no card under the cloth');
  assert.ok(stack().children.some((mesh) => Math.abs(mesh.rotation.y) > 0.2), 'the packets lean');

  clock.t = SHUFFLE_MS + 1;
  piles.update(clock.t);
  assert.equal(piles.meshCount(), 5, 'back to the pile’s own layers');
  for (const mesh of stack().children) {
    assert.equal(mesh.position.x, 0);
    assert.equal(mesh.rotation.y, 0);
    assert.equal(mesh.rotation.z, 0);
  }
  assert.equal(piles.update(clock.t + 16), false);
});

test('a count change during the shuffle waits for its end', () => {
  const { piles, clock } = makePiles();
  piles.shuffle('self', 'deck');
  const shuffling = piles.meshCount();
  piles.setPile('self', 'deck', { count: 39, layers: 4, topSrc: null }, POSE, { thicknessPx: 10 });
  assert.equal(piles.meshCount(), shuffling, 'the shuffling cards stay');
  clock.t = SHUFFLE_MS + 1;
  piles.update(clock.t);
  assert.equal(piles.meshCount(), 4, 'the newer layout applies afterwards');
});

test('nothing shuffles a pile that is not drawn or holds under two cards', () => {
  const { piles } = makePiles();
  assert.equal(piles.shuffle('opp', 'deck'), 0);
  assert.equal(piles.shuffle('self', 'deck', { count: 1 }), 0);
  assert.equal(piles.meshCount(), 5);
  piles.dispose();
  assert.equal(piles.shuffle('self', 'deck'), 0);
});

test('reduced motion: the pile taps for a moment and no card leaves it', () => {
  const { piles, clock, stack } = makePiles({ reduced: true });
  assert.equal(piles.shuffle('self', 'deck'), SHUFFLE_TAP_MS);
  clock.t = SHUFFLE_TAP_MS * 0.3;
  piles.update(clock.t);
  assert.ok(stack().children.every((mesh) => Math.abs(mesh.position.x) < 1e-6));
  clock.t = SHUFFLE_TAP_MS + 1;
  piles.update(clock.t);
  assert.equal(piles.meshCount(), 5);
});
