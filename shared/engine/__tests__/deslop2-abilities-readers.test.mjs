// deslop2 abilities: one reader per ability fact. Card text is the corpus row named in each test
// (out/pkmn-*-cards.json, by name + set + number); where no printed card uses a wording the
// text is stated as synthetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAbility } from '../rules/abilities.mjs';
import { classifyAbility } from '../rules/ability-effects.mjs';
import { isAbilitySuppressed, sideContextFor } from '../rules/ability-combat.mjs';
import { parseOnDamageAbilities, parseEndOfTurnAbilities, inPlayEntries } from '../rules/ability-triggers.mjs';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';

// pkmn-pokemon-cards.json: Melmetal, Unbroken Bonds 129 (Metal Eater).
const METAL_EATER =
  'Once during your turn (before your attack), you may discard a { M } Pokémon from your hand. If you do, heal 100 damage from this Pokémon.';

test('a hand-discard cost written with spaced symbols keeps its Pokémon type', () => {
  const step = parseAbility(`Metal Eater ${METAL_EATER}`).find((s) => s.type === 'discardCostAbility');
  assert.deepEqual(step?.pokemonTypes, ['metal']);
  const tight = parseAbility(`Metal Eater ${METAL_EATER.replace('{ M }', '{M}')}`).find(
    (s) => s.type === 'discardCostAbility'
  );
  assert.deepEqual(tight?.pokemonTypes, ['metal']);
});

test('a hand attach of a Basic {C} Energy names Colorless', () => {
  // Synthetic: Zapdos (30th Celebration 133) Flash-Pop Flapping wording with {C} for {L}; no
  // printed card attaches a {C} Energy from hand.
  const step = parseAbility(
    'Once during your turn, you may use this Ability. Attach a Basic {C} Energy card from your hand to this Pokémon.'
  ).find((s) => s.handEnergy);
  assert.deepEqual(step?.handEnergy.types, ['Colorless']);
  const lightning = parseAbility(
    'Once during your turn, you may use this Ability. Attach a Basic {L} Energy card from your hand to this Pokémon.'
  ).find((s) => s.handEnergy);
  assert.deepEqual(lightning?.handEnergy.types, ['Lightning']);
});

// pkmn-pokemon-cards.json: Pidgeot ex, Obsidian Flames 225 (Quick Search); `effect` is TCGdex's field.
test('an ability carrying its text in `effect` is classified from that text', () => {
  const pidgeot = createCard({
    supertype: 'Pokémon',
    name: 'Pidgeot ex',
    hp: 330,
    abilities: [
      {
        name: 'Quick Search',
        type: 'Ability',
        effect:
          "Once during your turn, you may search your deck for a card and put it into your hand. Then, shuffle your deck. You can't use more than 1 Quick Search Ability each turn.",
      },
    ],
  });
  assert.equal(classifyAbility(pidgeot), 'search');
});

// wotc: Venusaur, Base Set 15 (Energy Trans) is a Pokémon Power; Goop Gas Attack (base5-78) stops Powers.
test('Goop Gas Attack stops a Pokémon Power held in the singular `ability` shape too', () => {
  const power = {
    name: 'Energy Trans',
    type: 'Pokémon Power',
    text: "As often as you like during your turn (before your attack), you may take 1 {G} Energy card attached to 1 of your Pokémon and attach it to a different one. This power can't be used if Venusaur is Asleep, Confused, or Paralyzed.",
  };
  const plural = createCard({ supertype: 'Pokémon', name: 'Venusaur', hp: 100, abilities: [power] });
  const singular = createCard({ supertype: 'Pokémon', name: 'Venusaur', hp: 100, ability: power });
  const ctx = { powersOff: true };
  assert.equal(isAbilitySuppressed(plural, ctx), true);
  assert.equal(isAbilitySuppressed(singular, ctx), true);
  assert.equal(isAbilitySuppressed(singular, {}), false);
});

// pkmn-pokemon-cards.json: Bruxish, Surging Sparks 049 (Counterattack).
test('Counterattack thorns do nothing unless the caller says the holder is Active', () => {
  const bruxish = createCard({
    supertype: 'Pokémon',
    name: 'Bruxish',
    hp: 90,
    abilities: [
      {
        name: 'Counterattack',
        type: 'Ability',
        text: "If this Pokémon is in the Active Spot and is damaged by an attack from your opponent's Pokémon (even if this Pokémon is Knocked Out), put 3 damage counters on the Attacking Pokémon.",
      },
    ],
  });
  assert.equal(parseOnDamageAbilities(bruxish, { isActive: true }).count, 3);
  assert.equal(parseOnDamageAbilities(bruxish, { isActive: false }).count, 0);
  assert.equal(parseOnDamageAbilities(bruxish, {}).count, 0);
});

test('sideContextFor gives an unknown caller no side and never its own side as the opponent', () => {
  const state = createGameState({ gameId: 'deslop2-side', seed: 1, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    // Players keyed by id; the playerId field is deliberately absent on p1.
    state.players[id] = { ...(id === 'p2' ? { playerId: id } : {}), zones: createPlayerZones(), flags: {} };
  }
  state.players.p1.zones.active.push(createCard({ supertype: 'Pokémon', name: 'Mine', hp: 60 }));
  state.players.p2.zones.active.push(createCard({ supertype: 'Pokémon', name: 'Theirs', hp: 60 }));

  const own = sideContextFor(state, 'p1');
  assert.deepEqual(own.sideActive.map((c) => c.name), ['Mine']);
  assert.deepEqual(own.opponentActive.map((c) => c.name), ['Theirs']);

  const unknown = sideContextFor(state, undefined);
  assert.deepEqual(unknown.sideCards, []);
  assert.deepEqual(unknown.opponentSideCards, []);
});

// Great Tusk ex, Paldean Fates 053 prints "if this Pokémon is in the Active Spot"; the
// "is your Active Pokémon" form is synthetic (no printed end-of-turn discard uses it) and must gate alike.
test('an end-of-turn discard worded "is your Active Pokémon" is inert on a Benched holder', () => {
  const state = createGameState({ gameId: 'deslop2-eot', seed: 1, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, zones: createPlayerZones(), flags: {} };
  }
  const holder = createCard({
    instanceId: 1,
    supertype: 'Pokémon',
    name: 'Great Tusk ex',
    hp: 230,
    abilities: [
      {
        name: 'Quaking Demolition',
        type: 'Ability',
        text: 'Once at the end of your turn (after your attack), if this Pokémon is your Active Pokémon, you must discard the top 5 cards of your deck.',
      },
    ],
  });
  state.players.p1.zones.bench.push(holder);
  const ctx = sideContextFor(state, 'p1');
  assert.equal(parseEndOfTurnAbilities(inPlayEntries(state), ctx).length, 0);
  state.players.p1.zones.bench = [];
  state.players.p1.zones.active.push(holder);
  assert.equal(parseEndOfTurnAbilities(inPlayEntries(state), sideContextFor(state, 'p1')).length, 1);
});
