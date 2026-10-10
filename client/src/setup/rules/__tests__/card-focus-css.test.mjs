import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  FLIGHT_MS,
  FLIGHT_EASE,
  EXPAND_MS,
  EXPAND_EASE,
  COLLAPSE_MS,
  COLLAPSE_EASE,
} from '../card-focus-geometry.mjs';

// Static contracts for design 067, in the style of card-inspector-css.test.mjs: no jsdom in this
// repo, so the stylesheet text is the thing under test. They guard the ways the focus view silently
// stops working: dimming by opacity on the card (flattens its 3D tilt, ghosts the print), timings
// drifting from the geometry module, and the hand rule landing where the hand never sees it.

const CSS_DIR = fileURLToPath(new URL('../../../css/', import.meta.url));
const read = (name) => readFileSync(`${CSS_DIR}${name}`, 'utf8');

const normalize = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
const ruleBody = (css, selector) => {
  for (const match of normalize(css).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = match[1].split(',').map((part) => part.trim());
    if (selectors.includes(selector)) return match[2];
  }
  return null;
};

const FOCUS_CSS = read('card-focus.css');
const INDEX_CSS = read('index.css');
const SELF_CSS = read('self-containers.css');
const focus = (selector) => ruleBody(FOCUS_CSS, selector);

describe('067 — card-focus.css', () => {
  it('is imported by index.css', () => {
    assert.match(INDEX_CSS, /@import url\('\.\/card-focus\.css'\);/);
  });

  it('.card-focus sits at the popup layer (z-index 2400, above the playmat iframes)', () => {
    const decls = focus('.card-focus');
    assert.ok(decls, '.card-focus is missing');
    assert.match(decls, /position: fixed;/);
    assert.match(decls, /z-index: 2400;/);
  });

  // 013 C2, restated for the new surface: an opacity on the card flattens its preserve-3d tilt
  // (STATE watch-out) and lets the print under its panels show through.
  for (const selector of ['.card-focus__stage', '.card-focus__card']) {
    it(`${selector} declares no opacity`, () => {
      const decls = focus(selector);
      assert.ok(decls, `${selector} is missing`);
      assert.doesNotMatch(decls, /(^|[;\s])opacity\s*:/i);
    });
  }

  it('the card casts its lift shadow with box-shadow, never a filter that would flatten the tilt', () => {
    const decls = focus('.card-focus__card');
    assert.match(decls, /box-shadow:/);
    assert.match(decls, /transform-style: preserve-3d;/);
    assert.doesNotMatch(decls, /(^|[;\s])filter\s*:/i);
  });

  it('the stage takes its perspective from JS, not a hardcoded length', () => {
    assert.doesNotMatch(focus('.card-focus__stage'), /(^|[;\s])perspective\s*:/i);
  });

  it('the timing defaults equal the geometry module constants (single source of truth)', () => {
    const decls = focus('.card-focus');
    for (const [name, value] of [
      ['--focus-flight-ms', `${FLIGHT_MS}ms`],
      ['--focus-flight-ease', FLIGHT_EASE],
      ['--focus-expand-ms', `${EXPAND_MS}ms`],
      ['--focus-expand-ease', EXPAND_EASE],
      ['--focus-collapse-ms', `${COLLAPSE_MS}ms`],
      ['--focus-collapse-ease', COLLAPSE_EASE],
    ]) {
      assert.ok(decls.includes(`${name}: ${value};`), `${name} should be ${value}`);
    }
  });

  it('registers --focus-reveal so the Web Animation can tween it', () => {
    assert.match(
      normalize(FOCUS_CSS),
      /@property --focus-reveal { syntax: '<percentage>'; inherits: true; initial-value: 100%; }/
    );
  });

  it('the list reveal is a clip-path on the chrome, driven by --focus-reveal', () => {
    const decls = focus('.card-focus__card--revealing .ptcg-chrome');
    assert.ok(decls, 'reveal rule is missing');
    assert.ok(decls.includes('clip-path: inset(0 0 calc(100% - var(--focus-reveal)) 0);'));
    assert.doesNotMatch(decls, /(^|[;\s])opacity\s*:/i);
  });

  it('the pointer tilt lives on its own wrapper, so the flight transform is not overwritten', () => {
    const decls = focus('.card-focus__tilt');
    assert.ok(decls, '.card-focus__tilt is missing');
    assert.match(decls, /transform-style: preserve-3d;/);
    assert.ok(
      decls.includes('rotateX(var(--focus-tilt-x, 0deg)) rotateY(var(--focus-tilt-y, 0deg))')
    );
    assert.doesNotMatch(focus('.card-focus__card'), /(^|[;\s])transform\s*:/i);
  });

  it('plain scans use object-fit: contain, the letterbox the inspector sizes its chrome on', () => {
    assert.ok(
      normalize(FOCUS_CSS).includes(
        '.card-focus__card .discard-pile-card { display: block; width: 100%; height: 100%; object-fit: contain;'
      )
    );
  });

  it('defines the HUD buttons the module builds', () => {
    for (const selector of ['.card-focus__hud', '.card-focus__close', '.card-focus__stack']) {
      assert.ok(focus(selector), `${selector} is missing`);
    }
  });
});

describe('067 — the hand drops inside the playmat iframe', () => {
  it('self-containers.css lowers #hand by moving `bottom`, below the viewport', () => {
    const decls = ruleBody(SELF_CSS, '.hand-lowered #hand');
    assert.ok(decls, '.hand-lowered #hand is missing from self-containers.css');
    assert.match(decls, /bottom: calc\(-3\.2 \* var\(--hand-crop-height\)\);/);
  });

  it('#hand animates `bottom` over the flight duration and never takes a transform', () => {
    const decls = ruleBody(SELF_CSS, '#hand');
    assert.match(decls, new RegExp(`transition: bottom ${FLIGHT_MS}ms ${FLIGHT_EASE.replace(/[().,]/g, '\\$&')};`));
    // A transform would make #hand the containing block of the fixed ::before strip.
    assert.doesNotMatch(decls, /(^|[;\s])transform\s*:/i);
    assert.doesNotMatch(ruleBody(SELF_CSS, '.hand-lowered #hand'), /(^|[;\s])transform\s*:/i);
  });

  it('the fixed hand strip follows the hand down', () => {
    const decls = ruleBody(SELF_CSS, '.hand-lowered #hand::before');
    assert.ok(decls, 'the strip would stay on screen while the cards drop');
    assert.match(decls, /bottom: calc\(-1 \* var\(--hand-crop-height\)\);/);
  });

  it('the rule is not defined for the main document stylesheet (the hand lives in the iframe)', () => {
    assert.doesNotMatch(INDEX_CSS, /\.hand-lowered/);
  });
});
