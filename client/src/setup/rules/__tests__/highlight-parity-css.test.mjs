import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Static contracts for the highlight-parity plan (implementation_plan.md).
// These guard the two ways this feature silently stops working: a class placed
// in a stylesheet that never reaches the element it styles (board cards live in
// the playmat iframes, which load only self-/opp-containers.css), and a marker
// painted under a container `opacity` that fades it out of legibility.
const CSS_DIR = fileURLToPath(new URL('../../../css/', import.meta.url));

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const readCss = (name) => stripComments(readFileSync(`${CSS_DIR}${name}`, 'utf8'));
const normalize = (css) => stripComments(css).replace(/\s+/g, ' ').trim();

// A rule's declaration block, addressed by one of its exact selectors — so a
// descendant or pseudo variant of the same name is not mistaken for it, and a
// selector that merely opens a comma-separated list still resolves.
const ruleBody = (css, selector) => {
  for (const match of normalize(css).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = match[1].split(',').map((part) => part.trim());
    if (selectors.includes(selector)) return match[2];
  }
  return null;
};

// The text between the first `{` at or after `from` and its matching `}` —
// nesting-aware, so an `@media` block keeps its nested `@keyframes`.
const blockAfter = (css, from) => {
  const open = css.indexOf('{', from);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return null;
};

const MAT_SHEETS = ['self-containers.css', 'opp-containers.css'];

describe('highlight-parity CSS contracts', () => {
  it('styles the board ability glow in every sheet that holds its cards', () => {
    for (const name of MAT_SHEETS) {
      const css = normalize(readCss(name));
      // rules-bridge.js adds `.has-usable-ability` to a card node inside that
      // iframe document; index.css cannot reach it.
      assert.ok(ruleBody(css, '.has-usable-ability'), `${name} styles the glow`);
      // Each document resolves animation names against its own sheets.
      assert.match(css, /@keyframes ability-glow \{/, `${name} declares the keyframes`);
    }
  });

  it('lets a selection ring outrank the ambient glow', () => {
    for (const name of MAT_SHEETS) {
      const css = normalize(readCss(name));
      const glowAt = css.indexOf('.has-usable-ability {');
      const ringAt = css.indexOf('.highlight {');
      assert.ok(glowAt >= 0 && ringAt >= 0, `${name} defines both rules`);
      // Same specificity, both set `animation` — the later declaration wins, so
      // the ring must come last for targeting to stay the louder signal.
      assert.ok(glowAt < ringAt, `${name} declares the glow before .highlight`);
    }
  });

  it('marks unusable zones without fading the marker', () => {
    const css = normalize(readCss('index.css'));
    for (const zone of ['.attack-zone--unusable', '.ability-zone--unusable']) {
      const body = ruleBody(css, zone);
      assert.ok(body, `${zone} exists`);
      assert.doesNotMatch(body, /opacity/, `${zone} must not dim via container opacity`);
      // Plan A2's dim lives on the label instead, so the marker keeps strength.
      const label = ruleBody(css, `${zone} .attack-zone-label`);
      assert.ok(label, `${zone} dims its label rather than the zone`);
      assert.match(label, /opacity/);
    }
    assert.match(
      css,
      /\.attack-zone--unusable::after, \.ability-zone--unusable::after \{/,
      'one marker rule covers both zone kinds'
    );
    const marker = ruleBody(css, '.ability-zone--unusable::after');
    assert.ok(marker, 'the blocked marker rule exists');
    assert.match(marker, /content: '✕'/);
    assert.match(marker, /color: rgb\(255, 86, 86\)/);
  });

  it('scales the preview glow up on large viewports (plan A4)', () => {
    const css = normalize(readCss('index.css'));
    const at = css.indexOf('@media (min-width: 1600px)');
    assert.ok(at >= 0, 'the scaling query exists');
    const scaled = blockAfter(css, at);
    assert.ok(scaled, 'the query block is well-formed');
    assert.match(scaled, /@keyframes attack-glow \{/);
    assert.match(scaled, /@keyframes ability-glow \{/);
    assert.match(scaled, /0 0 16px 5px/);
  });
});
