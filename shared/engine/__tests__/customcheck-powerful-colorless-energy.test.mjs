// Powerful Colorless Energy (set.json record customcheck-001, from cardback; the user's edit of
// swsh12-168). Its text, the record's `effect` verbatim: "As long as this card is attached to a
// Pokémon, it provides {C} Energy. / The attacks of the {C} Pokémon this card is attached to do 20
// more damage to your opponent's Active Pokémon (before applying Weakness and Resistance)."
// The Energy is built the way the server gets it: identity-only (reduce.mjs loadDeck), its text
// arriving through the client's cardStats payload. The client card is what rules-state.mjs
// ensureCardData makes of the record: a custom-set record has no `subtypes`, so it sends `[]`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { buildCardStatsPayload } from '../../../client/src/setup/netcode/card-stats.js';

const RECORD = {
  id: 'customcheck-001',
  localId: '001',
  name: 'Powerful Colorless Energy',
  category: 'Energy',
  energyType: 'Special',
  effect:
    "As long as this card is attached to a Pokémon, it provides {C} Energy.\n\nThe attacks of the {C} Pokémon this card is attached to do 20 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance).",
};
const ENERGY_SYNC = 0;

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, ownerId: 'p1', name, supertype: 'Pokémon', stage: 'Basic', hp: 300, types: ['Colorless'], ...extra });

/** p1 Active `attacker` holds one Powerful Colorless Energy; p2 has an Active and two Benched Pokémon. */
function board({ attackerTypes = ['Colorless'], attack, defenderExtra = {} } = {}) {
  nextId = 10;
  let state = createGameState({ gameId: 'customcheck-pce', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const attacker = mon('Attacker', { types: attackerTypes, attacks: [attack] });
  const powerful = createCard({ instanceId: 1, syncInstance: ENERGY_SYNC, ownerId: 'p1', name: RECORD.name, type: 'Energy' });
  powerful.attachedTo = attacker.instanceId;
  state.players.p1.zones.active.push(attacker, powerful);
  const defender = mon('Defender', { ownerId: 'p2', ...defenderExtra });
  state.players.p2.zones.active.push(defender);
  state.players.p2.zones.bench.push(mon('Benched', { ownerId: 'p2' }), mon('Other Benched', { ownerId: 'p2' }));

  const payload = buildCardStatsPayload([
    { syncInstance: ENERGY_SYNC, name: RECORD.name, type: RECORD.category, subtypes: [], effect: RECORD.effect, text: RECORD.effect },
  ]);
  const stats = applyCommand(state, { type: 'cardStats', playerId: 'p1', payload });
  assert.equal(stats.error ?? null, null, stats.reason);
  state = stats.state;
  return { state };
}

const plainAttack = (damage = '30', cost = ['Colorless']) => ({ name: 'Tackle', cost, damage, text: '' });
const attackWith = (state, seed = 3) =>
  applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(seed));
const damageOn = (state, pid, zone, name) => state.players[pid].zones[zone].find((c) => c.name === name)?.damage ?? 0;

test('Powerful Colorless Energy pays a {C} cost and adds 20 to a {C} Pokémon’s attack on the Active', () => {
  const { state } = board({ attack: plainAttack('30', ['Colorless']) });
  const res = attackWith(state);
  assert.equal(res.error ?? null, null, res.reason);
  assert.equal(damageOn(res.state, 'p2', 'active', 'Defender'), 50);
});

test('Powerful Colorless Energy provides one {C}, not two: a {C}{C} attack is refused', () => {
  const { state } = board({ attack: plainAttack('30', ['Colorless', 'Colorless']) });
  const res = attackWith(state);
  assert.notEqual(res.error ?? null, null, 'the attack needs a second Energy');
  assert.equal(damageOn(res.state, 'p2', 'bench', 'Other Benched'), 0);
  assert.equal(damageOn(res.state, 'p2', 'active', 'Defender'), 0);
});

test('Powerful Colorless Energy adds nothing when its holder is not a {C} Pokémon', () => {
  const { state } = board({ attackerTypes: ['Fire'], attack: plainAttack('30', ['Colorless']) });
  const res = attackWith(state);
  assert.equal(res.error ?? null, null, res.reason);
  assert.equal(damageOn(res.state, 'p2', 'active', 'Defender'), 30);
});

test('Powerful Colorless Energy’s +20 lands before Weakness: 30 + 20, doubled', () => {
  const { state } = board({ attack: plainAttack('30'), defenderExtra: { weakness: { type: 'Colorless', value: 2 } } });
  const res = attackWith(state);
  assert.equal(res.error ?? null, null, res.reason);
  assert.equal(damageOn(res.state, 'p2', 'active', 'Defender'), 100);
});

test('Powerful Colorless Energy’s +20 lands before Resistance: 30 + 20 − 30', () => {
  const { state } = board({ attack: plainAttack('30'), defenderExtra: { resistance: { type: 'Colorless', value: 30 } } });
  const res = attackWith(state);
  assert.equal(res.error ?? null, null, res.reason);
  assert.equal(damageOn(res.state, 'p2', 'active', 'Defender'), 20);
});

test('Powerful Colorless Energy does not add to damage on a Benched Pokémon', () => {
  const { state } = board({
    attack: { name: 'Snipe', cost: ['Colorless'], damage: '', text: "This attack does 30 damage to 1 of your opponent's Benched Pokémon." },
  });
  let res = attackWith(state);
  assert.equal(res.error ?? null, null, res.reason);
  const choice = res.state.pendingChoice;
  assert.ok(choice, 'the snipe asks which Benched Pokémon to hit');
  const target = res.state.players.p2.zones.bench.find((c) => c.name === 'Benched');
  res = applyCommand(
    res.state,
    { type: 'resolveChoice', playerId: choice.player, payload: { choiceId: choice.choiceId, selection: [target.instanceId] } },
    createRng(4)
  );
  assert.equal(res.error ?? null, null, res.reason);
  assert.equal(damageOn(res.state, 'p2', 'bench', 'Benched'), 30);
  assert.equal(damageOn(res.state, 'p2', 'active', 'Defender'), 0);
});
