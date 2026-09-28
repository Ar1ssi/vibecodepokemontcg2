import test from 'node:test';
import assert from 'node:assert/strict';

import { bakeBoxData, bakeSet } from '../build-battle/bake-box.mjs';
import { energyNeeds, parseBoxLine, resolveCardNumber } from '../build-battle/box-lines.mjs';
import { parseBoxPage, promosFromList } from '../build-battle/import-bulbapedia-box.mjs';
import { renderBoxModule, renderSetModule } from '../lib/build-battle-modules.mjs';

// An offline TCGdex: sets list their cards, cards come from `cards`, art HEADs from `live`.
function stubTcgdex({ sets = {}, cards = {}, live = new Set() } = {}) {
  const fetched = [];
  return {
    fetched,
    fetchSet: async (id) => {
      if (!sets[id]) throw new Error(`TCGdex has no https://api.tcgdex.net/v2/en/sets/${id} (404)`);
      return sets[id];
    },
    fetchCard: async (id) => {
      fetched.push(id);
      if (!cards[id]) throw new Error(`no card ${id}`);
      return cards[id];
    },
    headOk: async (url) => live.has(url),
  };
}

const tcgCard = (id, name, extra = {}) => {
  const [setId, localId] = [id.slice(0, id.lastIndexOf('-')), id.slice(id.lastIndexOf('-') + 1)];
  return {
    id,
    localId,
    name,
    category: 'Pokemon',
    rarity: 'Common',
    stage: 'Basic',
    types: ['Fire'],
    hp: 60,
    image: `https://assets.tcgdex.net/en/sm/${setId}/${localId}`,
    set: { id: setId, name: setId.toUpperCase() },
    ...extra,
  };
};

const setOf = (id, cards, extra = {}) => ({
  id,
  name: id.toUpperCase(),
  serie: { id: 'sm' },
  releaseDate: '2019-01-01',
  cardCount: { official: cards.length },
  logo: `https://assets.tcgdex.net/en/sm/${id}/logo`,
  cards: cards.map(({ id: cardId, localId, name }) => ({ id: cardId, localId, name })),
  ...extra,
});

test('parseBoxLine reads counts, ranges, alternative prints and Basic Energy', () => {
  assert.deepEqual(parseBoxLine('3 Ponyta TEU 17'), { min: 3, max: 3, fixed: true, name: 'Ponyta', setCode: 'TEU', numbers: [17] });
  assert.deepEqual(parseBoxLine('0-2 Copycat CES 127'), { min: 0, max: 2, fixed: false, name: 'Copycat', setCode: 'CES', numbers: [127] });
  assert.deepEqual(parseBoxLine("1 Professor's Research SVI 189/190").numbers, [189, 190]);
  assert.deepEqual(parseBoxLine('17 Basic Fire Energy'), { min: 17, max: 17, fixed: true, energy: 'Basic Fire Energy' });
  assert.equal(parseBoxLine("2 Team Rocket's Great Ball DRI 175").name, "Team Rocket's Great Ball");
  assert.throws(() => parseBoxLine('3 Ponyta ZZZ 17'), /Unknown set code ZZZ/);
  assert.throws(() => parseBoxLine('2-1 Ponyta TEU 17'), /Bad copy range/);
  assert.throws(() => parseBoxLine('Ponyta'), /Could not parse/);
});

test('a number matches the localId numerically; a wrong name or number throws', async () => {
  const promo = tcgCard('smp-SM158', 'Charizard');
  const tcgdex = stubTcgdex({
    sets: {
      smp: setOf('smp', [tcgCard('smp-SM15', 'Other'), promo, tcgCard('smp-SM158a', 'Variant')]),
      sv01: setOf('sv01', [tcgCard('sv01-005', 'Five'), tcgCard('sv01-050', 'Fifty')]),
    },
    cards: { 'smp-SM158': promo, 'sv01-005': tcgCard('sv01-005', 'Five') },
  });
  assert.equal((await resolveCardNumber({ setCode: 'SMP', number: 158, name: 'Charizard' }, tcgdex)).id, 'smp-SM158');
  assert.equal((await resolveCardNumber({ setCode: 'SVI', number: 5, name: 'Five' }, tcgdex)).id, 'sv01-005');
  await assert.rejects(
    resolveCardNumber({ setCode: 'SMP', number: 158, name: 'Blastoise' }, tcgdex),
    /smp-SM158 is "Charizard", decklist says "Blastoise"/
  );
  await assert.rejects(resolveCardNumber({ setCode: 'SVI', number: 7, name: 'Seven' }, tcgdex), /0 cards in sv01/);
});

test('energyNeeds weighs every typed attack cost by copies, leaving Colorless and Trainers out', () => {
  const attacker = (cost) => ({ category: 'Pokemon', attacks: [{ cost }] });
  assert.deepEqual(
    energyNeeds([
      { card: attacker(['Fire', 'Colorless']), copies: 3 },
      { card: attacker(['Water', 'Fire']), copies: 2 },
      { card: attacker(['Colorless']), copies: 4 },
      { card: { category: 'Trainer' }, copies: 2 },
      { card: attacker(['Dragon']), copies: 1 },
    ]),
    [
      ['Basic Fire Energy', 5],
      ['Basic Water Energy', 2],
    ]
  );
  assert.deepEqual(energyNeeds([]), []);
});

// ── A tiny Evolution box on a stubbed TCGdex ───────────────────────────────────────────────────
const teu = Array.from({ length: 30 }, (_, index) => tcgCard(`sm9-${index + 1}`, `Card ${index + 1}`));
const firePokemon = (id, name) => tcgCard(id, name, { attacks: [{ cost: ['Fire', 'Colorless'] }] });
teu[0] = firePokemon('sm9-1', 'Charmander');
teu[1] = tcgCard('sm9-2', 'Blitzle', { attacks: [{ cost: ['Lightning'] }] });
const promos = ['SM158', 'SM159', 'SM160', 'SM161'].map((localId, index) =>
  tcgCard(`smp-${localId}`, ['Charizard', 'Zapdos', 'Nidoqueen', 'Jirachi'][index], {
    rarity: 'Promo',
    attacks: [{ cost: [['Fire'], ['Lightning'], ['Psychic'], ['Metal']][index] }],
  })
);
const stub = () =>
  stubTcgdex({
    sets: { sm9: setOf('sm9', teu), smp: setOf('smp', promos) },
    cards: Object.fromEntries([...teu, ...promos].map((card) => [card.id, card])),
  });
const evoBox = {
  key: 'test-box',
  name: 'Test Build & Battle Box',
  setId: 'sm9',
  kind: 'evolution-deck',
  packModelKey: 'sm',
  decks: ['charizard', 'zapdos', 'nidoqueen', 'jirachi'].map((key, index) => ({
    key,
    name: key,
    promoId: promos[index].id,
  })),
};
const group = (start) => [`3 Card ${start} TEU ${start}`, `3 Card ${start + 1} TEU ${start + 1}`, `3 Card ${start + 2} TEU ${start + 2}`];
const evoSource = (extra = {}) => ({
  key: 'test-box',
  source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Test_(TCG)', revision: 1 },
  promos: {
    charizard: '1 Charizard SMP 158',
    zapdos: '1 Zapdos SMP 159',
    nidoqueen: '1 Nidoqueen SMP 160',
    jirachi: '1 Jirachi SMP 161',
  },
  groups: {
    charizard: ['3 Charmander TEU 1', '1-2 Card 3 TEU 3', '5 Card 4 TEU 4'],
    zapdos: ['3 Blitzle TEU 2', ...group(5).slice(0, 2)],
    nidoqueen: group(10),
    jirachi: group(20),
  },
  trainers: [{ name: 'Supporter cards', count: null, cards: ['0-2 Card 26 TEU 26', '0-2 Card 27 TEU 27', '0-2 Card 28 TEU 28'] }],
  ...extra,
});

test('bakeBoxData resolves an Evolution box: promos, groups with ranges, pools, Energy needs', async () => {
  const data = await bakeBoxData(evoBox, evoSource(), stub());
  assert.deepEqual(Object.keys(data), ['kind', 'cards', 'promos', 'groups', 'trainers', 'energyNeeds']);
  assert.equal(data.promos.charizard, 'smp-SM158');
  assert.deepEqual(data.groups.charizard, [
    { id: 'sm9-1', qty: 3 },
    { id: 'sm9-3', min: 1, max: 2 },
    { id: 'sm9-4', qty: 5 },
  ]);
  assert.deepEqual(data.trainers[0].cards[0], { id: 'sm9-26', min: 0, max: 2 });
  assert.deepEqual(data.energyNeeds.charizard, [['Basic Fire Energy', 4]], 'promo 1 + Charmander 3');
  assert.deepEqual(data.energyNeeds.zapdos, [['Basic Lightning Energy', 4]]);
  assert.equal(data.cards[0].id, 'smp-SM158', 'cards in line order: promos first');
  assert.equal(new Set(data.cards.map((card) => card.id)).size, data.cards.length);
  assert.match(renderBoxModule({ name: 'Test', source: { url: 'u', revision: 1 } }, data), /^\/\/ AUTO-GENERATED/);
});

test('row 4: a pairing the pools cannot fill makes the generator refuse the box, naming it', async () => {
  const tooBig = evoSource({ groups: { ...evoSource().groups, jirachi: ['16 Card 20 TEU 20'] } });
  await assert.rejects(bakeBoxData(evoBox, tooBig, stub()), (err) => {
    assert.match(err.message, /test-box cannot open every pairing/);
    assert.match(err.message, /jirachi \+ nidoqueen \(26 fixed cards\): needs -3 Trainers/);
    return true;
  });
});

test('the generator refuses a promo line that is not the catalog promo, and keys that differ', async () => {
  const wrongPromo = evoSource({ promos: { ...evoSource().promos, zapdos: '1 Charizard SMP 158' } });
  await assert.rejects(bakeBoxData(evoBox, wrongPromo, stub()), /zapdos: promo line gives 1 × smp-SM158, catalog says smp-SM159/);
  const { jirachi: _jirachi, ...threeGroups } = evoSource().groups;
  await assert.rejects(bakeBoxData(evoBox, evoSource({ groups: threeGroups }), stub()), /group keys/);
  await assert.rejects(bakeBoxData(evoBox, { ...evoSource(), key: 'other' }, stub()), /source other is not box test-box/);
});

test('a fixed-decks box needs 40 cards and its promo once per deck', async () => {
  const fixedBox = { ...evoBox, kind: 'fixed-decks', decks: evoBox.decks.slice(0, 1).concat(evoBox.decks.slice(1)) };
  const deck = (promoLine) => [promoLine, '12 Charmander TEU 1', '12 Blitzle TEU 2', '15 Basic Fire Energy'];
  const source = {
    key: 'test-box',
    source: { url: 'https://bulbapedia.bulbagarden.net/wiki/Test_(TCG)', revision: 1 },
    decks: {
      charizard: deck('1 Charizard SMP 158'),
      zapdos: deck('1 Zapdos SMP 159'),
      nidoqueen: deck('1 Nidoqueen SMP 160'),
      jirachi: deck('1 Jirachi SMP 161'),
    },
  };
  const data = await bakeBoxData(fixedBox, source, stub());
  assert.deepEqual(data.decks.charizard.at(-1), { id: 'sve-002', qty: 15 });
  assert.equal(data.cards.find((card) => card.id === 'sve-002').category, 'Energy');
  const short = { ...source, decks: { ...source.decks, zapdos: deck('1 Zapdos SMP 159').slice(0, 3) } };
  await assert.rejects(bakeBoxData(fixedBox, short, stub()), /zapdos: 25 cards, not 40/);
});

test('bakeSet: rows sorted by localId, art only when TCGdex has none, official count required', async () => {
  const noArt = tcgCard('sm9-3', 'Card 3', { image: undefined, rarity: 'Ultra Rare' });
  const cards = [tcgCard('sm9-10', 'Ten'), tcgCard('sm9-2', 'Two'), noArt];
  const live = new Set(['https://images.pokemontcg.io/sm9/3_hires.png']);
  const tcgdex = stubTcgdex({
    sets: { sm9: setOf('sm9', cards) },
    cards: Object.fromEntries(cards.map((card) => [card.id, card])),
    live,
  });
  const { set, rows } = await bakeSet({ setId: 'sm9', packModelKey: 'sm' }, tcgdex);
  assert.deepEqual(set, {
    id: 'sm9',
    name: 'SM9',
    series: 'sm',
    releaseDate: '2019-01-01',
    official: 3,
    logo: 'https://assets.tcgdex.net/en/sm/sm9/logo',
    symbol: undefined,
  });
  assert.deepEqual(rows.map((row) => row.id), ['sm9-2', 'sm9-3', 'sm9-10']);
  assert.deepEqual(rows[1].images, { small: 'https://images.pokemontcg.io/sm9/3.png', large: 'https://images.pokemontcg.io/sm9/3_hires.png' });
  assert.equal('images' in rows[0], false);
  assert.match(renderSetModule(set, rows), /export const SET = \{"id":"sm9"/);

  live.clear();
  await assert.rejects(bakeSet({ setId: 'sm9', packModelKey: 'sm' }, tcgdex), /sm9-3: no art on TCGdex or/);
  const noCount = stubTcgdex({ sets: { sm9: setOf('sm9', [], { cardCount: {} }) } });
  await assert.rejects(bakeSet({ setId: 'sm9', packModelKey: 'sm' }, noCount), /no official card count/);
});

test('row 21: a Trainer Gallery box appends its gallery rows, and refuses to bake without them', async () => {
  const main = [tcgCard('swsh9-1', 'One')];
  const gallery = [tcgCard('swsh9tg-TG01', 'Flareon', { rarity: 'Rare' })];
  const tcgdex = stubTcgdex({
    sets: {
      swsh9: setOf('swsh9', main),
      swsh9tg: { ...setOf('swsh9tg', gallery), name: 'Brilliant Stars Trainer Gallery' },
    },
    cards: Object.fromEntries([...main, ...gallery].map((card) => [card.id, card])),
  });
  const { set, rows } = await bakeSet({ setId: 'swsh9', packModelKey: 'swsh-tg' }, tcgdex);
  assert.deepEqual(set.subsets, { swsh9tg: { name: 'Brilliant Stars Trainer Gallery' } });
  assert.deepEqual(rows.map((row) => [row.id, row.subset]), [['swsh9-1', undefined], ['swsh9tg-TG01', 'tg']]);
  const withoutGallery = stubTcgdex({ sets: { swsh9: setOf('swsh9', main) }, cards: { 'swsh9-1': main[0] } });
  await assert.rejects(bakeSet({ setId: 'swsh9', packModelKey: 'swsh-tg' }, withoutGallery), /no Trainer Gallery rows for swsh9tg/);
});

test('the importer reads both entry templates, named quantities and the promo row of the box list', () => {
  const page = [
    '==Box structure==',
    '===Section 1===',
    '{{halfdecklist/header|title=Charizard group|type=Fire|symbol=no}}',
    '{{halfdecklist/entry|012/181|D|{{TCG ID|Team Up|Charmander|12}}|Fire||3}}',
    '{{halfdecklist/entry|030/084|J|{{TCG ID|Pitch Black|Slowbro|30}}|Psychic|6=2}}',
    '{{Halfdecklist/nmentry|127/168|{{TCG ID|Celestial Storm|Copycat|127}}|Supporter||0-2}}',
    '{{halfdecklist/entry|MEE 001|—|{{TCG|Basic Grass Energy}}|Energy|Grass|13}}',
    '{{halfdecklist/entry|084/084|J|{{TCG ID|Pitch Black|Voltaic L Energy|84|Voltaic}} {{e|Lightning}} {{TCG ID|Pitch Black|Voltaic L Energy|84|Energy}}|Energy|Lightning|4}}',
  ].join('\n');
  const [block] = parseBoxPage(page);
  assert.equal(block.title, 'Charizard group');
  assert.deepEqual(
    block.entries.map((entry) => [entry.card, entry.qty]),
    [
      [{ set: 'Team Up', name: 'Charmander', number: 12 }, '3'],
      [{ set: 'Pitch Black', name: 'Slowbro', number: 30 }, '2'],
      [{ set: 'Celestial Storm', name: 'Copycat', number: 127 }, '0-2'],
      [{ energy: 'Basic Grass Energy' }, '13'],
      [{ set: 'Pitch Black', name: 'Voltaic L Energy', number: 84 }, '4'],
    ]
  );
  const list = [
    '|-',
    '| {{TCG|Team Up Build & Battle Box}}',
    '|',
    '*[[File:SetSymbolPromo.png|x18px|link=SM Black Star Promos (TCG)]] SM158 {{TCG ID|SM Promo|Charizard|158}}',
    '*[[File:SetSymbolPromo.png|x18px|link=SM Black Star Promos (TCG)]] SM159 {{TCG ID|SM Promo|Zapdos|159}}',
    '|-',
  ].join('\n');
  assert.deepEqual(promosFromList(list, 'Team Up Build & Battle Box'), [
    { set: 'SM Promo', name: 'Charizard', number: 158 },
    { set: 'SM Promo', name: 'Zapdos', number: 159 },
  ]);
  assert.throws(() => promosFromList(list, 'Nope Build & Battle Box'), /not on the box list/);
});
