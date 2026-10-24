// Homebrew set customhb: the 2026-10-25 cardback re-exports of Metagross (me04-061) and Palossand
// (sv06-092). Texts are the set.json effects, verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, types: ['Colorless'], ...extra });
const energy = (type, attachedTo) =>
  createCard({ instanceId: nextId++, name: `Basic ${type} Energy`, supertype: 'Energy', subtypes: ['Basic'], energyType: type, attachedTo });
const ability = (name, text) => [{ name, type: 'Ability', text }];

function board({ attackerExtra = {}, defenderExtra = {}, setup = () => {}, damage = '60' } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'customhb3', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(mon(`${id} deck ${i}`));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const attacker = mon('Attacker', { attacks: [{ name: 'Probe', cost: [], damage, text: '' }], ...attackerExtra });
  state.players.p1.zones.active.push(attacker);
  const defender = mon('Defender', { ...defenderExtra });
  state.players.p2.zones.active.push(defender);
  setup(state, { attacker, defender });
  return { state, attacker, defender };
}
const attack = (state) => applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3));
const damageOf = (res, id) =>
  [...res.state.players.p2.zones.active, ...res.state.players.p2.zones.bench].find((c) => c.instanceId === id)?.damage ?? 0;

// ── HB 178 Palossand Water Compaction ───────────────────────────────────────────────────────

const COMPACTION =
  'If this Pokémon is attacked by a Pokémon that has {W} Energy attached, prevent all damage done to this Pokémon by that attack and heal 20 damage from this Pokémon.';

function hitPalossand({ attackerEnergy, startDamage = 0 }) {
  const { state, defender } = board({
    defenderExtra: { name: 'Palossand', hp: 130, damage: startDamage, abilities: ability('Water Compaction', COMPACTION) },
    setup: (s, { attacker }) => {
      if (attackerEnergy) s.players.p1.zones.active.push(energy(attackerEnergy, attacker.instanceId));
    },
  });
  return damageOf(attack(state), defender.instanceId);
}

test('HB 178 Palossand Water Compaction: an attacker with {W} Energy deals no damage and Palossand heals 20', () => {
  assert.equal(hitPalossand({ attackerEnergy: 'Water', startDamage: 50 }), 30, 'no damage, healed 20 of 50');
  assert.equal(hitPalossand({ attackerEnergy: 'Water', startDamage: 10 }), 0, 'heals no more than the damage on it');
});

test('HB 178 Palossand Water Compaction: an attacker without {W} Energy damages Palossand as usual', () => {
  assert.equal(hitPalossand({ attackerEnergy: 'Fire', startDamage: 50 }), 110);
  assert.equal(hitPalossand({ attackerEnergy: null }), 60);
});

// ── HB 156 Metagross Analysis ───────────────────────────────────────────────────────────────

const ANALYSIS = 'Once during your turn, you may flip a coin. If heads, your opponent reveals a random card from their hand.';

function useAnalysis(face, handSize = 5) {
  const { state, attacker } = board({
    attackerExtra: { name: 'Metagross', abilities: ability('Analysis', ANALYSIS) },
    setup: (s) => {
      for (let i = 0; i < handSize; i++) s.players.p2.zones.hand.push(mon(`Hand ${i}`));
    },
  });
  const rng = createRng(3);
  rng.forcedCoin = face;
  const use = (st) => applyCommand(st, { type: 'useAbility', playerId: 'p1', payload: { instanceId: attacker.instanceId } }, rng);
  return { res: use(state), use };
}

test('HB 156 Metagross Analysis: heads reveals exactly one random card from the opponent’s hand', () => {
  const { res } = useAnalysis('heads');
  assert.equal(res.error, null);
  const reveals = res.events.filter((e) => e.type === 'cardsRevealed');
  assert.equal(reveals.length, 1);
  assert.equal(reveals[0].cards.length, 1, 'one card, not the whole hand');
  assert.ok(res.state.players.p2.zones.hand.some((c) => c.instanceId === reveals[0].cards[0].instanceId), 'the card stays in their hand');
});

test('HB 156 Metagross Analysis: tails reveals nothing, and an empty hand reveals nothing', () => {
  assert.equal(useAnalysis('tails').res.events.filter((e) => e.type === 'cardsRevealed').length, 0);
  const empty = useAnalysis('heads', 0).res;
  assert.equal(empty.error, null);
  assert.equal(empty.events.filter((e) => e.type === 'cardsRevealed').length, 0);
});

test('HB 156 Metagross Analysis: usable once per turn', () => {
  const { res, use } = useAnalysis('tails');
  assert.equal(res.error, null);
  assert.notEqual(use(res.state).error, null);
});
