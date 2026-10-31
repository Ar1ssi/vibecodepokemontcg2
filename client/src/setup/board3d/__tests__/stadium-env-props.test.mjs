import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { LOOK, composeFrames, createPropBuilder, frameOf } from '../stadium-env-props.mjs';
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

test('builder look(): kind, sway, shade and outline ride on every vertex; looks nest and restore', () => {
  const props = createPropBuilder();
  props.look({ kind: LOOK.foliage, sway: 1.5, outline: 1 }, () => {
    props.box({ x: 0, y: 0, z0: 0, z1: 10, hw: 5, hh: 5, color: [1, 0, 0, 0] });
    props.look({ kind: LOOK.gloss }, () => props.box({ x: 20, y: 0, z0: 0, z1: 10, hw: 5, hh: 5, color: [0, 1, 0, 0] }));
  });
  props.box({ x: 40, y: 0, z0: 0, z1: 10, hw: 5, hh: 5, color: [0, 0, 1, 0] });
  const look = props.build(three).getAttribute('aLook');
  const at = (i) => [look.getX(i), look.getY(i), look.getZ(i), look.getW(i)];
  assert.deepEqual(at(0), [LOOK.foliage, 1.5, 1, 1]);
  assert.deepEqual(at(20), [LOOK.gloss, 1.5, 1, 1], 'the inner look keeps the outer sway and outline');
  assert.deepEqual(at(40), [LOOK.plain, 0, 1, 0], 'back to the default after');
});

test('builder: a loose quad never takes the outline unless its look says it closes a solid; a box always does', () => {
  const props = createPropBuilder();
  props.look({ outline: 1 }, () => {
    props.quad([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [1, 1, 1, 0]);
    props.look({ sheets: true }, () => props.quad([0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [1, 1, 1, 0]));
    props.box({ x: 0, y: 0, z0: 0, z1: 1, hw: 1, hh: 1, color: [1, 1, 1, 0] });
  });
  const look = props.build(three).getAttribute('aLook');
  assert.equal(look.getW(0), 0, 'a banner: no outline');
  assert.equal(look.getW(4), 1, 'a roof slope that closes a solid: outlined');
  assert.equal(look.getW(8), 1, "a box's faces: outlined");
});

test("builder: the hull normal is averaged over the outlined vertices at a place, so a box's corner swells out along its diagonal", () => {
  const props = createPropBuilder();
  props.look({ outline: 1 }, () => props.box({ x: 0, y: 0, z0: 0, z1: 2, hw: 1, hh: 1, color: [1, 1, 1, 0] }));
  const geometry = props.build(three);
  const position = geometry.getAttribute('position');
  const hull = geometry.getAttribute('aHull');
  for (let i = 0; i < position.count; i += 1) {
    const length = Math.hypot(hull.getX(i), hull.getY(i), hull.getZ(i));
    assert.ok(close(length, 1, 1e-5), 'unit length');
    // Every hull normal points away from the box's middle.
    const out = [position.getX(i), position.getY(i), position.getZ(i) - 1];
    assert.ok(out[0] * hull.getX(i) + out[1] * hull.getY(i) + out[2] * hull.getZ(i) > 0);
  }
  // The top corner (1, 1, 2): its three faces' normals average to the diagonal.
  for (let i = 0; i < position.count; i += 1) {
    if (close(position.getX(i), 1) && close(position.getY(i), 1) && close(position.getZ(i), 2)) {
      assert.ok(close(hull.getX(i), hull.getY(i), 1e-5) && hull.getX(i) > 0.5 && hull.getZ(i) > 0.5);
    }
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
