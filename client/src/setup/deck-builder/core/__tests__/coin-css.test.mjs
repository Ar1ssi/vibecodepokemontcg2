import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { COIN_MATERIALS } from '../coins.mjs';

// Static contracts for the coin CSS (client/src/css/coin). They guard the
// regressions that made coins look flat or inconsistent: a material with no
// rule in one surface, a layer killed by an undefined variable, and the old
// duplicated effect rules lingering after the move to the shared sheets.
const CSS_DIR = fileURLToPath(new URL('../../../../css/', import.meta.url));
const COIN_DIR = `${CSS_DIR}coin/`;

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const read = (name) =>
  stripComments(readFileSync(`${COIN_DIR}${name}`, 'utf8'));
const readSheet = (name) =>
  stripComments(readFileSync(`${CSS_DIR}${name}`, 'utf8'));
const normalize = (css) => css.replace(/\s+/g, ' ').trim();

test('every catalog material has a stylesheet imported by coin.css', () => {
  const coinEntry = read('coin.css');
  for (const material of COIN_MATERIALS) {
    assert.ok(
      existsSync(`${COIN_DIR}${material}.css`),
      `${material}.css exists`
    );
    assert.match(
      coinEntry,
      new RegExp(`@import url\\('\\./${material}\\.css'\\);`),
      `${material}.css is imported`
    );
  }
  assert.match(coinEntry, /@import url\('\.\/base\.css'\);/);
  assert.match(coinEntry, /@import url\('\.\/finish\.css'\);/);
});

test('base defines the shared geometry, layers and effect tokens', () => {
  const base = normalize(read('base.css'));
  for (const cls of ['coin__env', 'coin__spec', 'coin__holo', 'coin__grain']) {
    assert.ok(base.includes(`.${cls}`), cls);
  }
  for (const token of [
    '--coin-light-x',
    '--coin-light-y',
    '--coin-tilt',
    '--coin-relief',
    '--coin-spec-mask',
    '--coin-env-pan',
    '--coin-grain-opacity',
    '--coin-holo-opacity',
  ]) {
    assert.match(base, new RegExp(`${token}:`), token);
  }
  // the specular layer must be masked by luminance with the add composite
  const spec = base.match(/\.coin__spec \{([^}]*)\}/);
  assert.ok(spec, '.coin__spec rule exists');
  assert.match(spec[1], /mask-mode: luminance;/);
  assert.match(spec[1], /mask-composite: add;/);
});

test('finish.css gives holofoil and mirror coins a foil layer', () => {
  const finish = normalize(read('finish.css'));
  assert.match(
    finish,
    /\[data-coin-finish="holofoil"\] \{[^}]*--coin-holo-opacity:/
  );
  assert.match(
    finish,
    /\[data-coin-finish="mirror"\] \{[^}]*--coin-holo-opacity:/
  );
});

test('preserve-3d is not flattened by filter/isolation/opacity on the flip stack', () => {
  const base = read('base.css');
  for (const selector of ['.coin-3d', '.coin-face', '.coin-toss-wrap']) {
    const rule = base.match(
      new RegExp(`${selector.replace('.', '\\.')} \\{([^}]*)\\}`)
    );
    assert.ok(rule, `${selector} rule exists`);
    assert.doesNotMatch(
      rule[1],
      /(^|;)\s*(filter|isolation|opacity)\s*:/,
      selector
    );
  }
});

test('material and finish sheets only reference defined custom properties', () => {
  const defined = new Set(['--coin-relief']);
  for (const name of ['base.css']) {
    for (const [, prop] of read(name).matchAll(/(--coin-[\w-]+)\s*:/g)) {
      defined.add(prop);
    }
  }
  for (const file of [...COIN_MATERIALS.map((m) => `${m}.css`), 'finish.css']) {
    const css = read(file);
    for (const [, ref, tail] of css.matchAll(
      /var\(\s*(--coin-[\w-]+)\s*([,)])/g
    )) {
      // defined in base, or the reference carries its own fallback (a trailing
      // comma); anything else is a typo that would silently kill the layer
      if (defined.has(ref) || tail === ',') continue;
      assert.fail(`${file} references undefined ${ref} without a fallback`);
    }
  }
});

test('picker and mat stop carrying the old duplicated coin effect rules', () => {
  const index = readSheet('index.css');
  assert.doesNotMatch(index, /\.coin-face::after/);
  assert.doesNotMatch(index, /\.coin-mat-gold \.coin-face/);
  assert.doesNotMatch(index, /@keyframes coin-toss-arc/);

  const mat = readSheet('mat-coin.css');
  assert.doesNotMatch(mat, /\.coin-face/);
  assert.doesNotMatch(mat, /\.coin-mat-/);
  assert.doesNotMatch(mat, /@keyframes coin-toss-arc/);
});

test('both coin surfaces import the shared coin sheet', () => {
  for (const sheet of ['index.css', 'mat-coin.css']) {
    assert.match(
      readSheet(sheet),
      /@import url\('\.\/coin\/coin\.css'\);/,
      sheet
    );
  }
});
