import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Static contracts for design 013. They guard the three ways the inspector silently stops
// working, all of which actually happened while the layout was being designed:
//
//   C1 — an opaque field standing in for the card, so the scan stops showing through
//   C2 — dimming by `opacity`, which makes a panel translucent and lets the printed text
//        underneath ghost back through the very panel that exists to cover it
//   C5 — the rules landing in a stylesheet that never reaches the element (board cards live
//        in the playmat iframes, which load only self-/opp-containers.css)
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
const SELF_BOARD_CSS = readFileSync(`${CSS_DIR}self-containers.css`, 'utf8');
const OPP_BOARD_CSS = readFileSync(`${CSS_DIR}opp-containers.css`, 'utf8');

const body = (selector) => ruleBody(INDEX_CSS, selector);

describe('013 C2 — dimming never uses opacity', () => {
  for (const selector of ['.ptcg-inspector--locked', '.ptcg-atk--recede']) {
    it(`${selector} dims with filter and declares no opacity`, () => {
      const decls = body(selector);
      assert.ok(decls, `${selector} is missing from index.css`);
      assert.match(decls, /filter:/, `${selector} must dim with filter`);
      assert.doesNotMatch(
        decls,
        /(^|[;\s])opacity\s*:/i,
        `${selector} uses opacity — a translucent panel lets the card's printed text ghost through`
      );
    });
  }
});

describe('013 C1 — the card scan stays the background', () => {
  // The containers that span the card must be transparent; only the pieces that replace
  // print get a fill. An earlier revision put a cream field behind the whole lower block
  // and it read as a large empty band hiding the card.
  for (const selector of [
    '.ptcg-chrome',
    '.ptcg-stack',
    '.ptcg-atks',
    '.ptcg-stats',
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

  // …and the pieces that DO replace print must actually be opaque, or the print shows twice.
  for (const selector of ['.ptcg-atk', '.ptcg-ability', '.ptcg-stat', '.ptcg-stadium']) {
    it(`${selector} is opaque so it covers the print it replaces`, () => {
      const decls = body(selector);
      assert.ok(decls, `${selector} is missing from index.css`);
      assert.match(
        decls,
        /background\s*:\s*#fff/i,
        `${selector} must be opaque or the printed text underneath shows through`
      );
    });
  }
});

// The stack is sized by its content. An earlier revision stretched the panels with `flex: 1` to
// absorb the leftover height, which on a one-attack card painted a foot of empty white over the
// artwork — the user asked for the card to show there instead.
describe('013 — the text stack is content-sized, not stretched', () => {
  for (const selector of [
    '.ptcg-stack',
    '.ptcg-atks',
    '.ptcg-atk',
    '.ptcg-atk__text',
  ]) {
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
    // `top` is set inline by card-inspector.mjs from blockTopPct, so it is not asserted here;
    // the guard that matters is the absence of a bottom, which would re-stretch the stack.
    const decls = body('.ptcg-stack');
    assert.doesNotMatch(
      decls,
      /(^|[;\s])bottom\s*:/i,
      'a bottom anchor would re-stretch the stack to the stat band'
    );
  });

  it('the stat band is pinned from the bottom, independently of the stack', () => {
    const decls = body('.ptcg-stats');
    assert.ok(decls, '.ptcg-stats is missing from index.css');
    assert.match(decls, /position\s*:\s*absolute/i);
    assert.doesNotMatch(
      decls,
      /(^|[;\s])top\s*:/i,
      'a top anchor would fight the bottom one now the stack no longer sizes the band'
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

  // The carousel and its decorate hook live in the main document, so index.css is correct
  // here — but if the chrome is ever moved onto the board, these stylesheets are the trap
  // that silently renders an unstyled panel.
  for (const [name, css] of [
    ['self-containers.css', SELF_BOARD_CSS],
    ['opp-containers.css', OPP_BOARD_CSS],
  ]) {
    it(`${name} does not define inspector chrome (it is main-document only)`, () => {
      assert.doesNotMatch(
        css,
        /\.ptcg-(inspector|chrome|atk|stat|hp|dmg|orb)\b/
      );
    });
  }
});

describe('013 — the scaling unit the renderer sets', () => {
  it('every sized piece derives from --u rather than a fixed pixel value', () => {
    // card-inspector.mjs sets --u to 1% of the rendered card width. A hardcoded px here
    // would be correct at one slide size and wrong at every other.
    const selectors = [
      '.ptcg-hp__num',
      '.ptcg-atk__name',
      '.ptcg-atk__dmg',
      '.ptcg-atk__text',
      '.ptcg-stat__k',
      '.ptcg-stat__n',
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
