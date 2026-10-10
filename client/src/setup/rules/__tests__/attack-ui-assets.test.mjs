import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TYPE_GLOW } from '../card-glow-colors.mjs';
import { spriteMap } from '../../../../../scripts/attack-ui/import-attack-ui.mjs';

// The inspector's attack bars, damage tabs and Retreat button are TCG Live's own sprites. These
// checks keep index.css, the committed sprites and attack-ui.json (dumped from the game's
// AttackEntryAssetRegistry by scripts/attack-ui/dump-registry.py) from drifting apart — CSS can't
// read the JSON, so the numbers are repeated there and pinned here.

const CSS = readFileSync(fileURLToPath(new URL('../../../css/index.css', import.meta.url)), 'utf8');
const ASSET_DIR = fileURLToPath(new URL('../../../assets/attack-ui/', import.meta.url));
const TABLE = JSON.parse(readFileSync(`${ASSET_DIR}attack-ui.json`, 'utf8'));

const normalized = CSS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
const ruleFor = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(normalized);
  return match ? match[1] : null;
};

describe('attack-ui sprites', () => {
  it('every sprite the import script writes is committed', () => {
    for (const { out } of spriteMap()) assert.ok(existsSync(`${ASSET_DIR}${out}`), `${out} is missing`);
  });

  it('every attack-ui url in index.css points at a committed sprite', () => {
    const urls = [...CSS.matchAll(/url\('\.\.\/assets\/attack-ui\/([^']+)'\)/g)].map((m) => m[1]);
    assert.ok(urls.length > 40, 'expected the palette and variant urls');
    for (const file of new Set(urls)) assert.ok(existsSync(`${ASSET_DIR}${file}`), `${file} is missing`);
  });
});

describe('attack-ui palette', () => {
  it('has a CSS rule for exactly the types the inspector can pass', () => {
    assert.deepEqual(Object.keys(TABLE.types).sort(), Object.keys(TYPE_GLOW).sort());
  });

  for (const [key, row] of Object.entries(TABLE.types)) {
    it(`${key}: colours and sprites match the registry`, () => {
      const decls = ruleFor(`.ptcg-chrome [data-ptcg-type='${key}']`);
      assert.ok(decls, `no palette rule for ${key}`);
      assert.match(decls, new RegExp(`--atk-color: ${row.bar};`));
      assert.match(decls, new RegExp(`--atk-ink: ${row.ink};`));
      assert.match(decls, new RegExp(`--atk-bar: url\\('\\.\\./assets/attack-ui/bar-${key}\\.png'\\)`));
      assert.match(decls, new RegExp(`--atk-bar-short: url\\('\\.\\./assets/attack-ui/bar-${key}-short\\.png'\\)`));
      assert.match(decls, new RegExp(`--atk-retreat: url\\('\\.\\./assets/attack-ui/retreat-${key}\\.png'\\)`));
    });
  }

  it('every titlebar sprite shares the 278/21 stretch column the CSS slices on', () => {
    for (const row of Object.values(TABLE.types)) {
      for (const name of [row.titlebar, row.titlebarShort]) {
        const b = TABLE.borders[name];
        assert.ok(b, `${name} has no border row`);
        assert.deepEqual([b.left, b.right, b.top, b.bottom], [278, 21, 0, 0], name);
      }
    }
    assert.match(normalized, /border-image: var\(--atk-bar\) 0 21 0 278 fill/);
  });

  it('the Retreat button slice matches every type sprite and the disabled one', () => {
    for (const row of Object.values(TABLE.types)) {
      const b = TABLE.borders[row.retreat];
      assert.deepEqual([b.top, b.right, b.bottom, b.left], [12, 15, 12, 15], row.retreat);
    }
    const disabled = TABLE.borders.atkOv_RetreatBtn_Disable;
    assert.deepEqual([disabled.top, disabled.right, disabled.bottom, disabled.left], [15, 15, 15, 15]);
    assert.match(ruleFor('.ptcg-chrome .ptcg-stat[data-ptcg-retreat]'), /--atk-retreat-slice: 12 15 12 15;/);
    assert.match(ruleFor('.ptcg-chrome .ptcg-stat--recede[data-ptcg-retreat]'), /--atk-retreat-slice: 15;/);
  });

  it('the damage tab slices match each variant sprite', () => {
    // [sprite, rule selector, left, right, whether the rule restates the left border]
    const variants = [
      ['atkOv_DmgBG', '.ptcg-atk > .ptcg-atk__head, .ptcg-ability > .ptcg-atk__head', 33, 24, true],
      ['atkOv_DmgBG_Short', '.ptcg-atk--text > .ptcg-atk__head', 34, 24, true],
      ['atkOv_DmgBG_Empty', '.ptcg-atk--recede > .ptcg-atk__head', 37, 20, true],
      ['atkOv_DmgBG_Empty_Short', '.ptcg-atk--text.ptcg-atk--recede > .ptcg-atk__head', 37, 27, false],
    ];
    for (const [sprite, selector, left, right, restatesLeft] of variants) {
      const b = TABLE.borders[sprite];
      assert.deepEqual([b.left, b.right], [left, right], sprite);
      const decls = ruleFor(selector);
      assert.ok(decls, `no rule for ${selector}`);
      assert.match(decls, new RegExp(`--atk-dmg-r: ${right};`), selector);
      if (restatesLeft) assert.match(decls, new RegExp(`--atk-dmg-l: ${left};`), selector);
    }
  });

  it('GX bars use the wide titlebar borders', () => {
    const on = TABLE.borders.atkOv_TitlebarGX;
    const off = TABLE.borders.atkOv_TitlebarGX_Off;
    assert.deepEqual([on.left, on.right], [480, 19]);
    assert.deepEqual([off.left, off.right], [480, 18]);
    assert.match(normalized, /bar-gx\.png'\) 0 19 0 480 fill/);
    assert.match(normalized, /bar-gx-off\.png'\) 0 18 0 480 fill/);
  });

  it('an unusable attack bar is the white that the recede filter turns into the game cantUse grey', () => {
    assert.equal(TABLE.cantUse.bar, '#d4d4d4');
    assert.match(ruleFor('.ptcg-atk--recede > .ptcg-atk__head'), /background: #ffffff;/);
    assert.match(
      ruleFor('.ptcg-atk--recede, .ptcg-ability--recede, .ptcg-stadium--recede, .ptcg-stat--recede'),
      /filter: saturate\(0\.25\) brightness\(0\.84\) contrast\(0\.94\)/
    );
  });
});
