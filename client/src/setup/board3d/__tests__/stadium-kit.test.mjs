import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { createPropBuilder } from '../stadium-env-props.mjs';
import { MOODS, createKitProps, glslColour, kitUniforms, neutralInverse, neutralToneMap, paint } from '../stadium-kit.mjs';
import { placeAsset } from '../stadium-kit-assets.mjs';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('paint: a colour authored as it shows on screen comes back through Neutral tone mapping and sRGB', () => {
  for (const hex of ['#4fad49', '#e6443b', '#f6f4ee', '#1b62b3', '#2b2a33']) {
    const [r, g, b] = paint(hex, 2);
    const shown = neutralToneMap([r, g, b]).map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
    const want = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
    shown.forEach((v, k) => assert.ok(Math.abs(v - want[k]) < 1.5, `${hex} channel ${k}: ${v} vs ${want[k]}`));
  }
  const lit = paint('#808080');
  assert.ok(lit[0] < paint('#808080', 2)[0], 'a lit part is painted darker by the key light it will get');
  assert.equal(lit[3], 0);
  assert.throws(() => paint('green'), /not a #rrggbb colour/);
  assert.match(glslColour('#ffffff'), /^vec3\([0-9.]+, [0-9.]+, [0-9.]+\)$/);
});

test('neutralInverse inverts neutralToneMap over the range a board uses', () => {
  for (const target of [[0.02, 0.05, 0.1], [0.4, 0.3, 0.2], [0.7, 0.75, 0.72]]) {
    const back = neutralToneMap(neutralInverse(target));
    target.forEach((v, k) => assert.ok(close(back[k], v, 1e-4)));
  }
});

test('kitUniforms: a mood by name or object, missing colours from the day; ground off unless asked', () => {
  const night = kitUniforms(three, 'night');
  assert.equal(night.uKitKey.value.x, MOODS.night.key[0]);
  assert.equal(night.uKitGround.value, 0);
  const custom = kitUniforms(three, { key: [0.5, 0.5, 0.5] }, { ground: true });
  assert.equal(custom.uKitKey.value.x, 0.5);
  assert.equal(custom.uKitShade.value.x, MOODS.day.shade[0]);
  assert.equal(custom.uKitGround.value, 1);
  assert.equal(custom.uKitOutline.value.w, MOODS.day.outline[3]);
});

test('createKitProps: shadows, solid and outline over one geometry; set(null) hides them', () => {
  const made = [];
  const material = (vertexShader, fragmentShader, extra = {}, own = {}) => {
    const m = new three.ShaderMaterial({ vertexShader, fragmentShader, uniforms: own, ...extra });
    made.push(m);
    return m;
  };
  const kit = createKitProps({ three, material, own: { uSun: { value: new three.Vector3(0, 0, 1) } }, glow: 'vec3 kitGlow(vec3 a, vec3 n, vec3 w) { return vec3(0.0); }' });
  assert.equal(kit.objects.length, 3);
  assert.equal(made.length, 3);
  assert.match(made[0].fragmentShader, /kitGlow/);
  const [shadows, props, outline] = kit.objects;
  assert.ok(shadows.renderOrder < props.renderOrder, 'shadows go down before any prop');
  const builder = createPropBuilder();
  placeAsset(builder, 'bush', { size: 20 });
  kit.set(builder);
  assert.equal(props.geometry, outline.geometry, 'the outline draws the props geometry');
  assert.ok(props.visible && shadows.visible);
  kit.set(null);
  assert.ok(!props.visible && !outline.visible && !shadows.visible);
});
