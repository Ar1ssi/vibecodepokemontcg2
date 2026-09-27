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
import { parseNextTurnLock } from '../rules/attack-effects.mjs';

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

// ── next-turn locks on the Defending Pokémon ────────────────────────────────

test('a coin-gated "can\'t attack" lock needs heads; other wordings lock too', () => {
  const text = "Flip a coin. If heads, the Defending Pokémon can't attack during your opponent's next turn.";
  assert.equal(parseNextTurnLock({ text }, { coin: 'tails' }), null);
  assert.equal(parseNextTurnLock({ text }, { coin: 'heads' }).oppCannotAttack, true);
  // Carvanha Big Bite (Ruby & Sapphire 51).
  assert.equal(
    parseNextTurnLock({ text: "The Defending Pokémon can't retreat until the end of your opponent's next turn." })
      .oppCannotRetreat,
    true
  );
  // Aurorus Freezing Chill (Perfect Order 092).
  assert.equal(
    parseNextTurnLock({ text: "During your opponent's next turn, the Defending Pokémon can't use attacks." }).oppCannotAttack,
    true
  );
  // Sabrina's Alakazam Mega Burn (Gym Challenge 16).
  assert.equal(
    parseNextTurnLock({ name: 'Mega Burn', text: "You can't use this attack during your next turn." }).selfCannotUseAttack,
    'Mega Burn'
  );
  // Dialga-EX Chrono Wind (Phantom Forces 122): the condition decides.
  const chrono = { text: "If the Defending Pokémon is a Pokémon-EX, it can't attack during your opponent's next turn." };
  assert.equal(parseNextTurnLock(chrono, { conditionHolds: () => false }), null);
  assert.equal(parseNextTurnLock(chrono, { conditionHolds: () => true }).oppCannotAttack, true);
});

const powerText = 'Once during your turn (before your attack), you may draw a card.';
const useAbility = (state, card) =>
  validateLegality(state, { type: 'useAbility', playerId: 'p2', payload: { instanceId: card.instanceId, abilityIndex: 0 } });

test('Shiftry Seal Off (Rising Rivals 13): the Defending Pokémon cannot use its Poké-Power', () => {
  const text = "The Defending Pokémon can't use any Poké-Powers or Poké-Bodies during your opponent's next turn.";
  const { state, defender } = board('Shiftry', text);
  defender.abilities = [{ name: 'Probe Power', type: 'Poké-Power', text: powerText }];
  const res = attack(state);
  assert.equal(res.error, null);
  assert.equal(useAbility(res.state, root(res.state, 'p2', defender.instanceId)).allowed, false);
  res.state.turn.number = 8;
  assert.equal(useAbility(res.state, root(res.state, 'p2', defender.instanceId)).allowed, true);
});

test("Gardevoir Psychic Lock (Secret Wonders 7): none of the opponent's Poké-Powers work", () => {
  const text = "During your opponent's next turn, your opponent can't use any Poké-Powers on his or her Pokémon.";
  const benched = mon('Benched Power', { abilities: [{ name: 'Probe Power', type: 'Poké-Power', text: powerText }] });
  const { state } = board('Gardevoir', text, { setup: (s) => s.players.p2.zones.bench.push(benched) });
  const res = attack(state);
  assert.equal(useAbility(res.state, benched).allowed, false);
  res.state.turn.number = 8;
  assert.equal(useAbility(res.state, benched).allowed, true, 'the lock lasts one turn');
});

// ── protection markers ──────────────────────────────────────────────────────

const PARALYZE = { name: 'Zap', cost: [], damage: '50', text: 'Your opponent\'s Active Pokémon is now Paralyzed.' };
const opponentAttacks = (state) =>
  applyCommand(state, { type: 'attack', playerId: 'p2', payload: { attackIndex: 0 } }, createRng(3));

test('Jirachi-GX Star Shield-GX (Unified Minds 79a): no damage and no effects next turn', () => {
  const text =
    "Prevent all effects of attacks, including damage, done to this Pokémon during your opponent's next turn. (You can't use more than 1 GX attack in a game.)";
  const { state, attacker, defender } = board('Jirachi-GX', text, { damage: '100' });
  defender.attacks = [PARALYZE];
  const shielded = attack(state);
  const hit = opponentAttacks(shielded.state);
  assert.equal(hit.error, null);
  const jirachi = root(hit.state, 'p1', attacker.instanceId);
  assert.equal(jirachi.damage, 0);
  assert.ok(!hit.events.some((e) => e.type === 'specialConditionUpdated' && e.instanceId === attacker.instanceId));
});

test('Latios-EX Light Pulse (XY Promos XY72): damage lands, effects do not', () => {
  const text =
    "Prevent all effects of your opponent's attacks, except damage, done to this Pokémon during your opponent's next turn.";
  const { state, attacker, defender } = board('Latios-EX', text, { damage: '110' });
  defender.attacks = [PARALYZE];
  const hit = opponentAttacks(attack(state).state);
  assert.equal(root(hit.state, 'p1', attacker.instanceId).damage, 50);
  assert.ok(!hit.events.some((e) => e.type === 'specialConditionUpdated' && e.instanceId === attacker.instanceId));
});

test('Dracozolt VMAX Spark Trap (Evolving Skies 210): 12 counters on the Pokémon that hits it', () => {
  const text =
    "During your opponent's next turn, if this Pokémon is damaged by an attack (even if it is Knocked Out), put 12 damage counters on the Attacking Pokémon.";
  const { state, defender } = board('Dracozolt VMAX', text, { damage: '60' });
  defender.attacks = [{ name: 'Hit', cost: [], damage: '30', text: '' }];
  const hit = opponentAttacks(attack(state).state);
  assert.equal(root(hit.state, 'p2', defender.instanceId).damage, 60 + 120);
});

test('Weezing Smokescreen (XY Promos XY163): the older wording sets the flip-or-fail marker', () => {
  const steps = parseAttackSteps(
    "If the Defending Pokémon tries to attack during your opponent's next turn, your opponent flips a coin. If tails, that attack does nothing."
  ).after;
  assert.deepEqual(steps.map((s) => s.marker?.kind), ['attackFlipOrFail']);
});

test('Lunala-GX Moongeist Beam (Ultra Prism 172): the Defending Pokémon cannot be healed', () => {
  const text = "The Defending Pokémon can't be healed during your opponent's next turn.";
  const { state, defender } = board('Lunala-GX', text, { damage: '120' });
  defender.attacks = [{ name: 'Rest', cost: [], damage: '', text: 'Heal 30 damage from this Pokémon.' }];
  const hit = opponentAttacks(attack(state).state);
  assert.equal(hit.error, null);
  assert.equal(root(hit.state, 'p2', defender.instanceId).damage, 120);
});

// ── chosen targets ──────────────────────────────────────────────────────────

const benchOf = (state, playerId) => state.players[playerId].zones.bench.filter((c) => !c.attachedTo);
const pickTarget = (res, id) => choose(res, [id]);

test('Dragapult ex Phantom Dive (Ascended Heroes 160): 6 counters split over the Bench only', () => {
  const text = "Put 6 damage counters on your opponent's Benched Pokémon in any way you like.";
  const a = mon('Bench A', { hp: 200 });
  const b = mon('Bench B', { hp: 200 });
  const { state, defender } = board('Dragapult ex', text, {
    damage: '200',
    setup: (s) => s.players.p2.zones.bench.push(a, b),
  });
  let res = attack(state);
  for (let placed = 0; placed < 6; placed++) {
    assert.ok(res.state.pendingChoice, `pick ${placed + 1}`);
    const ids = res.state.pendingChoice.options.map((o) => o.instanceId);
    assert.ok(!ids.includes(defender.instanceId), 'the Active is not a choice');
    res = pickTarget(res, placed < 4 ? a.instanceId : b.instanceId);
  }
  assert.equal(res.state.pendingChoice, null);
  const [afterA, afterB] = benchOf(res.state, 'p2');
  assert.equal(afterA.damage, 40);
  assert.equal(afterB.damage, 20);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage, 200);
});

test('Ting-Lu ex Land Scoop (Paldean Fates 244): 2 counters on 1 Benched Pokémon', () => {
  const text = "Put 2 damage counters on 1 of your opponent's Benched Pokémon.";
  const benched = mon('Bench A', { hp: 200 });
  const { state } = board('Ting-Lu ex', text, { damage: '150', setup: (s) => s.players.p2.zones.bench.push(benched) });
  const res = attack(state);
  assert.equal(benchOf(res.state, 'p2')[0].damage, 20);
});

test('Aggron ex Split Bomb (Crystal Guardians 89): 30 to each of 2 chosen Pokémon', () => {
  const text =
    "Choose 2 of your opponent's Pokémon. This attack does 30 damage to each of them. (Don't apply Weakness and Resistance for Benched Pokémon.)";
  const a = mon('Bench A', { hp: 200 });
  const b = mon('Bench B', { hp: 200 });
  const { state, defender } = board('Aggron ex', text, { damage: '', setup: (s) => s.players.p2.zones.bench.push(a, b) });
  const offered = attack(state);
  assert.equal(offered.state.pendingChoice.min, 2);
  const res = choose(offered, [defender.instanceId, b.instanceId]);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage, 30);
  assert.equal(benchOf(res.state, 'p2')[1].damage, 30);
  assert.equal(benchOf(res.state, 'p2')[0].damage, 0);
});

test('Arboliva ex Oil Salvo (Destined Rivals 207): 6 picks of 20, repeats allowed', () => {
  const text =
    "Choose 1 of your opponent's Pokémon 6 times. (You can choose the same Pokémon more than once.) For each time you chose a Pokémon, do 20 damage to it. This damage isn't affected by Weakness or Resistance.";
  const a = mon('Bench A', { hp: 300 });
  const { state, defender } = board('Arboliva ex', text, { damage: '', setup: (s) => s.players.p2.zones.bench.push(a) });
  defender.weakness = { type: 'Grass', value: 2 };
  let res = attack(state);
  for (let pick = 0; pick < 6; pick++) res = pickTarget(res, pick < 5 ? defender.instanceId : a.instanceId);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage, 100, 'no Weakness');
  assert.equal(benchOf(res.state, 'p2')[0].damage, 20);
});

test('Shedinja Spike Wound (Supreme Victors 44): only a damaged Pokémon can be chosen', () => {
  const text =
    "Choose 1 of your opponent's Pokémon that has any damage counters on it. This attack does 30 damage to that Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)";
  const hurt = mon('Hurt', { hp: 200, damage: 10 });
  const fresh = mon('Fresh', { hp: 200 });
  const { state } = board('Shedinja', text, { damage: '', setup: (s) => s.players.p2.zones.bench.push(hurt, fresh) });
  const res = attack(state);
  assert.equal(benchOf(res.state, 'p2')[0].damage, 40, 'the only damaged Pokémon is picked');
  assert.equal(benchOf(res.state, 'p2')[1].damage, 0);
});

test('Gengar Dark Mind (Legendary Collection 11): 10 to 1 Benched Pokémon', () => {
  const text =
    "If your opponent has any Benched Pokémon, choose 1 of them and this attack does 10 damage to it. (Don't apply Weakness and Resistance for Benched Pokémon.)";
  const benched = mon('Bench A', { hp: 200 });
  const { state, defender } = board('Gengar', text, { setup: (s) => s.players.p2.zones.bench.push(benched) });
  const res = attack(state);
  assert.equal(benchOf(res.state, 'p2')[0].damage, 10);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage, 30);
});

test('Drapion V Dynamic Tail (Crown Zenith GG49): 60 to 1 of your own Pokémon', () => {
  const text =
    "This attack also does 60 damage to 1 of your Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)";
  const ally = mon('Ally', { hp: 200 });
  const { state, attacker } = board('Drapion V', text, { damage: '190', setup: (s) => s.players.p1.zones.bench.push(ally) });
  const offered = attack(state);
  const ids = offered.state.pendingChoice.options.map((o) => o.instanceId).sort();
  assert.deepEqual(ids, [attacker.instanceId, ally.instanceId].sort(), 'only your own Pokémon');
  const res = choose(offered, [ally.instanceId]);
  assert.equal(benchOf(res.state, 'p1')[0].damage, 60);
});

test('Giratina Shadow Impact (Lost Thunder 97) and Gengar V Pain Explosion (Fusion Strike 156)', () => {
  const giratina = board('Giratina', 'Put 4 damage counters on 1 of your Pokémon.', { damage: '130' });
  assert.equal(root(attack(giratina.state).state, 'p1', giratina.attacker.instanceId).damage, 40);
  const gengar = board('Gengar V', 'Put 3 damage counters on this Pokémon.', { damage: '190' });
  assert.equal(root(attack(gengar.state).state, 'p1', gengar.attacker.instanceId).damage, 30);
});

// ── cards attached to the Defending Pokémon ─────────────────────────────────

const specialEnergy = (attachedTo) =>
  createCard({ instanceId: nextId++, name: 'Double Turbo Energy', supertype: 'Energy', subtypes: ['Special'], attachedTo });
const tool = (attachedTo) =>
  createCard({
    instanceId: nextId++,
    name: 'Choice Belt',
    supertype: 'Trainer',
    subtypes: ['Pokémon Tool'],
    type: 'Pokémon Tool',
    attachedTo,
  });
const attachedToDefender = (state, defender) =>
  state.players.p2.zones.active
    .filter((c) => c.attachedTo === defender.instanceId)
    .map((c) => c.name)
    .sort();

test('Exploud ex Derail (Crystal Guardians 92) and Typhlosion Evaporating Heat (Mysterious Treasures 16)', () => {
  const derail = board('Exploud ex', 'Discard a Special Energy card, if any, attached to the Defending Pokémon.', {
    setup: (s) => {
      const d = s.players.p2.zones.active[0];
      s.players.p2.zones.active.push(specialEnergy(d.instanceId), energy('Water', d.instanceId));
    },
  });
  assert.deepEqual(attachedToDefender(attack(derail.state).state, derail.defender), ['Basic Water Energy']);
  const heat = board('Typhlosion', 'Discard a {W} Energy attached to the Defending Pokémon.', {
    setup: (s) => {
      const d = s.players.p2.zones.active[0];
      s.players.p2.zones.active.push(energy('Water', d.instanceId), energy('Fire', d.instanceId));
    },
  });
  assert.deepEqual(attachedToDefender(attack(heat.state).state, heat.defender), ['Basic Fire Energy']);
});

test('Scizor V Hack Off (Darkness Ablaze 183): a Tool and a Special Energy', () => {
  const text = "Discard a Pokémon Tool and a Special Energy from your opponent's Active Pokémon.";
  const { state, defender } = board('Scizor V', text, {
    setup: (s) => {
      const d = s.players.p2.zones.active[0];
      s.players.p2.zones.active.push(tool(d.instanceId), specialEnergy(d.instanceId), energy('Water', d.instanceId));
    },
  });
  assert.deepEqual(attachedToDefender(attack(state).state, defender), ['Basic Water Energy']);
});

test('Skuntank Plunder (Stormfront 26): the Tool goes before damage', () => {
  const text = 'Before doing damage, discard all Trainer cards attached to the Defending Pokémon.';
  const { state, defender } = board('Skuntank', text, {
    damage: '60',
    setup: (s) => s.players.p2.zones.active.push(tool(s.players.p2.zones.active[0].instanceId)),
  });
  assert.deepEqual(attachedToDefender(attack(state).state, defender), []);
  assert.deepEqual(parseAttackSteps(text).before.map((s) => s.type), ['atkDiscardOppTools']);
});

// ── the attacker's own Energy, hand and place in play ───────────────────────

test('Kyogre-EX Giant Whirlpool (Primal Clash 148): 2 {W} Energy return to hand', () => {
  const { state, attacker } = board('Kyogre-EX', 'Return 2 {W} Energy attached to this Pokémon to your hand.', {
    damage: '140',
  });
  attachTo(state, attacker, ['Water', 'Water', 'Water', 'Fire']);
  const offered = attack(state);
  const water = offered.state.pendingChoice.options.map((o) => o.instanceId);
  assert.equal(water.length, 3, 'the {W} Energy are the choices');
  const res = choose(offered, water.slice(0, 2));
  assert.deepEqual(attachedTypes(res.state, attacker), ['Fire', 'Water']);
  assert.equal(res.state.players.p1.zones.hand.filter((c) => c.energyType === 'Water').length, 2);
});

test('Articuno ex Ice Gift (Nintendo Black Star Promos 032): a {W} Energy may move to another Pokémon', () => {
  const text = 'You may move a {W} Energy attached to Articuno ex to 1 of your Pokémon.';
  const ally = mon('Ally');
  const { state, attacker } = board('Articuno ex', text, { damage: '10', setup: (s) => s.players.p1.zones.bench.push(ally) });
  attachTo(state, attacker, ['Water']);
  let res = attack(state);
  for (let guard = 0; res.state.pendingChoice && guard < 5; guard++) {
    const options = res.state.pendingChoice.options;
    const option = options.find((o) => o.name === 'Yes' || o.instanceId === ally.instanceId) || options[0];
    res = choose(res, [option.instanceId]);
  }
  assert.equal(res.state.players.p1.zones.bench.filter((c) => c.attachedTo === ally.instanceId).length, 1);
});

test('Pichu Electric Circuit (Stormfront 45): up to 4 {L} Energy from the discard pile', () => {
  const text =
    'Search your discard pile for up to 4 {L} Energy cards, show them to your opponent, and put them into your hand.';
  const { state } = board('Pichu', text, {
    damage: '',
    setup: (s) => s.players.p1.zones.discard.push(energy('Lightning'), energy('Lightning'), energy('Fire')),
  });
  const offered = attack(state);
  const lightning = offered.state.pendingChoice.options.map((o) => o.instanceId);
  assert.equal(lightning.length, 2, 'only the {L} Energy are offered');
  const res = choose(offered, lightning);
  assert.equal(res.state.players.p1.zones.hand.filter((c) => c.energyType === 'Lightning').length, 2);
});

test('Raticate Pickup (FireRed & LeafGreen 48): a Pokémon, a Trainer and an Energy come back', () => {
  const text =
    'Search your discard pile for a Basic Pokémon (or Evolution card), a Trainer card, and an Energy card. Show them to your opponent and put them into your hand.';
  const { state } = board('Raticate', text, {
    damage: '',
    setup: (s) => s.players.p1.zones.discard.push(mon('Old Rattata'), trainer('Old Potion', 'Item'), energy('Grass')),
  });
  assert.equal(attack(state).state.players.p1.zones.discard.length, 0);
});

test('Shaymin-EX Sky Return (Roaring Skies 77a) and Revavroom ex Shattering Speed (Shrouded Fable 081)', () => {
  const sky = board('Shaymin-EX', 'Return this Pokémon and all cards attached to it to your hand.', {
    setup: (s) => s.players.p1.zones.bench.push(mon('Next Up')),
  });
  attachTo(sky.state, sky.attacker, ['Grass']);
  const returned = attack(sky.state);
  assert.ok(returned.state.players.p1.zones.hand.some((c) => c.instanceId === sky.attacker.instanceId));
  assert.ok(returned.state.players.p1.zones.hand.some((c) => c.energyType === 'Grass'));
  const speed = board('Revavroom ex', 'Discard this Pokémon and all attached cards.', {
    damage: '250',
    setup: (s) => s.players.p1.zones.bench.push(mon('Next Up')),
  });
  const discarded = attack(speed.state);
  assert.ok(discarded.state.players.p1.zones.discard.some((c) => c.instanceId === speed.attacker.instanceId));
  assert.equal(discarded.state.players.p2.zones.prizes.length, 6, 'not a Knock Out: no Prize cards');
});

test("Team Rocket's Crobat ex Assassin's Return (Destined Rivals 242): to hand, attached cards discarded", () => {
  const text = 'You may put this Pokémon into your hand. (Discard all cards attached to this Pokémon.)';
  const { state, attacker } = board("Team Rocket's Crobat ex", text, {
    damage: '120',
    setup: (s) => s.players.p1.zones.bench.push(mon('Next Up')),
  });
  attachTo(state, attacker, ['Darkness']);
  const offered = attack(state);
  const yes = offered.state.pendingChoice.options.find((o) => o.name === 'Yes').instanceId;
  const res = choose(offered, [yes]);
  assert.ok(res.state.players.p1.zones.hand.some((c) => c.instanceId === attacker.instanceId));
  assert.ok(res.state.players.p1.zones.discard.some((c) => c.energyType === 'Darkness'));
});

test('Comfey Sweet Kiss (Guardians Rising 93): the opponent draws a card', () => {
  const { state } = board('Comfey', 'Your opponent draws a card.');
  const before = state.players.p2.zones.hand.length;
  const res = attack(state);
  // +1 from Sweet Kiss, +1 from the opponent's turn draw.
  assert.equal(res.state.players.p2.zones.hand.length, before + 2);
});

// ── counters on the Defending Pokémon ───────────────────────────────────────

/** Attacks with each seed until the first coin shows `face`. */
function attackShowing(make, face) {
  for (let seed = 1; seed < 200; seed++) {
    const { state, defender } = make();
    const res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(seed));
    const flip = res.events.find((e) => e.type === 'attackCoinFlipped');
    if ((flip?.flips || [flip?.coin])[0] === face) return { res, defender };
  }
  throw new Error(`no seed shows ${face}`);
}

test('a coin-gated counter placement needs heads', () => {
  const make = () => board('Probe', "Flip a coin. If heads, put 3 damage counters on your opponent's Active Pokémon.", { damage: '' });
  const tails = attackShowing(make, 'tails');
  assert.equal(root(tails.res.state, 'p2', tails.defender.instanceId).damage, 0);
  const heads = attackShowing(make, 'heads');
  assert.equal(root(heads.res.state, 'p2', heads.defender.instanceId).damage, 30);
});

test('Mr. Mime ex Breakdown (FireRed & LeafGreen 111): a counter per card in the opponent\'s hand', () => {
  const text =
    "Count the number of cards in your opponent's hand. Put that many damage counters on the Defending Pokémon.";
  const { state, defender } = board('Mr. Mime ex', text, {
    damage: '',
    setup: (s) => s.players.p2.zones.hand.push(trainer('A', 'Item'), trainer('B', 'Item'), trainer('C', 'Item')),
  });
  assert.equal(root(attack(state).state, 'p2', defender.instanceId).damage, 30);
});

test('Dusclops ex Shadow Beam (Emerald 94): 2 counters per attached Energy', () => {
  const text = 'Put 2 damage counters on the Defending Pokémon for each Energy attached to Dusclops ex.';
  const { state, attacker, defender } = board('Dusclops ex', text, { damage: '' });
  attachTo(state, attacker, ['Psychic', 'Psychic']);
  assert.equal(root(attack(state).state, 'p2', defender.instanceId).damage, 40);
});

test('Shedinja Extra Curse (Deoxys 14): 2 counters, or 4 on a Pokémon-ex', () => {
  const text =
    'Put 2 damage counters on the Defending Pokémon. If the Defending Pokémon is Pokémon-ex, put 4 damage counters instead.';
  const plain = board('Shedinja', text, { damage: '' });
  assert.equal(root(attack(plain.state).state, 'p2', plain.defender.instanceId).damage, 20);
  const ex = board('Shedinja', text, {
    damage: '',
    setup: (s) => {
      s.players.p2.zones.active[0].name = 'Rayquaza ex';
      s.players.p2.zones.active[0].subtypes = ['Basic', 'ex'];
    },
  });
  assert.equal(root(attack(ex.state).state, 'p2', ex.defender.instanceId).damage, 40);
});

test('Dusknoir Hard Feelings (Diamond & Pearl 2): 5 counters plus 1 per Prize the opponent took', () => {
  const text =
    'Put 5 damage counters on the Defending Pokémon. Then, count the number of Prize cards your opponent has taken and put that many damage counters on the Defending Pokémon.';
  const { state, defender } = board('Dusknoir', text, { damage: '', setup: (s) => s.players.p2.zones.prizes.splice(0, 2) });
  assert.equal(root(attack(state).state, 'p2', defender.instanceId).damage, 70);
});

// ── hand disruption ───────────────────────────────────────────────────────────

const chooseAs = (res, selection) =>
  applyCommand(
    res.state,
    {
      type: 'resolveChoice',
      playerId: res.state.pendingChoice.player,
      payload: { choiceId: res.state.pendingChoice.choiceId, selection },
    },
    createRng(3)
  );
const handOf = (state, playerId, count) => {
  const cards = Array.from({ length: count }, (_, i) => trainer(`${playerId} hand ${i}`, 'Item'));
  state.players[playerId].zones.hand.push(...cards);
  return cards;
};

test('Ninjask Chip Off (Legends Awakened 67): random discards down to 5 cards, only from 6 or more', () => {
  const text =
    'If your opponent has 6 or more cards in his or her hand, discard a number of cards without looking until your opponent has 5 cards left in his or her hand.';
  const eight = board('Ninjask', text, { setup: (s) => handOf(s, 'p2', 8) });
  assert.equal(attack(eight.state).state.players.p2.zones.discard.length, 3);
  const five = board('Ninjask', text, { setup: (s) => handOf(s, 'p2', 5) });
  assert.equal(attack(five.state).state.players.p2.zones.discard.length, 0);
});

test('Feraligatr Pull Away (Unseen Forces 4): the opponent discards down to 4 cards', () => {
  const text =
    'If your opponent has 5 of more cards in his or her hand, your opponent discards a number of cards until your opponent has 4 cards left in his or her hand.';
  let hand;
  const { state } = board('Feraligatr', text, { setup: (s) => (hand = handOf(s, 'p2', 7)) });
  let res = attack(state);
  assert.equal(res.pendingChoice.player, 'p2');
  assert.equal(res.pendingChoice.min, 3);
  res = chooseAs(res, hand.slice(0, 3).map((c) => c.instanceId));
  assert.deepEqual(
    res.state.players.p2.zones.discard.map((c) => c.instanceId),
    hand.slice(0, 3).map((c) => c.instanceId)
  );
});

test('Glaceon Ice Bind (Rising Rivals 41): Paralyzed unless the opponent discards a card', () => {
  const text =
    "If your opponent doesn't discard a card from his or her hand, the Defending Pokémon is now Paralyzed.";
  let hand;
  const paid = board('Glaceon', text, { setup: (s) => (hand = handOf(s, 'p2', 2)) });
  let res = attack(paid.state);
  assert.equal(res.pendingChoice.player, 'p2');
  res = chooseAs(res, [hand[0].instanceId]);
  assert.deepEqual(res.state.players.p2.zones.discard.map((c) => c.instanceId), [hand[0].instanceId]);
  assert.notEqual(root(res.state, 'p2', paid.defender.instanceId).specialCondition, 'Paralyzed');

  const declined = board('Glaceon', text, { setup: (s) => handOf(s, 'p2', 2) });
  res = chooseAs(attack(declined.state), [-12]);
  assert.equal(res.state.players.p2.zones.discard.length, 0);
  assert.equal(root(res.state, 'p2', declined.defender.instanceId).specialCondition, 'Paralyzed');

  const empty = board('Glaceon', text);
  res = attack(empty.state);
  assert.equal(root(res.state, 'p2', empty.defender.instanceId).specialCondition, 'Paralyzed');
});

test('Gengar Hurl into Darkness (30th Celebration 94): up to one Pokémon per {P} Energy goes to the Lost Zone', () => {
  const text =
    "Look at your opponent's hand and choose a number of Pokémon you find there up to the number of {P} Energy attached to Gengar. Put the Pokémon you chose in the Lost Zone.";
  let pokemon;
  const { state } = board('Gengar', text, {
    setup: (s) => {
      attachTo(s, s.players.p1.zones.active[0], ['Psychic', 'Psychic', 'Fire']);
      pokemon = [mon('Pikachu'), mon('Eevee'), mon('Mew')];
      s.players.p2.zones.hand.push(...pokemon, trainer('Potion', 'Item'));
    },
  });
  let res = attack(state);
  assert.equal(res.pendingChoice.max, 2);
  assert.equal(res.pendingChoice.options.length, 3);
  res = choose(res, [pokemon[0].instanceId, pokemon[2].instanceId]);
  assert.deepEqual(
    res.state.players.p2.zones.lostZone.map((c) => c.name),
    ['Pikachu', 'Mew']
  );
});

test('Umbreon-EX Veil of Darkness (Fates Collide 119): draw as many cards as were discarded', () => {
  const text = 'Discard as many cards as you like from your hand. Then, draw that many cards.';
  let hand;
  const { state } = board('Umbreon-EX', text, { setup: (s) => (hand = handOf(s, 'p1', 3)) });
  let res = attack(state);
  res = choose(res, [hand[0].instanceId, hand[1].instanceId]);
  const after = res.state.players.p1.zones.hand.map((c) => c.name);
  assert.equal(after.length, 3);
  assert.deepEqual(after.filter((n) => n.includes('deck')).length, 2);
});

// ── gust wordings ─────────────────────────────────────────────────────────────

const oppActive = (state) => state.players.p2.zones.active.find((c) => !c.attachedTo);
const addBench = (state, playerId, ...names) => {
  const cards = names.map((name) => mon(name, { hp: 100 }));
  state.players[playerId].zones.bench.push(...cards);
  return cards;
};

test('Kabutops Luring Antenna (Power Keepers 10): the chosen Benched Pokémon comes up and takes the damage', () => {
  const text =
    "Before doing damage, you may choose 1 of your opponent's Benched Pokémon and switch it with 1 of the Defending Pokémon. If you do, this attack does 20 damage to the new Defending Pokémon. Your opponent chooses the Defending Pokémon to switch.";
  let bench;
  const { state, defender } = board('Kabutops', text, { damage: '20', setup: (s) => (bench = addBench(s, 'p2', 'Omanyte', 'Kabuto')) });
  let res = attack(state);
  if (res.pendingChoice?.options.some((o) => o.instanceId === -11)) res = choose(res, [-11]);
  res = choose(res, [bench[1].instanceId]);
  assert.equal(oppActive(res.state).instanceId, bench[1].instanceId);
  assert.equal(oppActive(res.state).damage, 20);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage || 0, 0);
});

test('Scizor Snatch (Aquapolis 32): only an undamaged Benched Pokémon can be brought up', () => {
  const text =
    "Before doing damage, you may choose 1 of your opponent's Benched Pokémon with no damage counters on it and switch the Defending Pokémon with it.";
  let bench;
  const { state } = board('Scizor', text, {
    setup: (s) => {
      bench = addBench(s, 'p2', 'Hurt', 'Fresh');
      bench[0].damage = 10;
    },
  });
  let res = attack(state);
  if (res.pendingChoice?.options.some((o) => o.instanceId === -11)) res = choose(res, [-11]);
  assert.equal(oppActive(res.state).instanceId, bench[1].instanceId);
});

test('Hypno Spiral Aura (Aquapolis 16): the switch follows only a surviving Defending Pokémon', () => {
  const text =
    "If the Defending Pokémon isn't Knocked Out by the damage from this attack, you may choose 1 of your opponent's Benched Pokémon and switch the Defending Pokémon with it.";
  let bench;
  const alive = board('Hypno', text, { setup: (s) => (bench = addBench(s, 'p2', 'Drowzee')) });
  let res = attack(alive.state);
  if (res.pendingChoice?.options.some((o) => o.instanceId === -11)) res = choose(res, [-11]);
  assert.equal(oppActive(res.state).instanceId, bench[0].instanceId);

  const knockedOut = board('Hypno', text, {
    damage: '500',
    setup: (s) => addBench(s, 'p2', 'Drowzee', 'Slowpoke'),
  });
  res = attack(knockedOut.state);
  const offered = res.pendingChoice?.player === 'p1' ? res.pendingChoice.options.map((o) => o.name) : [];
  assert.ok(!offered.includes('Yes'), 'no switch is offered after the Knock Out');
});

test('Forretress Rapid Spin (Neo Discovery 21): the opponent switches, then the attacker switches', () => {
  const text =
    'If your opponent has any Benched Pokémon, he or she chooses 1 of them and switches it with his or her Active Pokémon, then, if you have any Benched Pokémon, you switch 1 of them with your Active Pokémon. (Do the damage before switching the Pokémon.)';
  let theirs;
  let mine;
  const { state, defender } = board('Forretress', text, {
    setup: (s) => {
      theirs = addBench(s, 'p2', 'Other');
      mine = addBench(s, 'p1', 'Pineco');
    },
  });
  const res = attack(state);
  assert.equal(oppActive(res.state).instanceId, theirs[0].instanceId);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage, 30);
  assert.equal(res.state.players.p1.zones.active.find((c) => !c.attachedTo).instanceId, mine[0].instanceId);
});

test('Malamar V Drag Off (Rebel Clash 186): the damage lands on the new Active Pokémon', () => {
  const text =
    "Switch 1 of your opponent's Benched Pokémon with their Active Pokémon. This attack does 30 damage to the new Active Pokémon.";
  let bench;
  const { state, defender } = board('Malamar V', text, { setup: (s) => (bench = addBench(s, 'p2', 'Inkay')) });
  const res = attack(state);
  assert.equal(oppActive(res.state).instanceId, bench[0].instanceId);
  assert.equal(oppActive(res.state).damage, 30);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage || 0, 0);
});
