import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FACET_VIEW,
  TERA_SKIN_GLINTS,
  createSkinReconciler,
  skinSeed,
  teraSkinFacets,
  teraSkinGlints,
  teraSkinTargets,
} from '../tera-skin.mjs';

const teraBasic = (instanceId, extra = {}) => ({
  instanceId,
  supertype: 'Pokémon',
  name: 'Terapagos ex',
  subtypes: ['Basic', 'ex', 'Tera'],
  ...extra,
});
const plainBasic = (instanceId, extra = {}) => ({
  instanceId,
  supertype: 'Pokémon',
  name: 'Charmander',
  subtypes: ['Basic'],
  ...extra,
});
const teraStage2 = (instanceId, attachedTo) => ({
  instanceId,
  attachedTo,
  supertype: 'Pokémon',
  name: 'Charizard ex',
  subtypes: ['Stage 2', 'ex', 'Tera'],
});
const energy = (instanceId, attachedTo) => ({
  instanceId,
  attachedTo,
  supertype: 'Energy',
  name: 'Fire Energy',
});

const board = (zones) => (side, zoneId) => zones[`${side}.${zoneId}`];

test('teraSkinTargets: Tera Pokémon in play on either side, nothing else', () => {
  const zoneArrayOf = board({
    'you.active': [teraBasic(1), energy(2, 1)],
    'you.bench': [plainBasic(3), teraBasic(4)],
    'them.active': [plainBasic(5)],
    'them.bench': [teraBasic(6)],
    'you.hand': [teraBasic(7)],
  });
  assert.deepEqual([...teraSkinTargets(zoneArrayOf)].sort(), [1, 4, 6]);
});

test('teraSkinTargets: an evolved stack is skinned by its top card', () => {
  const zoneArrayOf = board({
    'you.active': [
      plainBasic(10),
      {
        ...plainBasic(11, { attachedTo: 10 }),
        name: 'Charmeleon',
        subtypes: ['Stage 1'],
      },
      teraStage2(12, 10),
    ],
    'you.bench': [
      teraBasic(20),
      {
        ...plainBasic(21, { attachedTo: 20 }),
        name: 'Plain Stage 1',
        subtypes: ['Stage 1'],
      },
    ],
  });
  assert.deepEqual([...teraSkinTargets(zoneArrayOf)], [12]);
});

test('teraSkinTargets: held ids wait, bad zones and cards are skipped', () => {
  const zoneArrayOf = board({
    'you.active': [teraBasic(1)],
    'you.bench': { count: 3 },
    'them.active': [null, 'x', teraBasic(null), teraBasic(2)],
  });
  assert.deepEqual([...teraSkinTargets(zoneArrayOf, new Set([1]))], [2]);
  assert.equal(teraSkinTargets(null).size, 0);
  assert.equal(teraSkinTargets(() => undefined).size, 0);
});

test('skinSeed: stable 32-bit seeds for numbers and strings', () => {
  assert.equal(skinSeed(42), 42);
  assert.equal(skinSeed(-3.7), 3);
  assert.equal(skinSeed('card-9'), skinSeed('card-9'));
  assert.notEqual(skinSeed('card-9'), skinSeed('card-8'));
  for (const id of [undefined, null, NaN, 'x', 2 ** 40]) {
    const seed = skinSeed(id);
    assert.ok(
      Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32,
      String(id)
    );
  }
});

test('teraSkinFacets: seeded mesh of triangles inside the card box', () => {
  const { svg, triangles } = teraSkinFacets(5);
  const { width, height, cols, rows } = FACET_VIEW;
  assert.equal(triangles.length, cols * rows * 2);
  for (const tri of triangles)
    for (const [x, y] of tri) {
      assert.ok(x >= 0 && x <= width, `x ${x}`);
      assert.ok(y >= 0 && y <= height, `y ${y}`);
    }
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes(`viewBox='0 0 ${width} ${height}'`));
  assert.equal(svg.match(/<polygon /g).length, triangles.length);
  assert.ok(!svg.includes('"'), 'single quotes only, for svgDataUrl');
  assert.deepEqual(teraSkinFacets(5), teraSkinFacets(5));
  assert.notEqual(teraSkinFacets(5).svg, teraSkinFacets(6).svg);
});

test('teraSkinFacets: the mesh covers the whole card (areas sum to the box)', () => {
  const { triangles } = teraSkinFacets('abc');
  const area = triangles.reduce((sum, [[ax, ay], [bx, by], [cx, cy]]) => {
    return sum + Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
  }, 0);
  assert.ok(Math.abs(area - FACET_VIEW.width * FACET_VIEW.height) < 1e-6);
});

test('teraSkinGlints: a few staggered glints inside the card', () => {
  const glints = teraSkinGlints(9);
  assert.equal(glints.length, TERA_SKIN_GLINTS);
  for (const g of glints) {
    assert.ok(g.x >= 10 && g.x <= 90);
    assert.ok(g.y >= 8 && g.y <= 92);
    assert.ok(g.size > 0.2 && g.size < 0.5);
  }
  for (let i = 1; i < glints.length; i += 1)
    assert.ok(glints[i].delay > glints[i - 1].delay, 'staggered');
  assert.deepEqual(teraSkinGlints(9), glints);
});

// A reconciler over fakes: `wants` is the id list targetIds returns (minus
// held ids), `nodes` maps id -> node, and `log` records every apply/remove.
function fakeReconciler() {
  const state = {
    wants: [],
    nodes: new Map(),
    log: [],
    timers: new Map(),
    cancelled: [],
  };
  let nextHandle = 1;
  const reconciler = createSkinReconciler({
    targetIds: (held) => state.wants.filter((id) => !held.has(id)),
    nodeFor: (id) => state.nodes.get(id) ?? null,
    apply: (node, id) => state.log.push(['apply', node, id]),
    remove: (node) => state.log.push(['remove', node]),
    schedule: (fn, ms) => {
      const handle = nextHandle++;
      state.timers.set(handle, { fn, ms });
      return handle;
    },
    cancel: (handle) => {
      state.cancelled.push(handle);
      state.timers.delete(handle);
    },
  });
  const fire = (handle) => {
    const { fn } = state.timers.get(handle);
    state.timers.delete(handle);
    fn();
  };
  return { ...reconciler, state, fire };
}

test('createSkinReconciler: refresh applies wanted skins once, skips missing nodes', () => {
  const r = fakeReconciler();
  r.state.wants = [1, 2, 3];
  r.state.nodes.set(1, 'img-1').set(2, 'img-2');
  r.refresh();
  assert.deepEqual(r.state.log, [
    ['apply', 'img-1', 1],
    ['apply', 'img-2', 2],
  ]);
  r.refresh();
  assert.equal(r.state.log.length, 2, 'no re-apply when nothing changed');
});

test('createSkinReconciler: a new node for the card moves the skin; untargeted skins come off', () => {
  const r = fakeReconciler();
  r.state.wants = [1, 2];
  r.state.nodes.set(1, 'img-1').set(2, 'img-2');
  r.refresh();
  r.state.log.length = 0;

  r.state.nodes.set(1, 'wrapper-1');
  r.refresh();
  assert.deepEqual(r.state.log, [
    ['remove', 'img-1'],
    ['apply', 'wrapper-1', 1],
  ]);

  r.state.log.length = 0;
  r.state.wants = [1];
  r.refresh();
  assert.deepEqual(r.state.log, [['remove', 'img-2']]);

  r.state.log.length = 0;
  r.state.nodes.delete(1);
  r.refresh();
  assert.deepEqual(
    r.state.log,
    [['remove', 'wrapper-1']],
    'node gone: skin forgotten'
  );
});

test('createSkinReconciler: hold strips the skin until its timer fires', () => {
  const r = fakeReconciler();
  r.state.wants = [1];
  r.state.nodes.set(1, 'img-1');
  r.refresh();
  r.state.log.length = 0;

  r.hold(1, 2640);
  assert.deepEqual(r.state.log, [['remove', 'img-1']]);
  const [[handle, { ms }]] = [...r.state.timers];
  assert.equal(ms, 2640);

  r.refresh();
  assert.deepEqual(r.state.log, [['remove', 'img-1']], 'held across refreshes');

  r.fire(handle);
  assert.deepEqual(r.state.log, [
    ['remove', 'img-1'],
    ['apply', 'img-1', 1],
  ]);
});

test('createSkinReconciler: hold before the card is skinned, re-hold restarts the timer', () => {
  const r = fakeReconciler();
  r.state.wants = [1];
  r.state.nodes.set(1, 'img-1');

  r.hold(1, 100);
  r.refresh();
  assert.deepEqual(
    r.state.log,
    [],
    'held before its first refresh: nothing to strip, nothing applied'
  );

  const [first] = r.state.timers.keys();
  r.hold(1, 500);
  assert.deepEqual(r.state.cancelled, [first]);
  const [[second, { ms }]] = [...r.state.timers];
  assert.equal(ms, 500);

  r.fire(second);
  assert.deepEqual(r.state.log, [['apply', 'img-1', 1]]);
});

test('createSkinReconciler: hold ignores a missing id or a non-positive duration', () => {
  const r = fakeReconciler();
  r.state.wants = [1];
  r.state.nodes.set(1, 'img-1');
  r.refresh();
  for (const [id, ms] of [
    [null, 100],
    [undefined, 100],
    [1, 0],
    [1, -5],
    [1, NaN],
    [1, undefined],
  ])
    r.hold(id, ms);
  assert.equal(r.state.timers.size, 0);
  assert.deepEqual(r.state.log, [['apply', 'img-1', 1]]);
});
