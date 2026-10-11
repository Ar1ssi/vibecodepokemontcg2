// Design 068: the WebGL2 stage TCG Live's attack-impact prefabs play on. One canvas over the
// viewport, one context for every effect. Each frame an effect's particle systems are stepped
// (impact-sim.mjs), turned into vertices (impact-geometry.mjs) and drawn with the game's own
// shaders (translated at import) in the game's draw order, through the game's board camera.
//
// Colour is the game's linear pipeline: sRGB textures decode on sample, everything blends in
// an sRGB framebuffer, and one resolve pass writes the premultiplied result to the canvas.
// The clock of an effect is a WAAPI animation (D103 / D118), so frozen-time capture works.
import { fxDisabled } from '../../../image-logic/mat-fx.mjs';
import { loadCardArt, loadImpactAssets, loadedImpactAssets } from './impact-assets.js';
import { boundsCentre, drawOrder } from './impact-draw-order.mjs';
import { boardCamera, buildGeometry, buildTrailGeometry } from './impact-geometry.mjs';
import { DEG, mat4Compose, mat4Mul, quatAxisAngle, topDownViewProjection } from './impact-math.mjs';
import { createEffect } from './impact-sim.mjs';

/** The game's board camera (design 067: FOV 20°, 183 units above the board, looking straight down). */
const CAMERA_HEIGHT = 183;
const CAMERA_FOV_DEG = 20;
const CAMERA_NEAR = 1;
const CAMERA_FAR = 1000;
/**
 * An attack FX event keeps world scale 1 (`FXController.CreateFXEvent`), so a prefab's units are
 * the board's. The game's Active card stands this tall in them: its mesh (`Card.obj`, 8.9 units,
 * design 067) times the Active slot mover's world scale (level6 `board_active_player/Active`, 1.615).
 */
const GAME_ACTIVE_CARD_UNITS = 8.9 * 1.615;
/** The game's Bench card against its Active card (design 068 S5): a `_C` prefab is sized for it. */
const GAME_BENCH_CARD_SCALE = 0.7;
const MAX_PIXEL_RATIO = 1.5;
const GROUND_HALF_SIZE = 2000;
const VIEW_HEIGHT_UNITS = 2 * CAMERA_HEIGHT * Math.tan((CAMERA_FOV_DEG * DEG) / 2);
const GRAB = '#grab';
// Unity's default textures by name: what a sampler with nothing bound reads (RGBA bytes).
const DEFAULT_TEXELS = { '#white': [255, 255, 255, 255], '#black': [0, 0, 0, 0], '#gray': [128, 128, 128, 128], '#bump': [128, 128, 255, 128], '#red': [255, 0, 0, 0] };
// Unity BlendMode values.
const BLEND_ONE = 1;
const BLEND_SRC_ALPHA = 5;
const BLEND_ONE_MINUS_SRC_ALPHA = 10;
const CULL_OFF = 0;
const CULL_FRONT = 1;

const UTILITY_VS = `#version 300 es
precision highp float;
in vec4 aPosition;
in vec2 aUv;
uniform mat4 uMatrix;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = uMatrix * aPosition;
}`;
// uMode 0: resolve to the canvas (encode sRGB); 1: copy; 2: coverage (alpha in every channel);
// 3: opaque white (a card's coverage).
const UTILITY_FS = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform int uMode;
in vec2 vUv;
out vec4 fragColor;
vec3 encode(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  if (uMode == 3) { fragColor = vec4(1.0); return; }
  vec4 c = texture(uTexture, vUv);
  if (uMode == 0) fragColor = vec4(encode(c.rgb), c.a);
  else if (uMode == 2) fragColor = vec4(c.a);
  else fragColor = c;
}`;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const FULLSCREEN = new Float32Array([-1, -1, 0, 1, 0, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1]);
const FULLSCREEN_FLIPPED = new Float32Array([-1, -1, 0, 1, 0, 1, 1, -1, 0, 1, 1, 1, -1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0]);

let stage = null;
let stageFailed = false;
const brokenTypes = new Set();
const warned = new Set();

const warnOnce = (key, ...detail) => {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn('attack impact FX:', key, ...detail);
};

const compile = (gl, type, source, label) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`${label}: ${log}`);
  }
  return shader;
};

const link = (gl, vertexSource, fragmentSource, label) => {
  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource, `${label} (vertex)`);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label} (fragment)`);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`${label}: ${log}`);
  }
  return program;
};

/** Unity blend factors → the premultiplied blend that keeps coverage in alpha (design 068 O5). */
const blendFor = (gl, blend) => {
  if (blend.src === BLEND_SRC_ALPHA && blend.dst === BLEND_ONE_MINUS_SRC_ALPHA) return [gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA];
  if (blend.src === BLEND_ONE && blend.dst === BLEND_ONE_MINUS_SRC_ALPHA) return [gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA];
  if (blend.src === BLEND_ONE && blend.dst === BLEND_ONE) return [gl.ONE, gl.ONE, gl.ZERO, gl.ONE];
  if (blend.src === BLEND_SRC_ALPHA && blend.dst === BLEND_ONE) return [gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE];
  throw new Error(`unsupported blend ${blend.src} / ${blend.dst}`);
};

const createTarget = (gl, width, height, internalFormat, withDepth) => {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  let depth = null;
  if (withDepth) {
    depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  }
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete');
  return { texture, framebuffer, depth };
};

const deleteTarget = (gl, target) => {
  if (!target) return;
  gl.deleteTexture(target.texture);
  gl.deleteFramebuffer(target.framebuffer);
  if (target.depth) gl.deleteRenderbuffer(target.depth);
};

const WRAPS = (gl) => [gl.REPEAT, gl.CLAMP_TO_EDGE, gl.MIRRORED_REPEAT, gl.CLAMP_TO_EDGE];

function createStage() {
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-overlay fx-impact-stage';
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  const next = {
    canvas,
    gl,
    effects: [],
    programs: new Map(),
    textures: new Map(),
    materials: new Map(),
    frame: 0,
    targets: null,
    utility: null,
    buffers: null,
    lost: false,
  };
  const program = link(gl, UTILITY_VS, UTILITY_FS, 'utility');
  next.utility = {
    program,
    position: gl.getAttribLocation(program, 'aPosition'),
    uv: gl.getAttribLocation(program, 'aUv'),
    matrix: gl.getUniformLocation(program, 'uMatrix'),
    texture: gl.getUniformLocation(program, 'uTexture'),
    mode: gl.getUniformLocation(program, 'uMode'),
    buffer: gl.createBuffer(),
  };
  next.buffers = { position: gl.createBuffer(), normal: gl.createBuffer(), color: gl.createBuffer(), texcoords: [0, 1, 2, 3].map(() => gl.createBuffer()), index: gl.createBuffer() };
  for (const [name, texel] of Object.entries(DEFAULT_TEXELS)) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Unity's gray is an sRGB texture; the others read the same either way.
    gl.texImage2D(gl.TEXTURE_2D, 0, name === '#gray' ? gl.SRGB8_ALPHA8 : gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(texel));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    next.textures.set(name, texture);
  }
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    next.lost = true;
    discardStage(next);
  });
  canvas.style.display = 'none';
  document.body.appendChild(canvas);
  return next;
}

function discardStage(target) {
  for (const effect of target.effects) effect.clock.cancel();
  target.effects = [];
  cancelAnimationFrame(target.frame);
  target.canvas.remove();
  if (stage === target) stage = null;
}

function ensureStage() {
  if (stage || stageFailed) return stage;
  if (typeof document === 'undefined') return null;
  try {
    stage = createStage();
  } catch (error) {
    warnOnce('the WebGL stage could not be built', error);
    stage = null;
  }
  if (!stage) stageFailed = true;
  return stage;
}

function programFor(assets, shaderIndex) {
  const { gl } = stage;
  if (stage.programs.has(shaderIndex)) return stage.programs.get(shaderIndex);
  const shader = assets.shaders[shaderIndex];
  const build = (fragmentSource) => {
    const program = link(gl, shader.vs, fragmentSource, shader.name);
    return {
      program,
      attributes: Object.fromEntries(shader.attributes.map((attribute) => [`${attribute.semantic}${attribute.index}`, gl.getAttribLocation(program, attribute.attribute)])),
      vertexBuffers: shader.buffers.v.map((buffer) => gl.getUniformLocation(program, buffer.uniform)),
      fragmentBuffers: shader.buffers.f.map((buffer) => gl.getUniformLocation(program, buffer.uniform)),
      samplers: shader.textures.map((texture) => gl.getUniformLocation(program, texture.uniform)),
      targetHeight: gl.getUniformLocation(program, 'uTargetHeight'),
    };
  };
  const entry = { shader, blend: blendFor(gl, shader.blend), color: build(shader.fs), coverage: null };
  // A GrabPass shader draws twice: its colour, then how much of the card it covers (see drawItem).
  if (shader.grab) entry.coverage = build(shader.fs.replace('  fragColor = o0;', '  fragColor = vec4(0.0, 0.0, 0.0, o0.r * o0.a);'));
  stage.programs.set(shaderIndex, entry);
  return entry;
}

function textureFor(assets, name) {
  const { gl } = stage;
  if (stage.textures.has(name)) return stage.textures.get(name);
  const entry = assets.textures[name];
  const image = assets.images.get(name);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, entry.srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
  const filter = entry.filter === 0 ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, WRAPS(gl)[entry.wrapU] ?? gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, WRAPS(gl)[entry.wrapV] ?? gl.REPEAT);
  stage.textures.set(name, texture);
  return texture;
}

/** A type's materials with their GPU resources: programs linked, textures uploaded. */
function materialsFor(type, assets) {
  if (stage.materials.has(type)) return stage.materials.get(type);
  const materials = assets.file.materials.map((material) => ({
    name: material.n,
    queue: material.queue,
    entry: programFor(assets, material.shader),
    vertexData: material.v.map((data) => new Float32Array(data)),
    fragmentData: material.f.map((data) => new Float32Array(data)),
    textures: material.tex.map((name) => (name === GRAB ? GRAB : name.startsWith('#') ? stage.textures.get(name) : textureFor(assets, name))),
  }));
  stage.materials.set(type, materials);
  return materials;
}

function resizeTargets() {
  const { gl, canvas } = stage;
  const ratio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(window.innerWidth * ratio));
  const height = Math.max(1, Math.round(window.innerHeight * ratio));
  if (stage.targets && canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
  for (const target of Object.values(stage.targets ?? {})) deleteTarget(gl, target);
  stage.targets = {
    scene: createTarget(gl, width, height, gl.SRGB8_ALPHA8, true),
    grab: createTarget(gl, width, height, gl.SRGB8_ALPHA8, false),
    coverage: createTarget(gl, width, height, gl.RGBA8, false),
  };
}

function drawUtility({ vertices, matrix = IDENTITY, texture = null, mode }) {
  const { gl, utility } = stage;
  gl.useProgram(utility.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, utility.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(utility.position);
  gl.vertexAttribPointer(utility.position, 4, gl.FLOAT, false, 24, 0);
  if (utility.uv >= 0) {
    gl.enableVertexAttribArray(utility.uv);
    gl.vertexAttribPointer(utility.uv, 2, gl.FLOAT, false, 24, 16);
  }
  gl.uniformMatrix4fv(utility.matrix, false, matrix);
  gl.uniform1i(utility.mode, mode);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture ?? stage.textures.get('#white'));
  gl.uniform1i(utility.texture, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertices.length / 6);
  gl.disableVertexAttribArray(utility.position);
  if (utility.uv >= 0) gl.disableVertexAttribArray(utility.uv);
}

/** The board the game's particles sink into: depth only, so what dips below the card is hidden. */
function drawGround(effect) {
  const { gl } = stage;
  const s = GROUND_HALF_SIZE;
  gl.colorMask(false, false, false, false);
  gl.depthMask(true);
  gl.depthFunc(gl.ALWAYS);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  drawUtility({ vertices: new Float32Array([-s, 0, -s, 1, 0, 0, s, 0, -s, 1, 0, 0, -s, 0, s, 1, 0, 0, s, 0, s, 1, 0, 0]), matrix: effect.viewProjection, mode: 3 });
  gl.colorMask(true, true, true, true);
  gl.depthMask(false);
  gl.depthFunc(gl.LEQUAL);
}

/** The card's art as clip-space vertices, upside down (the grab texture is read top row first). */
function cardQuad(effect) {
  const { rect, turn } = effect;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const cos = Math.cos(turn * DEG);
  const sin = Math.sin(turn * DEG);
  const corner = (x, y, u, v) => {
    const px = cx + x * cos - y * sin;
    const py = cy + x * sin + y * cos;
    return [(px / width) * 2 - 1, (py / height) * 2 - 1, 0, 1, u, v];
  };
  const w = rect.width / 2;
  const h = rect.height / 2;
  return new Float32Array([...corner(-w, h, 0, 0), ...corner(w, h, 1, 0), ...corner(-w, -h, 0, 1), ...corner(w, -h, 1, 1)]);
}

/**
 * What a GrabPass shader reads as "the screen": the card's art under everything drawn so far,
 * top row first as Direct3D has it, plus the same picture's coverage.
 */
function captureGrab(effect) {
  const { gl, targets } = stage;
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  for (const [target, artMode, sceneMode] of [[targets.grab, 1, 1], [targets.coverage, 3, 2]]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);
    if (effect.art) drawUtility({ vertices: cardQuad(effect), texture: effect.art, mode: artMode });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    drawUtility({ vertices: FULLSCREEN_FLIPPED, texture: targets.scene.texture, mode: sceneMode });
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, targets.scene.framebuffer);
  gl.enable(gl.DEPTH_TEST);
}

function bindAttribute(location, buffer, data, size, fallback) {
  const { gl } = stage;
  if (location === undefined || location < 0) return;
  if (!data) {
    gl.disableVertexAttribArray(location);
    gl.vertexAttrib4f(location, ...fallback);
    return;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
}

const WHITE = [1, 1, 1, 1];
const ZERO = [0, 0, 0, 0];

function uploadUniforms(program, material, effect, shaderBuffers, grabTexture) {
  const { gl } = stage;
  const patch = (data, dynamic) => {
    for (const { at, kind } of dynamic) {
      if (kind === 'time') data.set([effect.shaderTime / 20, effect.shaderTime, effect.shaderTime * 2, effect.shaderTime * 3], at);
      else if (kind === 'viewProjection') data.set(effect.viewProjection, at);
      else if (kind === 'cameraPosition') data.set(effect.camera.position, at);
      else if (kind === 'projection') data.set([1, CAMERA_NEAR, CAMERA_FAR, 1 / CAMERA_FAR], at);
    }
    return data;
  };
  material.vertexData.forEach((data, index) => {
    if (program.vertexBuffers[index]) gl.uniform4fv(program.vertexBuffers[index], patch(data, shaderBuffers.v[index].dynamic));
  });
  material.fragmentData.forEach((data, index) => {
    if (program.fragmentBuffers[index]) gl.uniform4fv(program.fragmentBuffers[index], patch(data, shaderBuffers.f[index].dynamic));
  });
  material.textures.forEach((texture, index) => {
    if (!program.samplers[index]) return;
    gl.activeTexture(gl.TEXTURE0 + index);
    gl.bindTexture(gl.TEXTURE_2D, texture === GRAB ? grabTexture : texture);
    gl.uniform1i(program.samplers[index], index);
  });
  if (program.targetHeight) gl.uniform1f(program.targetHeight, stage.canvas.height);
}

function drawGeometry(program, geometry) {
  const { gl, buffers } = stage;
  bindAttribute(program.attributes.POSITION0, buffers.position, geometry.position, 3, ZERO);
  bindAttribute(program.attributes.NORMAL0, buffers.normal, geometry.normal, 3, ZERO);
  bindAttribute(program.attributes.TANGENT0, null, null, 4, ZERO);
  bindAttribute(program.attributes.COLOR0, buffers.color, geometry.color, 4, WHITE);
  for (let index = 0; index < 4; index += 1) {
    const texcoord = geometry.texcoords[index];
    bindAttribute(program.attributes[`TEXCOORD${index}`], buffers.texcoords[index], texcoord?.data ?? null, texcoord?.size ?? 4, ZERO);
  }
  bindAttribute(program.attributes.TEXCOORD4, null, null, 4, ZERO);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.DYNAMIC_DRAW);
  gl.drawElements(gl.TRIANGLES, geometry.indexCount, geometry.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
}

function drawItem(effect, item) {
  const { gl, targets } = stage;
  const { material, geometry } = item;
  const { entry } = material;
  const cull = entry.shader.cull;
  if (cull === CULL_OFF) gl.disable(gl.CULL_FACE);
  else {
    gl.enable(gl.CULL_FACE);
    gl.cullFace(cull === CULL_FRONT ? gl.FRONT : gl.BACK);
  }
  gl.enable(gl.BLEND);
  if (!entry.shader.grab) {
    gl.blendFuncSeparate(...entry.blend);
    gl.useProgram(entry.color.program);
    uploadUniforms(entry.color, material, effect, entry.shader.buffers, null);
    drawGeometry(entry.color, geometry);
    return;
  }
  // The shader's colour is the bent picture: it replaces what is under it by its alpha. The
  // second pass does the same for coverage, so bent card art hides the card it came from.
  captureGrab(effect);
  gl.colorMask(true, true, true, false);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(entry.color.program);
  uploadUniforms(entry.color, material, effect, entry.shader.buffers, targets.grab.texture);
  drawGeometry(entry.color, geometry);
  gl.colorMask(false, false, false, true);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(entry.coverage.program);
  uploadUniforms(entry.coverage, material, effect, entry.shader.buffers, targets.coverage.texture);
  drawGeometry(entry.coverage, geometry);
  gl.colorMask(true, true, true, true);
}

function drawEffect(effect) {
  const { gl } = stage;
  gl.clear(gl.DEPTH_BUFFER_BIT);
  drawGround(effect);
  const items = [];
  for (const system of effect.simulation.systems) {
    const { renderer } = system;
    if (!renderer || system.particles.length === 0) continue;
    const centre = boundsCentre(system);
    const geometry = buildGeometry(system, effect.camera, renderer.mesh ? effect.assets.meshes[renderer.mesh] : null);
    if (geometry) items.push({ queue: effect.materials[renderer.mat].queue, order: renderer.order, fudge: renderer.fudge, centre, geometry, material: effect.materials[renderer.mat] });
    const trail = renderer.trailMat === undefined ? null : buildTrailGeometry(system, effect.camera);
    if (trail) items.push({ queue: effect.materials[renderer.trailMat].queue, order: renderer.order, fudge: renderer.fudge, centre, geometry: trail, material: effect.materials[renderer.trailMat] });
  }
  for (const item of drawOrder(items, effect.camera.position)) drawItem(effect, item);
}

/** Where the game's camera puts the effect on our canvas: its view-projection matrix. */
function placeEffect(effect) {
  const { rect, bench } = effect;
  const unitPx = rect.height / (GAME_ACTIVE_CARD_UNITS * (bench ? GAME_BENCH_CARD_SCALE : 1));
  const viewPx = VIEW_HEIGHT_UNITS * unitPx;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const post = new Float32Array(16);
  post[0] = viewPx / width;
  post[5] = viewPx / height;
  post[10] = 1;
  post[15] = 1;
  post[12] = ((rect.left + rect.width / 2) / width) * 2 - 1;
  post[13] = 1 - ((rect.top + rect.height / 2) / height) * 2;
  const camera = topDownViewProjection({ target: [0, 0, 0], height: CAMERA_HEIGHT, fovDeg: CAMERA_FOV_DEG, aspect: 1, near: CAMERA_NEAR, far: CAMERA_FAR });
  effect.viewProjection = mat4Mul(post, camera);
}

function renderFrame() {
  const target = stage;
  if (!target || target.lost) return;
  const { gl } = target;
  target.effects = target.effects.filter((effect) => effect.clock.playState !== 'finished' && effect.clock.playState !== 'idle');
  if (target.effects.length === 0) {
    target.canvas.style.display = 'none';
    return;
  }
  resizeTargets();
  gl.viewport(0, 0, target.canvas.width, target.canvas.height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.targets.scene.framebuffer);
  gl.clearColor(0, 0, 0, 0);
  gl.clearDepth(1);
  gl.depthMask(true);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.frontFace(gl.CW);
  for (const effect of target.effects) {
    const seconds = (Number(effect.clock.currentTime) || 0) / 1000;
    effect.simulation.advanceTo(seconds);
    effect.shaderTime = effect.timeOffset + effect.simulation.time;
    placeEffect(effect);
    try {
      drawEffect(effect);
    } catch (error) {
      // One bad material must not take the frame loop down: this effect ends, the rest play on.
      warnOnce(`${effect.type} impact stopped`, error);
      effect.clock.cancel();
    }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
  gl.clear(gl.COLOR_BUFFER_BIT);
  drawUtility({ vertices: FULLSCREEN, texture: target.targets.scene.texture, mode: 0 });
  target.frame = requestAnimationFrame(renderFrame);
}

/** True when a type can play right now: assets decoded, WebGL2 up, its shaders linked. */
export function impactReady(type) {
  return Boolean(stage && !stage.lost && !brokenTypes.has(type) && stage.materials.has(type) && loadedImpactAssets(type));
}

/**
 * Load a type's assets and link its shaders ahead of the hit. Resolves true when `impactReady`.
 * Never rejects: a failed load or shader leaves today's hit dressing in place.
 * @param {string} type a TCG type id
 */
export async function prepareImpact(type) {
  if (!type || brokenTypes.has(type) || fxDisabled()) return false;
  if (impactReady(type)) return true;
  if (!ensureStage()) return false;
  let assets;
  try {
    assets = await loadImpactAssets(type);
  } catch (error) {
    warnOnce(`${type} assets did not load`, error);
    return false;
  }
  if (!ensureStage()) return false;
  try {
    materialsFor(type, assets);
  } catch (error) {
    brokenTypes.add(type);
    warnOnce(`${type} shaders did not link`, error);
    return false;
  }
  return true;
}

/**
 * Play one impact prefab on a card.
 * @param {{type: string, variant: string, rect: {left:number, top:number, width:number, height:number},
 *   bench?: boolean, turn?: number, cardSrc?: string|null, seed?: number}} options
 *   `variant` is a prefab key ('Small', 'Medium_C', …); `turn` the card's board rotation in
 *   degrees; `cardSrc` the card's art, bent by the refraction materials.
 * @returns {{durationMs: number, clock: Animation}|null} null when it cannot play (not ready, effects off)
 */
export function playImpact({ type, variant, rect, bench = false, turn = 0, cardSrc = null, seed = 1 }) {
  if (fxDisabled() || !impactReady(type) || !rect || !(rect.height > 1)) return null;
  const assets = loadedImpactAssets(type);
  const prefab = assets.file.prefabs[variant];
  if (!prefab) return null;
  const rotation = quatAxisAngle([0, 1, 0], turn * DEG);
  const simulation = createEffect(prefab, { seed, rootMatrix: mat4Compose([0, 0, 0], rotation, [1, 1, 1]), rootRotation: rotation });
  const durationMs = Math.ceil(simulation.duration * 1000);
  stage.canvas.style.display = '';
  const effect = {
    type,
    assets,
    materials: stage.materials.get(type),
    simulation,
    camera: boardCamera({ target: [0, 0, 0], height: CAMERA_HEIGHT, fovDeg: CAMERA_FOV_DEG }),
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    bench,
    turn,
    art: null,
    timeOffset: seed % 97,
    shaderTime: 0,
    viewProjection: null,
    clock: stage.canvas.animate([{ opacity: 1 }, { opacity: 1 }], { duration: durationMs, fill: 'forwards' }),
  };
  const host = stage;
  loadCardArt(cardSrc).then((bitmap) => {
    if (!bitmap || stage !== host || !host.effects.includes(effect)) return;
    const { gl } = host;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    effect.art = texture;
    effect.clock.finished.then(() => gl.deleteTexture(texture), () => gl.deleteTexture(texture));
  });
  const idle = stage.effects.length === 0;
  stage.effects.push(effect);
  if (idle) stage.frame = requestAnimationFrame(renderFrame);
  return { durationMs, clock: effect.clock };
}
