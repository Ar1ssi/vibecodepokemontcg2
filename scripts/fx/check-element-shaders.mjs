#!/usr/bin/env node
// Design 077 § Test plan: compile and draw every element kind in a real browser (Chromium on
// SwiftShader, as the fx-preview captures run). Serves client/ on a free port, renders each
// kind's ELEMENT_SAMPLES once its textures load, and fails on a shader or GL error, a console
// error, or a kind that draws no pixel. Usage: node scripts/fx/check-element-shaders.mjs [kind…]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('../../client/', import.meta.url)));
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.html': 'text/html' };
const only = process.argv.slice(2);

const PAGE = `<!doctype html><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"/src/vendor/three/three.module.min.js"}}</script>
<canvas id="c" width="512" height="512"></canvas>
<script type="module">
import * as three from 'three';
import { createElementLayer } from '/src/setup/board3d/fx/elements/element-layer.js';
import { ELEMENT_KINDS, ELEMENT_SAMPLES } from '/src/setup/board3d/fx/elements/index.js';
import { FX_LAYER } from '/src/setup/board3d/fx/fx-layers.mjs';
import { stageToWorldMatrix } from '/src/setup/board3d/fx/fx-stage.mjs';

window.runKind = async (name) => {
  const canvas = document.getElementById('c');
  const renderer = new three.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(512, 512, false);
  const errors = [];
  renderer.debug.onShaderError = (gl, program, vs, fs) => errors.push('shader error: ' + (gl.getProgramInfoLog(program) || '') + (gl.getShaderInfoLog(vs) || '') + (gl.getShaderInfoLog(fs) || ''));
  const scene = new three.Scene();
  const camera = new three.PerspectiveCamera(40, 1, 1, 5000);
  camera.position.set(0, -420, 520);
  camera.lookAt(0, 0, 0);
  camera.layers.set(FX_LAYER);
  const group = new three.Group();
  scene.add(group);
  const layer = createElementLayer({ three, renderer, group, layer: FX_LAYER, kinds: { [name]: ELEMENT_KINDS[name] }, debug: (...a) => errors.push('debug: ' + a.join(' ')) });
  const board = new three.Mesh(new three.PlaneGeometry(900, 900), new three.MeshBasicMaterial({ color: 0x335577 }));
  board.layers.set(0);
  const frame = (t) => {
    layer.begin();
    layer.emitter.live = true;
    for (const params of ELEMENT_SAMPLES[name]()) layer.emitter.emit(name, params);
    layer.finish({ timeSeconds: t, stageToWorld: stageToWorldMatrix(30) });
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    camera.layers.set(0);
    scene.add(board);
    renderer.render(scene, camera);
    scene.remove(board);
    layer.captureBoard();
    renderer.autoClear = false;
    camera.layers.set(FX_LAYER);
    renderer.render(scene, camera);
    renderer.autoClear = true;
  };
  // Let textures arrive (fetch + decode), then draw for real.
  for (let i = 0; i < 30; i += 1) {
    frame(i * 0.1);
    await new Promise((r) => setTimeout(r, 100));
  }
  frame(3.3);
  const gl = renderer.getContext();
  const glError = gl.getError();
  if (glError !== gl.NO_ERROR) errors.push('gl error ' + glError);
  const pixels = new Uint8Array(512 * 512 * 4);
  gl.readPixels(0, 0, 512, 512, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  // The board alone is (51, 85, 119): count pixels the element changed.
  let lit = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (Math.abs(pixels[i] - 51) + Math.abs(pixels[i + 1] - 85) + Math.abs(pixels[i + 2] - 119) > 12) lit += 1;
  }
  const counts = layer.counts();
  layer.dispose();
  renderer.dispose();
  return { errors, lit, counts, png: canvas.toDataURL('image/png') };
};
window.kinds = Object.keys(ELEMENT_KINDS);
window.ready = true;
</script>`;

const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(PAGE);
      return;
    }
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) throw new Error('outside root');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let failed = false;
try {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    // A missing sample texture is part of the check (the fallback path): its 404 is expected.
    if (msg.type() === 'error' && !/missing-texture|404/.test(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
  const kinds = (await page.evaluate(() => window.kinds)).filter((kind) => only.length === 0 || only.includes(kind));
  for (const kind of kinds) {
    const result = await page.evaluate((name) => window.runKind(name), kind);
    const problems = [...result.errors.filter((line) => !line.includes('missing-texture')), ...consoleErrors.splice(0)];
    const ok = problems.length === 0 && result.lit > 0;
    if (!ok) failed = true;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${kind}: ${result.lit} px drawn, queued ${JSON.stringify(result.counts[kind])}`);
    for (const line of problems) console.log(`     ${line}`);
    if (process.env.ELEMENT_SHOTS) {
      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir(process.env.ELEMENT_SHOTS, { recursive: true });
      await writeFile(join(process.env.ELEMENT_SHOTS, `${kind}.png`), Buffer.from(result.png.split(',')[1], 'base64'));
    }
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
