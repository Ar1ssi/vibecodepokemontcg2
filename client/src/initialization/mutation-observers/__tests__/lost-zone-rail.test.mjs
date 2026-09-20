import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Static contracts for the host-level Lost Zone rail. There is no jsdom
// harness for the client wiring in this repo, so this asserts on the source
// text: the rail must be docked outside the battle mat on the right screen
// edge, and it must drive the existing `lostZone` zone rather than inventing
// a parallel model.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CSS_DIR = path.resolve(HERE, '../../../css');
const MODULE_DIR = path.resolve(HERE, '..');

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const normalize = (css) => stripComments(css).replace(/\s+/g, ' ').trim();

const ruleBody = (css, selector) => {
  for (const match of normalize(css).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = match[1].split(',').map((part) => part.trim());
    if (selectors.includes(selector)) return match[2];
  }
  return null;
};

const INDEX_CSS = readFileSync(path.join(CSS_DIR, 'index.css'), 'utf8');
const PANEL_SRC = readFileSync(path.join(MODULE_DIR, 'lost-zone-panel.js'), 'utf8');
const INIT_SRC = readFileSync(path.join(MODULE_DIR, 'initialize-mutation-observers.js'), 'utf8');
const DRAG_SRC = readFileSync(
  path.resolve(MODULE_DIR, '../../setup/image-logic/drag.js'),
  'utf8'
);

describe('Lost Zone rail — positioned beside the mat', () => {
  const body = ruleBody(INDEX_CSS, '#lostZoneRail');

  it('is positioned in the board area to the right of the mat', () => {
    assert.ok(body, '#lostZoneRail rule is missing from index.css');
    assert.match(body, /position:\s*fixed/);
    assert.match(body, /left:\s*60%/);
  });

  it('is laid out in the screen frame, not the mat frame', () => {
    assert.match(body, /top:\s*28vh/);
    assert.match(body, /height:\s*52vh/);
  });

  it('draws above the sidebox but below the top tab bar', () => {
    const z = Number((body.match(/z-index:\s*(\d+)/) || [])[1]);
    assert.ok(Number.isFinite(z), 'rail needs a numeric z-index');
    assert.ok(z > 1300 && z < 1400, `rail z-index ${z} should sit between sidebox (1300) and tabs (1400)`);
  });
});

describe('Lost Zone rail — wired to the existing zone', () => {
  it('exports an initializer', () => {
    assert.match(PANEL_SRC, /export const initializeLostZonePanel/);
  });

  it('reads and opens the shared lostZone zone', () => {
    assert.match(PANEL_SRC, /getZone\([^)]*'lostZone'\)/);
    assert.match(PANEL_SRC, /\.element\.style\.display = 'block'/);
  });

  it('counts rendered cards, not just the legacy zone array', () => {
    // Design 002 I24: legacy zone arrays stay empty under server-authoritative
    // rendering, so a getCount()-only rail would always show 0 online.
    assert.match(PANEL_SRC, /occupiedZoneCount\(/);
    assert.match(PANEL_SRC, /renderedCount:\s*source\.length/);
  });

  it('observes both players\' lostZone elements', () => {
    assert.match(PANEL_SRC, /selfContainerDocument\.getElementById\('lostZone'\)/);
    assert.match(PANEL_SRC, /oppContainerDocument\.getElementById\('lostZone'\)/);
  });

  it('is registered by the mutation-observer bootstrap', () => {
    assert.match(INIT_SRC, /import \{ initializeLostZonePanel \}/);
    assert.match(INIT_SRC, /initializeLostZonePanel\(\)/);
  });
});

describe('Lost Zone rail — accepts drag/drop as an in-mat lostZone drop', () => {
  it('declares an explicit drop destination per side', () => {
    assert.match(PANEL_SRC, /data-drop-zone="lostZone"/);
    assert.match(PANEL_SRC, /data-drop-user="self"/);
    assert.match(PANEL_SRC, /data-drop-user="opp"/);
  });

  it("reuses the board's own dragover/drop handlers", () => {
    assert.match(PANEL_SRC, /import \{ dragLeave, dragOver, drop \} from '\.\.\/\.\.\/setup\/image-logic\/drag\.js'/);
    assert.match(PANEL_SRC, /addEventListener\('dragover', dragOver\)/);
    assert.match(PANEL_SRC, /addEventListener\('drop', drop\)/);
  });

  it('resolves the explicit destination in the shared drop handler', () => {
    assert.match(DRAG_SRC, /\[data-drop-zone\]/);
    assert.match(DRAG_SRC, /explicitDrop\.dataset\.dropZone/);
    assert.match(DRAG_SRC, /explicitDrop\.dataset\.dropUser !== mouseClick\.cardUser/);
  });
});
