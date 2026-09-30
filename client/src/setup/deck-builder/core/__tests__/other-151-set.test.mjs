import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchLegalStandardSets, fetchSetCards, OTHER_151_SET_ID } from '../set-browser.mjs';

let originalFetch;
beforeEach(() => {
  originalFetch = global.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

const card = (setId, localId, name) => ({
  id: `${setId}-${localId}`,
  localId,
  name,
  image: `https://assets.tcgdex.net/en/sv/${setId}/${localId}`,
});

// Names/ids per TCGdex (2026-10-01); 151 is trimmed to the anchors plus one trailing rare.
const SETS = {
  'sv03.5': {
    id: 'sv03.5',
    name: '151',
    cards: [
      card('sv03.5', '042', 'Golbat'),
      card('sv03.5', '044', 'Gloom'),
      card('sv03.5', '061', 'Poliwhirl'),
      card('sv03.5', '079', 'Slowpoke'),
      card('sv03.5', '082', 'Magneton'),
      card('sv03.5', '095', 'Onix'),
      card('sv03.5', '108', 'Lickitung'),
      card('sv03.5', '112', 'Rhydon'),
      card('sv03.5', '113', 'Chansey'),
      card('sv03.5', '114', 'Tangela'),
      card('sv03.5', '117', 'Seadra'),
      card('sv03.5', '123', 'Scyther'),
      card('sv03.5', '125', 'Electabuzz'),
      card('sv03.5', '126', 'Magmar'),
      card('sv03.5', '137', 'Porygon'),
      card('sv03.5', '178', 'Tangela'),
    ],
  },
  sv01: { id: 'sv01', name: 'Scarlet & Violet', cards: [card('sv01', '065', 'Magnezone ex'), card('sv01', '226', 'Magnezone ex')] },
  sv04: {
    id: 'sv04',
    name: 'Paradox Rift',
    cards: [card('sv04', '143', 'Porygon2'), card('sv04', '144', 'Porygon-Z'), card('sv04', '214', 'Porygon-Z')],
  },
  sv05: {
    id: 'sv05',
    name: 'Temporal Forces',
    cards: [card('sv05', '111', 'Scizor ex'), card('sv05', '125', 'Lickilicky'), card('sv05', '195', 'Scizor ex')],
  },
  sv06: { id: 'sv06', name: 'Twilight Masquerade', cards: [card('sv06', '002', 'Tangrowth'), card('sv06', '134', 'Blissey ex'), card('sv06', '201', 'Blissey ex')] },
  sv07: { id: 'sv07', name: 'Stellar Crown', cards: [card('sv07', '076', 'Rhyperior')] },
  sv09: { id: 'sv09', name: 'Journey Together', cards: [card('sv09', '021', 'Magmortar')] },
  sv10: { id: 'sv10', name: 'Destined Rivals', cards: [card('sv10', '069', 'Electivire ex'), card('sv10', '212', 'Electivire ex')] },
  swsh11: { id: 'swsh11', name: 'Lost Origin', cards: [card('swsh11', '032', 'Politoed')] },
  me04: { id: 'me04', name: 'Chaos Rising', cards: [card('me04', '051', 'Crobat'), card('me04', '093', 'Crobat')] },
  sv03: { id: 'sv03', name: 'Obsidian Flames', cards: [card('sv03', '003', 'Bellossom')] },
  sv02: { id: 'sv02', name: 'Paldea Evolved', cards: [card('sv02', '086', 'Slowking ex'), card('sv02', '238', 'Slowking ex')] },
  me01: { id: 'me01', name: 'Mega Evolution', cards: [card('me01', '093', 'Steelix'), card('me01', '150', 'Steelix')] },
  'sv06.5': { id: 'sv06.5', name: 'Shrouded Fable', cards: [card('sv06.5', '012', 'Kingdra ex'), card('sv06.5', '080', 'Kingdra ex')] },
  svp: { id: 'svp', name: 'SVP Black Star Promos', cards: [card('svp', '138', 'Porygon2')] },
};

function stubSets() {
  global.fetch = async (url) => {
    const match = /\/sets\/([^/?]+)$/.exec(url);
    const record = match && SETS[match[1]];
    if (!record) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => record };
  };
}

describe('Other tab 151', () => {
  it('places each evolution right after its pre-evolution and rares last', async () => {
    stubSets();
    const ids = (await fetchSetCards(OTHER_151_SET_ID)).map((c) => c.id);
    assert.deepEqual(ids, [
      'sv03.5-042', 'me04-051',
      'sv03.5-044', 'sv03-003',
      'sv03.5-061', 'swsh11-032',
      'sv03.5-079', 'sv02-086',
      'sv03.5-082', 'sv01-065',
      'sv03.5-095', 'me01-093',
      'sv03.5-108', 'sv05-125',
      'sv03.5-112', 'sv07-076',
      'sv03.5-113', 'sv06-134',
      'sv03.5-114', 'sv06-002',
      'sv03.5-117', 'sv06.5-012',
      'sv03.5-123', 'sv05-111',
      'sv03.5-125', 'sv10-069',
      'sv03.5-126', 'sv09-021',
      'sv03.5-137', 'sv04-143', 'sv04-144',
      'sv03.5-178',
      'me04-093', 'sv02-238', 'me01-150', 'sv05-195', 'sv06.5-080', 'svp-138', 'sv06-201', 'sv01-226', 'sv10-212', 'sv04-214',
    ]);
  });

  it('leaves the plain sv03.5 set (Generation 9 tab) unchanged', async () => {
    stubSets();
    const ids = (await fetchSetCards('sv03.5')).map((c) => c.id);
    assert.equal(ids.length, SETS['sv03.5'].cards.length);
    assert.ok(ids.every((id) => id.startsWith('sv03.5-')));
  });

  it('lists the Other-tab 151 under its own id with the added cards counted', async () => {
    stubSets();
    const sets = await fetchLegalStandardSets();
    const other151 = sets.find((s) => s.category === 'other' && s.name === '151');
    assert.equal(other151?.setId, OTHER_151_SET_ID);
    assert.equal(other151.cardCount, SETS['sv03.5'].cards.length + 26);
  });
});
