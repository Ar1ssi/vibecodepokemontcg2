// Legacy client Trainer executor (trainer-execution.js): draws are awaited one move at a time, every
// effect coin goes through the injected ceremony, and card-kind tests follow the card data.
// Card text comes from out/pkmn-trainer-cards.json (rows named in each test).
// trainer-execution.js imports browser paths ('/shared/…') and DOM-bound client modules, so this file
// maps '/shared/' onto the repo and stubs the DOM-bound modules (same harness as
// trainer-execution-shuffle-coins.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseTrainerEffect } from '../../../../../shared/engine/rules/trainer-effects.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

// The stub yields before it mutates, so two un-awaited moves overlap (maxInflight > 1); a loop that
// never awaits would spin forever, so the stub throws once the pile-up is absurd.
const STUBS = {
  'actions/zones/deck-actions.js': `export const moveToDeckBottom = (user, _to, fromZone, index) => {
    const zones = globalThis.__trExec.zones[user];
    const [card] = zones[fromZone].splice(index, 1);
    zones.deck.push(card);
  };`,
  'actions/move-card-bundle/move-card-bundle.js': `export function moveCardBundle(user, _to, fromZone, toZone, index) {
    const g = globalThis.__trExec;
    g.inflight++;
    g.maxInflight = Math.max(g.maxInflight, g.inflight);
    if (g.inflight > 50) throw new Error('moves piled up: a loop is not awaiting moveCardBundle');
    return (async () => {
      await Promise.resolve();
      const zones = g.zones[user];
      const [card] = zones[fromZone].splice(index, 1);
      zones[toZone].push(card);
      g.inflight--;
    })();
  }`,
  'actions/counters/damage-counter.js': 'export const addDamageCounter = () => {}; export const updateDamageCounter = () => {};',
  'src/state.js': 'export const systemState = {}; export const socket = null;',
  'setup/rules/mat-picker.js': 'export const openMatPick = () => {}; export const dismissMatPick = () => {};',
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('/shared/')) {
      return { url: pathToFileURL(path.join(repoRoot, specifier)).href, shortCircuit: true };
    }
    const resolved = nextResolve(specifier, context);
    const stub = Object.keys(STUBS).find((suffix) => resolved.url.endsWith(`/client/src/${suffix.replace(/^src\//, '')}`));
    return stub ? { url: `data:text/javascript,${encodeURIComponent(STUBS[stub])}`, shortCircuit: true } : resolved;
  },
});

const { initTrainerExecution, runTrainerSteps } = await import('../trainer-execution.js');

// hp, weakness and a written-out attack make ensureCardData return at once instead of resolving the
// card over the network.
const enriched = { hp: 1, weakness: null, attacks: [{ name: 'Tackle', text: 'Flip a coin.', damage: '10' }] };
const pokemon = (name, extra = {}) => ({ name, supertype: 'Pokémon', type: 'Pokémon', stage: 'Basic', ...enriched, image: { attached: false }, ...extra });
const energy = (name, parent, extra = {}) => ({ name, supertype: 'Energy', type: 'Energy', ...extra, image: { attached: true, relative: parent.image } });
const trainer = (name, extra = {}) => ({ name, supertype: 'Trainer', type: 'Trainer', ...enriched, image: {}, ...extra });
const filler = (n, label = 'Card') => Array.from({ length: n }, (_, i) => trainer(`${label} ${i}`));

function setupBoard({ self = {}, opp = {}, faces = [], prizeState } = {}) {
  const empty = () => ({ active: [], bench: [], hand: [], deck: [], discard: [], prizes: [], lostZone: [], board: [], stadium: [] });
  const zones = { self: { ...empty(), ...self }, opp: { ...empty(), ...opp } };
  const g = { zones, inflight: 0, maxInflight: 0 };
  globalThis.__trExec = g;
  const pickers = [];
  const heals = [];
  const healPickers = [];
  const flips = [];
  initTrainerExecution({
    getZone: (user, zoneId) => ({ array: zones[user][zoneId], getCount: () => zones[user][zoneId].length }),
    appendMessage: () => {},
    openChoicePicker: (opts) => pickers.push(opts),
    openHealPicker: (opts) => healPickers.push(opts),
    applyHealToCard: (c, amount) => heals.push({ name: c.name, amount }),
    shuffleZone: () => {},
    matchesSearch: () => true,
    isPokemonCard: (c) => c?.supertype === 'Pokémon',
    prizeState,
    playCoinFlip: async () => {
      const face = faces[flips.length];
      flips.push(face);
      return face;
    },
  });
  return { zones, g, pickers, heals, healPickers, flips };
}

const play = (card, steps, owner = 'self') =>
  new Promise((resolve) => runTrainerSteps(card, steps, 0, resolve, owner));
const nextTick = () => new Promise((resolve) => setImmediate(resolve));

test('draw-style steps await each move, so no two moves are in flight together', async () => {
  const cases = [
    [{ type: 'draw', count: 3 }, (z) => z.self.hand.length === 3],
    [{ type: 'eachPlayerDraw', count: 2 }, (z) => z.self.hand.length === 2 && z.opp.hand.length === 4],
    [{ type: 'variableDraw', source: 'opponentBench' }, (z) => z.self.hand.length === 1],
    [{ type: 'drawUntil', target: 4 }, (z) => z.self.hand.length === 4],
    [{ type: 'opponentCountShuffleDraw' }, (z) => z.opp.hand.length === 2],
  ];
  for (const [step, expected] of cases) {
    const board = setupBoard({
      self: { deck: filler(6, 'S'), hand: [] },
      opp: { deck: filler(6, 'O'), hand: filler(2, 'H'), bench: [pokemon('Bench')] },
    });
    await play({ name: 'Test' }, [step]);
    assert.ok(expected(board.zones), `${step.type} drew the expected cards`);
    assert.equal(board.g.maxInflight, 1, `${step.type} overlapped moves`);
  }
});

test('shuffle-hand-then-draw steps move, shuffle and draw in sequence', async () => {
  const plus = setupBoard({ self: { hand: filler(3, 'H'), deck: filler(5, 'D') } });
  await play({ name: 'Test' }, [{ type: 'countShuffleDrawPlus' }]);
  assert.equal(plus.zones.self.hand.length, 4, 'n cards shuffled in, n + 1 drawn');
  assert.equal(plus.g.maxInflight, 1);

  const both = setupBoard({
    self: { hand: filler(2, 'SH'), deck: filler(4, 'SD') },
    opp: { hand: filler(3, 'OH'), deck: filler(4, 'OD') },
  });
  await play({ name: 'Test' }, [{ type: 'eachPlayerShuffleHandDraw' }]);
  assert.equal(both.zones.self.hand.length, 2);
  assert.equal(both.zones.opp.hand.length, 3);
  assert.equal(both.g.maxInflight, 1);
});

test('opponentDraw draws for the opponent of the acting seat', async () => {
  const board = setupBoard({ self: { deck: filler(3, 'S') }, opp: { deck: filler(3, 'O') } });
  await play({ name: 'Test' }, [{ type: 'opponentDraw', count: 2 }], 'opp');
  assert.equal(board.zones.self.hand.length, 2, 'the seat opposite the acting "opp" seat draws');
  assert.equal(board.zones.opp.hand.length, 0);
});

test('Reset Stamp (Unified Minds 206a): draws one card per remaining Prize card when the Prize zone is not dealt', async () => {
  const text = 'Your opponent shuffles their hand into their deck and draws a card for each of their remaining Prize cards.';
  const steps = parseTrainerEffect(text).steps;
  assert.equal(steps[0].perPrize, true);
  // 2 of 6 Prize cards already taken and the Prize zone holds no dealt cards: 4 remain.
  const board = setupBoard({
    opp: { hand: filler(2, 'H'), deck: filler(8, 'D') },
    prizeState: { opp: { taken: 2 } },
  });
  await play({ name: 'Reset Stamp' }, steps);
  assert.equal(board.zones.opp.hand.length, 4);
});

test('healPerHeads, millPerHeads and flipUntilTailsDraw flip through the injected coin ceremony', async () => {
  const heal = setupBoard({ self: { active: [pokemon('Miltank')] }, faces: ['heads', 'tails'] });
  await play({ name: 'Miltank Milk' }, [{ type: 'healPerHeads', coins: 2, perHeads: 3 }]);
  assert.deepEqual(heal.flips, ['heads', 'tails']);
  assert.equal(heal.healPickers.length, 1);
  assert.equal(heal.healPickers[0].amount, 3, 'one heads heals perHeads');

  const mill = setupBoard({ opp: { deck: filler(5, 'O') }, faces: ['heads', 'heads', 'tails'] });
  await play({ name: 'Mill' }, [{ type: 'millPerHeads', coins: 3, per: 2 }]);
  assert.equal(mill.flips.length, 3);
  assert.equal(mill.zones.opp.discard.length, 4, 'two heads mill 2 each');

  const until = setupBoard({ self: { deck: filler(6, 'S') }, faces: ['heads', 'heads', 'tails'] });
  await play({ name: 'Until' }, [{ type: 'flipUntilTailsDraw' }]);
  assert.deepEqual(until.flips, ['heads', 'heads', 'tails']);
  assert.equal(until.zones.self.hand.length, 2);
  assert.equal(until.g.maxInflight, 1);
});

test('Mars (Ultra Prism 154): discards a random card whatever it is, but only after a card was drawn', async () => {
  const steps = parseTrainerEffect('Draw 2 cards. If you do, discard a random card from your opponent’s hand.').steps;
  const item = trainer('Potion', { trainerType: 'Item' });
  const board = setupBoard({ self: { deck: filler(3, 'S') }, opp: { hand: [item] } });
  await play({ name: 'Mars' }, steps);
  assert.equal(board.zones.opp.discard.length, 1, 'an Item is discarded too');

  const emptyDeck = setupBoard({ self: { deck: [] }, opp: { hand: [trainer('Potion', { trainerType: 'Item' })] } });
  await play({ name: 'Mars' }, steps);
  assert.equal(emptyDeck.zones.opp.discard.length, 0, 'no card drawn: "if you do" does not resolve');
});

test('Tormenting Spray (Burning Shadows): only a Supporter is discarded', async () => {
  const steps = parseTrainerEffect(
    'Choose a random card from your opponent’s hand. Your opponent reveals that card. If it’s a Supporter card, discard it.'
  ).steps;
  assert.equal(steps[0].type, 'discardRandomOpponentHandIfSupporter');
  const item = setupBoard({ opp: { hand: [trainer('Potion', { trainerType: 'Item' })] } });
  await play({ name: 'Tormenting Spray' }, steps);
  assert.equal(item.zones.opp.discard.length, 0, 'an Item stays in hand');

  const supporter = setupBoard({ opp: { hand: [trainer('Boss', { trainerType: 'Supporter' })] } });
  await play({ name: 'Tormenting Spray' }, steps);
  assert.equal(supporter.zones.opp.discard.length, 1);
});

test('Giacomo (Prismatic Evolutions 138): one Special Energy per opponent Pokémon, Basic Energy stays', async () => {
  const steps = parseTrainerEffect('Discard a Special Energy from each of your opponent’s Pokémon.').steps;
  assert.equal(steps[0].energy, 'Special Energy');
  const a = pokemon('A');
  const b = pokemon('B');
  const board = setupBoard({
    opp: {
      active: [a, energy('Water Energy', a, { subtypes: ['Basic'] }), energy('Double Turbo Energy', a, { subtypes: ['Special'] }), energy('Gift Energy', a, { subtypes: ['Special'] })],
      bench: [b, energy('Fire Energy', b, { subtypes: ['Basic'] })],
    },
  });
  await play({ name: 'Giacomo' }, steps);
  assert.deepEqual(board.zones.opp.discard.map((c) => c.name), ['Double Turbo Energy']);
  assert.equal(board.zones.opp.bench.length, 2, 'Basic Energy on B stays attached');
});

test('Enhanced Hammer (Twilight Masquerade 224): the picker offers Special Energy only', async () => {
  const steps = parseTrainerEffect('Discard a Special Energy from 1 of your opponent’s Pokémon.').steps;
  const a = pokemon('A');
  const board = setupBoard({
    opp: { active: [a, energy('Water Energy', a, { subtypes: ['Basic'] }), energy('Double Turbo Energy', a, { subtypes: ['Special'] })] },
  });
  const done = play({ name: 'Enhanced Hammer' }, steps);
  await nextTick();
  assert.deepEqual(board.pickers[0].candidates.map((c) => c.name), ['Double Turbo Energy']);
  await done;
});

test('Ortega-style hand-bottom (Energy): a Trainer named for Energy is not an Energy card', async () => {
  const a = pokemon('A');
  const board = setupBoard({
    opp: { hand: [energy('Fire Energy', a), trainer('Energy Retrieval', { trainerType: 'Item' })] },
  });
  const done = play({ name: 'Energy Swatter' }, [{ type: 'opponentHandBottom', what: 'Energy' }]);
  await nextTick();
  assert.deepEqual(board.pickers[0].candidates.map((c) => c.name), ['Fire Energy']);
  await done;
});

test('Tool Retriever (Furious Fists 101): attached Trainers that are not Pokémon Tools are not offered', async () => {
  const mon = pokemon('A');
  const tool = trainer('Muscle Band', { trainerType: 'Tool' });
  const plusPower = trainer('PlusPower');
  tool.image = { attached: true, relative: mon.image };
  plusPower.image = { attached: true, relative: mon.image };
  const board = setupBoard({ self: { active: [mon, tool, plusPower] } });
  const steps = parseTrainerEffect('Choose up to 2 Pokémon Tool cards attached to your Pokémon and put them into your hand.').steps;
  const done = play({ name: 'Tool Retriever' }, steps);
  await nextTick();
  assert.deepEqual(board.pickers[0].candidates.map((c) => c.name), ['Muscle Band']);
  await done;
});

test('discardAllTrainerInPlay (Tropical Tidal Wave, Nintendo Black Star Promos 036) discards attached Trainers and no Energy', async () => {
  const mon = pokemon('A');
  const tool = trainer('Muscle Band', { trainerType: 'Tool' });
  const plusPower = trainer('PlusPower');
  tool.image = { attached: true, relative: mon.image };
  plusPower.image = { attached: true, relative: mon.image };
  const board = setupBoard({ self: { active: [mon, tool, energy('Toolbox Energy', mon), plusPower] } });
  await play({ name: 'Tropical Tidal Wave' }, [{ type: 'discardAllTrainerInPlay', side: 'self' }]);
  assert.deepEqual(board.zones.self.discard.map((c) => c.name).sort(), ['Muscle Band', 'PlusPower']);
});
