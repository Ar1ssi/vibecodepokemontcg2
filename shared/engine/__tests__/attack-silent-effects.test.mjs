// Attack text that used to deal its printed damage and nothing else (parse-hole sweep D2).
// Every text is a corpus row (out/pkmn-pokemon-cards.json / out/pkmn-gx-cards.json), cited
// by set and number in each test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, createPlayerZones } from '../state.mjs';
import { createCard } from '../cards.mjs';
import { createRng } from '../rng.mjs';
import { applyCommand, validateLegality } from '../reduce.mjs';
import { parseAttackDamage, opponentCounterClause } from '../rules/damage-parser.mjs';
import { isAbilitySuppressed } from '../rules/ability-combat.mjs';
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

// ── counter swaps and moves ───────────────────────────────────────────────────

test('Dusknoir Reaper Pulse (Diamond & Pearl Promos DP33): the player chooses how many, up to 2, counters to move', () => {
  const text = "Move up to 2 damage counters from Dusknoir to 1 of your opponent's Benched Pokémon.";
  let bench;
  const { state, attacker, defender } = board('Dusknoir', text, {
    damage: '20',
    setup: (s) => {
      s.players.p1.zones.active[0].damage = 50;
      bench = addBench(s, 'p2', 'Target');
    },
  });
  const offered = attack(state);
  // "Up to" means the player picks the amount (0-2) — never a fixed max.
  assert.ok(offered.state.pendingChoice);
  assert.equal(offered.state.pendingChoice.min, 1);
  assert.equal(offered.state.pendingChoice.max, 1);
  assert.deepEqual(offered.state.pendingChoice.options.map((o) => o.name), ['0', '1', '2']);
  const two = offered.state.pendingChoice.options.find((o) => o.name === '2').instanceId;
  const res = applyCommand(
    offered.state,
    { type: 'resolveChoice', playerId: 'p1', payload: { choiceId: offered.state.pendingChoice.choiceId, selection: [two] } },
    createRng(3)
  );
  assert.equal(root(res.state, 'p1', attacker.instanceId).damage, 30);
  assert.equal(root(res.state, 'p2', bench[0].instanceId).damage, 20);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage, 20);
  // Moving damage counters off is not healing (I194): stampHealedPokemon must not stamp it.
  assert.equal(root(res.state, 'p1', attacker.instanceId).healedTurn, undefined);
});

test('Dusknoir Reaper Pulse: choosing 0 moves nothing and does not stamp a heal', () => {
  const text = "Move up to 2 damage counters from Dusknoir to 1 of your opponent's Benched Pokémon.";
  let bench;
  const { state, attacker } = board('Dusknoir', text, {
    damage: '20',
    setup: (s) => {
      s.players.p1.zones.active[0].damage = 50;
      bench = addBench(s, 'p2', 'Target');
    },
  });
  const offered = attack(state);
  const zero = offered.state.pendingChoice.options.find((o) => o.name === '0').instanceId;
  const res = applyCommand(
    offered.state,
    { type: 'resolveChoice', playerId: 'p1', payload: { choiceId: offered.state.pendingChoice.choiceId, selection: [zero] } },
    createRng(3)
  );
  assert.equal(root(res.state, 'p1', attacker.instanceId).damage, 50);
  assert.equal(root(res.state, 'p2', bench[0].instanceId).damage, 0);
});

test('Wobbuffet V Gritty Comeback (Sword & Shield 191): the two Active Pokémon trade damage counters', () => {
  const text = "Switch all damage counters on this Pokémon with those on your opponent's Active Pokémon.";
  const { state, attacker, defender } = board('Wobbuffet V', text, {
    damage: '',
    setup: (s) => {
      s.players.p1.zones.active[0].damage = 120;
      s.players.p2.zones.active[0].damage = 10;
    },
  });
  const res = attack(state);
  assert.equal(root(res.state, 'p1', attacker.instanceId).damage, 10);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage, 120);
});

test('Unown L Hidden Power (Unseen Forces L): heads leaves the Defending Pokémon 10 HP from a Knock Out', () => {
  const text =
    'Flip a coin. If heads, put damage counters on the Defending Pokémon until it is 10 HP away from being Knocked Out.';
  const make = () => board('Unown', text, { damage: '', setup: (s) => (s.players.p2.zones.active[0].damage = 100) });
  const heads = attackShowing(make, 'heads');
  assert.equal(root(heads.res.state, 'p2', heads.defender.instanceId).damage, 390);
  const tails = attackShowing(make, 'tails');
  assert.equal(root(tails.res.state, 'p2', tails.defender.instanceId).damage, 100);
});

test('Unown ! Hidden Power (Legends Awakened 42): tails puts the 2 counters on your own Pokémon', () => {
  const text =
    "Flip a coin. If heads, put 2 damage counters on 1 of your opponent's Pokémon. If tails, put 2 damage counters on 1 of your Pokémon.";
  const make = () => board('Unown', text, { damage: '' });
  const tails = attackShowing(make, 'tails');
  const attacker = tails.res.state.players.p1.zones.active[0];
  assert.equal(attacker.damage, 20);
  assert.equal(root(tails.res.state, 'p2', tails.defender.instanceId).damage || 0, 0);
  const heads = attackShowing(make, 'heads');
  assert.equal(root(heads.res.state, 'p2', heads.defender.instanceId).damage, 20);
});

// ── discard-pile attaches ─────────────────────────────────────────────────────

const discardEnergy = (state, ...types) => {
  const cards = types.map((type) => energy(type));
  state.players.p1.zones.discard.push(...cards);
  return cards;
};
const hostOf = (state, card) =>
  [...state.players.p1.zones.active, ...state.players.p1.zones.bench].find((c) => c.instanceId === card.instanceId)
    ?.attachedTo;

test('Blaziken VMAX Max Blaze (Silver Tempest TG15): only Benched Rapid Strike Pokémon receive Energy', () => {
  const text =
    'Choose up to 2 of your Benched Rapid Strike Pokémon and attach an Energy card from your discard pile to each of them.';
  let rapid;
  let other;
  let energies;
  const { state } = board('Blaziken VMAX', text, {
    setup: (s) => {
      rapid = mon('Urshifu V', { subtypes: ['Basic', 'V', 'Rapid Strike'] });
      other = mon('Pikachu');
      s.players.p1.zones.bench.push(rapid, other);
      energies = discardEnergy(s, 'Fire', 'Water');
    },
  });
  const res = attack(state);
  const hosts = energies.map((e) => hostOf(res.state, e)).filter(Boolean);
  assert.deepEqual(hosts, [rapid.instanceId]);
});

test('Latias Prism Star Dreamy Mist (Celestial Storm 107): each Basic Benched {N} Pokémon gets a basic Energy', () => {
  const text = 'Attach a basic Energy card from your discard pile to each of your Basic Benched {N} Pokémon.';
  let dragons;
  let energies;
  const { state } = board('Latias Prism Star', text, {
    setup: (s) => {
      dragons = [mon('Latios', { types: ['Dragon'] }), mon('Dratini', { types: ['Dragon'] })];
      s.players.p1.zones.bench.push(...dragons, mon('Pikachu', { types: ['Lightning'] }));
      energies = discardEnergy(s, 'Fire', 'Water', 'Grass');
    },
  });
  const res = attack(state);
  const hosts = energies.map((e) => hostOf(res.state, e)).filter(Boolean).sort();
  assert.deepEqual(hosts, dragons.map((d) => d.instanceId).sort());
});

test('Solgaleo Prism Star Radiant Star (Ultra Prism 89): one {M} Energy per opponent Pokémon in play', () => {
  const text =
    "For each of your opponent's Pokémon in play, attach a {M} Energy card from your discard pile to your Pokémon in any way you like.";
  let metals;
  const { state, attacker } = board('Solgaleo Prism Star', text, {
    setup: (s) => {
      addBench(s, 'p2', 'Opp A', 'Opp B');
      metals = discardEnergy(s, 'Metal', 'Metal', 'Metal', 'Metal', 'Fire');
    },
  });
  let res = attack(state);
  for (let guard = 0; res.pendingChoice?.player === 'p1' && guard < 10; guard++) {
    const ids = res.pendingChoice.options.map((o) => o.instanceId);
    res = choose(res, ids.includes(attacker.instanceId) ? [attacker.instanceId] : ids.slice(0, res.pendingChoice.max));
  }
  assert.equal(metals.filter((e) => hostOf(res.state, e) === attacker.instanceId).length, 3);
});

test('Carbink BREAK Diamond Gift (Fates Collide 51): 2 Energy onto 1 {F} Pokémon', () => {
  const text = 'Attach 2 Energy cards from your discard pile to 1 of your {F} Pokémon.';
  let fighter;
  let energies;
  const { state } = board('Carbink BREAK', text, {
    setup: (s) => {
      fighter = mon('Lucario', { types: ['Fighting'] });
      s.players.p1.zones.bench.push(fighter);
      energies = discardEnergy(s, 'Fighting', 'Water');
    },
  });
  const res = attack(state);
  assert.deepEqual(energies.map((e) => hostOf(res.state, e)), [fighter.instanceId, fighter.instanceId]);
});

test('Thundurus-EX Raiden Knuckle (Black & White Promos BW81): only a Benched Team Plasma Pokémon', () => {
  const text = 'Attach an Energy card from your discard pile to 1 of your Benched Team Plasma Pokémon.';
  let plasma;
  let energies;
  const { state } = board('Thundurus-EX', text, {
    setup: (s) => {
      plasma = mon('Deoxys-EX Team Plasma');
      s.players.p1.zones.bench.push(mon('Pikachu'), plasma);
      energies = discardEnergy(s, 'Lightning');
    },
  });
  const res = attack(state);
  assert.equal(hostOf(res.state, energies[0]), plasma.instanceId);
});

test('Pichu Paste (Holon Phantoms 76): the Energy goes to a Pokémon that has δ', () => {
  const text =
    'Search your discard pile for an Energy card and attach it to 1 of your Pokémon that has δ on its card.';
  let delta;
  let energies;
  const { state } = board('Pichu', text, {
    setup: (s) => {
      delta = mon('Flygon δ');
      s.players.p1.zones.bench.push(mon('Pikachu'), delta);
      energies = discardEnergy(s, 'Grass');
    },
  });
  const res = attack(state);
  assert.equal(hostOf(res.state, energies[0]), delta.instanceId);
});

test('Magneton Plasma (Neo Revelation 10): a {L} Energy from the discard pile attaches to Magneton', () => {
  const text = 'If there are any {L} Energy cards in your discard pile, attach 1 of them to Magneton.';
  let energies;
  const { state, attacker } = board('Magneton', text, { setup: (s) => (energies = discardEnergy(s, 'Fire', 'Lightning')) });
  const res = attack(state);
  assert.equal(hostOf(res.state, energies[1]), attacker.instanceId);
  assert.equal(hostOf(res.state, energies[0]), undefined);
});

test('Ampharos-EX Thunder Rod (Ancient Origins 87): {L} Energy from the top 4 cards attach to itself', () => {
  const text =
    'Look at the top 4 cards of your deck and attach as many {L} Energy cards you find there as you like to this Pokémon. Shuffle the other cards back into your deck.';
  let top;
  const { state, attacker } = board('Ampharos-EX', text, {
    setup: (s) => {
      top = [energy('Lightning'), energy('Fire'), energy('Lightning'), trainer('Potion', 'Item'), energy('Lightning')];
      s.players.p1.zones.deck.unshift(...top);
    },
  });
  let res = attack(state);
  assert.deepEqual(res.pendingChoice.options.map((o) => o.instanceId), [top[0].instanceId, top[2].instanceId]);
  res = choose(res, [top[0].instanceId, top[2].instanceId]);
  assert.deepEqual(
    top.map((c) => hostOf(res.state, c) ?? null),
    [attacker.instanceId, null, attacker.instanceId, null, null]
  );
  assert.ok(res.events.some((e) => e.type === 'deckShuffled'));
});

test('Dragonite VSTAR Draconic Star (Sword & Shield Promos SWSH236): {W} or {L} Energy spread over your Pokémon', () => {
  const text =
    'Look at the top 12 cards of your deck and attach any number of {W} or {L} Energy cards you find there to your Pokémon in any way you like. Shuffle the other cards back into your deck.';
  let top;
  let benched;
  const { state, attacker } = board('Dragonite VSTAR', text, {
    setup: (s) => {
      benched = mon('Dragonair');
      s.players.p1.zones.bench.push(benched);
      top = [energy('Water'), energy('Fire'), energy('Lightning')];
      s.players.p1.zones.deck.unshift(...top);
    },
  });
  let res = attack(state);
  assert.equal(res.pendingChoice.options.length, 2);
  res = choose(res, [top[0].instanceId, top[2].instanceId]);
  res = choose(res, [attacker.instanceId]);
  res = choose(res, [benched.instanceId]);
  assert.equal(hostOf(res.state, top[0]), attacker.instanceId);
  assert.equal(hostOf(res.state, top[2]), benched.instanceId);
  assert.equal(hostOf(res.state, top[1]), undefined);
});

// ── protections ───────────────────────────────────────────────────────────────

const markerKinds = (state, playerId, card) =>
  (root(state, playerId, card.instanceId)?.attackMarkers || []).map((m) => m.kind).sort();
const counterAttack = (res) =>
  applyCommand(res.state, { type: 'attack', playerId: 'p2', payload: { attackIndex: 0 } }, createRng(3));
const armDefender = (s, text, damage = '30') => {
  s.players.p2.zones.active[0].attacks = [{ name: 'Reply', cost: [], damage, text }];
};

test('Entei Protective Flame (Wizards Black Star Promos 34): the Bench takes no damage on the next turn', () => {
  const text =
    "During your opponent's next turn, prevent all effects of attacks, including damage, done to your Benched Pokémon.";
  let bench;
  const { state } = board('Entei', text, {
    setup: (s) => {
      bench = mon('Benched', { hp: 100 });
      s.players.p1.zones.bench.push(bench);
      armDefender(s, "This attack does 30 damage to 1 of your opponent's Benched Pokémon.", '');
    },
  });
  let res = counterAttack(attack(state));
  if (res.pendingChoice) res = chooseAs(res, [bench.instanceId]);
  assert.equal(root(res.state, 'p1', bench.instanceId).damage || 0, 0);
});

test('Dusknoir Night Spin (Stormfront 1): only attackers with 2 or less Energy are stopped', () => {
  const text =
    "Prevent all effects of an attack, including damage, done to Dusknoir by your opponent's Pokémon that has 2 or less Energy attached to it during your opponent's next turn.";
  const run = (energyCount) => {
    const { state, attacker } = board('Dusknoir', text, {
      setup: (s) => {
        armDefender(s, '');
        const def = s.players.p2.zones.active[0];
        for (let i = 0; i < energyCount; i++) s.players.p2.zones.active.push(energy('Darkness', def.instanceId));
      },
    });
    return root(counterAttack(attack(state)).state, 'p1', attacker.instanceId).damage || 0;
  };
  assert.equal(run(2), 0);
  assert.equal(run(3), 30);
});

test('Dusknoir Night Spin (Stormfront 1): counts Energy units, not Energy cards (I194)', () => {
  const text =
    "Prevent all effects of an attack, including damage, done to Dusknoir by your opponent's Pokémon that has 2 or less Energy attached to it during your opponent's next turn.";
  // 2 Double Colorless Energy cards = 4 Energy units, well over the "2 or less" gate, even
  // though the card count (2) alone would read as "2 or less" under the old, wrong count.
  const { state, attacker } = board('Dusknoir', text, {
    setup: (s) => {
      armDefender(s, '');
      const def = s.players.p2.zones.active[0];
      for (let i = 0; i < 2; i++) {
        s.players.p2.zones.active.push(
          createCard({
            instanceId: nextId++,
            name: 'Double Colorless Energy',
            supertype: 'Energy',
            subtypes: ['Special', 'Double Colorless'],
            attachedTo: def.instanceId,
          })
        );
      }
    },
  });
  const dealt = root(counterAttack(attack(state)).state, 'p1', attacker.instanceId).damage || 0;
  assert.equal(dealt, 30);
});

test('Scizor Accelerate (Stormfront 25): protected only after a Knock Out', () => {
  const text =
    "If the Defending Pokémon is Knocked Out by this attack, prevent all effects of an attack, including damage, done to Scizor during your opponent's next turn.";
  const ko = board('Scizor', text, {
    damage: '50',
    setup: (s) => {
      s.players.p2.zones.active[0].hp = 50;
      addBench(s, 'p2', 'Next');
    },
  });
  assert.deepEqual(markerKinds(attack(ko.state).state, 'p1', ko.attacker), ['effectPrevent', 'incomingPrevent']);
  const alive = board('Scizor', text, { damage: '50' });
  assert.deepEqual(markerKinds(attack(alive.state).state, 'p1', alive.attacker), []);
});

test("Flygon Sand Wall (Rising Rivals 5): protected only after discarding the opponent's Stadium", () => {
  const text =
    "Discard a Stadium card your opponent has in play. If you do, prevent all effects of an attack, including damage, done to Flygon during your opponent's next turn.";
  const stadium = (ownerId) => ({ ...trainer('Stadium', 'Stadium'), ownerId });
  const theirs = board('Flygon', text, { setup: (s) => (s.stadium = stadium('p2')) });
  let res = attack(theirs.state);
  assert.equal(res.state.stadium, null);
  assert.deepEqual(markerKinds(res.state, 'p1', theirs.attacker), ['effectPrevent', 'incomingPrevent']);
  const mine = board('Flygon', text, { setup: (s) => (s.stadium = stadium('p1')) });
  res = attack(mine.state);
  assert.ok(res.state.stadium);
  assert.deepEqual(markerKinds(res.state, 'p1', mine.attacker), []);
});

test('Electivire LV.X Pulse Barrier (Mysterious Treasures 121): Tools discarded earn the protection', () => {
  const text =
    "Discard all of your opponent's Pokémon Tool cards and Stadium cards in play. If you do, prevent all effects, including damage, done to Electivire during your opponent's next turn.";
  let belt;
  const { state, attacker } = board('Electivire LV.X', text, {
    setup: (s) => {
      belt = tool(s.players.p2.zones.active[0].instanceId);
      s.players.p2.zones.active.push(belt);
    },
  });
  const res = attack(state);
  assert.ok(res.state.players.p2.zones.discard.some((c) => c.instanceId === belt.instanceId));
  assert.deepEqual(markerKinds(res.state, 'p1', attacker), ['effectPrevent', 'incomingPrevent']);
});

// ── filtered spreads and board-counted damage ─────────────────────────────────

test('Palossand ex Barite Jail (Surging Sparks 221): each Benched Pokémon drops to 100 HP remaining', () => {
  const text = "Put damage counters on each of your opponent's Benched Pokémon until its remaining HP is 100.";
  let big;
  let small;
  const { state } = board('Palossand ex', text, {
    damage: '',
    setup: (s) => {
      big = mon('Big', { hp: 250 });
      small = mon('Small', { hp: 70 });
      s.players.p2.zones.bench.push(big, small);
    },
  });
  const res = attack(state);
  assert.equal(root(res.state, 'p2', big.instanceId).damage, 150);
  assert.equal(root(res.state, 'p2', small.instanceId).damage || 0, 0);
});

test('Bronzong Heavy Potential (Stormfront 13): a counter per {C} of each Retreat Cost', () => {
  const text =
    "Put a number of damage counters on each of your opponent's Pokémon equal to the number of {C} Energy in that Pokémon's Retreat Cost (after applying effects to the Retreat Cost).";
  let heavy;
  const { state, defender } = board('Bronzong', text, {
    damage: '',
    setup: (s) => {
      s.players.p2.zones.active[0].retreatCost = ['Colorless', 'Colorless'];
      heavy = mon('Snorlax', { hp: 200, retreatCost: 4 });
      s.players.p2.zones.bench.push(heavy, mon('Free', { retreatCost: [] }));
    },
  });
  const res = attack(state);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage, 20);
  assert.equal(root(res.state, 'p2', heavy.instanceId).damage, 40);
});

test('Bronzong Heavy Potential (I194): reads the Retreat Cost after a Tool, not the printed one', () => {
  const text =
    "Put a number of damage counters on each of your opponent's Pokémon equal to the number of {C} Energy in that Pokémon's Retreat Cost (after applying effects to the Retreat Cost).";
  let heavy;
  const { state } = board('Bronzong', text, {
    damage: '',
    setup: (s) => {
      s.players.p2.zones.active[0].retreatCost = [];
      heavy = mon('Snorlax', { hp: 200, retreatCost: 4 });
      const floatStone = createCard({
        instanceId: nextId++,
        name: 'Float Stone',
        supertype: 'Trainer',
        subtypes: ['Item', 'Pokémon Tool'],
        type: 'Pokémon Tool',
        text: 'The Pokémon this card is attached to has no Retreat Cost.',
        attachedTo: heavy.instanceId,
      });
      s.players.p2.zones.bench.push(heavy, floatStone);
    },
  });
  const res = attack(state);
  assert.equal(root(res.state, 'p2', heavy.instanceId).damage || 0, 0);
});

test('Probopass Metal Bomber (I194): "up to" lets the player pick fewer, even when every Benched Pokémon fits', () => {
  const text =
    "Choose a number of your opponent's Benched Pokémon up to the amount of {M} Energy attached to Probopass. This attack does 20 damage to each of them. (Don't apply Weakness and Resistance for Benched Pokémon.)";
  let bench;
  const { state } = board('Probopass', text, {
    damage: '',
    setup: (s) => {
      attachTo(s, s.players.p1.zones.active[0], ['Metal', 'Metal']);
      bench = addBench(s, 'p2', 'A', 'B');
    },
  });
  let res = attack(state);
  assert.equal(res.pendingChoice?.min, 0);
  res = choose(res, [bench[1].instanceId]);
  assert.deepEqual(bench.map((c) => root(res.state, 'p2', c.instanceId).damage || 0), [0, 20]);
});

test('Mothim Quick Touch (I194): "if you do" chains the switch into moving Energy to the new Active', () => {
  const text =
    'You may switch Mothim with 1 of your Benched Pokémon. If you do, move as many Energy cards attached to Mothim as you like to the new Active Pokémon.';
  let bench;
  let attackerEnergy;
  const { state } = board('Mothim', text, {
    damage: '40',
    setup: (s) => {
      bench = addBench(s, 'p1', 'Wormadam');
      attackerEnergy = energy('Grass', s.players.p1.zones.active[0].instanceId);
      s.players.p1.zones.active.push(attackerEnergy);
    },
  });
  let res = attack(state);
  // Accept the optional switch.
  res = choose(res, [-11]);
  // Mothim is now benched; Wormadam is the new Active. Move the Energy along.
  const newActive = res.state.players.p1.zones.active.find((c) => !c.attachedTo);
  assert.equal(newActive.instanceId, bench[0].instanceId);
  assert.ok(res.state.pendingChoice);
  assert.deepEqual(res.state.pendingChoice.options.map((o) => o.instanceId), [attackerEnergy.instanceId]);
  res = choose(res, [attackerEnergy.instanceId]);
  const movedEnergy = [...res.state.players.p1.zones.active, ...res.state.players.p1.zones.bench].find(
    (c) => c.instanceId === attackerEnergy.instanceId
  );
  assert.equal(movedEnergy.attachedTo, newActive.instanceId);
});

test('Magcargo Lava Plume (I194): "if you do" chains the mill into Burning the Defending Pokémon', () => {
  const text = 'You may discard the top card of your deck. If you do, the Defending Pokémon is now Burned.';
  const { state, defender } = board('Magcargo', text, { damage: '60' });
  const deckBefore = state.players.p1.zones.deck.length;
  let res = attack(state);
  assert.ok(res.state.pendingChoice);
  res = choose(res, [-11]);
  assert.equal(res.state.players.p1.zones.deck.length, deckBefore - 1);
  assert.equal(root(res.state, 'p2', defender.instanceId).burned, true);
});

test("Imakuni?'s Doduo Harmonize (I197): the joke text is a recognized no-op, not an unparsed sentence", () => {
  const text =
    'From the moment you use this attack, you must begin to sing a song. When the song is finished, this attack does 30 damage.';
  const steps = parseAttackSteps(text, { selfName: "Imakuni?'s Doduo" });
  assert.deepEqual(steps.after, [{ type: 'atkJokeNoOp' }]);
  const { state, defender } = board("Imakuni?'s Doduo", text, { damage: '30' });
  const res = attack(state);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage, 30);
});

test('Spiritomb Color Tag (Triumphant 10): a counter on each opponent Pokémon of the named type', () => {
  const text =
    'Choose {G}{R}{W}{L}{P}{F}{D}{M} or {C} type. Put 1 damage counter on each Pokémon your opponent has in play of the type you chose.';
  let water;
  let fire;
  const { state } = board('Spiritomb', text, {
    damage: '',
    setup: (s) => {
      water = mon('Squirtle', { types: ['Water'] });
      fire = mon('Charmander', { types: ['Fire'] });
      s.players.p2.zones.bench.push(water, fire);
    },
  });
  let res = attack(state);
  const waterOption = res.pendingChoice.options.find((o) => o.name === 'Water');
  res = choose(res, [waterOption.instanceId]);
  assert.equal(root(res.state, 'p2', water.instanceId).damage, 10);
  assert.equal(root(res.state, 'p2', fire.instanceId).damage || 0, 0);
});

test('Manectric Power Wave (Platinum 11): 30 to each Pokémon with a Poké-Power, on both sides', () => {
  const text =
    "This attack does 30 damage to each Pokémon that has any Poké-Powers (both yours and your opponent's). (Don't apply Weakness and Resistance for Benched Pokémon.)";
  const power = { name: 'Power', type: 'Poké-Power', text: 'Once during your turn, you may draw a card.' };
  let theirs;
  let mine;
  let plain;
  const { state, defender } = board('Manectric', text, {
    damage: '',
    setup: (s) => {
      theirs = mon('Their Power', { abilities: [power] });
      plain = mon('Plain');
      mine = mon('My Power', { abilities: [power] });
      s.players.p2.zones.bench.push(theirs, plain);
      s.players.p1.zones.bench.push(mine);
    },
  });
  const res = attack(state);
  assert.equal(root(res.state, 'p2', theirs.instanceId).damage, 30);
  assert.equal(root(res.state, 'p1', mine.instanceId).damage, 30);
  assert.equal(root(res.state, 'p2', plain.instanceId).damage || 0, 0);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage || 0, 0);
});

test('Starmie BREAK Break Star (Evolutions 32): 100 to each opponent Pokémon BREAK only', () => {
  const text =
    "This attack does 100 damage to each of your opponent's Pokémon BREAK. (Don't apply Weakness and Resistance for Benched Pokémon.)";
  let breakRoot;
  let other;
  const { state } = board('Starmie BREAK', text, {
    damage: '',
    setup: (s) => {
      breakRoot = mon('Greninja', { stage: 'Stage 2' });
      const breakCard = createCard({
        instanceId: nextId++,
        name: 'Greninja BREAK',
        supertype: 'Pokémon',
        stage: 'BREAK',
        subtypes: ['BREAK'],
        hp: 170,
        attachedTo: breakRoot.instanceId,
      });
      other = mon('Froakie');
      s.players.p2.zones.bench.push(breakRoot, breakCard, other);
    },
  });
  const res = attack(state);
  assert.equal(root(res.state, 'p2', breakRoot.instanceId).damage, 100);
  assert.equal(root(res.state, 'p2', other.instanceId).damage || 0, 0);
});

test('Mewtwo Energy Burst (Delta Species 12): Energy on both Active Pokémon counts', () => {
  const text = 'Does 10 damage times the total amount of Energy attached to Mewtwo and the Defending Pokémon.';
  const { state, defender } = board('Mewtwo', text, {
    damage: '10×',
    setup: (s) => {
      attachTo(s, s.players.p1.zones.active[0], ['Psychic', 'Psychic']);
      const def = s.players.p2.zones.active[0];
      s.players.p2.zones.active.push(energy('Water', def.instanceId), energy('Water', def.instanceId), energy('Water', def.instanceId));
    },
  });
  assert.equal(root(attack(state).state, 'p2', defender.instanceId).damage, 50);
});

// ── one-offs ──────────────────────────────────────────────────────────────────

test('Gouging Fire ex Blaze Blitz (Scarlet & Violet Promos 144): locked until it leaves the Active Spot', () => {
  const text = "This Pokémon can't use Blaze Blitz again until it leaves the Active Spot.";
  const { state, attacker } = board('Gouging Fire ex', text, { damage: '260' });
  state.players.p1.zones.active[0].attacks[0].name = 'Blaze Blitz';
  const res = attack(state);
  res.state.turn = { player: 'p1', number: 7, phase: 'main' };
  res.state.players.p1.flags = {};
  const legal = () => validateLegality(res.state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } });
  assert.match(legal().reason || '', /Blaze Blitz again/);
  // Leaving the Active Spot and coming back stamps a new movedToActiveTurn.
  root(res.state, 'p1', attacker.instanceId).movedToActiveTurn = 7;
  assert.equal(legal().allowed, true);
});

test('Toxtricity ex Gaia Punk (Paradox Rift 227): 3 {L} Energy from any of your Pokémon', () => {
  const text = 'Discard 3 {L} Energy from your Pokémon.';
  let benched;
  const { state, attacker } = board('Toxtricity ex', text, {
    damage: '270',
    setup: (s) => {
      attachTo(s, s.players.p1.zones.active[0], ['Lightning', 'Lightning', 'Fire']);
      benched = mon('Toxel');
      s.players.p1.zones.bench.push(benched, energy('Lightning', benched.instanceId), energy('Lightning', benched.instanceId));
    },
  });
  let res = attack(state);
  assert.equal(res.pendingChoice.options.length, 4);
  res = choose(res, res.pendingChoice.options.slice(0, 3).map((o) => o.instanceId));
  assert.equal(res.state.players.p1.zones.discard.filter((c) => c.energyType === 'Lightning').length, 3);
  assert.deepEqual(attachedTypes(res.state, attacker).filter((t) => t === 'Fire'), ['Fire']);
});

test('Arcanine ex Flame Swirl (Legend Maker 83): 2 {R} Energy or 1 React Energy, the player picks', () => {
  const text = 'Discard 2 {R} Energy or 1 React Energy card attached to Arcanine ex.';
  const { state, attacker } = board('Arcanine ex', text, {
    damage: '100',
    setup: (s) => {
      const host = s.players.p1.zones.active[0];
      attachTo(s, host, ['Fire', 'Fire']);
      s.players.p1.zones.active.push(
        createCard({ instanceId: nextId++, name: 'React Energy', supertype: 'Energy', subtypes: ['Special'], attachedTo: host.instanceId })
      );
    },
  });
  let res = attack(state);
  res = choose(res, [-12]);
  assert.deepEqual(res.state.players.p1.zones.discard.map((c) => c.name), ['React Energy']);
  assert.deepEqual(attachedTypes(res.state, attacker), ['Fire', 'Fire']);
});

test('Crobat BREAK Silent Bite (XY Promos XY181): Paralysis, then Crobat shuffles itself away', () => {
  const text =
    "You may leave your opponent's Active Pokémon Paralyzed. If you do, shuffle this Pokémon and all cards attached to into your deck.";
  const make = () => board('Crobat BREAK', text, { damage: '60', setup: (s) => addBench(s, 'p1', 'Zubat') });
  const yes = make();
  let res = choose(attack(yes.state), [-11]);
  assert.equal(root(res.state, 'p2', yes.defender.instanceId).specialCondition, 'Paralyzed');
  assert.ok(res.state.players.p1.zones.deck.some((c) => c.instanceId === yes.attacker.instanceId));
  const no = make();
  res = choose(attack(no.state), [-12]);
  assert.notEqual(root(res.state, 'p2', no.defender.instanceId).specialCondition, 'Paralyzed');
  assert.ok(root(res.state, 'p1', no.attacker.instanceId));
});

test('M Ampharos-EX Exavolt (Ancient Origins 88): the accepted offer adds 50, Paralyzes, and costs 30', () => {
  const text =
    "You may do 50 more damage and leave your opponent's Active Pokémon Paralyzed. If you do, this Pokémon does 30 damage to itself.";
  const { state, attacker, defender } = board('M Ampharos-EX', text, { damage: '110' });
  const res = choose(attack(state), [1]);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage, 160);
  assert.equal(root(res.state, 'p2', defender.instanceId).specialCondition, 'Paralyzed');
  assert.equal(root(res.state, 'p1', attacker.instanceId).damage, 30);
});

test('Venusaur Mega Drain (Wizards Black Star Promos 13): heals half the damage done, rounded up', () => {
  const text =
    'Remove a number of damage counters from Venusaur equal to half the damage done to the Defending Pokémon (after applying Weakness and Resistance) (rounded up to the nearest 10). If Venusaur has fewer damage counters than that, remove all of them.';
  const { state, attacker } = board('Venusaur', text, {
    damage: '50',
    setup: (s) => (s.players.p1.zones.active[0].damage = 60),
  });
  assert.equal(root(attack(state).state, 'p1', attacker.instanceId).damage, 30);
});

test('Elekid Magnetic Trip (Unseen Forces 23): "this Defending Pokémon" is Confused under Low Pressure System', () => {
  const text = 'If Low Pressure System is in play, this Defending Pokémon is now Confused.';
  const { state, defender } = board('Elekid', text, {
    damage: '10',
    setup: (s) => (s.stadium = { ...trainer('Low Pressure System', 'Stadium'), ownerId: 'p1' }),
  });
  assert.equal(root(attack(state).state, 'p2', defender.instanceId).specialCondition, 'Confused');
});

test('Jirachi Detour (Rising Rivals 7): the effect of the Supporter played this turn', () => {
  const text = 'If you have a Supporter card in play, use the effect of that card as the effect of this attack.';
  const { state } = board('Jirachi', text, {
    damage: '',
    setup: (s) => {
      const supporter = { ...trainer("Professor's Research", 'Supporter'), text: 'Draw 2 cards.' };
      s.players.p1.zones.discard.push(supporter);
      s.players.p1.flags = { supporterPlayed: true, supporterNamesThisTurn: ["Professor's Research"] };
    },
  });
  const res = attack(state);
  assert.ok(res.events.some((e) => e.type === 'supporterEffectUsed'));
  const none = board('Jirachi', text, { damage: '' });
  assert.ok(!attack(none.state).events.some((e) => e.type === 'supporterEffectUsed'));
});

test('Dialga-EX Fast Forward (Plasma Blast 99): a card milled per Plasma Energy', () => {
  const text = "For each Plasma Energy attached to this Pokémon, discard the top card of your opponent's deck.";
  const plasma = (host) =>
    createCard({ instanceId: nextId++, name: 'Plasma Energy', supertype: 'Energy', subtypes: ['Special'], attachedTo: host });
  const { state } = board('Dialga-EX', text, {
    setup: (s) => {
      const host = s.players.p1.zones.active[0].instanceId;
      s.players.p1.zones.active.push(plasma(host), plasma(host), energy('Metal', host));
    },
  });
  assert.equal(attack(state).state.players.p2.zones.discard.length, 2);
});

test('Probopass Metal Bomber (Legends Awakened 13): one Benched pick per {M} Energy', () => {
  const text =
    "Choose a number of your opponent's Benched Pokémon up to the amount of {M} Energy attached to Probopass. This attack does 20 damage to each of them. (Don't apply Weakness and Resistance for Benched Pokémon.)";
  let bench;
  const { state } = board('Probopass', text, {
    damage: '',
    setup: (s) => {
      attachTo(s, s.players.p1.zones.active[0], ['Metal', 'Metal', 'Fire']);
      bench = addBench(s, 'p2', 'A', 'B', 'C');
    },
  });
  let res = attack(state);
  assert.equal(res.pendingChoice.max, 2);
  res = choose(res, [bench[0].instanceId, bench[2].instanceId]);
  assert.deepEqual(bench.map((c) => root(res.state, 'p2', c.instanceId).damage || 0), [20, 0, 20]);
});

test('Unown Hidden Power (Unseen Forces I): the new Defending Pokémon is Burned and Confused', () => {
  const text =
    "Switch 1 of your opponent's Benched Pokémon with 1 of the Defending Pokémon. Your opponent chooses the Defending Pokémon to switch. The new Defending Pokémon is now Burned and Confused.";
  let bench;
  const { state } = board('Unown', text, { damage: '', setup: (s) => (bench = addBench(s, 'p2', 'Next')) });
  const res = attack(state);
  assert.equal(root(res.state, 'p2', bench[0].instanceId).specialCondition, 'Confused');
  assert.ok(res.events.some((e) => e.type === 'specialConditionUpdated' && e.condition === 'Burned'));
});

test("Wobbuffet Shadow Tag (Legend Maker 28): 7 counters at the end of the opponent's next turn", () => {
  const text = "Put 7 damage counters on the Defending Pokémon at the end of your opponent's next turn.";
  const { state, defender } = board('Wobbuffet', text, { damage: '' });
  let res = attack(state);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage || 0, 0);
  res = applyCommand(res.state, { type: 'pass', playerId: 'p2', payload: {} }, createRng(3));
  assert.equal(root(res.state, 'p2', defender.instanceId).damage, 70);
});

test('Pheromosa-GX Fast Raid (Ultra Prism 158): usable on the first turn by the player going first', () => {
  const text = 'If you go first, you can use this attack on your first turn.';
  const { state } = board('Pheromosa-GX', text, { damage: '30' });
  state.turn = { player: 'p1', number: 1, phase: 'main' };
  state.players.p1.zones.active[0].attacks.push({ name: 'Other', cost: [], damage: '10', text: '' });
  const legal = (attackIndex) =>
    validateLegality(state, { type: 'attack', playerId: 'p1', payload: { attackIndex } }).allowed;
  assert.equal(legal(0), true);
  assert.equal(legal(1), false);
});

test('Torterra Land Shake (Stormfront 11): a Basic benched from hand next turn takes 2 counters', () => {
  const text =
    "During your opponent's next turn, when your opponent puts a Basic Pokémon from his or her hand onto his or her Bench, put 2 damage counters on that Pokémon.";
  let basic;
  const { state } = board('Torterra', text, {
    damage: '80',
    setup: (s) => {
      basic = mon('Bidoof', { hp: 60 });
      s.players.p2.zones.hand.push(basic);
    },
  });
  let res = attack(state);
  res = applyCommand(
    res.state,
    { type: 'moveCard', playerId: 'p2', payload: { instanceId: basic.instanceId, from: 'hand', to: 'bench' } },
    createRng(3)
  );
  assert.equal(res.error, null);
  assert.equal(root(res.state, 'p2', basic.instanceId).damage, 20);
});

test("Unown E Hidden Power (Mysterious Treasures 65): the opponent's coins are tails on their next turn", () => {
  const text = "During your opponent's next turn, whenever your opponent flips a coin, treat it as tails.";
  const { state, attacker } = board('Unown E', text, {
    damage: '',
    setup: (s) => armDefender(s, 'Flip 3 coins. This attack does 30 damage for each heads.', '30×'),
  });
  const res = counterAttack(attack(state));
  const flips = res.events.filter((e) => e.type === 'attackCoinFlipped').flatMap((e) => e.flips || [e.coin]);
  assert.deepEqual(flips, ['tails', 'tails', 'tails']);
  assert.equal(root(res.state, 'p1', attacker.instanceId).damage || 0, 0);
});

test('Espeon & Deoxys-GX Cross Division-GX (Sun & Moon Promos SM240): 20 counters with 3 extra Energy', () => {
  const text =
    "Put 10 damage counters on your opponent's Pokémon in any way you like. If this Pokémon has at least 3 extra Energy attached to it (in addition to this attack's cost), put 20 damage counters on them instead. (You can't use more than 1 GX attack in a game.)";
  const run = (energyCount) => {
    const { state, defender } = board('Espeon & Deoxys-GX', text, {
      damage: '',
      setup: (s) => attachTo(s, s.players.p1.zones.active[0], Array(energyCount).fill('Psychic')),
    });
    return root(attack(state).state, 'p2', defender.instanceId).damage;
  };
  assert.equal(run(3), 200);
  assert.equal(run(2), 100);
});

test('Rowlet & Alolan Exeggutor-GX Tropical Hour-GX (Unified Minds 237): with 3 extra Energy, their Energy is shuffled away', () => {
  const text =
    "If this Pokémon has at least 3 extra Energy attached to it (in addition to this attack's cost), your opponent shuffles all Energy from all of their Pokémon into their deck. (You can't use more than 1 GX attack in a game.)";
  const run = (energyCount) => {
    const { state, defender } = board('Rowlet & Alolan Exeggutor-GX', text, {
      damage: '200',
      setup: (s) => {
        attachTo(s, s.players.p1.zones.active[0], Array(energyCount).fill('Grass'));
        s.players.p2.zones.active.push(energy('Water', s.players.p2.zones.active[0].instanceId));
      },
    });
    const res = attack(state);
    return res.state.players.p2.zones.active.filter((c) => c.attachedTo === defender.instanceId).length;
  };
  assert.equal(run(3), 0);
  assert.equal(run(2), 1);
});

test('Pheromosa & Buzzwole-GX Beast Game-GX (Unbroken Bonds 215): 3 more Prizes with 7 extra Energy', () => {
  const text =
    "If your opponent's Pokémon is Knocked Out by damage from this attack, take 1 more Prize card. If this Pokémon has at least 7 extra Energy attached to it (in addition to this attack's cost), take 3 more Prize cards instead. (You can't use more than 1 GX attack in a game.)";
  const run = (energyCount) => {
    const { state } = board('Pheromosa & Buzzwole-GX', text, {
      damage: '500',
      setup: (s) => {
        attachTo(s, s.players.p1.zones.active[0], Array(energyCount).fill('Grass'));
        addBench(s, 'p2', 'Next');
      },
    });
    return attack(state).events.find((e) => e.type === 'prizeEntitlementGranted')?.count;
  };
  assert.equal(run(7), 3);
  assert.equal(run(6), 1);
});

test('Porygon2 Machine Burst (Delta Species 25): Asleep and Burned only with a Technical Machine attached', () => {
  const text =
    'If Porygon2 has a Technical Machine card attached to it, the Defending Pokémon is now Asleep and Burned.';
  const run = (withTm) => {
    const { state, defender } = board('Porygon2', text, {
      damage: '30',
      setup: (s) => {
        if (!withTm) return;
        const tm = tool(s.players.p1.zones.active[0].instanceId);
        tm.name = 'Technical Machine: Evolution';
        s.players.p1.zones.active.push(tm);
      },
    });
    const res = attack(state);
    return res.events
      .filter((e) => e.type === 'specialConditionUpdated' && e.instanceId === defender.instanceId)
      .map((e) => e.condition)
      .sort();
  };
  assert.deepEqual(run(true), ['Asleep', 'Burned']);
  assert.deepEqual(run(false), []);
});

test('Porygon-Z Digital Reboot (Ancient Origins 67): chosen Evolution cards return to hand, top down', () => {
  const text =
    'Devolve as many of your Benched Pokémon as many times as you like. Put each Evolution card removed this way into your hand.';
  let basic;
  let stage1;
  let stage2;
  const { state } = board('Porygon-Z', text, {
    damage: '',
    setup: (s) => {
      basic = mon('Porygon');
      stage1 = createCard({ instanceId: nextId++, name: 'Porygon2', supertype: 'Pokémon', stage: 'Stage 1', hp: 80, attachedTo: basic.instanceId });
      stage2 = createCard({ instanceId: nextId++, name: 'Porygon-Z', supertype: 'Pokémon', stage: 'Stage 2', hp: 130, attachedTo: basic.instanceId });
      s.players.p1.zones.bench.push(basic, stage1, stage2);
    },
  });
  let res = attack(state);
  assert.equal(res.pendingChoice.options.length, 2);
  // Picking only the Stage 1 under a kept Stage 2 removes nothing.
  res = choose(res, [stage1.instanceId]);
  assert.deepEqual(res.state.players.p1.zones.hand.map((c) => c.instanceId), []);
  const again = board('Porygon-Z', text, {
    damage: '',
    setup: (s) => s.players.p1.zones.bench.push(basic, { ...stage1 }, { ...stage2 }),
  });
  res = choose(attack(again.state), [stage1.instanceId, stage2.instanceId]);
  assert.deepEqual(res.state.players.p1.zones.hand.map((c) => c.name).sort(), ['Porygon-Z', 'Porygon2']);
});

test('Unown Z Hidden Power (Secret Wonders 72): counters removed from your Unown land on the Defending Pokémon', () => {
  const text =
    'Remove as many damage counters as you like from each Unown you have in play. Put that many damage counters on the Defending Pokémon.';
  let other;
  const { state, attacker, defender } = board('Unown Z', text, {
    damage: '',
    setup: (s) => {
      s.players.p1.zones.active[0].damage = 30;
      other = mon('Unown A');
      other.damage = 20;
      s.players.p1.zones.bench.push(other, Object.assign(mon('Pikachu'), { damage: 50 }));
    },
  });
  let res = attack(state);
  res = choose(res, [4]); // all 3 from Unown Z
  res = choose(res, [2]); // 1 of 2 from Unown A
  assert.equal(root(res.state, 'p1', attacker.instanceId).damage, 0);
  assert.equal(root(res.state, 'p1', other.instanceId).damage, 10);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage, 40);
});

test('Unown I Hidden Power (Mysterious Treasures 37): a Defending Energy provides {C} until their turn ends', () => {
  const text =
    "Choose an Energy card attached to the Defending Pokémon and put it face down. Treat that card as a Special Energy card that provides {C} Energy and doesn't have any effect other than providing Energy. Put that card face up at the end of your opponent's next turn.";
  let water;
  const { state } = board('Unown I', text, {
    damage: '',
    setup: (s) => {
      water = energy('Water', s.players.p2.zones.active[0].instanceId);
      s.players.p2.zones.active.push(water);
    },
  });
  let res = attack(state);
  const faceDown = res.state.players.p2.zones.active.find((c) => c.instanceId === water.instanceId);
  assert.deepEqual(faceDown.asEnergy, { provides: ['Colorless'] });
  res = applyCommand(res.state, { type: 'pass', playerId: 'p2', payload: {} }, createRng(3));
  const faceUp = res.state.players.p2.zones.active.find((c) => c.instanceId === water.instanceId);
  assert.equal(faceUp.asEnergy, undefined);
});

test('Dark Ivysaur Fury Strikes (Best of Game 6): the opponent places 3 markers, 10 damage each', () => {
  const text =
    "Your opponent puts 3 markers onto his or her Pokémon (divided as he or she chooses). (More than 1 marker can be put on the same Pokémon.) Then, this attack does 10 damage to each Pokémon for each marker on it. Don't apply Weakness and Resistance. Remove the markers at the end of the turn.";
  let bench;
  const { state, defender } = board('Dark Ivysaur', text, { damage: '', setup: (s) => (bench = addBench(s, 'p2', 'Oddish')) });
  let res = attack(state);
  assert.equal(res.pendingChoice.player, 'p2');
  res = chooseAs(res, [bench[0].instanceId]);
  res = chooseAs(res, [bench[0].instanceId]);
  assert.equal(res.pendingChoice.player, 'p2');
  res = chooseAs(res, [defender.instanceId]);
  assert.equal(root(res.state, 'p2', bench[0].instanceId).damage, 20);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage, 10);
});

test('Unown Hidden Power (Unseen Forces, the Shuffle Unown): a wrong guess draws 2 cards', () => {
  const text =
    'Choose a card from your hand and put it face down. Your opponent guesses if the card is a Pokémon, Trainer, or Energy card. Reveal the card. If your opponent guessed wrong, draw 2 cards. Put the card back into your hand.';
  const run = (guess) => {
    let potion;
    const { state } = board('Unown', text, {
      damage: '',
      setup: (s) => {
        potion = trainer('Potion', 'Item');
        s.players.p1.zones.hand.push(potion);
      },
    });
    let res = choose(attack(state), [potion.instanceId]);
    assert.equal(res.pendingChoice.player, 'p2');
    res = chooseAs(res, [res.pendingChoice.options.find((o) => o.name === guess).instanceId]);
    return res.state.players.p1.zones.hand.length;
  };
  assert.equal(run('Trainer'), 1);
  assert.equal(run('Energy'), 3);
});

// ── spreads and snipes the old Bench reading misplaced ───────────────────────

test('Chingling Uproar (Majestic Dawn 58): heads hits every opponent Pokémon, tails none', () => {
  const text =
    "Flip a coin. If heads, this attack does 10 damage to each of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)";
  let bench;
  const make = () => board('Chingling', text, { damage: '', setup: (s) => (bench = addBench(s, 'p2', 'B')) });
  const heads = attackShowing(make, 'heads');
  assert.equal(root(heads.res.state, 'p2', heads.defender.instanceId).damage, 10);
  assert.equal(root(heads.res.state, 'p2', bench[0].instanceId).damage, 10);
  const tails = attackShowing(make, 'tails');
  assert.equal(root(tails.res.state, 'p2', tails.defender.instanceId).damage || 0, 0);
});

test('Jumpluff Cottonweed Punch (Secret Wonders 11): the chosen Pokémon takes 30 per heads', () => {
  const text =
    "Flip 2 coins. Choose 1 of your opponent's Pokémon. For each heads, this attack does 30 damage to that Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)";
  let bench;
  for (let seed = 1; seed < 60; seed++) {
    const { state } = board('Jumpluff', text, { damage: '', setup: (s) => (bench = addBench(s, 'p2', 'B')) });
    let res = applyCommand(state, { type: 'attack', playerId: 'p1', payload: { attackIndex: 0 } }, createRng(seed));
    const heads = (res.events.find((e) => e.type === 'attackCoinFlipped')?.flips || []).filter((f) => f === 'heads').length;
    if (heads === 0) {
      assert.equal(res.pendingChoice, null);
      continue;
    }
    res = choose(res, [bench[0].instanceId]);
    assert.equal(root(res.state, 'p2', bench[0].instanceId).damage, 30 * heads);
    return;
  }
  assert.fail('no seed shows heads');
});

test('Mega Zygarde ex Nullifying Zero (Mega Evolution Promos 071): one flip per opponent Pokémon', () => {
  const text =
    "For each of your opponent's Pokémon, flip a coin. If heads, this attack does 150 damage to that Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)";
  const { state } = board('Mega Zygarde ex', text, { damage: '', setup: (s) => addBench(s, 'p2', 'B1', 'B2') });
  const res = attack(state);
  const flips = res.events.filter((e) => e.type === 'coinFlipped' && e.source === 'Probe');
  assert.equal(flips.length, 3);
  for (const flip of flips) {
    const hit = res.events.some((e) => e.type === 'damageUpdated' && e.instanceId === flip.instanceId && e.damage >= 150)
      || res.events.some((e) => e.type === 'pokemonKnockedOut' && e.instanceId === flip.instanceId);
    assert.equal(hit, flip.face === 'heads');
  }
});

test('Reshiram & Zekrom-GX Fabled Flarebolts (Cosmic Eclipse 259): 90 per Bench {R}/{L} discarded', () => {
  const text =
    'Discard up to 3 in any combination of basic {R} and basic {L} Energy cards from your Benched Pokémon. This attack does 90 damage for each card you discarded in this way.';
  let fires;
  const { state, defender } = board('Reshiram & Zekrom-GX', text, {
    damage: '90×',
    setup: (s) => {
      const benched = mon('Reshiram');
      fires = [energy('Fire', benched.instanceId), energy('Lightning', benched.instanceId), energy('Water', benched.instanceId)];
      s.players.p1.zones.bench.push(benched, ...fires);
    },
  });
  let res = attack(state);
  assert.equal(res.pendingChoice.options.length, 2);
  res = choose(res, [fires[0].instanceId, fires[1].instanceId]);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage, 180);
});

test('Alolan Exeggutor-GX Tropical Head (Crimson Invasion 118): 20 per attached Energy to the chosen Pokémon', () => {
  const text =
    "This attack does 20 damage times the amount of Energy attached to this Pokémon to 1 of your opponent's Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)";
  let bench;
  const { state } = board('Alolan Exeggutor-GX', text, {
    damage: '',
    setup: (s) => {
      attachTo(s, s.players.p1.zones.active[0], ['Grass', 'Grass', 'Water']);
      bench = addBench(s, 'p2', 'B');
    },
  });
  const res = choose(attack(state), [bench[0].instanceId]);
  assert.equal(root(res.state, 'p2', bench[0].instanceId).damage, 60);
});

// ── review regressions (parse-hole review B1–B5, S1–S5) ───────────────────────

test('Delibird Souvenir (Team Rocket Returns 21) / Magneton Electric Blast (Skyridge 19): no stray counter clause', () => {
  // Coin tiers and reminder text are not an unconditional counter placement.
  assert.equal(
    opponentCounterClause(
      'Flip 3 coins. If 1 of them is heads, put 4 damage counters on the Defending Pokémon. If 2 of them are heads, remove 1 damage counter from the Defending Pokémon. If all of them are heads, put 10 damage counters on the Defending Pokémon. If all of them are tails, remove all damage counters from the Defending Pokémon.'
    ),
    null
  );
  assert.equal(
    opponentCounterClause(
      "You may discard all {L} Energy cards attached to Magneton when you use this attack. If you do, put damage counters equal to the amount of Energy cards removed in this way on any number of your opponent's Benched Pokémon in the way you like. (For example, if you discard 3 {L} Energy cards, you can put 1 damage counter on 1 of your opponent's Benched Pokémon and 2 on another.)"
    ),
    null
  );
});

test('Electivire Discharge (Secret Wonders 25): one coin per {L} discarded, 50 per heads', () => {
  const text =
    'Discard all {L} Energy attached to Electivire. Flip a coin for each {L} Energy you discarded. This attack does 50 damage times the number of heads.';
  const { state, defender } = board('Electivire', text, {
    damage: '50×',
    setup: (s) => attachTo(s, s.players.p1.zones.active[0], ['Lightning', 'Lightning', 'Lightning', 'Fire']),
  });
  const res = attack(state);
  const flips = res.events.filter((e) => e.type === 'attackCoinFlipped').flatMap((e) => e.flips || []);
  assert.equal(flips.length, 3);
  const heads = flips.filter((f) => f === 'heads').length;
  assert.equal(root(res.state, 'p2', defender.instanceId).damage || 0, 50 * heads);
  assert.equal(res.state.players.p1.zones.discard.length, 3);
});

test('Bronzong BREAK Metal Rain (Fates Collide 62): 30 damage per discarded {M}, placed one pick at a time', () => {
  const text =
    "Discard as many {M} Energy attached to this Pokémon as you like. For each Energy card discarded in this way, choose 1 of your opponent's Pokémon and do 30 damage to it. Don't apply Weakness and Resistance. (You may choose the same Pokémon more than once.)";
  let metals;
  let bench;
  const { state, defender } = board('Bronzong BREAK', text, {
    damage: '',
    setup: (s) => {
      const host = s.players.p1.zones.active[0];
      metals = [energy('Metal', host.instanceId), energy('Metal', host.instanceId)];
      s.players.p1.zones.active.push(...metals);
      bench = addBench(s, 'p2', 'B');
    },
  });
  let res = attack(state);
  res = choose(res, metals.map((c) => c.instanceId));
  res = choose(res, [bench[0].instanceId]);
  res = choose(res, [defender.instanceId]);
  assert.equal(root(res.state, 'p2', bench[0].instanceId).damage, 30);
  assert.equal(root(res.state, 'p2', defender.instanceId).damage, 30);
});

test('Ludicolo Healing Steps (Deoxys 10): heals one counter per card discarded', () => {
  const text =
    'You may discard as many cards as you like from your hand. If you do, remove that many damage counters from Ludicolo.';
  let hand;
  const { state, attacker } = board('Ludicolo', text, {
    damage: '',
    setup: (s) => {
      s.players.p1.zones.active[0].damage = 50;
      hand = handOf(s, 'p1', 3);
    },
  });
  let res = attack(state);
  if (res.pendingChoice?.options.some((o) => o.instanceId === -11)) res = choose(res, [-11]);
  res = choose(res, [hand[0].instanceId, hand[1].instanceId]);
  assert.equal(root(res.state, 'p1', attacker.instanceId).damage, 30);
});

test('Palkia Pearl Blast (Majestic Dawn 11): the opponent loses an Energy only after Palkia returns one', () => {
  const text =
    "You may return an Energy card attached to Palkia to your hand. If you do, choose an Energy card attached to the Defending Pokémon and return it to your opponent's hand.";
  const run = (answer) => {
    let theirs;
    const { state } = board('Palkia', text, {
      damage: '',
      setup: (s) => {
        attachTo(s, s.players.p1.zones.active[0], ['Water']);
        theirs = energy('Fire', s.players.p2.zones.active[0].instanceId);
        s.players.p2.zones.active.push(theirs);
      },
    });
    let res = attack(state);
    res = choose(res, [answer]);
    return res.state.players.p2.zones.hand.some((c) => c.instanceId === theirs.instanceId);
  };
  assert.equal(run(-11), true);
  assert.equal(run(-12), false);
});

test('Shiftry Seal Off (Rising Rivals 13): the Defending Pokémon\'s Poké-Body is silenced next turn only', () => {
  const text = "The Defending Pokémon can't use any Poké-Powers or Poké-Bodies during your opponent's next turn.";
  const { state, defender } = board('Shiftry', text, {
    damage: '60',
    setup: (s) => (s.players.p2.zones.active[0].abilities = [{ name: 'Guard', type: 'Poké-Body', text: 'Any damage done to this Pokémon by attacks is reduced by 20.' }]),
  });
  const res = attack(state);
  const card = root(res.state, 'p2', defender.instanceId);
  const active = { opponentActive: res.state.players.p2.zones.active };
  assert.equal(isAbilitySuppressed(card, { ...active, turnNumber: 6 }), true);
  assert.equal(isAbilitySuppressed(card, { ...active, turnNumber: 8 }), false);
  // Switched to the Bench, the Pokémon is no longer the Defending Pokémon.
  assert.equal(isAbilitySuppressed(card, { opponentActive: [], turnNumber: 6 }), false);
});

test('Unown Hidden Power guess: the opponent\'s prompt carries no hand card id', () => {
  const text =
    'Choose a card from your hand and put it face down. Your opponent guesses if the card is a Pokémon, Trainer, or Energy card. Reveal the card. If your opponent guessed wrong, draw 2 cards. Put the card back into your hand.';
  let potion;
  const { state } = board('Unown', text, {
    damage: '',
    setup: (s) => {
      potion = trainer('Potion', 'Item');
      s.players.p1.zones.hand.push(potion);
    },
  });
  const res = choose(attack(state), [potion.instanceId]);
  assert.equal(res.pendingChoice.player, 'p2');
  assert.ok(!JSON.stringify(res.state.pendingChoice).includes(`"${potion.instanceId}"`));
  assert.ok(!JSON.stringify(res.state.pendingChoice).includes(`:${potion.instanceId},`));
});
