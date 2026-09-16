import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Static contracts for the holo CSS (client/src/css/holo). They guard the
// regressions that made foil look fake: undefined vars silently killing layers,
// an unmasked white overlay washing cards out, and foil covering printed ink.
const HOLO_DIR = fileURLToPath(
  new URL('../../../../css/holo/', import.meta.url)
);

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const readHoloCss = (name) =>
  stripComments(readFileSync(`${HOLO_DIR}${name}`, 'utf8'));
const holoCssFiles = () =>
  readdirSync(HOLO_DIR).filter((name) => name.endsWith('.css'));
const normalize = (css) => css.replace(/\s+/g, ' ').trim();

describe('holo CSS contracts', () => {
  it('no layer depends on --card-scale without a fallback (it is never set)', () => {
    for (const name of holoCssFiles()) {
      assert.doesNotMatch(readHoloCss(name), /var\(\s*--card-scale\s*\)/, name);
    }
  });

  it('base routes --mask through a fully visible default ink mask', () => {
    const base = readHoloCss('base.css');
    assert.match(base, /--card-ink-mask:\s*linear-gradient\(#fff,\s*#fff\);/);
    assert.match(base, /--mask:\s*var\(--card-ink-mask\);/);
    assert.doesNotMatch(base, /--mask:\s*none/);
  });

  it('every decorative layer is masked by the card ink (luminance)', () => {
    const base = normalize(readHoloCss('base.css'));
    const rule = base.match(
      /\.card__shine, \.card__glitter, \.card__glare, \.card__glare2 \{([^}]*)\}/
    );
    assert.ok(rule, 'shared ink-mask rule exists');
    assert.match(
      rule[1],
      /mask-image: var\(--card-ink-mask\), var\(--card-ink-mask\);/
    );
    assert.match(rule[1], /mask-composite: add;/);
    assert.match(rule[1], /mask-mode: luminance;/);
    assert.match(rule[1], /mask-size: cover;/);
  });

  it('gold and SIR cards have no white glare2 overlay, multiply vignette, or additive glitter', () => {
    for (const name of ['hyper-rare.css', 'ex-special-illustration-rare.css']) {
      const css = readHoloCss(name);
      assert.doesNotMatch(css, /\.card__glare2/, name);
      assert.doesNotMatch(css, /mix-blend-mode:\s*multiply/, name);
      assert.doesNotMatch(css, /plus-lighter/, name);
    }
  });

  it('hyper rare and SIR stay identical apart from the rarity selector', () => {
    const hyper = normalize(readHoloCss('hyper-rare.css')).replaceAll(
      'hyper rare',
      'RARITY'
    );
    const sir = normalize(
      readHoloCss('ex-special-illustration-rare.css')
    ).replaceAll('special illustration rare', 'RARITY');
    assert.equal(hyper, sir);
  });

  it('ultra rare shine masks by the card ink despite overriding --mask', () => {
    assert.match(
      readHoloCss('ex-full-art.css'),
      /mask-image:\s*var\(--card-ink-mask\);/
    );
  });

  it('glare gradients never end in an opaque dark stop (no dark card edges)', () => {
    // The fixed light keeps glare on permanently, so a radial that ends in
    // black/dark grey becomes a permanent vignette around the card edges.
    const darkEndStop =
      /(hsla?\(\s*\d+(?:\.\d+)?,\s*\d+%,\s*(?:[0-3]?\d)%(?:,\s*(?:0?\.[3-9]\d*|1))?\s*\)|#000|black)\s+\d+%\s*\)/;
    for (const name of holoCssFiles()) {
      const glareRules =
        readHoloCss(name).match(/\.card__glare[^{]*\{[^}]*\}/g) ?? [];
      for (const rule of glareRules) {
        assert.doesNotMatch(rule, darkEndStop, `${name}: ${rule.slice(0, 80)}`);
      }
    }
  });
});

describe('holo preview containers', () => {
  const indexCss = normalize(
    stripComments(
      readFileSync(
        fileURLToPath(new URL('../../../../css/index.css', import.meta.url)),
        'utf8'
      )
    )
  );
  // Match the standalone rule (preceded by the previous rule's `}`), not a
  // grouped selector list that merely ends with the same selector.
  const ruleBody = (selector) => {
    const start = indexCss.indexOf(`} ${selector} {`);
    assert.notEqual(start, -1, `standalone rule ${selector} exists`);
    return indexCss.slice(start + 1, indexCss.indexOf('}', start + 1));
  };

  it('let a tilted holo card overflow instead of clipping it', () => {
    for (const selector of [
      '.card-preview-face--front',
      '.discard-pile-slide .mat-holo.discard-pile-holo',
      '.card-picker-choose .card-picker-trigger-slot',
      '.card-picker-choose .card-picker-trigger-holo',
    ]) {
      assert.match(ruleBody(selector), /overflow: visible;/, selector);
    }
  });
});

describe('full-art (ultra rare) foil', () => {
  it('shine overlays the card and never blends with exclusion (both washed it out)', () => {
    const css = normalize(readHoloCss('ex-full-art.css'));
    assert.match(
      css,
      /\.card\[data-rarity="ultra rare"\] \.card__shine \{ mix-blend-mode: overlay; \}/
    );
    assert.doesNotMatch(css, /mix-blend-mode: exclusion/);
  });
});

describe('reverse holo foil', () => {
  const css = () => normalize(readHoloCss('reverse-holo.css'));

  it('cuts the art window out of shine and glitter with an even-odd clip', () => {
    assert.match(
      css(),
      /\.card__shine, \.card\[data-rarity\$="reverse holo"\] \.card__glitter \{[^}]*clip-path: polygon\( evenodd,/
    );
  });

  it('defines the art window for every era holo.mjs can emit', () => {
    const base = normalize(readHoloCss('base.css'));
    for (const era of ['sv', 'swsh', 'sm', 'xy', 'classic']) {
      assert.match(
        base,
        new RegExp(
          `\\[data-card-era="${era}"\\] \\{ --art-l: [\\d.]+%; --art-t: [\\d.]+%; --art-r: [\\d.]+%; --art-b: [\\d.]+%; \\}`
        ),
        era
      );
    }
  });

  it('shows real color and never dims the foil with a brightness cut', () => {
    assert.match(css(), /hsl\(285, 100%, 55%\)/);
    assert.doesNotMatch(css(), /--foil-brightness/);
    assert.doesNotMatch(css(), /var\(--foil\)/);
  });
});

describe('reverse holo energy', () => {
  it('drops the art-window clip and tones the rainbow down', () => {
    const css = normalize(readHoloCss('reverse-holo.css'));
    assert.match(
      css,
      /\.card\[data-rarity="energy reverse holo"\] \.card__glitter \{ -webkit-clip-path: none; clip-path: none; \}/
    );
    assert.match(
      css,
      /\.card\[data-rarity="energy reverse holo"\] \.card__shine \{ filter: [^}]*opacity: \.55; \}/
    );
  });
});

describe('shine gradients', () => {
  it('never tile the diagonal sheen/rainbow and keep the pan inside the tile (tile edges drew boxes)', () => {
    for (const name of ['hyper-rare.css', 'ex-special-illustration-rare.css', 'reverse-holo.css']) {
      const css = normalize(readHoloCss(name));
      assert.match(css, /\.card__shine \{[^}]*background-repeat: no-repeat;/, name);
      // clamp() percentages in background-position render wrong in Chrome and hid the layer.
      assert.doesNotMatch(css, /clamp\(/, name);
      const factors = [...css.matchAll(/var\(--background-[xy]\) - 50%\) \* (-?[\d.]+) \+ 50%/g)];
      assert.ok(factors.length >= 4, `${name} pans its shine`);
      for (const [, factor] of factors) {
        assert.ok(Math.abs(Number(factor)) <= 1.15, `${name} pan x${factor} would expose a tile edge`);
      }
    }
  });
});

describe('regular holo foil', () => {
  const css = () => normalize(readHoloCss('regular-holo.css'));

  it('clips shine and glitter to the art window', () => {
    assert.ok(
      css().includes(
        '.card[data-rarity="rare holo"] .card__glitter { -webkit-clip-path: inset( var(--art-t) calc(100% - var(--art-r)) calc(100% - var(--art-b)) var(--art-l) ); clip-path: inset( var(--art-t)'
      )
    );
  });

  it('gives classic-era holos the cosmos pattern without the beams', () => {
    const classicShine = css().split('[data-card-era="classic"] .card__shine {')[1] ?? '';
    assert.ok(classicShine.split('}')[0].includes('cosmos-top-trans.png'));
    assert.ok(
      css().includes('[data-card-era="classic"] .card__shine:after { display: none; }')
    );
  });
});

describe('shiny rare foil', () => {
  it('is imported by both stylesheets and keeps its own glitter', () => {
    for (const sheet of ['index.css', 'opp-containers.css']) {
      const source = readFileSync(
        fileURLToPath(new URL(`../../../../css/${sheet}`, import.meta.url)),
        'utf8'
      );
      assert.ok(source.includes("@import url('./holo/shiny-rare.css');"), sheet);
    }
    assert.ok(
      readHoloCss('base.css').includes(
        ':not([data-rarity="shiny rare"]):not('
      )
    );
  });
});
