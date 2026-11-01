// Design 082: every shader the Stadium boards build declares every name it uses before it uses it.
// GLSL rejects a call to an undeclared function even inside a function nobody calls, so a chunk
// that calls another chunk (the ground kit's cloverGrass, the kit's kitLeaves) must come with it;
// the "whole program" tests (brackets, one main) cannot see that. The check builds every board
// through createStadiumEnvironment on a stub renderer, collects each ShaderMaterial it makes and
// walks each program's tokens: a name must be a GLSL type, keyword or built-in, or declared earlier
// (globally, or as a parameter or local of the function it is in). Scoping is lenient (a local
// counts from its declaration to the end of its function), so it finds undeclared names, not shadowing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realThree from 'three';
import { flatLayout } from '../board-layout.mjs';
import { getMatLayout } from '../../sizing/mat-layouts.mjs';
import { NO_MAT_LAYOUT_ID } from '../../sizing/mat-spec.mjs';
import { ENVIRONMENT_KEYS } from '../stadium-environment-layout.mjs';
import { INTRO_MS, createStadiumEnvironment } from '../stadium-environment-mesh.js';
import { createStadiumCardShadows } from '../stadium-card-shadows.js';

const TYPES = new Set(
  'void float int uint bool vec2 vec3 vec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 bvec2 bvec3 bvec4 mat2 mat3 mat4 sampler2D sampler3D samplerCube'.split(' ')
);
const KEYWORDS = new Set(
  'if else for while do return break continue discard uniform varying attribute const in out inout struct precision highp mediump lowp true false switch case default'.split(' ')
);
const BUILTINS = new Set(
  (
    'radians degrees sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh pow exp log exp2 log2 sqrt inversesqrt abs sign ' +
    'floor trunc round roundEven ceil fract mod modf min max clamp mix step smoothstep isnan isinf floatBitsToInt length distance ' +
    'dot cross normalize faceforward reflect refract matrixCompMult outerProduct transpose determinant inverse lessThan lessThanEqual ' +
    'greaterThan greaterThanEqual equal notEqual any all not textureSize texture textureLod texelFetch textureGrad dFdx dFdy fwidth ' +
    'texture2D textureCube main gl_FragColor gl_FragCoord gl_FrontFacing gl_Position gl_PointSize gl_PointCoord gl_VertexID ' +
    'gl_InstanceID position normal uv color modelMatrix modelViewMatrix projectionMatrix viewMatrix normalMatrix cameraPosition ' +
    'isOrthographic instanceMatrix linearToOutputTexel toneMapping sRGBTransferOETF'
  ).split(' ')
);

/** Every ShaderMaterial every board makes, as { board, material }. */
function boardShaders() {
  const captured = [];
  let board = 'shared';
  class Capturing extends realThree.ShaderMaterial {
    constructor(parameters) {
      super(parameters);
      captured.push({ board, material: this });
    }
  }
  const three = { ...realThree, ShaderMaterial: Capturing };
  let target = null;
  const renderer = {
    extensions: { has: () => true },
    compile: () => {},
    shadowMap: { autoUpdate: true },
    getRenderTarget: () => target,
    setRenderTarget: (next) => {
      target = next;
    },
    render: () => {},
    getPixelRatio: () => 1,
    getDrawingBufferSize: (out) => out.set(1920, 1080),
    getClearAlpha: () => 1,
    getClearColor: (colour) => colour,
    setClearColor: () => {},
  };
  const layout = flatLayout(getMatLayout(NO_MAT_LAYOUT_ID), { w: 1449.6, h: 540 });
  for (const key of ENVIRONMENT_KEYS) {
    board = key;
    const environment = createStadiumEnvironment({ three, renderer, parent: new realThree.Group(), isHidden: () => true });
    const camera = new realThree.PerspectiveCamera();
    environment.setLayout(layout);
    environment.setKey(key);
    environment.update(1000, camera);
    environment.update(3000 + INTRO_MS + 400, camera);
    environment.drawPlate(new realThree.Scene(), camera);
    environment.dispose();
  }
  return captured;
}

const strip = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/^\s*#.*$/gm, (line) => (line.trim().startsWith('#define') ? line : ' '));

/** The names a GLSL program uses before (or without) declaring them. */
export function undeclaredNames(source) {
  const text = strip(source);
  const tokens = [...text.matchAll(/[A-Za-z_]\w*|\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|\S/g)].map((match) => match[0]);
  const declared = new Set();
  const structs = new Set();
  const missing = new Set();
  let depth = 0;
  let locals = null;
  const isName = (token) => Boolean(token) && /^[A-Za-z_]/.test(token);
  const isType = (token) => TYPES.has(token) || structs.has(token);
  for (let k = 0; k < tokens.length; k += 1) {
    const token = tokens[k];
    const before = tokens[k - 1];
    const after = tokens[k + 1];
    if (token === '{') {
      depth += 1;
      continue;
    }
    if (token === '}') {
      depth -= 1;
      if (depth === 0) locals = null;
      continue;
    }
    if (!isName(token) || before === '.') continue;
    if (token === 'struct') {
      structs.add(after);
      declared.add(after);
      k += 1;
      continue;
    }
    if (isType(token)) {
      if (!isName(after) || KEYWORDS.has(after)) continue;
      if (tokens[k + 2] === '(' && depth === 0) {
        // A function: its name, then its parameters until the closing bracket.
        declared.add(after);
        locals = new Set();
        let j = k + 3;
        for (; j < tokens.length && tokens[j] !== ')'; j += 1) {
          if (isType(tokens[j]) && isName(tokens[j + 1])) locals.add(tokens[j + 1]);
        }
        k = j;
        continue;
      }
      const scope = depth === 0 ? declared : (locals ?? declared);
      scope.add(after);
      // More declarators in the same statement, comma separated at bracket depth 0.
      let nested = 0;
      for (let j = k + 2; j < tokens.length && !(tokens[j] === ';' && nested === 0); j += 1) {
        if (tokens[j] === '(' || tokens[j] === '[') nested += 1;
        else if (tokens[j] === ')' || tokens[j] === ']') nested -= 1;
        else if (tokens[j] === ',' && nested === 0 && isName(tokens[j + 1])) scope.add(tokens[j + 1]);
      }
      k += 1;
      continue;
    }
    if (KEYWORDS.has(token) || BUILTINS.has(token)) continue;
    if (token === 'define') {
      declared.add(after);
      continue;
    }
    if (declared.has(token) || locals?.has(token)) continue;
    missing.add(token);
  }
  return [...missing];
}

test('undeclaredNames finds a call to a function the program never defines, and passes one it does', () => {
  assert.deepEqual(undeclaredNames('float f(float x) { return x * 2.0; }\nvoid main() { float y = f(1.0); }'), []);
  assert.deepEqual(undeclaredNames('vec3 g(vec2 p) { return cloverGrass(p, vec3(1.0), 0.0); }\nvoid main() {}'), ['cloverGrass']);
  assert.deepEqual(undeclaredNames('uniform float uA;\nvoid main() { float b = uA + uB; }'), ['uB']);
});

test('every Stadium board shader declares every name it uses before it uses it', () => {
  const problems = [];
  const seen = new Set();
  for (const { board, material } of boardShaders()) {
    for (const [stage, source] of [
      ['vertex', material.vertexShader],
      ['fragment', material.fragmentShader],
    ]) {
      if (seen.has(source)) continue;
      seen.add(source);
      const missing = undeclaredNames(source);
      if (missing.length) problems.push(`${board} ${stage}: ${missing.join(', ')}`);
    }
  }
  assert.ok(seen.size > 100, `every board's programs were collected (${seen.size})`);
  assert.deepEqual(problems, []);
});

test('the cards\' contact shadow on a Stadium declares every name it uses (with the cutout it carries)', () => {
  let target = null;
  const renderer = {
    extensions: { has: () => true },
    compile: () => {},
    shadowMap: { autoUpdate: true },
    getRenderTarget: () => target,
    setRenderTarget: (next) => {
      target = next;
    },
    render: () => {},
    getPixelRatio: () => 1,
    getDrawingBufferSize: (out) => out.set(1920, 1080),
  };
  const environment = createStadiumEnvironment({ three: realThree, renderer, parent: new realThree.Group(), isHidden: () => true });
  const shadows = createStadiumCardShadows({ three: realThree, parent: new realThree.Group(), cutout: environment.cutout });
  const [, contacts] = shadows.meshes();
  assert.deepEqual(undeclaredNames(contacts.material.vertexShader), []);
  assert.deepEqual(undeclaredNames(contacts.material.fragmentShader), []);
  shadows.dispose();
  environment.dispose();
});
