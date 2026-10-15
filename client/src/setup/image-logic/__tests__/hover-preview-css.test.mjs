import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { HOVER_FADE_IN_MS, HOVER_FADE_OUT_MS } from '../hover-preview-model.mjs';

// Static contracts for design 069 (card-focus-css.test.mjs style): the stylesheet text is under test.
// They guard the ways the hover preview silently breaks: it starts eating clicks, it fades the holo card
// (flattening it), its timings drift from the model, or the band probe stops following the mat art.

const CSS_DIR = fileURLToPath(new URL('../../../css/', import.meta.url));
const read = (name) => readFileSync(`${CSS_DIR}${name}`, 'utf8');
const normalize = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
const rules = (css) =>
  [...normalize(css).matchAll(/([^{}]+)\{([^}]*)\}/g)].map((match) => ({
    selectors: match[1].split(',').map((part) => part.trim()),
    body: match[2],
  }));
const ruleBody = (css, selector) => rules(css).find((rule) => rule.selectors.includes(selector))?.body ?? null;
const declaration = (body, property) =>
  body?.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))?.[1].trim() ?? null;

const HOVER_CSS = read('hover-preview.css');
const INDEX_CSS = read('index.css');
const host = ruleBody(HOVER_CSS, '#hoverPreview');

describe('069 — hover-preview.css', () => {
  it('is imported by index.css', () => {
    assert.match(INDEX_CSS, /@import url\('\.\/hover-preview\.css'\);/);
  });

  it('the host never takes pointer input', () => {
    assert.equal(declaration(host, 'pointer-events'), 'none');
    assert.equal(declaration(host, 'position'), 'fixed');
  });

  it('sits under the 2400 modal overlays', () => {
    const z = Number(declaration(host, 'z-index'));
    assert.ok(z > 1310 && z < 2400, `z-index ${z} must clear the board buttons (1310) and stay under modals (2400)`);
  });

  it('fades the host only — never opacity on the holo card or its image', () => {
    assert.equal(declaration(host, 'opacity'), '0');
    assert.equal(declaration(ruleBody(HOVER_CSS, '#hoverPreview.is-shown'), 'opacity'), '1');
    for (const rule of rules(HOVER_CSS)) {
      if (rule.selectors.every((selector) => selector.startsWith('#hoverPreview') && !selector.includes(' ') && !selector.includes('>'))) continue;
      assert.equal(declaration(rule.body, 'opacity'), null, `${rule.selectors.join(', ')} sets opacity`);
    }
  });

  it('fade tokens equal the model constants', () => {
    assert.equal(declaration(host, '--hover-preview-fade-in'), `${HOVER_FADE_IN_MS}ms`);
    assert.equal(declaration(host, '--hover-preview-fade-out'), `${HOVER_FADE_OUT_MS}ms`);
    assert.match(declaration(host, 'transition'), /var\(--hover-preview-fade-out\)/);
    assert.match(declaration(ruleBody(HOVER_CSS, '#hoverPreview.is-shown'), 'transition'), /var\(--hover-preview-fade-in\)/);
  });
});

describe('069 — the band probe in both playmat sheets', () => {
  for (const sheet of ['self-containers.css', 'opp-containers.css']) {
    it(`${sheet} sizes .hover-gutter-probe from the mat-art vars, invisible and click-through`, () => {
      const body = ruleBody(read(sheet), '.hover-gutter-probe');
      assert.ok(body, `.hover-gutter-probe is missing from ${sheet}`);
      assert.equal(declaration(body, 'left'), 'var(--mat-offset-x, 0px)');
      assert.equal(declaration(body, 'width'), 'var(--mat-width, 100%)');
      assert.equal(declaration(body, 'visibility'), 'hidden');
      assert.equal(declaration(body, 'pointer-events'), 'none');
    });
  }
});
