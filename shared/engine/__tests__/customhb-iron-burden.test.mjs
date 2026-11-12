// Homebrew set customhb HB 630 Iron Burden (set.json customhb-630, the user's cardback edit of
// me01-118 and its screenshot): "The Pokémon this card is attached to has its Retreat Cost
// increased by 2 {C} and its HP increased by 40. / The Pokémon this card is attached to can't be
// switched out by an Ability or a Trainer card." The text is the set.json effect, verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { computeEffectiveRetreatCost } from '../reduce/retreat.mjs';
import { cardEffectiveHp } from '../reduce/shared.mjs';
import { parseHpBonus, parseRetreatCostModifier } from '../rules/ability-executors.mjs';
import { holderSwitchOutLocked } from '../rules/tool-combat.mjs';

const IRON_BURDEN =
  "The Pokémon this card is attached to has its Retreat Cost increased by 2 {C} and its HP increased by 40.\n\nThe Pokémon this card is attached to can't be switched out by an Ability or a Trainer card.";
const BOSS_ORDERS = "Switch in 1 of your opponent's Benched Pokémon to the Active Spot.";
const SWITCH = 'Switch your Active Pokémon with 1 of your Benched Pokémon.';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 100, types: ['Colorless'], retreatCost: 1, ...extra });
const ironBurden = (host) =>
  createCard({
    instanceId: nextId++,
    name: 'Iron Burden',
    supertype: 'Trainer',
    type: 'Trainer',
    trainerType: 'Tool',
    subtypes: ['Pokémon Tool'],
    effect: IRON_BURDEN,
    attachedTo: host.instanceId,
  });
const energy = (host) =>
  createCard({
    instanceId: nextId++,
    name: 'Basic Colorless Energy',
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: 'Colorless',
    attachedTo: host.instanceId,
  });
const trainer = (name, subtype, effect) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', type: 'Trainer', trainerType: subtype, subtypes: [subtype], effect });

/** p1 Active and p2 Active, each with one Bench Pokémon; `burdenOn` names who holds Iron Burden. */
function board({ burdenOn = 'p1', energyCount = 0 } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'iron-burden', seed: 3, rulesEnabled: true });
  const seats = {};
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: { abilitiesUsed: {}, supporterPlayed: false } };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`, 'Item', 'x'));
    const active = mon(`${id} Active`);
    const bench = mon(`${id} Bench`);
    state.players[id].zones.active.push(active);
    state.players[id].zones.bench.push(bench);
    seats[id] = { active, bench };
  }
  const host = seats[burdenOn].active;
  state.players[burdenOn].zones.active.push(ironBurden(host));
  for (let i = 0; i < energyCount; i++) state.players[burdenOn].zones.active.push(energy(host));
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  return { state, seats, host };
}

const TAILS = { next: () => 0.9, shuffle: (cards) => cards };
const activeName = (state, id) => state.players[id].zones.active.find((c) => !c.attachedTo).name;
const play = (state, card, rng = TAILS) => {
  state.players.p1.zones.hand.push(card);
  return applyCommand(state, { type: 'playTrainer', playerId: 'p1', payload: { instanceId: card.instanceId } }, rng);
};

test('HB 630 Iron Burden parses +40 HP and +2 Retreat Cost, not the symbol count', () => {
  const tool = { name: 'Iron Burden', type: 'Trainer', trainerType: 'Tool', effect: IRON_BURDEN };
  assert.equal(parseHpBonus(tool).bonus, 40);
  assert.equal(parseRetreatCostModifier(tool).delta, 2);
});

test('HB 630 Iron Burden: the holder has 40 more HP', () => {
  const { state, host } = board();
  assert.equal(cardEffectiveHp(state, host, 'p1'), 140);
  const { state: bare, seats } = board({ burdenOn: 'p2' });
  assert.equal(cardEffectiveHp(bare, seats.p1.active, 'p1'), 100, 'only the holder gains HP');
});

test('HB 630 Iron Burden: the holder retreats for 2 more Energy and can still retreat', () => {
  const { state, host } = board({ energyCount: 2 });
  assert.equal(computeEffectiveRetreatCost(state, host, 'p1'), 3);
  const short = applyCommand(state, { type: 'retreat', playerId: 'p1', payload: { benchInstanceId: state.players.p1.zones.bench[0].instanceId } }, TAILS);
  assert.match(short.error, /Not enough energy/);

  const paid = board({ energyCount: 3 });
  const bench = paid.state.players.p1.zones.bench[0];
  const retreated = applyCommand(paid.state, { type: 'retreat', playerId: 'p1', payload: { benchInstanceId: bench.instanceId } }, TAILS);
  assert.equal(retreated.error, null, 'retreating is not an Ability or a Trainer card');
  assert.equal(activeName(retreated.state, 'p1'), 'p1 Bench');
});

test("HB 630 Iron Burden: Boss's Orders cannot switch the holder out", () => {
  const { state, seats } = board({ burdenOn: 'p2' });
  const res = play(state, trainer("Boss's Orders", 'Supporter', BOSS_ORDERS));
  assert.equal(res.error, null);
  assert.equal(activeName(res.state, 'p2'), seats.p2.active.name, 'the holder stays Active');
  assert.ok(res.events.some((e) => e.type === 'effectStepSkipped' && e.reason === 'switch_locked'));

  const control = board({ burdenOn: 'p1' });
  const switched = play(control.state, trainer("Boss's Orders", 'Supporter', BOSS_ORDERS));
  assert.equal(activeName(switched.state, 'p2'), 'p2 Bench', 'without the Tool, Boss\'s Orders switches');
});

test('HB 630 Iron Burden: the holder cannot switch itself out with a Switch Item either', () => {
  const { state, seats } = board({ burdenOn: 'p1' });
  const res = play(state, trainer('Switch', 'Item', SWITCH));
  assert.equal(res.error, null);
  assert.equal(activeName(res.state, 'p1'), seats.p1.active.name);
  assert.ok(res.events.some((e) => e.type === 'effectStepSkipped' && e.reason === 'switch_locked'));
});

test('HB 630 Iron Burden: a benched holder is not locked, and Boss\'s Orders may bring it up', () => {
  const { state, seats } = board({ burdenOn: 'p2' });
  // Swap which of p2's Pokémon holds the Tool: the Bench one carries it.
  const tool = state.players.p2.zones.active.find((c) => c.name === 'Iron Burden');
  state.players.p2.zones.active.splice(state.players.p2.zones.active.indexOf(tool), 1);
  tool.attachedTo = seats.p2.bench.instanceId;
  state.players.p2.zones.bench.push(tool);
  assert.equal(holderSwitchOutLocked(seats.p2.bench, state.players.p2.zones.bench), true, 'the lock is on the card, wherever it sits');
  const res = play(state, trainer("Boss's Orders", 'Supporter', BOSS_ORDERS));
  assert.equal(activeName(res.state, 'p2'), 'p2 Bench', 'switching a holder in is not switching it out');
});

test('HB 630 Iron Burden: an Ability cannot switch the holder out', () => {
  const { state, seats } = board({ burdenOn: 'p1' });
  seats.p1.bench.abilities = [
    {
      type: 'Ability',
      name: 'Quick Swap',
      text: 'Once during your turn, you may switch your Active Pokémon with 1 of your Benched Pokémon.',
    },
  ];
  const res = applyCommand(state, { type: 'useAbility', playerId: 'p1', payload: { instanceId: seats.p1.bench.instanceId } }, TAILS);
  assert.equal(res.error, null);
  assert.equal(activeName(res.state, 'p1'), seats.p1.active.name, 'the holder stays Active');
  assert.ok(res.events.some((e) => e.type === 'effectStepSkipped' && e.reason === 'switch_locked'));
});

test('HB 630 Iron Burden: an attack can still switch the holder out', () => {
  const { state, seats } = board({ burdenOn: 'p2' });
  seats.p1.active.attacks = [
    { name: 'Whirlwind', cost: [], damage: '', text: "Switch out your opponent's Active Pokémon to the Bench. (Your opponent chooses the new Active Pokémon.)" },
  ];
  let res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, TAILS);
  assert.equal(res.error, null);
  if (res.state.pendingChoice) {
    res = applyCommand(
      res.state,
      { type: 'resolveChoice', playerId: res.state.pendingChoice.player, payload: { choiceId: res.state.pendingChoice.choiceId, selection: [seats.p2.bench.instanceId] } },
      TAILS
    );
  }
  assert.equal(activeName(res.state, 'p2'), 'p2 Bench', 'attacks are neither Abilities nor Trainer cards');
});
