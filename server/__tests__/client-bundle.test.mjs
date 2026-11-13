import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import {
  bundleManifestFromMetafile,
  isDeployHost,
  loadClientBundle,
  validateBundleManifest,
  wantsClientBundle,
} from '../client-bundle.mjs';

const MANIFEST = { script: '/dist/app-AAAAAAAA.js', style: '/dist/app-BBBBBBBB.css' };

/** A client folder holding the given dist files; `manifest` is written as given (string = raw). */
const clientDirWith = (t, { manifest, files = [] } = {}) => {
  const clientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'client-bundle-'));
  t.after(() => fs.rmSync(clientDir, { recursive: true, force: true }));
  const distDir = path.join(clientDir, 'dist');
  fs.mkdirSync(distDir);
  for (const file of files) fs.writeFileSync(path.join(distDir, file), '');
  if (manifest !== undefined) {
    const body = typeof manifest === 'string' ? manifest : JSON.stringify(manifest);
    fs.writeFileSync(path.join(distDir, 'manifest.json'), body);
  }
  return clientDir;
};

const load = (clientDir, env) => {
  const warnings = [];
  const bundle = loadClientBundle({ clientDir, env, warn: (message) => warnings.push(message) });
  return { bundle, warnings };
};

test('a deploy host is Render or NODE_ENV=production', () => {
  assert.equal(isDeployHost({ RENDER: 'true' }), true);
  assert.equal(isDeployHost({ NODE_ENV: 'production' }), true);
  assert.equal(isDeployHost({ NODE_ENV: 'development' }), false);
  assert.equal(isDeployHost({}), false);
  assert.equal(isDeployHost(), false);
});

test('CLIENT_BUNDLE overrides the host; unset, only a deploy host serves the bundle', () => {
  assert.equal(wantsClientBundle({}), false);
  assert.equal(wantsClientBundle({ NODE_ENV: 'production' }), true);
  assert.equal(wantsClientBundle({ RENDER: 'true' }), true);
  assert.equal(wantsClientBundle({ CLIENT_BUNDLE: '1' }), true);
  assert.equal(wantsClientBundle({ CLIENT_BUNDLE: 'on' }), true);
  assert.equal(wantsClientBundle({ CLIENT_BUNDLE: '0', NODE_ENV: 'production' }), false);
  assert.equal(wantsClientBundle({ CLIENT_BUNDLE: 'off', RENDER: 'true' }), false);
  // An unreadable value decides nothing.
  assert.equal(wantsClientBundle({ CLIENT_BUNDLE: 'maybe' }), false);
  assert.equal(wantsClientBundle({ CLIENT_BUNDLE: 'maybe', NODE_ENV: 'production' }), true);
});

test('a manifest must name a script and a stylesheet under /dist/', () => {
  assert.deepEqual(validateBundleManifest({ ...MANIFEST, extra: 1 }), MANIFEST);
  assert.equal(validateBundleManifest(null), null);
  assert.equal(validateBundleManifest('x'), null);
  assert.equal(validateBundleManifest({ script: MANIFEST.script }), null);
  assert.equal(validateBundleManifest({ ...MANIFEST, style: '/src/css/index.css' }), null);
  assert.equal(validateBundleManifest({ ...MANIFEST, script: 'https://evil.example/app.js' }), null);
  assert.equal(validateBundleManifest({ ...MANIFEST, script: '/dist/../server/server.js' }), null);
  assert.equal(validateBundleManifest({ ...MANIFEST, script: 7 }), null);
});

test('the manifest names the entry script and stylesheet of a build', () => {
  const outputs = {
    'out/app-AAAAAAAA.js': { entryPoint: 'client/src/front-end.js' },
    'out/app-AAAAAAAA.js.map': {},
    'out/app-BBBBBBBB.css': { entryPoint: 'client/src/css/index.css' },
    'out/app-BBBBBBBB.css.map': {},
  };
  const toUrl = (file) => file.replace('out/', '/dist/');
  assert.deepEqual(bundleManifestFromMetafile({ outputs, toUrl }), MANIFEST);
});

test('a build without an entry script or stylesheet is an error, not an empty manifest', () => {
  const toUrl = (file) => file;
  const scriptOnly = { 'app.js': { entryPoint: 'front-end.js' } };
  assert.throws(() => bundleManifestFromMetafile({ outputs: scriptOnly, toUrl }), /no entry script or no entry stylesheet/);
  assert.throws(() => bundleManifestFromMetafile({ outputs: {}, toUrl }), /no entry script/);
});

test('a complete bundle is served on a deploy host', (t) => {
  const clientDir = clientDirWith(t, { manifest: MANIFEST, files: ['app-AAAAAAAA.js', 'app-BBBBBBBB.css'] });
  const { bundle, warnings } = load(clientDir, { NODE_ENV: 'production' });
  assert.deepEqual(bundle, MANIFEST);
  assert.deepEqual(warnings, []);
});

test('a development machine serves the source even when a bundle exists', (t) => {
  const clientDir = clientDirWith(t, { manifest: MANIFEST, files: ['app-AAAAAAAA.js', 'app-BBBBBBBB.css'] });
  const { bundle, warnings } = load(clientDir, {});
  assert.equal(bundle, null);
  assert.deepEqual(warnings, []);
});

test('no bundle, a broken manifest or a missing file falls back to the source with one warning', (t) => {
  const cases = [
    { name: 'no manifest', dir: clientDirWith(t), warning: /unreadable \(ENOENT\)/ },
    { name: 'not JSON', dir: clientDirWith(t, { manifest: '{' }), warning: /unreadable/ },
    { name: 'wrong shape', dir: clientDirWith(t, { manifest: { script: 'app.js' } }), warning: /malformed/ },
    {
      name: 'stylesheet deleted',
      dir: clientDirWith(t, { manifest: MANIFEST, files: ['app-AAAAAAAA.js'] }),
      warning: /\/dist\/app-BBBBBBBB\.css is missing/,
    },
  ];
  for (const { name, dir, warning } of cases) {
    const { bundle, warnings } = load(dir, { NODE_ENV: 'production' });
    assert.equal(bundle, null, name);
    assert.equal(warnings.length, 1, name);
    assert.match(warnings[0], warning, name);
    assert.match(warnings[0], /pnpm build/, name);
  }
});

// The page template (client/index.ejs) switches on the `clientBundle` local server.js sets.
const templatePath = fileURLToPath(new URL('../../client/index.ejs', import.meta.url));
const renderPage = (locals) =>
  ejs.render(
    fs.readFileSync(templatePath, 'utf8'),
    { importDataJSON: null, e2eAllowed: false, ...locals },
    { filename: templatePath }
  );

test('the page loads the bundle when one is served', () => {
  const html = renderPage({ clientBundle: MANIFEST });
  assert.ok(html.includes('<link rel="stylesheet" href="/dist/app-BBBBBBBB.css">'));
  assert.ok(html.includes('<script type="module" src="/dist/app-AAAAAAAA.js"></script>'));
  assert.ok(!html.includes('src/front-end.js'));
  assert.ok(!html.includes('src/css/index.css'));
});

test('the page loads the source files when no bundle is served', () => {
  for (const html of [renderPage({ clientBundle: null }), renderPage({})]) {
    assert.ok(html.includes('<link rel="stylesheet" href="src/css/index.css">'));
    assert.ok(html.includes('<script type="module" src="src/front-end.js"></script>'));
    assert.ok(!html.includes('/dist/'));
  }
});
