// Homebrew set customhb: Ability texts the engine ran partly, wrongly or not at all (cards
// 300–690 and texts reworded since customhb-abilities1–3). Each test names the card by its HB
// number and reads the Ability text from client/src/assets/custom-sets/customhb/set.json, so the
// text under test is the card's own, verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand } from '../reduce.mjs';
import { inPlayView } from '../reduce/shared.mjs';
import { computeEffectiveRetreatCost } from '../reduce/retreat.mjs';

const SET = JSON.parse(
  fs.readFileSync(new URL('../../../client/src/assets/custom-sets/customhb/set.json', import.meta.url), 'utf8')
);
/** The set.json Ability of card HB `localId` named `name`, as an engine ability entry. */
function hb(localId, name) {
  const card = SET.cards.find((c) => c.localId === localId);
  const found = (card?.abilities || []).find((a) => a.name === name);
  assert.ok(found, `HB ${localId} has ${name}`);
  return { abilities: [{ type: 'Ability', name, text: found.effect }] };
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
const energy = (type, host = null, extra = {}) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    attachedTo: host?.instanceId ?? null,
    ...extra,
  });
const trainer = (name, subtype, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: [subtype], type: subtype, ...extra });

function game({ p1 = [], p2 = [], p1Bench = [], p2Bench = [], player = 'p1', turn = 5 } = {}) {
  const state = createGameState({ gameId: 'customhb-ab4', seed: 3, rulesEnabled: true });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`, 'Item'));
    for (let i = 0; i < 3; i++) state.players[id].zones.hand.push(trainer(`${id} hand ${i}`, 'Item'));
  }
  state.players.p1.zones.active.push(...p1);
  state.players.p2.zones.active.push(...p2);
  state.players.p1.zones.bench.push(...p1Bench);
  state.players.p2.zones.bench.push(...p2Bench);
  state.turn = { player, number: turn, phase: 'main' };
  return state;
}

const run = (state, type, playerId, payload, seed = 3) => applyCommand(state, { type, playerId, payload }, createRng(seed));
const attack = (state, { player = 'p1', index = 0, seed = 3 } = {}) => run(state, 'attack', player, { attackIndex: index }, seed);
const use = (state, holder, seed = 3) => run(state, 'useAbility', 'p1', { instanceId: holder.instanceId, abilityIndex: 0 }, seed);
function resolveAll(res, pick = (pc) => pc.options.slice(0, Math.max(pc.min ?? 1, 1)).map((o) => o.instanceId)) {
  let n = 0;
  while (res && !res.error && res.state.pendingChoice && n++ < 30) {
    const pc = res.state.pendingChoice;
    res = run(res.state, 'resolveChoice', pc.player, { choiceId: pc.choiceId, selection: pick(pc) }, 4);
  }
  return res;
}
const find = (state, name) => {
  for (const pid of ['p1', 'p2']) {
    for (const zone of ['active', 'bench', 'hand', 'discard', 'deck']) {
      const card = state.players[pid].zones[zone].find((c) => c.name === name && !c.attachedTo);
      if (card) return { card, zone, pid };
    }
  }
  return null;
};
const activeOf = (state, pid) => state.players[pid].zones.active.find((c) => !c.attachedTo);
const attachedTo = (state, pid, host) =>
  [...state.players[pid].zones.active, ...state.players[pid].zones.bench].filter((c) => c.attachedTo === host.instanceId);
const names = (cards) => cards.map((c) => c.name);
const hits = (damage) => ({ attacks: [{ name: 'Hit', cost: [], damage: String(damage), text: '' }] });

// ── Activated Abilities ───────────────────────────────────────────────────────────────────────

test('HB 463 Porygon-Z Buggy Turbo: heads attaches from the discard pile, tails discards an Energy', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 16; seed++) {
    const holder = mon('Porygon-Z', hb('463', 'Buggy Turbo'));
    const state = game({ p1: [holder, energy('Fairy', holder)], p2: [mon('Def')] });
    state.players.p1.zones.discard.push(energy('Fire'));
    const res = resolveAll(use(state, holder, seed));
    const face = res.events.find((e) => e.type === 'coinFlipped')?.face;
    const on = names(attachedTo(res.state, 'p1', holder)).sort();
    assert.deepEqual(on, face === 'heads' ? ['Basic Fairy Energy', 'Basic Fire Energy'] : [], face);
    seen.add(face);
  }
  assert.deepEqual([...seen].sort(), ['heads', 'tails']);
});

test('HB 120 Drakloak Recon Directive keeps 1 of the top 2 and puts the other on the bottom, unshuffled', () => {
  const holder = mon('Drakloak', hb('120', 'Recon Directive'));
  const state = game({ p1: [holder], p2: [mon('Def')] });
  const res = resolveAll(use(state, holder));
  const deck = names(res.state.players.p1.zones.deck);
  assert.ok(names(res.state.players.p1.zones.hand).includes('p1 deck 0'));
  assert.deepEqual(deck, ['p1 deck 2', 'p1 deck 3', 'p1 deck 4', 'p1 deck 5', 'p1 deck 6', 'p1 deck 7', 'p1 deck 8', 'p1 deck 9', 'p1 deck 1']);
});

test('HB 475 Miltank Milk Drink works only after a heal this turn, and heals each Pokémon 10', () => {
  const unhealed = mon('Miltank', { damage: 30, ...hb('475', 'Milk Drink') });
  assert.match(use(game({ p1: [unhealed], p2: [mon('Def')] }), unhealed).error, /healed/);
  const healed = mon('Miltank', { damage: 30, healedTurn: 5, ...hb('475', 'Milk Drink') });
  const bench = mon('Hurt', { damage: 40 });
  const res = resolveAll(use(game({ p1: [healed], p2: [mon('Def')], p1Bench: [bench] }), healed));
  assert.equal(find(res.state, 'Miltank').card.damage, 20);
  assert.equal(find(res.state, 'Hurt').card.damage, 30);
});

test('HB 256 Hydreigon Tri Howl attaches the Energy found in the top 3 and discards the rest', () => {
  const holder = mon('Hydreigon', hb('256', 'Tri Howl'));
  const state = game({ p1: [holder], p2: [mon('Def')] });
  state.players.p1.zones.deck.unshift(energy('Fire'), trainer('Top Item', 'Item'), energy('Water'));
  const res = resolveAll(use(state, holder), (pc) => (pc.max > 1 ? pc.options.map((o) => o.instanceId) : [pc.options[0].instanceId]));
  assert.deepEqual(names(attachedTo(res.state, 'p1', holder)).sort(), ['Basic Fire Energy', 'Basic Water Energy']);
  assert.deepEqual(names(res.state.players.p1.zones.discard), ['Top Item']);
  assert.equal(res.state.players.p1.zones.deck[0].name, 'p1 deck 0');
});

test('HB 639 Weavile Assaulting Hunt cannot be used from the Bench', () => {
  const holder = mon('Weavile', hb('639', 'Assaulting Hunt'));
  const state = game({ p1: [mon('Active')], p2: [mon('Def')], p1Bench: [holder], p2Bench: [mon('Opp')] });
  assert.match(use(state, holder).error, /moved to the Active Spot/);
});

test("HB 067 Salamence Intimidating Roar switches the opponent's Active, their pick, not its own", () => {
  const holder = mon('Salamence', hb('067', 'Intimidating Roar'));
  const state = game({ p1: [holder], p2: [mon('Def')], p1Bench: [mon('Mine')], p2Bench: [mon('Theirs'), mon('Other')] });
  const asked = use(state, holder);
  assert.equal(asked.state.pendingChoice.player, 'p2');
  const res = resolveAll(asked);
  assert.equal(activeOf(res.state, 'p1').name, 'Salamence');
  assert.equal(activeOf(res.state, 'p2').name, 'Theirs');
});

test('HB 037 Dragonite ex Dragon Transport switches only a {N} Active Pokémon', () => {
  const holder = mon('Dragonite ex', { types: ['Dragon'], ...hb('037', 'Dragon Transport') });
  const res = resolveAll(use(game({ p1: [holder], p2: [mon('Def')], p1Bench: [mon('Bench')] }), holder));
  assert.equal(activeOf(res.state, 'p1').name, 'Bench');
  const benched = mon('Dragonite ex', { types: ['Dragon'], ...hb('037', 'Dragon Transport') });
  const colorless = resolveAll(use(game({ p1: [mon('Plain')], p2: [mon('Def')], p1Bench: [benched] }), benched));
  assert.equal(activeOf(colorless.state, 'p1').name, 'Plain');
});

test('HB 411 Magearna Change Clothes / HB 644 Genesect ex Drive Change put a Tool into the hand', () => {
  for (const [id, name] of [['411', 'Change Clothes'], ['644', 'Drive Change']]) {
    const holder = mon('Holder', hb(id, name));
    const state = game({ p1: [holder, trainer('Held Tool', 'Pokémon Tool', { attachedTo: holder.instanceId })], p2: [mon('Def')] });
    const res = resolveAll(use(state, holder));
    assert.ok(names(res.state.players.p1.zones.hand).includes('Held Tool'), name);
    assert.equal(attachedTo(res.state, 'p1', holder).length, 0);
  }
});

test('HB 657 Lucario Precognitive Aura: the opponent reveals a Trainer card of their choice', () => {
  const holder = mon('Lucario', hb('657', 'Precognitive Aura'));
  const asked = use(game({ p1: [holder], p2: [mon('Def')] }), holder);
  assert.equal(asked.state.pendingChoice.player, 'p2');
  const res = resolveAll(asked);
  const reveal = res.events.find((e) => e.type === 'cardsRevealed');
  assert.equal(reveal.playerId, 'p2');
  assert.equal(reveal.cards.length, 1);
});

test('HB 519 Vikavolt Strong Charge attaches a {G} and a {L} Energy', () => {
  const holder = mon('Vikavolt', hb('519', 'Strong Charge'));
  const state = game({ p1: [holder], p2: [mon('Def')] });
  state.players.p1.zones.deck.push(energy('Grass'), energy('Lightning'));
  const res = resolveAll(use(state, holder));
  assert.deepEqual(names(attachedTo(res.state, 'p1', holder)).sort(), ['Basic Grass Energy', 'Basic Lightning Energy']);
});

test('HB 611 Jellicent Deep Sea Draw draws, then may put a hand card on the bottom of the deck', () => {
  const holder = mon('Jellicent', hb('611', 'Deep Sea Draw'));
  const asked = use(game({ p1: [holder], p2: [mon('Def')] }), holder);
  assert.equal(asked.state.pendingChoice.min, 0);
  const pick = asked.state.pendingChoice.options.find((o) => o.name === 'p1 hand 0').instanceId;
  const res = run(asked.state, 'resolveChoice', 'p1', { choiceId: asked.state.pendingChoice.choiceId, selection: [pick] });
  assert.equal(res.state.players.p1.zones.deck.at(-1).name, 'p1 hand 0');
  assert.equal(res.state.players.p1.zones.hand.length, 3);
});

test('HB 579 Deoxys Form Change swaps in a Deoxys from the hand with the attached cards and damage', () => {
  const holder = mon('Deoxys', { damage: 30, specialCondition: 'Confused', ...hb('579', 'Form Change') });
  const state = game({ p1: [holder, energy('Psychic', holder)], p2: [mon('Def')] });
  const incoming = mon('Deoxys', { hp: 120 });
  state.players.p1.zones.hand.push(incoming);
  const res = resolveAll(use(state, holder));
  const active = activeOf(res.state, 'p1');
  assert.equal(active.instanceId, incoming.instanceId);
  assert.equal(active.damage, 30);
  assert.equal(active.specialCondition, null, 'the Confusion went to the hand with the old Deoxys');
  assert.deepEqual(names(attachedTo(res.state, 'p1', active)), ['Basic Psychic Energy']);
  assert.ok(res.state.players.p1.zones.hand.some((c) => c.instanceId === holder.instanceId));
});

test('HB 182 Swirlix Festival Lead discards itself to free the Stadium use again', () => {
  const holder = mon('Swirlix', hb('182', 'Festival Lead'));
  const state = game({ p1: [mon('Active')], p2: [mon('Def')], p1Bench: [holder] });
  state.stadium = trainer('Pokémon Center', 'Stadium', {
    playerId: 'p1',
    text: "Once during each player's turn, that player may heal 20 damage from 1 of his or her Benched Pokémon.",
  });
  state.players.p1.flags.stadiumUsedThisTurn = true;
  const res = resolveAll(use(state, holder));
  assert.equal(res.state.players.p1.flags.stadiumUsedThisTurn, false);
  assert.ok(names(res.state.players.p1.zones.discard).includes('Swirlix'));
  const unused = mon('Swirlix', hb('182', 'Festival Lead'));
  const fresh = game({ p1: [mon('Active')], p2: [mon('Def')], p1Bench: [unused] });
  fresh.stadium = state.stadium;
  assert.equal(find(resolveAll(use(fresh, unused)).state, 'Swirlix').zone, 'bench', 'nothing to repeat yet');
});

test('HB 019 Thwackey Jungle Opener: the turn it evolved, a Basic {G} Energy from the top 3 to a Benched Pokémon', () => {
  const holder = mon('Thwackey', { stage: 'Stage 1', enteredPlayTurn: 5, ...hb('019', 'Jungle Opener') });
  const bench = mon('Bench');
  const state = game({ p1: [holder], p2: [mon('Def')], p1Bench: [bench] });
  state.players.p1.zones.deck.unshift(trainer('X', 'Item'), energy('Grass'), trainer('Y', 'Item'));
  const res = resolveAll(use(state, holder));
  assert.deepEqual(names(attachedTo(res.state, 'p1', bench)), ['Basic Grass Energy']);
  const old = mon('Thwackey', { stage: 'Stage 1', enteredPlayTurn: 3, ...hb('019', 'Jungle Opener') });
  assert.match(use(game({ p1: [old], p2: [mon('Def')], p1Bench: [mon('Bench')] }), old).error, /turn it evolved/);
});

// ── Damage ────────────────────────────────────────────────────────────────────────────────────

const damageDealt = (state, opts) => activeOf(resolveAll(attack(state, opts)).state, 'p2').damage;

test('HB 003 Beedrill Hivemind: +10 for each Beedrill in play, both sides', () => {
  const grass = mon('Grassy', { types: ['Grass'] });
  const state = game({
    p1: [grass],
    p2: [mon('Def')],
    p1Bench: [mon('Beedrill', { types: ['Grass'], ...hb('003', 'Hivemind') })],
    p2Bench: [mon('Beedrill')],
  });
  assert.equal(damageDealt(state), 80);
});

test('HB 506 Gyarados Moxie: +10 for each Prize card its player has taken', () => {
  const state = game({ p1: [mon('Gyarados', hb('506', 'Moxie'))], p2: [mon('Def')] });
  state.players.p1.zones.prizes.splice(0, 3);
  assert.equal(damageDealt(state), 90);
});

test('HB 100 Aegislash Stance Change: with a Tool it does 50 less and takes 50 less', () => {
  const holder = mon('Aegislash', hb('100', 'Stance Change'));
  const state = game({
    p1: [holder, trainer('Tool', 'Pokémon Tool', { attachedTo: holder.instanceId })],
    p2: [mon('Def', hits(120))],
  });
  const first = resolveAll(attack(state));
  assert.equal(activeOf(first.state, 'p2').damage, 10);
  assert.equal(find(resolveAll(attack(first.state, { player: 'p2' })).state, 'Aegislash').card.damage, 70);
});

test('HB 059 Dragapult Infiltrator ignores Resistance', () => {
  const state = game({ p1: [mon('Dragapult', hb('059', 'Infiltrator'))], p2: [mon('Def', { resistance: { type: 'Colorless', value: -30 } })] });
  assert.equal(damageDealt(state), 60);
});

test('HB 146 Aggron Iron Armor: no damage while on the Bench', () => {
  const snipe = mon('Sniper', { attacks: [{ name: 'Snipe', cost: [], damage: '', text: "This attack does 50 damage to 1 of your opponent's Benched Pokémon." }] });
  const state = game({ p1: [snipe], p2: [mon('Def')], p2Bench: [mon('Aggron', hb('146', 'Iron Armor'))] });
  assert.equal(find(resolveAll(attack(state)).state, 'Aggron').card.damage, 0);
});

test('HB 124 Volcarona Flame Body: heads Burns the Attacking Pokémon', () => {
  const faces = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const res = resolveAll(attack(game({ p1: [mon('Atk')], p2: [mon('Volcarona', hb('124', 'Flame Body'))] }), { seed }));
    const flip = res.events.find((e) => e.type === 'coinFlipped' && e.source === 'Volcarona');
    faces.add(flip?.face);
    const burned = res.events.some((e) => e.type === 'specialConditionUpdated' && e.condition === 'Burned');
    assert.equal(burned, flip?.face === 'heads');
  }
  assert.deepEqual([...faces].sort(), ['heads', 'tails']);
});

test('HB 015 Gloom Drowzy Drool: the attacking player flips, tails puts their Active to sleep', () => {
  const faces = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const res = resolveAll(attack(game({ p1: [mon('Atk')], p2: [mon('Gloom', hb('015', 'Drowzy Drool'))] }), { seed }));
    const flip = res.events.find((e) => e.type === 'coinFlipped' && e.source === 'Gloom');
    assert.equal(flip.playerId, 'p1');
    faces.add(flip.face);
    const asleep = res.events.some((e) => e.type === 'specialConditionUpdated' && e.condition === 'Asleep');
    assert.equal(asleep, flip.face === 'tails');
  }
  assert.equal(faces.size, 2);
});

// ── Knock Outs ────────────────────────────────────────────────────────────────────────────────

test('HB 181 Togepi Egg Shell: as the only Pokémon in play it survives with 10 HP', () => {
  const big = () => mon('Atk', hits(300));
  const alone = resolveAll(attack(game({ p1: [big()], p2: [mon('Togepi', { hp: 60, ...hb('181', 'Egg Shell') })] })));
  assert.deepEqual([find(alone.state, 'Togepi').zone, find(alone.state, 'Togepi').card.damage], ['active', 50]);
  const company = resolveAll(
    attack(game({ p1: [big()], p2: [mon('Togepi', { hp: 60, ...hb('181', 'Egg Shell') })], p2Bench: [mon('Friend')] }))
  );
  assert.equal(find(company.state, 'Togepi').zone, 'discard');
});

test('HB 617 Ribombee Survival of the Cutest: heads, it stays with 10 HP', () => {
  const outcomes = new Set();
  for (let seed = 1; seed <= 16; seed++) {
    const res = resolveAll(
      attack(game({ p1: [mon('Atk', hits(300))], p2: [mon('Ribombee', { hp: 100, ...hb('617', 'Survival of the Cutest') })], p2Bench: [mon('B')] }), { seed })
    );
    const r = find(res.state, 'Ribombee');
    outcomes.add(`${r.zone}/${r.card.damage}`);
  }
  assert.deepEqual([...outcomes].sort(), ['active/90', 'discard/0']);
});

test('HB 545 Ho-Oh Rebirth: the first Knock Out sends it and its cards to the hand; the Prize is still taken', () => {
  const hoOh = mon('Ho-Oh', { hp: 60, ...hb('545', 'Rebirth') });
  const res = resolveAll(attack(game({ p1: [mon('Atk')], p2: [hoOh, energy('Fire', hoOh)], p2Bench: [mon('B')] })));
  assert.equal(find(res.state, 'Ho-Oh').zone, 'hand');
  assert.ok(names(res.state.players.p2.zones.hand).includes('Basic Fire Energy'));
  assert.equal(res.state.players.p1.zones.prizes.length, 5);
  assert.equal(hoOh.rebirthUsed, undefined, 'the original state is untouched');
  assert.equal(find(res.state, 'Ho-Oh').card.rebirthUsed, true);
});

// ── Retreat, Special Conditions, Energy and costs ────────────────────────────────────────────

const retreatCost = (state, name) => {
  const { card, pid, zone } = find(state, name);
  return computeEffectiveRetreatCost(state, card, pid, { zoneId: zone });
};
const C3 = ['Colorless', 'Colorless', 'Colorless'];

test('HB 532 Yveltal Dark Aura: {C} less Retreat Cost for each {D} Energy attached', () => {
  const me = mon('Me', { retreatCost: C3 });
  const state = game({ p1: [me, energy('Darkness', me), energy('Darkness', me)], p2: [mon('Def')], p1Bench: [mon('Yveltal', hb('532', 'Dark Aura'))] });
  assert.equal(retreatCost(state, 'Me'), 1);
});

test('HB 602 Wimpod Punk Out / HB 680 Genesect Fast-Flight Configuration: free retreat against a Pokémon ex', () => {
  for (const [id, name] of [['602', 'Punk Out'], ['680', 'Fast-Flight Configuration']]) {
    const vsEx = game({ p1: [mon('Me', { retreatCost: C3, ...hb(id, name) })], p2: [mon('Big ex', { suffix: 'ex', subtypes: ['Basic', 'ex'] })] });
    assert.equal(retreatCost(vsEx, 'Me'), 0, name);
    const vsPlain = game({ p1: [mon('Me', { retreatCost: C3, ...hb(id, name) })], p2: [mon('Def')] });
    assert.equal(retreatCost(vsPlain, 'Me'), 3, name);
  }
});

test('HB 555 Giratina Dimension Breach: no Retreat Cost for any Pokémon in play', () => {
  const state = game({ p1: [mon('Me', { retreatCost: C3 })], p2: [mon('Them', { retreatCost: C3 })], p2Bench: [mon('Giratina', hb('555', 'Dimension Breach'))] });
  assert.equal(retreatCost(state, 'Me'), 0);
  assert.equal(retreatCost(state, 'Them'), 0);
});

const poisonAndConfuse = (extra = {}) => mon('Atk', { attacks: [{ name: 'Tox', cost: [], damage: '10', text: "Your opponent's Active Pokémon is now Poisoned and Confused." }], ...extra });

test('HB 533 Xerneas Fairy Aura: Pokémon with {Y} Energy attached shrug off Special Conditions', () => {
  const covered = mon('Covered');
  const res = resolveAll(attack(game({ p1: [poisonAndConfuse()], p2: [covered, energy('Fairy', covered)], p2Bench: [mon('Xerneas', hb('533', 'Fairy Aura'))] })));
  const d = activeOf(res.state, 'p2');
  assert.equal(Boolean(d.poisoned), false);
  assert.equal(d.specialCondition, null);
  const bare = resolveAll(attack(game({ p1: [poisonAndConfuse()], p2: [mon('Bare')], p2Bench: [mon('Xerneas', hb('533', 'Fairy Aura'))] })));
  assert.equal(activeOf(bare.state, 'p2').poisoned, true);
});

test("HB 131 Hatterene Magic Bounce sends the Special Condition to the opponent's Active instead", () => {
  const confuse = mon('Atk', { attacks: [{ name: 'Daze', cost: [], damage: '10', text: "Your opponent's Active Pokémon is now Confused." }] });
  const res = resolveAll(attack(game({ p1: [confuse], p2: [mon('Hatterene', hb('131', 'Magic Bounce'))] })));
  assert.equal(activeOf(res.state, 'p2').specialCondition, null);
  assert.equal(activeOf(res.state, 'p1').specialCondition, 'Confused');
});

test('HB 534 Zygarde Aura Break: {Y} Energy pays a {D} cost', () => {
  const a = mon('Atk', { attacks: [{ name: 'Dark', cost: ['Darkness'], damage: '70', text: '' }] });
  const state = game({ p1: [a, energy('Fairy', a)], p2: [mon('Def')], p1Bench: [mon('Zygarde', hb('534', 'Aura Break'))] });
  assert.equal(damageDealt(state), 70);
  const without = mon('Atk', { attacks: [{ name: 'Dark', cost: ['Darkness'], damage: '70', text: '' }] });
  assert.ok(attack(game({ p1: [without, energy('Fairy', without)], p2: [mon('Def')] })).error);
});

test("HB 543 Lugia ex Pressure: while Active, the opponent's attacks cost {C} more", () => {
  const a = mon('Atk', { attacks: [{ name: 'Hit', cost: ['Colorless'], damage: '60', text: '' }] });
  assert.ok(attack(game({ p1: [a, energy('Fire', a)], p2: [mon('Lugia ex', hb('543', 'Pressure'))] })).error);
  const b = mon('Atk', { attacks: [{ name: 'Hit', cost: ['Colorless'], damage: '60', text: '' }] });
  assert.equal(attack(game({ p1: [b, energy('Fire', b)], p2: [mon('Def')], p2Bench: [mon('Lugia ex', hb('543', 'Pressure'))] })).error, null);
});

test('HB 597 Mega Golurk ex Restricted Activation: attacks need 10 cards in hand', () => {
  const golurk = () => mon('Mega Golurk ex', hb('597', 'Restricted Activation'));
  assert.match(attack(game({ p1: [golurk()], p2: [mon('Def')] })).error, /10 or more cards/);
  const full = game({ p1: [golurk()], p2: [mon('Def')] });
  for (let i = 0; i < 7; i++) full.players.p1.zones.hand.push(trainer(`extra ${i}`, 'Item'));
  assert.equal(attack(full).error, null);
});

test('HB 578 Arceus ex Multitype: its type is the most recently attached Energy\'s', () => {
  const arceus = mon('Arceus ex', hb('578', 'Multitype'));
  const state = game({ p1: [arceus], p2: [mon('Def')] });
  assert.deepEqual(inPlayView(state, arceus).types, ['Colorless']);
  state.players.p1.zones.active.push(energy('Fire', arceus));
  assert.deepEqual(inPlayView(state, arceus).types, ['Fire']);
  state.players.p1.zones.active.push(energy('Water', arceus));
  assert.deepEqual(inPlayView(state, arceus).types, ['Water']);
});

test("HB 440 Mega Charizard X ex Dragon's Ambition draws 1 at the start of the turn after it discarded Energy", () => {
  const charizard = mon('Mega Charizard X ex', {
    attacks: [{ name: 'Burn', cost: [], damage: '50', text: 'Discard an Energy from this Pokémon.' }],
    ...hb('440', "Dragon's Ambition"),
  });
  const fresh = energy('Fire');
  const state = game({ p1: [charizard, energy('Fire', charizard)], p2: [mon('Def')] });
  state.players.p1.zones.hand.push(fresh);
  let res = run(state, 'attachCard', 'p1', { instanceId: fresh.instanceId, targetInstanceId: charizard.instanceId });
  const before = res.state.players.p1.zones.hand.length;
  res = resolveAll(attack(res.state));
  res = run(res.state, 'pass', 'p2', {});
  assert.equal(res.state.players.p1.zones.hand.length, before + 2, 'the turn draw and 1 more');
  res = run(run(res.state, 'pass', 'p1', {}).state, 'pass', 'p2', {});
  assert.equal(res.state.players.p1.zones.hand.length, before + 3, 'no Energy discarded since: no extra draw');
});

test('HB 592 Ribombee Fairy Dust: a Supporter cannot gust a Fairy Pokémon while Ribombee is Benched', () => {
  const boss = trainer("Boss's Orders", 'Supporter', { text: "Switch in 1 of your opponent's Benched Pokémon to the Active Spot." });
  const state = game({
    p1: [mon('Atk')],
    p2: [mon('Def')],
    p2Bench: [mon('Ribombee', { types: ['Fairy'], ...hb('592', 'Fairy Dust') }), mon('Pixie', { types: ['Fairy'] }), mon('Plain')],
  });
  state.players.p1.zones.hand.push(boss);
  const res = resolveAll(run(state, 'playTrainer', 'p1', { instanceId: boss.instanceId }));
  assert.equal(activeOf(res.state, 'p2').name, 'Plain');
});
