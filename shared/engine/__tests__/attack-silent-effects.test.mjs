// Attack text that used to deal its printed damage and nothing else (parse-hole sweep D2).
// Every text is a corpus row (out/pkmn-pokemon-cards.json / out/pkmn-gx-cards.json), cited
// by set and number in each test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand, validateLegality } from '../reduce.mjs';
import { parseAttackDamage } from '../rules/damage-parser.mjs';
import { parseAttackSteps } from '../rules/attack-steps.mjs';

let nextId = 1;
const mon = (name, extra = {}) =>
  createCard({ instanceId: nextId++, name, supertype: 'Pokémon', stage: 'Basic', hp: 300, ...extra });
const trainer = (name, subtype) =>
  createCard({ instanceId: nextId++, name, supertype: 'Trainer', subtypes: [subtype], type: subtype });
const energy = (type, attachedTo = null) =>
  createCard({
    instanceId: nextId++,
    name: `Basic ${type} Energy`,
    supertype: 'Energy',
    subtypes: ['Basic'],
    energyType: type,
    attachedTo,
  });

/** p1 attacks with `name` using `text`; `setup(state)` adds anything else to the board. */
function board(name, text, { damage = '30', setup = () => {}, rulesEnabled = true } = {}) {
  nextId = 1;
  const state = createGameState({ gameId: 'silent-effects', seed: 3, rulesEnabled });
  for (const id of ['p1', 'p2']) {
    state.players[id] = { playerId: id, username: id, zones: createPlayerZones(), flags: {} };
    for (let i = 0; i < 6; i++) state.players[id].zones.prizes.push(mon(`${id} prize ${i}`));
    for (let i = 0; i < 10; i++) state.players[id].zones.deck.push(trainer(`${id} deck ${i}`, 'Item'));
  }
  state.turn = { player: 'p1', number: 5, phase: 'main' };
  const attacker = mon(name, { attacks: [{ name: 'Probe', cost: [], damage, text }] });
  state.players.p1.zones.active.push(attacker);
  const defender = mon('Defender', { hp: 400 });
  state.players.p2.zones.active.push(defender);
  setup(state);
  return { state, attacker, defender };
}

const attack = (state) =>
  applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(3));
const root = (state, playerId, instanceId) =>
  [...state.players[playerId].zones.active, ...state.players[playerId].zones.bench].find(
    (c) => c.instanceId === instanceId
  );

// ── play locks ────────────────────────────────────────────────────────────────

test('play-lock wordings of every era parse to the kinds they name', () => {
  const lockOf = (text) => parseAttackSteps(text).after.find((s) => s.type === 'atkOppPlayLock')?.kinds;
  // Banette ex Everlasting Darkness (Scarlet & Violet 229); Budew Itchy Pollen shares it.
  assert.deepEqual(lockOf("During your opponent's next turn, they can't play any Item cards from their hand."), ['item']);
  // Noivern ex Dominating Echo (Paldean Fates 220).
  assert.deepEqual(
    lockOf("During your opponent's next turn, they can't play any Special Energy or Stadium cards from their hand."),
    ['specialEnergy', 'stadium']
  );
  // Giratina-EX Chaos Wheel (Ancient Origins 93).
  assert.deepEqual(
    lockOf(
      "Your opponent can't play any Pokémon Tool, Special Energy, or Stadium cards from his or her hand during his or her next turn."
    ),
    ['tool', 'specialEnergy', 'stadium']
  );
  // Sableye Limitation (Deoxys 23) prints "his or hand".
  assert.deepEqual(
    lockOf("Your opponent can't play any Supporter Cards from his or hand during your opponent's next turn."),
    ['supporter']
  );
  // Azelf Bind Pulse (Mysterious Treasures 4).
  assert.deepEqual(
    lockOf(
      "During your opponent's next turn, your opponent can't attach any Special Energy cards from his or her hand to any of his or her Pokémon."
    ),
    ['specialEnergy']
  );
  // Banette Evolution Jammer (Roaring Skies 32).
  assert.deepEqual(
    lockOf(
      "Your opponent can't play any Pokémon from his or her hand to evolve his or her Pokémon during his or her next turn."
    ),
    ['evolve']
  );
});

test('Banette ex Everlasting Darkness (Scarlet & Violet 229): Items locked on the next turn only', () => {
  const text = "During your opponent's next turn, they can't play any Item cards from their hand.";
  const { state } = board('Banette ex', text);
  const potion = trainer('Potion', 'Item');
  const boss = trainer("Boss's Orders", 'Supporter');
  state.players.p2.zones.hand.push(potion, boss);
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(res.state.turn.player, 'p2');
  const play = (card) =>
    validateLegality(res.state, { type: 'playTrainer', playerId: 'p2', payload: { instanceId: card.instanceId } });
  assert.equal(play(potion).allowed, false);
  assert.equal(play(boss).allowed, true);
  res.state.turn.number = 8;
  assert.equal(play(potion).allowed, true);
});

test('Whimsicott VSTAR Trick Wind (Brilliant Stars 175): Pokémon Tools cannot be attached', () => {
  const text =
    "During your opponent's next turn, they can't play any Pokémon Tool or Special Energy cards from their hand.";
  const { state, defender } = board('Whimsicott VSTAR', text);
  const tool = trainer('Choice Belt', 'Pokémon Tool');
  state.players.p2.zones.hand.push(tool);
  const res = attack(state);
  const check = validateLegality(res.state, {
    type: 'attachCard',
    playerId: 'p2',
    payload: { instanceId: tool.instanceId, targetInstanceId: defender.instanceId },
  });
  assert.equal(check.allowed, false);
});

test('Banette Evolution Jammer (Roaring Skies 32): evolving from hand is locked', () => {
  const text =
    "Your opponent can't play any Pokémon from his or her hand to evolve his or her Pokémon during his or her next turn.";
  const { state, defender } = board('Banette', text);
  const evolution = mon('Evolved Defender', { stage: 'Stage 1', subtypes: ['Stage 1'], evolvesFrom: 'Defender' });
  const potion = trainer('Potion', 'Item');
  state.players.p2.zones.hand.push(evolution, potion);
  const res = attack(state);
  const evolve = validateLegality(res.state, {
    type: 'attachCard',
    playerId: 'p2',
    payload: { instanceId: evolution.instanceId, targetInstanceId: defender.instanceId },
  });
  assert.equal(evolve.allowed, false);
  const item = validateLegality(res.state, { type: 'playTrainer', playerId: 'p2', payload: { instanceId: potion.instanceId } });
  assert.equal(item.allowed, true, 'only evolving is locked');
});

// ── the attacker's own name ─────────────────────────────────────────────────

test("Mantine Aqua Slash (Team Rocket Returns 45): \"Mantine can't attack during your next turn\" locks the attacker", () => {
  const { state, attacker } = board('Mantine', "Mantine can't attack during your next turn.");
  const res = attack(state);
  assert.equal(res.error, null);
  assert.ok(root(res.state, 'p1', attacker.instanceId).cannotAttackUntilTurn > 5);
});

test('Arcanine Inferno Onrush (Secret Wonders 22): "Arcanine does 40 damage to itself"', () => {
  const { state, attacker } = board('Arcanine', 'Arcanine does 40 damage to itself.', { damage: '100' });
  const res = attack(state);
  assert.equal(root(res.state, 'p1', attacker.instanceId).damage, 40);
});

test('self-name rewrite keeps a name that counts cards, not the attacker', () => {
  // Spiritomb-style count: the name after "for each" is a card name, not the attacker.
  const parsed = parseAttackDamage(
    { damage: '10×', text: 'Does 10 damage times the number of damage counters on Dodrio.' },
    { name: 'Dodrio' },
    {},
    { benchNames: [], attackerDamage: 40 }
  );
  // Dodrio Retaliate (Hidden Legends 33).
  assert.equal(parsed.total, 40);
});

// ── "times the number of …" units ───────────────────────────────────────────

test('older "does N damage times the number of …" units read the board', () => {
  const ctx = {
    benchNames: [],
    ownHandCount: 4,
    ownPokemon: [{ name: 'Grumpig', kinds: [] }, { name: 'Spoink', bench: true, kinds: [] }],
    opponentPokemon: [{ name: 'A', kinds: [] }, { name: 'B', bench: true, kinds: [] }, { name: 'C', bench: true, kinds: [] }],
  };
  const total = (name, damage, text) => parseAttackDamage({ damage, text }, { name }, {}, ctx).total;
  // Grumpig Circular Steps (Crystal Guardians 20).
  assert.equal(
    total(
      'Grumpig',
      '10×',
      "Does 10 damage times the number of Pokémon in play (both yours and your opponent's), excluding Grumpig."
    ),
    40
  );
  // Empoleon Attack Command (Plasma Freeze 117).
  assert.equal(
    total('Empoleon', '10×', "Does 10 damage times the number of Pokémon in play (both yours and your opponent's)."),
    50
  );
  // Gardevoir Black Magic (Delta Species 6): the opponent's Bench, added to the base.
  assert.equal(
    total('Gardevoir', '10+', "Does 10 damage plus 20 more damage times the number of your opponent's Benched Pokémon."),
    50
  );
  // Gourgeist Horror Note (Phantom Forces 45).
  assert.equal(total('Gourgeist', '10×', 'This attack does 10 damage times the number of cards in your hand.'), 40);
  // Empoleon BREAK Emperor's Command (XY Promos XY134 text): every opponent Pokémon.
  assert.equal(
    total('Empoleon BREAK', '30×', 'This attack does 30 damage times the number of Pokémon your opponent has in play.'),
    90
  );
});

// ── Stadium discards ────────────────────────────────────────────────────────

const withStadium = (state) => {
  state.stadium = trainer('Artazon', 'Stadium');
  state.stadium.ownerId = 'p2';
};
const choose = (res, selection) =>
  applyCommand(
    res.state,
    { type: 'resolveChoice', playerId: 'p1', payload: { choiceId: res.state.pendingChoice.choiceId, selection } },
    createRng(3)
  );
const damageOf = (res) => res.events.find((e) => e.type === 'attackExecuted')?.damage;

test('Great Tusk ex Bedrock Breaker (Scarlet & Violet 246): the Stadium is discarded', () => {
  const { state } = board('Great Tusk ex', 'Discard a Stadium in play.', { setup: withStadium });
  assert.equal(attack(state).state.stadium, null);
});

test('Lugia VSTAR Tempest Dive (Silver Tempest 211): the Stadium discard is offered', () => {
  const { state } = board('Lugia VSTAR', 'You may discard a Stadium in play.', { setup: withStadium });
  const offered = attack(state);
  assert.ok(offered.state.pendingChoice);
  const yes = offered.state.pendingChoice.options.find((o) => o.name === 'Yes').instanceId;
  const no = offered.state.pendingChoice.options.find((o) => o.name === 'No').instanceId;
  assert.equal(choose(offered, [yes]).state.stadium, null);
  const kept = board('Lugia VSTAR', 'You may discard a Stadium in play.', { setup: withStadium });
  assert.equal(choose(attack(kept.state), [no]).state.stadium?.name, 'Artazon');
});

test("Brock's Primeape Mega Thrash (Gym Challenge 35): recoil, then the Stadium goes", () => {
  const text = "Brock's Primeape does 20 damage to itself. If there is a Stadium card in play, discard it.";
  const { state, attacker } = board("Brock's Primeape", text, { damage: '60', setup: withStadium });
  const res = attack(state);
  assert.equal(res.state.stadium, null);
  assert.equal(root(res.state, 'p1', attacker.instanceId).damage, 20);
});

// ── the attacker's own Energy ───────────────────────────────────────────────

const attachTo = (state, attacker, types) => {
  for (const type of types) state.players.p1.zones.active.push(energy(type, attacker.instanceId));
};
const attachedTypes = (state, attacker) =>
  state.players.p1.zones.active.filter((c) => c.attachedTo === attacker.instanceId).map((c) => c.energyType).sort();

test('Arcanine White Flames (Skyridge 3): "Discard all {R} Energy cards attached to Arcanine"', () => {
  const { state, attacker } = board('Arcanine', 'Discard all {R} Energy cards attached to Arcanine.', { damage: '70' });
  attachTo(state, attacker, ['Fire', 'Fire', 'Water']);
  assert.deepEqual(attachedTypes(attack(state).state, attacker), ['Water']);
});

test('Lugia ex Elemental Blast (Unseen Forces 105): a three-type discard list', () => {
  const text = 'Discard a {R} Energy, {W} Energy, and {L} Energy attached to Lugia ex.';
  const { state, attacker } = board('Lugia ex', text, { damage: '200' });
  attachTo(state, attacker, ['Fire', 'Water', 'Lightning', 'Psychic']);
  assert.deepEqual(attachedTypes(attack(state).state, attacker), ['Psychic']);
});

// ── offered bonuses ─────────────────────────────────────────────────────────

test('Electrode Ion Blast (Secret Wonders 26): +60 and 100 recoil only when accepted', () => {
  const text = 'You may do 40 damage plus 60 more damage. If you do, Electrode does 100 damage to itself.';
  const yes = board('Electrode', text, { damage: '40+' });
  const accepted = choose(attack(yes.state), [1]);
  assert.equal(damageOf(accepted), 100);
  assert.equal(root(accepted.state, 'p1', yes.attacker.instanceId).damage, 100);
  const no = board('Electrode', text, { damage: '40+' });
  const declined = choose(attack(no.state), [2]);
  assert.equal(damageOf(declined), 40);
  assert.equal(root(declined.state, 'p1', no.attacker.instanceId).damage, 0);
});

test('Arcanine Burn Out (Rising Rivals 1): accepting burns Arcanine', () => {
  const text = 'You may do 30 damage plus 30 more damage. If you do, Arcanine is now Burned.';
  const { state, attacker } = board('Arcanine', text, { damage: '30+' });
  const accepted = choose(attack(state), [1]);
  assert.equal(damageOf(accepted), 60);
  assert.ok(accepted.events.some((e) => e.type === 'specialConditionUpdated' && e.instanceId === attacker.instanceId));
});

test('Ampharos Lightning Strike (Expedition 34): paying swaps the base damage to 80', () => {
  const text =
    'You may discard all {L} Energy cards attached to Ampharos. If you do, this attack\'s base damage is 80 instead of 40.';
  const { state, attacker } = board('Ampharos', text, { damage: '40' });
  attachTo(state, attacker, ['Lightning', 'Lightning', 'Water']);
  const paid = choose(attack(state), [1]);
  assert.equal(damageOf(paid), 80);
  assert.deepEqual(attachedTypes(paid.state, attacker), ['Water']);
});

test('Staraptor FB LV.X Defog (Supreme Victors 147): discard the Stadium before damage for base 70', () => {
  const text =
    "Before doing damage, you may discard any Stadium card in play. If you do, this attack's base damage is 70 instead of 40.";
  const { state } = board('Staraptor FB LV.X', text, { damage: '40', setup: withStadium });
  const paid = choose(attack(state), [1]);
  assert.equal(damageOf(paid), 70);
  assert.equal(paid.state.stadium, null);
});

// ── "this attack's base damage is N instead of M" ───────────────────────────

test('Dewgong Ice Shard (Supreme Victors 24): base 80 against a {F} Defending Pokémon', () => {
  const text = "If the Defending Pokémon is a {F} Pokémon, this attack's base damage is 80 instead of 30.";
  const fighting = board('Dewgong', text, {
    setup: (s) => {
      s.players.p2.zones.active[0].types = ['Fighting'];
    },
  });
  fighting.state.players.p1.zones.active[0].attacks[0].damage = '30';
  assert.equal(damageOf(attack(fighting.state)), 80);
  const water = board('Dewgong', text, {
    setup: (s) => {
      s.players.p2.zones.active[0].types = ['Water'];
    },
  });
  water.state.players.p1.zones.active[0].attacks[0].damage = '30';
  assert.equal(damageOf(attack(water.state)), 30);
});
