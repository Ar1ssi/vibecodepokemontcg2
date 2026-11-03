// Cards on a Stadium cast their shadows on its ground (stadium-card-shadows.js): a catcher for the
// key light's shadows and a soft contact shadow under every card and pile, in the Stadium's tint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { CONTACT_MARGIN, CONTACT_SHIFT, MAX_CONTACTS, contactPlacements, createStadiumCardShadows } from '../stadium-card-shadows.js';
import { MIN_SUN_RISE, risenSun } from '../table-mesh.js';
import { CUTOUT_GLSL } from '../stadium-environment-glsl.mjs';

const cutout = () => ({
  glsl: CUTOUT_GLSL,
  uniforms: {
    uMin: { value: new three.Vector2() },
    uSize: { value: new three.Vector2(1, 1) },
    uOrigin: { value: new three.Vector2() },
    uReveal: { value: 1 },
    uExit: { value: 0 },
    uCutoutOn: { value: 1 },
    uUnderOn: { value: 0 },
    uUnderMin: { value: new three.Vector2() },
    uUnderSize: { value: new three.Vector2() },
    uTableFromWorld: { value: new three.Matrix4() },
  },
});
const DAY = { sun: [0.6, 0.0, 0.8], shadow: [0.42, 0.47, 0.62, 0.62] };
const card = (x, y, extra = {}) => ({ x, y, yawDeg: 0, widthPx: 100, heightPx: 140, ...extra });
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('contactPlacements: each card grown by its margin, shifted away from the sun, turned with it', () => {
  const [p] = contactPlacements([card(10, 20, { yawDeg: 90 })], DAY.sun);
  assert.ok(close(p.x, 10 - CONTACT_SHIFT * 100) && close(p.y, 20), 'shifted away from a sun in +x');
  assert.ok(close(p.w, 100 + 2 * CONTACT_MARGIN * 100) && close(p.h, 140 + 2 * CONTACT_MARGIN * 100));
  assert.equal(p.cardW, 100);
  assert.equal(p.cardH, 140);
  assert.ok(close(p.yaw, -Math.PI / 2), 'clockwise yaw, as the card mesh turns');
  const [overhead] = contactPlacements([card(5, 5)], [0, 0, 1]);
  assert.ok(close(overhead.x, 5) && close(overhead.y, 5), 'a sun straight overhead: no shift');
});

test('contactPlacements: bad footprints skipped, at most MAX_CONTACTS', () => {
  const bad = [null, card(NaN, 0), card(0, 0, { widthPx: 0 }), card(0, 0, { heightPx: -1 })];
  assert.deepEqual(contactPlacements(bad, DAY.sun), []);
  assert.deepEqual(contactPlacements(undefined, DAY.sun), []);
  const many = Array.from({ length: MAX_CONTACTS + 20 }, (_, i) => card(i, 0));
  assert.equal(contactPlacements(many, DAY.sun).length, MAX_CONTACTS);
});

test('update: hidden without a Stadium; with one, the catcher and a contact under each card in its tint', () => {
  const parent = new three.Group();
  const shadows = createStadiumCardShadows({ three, parent, cutout: cutout() });
  const [catcher, contacts] = shadows.meshes();
  assert.equal(shadows.update({ lighting: null, footprints: [card(0, 0)] }), false);
  assert.equal(catcher.visible, false);
  assert.equal(contacts.visible, false);
  assert.equal(shadows.contactCount(), 0);

  assert.equal(shadows.update({ lighting: DAY, footprints: [card(0, 0), card(200, 0), null] }), true);
  assert.equal(catcher.visible, true);
  assert.equal(catcher.receiveShadow, true, 'it takes the key light\'s shadows');
  assert.deepEqual(catcher.material.color.toArray().map((v) => +v.toFixed(3)), [0.42, 0.47, 0.62]);
  assert.ok(close(catcher.material.opacity, 0.62 * 0.8));
  assert.equal(catcher.material.blending, three.MultiplyBlending);
  assert.equal(catcher.material.premultipliedAlpha, true);
  assert.equal(contacts.visible, true);
  assert.equal(shadows.contactCount(), 2);
  const at = new three.Matrix4();
  contacts.getMatrixAt(1, at);
  const position = new three.Vector3().setFromMatrixPosition(at);
  assert.ok(close(position.x, 200 - CONTACT_SHIFT * 100) && close(position.y, 0), 'the second card\'s shadow, off its sunward side');
  assert.equal(contacts.geometry.getAttribute('aCard').getX(1), 100);

  assert.equal(shadows.update({ lighting: { sun: [0, 0, 1], shadow: [1, 1, NaN, 1] }, footprints: [card(0, 0)] }), false, 'a bad tint hides them');
  shadows.dispose();
  assert.equal(parent.children.length, 0);
});

test('setBounds: the catcher spans the table and a little past it, over the cloth', () => {
  const shadows = createStadiumCardShadows({ three, parent: new three.Group(), cutout: cutout() });
  const [catcher] = shadows.meshes();
  shadows.setBounds({ x: -500, y: 0, w: 1000, h: 600 });
  assert.deepEqual(catcher.scale.toArray(), [1200, 720, 1]);
  assert.deepEqual(catcher.position.toArray(), [0, 300, 0.2]);
  shadows.setBounds(null);
  assert.deepEqual(catcher.scale.toArray(), [1, 1, 1]);
});

test('both draw only where the Stadium shows (the cloth takes its own shadows elsewhere)', () => {
  const cut = cutout();
  const shadows = createStadiumCardShadows({ three, parent: new three.Group(), cutout: cut });
  const [catcher, contacts] = shadows.meshes();
  const shader = { uniforms: {}, vertexShader: three.ShaderLib.shadow.vertexShader, fragmentShader: three.ShaderLib.shadow.fragmentShader };
  catcher.material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /void main\(\) \{\n\tif \(environmentShown\(vTablePos\) < 0\.5\) discard;/);
  assert.match(shader.vertexShader, /vTablePos = \(uTableFromWorld \* modelMatrix \* vec4\(transformed, 1\.0\)\)\.xy;/);
  assert.equal(shader.uniforms.uCutoutOn, cut.uniforms.uCutoutOn, 'the cutout\'s own uniforms, shared');
  assert.match(contacts.material.fragmentShader, /if \(environmentShown\(vTablePos\) < 0\.5\) discard;/);
  assert.equal(contacts.material.uniforms.uReveal, cut.uniforms.uReveal);
});

test('risenSun: a low sun raised to MIN_SUN_RISE, its heading kept; a high one only made unit', () => {
  const low = risenSun([0.7128, 0.5346, 0.2]);
  assert.ok(close(low[2], MIN_SUN_RISE));
  assert.ok(close(Math.hypot(...low), 1));
  assert.ok(close(Math.atan2(low[1], low[0]), Math.atan2(0.5346, 0.7128)), 'same heading');
  const high = risenSun([0, 3, 4]);
  assert.deepEqual(high.map((v) => +v.toFixed(6)), [0, 0.6, 0.8]);
  assert.equal(risenSun([0, 0, 0]), null);
  assert.deepEqual(risenSun([0, 0, -2]), [0, 0, 1], 'straight below: no heading, so straight overhead');
});
