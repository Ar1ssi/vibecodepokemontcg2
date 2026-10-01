// I227: WotC attack families that parsed to no steps (audit 062 Appendix A–B).
// Card text: out/pkmn-wotc-cards.json (pkmncards rows cited per case). Where a modern printing
// says the same thing, the WotC parse must deep-equal the modern parse (D202).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAttackSteps } from '../attack-steps.mjs';
import { createGameState } from '../../state.mjs';
import { createCard } from '../../cards.mjs';
import { createRng } from '../../rng.mjs';
import { applyCommand } from '../../reduce.mjs';

const steps = (text, selfName) => {
  const { before, after } = parseAttackSteps(text, { selfName });
  return [...before, ...after];
};
const marker = (target, window, m, extra = {}) => [{ type: 'atkAddMarker', target, window, marker: m, ...extra }];

const sameAsModern = (wotc, wotcSelf, modern, modernSelf = 'Zed') => {
  const old = steps(wotc, wotcSelf);
  assert.ok(old.length > 0, `no steps: ${wotc}`);
  assert.deepEqual(old, steps(modern, modernSelf));
};

/** p1 Active `mine` against p2 Active `theirs`, 6 Prizes and 6 deck cards each. */
function duelBoard(mine, theirs, { p1Bench = [], p2Bench = [] } = {}) {
  const state = createGameState({ players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } }, rulesEnabled: true });
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  const pokemon = (props) =>
    createCard({ supertype: 'Pokémon', type: 'Pokémon', types: ['Colorless'], enteredPlayTurn: 1, ...props });
  state.players.p1.zones.active.push(pokemon(mine));
  state.players.p2.zones.active.push(pokemon(theirs));
  for (const props of p1Bench) state.players.p1.zones.bench.push(pokemon(props));
  for (const props of p2Bench) state.players.p2.zones.bench.push(pokemon(props));
  for (const playerId of ['p1', 'p2']) {
    const offset = playerId === 'p1' ? 0 : 50;
    for (let i = 0; i < 6; i += 1) {
      state.players[playerId].zones.prizes.push(createCard({ instanceId: 1000 + offset + i, name: 'Prize' }));
      state.players[playerId].zones.deck.push(createCard({ instanceId: 2000 + offset + i, name: 'Deck Card' }));
    }
  }
  return state;
}

/** `playerId` uses `attackIndex` on turn `turnNumber` with fresh turn flags. */
function attackOnTurn(state, playerId, turnNumber, attackIndex, seed = 1) {
  state.turn = { player: playerId, number: turnNumber, phase: 'main' };
  state.players[playerId].flags = {};
  const result = applyCommand(state, { type: 'attack', payload: { attackIndex }, playerId }, createRng(seed));
  assert.ok(!result.error, result.error);
  return result;
}

const damageOn = (state, playerId, instanceId) =>
  [...state.players[playerId].zones.active, ...state.players[playerId].zones.bench].find((c) => c.instanceId === instanceId)
    ?.damage || 0;

// ── exact modern equivalents ────────────────────────────────────────────────────────────────

// Lt. Surge's Electabuzz [Gym Heroes 6] Charge ≡ Morpeko V-UNION [Sword & Shield Promos SWSH290]
// Union Gain; Lt. Surge's Pikachu [Gym Heroes 81] Charge ≡ Shadow Rider Calyrex V [Sword & Shield
// Promos SWSH131] Cloak in Shadows.
test('Charge ≡ attach from the discard pile to this Pokémon', () => {
  sameAsModern(
    "Take up to 2 {L} Energy cards from your discard pile and attach them to Lt. Surge's Electabuzz.",
    "Lt. Surge's Electabuzz",
    'Attach up to 2 {L} Energy cards from your discard pile to this Pokémon.'
  );
  sameAsModern(
    "Take 1 {L} Energy card from your discard pile and attach it to Lt. Surge's Pikachu.",
    "Lt. Surge's Pikachu",
    'Attach a {L} Energy card from your discard pile to this Pokémon.'
  );
});

// Xatu [Neo Genesis 52] Prophecy ≡ Absol ex [Obsidian Flames 214] Future Sight.
test('Xatu Prophecy ≡ Future Sight', () => {
  sameAsModern(
    "Look at the top 3 cards of either player's deck and rearrange them as you like.",
    'Xatu',
    "Look at the top 3 cards of either player's deck and put them back in any order."
  );
});

// Sabrina's Kadabra [Gym Challenge 58] Life Drain ≡ Shedinja [Vivid Voltage 066] Life Squeeze
// behind the printed coin.
test('Life Drain ≡ heads-gated Life Squeeze', () => {
  sameAsModern(
    'Flip a coin. If heads, put a number of damage counters on the Defending Pokémon so that its remaining HP are 10.',
    "Sabrina's Kadabra",
    "Flip a coin. If heads, put damage counters on your opponent's Active Pokémon until its remaining HP is 10."
  );
});

// Togepi [Neo Destiny 56] Charm ≡ Absol-EX [XY Promos XY62] wording (20 there, 10 here).
test('Togepi Charm ≡ "any damage done by attacks from the Defending Pokémon is reduced"', () => {
  sameAsModern(
    "If the Defending Pokémon attacks during your opponent's next turn, any damage it does is reduced by 10 (before applying Weakness and Resistance).",
    'Togepi',
    "During your opponent's next turn, any damage done by attacks from the Defending Pokémon is reduced by 10 (before applying Weakness and Resistance)."
  );
});

// ── Focus Energy ────────────────────────────────────────────────────────────────────────────

// Lt. Surge's Rattata [Gym Heroes 82] / [Gym Challenge 85]: "Lt." is not a sentence end, so the
// possessive name reads like the "this Pokémon's" wording.
test("Lt. Surge's Rattata Focus Energy → nextTurnBaseDamage doubled", () => {
  sameAsModern(
    "During your next turn, Lt. Surge's Rattata's Gnaw attack's base damage is doubled.",
    "Lt. Surge's Rattata",
    "During your next turn, this Pokémon's Gnaw attack's base damage is doubled."
  );
  assert.deepEqual(
    steps("During your next turn, Lt. Surge's Rattata's Quick Attack's base damage is doubled.", "Lt. Surge's Rattata"),
    marker('self', 'yourNextTurn', { kind: 'nextTurnBaseDamage', attackName: 'quick', doubled: true })
  );
});

// Lt. Surge's Raticate [Gym Challenge 53] Focus Energy / Double-edge.
const RATICATE_FOCUS =
  "During your next turn, Lt. Surge's Raticate's Double-edge attack's damage (base damage and damage to itself) is doubled.";
const RATICATE_DOUBLE_EDGE = "Lt. Surge's Raticate does 20 damage to itself.";

test("Lt. Surge's Raticate Focus Energy → doubled base and recoil", () => {
  assert.deepEqual(
    steps(RATICATE_FOCUS, "Lt. Surge's Raticate"),
    marker('self', 'yourNextTurn', {
      kind: 'nextTurnBaseDamage',
      attackName: 'double-edge',
      doubled: true,
      selfDamageDoubled: true,
    })
  );
});

test("runtime: Lt. Surge's Raticate Double-edge after Focus Energy does 80, and 40 to itself", () => {
  const raticate = {
    instanceId: 1,
    name: "Lt. Surge's Raticate",
    hp: 100,
    attacks: [
      { name: 'Focus Energy', cost: [], damage: '', text: RATICATE_FOCUS },
      { name: 'Double-edge', cost: [], damage: '40', text: RATICATE_DOUBLE_EDGE },
    ],
  };
  const foe = { instanceId: 20, name: 'Foe', hp: 200, attacks: [{ name: 'Wait', cost: [], damage: '', text: '' }] };
  const focused = attackOnTurn(duelBoard(raticate, foe), 'p1', 2, 0);
  const waited = attackOnTurn(focused.state, 'p2', 3, 0);
  const hit = attackOnTurn(waited.state, 'p1', 4, 1).state;
  assert.equal(damageOn(hit, 'p2', 20), 80);
  assert.equal(damageOn(hit, 'p1', 1), 40);
  const plain = attackOnTurn(duelBoard(raticate, foe), 'p1', 2, 1).state;
  assert.equal(damageOn(plain, 'p2', 20), 40);
  assert.equal(damageOn(plain, 'p1', 1), 20);
});
