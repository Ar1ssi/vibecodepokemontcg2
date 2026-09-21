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

// Every declaration block addressed by `selector`, joined — for a node whose
// styles are split across a shared rule and its own rule.
const allRuleBodies = (css, selector) => {
  const bodies = [];
  for (const match of normalize(css).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = match[1].split(',').map((part) => part.trim());
    if (selectors.includes(selector)) bodies.push(match[2]);
  }
  return bodies.join(' ');
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

// Every `@media (prefers-reduced-motion: reduce)` block body in a normalized sheet.
const reducedMotionBlocks = (css) => {
  const bodies = [];
  let at = css.indexOf('@media (prefers-reduced-motion: reduce)');
  while (at >= 0) {
    bodies.push(blockAfter(css, at) || '');
    at = css.indexOf('@media (prefers-reduced-motion: reduce)', at + 1);
  }
  return bodies;
};

const MAT_SHEETS = ['self-containers.css', 'opp-containers.css'];

describe('highlight-parity CSS contracts', () => {
  it('styles the board ability glow in every sheet that holds its cards', () => {
    for (const name of MAT_SHEETS) {
      const css = normalize(readCss(name));
      // rules-bridge.js adds `.has-glow` (and the legacy `.has-usable-ability`)
      // to a card node inside that iframe document; index.css cannot reach it.
      assert.ok(ruleBody(css, '.has-glow'), `${name} styles the glow`);
      assert.ok(ruleBody(css, '.has-usable-ability'), `${name} keeps the legacy class styled`);
      // Each document resolves animation names against its own sheets.
      assert.match(css, /@keyframes card-glow \{/, `${name} declares the keyframes`);
    }
  });

  it('lets a selection ring outrank the ambient glow', () => {
    for (const name of MAT_SHEETS) {
      const css = normalize(readCss(name));
      const glowAt = css.indexOf('.has-glow');
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

// Design 023: the glow is one `.has-glow` class reading a per-node `--glow-rgb`,
// declared in every document that owns a glowing node (both playmat iframes and
// the top document for the parent-owned #stadium, D93).
describe('card-glow CSS contracts (design 023)', () => {
  const GLOW_SHEETS = [...MAT_SHEETS, 'index.css'];

  it('reads the per-node --glow-rgb in every sheet', () => {
    for (const name of GLOW_SHEETS) {
      const css = normalize(readCss(name));
      const body = ruleBody(css, '.has-glow');
      assert.ok(body, `${name} defines .has-glow`);
      assert.match(body, /rgba\(var\(--glow-rgb/, `${name} .has-glow reads --glow-rgb`);
      const keyframes = css.match(/@keyframes card-glow \{([^}]*)\}/);
      assert.ok(keyframes, `${name} declares @keyframes card-glow`);
      assert.match(keyframes[1], /rgba\(var\(--glow-rgb/, `${name} card-glow reads --glow-rgb`);
    }
  });

  it('declares .has-glow before .highlight in every sheet', () => {
    for (const name of GLOW_SHEETS) {
      const css = normalize(readCss(name));
      const glowAt = css.indexOf('.has-glow');
      const ringAt = css.indexOf('.highlight {');
      assert.ok(glowAt >= 0 && ringAt >= 0, `${name} defines both rules`);
      assert.ok(glowAt < ringAt, `${name} declares the glow before .highlight`);
    }
  });

  it('keeps the glow visible but stops the animation under reduced motion', () => {
    for (const name of GLOW_SHEETS) {
      const css = normalize(readCss(name));
      const blocks = reducedMotionBlocks(css);
      // Paused (not `animation: none`): the animated box-shadow must keep
      // applying, or the ID-specific default card shadows hide the static glow.
      assert.ok(
        blocks.some((body) => /\.has-glow[\s\S]*animation-play-state: paused/.test(body)),
        `${name} pauses the glow animation under reduced motion`
      );
    }
  });

  // The Live-style look: a lit rim with hotspots flowing along the card edge,
  // not a breathing halo. A bare <img> has no ::after, so the mat sheets draw
  // its ring as padding over the gradient; wrappers and #stadium use a masked
  // ::after. Two angles turning in opposite directions keep the flow irregular.
  it('flows hotspots along a lit rim around the card edge', () => {
    const ringNodes = {
      'self-containers.css': ['img.has-glow', '.mat-holo.has-glow::after'],
      'opp-containers.css': ['img.has-glow', '.mat-holo.has-glow::after'],
      'index.css': ['#stadium.has-glow::after'],
    };
    for (const [name, selectors] of Object.entries(ringNodes)) {
      const css = normalize(readCss(name));
      const angle = ruleBody(css, '@property --glow-angle');
      assert.ok(angle, `${name} registers --glow-angle`);
      assert.match(angle, /syntax: '<angle>'/, `${name} makes --glow-angle animatable`);
      assert.match(css, /to \{ --glow-angle: 360deg;/, `${name} card-glow turns the angle`);
      assert.ok(ruleBody(css, '@property --glow-angle-2'), `${name} registers --glow-angle-2`);
      assert.match(
        css,
        /@keyframes card-glow-drift \{ from \{ --glow-angle-2: 360deg; \} to \{ --glow-angle-2: 0deg; \}/,
        `${name} turns the second hotspot layer the other way`
      );
      for (const selector of selectors) {
        const body = allRuleBodies(css, selector);
        assert.ok(body, `${name} styles ${selector}`);
        assert.match(
          body,
          /conic-gradient\( from var\(--glow-angle\)[\s\S]*conic-gradient\( from var\(--glow-angle-2\)/,
          `${name} ${selector} paints both hotspot layers`
        );
      }
      const blocks = reducedMotionBlocks(css);
      for (const selector of selectors.filter((sel) => sel.endsWith('::after'))) {
        assert.ok(
          blocks.some((body) => body.includes(selector)),
          `${name} pauses ${selector} under reduced motion`
        );
        assert.match(allRuleBodies(css, selector), /mask-composite: exclude/, `${selector} is a ring`);
        assert.match(allRuleBodies(css, selector), /card-glow-drift/, `${selector} runs both layers`);
      }
    }
    for (const name of MAT_SHEETS) {
      // A bare <img> runs both angles through the shared `.has-glow` rule.
      assert.match(ruleBody(readCss(name), '.has-glow'), /card-glow-drift/, `${name} img runs both layers`);
      const img = allRuleBodies(readCss(name), 'img.has-glow');
      // Padding inside the border box: the ring never grows the card's layout box.
      assert.match(img, /box-sizing: border-box/, `${name} keeps the <img> box size`);
      assert.match(img, /padding: 3px/, `${name} leaves room for the <img> ring`);
      // Hand cards hold a steady rim: no hotspot layer to move.
      for (const selector of ['#hand img.has-glow', '#hand .mat-holo.has-glow::after']) {
        const hand = allRuleBodies(readCss(name), selector);
        assert.match(hand, /background: rgb\(var\(--glow-rgb/, `${name} ${selector} is a solid rim`);
        assert.doesNotMatch(hand, /--glow-angle/, `${name} ${selector} does not move`);
      }
    }
  });
});
