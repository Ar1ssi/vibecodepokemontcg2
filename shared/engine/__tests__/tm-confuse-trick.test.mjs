// Technical Machine: Confuse (Paradox Rift 177/182), text from the user's scan. Its attack Trick
// moves a Tool to the opponent's Active Pokémon, and the TM gives its holder room for 1 more Tool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';

const TRICK =
  "Move the Pokémon Tool attached to this Pokémon to your opponent's Active Pokémon. If that Pokémon already has a Pokémon Tool attached to it, discard that Pokémon Tool and attach the moved Pokémon Tool to it instead.";
const TM_TEXT = `The Pokémon this card is attached to can use the attack on this card. (You still need the necessary Energy to use this attack.) The Pokémon this card is attached to can have 1 more Pokémon Tool attached to it. {C} → Trick ${TRICK}`;

let nextId = 2000;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, type: 'Pokémon', stage: 'Basic', hp: 200, ...extra });
const tool = (name, attachedTo, extra = {}) =>
  createCard({ instanceId: nextId++, name, type: 'Trainer', supertype: 'Trainer', trainerType: 'Tool', attachedTo, ...extra });
const tm = (attachedTo) =>
  tool('Technical Machine: Confuse', attachedTo, { text: TM_TEXT, effect: TM_TEXT });

function board({ holderTools = () => [], oppTools = () => [], hand = [] } = {}) {
  const state = createGameState({ gameId: 'tm-confuse', seed: 7, rulesEnabled: true });
  const holder = mon('Holder', { attacks: [{ name: 'Tackle', cost: [], damage: '10', text: '' }] });
  const target = mon('Target');
  const zones = { p1: createPlayerZones(), p2: createPlayerZones() };
  zones.p1.active.push(holder, ...holderTools(holder.instanceId));
  zones.p1.active.push(createCard({ instanceId: nextId++, name: 'Double Colorless Energy', type: 'Energy', supertype: 'Energy', attachedTo: holder.instanceId }));
  zones.p1.hand.push(...hand);
  zones.p2.active.push(target, ...oppTools(target.instanceId));
  for (const id of ['p1', 'p2']) {
    for (let i = 0; i < 6; i++) zones[id].prizes.push(mon(`${id} prize`));
    for (let i = 0; i < 10; i++) zones[id].deck.push(mon(`${id} deck`));
    state.players[id] = { playerId: id, username: id, zones: zones[id], flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  return { state, holder, target };
}

const run = (state, command) => applyCommand(state, command, createRng(1));
const trick = (state) => run(state, { type: 'attack', payload: { attackIndex: 1 }, playerId: 'p1' });
const where = (state, card) => {
  for (const [playerId, player] of Object.entries(state.players)) {
    for (const [zoneId, cards] of Object.entries(player.zones)) {
      const found = cards.find((c) => c.instanceId === card.instanceId);
      if (found) return { playerId, zoneId, attachedTo: found.attachedTo };
    }
  }
  return null;
};

test('Trick text parses to the move-Tool attack step', () => {
  assert.deepEqual(parseAttackSteps(TRICK).after.map((s) => s.type), ['atkMoveToolToOpponent']);
});

test('Trick with only the TM attached moves the TM itself onto the opponent Active Pokémon', () => {
  const card = tm();
  const { state, holder, target } = board({ holderTools: (id) => [Object.assign(card, { attachedTo: id })] });
  const res = trick(state);
  assert.equal(res.error, null);
  assert.deepEqual(where(res.state, card), { playerId: 'p2', zoneId: 'active', attachedTo: target.instanceId });
  assert.notEqual(holder.instanceId, target.instanceId);
});

test("Trick discards the opponent's Tool and attaches the moved one instead", () => {
  const card = tm();
  const theirs = tool('Float Stone');
  const { state, target } = board({
    holderTools: (id) => [Object.assign(card, { attachedTo: id })],
    oppTools: (id) => [Object.assign(theirs, { attachedTo: id })],
  });
  const res = trick(state);
  assert.equal(where(res.state, theirs).zoneId, 'discard');
  assert.equal(where(res.state, card).attachedTo, target.instanceId);
});

test('Trick with another Tool beside the TM lets the player pick which Tool moves', () => {
  const card = tm();
  const other = tool('Rocky Helmet');
  const { state, target } = board({
    holderTools: (id) => [Object.assign(card, { attachedTo: id }), Object.assign(other, { attachedTo: id })],
  });
  const asked = trick(state);
  assert.ok(asked.pendingChoice, 'asks which Tool');
  const res = run(asked.state, {
    type: 'resolveChoice',
    payload: { choiceId: asked.pendingChoice.choiceId, selection: [other.instanceId] },
    playerId: 'p1',
  });
  assert.equal(where(res.state, other).attachedTo, target.instanceId);
  assert.equal(where(res.state, card).playerId, 'p1');
});

test('a Pokémon holding the TM can have 1 more Tool attached; a second extra is refused', () => {
  const card = tm();
  const first = tool('Float Stone', null);
  const second = tool('Rocky Helmet', null);
  const { state, holder } = board({ holderTools: (id) => [Object.assign(card, { attachedTo: id })], hand: [first, second] });
  const attach = (s, c) =>
    run(s, { type: 'attachCard', payload: { instanceId: c.instanceId, targetInstanceId: holder.instanceId }, playerId: 'p1' });
  const ok = attach(state, first);
  assert.equal(ok.error, null);
  assert.ok(attach(ok.state, second).error, 'two Tools plus the TM is the limit');
});
