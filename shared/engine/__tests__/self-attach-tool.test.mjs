// Pokémon that attach themselves as a Pokémon Tool by their own Ability / Poké-Power.
// Card text: out/pkmn-pokemon-cards.json — Shedinja LOT 95, Klefki STS 80, Unown Q MD 49,
// Unown G GE 57, Unown E MT 65.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard, isPokemon } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { parseSelfAttachTool } from '../rules/self-attach-tool.mjs';
import {
  combinedToolDamagePrevention,
  combinedToolHpBonus,
  combinedToolRetreatCost,
  isPokemonToolCard,
  toolPrizeCountAdjust,
} from '../rules/tool-combat.mjs';
import { abilityPreventsAttackEffects, sideContextFor } from '../rules/ability-combat.mjs';
import { topPokemonCard } from '../rules/evolved-pokemon.mjs';
import { isUsableAbilityCard } from '../rules/collect-usable-abilities.mjs';
import { listConditions } from '../rules/special-conditions.mjs';
import { isToolCard } from '../effects/trainer-steps.mjs';

const VESSEL_OF_LIFE =
  'Once during your turn (before your attack), you may discard all cards attached to this Pokémon and attach it to 1 of your Pokémon as a Pokémon Tool card. When the Pokémon this card is attached to is Knocked Out, your opponent takes 1 fewer Prize card.';
const WONDER_LOCK =
  "Once during your turn (before your attack), if this Pokémon is on your Bench, you may discard all cards attached to this Pokémon and attach it to 1 of your Pokémon as a Pokémon Tool card. Prevent any damage done to the Pokémon this card is attached to by attacks from your opponent's Mega Evolution Pokémon. If this card is attached to a Pokémon, discard this card at the end of your opponent's turn.";
const QUICK =
  'Once during your turn (before your attack), if Unown Q is on your Bench, you may discard all cards attached to Unown Q and attach Unown Q to 1 of your Pokémon as a Pokémon Tool card. As long as Unown Q is attached to a Pokémon, you pay {C} less to retreat that Pokémon.';
const GUARD =
  'Once during your turn (before your attack), if Unown G is on your Bench, you may discard all cards attached to Unown G and attach Unown G to 1 of your Pokémon as a Pokémon Tool card. As long as Unown G is attached to a Pokémon, prevent all effects of attacks, excluding damage, done to that Pokémon.';
const EQUIP =
  'Once during your turn (before your attack), if Unown E is on your Bench, you may discard all cards attached to Unown E and attach Unown E to 1 of your Pokémon as a Pokémon Tool card. As long as Unown E is attached to a Pokémon, that Pokémon gets +10 HP.';

function setupGame() {
  const rng = createRng(7);
  const state = createGameState({ gameId: 'self-attach-tool', seed: 7, rulesEnabled: true });
  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = {
      playerId,
      username: playerId,
      zones: createPlayerZones(),
      flags: { abilitiesUsed: {} },
    };
  }
  state.turn = { player: 'p1', number: 2, phase: 'main' };
  return { state, rng };
}

const mon = (instanceId, name, extra = {}) =>
  createCard({ instanceId, name, hp: 100, supertype: 'Pokémon', stage: 'Basic', ...extra });
const withAbility = (instanceId, name, abilityName, text, extra = {}) =>
  mon(instanceId, name, { abilities: [{ name: abilityName, type: 'Ability', text }], ...extra });
const energy = (instanceId, attachedTo) =>
  createCard({ instanceId, name: 'Psychic Energy', supertype: 'Energy', subtypes: ['Basic'], attachedTo });

const use = (state, rng, instanceId) =>
  applyCommand(state, { type: 'useAbility', payload: { instanceId }, playerId: 'p1' }, rng);
const choose = (res, selection, rng) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', payload: { choiceId: res.pendingChoice.choiceId, selection }, playerId: 'p1' },
    rng
  );
const find = (state, instanceId) => {
  for (const player of Object.values(state.players)) {
    for (const [zoneId, cards] of Object.entries(player.zones)) {
      const card = cards.find((c) => c.instanceId === instanceId);
      if (card) return { card, zoneId, zone: cards, player };
    }
  }
  return null;
};

/** Board: Active 72, Bench 73 and the Ability holder 70 on the Bench with an Energy on it. */
function boardWith(holder) {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(mon(72, 'Bronzong', { retreatCost: ['Colorless', 'Colorless'] }));
  state.players.p1.zones.bench.push(mon(73, 'Pikachu'), holder, energy(74, 70));
  state.players.p2.zones.active.push(mon(71, 'Opp'));
  return { state, rng };
}

test('parseSelfAttachTool rewrites each printed effect into Tool wording', () => {
  const read = (text) => parseSelfAttachTool(text.toLowerCase().replace(/\{c\}/g, '{c}'));
  assert.deepEqual(read(QUICK), {
    toolText: 'the retreat cost of the pokémon this card is attached to is {c} less.',
    discardAfterOpponentTurn: false,
  });
  assert.equal(read(EQUIP).toolText, 'the pokémon this card is attached to gets +10 hp.');
  assert.equal(
    read(GUARD).toolText,
    'prevent all effects of attacks, excluding damage, done to the pokémon this card is attached to.'
  );
  assert.equal(
    read(VESSEL_OF_LIFE).toolText,
    'when the pokémon this card is attached to is knocked out, your opponent takes 1 fewer prize card.'
  );
  assert.deepEqual(read(WONDER_LOCK), {
    toolText:
      "prevent all damage done to the pokémon this card is attached to by attacks from your opponent's mega evolution pokémon.",
    discardAfterOpponentTurn: true,
  });
  assert.equal(parseSelfAttachTool('attach this card from your hand to 1 of your vikavolt'), null);
});

test('Unown Q QUICK: the player picks the Pokémon; its Energy is discarded and the host retreats for {C} less', () => {
  const { state, rng } = boardWith(withAbility(70, 'Unown Q', 'QUICK', QUICK));
  const asked = use(state, rng, 70);
  assert.equal(asked.error, null);
  assert.deepEqual(
    asked.pendingChoice.options.map((o) => o.instanceId).sort(),
    [72, 73],
    'every other Pokémon, never Unown Q itself'
  );

  const res = choose(asked, [72], rng);
  assert.equal(res.error, null);
  const unown = find(res.state, 70);
  assert.equal(unown.zoneId, 'active');
  assert.equal(unown.card.attachedTo, 72);
  assert.ok(isPokemonToolCard(unown.card));
  assert.equal(isPokemon(unown.card), false);
  assert.equal(find(res.state, 74).zoneId, 'discard');
  const host = find(res.state, 72);
  assert.equal(topPokemonCard(host.zone, host.card), host.card, 'the Tool is not read as an evolution');
  assert.equal(combinedToolRetreatCost(2, host.card, host.zone), 1);
  assert.ok(res.state.players.p1.flags.abilitiesUsed[70]);
});

test('the Ability picker offers Unown Q on the Bench, not in the Active Spot', () => {
  const unown = withAbility(70, 'Unown Q', 'QUICK', QUICK);
  assert.equal(isUsableAbilityCard(unown, { zone: 'bench' }), true);
  assert.equal(isUsableAbilityCard(unown, { zone: 'active' }), false);
});

test('Unown Q QUICK cannot be used from the Active Spot', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(withAbility(70, 'Unown Q', 'QUICK', QUICK));
  state.players.p1.zones.bench.push(mon(73, 'Pikachu'));
  state.players.p2.zones.active.push(mon(71, 'Opp'));
  assert.ok(use(state, rng, 70).error);
});

test('Unown E EQUIP: the host gets +10 HP', () => {
  const { state, rng } = boardWith(withAbility(70, 'Unown E', 'EQUIP', EQUIP));
  const res = choose(use(state, rng, 70), [73], rng);
  const host = find(res.state, 73);
  assert.equal(combinedToolHpBonus(host.card, host.zone), 10);
});

test('a Pokémon that already has a Tool is not offered; the one Pokémon left gets it without a prompt', () => {
  const { state, rng } = boardWith(withAbility(70, 'Unown E', 'EQUIP', EQUIP));
  state.players.p1.zones.bench.push(
    createCard({ instanceId: 75, name: 'Float Stone', supertype: 'Trainer', subtypes: ['Pokémon Tool'], attachedTo: 73 })
  );
  const res = use(state, rng, 70);
  assert.equal(res.pendingChoice, null);
  assert.equal(find(res.state, 70).card.attachedTo, 72);
});

test('with no Pokémon able to hold a Tool, the Ability does nothing and is not spent', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(
    mon(72, 'Bronzong'),
    createCard({ instanceId: 75, name: 'Float Stone', supertype: 'Trainer', subtypes: ['Pokémon Tool'], attachedTo: 72 })
  );
  state.players.p1.zones.bench.push(withAbility(70, 'Unown E', 'EQUIP', EQUIP));
  state.players.p2.zones.active.push(mon(71, 'Opp'));
  const res = use(state, rng, 70);
  assert.equal(find(res.state, 70).zoneId, 'bench');
  assert.equal(find(res.state, 70).card.attachedTo, null);
  assert.equal(Boolean(res.state.players.p1.flags.abilitiesUsed[70]), false);
});

test('Shedinja Vessel of Life from the Active Spot: Nincada and Energy are discarded, the Bench promotes, 1 fewer Prize', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(
    mon(80, 'Nincada'),
    withAbility(70, 'Shedinja', 'Vessel of Life', VESSEL_OF_LIFE, { stage: 'Stage 1', attachedTo: 80 }),
    energy(74, 80)
  );
  state.players.p1.zones.bench.push(mon(73, 'Pikachu'));
  state.players.p2.zones.active.push(mon(71, 'Opp'));

  const res = use(state, rng, 70);
  assert.equal(res.error, null);
  const shedinja = find(res.state, 70);
  assert.equal(shedinja.card.attachedTo, 73, 'the only other Pokémon is the target');
  assert.equal(find(res.state, 80).zoneId, 'discard');
  assert.equal(find(res.state, 74).zoneId, 'discard');
  const active = res.state.players.p1.zones.active.find((c) => !c.attachedTo);
  assert.equal(active?.instanceId, 73, 'Pikachu replaces the Active Pokémon that left');
  const host = find(res.state, 73);
  assert.equal(toolPrizeCountAdjust(host.card, host.zone, 1), 0);
});

test('Shedinja Vessel of Life: the discarded Nincada keeps no damage or Special Conditions', () => {
  const { state, rng } = setupGame();
  state.players.p1.zones.active.push(
    mon(80, 'Nincada', { damage: 30, specialCondition: 'Asleep' }),
    withAbility(70, 'Shedinja', 'Vessel of Life', VESSEL_OF_LIFE, { stage: 'Stage 1', attachedTo: 80 })
  );
  state.players.p1.zones.bench.push(mon(73, 'Pikachu'));
  state.players.p2.zones.active.push(mon(71, 'Opp'));

  const res = use(state, rng, 70);
  assert.equal(res.error, null);
  const nincada = find(res.state, 80);
  assert.equal(nincada.zoneId, 'discard');
  assert.equal(nincada.card.damage, 0);
  assert.deepEqual(listConditions(nincada.card), []);
});

test('a card attached as a Tool cannot use its Ability again on a later turn', () => {
  const { state, rng } = boardWith(withAbility(70, 'Unown Q', 'QUICK', QUICK));
  const attached = choose(use(state, rng, 70), [72], rng);
  assert.equal(attached.error, null);
  attached.state.players.p1.flags.abilitiesUsed = {};
  delete find(attached.state, 70).card.abilityUsed;

  const again = use(attached.state, rng, 70);
  assert.ok(again.error, 'refused');
  assert.equal(find(again.state, 72).zoneId, 'active', 'the host is not discarded');
  assert.equal(find(again.state, 70).card.attachedTo, 72);
});

test('Tool effects count and remove a card attached as a Tool', () => {
  const { state, rng } = boardWith(withAbility(70, 'Unown E', 'EQUIP', EQUIP));
  const res = choose(use(state, rng, 70), [73], rng);
  const unown = find(res.state, 70).card;
  assert.equal(isToolCard(unown), true);
  assert.equal(isToolCard(withAbility(76, 'Unown E', 'EQUIP', EQUIP)), false, 'not while unattached');
});

test('Unown G GUARD: attack effects (not damage) done to the host are prevented', () => {
  const { state, rng } = boardWith(withAbility(70, 'Unown G', 'GUARD', GUARD));
  const attacker = state.players.p2.zones.active[0];
  const before = find(state, 72);
  assert.equal(abilityPreventsAttackEffects(before.card, attacker, sideContextFor(state, 'p1')), false);

  const res = choose(use(state, rng, 70), [72], rng);
  const host = find(res.state, 72);
  assert.equal(abilityPreventsAttackEffects(host.card, attacker, sideContextFor(res.state, 'p1')), true);
});

test('Klefki Wonder Lock: damage from Mega Evolution Pokémon only; discarded at the end of the opponent\'s turn', () => {
  const { state, rng } = boardWith(withAbility(70, 'Klefki', 'Wonder Lock', WONDER_LOCK));
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < 5; i += 1) {
      state.players[playerId].zones.deck.push(createCard({ instanceId: (playerId === 'p1' ? 200 : 300) + i, name: 'Filler' }));
    }
  }
  let res = choose(use(state, rng, 70), [72], rng);
  assert.equal(res.error, null);
  const host = find(res.state, 72);
  const mega = mon(90, 'M Gardevoir-EX', { subtypes: ['MEGA', 'EX'] });
  assert.equal(combinedToolDamagePrevention(host.card, host.zone, mega).preventAll, true);
  assert.equal(combinedToolDamagePrevention(host.card, host.zone, mon(91, 'Gardevoir', { stage: 'Stage 2' })).preventAll, false);

  res = applyCommand(res.state, { type: 'pass', payload: {}, playerId: 'p1' }, rng);
  assert.equal(res.error, null);
  assert.equal(find(res.state, 70).card.attachedTo, 72, 'still attached through the end of your own turn');
  res = applyCommand(res.state, { type: 'pass', payload: {}, playerId: 'p2' }, rng);
  assert.equal(res.error, null);
  const klefki = find(res.state, 70);
  assert.equal(klefki.zoneId, 'discard');
  assert.equal(klefki.card.asTool, undefined);
});
