import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  cardSeriesFromImageUrl,
  cardSetFromImageUrl,
  isTrainerGalleryImageUrl,
  resolveHoloEffect,
} from '../holo.mjs';

// Per-generation foil: the rarities and URL signals that pick a card's own
// effect, and the CSS that has to exist for each of those effects.
const CSS_DIR = fileURLToPath(new URL('../../../../css/', import.meta.url));
const readCss = (name) =>
  readFileSync(`${CSS_DIR}${name}`, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ');

const tcgdex = (series, set, number) =>
  `https://assets.tcgdex.net/en/${series}/${set}/${number}/high.webp`;

describe('resolveHoloEffect special rarities', () => {
  it('gives each old or special rarity its own effect', () => {
    const cases = {
      'Amazing Rare': 'amazing rare',
      'ACE SPEC Rare': 'ace spec rare',
      'Rare BREAK': 'break rare',
      LEGEND: 'legend rare',
      'Rare PRIME': 'prime rare',
      'Rare Prime': 'prime rare',
      'Rare Holo LV.X': 'lvx rare',
      'Rare Holo Star': 'gold star',
    };
    for (const [rarity, effect] of Object.entries(cases)) {
      assert.equal(resolveHoloEffect({ rarity }), effect, rarity);
    }
  });

  it('spots Gold Star cards by the star in their name', () => {
    assert.equal(
      resolveHoloEffect({ rarity: 'Holo Rare', name: 'Pikachu ★' }),
      'gold star'
    );
  });
});

describe('cardSeriesFromImageUrl', () => {
  it('returns the series letters for known series', () => {
    assert.equal(cardSeriesFromImageUrl(tcgdex('hgss', 'hgss1', '1')), 'hgss');
    assert.equal(cardSeriesFromImageUrl(tcgdex('ex', 'ex5', '1')), 'ex');
    assert.equal(
      cardSeriesFromImageUrl('https://images.pokemontcg.io/dp3/1_hires.png'),
      'dp'
    );
  });

  it('returns null for unknown series, hosts and bad input', () => {
    assert.equal(cardSeriesFromImageUrl(tcgdex('zz', 'zz1', '1')), null);
    assert.equal(cardSeriesFromImageUrl('https://example.com/a.png'), null);
    assert.equal(cardSeriesFromImageUrl(undefined), null);
  });
});

describe('cardSetFromImageUrl', () => {
  it('returns the lowercase set code from both image hosts', () => {
    assert.equal(cardSetFromImageUrl(tcgdex('ex', 'ex5', '1')), 'ex5');
    assert.equal(
      cardSetFromImageUrl('https://images.pokemontcg.io/base1/4_hires.png'),
      'base1'
    );
  });

  it('returns null for other hosts and bad input', () => {
    assert.equal(cardSetFromImageUrl('https://example.com/base1/4.png'), null);
    assert.equal(cardSetFromImageUrl(tcgdex('ex', 'ex"5', '1')), null);
    assert.equal(cardSetFromImageUrl(undefined), null);
  });
});

describe('isTrainerGalleryImageUrl', () => {
  it('detects TG and GG subsets and card numbers', () => {
    assert.equal(isTrainerGalleryImageUrl(tcgdex('swsh', 'swsh9', 'TG05')), true);
    assert.equal(
      isTrainerGalleryImageUrl('https://images.pokemontcg.io/swsh9tg/TG05_hires.png'),
      true
    );
    assert.equal(
      isTrainerGalleryImageUrl(tcgdex('swsh', 'swsh12.5', 'GG44')),
      true
    );
  });

  it('ignores normal cards and bad input', () => {
    assert.equal(isTrainerGalleryImageUrl(tcgdex('swsh', 'swsh9', '100')), false);
    assert.equal(isTrainerGalleryImageUrl(''), false);
    assert.equal(isTrainerGalleryImageUrl(null), false);
  });
});

describe('per-generation foil CSS', () => {
  const files = [
    'amazing-rare.css',
    'ace-spec-rare.css',
    'old-foil-rares.css',
    'classic-holo.css',
    'modern-holo.css',
    'trainer-gallery.css',
  ];

  it('is imported by the main page and both playmat iframes', () => {
    for (const sheet of ['index.css', 'self-containers.css', 'opp-containers.css']) {
      const source = readFileSync(`${CSS_DIR}${sheet}`, 'utf8');
      for (const file of files) {
        assert.ok(source.includes(`@import url('./holo/${file}');`), `${sheet} ${file}`);
      }
    }
  });

  it('defines a shine for every new effect', () => {
    const css = files.map((file) => readCss(`holo/${file}`)).join(' ');
    for (const selector of [
      '.card[data-rarity="amazing rare"] .card__shine {',
      '.card[data-rarity="ace spec rare"] .card__shine {',
      '.card[data-rarity="break rare"] .card__shine {',
      '.card[data-rarity="legend rare"] .card__shine {',
      '.card[data-rarity="prime rare"] .card__shine {',
      '.card[data-rarity="lvx rare"] .card__shine {',
      '.card[data-rarity="gold star"] .card__shine {',
      '.card[data-rarity="ace spec rare"][data-card-era="xy"] .card__shine {',
      '.card[data-rarity="rare holo"][data-card-set="base1"] .card__shine,',
      '.card[data-rarity="rare holo"][data-card-set="ex5"] .card__shine,',
      '.card[data-rarity="rare holo"][data-card-set="ex6"] .card__shine {',
      '.card[data-rarity="rare holo"][data-card-set="ex8"] .card__shine {',
      '.card[data-rarity="rare holo"][data-card-set="ex9"] .card__shine {',
      '.card[data-rarity="rare holo"][data-card-set="ex10"] .card__shine {',
      '.card[data-rarity="rare holo"][data-card-series="hgss"] .card__shine,',
      '.card[data-rarity="rare holo"][data-card-series="dp"] .card__shine,',
      '.card[data-rarity="double rare"][data-card-era="classic"] .card__shine {',
      '.card[data-rarity][data-trainer-gallery="true"] .card__shine {',
      '.card[data-rarity="rare holo"][data-card-era="xy"] .card__shine {',
      '.card[data-rarity="rare holo"][data-card-set="bw1"] .card__shine,',
      '.card[data-rarity="rare holo"][data-card-set="xy12"] .card__shine {',
      '.card[data-rarity="double rare"][data-card-era="sm"] .card__shine {',
      '.card[data-rarity="rare holo"][data-card-era="swsh"] .card__shine {',
      '.card[data-rarity="double rare"][data-card-series="me"] .card__shine {',
      '.card[data-rarity="rare rainbow alt"] .card__shine {',
    ]) {
      assert.ok(css.includes(selector), selector);
    }
  });

  it('keeps the default sparkle off effects with their own glitter', () => {
    const base = readCss('holo/base.css');
    const sparkleSelector = base
      .split(' .card__glitter {')
      .find((part) => part.includes('.card[data-rarity]:not('));
    assert.ok(sparkleSelector, 'default sparkle rule exists');
    for (const rarity of ['break rare', 'legend rare', 'lvx rare', 'gold star']) {
      assert.ok(sparkleSelector.includes(`:not([data-rarity="${rarity}"])`), rarity);
    }
  });

  it('never multiplies a percentage by an angle (invalid calc drops the whole background)', () => {
    for (const file of files) {
      assert.doesNotMatch(readCss(`holo/${file}`), /%\)\s*\*\s*-?[\d.]+deg/, file);
    }
  });

  it('blends pattern stacks with soft-light (color-dodge over black was invisible on bright art)', () => {
    for (const file of ['classic-holo.css', 'modern-holo.css', 'ace-spec-rare.css', 'amazing-rare.css']) {
      const shineRules = readCss(`holo/${file}`).match(/\.card__shine \{[^}]*\}/g) ?? [];
      for (const rule of shineRules.filter((r) => r.includes('mix-blend-mode'))) {
        assert.ok(rule.includes('mix-blend-mode: soft-light;'), `${file}: ${rule.slice(0, 60)}`);
      }
    }
  });

  it('never tiles a diagonal gradient (tile edges draw boxes)', () => {
    for (const file of files) {
      const css = readCss(`holo/${file}`);
      const factors = [...css.matchAll(/var\(--background-[xy]\) - 50%\) \* (-?[\d.]+) \+ 50%/g)];
      for (const [, factor] of factors) {
        assert.ok(Math.abs(Number(factor)) <= 1.15, `${file} pan x${factor}`);
      }
    }
  });
});
