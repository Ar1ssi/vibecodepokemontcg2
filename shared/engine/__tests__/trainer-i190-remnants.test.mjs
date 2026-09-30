import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseTrainerEffect } from '../rules/trainer-effects.mjs';
import { classifyTrainer } from '../../../scripts/lib/trainer-behaviour.mjs';

// I190 remnants. Texts are rows of out/pkmn-trainer-cards.json.
const TEXTS = {
  // Ultra Prism 129
  missingClover:
    'You may play 4 Missing Clover cards at once. If you played 1 card, look at the top card of your deck. If you played 4 cards, take a Prize card. (This effect works one time for 4 cards.)',
  // Fusion Strike 230
  crossSwitcher:
    'You must play 2 Cross Switcher cards at once. (This effect works one time for 2 cards.) Switch 1 of your opponent’s Benched Pokémon with their Active Pokémon. If you do, switch your Active Pokémon with 1 of your Benched Pokémon.',
  // Hidden Fates 65
  sabrinasSuggestion:
    'Your opponent reveals their hand. You may choose a Supporter card you find there and use the effect of that card as the effect of this card.',
  // Cosmic Eclipse 186
  bellelba:
    'Discard 3 cards from the top of each player’s deck. When you play this card, you may discard 3 other cards from your hand. If you do, each player discards their Benched Pokémon until they have 3 Benched Pokémon. Your opponent discards first.',
};

const mon = (instanceId, name) => createCard({ instanceId, name, supertype: 'Pokémon', type: 'Pokémon', stage: 'Basic', hp: 100 });
const trainer = (instanceId, name, text, kind = 'Item') =>
  createCard({ instanceId, name, supertype: 'Trainer', type: kind, trainerType: kind, subtypes: [kind], text });

function board({ p1Prizes = 6 } = {}) {
  const state = createGameState({ gameId: 'i190', seed: 1, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: { abilitiesUsed: {}, supporterPlayed: false } };
  }
  state.turn = { player: 'p1', number: 4, phase: 'main' };
  state.players.p1.zones.active.push(mon(1, 'P1 Active'));
  state.players.p2.zones.active.push(mon(2, 'P2 Active'));
  for (let i = 0; i < p1Prizes; i++) state.players.p1.zones.prizes.push(mon(10 + i, `P1 Prize ${i}`));
  for (let i = 0; i < 6; i++) state.players.p2.zones.prizes.push(mon(20 + i, `P2 Prize ${i}`));
  for (let i = 0; i < 10; i++) {
    state.players.p1.zones.deck.push(mon(100 + i, `P1 Deck ${i}`));
    state.players.p2.zones.deck.push(mon(150 + i, `P2 Deck ${i}`));
  }
  return state;
}

const rng = { next: () => 0.9, shuffle: (cards) => cards };
const play = (state, instanceId) => applyCommand(state, { type: 'playTrainer', payload: { instanceId }, playerId: 'p1' }, rng);
const choose = (res, selection) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', playerId: res.state.pendingChoice.player, payload: { choiceId: res.state.pendingChoice.choiceId, selection } },
    rng
  );
const names = (cards) => cards.map((c) => c.name);

test('all four parse with no gap', () => {
  for (const [name, text] of Object.entries(TEXTS)) {
    assert.equal(parseTrainerEffect(text).recognizable, true, name);
    assert.deepEqual(classifyTrainer({ name, text }).gaps, [], name);
  }
  assert.equal(parseTrainerEffect(TEXTS.crossSwitcher).playCondition, 'copiesInHand>=2');
});

test('Missing Clover: four at once take a Prize; all four go to the discard pile', () => {
  const state = board();
  for (let i = 0; i < 4; i++) state.players.p1.zones.hand.push(trainer(300 + i, 'Missing Clover', TEXTS.missingClover));
  let res = play(state, 300);
  assert.equal(res.error, null);
  assert.deepEqual(res.state.pendingChoice.options.map((o) => o.name), ['Play 1 Missing Clover', 'Play 4 Missing Clover cards at once']);
  res = choose(res, [2]);
  assert.equal(res.state.pendingChoice, null, 'the Prize is taken blind: no list of face-down cards');
  const p1 = res.state.players.p1.zones;
  assert.equal(p1.prizes.length, 5);
  assert.equal(p1.hand.filter((c) => /^P1 Prize/.test(c.name)).length, 1);
  assert.equal(p1.discard.filter((c) => c.name === 'Missing Clover').length, 4);
});

test('Missing Clover: taking the last Prize wins the game', () => {
  const state = board({ p1Prizes: 1 });
  for (let i = 0; i < 4; i++) state.players.p1.zones.hand.push(trainer(300 + i, 'Missing Clover', TEXTS.missingClover));
  const res = choose(play(state, 300), [2]);
  assert.equal(res.state.players.p1.zones.prizes.length, 0);
  assert.equal(res.state.winner ?? res.state.gameEnded?.winner ?? res.state.result?.winner, 'p1');
});

test('Missing Clover: a single copy only looks at the top card', () => {
  const state = board();
  state.players.p1.zones.hand.push(trainer(300, 'Missing Clover', TEXTS.missingClover));
  const res = play(state, 300);
  assert.equal(res.error, null);
  const p1 = res.state.players.p1.zones;
  assert.equal(p1.prizes.length, 6);
  assert.equal(p1.deck[0].name, 'P1 Deck 0', 'the top card stays on top');
});

test('Cross Switcher needs a second copy and discards both', () => {
  const lone = board();
  lone.players.p1.zones.hand.push(trainer(300, 'Cross Switcher', TEXTS.crossSwitcher));
  lone.players.p2.zones.bench.push(mon(3, 'P2 Bench'));
  lone.players.p1.zones.bench.push(mon(4, 'P1 Bench'));
  assert.match(play(lone, 300).error || '', /must play 2 Cross Switcher/);

  const pair = board();
  pair.players.p1.zones.hand.push(trainer(300, 'Cross Switcher', TEXTS.crossSwitcher), trainer(301, 'Cross Switcher', TEXTS.crossSwitcher));
  pair.players.p2.zones.bench.push(mon(3, 'P2 Bench'));
  pair.players.p1.zones.bench.push(mon(4, 'P1 Bench'));
  const res = play(pair, 300);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].name, 'P2 Bench');
  assert.equal(res.state.players.p1.zones.active[0].name, 'P1 Bench');
  assert.equal(res.state.players.p1.zones.discard.filter((c) => c.name === 'Cross Switcher').length, 2);
  assert.equal(res.state.players.p1.zones.hand.length, 0);
});

test('Sabrina’s Suggestion resolves a Supporter from the opponent’s hand', () => {
  const state = board();
  state.players.p1.zones.hand.push(trainer(300, 'Sabrina’s Suggestion', TEXTS.sabrinasSuggestion, 'Supporter'));
  state.players.p2.zones.hand.push(
    trainer(400, 'Hop', 'Draw 3 cards.', 'Supporter'),
    trainer(401, 'Sabrina’s Suggestion', TEXTS.sabrinasSuggestion, 'Supporter'),
    trainer(402, 'Potion', 'Heal 30 damage from 1 of your Pokémon.', 'Item')
  );
  let res = play(state, 300);
  assert.equal(res.error, null);
  assert.deepEqual(names(res.state.pendingChoice.options), ['Hop'], 'Supporters only, never another Sabrina’s Suggestion');
  assert.ok(res.events.some((e) => e.type === 'cardsRevealed' && e.playerId === 'p2'));
  res = choose(res, [400]);
  assert.equal(res.state.players.p1.zones.hand.length, 3, 'Hop’s effect: draw 3');
  assert.equal(res.state.players.p2.zones.hand.length, 3, 'the copied card stays in the opponent’s hand');
});

test('Bellelba & Brycen-Man mills both decks; the paid cost cuts each Bench to 3, opponent first', () => {
  const state = board();
  state.players.p1.zones.hand.push(trainer(300, 'Bellelba & Brycen-Man', TEXTS.bellelba, 'Supporter'));
  for (let i = 0; i < 3; i++) state.players.p1.zones.hand.push(mon(500 + i, `Filler ${i}`));
  for (let i = 0; i < 5; i++) state.players.p2.zones.bench.push(mon(600 + i, `P2 Bench ${i}`));
  for (let i = 0; i < 4; i++) state.players.p1.zones.bench.push(mon(700 + i, `P1 Bench ${i}`));
  let res = play(state, 300);
  res = choose(res, [500, 501, 502]);
  assert.equal(res.state.pendingChoice.player, 'p2', 'the opponent discards first');
  assert.equal(res.state.pendingChoice.min, 2);
  res = choose(res, [600, 601]);
  assert.equal(res.state.pendingChoice.player, 'p1');
  res = choose(res, [700]);
  assert.equal(res.state.players.p2.zones.bench.length, 3);
  assert.equal(res.state.players.p1.zones.bench.length, 3);
  assert.equal(res.state.players.p1.zones.deck.length, 7);
  assert.equal(res.state.players.p2.zones.deck.length, 7);
});

test('Bellelba & Brycen-Man without the cost only mills', () => {
  const state = board();
  state.players.p1.zones.hand.push(trainer(300, 'Bellelba & Brycen-Man', TEXTS.bellelba, 'Supporter'));
  for (let i = 0; i < 3; i++) state.players.p1.zones.hand.push(mon(500 + i, `Filler ${i}`));
  for (let i = 0; i < 5; i++) state.players.p2.zones.bench.push(mon(600 + i, `P2 Bench ${i}`));
  const res = choose(play(state, 300), []);
  assert.equal(res.state.pendingChoice, null);
  assert.equal(res.state.players.p2.zones.bench.length, 5);
  assert.equal(res.state.players.p2.zones.deck.length, 7);
});

test('Cross Switcher: when no opponent switch happens, the own switch does not either', () => {
  const state = board();
  state.players.p1.zones.hand.push(trainer(300, 'Cross Switcher', TEXTS.crossSwitcher), trainer(301, 'Cross Switcher', TEXTS.crossSwitcher));
  state.players.p1.zones.bench.push(mon(4, 'P1 Bench'));
  // The only opponent Benched Pokémon is shielded from Items (Unnerve, Galvantula TEU 48 corpus row).
  const galvantula = mon(3, 'Galvantula');
  galvantula.abilities = [
    {
      name: 'Unnerve',
      text: 'Whenever your opponent plays an Item or Supporter card from their hand, prevent all effects of that card done to this Pokémon.',
    },
  ];
  state.players.p2.zones.bench.push(galvantula);
  const res = play(state, 300);
  assert.equal(res.error, null);
  assert.equal(res.state.players.p2.zones.active[0].name, 'P2 Active');
  assert.equal(res.state.players.p1.zones.active[0].name, 'P1 Active');
});

test('Sabrina’s Suggestion copying Steven’s Resolve: its picks stay hidden and the turn ends', () => {
  // Steven’s Resolve, Celestial Storm 165 (corpus row).
  const steven = 'Search your deck for up to 3 cards and put them into your hand. Then, shuffle your deck. Your turn ends.';
  const state = board();
  state.players.p1.zones.hand.push(trainer(300, 'Sabrina’s Suggestion', TEXTS.sabrinasSuggestion, 'Supporter'));
  state.players.p2.zones.hand.push(trainer(400, 'Steven’s Resolve', steven, 'Supporter'));
  let res = choose(play(state, 300), [400]);
  assert.ok(res.state.pendingChoice, 'the deck search');
  res = choose(res, [100, 101, 102]);
  assert.equal(
    res.events.some((e) => e.type === 'cardsRevealed' && e.playerId === 'p1'),
    false,
    'Steven’s Resolve does not reveal its picks'
  );
  assert.equal(res.state.turn.player, 'p2', 'the copied "Your turn ends." ends the turn');
});
