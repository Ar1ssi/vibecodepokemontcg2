import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isShinySource, orderHomebrewSetCards, usesHomebrewDisplayOrder } from '../homebrew-display-order.mjs';

// Card shapes copied from the published customhb set (ptcg-sim.onrender.com /api/tcgdex/v2/en/sets/customhb,
// 2026-11-23): number, name, first type, stage, evolveFrom and cardback source.
function pokemon(localId, name, type, stage, evolveFrom, source = 'sv01-001') {
  return { id: `customhb-${localId}`, localId, name, category: 'Pokemon', types: [type], stage, evolveFrom, custom: { source } };
}

const names = (cards) => cards.map((card) => `${card.name} ${card.localId}`);

test('only the Homebrew set is re-sorted', () => {
  assert.equal(usesHomebrewDisplayOrder('customhb'), true);
  assert.equal(usesHomebrewDisplayOrder('customhbw'), false);
});

test('shiny sources: Shiny Vault numbers and Paldean Fates from 092 (TCGdex sv04.5-092 is "Shiny rare")', () => {
  assert.equal(isShinySource('sma-SV38'), true);
  assert.equal(isShinySource('swsh4.5sv-SV060'), true);
  assert.equal(isShinySource('sv04.5-092'), true);
  assert.equal(isShinySource('sv04.5-182'), true);
  assert.equal(isShinySource('sv04.5-091'), false);
  assert.equal(isShinySource('sv04.5-054'), false);
  assert.equal(isShinySource('bw6-87'), false);
  assert.equal(isShinySource(undefined), false);
  assert.equal(isShinySource('nodash'), false);
});

test('Mega Charizards sit after the Fire Charizard ex; the Tera Charizard ex goes to Darkness', () => {
  const cards = [
    pokemon('496', 'Charizard ex', 'Darkness', 'TERAHB', 'Charizard'),
    pokemon('440', 'Mega Charizard X ex', 'Dragon', 'MEGAHB', 'Charizard'),
    pokemon('439', 'Mega Charizard Y ex', 'Fire', 'MEGAHB', 'Charizard'),
    pokemon('073', 'Charmander', 'Fire', 'Basic'),
    pokemon('074', 'Charmeleon', 'Fire', 'Stage1', 'Charmander'),
    pokemon('075', 'Charizard ex', 'Fire', 'Stage2', 'Charmeleon'),
  ];
  assert.deepEqual(names(orderHomebrewSetCards(cards)), [
    'Charizard ex 496',
    'Charmander 073',
    'Charmeleon 074',
    'Charizard ex 075',
    'Mega Charizard Y ex 439',
    'Mega Charizard X ex 440',
  ]);
});

test('Absol ex and Darkrai ex come before their MEGAs', () => {
  const cards = [
    pokemon('240', 'Absol', 'Darkness', 'Basic'),
    pokemon('447', 'Mega Absol ex', 'Darkness', 'MEGAHB', 'Absol'),
    pokemon('757', 'Mega Absol Z ex', 'Psychic', 'MEGAHB', 'Absol'),
    pokemon('241', 'Absol ex', 'Darkness', 'Basic'),
    pokemon('237', 'Darkrai', 'Darkness', 'Basic'),
    pokemon('449', 'Mega Darkrai ex', 'Darkness', 'MEGAHB', 'Darkrai'),
    pokemon('432', 'Darkrai ex', 'Darkness', 'Basic'),
  ];
  assert.deepEqual(names(orderHomebrewSetCards(cards)), [
    'Absol 240',
    'Absol ex 241',
    'Mega Absol ex 447',
    'Mega Absol Z ex 757',
    'Darkrai 237',
    'Darkrai ex 432',
    'Mega Darkrai ex 449',
  ]);
});

test('a MEGA printed at Stage 2 still follows the regular Stage 2 cards', () => {
  const cards = [
    pokemon('445', 'Mega Gengar ex', 'Darkness', 'Stage2', 'Haunter'),
    pokemon('070', 'Gengar ex', 'Darkness', 'Stage2', 'Haunter'),
    pokemon('239', 'Gengar', 'Darkness', 'Stage2', 'Haunter'),
    pokemon('069', 'Haunter', 'Darkness', 'Stage1', 'Gastly'),
    pokemon('068', 'Gastly', 'Darkness', 'Basic'),
  ];
  assert.deepEqual(names(orderHomebrewSetCards(cards)), ['Gastly 068', 'Haunter 069', 'Gengar 239', 'Gengar ex 070', 'Mega Gengar ex 445']);
});

test('a line with a shiny printing lists the regular line whole, then the shiny line', () => {
  const cards = [
    pokemon('038', 'Gible', 'Dragon', 'Basic', undefined, 'bw6-87'),
    pokemon('663', 'Gible', 'Dragon', 'Basic', undefined, 'sma-SV38'),
    pokemon('039', 'Gabite', 'Dragon', 'Stage1', 'Gible', 'bw6-89'),
    pokemon('664', 'Gabite', 'Dragon', 'Stage1', 'Gible', 'sma-SV39'),
    pokemon('041', 'Garchomp', 'Dragon', 'Stage2', 'Gabite'),
    pokemon('620', 'Garchomp', 'Dragon', 'Stage2', 'Gabite', 'sma-SV40'),
    pokemon('482', 'Gible', 'Fighting', 'Basic'),
    pokemon('483', 'Gabite', 'Fighting', 'Stage1', 'Gible'),
    pokemon('758', 'Mega Garchomp Z ex', 'Dragon', 'MEGAHB', 'Garchomp'),
  ];
  assert.deepEqual(names(orderHomebrewSetCards(cards)), [
    'Gible 038',
    'Gabite 039',
    'Garchomp 041',
    'Gible 482',
    'Gabite 483',
    'Mega Garchomp Z ex 758',
    'Gible 663',
    'Gabite 664',
    'Garchomp 620',
  ]);
});

test('two shiny printings of one line stay whole lines', () => {
  const cards = [
    pokemon('217', 'Riolu', 'Fighting', 'Basic', undefined, 'me02.5-112'),
    pokemon('642', 'Riolu', 'Fighting', 'Basic', undefined, 'sv04.5-173'),
    pokemon('656', 'Riolu', 'Fighting', 'Basic', undefined, 'sma-SV21'),
    pokemon('643', 'Lucario', 'Fighting', 'Stage1', 'Riolu', 'sv04.5-174'),
    pokemon('657', 'Lucario', 'Fighting', 'Stage1', 'Riolu', 'sma-SV22'),
  ];
  assert.deepEqual(names(orderHomebrewSetCards(cards)), ['Riolu 217', 'Riolu 642', 'Lucario 643', 'Riolu 656', 'Lucario 657']);
});

test("Eevee's evolutions and Tera Pokémon are listed under their own type", () => {
  const cards = [
    pokemon('719', 'Vaporeon', 'Water', 'Stage1', 'Eevee'),
    pokemon('717', 'Eevee', 'Colorless', 'Basic'),
    pokemon('718', 'Flareon', 'Fire', 'Stage1', 'Eevee'),
    pokemon('500', 'Dragonite ex', 'Colorless', 'TERAHB', 'Dragonite'),
    pokemon('033', 'Dratini', 'Dragon', 'Basic'),
    pokemon('035', 'Dragonite', 'Dragon', 'Stage2', 'Dragonair'),
    pokemon('034', 'Dragonair', 'Dragon', 'Stage1', 'Dratini'),
    pokemon('818', 'Arcanine', 'Fire', 'Stage1', 'Growlithe'),
    pokemon('817', 'Growlithe', 'Fire', 'Basic'),
  ];
  assert.deepEqual(names(orderHomebrewSetCards(cards)), [
    'Dragonite ex 500',
    'Eevee 717',
    'Dratini 033',
    'Dragonair 034',
    'Dragonite 035',
    'Flareon 718',
    'Growlithe 817',
    'Arcanine 818',
    'Vaporeon 719',
  ]);
});

test('a MEGA follows an off-type ex of its family (Mawile, Mawile ex Fairy, Mega Mawile ex)', () => {
  const cards = [
    pokemon('448', 'Mega Mawile ex', 'Metal', 'MEGAHB', 'Mawile'),
    pokemon('407', 'Mawile ex', 'Fairy', 'Basic'),
    pokemon('156', 'Mawile', 'Metal', 'Basic'),
  ];
  assert.deepEqual(names(orderHomebrewSetCards(cards)), ['Mawile 156', 'Mawile ex 407', 'Mega Mawile ex 448']);
});

test('Trainers and Energy keep their places; bad input is an empty list', () => {
  const trainer = { id: 'customhb-192', localId: '192', name: 'Fairy Charm', category: 'Trainer' };
  const energy = { id: 'customhb-830', localId: '830', name: 'Legacy Energy', category: 'Energy' };
  const cards = [pokemon('074', 'Charmeleon', 'Fire', 'Stage1', 'Charmander'), pokemon('073', 'Charmander', 'Fire', 'Basic'), trainer, energy];
  const ordered = orderHomebrewSetCards(cards);
  assert.deepEqual(names(ordered), ['Charmander 073', 'Charmeleon 074', 'Fairy Charm 192', 'Legacy Energy 830']);
  assert.equal(ordered[2], trainer);
  assert.deepEqual(orderHomebrewSetCards(null), []);
});
