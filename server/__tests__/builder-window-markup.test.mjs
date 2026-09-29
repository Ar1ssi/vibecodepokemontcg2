import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

// Renders client/index.ejs with the locals server.js passes for each route, so the
// Elite Trainer Box tabs (design 057 row 13) appear only in the Standard builder tab.
const templatePath = fileURLToPath(new URL('../../client/index.ejs', import.meta.url));
const template = readFileSync(templatePath, 'utf8');

const render = (locals) =>
  ejs.render(template, { importDataJSON: null, e2eAllowed: false, ...locals }, { filename: templatePath });

const ETB_IDS = ['etbTabShelf', 'etbTabCollection', 'etbShelfPanel', 'etbCollectionPanel'];
const hasId = (html, id) => html.includes(`id="${id}"`);

test('row 13: the Standard builder tab carries the Shelf and Collection', () => {
  const html = render({ builderWindow: true });
  for (const id of ETB_IDS) assert.ok(hasId(html, id), id);
  assert.match(html, /<body class="deck-builder-window etb-host">/);
  assert.ok(!hasId(html, 'buildBattleTabBox'));
});

test('row 13: the Build & Battle tab and the game page carry no ETB markup', () => {
  const buildBattle = render({ builderWindow: true, builderMode: 'build-battle' });
  const game = render({});
  for (const id of ETB_IDS) {
    assert.ok(!hasId(buildBattle, id), `B&B: ${id}`);
    assert.ok(!hasId(game, id), `game: ${id}`);
  }
  assert.ok(hasId(buildBattle, 'buildBattleTabBox'), 'the B&B tab keeps its Box tab');
  assert.ok(!buildBattle.includes('etb-host') && !game.includes('etb-host'));
});
