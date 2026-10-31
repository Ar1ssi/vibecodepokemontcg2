import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { LOOK, createPropBuilder } from '../stadium-env-props.mjs';
import {
  KIT_LIGHT,
  KIT_OUTLINE_FRAGMENT,
  KIT_OUTLINE_VERTEX,
  KIT_SHADOW_FRAGMENT,
  KIT_SHADOW_VERTEX,
  KIT_VERTEX,
  MOODS,
  createKitProps,
  glslColour,
  kitFragment,
  kitUniforms,
  neutralInverse,
  neutralToneMap,
  paint,
} from '../stadium-kit.mjs';
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
  // The shadows multiply the ground under them (colour × shade, alpha kept), over everything drawn so far.
  const shade = shadows.material;
  assert.equal(shade.depthTest, false);
  assert.equal(shade.depthWrite, false);
  assert.equal(shade.blending, three.CustomBlending);
  assert.deepEqual([shade.blendSrc, shade.blendDst, shade.blendSrcAlpha, shade.blendDstAlpha], [three.DstColorFactor, three.ZeroFactor, three.ZeroFactor, three.OneFactor]);
  assert.ok(!shade.transparent && !props.material.transparent && !outline.material.transparent, 'all three draw before any transparent layer');
  assert.equal(outline.material.side, three.BackSide, 'the outline is the hull\'s back faces');
  assert.equal(props.material.side, three.DoubleSide);
  const builder = createPropBuilder();
  placeAsset(builder, 'bush', { size: 20 });
  const disposed = [];
  for (const mesh of [props, shadows]) mesh.geometry.addEventListener('dispose', () => disposed.push(mesh.name));
  kit.set(builder);
  assert.deepEqual(disposed.sort(), ['stadium-kit-props', 'stadium-kit-shadows'], 'the geometry it replaces is released');
  assert.equal(props.geometry, outline.geometry, 'the outline draws the props geometry');
  assert.ok(props.visible && shadows.visible);
  const built = props.geometry;
  let released = false;
  built.addEventListener('dispose', () => {
    released = true;
  });
  kit.set(null);
  assert.ok(released, 'set(null) releases the builder\'s geometry');
  assert.ok(!props.visible && !outline.visible && !shadows.visible);
  kit.set(createPropBuilder());
  assert.ok(!props.visible && !shadows.visible, 'an empty builder shows nothing');
});

test('every kit shader is a full program: one main, balanced brackets, no unfilled template, no reserved word as a name', () => {
  const reserved = /\b(?:float|int|bool|vec[234]|mat[234])\s+(?:flat|smooth|half|sample|patch|noperspective|input|output|active|filter|common|partition|fixed|long|short|in|out|inout|buffer|shared|texture|round|step)\b/;
  const glow = 'vec3 kitGlow(vec3 a, vec3 n, vec3 w) { return vec3(0.0); }';
  const shaders = {
    KIT_VERTEX,
    kitFragment: kitFragment(),
    kitFragmentGlow: kitFragment('vec3(1.0)', glow),
    KIT_OUTLINE_VERTEX,
    KIT_OUTLINE_FRAGMENT,
    KIT_SHADOW_VERTEX,
    KIT_SHADOW_FRAGMENT,
  };
  for (const [name, source] of Object.entries(shaders)) {
    assert.equal(source.match(/void main\(\)/g)?.length, 1, name);
    for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
      assert.equal(source.split(open).length, source.split(close).length, `${name} ${open}${close}`);
    }
    assert.ok(!source.includes('${'), `${name} has no unfilled template`);
    assert.doesNotMatch(source, reserved, name);
  }
  assert.match(shaders.kitFragmentGlow, /col \+= kitGlow\(/);
  assert.doesNotMatch(shaders.kitFragment, /kitGlow/);
});

test('kitLight: the kinds by their LOOK numbers; a matte part takes no rim or glint, only chrome the mirror', () => {
  assert.deepEqual(LOOK, { plain: 0, foliage: 1, gloss: 2, crystal: 3, cloud: 4, chrome: 5, matte: 6 });
  assert.match(KIT_LIGHT, /bool kitCloud = kind > 3\.5 && kind < 4\.5;/);
  assert.match(KIT_LIGHT, /bool kitChrome = kind > 4\.5 && kind < 5\.5;/);
  assert.match(KIT_LIGHT, /bool kitMatte = kind > 5\.5;/);
  const guarded = KIT_LIGHT.slice(KIT_LIGHT.indexOf('if (!kitMatte) {'), KIT_LIGHT.indexOf('if (kitChrome) {'));
  assert.match(guarded, /uKitRim/, 'the rim sits inside the matte guard');
  assert.match(guarded, /glint/, 'and the glint');
  assert.equal(KIT_LIGHT.split('\n').filter((line) => line.includes('uKitRim')).length, 1, 'no rim anywhere else');
});
