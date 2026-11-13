import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildClient, fileForServedUrl, servedUrlFor } from '../build-client.mjs';
import { IMMUTABLE_CACHE_CONTROL, staticFileCacheControl } from '../../server/cache-policy.mjs';
import { validateBundleManifest } from '../../server/client-bundle.mjs';

const tempDir = (t, prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

/** Writes `files` (relative path → text) under a new temp root and returns the root. */
const fixtureRoot = (t, files) => {
  const root = tempDir(t, 'build-client-fixture-');
  for (const [relative, text] of Object.entries(files)) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return root;
};

const FIXTURE = {
  'client/src/front-end.js': [
    "import { shared } from '/shared/thing.mjs';",
    "import { REVISION } from 'three';",
    "import { local } from './local.js';",
    "export const assetBase = new URL('./assets/', import.meta.url).href;",
    "export const lazy = () => import('./lazy.js');",
    'console.log(shared, REVISION, local);',
  ].join('\n'),
  'client/src/local.js': "export const local = 'local-marker';",
  'client/src/lazy.js': "export const lazyValue = 'lazy-marker';",
  'client/src/vendor/three/three.module.min.js': "export const REVISION = 'three-marker';",
  'shared/thing.mjs': "export const shared = 'shared-marker';",
  'client/src/css/index.css': [
    "@import url('./holo/part.css');",
    '.a { background: url(../assets/a.png); }',
    '.b { background: url(/src/assets/b.png); }',
    ".c { background: url('data:image/gif;base64,R0lGODlhAQABAAAAACw='); }",
  ].join('\n'),
  'client/src/css/holo/part.css': '.h { --grain: url(../../assets/holo/grain.webp?v=2#x); }',
};

const read = (outDir, url) => fs.readFileSync(path.join(outDir, path.basename(url)), 'utf8');

test('a source file maps to the URL the server serves it at, and back', () => {
  const root = path.resolve('/repo');
  assert.equal(servedUrlFor(path.join(root, 'client', 'src', 'front-end.js'), root), '/src/front-end.js');
  assert.equal(servedUrlFor(path.join(root, 'shared', 'engine', 'commands.mjs'), root), '/shared/engine/commands.mjs');
  assert.equal(servedUrlFor(path.join(root, 'server', 'server.js'), root), null);
  assert.equal(servedUrlFor(path.join(root, 'client'), root), null);
  assert.equal(fileForServedUrl('/shared/engine/commands.mjs', root), path.join(root, 'shared', 'engine', 'commands.mjs'));
  assert.equal(fileForServedUrl('/src/front-end.js', root), path.join(root, 'client', 'src', 'front-end.js'));
  assert.equal(fileForServedUrl('/api/x', root), null);
});

test('the bundle is one hashed script and one hashed stylesheet, named by the manifest', async (t) => {
  const rootDir = fixtureRoot(t, FIXTURE);
  const { manifest, outDir, files, warnings } = await buildClient({ rootDir, minify: false });
  assert.deepEqual(warnings, []);
  assert.equal(outDir, path.join(rootDir, 'client', 'dist'));
  assert.match(manifest.script, /^\/dist\/app-[0-9A-Z]{8}\.js$/);
  assert.match(manifest.style, /^\/dist\/app-[0-9A-Z]{8}\.css$/);
  // The server's cache policy and manifest check must recognize what the build names.
  assert.equal(staticFileCacheControl(manifest.script), IMMUTABLE_CACHE_CONTROL);
  assert.equal(staticFileCacheControl(manifest.style), IMMUTABLE_CACHE_CONTROL);
  assert.equal(staticFileCacheControl(`${manifest.script}.map`), IMMUTABLE_CACHE_CONTROL);
  const written = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
  assert.deepEqual(validateBundleManifest(written), manifest);
  assert.deepEqual(
    files.map(({ file }) => file).sort(),
    [path.basename(manifest.style), path.basename(manifest.script), 'manifest.json'].sort()
  );
  assert.ok(files.every(({ bytes }) => bytes > 0));
});

test('root-absolute imports, three and lazy imports all land in the one script', async (t) => {
  const rootDir = fixtureRoot(t, FIXTURE);
  const { manifest, outDir } = await buildClient({ rootDir, minify: false });
  const script = read(outDir, manifest.script);
  for (const marker of ['shared-marker', 'three-marker', 'local-marker', 'lazy-marker']) {
    assert.ok(script.includes(marker), marker);
  }
  assert.ok(!/\bimport\(/.test(script), 'no import() is left for the browser to resolve');
});

test('import.meta.url keeps pointing at the module’s unbundled URL', async (t) => {
  const rootDir = fixtureRoot(t, FIXTURE);
  const { manifest, outDir } = await buildClient({ rootDir, minify: false });
  const script = read(outDir, manifest.script);
  assert.ok(!script.includes('import.meta'));
  assert.ok(script.includes('new URL("/src/front-end.js", location.href).href'));
});

test('stylesheets are inlined and their url()s made root-absolute', async (t) => {
  const rootDir = fixtureRoot(t, FIXTURE);
  const { manifest, outDir } = await buildClient({ rootDir, minify: false });
  const style = read(outDir, manifest.style);
  assert.ok(!style.includes('@import'));
  assert.match(style, /url\("?\/src\/assets\/a\.png"?\)/);
  assert.match(style, /url\("?\/src\/assets\/b\.png"?\)/);
  assert.match(style, /url\("?\/src\/assets\/holo\/grain\.webp\?v=2#x"?\)/);
  assert.ok(style.includes('data:image/gif;base64,R0lGODlhAQABAAAAACw='));
  assert.ok(!/url\([^)]*\.\.\//.test(style), 'no url() is left relative to a source folder');
});

test('a changed source file changes the file name, an unchanged one keeps it', async (t) => {
  const rootDir = fixtureRoot(t, FIXTURE);
  const first = (await buildClient({ rootDir })).manifest;
  assert.deepEqual((await buildClient({ rootDir })).manifest, first);
  fs.writeFileSync(path.join(rootDir, 'client/src/local.js'), "export const local = 'edited';");
  const second = (await buildClient({ rootDir })).manifest;
  assert.notEqual(second.script, first.script);
  assert.equal(second.style, first.style);
  assert.ok(!fs.existsSync(path.join(rootDir, 'client', 'dist', path.basename(first.script))), 'the old script is removed');
});

test('a url() outside the served folders or a missing import fails the build', async (t) => {
  const outside = fixtureRoot(t, {
    ...FIXTURE,
    'client/src/css/index.css': '.a { background: url(../../../secret.png); }',
  });
  await assert.rejects(buildClient({ rootDir: outside }), /outside the served folders/);
  const missing = fixtureRoot(t, {
    ...FIXTURE,
    'client/src/front-end.js': "import '/shared/nope.mjs';",
  });
  await assert.rejects(buildClient({ rootDir: missing }), /nope\.mjs/);
});

test('a failed build leaves the previous bundle whole and served', async (t) => {
  const rootDir = fixtureRoot(t, FIXTURE);
  const { manifest, outDir } = await buildClient({ rootDir });
  fs.writeFileSync(path.join(rootDir, 'client/src/local.js'), "import './gone.js';");
  await assert.rejects(buildClient({ rootDir }), /gone\.js/);
  const kept = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
  assert.deepEqual(kept, manifest);
  assert.ok(fs.existsSync(path.join(outDir, path.basename(manifest.script))));
  assert.ok(fs.existsSync(path.join(outDir, path.basename(manifest.style))));
});

test('a build clears whatever else was in the output folder', async (t) => {
  const rootDir = fixtureRoot(t, FIXTURE);
  const distDir = path.join(rootDir, 'client', 'dist');
  fs.mkdirSync(path.join(distDir, 'old-folder'), { recursive: true });
  fs.writeFileSync(path.join(distDir, 'app-OLDOLDOL.js'), 'stale');
  fs.writeFileSync(path.join(distDir, 'app-OLDOLDOL.js.map'), 'stale');
  const { manifest } = await buildClient({ rootDir });
  const script = path.basename(manifest.script);
  const style = path.basename(manifest.style);
  assert.deepEqual(
    fs.readdirSync(distDir).sort(),
    [script, `${script}.map`, style, `${style}.map`, 'manifest.json'].sort()
  );
});

test('a checkout that lives under /src or /shared still builds', async (t) => {
  const base = tempDir(t, 'build-client-nested-');
  const rootDir = path.join(base, 'src', 'shared', 'repo');
  for (const [relative, text] of Object.entries(FIXTURE)) {
    const file = path.join(rootDir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  const { manifest, outDir } = await buildClient({ rootDir, minify: false });
  assert.ok(read(outDir, manifest.script).includes('shared-marker'));
});

test('a stylesheet rule esbuild cannot parse is reported as a warning', async (t) => {
  const rootDir = fixtureRoot(t, {
    ...FIXTURE,
    'client/src/css/index.css': ".chip[data-action->'rename']:hover { color: red; }",
  });
  const { warnings } = await buildClient({ rootDir });
  assert.equal(warnings.length > 0, true);
  assert.match(warnings[0], /index\.css:1:\d+: /);
});

// The real client. A computed `import(path)` or an unparsable CSS rule works unbundled and breaks
// only on the deployed site, so the build of the actual source is checked here.
test('the real client bundles clean: no warnings, no import the browser cannot resolve', async (t) => {
  const outDir = tempDir(t, 'build-client-real-');
  const { manifest, warnings } = await buildClient({ outDir, minify: false });
  assert.deepEqual(warnings, []);
  const script = read(outDir, manifest.script);
  assert.ok(!script.includes('import.meta'), 'import.meta survives only where the plugin cannot map the file');
  const runtimeImports = [...script.matchAll(/\bimport\(([^\n]{0,160})/g)].map((match) => match[1]);
  const allowed = [
    // Guarded by an is-node check (catalog-loader.mjs).
    /^"node:fs\/promises"\)/,
    // Box and set data, fetched unbundled from next to box-data.mjs.
    /^new URL\(path, new URL\("\/src\/setup\/deck-builder\/core\/build-battle\/box-data\.mjs", location\.href\)\.href\)\.href\)/,
  ];
  for (const found of runtimeImports) {
    assert.ok(allowed.some((pattern) => pattern.test(found)), `import(${found}`);
  }
  assert.equal(runtimeImports.length, allowed.length);
});
