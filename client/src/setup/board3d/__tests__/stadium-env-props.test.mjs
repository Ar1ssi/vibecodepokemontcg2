import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { LOOK, ROUND_EDGE_MAX, composeFrames, createPropBuilder, frameOf } from '../stadium-env-props.mjs';
import { disc } from '../stadium-env-buildings.mjs';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const read = (props) => {
  const geometry = props.build(three);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const color = geometry.getAttribute('aColor');
  return { geometry, position, normal, color };
};

test('triangle: three vertices with one unit normal, facing where the winding faces, each carrying the colour', () => {
  const props = createPropBuilder();
  props.triangle([0, 0, 0], [10, 0, 0], [0, 10, 0], [0.2, 0.4, 0.6, 0.3]);
  assert.equal(props.vertexCount(), 3);
  const { geometry, normal, color } = read(props);
  assert.equal(geometry.getIndex().count, 3);
  for (let i = 0; i < 3; i += 1) {
    assert.deepEqual([normal.getX(i), normal.getY(i), normal.getZ(i)], [0, 0, 1], 'counter-clockwise seen from +z faces +z');
    assert.deepEqual([color.getX(i), color.getY(i), color.getZ(i)].map((v) => Math.round(v * 10) / 10), [0.2, 0.4, 0.6]);
    assert.ok(Math.abs(color.getW(i) - 0.3) < 1e-6);
  }
});

test('triangle and quad: a degenerate face (a frond\'s tip) faces straight up, never a zero or NaN normal', () => {
  const props = createPropBuilder();
  props.triangle([1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1, 0]);
  props.quad([2, 2, 0], [2, 2, 0], [2, 2, 0], [2, 2, 0], [1, 1, 1, 0]);
  const { normal } = read(props);
  assert.equal(normal.count, 7);
  for (let i = 0; i < normal.count; i += 1) assert.deepEqual([normal.getX(i), normal.getY(i), normal.getZ(i)], [0, 0, 1]);
});

test('disc: a fan of triangles on the circle in the plane through `out` and up, a half disc covering half the arc', () => {
  const whole = createPropBuilder();
  disc(whole, { centre: [5, 6, 20], out: [0, 1], r: 8, color: [1, 1, 1, 0], sides: 16 });
  assert.equal(whole.vertexCount(), 16 * 3);
  const { position } = read(whole);
  for (let i = 0; i < position.count; i += 1) {
    assert.ok(Math.abs(position.getX(i) - 5) < 1e-9, 'every vertex in the plane x = 5 (out is +y)');
    assert.ok(Math.hypot(position.getY(i) - 6, position.getZ(i) - 20) <= 8 + 1e-4, 'within the radius');
  }
  const top = createPropBuilder();
  disc(top, { centre: [0, 0, 0], out: [1, 0], r: 4, color: [1, 0, 0, 0], from: 0, to: Math.PI, sides: 10 });
  const { position: upper } = read(top);
  for (let i = 0; i < upper.count; i += 1) assert.ok(upper.getZ(i) >= -1e-9, 'the upper half only');
});

test('frameOf: yaw turns +x toward +y, scale scales, lean tips z toward x; composeFrames nests them', () => {
  const turned = frameOf({ x: 10, y: 20, z: 5, yaw: Math.PI / 2, scale: 2 });
  // m * [1, 0, 0] = [0, 2, 0]
  assert.ok(close(turned.m[0], 0) && close(turned.m[3], 2) && close(turned.m[6], 0));
  assert.deepEqual(turned.t, [10, 20, 5]);
  const leant = frameOf({ lean: [0, Math.PI / 2] });
  // z tipped about y by 90 degrees lies along +x.
  assert.ok(close(leant.m[2], 1) && close(leant.m[8], 0));
  const nested = composeFrames(turned, frameOf({ x: 1 }));
  assert.ok(close(nested.t[0], 10) && close(nested.t[1], 22) && close(nested.t[2], 5));
  assert.equal(nested.k, 2);
  assert.deepEqual(frameOf({ x: NaN, scale: Infinity }).t, [0, 0, 0], 'non-finite numbers count as defaults');
});

test('builder at(): a part modelled about its foot lands where the placement puts it, its normals turned', () => {
  const props = createPropBuilder();
  props.at({ x: 100, y: 50, yaw: Math.PI }, () => props.triangle([1, 0, 0], [2, 0, 0], [1, 1, 0], [1, 1, 1, 0]));
  const geometry = props.build(three);
  const position = geometry.getAttribute('position');
  assert.ok(close(position.getX(0), 99) && close(position.getY(0), 50));
  assert.ok(close(position.getX(2), 99) && close(position.getY(2), 49));
  const normal = geometry.getAttribute('normal');
  assert.ok(close(normal.getZ(0), 1), 'a flat triangle seen from +z still faces +z after a turn about z');
});

test('builder look(): kind, sway, shade and leaf size ride on every vertex; looks nest and restore', () => {
  const props = createPropBuilder();
  props.look({ kind: LOOK.foliage, sway: 1.5, leaf: 4 }, () => {
    props.box({ x: 0, y: 0, z0: 0, z1: 10, hw: 5, hh: 5, color: [1, 0, 0, 0] });
    props.look({ kind: LOOK.gloss }, () => props.box({ x: 20, y: 0, z0: 0, z1: 10, hw: 5, hh: 5, color: [0, 1, 0, 0] }));
  });
  props.box({ x: 40, y: 0, z0: 0, z1: 10, hw: 5, hh: 5, color: [0, 0, 1, 0] });
  const look = props.build(three).getAttribute('aLook');
  const at = (i) => [look.getX(i), look.getY(i), look.getZ(i), look.getW(i)];
  assert.deepEqual(at(0), [LOOK.foliage, 1.5, 1, 4]);
  assert.deepEqual(at(20), [LOOK.gloss, 1.5, 1, 4], 'the inner look keeps the outer sway and leaf');
  assert.deepEqual(at(40), [LOOK.plain, 0, 1, 0], 'back to the default after');
});

test('builder look(): a leaf size is px of the part\'s own frame, so it scales with its placement', () => {
  const props = createPropBuilder();
  props.at({ x: 0, y: 0, scale: 2 }, () => props.look({ kind: LOOK.foliage, leaf: 4 }, () => props.blob({ rx: 5, color: [0, 1, 0, 0] })));
  props.look({ kind: LOOK.foliage, leaf: 0 }, () => props.blob({ x: 30, rx: 5, color: [0, 1, 0, 0] }));
  const geometry = props.build(three);
  const look = geometry.getAttribute('aLook');
  const position = geometry.getAttribute('position');
  for (let i = 0; i < look.count; i += 1) assert.equal(look.getW(i), position.getX(i) > 20 ? 0 : 8);
  assert.equal(geometry.getAttribute('aHull'), undefined, 'no outline hull any more (design 082)');
});

test('builder lumps(): a lump keeps its colour where no other lump is near, darkens in the crease against one', () => {
  const read = (list) => {
    const props = createPropBuilder();
    props.lumps(list, { crease: 0.5 });
    const geometry = props.build(three);
    const color = geometry.getAttribute('aColor');
    const position = geometry.getAttribute('position');
    return { color, position };
  };
  const apart = read([
    { x: 0, rx: 5, color: [0.5, 0.6, 0.2, 0] },
    { x: 40, rx: 5, color: [0.5, 0.6, 0.2, 0] },
  ]);
  for (let i = 0; i < apart.color.count; i += 1) assert.ok(close(apart.color.getY(i), 0.6), 'lumps apart: no crease');
  const together = read([
    { x: 0, rx: 5, color: [0.5, 0.6, 0.2, 0] },
    { x: 7, rx: 5, color: [0.5, 0.6, 0.2, 0] },
  ]);
  let darkest = 1;
  let farSide = 0;
  for (let i = 0; i < together.color.count; i += 1) {
    const g = together.color.getY(i);
    darkest = Math.min(darkest, g);
    // The first lump's far side (x ≤ -4) is more than 1.5 radii from the second's surface: untouched.
    if (together.position.getX(i) <= -4) farSide = Math.max(farSide, Math.abs(g - 0.6));
  }
  assert.ok(darkest < 0.6 * 0.6, `the crease darkens (${darkest})`);
  assert.ok(farSide < 1e-6, 'the far side keeps its colour');
});

test('builder roundBox(): inside its box, square on the floor, rounded on top, every normal outward, top colour up', () => {
  const props = createPropBuilder();
  props.roundBox({ x: 10, y: 0, z0: 0, z1: 20, hw: 15, hh: 8, r: 4, yaw: 0.3, color: [1, 0, 0, 0], topColor: [0, 1, 0, 0] });
  const geometry = props.build(three);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const color = geometry.getAttribute('aColor');
  const [c, s] = [Math.cos(0.3), Math.sin(0.3)];
  let lowest = Infinity;
  for (let i = 0; i < position.count; i += 1) {
    const dx = position.getX(i) - 10;
    const dy = position.getY(i);
    const local = [dx * c + dy * s, -dx * s + dy * c, position.getZ(i)];
    assert.ok(Math.abs(local[0]) <= 15 + 1e-6 && Math.abs(local[1]) <= 8 + 1e-6 && local[2] <= 20 + 1e-6 && local[2] >= -1e-6, 'inside its box');
    lowest = Math.min(lowest, local[2]);
    const n = [normal.getX(i), normal.getY(i), normal.getZ(i)];
    assert.ok(close(Math.hypot(...n), 1, 1e-6), 'unit normals');
    const out = [position.getX(i) - 10, position.getY(i), position.getZ(i) - 10];
    assert.ok(out[0] * n[0] + out[1] * n[1] + out[2] * n[2] > 0, 'outward');
    assert.equal(color.getY(i), n[2] > 0.5 ? 1 : 0, 'the top colour on parts facing up');
  }
  assert.equal(lowest, 0, 'its walls run down to the floor');
  // The top is rounded: no vertex at the box's top corner.
  for (let i = 0; i < position.count; i += 1) {
    const dx = position.getX(i) - 10;
    const dy = position.getY(i);
    const local = [dx * c + dy * s, -dx * s + dy * c];
    assert.ok(!(Math.abs(local[0]) > 14.9 && position.getZ(i) > 19.9), 'no sharp top edge');
  }
});

test('builder roundBox(): its front takes frontColor as box paints it, and without r it rounds at a third of its smallest half (design 082)', () => {
  const props = createPropBuilder();
  // Turned a quarter: its front (the -hh side) faces +x in the table.
  props.roundBox({ x: 0, y: 0, z0: 0, z1: 30, hw: 12, hh: 6, yaw: Math.PI / 2, color: [1, 0, 0, 0], topColor: [0, 1, 0, 0], frontColor: [0, 0, 1, 0] });
  const geometry = props.build(three);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const color = geometry.getAttribute('aColor');
  let fronts = 0;
  let highestOnFront = -Infinity;
  for (let i = 0; i < position.count; i += 1) {
    const n = [normal.getX(i), normal.getY(i), normal.getZ(i)];
    const expected = n[2] > 0.5 ? [0, 1, 0] : n[0] > 0.5 ? [0, 0, 1] : [1, 0, 0];
    assert.deepEqual([color.getX(i), color.getY(i), color.getZ(i)], expected, `vertex ${i} facing ${n.map((v) => v.toFixed(2))}`);
    if (expected[2] === 1) fronts += 1;
    // The front's plane (x 6) stops where its top edge starts rounding: the default radius, 6 / 3 = 2 px down.
    if (position.getX(i) > 6 - 1e-6) highestOnFront = Math.max(highestOnFront, position.getZ(i));
  }
  assert.ok(fronts > 0, 'the front is painted');
  assert.ok(close(highestOnFront, 28, 1e-6), `the top edge rounds from 2 px down (${highestOnFront})`);
  // A building-sized box rounds at most ROUND_EDGE_MAX, not a third of its 60 px half depth.
  const big = createPropBuilder();
  big.roundBox({ x: 0, y: 0, z0: 0, z1: 200, hw: 100, hh: 60, color: [1, 1, 1, 0] });
  const bigGeometry = big.build(three);
  const bigPosition = bigGeometry.getAttribute('position');
  let highestOnBigFront = -Infinity;
  for (let i = 0; i < bigPosition.count; i += 1) {
    if (bigPosition.getY(i) < -60 + 1e-6) highestOnBigFront = Math.max(highestOnBigFront, bigPosition.getZ(i));
  }
  assert.ok(close(highestOnBigFront, 200 - ROUND_EDGE_MAX, 1e-6), `a building's edge rounds ${ROUND_EDGE_MAX} px (${highestOnBigFront})`);
});

test('builder tint(): lit colours take the factor, nested tints multiply, glowing colours keep theirs (design 083)', () => {
  const props = createPropBuilder();
  props.tint([0.5, 1, 2], () => {
    props.box({ x: 0, y: 0, z0: 0, z1: 4, hw: 2, hh: 2, color: [0.4, 0.4, 0.4, 0] });
    props.tint([2, 1, 0.5], () => props.box({ x: 10, y: 0, z0: 0, z1: 4, hw: 2, hh: 2, color: [0.4, 0.4, 0.4, 0] }));
    props.box({ x: 20, y: 0, z0: 0, z1: 4, hw: 2, hh: 2, color: [0.4, 0.4, 0.4, 2.5] });
  });
  props.tint([NaN, 1, 1], () => props.box({ x: 30, y: 0, z0: 0, z1: 4, hw: 2, hh: 2, color: [0.4, 0.4, 0.4, 0] }));
  const color = props.build(three).getAttribute('aColor');
  const position = props.build(three).getAttribute('position');
  const seen = { tinted: false, nested: false, glow: false, invalid: false };
  for (let i = 0; i < color.count; i += 1) {
    const rgb = [color.getX(i), color.getY(i), color.getZ(i)];
    const x = position.getX(i);
    if (x < 5) {
      assert.ok(close(rgb[0], 0.2) && close(rgb[1], 0.4) && close(rgb[2], 0.8), 'tinted');
      seen.tinted = true;
    } else if (x < 15) {
      assert.ok(close(rgb[0], 0.4) && close(rgb[1], 0.4) && close(rgb[2], 0.4), 'nested tints multiply back to 1');
      seen.nested = true;
    } else if (x < 25) {
      assert.ok(close(rgb[0], 0.4) && close(rgb[2], 0.4) && close(color.getW(i), 2.5), 'glow keeps its colour');
      seen.glow = true;
    } else {
      assert.ok(close(rgb[0], 0.4) && close(rgb[2], 0.4), 'an invalid factor tints nothing');
      seen.invalid = true;
    }
  }
  assert.deepEqual(seen, { tinted: true, nested: true, glow: true, invalid: true });
});

test('builder look(): a blink look writes its phase and rate, unscaled by the frame, and no sway (design 083)', () => {
  const props = createPropBuilder();
  props.at({ x: 0, y: 0, scale: 3 }, () =>
    props.look({ kind: LOOK.blink, rate: 1.5, phase: 0.25, sway: 2 }, () => props.box({ x: 0, y: 0, z0: 0, z1: 2, hw: 1, hh: 1, color: [1, 0, 0, 2.2] }))
  );
  const look = props.build(three).getAttribute('aLook');
  for (let i = 0; i < look.count; i += 1) {
    assert.deepEqual([look.getX(i), look.getY(i), look.getZ(i), look.getW(i)], [7, 0, 0.25, 1.5]);
  }
});

test('builder: shadows are quads round their centres, scaled with the frame, none inside withoutShadows', () => {
  const props = createPropBuilder();
  props.at({ x: 10, y: 0, scale: 2 }, () => props.shadow({ rx: 3, strength: 0.5 }));
  props.withoutShadows(() => props.shadow({ rx: 3 }));
  props.shadow({ rx: 0 });
  assert.equal(props.shadowCount(), 1);
  const geometry = props.buildShadows(three);
  const position = geometry.getAttribute('position');
  const xs = [0, 1, 2, 3].map((i) => position.getX(i));
  assert.ok(close(Math.min(...xs), 4) && close(Math.max(...xs), 16), 'radius 3 scaled by 2 round x 10');
  const corner = geometry.getAttribute('aShadow');
  assert.equal(corner.itemSize, 4);
  assert.ok(close(corner.getZ(0), 0.5));
  assert.equal(geometry.getIndex().count, 6);
});

test('builder feet: an asset placed with at() stands on its own foot; ground: false keeps it off the ground', () => {
  const props = createPropBuilder();
  props.at({ x: 7, y: 8 }, () => props.at({ x: 100 }, () => props.triangle([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 1, 0])));
  props.at({ x: 1, y: 2, ground: false }, () => props.triangle([0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 1, 0]));
  props.triangle([5, 6, 0], [6, 6, 0], [5, 7, 0], [1, 1, 1, 0]);
  const feet = props.build(three).getAttribute('aFoot');
  assert.deepEqual([feet.getX(0), feet.getY(0), feet.getZ(0)], [7, 8, 1], 'the outermost placement is the foot');
  assert.equal(feet.getZ(3), 0);
  assert.deepEqual([feet.getX(6), feet.getY(6), feet.getZ(6)], [5, 6, 0], 'outside a placement each vertex is its own foot');
});
