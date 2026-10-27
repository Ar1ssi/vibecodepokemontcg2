import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Static contracts for the inspector chrome (design 013). Designs 074 and 018 retired the print-band
// panels, the Stadium's last (its row is attack-options.css, pinned by attack-options.test). What is
// left guards the ways the chrome silently stops working:
//
//   C1 — an opaque field standing in for the card, so the scan stops showing through
//   C5 — the rules landing in a stylesheet that never reaches the element (the 3D board's
//        mirror shadow roots load only board3d-panels.css, not index.css)
//
// Same approach as highlight-parity-css.test.mjs: assert on the stylesheet text, because
// client/src/setup UI wiring has no jsdom harness in this repo. The DOM half of the hook
// contract is proven by the slice-3 Playwright run instead.

const CSS_DIR = fileURLToPath(new URL('../../../css/', import.meta.url));

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const normalize = (css) => stripComments(css).replace(/\s+/g, ' ').trim();

const ruleBody = (css, selector) => {
  for (const match of normalize(css).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = match[1].split(',').map((part) => part.trim());
    if (selectors.includes(selector)) return match[2];
  }
  return null;
};

const INDEX_CSS = readFileSync(`${CSS_DIR}index.css`, 'utf8');

const body = (selector) => ruleBody(INDEX_CSS, selector);

describe('074 — the option rows take clicks through the click-through chrome', () => {
  // .ptcg-chrome is pointer-events: none so taps reach the card. A row that does not take
  // pointer events back is drawn but unclickable: the attack never fires.
  const OPTIONS_CSS = readFileSync(`${CSS_DIR}attack-options.css`, 'utf8');
  const FOCUS_CSS = readFileSync(`${CSS_DIR}card-focus.css`, 'utf8');

  it('.ptcg-chrome is click-through', () => {
    assert.match(body('.ptcg-chrome') ?? '', /pointer-events: none/);
  });

  it('.tcgl-opt takes pointer events back', () => {
    assert.match(ruleBody(OPTIONS_CSS, '.tcgl-opt') ?? '', /pointer-events: auto/);
  });

  it('the focus list takes the wheel so it can scroll', () => {
    const decls = ruleBody(FOCUS_CSS, '.card-focus__card .ptcg-chrome--focus .ptcg-stack--focus');
    assert.match(decls ?? '', /pointer-events: auto/);
  });
});

describe('013 C1 — the card scan stays the background', () => {
  // The containers that span the card must be transparent; only the pieces that replace
  // print get a fill. An earlier revision put a cream field behind the whole lower block
  // and it read as a large empty band hiding the card.
  for (const selector of [
    '.ptcg-chrome',
    '.ptcg-stack',
  ]) {
    it(`${selector} carries no background`, () => {
      const decls = body(selector);
      assert.ok(decls, `${selector} is missing from index.css`);
      assert.doesNotMatch(
        decls,
        /(^|[;\s])background(-color)?\s*:/i,
        `${selector} must not stand in for the card — only the pieces that replace print fill`
      );
    });
  }
});

// The stack is sized by its content. An earlier revision stretched the panels with `flex: 1` to
// absorb the leftover height, which on a one-attack card painted a foot of empty white over the
// artwork — the user asked for the card to show there instead.
describe('013 — the text stack is content-sized, not stretched', () => {
  for (const selector of ['.ptcg-stack']) {
    it(`${selector} declares no flex grow`, () => {
      const decls = body(selector);
      assert.ok(decls, `${selector} is missing from index.css`);
      assert.doesNotMatch(
        decls,
        /(^|[;\s])flex\s*:\s*1/i,
        `${selector} must not grow — stretching it re-creates the opaque void over the card`
      );
    });
  }

  it('the stack carries no bottom anchor', () => {
    // The focus list places itself (card-focus.css); the guard that matters here is the absence of
    // a bottom, which would re-stretch the stack.
    const decls = body('.ptcg-stack');
    assert.doesNotMatch(
      decls,
      /(^|[;\s])bottom\s*:/i,
      'a bottom anchor would re-stretch the stack to the printed box'
    );
  });
});

describe('013 C5 — the rules live where the chrome is mounted', () => {
  it('index.css carries the inspector rules', () => {
    assert.ok(
      body('.ptcg-inspector'),
      '.ptcg-inspector missing from index.css'
    );
    assert.ok(body('.ptcg-hp'), '.ptcg-hp missing from index.css');
  });
});

describe('013 — the scaling unit the renderer sets', () => {
  it('every sized piece derives from --u rather than a fixed pixel value', () => {
    // card-inspector.mjs sets --u to 1% of the rendered card width. A hardcoded px here
    // would be correct at one slide size and wrong at every other.
    const selectors = [
      '.ptcg-hp__num',
      '.ptcg-dmg',
    ];
    for (const selector of selectors) {
      const decls = body(selector);
      assert.ok(decls, `${selector} is missing from index.css`);
      assert.match(
        decls,
        /var\(--u\)/,
        `${selector} must size from --u so the panel scales with the slide`
      );
    }
  });
});
