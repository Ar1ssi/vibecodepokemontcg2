// A hand-built six-list dataset for the engine tests. One event, placings 1-6, so every list weighs
// 1 (placement ≤ 8, recency 1) and the expected numbers can be worked out by hand.
export const CARD = {
  dreepy: 0,
  dragapult: 1,
  ultraBall: 2,
  iono: 3,
  munkidori: 4,
  darkness: 5,
  counterCatcher: 6,
  pikachu: 7,
  lightning: 8,
  switchCard: 9,
  rareCandy: 10,
};

const card = (key, name, kind, print, tags = [], price = null, abilities = []) => ({
  key,
  name,
  kind,
  print,
  set: 'X',
  number: '1',
  abilities,
  tags,
  price,
});

const list = (p, a, counts) => ({ e: 0, p, a, c: Object.entries(counts).flatMap(([name, n]) => [CARD[name], n]) });

export function fixtureDataset() {
  return {
    version: 1,
    generatedAt: '2026-10-15T00:00:00.000Z',
    source: 'limitlesstcg.com',
    format: 'standard',
    rotation: 'TEF',
    window: { from: '2026-10-10', to: '2026-10-10' },
    events: [{ id: 581, name: 'Regional Louisville, KY', date: '2026-10-10', players: 2927 }],
    archetypes: [
      { id: 284, name: 'Dragapult' },
      { id: 900, name: 'Pikachu' },
    ],
    cards: [
      card('p:dreepy|bite;petty grudge|', 'Dreepy', 'pokemon', 'sv06-128', [], 0.5),
      card('p:dragapult ex|jet headbutt;phantom dive|', 'Dragapult ex', 'pokemon', 'sv06-130', [], 5),
      card('t:ultra ball', 'Ultra Ball', 'trainer', 'me01-131', ['setup'], 0.9),
      card('t:iono', 'Iono', 'trainer', 'sv02-185', ['draw', 'disruption'], 1.5),
      card('p:munkidori|mind bend|adrena-brain', 'Munkidori', 'pokemon', 'sv06-095', [], 0.54, ['Adrena-Brain']),
      card('e:darkness energy', 'Darkness Energy', 'energy', 'mee-007', [], 0.36),
      card('t:counter catcher', 'Counter Catcher', 'trainer', 'sv04-160', ['disruption'], 0.3),
      card('p:pikachu ex|topaz bolt|resolute heart', 'Pikachu ex', 'pokemon', 'sv08-057', [], 3, ['Resolute Heart']),
      card('e:lightning energy', 'Lightning Energy', 'energy', 'mee-004', [], 0.2),
      card('t:switch', 'Switch', 'trainer', 'sv01-194', ['mobility'], 0.2),
      card('t:rare candy', 'Rare Candy', 'trainer', 'sv01-191', ['setup'], 0.25),
    ],
    printIndex: {
      'sv06-128': 0,
      'sv06-130': 1,
      'me01-131': 2,
      'sv02-185': 3,
      'sv04.5-080': 3,
      'sv06-095': 4,
      'mee-007': 5,
      'sv04-160': 6,
      'sv08-057': 7,
      'mee-004': 8,
      'sv01-194': 9,
      'sv01-191': 10,
    },
    lists: [
      list(1, 0, { dreepy: 4, dragapult: 3, ultraBall: 4, iono: 4, munkidori: 2, darkness: 5 }),
      list(2, 0, { dreepy: 4, dragapult: 3, ultraBall: 4, iono: 3, munkidori: 2, darkness: 5 }),
      list(3, 0, { dreepy: 4, dragapult: 2, ultraBall: 4, iono: 4, counterCatcher: 1 }),
      list(4, 0, { dreepy: 4, dragapult: 3, ultraBall: 3, iono: 4, counterCatcher: 1 }),
      list(5, 1, { pikachu: 4, lightning: 10, ultraBall: 4, iono: 4, switchCard: 2 }),
      list(6, 1, { pikachu: 4, lightning: 10, ultraBall: 4, switchCard: 2, rareCandy: 1 }),
    ],
  };
}

/** Builder deck shape from [{ id?, name, count, abilities? }]. */
export function deckOf(entries) {
  const deck = {};
  for (const { count, ...data } of entries) {
    if (!deck[data.name]) deck[data.name] = { cards: [], totalCount: 0 };
    deck[data.name].cards.push({ data, count });
    deck[data.name].totalCount += count;
  }
  return deck;
}
