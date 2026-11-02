import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as three from 'three';
import { LOOK, createPropBuilder } from '../stadium-env-props.mjs';
import {
  KIT_LEAVES,
  KIT_LIGHT,
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
  assert.equal(custom.uKitSky.value.x, MOODS.day.sky[0]);
  assert.equal(custom.uKitBounce.value.z, MOODS.day.bounce[2]);
  assert.deepEqual([custom.uKitSheen.value.x, custom.uKitSheen.value.y], MOODS.day.sheen);
  assert.equal(custom.uKitShadow.value.w, MOODS.day.shadow[3]);
  assert.equal(custom.uKitGround.value, 1);
  for (const [name, mood] of Object.entries(MOODS)) {
    assert.deepEqual(Object.keys(mood).sort(), ['bounce', 'key', 'shadow', 'sheen', 'sky'], `${name}: the light's own fields, no outline or rim (design 082)`);
  }
});

test('createKitProps: the shadows and the solid, no outline (design 082); set(null) hides them', () => {
  const made = [];
  const material = (vertexShader, fragmentShader, extra = {}, own = {}) => {
    const m = new three.ShaderMaterial({ vertexShader, fragmentShader, uniforms: own, ...extra });
    made.push(m);
    return m;
  };
  const kit = createKitProps({ three, material, own: { uSun: { value: new three.Vector3(0, 0, 1) } }, glow: 'vec3 kitGlow(vec3 a, vec3 n, vec3 w) { return vec3(0.0); }' });
  assert.equal(kit.objects.length, 2);
  assert.equal(made.length, 2);
  assert.match(made[0].fragmentShader, /kitGlow/);
  const [shadows, props] = kit.objects;
  assert.ok(shadows.renderOrder < props.renderOrder, 'shadows go down before any prop');
  // The shadows multiply the ground under them (colour × shade, alpha kept), over everything drawn so far.
  const shade = shadows.material;
  assert.equal(shade.depthTest, false);
  assert.equal(shade.depthWrite, false);
  assert.equal(shade.blending, three.CustomBlending);
  assert.deepEqual([shade.blendSrc, shade.blendDst, shade.blendSrcAlpha, shade.blendDstAlpha], [three.DstColorFactor, three.ZeroFactor, three.ZeroFactor, three.OneFactor]);
  assert.ok(!shade.transparent && !props.material.transparent, 'both draw before any transparent layer');
  assert.equal(props.material.side, three.DoubleSide);
  const builder = createPropBuilder();
  placeAsset(builder, 'bush', { size: 20 });
  const disposed = [];
  for (const mesh of [props, shadows]) mesh.geometry.addEventListener('dispose', () => disposed.push(mesh.name));
  kit.set(builder);
  assert.deepEqual(disposed.sort(), ['stadium-kit-props', 'stadium-kit-shadows'], 'the geometry it replaces is released');
  assert.ok(props.visible && shadows.visible);
  const built = props.geometry;
  let released = false;
  built.addEventListener('dispose', () => {
    released = true;
  });
  kit.set(null);
  assert.ok(released, 'set(null) releases the builder\'s geometry');
  assert.ok(!props.visible && !shadows.visible);
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

test('kitLight: the kinds by their LOOK numbers; a matte part takes no sheen, only chrome the mirror', () => {
  assert.deepEqual(LOOK, { plain: 0, foliage: 1, gloss: 2, crystal: 3, cloud: 4, chrome: 5, matte: 6, blink: 7 });
  assert.match(KIT_LIGHT, /bool leafy = kind > 0\.5 && kind < 1\.5;/);
  assert.match(KIT_LIGHT, /bool cloud = kind > 3\.5 && kind < 4\.5;/);
  assert.match(KIT_LIGHT, /bool chrome = kind > 4\.5 && kind < 5\.5;/);
  assert.match(KIT_LIGHT, /bool matte = kind > 5\.5;/);
  const guarded = KIT_LIGHT.slice(KIT_LIGHT.indexOf('if (!matte) {'), KIT_LIGHT.indexOf('if (chrome) {'));
  assert.match(guarded, /uKitSheen/, 'the sheen sits inside the matte guard');
  assert.equal(KIT_LIGHT.split('\n').filter((line) => line.includes('uKitSheen')).length, 2, 'and nowhere else');
  assert.doesNotMatch(KIT_LIGHT, /uKitRim|uKitShade|uKitOutline/, 'no toon rim, shade or outline (design 082)');
});

test('kitFragment: a glowing part with the blink look dims and brightens at its own rate and phase; lit parts do not (design 083)', () => {
  const shader = kitFragment();
  assert.match(shader, /if \(vColor\.w >= 1\.5 && vLook\.x > 6\.5 && vLook\.x < 7\.5\) \{/);
  assert.match(shader, /col \*= mix\(0\.18, 1\.0, smoothstep\(-0\.2, 0\.2, sin\(6\.2831853 \* \(uTime \* vLook\.w \+ vLook\.z\)\)\)\);/);
  assert.equal((shader.match(/uniform float uTime;/g) ?? []).length, 1, 'uTime declared once');
});

test('kitPosition: a swaying part takes its phase from its asset\'s foot, so a crown sways as one piece (design 083)', () => {
  assert.match(KIT_VERTEX, /float phase = dot\(aFoot\.xy, vec2\(0\.043, 0\.029\)\) \+ dot\(p\.xy, vec2\(0\.006, 0\.004\)\);/);
});

test('kitFragment: foliage with a leaf size is covered in leaves, faded where they fall under a few px; nothing else is', () => {
  const source = kitFragment();
  assert.match(source, /if \(vLook\.x > 0\.5 && vLook\.x < 1\.5 && vLook\.w > 0\.0\) \{/, 'only foliage with a leaf size');
  // Derivatives are undefined inside the branch: the footprint is taken before it.
  assert.ok(source.indexOf('fwidth(vWorld)') < source.indexOf('if (vLook.x > 0.5'), 'fwidth outside the branch');
  assert.match(KIT_LEAVES, /vec2 kitLeaves\(vec3 p, vec3 n, vec2 outward, float size\)/);
  assert.match(source, /kitLeaves\(vWorld, n, normalize\(vWorld\.xy - vFoot \+ 1e-3\), vLook\.w\)/, 'leaves lie out from the asset\'s foot on a flat top');
});
