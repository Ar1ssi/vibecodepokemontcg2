// Team Plasma era Tools, Stadiums and Supporters, through the engine readers that apply them.
// Card text is quoted from out/pkmn-trainer-cards.json (set, number).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { attackViewFor } from '../reduce/attack.mjs';
import { applyToolDamageReduction, combinedToolAttackBonus, combinedToolDamagePrevention, combinedToolRetreatCost, toolPrizeCountAdjust, attachedToolOnDamageEffects } from '../rules/tool-combat.mjs';
import { stadiumNullifiesWeakness, getStadiumCheckupPoisonBonus, parseStadiumCheckupPoisonBonus } from '../rules/stadium-effects.mjs';
import { stadiumOnAttachTriggers } from '../rules/stadium-triggers.mjs';
import { parseTurnDamageBonus, turnDamageBonusTotal } from '../rules/turn-damage-bonus.mjs';
import { buildServerAttackContext } from '../rules/attack-damage-context.mjs';
import { rulesState } from '../rules/rules-state.mjs';
import { attackCostPayable } from '../reduce/legality.mjs';

const pokemon = (instanceId, name, extra = {}) =>
  createCard({ instanceId, name, hp: 120, supertype: 'Pokémon', stage: 'Basic', types: ['Colorless'], ...extra });

const tool = (instanceId, name, text, attachedTo) =>
  createCard({ instanceId, name, supertype: 'Trainer', subtypes: ['Pokémon Tool'], isTool: true, text, attachedTo });

const TEAM_PLASMA = { subtypes: ['Team Plasma'] };

// Silver Mirror, Plasma Blast 89.
const SILVER_MIRROR =
  'Prevent all effects of attacks, including damage, done to the Pokémon this card is attached to (excluding Pokémon-EX) by your opponent’s Team Plasma Pokémon.';
// Silver Bangle, Plasma Blast 88.
const SILVER_BANGLE =
  'The attacks of the Pokémon this card is attached to (excluding Pokémon-EX) do 30 more damage to Active Pokémon-EX (before applying Weakness and Resistance).';
// Eviolite, Plasma Storm 122.
const EVIOLITE =
  'If the Pokémon this card is attached to is a Basic Pokémon, any damage done to this Pokémon by attacks is reduced by 20 (after applying Weakness and Resistance).';
// Float Stone, Plasma Freeze 99.
const FLOAT_STONE = 'The Pokémon this card is attached to has no Retreat Cost.';
// Life Dew, Plasma Freeze 107.
const LIFE_DEW = 'If the Pokémon this card is attached to is Knocked Out, your opponent takes 1 fewer Prize card.';
// Rock Guard, Plasma Freeze 108.
const ROCK_GUARD =
  'If the Pokémon this card is attached to is your Active Pokémon and is damaged by an opponent’s attack (even if that Pokémon is Knocked Out), put 6 damage counters on the Attacking Pokémon.';
// Team Plasma Badge, Plasma Freeze 104.
const TEAM_PLASMA_BADGE = 'The Pokémon this card is attached to is a Team Plasma Pokémon.';
// Frozen City, Plasma Freeze 100 (stadium).
const FROZEN_CITY =
  'Whenever any player attaches an Energy from his or her hand to 1 of his or her Pokémon (excluding Team Plasma Pokémon) put 2 damage counters on that Pokémon.';
// Plasma Frigate, Plasma Storm 124 (stadium).
const PLASMA_FRIGATE =
  'Each Pokémon that has any Plasma Energy attached to it (both yours and your opponent’s) has no Weakness.';
// Virbank City Gym, Plasma Storm 126 (stadium).
const VIRBANK_CITY_GYM = 'Put 2 more damage counters on Poisoned Pokémon (both yours and your opponent’s) between turns.';
// G Booster, Plasma Blast 92; G Scope, Plasma Blast 93.
const G_BOOSTER =
  'The Genesect-EX this card is attached to can also use the attack on this card. (You still need the necessary Energy to use this attack.) {G}{G}{C} → G Booster : 200 Discard 2 Energy attached to this Pokémon. This attack’s damage isn’t affected by any effects on the Defending Pokémon.';
const G_SCOPE =
  'The Genesect-EX this card is attached to can also use the attack on this card. (You still need the necessary Energy to use this attack.) {G}{G}{C} → G Scope This attack does 100 damage to 1 of your opponent’s Benched Pokémon. (Don’t apply Weakness and Resistance for Benched Pokémon.)';
// Iris, Plasma Blast 81 and 101.
const IRIS =
  'During this turn, your Pokémon’s attacks do 10 more damage to the Active Pokémon for each Prize card your opponent has taken (before applying Weakness and Resistance).';

function basicState() {
  const state = createGameState({ gameId: 'plasma-trainers', seed: 7, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: { abilitiesUsed: {} } };
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  return state;
}

test('Silver Mirror (Plasma Blast 89): prevents effects only from the opponent\'s Team Plasma Pokémon', () => {
  const host = pokemon(10, 'Host');
  const zone = [host, tool(50, 'Silver Mirror', SILVER_MIRROR, 10)];
  const teamPlasmaAttacker = pokemon(2, 'Zekrom', TEAM_PLASMA);
  const plainAttacker = pokemon(3, 'Plain Attacker');

  assert.equal(combinedToolDamagePrevention(host, zone, teamPlasmaAttacker).preventAll, true);
  assert.equal(combinedToolDamagePrevention(host, zone, plainAttacker).preventAll, false);
});

test('Silver Bangle (Plasma Blast 88): +30 to Active Pokémon-EX only, not to other Pokémon', () => {
  const holder = pokemon(30, 'Attacker');
  const zone = [holder, tool(52, 'Silver Bangle', SILVER_BANGLE, 30)];
  const ex = pokemon(31, 'Target ex', { subtypes: ['Pokémon-EX'] });
  const plain = pokemon(32, 'Target');

  assert.equal(combinedToolAttackBonus(holder, zone, ex, { defenderIsActive: true }), 30);
  assert.equal(combinedToolAttackBonus(holder, zone, plain, { defenderIsActive: true }), 0);
});

test('Eviolite (Plasma Storm 122): reduces damage by 20 on a Basic holder only', () => {
  const basic = pokemon(20, 'Basic Host');
  const basicZone = [basic, tool(51, 'Eviolite', EVIOLITE, 20)];
  const attacker = pokemon(4, 'Attacker');
  assert.equal(applyToolDamageReduction(60, basic, basicZone, attacker), 40);

  const stage1 = pokemon(21, 'Stage 1 Host', { stage: 'Stage 1' });
  const stage1Zone = [stage1, tool(51, 'Eviolite', EVIOLITE, 21)];
  assert.equal(applyToolDamageReduction(60, stage1, stage1Zone, attacker), 60);
});

test('Float Stone (Plasma Freeze 99): the holder has no Retreat Cost', () => {
  const heavy = pokemon(30, 'Heavy', { retreatCost: 4 });
  const zone = [heavy, tool(52, 'Float Stone', FLOAT_STONE, 30)];
  assert.equal(combinedToolRetreatCost(4, heavy, zone), 0);
});

test('Life Dew (Plasma Freeze 107): the opponent takes 1 fewer Prize when the holder is Knocked Out', () => {
  const holder = pokemon(40, 'KO Host');
  const zone = [holder, tool(53, 'Life Dew', LIFE_DEW, 40)];
  assert.equal(toolPrizeCountAdjust(holder, zone, 2), 1);
});

test('Rock Guard (Plasma Freeze 108): damage to the Active holder puts 6 counters on the attacker', () => {
  const holder = pokemon(60, 'Active Host');
  const zone = [holder, tool(54, 'Rock Guard', ROCK_GUARD, 60)];
  const attacker = pokemon(4, 'Attacker');

  const [hit] = attachedToolOnDamageEffects(holder, zone, { attacker, damage: 40, isActive: true });
  assert.equal(hit.damageAttacker, 6);

  assert.deepEqual(attachedToolOnDamageEffects(holder, zone, { attacker, damage: 40, isActive: false }), []);
});

test('Team Plasma Badge (Plasma Freeze 104): the holder counts as a Team Plasma Pokémon in play', () => {
  const state = basicState();
  const holder = pokemon(10, 'Plain Active');
  state.players.p1.zones.active.push(holder, tool(104, 'Team Plasma Badge', TEAM_PLASMA_BADGE, 10));
  state.players.p2.zones.active.push(pokemon(900, 'Opposing Active'));

  const ctx = buildServerAttackContext(state, {
    attackerPlayerId: 'p1',
    defenderPlayerId: 'p2',
    attacker: holder,
    defender: state.players.p2.zones.active[0],
  });
  const badgedKinds = ctx.ownPokemon.find((entry) => entry.name === 'Plain Active')?.kinds || [];
  assert.ok(badgedKinds.includes('group:team plasma'), 'a Badged Pokémon is a Team Plasma Pokémon');
});

test('Frozen City (Plasma Freeze 100): 2 damage counters on a non-Team Plasma holder, none on a Team Plasma holder', () => {
  const stadium = { name: 'Frozen City', supertype: 'Trainer', subtypes: ['Stadium'], text: FROZEN_CITY };
  const plainHolder = pokemon(10, 'Plain Holder');
  const teamPlasmaHolder = pokemon(11, 'Zekrom', TEAM_PLASMA);

  assert.deepEqual(stadiumOnAttachTriggers(stadium, { hostTop: plainHolder, fromZone: 'hand' }), [
    { kind: 'damage', amount: 20, source: 'Frozen City' },
  ]);
  assert.deepEqual(stadiumOnAttachTriggers(stadium, { hostTop: teamPlasmaHolder, fromZone: 'hand' }), []);
});

test('Plasma Frigate (Plasma Storm 124): a Pokémon with Plasma Energy attached has no Weakness', () => {
  const stadium = { name: 'Plasma Frigate', supertype: 'Trainer', subtypes: ['Stadium'], text: PLASMA_FRIGATE };
  const holder = pokemon(71, 'Plasma Holder', { weaknesses: [{ type: 'Fire', value: '×2' }] });
  const plasmaEnergy = createCard({ instanceId: 70, name: 'Plasma Energy', supertype: 'Energy', subtypes: ['Special'], attachedTo: 71 });

  assert.equal(stadiumNullifiesWeakness(stadium, holder, { defenderZoneCards: [holder, plasmaEnergy] }), true);
  assert.equal(stadiumNullifiesWeakness(stadium, holder, { defenderZoneCards: [holder] }), false);
});

test('Virbank City Gym (Plasma Storm 126): 2 more poison counters between turns on Poisoned Pokémon', () => {
  const stadium = { name: 'Virbank City Gym', supertype: 'Trainer', subtypes: ['Stadium'], text: VIRBANK_CITY_GYM };
  assert.equal(parseStadiumCheckupPoisonBonus(stadium), 2);

  const prevEnabled = rulesState.enabled;
  const prevStadium = rulesState.stadium;
  rulesState.enabled = true;
  rulesState.stadium = { card: stadium, user: 'p1' };
  try {
    const poisoned = pokemon(80, 'Poisoned Mon');
    assert.equal(getStadiumCheckupPoisonBonus(poisoned, 'p1'), 2, 'the owner\'s Poisoned Pokémon');
    assert.equal(getStadiumCheckupPoisonBonus(poisoned, 'p2'), 2, 'the opponent\'s Poisoned Pokémon');
  } finally {
    rulesState.enabled = prevEnabled;
    rulesState.stadium = prevStadium;
  }
});

test('G Booster (Plasma Blast 92) and G Scope (Plasma Blast 93): only the named Genesect-EX can use the attack', () => {
  const state = basicState();
  const genesect = pokemon(10, 'Genesect-EX', { subtypes: ['Basic', 'ex'] });
  const plain = pokemon(11, 'Plain Mon');
  state.players.p1.zones.active.push(genesect, tool(90, 'G Booster', G_BOOSTER, 10));
  state.players.p1.zones.bench.push(plain, tool(91, 'G Scope', G_SCOPE, 11));

  const genesectAttacks = attackViewFor(state, genesect).attacks.map((a) => a.name);
  assert.ok(genesectAttacks.includes('G Booster'), 'the Genesect-EX holder gets G Booster');

  const plainAttacks = attackViewFor(state, plain).attacks.map((a) => a.name);
  assert.equal(plainAttacks.includes('G Scope'), false, 'a Pokémon the clause does not name gets no grant');
});

test('Iris (Plasma Blast 81, 101): +10 per Prize card the opponent has taken, to the Active', () => {
  const [bonus] = [parseTurnDamageBonus(IRIS)];
  assert.equal(bonus.amount, 10);
  assert.equal(bonus.perPrizeTaken, true);

  const attacker = pokemon(1, 'Attacker');
  const defender = pokemon(2, 'Defender');
  // 6 Prizes remaining = the opponent took 0; 4 remaining = took 2, so +20.
  assert.equal(turnDamageBonusTotal([bonus], attacker, defender, { defenderIsActive: true, defenderPrizesRemaining: 4 }), 20);
  assert.equal(turnDamageBonusTotal([bonus], attacker, defender, { defenderIsActive: false, defenderPrizesRemaining: 4 }), 0);
});

// Victory Piece, Plasma Storm 130.
const VICTORY_PIECE =
  'If this card is attached to Victini-EX, Victini-EX can use its attacks regardless of the amount or type of Energy attached to it.';

test('Victory Piece (Plasma Storm 130): Victini-EX attacks with no Energy; any other holder still pays', () => {
  const state = basicState();
  const attack = { name: 'Turbo Energize', cost: ['Fire', 'Fire', 'Colorless'], damage: 100 };
  const victini = pokemon(10, 'Victini-EX', { subtypes: ['Basic', 'EX'], attacks: [attack] });
  state.players.p1.zones.active.push(victini, tool(50, 'Victory Piece', VICTORY_PIECE, 10));
  assert.equal(attackCostPayable(state, 'p1', victini, attack), true);

  const other = basicState();
  const reshiram = pokemon(11, 'Reshiram', { attacks: [attack] });
  other.players.p1.zones.active.push(reshiram, tool(51, 'Victory Piece', VICTORY_PIECE, 11));
  assert.equal(attackCostPayable(other, 'p1', reshiram, attack), false);
});
