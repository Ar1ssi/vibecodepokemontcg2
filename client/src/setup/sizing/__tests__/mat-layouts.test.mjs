import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_MAT_LAYOUT_ID,
  MAT_LAYOUTS,
  classifyMatLayout,
  getMatLayout,
  layoutToCssVars,
  listMatLayouts,
  resolveMatLayout,
} from '../mat-layouts.mjs';

const ZONES = [
  'hand',
  'bench',
  'active',
  'prizes',
  'deck',
  'discard',
  'lostZone',
  'stadium',
];

test('every layout profile defines all board zones', () => {
  for (const [id, layout] of Object.entries(MAT_LAYOUTS)) {
    assert.equal(layout.id, id);
    for (const zone of ZONES) {
      assert.ok(layout.zones[zone], `${id} is missing the ${zone} zone`);
    }
  }
});

test('the default profile is the simulator board', () => {
  assert.equal(DEFAULT_MAT_LAYOUT_ID, 'sim');
  assert.equal(getMatLayout('sim').id, 'sim');
});

test('unknown layout ids fall back to the default profile', () => {
  assert.equal(getMatLayout('nope').id, DEFAULT_MAT_LAYOUT_ID);
  assert.equal(getMatLayout(undefined).id, DEFAULT_MAT_LAYOUT_ID);
});

test('full-size mats are classified as two-player sheets', () => {
  assert.equal(
    classifyMatLayout('Rubber Playmat Full size Showdown! Mega Rayquaza'),
    'two-player'
  );
  assert.equal(classifyMatLayout('Rubber Playmat Full Size Mew'), 'two-player');
  assert.equal(classifyMatLayout('Official Playmat Blue'), 'two-player');
});

test('ordinary and half mats are classified as one-player sheets', () => {
  assert.equal(classifyMatLayout('Rubber Playmat Mega Rayquaza'), 'one-player');
  assert.equal(classifyMatLayout('Half Playmat Cynthia'), 'one-player');
  assert.equal(classifyMatLayout('BW Durable Playmat'), 'one-player');
});

test('an unusable title falls back to the default profile', () => {
  assert.equal(classifyMatLayout(''), DEFAULT_MAT_LAYOUT_ID);
  assert.equal(classifyMatLayout(undefined), DEFAULT_MAT_LAYOUT_ID);
  assert.equal(classifyMatLayout('Deck Box'), DEFAULT_MAT_LAYOUT_ID);
});

test('resolveMatLayout honours an explicit override over the title guess', () => {
  const mat = { title: 'Rubber Playmat Full size Mew', layout: 'one-player' };
  assert.equal(resolveMatLayout(mat).id, 'one-player');
});

test('resolveMatLayout ignores an override that names no real profile', () => {
  const mat = { title: 'Rubber Playmat Full size Mew', layout: 'bogus' };
  assert.equal(resolveMatLayout(mat).id, 'two-player');
});

test('resolveMatLayout accepts a bare layout id or nothing at all', () => {
  assert.equal(resolveMatLayout('two-player').id, 'two-player');
  assert.equal(resolveMatLayout(null).id, DEFAULT_MAT_LAYOUT_ID);
});

test('layoutToCssVars emits a value for every zone property', () => {
  const vars = layoutToCssVars(getMatLayout('two-player'));
  for (const name of [
    '--hand-height',
    '--bench-bottom',
    '--bench-left',
    '--bench-width',
    '--bench-height',
    '--bench-gap',
    '--active-bottom',
    '--active-left',
    '--active-width',
    '--active-height',
    '--prizes-bottom',
    '--prizes-left',
    '--prizes-width',
    '--prizes-height',
    '--deck-bottom',
    '--deck-right',
    '--deck-width',
    '--deck-height',
    '--discard-bottom',
    '--discard-right',
    '--discard-width',
    '--discard-height',
    '--lost-zone-bottom',
    '--lost-zone-left',
    '--lost-zone-width',
    '--lost-zone-height',
    '--stadium-bottom',
    '--stadium-left',
    '--stadium-width',
    '--stadium-height',
    '--mat-fit',
  ]) {
    assert.ok(vars[name], `expected ${name} to be set`);
    assert.equal(typeof vars[name], 'string');
  }
});

test('prize columns drive the printed prize grid width', () => {
  const twoWide = layoutToCssVars({
    zones: { prizes: { columns: 2 } },
  });
  assert.equal(twoWide['--prizes-columns'], '2');
  assert.equal(twoWide['--prizes-card-max-width'], 'calc(50% - .1vw)');

  const singleColumn = layoutToCssVars({
    zones: { prizes: { columns: 1 } },
  });
  assert.equal(singleColumn['--prizes-columns'], '1');
  assert.equal(singleColumn['--prizes-card-max-width'], 'calc(100% - .1vw)');
});

test('layoutToCssVars accepts a layout id as well as a profile object', () => {
  assert.deepEqual(
    layoutToCssVars('one-player'),
    layoutToCssVars(getMatLayout('one-player'))
  );
});

test('the sim profile keeps the stylesheet defaults it replaced', () => {
  const vars = layoutToCssVars(getMatLayout('sim'));
  assert.equal(vars['--bench-left'], '20%');
  assert.equal(vars['--bench-width'], '60%');
  assert.equal(vars['--bench-height'], '28%');
  assert.equal(vars['--active-height'], '32%');
  assert.equal(vars['--hand-height'], '32%');
});

test('each profile is offered to the picker exactly once', () => {
  const listed = listMatLayouts();
  assert.equal(listed.length, Object.keys(MAT_LAYOUTS).length);
  assert.deepEqual(
    listed.map((entry) => entry.id),
    ['sim', 'one-player', 'two-player']
  );
  for (const entry of listed) {
    assert.ok(entry.label, `${entry.id} needs a label`);
  }
});

// The profiles are only useful if the stylesheets actually read them, so the
// contract between this module and the container CSS is asserted directly:
// a variable that nothing consumes, or a zone rule left hardcoded, silently
// breaks mat fitting without failing anything else.
const readCss = (name) =>
  readFileSync(
    fileURLToPath(new URL(`../../../css/${name}`, import.meta.url)),
    'utf8'
  );

const CONTAINER_CSS = {
  'self-containers.css': readCss('self-containers.css'),
  'opp-containers.css': readCss('opp-containers.css'),
};

// The card zones live in the playmat iframes; the stadium and the mat image
// itself are painted by the parent page, so they are not expected here.
const PARENT_OWNED = /^--(stadium|mat)-/;

test('both container stylesheets consume every zone variable', () => {
  const emitted = Object.keys(layoutToCssVars(getMatLayout('sim'))).filter(
    (name) => !PARENT_OWNED.test(name) && name !== '--prizes-columns'
  );

  for (const [file, css] of Object.entries(CONTAINER_CSS)) {
    for (const name of emitted) {
      assert.ok(
        css.includes(`var(${name}`),
        `${file} never reads ${name}`
      );
    }
  }
});

test('container stylesheet defaults match the sim profile', () => {
  const vars = layoutToCssVars(getMatLayout('sim'));

  for (const [file, css] of Object.entries(CONTAINER_CSS)) {
    const root = css.match(/:root\s*\{([^}]*)\}/);
    assert.ok(root, `${file} has no :root defaults block`);

    const declared = new Map(
      [...root[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [
        name,
        value.trim(),
      ])
    );

    for (const [name, value] of Object.entries(vars)) {
      if (PARENT_OWNED.test(name) || name === '--prizes-columns') continue;
      assert.equal(
        declared.get(name),
        value,
        `${file} default for ${name} has drifted from the sim profile`
      );
    }
  }
});

test('no card zone is still positioned by a hardcoded percentage', () => {
  const zoneRule =
    /^#(bench|active|prizes|deckCover|discardCover|lostZoneCover|hand)\s*\{([^}]*)\}/gm;

  // The hand is a strip pinned across the player's near edge on every mat, so
  // its origin and width are structural rather than mat-dependent; only its
  // height changes with the layout.
  const structural = { hand: new Set(['bottom', 'left', 'width']) };

  for (const [file, css] of Object.entries(CONTAINER_CSS)) {
    for (const [, zone, body] of css.matchAll(zoneRule)) {
      for (const [, property, value] of body.matchAll(
        /(bottom|left|right|width|height|gap)\s*:\s*([^;]+);/g
      )) {
        if (structural[zone]?.has(property)) continue;
        assert.ok(
          value.includes('var(--'),
          `${file}: #${zone} still hardcodes ${property}: ${value.trim()}`
        );
      }
    }
  }
});

test('zone rectangles stay inside their own half of the board', () => {
  const percent = (value) =>
    typeof value === 'string' && value.endsWith('%')
      ? Number.parseFloat(value)
      : null;

  for (const [id, layout] of Object.entries(MAT_LAYOUTS)) {
    for (const zone of ZONES) {
      const rect = layout.zones[zone];
      const bottom = percent(rect.bottom);
      const height = percent(rect.height);
      if (bottom !== null && height !== null) {
        assert.ok(
          bottom + height <= 100,
          `${id}/${zone} overflows the top of its half`
        );
      }

      const near = percent(rect.left) ?? percent(rect.right);
      const width = percent(rect.width);
      if (near !== null && width !== null) {
        assert.ok(
          near + width <= 100,
          `${id}/${zone} overflows the side of its half`
        );
      }
    }
  }
});
