import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Design 046 static contracts. The board glow and the drop hovers live in both
// playmat iframes' sheets (each iframe loads only its own), and drag.js names
// the class they style.
const CSS_DIR = fileURLToPath(new URL('../../../css/', import.meta.url));
const SHEETS = ['self-containers.css', 'opp-containers.css'];

const normalize = (css) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
const readCss = (name) => normalize(readFileSync(`${CSS_DIR}${name}`, 'utf8'));

const ruleBody = (css, selector) => {
  for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = match[1].split(',').map((part) => part.trim());
    if (selectors.includes(selector)) return match[2];
  }
  return null;
};

test('drag.js marks the board with the class the sheets style', () => {
  const drag = readFileSync(fileURLToPath(new URL('../drag.js', import.meta.url)), 'utf8');
  assert.match(drag, /BOARD_READY_CLASS = 'board-drop-ready'/);
});

for (const sheet of SHEETS) {
  test(`${sheet}: a held Trainer makes the board breathe`, () => {
    const css = readCss(sheet);
    assert.match(css, /@keyframes board-ready-breathe/);
    assert.match(ruleBody(css, '#board.board-drop-ready') ?? '', /animation: board-ready-breathe/);
  });

  test(`${sheet}: hovering the board swaps the breathing for the well`, () => {
    const body = ruleBody(readCss(sheet), '#board.highlightBox') ?? '';
    assert.match(body, /animation: none/);
    assert.match(body, /box-shadow: var\(--drop-well\)/);
  });

  test(`${sheet}: a hovered zone outranks the mat's plate reset`, () => {
    const css = readCss(sheet);
    const selector = css.match(/body\.mat-active :is\(\.highlight, \.highlightBox\):is\(([^)]*)\)/);
    assert.ok(selector, 'mat override missing');
    for (const zone of ['#active', '#bench', '#discard']) assert.ok(selector[1].includes(zone), zone);
  });

  test(`${sheet}: the card ring breathes on its bevel`, () => {
    const css = readCss(sheet);
    assert.match(css, /--drop-ring:/);
    assert.match(ruleBody(css, '.highlight') ?? '', /box-shadow: var\(--drop-ring\)/);
  });
}
