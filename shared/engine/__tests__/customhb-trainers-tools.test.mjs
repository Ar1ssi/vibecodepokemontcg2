// Homebrew set customhb: Trainer, Tool, Stadium and Special Energy texts the engine ran partly,
// wrongly or not at all. Each test names the card by its HB number and reads the card's text
// from client/src/assets/custom-sets/customhb/set.json, so the text under test is the card's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { cardEffectiveHp } from '../reduce/shared.mjs';
import { attackViewFor } from '../reduce/attack.mjs';
import { computeEffectiveRetreatCost } from '../reduce/retreat.mjs';

const SET = JSON.parse(
  fs.readFileSync(new URL('../../../client/src/assets/custom-sets/customhb/set.json', import.meta.url), 'utf8')
);
function hbCard(localId) {
  const card = SET.cards.find((c) => c.localId === localId);
  assert.ok(card, `HB ${localId} exists`);
  return card;
}

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({
    instanceId: nextId++,
    name,
    supertype: 'Pokémon',
    stage: 'Basic',
    hp: 200,
    types: ['Colorless'],
    attacks: [{ name: 'Hit', cost: [], damage: '60', text: '' }],
    ...extra,
  });
const energy = (type, host = null) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    attachedTo: host?.instanceId ?? null,
  });
const trainer = (name, subtype, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: [subtype], type: subtype, ...extra });
/** HB `localId` as a Trainer card (Tool attached to `host` when given). */
const hbTrainer = (localId, host = null, extra = {}) => {
  const c = hbCard(localId);
  return trainer(c.name, c.trainerType === 'Tool' ? 'Pokémon Tool' : c.trainerType, {
    text: c.effect,
    attachedTo: host?.instanceId ?? null,
    attacks: (c.attacks || []).map((a) => ({ name: a.name, cost: a.cost, damage: String(a.damage ?? ''), text: a.effect })),
    ...extra,
  });
};
/** HB `localId` as a Special Energy card attached to `host`. */
const hbEnergy = (localId, host) => {
  const c = hbCard(localId);
  return createCard({
    instanceId: nextId++,
    name: c.name,
    supertype: 'Energy',
    type: 'Energy',
    subtypes: ['Special'],
    text: c.effect,
    attachedTo: host?.instanceId ?? null,
  });
};

function game({ p1 = [], p2 = [], p1Bench = [], p2Bench = [], stadium = null } = {}) {
  const state = createGameState({ gameId: 'customhb-tt', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`, 'Item'));
  }
  state.players.p1.zones.active.push(...p1);
  state.players.p2.zones.active.push(...p2);
  state.players.p1.zones.bench.push(...p1Bench);
  state.players.p2.zones.bench.push(...p2Bench);
  if (stadium) state.stadium = hbTrainer(stadium, null, { playerId: 'p1' });
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  return state;
}
const attack = (state, attackIndex = 0) =>
  applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex } }, createRng(3));
const activeDamage = (result, pid = 'p2') => result.state.players[pid].zones.active.find((c) => !c.attachedTo).damage || 0;
const exMon = (name) => mon(name, { subtypes: ['Basic', 'ex'], suffix: 'ex' });

test('HB 327 Great Potion: "Heal 50 damage from your Active Pokémon ex." heals only an ex', () => {
  for (const [active, want] of [[exMon('Big ex'), 30], [mon('Small'), 80]]) {
    active.damage = 80;
    const potion = hbTrainer('327');
    const state = game({ p1: [active], p2: [mon('Def')] });
    state.players.p1.zones.hand.push(potion);
    const result = applyCommand(state, { type: 'playTrainer', playerId: 'p1', payload: { instanceId: potion.instanceId } }, createRng(3));
    const after = result.error ? state : result.state;
    assert.equal(after.players.p1.zones.active[0].damage, want, active.name);
  }
});

test('HB 531/673/675/674: a Tool naming its holder grants its attack only to that Pokémon', () => {
  for (const [localId, right, wrong] of [
    ['531', 'Mega Zygarde ex', 'Zygarde'],
    ['673', 'Zygarde', 'Mega Zygarde ex'],
    ['675', 'Genesect ex', 'Genesect'],
    ['674', 'Genesect', 'Genesect ex'],
  ]) {
    const holder = mon(right);
    const other = mon(wrong);
    const s1 = game({ p1: [holder, hbTrainer(localId, holder)], p2: [mon('Def')] });
    const s2 = game({ p1: [other, hbTrainer(localId, other)], p2: [mon('Def')] });
    assert.equal(attackViewFor(s1, holder).attacks.length, 2, `${localId} on ${right}`);
    assert.equal(attackViewFor(s2, other).attacks.length, 1, `${localId} on ${wrong}`);
  }
});

test('HB 677 Crystal Edge: "If this card is attached to White Kyurem, … do 50 more damage" only for White Kyurem', () => {
  const white = mon('White Kyurem');
  const other = mon('Reshiram');
  assert.equal(activeDamage(attack(game({ p1: [white, hbTrainer('677', white)], p2: [mon('Def')] }))), 110);
  assert.equal(activeDamage(attack(game({ p1: [other, hbTrainer('677', other)], p2: [mon('Def')] }))), 60);
});

test('HB 676 Crystal Wall: "If this card is attached to Black Kyurem, its maximum HP is 200."', () => {
  const black = mon('Black Kyurem', { hp: 130 });
  const white = mon('White Kyurem', { hp: 130 });
  assert.equal(cardEffectiveHp(game({ p1: [black, hbTrainer('676', black)], p2: [mon('Def')] }), black, 'p1'), 200);
  assert.equal(cardEffectiveHp(game({ p1: [white, hbTrainer('676', white)], p2: [mon('Def')] }), white, 'p1'), 130);
});

test('HB 491 Mega Signal: a Basic Energy of 1 of the Mega ex\'s types provides both of its types', () => {
  for (const withSignal of [true, false]) {
    const mega = mon('Mega Charizard X ex', {
      types: ['Fire', 'Dragon'],
      attacks: [{ name: 'Blast', cost: ['Fire', 'Dragon'], damage: '60', text: '' }],
    });
    const cards = [mega, energy('Fire', mega), energy('Fire', mega)];
    if (withSignal) cards.push(hbTrainer('491', mega));
    const result = attack(game({ p1: cards, p2: [mon('Def')] }));
    assert.equal(!result.error, withSignal, `Mega Signal attached: ${withSignal}`);
  }
});

test('HB 574 Sky Pillar: {N} Pokémon take 20 less damage only from Pokémon with {W}, {F} or {P} Energy', () => {
  const water = mon('Waterish');
  const fire = mon('Fireish');
  const hit = (attacker, type) =>
    activeDamage(attack(game({ p1: [attacker, energy(type, attacker)], p2: [mon('Dragonish', { types: ['Dragon'] })], stadium: '574' })));
  assert.equal(hit(water, 'Water'), 40);
  assert.equal(hit(fire, 'Fire'), 60);
});

test('HB 576 Altar of the Sunne: a {R} Pokémon has no Weakness', () => {
  const defender = mon('Firey', { types: ['Fire'], weakness: { type: 'Water', value: 2 } });
  const result = attack(game({ p1: [mon('Wet', { types: ['Water'] })], p2: [defender], stadium: '576' }));
  assert.equal(activeDamage(result), 60);
});

test('HB 575 Altar of the Moone: a Pokémon with {P} Energy attached retreats for {C}{C} less', () => {
  const withPsychic = mon('X', { retreatCost: ['Colorless', 'Colorless', 'Colorless'] });
  const withFire = mon('Y', { retreatCost: ['Colorless', 'Colorless', 'Colorless'] });
  const s1 = game({ p1: [withPsychic, energy('Psychic', withPsychic)], p2: [mon('Def')], stadium: '575' });
  const s2 = game({ p1: [withFire, energy('Fire', withFire)], p2: [mon('Def')], stadium: '575' });
  assert.equal(computeEffectiveRetreatCost(s1, withPsychic, 'p1'), 1);
  assert.equal(computeEffectiveRetreatCost(s2, withFire, 'p1'), 3);
});

test('HB 420 Wonder Energy: "it provides {Y} Energy" on any Pokémon', () => {
  const holder = mon('Plain', { attacks: [{ name: 'Hit', cost: ['Fairy'], damage: '60', text: '' }] });
  assert.equal(attack(game({ p1: [holder, hbEnergy('420', holder)], p2: [mon('Def')] })).error ?? null, null);
});

test('HB 625 Guard Energy: a no-Rule-Box holder takes 30 less from Pokémon ex, once at a time', () => {
  const hit = (attacker, defender, copies = 1) => {
    const attached = Array.from({ length: copies }, () => hbEnergy('625', defender));
    return activeDamage(attack(game({ p1: [attacker], p2: [defender, ...attached] })));
  };
  assert.equal(hit(exMon('Big ex'), mon('Plain')), 30);
  assert.equal(hit(mon('Small'), mon('Plain')), 60);
  assert.equal(hit(exMon('Big ex'), exMon('Other ex')), 60);
  assert.equal(hit(exMon('Big ex'), mon('Plain'), 2), 30);
});
