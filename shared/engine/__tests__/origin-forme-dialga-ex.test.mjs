// Origin Forme Dialga ex (ASR 113): Time Sickness and Temporal Freeze. The attack texts are the
// card scan's, verbatim (the card is not in TCGdex or the out/ corpora yet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { cardEffectShielded } from '../effects/trainer-steps.mjs';

const TIME_SICKNESS =
  "If your opponent's Active Pokémon is a Basic Pokémon, put 1 damage counter on it during Pokémon Checkup. If your opponent's Active Pokémon is an Evolution Pokémon, put 2 damage counters on it during Pokémon Checkup. This effect lasts until your opponent's Active Pokémon is switched out.";
const TEMPORAL_FREEZE =
  "Neither player can attack or retreat during their next turn. Trainer cards and Abilities can't affect either Active Pokémon.";

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, types: ['Colorless'], ...extra });

function board(text, { defenderExtra = {} } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'dialga', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
    state.players[id].zones.bench.push(mon(`${id} bench`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  state.players.p1.zones.active.push(mon('Origin Forme Dialga ex', { attacks: [{ name: 'Probe', cost: [], damage: '', text }] }));
  state.players.p2.zones.active.push(mon('Defender', defenderExtra));
  return state;
}

const run = (state, type, playerId, payload = {}) => applyCommand(state, { type, playerId, payload }, createRng(3));
const activeOf = (state, pid) => state.players[pid].zones.active.find((c) => !c.attachedTo);

test('Time Sickness puts 1 counter on a Basic Active at each Checkup', () => {
  const afterAttack = run(board(TIME_SICKNESS), 'attack', 'p1', { attackIndex: 0 });
  assert.equal(afterAttack.error, null);
  assert.equal(activeOf(afterAttack.state, 'p2').damage, 10, 'the Checkup that ends the attacking turn');
  const afterOppTurn = run(afterAttack.state, 'takeTurn', 'p2');
  assert.equal(afterOppTurn.error, null);
  assert.equal(activeOf(afterOppTurn.state, 'p2').damage, 20, 'and the Checkup after their own turn');
  assert.equal(activeOf(afterOppTurn.state, 'p1').damage ?? 0, 0, 'the attacker takes none');
});

test('Time Sickness puts 2 counters on an Evolution Active', () => {
  const state = board(TIME_SICKNESS, { defenderExtra: { stage: 'Stage 1' } });
  assert.equal(activeOf(run(state, 'attack', 'p1', { attackIndex: 0 }).state, 'p2').damage, 20);
});

test('Time Sickness ends when the Defending Pokémon is switched out', () => {
  const afterAttack = run(board(TIME_SICKNESS), 'attack', 'p1', { attackIndex: 0 });
  const state = afterAttack.state;
  const bench = state.players.p2.zones.bench[0];
  const retreated = run(state, 'retreat', 'p2', { benchInstanceId: bench.instanceId });
  assert.equal(retreated.error, null, 'p2 may retreat on their turn');
  const next = run(retreated.state, 'takeTurn', 'p2');
  assert.equal(activeOf(next.state, 'p2').damage ?? 0, 0, 'the new Active has no marker');
});

test('Temporal Freeze stops both players attacking and retreating on their next turn', () => {
  const afterAttack = run(board(TEMPORAL_FREEZE), 'attack', 'p1', { attackIndex: 0 });
  assert.equal(afterAttack.error, null);
  const oppState = afterAttack.state;
  assert.equal(oppState.turn.player, 'p2');
  const oppAttacker = activeOf(oppState, 'p2');
  oppAttacker.attacks = [{ name: 'Tackle', cost: [], damage: '10', text: '' }];
  assert.ok(run(oppState, 'attack', 'p2', { attackIndex: 0 }).error, "the opponent can't attack");
  const bench = oppState.players.p2.zones.bench[0];
  assert.ok(run(oppState, 'retreat', 'p2', { benchInstanceId: bench.instanceId }).error, "the opponent can't retreat");

  const myTurn = run(oppState, 'takeTurn', 'p2');
  assert.equal(myTurn.error, null);
  assert.equal(myTurn.state.turn.player, 'p1');
  assert.ok(run(myTurn.state, 'attack', 'p1', { attackIndex: 0 }).error, "the attacker can't attack on their next turn");
  const myBench = myTurn.state.players.p1.zones.bench[0];
  assert.ok(run(myTurn.state, 'retreat', 'p1', { benchInstanceId: myBench.instanceId }).error, "the attacker can't retreat");

  const later = run(run(myTurn.state, 'takeTurn', 'p1').state, 'takeTurn', 'p2');
  assert.equal(later.state.turn.player, 'p1');
  assert.equal(later.state.turn.number, 9);
  const freeAttack = run(later.state, 'attack', 'p1', { attackIndex: 0 });
  assert.equal(freeAttack.error, null, 'the lock is gone two turns later');
});

test('Temporal Freeze shields both Active Pokémon from Trainer and Ability effects, not the Bench', () => {
  const afterAttack = run(board(TEMPORAL_FREEZE), 'attack', 'p1', { attackIndex: 0 });
  const state = afterAttack.state;
  for (const pid of ['p1', 'p2']) {
    const owner = state.players[pid];
    const active = activeOf(state, pid);
    const bench = owner.zones.bench[0];
    for (const source of ['Item', 'Supporter', 'Stadium', 'Ability']) {
      assert.equal(cardEffectShielded(state, { owner, root: active, source }), true, `${pid} Active vs ${source}`);
    }
    assert.equal(cardEffectShielded(state, { owner, root: bench, source: 'Item' }), false, `${pid} Bench`);
  }
  const expired = structuredClone(state);
  expired.turn.number = 8;
  assert.equal(
    cardEffectShielded(expired, { owner: expired.players.p2, root: activeOf(expired, 'p2'), source: 'Item' }),
    false,
    'expires after the attacker next turn'
  );
});

const item = (name, text) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', trainerType: 'Item', type: 'Item', text });
const playItem = (state, card) =>
  applyCommand(state, { type: 'playTrainer', playerId: 'p1', payload: { instanceId: card.instanceId } }, createRng(3));

function frozenBoard() {
  const state = board('');
  state.players.p1.effectFreezeUntilTurn = 99;
  state.players.p2.effectFreezeUntilTurn = 99;
  return state;
}

test('Temporal Freeze: Potion cannot heal the frozen Active but still heals the Bench', () => {
  const state = frozenBoard();
  activeOf(state, 'p1').damage = 50;
  state.players.p1.zones.bench[0].damage = 50;
  const potion = item('Potion', 'Heal 30 damage from 1 of your Pokémon.');
  state.players.p1.zones.hand.push(potion);
  const res = playItem(state, potion);
  assert.equal(res.error, null);
  assert.equal(activeOf(res.state, 'p1').damage, 50, 'Active untouched');
  assert.equal(res.state.players.p1.zones.bench[0].damage, 20, 'Bench healed');
});

test('Temporal Freeze: Switch cannot move the frozen Active out', () => {
  const state = frozenBoard();
  const before = activeOf(state, 'p1').instanceId;
  const sw = item('Switch', 'Switch your Active Pokémon with 1 of your Benched Pokémon.');
  state.players.p1.zones.hand.push(sw);
  const res = playItem(state, sw);
  assert.equal(res.error, null);
  assert.equal(activeOf(res.state, 'p1').instanceId, before);
});

test('without Temporal Freeze the same Potion heals the Active', () => {
  const state = board('');
  activeOf(state, 'p1').damage = 50;
  state.players.p1.zones.bench[0].damage = 0;
  const potion = item('Potion', 'Heal 30 damage from 1 of your Pokémon.');
  state.players.p1.zones.hand.push(potion);
  assert.equal(activeOf(playItem(state, potion).state, 'p1').damage, 20);
});
