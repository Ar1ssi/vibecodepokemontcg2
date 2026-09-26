// Gen 6 (XY) special Energies: the authoritative server receives effect text from the
// client's TCGdex enrichment, and TCGdex spells types as words ("Fighting Pokémon",
// "provides Metal Energy", "ColorlessColorless less") where the pkmncards corpus prints
// {X} symbols. Before normalizeEnergyText every non-provision clause parsed to nothing,
// so Strong Energy's +20, Flash Energy's no-Weakness and the rest were cosmetic in play.
// Texts below copied verbatim from TCGdex (ids in each test) on 2026-09-27.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, findCard } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { applyCommand } from '../reduce.mjs';
import {
  parseSpecialEnergyEffects,
  getSpecialEnergyAttackBonus,
  getSpecialEnergyDamageReduction,
  getSpecialEnergyRetreatReduction,
  hasSpecialEnergyNoWeakness,
  hasSpecialEnergyEffectShield,
} from '../rules/special-energy-parse.mjs';
import { buildCardStatsPayload } from '../../../client/src/setup/netcode/card-stats.js';

const STRONG =
  "This card can only be attached to Fighting Pokémon. This card provides Fighting Energy only while this card is attached to a Fighting Pokémon.\n\nThe attacks of the Fighting Pokémon this card is attached to do 20 more damage to your opponent's Active Pokémon (before applying Weakness and Resistance).\n\n(If this card is attached to anything other than a Fighting Pokémon, discard this card.)";
const HERBAL =
  "This card can only be attached to Grass Pokémon. This card provides Grass Energy only while this card is attached to a Grass Pokémon.\n\nWhen you attach this card from your hand to 1 of your Grass Pokémon, heal 30 damage from that Pokémon.\n\n(If this card is attached to anything other than a Grass Pokémon, discard this card.)";
const SHIELD =
  "This card can only be attached to Metal Pokémon. This card provides Metal Energy only while this card is attached to a Metal Pokémon.\n\nThe attacks of your opponent's Pokémon do 10 less damage to the Metal Pokémon this card is attached to (before applying Weakness and Resistance).\n\n(If this card is attached to anything other than a Metal Pokémon, discard this card.)";
const WONDER =
  "This card can only be attached to Fairy Pokémon. This card provides Fairy Energy only while this card is attached to a Fairy Pokémon.\n\nPrevent all effects of your opponent's attacks, except damage, done to the Fairy Pokémon this card is attached to. (Existing effects are not removed.)\n\n(If this card is attached to anything other than a Fairy Pokémon, discard this card.)";
const MYSTERY =
  'This card can only be attached to Psychic Pokémon. This card provides Psychic Energy, but only while this card is attached to a Psychic Pokémon.\n\nThe Retreat Cost of the Pokémon this card is attached to is ColorlessColorless less.\n\n(If this card is attached to anything other than a Psychic Pokémon, discard this card.)';
const FLASH =
  "This card can only be attached to Lightning Pokémon. This card provides Lightning Energy only while this card is attached to a Lightning Pokémon.\n\nThe Lightning Pokémon this card is attached to has no Weakness.\n\n(If this card is attached to anything other than a Lightning Pokémon, discard this card.)";
const BURNING =
  "This card can only be attached to Fire Pokémon. This card provides Fire Energy only while this card is attached to a Fire Pokémon.\n\nIf this card is discarded by an attack of the Fire Pokémon this card is attached to, attach this card from your discard pile to that Pokémon after attacking.\n\n(If this card is attached to anything other than a Fire Pokémon, discard this card.)";
const SPLASH =
  "This card can only be attached to Water Pokémon. This card provides Water Energy only while this card is attached to a Water Pokémon.\n\nIf the Water Pokémon this card is attached to is Knocked Out by damage from an opponent's attack, put that Pokémon into your hand. (Discard all cards attached to it.)\n\n(If this card is attached to anything other than a Water Pokémon, discard this card.)";
const DOUBLE_DRAGON =
  'This card can only be attached to Dragon Pokémon. This card provides every type of Energy, but provides only 2 Energy at a time, only while this card is attached to a Dragon Pokémon.\n\n(If this card is attached to anything other than a Dragon Pokémon, discard this card.)';

const energy = (name, text) => ({ name, type: 'Energy', text });
const hostWith = (name, types, energyCard) => {
  const host = { instanceId: 1, name, types, hp: 100 };
  return { host, zone: [host, { ...energyCard, instanceId: 2, attachedTo: 1 }] };
};
const stepTypes = (card) => parseSpecialEnergyEffects(card).steps.map((s) => s.type);

test('TCGdex word notation parses every Gen 6 special Energy effect (xy3-104, xy3-103, xy5-143, xy5-144, xy4-112, xy7-83, xy8-151, xy9-113, xy6-97)', () => {
  assert.deepEqual(stepTypes(energy('Strong Energy', STRONG)), ['attachRestriction', 'provide', 'damageBonus']);
  assert.deepEqual(stepTypes(energy('Herbal Energy', HERBAL)), ['attachRestriction', 'provide', 'onAttachHeal']);
  assert.deepEqual(stepTypes(energy('Shield Energy', SHIELD)), ['attachRestriction', 'provide', 'damageReduction']);
  assert.deepEqual(stepTypes(energy('Wonder Energy', WONDER)), ['attachRestriction', 'provide', 'effectShield']);
  assert.deepEqual(stepTypes(energy('Mystery Energy', MYSTERY)), ['attachRestriction', 'provide', 'retreatReduction']);
  assert.deepEqual(stepTypes(energy('Flash Energy', FLASH)), ['attachRestriction', 'provide', 'noWeakness']);
  assert.deepEqual(stepTypes(energy('Burning Energy', BURNING)), ['attachRestriction', 'provide', 'onDiscardReattach']);
  assert.deepEqual(stepTypes(energy('Splash Energy', SPLASH)), ['attachRestriction', 'provide', 'onKnockoutReturnToHand']);
  assert.deepEqual(stepTypes(energy('Double Dragon Energy', DOUBLE_DRAGON)), ['attachRestriction', 'provide']);

  const restriction = parseSpecialEnergyEffects(energy('Strong Energy', STRONG)).steps[0];
  assert.equal(restriction.kind, 'type');
  assert.equal(restriction.hostType, 'Fighting');
  const [doubleDragon] = parseSpecialEnergyEffects(energy('Double Dragon Energy', DOUBLE_DRAGON)).provides;
  assert.deepEqual(doubleDragon.energyTypes, ['Any']);
  assert.equal(doubleDragon.count, 2);
  assert.equal(doubleDragon.condition, 'host:Dragon');
});

test('TCGdex word notation executes the passive Gen 6 effects', () => {
  const strong = hostWith('Machamp', ['Fighting'], energy('Strong Energy', STRONG));
  assert.equal(getSpecialEnergyAttackBonus(strong.host, strong.zone), 20);
  assert.equal(getSpecialEnergyAttackBonus({ ...strong.host, types: ['Water'] }, strong.zone), 0);

  const shield = hostWith('Bronzong', ['Metal'], energy('Shield Energy', SHIELD));
  assert.equal(getSpecialEnergyDamageReduction(shield.host, shield.zone, { afterWR: false }), 10);

  const flash = hostWith('Raikou', ['Lightning'], energy('Flash Energy', FLASH));
  assert.equal(hasSpecialEnergyNoWeakness(flash.host, flash.zone), true);
  assert.equal(hasSpecialEnergyNoWeakness({ ...flash.host, types: ['Fire'] }, flash.zone), false);

  const wonder = hostWith('Gardevoir', ['Fairy'], energy('Wonder Energy', WONDER));
  assert.equal(hasSpecialEnergyEffectShield(wonder.host, wonder.zone), true);

  const mystery = hostWith('Espeon', ['Psychic'], energy('Mystery Energy', MYSTERY));
  assert.equal(getSpecialEnergyRetreatReduction(mystery.host, mystery.zone), 2);
});

function game() {
  const state = createGameState({
    players: { p1: { username: 'Ash' }, p2: { username: 'Gary' } },
    rulesEnabled: true,
  });
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) {
      state.players[pid].zones.prizes.push(createCard({ instanceId: (pid === 'p1' ? 900 : 950) + i, name: 'Prize' }));
    }
    for (let i = 0; i < 8; i += 1) {
      state.players[pid].zones.deck.push(createCard({ instanceId: (pid === 'p1' ? 800 : 850) + i, name: 'Filler' }));
    }
  }
  return state;
}

// The shape shadow.mjs creates: identity-only hand card; the effect text arrives via cardStats.
function attachWithText(state, { name, text, targetId }) {
  const stats = applyCommand(state, {
    type: 'cardStats',
    payload: buildCardStatsPayload([{ syncInstance: 0, name, type: 'Energy', effect: text }]),
    playerId: 'p1',
  });
  assert.equal(stats.error, null);
  const res = applyCommand(stats.state, {
    type: 'attachCard',
    payload: { instanceId: 2, targetInstanceId: targetId },
    playerId: 'p1',
  });
  assert.equal(res.error, null);
  return res.state;
}

test('Strong Energy adds +20 to the server attack before Weakness (cardStats → attach → attack)', () => {
  let state = game();
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1,
      ownerId: 'p1',
      supertype: 'Pokémon',
      name: 'Machamp',
      stage: 'Basic',
      types: ['Fighting'],
      hp: 150,
      attacks: [{ name: 'Chop', damage: 60, cost: [] }],
    })
  );
  state.players.p1.zones.hand.push(createCard({ instanceId: 2, syncInstance: 0, ownerId: 'p1', name: 'Strong Energy', type: 'Energy' }));
  state.players.p2.zones.active.push(
    createCard({
      instanceId: 9,
      ownerId: 'p2',
      supertype: 'Pokémon',
      name: 'Snorlax',
      stage: 'Basic',
      types: ['Colorless'],
      hp: 200,
      weakness: { type: 'Fighting', value: 2 },
    })
  );

  state = attachWithText(state, { name: 'Strong Energy', text: STRONG, targetId: 1 });
  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(findCard(res.state, 9).card.damage, 160, '(60 + 20) × 2 Weakness');
});

test('Flash Energy removes the host’s Weakness in the server attack (cardStats → attack)', () => {
  let state = game();
  state.players.p1.zones.active.push(
    createCard({
      instanceId: 1,
      ownerId: 'p1',
      supertype: 'Pokémon',
      name: 'Machamp',
      stage: 'Basic',
      types: ['Fighting'],
      hp: 150,
      attacks: [{ name: 'Chop', damage: 40, cost: [] }],
    })
  );
  state.players.p2.zones.active.push(
    createCard({
      instanceId: 9,
      ownerId: 'p2',
      supertype: 'Pokémon',
      name: 'Raikou',
      stage: 'Basic',
      types: ['Lightning'],
      hp: 200,
      weakness: { type: 'Fighting', value: 2 },
    }),
    createCard({ instanceId: 2, syncInstance: 0, ownerId: 'p2', name: 'Flash Energy', type: 'Energy', attachedTo: 9 })
  );

  const stats = applyCommand(state, {
    type: 'cardStats',
    payload: buildCardStatsPayload([{ syncInstance: 0, name: 'Flash Energy', type: 'Energy', effect: FLASH }]),
    playerId: 'p2',
  });
  assert.equal(stats.error, null);
  state = stats.state;

  const res = applyCommand(state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p1' });
  assert.equal(res.error, null);
  assert.equal(findCard(res.state, 9).card.damage, 40, 'no Weakness multiplier');
});
