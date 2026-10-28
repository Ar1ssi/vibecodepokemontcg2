import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TYPE_GLOW } from '../card-glow-colors.mjs';
import { spriteMap } from '../../../../../scripts/attack-ui/import-attack-ui.mjs';

// The option rows' attack bars, damage tabs and Retreat button are TCG Live's own sprites. These
// checks keep attack-options.css (design 074), the committed sprites and attack-ui.json (dumped from
// the game's AttackEntryAssetRegistry by scripts/attack-ui/dump-registry.py) from drifting apart —
// CSS can't read the JSON, so the numbers are repeated there and pinned here.

const CSS = readFileSync(fileURLToPath(new URL('../../../css/index.css', import.meta.url)), 'utf8');
const OPTIONS_CSS = readFileSync(fileURLToPath(new URL('../../../css/attack-options.css', import.meta.url)), 'utf8');
const ASSET_DIR = fileURLToPath(new URL('../../../assets/attack-ui/', import.meta.url));
const TABLE = JSON.parse(readFileSync(`${ASSET_DIR}attack-ui.json`, 'utf8'));

const normalized = [CSS, OPTIONS_CSS].join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
// Every rule for exactly this selector, bodies joined: a variant may be split over two rules.
const ruleFor = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g');
  const bodies = [...normalized.matchAll(pattern)].map((match) => match[1]);
  return bodies.length ? bodies.join(' ') : null;
};

describe('attack-ui sprites', () => {
  it('every sprite the import script writes is committed', () => {
    for (const { out } of spriteMap()) assert.ok(existsSync(`${ASSET_DIR}${out}`), `${out} is missing`);
  });

  it('every HUD sprite dump-registry.py exports is committed at its full sprite rect', () => {
    const hud = Object.entries(TABLE.hud ?? {});
    assert.ok(hud.length >= 15, 'expected the design 074 HUD sprites');
    for (const [sprite, file] of hud) {
      assert.ok(existsSync(`${ASSET_DIR}${file}`), `${file} is missing`);
      const png = readFileSync(`${ASSET_DIR}${file}`);
      const size = [png.readUInt32BE(16), png.readUInt32BE(20)];
      const rect = TABLE.borders[sprite];
      assert.deepEqual(size, [rect.width, rect.height], `${file} is not ${sprite}'s rect`);
    }
  });

  it('every type has a filled and an empty cost icon', () => {
    for (const key of [...Object.keys(TYPE_GLOW), 'rainbow', 'plus']) {
      assert.ok(existsSync(`${ASSET_DIR}type-${key}.png`), `type-${key}.png`);
      assert.ok(existsSync(`${ASSET_DIR}type-${key}-empty.png`), `type-${key}-empty.png`);
    }
    assert.ok(existsSync(`${ASSET_DIR}type-empty.png`));
  });

  it('every attack-ui url in index.css and attack-options.css points at a committed sprite', () => {
    const urls = [...`${CSS}
${OPTIONS_CSS}`.matchAll(/url\('\.\.\/assets\/attack-ui\/([^']+)'\)/g)].map((m) => m[1]);
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
      const decls = ruleFor(`[data-ptcg-type='${key}']`);
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
    assert.match(ruleFor('.tcgl-retreat'), /--atk-retreat-slice: 12 15 12 15;/);
    assert.match(ruleFor('.tcgl-retreat--off'), /--atk-retreat-slice: 15;/);
  });

  it('the damage tab slices match each variant sprite', () => {
    // [sprite, rule selector, left, right, whether the rule restates the left border]
    const variants = [
      ['atkOv_DmgBG', '.tcgl-opt__bar', 33, 24, true],
      ['atkOv_DmgBG_Short', '.tcgl-opt--text .tcgl-opt__bar', 34, 24, true],
      ['atkOv_DmgBG_Empty', '.tcgl-opt--off .tcgl-opt__bar', 37, 20, true],
      ['atkOv_DmgBG_Empty_Short', '.tcgl-opt--off.tcgl-opt--text .tcgl-opt__bar', 37, 27, false],
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

  // The tab's seam backing draws the whole sprite at its slice density, so --atk-dmg-w must be the
  // sprite's real width or the backing's art drifts off the sliced art above it.
  it('every damage tab variant states its sprite width beside its source', () => {
    const variants = [...OPTIONS_CSS.matchAll(/--atk-dmg: url\('\.\.\/assets\/attack-ui\/([\w-]+\.png)'\);\s*([^}]*)/g)];
    assert.ok(variants.length >= 8, 'expected the eight damage tab sprites');
    for (const [, file, rest] of variants) {
      const stated = /--atk-dmg-w: (\d+);/.exec(rest);
      assert.ok(stated, `${file} has no --atk-dmg-w`);
      const width = readFileSync(`${ASSET_DIR}${file}`).readUInt32BE(16);
      assert.equal(Number(stated[1]), width, file);
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

  it('VSTAR bars and damage tabs are the registry sprites, sliced on their borders', () => {
    const { vstar, borders } = TABLE;
    assert.deepEqual(
      [vstar.titlebar, vstar.titlebarShort, vstar.dmg, vstar.dmgShort, vstar.dmgEmpty, vstar.dmgEmptyShort],
      [
        'atkOV_Titlebar_VStar',
        'atkOV_Titlebar_VStar_Short',
        'atkOv_DmgBG_VStar',
        'atkOv_DmgBG_VStar_Short',
        'atkOv_DmgBG_Empty_VStar',
        'atkOv_DmgBG_Empty_VStar_Short',
      ]
    );
    for (const name of [vstar.titlebar, vstar.titlebarShort]) {
      const b = borders[name];
      assert.deepEqual([b.left, b.right, b.height], [28, 878, 173], name);
    }
    assert.match(normalized, /bar-vstar\.png'\) 0 878 0 28 fill/);
    assert.equal(vstar.ink, '#ffffff');
    assert.equal(vstar.inkOff, '#000000');

    // [sprite, rule selector, left, right, whether the rule restates the left border]
    const tabs = [
      [vstar.dmg, '.tcgl-opt--vstar .tcgl-opt__bar', 41, 22, true],
      [vstar.dmgShort, '.tcgl-opt--vstar.tcgl-opt--text .tcgl-opt__bar', 44, 22, true],
      [vstar.dmgEmpty, '.tcgl-opt--vstar.tcgl-opt--off .tcgl-opt__bar', 32, 26, true],
      [vstar.dmgEmptyShort, '.tcgl-opt--vstar.tcgl-opt--text.tcgl-opt--off .tcgl-opt__bar', 32, 32, false],
    ];
    for (const [sprite, selector, left, right, restatesLeft] of tabs) {
      const b = borders[sprite];
      assert.deepEqual([b.left, b.right], [left, right], sprite);
      const decls = ruleFor(selector);
      assert.ok(decls, `no rule for ${selector}`);
      assert.match(decls, new RegExp(`--atk-dmg-r: ${right};`), selector);
      if (restatesLeft) assert.match(decls, new RegExp(`--atk-dmg-l: ${left};`), selector);
    }
  });

  it('the passive ability header masks on the atkOv_Ability_BG borders', () => {
    const b = TABLE.borders.atkOv_Ability_BG;
    assert.deepEqual([b.top, b.right, b.bottom, b.left], [13, 16, 3, 16]);
    const decls = ruleFor('.tcgl-opt--passive .tcgl-opt__bar::before');
    assert.ok(decls, 'no passive ability header rule');
    // Sliced 1px in on the top and sides: the game borders fill the 32 x 16 sprite exactly.
    assert.match(decls, /mask-border: url\('\.\.\/assets\/attack-ui\/ability-bg\.png'\) 12 15 3 15 fill/);
  });

  // Unity stretches a zero-size centre; CSS draws no edges or centre at all, so a sprite sliced
  // through its whole width or height shows only its four corners.
  it('every sliced sprite keeps a centre to stretch', () => {
    const sliced = /url\('\.\.\/assets\/attack-ui\/([\w-]+\.png)'\) ((?:\d+ ?){1,4}) fill/g;
    const uses = [...OPTIONS_CSS.matchAll(sliced)];
    assert.ok(uses.length >= 5, 'expected the row, shadow, mask and bar slices');
    for (const [, file, slices] of uses) {
      const png = readFileSync(`${ASSET_DIR}${file}`);
      const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
      const [top, right = top, bottom = top, left = right] = slices.trim().split(' ').map(Number);
      assert.ok(left + right < width, `${file} ${slices.trim()} leaves no centre column`);
      assert.ok(top + bottom < height, `${file} ${slices.trim()} leaves no centre row`);
    }
  });

  it("an unusable attack bar is the registry's cantUse grey with black ink", () => {
    assert.deepEqual(TABLE.cantUse, { bar: '#d4d4d4', ink: '#000000' });
    const decls = ruleFor('.tcgl-opt--off .tcgl-opt__bar');
    assert.match(decls, /background: #d4d4d4;/);
    assert.match(decls, /--name-ink: #000000;/);
  });
});
