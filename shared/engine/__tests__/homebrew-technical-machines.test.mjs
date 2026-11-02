// Homebrew Technical Machines (customhb-521…526, R2 bucket set.json, fetched 2026-11-03). They print
// no "discard at the end of your turn" clause, so each must stay attached through turn ends and
// through its own attack. Card text and attacks are copied from the bucket rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { hasCondition } from '../rules/special-conditions.mjs';

const TM_TEXT =
  'The Pokémon this card is attached to can use the attack on this card. (You still need the necessary Energy to use this attack.)';

const TMS = {
  closeCombat: {
    id: 'customhb-522',
    name: 'Technical Machine: Close Combat',
    attacks: [
      {
        cost: ['Fighting', 'Fighting', 'Colorless'],
        name: 'Close Combat',
        effect: "This Pokémon takes 50 more damage from your opponent's Active Pokémon during your opponent's next turn.",
        damage: 150,
      },
    ],
  },
  confuse: {
    id: 'customhb-524',
    name: 'Technical Machine: Confuse',
    attacks: [{ cost: ['Colorless'], name: 'Confuse', effect: "Your opponent's Active Pokémon is now Confused.", damage: '' }],
  },
  draw: {
    id: 'customhb-526',
    name: 'Technical Machine: Draw',
    attacks: [{ cost: ['Colorless'], name: 'Draw', effect: 'Draw 2 cards.', damage: '' }],
  },
  fluorite: {
    id: 'customhb-521',
    name: 'Technical Machine: Fluorite',
    attacks: [
      {
        cost: ['Water', 'Psychic', 'Metal'],
        name: 'Fluorite',
        effect:
          'Discard all Energy from this Pokémon, and search your deck for an ACE SPEC card. If you do not find one, discard this card from your Active Pokémon and instead search your deck for a Supporter card and an Energy card.',
        damage: '',
      },
    ],
  },
  growth: {
    id: 'customhb-525',
    name: 'Technical Machine: Growth',
    attacks: [
      {
        cost: ['Colorless'],
        name: 'Growth',
        effect: 'Search your deck for up to 2 Basic Energy cards and attach them to your Benched Pokémon in any way you like. Then, shuffle your deck.',
        damage: '',
      },
    ],
  },
  spite: {
    id: 'customhb-523',
    name: 'Technical Machine: Spite',
    attacks: [
      {
        cost: ['Darkness'],
        name: 'Spite',
        effect: "If your opponent's Active Pokémon has a Special Condition, you may discard an Energy card attached to that Pokémon.",
        damage: '',
      },
    ],
  },
};

let nextId = 1000;
const mon = (name, type, extra = {}) =>
  createCard({ instanceId: nextId++, name, type: 'Pokémon', stage: 'Basic', types: [type], hp: 300, ...extra });
const energy = (type, extra = {}) => createCard({ instanceId: nextId++, name: `${type} Energy`, type: 'Energy', supertype: 'Energy', ...extra });
const tm = (key) =>
  createCard({
    instanceId: nextId++,
    ...TMS[key],
    type: 'Trainer',
    supertype: 'Trainer',
    trainerType: 'Tool',
    text: TM_TEXT,
    effect: TM_TEXT,
  });
const attach = (host, ...cards) => cards.map((c) => Object.assign(c, { attachedTo: host.instanceId }));
const filler = (id) => createCard({ instanceId: nextId++, name: `${id} deck`, type: 'Trainer', trainerType: 'Item', text: 'Draw a card.' });

function board({ p1 = {}, p2 = {} } = {}) {
  const state = createGameState({ gameId: 'homebrew-tms', seed: 7, rulesEnabled: true });
  for (const [id, z] of [['p1', p1], ['p2', p2]]) {
    const zones = createPlayerZones();
    for (const [k, v] of Object.entries(z)) zones[k].push(...v);
    if (!zones.active.length) zones.active.push(mon(`${id} Active`, 'Colorless'));
    while (zones.prizes.length < 6) zones.prizes.push(mon(`${id} prize`, 'Colorless'));
    while (zones.deck.length < 10) zones.deck.push(filler(id));
    state.players[id] = { playerId: id, username: id, zones, flags: { abilitiesUsed: {}, supporterPlayed: false } };
  }
  state.turn = { player: 'p1', number: 3, phase: 'main' };
  return state;
}

const run = (state, command, seed = 1) => applyCommand(state, command, createRng(seed));
const passTurn = (state, playerId) => run(state, { type: 'pass', payload: {}, playerId });
const inZone = (state, playerId, zoneId, card) => state.players[playerId].zones[zoneId].some((c) => c.instanceId === card.instanceId);
const attackBy = (res, attackIndex) => run(res.state, { type: 'attack', payload: { attackIndex }, playerId: 'p1' });
const choose = (res, selection) =>
  run(res.state, { type: 'resolveChoice', payload: { choiceId: res.pendingChoice.choiceId, selection }, playerId: res.pendingChoice.player });

// A holder with one printed attack (index 0); the TM's attack is index 1.
function holderWithTm(key, { energyTypes = [], p1 = {}, p2 = {} } = {}) {
  const holder = mon('Holder', 'Colorless', { attacks: [{ name: 'Tackle', cost: [], damage: '10', text: '' }] });
  const card = tm(key);
  const state = board({ p1: { active: [holder], hand: [card], ...p1 }, p2 });
  for (const type of energyTypes) state.players.p1.zones.active.push(...attach(holder, energy(type)));
  const res = run(state, {
    type: 'attachCard',
    payload: { instanceId: card.instanceId, targetInstanceId: holder.instanceId },
    playerId: 'p1',
  });
  assert.equal(res.error, null, `${key}: attach`);
  return { res, holder, card };
}

test('every homebrew TM attaches and shows its attack on the holder', () => {
  for (const key of Object.keys(TMS)) {
    const { res, card } = holderWithTm(key);
    assert.ok(inZone(res.state, 'p1', 'active', card), `${key}: attached to the Active`);
    assert.equal(res.state.players.p1.zones.active.find((c) => c.instanceId === card.instanceId).attachedTo != null, true);
  }
});

test('a TM with its cost unpaid cannot attack; the failed attempt keeps it attached', () => {
  const { res, card } = holderWithTm('closeCombat');
  const tried = attackBy(res, 1);
  assert.ok(tried.error, 'not enough Energy');
  assert.ok(inZone(tried.state ?? res.state, 'p1', 'active', card));
});

test('TMs survive their owner\'s turn end and the opponent\'s turn', () => {
  for (const key of Object.keys(TMS)) {
    const { res, card } = holderWithTm(key);
    let after = passTurn(res.state, 'p1');
    assert.equal(after.error, null, `${key}: pass`);
    assert.ok(inZone(after.state, 'p1', 'active', card), `${key}: kept after own turn end`);
    after = passTurn(after.state, 'p2');
    assert.equal(after.error, null, `${key}: opponent pass`);
    assert.ok(inZone(after.state, 'p1', 'active', card), `${key}: kept after opponent turn`);
  }
});

test('Close Combat deals 150 and the TM stays attached afterwards', () => {
  const { res, card } = holderWithTm('closeCombat', { energyTypes: ['Fighting', 'Fighting', 'Fighting'], p2: { active: [mon('Target', 'Colorless', { hp: 400 })] } });
  const hit = attackBy(res, 1);
  assert.equal(hit.error, null);
  assert.equal(hit.state.players.p2.zones.active.find((c) => !c.attachedTo).damage, 150);
  assert.equal(hit.state.turn.player, 'p2', 'the attack ended the turn');
  assert.ok(inZone(hit.state, 'p1', 'active', card), 'kept after attacking and the turn-end sweep');
});

test('Confuse confuses the Defending Pokémon; the TM stays', () => {
  const { res, card } = holderWithTm('confuse', { energyTypes: ['Colorless'] });
  const hit = attackBy(res, 1);
  assert.equal(hit.error, null);
  assert.equal(hasCondition(hit.state.players.p2.zones.active.find((c) => !c.attachedTo), 'Confused'), true);
  assert.ok(inZone(hit.state, 'p1', 'active', card));
});

test('Draw draws 2 cards; the TM stays', () => {
  const { res, card } = holderWithTm('draw', { energyTypes: ['Colorless'] });
  const handBefore = res.state.players.p1.zones.hand.length;
  const hit = attackBy(res, 1);
  assert.equal(hit.error, null);
  assert.equal(hit.state.players.p1.zones.hand.length, handBefore + 2);
  assert.ok(inZone(hit.state, 'p1', 'active', card));
});

test('Growth attaches up to 2 Basic Energy to the Bench; the TM stays', () => {
  const benched = mon('Benched', 'Colorless');
  const { res, card } = holderWithTm('growth', {
    energyTypes: ['Colorless'],
    p1: { bench: [benched], deck: [energy('Grass'), energy('Fire'), energy('Water')] },
  });
  let hit = attackBy(res, 1);
  assert.equal(hit.error, null);
  for (let guard = 0; hit.pendingChoice && guard < 8; guard++) {
    const options = hit.pendingChoice.options ?? [];
    const pick = options.slice(0, hit.pendingChoice.max ?? 1).map((o) => o.instanceId);
    hit = choose(hit, hit.pendingChoice.max > 1 ? pick : pick.slice(0, 1));
    assert.equal(hit.error, null);
  }
  const attached = hit.state.players.p1.zones.bench.filter((c) => c.attachedTo === benched.instanceId && /Energy/.test(c.name));
  assert.ok(attached.length >= 1 && attached.length <= 2, `attached ${attached.length}`);
  assert.ok(inZone(hit.state, 'p1', 'active', card));
});

test('Spite discards an Energy from a Special-Conditioned Defending Pokémon; the TM stays', () => {
  const target = mon('Target', 'Colorless', { specialCondition: 'Burned' });
  const { res, card } = holderWithTm('spite', {
    energyTypes: ['Darkness'],
    p2: { active: [target, ...attach(target, energy('Fire'))] },
  });
  let hit = attackBy(res, 1);
  assert.equal(hit.error, null);
  for (let guard = 0; hit.pendingChoice && guard < 6; guard++) {
    const options = hit.pendingChoice.options ?? [];
    hit = choose(hit, options.length ? [options[0].instanceId] : []);
    assert.equal(hit.error, null);
  }
  assert.equal(hit.state.players.p2.zones.active.filter((c) => c.attachedTo === target.instanceId).length, 0, 'Energy discarded');
  assert.ok(inZone(hit.state, 'p1', 'active', card));
});

test('Fluorite with an ACE SPEC in the deck: Energy discarded, TM stays', () => {
  const ace = createCard({ instanceId: nextId++, name: 'Ace Thing', type: 'Trainer', trainerType: 'Item', subtypes: ['ACE SPEC'], text: 'x' });
  const { res, card, holder } = holderWithTm('fluorite', { energyTypes: ['Water', 'Psychic', 'Metal'], p1: { deck: [ace] } });
  let hit = attackBy(res, 1);
  assert.equal(hit.error, null);
  for (let guard = 0; hit.pendingChoice && guard < 6; guard++) {
    const options = hit.pendingChoice.options ?? [];
    hit = choose(hit, options.length ? [options[0].instanceId] : []);
    assert.equal(hit.error, null);
  }
  const energies = hit.state.players.p1.zones.active.filter((c) => c.attachedTo === holder.instanceId && /Energy/.test(c.name));
  assert.equal(energies.length, 0, 'all Energy discarded');
  assert.ok(inZone(hit.state, 'p1', 'active', card), 'TM stays when an ACE SPEC was found');
  assert.ok(hit.state.players.p1.zones.hand.some((c) => c.instanceId === ace.instanceId), 'ACE SPEC to hand');
});

test('Fluorite with no ACE SPEC discards the TM and fetches a Supporter and an Energy', () => {
  const supporter = createCard({ instanceId: nextId++, name: 'Sup', type: 'Trainer', trainerType: 'Supporter', text: 'x' });
  const basic = energy('Grass');
  const { res, card } = holderWithTm('fluorite', { energyTypes: ['Water', 'Psychic', 'Metal'], p1: { deck: [supporter, basic] } });
  let hit = attackBy(res, 1);
  assert.equal(hit.error, null);
  for (let guard = 0; hit.pendingChoice && guard < 8; guard++) {
    const options = hit.pendingChoice.options ?? [];
    hit = choose(hit, options.length ? [options[0].instanceId] : []);
    assert.equal(hit.error, null);
  }
  assert.ok(!inZone(hit.state, 'p1', 'active', card), 'TM left the Active');
  assert.ok(hit.state.players.p1.zones.discard.some((c) => c.instanceId === card.instanceId), 'TM in discard');
  const hand = hit.state.players.p1.zones.hand.map((c) => c.instanceId);
  assert.ok(hand.includes(supporter.instanceId) && hand.includes(basic.instanceId), 'Supporter and Energy in hand');
});

test('Spite does nothing and asks nothing while the Defending Pokémon has no Special Condition', () => {
  const target = mon('Target', 'Colorless');
  const { res, card } = holderWithTm('spite', { energyTypes: ['Darkness'], p2: { active: [target, ...attach(target, energy('Fire'))] } });
  const hit = attackBy(res, 1);
  assert.equal(hit.error, null);
  assert.equal(hit.pendingChoice ?? null, null, 'no prompt');
  assert.equal(hit.state.players.p2.zones.active.filter((c) => c.attachedTo === target.instanceId).length, 1, 'Energy kept');
  assert.ok(inZone(hit.state, 'p1', 'active', card));
});

test('Close Combat: the holder takes 50 more damage from the next attack of the opposing Active Pokémon', () => {
  const striker = mon('Striker', 'Colorless', { attacks: [{ name: 'Hit', cost: [], damage: '10', text: '' }] });
  const { res, holder } = holderWithTm('closeCombat', {
    energyTypes: ['Fighting', 'Fighting', 'Fighting'],
    p2: { active: [striker] },
  });
  const swing = attackBy(res, 1);
  assert.equal(swing.error, null);
  let after = run(swing.state, { type: 'attack', payload: { attackIndex: 0 }, playerId: 'p2' });
  assert.equal(after.error, null);
  assert.equal(after.state.players.p1.zones.active.find((c) => c.instanceId === holder.instanceId).damage, 60);
});
